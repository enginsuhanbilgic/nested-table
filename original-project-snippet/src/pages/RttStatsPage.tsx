import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import {
    Alert,
    Box,
    CircularProgress,
    FormControl,
    IconButton,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    alpha,
    useTheme,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import type { GridSortModel } from "@mui/x-data-grid";

import { CHART_COLORS, DEVIATION_DIVERGING } from "../theme/bistTheme";
import { DateRangePicker } from "../components/common/DateRangePicker";
import { SingleSelectFilter } from "../components/common/SingleSelectFilter";
import { useSidebar } from "../contexts/SidebarContext";
import { useChartResize } from "../hooks/useChartResize";
import {
    getRttFilterOptions,
    getRttLatencyStats,
} from "../services/latencyService";
import {
    compactFormatter,
    formatDateLabel,
    getDefaultFromDate,
    getDefaultToDate,
    numberFormatter,
} from "../services/utilService";
import type {
    RttBucketRange,
    RttFilterOptions,
    RttRangeFilters,
    RttRangeItem,
} from "../types/latency";

const DAYS_PER_PAGE_OPTIONS = [5, 7, 10];

// Space kept below the content grid so it ends flush with the shell's bottom
// padding; the offset *above* the grid is measured at runtime (see
// contentTop), so hiding the top bar/sidebar via the fullscreen toggle
// automatically lets the grid grow to the bottom of the viewport.
const PAGE_BOTTOM_INSET = 16;

// Cell tint / heatmap color = deviation from the bucket's median share
// across the fetched range, normalized per bucket. The floor keeps rows
// whose shares barely move from being stretched to full contrast (a swing
// under 1 percentage point is treated as noise), and the dead zone leaves
// near-typical cells untinted.
const DEVIATION_FLOOR = 0.01; // share fraction = 1 percentage point
const DEVIATION_DEAD_ZONE = 0.15; // |normalized deviation| below this: no tint

// The full range is fetched in one request (one small row per trading day),
// so paging through date columns is purely client-side.
const RTT_DATE_SORT: GridSortModel = [{ field: "date", sort: "asc" }];

// One table column: a day's bucket counts plus header summary numbers.
type DayColumn = {
    date: string;
    label: string;
    counts: number[];
    shares: number[];
    orders: number;
    med: number;
};

function formatMicros(value: number): string {
    if (value < 1_000) {
        return `${value}µs`;
    }
    if (value < 1_000_000) {
        const ms = value / 1_000;
        return `${Number.isInteger(ms) ? ms : ms.toFixed(1)}ms`;
    }
    return `${(value / 1_000_000).toFixed(2)}s`;
}

function bucketLabel(range: RttBucketRange): string {
    if (range.toMicros === null) {
        return `≥ ${formatMicros(range.fromMicros)}`;
    }
    return `${formatMicros(range.fromMicros)} – ${formatMicros(range.toMicros)}`;
}

function getRangeCount(item: RttRangeItem, index: number): number {
    const value = (item as unknown as Record<string, unknown>)[`range${index}`];
    return typeof value === "number" ? value : 0;
}

export function RttStatsPage() {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";

    const { collapsed } = useSidebar();
    const { registerChart } = useChartResize(collapsed);

    // Distance from the viewport top to the content grid (app bar + filter
    // bar + paddings). Measured live instead of hard-coded so the grid keeps
    // filling the page when the fullscreen toggle removes the shell chrome.
    const contentGridRef = useRef<HTMLDivElement | null>(null);
    const [contentTop, setContentTop] = useState(190);

    useLayoutEffect(() => {
        const el = contentGridRef.current;
        if (!el) {
            return;
        }

        let raf: number | null = null;
        const measure = () => {
            raf = null;
            // ceil, not round: at fractional display scales (Windows 125%)
            // a rounded-down top can overshoot the viewport by <1px, which
            // is enough to summon a scrollbar.
            const next = Math.max(
                0,
                Math.ceil(el.getBoundingClientRect().top),
            );
            setContentTop((prev) => (prev === next ? prev : next));
        };
        const scheduleMeasure = () => {
            if (raf === null) {
                raf = requestAnimationFrame(measure);
            }
        };

        measure();

        window.addEventListener("resize", scheduleMeasure);

        // Fullscreen toggles the top bar/sidebar without a window resize,
        // so watch for DOM/layout changes too. setContentTop is deduped, so
        // the mutations our own height change causes don't loop.
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

    const [filterOptions, setFilterOptions] = useState<RttFilterOptions>({
        rttLatencyTypes: [],
        rttGatewayTypes: [],
        rttBucketRanges: [],
    });

    const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);

    const [filters, setFilters] = useState<RttRangeFilters>({
        latencyType: "",
        gatewayType: "",
        from: getDefaultFromDate(),
        to: getDefaultToDate(),
    });

    const [daysPerPage, setDaysPerPage] = useState(7);
    const [page, setPage] = useState(0);

    const [rttItems, setRttItems] = useState<RttRangeItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const filtersReady =
        filters.latencyType !== "" &&
        filters.gatewayType !== "";

    const handleDateChange = (from: string, to: string) => {
        setFilters((prev) => ({ ...prev, from, to }));
    };

    const fetchRttFilterOptions = useCallback(async () => {
        try {
            setFilterOptionsLoading(true);
            setErrorMessage(null);

            const options = await getRttFilterOptions();

            setFilterOptions(options);

            setFilters((current) => ({
                ...current,
                latencyType: "Rtt",       // This is hard-coded according to the backend
                gatewayType: "OVERALL",  // This is hard-coded according to the backend
            }));
        } catch (error) {
            console.error(error);
            setErrorMessage("Could not load RTT filter options");
        } finally {
            setFilterOptionsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchRttFilterOptions();
    }, [fetchRttFilterOptions]);

    const fetchRttStats = useCallback(async () => {
        if (filtersReady && (!filters.from || !filters.to)) {
            setErrorMessage("Please select both from and to dates.");
            return;
        }

        if (filtersReady && (filters.from > filters.to)) {
            setErrorMessage("From date cannot be later than to date.");
            return;
        }

        try {
            setLoading(true);
            setErrorMessage(null);

            // One row per trading day, so the calendar-day span is a safe
            // upper bound for a single full-range page.
            const daySpan = Math.max(
                1,
                Math.round(
                    (new Date(filters.to).getTime() -
                        new Date(filters.from).getTime()) /
                        86_400_000,
                ) + 1,
            );

            const response = await getRttLatencyStats(
                filters,
                { page: 0, pageSize: daySpan },
                RTT_DATE_SORT,
            );

            setRttItems(response.content);
        } catch (error) {
            console.error(error);
            setErrorMessage("Could not load Rtt statistics.");
        } finally {
            setLoading(false);
        }
    }, [filters, filtersReady]);

    useEffect(() => {
        if (filterOptionsLoading || !filtersReady) {
            return;
        }

        void fetchRttStats();
    }, [filterOptionsLoading, filtersReady, fetchRttStats]);

    const bucketRanges = filterOptions.rttBucketRanges;

    const dayColumns = useMemo<DayColumn[]>(() => {
        if (bucketRanges.length === 0) {
            return [];
        }

        const isGwLat = filters.latencyType === "GwLat";

        return rttItems.map((item) => {
            const counts = bucketRanges.map((range) =>
                getRangeCount(item, range.index),
            );
            const total = counts.reduce((sum, count) => sum + count, 0);

            return {
                date: item.date,
                label: formatDateLabel(item.date),
                counts,
                shares: counts.map((count) => (total > 0 ? count / total : 0)),
                orders: isGwLat
                    ? item.gwLatNumberOfOrders
                    : item.totalNumberOfOrders,
                med: isGwLat ? item.gwLatmedLatency : item.medLatency,
            };
        });
    }, [rttItems, bucketRanges, filters.latencyType]);

    // Shared by the table tint and the heatmap: each bucket's typical
    // (median) share over the fetched range plus a per-bucket scale.
    // Normalizing per bucket makes color mean "unusual for this bucket"
    // instead of absolute size — with real data the buckets sit at very
    // different levels (e.g. 28% vs 1%) while moving only a few points day
    // to day, so a global scale collapses every row into one flat band.
    const rowStats = useMemo(
        () =>
            bucketRanges.map((_, bucketIdx) => {
                // Zero-count cells are "no orders", not an observed share of
                // zero: they'd drag a sparse bucket's median down (and an
                // empty day would distort all buckets at once), so typicals
                // come only from days where the bucket actually traded.
                const shares = dayColumns
                    .filter((day) => day.counts[bucketIdx] > 0)
                    .map((day) => day.shares[bucketIdx]);
                if (shares.length === 0) {
                    return { median: 0, scale: DEVIATION_FLOOR };
                }
                const sorted = [...shares].sort((a, z) => a - z);
                const mid = Math.floor(sorted.length / 2);
                const median =
                    sorted.length % 2 === 1
                        ? sorted[mid]
                        : (sorted[mid - 1] + sorted[mid]) / 2;
                const maxAbsDeviation = shares.reduce(
                    (max, share) => Math.max(max, Math.abs(share - median)),
                    0,
                );
                return {
                    median,
                    scale: Math.max(maxAbsDeviation, DEVIATION_FLOOR),
                };
            }),
        [bucketRanges, dayColumns],
    );

    const totalPages = Math.max(1, Math.ceil(dayColumns.length / daysPerPage));

    // Newest-first view shared by the table columns and the heatmap x-axis,
    // so both read in the same direction.
    const dayColumnsNewestFirst = useMemo(
        () => [...dayColumns].reverse(),
        [dayColumns],
    );

    // The table reads newest-first: page 1 holds the most recent days and
    // the leftmost column is the newest date; the oldest page gets the
    // remainder.
    const pageDays = useMemo(
        () =>
            dayColumnsNewestFirst.slice(
                page * daysPerPage,
                (page + 1) * daysPerPage,
            ),
        [dayColumnsNewestFirst, page, daysPerPage],
    );

    // Land on the newest days whenever the amount of data changes.
    useEffect(() => {
        setPage(0);
    }, [dayColumns.length, daysPerPage]);

    const handlePrevPage = () => {
        setPage((prev) => Math.max(0, prev - 1));
    };

    const handleNextPage = () => {
        setPage((prev) => Math.min(totalPages - 1, prev + 1));
    };

    const handlePageSelectChange = (e: SelectChangeEvent<number>) => {
        const selectedPage = Number(e.target.value); // 1-based
        setPage(selectedPage - 1);
    };

    const handleDaysPerPageChange = (e: SelectChangeEvent<number>) => {
        setDaysPerPage(Number(e.target.value));
    };

    // Diverging tint: warm = above this bucket's typical share, cool =
    // below, untinted = typical. The printed numbers stay the primary
    // encoding; color only flags which days are unusual.
    const tintFor = (day: DayColumn, bucketIdx: number): string | undefined => {
        const stats = rowStats[bucketIdx];
        // Zero orders = no signal: excluded from the stats above, and shown
        // untinted rather than as "below typical" (the printed 0 says it).
        if (!stats || day.counts[bucketIdx] === 0) {
            return undefined;
        }
        const deviation =
            (day.shares[bucketIdx] - stats.median) / stats.scale; // -1..1
        if (Math.abs(deviation) < DEVIATION_DEAD_ZONE) {
            return undefined;
        }
        const pole =
            deviation > 0
                ? DEVIATION_DIVERGING.above
                : DEVIATION_DIVERGING.below;
        return alpha(pole, Math.min(0.45, 0.08 + Math.abs(deviation) * 0.37));
    };

    const distributionOption = useMemo<EChartsOption>(() => {
        const categories = bucketRanges.map((range) => bucketLabel(range));
        const dayByLabel = new Map(pageDays.map((day) => [day.label, day]));

        return {
            animationDuration: 300,
            color: pageDays.map(
                (_, i) => CHART_COLORS[i % CHART_COLORS.length],
            ),
            grid: { left: 12, right: 18, top: 36, bottom: 8, containLabel: true },
            legend: {
                type: "scroll",
                top: 4,
                left: 8,
                itemWidth: 16,
                itemHeight: 10,
                icon: "roundRect",
                textStyle: {
                    color: theme.palette.text.secondary,
                    fontSize: 11,
                    fontWeight: 650,
                },
            },
            tooltip: {
                trigger: "axis",
                axisPointer: {
                    type: "line",
                    lineStyle: {
                        color: theme.palette.text.secondary,
                        width: 1,
                        type: "dashed",
                    },
                },
                backgroundColor: theme.palette.background.paper,
                borderColor: theme.palette.divider,
                borderWidth: 1,
                padding: [10, 12],
                textStyle: { color: theme.palette.text.primary, fontSize: 12 },
                extraCssText:
                    "box-shadow:0 12px 30px rgba(15,23,42,0.16);border-radius:8px;",
                formatter: (params: unknown) => {
                    const list = (Array.isArray(params)
                        ? params
                        : [params]) as Array<{
                        seriesName?: string;
                        dataIndex: number;
                        marker?: string;
                        value?: number;
                    }>;

                    if (list.length === 0) {
                        return "";
                    }

                    const bucketIndex = list[0].dataIndex;
                    const lines = list.map((p) => {
                        const day = p.seriesName
                            ? dayByLabel.get(p.seriesName)
                            : undefined;
                        const count = day ? day.counts[bucketIndex] : 0;
                        const pct =
                            typeof p.value === "number"
                                ? p.value.toFixed(2)
                                : "0";
                        return `${p.marker ?? ""} ${p.seriesName} &nbsp; <b>${pct}%</b> (${numberFormatter.format(count)})`;
                    });

                    return [`<b>${categories[bucketIndex]}</b>`, ...lines].join(
                        "<br/>",
                    );
                },
            },
            xAxis: {
                type: "category",
                data: categories,
                boundaryGap: false,
                axisLine: { lineStyle: { color: theme.palette.divider } },
                axisTick: { show: false },
                axisLabel: {
                    color: theme.palette.text.secondary,
                    fontSize: 10,
                    interval: 4,
                    formatter: (value: string) => value.split(" – ")[0],
                },
            },
            yAxis: {
                type: "value",
                axisLabel: {
                    color: theme.palette.text.secondary,
                    fontSize: 11,
                    formatter: (value: number) => `${value}%`,
                },
                splitLine: { lineStyle: { color: theme.palette.divider } },
            },
            series: pageDays.map((day) => ({
                name: day.label,
                type: "line" as const,
                smooth: true,
                showSymbol: false,
                symbol: "circle",
                symbolSize: 5,
                emphasis: {
                    focus: "series" as const,
                    lineStyle: { width: 3 },
                },
                lineStyle: { width: 2 },
                data: day.shares.map((share) =>
                    Number((share * 100).toFixed(3)),
                ),
            })),
        };
    }, [bucketRanges, pageDays, theme]);

    const heatmapOption = useMemo<EChartsOption>(() => {
        const xLabels = dayColumnsNewestFirst.map((day) => day.label);
        const yLabels = bucketRanges.map((range) =>
            formatMicros(range.fromMicros),
        );

        // Signed deviation from the bucket's median share, normalized per
        // bucket to [-1, 1] — the same scale the table tint uses.
        const data: [number, number, number][] = [];
        dayColumnsNewestFirst.forEach((day, x) => {
            day.shares.forEach((share, y) => {
                const stats = rowStats[y];
                // Cells with no orders render neutral (0), matching the
                // table's untinted zeros.
                const deviation =
                    stats && day.counts[y] > 0
                        ? (share - stats.median) / stats.scale
                        : 0;
                data.push([x, y, Number(deviation.toFixed(3))]);
            });
        });

        return {
            animation: false,
            grid: { left: 12, right: 76, top: 12, bottom: 8, containLabel: true },
            tooltip: {
                backgroundColor: theme.palette.background.paper,
                borderColor: theme.palette.divider,
                borderWidth: 1,
                padding: [10, 12],
                textStyle: { color: theme.palette.text.primary, fontSize: 12 },
                extraCssText:
                    "box-shadow:0 12px 30px rgba(15,23,42,0.16);border-radius:8px;",
                formatter: (params: unknown) => {
                    const p = params as { value?: [number, number, number] };
                    if (!p.value) {
                        return "";
                    }
                    const [x, y] = p.value;
                    const day = dayColumnsNewestFirst[x];
                    const range = bucketRanges[y];
                    const stats = rowStats[y];
                    if (!day || !range || !stats) {
                        return "";
                    }
                    if (day.counts[y] === 0) {
                        return `<b>${day.label} · ${bucketLabel(range)}</b><br/>no orders`;
                    }
                    const sharePct = (day.shares[y] * 100).toFixed(2);
                    const medianPct = (stats.median * 100).toFixed(2);
                    const deltaPp = (day.shares[y] - stats.median) * 100;
                    const delta = `${deltaPp >= 0 ? "+" : ""}${deltaPp.toFixed(2)}pp`;
                    return `<b>${day.label} · ${bucketLabel(range)}</b><br/>${numberFormatter.format(day.counts[y])} orders &nbsp; <b>${sharePct}%</b><br/>typical ${medianPct}% &nbsp; <b>${delta}</b>`;
                },
            },
            xAxis: {
                type: "category",
                data: xLabels,
                axisLine: { lineStyle: { color: theme.palette.divider } },
                axisTick: { show: false },
                axisLabel: {
                    color: theme.palette.text.secondary,
                    fontSize: 10,
                    interval: Math.max(0, Math.ceil(xLabels.length / 14) - 1),
                },
            },
            yAxis: {
                type: "category",
                data: yLabels,
                axisLine: { lineStyle: { color: theme.palette.divider } },
                axisTick: { show: false },
                axisLabel: {
                    color: theme.palette.text.secondary,
                    fontSize: 10,
                    interval: 3,
                },
            },
            visualMap: {
                type: "continuous",
                min: -1,
                max: 1,
                calculable: false,
                orient: "vertical",
                right: 6,
                top: "middle",
                itemWidth: 10,
                itemHeight: 110,
                text: ["above", "below"],
                textStyle: {
                    color: theme.palette.text.secondary,
                    fontSize: 10,
                },
                inRange: {
                    color: [
                        DEVIATION_DIVERGING.below,
                        isDark
                            ? DEVIATION_DIVERGING.mid.dark
                            : DEVIATION_DIVERGING.mid.light,
                        DEVIATION_DIVERGING.above,
                    ],
                },
            },
            series: [
                {
                    type: "heatmap" as const,
                    data,
                    progressive: 4000,
                    itemStyle: {
                        borderColor: theme.palette.background.paper,
                        borderWidth: 0.5,
                    },
                    emphasis: {
                        itemStyle: {
                            borderColor: theme.palette.text.primary,
                            borderWidth: 1,
                        },
                    },
                },
            ],
        };
    }, [dayColumnsNewestFirst, bucketRanges, rowStats, isDark, theme]);

    const stickyFirstColumnSx = {
        position: "sticky",
        left: 0,
        bgcolor: "background.paper",
        borderRight: `1px solid ${theme.palette.divider}`,
    } as const;

    // Headerless chart cards. minWidth/minHeight 0 are load-bearing: a grid
    // item's implicit minimum size is its content's size, and a rendered
    // ECharts canvas holds its last pixel width — without them the Paper can
    // never shrink, so the chart overflows to the right instead of resizing.
    const chartPaperSx = {
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 1,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: "background.paper",
        overflow: "hidden",
    } as const;

    const chartBodySx = {
        // Fixed height when the page stacks; fills the card when the lg+
        // grid constrains heights.
        height: { xs: 300, lg: "auto" },
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        p: 1,
    } as const;

    return (
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            sx={{
                p: 0,
            }}
        >
            <Stack
                direction="column"
                sx={{
                    alignItems: "center",
                    spacing: 1,
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
                    {/* Left Section: Date and Filters */}
                    <Box
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
                        <Box
                            sx={{
                                width: { xs: "100%", sm: "auto" },
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <DateRangePicker
                                from={filters.from}
                                to={filters.to}
                                onChange={handleDateChange}
                                isLoading={loading}
                                isDisabled={false}
                            />
                        </Box>

                        <Box
                            sx={{
                                display: "flex",
                                flexDirection: "row",
                                flexWrap: "wrap",
                                alignItems: "center",
                                gap: 2,
                                flexGrow: 1,
                            }}
                        >
                            <SingleSelectFilter
                                label="Gateway Type"
                                value={filters.gatewayType}
                                options={filterOptions.rttGatewayTypes}
                                onChange={(nextValue) => {
                                    setFilters((prev) => ({
                                        ...prev,
                                        gatewayType: nextValue,
                                    }));
                                }}
                                sx={{
                                    width: {
                                        xs: "calc(50% - 8px)",
                                        sm: 140,
                                    },
                                }}
                            />

                            <SingleSelectFilter
                                label="Latency Type"
                                value={filters.latencyType}
                                options={filterOptions.rttLatencyTypes}
                                onChange={(nextValue) => {
                                    setFilters((prev) => ({
                                        ...prev,
                                        latencyType: nextValue,
                                    }));
                                }}
                                sx={{
                                    width: {
                                        xs: "calc(50% - 8px)",
                                        sm: 140,
                                    },
                                }}
                            />
                        </Box>
                    </Box>

                    {/* Right Section: client-side paging over date columns */}
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: {
                                xs: "center",
                                sm: "flex-end",
                            },
                            gap: 1,
                            flexWrap: "wrap",
                            minWidth: { xs: "100%", sm: "auto" },
                        }}
                    >
                        <FormControl size="small" sx={{ minWidth: 110 }}>
                            <InputLabel id="days-per-page-label">
                                Days
                            </InputLabel>
                            <Select
                                labelId="days-per-page-label"
                                label="Days"
                                value={daysPerPage}
                                onChange={handleDaysPerPageChange}
                            >
                                {DAYS_PER_PAGE_OPTIONS.map((s) => (
                                    <MenuItem key={s} value={s}>
                                        {s} / page
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <IconButton
                            onClick={handlePrevPage}
                            disabled={page <= 0}
                            size="small"
                        >
                            <NavigateBeforeIcon />
                        </IconButton>

                        <FormControl size="small" sx={{ minWidth: 90 }}>
                            <InputLabel id="page-select-label">
                                Page
                            </InputLabel>
                            <Select
                                labelId="page-select-label"
                                label="Page"
                                value={Math.min(page + 1, totalPages)}
                                onChange={handlePageSelectChange}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            maxHeight: 360,
                                        },
                                    },
                                }}
                            >
                                {Array.from(
                                    { length: totalPages },
                                    (_, i) => i + 1,
                                ).map((p) => (
                                    <MenuItem key={p} value={p}>
                                        {p}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Typography
                            variant="body2"
                            color="text.secondary"
                        >
                            / {totalPages}
                        </Typography>

                        <IconButton
                            onClick={handleNextPage}
                            disabled={page >= totalPages - 1}
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

                <Box
                    ref={contentGridRef}
                    sx={{
                        position: "relative",
                        width: "100%",
                        display: "grid",
                        gap: 1,
                        // Table (left, 55%) and charts (right, 45%) split the
                        // space under the app bar + filter bar on lg+;
                        // stacked with natural heights below. The offset is
                        // measured live (contentTop), so the grid reaches the
                        // bottom of the viewport in fullscreen mode too.
                        gridTemplateColumns: {
                            lg: "minmax(0, 55fr) minmax(0, 45fr)",
                        },
                        height: {
                            xs: "auto",
                            lg: `calc(100vh - ${contentTop + PAGE_BOTTOM_INSET}px)`,
                        },
                        minHeight: { lg: 520 },
                    }}
                >
                    {/* Bucket table: buckets as rows, paged dates as columns */}
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
                        }}
                    >
                        {dayColumns.length === 0 && !loading ? (
                            <Box
                                sx={{
                                    py: 6,
                                    display: "flex",
                                    justifyContent: "center",
                                    color: "text.secondary",
                                }}
                            >
                                <Typography variant="body2">
                                    No data for the selected filters.
                                </Typography>
                            </Box>
                        ) : (
                            <TableContainer
                                sx={{
                                    // Stacked layout caps the table height;
                                    // side-by-side fills the grid row.
                                    flex: 1,
                                    minHeight: 0,
                                    maxHeight: { xs: 430, lg: "none" },
                                }}
                            >
                                <Table
                                    stickyHeader
                                    size="small"
                                    sx={{
                                        minWidth: 640,
                                        "& th, & td": {
                                            fontSize: 12,
                                            py: 0.4,
                                            px: 1.25,
                                            whiteSpace: "nowrap",
                                            fontVariantNumeric: "tabular-nums",
                                            borderColor: "divider",
                                        },
                                    }}
                                >
                                    <TableHead>
                                        <TableRow>
                                            <TableCell
                                                sx={{
                                                    ...stickyFirstColumnSx,
                                                    zIndex: 3,
                                                }}
                                            >
                                                Bucket
                                            </TableCell>
                                            {pageDays.map((day) => (
                                                <TableCell
                                                    key={day.date}
                                                    align="right"
                                                    sx={{
                                                        bgcolor:
                                                            "background.paper",
                                                    }}
                                                >
                                                    <Typography
                                                        component="div"
                                                        sx={{
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            lineHeight: 1.2,
                                                        }}
                                                    >
                                                        {day.label}
                                                    </Typography>
                                                    <Typography
                                                        component="div"
                                                        sx={{
                                                            fontSize: 10,
                                                            lineHeight: 1.2,
                                                            color: "text.secondary",
                                                            fontWeight: 400,
                                                        }}
                                                    >
                                                        {compactFormatter.format(
                                                            day.orders,
                                                        )}{" "}
                                                        ord · med{" "}
                                                        {formatMicros(day.med)}
                                                    </Typography>
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {bucketRanges.map((range, b) => (
                                            <TableRow key={range.index}>
                                                <TableCell
                                                    sx={{
                                                        ...stickyFirstColumnSx,
                                                        zIndex: 1,
                                                        color: "text.secondary",
                                                        fontWeight: 500,
                                                    }}
                                                >
                                                    {bucketLabel(range)}
                                                </TableCell>
                                                {pageDays.map((day) => (
                                                    <TableCell
                                                        key={day.date}
                                                        align="right"
                                                        sx={{
                                                            backgroundColor:
                                                                tintFor(
                                                                    day,
                                                                    b,
                                                                ),
                                                        }}
                                                    >
                                                        {compactFormatter.format(
                                                            day.counts[b],
                                                        )}
                                                        <Box
                                                            component="span"
                                                            sx={{
                                                                ml: 0.5,
                                                                fontSize: 10,
                                                                color: "text.secondary",
                                                            }}
                                                        >
                                                            {(
                                                                day.shares[b] *
                                                                100
                                                            ).toFixed(1)}
                                                            %
                                                        </Box>
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Paper>

                    {/* Charts: distribution of the visible days + full-range heatmap */}
                    <Box
                        sx={{
                            minHeight: 0,
                            display: "grid",
                            gap: 1,
                            // Distribution on top, heatmap below; they share
                            // the column height evenly on lg+.
                            gridTemplateRows: {
                                lg: "minmax(0, 1fr) minmax(0, 1fr)",
                            },
                        }}
                    >
                        {/* Bucket distribution: days on the current table page */}
                        <Paper sx={chartPaperSx}>
                            <Box sx={chartBodySx}>
                                <ReactECharts
                                    ref={registerChart}
                                    option={distributionOption}
                                    notMerge
                                    lazyUpdate
                                    style={{ height: "100%", width: "100%" }}
                                />
                            </Box>
                        </Paper>

                        {/* Heatmap: deviation from each bucket's typical share */}
                        <Paper sx={chartPaperSx}>
                            <Box sx={chartBodySx}>
                                <ReactECharts
                                    ref={registerChart}
                                    option={heatmapOption}
                                    notMerge
                                    lazyUpdate
                                    style={{ height: "100%", width: "100%" }}
                                />
                            </Box>
                        </Paper>
                    </Box>

                    {loading && (
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
                </Box>
            </Stack>
        </Box>
    );
}
