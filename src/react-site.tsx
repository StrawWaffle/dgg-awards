import "@/index.css";
import "@/lab/lab.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Site } from "@/site/Site";

function start() {
  createRoot(document.querySelector("body")!).render(
    <StrictMode>
      <Site />
    </StrictMode>,
  );
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
