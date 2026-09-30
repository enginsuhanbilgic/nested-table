package com.bistech.reporting.service;

import com.bistech.reporting.exception.InvalidRefreshTokenException;
import com.bistech.reporting.model.user.RefreshToken;
import com.bistech.reporting.model.user.User;
import com.bistech.reporting.repository.user.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;

/// The long-lived "membership card". Raw tokens are 256-bit random values that
/// exist only in transit; the database stores SHA-256 hashes. Every use
/// rotates the token; the expiry is fixed at login (7-day sessions).
@Service
@RequiredArgsConstructor
public class RefreshTokenService {

    private static final int TOKEN_BYTES = 32;

    private final RefreshTokenRepository refreshTokenRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${auth.refresh.ttl:7d}")
    private Duration refreshTtl;

    public record RotatedSession(User user, String rawToken) {
    }

    /// Login: new session, fresh expiry. Returns the raw token (shown once).
    @Transactional
    public String create(final User user) {
        refreshTokenRepository.deleteExpiredForUser(user.getId(), Instant.now());

        return insert(user, Instant.now().plus(refreshTtl));
    }

    /// Refresh: invalidates the presented token and issues a replacement with
    /// the SAME expiry. An unknown, expired or already-used token → 401.
    @Transactional
    public RotatedSession rotate(final String rawToken) {
        String hash = sha256(rawToken);

        RefreshToken token = refreshTokenRepository
                .findWithUserByTokenHash(hash)
                .orElseThrow(() -> new InvalidRefreshTokenException("Unknown refresh token"));

        if (token.isExpired()) {
            refreshTokenRepository.deleteByTokenHash(hash);
            throw new InvalidRefreshTokenException("Refresh token expired");
        }

        // Bulk delete (returns a count) instead of entity remove: if a
        // concurrent refresh already rotated this token, we see 0 rows and
        // reject instead of failing with a stale-state error.
        if (refreshTokenRepository.deleteByTokenHash(hash) == 0) {
            throw new InvalidRefreshTokenException("Refresh token already used");
        }

        User user = token.getUser();
        String newRaw = insert(user, token.getExpiresAt());

        refreshTokenRepository.deleteExpiredForUser(user.getId(), Instant.now());

        return new RotatedSession(user, newRaw);
    }

    /// Logout. Idempotent — an unknown token is already logged out.
    @Transactional
    public void revoke(final String rawToken) {
        refreshTokenRepository.deleteByTokenHash(sha256(rawToken));
    }

    private String insert(final User user, final Instant expiresAt) {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);

        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        refreshTokenRepository.save(RefreshToken.builder()
                .user(user)
                .tokenHash(sha256(raw))
                .expiresAt(expiresAt)
                .build());

        return raw;
    }

    private static String sha256(final String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
