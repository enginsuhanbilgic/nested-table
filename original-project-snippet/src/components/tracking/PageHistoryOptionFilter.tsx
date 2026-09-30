import { useCallback, useEffect, useState } from 'react';
import { Autocomplete, TextField } from '@mui/material';
import type { PageHistoryOption, PageHistoryOptionKind, UserPageHistoryFilterRequest } from '../../types/audit';
import { getPageHistoryOptions } from '../../services/analyticsService';
import { historyRangeError } from '../../services/pageHistoryUtils';
import { usePageHistoryQuery } from '../../hooks/usePageHistoryQuery';

interface Props {
  kind: PageHistoryOptionKind
  label: string
  filter: UserPageHistoryFilterRequest
  value: PageHistoryOption[]
  onChange: (options: PageHistoryOption[]) => void
  multiple?: boolean
}

export function PageHistoryOptionFilter({ kind, label, filter, value, onChange, multiple = false }: Props) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(input), 250);
    return () => window.clearTimeout(timer);
  }, [input]);
  // Exclude this control's own selection so replacing it remains possible.
  const queryFilter = { ...filter,
    ...(kind === 'users' ? { userId: undefined } : {}),
    ...(kind === 'pages' ? { pagePathExact: undefined } : {}),
    ...(kind === 'roles' ? { roleCodeIn: undefined } : {}),
  };
  const filterKey = JSON.stringify(queryFilter);
  const fetcher = useCallback((signal: AbortSignal) =>
    getPageHistoryOptions(JSON.parse(filterKey) as UserPageHistoryFilterRequest, kind, search, signal), [filterKey, kind, search]);
  const query = usePageHistoryQuery(`${filterKey}:${kind}:${search}`, fetcher, !historyRangeError(filter));
  const options = [...value, ...(query.data ?? []).filter(option => !value.some(selected => selected.id === option.id))];
  return <Autocomplete<PageHistoryOption, boolean, false, false>
    multiple={multiple} size="small" sx={{ minWidth: 230, flex: 1 }} options={options}
    value={multiple ? value : value[0] ?? null} loading={query.loading}
    filterOptions={items => items} getOptionLabel={option => option.label}
    isOptionEqualToValue={(a, b) => a.id === b.id}
    onInputChange={(_, next, reason) => { if (reason === 'input' || reason === 'clear') setInput(next); }}
    onChange={(_, next) => { onChange(Array.isArray(next) ? next : next ? [next] : []); setInput(''); }}
    noOptionsText="No matching recorded activity"
    renderInput={params => <TextField {...params} label={label} error={!!query.error}
      helperText={query.error ?? 'Search recorded activity (up to 50 matches)'} />}
  />;
}
