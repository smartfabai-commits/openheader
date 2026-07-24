// OpenHeader — popup UI
// Loaded as a Chrome extension, writes to chrome.storage = headers actually change behind the scenes.
// Opened directly as popup.html in a browser, there is no chrome API, so it runs in memory (= visual preview).

const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
let mem = null;

function defaultConfig() {
  return {
    enabled: false,
    activeProfile: "default",
    profiles: {
      default: {
        name: "Default",
        urlFilter: "",
        request: [{ name: "X-Debug", value: "1", op: "set", on: false }],
        response: [],
      },
    },
  };
}

async function loadConfig() {
  if (hasChrome) {
    const { config } = await chrome.storage.local.get("config");
    return config || defaultConfig();
  }
  if (!mem) mem = defaultConfig();
  return mem;
}
async function saveConfig(c) {
  if (hasChrome) await chrome.storage.local.set({ config: c });
  else mem = c;
}

const $ = (id) => document.getElementById(id);
let config;

function activeProfile() {
  return config.profiles[config.activeProfile];
}

function uid() {
  // Simple id that works both as an extension and in preview
  return "k" + Math.random().toString(36).slice(2, 9);
}

function render() {
  // Master
  $("master").checked = !!config.enabled;
  $("masterlabel").textContent = config.enabled ? "ON" : "OFF";
  $("masterlabel").style.color = config.enabled ? "var(--ok)" : "var(--muted)";

  // Profile list
  const sel = $("profile");
  sel.innerHTML = Object.keys(config.profiles)
    .map((k) => `<option value="${k}" ${k === config.activeProfile ? "selected" : ""}>${escapeHtml(config.profiles[k].name || k)}</option>`)
    .join("");

  const p = activeProfile();
  $("urlFilter").value = p.urlFilter || "";
  renderList("request", $("reqList"), p.request);
  renderList("response", $("resList"), p.response);
}

function renderList(kind, container, list) {
  if (!list || list.length === 0) {
    container.innerHTML = `<div class="empty">Nothing yet. Click “＋ Add” to create one.</div>`;
    return;
  }
  container.innerHTML = "";
  list.forEach((h, i) => {
    const row = document.createElement("div");
    row.className = "hrow" + (h.op === "remove" ? " remove" : "");
    row.innerHTML = `
      <input type="checkbox" class="chk" ${h.on ? "checked" : ""} title="Enable/disable">
      <input class="hname" placeholder="Header name" value="${escapeAttr(h.name || "")}">
      <input class="hval" placeholder="Value" value="${escapeAttr(h.value || "")}">
      <select class="hop">
        <option value="set" ${h.op !== "remove" ? "selected" : ""}>Set</option>
        <option value="remove" ${h.op === "remove" ? "selected" : ""}>Remove</option>
      </select>
      <button class="iconbtn del" title="Remove row">✕</button>`;

    row.querySelector(".chk").addEventListener("change", (e) => { h.on = e.target.checked; commit(); });
    row.querySelector(".hname").addEventListener("input", (e) => { h.name = e.target.value; commitSoft(); });
    row.querySelector(".hval").addEventListener("input", (e) => { h.value = e.target.value; commitSoft(); });
    row.querySelector(".hop").addEventListener("change", (e) => { h.op = e.target.value; commit(); });
    row.querySelector(".del").addEventListener("click", () => { list.splice(i, 1); commit(); });
    container.appendChild(row);
  });
}

// commit: save and re-render (for operations that change structure)
async function commit() { await saveConfig(config); render(); }
// commitSoft: while typing, save only without re-rendering (so focus is not lost)
let softTimer = null;
function commitSoft() {
  clearTimeout(softTimer);
  softTimer = setTimeout(() => saveConfig(config), 250);
}

function escapeHtml(s){return String(s).replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));}
function escapeAttr(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

async function init() {
  config = await loadConfig();

  if (!hasChrome) $("previewbadge").style.display = "block";

  $("master").addEventListener("change", (e) => { config.enabled = e.target.checked; commit(); });

  $("profile").addEventListener("change", (e) => { config.activeProfile = e.target.value; commit(); });

  $("addProfile").addEventListener("click", () => {
    const name = prompt("New profile name", "New profile");
    if (!name) return;
    const id = uid();
    config.profiles[id] = { name, urlFilter: "", request: [], response: [] };
    config.activeProfile = id;
    commit();
  });

  $("renameProfile").addEventListener("click", () => {
    const p = activeProfile();
    const name = prompt("Rename profile", p.name || "");
    if (!name) return;
    p.name = name; commit();
  });

  $("delProfile").addEventListener("click", () => {
    const keys = Object.keys(config.profiles);
    if (keys.length <= 1) { alert("You can't delete the last profile."); return; }
    if (!confirm("Delete this profile?")) return;
    delete config.profiles[config.activeProfile];
    config.activeProfile = Object.keys(config.profiles)[0];
    commit();
  });

  $("urlFilter").addEventListener("input", (e) => { activeProfile().urlFilter = e.target.value; commitSoft(); });

  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.add;
      activeProfile()[kind].push({ name: "", value: "", op: "set", on: true });
      commit();
    });
  });

  // Export: download all profiles as JSON (= migration from ModHeader / backup / sharing)
  $("exportBtn").addEventListener("click", () => {
    const data = JSON.stringify({ app: "OpenHeader", version: 1, profiles: config.profiles }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "openheader-profiles.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Import: load from JSON and add the profiles
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const profs = parsed.profiles || parsed;
        if (!profs || typeof profs !== "object") throw new Error("Invalid format");
        let added = 0;
        for (const key of Object.keys(profs)) {
          const p = profs[key] || {};
          const id = uid();
          config.profiles[id] = {
            name: p.name || key || "Imported",
            urlFilter: p.urlFilter || "",
            request: Array.isArray(p.request) ? p.request : [],
            response: Array.isArray(p.response) ? p.response : [],
          };
          config.activeProfile = id;
          added++;
        }
        if (!added) throw new Error("No profiles found");
        commit();
        alert("Imported " + added + " profile(s).");
      } catch (err) {
        alert("Import failed: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  $("proBtn").addEventListener("click", () => {
    alert("Pro (coming soon):\n• Profile sync across devices\n• One-click team sharing\n• Cloud backup\n\nCore header editing — including import/export — is free, forever.");
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
