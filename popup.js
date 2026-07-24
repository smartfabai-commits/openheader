// OpenHeader — ポップアップUI
// Chrome拡張として読み込めば chrome.storage に保存＝背後でヘッダーが実際に変わる。
// ブラウザで popup.html を直接開いた場合は chrome API が無いのでメモリ動作（＝見た目プレビュー）。

const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
let mem = null;

function defaultConfig() {
  return {
    enabled: false,
    activeProfile: "default",
    profiles: {
      default: {
        name: "デフォルト",
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
  // 拡張・プレビュー両対応の簡易ID
  return "k" + Math.random().toString(36).slice(2, 9);
}

function render() {
  // マスター
  $("master").checked = !!config.enabled;
  $("masterlabel").textContent = config.enabled ? "ON" : "OFF";
  $("masterlabel").style.color = config.enabled ? "var(--ok)" : "var(--muted)";

  // プロファイル一覧
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
    container.innerHTML = `<div class="empty">まだありません。「＋ 追加」で作成</div>`;
    return;
  }
  container.innerHTML = "";
  list.forEach((h, i) => {
    const row = document.createElement("div");
    row.className = "hrow" + (h.op === "remove" ? " remove" : "");
    row.innerHTML = `
      <input type="checkbox" class="chk" ${h.on ? "checked" : ""} title="有効/無効">
      <input class="hname" placeholder="ヘッダー名" value="${escapeAttr(h.name || "")}">
      <input class="hval" placeholder="値" value="${escapeAttr(h.value || "")}">
      <select class="hop">
        <option value="set" ${h.op !== "remove" ? "selected" : ""}>設定</option>
        <option value="remove" ${h.op === "remove" ? "selected" : ""}>削除</option>
      </select>
      <button class="iconbtn del" title="行を削除">✕</button>`;

    row.querySelector(".chk").addEventListener("change", (e) => { h.on = e.target.checked; commit(); });
    row.querySelector(".hname").addEventListener("input", (e) => { h.name = e.target.value; commitSoft(); });
    row.querySelector(".hval").addEventListener("input", (e) => { h.value = e.target.value; commitSoft(); });
    row.querySelector(".hop").addEventListener("change", (e) => { h.op = e.target.value; commit(); });
    row.querySelector(".del").addEventListener("click", () => { list.splice(i, 1); commit(); });
    container.appendChild(row);
  });
}

// commit: 保存して再描画（構造が変わる操作）
async function commit() { await saveConfig(config); render(); }
// commitSoft: テキスト入力中は再描画せず保存だけ（フォーカスを飛ばさない）
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
    const name = prompt("新しいプロファイル名", "新規プロファイル");
    if (!name) return;
    const id = uid();
    config.profiles[id] = { name, urlFilter: "", request: [], response: [] };
    config.activeProfile = id;
    commit();
  });

  $("renameProfile").addEventListener("click", () => {
    const p = activeProfile();
    const name = prompt("プロファイル名を変更", p.name || "");
    if (!name) return;
    p.name = name; commit();
  });

  $("delProfile").addEventListener("click", () => {
    const keys = Object.keys(config.profiles);
    if (keys.length <= 1) { alert("最後の1つは削除できません。"); return; }
    if (!confirm("このプロファイルを削除しますか？")) return;
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

  // エクスポート：全プロファイルをJSONでダウンロード（＝ModHeaderからの乗り換え/バックアップ/共有）
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

  // インポート：JSONから読み込んでプロファイルを追加
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const profs = parsed.profiles || parsed;
        if (!profs || typeof profs !== "object") throw new Error("形式が不正です");
        let added = 0;
        for (const key of Object.keys(profs)) {
          const p = profs[key] || {};
          const id = uid();
          config.profiles[id] = {
            name: p.name || key || "インポート",
            urlFilter: p.urlFilter || "",
            request: Array.isArray(p.request) ? p.request : [],
            response: Array.isArray(p.response) ? p.response : [],
          };
          config.activeProfile = id;
          added++;
        }
        if (!added) throw new Error("プロファイルが見つかりません");
        commit();
        alert(added + "件のプロファイルをインポートしました。");
      } catch (err) {
        alert("インポート失敗：" + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(file);
  });

  $("proBtn").addEventListener("click", () => {
    alert("Pro（近日）：\n・プロファイルの端末間同期\n・チームでワンクリック共有\n・設定のインポート/エクスポート\n\n基本のヘッダー編集はずっと無料です。");
  });

  render();
}

document.addEventListener("DOMContentLoaded", init);
