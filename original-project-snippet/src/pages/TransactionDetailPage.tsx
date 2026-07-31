import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Snackbar,
    Stack,
    Tooltip,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import type { ChipProps } from "@mui/material/Chip";
import type { Theme } from "@mui/material/styles";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import {
    DataGrid,
    type GridCellParams,
    type GridColDef,
    type GridRenderCellParams,
} from "@mui/x-data-grid";

import { ApiError } from "../services/apiClient";
import { getExchangeBaseline } from "../services/latencyService";
import {
    compareBigintStrings,
    createOrderSearch,
    formatInstant,
    formatNsTimestamp,
    formatUsTimestamp,
    getOrderNeighbors,
    getOrderSearchDetail,
    nsOffsetMicros,
    usOffsetMicros,
} from "../services/transactionService";
import { numberFormatter } from "../services/utilService";
import type { ExchangeBaseline } from "../types/latency";
import type {
    NeighborScope,
    OrderNeighbors,
    OrderPcapItem,
    OrderSearchDetail,
    OrderSearchStatus,
} from "../types/transaction";

// Space kept below the content so it ends flush with the shell's bottom
// padding; the offset *above* it is measured at runtime (see contentTop).
const PAGE_BOTTOM_INSET = 16;

// Poll cadence while the search is queued/running (shared links can land
// here mid-flight; there is no progress UI, just this quiet refresh).
const ACTIVE_POLL_MS = 1500;

const WINDOW_MS_OPTIONS = [1, 5, 10, 25, 50];
const MAX_ORDERS_OPTIONS = [50, 100, 200, 500];

// Latency cell colour = ratio vs. a reference value. In the neighbors grid
// the reference is the median of the visible rows (what "normal" looked like
// in this exact window); the day's exchange-wide baseline (same source as
// NestedLatencyPage) is the fallback, and the only reference for the small
// hits grid, where a median over a 2-3 row lineage says nothing.
const LATENCY_RATIO_THRESHOLDS = {
    warn: 2,
    high: 4,
    critical: 8,
};

const STATUS_CHIP: Record<
    OrderSearchStatus,
    { label: string; color: ChipProps["color"] }
> = {
    QUEUED: { label: "Queued", color: "default" },
    RUNNING: { label: "Running", color: "info" },
    DONE: { label: "Done", color: "success" },
    NOT_FOUND: { label: "Not found", color: "warning" },
    FAILED: { label: "Failed", color: "error" },
};

type NeighborTarget = {
    commitId: string;
    scope: NeighborScope;
};

// Neighbor grid rows carry the precomputed signed distance (µs) from the
// reference order on the scope's clock.
type NeighborGridRow = OrderPcapItem & { offset_us: number | null };

// Per-column colour references (µs) for the latency cells.
type LatencyRefs = {
    me: number | null;
    gw: number | null;
    vrd: number | null;
};

function canCompareMe(row: OrderPcapItem): boolean {
    return row.me_net_input_time !== null && row.partition !== null;
}

function canCompareGw(row: OrderPcapItem): boolean {
    return (
        row.gw_net_input_time !== null &&
        row.node !== null &&
        row.process !== null &&
        row.partition !== null
    );
}

