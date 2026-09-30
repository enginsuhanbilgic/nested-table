import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { DataGrid, GridSortModel, GridRenderCellParams } from "@mui/x-data-grid";
import {
    Box,
    Divider,
    Grid,
    MenuItem,
    Paper,
    Stack,
    Typography,
    Tooltip,
    IconButton,
    FormControl,
    InputLabel,
    Select,
    alpha,
    useTheme,
    SelectChangeEvent,
} from "@mui/material";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import VisibilityIcon from "@mui/icons-material/Visibility";
import type {
    Partition,
    Protocol,
    Location,
    UserLatencyFilterOptions,
    UserLatencyFilters,
    UserLatencyResponse,
} from "../types/latency";
import { MultiSelectFilter } from "../components/common/MultiSelectFilter";
import { getUserLatencyStats, getUserLatencyFilterOptions } from "../services/latencyService";
import {
    getDefaultToDate,
} from "../services/utilService";
import { CHART_COLORS } from "../theme/bistTheme";
import { DateDayPicker } from "../components/common/DateDayPicker";
import { useSidebar } from "../contexts/SidebarContext";
import { useChartResize } from "../hooks/useChartResize";
import { TextInputFilterWithDebounce } from "../components/common/TextInputFilterWithDebounce";

export function UserLatencyPage() {
    const theme = useTheme();
    const isDark = theme.palette.mode === "dark";

    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const { collapsed } = useSidebar();
    const { registerChart } = useChartResize(collapsed);

    const [filterOptions, setFilterOptions] = useState<UserLatencyFilterOptions>({
        locations: [],
        partitions: [],
        protocols: [],
    });

    const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);

    const [filters, setFilters] = useState<UserLatencyFilters>({
        locations: [],
        partitions: [],
        protocols: [],
        queryString: "",
        date: getDefaultToDate(),
    });

    const [paginationModel, setPaginationModel] = useState({
        page: 0,
        pageSize: 25,
    });
    const [sortModel, setSortModel] = useState<GridSortModel>([]);

    const [userLatencyData, setUserLatencyData] = useState<UserLatencyResponse>({
        content: [],
        page: 0,
        size: 0,
        totalElements: 0,
        totalPages: 0,
        first: false,
        last: false,
    });

    const filtersReady =
        filters.locations.length > 0 &&
        filters.partitions.length > 0 &&
        filters.protocols.length > 0;

    const fetchUserLatencyFilterOptions = useCallback(async () => {
        try {
            setFilterOptionsLoading(true);
            setErrorMessage(null);

            const options = await getUserLatencyFilterOptions();

            setFilterOptions(options);
            setFilters((current) => ({
                ...current,
                partitions: options.partitions.map((option) => option.id),
                protocols: options.protocols.map((option) => option.id),
                locations: options.locations.map((option) => option.id),
                queryString: "",
            }));
        } catch (error) {
            console.error(error);
            setErrorMessage("Could not load User Latency filter options");
        } finally {
            setFilterOptionsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchUserLatencyFilterOptions();
    }, [fetchUserLatencyFilterOptions]);

    const fetchUserLatencyStats = useCallback(async () => {
        if (filtersReady && (!filters.date)) {
            setErrorMessage("Please select a date to begin with.");
            return;
        }

        try {
            setLoading(true);
            setErrorMessage(null);

            const response = await getUserLatencyStats(filters, paginationModel, sortModel);

            setUserLatencyData(response);
        } catch (error) {
            console.error(error);
            setErrorMessage("Could not load User Latency statistics");
        } finally {
            setLoading(false);
        }
    }, [filters, filtersReady, paginationModel, sortModel]);

    useEffect(() => {
        if (filterOptionsLoading || !filtersReady) {
            return;
        }

        void fetchUserLatencyStats();
    }, [filterOptionsLoading, filtersReady, fetchUserLatencyStats, paginationModel, sortModel]);

    const handleDateDayChange = (date: string) => {
        setFilters((current) => ({ ...current, date }));
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
            page: Math.min(userLatencyData.totalPages - 1, prev.page + 1),
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
            page: 0, // reset to first page when page size changes
        }));
    };

    const columns = [
        {
            field: "actions",
            headerName: "",
            width: 55,
            sortable: false,
            filterable: false,
            disableColumnMenu: true,
            renderCell: (_params: GridRenderCellParams) => {
                return (
                    <Tooltip title="View details">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                e.stopPropagation();
                            }}
                        >
                            <VisibilityIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                );
            },
        },
        {
            field: "id",
            headerName: "ID",
            width: 70,
        },
        {
            field: "date",
            headerName: "Date",
            width: 180,
        },
        {
            field: "node",
            headerName: "Node",
            width: 120,
        },
        {
            field: "participantName",
            headerName: "Participant Name",
            width: 200,
        },
        /*{
            field: "noParticipant",
            headerName: "Participant No",
            width: 170,
        },*/
        {
            field: "username",
            headerName: "Username",
            width: 150,
        },
        {
            field: "partition",
            headerName: "Partition",
            width: 120,
        },
        {
            field: "process",
            headerName: "Process",
            width: 120,
        },
        {
            field: "location",
            headerName: "Location",
            width: 120,
        },
        {
            field: "protocol",
            headerName: "Protocol",
            width: 120,
        },
        /*{
            field: "noUser",
            headerName: "User No",
            width: 120,
        },*/
        {
            field: "noOrd",
            headerName: "Ord No",
            width: 120,
        },
        {
            field: "noOrdInVolatile",
            headerName: "Number of Orders",
            width: 170,
        },
        {
            field: "ratio",
            headerName: "Ratio",
            width: 90,
        },
        {
            field: "meMed",
            headerName: "ME Med",
            width: 100,
        },
        {
            field: "meAvg",
            headerName: "ME Avg",
            width: 100,
        },
        {
            field: "meMin",
            headerName: "ME Min",
            width: 100,
        },
        {
            field: "meMax",
            headerName: "ME Max",
            width: 100,
        },
        {
            field: "gwMed",
            headerName: "GW Med",
            width: 100,
        },
        {
            field: "gwAvg",
            headerName: "GW Avg",
            width: 100,
        },
        {
            field: "gwMin",
            headerName: "GW Min",
            width: 100,
        },
        {
            field: "gwMax",
            headerName: "GW Max",
            width: 100,
        },
    ];

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                p: 1,
            }}
        >
            <Stack
                sx={{
                    direction: "column",
                    alignItems: "center",
                    spacing: 1,
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
                        alignItems: "center", // Centers all top-level children vertically
                        justifyContent: "space-between",
                        gap: 2,
                    }}
                >
                    {/* Left Section: Date and Filters */}
                    <Box sx={{
                        display: "flex",
                        flexDirection: "row",
                        flexWrap: "wrap",
                        alignItems: "center", // Ensures Date and Filter group are centered relative to each other
                        gap: 2,
                        flexGrow: 1
                    }}>
                        {/* Date Picker - Always on the left */}
                        <Box sx={{ minWidth: "fit-content", display: "flex", alignItems: "center", gap: 1 }}>
                            <DateDayPicker
                                selectedDate={filters.date}
                                onDateChange={handleDateDayChange}
                                isLoading={loading}
                                isDisabled={false}
                            />
                            <TextInputFilterWithDebounce
                                onDebouncedChange={(q) => {
                                    setFilters((current) => ({ ...current, queryString: q }))
                                    setPaginationModel((current) =>
                                        current.page === 0 ? current : { ...current, page: 0 }
                                    )
                                }}
                            />
                        </Box>

                        {/* Filters Group - Replaced Grid with Box for better vertical alignment */}
                        <Box sx={{
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 2,
                            flexGrow: 1
                        }}>
                            <Box sx={{ width: { xs: "100%", sm: "220px" } }}>
                                <MultiSelectFilter<Partition>
                                    label="Partitions"
                                    value={filters.partitions}
                                    options={filterOptions.partitions}
                                    disabled={filterOptionsLoading}
                                    onChange={(partitions) => setFilters((current) => ({ ...current, partitions }))}
                                />
                            </Box>
                            <Box sx={{ width: { xs: "100%", sm: "200px" } }}>
                                <MultiSelectFilter<Protocol>
                                    label="Protocols"
                                    value={filters.protocols}
                                    options={filterOptions.protocols}
                                    disabled={filterOptionsLoading}
                                    onChange={(protocols) => setFilters((current) => ({ ...current, protocols }))}
                                />
                            </Box>
                            {/* Locations filter given more width to prevent overflow/wrapping */}
                            <Box sx={{ width: { xs: "100%", sm: "280px" } }}>
                                <MultiSelectFilter<Location>
                                    label="Locations"
                                    value={filters.locations}
                                    options={filterOptions.locations}
                                    disabled={filterOptionsLoading}
                                    onChange={(locations) => setFilters((current) => ({ ...current, locations }))}
                                />
                            </Box>
                        </Box>
                    </Box>

                    {/* Right Section: Pagination */}
                    <Box sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: 1,
                        flexWrap: "wrap",
                        minWidth: "fit-content"
                    }}>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <InputLabel id="rows-per-page-label">Rows</InputLabel>
                            <Select
                                labelId="rows-per-page-label"
                                label="Rows"
                                value={paginationModel.pageSize}
                                onChange={handlePageSizeChange}
                            >
                                {[25, 50, 75, 100].map((s) => (
                                    <MenuItem key={s} value={s}>{s} / page</MenuItem>
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

                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <InputLabel id="page-select-label">Page</InputLabel>
                            <Select
                                labelId="page-select-label"
                                label="Page"
                                value={Math.min(paginationModel.page + 1, userLatencyData.totalPages)}
                                onChange={handlePageSelectChange}
                                MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } }} }}
                            >
                                {Array.from({ length: userLatencyData.totalPages }, (_, i) => i + 1).map((p) => (
                                    <MenuItem key={p} value={p}>{p}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Typography variant="body2" color="text.secondary">
                            | {userLatencyData.totalPages}
                        </Typography>

                        <IconButton
                            onClick={handleNextPage}
                            disabled={paginationModel.page >= userLatencyData.totalPages - 1}
                            size="small"
                        >
                            <NavigateNextIcon />
                        </IconButton>
                    </Box>
                </Paper>

                <Paper
                    sx={{
                        flex: 1,
                        width: "100%",
                        minHeight: "100%",
                        overflow: "hidden",
                    }}
                >
                    <DataGrid
                        paginationMode="server"
                        rows={userLatencyData.content}
                        columns={columns}
                        rowCount={userLatencyData.totalElements}
                        loading={loading}
                        pageSizeOptions={[25, 50, 75, 100]}
                        paginationModel={paginationModel}
                        onPaginationModelChange={setPaginationModel}
                        sortingMode="server"
                        onSortModelChange={(newSortModel) => setSortModel(newSortModel)}
                        getRowId={(row) => row.id}
                        hideFooter
                        density="compact"
                        rowHeight={48}
                        columnHeaderHeight={48}
                        getRowClassName={(params) => params.indexRelativeToCurrentPage % 2 === 0 ? "row-even" : "row-odd"}
                        sx={{
                            width: "100%",
                            maxWidth: "100%",
                            minHeight: "100%",
                            height: "100%",
                            fontSize: "0.85rem",

                            "& .MuiDataGrid-columnHeaders": {
                                backgroundColor: "rgba(0,0,0,0.03)",
                                borderBottom: "1px solid rgba(0,0,0,0.12)",
                            },
                            "& .MuiDataGrid-columnHeaderTitle": {
                                fontWeight: 700,
                                fontSize: "0.9rem",
                            },

                            "& .row-even": {
                                backgroundColor: "rgba(0,0,0,0.025)",
                            },
                            "& .row-odd": {
                                backgroundColor: "rgba(0,0,0,0.065)",
                            },

                            "& .MuiDataGrid-cell": {
                                borderRight: "1px solid rgba(0,0,0,0.16)",
                            },

                            "& .MuiDataGrid-cell:focus": {
                                outline: "none",
                            },

                            "& .MuiDataGrid-row": {
                                cursor: "pointer",
                                transition: "transform 0.1s ease-in-out, background-color 0.2s ease",
                            },

                            "& .MuiDataGrid-row:hover": {
                                backgroundColor: "rgba(25, 118, 210, 0.15)",
                            },

                            "& .MuiDataGrid-row:active": {
                                transform: "scale(0.999)",
                                cursor: "grabbing",
                            },

                            "& .MuiDataGrid-row.Mui-selected": {
                                backgroundColor: "rgba(25, 118, 210, 0.3)",
                            },

                            "& .MuiDataGrid-row.Mui-selected:hover": {
                                backgroundColor: "rgba(25, 118, 210, 0.45)",
                            },
                        }}
                    />
                </Paper>
            </Stack>
        </Box>
    );
}
