import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";

function start() {
  const root = createRoot(document.querySelector("body")!);
  if (process.env.NODE_ENV === "production") {
    root.render(<App />);
  } else {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
