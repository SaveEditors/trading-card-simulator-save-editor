import { clear, fmtNumber, nowStamp } from "./lib/dom.js";
import { openSaveFileAny, openSaveFolderAutoFind, writeBack, downloadBytes, backupBesideIfPossible } from "./lib/fs.js";
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
  if (result.error) {
    setStatus("bad", `Failed to decode save: ${result.error?.message ?? String(result.error)}`);
    return;
  }

  const detect = detectTcgShopSave(result.save);
  if (!detect.ok) {
    setStatus("bad", `This file does not look like a Trading Card Shop Simulator save.\nMissing keys: ${detect.missing.slice(0, 12).join(", ")}${detect.missing.length > 12 ? ", …" : ""}`);
    return;
  }

  state.save = result.save;
  state.source = result.source;
  state.riskyEdited = false;

  const bak = await backupOnLoadIfEnabled(state.source);
  const codec = state.source.codec?.kind ?? "json";
  const bakLine = bak ? `Backup on load: ${bak.kind} (${bak.name})` : `Backup on load: ${$("chkBackupOnLoad").checked ? "ON" : "OFF"}`;
  setStatus("ok", `Loaded save: ${state.source.displayName}\nCodec: ${codec}\n${bakLine}`);
  renderAllPanels();
  setPanelsVisible("player");
}

async function doOpenFile() {
  setStatus(null, "");
  try {
    const r = await openSaveFileAny();
    await loadSaveResult(r);
  } catch (e) {
    setStatus("bad", `Open failed: ${e?.message ?? String(e)}`);
  }
}

async function doOpenFolder() {
  setStatus(null, "");
  try {
    if (!window.isSecureContext) {
      setStatus(
        "bad",
        "Open Save Folder requires a secure context.\nUse the live editor page (https) or run a local server (http://127.0.0.1/).\nIt will not work from file://."
      );
      return;
    }
    if (typeof window.showDirectoryPicker !== "function") {
      setStatus(
        "bad",
        "Open Save Folder is not supported in this browser.\nUse Open Save File as a fallback (or switch to Chrome/Edge desktop)."
      );
      return;
    }
    const r = await openSaveFolderAutoFind();
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

  const folderBtn = $("btnOpenFolder");
  folderBtn.title = "Chrome/Edge desktop recommended. On unsupported browsers, use Open Save File.";

  setPanelsVisible("empty");
  refreshSaveButtons();
}

init();
