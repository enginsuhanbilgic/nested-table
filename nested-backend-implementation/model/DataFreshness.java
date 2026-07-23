package com.bistech.reporting.model.latency;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.Immutable;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * Data-freshness signal. Maps stat.v_latency_load_watermark, which already
 * reduces stat.latency_load_watermark to a single row: the most recent
 * trading day and the max watermark updated_at of that day. The view
 * supplies a synthetic row_number() id.
 */
@Immutable
@Entity
@Table(name = "v_latency_load_watermark", schema = "stat")
@Getter
@NoArgsConstructor
@AllArgsConstructor
public class DataFreshness {

    @Id
    @Column(name = "id")
    private Long id;

    @Column(name = "date")
    private LocalDate date;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;
}
