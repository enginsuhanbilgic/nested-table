import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";

const LOCAL_API_URL = "http://localhost:8080/api";
const OCP_TEST_API_URL =
  "https://reporting-api-test-latency-reporting.apps.ocptest.borsa.local/api";
const OCP_UAT_API_URL =
  "https://reporting-api-uat-latency-reporting.apps.ocptest.borsa.local/api";

export const AUTH_UNAUTHORIZED_EVENT = "lr-auth-unauthorized";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

// AuthContext registers its single-flight refresh here. Resolves to the new
// access token, or null when the session is gone (→ login page). Indirection
// avoids a circular import between apiClient and authService.
let refreshHandler: (() => Promise<string | null>) | null = null;

export function setRefreshHandler(handler: (() => Promise<string | null>) | null) {
  refreshHandler = handler;
}

// The auth endpoints must never trigger a refresh-and-retry loop themselves.
const AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export class ApiError extends Error {
  status?: number;
  requestId?: string;
  details?: unknown;

  constructor(
    message: string,
    options?: { status?: number; requestId?: string; details?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options?.status;
    this.requestId = options?.requestId;
    this.details = options?.details;
  }
}

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: window.location.hostname.includes("test")
    ? OCP_TEST_API_URL
    : window.location.hostname.includes("uat")
      ? OCP_UAT_API_URL
      : LOCAL_API_URL,
  timeout: 30_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    config.headers["X-Request-ID"] = createRequestId();

    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
);

function toApiError(error: AxiosError) {
  const status = error.response?.status;
  const requestId = error.response?.headers?.["x-request-id"] as
    | string
    | undefined;

  const apiMessage =
    typeof error.response?.data === "object" &&
    error.response.data &&
    "message" in error.response.data
      ? String((error.response.data as { message?: unknown }).message)
      : error.message;

  return new ApiError(apiMessage || "Request failed", {
    status,
    requestId,
    details: error.response?.data,
  });
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const config = error.config as RetriableConfig | undefined;
    const isAuthPath = AUTH_PATHS.some((path) => config?.url?.includes(path));

    // Access tokens die every ~15 min by design. On the first 401 of a
    // request, refresh once (single-flight, shared across all concurrent
    // 401s) and replay the request with the new token.
    if (status === 401 && config && !config._retried && !isAuthPath && refreshHandler) {
      const newToken = await refreshHandler();

      if (newToken) {
        config._retried = true;
        config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(config);
      }
    }

    if (status === 401) {
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
    }

    return Promise.reject(toApiError(error));
  },
);
