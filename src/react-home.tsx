import "@/index.css";
import "@/lab/lab.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Home } from "@/home/Home";

function start() {
  createRoot(document.querySelector("body")!).render(
    <StrictMode>
      <Home />
    </StrictMode>,
  );
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
