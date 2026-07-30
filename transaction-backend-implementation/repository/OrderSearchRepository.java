package com.bistech.reporting.repository.transaction;

import com.bistech.reporting.model.transaction.OrderSearch;
import com.bistech.reporting.model.transaction.OrderSearchStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrderSearchRepository extends JpaRepository<OrderSearch, Long> {

    Optional<OrderSearch> findByPublicId(UUID publicId);

    Page<OrderSearch> findByRequestedBy(UUID requestedBy, Pageable pageable);

    Optional<OrderSearch> findFirstByOrderIdAndTxDateAndStatusNotOrderByCreatedAtDescIdDesc(
            Long orderId,
            LocalDate txDate,
            OrderSearchStatus status
    );

    Optional<OrderSearch> findFirstByOrderIdAndTxDateAndStatusInOrderByCreatedAtDescIdDesc(
            Long orderId,
            LocalDate txDate,
            Collection<OrderSearchStatus> statuses
    );

    long countByStatusAndIdLessThan(OrderSearchStatus status, Long id);

    List<OrderSearch> findByStatusAndStartedAtBefore(OrderSearchStatus status, Instant before);

    /**
     * Claims the oldest QUEUED search. FOR UPDATE SKIP LOCKED makes this safe
     * to call from several worker threads / app instances at once: each claim
     * sees a different row, and a crashed claimer's lock (and its uncommitted
     * RUNNING flip) simply evaporates. Must run inside a transaction.
     */
    @Query(
            value = "SELECT * FROM stat.order_search "
                    + "WHERE status = 'QUEUED' "
                    + "ORDER BY id "
                    + "LIMIT 1 "
                    + "FOR UPDATE SKIP LOCKED",
            nativeQuery = true
    )
    Optional<OrderSearch> claimNextQueued();
}
