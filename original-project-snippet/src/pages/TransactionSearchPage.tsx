import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { useNavigate } from "react-router-dom";
import {
    Alert,
    Box,
    Button,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Tooltip,
    Typography,
    useTheme,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import {
    DataGrid,
    type GridColDef,
    type GridRenderCellParams,
    type GridSortModel,
} from "@mui/x-data-grid";

import { DateDayPicker } from "../components/common/DateDayPicker";
import { TextInputFilter } from "../components/common/TextInputFilter";
import { ApiError } from "../services/apiClient";
import {
    createOrderSearch,
    formatInstant,
    getOrderSearchDetail,
    getOrderSearchHistory,
} from "../services/transactionService";
import { getDefaultToDate } from "../services/utilService";
import type { DateString } from "../types/latency";
import type {
    OrderSearchHistoryResponse,
    OrderSearchItem,
} from "../types/transaction";

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

// Space kept below the history grid so it ends flush with the shell's bottom
// padding; the offset *above* it is measured at runtime (see contentTop).
const PAGE_BOTTOM_INSET = 16;

// Poll cadence for a search that is still queued/running on the backend.
const PENDING_POLL_MS = 1500;

// Result of the last submitted search, reported inline -- the user always
// stays on this page. Only DONE searches enter the history grid below;
// NOT_FOUND and FAILED are not cached server-side, so an immediate re-search
// always runs fresh.
type SearchOutcome =
    | { kind: "done"; publicId: string; resultCount: number | null }
    | {
          kind: "not_found";
          orderId: string;
          txDate: DateString;
          hintDates: DateString[];
      }
    | { kind: "failed" };

const EMPTY_HISTORY: OrderSearchHistoryResponse = {
    content: [],
    page: 0,
    size: 0,
    totalElements: 0,
    totalPages: 0,
    first: false,
    last: false,
};

// The backend stores order ids as 64-bit longs; anything larger would fail
// server-side parsing, so reject it before it leaves the form.
const ORDER_ID_MAX = 9223372036854775807n; // Java Long.MAX_VALUE

function isValidOrderId(value: string): boolean {
    if (!/^\d{1,19}$/.test(value)) {
        return false;
    }
    try {
        return BigInt(value) <= ORDER_ID_MAX;
    } catch {
        return false;
    }
}

export function TransactionSearchPage() {
    const theme = useTheme();
    const navigate = useNavigate();

    // Distance from the viewport top to the history grid (app bar + search
    // bar + paddings), measured live so the grid keeps filling the page when
    // the fullscreen toggle removes the shell chrome (same pattern as
    // RttStatsPage).
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [contentTop, setContentTop] = useState(190);

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
    }, []);

    const [orderId, setOrderId] = useState("");
    const [txDate, setTxDate] = useState(getDefaultToDate());
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // posting = the POST is in flight; pendingId = the backend accepted the
    // search and we are waiting for the worker to finish it.
    const [posting, setPosting] = useState(false);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [outcome, setOutcome] = useState<SearchOutcome | null>(null);

    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 25,
    });
    const [sortModel, setSortModel] = useState<GridSortModel>([]);
    const [historyData, setHistoryData] =
        useState<OrderSearchHistoryResponse>(EMPTY_HISTORY);
    const [historyLoading, setHistoryLoading] = useState(false);

    const orderIdValid = isValidOrderId(orderId.trim());
    const submitting = posting || pendingId !== null;

    const fetchHistory = useCallback(
        async (options?: { silent?: boolean }) => {
            try {
                if (!options?.silent) {
                    setHistoryLoading(true);
                }

                const response = await getOrderSearchHistory(
                    paginationModel,
                    sortModel,
                );

                setHistoryData(response);
            } catch (error) {
                console.error(error);
                if (!options?.silent) {
                    setErrorMessage("Could not load your search history.");
                }
            } finally {
                if (!options?.silent) {
                    setHistoryLoading(false);
                }
            }
        },
        [paginationModel, sortModel],
    );

    useEffect(() => {
        void fetchHistory();
    }, [fetchHistory]);

    const applyOutcome = useCallback(
        (search: OrderSearchItem) => {
            if (search.status === "DONE") {
                setOutcome({
                    kind: "done",
                    publicId: search.public_id,
                    resultCount: search.result_count,
                });
                // The finished search is now the newest DONE row.
                void fetchHistory({ silent: true });
            } else if (search.status === "NOT_FOUND") {
                setOutcome({
                    kind: "not_found",
                    orderId: search.order_id,
                    txDate: search.tx_date,
                    hintDates: search.hint_dates ?? [],
                });
            } else if (search.status === "FAILED") {
                setOutcome({ kind: "failed" });
            }
        },
        [fetchHistory],
    );

    const startSearch = useCallback(
        async (orderIdValue: string, date: DateString) => {
            setOutcome(null);
            setErrorMessage(null);
            setPosting(true);

            try {
                const search = await createOrderSearch(orderIdValue, date);

                if (
                    search.status === "QUEUED" ||
                    search.status === "RUNNING"
                ) {
                    setPendingId(search.public_id);
                } else {
                    // Cache hit: the reused search is already terminal.
                    applyOutcome(search);
                }
            } catch (error) {
                console.error(error);
                setErrorMessage(
                    error instanceof ApiError
                        ? error.message
                        : "Could not start the search.",
                );
            } finally {
                setPosting(false);
            }
        },
        [applyOutcome],
    );

    // Watch the in-flight search until it turns terminal. Interval-based so a
    // transient poll failure just retries on the next tick.
    useEffect(() => {
        if (!pendingId) {
            return;
        }

        const timer = window.setInterval(() => {
            void getOrderSearchDetail(pendingId)
                .then((detail) => {
                    const status = detail.search.status;
                    if (status === "QUEUED" || status === "RUNNING") {
                        return;
                    }
                    setPendingId(null);
                    applyOutcome(detail.search);
                })
                .catch((error) => {
                    console.error(error);
                    if (error instanceof ApiError && error.status === 404) {
                        setPendingId(null);
                        setErrorMessage(
                            "The search is no longer available; please try again.",
                        );
                    }
                });
        }, PENDING_POLL_MS);

        return () => window.clearInterval(timer);
    }, [pendingId, applyOutcome]);

    const handlePrevPage = () => {
        setPaginationModel((prev) => ({
            ...prev,
            page: Math.max(0, prev.page - 1),
        }));
    };

    const handleNextPage = () => {
        setPaginationModel((prev) => ({
            ...prev,
            page: Math.min(historyData.totalPages - 1, prev.page + 1),
        }));
    };

    const handlePageSelectChange = (e: SelectChangeEvent<number>) => {
        const selectedPage = Number(e.target.value); // 1-based
        setPaginationModel((prev) => ({ ...prev, page: selectedPage - 1 }));
    };

    const handlePageSizeChange = (e: SelectChangeEvent<number>) => {
        const newSize = Number(e.target.value);
        setPaginationModel((prev) => ({
            ...prev,
            pageSize: newSize,
            page: 0,
        }));
    };

    // Field names double as the backend's sort keys. No status column: the
    // grid lists DONE searches only.
    const columns: GridColDef[] = [
        {
            field: "order_id",
            headerName: "Order ID",
            width: 150,
        },
        {
            field: "tx_date",
            headerName: "Date",
            width: 110,
        },
        {
            field: "result_count",
            headerName: "Rows",
            width: 80,
            align: "right",
            headerAlign: "right",
            renderCell: (params: GridRenderCellParams) =>
                (params.row as OrderSearchItem).result_count ?? "—",
        },
        {
            field: "requested_at",
            headerName: "Searched At",
            width: 180,
            renderCell: (params: GridRenderCellParams) =>
                formatInstant((params.row as OrderSearchItem).requested_at),
        },
        {
            field: "finished_at",
            headerName: "Finished At",
            width: 180,
            renderCell: (params: GridRenderCellParams) =>
                formatInstant((params.row as OrderSearchItem).finished_at),
        },
    ];

    return (
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            sx={{ p: 0 }}
        >
            <Stack
                direction="column"
                sx={{
                    alignItems: "center",
                    gap: 1,
                    width: "100%",
                }}
            >
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
                    {/* Left Section: order search form (Enter submits) */}
                    <Box
                        component="form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (orderIdValid && txDate && !submitting) {
                                void startSearch(orderId.trim(), txDate);
                            }
                        }}
                        sx={{
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 2,
                            flexGrow: 1,
                            width: { xs: "100%", sm: "auto" },
                        }}
                    >
                        <Box sx={{ width: { xs: "100%", sm: 240 } }}>
                            <TextInputFilter
                                label="Order ID"
                                value={orderId}
                                onChange={setOrderId}
                                size="small"
                                placeholder="e.g. 123456789"
                            />
                        </Box>

                        <DateDayPicker
                            selectedDate={txDate}
                            onDateChange={setTxDate}
                            isLoading={submitting}
                            isDisabled={false}
                            sx={{ width: 160 }}
                        />

                        <Button
                            type="submit"
                            variant="contained"
                            startIcon={<SearchIcon />}
                            disabled={!orderIdValid || !txDate || submitting}
                        >
                            {submitting ? "Searching…" : "Search"}
                        </Button>

                        {orderId.trim() !== "" && !orderIdValid && (
                            <Typography variant="caption" color="warning.main">
                                Order ID must be numeric (max 19 digits).
                            </Typography>
                        )}
                    </Box>

                    {/* Right Section: history pager */}
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: { xs: "center", sm: "flex-end" },
                            gap: 1,
                            flexWrap: "wrap",
                            minWidth: { xs: "100%", sm: "auto" },
                        }}
                    >
                        <Tooltip title="Refresh history">
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={() => void fetchHistory()}
                                    disabled={historyLoading}
                                >
                                    <RefreshIcon />
                                </IconButton>
                            </span>
                        </Tooltip>

                        <FormControl size="small" sx={{ minWidth: 110 }}>
                            <InputLabel id="rows-per-page-label">Rows</InputLabel>
                            <Select
                                labelId="rows-per-page-label"
                                label="Rows"
                                value={paginationModel.pageSize}
                                onChange={handlePageSizeChange}
                            >
                                {ROWS_PER_PAGE_OPTIONS.map((s) => (
                                    <MenuItem key={s} value={s}>
                                        {s} / page
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <IconButton
                            onClick={handlePrevPage}
                            disabled={paginationModel.page <= 0}
                            size="small"
                        >
                            <NavigateBeforeIcon />
                        </IconButton>

                        <FormControl size="small" sx={{ minWidth: 90 }}>
                            <InputLabel id="page-select-label">Page</InputLabel>
                            <Select
                                labelId="page-select-label"
                                label="Page"
                                value={Math.min(
                                    paginationModel.page + 1,
                                    Math.max(1, historyData.totalPages),
                                )}
                                onChange={handlePageSelectChange}
                                MenuProps={{
                                    PaperProps: { sx: { maxHeight: 360 } },
                                }}
                            >
                                {Array.from(
                                    { length: Math.max(1, historyData.totalPages) },
                                    (_, i) => i + 1,
                                ).map((p) => (
                                    <MenuItem key={p} value={p}>
                                        {p}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Typography variant="body2" color="text.secondary">
                            / {Math.max(1, historyData.totalPages)}
                        </Typography>

                        <IconButton
                            onClick={handleNextPage}
                            disabled={
                                paginationModel.page >=
                                historyData.totalPages - 1
                            }
                            size="small"
                        >
                            <NavigateNextIcon />
                        </IconButton>
                    </Box>
                </Paper>

                {errorMessage && (
                    <Alert severity="error" sx={{ width: "100%" }}>
                        {errorMessage}
                    </Alert>
                )}

                {outcome?.kind === "done" && (
                    <Alert
                        severity="success"
                        sx={{ width: "100%" }}
                        action={
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() =>
                                    navigate(`/transactions/${outcome.publicId}`)
                                }
                            >
                                View results
                            </Button>
                        }
                        onClose={() => setOutcome(null)}
                    >
                        Search completed — {outcome.resultCount ?? 0} row(s).
                        It has been added to your searches below.
                    </Alert>
                )}

                {outcome?.kind === "not_found" && (
                    <Alert
                        severity="warning"
                        sx={{ width: "100%" }}
                        onClose={() => setOutcome(null)}
                    >
                        <Stack sx={{ gap: 1 }}>
                            <span>
                                Order {outcome.orderId} was not found on{" "}
                                {outcome.txDate}. Not-found results are not
                                saved — you can search again right away.
                            </span>
                            {outcome.hintDates.length > 0 && (
                                <Stack
                                    direction="row"
                                    sx={{
                                        gap: 1,
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                    }}
                                >
                                    <span>It exists on:</span>
                                    {outcome.hintDates.map((date) => (
                                        <Button
                                            key={date}
                                            size="small"
                                            variant="outlined"
                                            disabled={submitting}
                                            onClick={() =>
                                                void startSearch(
                                                    outcome.orderId,
                                                    date,
                                                )
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

                {outcome?.kind === "failed" && (
                    <Alert
                        severity="error"
                        sx={{ width: "100%" }}
                        onClose={() => setOutcome(null)}
                    >
                        The search failed. Failed searches are not saved — try
                        again.
                    </Alert>
                )}

                {/* My searches: the caller's own DONE searches. Clicking a
                    row opens the (shareable) results route. */}
                <Paper
                    ref={contentRef}
                    sx={{
                        width: "100%",
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: 1,
                        border: `1px solid ${theme.palette.divider}`,
                        bgcolor: "background.paper",
                        overflow: "hidden",
                        height: `calc(100vh - ${contentTop + PAGE_BOTTOM_INSET}px)`,
                        minHeight: 320,
                    }}
                >
                    <DataGrid
                        rows={historyData.content}
                        columns={columns}
                        getRowId={(row) => (row as OrderSearchItem).public_id}
                        loading={historyLoading}
                        paginationMode="server"
                        rowCount={historyData.totalElements}
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        sortingMode="server"
                        sortModel={sortModel}
                        onSortModelChange={setSortModel}
                        onRowClick={(params) =>
                            navigate(
                                `/transactions/${(params.row as OrderSearchItem).public_id}`,
                            )
                        }
                        hideFooter
                        density="compact"
                        disableColumnMenu
                        sx={{
                            border: 0,
                            fontSize: "0.85rem",
                            "& .MuiDataGrid-columnHeaderTitle": {
                                fontWeight: 700,
                            },
                            "& .MuiDataGrid-cell:focus": {
                                outline: "none",
                            },
                            "& .MuiDataGrid-row": {
                                cursor: "pointer",
                            },
                        }}
                    />
                </Paper>
            </Stack>
        </Box>
    );
}
