import "@/index.css";
import "@/lab/lab.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StageRemote } from "@/lab/StageControls";
import { Site } from "@/site/Site";

function start() {
  createRoot(document.querySelector("body")!).render(
    <StrictMode>
      {/* The big screen's pop-out controls: a window of their own (src/lab/StageControls.tsx). */}
      {new URLSearchParams(location.search).get("remote") === "stage" ? <StageRemote /> : <Site />}
    </StrictMode>,
  );
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
else start();
