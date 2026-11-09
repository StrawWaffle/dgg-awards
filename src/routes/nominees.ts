import { getConfig, getNominees } from "@/lib/data/driver";
import type { API } from "@/lib/types";

export async function nomineesGet() {
  const config = await getConfig();
  if (config !== undefined && config.viewingMode === "locked") {
    return new Response("locked");
  }
  const nominees = await getNominees();

  return Response.json(nominees satisfies API.GET_Nominees);
}
