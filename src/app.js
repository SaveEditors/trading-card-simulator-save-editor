import { clear, el, fmtNumber, nowStamp } from "./lib/dom.js";
import { openSaveFileAny, openSaveFolderFromDirectoryHandle, openSaveFolderViaInputFallback, writeBack, downloadBytes, backupBesideIfPossible } from "./lib/fs.js";
import { encodeFromJson } from "./lib/codec.js";
import { detectTcgShopSave, normalizeForWrite, summarizeSave } from "./lib/save.js";
import { renderPlayerPanel } from "./ui/player.js";
import { renderItemsPanel } from "./ui/items.js";
import { renderCardsPanel } from "./ui/cards.js";
import { renderWorkersPanel } from "./ui/workers.js";
import { renderFlagsPanel } from "./ui/flags.js";
import { renderRawPanel } from "./ui/raw.js";

const state = {
  save: null,
  source: null, // { mode, fileHandle?, dirHandle?, displayName, codec, originalBytes }
  pendingChoices: null, // [{ save, source, meta? }]
  advancedUnlocked: false,
  riskyEdited: false,
};

const $ = (id) => document.getElementById(id);

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

function fmtBytes(n) {
  const num = Number(n || 0);
  if (!Number.isFinite(num) || num <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = num;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const digits = u === 0 ? 0 : v < 10 ? 2 : 1;
  return `${v.toFixed(digits)} ${units[u]}`;
}

function hideSavePicker() {
  state.pendingChoices = null;
  const box = $("savePick");
  const sel = $("savePickSelect");
  if (sel) sel.innerHTML = "";
  if (box) box.hidden = true;
}

function showSavePicker(choices) {
  const box = $("savePick");
  const sel = $("savePickSelect");
  if (!box || !sel) return;
  state.pendingChoices = Array.isArray(choices) ? choices.slice() : [];
  sel.innerHTML = "";

  const sorted = state.pendingChoices.slice().sort((a, b) => (b.meta?.lastModified ?? 0) - (a.meta?.lastModified ?? 0) || (b.meta?.size ?? 0) - (a.meta?.size ?? 0));
  state.pendingChoices = sorted;

  sorted.forEach((c, idx) => {
    const opt = document.createElement("option");
    const path = c?.meta?.path || c?.source?.displayName || `Candidate ${idx + 1}`;
    const size = c?.meta?.size != null ? fmtBytes(c.meta.size) : "";
    const stamp = c?.meta?.lastModified ? new Date(c.meta.lastModified).toLocaleString() : "";
    opt.value = String(idx);
    opt.textContent = `${path}${size ? ` · ${size}` : ""}${stamp ? ` · ${stamp}` : ""}`;
    sel.appendChild(opt);
  });

  box.hidden = false;
  setStatus("warn", `Multiple save candidates detected (${sorted.length}). Select the correct one, then click “Load Selected”.`);
}

async function nextFrame() {
  await new Promise((r) => requestAnimationFrame(() => r()));
}

function setPanelsVisible(panelKey) {
  const map = {
    empty: $("panelEmpty"),
    player: $("panelPlayer"),
    items: $("panelItems"),
    cards: $("panelCards"),
    workers: $("panelWorkers"),
    flags: $("panelFlags"),
    raw: $("panelRaw"),
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
  $("sumPlayer").textContent = sum.playerName ?? "—";
  $("sumCoins").textContent = sum.coins != null ? fmtNumber(sum.coins) : "—";
  $("sumDay").textContent = sum.day != null ? String(sum.day) : "—";
  $("sumShopLevel").textContent = sum.shopLevel != null ? String(sum.shopLevel) : "—";
}

function renderQuickTop() {
  const host = $("quickTop");
  if (!host) return;
  if (!state.save) {
    host.hidden = true;
    clear(host);
    return;
  }

  host.hidden = false;
  clear(host);

  const save = state.save;
  const advanced = !!state.advancedUnlocked;

  const numberInput = ({ label, value, step = "1", min = 0, onChange }) => {
    const input = el("input", { type: "number", value: String(value ?? 0), step: String(step), min: String(min) });
    input.addEventListener("change", () => {
      const n = Number(input.value);
      onChange?.(Number.isFinite(n) ? n : value);
      refreshSummary();
      setStatus("ok", "Edits staged. Save when ready.");
    });
    return el("div", { class: "field" }, el("label", {}, label), input);
  };

  const textInput = ({ label, value, onChange }) => {
    const input = el("input", { type: "text", value: String(value ?? "") });
    input.addEventListener("change", () => {
      onChange?.(input.value);
      refreshSummary();
      setStatus("ok", "Edits staged. Save when ready.");
    });
    return el("div", { class: "field" }, el("label", {}, label), input);
  };

  const bulkBtn = ({ label, title, disabled, cls = "btn", onClick }) =>
    el(
      "button",
      {
        class: cls,
        disabled,
        title,
        onclick: () => {
          onClick?.();
          refreshSummary();
          markRiskyEdit();
          setStatus("warn", "Unlocks staged. Keep backups enabled, then save.");
        },
      },
      label
    );

  const hasAchievements = Array.isArray(save.m_IsAchievementUnlocked);
  const hasLicenses = Array.isArray(save.m_IsItemLicenseUnlocked);
  const hasWorkers = Array.isArray(save.m_IsWorkerHired);

  host.appendChild(
    el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Quick Edits"),
      el("div", { class: "card__desc" }, "Most-used values and one-click unlocks (requires Advanced Edits)."),
      el(
        "div",
        { class: "grid", style: { marginTop: "10px" } },
        textInput({
          label: "Player Name",
          value: save.m_PlayerName,
          onChange: (v) => {
            save.m_PlayerName = String(v ?? "");
          },
        }),
        numberInput({
          label: "Coins (Wallet)",
          value: save.m_CoinAmountDouble,
          step: "0.01",
          min: 0,
          onChange: (n) => {
            const v = Math.max(0, n);
            save.m_CoinAmountDouble = v;
            if ("m_CoinAmount" in save) save.m_CoinAmount = v;
          },
        }),
        numberInput({
          label: "Fame Points",
          value: save.m_FamePoint,
          min: 0,
          onChange: (n) => {
            save.m_FamePoint = Math.max(0, Math.trunc(n));
          },
        }),
        numberInput({
          label: "Shop Level",
          value: save.m_ShopLevel,
          min: 0,
          onChange: (n) => {
            save.m_ShopLevel = Math.max(0, Math.trunc(n));
          },
        }),
        numberInput({
          label: "Shop XP",
          value: save.m_ShopExpPoint,
          min: 0,
          onChange: (n) => {
            save.m_ShopExpPoint = Math.max(0, Math.trunc(n));
          },
        }),
        numberInput({
          label: "Current Day",
          value: save.m_CurrentDay,
          min: 0,
          onChange: (n) => {
            save.m_CurrentDay = Math.max(0, Math.trunc(n));
          },
        })
      ),
      el(
        "div",
        { class: "row", style: { marginTop: "10px" } },
        bulkBtn({
          label: "Unlock All Achievements",
          cls: "btn btn--accent",
          disabled: !advanced || !hasAchievements,
          title: !hasAchievements ? "Not present in this save." : advanced ? "Sets all achievement flags to true." : "Unlock Advanced Edits to use one-click unlocks.",
          onClick: () => save.m_IsAchievementUnlocked.fill(true),
        }),
        bulkBtn({
          label: "Unlock All Item Licenses",
          disabled: !advanced || !hasLicenses,
          title: !hasLicenses ? "Not present in this save." : advanced ? "Sets all item license flags to true." : "Unlock Advanced Edits to use one-click unlocks.",
          onClick: () => save.m_IsItemLicenseUnlocked.fill(true),
        }),
        bulkBtn({
          label: "Hire All Workers",
          disabled: !advanced || !hasWorkers,
          title: !hasWorkers ? "Not present in this save." : advanced ? "Sets all worker-hired flags to true." : "Unlock Advanced Edits to use one-click unlocks.",
          onClick: () => save.m_IsWorkerHired.fill(true),
        })
      )
    )
  );
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

  renderQuickTop();

  clear($("panelPlayer"));
  $("panelPlayer").appendChild(
    renderPlayerPanel({
      save: state.save,
      onEdit: () => setStatus("ok", "Edits staged. Save when ready."),
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
      },
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
      },
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
      },
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
      },
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
      },
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
    // non-fatal; user can still save/download
    setStatus("warn", `Loaded save, but automatic backup-on-load failed: ${e?.message ?? String(e)}`);
  }
  return null;
}

