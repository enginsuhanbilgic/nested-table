package com.bistech.reporting.controller;

import com.bistech.reporting.dto.PageResponse;
import com.bistech.reporting.dto.audit.*;
import com.bistech.reporting.dto.audit.PageHistoryAnalytics.*;
import com.bistech.reporting.service.AnalyticsService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/audit")
@RequiredArgsConstructor
public class AnalyticsController {
    private final AnalyticsService analyticsService;

    @PostMapping("/pagehistory/log")
    public ResponseEntity<Void> log(
            final @RequestBody UserPageHistoryLoggingRequest userPageHistoryLoggingRequest,
            final HttpServletRequest httpServletRequest,
            final @AuthenticationPrincipal(expression = "userId") UUID userId
    ) {
        analyticsService.logPageHistory(
                userPageHistoryLoggingRequest,
                httpServletRequest,
                userId
        );

        return ResponseEntity.ok().build();
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYTICS')")
    @GetMapping("/pagehistory/get")
    public PageResponse<UserPageHistoryResponse> get(
            @ModelAttribute UserPageHistoryFilterRequest filter,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(defaultValue = "visitTimestamp,desc") String sort) {
        return PageResponse.of(analyticsService.getUserPageHistory(filter, page, size, sort));
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYTICS')")
    @GetMapping("/pagehistory/summary")
    public Summary summary(@ModelAttribute UserPageHistoryFilterRequest filter) {
        return analyticsService.summary(filter);
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYTICS')")
    @GetMapping("/pagehistory/activity")
    public List<Activity> activity(@ModelAttribute UserPageHistoryFilterRequest filter,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate day) {
        return analyticsService.activity(filter, day);
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYTICS')")
    @GetMapping("/pagehistory/pages")
    public PageResponse<PageItem> pages(@ModelAttribute UserPageHistoryFilterRequest filter,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(defaultValue = "visits,desc") String sort) {
        return PageResponse.of(analyticsService.pages(filter, page, size, sort));
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYTICS')")
    @GetMapping("/pagehistory/users")
    public PageResponse<UserItem> users(@ModelAttribute UserPageHistoryFilterRequest filter,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(defaultValue = "visits,desc") String sort) {
        return PageResponse.of(analyticsService.users(filter, page, size, sort));
    }

    @PreAuthorize("hasAnyRole('ADMIN', 'ANALYTICS')")
    @GetMapping("/pagehistory/filter-options")
    public List<Option> options(@ModelAttribute UserPageHistoryFilterRequest filter,
            @RequestParam String kind, @RequestParam(defaultValue = "") String search) {
        return analyticsService.options(filter, kind, search);
    }
}
