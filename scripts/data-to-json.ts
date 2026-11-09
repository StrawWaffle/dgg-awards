import { Data } from "@/data";

Bun.write("scripts/data-to-json.out.json", JSON.stringify(Data));
