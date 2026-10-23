import { pathToFileURL } from "node:url";
import { attachDevice, parseAttachArgs } from "../src/lib/attach-device.ts";

/**
 * Attach one install id to a subscription after the stored Lemon order id matches.
 *
 * VERCEL_ENV, UPSTASH_REDIS_REST_URL, and UPSTASH_REDIS_REST_TOKEN must be set.
 * An empty VERCEL_ENV is refused so this cannot write inv:local: by mistake.
 *
 * node --experimental-strip-types scripts/attach-device.ts \
 *   --subscription sub_123 --install <32 hex> --order <lemon order id>
 */
async function upstash(env: Record<string, string | undefined>, args: string[]): Promise<unknown> {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim();
  if (!url || !token) return null;
  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error("Upstash request failed");
  const body = (await response.json()) as { result?: unknown; error?: string };
  if (body.error) throw new Error("Upstash request failed");
  return body.result ?? null;
}

export async function main(argv: string[], env: Record<string, string | undefined> = process.env): Promise<number> {
  const parsed = parseAttachArgs(argv);
  if (!parsed) {
    console.error(
      "Usage: node --experimental-strip-types scripts/attach-device.ts --subscription <id> --install <32 hex> --order <lemon order id>",
    );
    return 1;
  }
  const result = await attachDevice({
    env,
    ...parsed,
    command: (args) => upstash(env, args),
  });
  if (!result.ok) {
    console.error(result.reason);
    return 1;
  }
  console.log(result.devices.join(","));
  return 0;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : "attach failed");
      process.exitCode = 1;
    },
  );
}
