/** Legacy `"1"` grants Pro only in development. Subscription access comes from the server. */
export function isStoredProActive(raw: string | null, nodeEnv = process.env.NODE_ENV): boolean {
  return raw === "1" && nodeEnv === "development";
}
