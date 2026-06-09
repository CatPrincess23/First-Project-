import { ClerkProvider } from "@clerk/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";
const CLERK_PROXY_URL = "/api/__clerk";

createRoot(document.getElementById("root")!).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY} proxyUrl={CLERK_PROXY_URL} afterSignOutUrl="/sign-in" signInUrl="/sign-in" signUpUrl="/sign-up">
    <App />
  </ClerkProvider>
);
