import "@/index.css";
import "@/lab/lab.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Lab } from "@/lab/Lab";

function start() {
  createRoot(document.querySelector("body")!).render(
    <StrictMode>
      <Lab />
    </StrictMode>,
  );
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
