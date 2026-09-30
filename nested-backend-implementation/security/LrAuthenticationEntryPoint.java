package com.bistech.reporting.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;

/// 401 with a stable JSON shape ({status, error, message, path}). The reason
/// is logged server-side, never returned — callers learn nothing about WHY a
/// token was rejected. Shares its body shape with LrAccessDeniedHandler.
@Component
@RequiredArgsConstructor
public class LrAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private static final Logger LOGGER = LoggerFactory.getLogger(LrAuthenticationEntryPoint.class);

    private final ObjectMapper objectMapper;

    @Override
    public void commence(
            final HttpServletRequest request,
            final HttpServletResponse response,
            final AuthenticationException authException
    ) throws IOException {

        LOGGER.debug("Rejected unauthenticated request to {}: {}", request.getServletPath(), authException.getMessage());

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);

        Map<String, Object> body = Map.of(
                "status", HttpServletResponse.SC_UNAUTHORIZED,
                "error", "Unauthorized",
                "message", "Authentication required",
                "path", request.getServletPath()
        );

        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
