import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography,
  useTheme,
} from "@mui/material";
import type {
  DateString,
  Market,
  Partition,
  Protocol,
  Location,
  LatencyDailyAverageStatsFilters,
  LatencyDailyAverageStatsItem,
  LatencyDailyAverageStatsResponse,
  LatencyMinuteStatsFilters,
  LatencyMinuteStatsResponse,
  LatencyFilterOptions,
  MinuteCacheEntry,
} from "../types/latency";
import { MultiSelectFilter } from "../components/common/MultiSelectFilter";
import { MetricCard } from "../components/common/MetricCard";
import {
  numberFormatter,
  compactFormatter,
  getDefaultFromDate,
  getDefaultToDate,
  formatDateLabel,
  isBeforeToday,
  formatPercent,
} from "../services/utilService";
import { CHART_COLORS } from "../theme/bistTheme";
import {
  getDailyAverageLatencyStats,
  getMinuteLatencyStats,
  getLatencyFilterOptions,
} from "../services/latencyService";
import { DateRangePicker } from "../components/common/DateRangePicker";
import { DateDayPicker } from "../components/common/DateDayPicker";
import { useSidebar } from "../contexts/SidebarContext";
import { useChartResize } from "../hooks/useChartResize";

const MINUTE_CACHE_TTL_MS = 60 * 60 * 1000;

const minuteDataCache = new Map<string, MinuteCacheEntry>();

const compareStrings = (a: string, b: string): number => a.localeCompare(b);

function createMinuteStatsCacheKey(
  filters: LatencyMinuteStatsFilters
): string {
  return JSON.stringify({
    date: filters.date,
    markets: [...filters.markets].sort(compareStrings),
    partitions: [...filters.partitions].sort(compareStrings),
    protocols: [...filters.protocols].sort(compareStrings),
    locations: [...filters.locations].sort(compareStrings),
  });
}

function getCachedMinuteData(
  cacheKey: string
): LatencyMinuteStatsResponse | null {
  const cacheEntry = minuteDataCache.get(cacheKey);

  if (!cacheEntry) {
    return null;
  }

  const isExpired = Date.now() - cacheEntry.cachedAt > MINUTE_CACHE_TTL_MS;

  if (isExpired) {
    minuteDataCache.delete(cacheKey);
    return null;
  }

  return cacheEntry.data;
}

function setCachedMinuteData(
  cacheKey: string,
  data: LatencyMinuteStatsResponse
) {
  if (data !== null  && data.length !== 0) {
    minuteDataCache.set(
      cacheKey, 
      {
        data,
        cachedAt: Date.now(),
      });
  }
}

