package com.bistech.reporting.exception;

/// The request itself is invalid against role policy (inactive role, not
/// manually assignable, unknown page code, rule targeting a non-syncable
/// role, ...) → 400.
public class InvalidRoleOperationException extends RuntimeException {

    public InvalidRoleOperationException(final String message) {
        super(message);
    }
}
