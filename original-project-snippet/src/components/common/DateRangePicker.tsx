import React from 'react';
import { Box, Button, Stack, Typography, Divider } from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { subDays, format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface DateRangePickerProps {
    from: string;
    to: string;
    onChange: (from: string, to: string) => void;
    isLoading: boolean;
    isDisabled: boolean;
}

const dayLabels = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export function DateRangePicker({ from, to, onChange, isLoading, isDisabled }: DateRangePickerProps) {

    const handlePreset = (days: number) => {
        const today = new Date();
        const startDate = subDays(today, days);

        const fromStr = format(startDate, 'yyyy-MM-dd');
        const toStr = format(today, 'yyyy-MM-dd');

        onChange(fromStr, toStr);
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={tr}>
            {/* width auto so the picker only claims its natural width and
                other filter-bar controls can share the same line. */}
            <Stack spacing={2} sx={{ width: 'auto' }}>
                {/* One line on desktop; allowed to wrap below md so narrow
                    windows don't overflow horizontally. */}
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap' }}>
                        <Button variant="outlined" size="small" sx={{ whiteSpace: 'nowrap' }} onClick={() => handlePreset(6)}>Last 7 Days</Button>
                        <Button variant="outlined" size="small" sx={{ whiteSpace: 'nowrap' }} onClick={() => handlePreset(29)}>Last 30 Days</Button>
                        <Button variant="outlined" size="small" sx={{ whiteSpace: 'nowrap' }} onClick={() => handlePreset(89)}>Last 90 Days</Button>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap' }}>
                        <DatePicker
                            label="From Date"
                            value={from ? new Date(from) : null}
                            dayOfWeekFormatter={(date) => dayLabels[date.getDay()]}
                            onChange={(newValue) => {
                                const dateString = newValue ? format(newValue, 'yyyy-MM-dd') : '';
                                onChange(dateString, to);
                            }}
                            reduceAnimations={true}
                            disabled={isDisabled}
                            slotProps={{
                                textField: {
                                    size: 'small',
                                    sx: {
                                        width: 140,
                                    },
                                    disabled: isLoading || isDisabled
                                },
                                desktopTransition: {
                                    timeout: {
                                        appear: 80,
                                        enter: 80,
                                        exit: 50,
                                    }
                                },
                                mobileTransition: {
                                    timeout: {
                                        appear: 80,
                                        enter: 80,
                                        exit: 50,
                                    }
                                }
                            }}
                        />
                        <DatePicker
                            label="To Date"
                            value={to ? new Date(to) : null}
                            onChange={(newValue) => {
                                const dateString = newValue ? format(newValue, 'yyyy-MM-dd') : '';
                                onChange(from, dateString);
                            }}
                            minDate={from ? new Date(from) : undefined}
                            reduceAnimations={true}
                            disabled={isDisabled}
                            slotProps={{
                                textField: {
                                    size: 'small',
                                    sx: {
                                        width: 140,
                                    },
                                    disabled: isLoading || isDisabled
                                },
                                desktopTransition: {
                                    timeout: {
                                        appear: 80,
                                        enter: 80,
                                        exit: 50,
                                    }
                                },
                                mobileTransition: {
                                    timeout: {
                                        appear: 80,
                                        enter: 80,
                                        exit: 50,
                                    }
                                }
                            }}
                        />
                    </Box>
                </Box>
            </Stack>
        </LocalizationProvider>
    );
}
