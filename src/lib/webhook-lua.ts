/**
 * One Redis EVAL for a Lemon webhook.
 *
 * Redis does not roll back writes when a Lua script errors. This script claims
 * the event (SET NX EX) before other writes and returns normally on every
 * handled path after that claim. The store DELs the event key only when the
 * HTTP call itself fails, so a lost response can retry. A retry of the same
 * payload writes the same record. If a newer event landed in between, the
 * retry is stale and does not overwrite it.
 *
 * Timestamps are coerced with `or 0`. `cjson.null` is treated as missing
 * before `tonumber`, because that userdata is not a number. `updated_at` is
 * only the Lemon time in the payload. A missing time keeps the stored stamp,
 * or 0 when nothing is stored. It is never the request clock.
 *
 * ARGV[1] is the key prefix (`inv:<vercel-env>:`). ARGV[2] is the event TTL
 * in seconds. ARGV[3] is the webhook spec JSON.
 *
 * `LUA_HELPERS` is shared with the attach-device script. Both close over
 * `prefix`. `pointUser` picks the best subscription for an install id.
 */
const LUA_HELPERS = `
local function str(value)
  if value == nil or value == cjson.null then return "" end
  if type(value) ~= "string" then return "" end
  return value
end

local function millis(value)
  if value == nil or value == cjson.null then return nil end
  if type(value) == "number" then return value end
  if type(value) ~= "string" then return nil end
  return tonumber(value)
end

local function isoToMs(iso)
  if type(iso) ~= "string" or iso == "" then return nil end
  -- Lemon sends UTC with a Z suffix. An offset such as +05:00 is rejected
  -- so the clock time is not treated as UTC.
  if iso:sub(-1) ~= "Z" then return nil end
  local body = iso:sub(1, -2)
  local y, mo, d, h, mi, s, frac = body:match("^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)%.?(%d*)$")
  if not y then return nil end
  y, mo, d, h, mi, s = tonumber(y), tonumber(mo), tonumber(d), tonumber(h), tonumber(mi), tonumber(s)
  local ms = 0
  if frac ~= nil and frac ~= "" then
    local digits = frac:sub(1, 3)
    ms = tonumber(digits) or 0
    if #digits == 1 then ms = ms * 100
    elseif #digits == 2 then ms = ms * 10 end
  end
  local yy = y
  local mm = mo
  if mm <= 2 then
    yy = yy - 1
    mm = mm + 12
  end
  local era = math.floor(yy / 400)
  local yoe = yy - era * 400
  local doy = math.floor((153 * (mm - 3) + 2) / 5) + d - 1
  local doe = yoe * 365 + math.floor(yoe / 4) - math.floor(yoe / 100) + doy
  local days = era * 146097 + doe - 719468
  return (days * 86400 + h * 3600 + mi * 60 + s) * 1000 + ms
end

local function accessEnd(rec)
  if rec == nil then return 0 end
  local endsMs = millis(rec.endsAtMs) or 0
  local renewsMs = millis(rec.renewsAtMs) or 0
  if endsMs > 0 then return endsMs end
  if renewsMs > 0 then return renewsMs end
  return isoToMs(str(rec.endsAt)) or isoToMs(str(rec.renewsAt)) or 0
end

local function rankOf(rec, atMs)
  local finish = accessEnd(rec)
  local active = rec.active == true and rec.refunded ~= true and finish > atMs
  local tier = 0
  if active then
    if string.sub(str(rec.subscriptionId), 1, 8) == "license:" then tier = 1 else tier = 2 end
  end
  local updated = millis(rec.updatedAtMs) or 0
  if active then return tier, finish, updated end
  return 0, 0, updated
end

local function better(rec, best, atMs)
  local ta, ea, ua = rankOf(rec, atMs)
  local tb, eb, ub = rankOf(best, atMs)
  if ta ~= tb then return ta > tb end
  if ea ~= eb then return ea > eb end
  return ua > ub
end

local function readIndex(userId)
  if userId == "" then return {} end
  local raw = redis.call("GET", prefix .. "idx:" .. userId)
  if not raw then return {} end
  local decoded = cjson.decode(raw)
  if type(decoded) ~= "table" then return {} end
  return decoded
end

local function writeIndex(userId, ids)
  if userId == "" then return end
  redis.call("SET", prefix .. "idx:" .. userId, cjson.encode(ids))
end

local function bestId(ids, atMs)
  local best = nil
  for _, id in ipairs(ids) do
    local raw = redis.call("GET", prefix .. "sub:" .. id)
    if raw then
      local rec = cjson.decode(raw)
      if rec and str(rec.userId) ~= "" then
        if best == nil or better(rec, best, atMs) then best = rec end
      end
    end
  end
  if best == nil then return "" end
  return str(best.subscriptionId)
end

local function pointUser(userId, ids, atMs)
  if userId == "" then return end
  local chosen = bestId(ids, atMs)
  if chosen == "" then
    redis.call("DEL", prefix .. "user:" .. userId)
  else
    redis.call("SET", prefix .. "user:" .. userId, chosen)
  end
end

local function priceOk(currency, amounts, plan)
  if currency ~= "" and string.upper(currency) ~= "USD" then return false end
  if amounts == nil or #amounts == 0 then return true end
  local expected = ({ monthly = 299, sixMonth = 799 })[plan]
  if expected == nil then return false end
  for _, cents in ipairs(amounts) do
    if tonumber(cents) == expected then return true end
  end
  return false
end

local function mergeDate(mode, incoming, existing)
  if mode == "keep" then return existing end
  if mode == "set" then return incoming end
  if incoming ~= "" then return incoming end
  return existing
end

local function contains(list, value)
  for _, item in ipairs(list) do
    if item == value then return true end
  end
  return false
end

local function devicesOf(rec)
  local list = {}
  if rec == nil then return list end
  if type(rec.devices) == "table" then
    for _, id in ipairs(rec.devices) do
      local device = str(id)
      if device ~= "" then table.insert(list, device) end
    end
  end
  if #list == 0 and str(rec.userId) ~= "" then table.insert(list, str(rec.userId)) end
  return list
end
`;

