import { installCloudActionDiagnostics } from "./lib/cloud-action-diagnostics";

// Next's supported hook runs after HTML load and before hydration. The server
// exposes only this public boolean, never its environment or pilot credentials.
try {
  installCloudActionDiagnostics(window, {
    enabled: document.documentElement.dataset.cloudPilot === "on",
    origin: window.location.origin,
  });
} catch { /* Observability must not prevent hydration. */ }
