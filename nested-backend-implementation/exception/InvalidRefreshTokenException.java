package com.bistech.reporting.exception;

/// Unknown, expired or already-rotated refresh token → 401. The frontend
/// reacts by sending the user to the login page.
public class InvalidRefreshTokenException extends RuntimeException {

    public InvalidRefreshTokenException(final String message) {
        super(message);
    }
}
