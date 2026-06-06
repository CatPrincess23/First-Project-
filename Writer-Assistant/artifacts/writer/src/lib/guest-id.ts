export function setupGuestId() {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    const isApiCall = url.includes("/api/");

    if (!isApiCall) {
      return originalFetch(...args);
    }

    let guestId = localStorage.getItem("guest-id");
    if (!guestId) {
      guestId = crypto.randomUUID();
      localStorage.setItem("guest-id", guestId);
    }

    const req = args[0] instanceof Request ? new Request(args[0]) : new Request(args[0], args[1]);
    req.headers.append("x-guest-id", guestId);
    return originalFetch(req);
  };
}
