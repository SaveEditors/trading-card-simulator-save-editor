(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/lib/codec.js
  var codec_exports = {};
  __export(codec_exports, {
    decodeToJson: () => decodeToJson,
    encodeFromJson: () => encodeFromJson
  });
  function u8(input) {
    return input instanceof Uint8Array ? input : new Uint8Array(input);
  }
  function looksLikeBase64Text(text) {
    const t = text.trim();
    if (t.length < 64) return false;
    if (t.length % 4 !== 0) return false;
    const ok = /^[A-Za-z0-9+/_=-]+$/.test(t);
    if (!ok) return false;
    if (t[0] === "{" || t[0] === "[") return false;
    return true;
  }
  function b64ToBytes(text) {
    let t = text.trim().replace(/[\r\n\s]+/g, "");
    t = t.replace(/-/g, "+").replace(/_/g, "/");
    while (t.length % 4 !== 0) t += "=";
    const bin = atob(t);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToUtf8(bytes) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  async function decompress(bytes, kind) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser does not support DecompressionStream. Use Chrome/Edge, or provide an uncompressed JSON save.");
    }
    const ds = new DecompressionStream(kind);
    const inStream = new Blob([bytes]).stream().pipeThrough(ds);
    const out = await new Response(inStream).arrayBuffer();
    return new Uint8Array(out);
  }
  async function compress(bytes, kind) {
    if (typeof CompressionStream !== "function") {
      throw new Error("This browser does not support CompressionStream. Use Chrome/Edge to re-save compressed saves.");
    }
    const cs = new CompressionStream(kind);
    const inStream = new Blob([bytes]).stream().pipeThrough(cs);
    const out = await new Response(inStream).arrayBuffer();
    return new Uint8Array(out);
  }
  function sniff(bytes) {
    const b = u8(bytes);
    if (b.length >= 2 && b[0] === 31 && b[1] === 139) return { kind: "gzip" };
    if (b.length >= 2 && b[0] === 120 && (b[1] === 1 || b[1] === 156 || b[1] === 218)) return { kind: "deflate" };
    if (b.length >= 1 && (b[0] === 123 || b[0] === 91)) return { kind: "json" };
    return { kind: "unknown" };
  }
  async function decodeToJson(bytes) {
    const original = u8(bytes);
    const head = original.slice(0, 1);
    if (head[0] === 123 || head[0] === 91) {
      const text = bytesToUtf8(original);
      return { json: JSON.parse(text), codec: { kind: "json" }, originalBytes: original };
    }
    const s = sniff(original);
    if (s.kind === "gzip" || s.kind === "deflate") {
      const decompressed = await decompress(original, s.kind);
      const text = bytesToUtf8(decompressed);
      return { json: JSON.parse(text), codec: { kind: s.kind }, originalBytes: original };
    }
    const asText = bytesToUtf8(original);
    if (looksLikeBase64Text(asText)) {
      const urlSafe = /[-_]/.test(asText);
      const inner = b64ToBytes(asText);
      const s2 = sniff(inner);
      if (s2.kind === "gzip" || s2.kind === "deflate") {
        const decompressed = await decompress(inner, s2.kind);
        const text = bytesToUtf8(decompressed);
        return { json: JSON.parse(text), codec: { kind: "base64", urlSafe, inner: { kind: s2.kind } }, originalBytes: original };
      }
      if (s2.kind === "json") {
        const text = bytesToUtf8(inner);
        return { json: JSON.parse(text), codec: { kind: "base64", urlSafe, inner: { kind: "json" } }, originalBytes: original };
      }
    }
    throw new Error("Unsupported save encoding. Expected JSON, gzip/deflate JSON, or base64-wrapped JSON.");
  }
  async function encodeFromJson(json, codec) {
    const text = JSON.stringify(json);
    const raw = new TextEncoder().encode(text);
    const c = codec?.kind ?? "json";
    if (c === "json") return { bytes: raw, mime: "application/json" };
    if (c === "gzip" || c === "deflate") {
      const zipped = await compress(raw, c);
      return { bytes: zipped, mime: "application/octet-stream" };
    }
    if (c === "base64") {
      const innerKind = codec?.inner?.kind ?? "json";
      let innerBytes = raw;
      if (innerKind === "gzip" || innerKind === "deflate") innerBytes = await compress(raw, innerKind);
      let bin = "";
      const chunk = 32768;
      for (let i = 0; i < innerBytes.length; i += chunk) {
        const sub = innerBytes.subarray(i, i + chunk);
        bin += String.fromCharCode(...sub);
      }
      let b64 = btoa(bin);
      if (codec?.urlSafe) b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
      const out = new TextEncoder().encode(b64);
      return { bytes: out, mime: "text/plain" };
    }
    return { bytes: raw, mime: "application/json" };
  }
  var init_codec = __esm({
    "src/lib/codec.js"() {
    }
  });

  // src/lib/dom.js
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs ?? {})) {
      if (k === "class") node.className = v;
      else if (k === "style") Object.assign(node.style, v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v === false || v == null) continue;
      else if (v === true) node.setAttribute(k, "");
      else node.setAttribute(k, String(v));
    }
    for (const child of children.flat()) {
      if (child == null) continue;
      if (typeof child === "string") node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }
  function fmtNumber(n4) {
    if (n4 == null || Number.isNaN(n4)) return "\u2014";
    const abs = Math.abs(n4);
    const decimals = abs < 1e3 ? 2 : 0;
    return new Intl.NumberFormat(void 0, { maximumFractionDigits: decimals }).format(n4);
  }
  function nowStamp() {
    const d = /* @__PURE__ */ new Date();
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  // src/lib/fs.js
  init_codec();
  function supportsFilePicker() {
    return typeof window.showOpenFilePicker === "function";
  }
  async function readFileHandle(handle) {
    const file = await handle.getFile();
    const ab = await file.arrayBuffer();
    return { file, bytes: new Uint8Array(ab) };
  }
  async function readFirstByte(file) {
    const ab = await file.slice(0, 1).arrayBuffer();
    const b = new Uint8Array(ab);
    return b[0] ?? 0;
  }
  async function* walkDir(dirHandle, { maxDepth = 7, depth = 0 } = {}) {
    if (depth > maxDepth) return;
    for await (const [name, handle] of dirHandle.entries()) {
      if (handle.kind === "file") yield { name, fileHandle: handle, depth };
      else if (handle.kind === "directory") yield* walkDir(handle, { maxDepth, depth: depth + 1 });
    }
  }
  async function openSaveFileAny() {
    if (supportsFilePicker()) {
      const [handle] = await window.showOpenFilePicker({ multiple: false, excludeAcceptAllOption: false });
      if (!handle) return null;
      const { file, bytes } = await readFileHandle(handle);
      const decoded = await decodeToJson(bytes);
      return {
        source: {
          mode: "file",
          fileHandle: handle,
          dirHandle: null,
          displayName: file.name,
          codec: decoded.codec,
          originalBytes: decoded.originalBytes
        },
        save: decoded.json
      };
    }
    const input = document.createElement("input");
    input.type = "file";
    return await new Promise((resolve) => {
      input.addEventListener("change", async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        const ab = await f.arrayBuffer();
        const bytes = new Uint8Array(ab);
        try {
          const decoded = await decodeToJson(bytes);
          resolve({
            source: { mode: "drop", fileHandle: null, dirHandle: null, displayName: f.name, codec: decoded.codec, originalBytes: decoded.originalBytes },
            save: decoded.json
          });
        } catch (e) {
          resolve({ error: e });
        }
      });
      input.click();
    });
  }
  function isLikelyPayloadFirstByte(first) {
    return first === 123 || first === 91 || first === 31 || first === 120;
  }
  async function decodeFirstDecodable(candidates) {
    let lastErr = null;
    for (const c of candidates.slice(0, 25)) {
      try {
        const ab = await c.file.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const decoded = await decodeToJson(bytes);
        return { ok: true, candidate: c, decoded };
      } catch (e) {
        lastErr = e;
      }
    }
    return { ok: false, error: lastErr ?? new Error("No decodable save payload found.") };
  }
  async function openSaveFolderFromDirectoryHandle(dirHandle) {
    if (!dirHandle) return null;
    const candidates = [];
    for await (const entry of walkDir(dirHandle, { maxDepth: 8 })) {
      const file = await entry.fileHandle.getFile();
      if (file.size < 256) continue;
      const first = await readFirstByte(file);
      if (!isLikelyPayloadFirstByte(first)) continue;
      candidates.push({ ...entry, file });
    }
    candidates.sort((a, b) => b.file.size - a.file.size);
    if (!candidates.length) return null;
    const picked = await decodeFirstDecodable(candidates);
    if (!picked.ok) throw picked.error;
    const { candidate: c, decoded } = picked;
    return {
      source: {
        mode: "folder",
        fileHandle: c.fileHandle,
        dirHandle,
        displayName: c.file.name,
        codec: decoded.codec,
        originalBytes: decoded.originalBytes
      },
      save: decoded.json
    };
  }
  async function writeBack(source, save) {
    if (!source?.fileHandle) throw new Error("No file handle available for write-back.");
    const { bytes } = await encodeFromJson(save, source.codec);
    const writable = await source.fileHandle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }
  function downloadBytes(filename, bytes, mime = "application/octet-stream") {
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }
  async function backupBesideIfPossible(source, bytes, { suffix = "bak" } = {}) {
    const base = source?.displayName ?? "save";
    const name = `${base}.${suffix}-${nowStamp()}`;
    if (source?.dirHandle && typeof source.dirHandle.getFileHandle === "function") {
      const h = await source.dirHandle.getFileHandle(name, { create: true });
      const writable = await h.createWritable();
      await writable.write(bytes);
      await writable.close();
      return { kind: "wrote", name };
    }
    downloadBytes(`${name}`, bytes);
    return { kind: "downloaded", name };
  }
  async function pickFolderFilesViaInput() {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.webkitdirectory = true;
    return await new Promise((resolve) => {
      input.addEventListener("change", () => {
        const files = Array.from(input.files ?? []);
        resolve(files.length ? files : null);
      });
      input.click();
    });
  }
  async function openSaveFolderViaInputFallback() {
    const files = await pickFolderFilesViaInput();
    if (!files) return null;
    const candidates = files.filter((f) => (f?.size ?? 0) >= 256).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).slice(0, 60);
    const asCandidates = candidates.map((file) => ({ file, name: file.name, fileHandle: null, depth: 0 }));
    const picked = await decodeFirstDecodable(asCandidates);
    if (!picked.ok) throw picked.error;
    const { candidate: c, decoded } = picked;
    return {
      source: {
        mode: "folder-fallback",
        fileHandle: null,
        dirHandle: null,
        displayName: c.file.name,
        codec: decoded.codec,
        originalBytes: decoded.originalBytes
      },
      save: decoded.json
    };
  }

  // src/app.js
  init_codec();

  // src/lib/save.js
  var REQUIRED_KEYS = [
    "m_PlayerName",
    "m_CoinAmountDouble",
    "m_ShopLevel",
    "m_CurrentDay",
    "m_CurrentTotalItemCountList",
    "m_SetItemPriceList",
    "m_GeneratedMarketPriceList",
    "m_StockSoldList",
    "m_CardCollectedList",
    "m_IsCardCollectedList",
    "m_CardPriceSetList",
    "m_GenCardMarketPriceList"
  ];
  function detectTcgShopSave(obj) {
    if (!obj || typeof obj !== "object") return { ok: false, missing: REQUIRED_KEYS };
    const missing = REQUIRED_KEYS.filter((k) => !(k in obj));
    return { ok: missing.length === 0, missing };
  }
  function normalizeForWrite(save) {
    if (typeof save.m_CoinAmountDouble === "number" && "m_CoinAmount" in save) {
      save.m_CoinAmount = save.m_CoinAmountDouble;
    }
    return save;
  }
  function summarizeSave(save) {
    if (!save) return {};
    return {
      playerName: typeof save.m_PlayerName === "string" ? save.m_PlayerName : null,
      coins: typeof save.m_CoinAmountDouble === "number" ? save.m_CoinAmountDouble : null,
      day: Number.isFinite(save.m_CurrentDay) ? save.m_CurrentDay : null,
      shopLevel: Number.isFinite(save.m_ShopLevel) ? save.m_ShopLevel : null
    };
  }
  function buildItemRows(save) {
    const n4 = Array.isArray(save.m_CurrentTotalItemCountList) ? save.m_CurrentTotalItemCountList.length : 0;
    const rows = [];
    for (let i = 0; i < n4; i++) {
      rows.push({
        id: i,
        count: save.m_CurrentTotalItemCountList?.[i] ?? 0,
        setPrice: save.m_SetItemPriceList?.[i] ?? 0,
        avgCost: save.m_AverageItemCostList?.[i] ?? 0,
        genCost: save.m_GeneratedCostPriceList?.[i] ?? 0,
        market: save.m_GeneratedMarketPriceList?.[i] ?? 0,
        pct: save.m_ItemPricePercentChangeList?.[i] ?? 0,
        sold: save.m_StockSoldList?.[i] ?? 0,
        licensed: Array.isArray(save.m_IsItemLicenseUnlocked) ? !!save.m_IsItemLicenseUnlocked?.[i] : null
      });
    }
    return rows;
  }
  var CARD_EXPANSIONS = [
    { key: "base", suffix: "", label: "Base" },
    { key: "destiny", suffix: "Destiny", label: "Destiny" },
    { key: "ghost", suffix: "Ghost", label: "Ghost" },
    { key: "ghostBlack", suffix: "GhostBlack", label: "Ghost (Black)" },
    { key: "megabot", suffix: "Megabot", label: "Megabot" },
    { key: "fantasyRPG", suffix: "FantasyRPG", label: "Fantasy RPG" },
    { key: "catJob", suffix: "CatJob", label: "Cat Job" }
  ];
  function getCardExpansions() {
    return CARD_EXPANSIONS.slice();
  }
  function getCardLists(save, suffix) {
    const s = suffix ?? "";
    return {
      owned: save[`m_CardCollectedList${s}`],
      collected: save[`m_IsCardCollectedList${s}`],
      setPrice: save[`m_CardPriceSetList${s}`],
      market: save[`m_GenCardMarketPriceList${s}`]
    };
  }

  // src/ui/player.js
  function numberField({ label, tip, value, min = 0, step = "1", disabled = false, onChange }) {
    const input = el("input", { type: "number", value: String(value ?? 0), min: String(min), step: String(step), disabled });
    input.addEventListener("change", () => {
      const n4 = Number(input.value);
      onChange?.(Number.isFinite(n4) ? n4 : value);
    });
    return el(
      "div",
      { class: "field" },
      el("label", {}, el("span", {}, label), tip ? el("span", { class: "tiny muted", title: tip }, "?") : null),
      input
    );
  }
  function textField({ label, tip, value, disabled = false, onChange }) {
    const input = el("input", { type: "text", value: String(value ?? ""), disabled });
    input.addEventListener("change", () => onChange?.(input.value));
    return el(
      "div",
      { class: "field" },
      el("label", {}, el("span", {}, label), tip ? el("span", { class: "tiny muted", title: tip }, "?") : null),
      input
    );
  }
  function boolSelect({ label, tip, value, disabled = false, onChange }) {
    const input = el(
      "select",
      { disabled },
      el("option", { value: "false", selected: String(!!value) === "false" }, "False"),
      el("option", { value: "true", selected: String(!!value) === "true" }, "True")
    );
    input.addEventListener("change", () => onChange?.(input.value === "true"));
    return el(
      "div",
      { class: "field" },
      el("label", {}, el("span", {}, label), tip ? el("span", { class: "tiny muted", title: tip }, "?") : null),
      input
    );
  }
  function renderPlayerPanel({ save, onEdit }) {
    const grid = el("div", { class: "grid" });
    const player = el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Player Card"),
      el("div", { class: "card__desc" }, "Currency, levels, and the stats you most often want to tweak."),
      textField({
        label: "Player Name",
        tip: "Name shown in the shop / UI.",
        value: save.m_PlayerName,
        onChange: (v) => {
          save.m_PlayerName = String(v ?? "");
          onEdit?.();
        }
      }),
      numberField({
        label: "Coins (Wallet)",
        tip: "Updates both m_CoinAmountDouble and m_CoinAmount (when present).",
        value: save.m_CoinAmountDouble,
        step: "0.01",
        min: 0,
        onChange: (n4) => {
          const v = Math.max(0, n4);
          save.m_CoinAmountDouble = v;
          if ("m_CoinAmount" in save) save.m_CoinAmount = v;
          onEdit?.();
        }
      }),
      numberField({
        label: "Fame Points",
        tip: "Your shop fame progression.",
        value: save.m_FamePoint,
        min: 0,
        onChange: (n4) => {
          save.m_FamePoint = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Total Fame Added",
        tip: "Cumulative fame delta tracking.",
        value: save.m_TotalFameAdd,
        min: 0,
        onChange: (n4) => {
          save.m_TotalFameAdd = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Current Day",
        tip: "Day counter (used by schedules/bills).",
        value: save.m_CurrentDay,
        min: 0,
        onChange: (n4) => {
          save.m_CurrentDay = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Shop Level",
        tip: "Shop level (unlocks often depend on it).",
        value: save.m_ShopLevel,
        min: 0,
        onChange: (n4) => {
          save.m_ShopLevel = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Shop XP",
        tip: "Experience points towards shop level.",
        value: save.m_ShopExpPoint,
        min: 0,
        onChange: (n4) => {
          save.m_ShopExpPoint = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      })
    );
    const shop = el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Shop State"),
      el("div", { class: "card__desc" }, "Open/closed state, unlock toggles, and room counters."),
      boolSelect({
        label: "Shop Open (m_IsShopOpen)",
        tip: "If you change this mid-day, verify behavior in-game.",
        value: save.m_IsShopOpen,
        onChange: (v) => {
          save.m_IsShopOpen = !!v;
          onEdit?.();
        }
      }),
      boolSelect({
        label: "Shop Once Opened (m_IsShopOnceOpen)",
        tip: "Tracks whether the shop has ever been opened.",
        value: save.m_IsShopOnceOpen,
        onChange: (v) => {
          save.m_IsShopOnceOpen = !!v;
          onEdit?.();
        }
      }),
      boolSelect({
        label: "Warehouse Door Closed (m_IsWarehouseDoorClosed)",
        tip: "Door state tracking.",
        value: save.m_IsWarehouseDoorClosed,
        onChange: (v) => {
          save.m_IsWarehouseDoorClosed = !!v;
          onEdit?.();
        }
      }),
      boolSelect({
        label: "Warehouse Room Unlocked (m_IsWarehouseRoomUnlocked)",
        tip: "Main toggle for warehouse availability. Room counts are separate.",
        value: save.m_IsWarehouseRoomUnlocked,
        onChange: (v) => {
          save.m_IsWarehouseRoomUnlocked = !!v;
          onEdit?.();
        }
      }),
      numberField({
        label: "Unlocked Rooms (Shop) (m_UnlockRoomCount)",
        tip: "How many shop rooms you have unlocked.",
        value: save.m_UnlockRoomCount,
        min: 0,
        onChange: (n4) => {
          save.m_UnlockRoomCount = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Unlocked Rooms (Warehouse) (m_UnlockWarehouseRoomCount)",
        tip: "How many warehouse rooms you have unlocked.",
        value: save.m_UnlockWarehouseRoomCount,
        min: 0,
        onChange: (n4) => {
          save.m_UnlockWarehouseRoomCount = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      })
    );
    const tools = el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Workbench + Quick Fill"),
      el("div", { class: "card__desc" }, "Limits and filters used by workbench and quick-fill automation features."),
      numberField({
        label: "Workbench: Minimum Card Limit",
        tip: "m_WorkbenchMinimumCardLimit",
        value: save.m_WorkbenchMinimumCardLimit,
        min: 0,
        onChange: (n4) => {
          save.m_WorkbenchMinimumCardLimit = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Workbench: Price Limit",
        tip: "m_WorkbenchPriceLimit",
        value: save.m_WorkbenchPriceLimit,
        min: 0,
        step: "0.01",
        onChange: (n4) => {
          save.m_WorkbenchPriceLimit = Math.max(0, n4);
          onEdit?.();
        }
      }),
      numberField({
        label: "Workbench: Price Minimum",
        tip: "m_WorkbenchPriceMinimum",
        value: save.m_WorkbenchPriceMinimum,
        min: 0,
        step: "0.01",
        onChange: (n4) => {
          save.m_WorkbenchPriceMinimum = Math.max(0, n4);
          onEdit?.();
        }
      }),
      numberField({
        label: "Workbench: Rarity Limit",
        tip: "m_WorkbenchRarityLimit",
        value: save.m_WorkbenchRarityLimit,
        min: 0,
        onChange: (n4) => {
          save.m_WorkbenchRarityLimit = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Workbench: Card Expansion Type",
        tip: "m_WorkbenchCardExpansionType (internal enum index)",
        value: save.m_WorkbenchCardExpansionType,
        min: 0,
        onChange: (n4) => {
          save.m_WorkbenchCardExpansionType = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      el("div", { class: "divider" }),
      numberField({
        label: "Quick Fill: Minimum Card Limit",
        tip: "m_QuickFillMinimumCardLimit",
        value: save.m_QuickFillMinimumCardLimit,
        min: 0,
        onChange: (n4) => {
          save.m_QuickFillMinimumCardLimit = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Quick Fill: Price Limit",
        tip: "m_QuickFillPriceLimit",
        value: save.m_QuickFillPriceLimit,
        min: 0,
        step: "0.01",
        onChange: (n4) => {
          save.m_QuickFillPriceLimit = Math.max(0, n4);
          onEdit?.();
        }
      }),
      numberField({
        label: "Quick Fill: Price Minimum",
        tip: "m_QuickFillPriceMinimum",
        value: save.m_QuickFillPriceMinimum,
        min: 0,
        step: "0.01",
        onChange: (n4) => {
          save.m_QuickFillPriceMinimum = Math.max(0, n4);
          onEdit?.();
        }
      }),
      numberField({
        label: "Quick Fill: Rarity Limit",
        tip: "m_QuickFillRarityLimit",
        value: save.m_QuickFillRarityLimit,
        min: 0,
        onChange: (n4) => {
          save.m_QuickFillRarityLimit = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      }),
      numberField({
        label: "Quick Fill: Card Expansion Type",
        tip: "m_QuickFillCardExpansionType (internal enum index)",
        value: save.m_QuickFillCardExpansionType,
        min: 0,
        onChange: (n4) => {
          save.m_QuickFillCardExpansionType = Math.max(0, Math.trunc(n4));
          onEdit?.();
        }
      })
    );
    const audio = el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Audio + UI"),
      el("div", { class: "card__desc" }, "Simple sliders that sometimes get stuck after patches/settings resets."),
      numberField({
        label: "Music Volume Decrease",
        tip: "m_MusicVolumeDecrease",
        value: save.m_MusicVolumeDecrease,
        min: 0,
        step: "0.01",
        onChange: (n4) => {
          save.m_MusicVolumeDecrease = Math.max(0, n4);
          onEdit?.();
        }
      }),
      numberField({
        label: "Sound Volume Decrease",
        tip: "m_SoundVolumeDecrease",
        value: save.m_SoundVolumeDecrease,
        min: 0,
        step: "0.01",
        onChange: (n4) => {
          save.m_SoundVolumeDecrease = Math.max(0, n4);
          onEdit?.();
        }
      })
    );
    grid.appendChild(player);
    grid.appendChild(shop);
    grid.appendChild(tools);
    grid.appendChild(audio);
    return grid;
  }

  // src/ui/items.js
  function n(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }
  function makeFilterRow({ onChange }) {
    const q = el("input", { type: "text", placeholder: "Filter by item id (e.g. 12)\u2026" });
    const sel = el(
      "select",
      {},
      el("option", { value: "nonzero" }, "Non-zero / licensed"),
      el("option", { value: "all" }, "All items (500)"),
      el("option", { value: "licensed" }, "Licensed only")
    );
    const limit = el(
      "select",
      {},
      el("option", { value: "50" }, "50 rows"),
      el("option", { value: "100" }, "100 rows"),
      el("option", { value: "250" }, "250 rows")
    );
    const row = el("div", { class: "row" }, el("div", { class: "pillwarn" }, "Item IDs are internal indices (0\u2013499)"), q, sel, limit);
    const fire = () => onChange?.({ q: q.value.trim(), mode: sel.value, limit: Number(limit.value) || 50 });
    q.addEventListener("input", fire);
    sel.addEventListener("change", fire);
    limit.addEventListener("change", fire);
    fire();
    return row;
  }
  function renderItemsPanel({ save, getAdvancedUnlocked, onSafeEdit, onRiskyEdit }) {
    const advanced = !!getAdvancedUnlocked?.();
    const root = el("div", {});
    root.appendChild(
      el(
        "div",
        { class: "card" },
        el("div", { class: "card__title" }, "Items (Inventory + Pricing)"),
        el(
          "div",
          { class: "card__desc" },
          "Cross-links your item totals, set prices, costs, market prices, percent change, sold count, and license flags by item index."
        ),
        el(
          "div",
          { class: "hint" },
          "This editor does not ship proprietary item names. If/when item catalogs are extracted from game data, IDs will be labeled automatically."
        ),
        el(
          "div",
          { class: "row", style: { marginTop: "10px" } },
          el(
            "button",
            {
              class: "btn btn--accent",
              disabled: !advanced,
              title: advanced ? "Set every set-price to the current market price." : "Unlock Advanced Edits to use bulk operations.",
              onclick: () => {
                const market = save.m_GeneratedMarketPriceList;
                if (!Array.isArray(market) || !Array.isArray(save.m_SetItemPriceList)) return;
                for (let i = 0; i < save.m_SetItemPriceList.length; i++) save.m_SetItemPriceList[i] = n(market[i]);
                onRiskyEdit?.();
              }
            },
            "Bulk: Set Prices = Market"
          ),
          el(
            "button",
            {
              class: "btn",
              disabled: !advanced,
              title: advanced ? "Unlock every item license flag (length permitting)." : "Unlock Advanced Edits to use bulk operations.",
              onclick: () => {
                if (!Array.isArray(save.m_IsItemLicenseUnlocked)) return;
                for (let i = 0; i < save.m_IsItemLicenseUnlocked.length; i++) save.m_IsItemLicenseUnlocked[i] = true;
                onRiskyEdit?.();
              }
            },
            "Bulk: Unlock All Licenses"
          )
        )
      )
    );
    const tableCard = el("div", { class: "card" });
    tableCard.appendChild(el("div", { class: "card__title" }, "Item Index Table"));
    tableCard.appendChild(
      el("div", { class: "card__desc" }, advanced ? "Advanced edits are unlocked: totals and set prices are editable." : "Locked: view-only.")
    );
    const filterHost = el("div", { style: { marginTop: "10px" } });
    tableCard.appendChild(filterHost);
    const tableWrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
    const table = el("table", {});
    const thead = el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", {}, "Item ID"),
        el("th", {}, "Licensed"),
        el("th", {}, "Total"),
        el("th", {}, "Set Price"),
        el("th", {}, "Market"),
        el("th", {}, "Avg Cost"),
        el("th", {}, "Sold")
      )
    );
    const tbody = el("tbody", {});
    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    tableCard.appendChild(tableWrap);
    root.appendChild(tableCard);
    const rows = buildItemRows(save);
    function renderRows({ q, mode, limit }) {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      const qn = q && /^\d+$/.test(q) ? Number(q) : null;
      const out = [];
      for (const r of rows) {
        const licensed = r.licensed == null ? null : !!r.licensed;
        const nonzero = n(r.count) !== 0 || n(r.setPrice) !== 0 || n(r.sold) !== 0 || licensed === true;
        if (mode === "nonzero" && !nonzero) continue;
        if (mode === "licensed" && licensed !== true) continue;
        if (qn != null && r.id !== qn) continue;
        out.push(r);
        if (out.length >= limit) break;
      }
      for (const r of out) {
        const licensedCell = r.licensed == null ? el("span", { class: "muted" }, "\u2014") : el("span", { class: r.licensed ? "pillwarn" : "pillbad", title: "License flag from m_IsItemLicenseUnlocked." }, r.licensed ? "Yes" : "No");
        const totalInput = el("input", {
          type: "number",
          value: String(Math.trunc(n(r.count))),
          min: "0",
          step: "1",
          disabled: !advanced,
          title: advanced ? "Edits m_CurrentTotalItemCountList[itemId]." : "Unlock Advanced Edits."
        });
        totalInput.addEventListener("change", () => {
          save.m_CurrentTotalItemCountList[r.id] = Math.max(0, Math.trunc(Number(totalInput.value) || 0));
          onRiskyEdit?.();
        });
        const priceInput = el("input", {
          type: "number",
          value: String(n(r.setPrice)),
          min: "0",
          step: "0.01",
          disabled: !advanced,
          title: advanced ? "Edits m_SetItemPriceList[itemId]." : "Unlock Advanced Edits."
        });
        priceInput.addEventListener("change", () => {
          save.m_SetItemPriceList[r.id] = Math.max(0, Number(priceInput.value) || 0);
          onRiskyEdit?.();
        });
        tbody.appendChild(
          el(
            "tr",
            {},
            el("td", { class: "mono" }, String(r.id)),
            el("td", {}, licensedCell),
            el("td", {}, totalInput),
            el("td", {}, priceInput),
            el("td", {}, fmtNumber(r.market)),
            el("td", {}, fmtNumber(r.avgCost)),
            el("td", {}, fmtNumber(r.sold))
          )
        );
      }
    }
    filterHost.appendChild(makeFilterRow({ onChange: renderRows }));
    root.appendChild(
      el(
        "div",
        { class: "card" },
        el("div", { class: "card__title" }, "Shelf/box contents"),
        el(
          "div",
          { class: "card__desc" },
          "This save includes per-shelf and per-box contents (itemType + amount), plus placement state (positions/rotations/object types). The editor shows a safe summary here; layout editing is left to the All Fields explorer (Advanced Edits required)."
        ),
        (() => {
          const placed = /* @__PURE__ */ new Map();
          const add = (itemType, amount) => {
            const id = Math.trunc(n(itemType));
            const a = Math.trunc(n(amount));
            if (!Number.isFinite(id) || !Number.isFinite(a) || a === 0) return;
            placed.set(id, (placed.get(id) ?? 0) + a);
          };
          const shelves = Array.isArray(save.m_ShelfSaveDataList) ? save.m_ShelfSaveDataList : [];
          for (const s of shelves) {
            const list = Array.isArray(s?.itemTypeAmountList) ? s.itemTypeAmountList : [];
            for (const it of list) add(it?.itemType, it?.amount);
          }
          const boxes = Array.isArray(save.m_PackageBoxItemSaveDataList) ? save.m_PackageBoxItemSaveDataList : [];
          for (const b of boxes) add(b?.itemTypeAmount?.itemType, b?.itemTypeAmount?.amount);
          const rows2 = [...placed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200);
          if (!rows2.length) return el("div", { class: "hint" }, "No placed item amounts found (or everything is zero).");
          const wrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
          const t = el("table", {});
          t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Item ID"), el("th", {}, "Placed Amount (sum)"))));
          const tb = el("tbody", {});
          for (const [id, amt] of rows2) tb.appendChild(el("tr", {}, el("td", { class: "mono" }, String(id)), el("td", {}, fmtNumber(amt))));
          t.appendChild(tb);
          wrap.appendChild(t);
          return wrap;
        })(),
        el("div", { class: "hint", style: { marginTop: "10px" } }, "Placed totals are derived from shelf + package box content lists and may not match global totals 1:1.")
      )
    );
    return root;
  }

  // src/ui/cards.js
  function n2(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }
  function renderCardsPanel({ save, getAdvancedUnlocked, onSafeEdit, onRiskyEdit }) {
    const advanced = !!getAdvancedUnlocked?.();
    const root = el("div", {});
    const header = el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Card Binder"),
      el(
        "div",
        { class: "card__desc" },
        "Browse card indices by expansion. Each row links owned count + collected flag + set price + market price."
      ),
      el("div", { class: "hint" }, "No copyrighted card names/art are included. IDs are internal indices (0\u20132099).")
    );
    const exSel = el("select", {});
    for (const ex of getCardExpansions()) exSel.appendChild(el("option", { value: ex.suffix }, ex.label));
    const filterSel = el(
      "select",
      {},
      el("option", { value: "collected" }, "Collected or owned > 0"),
      el("option", { value: "owned" }, "Owned > 0"),
      el("option", { value: "priced" }, "Has set price"),
      el("option", { value: "all" }, "All cards")
    );
    const pageSizeSel = el("select", {}, el("option", { value: "50" }, "50/page"), el("option", { value: "100" }, "100/page"), el("option", { value: "200" }, "200/page"));
    const pageInput = el("input", { type: "number", value: "1", min: "1", step: "1", style: { width: "100px" } });
    const jumpInput = el("input", { type: "text", placeholder: "Jump to card id\u2026" });
    header.appendChild(el("div", { class: "row", style: { marginTop: "10px" } }, el("div", { class: "pillwarn" }, "Expansion"), exSel, filterSel, pageSizeSel, pageInput, jumpInput));
    header.appendChild(
      el(
        "div",
        { class: "row", style: { marginTop: "10px" } },
        el(
          "button",
          {
            class: "btn btn--accent",
            disabled: !advanced,
            title: advanced ? "Marks every card in the selected expansion as collected." : "Unlock Advanced Edits to use bulk operations.",
            onclick: () => {
              const lists = getCardLists(save, exSel.value);
              if (!Array.isArray(lists.collected)) return;
              for (let i = 0; i < lists.collected.length; i++) lists.collected[i] = true;
              onRiskyEdit?.();
            }
          },
          "Bulk: Mark All Collected"
        ),
        el(
          "button",
          {
            class: "btn",
            disabled: !advanced,
            title: advanced ? "Sets owned count to 1 for every collected card (selected expansion)." : "Unlock Advanced Edits to use bulk operations.",
            onclick: () => {
              const lists = getCardLists(save, exSel.value);
              if (!Array.isArray(lists.owned) || !Array.isArray(lists.collected)) return;
              for (let i = 0; i < lists.owned.length; i++) {
                if (lists.collected[i]) lists.owned[i] = Math.max(1, Math.trunc(n2(lists.owned[i])));
              }
              onRiskyEdit?.();
            }
          },
          "Bulk: Own 1 of Collected"
        )
      )
    );
    const tableCard = el("div", { class: "card" });
    tableCard.appendChild(el("div", { class: "card__title" }, "Cards Table"));
    tableCard.appendChild(el("div", { class: "card__desc" }, advanced ? "Advanced edits unlocked: owned/collected/set price are editable." : "Locked: view-only."));
    const tableWrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
    const table = el("table", {});
    const thead = el("thead", {}, el("tr", {}, el("th", {}, "Card ID"), el("th", {}, "Collected"), el("th", {}, "Owned"), el("th", {}, "Set Price"), el("th", {}, "Market")));
    const tbody = el("tbody", {});
    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    tableCard.appendChild(tableWrap);
    const pagesHint = el("div", { class: "hint", style: { marginTop: "10px" } }, "");
    tableCard.insertBefore(pagesHint, tableWrap);
    function render() {
      const lists = getCardLists(save, exSel.value);
      const owned = Array.isArray(lists.owned) ? lists.owned : [];
      const collected = Array.isArray(lists.collected) ? lists.collected : [];
      const setPrice = Array.isArray(lists.setPrice) ? lists.setPrice : [];
      const market = Array.isArray(lists.market) ? lists.market : [];
      const mode = filterSel.value;
      const pageSize = Math.max(10, Number(pageSizeSel.value) || 50);
      let page = Math.max(1, Math.trunc(Number(pageInput.value) || 1));
      const filtered = [];
      for (let i = 0; i < owned.length; i++) {
        const o = Math.trunc(n2(owned[i]));
        const c = !!collected[i];
        const p = n2(setPrice[i]);
        if (mode === "owned" && o <= 0) continue;
        if (mode === "priced" && p <= 0) continue;
        if (mode === "collected" && !(c || o > 0)) continue;
        filtered.push(i);
      }
      const j = jumpInput.value.trim();
      if (j && /^\d+$/.test(j)) {
        const id = Number(j);
        const pos = filtered.indexOf(id);
        if (pos >= 0) page = Math.floor(pos / pageSize) + 1;
        else {
          filterSel.value = "all";
          return render();
        }
      }
      const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (page > totalPages) page = totalPages;
      pageInput.value = String(page);
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      const start = (page - 1) * pageSize;
      const ids = filtered.slice(start, start + pageSize);
      for (const id of ids) {
        const chk = el("input", { type: "checkbox", checked: !!collected[id], disabled: !advanced });
        chk.addEventListener("change", () => {
          lists.collected[id] = chk.checked;
          onRiskyEdit?.();
        });
        const ownedInput = el("input", { type: "number", value: String(Math.trunc(n2(owned[id]))), min: "0", step: "1", disabled: !advanced });
        ownedInput.addEventListener("change", () => {
          lists.owned[id] = Math.max(0, Math.trunc(Number(ownedInput.value) || 0));
          onRiskyEdit?.();
        });
        const priceInput = el("input", { type: "number", value: String(n2(setPrice[id])), min: "0", step: "0.01", disabled: !advanced });
        priceInput.addEventListener("change", () => {
          lists.setPrice[id] = Math.max(0, Number(priceInput.value) || 0);
          onRiskyEdit?.();
        });
        tbody.appendChild(
          el("tr", {}, el("td", { class: "mono" }, String(id)), el("td", {}, chk), el("td", {}, ownedInput), el("td", {}, priceInput), el("td", {}, fmtNumber(market[id])))
        );
      }
      pagesHint.textContent = `Showing ${ids.length} of ${filtered.length} filtered cards \u2022 Page ${page}/${totalPages}`;
    }
    [exSel, filterSel, pageSizeSel, pageInput].forEach((c) => c.addEventListener("change", render));
    jumpInput.addEventListener("input", () => {
      const t = jumpInput.value.trim();
      if (t === "" || /^\d+$/.test(t)) render();
    });
    root.appendChild(header);
    root.appendChild(tableCard);
    render();
    const packArr = save.m_CollectionCardPackCountList;
    root.appendChild(
      (() => {
        const card = el(
          "div",
          { class: "card" },
          el("div", { class: "card__title" }, "Pack Counts"),
          el("div", { class: "card__desc" }, "m_CollectionCardPackCountList (index-based). Useful for debugging missing pack unlocks."),
          advanced ? el("div", { class: "hint" }, "Advanced edits unlocked: pack counts are editable.") : el("div", { class: "hint" }, "Locked: view-only.")
        );
        if (!Array.isArray(packArr)) {
          card.appendChild(el("div", { class: "hint" }, "Not present in this save."));
          return card;
        }
        const start = el("input", { type: "number", value: "0", min: "0", step: "1", style: { width: "110px" } });
        const count = el("select", {}, el("option", { value: "25" }, "25"), el("option", { value: "50", selected: true }, "50"), el("option", { value: "100" }, "100"));
        card.appendChild(el("div", { class: "row", style: { marginTop: "10px" } }, el("div", { class: "pillwarn" }, `Length ${packArr.length}`), start, count));
        const wrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
        const t = el("table", {});
        const tb = el("tbody", {});
        t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Pack ID"), el("th", {}, "Count"))));
        t.appendChild(tb);
        wrap.appendChild(t);
        card.appendChild(wrap);
        const renderP = () => {
          while (tb.firstChild) tb.removeChild(tb.firstChild);
          const s = Math.max(0, Math.trunc(Number(start.value) || 0));
          const c = Math.max(1, Number(count.value) || 50);
          for (let i = s; i < Math.min(packArr.length, s + c); i++) {
            const inp = el("input", { type: "number", value: String(Math.trunc(n2(packArr[i]))), min: "0", step: "1", disabled: !advanced });
            inp.addEventListener("change", () => {
              packArr[i] = Math.max(0, Math.trunc(Number(inp.value) || 0));
              onRiskyEdit?.();
            });
            tb.appendChild(el("tr", {}, el("td", { class: "mono" }, String(i)), el("td", {}, inp)));
          }
        };
        start.addEventListener("change", renderP);
        count.addEventListener("change", renderP);
        renderP();
        return card;
      })()
    );
    root.appendChild(
      (() => {
        const g = save.m_CurrentGradeCardSubmitSet;
        const card = el(
          "div",
          { class: "card" },
          el("div", { class: "card__title" }, "Grading (Submit Set)"),
          el(
            "div",
            { class: "card__desc" },
            "m_CurrentGradeCardSubmitSet. These fields are internal state; edits are locked unless Advanced Edits is enabled."
          )
        );
        if (!g || typeof g !== "object") {
          card.appendChild(el("div", { class: "hint" }, "Not present in this save."));
          return card;
        }
        const disabled = !advanced;
        if (disabled) card.appendChild(el("div", { class: "pillbad", style: { marginTop: "10px" } }, "Locked: unlock Advanced Edits to modify."));
        const service = el("input", { type: "number", value: String(Math.trunc(n2(g.m_ServiceLevel ?? 0))), min: "0", step: "1", disabled });
        service.addEventListener("change", () => {
          g.m_ServiceLevel = Math.max(0, Math.trunc(Number(service.value) || 0));
          onRiskyEdit?.();
        });
        const day = el("input", { type: "number", value: String(Math.trunc(n2(g.m_DayPassed ?? 0))), min: "0", step: "1", disabled });
        day.addEventListener("change", () => {
          g.m_DayPassed = Math.max(0, Math.trunc(Number(day.value) || 0));
          onRiskyEdit?.();
        });
        const minutes = el("input", { type: "number", value: String(n2(g.m_MinutePassed ?? 0)), min: "0", step: "0.01", disabled });
        minutes.addEventListener("change", () => {
          g.m_MinutePassed = Math.max(0, Number(minutes.value) || 0);
          onRiskyEdit?.();
        });
        card.appendChild(
          el(
            "div",
            { class: "row", style: { marginTop: "10px" } },
            el("div", { class: "field", style: { marginTop: "0", minWidth: "180px" } }, el("label", {}, "Service Level"), service),
            el("div", { class: "field", style: { marginTop: "0", minWidth: "180px" } }, el("label", {}, "Day Passed"), day),
            el("div", { class: "field", style: { marginTop: "0", minWidth: "180px" } }, el("label", {}, "Minute Passed"), minutes)
          )
        );
        const list = Array.isArray(g.m_CardDataList) ? g.m_CardDataList : [];
        const wrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
        const t = el("table", {});
        t.appendChild(
          el(
            "thead",
            {},
            el(
              "tr",
              {},
              el("th", {}, "#"),
              el("th", {}, "ExpansionType"),
              el("th", {}, "MonsterType"),
              el("th", {}, "BorderType"),
              el("th", {}, "Foil"),
              el("th", {}, "Grade"),
              el("th", {}, "GradedIndex")
            )
          )
        );
        const tb = el("tbody", {});
        t.appendChild(tb);
        wrap.appendChild(t);
        card.appendChild(wrap);
        list.forEach((c, idx) => {
          const exp = el("input", { type: "number", value: String(Math.trunc(n2(c.expansionType ?? 0))), min: "0", step: "1", disabled });
          exp.addEventListener("change", () => {
            c.expansionType = Math.max(0, Math.trunc(Number(exp.value) || 0));
            onRiskyEdit?.();
          });
          const mon = el("input", { type: "number", value: String(Math.trunc(n2(c.monsterType ?? 0))), min: "0", step: "1", disabled });
          mon.addEventListener("change", () => {
            c.monsterType = Math.max(0, Math.trunc(Number(mon.value) || 0));
            onRiskyEdit?.();
          });
          const border = el("input", { type: "number", value: String(Math.trunc(n2(c.borderType ?? 0))), min: "0", step: "1", disabled });
          border.addEventListener("change", () => {
            c.borderType = Math.max(0, Math.trunc(Number(border.value) || 0));
            onRiskyEdit?.();
          });
          const foil = el("input", { type: "checkbox", checked: !!c.isFoil, disabled });
          foil.addEventListener("change", () => {
            c.isFoil = !!foil.checked;
            onRiskyEdit?.();
          });
          const grade = el("input", { type: "number", value: String(Math.trunc(n2(c.cardGrade ?? 0))), min: "0", step: "1", disabled });
          grade.addEventListener("change", () => {
            c.cardGrade = Math.max(0, Math.trunc(Number(grade.value) || 0));
            onRiskyEdit?.();
          });
          const gidx = el("input", { type: "number", value: String(Math.trunc(n2(c.gradedCardIndex ?? 0))), min: "0", step: "1", disabled });
          gidx.addEventListener("change", () => {
            c.gradedCardIndex = Math.max(0, Math.trunc(Number(gidx.value) || 0));
            onRiskyEdit?.();
          });
          tb.appendChild(el("tr", {}, el("td", { class: "mono" }, String(idx)), el("td", {}, exp), el("td", {}, mon), el("td", {}, border), el("td", {}, foil), el("td", {}, grade), el("td", {}, gidx)));
        });
        card.appendChild(el("div", { class: "hint", style: { marginTop: "10px" } }, "If you are unsure what these IDs mean, leave them unchanged and use the normal binder/table controls instead."));
        return card;
      })()
    );
    return root;
  }

  // src/ui/workers.js
  function n3(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }
  function renderWorkersPanel({ save, getAdvancedUnlocked, onSafeEdit, onRiskyEdit }) {
    const advanced = !!getAdvancedUnlocked?.();
    const root = el("div", {});
    const list = Array.isArray(save.m_WorkerSaveDataList) ? save.m_WorkerSaveDataList : [];
    root.appendChild(
      el(
        "div",
        { class: "card" },
        el("div", { class: "card__title" }, "Workers"),
        el(
          "div",
          { class: "card__desc" },
          "Workers include task/state + position/rotation. This editor focuses on safe toggles and price multipliers."
        )
      )
    );
    const card = el("div", { class: "card" }, el("div", { class: "card__title" }, `Worker List (${list.length})`));
    if (!list.length) {
      card.appendChild(el("div", { class: "card__desc" }, "No worker entries found in this save."));
      root.appendChild(card);
      return root;
    }
    const tableWrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
    const table = el("table", {});
    const thead = el(
      "thead",
      {},
      el("tr", {}, el("th", {}, "#"), el("th", {}, "Primary Task"), el("th", {}, "State"), el("th", {}, "Item Price Mult"), el("th", {}, "Card Price Mult"))
    );
    const tbody = el("tbody", {});
    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    card.appendChild(tableWrap);
    list.forEach((w, idx) => {
      const itemMult = el("input", { type: "number", value: String(n3(w.setPriceMultiplier ?? 1)), step: "0.01", min: "0", disabled: !advanced });
      itemMult.addEventListener("change", () => {
        w.setPriceMultiplier = Math.max(0, n3(itemMult.value));
        onRiskyEdit?.();
      });
      const cardMult = el("input", { type: "number", value: String(n3(w.setCardPriceMultiplier ?? 1)), step: "0.01", min: "0", disabled: !advanced });
      cardMult.addEventListener("change", () => {
        w.setCardPriceMultiplier = Math.max(0, n3(cardMult.value));
        onRiskyEdit?.();
      });
      tbody.appendChild(
        el(
          "tr",
          {},
          el("td", { class: "mono" }, String(idx)),
          el("td", {}, String(w.primaryTask ?? 0)),
          el("td", {}, String(w.currentState ?? 0)),
          el("td", {}, itemMult),
          el("td", {}, cardMult)
        )
      );
    });
    card.appendChild(el("div", { class: "hint", style: { marginTop: "10px" } }, "Positions/rotations and task IDs are internal state. Use All Fields/Raw only if you know what they do."));
    root.appendChild(card);
    return root;
  }

  // src/ui/flags.js
  function renderBoolArray({ title, desc, arr, advanced, onEdit }) {
    const card = el("div", { class: "card" }, el("div", { class: "card__title" }, title), el("div", { class: "card__desc" }, desc));
    if (!Array.isArray(arr)) {
      card.appendChild(el("div", { class: "hint" }, "Not present in this save."));
      return card;
    }
    const row = el("div", { class: "row", style: { marginTop: "10px" } });
    const q = el("input", { type: "text", placeholder: "Filter id (e.g. 12) or leave blank" });
    const mode = el("select", {}, el("option", { value: "true" }, "True only"), el("option", { value: "all" }, "All"));
    const limit = el("select", {}, el("option", { value: "50" }, "50"), el("option", { value: "100" }, "100"), el("option", { value: "250" }, "250"));
    row.appendChild(q);
    row.appendChild(mode);
    row.appendChild(limit);
    card.appendChild(row);
    const tableWrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
    const table = el("table", {});
    const thead = el("thead", {}, el("tr", {}, el("th", {}, "ID"), el("th", {}, "Value")));
    const tbody = el("tbody", {});
    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    card.appendChild(tableWrap);
    const render = () => {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      const qn = q.value.trim() && /^\d+$/.test(q.value.trim()) ? Number(q.value.trim()) : null;
      const wantTrue = mode.value === "true";
      const lim = Math.max(10, Number(limit.value) || 50);
      let shown = 0;
      for (let i = 0; i < arr.length; i++) {
        if (qn != null && i !== qn) continue;
        const v = !!arr[i];
        if (wantTrue && !v) continue;
        const chk = el("input", { type: "checkbox", checked: v, disabled: !advanced, title: advanced ? "Toggle value." : "Unlock Advanced Edits to change flags." });
        chk.addEventListener("change", () => {
          arr[i] = chk.checked;
          onEdit?.();
        });
        tbody.appendChild(el("tr", {}, el("td", { class: "mono" }, String(i)), el("td", {}, chk)));
        shown++;
        if (shown >= lim) break;
      }
    };
    q.addEventListener("input", render);
    mode.addEventListener("change", render);
    limit.addEventListener("change", render);
    render();
    return card;
  }
  function renderFlagsPanel({ save, getAdvancedUnlocked, onSafeEdit, onRiskyEdit }) {
    const advanced = !!getAdvancedUnlocked?.();
    const root = el("div", {});
    root.appendChild(
      el(
        "div",
        { class: "card" },
        el("div", { class: "card__title" }, "Flags + Unlocks"),
        el("div", { class: "card__desc" }, "Licenses, hires, and achievements. Powerful edits: keep backups enabled.")
      )
    );
    root.appendChild(
      renderBoolArray({
        title: "Item Licenses",
        desc: "m_IsItemLicenseUnlocked (often 0\u2013500).",
        arr: save.m_IsItemLicenseUnlocked,
        advanced,
        onEdit: () => onRiskyEdit?.()
      })
    );
    root.appendChild(
      renderBoolArray({
        title: "Workers Hired",
        desc: "m_IsWorkerHired (often 0\u201399).",
        arr: save.m_IsWorkerHired,
        advanced,
        onEdit: () => onRiskyEdit?.()
      })
    );
    root.appendChild(
      renderBoolArray({
        title: "Achievements",
        desc: "m_IsAchievementUnlocked (often 0\u201399).",
        arr: save.m_IsAchievementUnlocked,
        advanced,
        onEdit: () => onRiskyEdit?.()
      })
    );
    return root;
  }

  // src/ui/raw.js
  function isPrimitive(v) {
    return v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
  }
  function riskFromKey(key) {
    const k = String(key ?? "");
    return /guid|hash|symbol|playfab|objecttype|objectType|type$|Type$|index$|Index$|id$|Id$|pos$|Pos$|rot$|Rot$/i.test(k);
  }
  function isRiskyPath(path) {
    return path.some((seg) => riskFromKey(seg));
  }
  function pathToString(path) {
    return path.map((p) => typeof p === "number" ? `[${p}]` : p).join(".");
  }
  function getAt(root, path) {
    let cur = root;
    for (const seg of path) {
      if (cur == null) return void 0;
      cur = cur[seg];
    }
    return cur;
  }
  function setAt(root, path, value) {
    if (!path.length) return;
    let cur = root;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
    cur[path[path.length - 1]] = value;
  }
  function primitiveEditor({ value, disabled, onChange }) {
    if (typeof value === "boolean") {
      const chk = el("input", { type: "checkbox", checked: value, disabled });
      chk.addEventListener("change", () => onChange?.(!!chk.checked));
      return chk;
    }
    if (typeof value === "number") {
      const input2 = el("input", { type: "number", value: String(value), step: "0.01", disabled });
      input2.addEventListener("change", () => onChange?.(Number(input2.value)));
      return input2;
    }
    const input = el("input", { type: "text", value: value == null ? "" : String(value), disabled });
    input.addEventListener("change", () => onChange?.(input.value));
    return input;
  }
  function renderArrayEditor({ root, path, arr, advancedUnlocked, onRiskyEdit }) {
    const card = el("div", { class: "card" }, el("div", { class: "card__title" }, `Array Editor`), el("div", { class: "card__desc" }, pathToString(path)));
    const len = arr.length;
    const start = el("input", { type: "number", value: "0", min: "0", step: "1", style: { width: "110px" } });
    const count = el("select", {}, el("option", { value: "25" }, "25"), el("option", { value: "50", selected: true }, "50"), el("option", { value: "100" }, "100"));
    const row = el("div", { class: "row", style: { marginTop: "10px" } }, el("div", { class: "pillwarn" }, `Length ${len}`), el("span", { class: "muted tiny" }, "Start"), start, el("span", { class: "muted tiny" }, "Count"), count);
    card.appendChild(row);
    const risky = isRiskyPath(path);
    const disabled = risky && !advancedUnlocked;
    if (disabled) card.appendChild(el("div", { class: "pillbad", style: { marginTop: "10px" } }, "Locked: risky path. Unlock Advanced Edits to modify."));
    const wrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
    const table = el("table", {});
    const thead = el("thead", {}, el("tr", {}, el("th", {}, "Index"), el("th", {}, "Value")));
    const tbody = el("tbody", {});
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
    const render = () => {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      const s = Math.max(0, Math.trunc(Number(start.value) || 0));
      const c = Math.max(1, Number(count.value) || 50);
      const end = Math.min(len, s + c);
      start.value = String(s);
      for (let i = s; i < end; i++) {
        const v = arr[i];
        if (!isPrimitive(v)) {
          tbody.appendChild(el("tr", {}, el("td", { class: "mono" }, String(i)), el("td", {}, el("span", { class: "muted" }, `(${Array.isArray(v) ? "array" : "object"})`))));
          continue;
        }
        const ed = primitiveEditor({
          value: v,
          disabled,
          onChange: (nv) => {
            arr[i] = nv;
            onRiskyEdit?.();
          }
        });
        tbody.appendChild(el("tr", {}, el("td", { class: "mono" }, String(i)), el("td", {}, ed)));
      }
    };
    start.addEventListener("change", render);
    count.addEventListener("change", render);
    render();
    return card;
  }
  function renderObjectEditor({ root, path, obj, advancedUnlocked, onRiskyEdit }) {
    const card = el("div", { class: "card" }, el("div", { class: "card__title" }, `Object Editor`), el("div", { class: "card__desc" }, pathToString(path)));
    const keys = Object.keys(obj ?? {});
    const q = el("input", { type: "text", placeholder: `Filter keys (${keys.length})\u2026` });
    card.appendChild(el("div", { class: "row", style: { marginTop: "10px" } }, q));
    const wrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
    const table = el("table", {});
    const thead = el("thead", {}, el("tr", {}, el("th", {}, "Key"), el("th", {}, "Value")));
    const tbody = el("tbody", {});
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
    const render = () => {
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      const f = q.value.trim().toLowerCase();
      const shown = keys.filter((k) => !f || k.toLowerCase().includes(f)).slice(0, 250);
      for (const k of shown) {
        const v = obj[k];
        if (isPrimitive(v)) {
          const risky = isRiskyPath([...path, k]);
          const disabled = risky && !advancedUnlocked;
          const ed = primitiveEditor({
            value: v,
            disabled,
            onChange: (nv) => {
              obj[k] = nv;
              onRiskyEdit?.();
            }
          });
          const label = risky ? el("span", { class: "pillbad", title: "Risky identifier/state field." }, k) : el("span", {}, k);
          tbody.appendChild(el("tr", {}, el("td", { class: "mono" }, label), el("td", {}, ed)));
        } else if (Array.isArray(v)) {
          const btn = el(
            "button",
            {
              class: "btn",
              onclick: () => {
                card.dispatchEvent(new CustomEvent("open-path", { bubbles: true, detail: { path: [...path, k] } }));
              }
            },
            `Open Array (${v.length})`
          );
          tbody.appendChild(el("tr", {}, el("td", { class: "mono" }, k), el("td", {}, btn)));
        } else if (v && typeof v === "object") {
          const btn = el(
            "button",
            {
              class: "btn",
              onclick: () => {
                card.dispatchEvent(new CustomEvent("open-path", { bubbles: true, detail: { path: [...path, k] } }));
              }
            },
            "Open Object"
          );
          tbody.appendChild(el("tr", {}, el("td", { class: "mono" }, k), el("td", {}, btn)));
        } else {
          tbody.appendChild(
            el(
              "tr",
              {},
              el("td", { class: "mono" }, k),
              el("td", {}, el("span", { class: "muted" }, String(v)))
            )
          );
        }
      }
    };
    q.addEventListener("input", render);
    render();
    return card;
  }
  function renderRawPanel({ save, getAdvancedUnlocked, onRiskyEdit }) {
    const advancedUnlocked = !!getAdvancedUnlocked?.();
    const root = el("div", {});
    root.appendChild(
      el(
        "div",
        { class: "card" },
        el("div", { class: "card__title" }, "All Fields (Explorer)"),
        el(
          "div",
          { class: "card__desc" },
          "This is a UI editor for every field in the save (no JSON text editing). Risky identifier/state fields are locked until you unlock Advanced Edits."
        )
      )
    );
    const nav = el("div", { class: "card" }, el("div", { class: "card__title" }, "Navigator"));
    const pathBox = el("input", { type: "text", value: "", placeholder: "Current path (e.g. m_WorkerSaveDataList)\u2026", disabled: true });
    const back = el("button", { class: "btn", disabled: true }, "Back");
    nav.appendChild(el("div", { class: "row", style: { marginTop: "10px" } }, back, pathBox));
    root.appendChild(nav);
    const host = el("div", {});
    root.appendChild(host);
    const stack = [];
    const openPath = (path) => {
      stack.push(path);
      renderCurrent();
    };
    const goBack = () => {
      stack.pop();
      renderCurrent();
    };
    back.addEventListener("click", goBack);
    const renderCurrent = () => {
      while (host.firstChild) host.removeChild(host.firstChild);
      const path = stack.length ? stack[stack.length - 1] : [];
      const cur = getAt(save, path);
      pathBox.value = path.length ? pathToString(path) : "(root)";
      back.disabled = stack.length === 0;
      let view = null;
      if (Array.isArray(cur)) view = renderArrayEditor({ root: save, path, arr: cur, advancedUnlocked, onRiskyEdit });
      else if (cur && typeof cur === "object") view = renderObjectEditor({ root: save, path, obj: cur, advancedUnlocked, onRiskyEdit });
      else {
        const disabled = isRiskyPath(path) && !advancedUnlocked;
        const ed = primitiveEditor({
          value: cur,
          disabled,
          onChange: (nv) => {
            setAt(save, path, nv);
            onRiskyEdit?.();
          }
        });
        view = el("div", { class: "card" }, el("div", { class: "card__title" }, "Value"), el("div", { class: "card__desc" }, pathToString(path)), ed);
      }
      view.addEventListener("open-path", (e) => {
        openPath(e.detail.path);
      });
      host.appendChild(view);
    };
    openPath([]);
    return root;
  }

  // src/app.js
  var state = {
    save: null,
    source: null,
    // { mode, fileHandle?, dirHandle?, displayName, codec, originalBytes }
    advancedUnlocked: false,
    riskyEdited: false
  };
  var $ = (id) => document.getElementById(id);
  function withSuffix(name, suffix) {
    const base = name ?? "save";
    const dot = base.lastIndexOf(".");
    if (dot > 0 && dot < base.length - 1) return `${base.slice(0, dot)}.${suffix}${base.slice(dot)}`;
    return `${base}.${suffix}`;
  }
  function setStatus(kind, text) {
    const box = $("statusBox");
    box.hidden = !text;
    box.classList.remove("ok", "bad", "warn");
    if (text) {
      box.textContent = text;
      if (kind) box.classList.add(kind);
    }
  }
  function setPanelsVisible(panelKey) {
    const map = {
      empty: $("panelEmpty"),
      player: $("panelPlayer"),
      items: $("panelItems"),
      cards: $("panelCards"),
      workers: $("panelWorkers"),
      flags: $("panelFlags"),
      raw: $("panelRaw")
    };
    for (const [k, node] of Object.entries(map)) node.hidden = k !== panelKey;
    document.querySelectorAll(".tab").forEach((b) => {
      const on = b.dataset.tab === panelKey;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }
  function refreshSummary() {
    const sum = summarizeSave(state.save);
    $("saveSummary").hidden = false;
    $("sumPlayer").textContent = sum.playerName ?? "\u2014";
    $("sumCoins").textContent = sum.coins != null ? fmtNumber(sum.coins) : "\u2014";
    $("sumDay").textContent = sum.day != null ? String(sum.day) : "\u2014";
    $("sumShopLevel").textContent = sum.shopLevel != null ? String(sum.shopLevel) : "\u2014";
  }
  function refreshSaveButtons() {
    const has = !!state.save;
    $("btnSaveDownload").disabled = !has;
    $("btnSaveWriteBack").disabled = !has || !state.source?.fileHandle;
  }
  function markRiskyEdit() {
    state.riskyEdited = true;
    if ($("chkBackupOnSave").checked) return;
    setStatus("warn", "Advanced/risky edits were changed, but Backup on Save is OFF.\nTurn it back on before saving.");
  }
  function renderAllPanels() {
    if (!state.save) return;
    clear($("panelPlayer"));
    $("panelPlayer").appendChild(
      renderPlayerPanel({
        save: state.save,
        onEdit: () => setStatus("ok", "Edits staged. Save when ready.")
      })
    );
    clear($("panelItems"));
    $("panelItems").appendChild(
      renderItemsPanel({
        save: state.save,
        getAdvancedUnlocked: () => state.advancedUnlocked,
        onSafeEdit: () => setStatus("ok", "Edits staged. Save when ready."),
        onRiskyEdit: () => {
          markRiskyEdit();
          setStatus("warn", "Advanced edits staged. Keep backups enabled.");
        }
      })
    );
    clear($("panelCards"));
    $("panelCards").appendChild(
      renderCardsPanel({
        save: state.save,
        getAdvancedUnlocked: () => state.advancedUnlocked,
        onSafeEdit: () => setStatus("ok", "Edits staged. Save when ready."),
        onRiskyEdit: () => {
          markRiskyEdit();
          setStatus("warn", "High-impact card edits staged. Keep backups enabled.");
        }
      })
    );
    clear($("panelWorkers"));
    $("panelWorkers").appendChild(
      renderWorkersPanel({
        save: state.save,
        getAdvancedUnlocked: () => state.advancedUnlocked,
        onSafeEdit: () => setStatus("ok", "Edits staged. Save when ready."),
        onRiskyEdit: () => {
          markRiskyEdit();
          setStatus("warn", "Worker edits staged. Keep backups enabled.");
        }
      })
    );
    clear($("panelFlags"));
    $("panelFlags").appendChild(
      renderFlagsPanel({
        save: state.save,
        getAdvancedUnlocked: () => state.advancedUnlocked,
        onSafeEdit: () => setStatus("ok", "Edits staged. Save when ready."),
        onRiskyEdit: () => {
          markRiskyEdit();
          setStatus("warn", "Unlock/flag edits staged. Keep backups enabled.");
        }
      })
    );
    clear($("panelRaw"));
    $("panelRaw").appendChild(
      renderRawPanel({
        save: state.save,
        getAdvancedUnlocked: () => state.advancedUnlocked,
        onRiskyEdit: () => {
          markRiskyEdit();
          setStatus("warn", "Explorer edits staged. Keep backups enabled.");
        }
      })
    );
    refreshSummary();
    refreshSaveButtons();
  }
  async function backupOnLoadIfEnabled(source) {
    if (!$("chkBackupOnLoad").checked) return null;
    if (!source?.originalBytes) return;
    try {
      return await backupBesideIfPossible(source, source.originalBytes, { suffix: "loadbak" });
    } catch (e) {
      setStatus("warn", `Loaded save, but automatic backup-on-load failed: ${e?.message ?? String(e)}`);
    }
    return null;
  }
  async function loadSaveResult(result) {
    if (!result) return;
    if (result.error) {
      setStatus("bad", `Failed to decode save: ${result.error?.message ?? String(result.error)}`);
      return;
    }
    const detect = detectTcgShopSave(result.save);
    if (!detect.ok) {
      setStatus("bad", `This file does not look like a Trading Card Shop Simulator save.
Missing keys: ${detect.missing.slice(0, 12).join(", ")}${detect.missing.length > 12 ? ", \u2026" : ""}`);
      return;
    }
    state.save = result.save;
    state.source = result.source;
    state.riskyEdited = false;
    const bak = await backupOnLoadIfEnabled(state.source);
    const codec = state.source.codec?.kind ?? "json";
    const bakLine = bak ? `Backup on load: ${bak.kind} (${bak.name})` : `Backup on load: ${$("chkBackupOnLoad").checked ? "ON" : "OFF"}`;
    setStatus("ok", `Loaded save: ${state.source.displayName}
Codec: ${codec}
${bakLine}`);
    renderAllPanels();
    setPanelsVisible("player");
  }
  async function doOpenFile() {
    try {
      setStatus("warn", "Opening file picker...");
      const r = await openSaveFileAny();
      if (!r) {
        setStatus("warn", "File selection canceled.");
        return;
      }
      await loadSaveResult(r);
    } catch (e) {
      if (e?.name === "AbortError") {
        setStatus("warn", "File selection canceled.");
        return;
      }
      setStatus("bad", `Open failed: ${e?.message ?? String(e)}`);
    }
  }
  async function doOpenFolder() {
    try {
      setStatus("warn", "Opening folder picker...");
      let r = null;
      if (window.isSecureContext && typeof window.showDirectoryPicker === "function") {
        let dirHandle = null;
        try {
          dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        } catch (e) {
          if (e?.name === "AbortError") {
            setStatus("warn", "Folder selection canceled.");
            return;
          }
          setStatus("warn", `Folder picker blocked (${e?.name ?? "error"}). Trying fallback...`);
        }
        if (dirHandle) {
          r = await openSaveFolderFromDirectoryHandle(dirHandle);
        }
      }
      if (!r) {
        r = await openSaveFolderViaInputFallback();
      }
      if (!r) {
        setStatus("warn", "Folder selection canceled.");
        return;
      }
      await loadSaveResult(r);
    } catch (e) {
      setStatus("bad", `Open folder failed: ${e?.message ?? String(e)}`);
    }
  }
  async function doSaveDownload() {
    if (!state.save) return;
    if (state.riskyEdited && !$("chkBackupOnSave").checked) {
      setStatus("bad", "Blocked: risky/advanced edits were made while Backup on Save is OFF.\nTurn it on, or revert risky edits, then try again.");
      return;
    }
    try {
      normalizeForWrite(state.save);
      const { bytes, mime } = await encodeFromJson(state.save, state.source?.codec);
      if ($("chkBackupOnSave").checked && state.source?.originalBytes) {
        downloadBytes(withSuffix(state.source.displayName, `bak-${nowStamp()}`), state.source.originalBytes, "application/octet-stream");
      }
      downloadBytes(withSuffix(state.source?.displayName ?? "save", `edited-${nowStamp()}`), bytes, mime);
      setStatus("ok", "Downloaded edited save.\nIf you are using WGS, replace the payload file inside the correct container folder, then launch the game.");
    } catch (e) {
      setStatus("bad", `Save failed: ${e?.message ?? String(e)}`);
    }
  }
  async function doSaveWriteBack() {
    if (!state.save) return;
    if (!state.source?.fileHandle) {
      setStatus("bad", "No writable file handle available. Use Open Save File / Open Save Folder first.");
      return;
    }
    if (state.riskyEdited && !$("chkBackupOnSave").checked) {
      setStatus("bad", "Blocked: risky/advanced edits were made while Backup on Save is OFF.\nTurn it on, or revert risky edits, then try again.");
      return;
    }
    try {
      normalizeForWrite(state.save);
      const { bytes } = await encodeFromJson(state.save, state.source.codec);
      if ($("chkBackupOnSave").checked && state.source?.originalBytes) {
        await backupBesideIfPossible(state.source, state.source.originalBytes, { suffix: "savebak" });
      }
      await writeBack(state.source, state.save);
      state.source.originalBytes = bytes;
      setStatus("ok", "Saved successfully (write-back). Launch the game and verify the edited values.");
    } catch (e) {
      setStatus("bad", `Write-back failed: ${e?.message ?? String(e)}
Use Save (Download) as a fallback.`);
    }
  }
  function wireTabs() {
    document.querySelectorAll(".tab").forEach((b) => {
      b.addEventListener("click", () => {
        const k = b.dataset.tab;
        if (!state.save && k !== "empty") return;
        setPanelsVisible(k);
      });
    });
  }
  function wireDropzone() {
    const dz = $("dropzone");
    const over = (on) => dz.classList.toggle("is-over", on);
    const onDropFiles = async (files) => {
      const f = files?.[0];
      if (!f) return;
      try {
        const ab = await f.arrayBuffer();
        const bytes = new Uint8Array(ab);
        const { decodeToJson: decodeToJson2 } = await Promise.resolve().then(() => (init_codec(), codec_exports));
        const decoded = await decodeToJson2(bytes);
        await loadSaveResult({
          source: { mode: "drop", fileHandle: null, dirHandle: null, displayName: f.name, codec: decoded.codec, originalBytes: decoded.originalBytes },
          save: decoded.json
        });
      } catch (e) {
        setStatus("bad", `Drop failed: ${e?.message ?? String(e)}`);
      }
    };
    dz.addEventListener("dragover", (e) => {
      e.preventDefault();
      over(true);
    });
    dz.addEventListener("dragleave", () => over(false));
    dz.addEventListener("drop", (e) => {
      e.preventDefault();
      over(false);
      onDropFiles(e.dataTransfer?.files);
    });
    dz.addEventListener("click", doOpenFile);
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        doOpenFile();
      }
    });
  }
  function wireUnlocks() {
    const adv = $("chkUnlockAdvanced");
    const warn = $("advancedWarning");
    adv.addEventListener("change", () => {
      state.advancedUnlocked = adv.checked;
      warn.hidden = !adv.checked;
      setStatus(adv.checked ? "warn" : "ok", adv.checked ? "Advanced edits unlocked. Keep backups enabled." : "Advanced edits locked.");
      renderAllPanels();
    });
    $("chkBackupOnSave").addEventListener("change", () => {
      if (!state.riskyEdited) return;
      if ($("chkBackupOnSave").checked) setStatus("ok", "Backup on Save re-enabled. You can save again.");
    });
  }
  function init() {
    wireTabs();
    wireDropzone();
    wireUnlocks();
    $("btnOpenFile").addEventListener("click", doOpenFile);
    $("btnOpenFolder").addEventListener("click", doOpenFolder);
    $("btnSaveDownload").addEventListener("click", doSaveDownload);
    $("btnSaveWriteBack").addEventListener("click", doSaveWriteBack);
    const folderBtn = $("btnOpenFolder");
    folderBtn.title = "Chrome/Edge desktop recommended. On unsupported browsers, use Open Save File.";
    setPanelsVisible("empty");
    refreshSaveButtons();
  }
  init();
})();
