import { getConfig as _getConfig } from "@/lib/data/driver";
import type { API } from "@/lib/types";

export async function getConfig() {
  const config = await _getConfig();
  return Response.json(config satisfies API.GET_Config);
}
