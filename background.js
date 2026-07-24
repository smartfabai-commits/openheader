// OpenHeader — the heart of header rewriting (Service Worker)
// Reads the config, converts it into declarativeNetRequest dynamic rules, and applies them.
// It does NOT intercept network traffic; it only "declares" header changes to Chrome's
// official rule engine. The extension itself never reads or sends any traffic (= untrackable by design).

const RULE_ID = 1;
const RESOURCE_TYPES = [
  "main_frame", "sub_frame", "stylesheet", "script", "image",
  "font", "object", "xmlhttprequest", "ping", "media", "websocket", "other",
];

function defaultConfig() {
  return {
    enabled: false,
    activeProfile: "default",
    profiles: {
      default: { name: "Default", urlFilter: "", request: [], response: [] },
    },
  };
}

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  return config || defaultConfig();
}

function toOps(list) {
  return (list || [])
    .filter((h) => h && h.on && h.name && h.name.trim())
    .map((h) =>
      h.op === "remove"
        ? { header: h.name.trim(), operation: "remove" }
        : { header: h.name.trim(), operation: "set", value: String(h.value == null ? "" : h.value) }
    );
}

function buildRule(config) {
  if (!config.enabled) return null;
  const p = config.profiles[config.activeProfile];
  if (!p) return null;
  const req = toOps(p.request);
  const res = toOps(p.response);
  if (req.length === 0 && res.length === 0) return null;

  const action = { type: "modifyHeaders" };
  if (req.length) action.requestHeaders = req;
  if (res.length) action.responseHeaders = res;

  const condition = { resourceTypes: RESOURCE_TYPES };
  const filter = (p.urlFilter || "").trim();
  if (filter) condition.urlFilter = filter;

  return { id: RULE_ID, priority: 1, action, condition };
}

async function apply() {
  try {
    const config = await getConfig();
    const rule = buildRule(config);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID],
      addRules: rule ? [rule] : [],
    });
    const active = !!(config.enabled && rule);
    await chrome.action.setBadgeText({ text: active ? "ON" : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  } catch (e) {
    console.error("OpenHeader apply error:", e);
  }
}

chrome.runtime.onInstalled.addListener(apply);
chrome.runtime.onStartup.addListener(apply);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.config) apply();
});
