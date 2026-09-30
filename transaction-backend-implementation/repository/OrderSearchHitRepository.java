package com.bistech.reporting.repository.transaction;

import com.bistech.reporting.model.transaction.OrderSearchHit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface OrderSearchHitRepository
        extends JpaRepository<OrderSearchHit, OrderSearchHit.Key> {

    List<OrderSearchHit> findBySearchIdOrderByCommitIdAsc(Long searchId);

    Optional<OrderSearchHit> findBySearchIdAndCommitId(Long searchId, Long commitId);

    /**
     * Bulk JPQL delete ON PURPOSE, not a derived deleteBy: a derived delete
     * queues entity removals that Hibernate flushes AFTER insertions, so a
     * delete-then-saveAll of the same keys in one transaction would flush the
     * inserts first and die on the primary key. The bulk statement executes
     * immediately, in call order.
     */
    @Modifying
    @Query("DELETE FROM OrderSearchHit h WHERE h.searchId = :searchId")
    int deleteBySearchId(@Param("searchId") Long searchId);
}
