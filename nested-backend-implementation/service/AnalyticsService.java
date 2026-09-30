package com.bistech.reporting.service;

import com.bistech.reporting.dto.audit.*;
import com.bistech.reporting.dto.audit.PageHistoryAnalytics.*;
import com.bistech.reporting.model.audit.UserPageHistory;
import com.bistech.reporting.model.user.User;
import com.bistech.reporting.repository.UserPageHistoryRepository;
import com.bistech.reporting.repository.PageHistoryReadRepository;
import com.bistech.reporting.repository.user.UserRepository;
import com.bistech.reporting.exception.ResourceNotFoundException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AnalyticsService {
    private final UserRepository userRepository;
    private final UserPageHistoryRepository userPageHistoryRepository;
    private final PageHistoryReadRepository reads;

    @Transactional
    public void logPageHistory(final UserPageHistoryLoggingRequest userPageHistoryLoggingRequest,
                               final HttpServletRequest httpServletRequest,
                               final UUID userId) {

        User user = userRepository.findById(userId).orElseThrow(
                () -> new ResourceNotFoundException(
                        "Page history auditing could not be done for page "
                                + userPageHistoryLoggingRequest.pagePath()
                                + ". User with id "
                                + userId
                                + " returned null"
                )
        );

        UserPageHistory userPageHistory = UserPageHistory.builder()
                .user(user)
                .pagePath(userPageHistoryLoggingRequest.pagePath())
                .pageTitle(userPageHistoryLoggingRequest.pageTitle())
                .visitTimestamp(Instant.now())
                .referrer(userPageHistoryLoggingRequest.referrer())
                .userAgent(httpServletRequest.getHeader("User-Agent"))
                .build();

        userPageHistoryRepository.save(userPageHistory);
    }

    @Transactional(readOnly = true)
    public Summary summary(UserPageHistoryFilterRequest filter) {
        return reads.summary(filter);
    }

    @Transactional(readOnly = true)
    public List<Activity> activity(UserPageHistoryFilterRequest filter, LocalDate day) {
        return reads.activity(filter, day);
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Page<PageItem> pages(UserPageHistoryFilterRequest filter, int page, int size, String sort) {
        return reads.pages(filter, page, size, sort);
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Page<UserItem> users(UserPageHistoryFilterRequest filter, int page, int size, String sort) {
        return reads.users(filter, page, size, sort);
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public Page<UserPageHistoryResponse> getUserPageHistory(UserPageHistoryFilterRequest filter, int page, int size, String sort) {
        return reads.history(filter, page, size, sort);
    }

    @Transactional(readOnly = true)
    public List<Option> options(UserPageHistoryFilterRequest filter, String kind, String search) {
        return reads.options(filter, kind, search);
    }
}
