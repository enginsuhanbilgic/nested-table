package com.bistech.reporting.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/// Authenticates requests from the access token ALONE: parse once, build
/// authorities from the roles/pages claims. No UserDetailsService, no database
/// on the request path. Role/page changes reach the token at the next refresh
/// (≤ 15 min) — the accepted staleness window.
@Component
@RequiredArgsConstructor
public class JwtRequestFilter extends OncePerRequestFilter {

    private static final Logger LOGGER = LoggerFactory.getLogger(JwtRequestFilter.class);

    private static final String ROLE_AUTHORITY_PREFIX = "ROLE_";

    private final JwtService jwtService;

    @Override
    protected void doFilterInternal(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final FilterChain filterChain
    ) throws ServletException, IOException {

        final String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        final String token = authHeader.substring(7);

        try {
            Claims claims = jwtService.parse(token);

            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                authenticate(claims);
            }

        } catch (ExpiredJwtException e) {
            // Normal every 15 minutes; the frontend refreshes on the 401.
            LOGGER.debug("Expired access token for '{}'", e.getClaims().getSubject());

        } catch (JwtException | IllegalArgumentException e) {
            LOGGER.warn("Rejected invalid access token: {}", e.getMessage());
        }

        filterChain.doFilter(request, response);
    }

    private void authenticate(final Claims claims) {
        String userIdClaim = claims.get(JwtService.CLAIM_USER_ID, String.class);

        if (userIdClaim == null) {
            // Token minted before the userId claim existed. Rejecting it makes
            // the frontend refresh immediately, which mints a complete token.
            LOGGER.debug("Access token without userId claim — treated as unauthenticated");
            return;
        }

        List<String> roles = JwtService.stringList(claims, JwtService.CLAIM_ROLES);
        List<String> pages = JwtService.stringList(claims, JwtService.CLAIM_PAGES);

        AuthPrincipal principal = new AuthPrincipal(
                // An unparseable id throws IllegalArgumentException, which the
                // caller's catch treats as an invalid token.
                java.util.UUID.fromString(userIdClaim),
                claims.getSubject(),
                claims.get(JwtService.CLAIM_FULL_NAME, String.class),
                roles,
                pages
        );

        List<GrantedAuthority> authorities = new ArrayList<>();
        roles.forEach(role -> authorities.add(new SimpleGrantedAuthority(ROLE_AUTHORITY_PREFIX + role)));
        pages.forEach(page -> authorities.add(new SimpleGrantedAuthority(PageCodes.authority(page))));

        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(principal, null, authorities);

        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
    }
}
