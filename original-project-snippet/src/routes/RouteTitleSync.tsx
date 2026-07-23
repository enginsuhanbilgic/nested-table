import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { findRouteMeta } from './routeMeta'

// The tab title from index.html, captured before any route overrides it.
const BASE_TITLE = document.title

// Keeps document.title in sync with the current route. Renders nothing;
// mount once under BrowserRouter (next to PageTracker).
export function RouteTitleSync() {
  const location = useLocation()

  useEffect(() => {
    const meta = findRouteMeta(location.pathname)
    document.title = meta ? `${meta.title} · ${BASE_TITLE}` : BASE_TITLE
  }, [location])

  return null
}
