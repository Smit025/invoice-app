/**
 * Shared Lua for the Upstash webhook script. Redis rolls the whole script back
 * on error, so a failed EVAL does not leave a claimed event id behind. The
 * store still DELs the event key when the HTTP call itself fails, so Lemon can retry.
 */
const HELPERS = `
local function str(value)
  if value == nil or value == cjson.null then return "" end
  if type(value) ~= "string" then return "" end
  return value
end

local function isoToMs(iso)
  if type(iso) ~= "string" or iso == "" then return nil end
  local y, mo, d, h, mi, s, frac = iso:match("^(%d%d%d%d)%-(%d%d)%-(%d%d)T(%d%d):(%d%d):(%d%d)%.?(%d*)")
  if not y then return nil end
  y, mo, d, h, mi, s = tonumber(y), tonumber(mo), tonumber(d), tonumber(h), tonumber(mi), tonumber(s)
  local millis = 0
  if frac ~= nil and frac ~= "" then
    local digits = frac:sub(1, 3)
    millis = tonumber(digits) or 0
    if #digits == 1 then millis = millis * 100
    elseif #digits == 2 then millis = millis * 10 end
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
  return (days * 86400 + h * 3600 + mi * 60 + s) * 1000 + millis
end

local function accessEnd(rec)
  if rec == nil then return 0 end
  local endsMs = tonumber(rec.endsAtMs) or 0
  local renewsMs = tonumber(rec.renewsAtMs) or 0
  if endsMs > 0 then return endsMs end
  if renewsMs > 0 then return renewsMs end
  return isoToMs(str(rec.endsAt)) or isoToMs(str(rec.renewsAt)) or 0
end

local function rankOf(rec, nowMs)
  local finish = accessEnd(rec)
  local active = rec.active == true and rec.refunded ~= true and finish > nowMs
  local tier = 0
  if active then
    if string.sub(str(rec.subscriptionId), 1, 8) == "license:" then tier = 1 else tier = 2 end
  end
  local updated = tonumber(rec.updatedAtMs) or 0
  if active then return tier, finish, updated end
  return 0, 0, updated
end

local function better(rec, best, nowMs)
  local ta, ea, ua = rankOf(rec, nowMs)
  local tb, eb, ub = rankOf(best, nowMs)
  if ta ~= tb then return ta > tb end
  if ea ~= eb then return ea > eb end
  return ua > ub
end

local function readIndex(userId)
  if userId == "" then return {} end
  local raw = redis.call("GET", "inv:idx:" .. userId)
  if not raw then return {} end
  local decoded = cjson.decode(raw)
  if type(decoded) ~= "table" then return {} end
  return decoded
end

local function writeIndex(userId, ids)
  if userId == "" then return end
  redis.call("SET", "inv:idx:" .. userId, cjson.encode(ids))
end

local function bestId(ids, nowMs)
  local best = nil
  for _, id in ipairs(ids) do
    local raw = redis.call("GET", "inv:sub:" .. id)
    if raw then
      local rec = cjson.decode(raw)
      if rec and str(rec.userId) ~= "" then
        if best == nil or better(rec, best, nowMs) then best = rec end
      end
    end
  end
  if best == nil then return "" end
  return str(best.subscriptionId)
end

local function pointUser(userId, ids, nowMs)
  if userId == "" then return end
  local chosen = bestId(ids, nowMs)
  if chosen == "" then
    redis.call("DEL", "inv:user:" .. userId)
  else
    redis.call("SET", "inv:user:" .. userId, chosen)
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
`;

