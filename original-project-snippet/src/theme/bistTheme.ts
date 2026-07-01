import {
  alpha,
  createTheme,
  type PaletteMode,
  type ThemeOptions,
} from "@mui/material/styles";
import type {} from "@mui/x-data-grid/themeAugmentation";

export const BIST_COLORS = {
  turquoise: "#009FC3",
  turquoiseDark: "#007A96",
  turquoiseLight: "#33B5D0",
  skyBlue: "#B6DDE8",
  skyBlueDark: "#88BFCE",
  ink: "#0B1220",
  slate: "#334155",
  surface: "#FFFFFF",
  canvas: "#F5F7FA",
  darkCanvas: "#07111C",
  darkSurface: "#0D1B2A",
  darkSurfaceRaised: "#102438",
  up: "#16A34A",
  down: "#DC2626",
  warning: "#D97706",
  amber: "#F59E0B",
} as const;

export const CHART_COLORS = [
  BIST_COLORS.turquoise,
  BIST_COLORS.turquoiseDark,
  BIST_COLORS.skyBlueDark,
  BIST_COLORS.up,
  BIST_COLORS.warning,
  BIST_COLORS.down,
];

const getDesignTokens = (mode: PaletteMode) => {
  const isDark = mode === "dark";

  return {
    palette: {
      mode,
      primary: {
        main: BIST_COLORS.turquoise,
        dark: BIST_COLORS.turquoiseDark,
        light: BIST_COLORS.turquoiseLight,
        contrastText: "#FFFFFF",
      },
      secondary: {
        main: BIST_COLORS.skyBlueDark,
        dark: "#5FAABD",
        light: BIST_COLORS.skyBlue,
        contrastText: BIST_COLORS.ink,
      },
      success: {
        main: BIST_COLORS.up,
      },
      error: {
        main: BIST_COLORS.down,
      },
      warning: {
        main: BIST_COLORS.warning,
      },
      info: {
        main: BIST_COLORS.turquoise,
      },
      background: {
        default: isDark ? BIST_COLORS.darkCanvas : BIST_COLORS.canvas,
        paper: isDark ? BIST_COLORS.darkSurface : BIST_COLORS.surface,
      },
      text: {
        primary: isDark ? "#E6EDF5" : "#0F172A",
        secondary: isDark ? "#9FB0C1" : "#64748B",
      },
      divider: isDark
        ? "rgba(226, 232, 240, 0.10)"
        : "rgba(15, 23, 42, 0.10)",
      action: {
        hover: isDark
          ? "rgba(255,255,255,0.06)"
          : "rgba(15,23,42,0.04)",
        selected: isDark
          ? "rgba(0,159,195,0.16)"
          : "rgba(0,159,195,0.10)",
        disabledBackground: isDark
          ? "rgba(255,255,255,0.08)"
          : "rgba(15,23,42,0.06)",
      },
    },
    shape: {
      borderRadius: 6,
    },
    typography: {
      fontFamily: [
        "Inter",
        "ui-sans-serif",
        "system-ui",
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI",
        "sans-serif",
      ].join(","),
      h1: { fontWeight: 800, letterSpacing: "-0.04em" },
      h2: { fontWeight: 800, letterSpacing: "-0.035em" },
      h3: { fontWeight: 800, letterSpacing: "-0.03em" },
      h4: { fontWeight: 800, letterSpacing: "-0.025em" },
      h5: { fontWeight: 800, letterSpacing: "-0.02em" },
      h6: { fontWeight: 800, letterSpacing: "-0.015em" },
      button: { fontWeight: 700, textTransform: "none" as const },
    },
    shadows: [
      "none",
      isDark
        ? "0 1px 2px rgba(0,0,0,0.32)"
        : "0 1px 2px rgba(15,23,42,0.06)",
      isDark
        ? "0 4px 12px rgba(0,0,0,0.34)"
        : "0 6px 16px rgba(15,23,42,0.08)",
      isDark
        ? "0 8px 22px rgba(0,0,0,0.36)"
        : "0 10px 24px rgba(15,23,42,0.10)",
      isDark
        ? "0 12px 30px rgba(0,0,0,0.38)"
        : "0 16px 32px rgba(15,23,42,0.12)",
      isDark
        ? "0 16px 38px rgba(0,0,0,0.40)"
        : "0 20px 44px rgba(15,23,42,0.14)",
      isDark
        ? "0 20px 48px rgba(0,0,0,0.42)"
        : "0 24px 52px rgba(15,23,42,0.15)",
      isDark
        ? "0 24px 58px rgba(0,0,0,0.44)"
        : "0 28px 60px rgba(15,23,42,0.16)",
      isDark
        ? "0 28px 68px rgba(0,0,0,0.46)"
        : "0 32px 70px rgba(15,23,42,0.18)",
      isDark
        ? "0 32px 78px rgba(0,0,0,0.48)"
        : "0 36px 80px rgba(15,23,42,0.20)",
      isDark
        ? "0 36px 88px rgba(0,0,0,0.50)"
        : "0 40px 90px rgba(15,23,42,0.22)",
      isDark
        ? "0 40px 98px rgba(0,0,0,0.52)"
        : "0 44px 100px rgba(15,23,42,0.24)",
      isDark
        ? "0 44px 108px rgba(0,0,0,0.54)"
        : "0 48px 110px rgba(15,23,42,0.26)",
      isDark
        ? "0 48px 118px rgba(0,0,0,0.56)"
        : "0 52px 120px rgba(15,23,42,0.28)",
      isDark
        ? "0 52px 128px rgba(0,0,0,0.58)"
        : "0 56px 130px rgba(15,23,42,0.30)",
      isDark
        ? "0 56px 138px rgba(0,0,0,0.60)"
        : "0 60px 140px rgba(15,23,42,0.32)",
      isDark
        ? "0 60px 148px rgba(0,0,0,0.62)"
        : "0 64px 150px rgba(15,23,42,0.34)",
      isDark
        ? "0 64px 158px rgba(0,0,0,0.64)"
        : "0 68px 160px rgba(15,23,42,0.36)",
      isDark
        ? "0 68px 168px rgba(0,0,0,0.66)"
        : "0 72px 170px rgba(15,23,42,0.38)",
      isDark
        ? "0 72px 178px rgba(0,0,0,0.68)"
        : "0 76px 180px rgba(15,23,42,0.40)",
      isDark
        ? "0 76px 188px rgba(0,0,0,0.70)"
        : "0 80px 190px rgba(15,23,42,0.42)",
      isDark
        ? "0 80px 198px rgba(0,0,0,0.72)"
        : "0 84px 200px rgba(15,23,42,0.44)",
      isDark
        ? "0 84px 208px rgba(0,0,0,0.74)"
        : "0 88px 210px rgba(15,23,42,0.46)",
      isDark
        ? "0 88px 218px rgba(0,0,0,0.76)"
        : "0 92px 220px rgba(15,23,42,0.48)",
      isDark
        ? "0 92px 228px rgba(0,0,0,0.78)"
        : "0 96px 230px rgba(15,23,42,0.50)",
    ] as ThemeOptions["shadows"],
  };
};

