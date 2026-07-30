package com.bistech.reporting.controller;

import com.bistech.reporting.dto.transaction.NeighborResponse;
import com.bistech.reporting.dto.transaction.OrderSearchDetailResponse;
import com.bistech.reporting.dto.transaction.OrderSearchRequest;
import com.bistech.reporting.dto.transaction.OrderSearchResponse;
import com.bistech.reporting.service.OrderSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// PageResponse is the existing project wrapper used by the other controllers.

/**
 * Transaction (order search) page endpoints. Role enforcement is server-side
 * on the whole controller -- results routes are shareable URLs, so the
 * frontend RequireRole gate alone is not enough.
 */
@RestController
@RequestMapping("/api/transaction")
@PreAuthorize("hasRole('ILETISIM_KANALLARI')")
@RequiredArgsConstructor
public class TransactionSearchController {

    private final OrderSearchService orderSearchService;

    /** Enqueue a search, or return the reusable cached/in-flight one. */
    @PostMapping("/searches")
    public ResponseEntity<OrderSearchResponse> createSearch(
            final @RequestBody OrderSearchRequest request,
            final @AuthenticationPrincipal(expression = "userId") UUID userId
    ) {
        return ResponseEntity.ok(
                orderSearchService.createOrReuse(request, userId)
        );
    }

    /** The caller's own search history (poll while QUEUED/RUNNING rows exist). */
    @GetMapping("/searches")
    public ResponseEntity<PageResponse<OrderSearchResponse>> getSearchHistory(
            final @AuthenticationPrincipal(expression = "userId") UUID userId,
            final @PageableDefault(
                    sort = "created_at",
                    direction = Sort.Direction.DESC
            ) Pageable pageable
    ) {
        return ResponseEntity.ok(
                PageResponse.of(
                        orderSearchService.getHistory(userId, pageable)
                )
        );
    }

    /**
     * Status + matched orders. Readable by any role holder via the shareable
     * URL; never adds to the viewer's history. 404 if unknown or purged.
     */
    @GetMapping("/searches/{publicId}")
    public ResponseEntity<OrderSearchDetailResponse> getSearchDetail(
            final @PathVariable UUID publicId
    ) {
        return ResponseEntity.ok(
                orderSearchService.getDetail(publicId)
        );
    }

    /**
     * Live neighbor comparison for one matched order. scope=me|gw;
     * windowMs clamped to 1..50 per side; maxOrders (per side) clamped
     * to 1..500.
     */
    @GetMapping("/searches/{publicId}/orders/{commitId}/neighbors")
    public ResponseEntity<NeighborResponse> getNeighbors(
            final @PathVariable UUID publicId,
            final @PathVariable long commitId,
            final @RequestParam String scope,
            final @RequestParam(defaultValue = "50") int windowMs,
            final @RequestParam(defaultValue = "100") int maxOrders
    ) {
        return ResponseEntity.ok(
                orderSearchService.getNeighbors(
                        publicId,
                        commitId,
                        scope,
                        windowMs,
                        maxOrders
                )
        );
    }
}