export const WEBHOOK_LUA = `${HELPERS}
local ttl = tonumber(ARGV[1])
local spec = cjson.decode(ARGV[2])
local nowMs = tonumber(spec.nowMs) or 0

if str(spec.eventId) ~= "" then
  local claimed = redis.call("SET", "inv:event:" .. spec.eventId, "1", "NX", "EX", ttl)
  if not claimed then
    return cjson.encode({
      result = "duplicate",
      action = "duplicate",
      variantId = str(spec.variantId),
      reason = "duplicate_event",
    })
  end
end

local subscriptionId = str(spec.subjectId)
local existing = nil
if subscriptionId ~= "" then
  local raw = redis.call("GET", "inv:sub:" .. subscriptionId)
  if raw then existing = cjson.decode(raw) end
end

if existing == nil and str(spec.userId) ~= "" and spec.action == "revoke" then
  local ids = readIndex(spec.userId)
  local chosen = bestId(ids, nowMs)
  if chosen ~= "" then
    local raw = redis.call("GET", "inv:sub:" .. chosen)
    if raw then
      existing = cjson.decode(raw)
      if subscriptionId == "" then subscriptionId = chosen end
    end
  end
end

local function done(result, action, reason, variantId)
  return cjson.encode({
    result = result,
    action = action,
    variantId = variantId or "",
    reason = reason,
  })
end

if existing ~= nil and tonumber(spec.updatedAtMs) < (tonumber(existing.updatedAtMs) or 0) then
  return done("stale", "stale", "stale_event", str(spec.variantId) ~= "" and spec.variantId or str(existing.variantId))
end

if existing ~= nil and str(spec.userId) ~= "" and str(existing.userId) ~= spec.userId then
  return done("ignored", "ignore", "user_mismatch", spec.variantId)
end

if existing ~= nil and existing.refunded == true and spec.action == "grant" and spec.reason ~= "payment_success" then
  return done("ignored", "ignore", "refunded", str(spec.variantId) ~= "" and spec.variantId or str(existing.variantId))
end

local userId = str(spec.userId)
if userId == "" and existing ~= nil then userId = str(existing.userId) end
if userId == "" then return done("ignored", "ignore", "missing_user", spec.variantId) end
if subscriptionId == "" then return done("ignored", "ignore", "missing_subscription", spec.variantId) end

local plan = str(spec.plan)
local variantId = str(spec.variantId)
if plan == "" or variantId == "" then
  local allow = spec.reuseStoredPlan == true or spec.action ~= "grant"
  if existing == nil or not allow or str(existing.plan) == "" or str(existing.variantId) == "" then
    return done("ignored", "ignore", "unknown_variant", spec.variantId)
  end
  if not priceOk(str(spec.currency), spec.amounts, str(existing.plan)) then
    return done("ignored", "ignore", "price_mismatch", existing.variantId)
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

local refunded = existing ~= nil and existing.refunded == true
if spec.refund == true then refunded = true end
if spec.action == "grant" and spec.reason == "payment_success" then refunded = false end

local record = {
  subscriptionId = subscriptionId,
  userId = userId,
  plan = plan,
  variantId = variantId,
  status = str(spec.status) ~= "" and spec.status or spec.reason,
  active = active,
  endsAt = endsAt ~= "" and endsAt or cjson.null,
  renewsAt = renewsAt ~= "" and renewsAt or cjson.null,
  updatedAt = str(spec.eventTime) ~= "" and spec.eventTime or spec.nowIso,
  updatedAtMs = tonumber(spec.updatedAtMs) or nowMs,
  refunded = refunded,
  endsAtMs = isoToMs(endsAt) or 0,
  renewsAtMs = isoToMs(renewsAt) or 0,
}

if existing ~= nil and str(existing.userId) ~= "" and str(existing.userId) ~= userId then
  local oldIds = readIndex(str(existing.userId))
  local kept = {}
  for _, id in ipairs(oldIds) do
    if id ~= subscriptionId then table.insert(kept, id) end
  end
  writeIndex(str(existing.userId), kept)
  pointUser(str(existing.userId), kept, nowMs)
end

local ids = readIndex(userId)
local seen = false
for _, id in ipairs(ids) do
  if id == subscriptionId then seen = true end
end
if not seen then table.insert(ids, subscriptionId) end
redis.call("SET", "inv:sub:" .. subscriptionId, cjson.encode(record))
writeIndex(userId, ids)
pointUser(userId, ids, nowMs)

if str(spec.orderId) ~= "" and str(spec.emailHash) ~= "" and string.match(spec.orderId, "^[A-Za-z0-9_%-]+$") then
  redis.call("SET", "inv:order:" .. spec.orderId, cjson.encode({
    subscriptionId = subscriptionId,
    emailHash = spec.emailHash,
  }))
end

return done("applied", spec.action, spec.reason, variantId)
`;

export const REBIND_LUA = `${HELPERS}
local spec = cjson.decode(ARGV[1])
local nowMs = tonumber(spec.nowMs) or 0
local subscriptionId = str(spec.subscriptionId)
local userId = str(spec.userId)
if subscriptionId == "" or userId == "" then
  return cjson.encode({ result = "refunded" })
end

local existing = nil
local raw = redis.call("GET", "inv:sub:" .. subscriptionId)
if raw then existing = cjson.decode(raw) end
if existing ~= nil and existing.refunded == true then
  return cjson.encode({ result = "refunded" })
end

if existing ~= nil and str(existing.userId) ~= "" and str(existing.userId) ~= userId then
  local oldIds = readIndex(str(existing.userId))
  local kept = {}
  for _, id in ipairs(oldIds) do
    if id ~= subscriptionId then table.insert(kept, id) end
  end
  writeIndex(str(existing.userId), kept)
  pointUser(str(existing.userId), kept, nowMs)
end

local record = {
  subscriptionId = subscriptionId,
  userId = userId,
  plan = str(spec.plan),
  variantId = str(spec.variantId),
  status = str(spec.status),
  active = spec.active == true,
  endsAt = str(spec.endsAt) ~= "" and spec.endsAt or cjson.null,
  renewsAt = str(spec.renewsAt) ~= "" and spec.renewsAt or cjson.null,
  updatedAt = str(spec.updatedAt),
  updatedAtMs = tonumber(spec.updatedAtMs) or nowMs,
  refunded = false,
  endsAtMs = isoToMs(str(spec.endsAt)) or 0,
  renewsAtMs = isoToMs(str(spec.renewsAt)) or 0,
}
redis.call("SET", "inv:sub:" .. subscriptionId, cjson.encode(record))
local ids = readIndex(userId)
local seen = false
for _, id in ipairs(ids) do
  if id == subscriptionId then seen = true end
end
if not seen then table.insert(ids, subscriptionId) end
writeIndex(userId, ids)
pointUser(userId, ids, nowMs)
return cjson.encode({ result = "applied" })
`;

export const EVENT_TTL_SECONDS = 60 * 60 * 24 * 45;
