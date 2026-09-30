import { lazy, Suspense, useEffect, useRef, useState, useCallback, type SubmitEvent } from "react";
import {
  alpha,
  Box,
  Button,
  Divider,
  fabClasses,
  CircularProgress,
  IconButton,
  InputAdornment,
  Link,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  LockOutlined,
  PersonOutline,
  Visibility,
  VisibilityOff,
  Refresh as RefreshIcon
} from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { createCaptcha } from "../services/authService";

const GlobeBackground = lazy(() =>
  import("../components/globe/GlobeBackground").then((module) => ({
    default: module.GlobeBackground,
  })),
);

function scheduleIdleWork(callback: () => void) {
  let didRun = false;

  const run = () => {
    if (didRun) return;
    didRun = true;
    callback();
  };

  const idleId =
    "requestIdleCallback" in window
      ? window.requestIdleCallback(run, { timeout: 1200 })
      : undefined;
  const timeoutId =
    idleId === undefined ? window.setTimeout(run, 360) : undefined;

  return () => {
    didRun = true;

    if (idleId !== undefined) {
      window.cancelIdleCallback(idleId);
    }

    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  };
}

export function LoginPage() {
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? "/latency/daily";

  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGlobeBackground, setShowGlobeBackground] = useState(false);

  const [isCaptchaEnabled, setIsCaptchaEnabled] = useState(true);
  const [captchaId, setCaptchaId] = useState<string | null>("");
  const captchaIdRef = useRef<string | null>(null);
  const [captchaText, setCaptchaText] = useState<string | null>("");
  const [captchaImageBase64, setCaptchaImageBase64] = useState("");
  const [captchaExpiresAtEpochMs, setCaptchaExpiresAtEpochMs] = useState<Date | null>(null);
  const captchaUnavailableRetryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef<boolean>(false);

  useEffect(() => scheduleIdleWork(() => setShowGlobeBackground(true)), []);

  const handleSubmit = async (event: SubmitEvent) => {
    if (!isCaptchaEnabled) {
      refreshCaptcha();
    }
    event.preventDefault();

    try {
      setLoading(true);
      setError(null);

      await login({
        username,
        password,
        captchaId: captchaId || undefined,
        answer: captchaText || undefined,
      });

      navigate(redirectTo, { replace: true });
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Login failed. Please check your credentials.",
      );

      // The backend checks the captcha before LDAP, and a CORRECT answer
      // consumes it — so after a wrong-credentials failure the on-screen
      // captcha is already dead. A wrong answer leaves it alive, but the
      // error body doesn't say which step failed, so refresh after every
      // failure: a fresh challenge is always safe to retry against.
      await refreshCaptcha({ keepError: true });
    } finally {
      setLoading(false);
    }
  };

  const refreshCaptcha = useCallback(async (options?: { keepError?: boolean }) => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    if (!options?.keepError) {
      setError(null);
    }
    setCaptchaImageBase64("");
    setCaptchaText("");

    // For best practice send the previous captcha id to backend to invalidate it.
    // It can be null if this is the first time or if the previous one was already used or expired.
    const previousCaptchaId = captchaIdRef.current;
    try {
      setLoading(true);

      const captchaResponse = await createCaptcha(previousCaptchaId);
      if (captchaResponse.captchaId && captchaResponse.expiresAtEpochMs && captchaResponse.imageBase64) {
        setIsCaptchaEnabled(true);
        setCaptchaExpiresAtEpochMs(new Date(captchaResponse.expiresAtEpochMs));
        captchaIdRef.current = captchaResponse.captchaId;
        setCaptchaId(captchaResponse.captchaId);
        setCaptchaImageBase64(captchaResponse.imageBase64);
      } else {
        setError("Captcha response is missing fields.");
      }
    } catch (err) {
      //console.log(err);
      setIsCaptchaEnabled(false);
      //setError("An error occurred with CAPTCHA");
      setCaptchaImageBase64("");
      setCaptchaExpiresAtEpochMs(null);
      setCaptchaId(null);
    } finally {
      setLoading(false);
      refreshInFlightRef.current = false;
    }
  }, [createCaptcha]);

  useEffect(() => {
    if (!captchaExpiresAtEpochMs) return;

    if (refreshTimeoutRef.current !== null) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    const msUntilExpire = captchaExpiresAtEpochMs.getTime() - Date.now();
    //console.log(msUntilExpire);

    const delay = Math.max(0, msUntilExpire);

    refreshTimeoutRef.current = setTimeout(() => {
      if (refreshInFlightRef.current) return;
      refreshCaptcha();
    }, delay);

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [captchaExpiresAtEpochMs, refreshCaptcha]);

  useEffect(() => {
    if (isCaptchaEnabled) {
      if (captchaUnavailableRetryIntervalRef.current !== null) {
        clearInterval(captchaUnavailableRetryIntervalRef.current);
        captchaUnavailableRetryIntervalRef.current = null;
      }
      return;
    }

    if (captchaUnavailableRetryIntervalRef.current) return;

    captchaUnavailableRetryIntervalRef.current = setInterval(() => {
      if (refreshInFlightRef.current) return;
      refreshCaptcha();
    }, 60_000);

    return () => {
      if (captchaUnavailableRetryIntervalRef.current) {
        clearInterval(captchaUnavailableRetryIntervalRef.current);

        captchaUnavailableRetryIntervalRef.current = null;
      }
    };
  }, [isCaptchaEnabled, refreshCaptcha]);

  useEffect(() => {
    captchaIdRef.current = captchaId;
  }, [captchaId]);

  useEffect(() => {
    refreshCaptcha();
  }, [refreshCaptcha]);

  const fillMockCredentials = () => {
    setUsername("demo");
    setPassword("demo");
    setError(null);
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        position: "relative",
        overflow: "hidden",
        bgcolor: "#030816",
      }}
    >
      {showGlobeBackground && (
        <Suspense fallback={null}>
          <GlobeBackground />
        </Suspense>
      )}

      <Box
        sx={{
          position: "relative",
          zIndex: 2,
          minHeight: "100vh",
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "550px 1fr" },
          alignItems: "center",
          px: { xs: 2, sm: 4, lg: 6 },
          py: { xs: 3, md: 4 },
          gap: { xs: 4, lg: 2 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            maxWidth: 550,
            borderRadius: 5,
            px: { xs: 3, sm: 4 },
            py: { xs: 3.5, sm: 4 },
            color: "common.white",
            border: "1px solid",
            borderColor: alpha("#72f7ff", 0.26),
            background: `
              linear-gradient(180deg, rgba(16, 25, 44, 0.76), rgba(9, 16, 30, 0.86)),
              radial-gradient(circle at top left, rgba(90, 241, 255, 0.12), transparent 30%)
            `,
            backdropFilter: "blur(22px)",
            boxShadow: `
              0 20px 60px rgba(0, 0, 0, 0.48),
              0 0 0 1px rgba(103, 246, 255, 0.06) inset,
              0 0 32px rgba(71, 239, 255, 0.14)
            `,
          }}
        >
          <Stack spacing={3}>
            <Typography
              variant="h4"
              sx={{
                mt: 0.5,
                alignSelf: "center",
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: -0.02,
              }}
            >
              Latency Reporting Portal
            </Typography>

            <Divider sx={{ borderColor: alpha("#8ef7ff", 0.12) }} />

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  fullWidth
                  autoComplete="username"
                  variant="outlined"
                  spellCheck={false}
                  slotProps={{
                    htmlInput: {
                      spellCheck: false,
                      autoCorrect: "off",
                      autoCapitalize: "none",
                    },
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutline sx={{ color: alpha("#ffffff", 0.7) }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={glassFieldSx}
                />

                <TextField
                  label="Password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  fullWidth
                  autoComplete="current-password"
                  variant="outlined"
                  spellCheck={false}
                  slotProps={{
                    htmlInput: {
                      spellCheck: false,
                      autoCorrect: "off",
                      autoCapitalize: "none",
                    },
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlined sx={{ color: alpha("#ffffff", 0.7) }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword((prev) => !prev)}
                            edge="end"
                            sx={{ color: alpha("#ffffff", 0.7) }}
                          >
                            {showPassword ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                  sx={glassFieldSx}
                />

                {isCaptchaEnabled ? (<Stack spacing={1.25} sx={{ mt: 2 }}>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      component="img"
                      alt="Captcha"
                      src={`data:image/png;base64,${captchaImageBase64}`}
                      sx={{
                        width: 240,
                        height: 90,
                        borderRadius: 1,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                        display: "block",
                      }}
                    />
                    <Tooltip title="Refresh captcha">
                      <span>
                        <IconButton
                          onClick={() => refreshCaptcha()}
                          disabled={loading}
                          aria-label="Refresh captcha"
                          size="large"
                        >
                          <RefreshIcon/>
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                  <TextField
                    margin="normal"
                    required
                    fullWidth
                    label="Enter Captcha"
                    placeholder="CAPTCHA"
                    value={captchaText}
                    sx={glassFieldSx}
                    onChange={(e) => {
                      const next = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6);
                      setCaptchaText(next);
                    }}
                    inputProps={{
                      maxLength: 6,
                      autoComplete: "off",
                      spellCheck: "false",
                      inputMode: "text",
                    }}
                  ></TextField>
                </Stack>) : (<Typography>Captcha is currently unavailable</Typography>)}

                {error && (
                  <Typography variant="body2" sx={{ color: "#ff8b8b" }}>
                    {error}
                  </Typography>
                )}

                <Button
                  type="submit"
                  fullWidth
                  disabled={loading}
                  sx={{
                    mt: 1,
                    minHeight: 52,
                    borderRadius: 999,
                    fontWeight: 700,
                    fontSize: 16,
                    letterSpacing: 0.3,
                    color: "#04111f",
                    background:
                      "linear-gradient(90deg, rgba(37, 184, 255, 1) 0%, rgba(96, 245, 255, 1) 100%)",
                    boxShadow: "0 10px 30px rgba(56, 223, 255, 0.28)",
                    "&:hover": {
                      background:
                        "linear-gradient(90deg, rgba(57, 194, 255, 1) 0%, rgba(115, 247, 255, 1) 100%)",
                    },
                    "&.Mui-disabled": {
                      color: "#001018",
                      background: "rgba(120, 190, 200, 0.5)",
                    },
                  }}
                >
                  {(loading || isLoading) ? (<CircularProgress />) : "Login"}
                </Button>

                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    pt: 0.5,
                  }}
                >
                  <Link
                    component="button"
                    type="button"
                    underline="hover"
                    onClick={fillMockCredentials}
                    sx={{ color: alpha("#8cf5ff", 0.9), fontSize: 14 }}
                  >
                    Use demo login
                  </Link>
                </Box>
              </Stack>
            </Box>
          </Stack>
        </Paper>

        <Box
          sx={{
            display: { xs: "none", lg: "flex" },
            minHeight: 700,
            alignItems: "flex-start",
            justifyContent: "flex-start",
            pl: 2,
          }}
        >
          <Box sx={{ maxWidth: 520, ml: { lg: 4, xl: 8 } }}>
            <Typography
              variant="h2"
              sx={{
                color: "common.white",
                fontWeight: 800,
                lineHeight: 1.02,
                letterSpacing: -0.04,
                textShadow: "0 10px 40px rgba(0,0,0,0.24)",
              }}
            >
              Observe the market
              <Box component="span" sx={{ display: "block", color: "#72f7ff" }}>
                in motion
              </Box>
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const glassFieldSx = {
  "& .MuiInputLabel-root": {
    color: "rgba(255,255,255,0.72)",
  },

  "& .MuiOutlinedInput-root": {
    color: "#fff",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",

    "& fieldset": {
      borderColor: "rgba(118, 240, 255, 0.24)",
    },

    "&:hover fieldset": {
      borderColor: "rgba(118, 240, 255, 0.44)",
    },

    "&.Mui-focused fieldset": {
      borderColor: "#72f7ff",
      boxShadow: "0 0 0 3px rgba(114, 247, 255, 0.08)",
    },

    "& input": {
      color: "#fff",
      caretColor: "#fff",
    },

    "& input:-webkit-autofill": {
      WebkitTextFillColor: "#fff",
      caretColor: "#fff",
      WebkitBoxShadow: "0 0 0 1000px rgba(20, 28, 38, 0.96) inset",
      boxShadow: "0 0 0 1000px rgba(20, 28, 38, 0.96) inset",
      transition: "background-color 9999s ease-in-out 0s",
    },

    "& input:-webkit-autofill:hover": {
      WebkitTextFillColor: "#fff",
      WebkitBoxShadow: "0 0 0 1000px rgba(20, 28, 38, 0.96) inset",
      boxShadow: "0 0 0 1000px rgba(20, 28, 38, 0.96) inset",
    },

    "& input:-webkit-autofill:focus": {
      WebkitTextFillColor: "#fff",
      WebkitBoxShadow: "0 0 0 1000px rgba(20, 28, 38, 0.96) inset",
      boxShadow: "0 0 0 1000px rgba(20, 28, 38, 0.96) inset",
    },

    "& input:-webkit-autofill:active": {
      WebkitTextFillColor: "#fff",
      WebkitBoxShadow: "0 0 0 1000px rgba(20, 28, 38, 0.96) inset",
      boxShadow: "0 0 0 1000px rgba(20, 28, 38, 0.96) inset",
    },
  },

  "& .MuiInputBase-input::placeholder": {
    color: "rgba(255,255,255,0.56)",
    opacity: 1,
  },
};
