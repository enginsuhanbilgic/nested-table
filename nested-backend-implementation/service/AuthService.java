package com.bistech.reporting.service;

import com.bistech.reporting.dto.auth.LdapAuthResponse;
import com.bistech.reporting.dto.auth.LoginRequest;
import com.bistech.reporting.dto.auth.MeResponse;
import com.bistech.reporting.dto.auth.SessionUserResponse;
import com.bistech.reporting.dto.auth.TokenPairResponse;
import com.bistech.reporting.exception.InvalidRefreshTokenException;
import com.bistech.reporting.model.user.Role;
import com.bistech.reporting.model.user.RoleCodes;
import com.bistech.reporting.model.user.User;
import com.bistech.reporting.model.user.UserRole;
import com.bistech.reporting.repository.user.UserRepository;
import com.bistech.reporting.repository.user.UserRoleRepository;
import com.bistech.reporting.security.JwtService;
import com.bistech.reporting.security.PageCodes;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.ResourceAccessException;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/// Orchestrates the auth flows in the agreed order:
///   login   = CAPTCHA → LDAP → sync user+roles → issue token pair
///   refresh = rotate token → re-run CN rules on stored groups → fresh pair
///   logout  = revoke the refresh token
///   me      = live profile from the database
///
/// CaptchaService / CaptchaVerifyRequest are the project's EXISTING classes
/// (not part of this snippet) — fix the two imports below on port if their
/// package differs.
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final Logger LOGGER = LoggerFactory.getLogger(AuthService.class);

    private final AuthenticationManager authenticationManager;
    private final CaptchaService captchaService;
    private final UserSyncService userSyncService;
    private final RefreshTokenService refreshTokenService;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final UserRoleRepository userRoleRepository;

    /// Availability-over-strictness: when the CAPTCHA service is down, logins
    /// proceed without it (WARN). Flip to false to fail closed instead.
    @Value("${app.captcha.bypass-when-unavailable:true}")
    private boolean captchaBypassWhenUnavailable;

    public record UserAccess(Set<String> roles, Set<String> pages) {
    }

    /// Deliberately NOT @Transactional: the CAPTCHA and LDAP calls are HTTP
    /// round-trips that must not hold a database transaction open. The two
    /// write steps manage their own transactions.
    public TokenPairResponse login(final LoginRequest request) {
        // 1. CAPTCHA first — before LDAP sees the password. The old order let
        //    scripts hammer LDAP (and lock AD accounts) without ever solving
        //    a challenge. The challenge is single-use: the frontend fetches a
        //    fresh one after ANY failed login.
        verifyCaptcha(request);

        // 2. LDAP, fail-closed (LrAuthenticationProvider).
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password())
        );

        LdapAuthResponse ldapDetails = (LdapAuthResponse) authentication.getDetails();

        // 3. Upsert profile + rebuild SYNC roles. One retry: a concurrent
        //    first login can lose the insert race on the unique constraint.
        User user;
        try {
            user = synchronizeOnLogin(ldapDetails);
        } catch (IllegalArgumentException e) {
            throw new AuthenticationServiceException("LDAP returned incomplete user data", e);
        }

        // 4. Tokens.
        String refreshToken = refreshTokenService.create(user);

        LOGGER.info("Login completed for user '{}'", user.getUsername());

        return respond(user, refreshToken);
    }

    @Transactional
    public TokenPairResponse refresh(final String rawRefreshToken) {
        RefreshTokenService.RotatedSession rotated = refreshTokenService.rotate(rawRefreshToken);

        // Lock serializes concurrent refreshes (two tabs) so the SYNC-row
        // diff below cannot race itself.
        User user = userRepository.findAndLockById(rotated.user().getId())
                .orElseThrow(() -> new InvalidRefreshTokenException("User no longer exists"));

        userSyncService.resynchronize(user);

        return respond(user, rotated.rawToken());
    }

    public void logout(final String rawRefreshToken) {
        refreshTokenService.revoke(rawRefreshToken);
    }

    @Transactional(readOnly = true)
    public MeResponse me(final String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + username));

        UserAccess access = computeAccess(user.getId());

        return new MeResponse(
                user.getUsername(),
                user.getFullName(),
                user.getEmail(),
                user.getOrganization(),
                user.getEmployeeId(),
                user.getLastLoggedIn(),
                List.copyOf(access.roles()),
                List.copyOf(access.pages())
        );
    }

    /// Effective access = distinct ACTIVE roles over both sources; pages =
    /// union of their page mappings — except ADMIN, which sees every page.
    /// Computed (not seeded): a newly shipped page is immediately visible to
    /// admins, and no seed row can be forgotten.
    public UserAccess computeAccess(final UUID userId) {
        List<UserRole> grants = userRoleRepository.findWithRolesByUserId(userId);

        Set<String> roles = new TreeSet<>();
        Set<String> pages = new TreeSet<>();

        for (UserRole grant : grants) {
            Role role = grant.getRole();

            if (!role.isActive()) {
                continue;
            }

            roles.add(role.getCode());
            pages.addAll(role.getPageCodes());
        }

        if (roles.contains(RoleCodes.ADMIN)) {
            pages = new TreeSet<>(PageCodes.all());
        }

        return new UserAccess(roles, pages);
    }

    private User synchronizeOnLogin(final LdapAuthResponse ldapDetails) {
        try {
            return userSyncService.synchronizeOnLogin(ldapDetails);
        } catch (DataIntegrityViolationException e) {
            LOGGER.info("Concurrent first login for '{}', retrying once", ldapDetails.username());
            return userSyncService.synchronizeOnLogin(ldapDetails);
        }
    }

    private TokenPairResponse respond(final User user, final String rawRefreshToken) {
        UserAccess access = computeAccess(user.getId());

        String accessToken = jwtService.issueAccessToken(
                user.getId(),
                user.getUsername(),
                user.getFullName(),
                access.roles(),
                access.pages()
        );

        return new TokenPairResponse(
                accessToken,
                rawRefreshToken,
                new SessionUserResponse(
                        user.getUsername(),
                        user.getFullName(),
                        user.getEmail(),
                        user.getOrganization(),
                        user.getEmployeeId(),
                        List.copyOf(access.roles()),
                        List.copyOf(access.pages())
                )
        );
    }

    private void verifyCaptcha(final LoginRequest request) {
        String status;
        try {
            status = captchaService.isCaptchaRunning();
        } catch (Exception e) {
            status = null;
        }

        if (!"UP".equals(status)) {
            if (captchaBypassWhenUnavailable) {
                LOGGER.warn("CAPTCHA is not available, bypassed.");
                return;
            }
            throw new AuthenticationServiceException("CAPTCHA service is not available");
        }

        try {
            captchaService.verifyCaptcha(new CaptchaVerifyRequest(request.captchaId(), request.answer()));
        } catch (ResourceAccessException e) {
            if (captchaBypassWhenUnavailable) {
                LOGGER.warn("CAPTCHA became unavailable during login, bypassed.");
                return;
            }
            throw new AuthenticationServiceException("CAPTCHA service is not reachable", e);
        }
    }
}
