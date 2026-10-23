import { entitlementKeyPrefix } from "./entitlement-keys";
import type { EntitlementRecord } from "./entitlement-store";
import { deviceIds } from "./webhook-apply";
import { isInstallUserId } from "./install-id";

export const DEVICE_CAP = 3;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type AttachFailure = "missing_env" | "invalid_install" | "invalid_id" | "not_found" | "order_mismatch" | "refunded" | "device_cap";

export type AttachResult = { ok: true; devices: string[] } | { ok: false; reason: AttachFailure };

export type RedisCommand = (args: string[]) => Promise<unknown>;

function readRecord(raw: unknown): EntitlementRecord | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as EntitlementRecord;
  } catch {
    return null;
  }
}

function mappedSubscription(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const subscriptionId = (parsed as { subscriptionId?: unknown }).subscriptionId;
    return typeof subscriptionId === "string" && subscriptionId ? subscriptionId : null;
  } catch {
    return null;
  }
}

/**
 * Append one install id to a subscription after the stored order id matches.
 * A refunded subscription is left alone. Callers pass the Upstash command
 * function so this can run locally against the same keys the webhook writes.
 */
export async function attachDevice(input: {
  env: Record<string, string | undefined>;
  subscriptionId: string;
  installId: string;
  orderId: string;
  command: RedisCommand;
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
  const subscriptionKey = `${prefix}sub:${input.subscriptionId}`;
  const orderKey = `${prefix}order:${input.orderId}`;
  const userKey = `${prefix}user:${installId}`;
  const indexKey = `${prefix}idx:${installId}`;

  const record = readRecord(await input.command(["GET", subscriptionKey]));
  if (!record || record.subscriptionId !== input.subscriptionId) return { ok: false, reason: "not_found" };
  if (mappedSubscription(await input.command(["GET", orderKey])) !== input.subscriptionId) {
    return { ok: false, reason: "order_mismatch" };
  }
  if (record.refunded) return { ok: false, reason: "refunded" };

  const devices = deviceIds(record);
  if (!devices.includes(installId)) {
    if (devices.length >= DEVICE_CAP) return { ok: false, reason: "device_cap" };
    devices.push(installId);
  }

  const stored: EntitlementRecord = { ...record, devices, userId: devices[0] ?? record.userId };
  await input.command(["SET", subscriptionKey, JSON.stringify(stored)]);
  await input.command(["SET", userKey, input.subscriptionId]);

  const index = readRecordList(await input.command(["GET", indexKey]));
  if (!index.includes(input.subscriptionId)) index.push(input.subscriptionId);
  await input.command(["SET", indexKey, JSON.stringify(index)]);

  return { ok: true, devices };
}

function readRecordList(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
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
