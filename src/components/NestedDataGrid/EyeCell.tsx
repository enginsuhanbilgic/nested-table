import { IconButton, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';

interface Props {
  shown: boolean;
  /** Chart line color for this row when shown — tints the eye to match its series. */
  color?: string;
  onToggle: () => void;
}

/** Eye toggle that adds/removes this row's series from the chart. */
export function EyeCell({ shown, color, onToggle }: Props) {
  return (
    <Tooltip title={shown ? 'Hide from chart' : 'Show on chart'} disableInteractive>
      <IconButton
        size="small"
        aria-label={shown ? 'hide from chart' : 'show on chart'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        sx={(theme) => {
          const activeColor = color ?? theme.palette.primary.main;
          return {
            color: shown ? activeColor : 'action.disabled',
            bgcolor: shown ? alpha(activeColor, 0.12) : 'transparent',
            '&:hover': {
              color: shown ? activeColor : 'text.secondary',
              bgcolor: shown ? alpha(activeColor, 0.18) : 'action.hover',
            },
          };
        }}
      >
        {shown ? <VisibilityIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}
