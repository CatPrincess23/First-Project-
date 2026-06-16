// Fire the guest-cookie bootstrap exactly once per page load.
let guestCookiePromise: Promise<void> | null = null;

export function setupGuestId() {
  // Capture the original fetch before monkeypatching so the bootstrap call
  // (and the Clerk token read) cannot recurse back through the patched fetch.
  const originalFetch = window.fetch;

  // Ask the server to issue its signed HttpOnly guest cookie once. The browser
  // attaches that cookie to all later same-origin /api/ calls automatically, so
  // the client never chooses its own id.
  const ensureGuestCookie = () => {
    if (!guestCookiePromise) {
      guestCookiePromise = originalFetch("/api/auth/guest", {
        method: "POST",
        credentials: "same-origin",
      })
        .then(() => undefined)
        .catch(() => {
          // Allow a later retry if the bootstrap call failed.
          guestCookiePromise = null;
        });
    }
    return guestCookiePromise;
  };

  // Kick it off immediately (fire-and-forget, but await-able).
  void ensureGuestCookie();

  window.fetch = async (...args) => {
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    const isApiCall = url.includes("/api/");

    if (!isApiCall) {
      return originalFetch(...args);
    }

    // Build a Request and append headers rather than passing a plain headers
    // object: that preserves the auto-set Content-Type (application/json and
    // multipart/form-data) the body would otherwise lose. See AGENTS.md.
    // Set credentials at construction time so the guest cookie is always sent
    // on same-origin /api/ calls (and never stripped by the patched fetch).
    // Wait for the signed guest cookie to be set before issuing any other
    // /api/ call, otherwise the first data request races the bootstrap and is
    // rejected with 401 by requireIdentity. The bootstrap uses originalFetch,
    // so it never recurses through here. Resolves even on failure (no hang).
    await ensureGuestCookie();

    const req =
      args[0] instanceof Request
        ? new Request(args[0], { credentials: "same-origin" })
        : new Request(args[0], { ...args[1], credentials: "same-origin" });

    try {
      const clerk = (window as any).Clerk;
      if (clerk?.session) {
        const token = await clerk.session.getToken();
        if (token) req.headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // Clerk not available
    }

    return originalFetch(req);
  };
}
