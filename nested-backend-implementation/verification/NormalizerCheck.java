package com.bistech.reporting.security;

import java.util.Locale;
import java.util.Set;

/// Runnable regression net for the ONE behavior in this system that fails
/// silently when broken: Turkish-safe CN normalization. No JUnit, no build
/// tool — plain assertions, non-zero exit on failure.
///
/// Compile + run from nested-backend-implementation/:
///   javac -encoding UTF-8 -d out security/LdapNameNormalizer.java verification/NormalizerCheck.java
///   java -cp out com.bistech.reporting.security.NormalizerCheck
public final class NormalizerCheck {

    /// Must equal the cn_key seeded in sql/V1__role_rehaul.sql — ş preserved,
    /// but 'kanallari' ends in a DOTTED i. Not a typo.
    private static final String SEEDED_KEY = "iletişim kanallari servisi";

    private static int failures = 0;

    private NormalizerCheck() {
    }

    public static void main(final String[] args) {
        System.out.println("Default locale: " + Locale.getDefault());

        // --- normalizeKey: every casing an admin might type must match the key
        checkKey("İletişim Kanalları Servisi", SEEDED_KEY);        // as the directory returns it
        checkKey("İLETİŞİM KANALLARI SERVİSİ", SEEDED_KEY);        // caps
        checkKey("iletişim kanalları servisi", SEEDED_KEY);        // typed lower-case Turkish
        checkKey("  İletişim   Kanalları Servisi  ", SEEDED_KEY);  // stray whitespace
        checkKey("İletişim Kanallari Servisi", SEEDED_KEY);        // mixed dotted/dotless
        checkKey("i̇letişim kanalları servisi", SEEDED_KEY);  // pre-decomposed combining dot

        // ASCII-ized typing loses ş and must NOT match — the fold is i-only.
        check("ASCII 'iletisim' stays distinct",
                !SEEDED_KEY.equals(LdapNameNormalizer.normalizeKey("Iletisim Kanallari Servisi")));

        // The i-fold on plain English text.
        checkKey("ILETISIM", "iletisim");
        checkKey("Kanalları", "kanallari");
        // ö/ü/ğ/ç survive; the I in ÇALIŞMA is folded to dotted i by design.
        check("ö/ü/ğ/ç preserved, I folded",
                "öğrenci çalişma grubü".equals(LdapNameNormalizer.normalizeKey("ÖĞRENCİ ÇALIŞMA GRUBÜ")));
        check("null key", LdapNameNormalizer.normalizeKey(null) == null);
        check("blank collapses to empty", "".equals(LdapNameNormalizer.normalizeKey("   ")));

        // --- extractCn
        check("plain DN", "İletişim Kanalları Servisi".equals(
                LdapNameNormalizer.extractCn("CN=İletişim Kanalları Servisi,OU=Groups,DC=borsa,DC=local")));
        check("CN not first", "Abc".equals(LdapNameNormalizer.extractCn("OU=x,CN=Abc,DC=y")));
        check("case-insensitive attribute", "Abc".equals(LdapNameNormalizer.extractCn("cn=Abc,OU=x")));
        check("escaped comma (RFC 4514)", "Smith, John".equals(
                LdapNameNormalizer.extractCn("CN=Smith\\, John,OU=Users,DC=x")));
        check("no CN → null", LdapNameNormalizer.extractCn("OU=Groups,DC=x") == null);
        check("null DN → null", LdapNameNormalizer.extractCn(null) == null);
        check("blank DN → null", LdapNameNormalizer.extractCn("  ") == null);

        // --- matches
        Set<String> keys = Set.of(SEEDED_KEY, "bilgi teknolojileri servisi");
        check("EXACT hit", LdapNameNormalizer.matches(SEEDED_KEY, true, keys));
        check("EXACT partial must miss", !LdapNameNormalizer.matches("servisi", true, keys));
        check("CONTAINS partial hits", LdapNameNormalizer.matches("servisi", false, keys));
        check("CONTAINS miss", !LdapNameNormalizer.matches("takas", false, keys));
        check("null rule key", !LdapNameNormalizer.matches(null, true, keys));
        check("null cn set", !LdapNameNormalizer.matches(SEEDED_KEY, true, null));

        // --- end-to-end: directory entry → extractCn → normalizeKey → EXACT match
        String cn = LdapNameNormalizer.extractCn("CN=İletişim Kanalları Servisi,OU=Gruplar,DC=borsa,DC=local");
        check("end-to-end login match",
                LdapNameNormalizer.matches(SEEDED_KEY, true, Set.of(LdapNameNormalizer.normalizeKey(cn))));

        if (failures > 0) {
            System.out.println(failures + " CHECK(S) FAILED");
            System.exit(1);
        }

        System.out.println("All checks passed.");
    }

    private static void checkKey(final String input, final String expected) {
        String actual = LdapNameNormalizer.normalizeKey(input);
        check("normalizeKey[" + input + "] -> [" + actual + "]", expected.equals(actual));
    }

    private static void check(final String name, final boolean ok) {
        System.out.println((ok ? "  ok    " : "  FAIL  ") + name);
        if (!ok) {
            failures++;
        }
    }
}
