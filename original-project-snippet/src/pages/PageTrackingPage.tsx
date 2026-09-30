import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, CircularProgress,
  Dialog, DialogContent, DialogTitle, DialogActions, Paper, Stack, Tab, Tabs, Table,
  TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel,
  TextField, Typography, useTheme,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { DateRangePicker } from '../components/common/DateRangePicker';
import { MetricCard } from '../components/common/MetricCard';
import { PageHistoryOptionFilter } from '../components/tracking/PageHistoryOptionFilter';
import { usePageHistoryQuery } from '../hooks/usePageHistoryQuery';
import { useSidebar } from '../contexts/SidebarContext';
import { useChartResize } from '../hooks/useChartResize';
import { CHART_COLORS } from '../theme/bistTheme';
import {
  getPageHistory, getPageHistoryActivity, getPageHistoryPages, getPageHistorySummary, getPageHistoryUsers,
} from '../services/analyticsService';
import { defaultHistoryFilters, formatHistoryTimestamp, historyRangeError } from '../services/pageHistoryUtils';
import type {
  PageHistoryOption, PageHistoryPage, PageHistoryUser, UserPageHistoryFilterRequest, UserPageHistoryResponse,
} from '../types/audit';
import type { PageResponse } from '../types/latency';

type Detail = { kind: 'pages'; result: PageResponse<PageHistoryPage> }
  | { kind: 'users'; result: PageResponse<PageHistoryUser> }
  | { kind: 'history'; result: PageResponse<UserPageHistoryResponse> };
type TabKind = Detail['kind'];
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const defaults: Record<TabKind, string> = { pages: 'visits,desc', users: 'visits,desc', history: 'visitTimestamp,desc' };

