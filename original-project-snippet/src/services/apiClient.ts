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

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const status = error.response?.status;
    const requestId = error.response?.headers?.["x-request-id"] as
      | string
      | undefined;

    if (status === 401) {
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
    }

    const apiMessage =
      typeof error.response?.data === "object" &&
      error.response.data &&
      "message" in error.response.data
        ? String((error.response.data as { message?: unknown }).message)
        : error.message;

    return Promise.reject(
      new ApiError(apiMessage || "Request failed", {
        status,
        requestId,
        details: error.response?.data,
      }),
    );
  },
);
