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

    if (args[0] instanceof Request) {
      const newReq = new Request(args[0]);
      newReq.headers.append("x-guest-id", guestId);
      return originalFetch(newReq);
    } else {
      const init = args[1] || {};
      const plainHeaders: Record<string, string> = {};
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => { plainHeaders[key] = value; });
      } else if (init.headers) {
        Object.assign(plainHeaders, init.headers);
      }
      plainHeaders["x-guest-id"] = guestId;
      args[1] = { ...init, headers: plainHeaders };
      return originalFetch(args[0], args[1]);
    }
  };
}