export const createBistTheme = (mode: PaletteMode) => {
  const tokens = getDesignTokens(mode);
  const theme = createTheme(tokens);
  const isDark = mode === "dark";

  return createTheme(theme, {
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "*": {
            boxSizing: "border-box",
          },
          html: {
            height: "100%",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          },
          body: {
            minHeight: "100%",
            backgroundColor: theme.palette.background.default,
          },
          "#root": {
            minHeight: "100vh",
          },
          "::selection": {
            backgroundColor: alpha(theme.palette.primary.main, 0.24),
          },
          "*::-webkit-scrollbar": {
            width: 10,
            height: 10,
          },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: isDark
              ? "rgba(255,255,255,0.20)"
              : "rgba(15,23,42,0.22)",
            borderRadius: 999,
            border: `2px solid ${theme.palette.background.default}`,
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            border: `1px solid ${theme.palette.divider}`,
            backgroundImage: "none",
            boxShadow: theme.shadows[1],
          },
        },
      },
      MuiAppBar: {
        defaultProps: {
          color: "transparent",
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: "none",
            backdropFilter: "blur(18px)",
            borderBottom: `1px solid ${theme.palette.divider}`,
          },
        },
      },
      MuiToolbar: {
        styleOverrides: {
          root: {
            minHeight: 68,
            paddingLeft: theme.spacing(3),
            paddingRight: theme.spacing(3),
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: "none",
            borderRight: `1px solid ${theme.palette.divider}`,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 12,
            minHeight: 38,
          },
          containedPrimary: {
            boxShadow: `0 10px 22px ${alpha(
              theme.palette.primary.main,
              0.24,
            )}`,
            "&:hover": {
              boxShadow: `0 12px 28px ${alpha(
                theme.palette.primary.main,
                0.30,
              )}`,
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            color: theme.palette.text.secondary,
            "&:hover": {
              color: theme.palette.text.primary,
              backgroundColor: theme.palette.action.hover,
            },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            marginInline: theme.spacing(1),
            marginBlock: 2,
            minHeight: 44,
            color: theme.palette.text.secondary,
            "& .MuiListItemIcon-root": {
              color: "inherit",
              minWidth: 38,
            },
            "&.Mui-selected": {
              color: theme.palette.primary.main,
              backgroundColor: alpha(
                theme.palette.primary.main,
                isDark ? 0.16 : 0.10,
              ),
              "&:hover": {
                backgroundColor: alpha(
                  theme.palette.primary.main,
                  isDark ? 0.20 : 0.14,
                ),
              },
            },
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 16,
            boxShadow: theme.shadows[8],
            backgroundImage: "none",
          },
          list: {
            padding: theme.spacing(1),
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            minHeight: 40,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            fontWeight: 700,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 10,
            fontWeight: 600,
            backgroundColor: isDark ? "#E6EDF5" : "#0F172A",
            color: isDark ? "#0F172A" : "#FFFFFF",
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: isDark
              ? alpha("#FFFFFF", 0.025)
              : alpha("#FFFFFF", 0.70),
            "& fieldset": {
              borderColor: theme.palette.divider,
            },
            "&:hover fieldset": {
              borderColor: alpha(theme.palette.primary.main, 0.42),
            },
            "&.Mui-focused fieldset": {
              borderWidth: 1,
            },
          },
        },
      },
      MuiDataGrid: {
        defaultProps: {
          disableRowSelectionOnClick: true,
          rowHeight: 52,
          columnHeaderHeight: 46,
        },
        styleOverrides: {
          root: {
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 16,
            backgroundColor: theme.palette.background.paper,
            overflow: "hidden",
            "--DataGrid-rowBorderColor": theme.palette.divider,
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: isDark
                ? alpha("#FFFFFF", 0.035)
                : alpha("#F1F5F9", 0.90),
              color: theme.palette.text.secondary,
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontWeight: 800,
            },
            "& .MuiDataGrid-cell": {
              borderColor: theme.palette.divider,
            },
            "& .MuiDataGrid-row:hover": {
              backgroundColor: theme.palette.action.hover,
            },
            "& .MuiDataGrid-footerContainer": {
              borderColor: theme.palette.divider,
              backgroundColor: isDark
                ? alpha("#FFFFFF", 0.02)
                : alpha("#F8FAFC", 0.90),
            },
          },
        },
      },
    },
  });
};
