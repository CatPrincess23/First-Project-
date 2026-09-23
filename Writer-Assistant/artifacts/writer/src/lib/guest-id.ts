import { getUserApiConfig, isUserApiKeyEnabled } from "./api-key";

// Stable guest ID stored in localStorage — survives page reloads.
const GUEST_ID_KEY = "wa_guest_id";

function getOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(GUEST_ID_KEY, id);
  return id;
}

let _guestId: string | null = null;

function getGuestId(): string {
  if (_guestId) return _guestId;
  _guestId = getOrCreateGuestId();
  return _guestId;
}

export function clearGuestId() {
  localStorage.removeItem(GUEST_ID_KEY);
  _guestId = null;
}

export function getCurrentGuestId(): string | null {
  return localStorage.getItem(GUEST_ID_KEY);
}

export function setupGuestId() {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    let requestUrl: URL;
    try {
      requestUrl = new URL(url, window.location.origin);
    } catch {
      return originalFetch(...args);
    }
    if (requestUrl.origin !== window.location.origin) return originalFetch(...args);
    const pathname = requestUrl.pathname;
    const isApiCall = pathname.startsWith("/api/");

    if (!isApiCall) {
      return originalFetch(...args);
    }

    const req =
      args[0] instanceof Request
        ? new Request(args[0], { credentials: "same-origin" })
        : new Request(args[0], { ...args[1], credentials: "same-origin" });

    // This value is only a client-sync hint. The API never uses it to select
    // the request identity; it can only return the signed cookie's ID so this
    // localStorage value stays aligned for the later Clerk claim flow.
    req.headers.set("x-guest-id", getGuestId());

    try {
      const clerk = (window as any).Clerk;
      if (clerk?.session) {
        const token = await clerk.session.getToken();
        if (token) req.headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // Clerk not available
    }

    // Inject user's custom API key if configured and enabled
    try {
      const userApiConfig = pathname.startsWith("/api/ai/") && isUserApiKeyEnabled()
        ? getUserApiConfig()
        : null;
      if (userApiConfig) {
        req.headers.set("x-user-api-key", userApiConfig.apiKey);
        req.headers.set("x-user-base-url", userApiConfig.baseUrl);
        req.headers.set("x-user-model", userApiConfig.model);
      }
    } catch {
      // localStorage not available
    }

    const response = await originalFetch(req);

    // If the server says our localStorage guest ID is stale, fix it so future
    // requests (including on next page load) use the correct identity.
    const correction = response.headers.get("X-Guest-Identity-Correction");
    if (correction) {
      localStorage.setItem(GUEST_ID_KEY, correction);
      _guestId = correction;
    }

    return response;
  };
}
