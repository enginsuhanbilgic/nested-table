import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { UserPageHistoryLoggingRequest } from "../../types/audit";
import { useAuth } from "../../contexts/AuthContext";
import { logPageHistory } from "../../services/analyticsService";
import { findRouteMeta } from "../../routes/routeMeta";

export const PageTracker: React.FC = () => {
  const location = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  // document.referrer only changes on full document loads, so it never
  // reflects client-side route changes — track the previous in-app path
  // ourselves and send that as the referral.
  const previousPathRef = useRef<string | null>(null);

  // The effect also fires when auth state changes without a navigation
  // (e.g. login resolving on an already-open page); remember the last path
  // we sent so those reruns don't double-log.
  const lastLoggedPathRef = useRef<string | null>(null);

  useEffect(() => {
    const currentPath = location.pathname;

    if (isLoading) {
      return;
    }

    if (!isAuthenticated || user?.employeeId === "MOCK-001") {
      // Not tracked, but still part of the navigation trail — this is how
      // /login becomes the referral of the first tracked page.
      previousPathRef.current = currentPath;
      return;
    }

    if (lastLoggedPathRef.current === currentPath) {
      return;
    }

    const requestBody: UserPageHistoryLoggingRequest = {
      pagePath: currentPath,
      // Route metadata gives a stable, human-readable title regardless of
      // when RouteTitleSync updates document.title.
      pageTitle: findRouteMeta(currentPath)?.title ?? document.title,
      // First tracked page of this document: no in-app history yet, so fall
      // back to the browser referrer (external origin, or empty on a direct
      // visit / reload).
      referral: previousPathRef.current ?? document.referrer,
    };

    logPageHistory(requestBody).catch((error) => {
      console.error("Page tracking failed: ", error);
    });

    lastLoggedPathRef.current = currentPath;
    previousPathRef.current = currentPath;
  }, [location, isAuthenticated, isLoading, user]);

  return null;
};