async function loadSaveResult(result) {
  if (!result) return;
  if (result.choices) {
    showSavePicker(result.choices);
    return;
  }
  if (result.error) {
    setStatus("bad", `Failed to decode save: ${result.error?.message ?? String(result.error)}`);
    return;
  }
  hideSavePicker();

  const detect = detectTcgShopSave(result.save);
  state.save = result.save;
  state.source = result.source;
  state.riskyEdited = false;

  const bak = await backupOnLoadIfEnabled(state.source);
  const codec = state.source.codec?.kind ?? "json";
  const bakLine = bak ? `Backup on load: ${bak.kind} (${bak.name})` : `Backup on load: ${$("chkBackupOnLoad").checked ? "ON" : "OFF"}`;
  const modeNote =
    state.source.mode === "folder-fallback"
      ? "\nNote: Loaded via browser folder fallback (read-only). Write-back is disabled; use Save (Download) then copy into place."
      : "";
  const detectNote = detect.ok
    ? ""
    : `\nWarning: Save signature check did not match expected keys.\nMissing keys (sample): ${detect.missing.slice(0, 12).join(", ")}${detect.missing.length > 12 ? ", …" : ""}\nThe editor will still load this file (use All Fields if panels look incomplete).`;
  setStatus(detect.ok ? "ok" : "warn", `Loaded save: ${state.source.displayName}\nCodec: ${codec}\n${bakLine}${modeNote}${detectNote}`);
  renderAllPanels();
  setPanelsVisible(detect.ok ? "player" : "raw");
}

