import React from 'react';
import {
    useTheme,
    Paper,
    Tooltip,
    Typography,
} from '@mui/material';

type MetricCardProps = {
    title: string;
    value: string;
    // Small always-visible line under the value (extra detail lives here,
    // not in a hover tooltip).
    subtitle?: string;
    // Meaning color, shown as a thin stripe on the left edge.
    accent?: string;
    // Optional hover detail (e.g. full-precision number).
    tooltip?: string;
};

export function MetricCard({
    title,
    value,
    subtitle,
    accent,
    tooltip,
}: MetricCardProps) {
    const theme = useTheme();
    const accentColor = accent ?? theme.palette.primary.main;

    const card = (
        <Paper
            variant="outlined"
            sx={{
                position: "relative",
                height: "100%",
                minWidth: 0,
                px: 1.5,
                py: 1,
                borderRadius: 1.5,
                bgcolor: "background.paper",
                overflow: "hidden",
                "&::before": {
                    content: '""',
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    bgcolor: accentColor,
                },
            }}
        >
            <Typography
                noWrap
                sx={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    lineHeight: 1.6,
                }}
            >
                {title}
            </Typography>

            <Typography
                noWrap
                sx={{
                    fontSize: 19,
                    fontWeight: 800,
                    lineHeight: 1.3,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {value}
            </Typography>

            {/* minHeight reserves the line so tiles keep equal heights
                even when a tile has no subtitle. */}
            <Typography
                noWrap
                sx={{
                    fontSize: 11,
                    color: "text.secondary",
                    lineHeight: 1.4,
                    minHeight: "16px",
                }}
            >
                {subtitle}
            </Typography>
        </Paper>
    );

    if (!tooltip) {
        return card;
    }

    return (
        <Tooltip title={tooltip} arrow placement="top">
            {card}
        </Tooltip>
    );
}
