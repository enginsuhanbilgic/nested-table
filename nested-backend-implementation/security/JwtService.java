package com.bistech.reporting.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Duration;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Map;

/// Issues and parses the short-lived ACCESS token. Claims are deliberately
/// slim: subject (username), fullName, roles, pages. No memberOf, no profile
/// dump — the DB owns those and /api/auth/me serves them.
///
/// Replaces JwtUtil. The old auth.jwt.expiration-ms (1 week) becomes
/// auth.jwt.access-ttl (e.g. 15m); refresh tokens are a separate mechanism
/// (RefreshTokenService), not JWTs.
@Component
public class JwtService {

    public static final String CLAIM_USER_ID = "userId";
    public static final String CLAIM_FULL_NAME = "fullName";
    public static final String CLAIM_ROLES = "roles";
    public static final String CLAIM_PAGES = "pages";

    @Value("${auth.jwt.secret}")
    private String secret;

    @Value("${auth.jwt.access-ttl:15m}")
    private Duration accessTtl;

    private SecretKey signingKey;

    @PostConstruct
    public void init() {
        byte[] keyBytes = Decoders.BASE64.decode(this.secret);
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    public String issueAccessToken(
            final java.util.UUID userId,
            final String username,
            final String fullName,
            final Collection<String> roles,
            final Collection<String> pages
    ) {
        Date now = new Date();

        return Jwts.builder()
                .claims(Map.of(
                        CLAIM_USER_ID, userId.toString(),
                        CLAIM_FULL_NAME, fullName == null ? "" : fullName,
                        CLAIM_ROLES, List.copyOf(roles),
                        CLAIM_PAGES, List.copyOf(pages)
                ))
                .subject(username)
                .issuedAt(now)
                .expiration(new Date(now.getTime() + accessTtl.toMillis()))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    /// Parses and verifies in ONE pass (the old code parsed each token three
    /// times per request). Throws io.jsonwebtoken.JwtException — including
    /// ExpiredJwtException — on anything invalid; callers decide what that means.
    public Claims parse(final String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public static List<String> stringList(final Claims claims, final String claimName) {
        Object value = claims.get(claimName);

        if (!(value instanceof Collection<?> collection)) {
            return List.of();
        }

        return collection.stream().map(String::valueOf).toList();
    }
}
