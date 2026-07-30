package com.bistech.reporting.service;

import com.bistech.reporting.dto.transaction.NeighborResponse;
import com.bistech.reporting.dto.transaction.OrderPcapResponse;
import com.bistech.reporting.dto.transaction.OrderSearchDetailResponse;
import com.bistech.reporting.dto.transaction.OrderSearchRequest;
import com.bistech.reporting.dto.transaction.OrderSearchResponse;
import com.bistech.reporting.model.transaction.NeighborScope;
import com.bistech.reporting.model.transaction.OrderSearch;
import com.bistech.reporting.model.transaction.OrderSearchHit;
import com.bistech.reporting.model.transaction.OrderSearchStatus;
import com.bistech.reporting.repository.transaction.MePcapQueryRepository;
import com.bistech.reporting.repository.transaction.MePcapRow;
import com.bistech.reporting.repository.transaction.OrderSearchHitRepository;
import com.bistech.reporting.repository.transaction.OrderSearchRepository;
import com.bistech.reporting.repository.transaction.OrderSearchRequestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OrderSearchService {

    /** How long a finished search for TODAY is served from cache. */
    private static final Duration REUSE_TTL = Duration.ofMinutes(15);

    /** Hard limits agreed for the neighbor comparison. */
    private static final int MAX_WINDOW_MS = 50;
    private static final int MAX_ORDERS_PER_SIDE = 500;

    /**
     * History-grid sort fields -> query property paths (the query roots at
     * OrderSearchRequest, so search columns are nested). created_at sorts by
     * the CALLER'S request time, not the execution's.
     */
    private static final Map<String, String> HISTORY_SORT_FIELDS = Map.of(
            "created_at", "createdAt",
            "requested_at", "createdAt",
            "finished_at", "search.finishedAt",
            "tx_date", "search.txDate",
            "order_id", "search.orderId",
            "status", "search.status",
            "result_count", "search.resultCount"
    );

    private final OrderSearchRepository orderSearchRepository;
    private final OrderSearchRequestRepository orderSearchRequestRepository;
    private final OrderSearchHitRepository orderSearchHitRepository;
    private final MePcapQueryRepository mePcapQueryRepository;

    /**
     * Creates a search or hands back a reusable existing one, and ALWAYS
     * records the caller's interest in order_search_request -- with the
     * shared cache, several users' searches map onto one execution, and each
     * of them must still see it in their own history. Deliberately NOT
     * @Transactional: each repository call commits on its own, so losing the
     * uq_order_search_active insert race can be recovered by re-reading the
     * winner instead of poisoning an outer transaction.
     */
    public OrderSearchResponse createOrReuse(
            final OrderSearchRequest request,
            final UUID userId
    ) {
        if (request == null || request.orderId() == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "order_id is required");
        }

        LocalDate today = LocalDate.now();
        LocalDate txDate = request.txDate() != null ? request.txDate() : today;
        if (txDate.isAfter(today)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "tx_date cannot be in the future");
        }

        OrderSearch search;
        Optional<OrderSearch> latest = orderSearchRepository
                .findFirstByOrderIdAndTxDateAndStatusNotOrderByCreatedAtDescIdDesc(
                        request.orderId(), txDate, OrderSearchStatus.FAILED);
        if (latest.isPresent() && isReusable(latest.get(), today)) {
            search = latest.get();
        } else {
            OrderSearch fresh = new OrderSearch();
            fresh.setPublicId(UUID.randomUUID());
            fresh.setOrderId(request.orderId());
            fresh.setTxDate(txDate);
            fresh.setStatus(OrderSearchStatus.QUEUED);
            fresh.setRequestedBy(userId);
            fresh.setCreatedAt(Instant.now());

            try {
                search = orderSearchRepository.save(fresh);
            } catch (DataIntegrityViolationException e) {
                // A concurrent identical request won the partial-unique race.
                // Re-read the LATEST NON-FAILED row rather than only
                // QUEUED/RUNNING: on a fast day the winner may already have
                // finished by the time we look, and its fresh result is
                // exactly what this caller wants.
                search = orderSearchRepository
                        .findFirstByOrderIdAndTxDateAndStatusNotOrderByCreatedAtDescIdDesc(
                                request.orderId(), txDate, OrderSearchStatus.FAILED)
                        .orElseThrow(() -> e);
            }
        }

        orderSearchRequestRepository.recordRequest(search.getId(), userId);
        return toResponse(search, Instant.now());
    }

    /**
     * Shared-link semantics: any holder of the page role may read any search
     * by its public id; purely a read, so opening a link never touches the
     * viewer's history. Unknown/purged ids are a plain 404.
     */
    public OrderSearchDetailResponse getDetail(final UUID publicId) {
        OrderSearch search = findByPublicIdOr404(publicId);

        List<OrderPcapResponse> hits =
                search.getStatus() == OrderSearchStatus.DONE
                        ? orderSearchHitRepository
                                .findBySearchIdOrderByCommitIdAsc(search.getId())
                                .stream()
                                .map(OrderSearchService::toPcapResponse)
                                .toList()
                        : List.of();

        return new OrderSearchDetailResponse(toResponse(search, null), hits);
    }

    /** The caller's own searches only -- there is no global history view. */
    public Page<OrderSearchResponse> getHistory(
            final UUID userId,
            final Pageable pageable
    ) {
        return orderSearchRequestRepository
                .findHistory(userId, remapHistorySort(pageable))
                .map(request -> toResponse(
                        request.getSearch(), request.getCreatedAt()));
    }

    public NeighborResponse getNeighbors(
            final UUID publicId,
            final long commitId,
            final String scopeParam,
            final int windowMs,
            final int maxOrders
    ) {
        NeighborScope scope = parseScope(scopeParam);
        int window = clamp(windowMs, 1, MAX_WINDOW_MS);
        int limitPerSide = clamp(maxOrders, 1, MAX_ORDERS_PER_SIDE);
        long windowNs = window * 1_000_000L;

        OrderSearch search = findByPublicIdOr404(publicId);
        OrderSearchHit ref = orderSearchHitRepository
                .findBySearchIdAndCommitId(search.getId(), commitId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "commit_id does not belong to this search"));

        if (ref.getTxDate() == null || ref.getPartition() == null) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "order lacks the fields needed for comparison");
        }

        MePcapQueryRepository.Schema schema =
                resolveSchema(ref.getTxDate(), commitId);

        List<MePcapRow> neighbors;
        if (scope == NeighborScope.ME) {
            if (ref.getMeNetInputTime() == null) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "order never reached the matching engine; "
                                + "ME comparison is not possible");
            }
            neighbors = mePcapQueryRepository.findMeNeighbors(
                    schema, ref.getTxDate(), ref.getPartition(),
                    ref.getMeNetInputTime(), commitId, windowNs, limitPerSide);
        } else {
            if (ref.getGwNetInputTime() == null
                    || ref.getNode() == null || ref.getProcess() == null) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "order lacks gateway timing fields; "
                                + "GW comparison is not possible");
            }
            neighbors = mePcapQueryRepository.findGwNeighbors(
                    schema, ref.getTxDate(), ref.getNode(), ref.getProcess(),
                    ref.getPartition(), ref.getGwNetInputTime(), commitId,
                    windowNs, limitPerSide);
        }

        List<OrderPcapResponse> rows = new ArrayList<>(neighbors.size() + 1);
        neighbors.forEach(row -> rows.add(toPcapResponse(row)));
        rows.add(toPcapResponse(ref));
        rows.sort(rowOrder(scope));

        return new NeighborResponse(
                scope.name().toLowerCase(Locale.ROOT),
                window,
                limitPerSide,
                commitId,
                List.copyOf(rows)
        );
    }

    /**
     * Where does this order's raw data live RIGHT NOW? The calendar is only
     * a first guess: yesterday's rows stay in public until the nightly
     * migration (~04:15), and a search viewed days later has had its data
     * move from public to his since the search ran. So: probe the guessed
     * schema for the reference commit (one index probe), fall back to the
     * other, and answer 410 if the raw day has been dropped from his --
     * the snapshot in the results grid remains viewable, only the live
     * neighbor comparison is gone.
     */
    private MePcapQueryRepository.Schema resolveSchema(
            final LocalDate txDate,
            final long commitId
    ) {
        MePcapQueryRepository.Schema primary =
                txDate.isBefore(LocalDate.now())
                        ? MePcapQueryRepository.Schema.HIS
                        : MePcapQueryRepository.Schema.PUBLIC;
        MePcapQueryRepository.Schema fallback =
                primary == MePcapQueryRepository.Schema.HIS
                        ? MePcapQueryRepository.Schema.PUBLIC
                        : MePcapQueryRepository.Schema.HIS;

        if (mePcapQueryRepository.commitExists(primary, txDate, commitId)) {
            return primary;
        }
        if (mePcapQueryRepository.commitExists(fallback, txDate, commitId)) {
            return fallback;
        }
        throw new ResponseStatusException(HttpStatus.GONE,
                "raw data for this trading day is no longer available");
    }

    private OrderSearch findByPublicIdOr404(final UUID publicId) {
        return orderSearchRepository.findByPublicId(publicId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "search not found"));
    }

    private boolean isReusable(final OrderSearch search, final LocalDate today) {
        if (search.getStatus() == OrderSearchStatus.QUEUED
                || search.getStatus() == OrderSearchStatus.RUNNING) {
            return true;
        }
        if (search.getTxDate().isBefore(today)) {
            return true;    // closed trading day: results are immutable
        }
        return search.getFinishedAt() != null
                && search.getFinishedAt().isAfter(Instant.now().minus(REUSE_TTL));
    }

    private OrderSearchResponse toResponse(
            final OrderSearch search,
            final Instant requestedAt
    ) {
        Integer queuePosition = null;
        if (search.getStatus() == OrderSearchStatus.QUEUED) {
            queuePosition = (int) orderSearchRepository
                    .countByStatusAndIdLessThan(
                            OrderSearchStatus.QUEUED, search.getId()) + 1;
        }

        return new OrderSearchResponse(
                search.getPublicId(),
                search.getOrderId(),
                search.getTxDate(),
                search.getStatus().name(),
                queuePosition,
                search.getHintDates(),
                search.getCreatedAt(),
                requestedAt,
                search.getFinishedAt(),
                search.getResultCount()
        );
    }

    private static NeighborScope parseScope(final String scopeParam) {
        String normalized = scopeParam == null
                ? ""
                : scopeParam.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "me" -> NeighborScope.ME;
            case "gw" -> NeighborScope.GW;
            default -> throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "scope must be 'me' or 'gw'");
        };
    }

    private static Comparator<OrderPcapResponse> rowOrder(final NeighborScope scope) {
        Comparator<Long> nullsLast =
                Comparator.nullsLast(Comparator.naturalOrder());
        return Comparator
                .comparing(scope == NeighborScope.ME
                                ? OrderPcapResponse::meNetInputTime
                                : OrderPcapResponse::gwNetInputTime,
                        nullsLast)
                .thenComparing(OrderPcapResponse::commitId);
    }

    private static int clamp(final int value, final int min, final int max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * The history grid sends its snake_case column fields; remap to query
     * property paths, drop unknowns, and append a search.id tiebreaker so
     * pages stay stable when the primary sort has ties (same policy as the
     * nested grids).
     */
    private static Pageable remapHistorySort(final Pageable pageable) {
        List<Sort.Order> orders = new ArrayList<>();
        for (Sort.Order order : pageable.getSort()) {
            String property = HISTORY_SORT_FIELDS.get(order.getProperty());
            if (property != null) {
                orders.add(new Sort.Order(order.getDirection(), property));
            }
        }
        if (orders.isEmpty()) {
            orders.add(Sort.Order.desc("createdAt"));
        }
        orders.add(Sort.Order.desc("search.id"));

        return PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(orders)
        );
    }

    private static OrderPcapResponse toPcapResponse(final OrderSearchHit hit) {
        return new OrderPcapResponse(
                hit.getCommitId(), hit.getOrderId(), hit.getTxDate(),
                hit.getClientId(), hit.getAppId(), hit.getAppSeq(),
                hit.getStatus(), hit.getNode(), hit.getPartition(),
                hit.getProcess(), hit.getSide(), hit.getSeries(),
                hit.getUserName(), hit.getParticipant(), hit.getMarket(),
                hit.getAccountId(), hit.getInputMessageType(),
                hit.getConnectorPort(),
                hit.getMeVrdInputTime(), hit.getMeVrdOutputTime(),
                hit.getMeNetInputTime(), hit.getMeNetOutputTime(),
                hit.getGwNetInputTime(), hit.getGwNetOutputTime(),
                hit.getMeAsicInputTime(), hit.getMeAsicOutputTime(),
                hit.getMeVrdLatency(), hit.getMeNetLatency(),
                hit.getGwNetLatency(), hit.getMeAsicLatency()
        );
    }

    private static OrderPcapResponse toPcapResponse(final MePcapRow row) {
        return new OrderPcapResponse(
                row.commitId(), row.orderId(), row.txDate(),
                row.clientId(), row.appId(), row.appSeq(),
                row.status(), row.node(), row.partition(),
                row.process(), row.side(), row.series(),
                row.userName(), row.participant(), row.market(),
                row.accountId(), row.inputMessageType(),
                row.connectorPort(),
                row.meVrdInputTime(), row.meVrdOutputTime(),
                row.meNetInputTime(), row.meNetOutputTime(),
                row.gwNetInputTime(), row.gwNetOutputTime(),
                row.meAsicInputTime(), row.meAsicOutputTime(),
                row.meVrdLatency(), row.meNetLatency(),
                row.gwNetLatency(), row.meAsicLatency()
        );
    }
}
