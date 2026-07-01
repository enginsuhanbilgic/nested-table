import React from "react";
import { Box, Stack } from "@mui/material";
import { LocalizationProvider, DatePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

interface DateDayPickerProps {
  selectedDate: string | null;
  onDateChange: (date: string) => void;
  isLoading: boolean;
  isDisabled: boolean;
}

const dayLabels = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export function DateDayPicker({
  selectedDate,
  onDateChange,
  isLoading,
  isDisabled,
}: DateDayPickerProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={tr}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <DatePicker
          label="Select Date"
          dayOfWeekFormatter={(date) => dayLabels[date.getDay()]}
          value={selectedDate ? new Date(selectedDate) : null}
          onChange={(newValue) => {
            if (newValue) {
              const dateString = format(newValue, "yyyy-MM-dd");
              onDateChange(dateString);
            }
          }}
          disabled={isDisabled}
          reduceAnimations={true}
          slotProps={{
            textField: {
              size: "small",
              sx: { width: 190 },
              // Show loading state in the text field if necessary
              disabled: isLoading || isDisabled,
            },
            desktopTransition: { timeout: { appear: 80, enter: 80, exit: 50 } },
            mobileTransition: { timeout: { appear: 80, enter: 80, exit: 50 } },
          }}
        />
      </Stack>
    </LocalizationProvider>
  );
}
