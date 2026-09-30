package com.bistech.reporting.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

public final class FilterUtil {

    public static String normalize(final String str) {
        if (str == null) {
            return "";
        } else {
            return str.trim().toLowerCase();
        }
    }

    public static List<String> normalizeStringArrayToList(
            final List<String> list
    ) {
        if (list == null) {
            return new ArrayList<>();
        }

        return list.stream()
                .filter(Objects::nonNull)
                .flatMap(s -> Arrays.stream(s.split(",")))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(String::toLowerCase)
                .distinct()
                .collect(Collectors.toCollection(ArrayList::new));
    }

    public static <T> List<T> normalizeList(final List<T> list) {
        if (list == null) {
            return List.of();
        }

        return list.stream()
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }
}