export const WEBHOOK_LUA = `
-- Redis does not roll back writes when a Lua script errors. This claim stays
-- unless the store DELs it after the HTTP call itself fails.
local prefix = ARGV[1]
local ttl = tonumber(ARGV[2]) or 0
local spec = cjson.decode(ARGV[3])
local nowMs = tonumber(spec.nowMs) or 0
${LUA_HELPERS}
local function done(result, action, reason, variantId)
  return cjson.encode({
    result = result,
    action = action,
    variantId = variantId or "",
    reason = reason,
  })
end

if str(spec.eventId) ~= "" then
  local claimed = redis.call("SET", prefix .. "event:" .. spec.eventId, "1", "NX", "EX", ttl)
  if not claimed then
    return done("duplicate", "duplicate", "duplicate_event", str(spec.variantId))
  end
end

local subscriptionId = str(spec.subjectId)
local existing = nil
if subscriptionId ~= "" then
  local raw = redis.call("GET", prefix .. "sub:" .. subscriptionId)
  if raw then existing = cjson.decode(raw) end
end

if subscriptionId == "" and str(spec.orderId) ~= "" then
  local orderId = str(spec.orderId)
  if string.match(orderId, "^[A-Za-z0-9_%-]+$") and #orderId <= 64 then
    local raw = redis.call("GET", prefix .. "order:" .. orderId)
    if raw then
      local mapped = cjson.decode(raw)
      if type(mapped) == "table" then subscriptionId = str(mapped.subscriptionId) end
    end
  end
  if subscriptionId == "" then
    return done("ignored", "ignore", "missing_subscription", str(spec.variantId))
  end
  local raw = redis.call("GET", prefix .. "sub:" .. subscriptionId)
  if raw then existing = cjson.decode(raw) end
end

if existing == nil and subscriptionId == "" and str(spec.orderId) == "" and str(spec.userId) ~= "" and spec.action == "revoke" then
  local ids = readIndex(spec.userId)
  local chosen = bestId(ids, nowMs)
  if chosen ~= "" then
    local raw = redis.call("GET", prefix .. "sub:" .. chosen)
    if raw then
      existing = cjson.decode(raw)
      subscriptionId = chosen
    end
  end
end

if existing ~= nil then
  local incomingMs = millis(spec.updatedAtMs)
  if incomingMs == nil then incomingMs = millis(existing.updatedAtMs) or 0 end
  local storedMs = millis(existing.updatedAtMs) or 0
  local stale = false
  if incomingMs < storedMs then
    stale = true
    elseif incomingMs == storedMs then
    local incomingPrec = tonumber(spec.precedence) or 0
    local storedPrec = tonumber(existing.precedence) or 0
    if incomingPrec < storedPrec then
      stale = true
    elseif incomingPrec == storedPrec then
      -- payment_success stays precedence 10. A higher rank would make the
      -- same-second renewal stale, so renews_at would never be stored.
      local clearsRefund = existing.refunded == true and spec.action == "grant" and spec.reason == "payment_success"
      local fillsCleared = false
      if spec.action == "grant" and spec.reason ~= "payment_success" and (str(spec.renewsAt) ~= "" or str(spec.endsAt) ~= "") then
        local clearedAt = millis(existing.refundClearedAtMs)
        if clearedAt ~= nil and clearedAt == incomingMs then fillsCleared = true end
      end
      if not clearsRefund and not fillsCleared then
        local incomingId = str(spec.eventId)
        local storedId = str(existing.eventId)
        if incomingId <= storedId then stale = true end
      end
    end
  end
  if stale then
    local variant = str(spec.variantId)
    if variant == "" then variant = str(existing.variantId) end
    return done("stale", "stale", "stale_event", variant)
  end
end

local devices = devicesOf(existing)
local incomingUser = str(spec.userId)
if #devices == 0 and incomingUser ~= "" then
  table.insert(devices, incomingUser)
end
if #devices == 0 then return done("ignored", "ignore", "missing_user", str(spec.variantId)) end
if subscriptionId == "" then return done("ignored", "ignore", "missing_subscription", str(spec.variantId)) end
local userId = devices[1]

local plan = str(spec.plan)
local variantId = str(spec.variantId)
if plan == "" or variantId == "" then
  local allow = spec.reuseStoredPlan == true or spec.action ~= "grant"
  if existing == nil or not allow or str(existing.plan) == "" or str(existing.variantId) == "" then
    return done("ignored", "ignore", "unknown_variant", str(spec.variantId))
  end
  if not priceOk(str(spec.currency), spec.amounts, str(existing.plan)) then
    return done("ignored", "ignore", "price_mismatch", str(existing.variantId))
  end
  plan = str(existing.plan)
  variantId = str(existing.variantId)
end

local endsAt = str(spec.endsAt)
local renewsAt = str(spec.renewsAt)
local active = false
if spec.action == "no_extend" then
  endsAt = existing and str(existing.endsAt) or ""
  renewsAt = existing and str(existing.renewsAt) or ""
  local untilMs = isoToMs(endsAt) or isoToMs(renewsAt) or 0
  active = existing ~= nil and existing.active == true and untilMs > nowMs
elseif spec.action == "pause" then
  endsAt = existing and str(existing.endsAt) or ""
  renewsAt = existing and str(existing.renewsAt) or ""
  active = false
elseif spec.action == "revoke" then
  endsAt = mergeDate(spec.dateMode, str(spec.endsAt), existing and str(existing.endsAt) or "")
  renewsAt = mergeDate(spec.dateMode, str(spec.renewsAt), existing and str(existing.renewsAt) or "")
  active = false
else
  endsAt = mergeDate(spec.dateMode, str(spec.endsAt), existing and str(existing.endsAt) or "")
  renewsAt = mergeDate(spec.dateMode, str(spec.renewsAt), existing and str(existing.renewsAt) or "")
  local untilMs = isoToMs(endsAt) or isoToMs(renewsAt) or 0
  active = untilMs > nowMs
end

local holdRefund = existing ~= nil and existing.refunded == true and spec.action == "grant" and spec.reason ~= "payment_success"
if holdRefund then
  if str(spec.renewsAt) ~= "" then endsAt = str(spec.endsAt) end
  active = false
end

local updatedAt = str(spec.eventTime)
if updatedAt == "" and existing ~= nil then updatedAt = str(existing.updatedAt) end
local updatedAtMs = millis(spec.updatedAtMs)
if updatedAtMs == nil and existing ~= nil then updatedAtMs = millis(existing.updatedAtMs) end
if updatedAtMs == nil then updatedAtMs = 0 end

local refunded = existing ~= nil and existing.refunded == true
local refundEndsAt = existing and str(existing.refundEndsAt) or ""
local refundClearedAtMs = existing and millis(existing.refundClearedAtMs) or nil
if spec.refund == true then
  refunded = true
  refundEndsAt = endsAt
  refundClearedAtMs = nil
end
if spec.action == "grant" and spec.reason == "payment_success" then
  local wasRefunded = refunded
  refunded = false
  if wasRefunded and str(spec.endsAt) == "" then
    if refundEndsAt ~= "" then
      if endsAt == refundEndsAt then endsAt = "" end
    elseif renewsAt == "" then
      endsAt = ""
    end
  end
  if wasRefunded then
    local untilMs = isoToMs(endsAt) or isoToMs(renewsAt) or 0
    active = untilMs > nowMs
    refundClearedAtMs = updatedAtMs
  end
end

local record = {
  subscriptionId = subscriptionId,
  userId = userId,
  devices = devices,
  plan = plan,
  variantId = variantId,
  status = str(spec.status) ~= "" and spec.status or spec.reason,
  active = active,
  endsAt = endsAt ~= "" and endsAt or cjson.null,
  renewsAt = renewsAt ~= "" and renewsAt or cjson.null,
  updatedAt = updatedAt,
  updatedAtMs = updatedAtMs,
  refunded = refunded,
  refundEndsAt = refundEndsAt ~= "" and refundEndsAt or cjson.null,
  refundClearedAtMs = refundClearedAtMs ~= nil and refundClearedAtMs or cjson.null,
  endsAtMs = isoToMs(endsAt) or 0,
  renewsAtMs = isoToMs(renewsAt) or 0,
  precedence = tonumber(spec.precedence) or 0,
  eventId = str(spec.eventId) ~= "" and spec.eventId or cjson.null,
}

redis.call("SET", prefix .. "sub:" .. subscriptionId, cjson.encode(record))

for _, deviceId in ipairs(devices) do
  local ids = readIndex(deviceId)
  if not contains(ids, subscriptionId) then table.insert(ids, subscriptionId) end
  writeIndex(deviceId, ids)
  pointUser(deviceId, ids, nowMs)
end

local orderId = str(spec.orderId)
if orderId ~= "" and string.match(orderId, "^[A-Za-z0-9_%-]+$") and #orderId <= 64 then
  redis.call("SET", prefix .. "order:" .. orderId, cjson.encode({ subscriptionId = subscriptionId }))
end

return done("applied", spec.action, spec.reason, variantId)
`;

