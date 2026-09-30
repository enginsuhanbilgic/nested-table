package com.bistech.reporting.model.transaction;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * One user's interest in one executed search: the per-user history row.
 * Written only through the repository's native upsert (re-searching bumps
 * created_at), so this entity is effectively read-only on the Java side.
 * Derived identity: the Key's `search` field is OrderSearch's id type.
 */
@Entity
@Table(name = "order_search_request", schema = "stat")
@IdClass(OrderSearchRequest.Key.class)
@Getter
@NoArgsConstructor
public class OrderSearchRequest {

    @Id
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "search_id")
    private OrderSearch search;

    @Id
    @Column(name = "requested_by")
    private UUID requestedBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long search;
        private UUID requestedBy;
    }
}