async function doOpenFile() {
  try {
    hideSavePicker();
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
    hideSavePicker();
    setStatus("warn", "Opening folder picker...");
    await nextFrame();

    let r = null;
    if (window.isSecureContext && typeof window.showDirectoryPicker === "function") {
      let dirHandle = null;
      try {
        // Some Windows shell pickers refuse certain "system" folders in read-write mode.
        // Try read-write first, then fall back to read-only.
        try {
          dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
        } catch (e) {
          if (e?.name === "AbortError") throw e;
          dirHandle = await window.showDirectoryPicker({ mode: "read" });
        }
      } catch (e) {
        if (e?.name === "AbortError") {
          setStatus("warn", "Folder selection canceled.");
          return;
        }
        // If permissions/user-activation blocks the picker, fall back to webkitdirectory input.
        setStatus("warn", `Folder picker blocked (${e?.name ?? "error"}). Trying fallback...`);
      }

      if (dirHandle) {
        setStatus("warn", "Scanning folder for save payload...");
        await nextFrame();
        r = await openSaveFolderFromDirectoryHandle(dirHandle);
      }
    }

    if (!r) {
      // Works in Chrome/Edge even when directory picker is blocked by policy; read-only, download-based saves.
      setStatus("warn", "Opening fallback folder picker...");
      await nextFrame();
      r = await openSaveFolderViaInputFallback();
    }

    if (!r) {
      setStatus("warn", "Folder selection canceled.");
      return;
    }

    await loadSaveResult(r);
  } catch (e) {
    const msg = e?.message ?? String(e);
    setStatus(
      "bad",
      `Open folder failed: ${msg}\nTip: If Windows refuses selecting the WGS folder due to “system files”, try selecting the long child folder inside \\wgs\\ (GUID-like name), or use Open Save File and pick the payload file inside that folder.`
    );
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
    // update "originalBytes" snapshot
    state.source.originalBytes = bytes;
    setStatus("ok", "Saved successfully (write-back). Launch the game and verify the edited values.");
  } catch (e) {
    setStatus("bad", `Write-back failed: ${e?.message ?? String(e)}\nUse Save (Download) as a fallback.`);
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
      const { decodeToJson } = await import("./lib/codec.js");
      const decoded = await decodeToJson(bytes);
      await loadSaveResult({
        source: { mode: "drop", fileHandle: null, dirHandle: null, displayName: f.name, codec: decoded.codec, originalBytes: decoded.originalBytes },
        save: decoded.json,
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
  $("btnLoadPick").addEventListener("click", async () => {
    const idx = Number($("savePickSelect")?.value || 0) || 0;
    const choice = state.pendingChoices?.[idx];
    if (!choice) return;
    if (state.save && !confirm("Load a different save and discard current unsaved edits?")) return;
    await loadSaveResult(choice);
  });
  $("btnCancelPick").addEventListener("click", hideSavePicker);

  const folderBtn = $("btnOpenFolder");
  folderBtn.title = "Chrome/Edge desktop recommended. On unsupported browsers, use Open Save File.";

  setPanelsVisible("empty");
  refreshSaveButtons();
}

init();
