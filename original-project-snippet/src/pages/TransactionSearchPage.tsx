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
    Chip,
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
import type { ChipProps } from "@mui/material/Chip";
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
    getOrderSearchHistory,
} from "../services/transactionService";
import { getDefaultToDate } from "../services/utilService";
import type {
    OrderSearchHistoryResponse,
    OrderSearchItem,
    OrderSearchStatus,
} from "../types/transaction";

const ROWS_PER_PAGE_OPTIONS = [10, 25, 50];

// Space kept below the history grid so it ends flush with the shell's bottom
// padding; the offset *above* it is measured at runtime (see contentTop).
const PAGE_BOTTOM_INSET = 16;

// While a visible search is still queued/running the history is re-fetched
// silently on this cadence, which is also how the status chips "live-update".
const ACTIVE_POLL_MS = 2000;

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

function isActiveStatus(status: OrderSearchStatus): boolean {
    return status === "QUEUED" || status === "RUNNING";
}

const EMPTY_HISTORY: OrderSearchHistoryResponse = {
    content: [],
    page: 0,
    size: 0,
    totalElements: 0,
    totalPages: 0,
    first: false,
    last: false,
};

export function TransactionSearchPage() {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";
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
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 25,
    });
    const [sortModel, setSortModel] = useState<GridSortModel>([]);
    const [historyData, setHistoryData] =
        useState<OrderSearchHistoryResponse>(EMPTY_HISTORY);
    const [historyLoading, setHistoryLoading] = useState(false);

    const orderIdValid = /^\d+$/.test(orderId.trim());

    const fetchHistory = useCallback(
        async (options?: { silent?: boolean }) => {
            try {
                if (!options?.silent) {
                    setHistoryLoading(true);
                }
                setErrorMessage(null);

                const response = await getOrderSearchHistory(
                    paginationModel,
                    sortModel,
                );

                setHistoryData(response);
            } catch (error) {
                console.error(error);
                // A background poll failing (e.g. a blip) should not blank
                // the page with an error; the next user action refetches.
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

    // Silent live-refresh while any visible search is queued/running. An
    // interval keyed on the boolean (not the data object) keeps polling
    // through transient fetch failures instead of silently stopping.
    const hasActiveSearches = historyData.content.some((item) =>
        isActiveStatus(item.status),
    );

    useEffect(() => {
        if (!hasActiveSearches) {
            return;
        }

        const timer = window.setInterval(() => {
            void fetchHistory({ silent: true });
        }, ACTIVE_POLL_MS);

        return () => window.clearInterval(timer);
    }, [hasActiveSearches, fetchHistory]);

    const handleSearch = async () => {
        if (!orderIdValid || !txDate) {
            return;
        }

        try {
            setSubmitting(true);
            setErrorMessage(null);

            const search = await createOrderSearch(orderId.trim(), txDate);

            navigate(`/transactions/${search.public_id}`);
        } catch (error) {
            console.error(error);
            setErrorMessage(
                error instanceof ApiError
                    ? error.message
                    : "Could not start the search.",
            );
            setSubmitting(false);
        }
    };

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

    // Field names double as the backend's sort keys (created_at/requested_at
    // both map to the caller's request time server-side).
    const columns: GridColDef[] = [
        {
            field: "order_id",
            headerName: "Order ID",
            flex: 1,
            minWidth: 160,
        },
        {
            field: "tx_date",
            headerName: "Date",
            width: 110,
        },
        {
            field: "status",
            headerName: "Status",
            width: 140,
            renderCell: (params: GridRenderCellParams) => {
                const row = params.row as OrderSearchItem;
                const chip = STATUS_CHIP[row.status];
                const label =
                    row.status === "QUEUED" && row.queue_position
                        ? `${chip.label} #${row.queue_position}`
                        : chip.label;
                return (
                    <Chip
                        size="small"
                        color={chip.color}
                        label={label}
                        variant={isDark ? "outlined" : "filled"}
                    />
                );
            },
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
                            void handleSearch();
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
                            Search
                        </Button>

                        {orderId.trim() !== "" && !orderIdValid && (
                            <Typography variant="caption" color="warning.main">
                                Order ID must be numeric.
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

                {/* My searches: strictly the caller's own history. Clicking a
                    row opens the (shareable) results route. */}
                <Paper
                    ref={contentRef}
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
