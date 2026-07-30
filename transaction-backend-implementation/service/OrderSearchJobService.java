package com.bistech.reporting.service;

import com.bistech.reporting.model.transaction.OrderSearch;
import com.bistech.reporting.model.transaction.OrderSearchHit;
import com.bistech.reporting.model.transaction.OrderSearchStatus;
import com.bistech.reporting.repository.transaction.MePcapQueryRepository;
import com.bistech.reporting.repository.transaction.MePcapRow;
import com.bistech.reporting.repository.transaction.OrderSearchHitRepository;
import com.bistech.reporting.repository.transaction.OrderSearchRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Transactional steps of the search worker. Split from
 * {@link OrderSearchWorker} so the @Scheduled entry points call these through
 * the Spring proxy (self-invocation would bypass @Transactional).
 *
 * Claim and execute are separate transactions on purpose: the RUNNING flip
 * commits immediately so pollers see progress, and a worker that dies
 * mid-execute leaves a RUNNING row that {@link #requeueStale()} later returns
 * to the queue (or fails permanently after MAX_ATTEMPTS).
 */
@Service
@RequiredArgsConstructor
public class OrderSearchJobService {

    private static final Logger LOGGER =
            LoggerFactory.getLogger(OrderSearchJobService.class);

    private static final int MAX_ATTEMPTS = 3;
    private static final Duration STALE_RUNNING_AFTER = Duration.ofMinutes(10);
    private static final int MAX_ERROR_TEXT_LENGTH = 2000;

    private final OrderSearchRepository orderSearchRepository;
    private final OrderSearchHitRepository orderSearchHitRepository;
    private final MePcapQueryRepository mePcapQueryRepository;

    /** Claims the oldest QUEUED search and marks it RUNNING. */
    @Transactional
    public Optional<Long> claimNext() {
        return orderSearchRepository.claimNextQueued().map(search -> {
            search.setStatus(OrderSearchStatus.RUNNING);
            search.setStartedAt(Instant.now());
            search.setAttempts((short) (search.getAttempts() + 1));
            return search.getId();
        });
    }

    @Transactional
    public void execute(final long searchId) {
        OrderSearch search = orderSearchRepository.findById(searchId)
                .orElseThrow(() -> new IllegalStateException(
                        "claimed search vanished: " + searchId));
        if (search.getStatus() != OrderSearchStatus.RUNNING) {
            return;
        }

        // Schema routing happens at execution time, and the calendar is only
        // a first guess: yesterday's data stays in public until the nightly
        // migration (~04:15 next day), so between midnight and the move
        // "tx_date < today" would look in his and find nothing. On a miss the
        // other schema is probed before declaring NOT_FOUND -- one extra
        // index probe, and correct however late (or failed) the migration is.
        MePcapQueryRepository.Schema primary =
                search.getTxDate().isBefore(LocalDate.now())
                        ? MePcapQueryRepository.Schema.HIS
                        : MePcapQueryRepository.Schema.PUBLIC;
        MePcapQueryRepository.Schema fallback =
                primary == MePcapQueryRepository.Schema.HIS
                        ? MePcapQueryRepository.Schema.PUBLIC
                        : MePcapQueryRepository.Schema.HIS;

        List<MePcapRow> rows = mePcapQueryRepository.findByOrderId(
                primary, search.getOrderId(), search.getTxDate());
        if (rows.isEmpty()) {
            rows = mePcapQueryRepository.findByOrderId(
                    fallback, search.getOrderId(), search.getTxDate());
        }

        if (rows.isEmpty()) {
            List<LocalDate> hints = mePcapQueryRepository
                    .findDatesContainingOrder(search.getOrderId())
                    .stream()
                    .filter(date -> !date.equals(search.getTxDate()))
                    .toList();
            search.setHintDates(hints.isEmpty() ? null : hints);
            search.setStatus(OrderSearchStatus.NOT_FOUND);
            search.setResultCount(0);
        } else {
            // A TTL re-run reuses the (order_id, tx_date) key but is a new
            // row, so no old hits exist; the delete only defends a retried
            // attempt that failed between saveAll and commit.
            orderSearchHitRepository.deleteBySearchId(searchId);
            orderSearchHitRepository.saveAll(
                    rows.stream().map(row -> toHit(searchId, row)).toList());
            search.setStatus(OrderSearchStatus.DONE);
            search.setResultCount(rows.size());
        }
        search.setFinishedAt(Instant.now());

        LOGGER.info("order search {} finished: {} ({} rows)",
                searchId, search.getStatus(), search.getResultCount());
    }

    @Transactional
    public void markFailed(final long searchId, final Exception cause) {
        orderSearchRepository.findById(searchId).ifPresent(search -> {
            search.setStatus(OrderSearchStatus.FAILED);
            search.setFinishedAt(Instant.now());
            String message = cause.getMessage() != null
                    ? cause.getMessage()
                    : cause.toString();
            search.setErrorText(message.length() > MAX_ERROR_TEXT_LENGTH
                    ? message.substring(0, MAX_ERROR_TEXT_LENGTH)
                    : message);
        });
        LOGGER.error("order search {} failed", searchId, cause);
    }

    /**
     * Returns crash-orphaned RUNNING rows to the queue, or fails them for
     * good once MAX_ATTEMPTS is exhausted (poison-job guard).
     */
    @Transactional
    public void requeueStale() {
        Instant cutoff = Instant.now().minus(STALE_RUNNING_AFTER);
        for (OrderSearch search : orderSearchRepository
                .findByStatusAndStartedAtBefore(OrderSearchStatus.RUNNING, cutoff)) {
            if (search.getAttempts() >= MAX_ATTEMPTS) {
                search.setStatus(OrderSearchStatus.FAILED);
                search.setFinishedAt(Instant.now());
                search.setErrorText("worker did not finish after "
                        + MAX_ATTEMPTS + " attempts");
                LOGGER.error("order search {} abandoned after {} attempts",
                        search.getId(), search.getAttempts());
            } else {
                search.setStatus(OrderSearchStatus.QUEUED);
                search.setStartedAt(null);
                LOGGER.warn("order search {} was stale RUNNING; requeued "
                        + "(attempt {})", search.getId(), search.getAttempts());
            }
        }
    }

    private static OrderSearchHit toHit(final long searchId, final MePcapRow row) {
        return OrderSearchHit.builder()
                .searchId(searchId)
                .commitId(row.commitId())
                .orderId(row.orderId())
                .txDate(row.txDate())
                .clientId(row.clientId())
                .appId(row.appId())
                .appSeq(row.appSeq())
                .status(row.status())
                .node(row.node())
                .partition(row.partition())
                .process(row.process())
                .side(row.side())
                .series(row.series())
                .userName(row.userName())
                .participant(row.participant())
                .market(row.market())
                .accountId(row.accountId())
                .inputMessageType(row.inputMessageType())
                .connectorPort(row.connectorPort())
                .meVrdInputTime(row.meVrdInputTime())
                .meVrdOutputTime(row.meVrdOutputTime())
                .meNetInputTime(row.meNetInputTime())
                .meNetOutputTime(row.meNetOutputTime())
                .gwNetInputTime(row.gwNetInputTime())
                .gwNetOutputTime(row.gwNetOutputTime())
                .meAsicInputTime(row.meAsicInputTime())
                .meAsicOutputTime(row.meAsicOutputTime())
                .meVrdLatency(row.meVrdLatency())
                .meNetLatency(row.meNetLatency())
                .gwNetLatency(row.gwNetLatency())
                .meAsicLatency(row.meAsicLatency())
                .build();
    }
}
