package com.bistech.reporting.security;

import java.util.Collection;
import java.util.Locale;

/// CN extraction and Turkish-safe comparison keys.
///
/// Java, Postgres and human typing each case-fold the four i-letters
/// (İ U+0130, I, ı U+0131, i) differently, so a naive lower-case comparison
/// makes CN rules silently never match (see REHAUL-PLAN.md §3.4 and the
/// verified analysis in SECURITY-CHANGES.md §5.3). normalizeKey() folds all
/// four to plain 'i' BEFORE lower-casing, so every casing an admin might type
/// produces the same key. The fold applies only to i — ş, ğ, ç, ö, ü are
/// preserved.
///
/// Rule keys must be produced by THIS class only (never by SQL lower()).
/// Behavior is pinned by verification/NormalizerCheck.java — run it after any
/// change here.
public final class LdapNameNormalizer {

    private static final char COMBINING_DOT_ABOVE = '\u0307';

    private LdapNameNormalizer() {
    }

    /// Comparison key: trim, fold İ/I/ı → i, lower-case with Locale.ROOT,
    /// drop stray combining dots, collapse internal whitespace.
    public static String normalizeKey(final String value) {
        if (value == null) {
            return null;
        }

        String folded = value.trim()
                .replace('İ', 'i')
                .replace('I', 'i')
                .replace('ı', 'i');

        String lowered = folded.toLowerCase(Locale.ROOT);

        StringBuilder result = new StringBuilder(lowered.length());
        boolean pendingSpace = false;

        for (int i = 0; i < lowered.length(); i++) {
            char c = lowered.charAt(i);

            if (c == COMBINING_DOT_ABOVE) {
                continue;
            }

            if (Character.isWhitespace(c)) {
                pendingSpace = result.length() > 0;
                continue;
            }

            if (pendingSpace) {
                result.append(' ');
                pendingSpace = false;
            }

            result.append(c);
        }

        return result.toString();
    }

    /// First CN attribute of an LDAP DN, e.g.
    /// "CN=İletişim Kanalları Servisi,OU=Groups,DC=x" → "İletişim Kanalları Servisi".
    /// Handles RFC 4514 escaped commas ("CN=Smith\, John,OU=...").
    public static String extractCn(final String dn) {
        if (dn == null || dn.isBlank()) {
            return null;
        }

        for (String part : splitOnUnescapedCommas(dn)) {
            String trimmed = part.trim();

            if (trimmed.regionMatches(true, 0, "CN=", 0, 3)) {
                return trimmed.substring(3).replace("\\,", ",").trim();
            }
        }

        return null;
    }

    /// EXACT: the key equals one of the user's normalized CNs.
    /// CONTAINS: the key occurs inside one of them.
    public static boolean matches(
            final String ruleKey,
            final boolean exact,
            final Collection<String> normalizedCns
    ) {
        if (ruleKey == null || ruleKey.isBlank() || normalizedCns == null) {
            return false;
        }

        if (exact) {
            return normalizedCns.contains(ruleKey);
        }

        for (String cn : normalizedCns) {
            if (cn != null && cn.contains(ruleKey)) {
                return true;
            }
        }

        return false;
    }

    private static String[] splitOnUnescapedCommas(final String dn) {
        // "(?<!\\)," — a comma not preceded by a backslash.
        return dn.split("(?<!\\\\),");
    }
}
