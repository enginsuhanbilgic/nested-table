package com.bistech.reporting.model.user;

/// How a CN rule's key is compared against the user's normalized group CNs.
/// EXACT is the default; CONTAINS is a per-rule opt-in for directories with
/// inconsistent naming (a short CONTAINS key can over-match — see plan §3.4).
public enum MatchMode {
    EXACT,
    CONTAINS
}
