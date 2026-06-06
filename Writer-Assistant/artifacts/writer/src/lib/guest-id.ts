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
      args[1] = args[1] || {};
      args[1].headers = {
        ...args[1].headers,
        "x-guest-id": guestId,
      };
      return originalFetch(...args);
    }
  };
}
