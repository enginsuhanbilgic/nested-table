package com.borsaistanbul.reporting.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtRequestFilter extends OncePerRequestFilter {

    private static final Logger LOGGER = LoggerFactory.getLogger(JwtRequestFilter.class);

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;
    private final RequestAttributeSecurityContextRepository requestAttributeSecurityContextRepository;

    @Override
    protected void doFilterInternal(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final FilterChain filterChain
    ) throws ServletException, IOException {

        final String authHeader = request.getHeader("Authorization");

        String username = null;
        String jwt = null;

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        jwt = authHeader.substring(7);

        try {
            username = jwtUtil.extractUsername(jwt);
        } catch (Exception e) {
            LOGGER.error("JWT validation error: {}", e.getMessage());
        }

        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                UserDetails userDetails = userDetailsService.loadUserByUsername(username);

                if (jwtUtil.validateToken(jwt, userDetails)) {
                    UsernamePasswordAuthenticationToken token =
                            new UsernamePasswordAuthenticationToken(
                                    userDetails,
                                    null,
                                    userDetails.getAuthorities()
                            );

                    SecurityContext context = SecurityContextHolder.createEmptyContext();
                    context.setAuthentication(token);
                    SecurityContextHolder.setContext(context);

                    requestAttributeSecurityContextRepository.saveContext(context, request, response);

                    // LOGGER.info("User {} authenticated and set in security context", username);
                } else {
                    LOGGER.warn("Invalid JWT for user '{}'", username);
                }

            } catch (UsernameNotFoundException e) {
                LOGGER.warn("User {} not found", username);

            } catch (Exception e) {
                LOGGER.error("Unexpected error while processing JWT for user '{}'", username, e);
            }
        }

        filterChain.doFilter(request, response);
    }
}