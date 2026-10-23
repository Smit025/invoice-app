import { entitlementKeyPrefix } from "./entitlement-keys";
import { isInstallUserId } from "./install-id";
import { ATTACH_LUA } from "./webhook-lua";

export const DEVICE_CAP = 3;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type AttachFailure = "missing_env" | "invalid_install" | "invalid_id" | "not_found" | "order_mismatch" | "refunded" | "device_cap";

export type AttachResult = { ok: true; devices: string[] } | { ok: false; reason: AttachFailure };

export type RedisCommand = (args: string[]) => Promise<unknown>;

/**
 * Append one install id to a subscription after the stored order id matches.
 * The order check, the refund check, the device cap, and the writes run in
 * one EVAL. A refund that lands in another EVAL is not overwritten.
 */
export async function attachDevice(input: {
  env: Record<string, string | undefined>;
  subscriptionId: string;
  installId: string;
  orderId: string;
  command: RedisCommand;
  nowMs?: number;
}): Promise<AttachResult> {
  const vercelEnv = input.env.VERCEL_ENV?.trim();
  const url = (input.env.UPSTASH_REDIS_REST_URL ?? input.env.KV_REST_API_URL)?.trim();
  const token = (input.env.UPSTASH_REDIS_REST_TOKEN ?? input.env.KV_REST_API_TOKEN)?.trim();
  if (!vercelEnv || !url || !token) return { ok: false, reason: "missing_env" };
  if (!isInstallUserId(input.installId)) return { ok: false, reason: "invalid_install" };
  const installId = input.installId.trim().toLowerCase();
  if (!ID_PATTERN.test(input.subscriptionId) || !ID_PATTERN.test(input.orderId)) {
    return { ok: false, reason: "invalid_id" };
  }

  const prefix = entitlementKeyPrefix(vercelEnv);
  const raw = await input.command([
    "EVAL",
    ATTACH_LUA,
    "1",
    `${prefix}hook`,
    prefix,
    input.subscriptionId,
    installId,
    input.orderId,
    String(DEVICE_CAP),
    String(input.nowMs ?? Date.now()),
  ]);
  return parseAttachResult(raw);
}

function parseAttachResult(raw: unknown): AttachResult {
  const value = typeof raw === "string" ? parseJson(raw) : raw;
  if (!value || typeof value !== "object") return { ok: false, reason: "not_found" };
  const body = value as { ok?: unknown; reason?: unknown; devices?: unknown };
  if (body.ok === true && Array.isArray(body.devices)) {
    return { ok: true, devices: body.devices.filter((item): item is string => typeof item === "string") };
  }
  if (
    body.reason === "not_found" ||
    body.reason === "order_mismatch" ||
    body.reason === "refunded" ||
    body.reason === "device_cap"
  ) {
    return { ok: false, reason: body.reason };
  }
  return { ok: false, reason: "not_found" };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseAttachArgs(argv: string[]): { subscriptionId: string; installId: string; orderId: string } | null {
  const subscriptionId = flag(argv, "--subscription");
  const installId = flag(argv, "--install");
  const orderId = flag(argv, "--order");
  if (!subscriptionId || !installId || !orderId) return null;
  return { subscriptionId, installId, orderId };
}

function flag(argv: string[], name: string): string | null {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}
