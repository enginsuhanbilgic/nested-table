package com.bistech.reporting.security;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/// The frontend pages access can be granted to. A page exists exactly when a
/// release ships it, so the codes are constants; WHICH ROLES see a page is
/// runtime data (stat.lr_role_pages). Keep in sync with routeMeta.tsx.
public final class PageCodes {

    public static final String LATENCY_DAILY = "LATENCY_DAILY";
    public static final String LATENCY_RTT = "LATENCY_RTT";
    public static final String LATENCY_GROUPED = "LATENCY_GROUPED";
    public static final String TRANSACTIONS = "TRANSACTIONS";
    public static final String ANALYTICS = "ANALYTICS";

    /// Prefix for Spring Security authorities derived from page codes.
    public static final String AUTHORITY_PREFIX = "PAGE_";

    private static final Map<String, String> LABELS = buildLabels();

    private PageCodes() {
    }

    public static Set<String> all() {
        return LABELS.keySet();
    }

    public static boolean isKnown(final String code) {
        return code != null && LABELS.containsKey(code);
    }

    /// code → human label, in display order (for the role editor UI).
    public static Map<String, String> labels() {
        return LABELS;
    }

    public static String authority(final String code) {
        return AUTHORITY_PREFIX + code;
    }

    private static Map<String, String> buildLabels() {
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put(LATENCY_DAILY, "Daily Latency Statistics");
        labels.put(LATENCY_RTT, "Rtt Latency Statistics");
        labels.put(LATENCY_GROUPED, "Grouped Latency Statistics");
        labels.put(TRANSACTIONS, "Transaction Search");
        labels.put(ANALYTICS, "Page Visit Analytics");
        return java.util.Collections.unmodifiableMap(labels);
    }
}
