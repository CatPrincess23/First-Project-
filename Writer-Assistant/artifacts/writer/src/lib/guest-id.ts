// Stable guest ID stored in localStorage — survives page reloads.
const GUEST_ID_KEY = "wa_guest_id";

function getOrCreateGuestId(): string {
  const existing = localStorage.getItem(GUEST_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(GUEST_ID_KEY, id);
  return id;
}

export function setupGuestId() {
  const originalFetch = window.fetch;
  const guestId = getOrCreateGuestId();

  window.fetch = async (...args) => {
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    const isApiCall = url.includes("/api/");

    if (!isApiCall) {
      return originalFetch(...args);
    }

    const req =
      args[0] instanceof Request
        ? new Request(args[0], { credentials: "same-origin" })
        : new Request(args[0], { ...args[1], credentials: "same-origin" });

    req.headers.set("x-guest-id", guestId);

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