export function PageTrackingPage() {
  const theme = useTheme();
  const { collapsed } = useSidebar();
  const { registerChart } = useChartResize(collapsed);
  const [filter, setFilter] = useState(defaultHistoryFilters);
  const [draft, setDraft] = useState(filter);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);
  const [day, setDay] = useState<string>();
  const [tab, setTab] = useState<TabKind>('pages');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(25);
  const [sort, setSort] = useState(defaults.pages);
  const [visit, setVisit] = useState<UserPageHistoryResponse>();
  const filterKey = JSON.stringify(filter);
  const overviewKey = `${filterKey}:${revision}`;
  const invalid = historyRangeError(draft);
  const fetchOverview = useCallback(async (signal: AbortSignal) => {
    const [summary, daily, topPages] = await Promise.all([
      getPageHistorySummary(filter, signal), getPageHistoryActivity(filter, undefined, signal),
      getPageHistoryPages(filter, { page: 0, size: 10, sort: 'visits,desc' }, signal),
    ]);
    return { summary, daily, topPages: topPages.content };
  }, [filter]);
  const overview = usePageHistoryQuery(overviewKey, fetchOverview);
  const fetchHourly = useCallback((signal: AbortSignal) => getPageHistoryActivity(filter, day, signal), [filter, day]);
  const hourly = usePageHistoryQuery(`${overviewKey}:${day}`, fetchHourly, !!day);
  const fetchDetail = useCallback(async (signal: AbortSignal): Promise<Detail> => {
    const paging = { page, size, sort };
    switch (tab) {
      case 'pages': return { kind: tab, result: await getPageHistoryPages(filter, paging, signal) };
      case 'users': return { kind: tab, result: await getPageHistoryUsers(filter, paging, signal) };
      case 'history': return { kind: tab, result: await getPageHistory(filter, paging, signal) };
    }
  }, [filter, page, size, sort, tab]);
  const detail = usePageHistoryQuery(`${overviewKey}:${tab}:${page}:${size}:${sort}`, fetchDetail);

  function apply(next: UserPageHistoryFilterRequest) {
    setFilter(next); setDraft(next); setPage(0); setDay(undefined); setVisit(undefined); setRevision(r => r + 1);
  }
  function remember(options: PageHistoryOption[]) {
    setLabels(current => ({ ...current, ...Object.fromEntries(options.map(o => [o.id, o.label])) }));
  }
  const options = (ids: string[]) => ids.map(id => ({ id, label: labels[id] ?? id }));
  function selectUser(user: PageHistoryUser | UserPageHistoryResponse) {
    remember([{ id: user.userId, label: user.username ?? user.userId }]);
    apply({ ...filter, userId: user.userId });
  }
  function selectPage(path: string) { apply({ ...filter, pagePathExact: path }); }

  const chartBase: EChartsOption = {
    color: CHART_COLORS, backgroundColor: 'transparent',
    textStyle: { color: theme.palette.text.secondary, fontFamily: theme.typography.fontFamily },
    tooltip: { trigger: 'axis', renderMode: 'richText' },
    legend: { textStyle: { color: theme.palette.text.secondary } },
    grid: { left: 55, right: 25, top: 45, bottom: 65 },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: theme.palette.divider } } },
  };
  const dailyChart: EChartsOption = {
    ...chartBase,
    xAxis: { type: 'category', data: overview.data?.daily.map(row => row.bucket) ?? [] },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 5 }],
    series: [
      { name: 'Recorded visits', type: 'bar', data: overview.data?.daily.map(row => row.visits) ?? [] },
      { name: 'Unique users', type: 'line', data: overview.data?.daily.map(row => row.uniqueUsers) ?? [] },
    ],
  };
  const hourlyChart: EChartsOption = {
    ...chartBase, xAxis: { type: 'category', data: hourly.data?.map(row => `${row.bucket}:00`) ?? [] },
    series: [
      { name: 'Recorded visits', type: 'bar', data: hourly.data?.map(row => row.visits) ?? [] },
      { name: 'Unique users', type: 'line', data: hourly.data?.map(row => row.uniqueUsers) ?? [] },
    ],
  };
  const topChart: EChartsOption = {
    ...chartBase, grid: { left: 15, right: 45, top: 15, bottom: 20, containLabel: true }, legend: { show: false },
    tooltip: { trigger: 'axis', renderMode: 'richText', formatter: (params: unknown) => {
      const point: unknown = Array.isArray(params) ? params[0] : params;
      const index = typeof point === 'object' && point !== null && 'dataIndex' in point ? Number(point.dataIndex) : -1;
      const item = overview.data?.topPages[index];
      return item ? `${item.pagePath}\nRecorded visits: ${number.format(item.visits)}\nUnique users: ${number.format(item.uniqueUsers)}\nShare: ${number.format(item.sharePercent)}%` : '';
    } },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', inverse: true, data: overview.data?.topPages.map(row => row.pagePath) ?? [],
      axisLabel: { width: 210, overflow: 'truncate' } },
    series: [{ name: 'Recorded visits', type: 'bar', data: overview.data?.topPages.map(row => row.visits) ?? [],
      label: { show: true, position: 'right', color: theme.palette.text.secondary } }],
  };
  function heading(label: string, field?: string) {
    const [active, direction] = sort.split(',');
    return <TableCell key={label}>{field ? <TableSortLabel active={active === field}
      direction={active === field && direction === 'asc' ? 'asc' : 'desc'} onClick={() => {
        setSort(`${field},${active === field && direction === 'desc' ? 'asc' : 'desc'}`); setPage(0);
      }}>{label}</TableSortLabel> : label}</TableCell>;
  }
  function row(key: string | number, cells: ReactNode[]) {
    return <TableRow key={key} hover>{cells.map((cell, i) => <TableCell key={i} sx={{ overflowWrap: 'anywhere' }}>{cell}</TableCell>)}</TableRow>;
  }
  const headers = tab === 'pages'
    ? [heading('Page', 'pagePath'), heading('Visits', 'visits'), heading('Unique users', 'uniqueUsers'), heading('Share'), heading('Last visit', 'lastVisit')]
    : tab === 'users' ? [heading('User', 'username'), heading('Visits', 'visits'), heading('Pages visited', 'uniquePages'), heading('Last visit', 'lastVisit')]
      : [heading('Time (Istanbul)', 'visitTimestamp'), heading('User', 'username'), heading('Page', 'pagePath'), heading('Referrer'), heading('Details')];

  return <Stack spacing={2}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
      <Box><Typography variant="h5">Page Visit Analytics</Typography>
        <Typography variant="body2" color="text.secondary">Recorded authenticated page visits · Europe/Istanbul</Typography></Box>
      <Button variant="outlined" onClick={() => setRevision(r => r + 1)}>Refresh</Button>
    </Box>
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <DateRangePicker from={draft.from} to={draft.to} isLoading={false} isDisabled={false}
          onChange={(from, to) => setDraft(current => ({ ...current, from, to }))} />
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <PageHistoryOptionFilter kind="users" label="User" filter={draft} value={options(draft.userId ? [draft.userId] : [])}
            onChange={values => { remember(values); setDraft(d => ({ ...d, userId: values[0]?.id })); }} />
          <PageHistoryOptionFilter kind="roles" label="Current roles (any)" multiple filter={draft} value={options(draft.roleCodeIn ?? [])}
            onChange={values => setDraft(d => ({ ...d, roleCodeIn: values.map(v => v.id) }))} />
          <PageHistoryOptionFilter kind="pages" label="Exact page path" filter={draft} value={options(draft.pagePathExact ? [draft.pagePathExact] : [])}
            onChange={values => setDraft(d => ({ ...d, pagePathExact: values[0]?.id }))} />
        </Box>
        <Accordion disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>Advanced filters</AccordionSummary>
          <AccordionDetails sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            {(['pagePath', 'pageTitle', 'referrer', 'userAgent'] as const).map((key, index) =>
              <TextField key={key} size="small" label={['Path contains', 'Title contains', 'Referrer contains', 'User agent contains'][index]}
                value={draft[key] ?? ''} onChange={event => setDraft(d => ({ ...d, [key]: event.target.value || undefined }))} />)}
          </AccordionDetails>
        </Accordion>
        {invalid && <Alert severity="warning">{invalid}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" disabled={!!invalid} onClick={() => apply(draft)}>Apply filters</Button>
          <Button onClick={() => apply(defaultHistoryFilters())}>Reset</Button>
        </Stack>
      </Stack>
    </Paper>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      <Chip label={`${filter.from} → ${filter.to} · Istanbul`} />
      {Object.entries(filter).filter(([key, value]) => !['from', 'to'].includes(key) && value && (!Array.isArray(value) || value.length))
        .map(([key, value]) => <Chip key={key} label={`${({ userId: 'User', roleCodeIn: 'Current roles', pagePathExact: 'Page', pagePath: 'Path contains', pageTitle: 'Title contains', referrer: 'Referrer', userAgent: 'User agent' } as Record<string, string>)[key]}: ${Array.isArray(value) ? value.join(', ') : labels[String(value)] ?? value}`}
          onDelete={() => apply({ ...filter, [key]: undefined })} />)}
    </Box>
    {overview.loading && <Box role="status" sx={{ p: 3 }}><CircularProgress size={24} aria-label="Loading overview" /></Box>}
    {overview.error && <Alert severity="error" action={<Button onClick={() => setRevision(r => r + 1)}>Retry</Button>}>{overview.error}</Alert>}
    {overview.data && <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <MetricCard title="Recorded visits" value={number.format(overview.data.summary.visits)} subtitle="In the selected period" />
        <MetricCard title="Unique users" value={number.format(overview.data.summary.uniqueUsers)} subtitle="Distinct user IDs" />
        <MetricCard title="Pages visited" value={number.format(overview.data.summary.uniquePages)} subtitle="Distinct page paths" />
        <MetricCard title="Visits per user" value={number.format(overview.data.summary.visitsPerUser)} subtitle="Recorded visits / unique users" />
      </Box>
      {overview.data.summary.visits === 0 ? <Alert severity="info">No recorded visits match these filters.</Alert> : <>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6">Daily activity</Typography>
          <Typography variant="body2" color="text.secondary">Click a day or use the date field to see its hourly activity.</Typography>
          <ReactECharts ref={registerChart} option={dailyChart} notMerge style={{ height: 310 }}
            onEvents={{ click: (event: { dataIndex: number }) => setDay(overview.data?.daily[event.dataIndex]?.bucket) }} />
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <TextField type="date" size="small" label="Inspect day" value={day ?? ''} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: filter.from, max: filter.to } }}
              onChange={event => { const next = event.target.value; if (!next || (next >= filter.from && next <= filter.to)) setDay(next || undefined); }} />
            {day && <Button onClick={() => setDay(undefined)}>Close hourly view</Button>}
          </Stack>
          {day && <Box sx={{ mt: 2 }}><Typography variant="subtitle1">Hourly activity · {day}</Typography>
            {hourly.loading && <CircularProgress size={24} aria-label="Loading hourly activity" />}
            {hourly.error && <Alert severity="error">{hourly.error}</Alert>}
            {hourly.data && <ReactECharts ref={registerChart} option={hourlyChart} notMerge style={{ height: 260 }} />}
          </Box>}
        </Paper>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="h6">Most visited pages</Typography>
          <Typography variant="body2" color="text.secondary">Top 10 by recorded visits. Select a bar to filter by its exact path.</Typography>
          <ReactECharts ref={registerChart} option={topChart} notMerge style={{ height: Math.max(220, overview.data.topPages.length * 38) }}
            onEvents={{ click: (event: { dataIndex: number }) => { const path = overview.data?.topPages[event.dataIndex]?.pagePath; if (path) selectPage(path); } }} />
        </Paper>
      </>}
    </>}
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Tabs value={tab} onChange={(_, next: TabKind) => { setTab(next); setPage(0); setSort(defaults[next]); }} aria-label="Analytics details">
        <Tab value="pages" label="Pages" /><Tab value="users" label="Users" /><Tab value="history" label="Visit history" />
      </Tabs>
      {detail.loading && <Box role="status" sx={{ p: 3 }}><CircularProgress size={24} aria-label="Loading detail table" /></Box>}
      {detail.error && <Alert severity="error" action={<Button onClick={() => setRevision(r => r + 1)}>Retry</Button>}>{detail.error}</Alert>}
      {detail.data && <>
        <TableContainer><Table size="small" aria-label={`${tab} analytics`}>
          <TableHead><TableRow>{headers}</TableRow></TableHead>
          <TableBody>
            {detail.data.kind === 'pages' && detail.data.result.content.map(item => row(item.pagePath, [
              <Box><Button sx={{ textTransform: 'none', justifyContent: 'flex-start' }} onClick={() => selectPage(item.pagePath)}>{item.pageTitle || item.pagePath}</Button><Typography variant="caption" sx={{ display: 'block' }}>{item.pagePath}</Typography></Box>,
              number.format(item.visits), number.format(item.uniqueUsers), `${number.format(item.sharePercent)}%`, formatHistoryTimestamp(item.lastVisit),
            ]))}
            {detail.data.kind === 'users' && detail.data.result.content.map(item => row(item.userId, [
              <Button sx={{ textTransform: 'none' }} onClick={() => selectUser(item)}>{item.username}</Button>, number.format(item.visits), number.format(item.uniquePages), formatHistoryTimestamp(item.lastVisit),
            ]))}
            {detail.data.kind === 'history' && detail.data.result.content.map(item => row(item.id, [
              formatHistoryTimestamp(item.visitTimestamp), <Button sx={{ textTransform: 'none' }} onClick={() => selectUser(item)}>{item.username ?? item.userId}</Button>,
              <Box><Button sx={{ textTransform: 'none' }} onClick={() => selectPage(item.pagePath)}>{item.pageTitle || item.pagePath}</Button><Typography variant="caption" sx={{ display: 'block' }}>{item.pagePath}</Typography></Box>,
              <Typography variant="body2" noWrap sx={{ maxWidth: 220 }} title={item.referrer ?? ''}>{item.referrer || 'Unknown / direct'}</Typography>,
              <Button onClick={() => setVisit(item)}>View details</Button>,
            ]))}
            {detail.data.result.content.length === 0 && <TableRow><TableCell colSpan={headers.length}>No results match these filters.</TableCell></TableRow>}
          </TableBody>
        </Table></TableContainer>
        <TablePagination component="div" count={detail.data.result.totalElements} page={page} rowsPerPage={size} rowsPerPageOptions={[10, 25, 50, 100]}
          onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={event => { setSize(Number(event.target.value)); setPage(0); }} />
      </>}
    </Paper>
    <Typography variant="caption" color="text.secondary">Roles reflect current assignments. Page visits do not measure time spent, sessions, or currently online users. Last visit is within the selected period.</Typography>
    <Dialog open={!!visit} onClose={() => setVisit(undefined)} fullWidth maxWidth="sm">
      <DialogTitle>Recorded visit</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ overflowWrap: 'anywhere' }}>{visit && <>
        <Typography>{visit.username} · {formatHistoryTimestamp(visit.visitTimestamp)} (Istanbul)</Typography>
        <Typography><strong>Page:</strong> {visit.pageTitle || 'Untitled'}<br />{visit.pagePath}</Typography>
        <Typography><strong>Referrer:</strong> {visit.referrer || 'Unknown / direct'}</Typography>
        <Typography><strong>User agent:</strong> {visit.userAgent || 'Unknown'}</Typography>
      </>}</Stack></DialogContent>
      <DialogActions><Button onClick={() => setVisit(undefined)}>Close</Button></DialogActions>
    </Dialog>
  </Stack>;
}
