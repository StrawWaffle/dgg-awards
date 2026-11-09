export function nowS() {
  return Math.floor(Date.now() / 1000);
}

/** combine base and path with urlencoded, serialized params object */
export function buildUrl(
  base: string,
  path: string,
  params: Record<string, string>,
) {
  const url = new URL(path, base);
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

export function env(k: string, defaultValue?: string): string {
  const v = process.env[k];
  if (!v) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    console.error(`Required .env variable '${k}' unset, exiting...`);
    process.exit(1);
  }
  return v;
}
