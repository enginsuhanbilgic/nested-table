package com.bistech.reporting.repository.transaction;

import com.bistech.reporting.model.transaction.OrderSearchRequest;
import com.bistech.reporting.model.transaction.OrderSearchStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

public interface OrderSearchRequestRepository
        extends JpaRepository<OrderSearchRequest, OrderSearchRequest.Key> {

    /**
     * Records (or refreshes) the caller's interest in a search. A native
     * upsert instead of save(): two sessions of the same user racing on the
     * same search must not blow up on the primary key, and a repeat search
     * should float to the top of the history (created_at = now()).
     */
    @Transactional
    @Modifying
    @Query(
            value = "INSERT INTO stat.order_search_request "
                    + "(search_id, requested_by, created_at) "
                    + "VALUES (:searchId, :userId, now()) "
                    + "ON CONFLICT (search_id, requested_by) "
                    + "DO UPDATE SET created_at = now()",
            nativeQuery = true
    )
    void recordRequest(@Param("searchId") long searchId, @Param("userId") UUID userId);

    /**
     * The caller's history, newest interest first by default (the service
     * remaps grid sort fields onto `createdAt` / `search.*` paths). JOIN
     * FETCH keeps it one query instead of one select per history row.
     *
     * Two filters shape what the grid shows:
     *  - status = DONE only (QUEUED/RUNNING are transient; NOT_FOUND/FAILED
     *    are deliberately invisible so they can be re-searched immediately),
     *  - only the LATEST execution per (order_id, tx_date): a TTL re-run
     *    creates a second DONE row for the same order, and listing both
     *    reads as a duplicate. "Latest" = highest search id (monotonic with
     *    creation), among the executions THIS user searched.
     */
    @Query(
            value = "SELECT r FROM OrderSearchRequest r JOIN FETCH r.search s "
                    + "WHERE r.requestedBy = :userId AND s.status = :status "
                    + "AND NOT EXISTS ("
                    + "  SELECT 1 FROM OrderSearchRequest r2 JOIN r2.search s2 "
                    + "  WHERE r2.requestedBy = :userId AND s2.status = :status "
                    + "  AND s2.orderId = s.orderId AND s2.txDate = s.txDate "
                    + "  AND s2.id > s.id)",
            countQuery = "SELECT count(r) FROM OrderSearchRequest r "
                    + "JOIN r.search s "
                    + "WHERE r.requestedBy = :userId AND s.status = :status "
                    + "AND NOT EXISTS ("
                    + "  SELECT 1 FROM OrderSearchRequest r2 JOIN r2.search s2 "
                    + "  WHERE r2.requestedBy = :userId AND s2.status = :status "
                    + "  AND s2.orderId = s.orderId AND s2.txDate = s.txDate "
                    + "  AND s2.id > s.id)"
    )
    Page<OrderSearchRequest> findHistory(
            @Param("userId") UUID userId,
            @Param("status") OrderSearchStatus status,
            Pageable pageable
    );
}
