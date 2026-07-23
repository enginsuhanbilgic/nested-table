import {
    FormControl,
    InputLabel,
    MenuItem,
    OutlinedInput,
    Select,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type { LatencyFilterOption } from '../../types/latency';

type SingleSelectFilterProps<T extends string> = {
    label: string;
    value: T;
    options: LatencyFilterOption<T>[];
    onChange: (nextValue: T) => void;
    disabled?: boolean;
    // Styles the root FormControl; use it to size the filter per page,
    // e.g. sx={{ width: 140 }} or sx={{ width: { xs: '100%', sm: 180 } }}.
    sx?: SxProps<Theme>;
};

export function SingleSelectFilter<T extends string>({
    label,
    value,
    options,
    onChange,
    disabled = false,
    sx,
}: SingleSelectFilterProps<T>) {
    return (
        <FormControl fullWidth size="small" disabled={disabled} sx={sx}>
            <InputLabel>{label}</InputLabel>

            <Select
                value={value}
                label={label}
                input={<OutlinedInput label={label} />}
                onChange={(event) => {
                    const selectedValue = event.target.value as T;
                    onChange(selectedValue);
                }}
            >
                {options.map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                        {option.label}
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    );
}
