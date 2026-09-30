package com.bistech.reporting.model.transaction;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "order_search", schema = "stat")
@Getter
@Setter
@NoArgsConstructor
public class OrderSearch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private UUID publicId;

    @Column(name = "order_id", nullable = false, updatable = false)
    private Long orderId;

    @Column(name = "tx_date", nullable = false, updatable = false)
    private LocalDate txDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private OrderSearchStatus status;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "hint_dates")
    private List<LocalDate> hintDates;

    @Column(name = "requested_by", nullable = false, updatable = false)
    private UUID requestedBy;

    @Column(name = "attempts", nullable = false)
    private short attempts;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "error_text")
    private String errorText;

    @Column(name = "result_count")
    private Integer resultCount;
}
