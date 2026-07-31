package com.borsaistanbul.reporting.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class JwtUtil {

    @Value("${auth.jwt.secret}")
    private String secret;

    @Value("${auth.jwt.expiration-ms}")
    private Long expirationMillis;

    private SecretKey signingKey;

    @PostConstruct
    public void init() {
        byte[] keyBytes = Decoders.BASE64.decode(this.secret);
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateToken(
            final UserDetails userDetails,
            final Map<String, Object> extraClaims
    ) {
        Map<String, Object> claims = new HashMap<>(extraClaims);

        claims.put("roles", userDetails.getAuthorities()
                .stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList()));

        return Jwts.builder()
                .claims(claims)
                .subject(userDetails.getUsername())
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMillis))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    public Boolean validateToken(final String token, final UserDetails userDetails) {
        final String username = extractUsername(token);

        return username.equals(userDetails.getUsername()) && !isTokenExpired(token);
    }

    public String extractUsername(final String token) {
        return extractClaim(token, Claims::getSubject);
    }

    private <T> T extractClaim(
            final String token,
            final Function<Claims, T> claimsResolver
    ) {
        final Claims claims = extractAllClaims(token);

        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(final String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private Boolean isTokenExpired(final String token) {
        return extractExpiration(token).before(new Date());
    }

    public Date extractExpiration(final String token) {
        return extractClaim(token, Claims::getExpiration);
    }
}