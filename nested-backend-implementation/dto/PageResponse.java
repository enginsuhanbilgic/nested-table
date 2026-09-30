package com.bistech.reporting.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/// Reconstruction of the project's EXISTING paging envelope (the one the
/// latency endpoints already use), included so this snippet is
/// self-consistent. On port: keep your real class and delete this file.
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
    public static <T> PageResponse<T> of(final Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages(),
                page.isFirst(),
                page.isLast()
        );
    }
}
