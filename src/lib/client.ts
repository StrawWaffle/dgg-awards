// Typed API client. Paths, request bodies and response types all come from
// the server's route definitions (src/server), so a renamed route or field
// is a type error here, not a runtime failure. Only the type is imported, so
// no server code reaches the browser bundle.
import { hc } from "hono/client";
import type { AppType } from "@/server/app";

export const client = hc<AppType>(window.location.origin);