function median(values: number[]): number | null {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

function latencyClassFor(
    value: number | null | undefined,
    reference: number | null,
): string {
    if (value == null || reference == null || reference <= 0) {
        return "";
    }
    const ratio = value / reference;
    if (ratio >= LATENCY_RATIO_THRESHOLDS.critical) return "latency-critical";
    if (ratio >= LATENCY_RATIO_THRESHOLDS.high) return "latency-high";
    if (ratio >= LATENCY_RATIO_THRESHOLDS.warn) return "latency-warn";
    return "latency-good";
}

export function TransactionDetailPage() {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";
    const navigate = useNavigate();
    const { publicId } = useParams<{ publicId: string }>();

    // Measured top offset so the DONE layout fills the viewport exactly
    // (same pattern as RttStatsPage).
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [contentTop, setContentTop] = useState(190);

    const [detail, setDetail] = useState<OrderSearchDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(true);
    const [detailError, setDetailError] = useState<{
        status?: number;
        message: string;
    } | null>(null);

    const [reSearching, setReSearching] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);

    const [neighborTarget, setNeighborTarget] =
        useState<NeighborTarget | null>(null);
    const [windowMs, setWindowMs] = useState(50);
    const [maxOrders, setMaxOrders] = useState(100);
    const [neighbors, setNeighbors] = useState<OrderNeighbors | null>(null);
    const [neighborsLoading, setNeighborsLoading] = useState(false);
    const [neighborsError, setNeighborsError] = useState<string | null>(null);

    const [baseline, setBaseline] = useState<ExchangeBaseline | null>(null);

    // Unlike RttStatsPage the ref'd box only exists once the search is DONE,
    // so the measurement effect re-attaches on status changes instead of
    // running once on mount (when the ref is still null).
    useLayoutEffect(() => {
        const el = contentRef.current;
        if (!el) {
            return;
        }

        let raf: number | null = null;
        const measure = () => {
            raf = null;
            const next = Math.max(0, Math.ceil(el.getBoundingClientRect().top));
            setContentTop((prev) => (prev === next ? prev : next));
        };
        const scheduleMeasure = () => {
            if (raf === null) {
                raf = requestAnimationFrame(measure);
            }
        };

        measure();

        window.addEventListener("resize", scheduleMeasure);
        const observer = new MutationObserver(scheduleMeasure);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "style"],
        });

        return () => {
            window.removeEventListener("resize", scheduleMeasure);
            observer.disconnect();
            if (raf !== null) {
                cancelAnimationFrame(raf);
            }
        };
    }, [detail?.search.status]);

    const fetchDetail = useCallback(
        async (options?: { silent?: boolean }) => {
            if (!publicId) {
                return;
            }

            try {
                if (!options?.silent) {
                    setDetailLoading(true);
                }
                setDetailError(null);

                const response = await getOrderSearchDetail(publicId);

                setDetail(response);
            } catch (error) {
                console.error(error);
                // A failed background poll keeps the last good state; the
                // interval below retries on its own.
                if (options?.silent) {
                    return;
                }
                const status =
                    error instanceof ApiError ? error.status : undefined;
                setDetail(null);
                setDetailError({
                    status,
                    message:
                        status === 404
                            ? "This search does not exist (or has been purged). Opening a link never starts a new search — go back and search the order yourself."
                            : error instanceof ApiError
                              ? error.message
                              : "Could not load the search.",
                });
            } finally {
                if (!options?.silent) {
                    setDetailLoading(false);
                }
            }
        },
        [publicId],
    );

    // Initial load + full reset when the route param changes.
    useEffect(() => {
        setDetail(null);
        setNeighborTarget(null);
        setNeighbors(null);
        setNeighborsError(null);
        void fetchDetail();
    }, [fetchDetail]);

    // Poll while queued/running; stops by itself on any terminal status. An
    // interval keyed on the boolean (not the detail object) keeps polling
    // through transient fetch failures instead of silently stopping.
    const isPollingStatus =
        detail?.search.status === "QUEUED" ||
        detail?.search.status === "RUNNING";

    useEffect(() => {
        if (!isPollingStatus) {
            return;
        }

        const timer = window.setInterval(() => {
            void fetchDetail({ silent: true });
        }, ACTIVE_POLL_MS);

        return () => window.clearInterval(timer);
    }, [isPollingStatus, fetchDetail]);

    // Exchange-wide baseline of the searched day: colour fallback (and the
    // only reference the hits grid has).
    const baselineDate =
        detail?.search.status === "DONE" ? detail.search.tx_date : null;

    useEffect(() => {
        if (!baselineDate) {
            setBaseline(null);
            return;
        }

        let cancelled = false;
        void getExchangeBaseline(baselineDate)
            .then((next) => {
                if (!cancelled) {
                    setBaseline(next);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setBaseline(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [baselineDate]);

    // Neighbors are computed live server-side; refetch whenever the target
    // row/scope or the window/max controls change.
    useEffect(() => {
        if (!publicId || !neighborTarget) {
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                setNeighborsLoading(true);
                setNeighborsError(null);

                const response = await getOrderNeighbors(
                    publicId,
                    neighborTarget.commitId,
                    { scope: neighborTarget.scope, windowMs, maxOrders },
                );

                if (!cancelled) {
                    setNeighbors(response);
                }
            } catch (error) {
                console.error(error);
                if (!cancelled) {
                    setNeighbors(null);
                    const status =
                        error instanceof ApiError ? error.status : undefined;
                    setNeighborsError(
                        status === 410
                            ? "Raw data for this trading day has been purged; the neighbor comparison is no longer available (the snapshot above remains)."
                            : error instanceof ApiError
                              ? error.message
                              : "Could not load the neighbor comparison.",
                    );
                }
            } finally {
                if (!cancelled) {
                    setNeighborsLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [publicId, neighborTarget, windowMs, maxOrders]);

    // Re-running is just createOrderSearch again: DONE within the TTL is
    // reused (same public_id -> refetch); anything else queues a fresh
    // execution (different public_id -> navigate to it).
    const handleReSearch = async (txDate: string) => {
        const search = detail?.search;
        if (!search) {
            return;
        }

        try {
            setReSearching(true);

            const created = await createOrderSearch(search.order_id, txDate);

            if (created.public_id === publicId) {
                await fetchDetail();
            } else {
                navigate(`/transactions/${created.public_id}`);
            }
        } catch (error) {
            console.error(error);
            setDetailError({
                message:
                    error instanceof ApiError
                        ? error.message
                        : "Could not start the search.",
            });
        } finally {
            setReSearching(false);
        }
    };

    const handleCopyLink = () => {
        void navigator.clipboard
            ?.writeText(window.location.href)
            .then(() => setLinkCopied(true))
            .catch(() => setLinkCopied(false));
    };

    const referenceHit = useMemo(
        () =>
            detail?.hits.find(
                (hit) => hit.commit_id === neighborTarget?.commitId,
            ) ?? null,
        [detail, neighborTarget],
    );

    const neighborRows = useMemo<NeighborGridRow[]>(() => {
        if (!neighbors) {
            return [];
        }

        const reference = neighbors.rows.find(
            (row) => row.commit_id === neighbors.reference_commit_id,
        );
        const referenceTime =
            neighbors.scope === "me"
                ? reference?.me_net_input_time
                : reference?.gw_net_input_time;

        // TEMPORARY: raw data currently repeats commit_ids (uniqueness fix
        // pending upstream); the first occurrence wins so commit_id stays a
        // valid unique row id. Remove once the source data is fixed.
        const seen = new Set<string>();
        const rows: NeighborGridRow[] = [];
        for (const row of neighbors.rows) {
            if (seen.has(row.commit_id)) {
                continue;
            }
            seen.add(row.commit_id);
            rows.push({
                ...row,
                // ME clock is ns, GW clock is µs -- each scope gets its helper.
                offset_us:
                    neighbors.scope === "me"
                        ? nsOffsetMicros(row.me_net_input_time, referenceTime)
                        : usOffsetMicros(row.gw_net_input_time, referenceTime),
            });
        }
        return rows;
    }, [neighbors]);

    // Colour references: neighbor grid uses the window's own medians with the
    // daily baseline as fallback; the hits grid uses the baseline only.
    const neighborRefs = useMemo<LatencyRefs>(() => {
        const collect = (pick: (row: NeighborGridRow) => number | null) =>
            median(
                neighborRows
                    .map(pick)
                    .filter((value): value is number => value !== null),
            );

        return {
            me: collect((row) => row.me_net_latency) ?? baseline?.me_med ?? null,
            gw: collect((row) => row.gw_net_latency) ?? baseline?.gw_med ?? null,
            vrd: collect((row) => row.me_vrd_latency),
        };
    }, [neighborRows, baseline]);

    const hitRefs = useMemo<LatencyRefs>(
        () => ({
            me: baseline?.me_med ?? null,
            gw: baseline?.gw_med ?? null,
            vrd: null,
        }),
        [baseline],
    );

    const pcapDetailColumns = useMemo<GridColDef[]>(
        () => [
            {
                field: "compare",
                headerName: "Compare",
                width: 128,
                sortable: false,
                filterable: false,
                disableColumnMenu: true,
                renderCell: (params: GridRenderCellParams) => {
                    const row = params.row as OrderPcapItem;
                    const meOk = canCompareMe(row);
                    const gwOk = canCompareGw(row);
                    const isActive = (scope: NeighborScope) =>
                        neighborTarget?.commitId === row.commit_id &&
                        neighborTarget?.scope === scope;

                    return (
                        <Stack
                            direction="row"
                            spacing={0.5}
                            sx={{ alignItems: "center", height: "100%" }}
                        >
                            <Tooltip
                                title={
                                    meOk
                                        ? "Nearby orders on the same matching-engine partition"
                                        : "Order never reached the matching engine"
                                }
                            >
                                <span>
                                    <Button
                                        size="small"
                                        variant={
                                            isActive("me")
                                                ? "contained"
                                                : "outlined"
                                        }
                                        disabled={!meOk}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setNeighborTarget({
                                                commitId: row.commit_id,
                                                scope: "me",
                                            });
                                        }}
                                        sx={{ minWidth: 44, px: 1 }}
                                    >
                                        ME
                                    </Button>
                                </span>
                            </Tooltip>
                            <Tooltip
                                title={
                                    gwOk
                                        ? "Nearby orders on the same gateway instance thread"
                                        : "Order lacks gateway timing fields"
                                }
                            >
                                <span>
                                    <Button
                                        size="small"
                                        variant={
                                            isActive("gw")
                                                ? "contained"
                                                : "outlined"
                                        }
                                        disabled={!gwOk}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setNeighborTarget({
                                                commitId: row.commit_id,
                                                scope: "gw",
                                            });
                                        }}
                                        sx={{ minWidth: 44, px: 1 }}
                                    >
                                        GW
                                    </Button>
                                </span>
                            </Tooltip>
                        </Stack>
                    );
                },
            },
            ...basePcapColumns(hitRefs),
        ],
        [neighborTarget, hitRefs],
    );

    const neighborColumns = useMemo<GridColDef[]>(
        () => [
            {
                field: "offset_us",
                headerName: "Δ (µs)",
                width: 110,
                align: "right",
                headerAlign: "right",
                renderCell: (params: GridRenderCellParams) => {
                    const value = (params.row as NeighborGridRow).offset_us;
                    if (value === null) {
                        return "—";
                    }
                    const text = numberFormatter.format(value);
                    return value > 0 ? `+${text}` : text;
                },
            },
            ...basePcapColumns(neighborRefs),
        ],
        [neighborRefs],
    );

    const search = detail?.search ?? null;
    const statusChip = search ? STATUS_CHIP[search.status] : null;
    const isActiveSearch =
        search?.status === "QUEUED" || search?.status === "RUNNING";

    return (
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            sx={{ p: 0 }}
        >
            <Stack
                direction="column"
                sx={{ alignItems: "center", gap: 1, width: "100%" }}
            >
                {/* Header: identity, status, share link, re-search */}
                <Paper
                    sx={{
                        p: 1.5,
                        width: "100%",
                        borderRadius: 1,
                        border: `1px solid ${theme.palette.divider}`,
                        bgcolor: "background.paper",
                        display: "flex",
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 2,
                        boxSizing: "border-box",
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.5,
                            flexWrap: "wrap",
                        }}
                    >
                        <Tooltip title="Back to order search">
                            <IconButton
                                size="small"
                                onClick={() => navigate("/transactions")}
                            >
                                <ArrowBackRoundedIcon />
                            </IconButton>
                        </Tooltip>

                        <Typography sx={{ fontWeight: 700 }}>
                            {search
                                ? `Order ${search.order_id}`
                                : "Order search"}
                        </Typography>

                        {search && (
                            <Typography variant="body2" color="text.secondary">
                                {search.tx_date}
                            </Typography>
                        )}

                        {statusChip && (
                            <Chip
                                size="small"
                                color={statusChip.color}
                                label={statusChip.label}
                                variant={isDark ? "outlined" : "filled"}
                            />
                        )}

                        {search?.status === "DONE" && (
                            <Typography variant="body2" color="text.secondary">
                                {search.result_count ?? 0} row(s) · finished{" "}
                                {formatInstant(search.finished_at)}
                            </Typography>
                        )}
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {search && !isActiveSearch && (
                            <Tooltip title="Run this search again (today's results are cached for 15 minutes)">
                                <span>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<ReplayRoundedIcon />}
                                        disabled={reSearching}
                                        onClick={() =>
                                            void handleReSearch(search.tx_date)
                                        }
                                    >
                                        Search again
                                    </Button>
                                </span>
                            </Tooltip>
                        )}

                        <Tooltip title="Copy shareable link">
                            <IconButton size="small" onClick={handleCopyLink}>
                                <ContentCopyRoundedIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Paper>

                {detailError && (
                    <Alert
                        severity="error"
                        sx={{ width: "100%" }}
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() => navigate("/transactions")}
                            >
                                Go to search
                            </Button>
                        }
                    >
                        {detailError.message}
                    </Alert>
                )}

                {detailLoading && !detail && !detailError && (
                    <Box
                        sx={{
                            py: 8,
                            display: "flex",
                            justifyContent: "center",
                            width: "100%",
                        }}
                    >
                        <CircularProgress size={28} />
                    </Box>
                )}

                {/* In-flight (reachable via shared links): no progress UI,
                    the page just refreshes itself until the search finishes. */}
                {search && isActiveSearch && (
                    <Alert severity="info" sx={{ width: "100%" }}>
                        This search is still being processed — the results will
                        appear here automatically when it finishes.
                    </Alert>
                )}

                {/* Not found: offer the dates that DO contain this order */}
                {search?.status === "NOT_FOUND" && (
                    <Alert severity="warning" sx={{ width: "100%" }}>
                        <Stack sx={{ gap: 1 }}>
                            <span>
                                Order {search.order_id} was not found on{" "}
                                {search.tx_date}.
                            </span>
                            {search.hint_dates &&
                                search.hint_dates.length > 0 && (
                                    <Stack
                                        direction="row"
                                        sx={{
                                            gap: 1,
                                            flexWrap: "wrap",
                                            alignItems: "center",
                                        }}
                                    >
                                        <span>
                                            It exists on the following date(s):
                                        </span>
                                        {search.hint_dates.map((date) => (
                                            <Button
                                                key={date}
                                                size="small"
                                                variant="outlined"
                                                disabled={reSearching}
                                                onClick={() =>
                                                    void handleReSearch(date)
                                                }
                                            >
                                                Search {date}
                                            </Button>
                                        ))}
                                    </Stack>
                                )}
                        </Stack>
                    </Alert>
                )}

                {search?.status === "FAILED" && (
                    <Alert severity="error" sx={{ width: "100%" }}>
                        The search failed. Use “Search again” to retry.
                    </Alert>
                )}

                {/* Done: hits grid + live neighbor comparison */}
                {search?.status === "DONE" && (
                    <Box
                        ref={contentRef}
                        sx={{
                            width: "100%",
                            display: "grid",
                            gap: 1,
                            gridTemplateRows: {
                                xs: "auto auto",
                                lg: "minmax(150px, 34fr) minmax(0, 66fr)",
                            },
                            height: {
                                xs: "auto",
                                lg: `calc(100vh - ${contentTop + PAGE_BOTTOM_INSET}px)`,
                            },
                            minHeight: { lg: 480 },
                        }}
                    >
                        <Paper
                            sx={{
                                width: "100%",
                                minWidth: 0,
                                minHeight: 0,
                                display: "flex",
                                flexDirection: "column",
                                borderRadius: 1,
                                border: `1px solid ${theme.palette.divider}`,
                                bgcolor: "background.paper",
                                overflow: "hidden",
                                height: { xs: 280, lg: "auto" },
                            }}
                        >
                            <DataGrid
                                rows={detail?.hits ?? []}
                                columns={pcapDetailColumns}
                                getRowId={(row) =>
                                    (row as OrderPcapItem).commit_id
                                }
                                hideFooter
                                density="compact"
                                disableColumnMenu
                                sx={pcapGridSx(theme)}
                            />
                        </Paper>

                        <Paper
                            sx={{
                                width: "100%",
                                minWidth: 0,
                                minHeight: 0,
                                display: "flex",
                                flexDirection: "column",
                                borderRadius: 1,
                                border: `1px solid ${theme.palette.divider}`,
                                bgcolor: "background.paper",
                                overflow: "hidden",
                                height: { xs: 440, lg: "auto" },
                                position: "relative",
                            }}
                        >
                            {/* Neighbor panel header: context + window/max controls */}
                            <Box
                                sx={{
                                    px: 1.5,
                                    py: 1,
                                    display: "flex",
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    gap: 1.5,
                                    borderBottom: `1px solid ${theme.palette.divider}`,
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <Typography sx={{ fontWeight: 700 }}>
                                        Neighbor comparison
                                    </Typography>

                                    {neighborTarget && referenceHit && (
                                        <>
                                            <Chip
                                                size="small"
                                                label={
                                                    neighborTarget.scope ===
                                                    "me"
                                                        ? `ME · partition ${referenceHit.partition}`
                                                        : `GW · ${referenceHit.node} / ${referenceHit.process} / P${referenceHit.partition}`
                                                }
                                            />
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                            >
                                                ref #{neighborTarget.commitId}
                                            </Typography>
                                            {neighbors && (
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                >
                                                    ±{neighbors.window_ms}ms ·
                                                    nearest{" "}
                                                    {
                                                        neighbors.max_orders_per_side
                                                    }
                                                    /side ·{" "}
                                                    {neighborRows.length} row(s)
                                                    · colour: vs window median
                                                </Typography>
                                            )}
                                        </>
                                    )}
                                </Box>

                                <Box
                                    sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 1,
                                    }}
                                >
                                    <FormControl
                                        size="small"
                                        sx={{ minWidth: 110 }}
                                    >
                                        <InputLabel id="window-ms-label">
                                            Window
                                        </InputLabel>
                                        <Select
                                            labelId="window-ms-label"
                                            label="Window"
                                            value={windowMs}
                                            onChange={(event) =>
                                                setWindowMs(
                                                    Number(event.target.value),
                                                )
                                            }
                                        >
                                            {WINDOW_MS_OPTIONS.map((value) => (
                                                <MenuItem
                                                    key={value}
                                                    value={value}
                                                >
                                                    ±{value} ms
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    <FormControl
                                        size="small"
                                        sx={{ minWidth: 130 }}
                                    >
                                        <InputLabel id="max-orders-label">
                                            Max orders
                                        </InputLabel>
                                        <Select
                                            labelId="max-orders-label"
                                            label="Max orders"
                                            value={maxOrders}
                                            onChange={(event) =>
                                                setMaxOrders(
                                                    Number(event.target.value),
                                                )
                                            }
                                        >
                                            {MAX_ORDERS_OPTIONS.map((value) => (
                                                <MenuItem
                                                    key={value}
                                                    value={value}
                                                >
                                                    {value} / side
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Box>
                            </Box>

                            {neighborsError && (
                                <Alert severity="warning" sx={{ m: 1 }}>
                                    {neighborsError}
                                </Alert>
                            )}

                            {!neighborTarget && !neighborsError && (
                                <Box
                                    sx={{
                                        flex: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        color: "text.secondary",
                                        p: 3,
                                    }}
                                >
                                    <Typography variant="body2">
                                        Pick an order above and choose ME or GW
                                        to compare it with the orders processed
                                        around it.
                                    </Typography>
                                </Box>
                            )}

                            {neighborTarget && !neighborsError && (
                                <Box sx={{ flex: 1, minHeight: 0 }}>
                                    <DataGrid
                                        rows={neighborRows}
                                        columns={neighborColumns}
                                        getRowId={(row) =>
                                            (row as NeighborGridRow).commit_id
                                        }
                                        loading={neighborsLoading}
                                        hideFooter
                                        density="compact"
                                        disableColumnMenu
                                        getRowClassName={(params) =>
                                            (params.row as NeighborGridRow)
                                                .commit_id ===
                                            neighbors?.reference_commit_id
                                                ? "row-reference"
                                                : ""
                                        }
                                        sx={{
                                            ...pcapGridSx(theme),
                                            // The searched order, rendered in
                                            // place among its neighbors.
                                            "& .MuiDataGrid-row.row-reference":
                                                {
                                                    bgcolor: alpha(
                                                        theme.palette.warning
                                                            .main,
                                                        isDark ? 0.32 : 0.22,
                                                    ),
                                                    fontWeight: 700,
                                                },
                                            "& .MuiDataGrid-row.row-reference:hover":
                                                {
                                                    bgcolor: alpha(
                                                        theme.palette.warning
                                                            .main,
                                                        isDark ? 0.4 : 0.3,
                                                    ),
                                                },
                                        }}
                                    />
                                </Box>
                            )}

                            {neighborsLoading && (
                                <Box
                                    sx={{
                                        position: "absolute",
                                        inset: 0,
                                        zIndex: 4,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        bgcolor: alpha(
                                            theme.palette.background.paper,
                                            0.62,
                                        ),
                                    }}
                                >
                                    <CircularProgress size={28} />
                                </Box>
                            )}
                        </Paper>
                    </Box>
                )}
            </Stack>

            <Snackbar
                open={linkCopied}
                autoHideDuration={2000}
                onClose={() => setLinkCopied(false)}
                message="Link copied"
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            />
        </Box>
    );
}

// Shared me_pcap column set of the hits and neighbors grids: times and
// latencies come right after the commit id (that is what the page is for);
// descriptive columns (msg type, side, partition, ...) sit to the right.
// Ids and epoch timestamps are bigint-safe strings, so numeric columns get an
// explicit BigInt comparator (client-side sorting). Two clocks: me/vrd times
// are ns, gw times are µs -- hence the two time-column builders.
function basePcapColumns(refs: LatencyRefs): GridColDef[] {
    const nsTimeColumn = (
        field: keyof OrderPcapItem & string,
        headerName: string,
    ): GridColDef => ({
        field,
        headerName,
        width: 150,
        sortComparator: compareBigintStrings,
        renderCell: (params: GridRenderCellParams) =>
            formatNsTimestamp(
                (params.row as OrderPcapItem)[field] as string | null,
            ),
    });

    const usTimeColumn = (
        field: keyof OrderPcapItem & string,
        headerName: string,
    ): GridColDef => ({
        field,
        headerName,
        width: 150,
        sortComparator: compareBigintStrings,
        renderCell: (params: GridRenderCellParams) =>
            formatUsTimestamp(
                (params.row as OrderPcapItem)[field] as string | null,
            ),
    });

    const latencyColumn = (
        field: keyof OrderPcapItem & string,
        headerName: string,
        reference: number | null,
    ): GridColDef => ({
        field,
        headerName,
        width: 110,
        align: "right",
        headerAlign: "right",
        cellClassName: (params: GridCellParams) => {
            const value = (params.row as OrderPcapItem)[field] as
                | number
                | null;
            return `latency-cell ${latencyClassFor(value, reference)}`;
        },
        renderCell: (params: GridRenderCellParams) => {
            const value = (params.row as OrderPcapItem)[field] as
                | number
                | null;
            return value === null ? "—" : numberFormatter.format(value);
        },
    });

    return [
        {
            field: "commit_id",
            headerName: "Commit ID",
            width: 170,
            sortComparator: compareBigintStrings,
        },
        usTimeColumn("gw_net_input_time", "GW In"),
        nsTimeColumn("me_net_input_time", "ME In"),
        latencyColumn("gw_net_latency", "GW Lat (µs)", refs.gw),
        latencyColumn("me_net_latency", "ME Lat (µs)", refs.me),
        latencyColumn("me_vrd_latency", "VRD Lat (µs)", refs.vrd),
        { field: "user_name", headerName: "User", width: 130 },
        { field: "participant", headerName: "Participant", width: 120 },
        { field: "series", headerName: "Series", width: 130 },
        { field: "input_message_type", headerName: "Msg Type", width: 110 },
        { field: "side", headerName: "Side", width: 70 },
        { field: "partition", headerName: "Part", width: 70 },
        { field: "node", headerName: "Node", width: 110 },
        { field: "process", headerName: "Process", width: 110 },
        { field: "connector_port", headerName: "Port", width: 90 },
        { field: "status", headerName: "Status", width: 90 },
        { field: "account_id", headerName: "Account", width: 110 },
    ];
}

function pcapGridSx(theme: Theme) {
    return {
        border: 0,
        fontSize: "0.83rem",
        "& .MuiDataGrid-columnHeaderTitle": {
            fontWeight: 700,
        },
        "& .MuiDataGrid-cell": {
            fontVariantNumeric: "tabular-nums",
        },
        "& .MuiDataGrid-cell:focus": {
            outline: "none",
        },
        "& .MuiDataGrid-row:hover": {
            bgcolor: alpha(
                theme.palette.primary.main,
                theme.palette.mode === "dark" ? 0.12 : 0.08,
            ),
        },
        // Same class vocabulary as NestedLatencyPage's latency cells.
        "& .latency-cell": {
            fontWeight: 750,
        },
        "& .latency-good": { color: theme.palette.success.main },
        "& .latency-warn": { color: theme.palette.warning.dark },
        "& .latency-high": { color: theme.palette.error.main },
        "& .latency-critical": {
            color: theme.palette.error.dark,
            fontWeight: 850,
        },
    } as const;
}