export function LatencyDailyStatsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const { collapsed } = useSidebar();
  const { registerChart } = useChartResize(collapsed);

  const [filterOptions, setFilterOptions] = useState<LatencyFilterOptions>({
    markets: [],
    partitions: [],
    protocols: [],
    locations: [],
  });

  const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);

  const [filters, setFilters] =
    useState<LatencyDailyAverageStatsFilters>({
      markets: [],
      partitions: [],
      protocols: [],
      locations: [],
      from: getDefaultFromDate(),
      to: getDefaultToDate(),
    });

  const [dailyData, setDailyData] =
    useState<LatencyDailyAverageStatsResponse>([]);
  const [maxOfDailyData, setMaxOfDailyData] = useState<number | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<DateString | null>(null);
  const [minuteData, setMinuteData] =
    useState<LatencyMinuteStatsResponse>([]);
  const [minuteLoading, setMinuteLoading] = useState(false);
  const [minuteErrorMessage, setMinuteErrorMessage] =
    useState<string | null>(null);

  const filtersReady =
    filters.markets.length > 0 &&
    filters.partitions.length > 0 &&
    filters.protocols.length > 0 &&
    filters.locations.length > 0;

  const handleDateRangeChange = (from: string, to: string) => {
    setFilters(prev => ({ ...prev, from, to }));
  };

  const handleDateDayChange = (date: string) => {
    setSelectedDate(date);
    void fetchMinuteStats(date);
  };

  const fetchFilterOptions = useCallback(async () => {
    try {
      setFilterOptionsLoading(true);
      setErrorMessage(null);

      const options = await getLatencyFilterOptions();

      setFilterOptions(options);

      setFilters((current) => ({
        ...current,
        markets: options.markets.map((option) => option.id),
        partitions: options.partitions.map((option) => option.id),
        protocols: options.protocols.map((option) => option.id),
        locations: options.locations.map((option) => option.id),
      }));
    } catch (error) {
      console.error(error);
      setErrorMessage("Could not load latency filter options.");
    } finally {
      setFilterOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFilterOptions();
  }, [fetchFilterOptions]);

  const fetchDailyStats = useCallback(async () => {
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

      setSelectedDate(null);
      setMaxOfDailyData(null);
      setMinuteData([]);
      setMinuteErrorMessage(null);

      const response = await getDailyAverageLatencyStats(filters);      
      if (response && response.length > 0) {
        setMaxOfDailyData(Math.max(...response.map(item => item.max))); //Set the overall max latency of the days in the interval
      } else {
        setMaxOfDailyData(null);
      }
      setDailyData(response);
    } catch (error) {
      console.error(error);
      setErrorMessage("Could not load latency daily average statistics.");
    } finally {
      setLoading(false);
    }
  }, [filters, filtersReady]);

  useEffect(() => {
    if (filterOptionsLoading || !filtersReady) {
      return;
    }

    void fetchDailyStats();
  }, [filterOptionsLoading, filtersReady, fetchDailyStats]);

  const fetchMinuteStats = useCallback(
    async (date: DateString) => {
      if (!filtersReady) {
        return;
      }

      const minuteFilters: LatencyMinuteStatsFilters = {
        markets: filters.markets,
        partitions: filters.partitions,
        protocols: filters.protocols,
        locations: filters.locations,
        date,
      };

      const cacheKey = createMinuteStatsCacheKey(minuteFilters);
      const canUseCache = isBeforeToday(date);

      try {
        setMinuteLoading(true);
        setMinuteErrorMessage(null);
        setSelectedDate(date);

        if (canUseCache) {
          const cachedData = getCachedMinuteData(cacheKey);

          if (cachedData) {
            setMinuteData(cachedData);
            return;
          }
        }

        const response = await getMinuteLatencyStats(minuteFilters);

        if (canUseCache) {
          setCachedMinuteData(cacheKey, response);
        }

        setMinuteData(response);
      } catch (error) {
        console.error(error);
        setMinuteData([]);
        setMinuteErrorMessage("Could not load minute latency statistics.");
      } finally {
        setMinuteLoading(false);
      }
    },
    [
      filters.markets,
      filters.partitions,
      filters.protocols,
      filters.locations,
      filtersReady,
    ]
  );

  const dailySummary = useMemo(() => {
    const days = dailyData.length;

    const totalOrderCount = dailyData.reduce(
      (sum, item) => sum + item.totalOrderCount,
      0
    );

    const totalSlaOrderCount = dailyData.reduce(
      (sum, item) => sum + item.slaOrderCount,
      0
    );

    const avgSlaRatio =
      days === 0
        ? 0
        : dailyData.reduce((sum, item) => sum + item.slaRatio, 0) / days;

    const avgLatency =
      days === 0
        ? 0
        : dailyData.reduce((sum, item) => sum + item.average, 0) / days;

    const avgMedianLatency =
      days === 0
        ? 0
        : dailyData.reduce((sum, item) => sum + item.median, 0) / days;

    let maxDay: LatencyDailyAverageStatsItem | undefined;
    let busiestDay: LatencyDailyAverageStatsItem | undefined;
    let worstSlaDay: LatencyDailyAverageStatsItem | undefined;

    for (const item of dailyData) {
      if (!maxDay || item.max > maxDay.max) {
        maxDay = item;
      }
      if (!busiestDay || item.totalOrderCount > busiestDay.totalOrderCount) {
        busiestDay = item;
      }
      if (!worstSlaDay || item.slaRatio < worstSlaDay.slaRatio) {
        worstSlaDay = item;
      }
    }

    return {
      days,
      totalOrderCount,
      totalSlaOrderCount,
      avgSlaRatio,
      avgLatency,
      avgMedianLatency,
      maxDay,
      busiestDay,
      worstSlaDay,
    };
  }, [dailyData]);

  const chartTextColor = theme.palette.text.secondary;
  const chartGridColor = theme.palette.divider;
  const chartTooltipBackground = isDark
    ? theme.palette.background.paper
    : theme.palette.common.white;

  const dailyChartLabels = useMemo(
    () => dailyData.map((item) => formatDateLabel(item.date)),
    [dailyData]
  );

  const dailyChartFullDates = useMemo(
    () => dailyData.map((item) => item.date),
    [dailyData]
  );

  const handleDailyChartClick = useCallback(
    (params: any) => {
      const dataIndex = Number(params.dataIndex);

      if (!Number.isInteger(dataIndex)) {
        return;
      }

      const clickedDate = dailyChartFullDates[dataIndex];

      if (!clickedDate) {
        return;
      }

      void fetchMinuteStats(clickedDate);
    },
    [dailyChartFullDates, fetchMinuteStats]
  );

  const dailyChartEvents = useMemo(
    () => ({
      click: handleDailyChartClick,
    }),
    [handleDailyChartClick]
  );

  const ordersAndSlaOption: EChartsOption = useMemo(
    () => ({
      color: [CHART_COLORS[0], CHART_COLORS[2], CHART_COLORS[3]],
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: chartTooltipBackground,
        borderColor: chartGridColor,
        textStyle: {
          color: theme.palette.text.primary,
          fontFamily: theme.typography.fontFamily,
        },
        axisPointer: {
          type: "shadow",
        },
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [];
          const index = Number((items[0] as any)?.dataIndex ?? 0);

          const rows = items
            .map((item: any) => {
              const value =
                item.seriesName === "SLA Ratio"
                  ? formatPercent(Number(item.value))
                  : numberFormatter.format(Number(item.value));

              return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:6px;">
                  <span>${item.marker} ${item.seriesName}</span>
                  <strong>${value}</strong>
                </div>
              `;
            })
            .join("");

          return `
            <div style="min-width:220px;">
              <strong>${dailyChartFullDates[index] ?? ""}</strong>
              ${rows}
              <div style="margin-top:8px;font-size:12px;opacity:0.72;">
                Click to load minute data
              </div>
            </div>
          `;
        },
      },
      toolbox: {
        feature: {
          dataView: {
            show: true,
            readOnly: false,
          },
          saveAsImage: {
            show: true,
            type: "png",
          },
        },
      },
      legend: {
        top: 0,
        textStyle: {
          color: chartTextColor,
          fontFamily: theme.typography.fontFamily,
        },
      },
      grid: {
        top: 56,
        left: 56,
        right: 64,
        bottom: 72,
      },
      xAxis: {
        type: "category",
        data: dailyChartLabels,
        axisLine: {
          lineStyle: {
            color: chartGridColor,
          },
        },
        axisTick: {
          alignWithLabel: true,
        },
        axisLabel: {
          color: chartTextColor,
        },
      },
      yAxis: [
        {
          type: "value",
          name: "Orders",
          nameTextStyle: {
            color: "#009FC3",
          },
          axisLabel: {
            color: "#009FC3",
            formatter: (value: number) => compactFormatter.format(value),
          },
          splitLine: {
            lineStyle: {
              color: chartGridColor,
            },
          },
        },
        {
          type: "value",
          name: "SLA Ratio",
          nameTextStyle: {
            color: "#18A64C",
          },
          axisLabel: {
            color: "#18A64C",
            formatter: "{value}%",
          },
          splitLine: {
            show: false,
          },
        },
      ],
      dataZoom: [
        {
          type: "inside",
        },
        {
          type: "slider",
          height: 24,
          bottom: 24,
          borderColor: chartGridColor,
          textStyle: {
            color: chartTextColor,
          },
        },
      ],
      series: [
        {
          name: "Total Orders",
          type: "bar",
          data: dailyData.map((item) => item.totalOrderCount),
          barMaxWidth: 34,
          itemStyle: {
            borderRadius: [8, 8, 0, 0],
          },
          emphasis: {
            focus: "series",
          },
        },
        {
          name: "SLA Orders",
          type: "bar",
          data: dailyData.map((item) => item.slaOrderCount),
          barMaxWidth: 34,
          itemStyle: {
            borderRadius: [8, 8, 0, 0],
          },
          emphasis: {
            focus: "series",
          },
        },
        {
          name: "SLA Ratio",
          type: "line",
          yAxisIndex: 1,
          data: dailyData.map((item) => Number(item.slaRatio.toFixed(2))),
          smooth: true,
          symbolSize: 8,
          lineStyle: {
            width: 3,
          },
          itemStyle: {
            color: "#18A64C",
          }
        },
      ],
    }),
    [
      chartGridColor,
      chartTextColor,
      chartTooltipBackground,
      dailyData,
      dailyChartLabels,
      dailyChartFullDates,
      dailySummary.avgSlaRatio,
      theme.palette.text.primary,
      theme.typography.fontFamily,
    ]
  );

  const latencyDistributionOption: EChartsOption = useMemo(
    () => ({
      color: [
        CHART_COLORS[5],
        CHART_COLORS[0],
        CHART_COLORS[2],
        CHART_COLORS[4],
      ],
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: chartTooltipBackground,
        borderColor: chartGridColor,
        textStyle: {
          color: theme.palette.text.primary,
          fontFamily: theme.typography.fontFamily,
        },
        formatter: (params: unknown) => {
          const items = Array.isArray(params) ? params : [];
          const index = Number((items[0] as any)?.dataIndex ?? 0);

          const rows = items
            .map((item: any) => {
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:6px;">
                  <span>${item.marker} ${item.seriesName}</span>
                  <strong>${item.value}</strong>
                </div>
              `;
            })
            .join("");

          return `
            <div style="min-width:180px;">
              <strong>${dailyChartFullDates[index] ?? ""}</strong>
              ${rows}
            </div>
          `;
        },
      },
      toolbox: {
        feature: {
          dataView: {
            show: true,
            readOnly: false,
          },
          saveAsImage: {
            show: true,
            type: "png",
          },
        },
      },
      legend: {
        top: 0,
        textStyle: {
          color: chartTextColor,
          fontFamily: theme.typography.fontFamily,
        },
      },
      grid: {
        top: 56,
        left: 54,
        right: maxOfDailyData === null ? 54 : maxOfDailyData <= 999999 ? 54 : maxOfDailyData <= 999999999 ? 77 : 100,
        bottom: 72,
      },
      xAxis: {
        type: "category",
        data: dailyChartLabels,
        axisLine: {
          lineStyle: {
            color: chartGridColor,
          },
        },
        axisLabel: {
          color: chartTextColor,
        },
      },
      yAxis: [
        {
          type: "value",
          name: "Latency (μs)",
          nameTextStyle: {
            color: theme.palette.primary.main,
          },
          axisLabel: {
            color: theme.palette.primary.main,
          },
          splitLine: {
            lineStyle: {
              color: chartGridColor,
            },
          },
        },
        {
          type: "value",
          name: "Max Latency (μs)", // Distinct name for the right axis
          nameTextStyle: {
            color: "#ff4234",
          },
          axisLabel: {
            color: "#ff4234",
          },
          splitLine: {
            show: false, // Hide split lines for the second axis to avoid grid clutter
          },
        },
      ],
      dataZoom: [
        {
          type: "inside",
        },
        {
          type: "slider",
          height: 24,
          bottom: 24,
          borderColor: chartGridColor,
          textStyle: {
            color: chartTextColor,
          },
        },
      ],
      series: [
        /*{
          name: "Min",
          type: "line",
          data: dailyData.map((item) => item.min),
          smooth: true,
          symbolSize: 7,
          lineStyle: {
            width: 2,
          },
        },*/
        {
          name: "Median",
          type: "line",
          data: dailyData.map((item) => item.median),
          smooth: true,
          symbolSize: 7,
          lineStyle: {
            width: 3,
          },
          itemStyle: {
            color: theme.palette.primary.main,
          },
        },
        {
          name: "Average",
          type: "line",
          data: dailyData.map((item) => item.average),
          smooth: true,
          symbolSize: 7,
          lineStyle: {
            width: 3,
          },
          itemStyle: {
            color: "#a4e3f7",
          },
        },
        {
          name: "Max",
          type: "line",
          yAxisIndex: 1,
          data: dailyData.map((item) => item.max),
          smooth: true,
          symbolSize: 7,
          lineStyle: {
            width: 2,
          },
          itemStyle: {
            color: "#ff4234",
          },
        },
      ],
    }),
    [
      chartGridColor,
      chartTextColor,
      chartTooltipBackground,
      dailyData,
      dailyChartLabels,
      dailyChartFullDates,
      theme.palette.text.primary,
      theme.typography.fontFamily,
    ]
  );

  const minuteChartOption: EChartsOption = useMemo(() => {
    const minuteLabels = minuteData.map(
      (item) =>
        `${String(item.hour).padStart(2, "0")}:${String(item.minute).padStart(
          2,
          "0"
        )}`
    );

    return {
      color: [
        CHART_COLORS[5],
        CHART_COLORS[0],
        CHART_COLORS[2],
        CHART_COLORS[4],
      ],
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: chartTooltipBackground,
        borderColor: chartGridColor,
        textStyle: {
          color: theme.palette.text.primary,
          fontFamily: theme.typography.fontFamily,
        },
      },
      toolbox: {
        feature: {
          dataView: {
            show: true,
            readOnly: false,
          },
          saveAsImage: {
            show: true,
            type: "png",
          },
        },
      },
      legend: {
        top: 0,
        textStyle: {
          color: chartTextColor,
          fontFamily: theme.typography.fontFamily,
        },
      },
      grid: {
        top: 56,
        left: 56,
        right: maxOfDailyData === null ? 72 : maxOfDailyData <= 999999 ? 72 : maxOfDailyData <= 999999999 ? 95 : 118,
        bottom: 72,
      },
      xAxis: {
        type: "category",
        data: minuteLabels,
        axisLine: {
          lineStyle: {
            color: chartGridColor,
          },
        },
        axisLabel: {
          color: chartTextColor,
        },
      },
      yAxis: [
        {
          type: "value",
          name: "Latency (μs)",
          nameTextStyle: {
            color: theme.palette.primary.main,
          },
          axisLabel: {
            color: theme.palette.primary.main,
          },
          splitLine: {
            lineStyle: {
              color: chartGridColor,
            },
          },
        },
        {
          type: "value",
          name: "Max Latency (μs)", // Distinct name for the right axis
          nameTextStyle: {
            color: "#ff4234",
          },
          axisLabel: {
            color: "#ff4234",
          },
          splitLine: {
            show: false, // Hide split lines for the second axis to avoid grid clutter
          },
        },
      ],
      dataZoom: [
        {
          type: "inside",
        },
        {
          type: "slider",
          height: 24,
          bottom: 24,
          borderColor: chartGridColor,
          textStyle: {
            color: chartTextColor,
          },
        },
      ],
      series: [
        /*{
          name: "Min",
          type: "line",
          data: minuteData.map((item) => item.min),
          smooth: true,
          symbolSize: 5,
          lineStyle: {
            width: 2,
          },
        },*/
        {
          name: "Median",
          type: "line",
          data: minuteData.map((item) => item.median),
          smooth: true,
          symbolSize: 5,
          lineStyle: {
            width: 3,
          },
          itemStyle: {
            color: theme.palette.primary.main,
          },
        },
        {
          name: "Average",
          type: "line",
          data: minuteData.map((item) => item.average),
          smooth: true,
          symbolSize: 5,
          lineStyle: {
            width: 3,
          },
          itemStyle: {
            color: "#a4e3f7",
          },
        },
        {
          name: "Max",
          type: "line",
          yAxisIndex: 1,
          data: minuteData.map((item) => item.max),
          smooth: true,
          symbolSize: 5,
          lineStyle: {
            width: 2,
          },
          itemStyle: {
            color: "#ff4234",
          },
        },
      ],
    };
  }, [
    minuteData,
    chartGridColor,
    chartTextColor,
    chartTooltipBackground,
    theme.palette.text.primary,
    theme.typography.fontFamily,
  ]);

  return (
    <Box
      sx={{
        minHeight: "100vh",
        p: 0,
        bgcolor: "background.default",
      }}
    >
      <Stack spacing={2}>
        {/* Top bar: date range + dimension filters in one thin row */}
        <Paper
          sx={{
            p: 1.5,
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: "background.paper",
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onChange={handleDateRangeChange}
            isLoading={loading}
            isDisabled={false}
          />

          <MultiSelectFilter<Market>
            label="Markets"
            value={filters.markets}
            options={filterOptions.markets}
            disabled={filterOptionsLoading}
            onChange={(markets) =>
              setFilters((current) => ({ ...current, markets }))
            }
            size="small"
            compact
            sx={{ width: { xs: "calc(50% - 6px)", sm: 150 } }}
          />

          <MultiSelectFilter<Partition>
            label="Partitions"
            value={filters.partitions}
            options={filterOptions.partitions}
            disabled={filterOptionsLoading}
            onChange={(partitions) =>
              setFilters((current) => ({ ...current, partitions }))
            }
            size="small"
            compact
            sx={{ width: { xs: "calc(50% - 6px)", sm: 150 } }}
          />

          <MultiSelectFilter<Protocol>
            label="Protocols"
            value={filters.protocols}
            options={filterOptions.protocols}
            disabled={filterOptionsLoading}
            onChange={(protocols) =>
              setFilters((current) => ({ ...current, protocols }))
            }
            size="small"
            compact
            sx={{ width: { xs: "calc(50% - 6px)", sm: 150 } }}
          />

          <MultiSelectFilter<Location>
            label="Locations"
            value={filters.locations}
            options={filterOptions.locations}
            disabled={filterOptionsLoading}
            onChange={(locations) =>
              setFilters((current) => ({ ...current, locations }))
            }
            size="small"
            compact
            sx={{ width: { xs: "calc(50% - 6px)", sm: 150 } }}
          />

          {(loading || filterOptionsLoading) && (
            <CircularProgress size={18} sx={{ ml: "auto" }} />
          )}
        </Paper>

        {/* Range summary tiles */}
        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: {
              xs: "repeat(2, minmax(0, 1fr))",
              md: "repeat(4, minmax(0, 1fr))",
              xl: "repeat(8, minmax(0, 1fr))",
            },
          }}
        >
          <MetricCard
            title="Total Orders"
            value={compactFormatter.format(dailySummary.totalOrderCount)}
            subtitle={numberFormatter.format(dailySummary.totalOrderCount)}
            accent={CHART_COLORS[0]}
          />

          <MetricCard
            title="SLA Orders"
            value={compactFormatter.format(dailySummary.totalSlaOrderCount)}
            subtitle={numberFormatter.format(dailySummary.totalSlaOrderCount)}
            accent={CHART_COLORS[1]}
          />

          <MetricCard
            title="Avg SLA Ratio"
            value={formatPercent(dailySummary.avgSlaRatio)}
            subtitle={
              dailySummary.worstSlaDay
                ? `worst ${formatPercent(
                    dailySummary.worstSlaDay.slaRatio
                  )} · ${formatDateLabel(dailySummary.worstSlaDay.date)}`
                : undefined
            }
            accent={CHART_COLORS[3]}
          />

          <MetricCard
            title="Avg Latency"
            value={
              dailySummary.days > 0
                ? `${dailySummary.avgLatency.toFixed(0)} μs`
                : "—"
            }
            subtitle="mean of daily averages"
            accent={CHART_COLORS[2]}
          />

          <MetricCard
            title="Median Latency"
            value={
              dailySummary.days > 0
                ? `${dailySummary.avgMedianLatency.toFixed(0)} μs`
                : "—"
            }
            subtitle="mean of daily medians"
            accent={CHART_COLORS[6]}
          />

          <MetricCard
            title="Max Latency"
            value={
              dailySummary.maxDay
                ? `${compactFormatter.format(dailySummary.maxDay.max)} μs`
                : "—"
            }
            subtitle={
              dailySummary.maxDay
                ? `on ${formatDateLabel(dailySummary.maxDay.date)}`
                : undefined
            }
            tooltip={
              dailySummary.maxDay
                ? `${numberFormatter.format(dailySummary.maxDay.max)} μs`
                : undefined
            }
            accent={CHART_COLORS[5]}
          />

          <MetricCard
            title="Busiest Day"
            value={
              dailySummary.busiestDay
                ? formatDateLabel(dailySummary.busiestDay.date)
                : "—"
            }
            subtitle={
              dailySummary.busiestDay
                ? `${compactFormatter.format(
                    dailySummary.busiestDay.totalOrderCount
                  )} orders`
                : undefined
            }
            accent={CHART_COLORS[4]}
          />

          <MetricCard
            title="Trading Days"
            value={dailySummary.days > 0 ? String(dailySummary.days) : "—"}
            subtitle={`${filters.from} → ${filters.to}`}
            accent={CHART_COLORS[9]}
          />
        </Box>

        {errorMessage && (
          <Alert severity="error" variant="outlined">
            {errorMessage}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 12, lg: 12, xl: 6 }}>
            <Paper
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: "background.paper",
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                alignItems={{ xs: "flex-start", md: "center" }}
                justifyContent="space-between"
                spacing={1}
                mb={2}
              >
                <Box mb={2}>
                  <Typography variant="body2" color="text.secondary">
                    Order count values over time.
                  </Typography>
                </Box>
              </Stack>

              <Divider sx={{ mb: 2 }} />

              {loading && dailyData.length === 0 ? (
                <Box
                  sx={{
                    height: 420,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : dailyData.length === 0 ? (
                <Box
                  sx={{
                    height: 420,
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                  }}
                >
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      No data found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Change the filters and refresh the chart.
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <ReactECharts
                  ref={registerChart}
                  option={ordersAndSlaOption}
                  style={{ width: "100%", height: 430 }}
                  notMerge
                  lazyUpdate
                  onEvents={dailyChartEvents}
                />
              )}
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 12, lg: 12, xl: 6 }}>
            <Paper
              sx={{
                p: { xs: 2, md: 2.5 },
                borderRadius: 1,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: "background.paper",
              }}
            >
              <Box mb={2}>
                <Typography variant="body2" color="text.secondary">
                  Min, median, average and max latency values over time.
                </Typography>
              </Box>

              <Divider sx={{ mb: 2 }} />

              {loading && dailyData.length === 0 ? (
                <Box
                  sx={{
                    height: 420,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : dailyData.length === 0 ? (
                <Box
                  sx={{
                    height: 420,
                    display: "grid",
                    placeItems: "center",
                    textAlign: "center",
                  }}
                >
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                      No latency metrics available
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      The backend returned an empty array.
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <ReactECharts
                  ref={registerChart}
                  option={latencyDistributionOption}
                  style={{ width: "100%", height: 430 }}
                  notMerge
                  lazyUpdate
                />
              )}
            </Paper>
          </Grid>
        </Grid>

        <Paper
          sx={{
            p: { xs: 2, md: 2.5 },
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: "background.paper",
          }}
        >
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
            spacing={2}
            mb={2}
          >
            <Box>
              <Typography variant="body2" color="text.secondary">
                Latency statistics by minute
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} alignItems="center">
              <DateDayPicker
                selectedDate={selectedDate}
                onDateChange={handleDateDayChange}
                isLoading={minuteLoading}
                isDisabled={dailyData.length === 0}
              />
            </Stack>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {minuteErrorMessage && (
            <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>
              {minuteErrorMessage}
            </Alert>
          )}

          {minuteLoading && minuteData.length === 0 ? (
            <Box
              sx={{
                height: 390,
                display: "grid",
                placeItems: "center",
              }}
            >
              <CircularProgress />
            </Box>
          ) : !selectedDate ? (
            <Box
              sx={{
                height: 390,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
              }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  No day selected
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Click a day column above or select a date manually.
                </Typography>
              </Box>
            </Box>
          ) : minuteData.length === 0 ? (
            <Box
              sx={{
                height: 390,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
              }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  No data found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedDate}'s data is not available yet.
                </Typography>
              </Box>
            </Box>
          ) : (
            <ReactECharts
              ref={registerChart}
              option={minuteChartOption}
              style={{ width: "100%", height: 430 }}
              notMerge
              lazyUpdate
            />
          )}
        </Paper>
      </Stack>
    </Box>
  );
}