import { ClerkProvider } from "@clerk/react";
import { ui } from "@clerk/ui";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

// ClerkProvider throws at runtime when given an empty publishable key, so only
// wrap when a key is present. Guest-only deployments (no key configured) render
// App directly — identity still works via the x-guest-id header / signed cookie.
const tree = PUBLISHABLE_KEY ? (
  <ClerkProvider publishableKey={PUBLISHABLE_KEY} ui={ui} afterSignOutUrl="/sign-in">
    <App />
  </ClerkProvider>
) : (
  <App />
);

createRoot(document.getElementById("root")!).render(tree);