export const EVENT_TTL_SECONDS = 60 * 60 * 24 * 45;

/**
 * One EVAL for support attaching an install id.
 *
 * ARGV[1] prefix, ARGV[2] subscription id, ARGV[3] install id, ARGV[4] order
 * id, ARGV[5] device cap, ARGV[6] now in milliseconds (pointer ranking only;
 * it is not written onto the subscription). The order check, the refund
 * check, the cap, and every write happen here, so a refund EVAL cannot be
 * overwritten by a snapshot taken earlier.
 */
export const ATTACH_LUA = `
local prefix = ARGV[1]
local nowMs = tonumber(ARGV[6]) or 0
${LUA_HELPERS}
local subscriptionId = str(ARGV[2])
local installId = str(ARGV[3])
local orderId = str(ARGV[4])
local cap = tonumber(ARGV[5]) or 0

local function fail(reason)
  return cjson.encode({ ok = false, reason = reason, devices = {} })
end

if subscriptionId == "" then return fail("not_found") end
local raw = redis.call("GET", prefix .. "sub:" .. subscriptionId)
if not raw then return fail("not_found") end
local rec = cjson.decode(raw)
if type(rec) ~= "table" or str(rec.subscriptionId) ~= subscriptionId then return fail("not_found") end

local orderRaw = redis.call("GET", prefix .. "order:" .. orderId)
if not orderRaw then return fail("order_mismatch") end
local mapped = cjson.decode(orderRaw)
if type(mapped) ~= "table" or str(mapped.subscriptionId) ~= subscriptionId then return fail("order_mismatch") end

if rec.refunded == true then return fail("refunded") end

local devices = devicesOf(rec)
if not contains(devices, installId) then
  if #devices >= cap then return fail("device_cap") end
  table.insert(devices, installId)
end
local userId = devices[1]
if userId == nil or userId == "" then return fail("not_found") end
rec.devices = devices
rec.userId = userId
redis.call("SET", prefix .. "sub:" .. subscriptionId, cjson.encode(rec))

local ids = readIndex(installId)
if not contains(ids, subscriptionId) then table.insert(ids, subscriptionId) end
writeIndex(installId, ids)
pointUser(installId, ids, nowMs)

return cjson.encode({ ok = true, reason = "", devices = devices })
`;
