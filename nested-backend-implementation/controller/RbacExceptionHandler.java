package com.bistech.reporting.controller;

import com.bistech.reporting.exception.InvalidRefreshTokenException;
import com.bistech.reporting.exception.InvalidRoleOperationException;
import com.bistech.reporting.exception.RoleManagementConflictException;
import jakarta.persistence.EntityNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/// Scoped to the two auth controllers on purpose — it cannot shadow whatever
/// global advice the project already has. Every body uses the same JSON shape
/// as the security handlers: {status, error, message, path}.
@RestControllerAdvice(assignableTypes = {AuthController.class, AdminController.class})
public class RbacExceptionHandler {

    private static final Logger LOGGER = LoggerFactory.getLogger(RbacExceptionHandler.class);

    @ExceptionHandler(InvalidRefreshTokenException.class)
    public ResponseEntity<Map<String, Object>> invalidRefreshToken(
            final InvalidRefreshTokenException e, final HttpServletRequest request
    ) {
        // The specific reason (unknown / expired / already rotated) is logged,
        // not returned — the frontend reacts the same way regardless: re-login.
        LOGGER.info("Refresh rejected: {}", e.getMessage());
        return body(HttpStatus.UNAUTHORIZED, "Session expired, please log in again", request);
    }

    @ExceptionHandler(AuthenticationServiceException.class)
    public ResponseEntity<Map<String, Object>> authenticationServiceDown(
            final AuthenticationServiceException e, final HttpServletRequest request
    ) {
        // "Directory is down" is not "wrong password": 503 so users stop
        // retrying credentials and monitoring notices.
        LOGGER.error("Authentication service failure: {}", e.getMessage());
        return body(HttpStatus.SERVICE_UNAVAILABLE, "Authentication service is unavailable, try again later", request);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, Object>> badCredentials(
            final AuthenticationException e, final HttpServletRequest request
    ) {
        LOGGER.info("Login rejected: {}", e.getMessage());
        return body(HttpStatus.UNAUTHORIZED, "Invalid username or password", request);
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<Map<String, Object>> notFound(
            final EntityNotFoundException e, final HttpServletRequest request
    ) {
        return body(HttpStatus.NOT_FOUND, e.getMessage(), request);
    }

    @ExceptionHandler(InvalidRoleOperationException.class)
    public ResponseEntity<Map<String, Object>> invalidOperation(
            final InvalidRoleOperationException e, final HttpServletRequest request
    ) {
        return body(HttpStatus.BAD_REQUEST, e.getMessage(), request);
    }

    @ExceptionHandler(RoleManagementConflictException.class)
    public ResponseEntity<Map<String, Object>> conflict(
            final RoleManagementConflictException e, final HttpServletRequest request
    ) {
        return body(HttpStatus.CONFLICT, e.getMessage(), request);
    }

    /// Backstop for races the service-level checks missed (unique rule keys,
    /// FK RESTRICT on deleting a held role, ...).
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> integrityViolation(
            final DataIntegrityViolationException e, final HttpServletRequest request
    ) {
        LOGGER.warn("Data integrity violation on {}: {}", request.getServletPath(), e.getMessage());
        return body(HttpStatus.CONFLICT, "The change conflicts with the current state, refresh and retry", request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> validation(
            final MethodArgumentNotValidException e, final HttpServletRequest request
    ) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .orElse("Invalid request");

        return body(HttpStatus.BAD_REQUEST, message, request);
    }

    private ResponseEntity<Map<String, Object>> body(
            final HttpStatus status, final String message, final HttpServletRequest request
    ) {
        return ResponseEntity.status(status).body(Map.of(
                "status", status.value(),
                "error", status.getReasonPhrase(),
                "message", message == null ? status.getReasonPhrase() : message,
                "path", request.getServletPath()
        ));
    }
}
