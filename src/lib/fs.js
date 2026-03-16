import { decodeToJson, encodeFromJson } from "./codec.js";
import { nowStamp } from "./dom.js";

function supportsFilePicker() {
  return typeof window.showOpenFilePicker === "function";
}

function supportsDirectoryPicker() {
  return typeof window.showDirectoryPicker === "function";
}

function shouldSkipName(name) {
  const n = String(name ?? "").toLowerCase();
  // Keep this conservative: only skip well-known OS junk that can error or slow scans.
  return (
    n === "desktop.ini" ||
    n === "thumbs.db" ||
    n === ".ds_store" ||
    n === ".spotlight-v100" ||
    n === ".trashes" ||
    n === "$recycle.bin" ||
    n === "system volume information" ||
    n === "pagefile.sys" ||
    n === "hiberfil.sys" ||
    n === "swapfile.sys"
  );
}

async function readFileHandle(handle) {
  const file = await handle.getFile();
  const ab = await file.arrayBuffer();
  return { file, bytes: new Uint8Array(ab) };
}

async function tryGetFile(fileHandle) {
  try {
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

async function* walkDir(dirHandle, { maxDepth = 7, depth = 0, prefix = "" } = {}) {
  if (depth > maxDepth) return;
  let it = null;
  try {
    it = dirHandle.entries();
  } catch {
    return;
  }

  try {
    for await (const [name, handle] of it) {
      if (shouldSkipName(name)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "file") yield { name, fileHandle: handle, depth, path };
      else if (handle.kind === "directory") yield* walkDir(handle, { maxDepth, depth: depth + 1, prefix: path });
    }
  } catch {
    // Some folders can contain inaccessible/system entries; best-effort walk.
  }
}

export async function openSaveFileAny() {
  if (supportsFilePicker()) {
    const handles = await window.showOpenFilePicker({ multiple: true, excludeAcceptAllOption: false });
    if (!handles?.length) return null;

    const choices = [];
    let lastErr = null;
    for (const handle of handles.slice(0, 30)) {
      try {
        const { file, bytes } = await readFileHandle(handle);
        const decoded = await decodeToJson(bytes);
        choices.push({
          source: {
            mode: "file",
            fileHandle: handle,
            dirHandle: null,
            displayName: file.name,
            codec: decoded.codec,
            originalBytes: decoded.originalBytes,
          },
          save: decoded.json,
          meta: { path: file.name, size: file.size, lastModified: file.lastModified },
        });
      } catch (e) {
        lastErr = e;
      }
    }

    if (!choices.length) {
      if (lastErr) throw lastErr;
      throw new Error("No decodable JSON save found in the selected file(s).");
    }
    if (choices.length === 1) return choices[0];
    return { choices };
  }

  // Fallback: <input type="file"> (no handle; download-only backups/saves)
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  return await new Promise((resolve) => {
    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return resolve(null);

      const choices = [];
      let lastErr = null;
      for (const f of files.slice(0, 30)) {
        try {
          const ab = await f.arrayBuffer();
          const bytes = new Uint8Array(ab);
          const decoded = await decodeToJson(bytes);
          choices.push({
            source: { mode: "drop", fileHandle: null, dirHandle: null, displayName: f.name, codec: decoded.codec, originalBytes: decoded.originalBytes },
            save: decoded.json,
            meta: { path: f.name, size: f.size, lastModified: f.lastModified },
          });
        } catch (e) {
          lastErr = e;
        }
      }

      if (!choices.length) return resolve({ error: lastErr ?? new Error("No valid save found in the selected file(s).") });
      if (choices.length === 1) return resolve(choices[0]);
      resolve({ choices });
    });
    input.click();
  });
}

async function decodeValidChoices(candidates, { max = 60 } = {}) {
  const valid = [];
  let lastErr = null;

  for (const c of candidates.slice(0, max)) {
    try {
      const ab = await c.file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const decoded = await decodeToJson(bytes);
      valid.push({ candidate: c, decoded });
    } catch (e) {
      lastErr = e;
    }
  }

  return { valid, lastErr };
}

export async function openSaveFolderFromDirectoryHandle(dirHandle) {
  if (!dirHandle) return null;

  // Cap scanning so selecting the wrong folder (e.g. a whole game install) doesn't hang forever.
  const MAX_FILES_SCANNED = 6500;
  const MAX_CANDIDATES = 260;

  const candidates = [];
  let scanned = 0;
  for await (const entry of walkDir(dirHandle, { maxDepth: 8 })) {
    scanned++;
    if (scanned > MAX_FILES_SCANNED) break;

    const file = await tryGetFile(entry.fileHandle);
    if (!file) continue;
    if (file.size < 256) continue;

    candidates.push({ ...entry, file });
    if (candidates.length > MAX_CANDIDATES) {
      candidates.sort((a, b) => b.file.size - a.file.size);
      candidates.length = MAX_CANDIDATES;
    }

    // Keep the UI responsive on large scans.
    if (scanned % 500 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.file.size - a.file.size);

  const { valid, lastErr } = await decodeValidChoices(candidates, { max: 160 });
  if (!valid.length) throw lastErr ?? new Error("No decodable save payload found.");

  const asChoice = ({ candidate: c, decoded }) => {
    const display = c.path || c.file.name;
    return {
      source: {
        mode: "folder",
        fileHandle: c.fileHandle,
        dirHandle,
        displayName: display,
        codec: decoded.codec,
        originalBytes: decoded.originalBytes,
      },
      save: decoded.json,
      meta: { path: display, size: c.file.size, lastModified: c.file.lastModified },
    };
  };

  const choices = valid.map(asChoice);
  choices.sort((a, b) => (b.meta?.lastModified ?? 0) - (a.meta?.lastModified ?? 0) || (b.meta?.size ?? 0) - (a.meta?.size ?? 0));
  if (choices.length === 1) return choices[0];
  return { choices };
}

async function ensureWritePermission(fileHandle) {
  if (!fileHandle) return false;
  if (typeof fileHandle.queryPermission !== "function" || typeof fileHandle.requestPermission !== "function") return true;
  try {
    const opts = { mode: "readwrite" };
    const q = await fileHandle.queryPermission(opts);
    if (q === "granted") return true;
    const r = await fileHandle.requestPermission(opts);
    return r === "granted";
  } catch {
    return false;
  }
}

export async function writeBack(source, save) {
  if (!source?.fileHandle) throw new Error("No file handle available for write-back.");
  const ok = await ensureWritePermission(source.fileHandle);
  if (!ok) throw new Error("Write permission was not granted for this file. Use Save (Download) and copy it into place.");
  const { bytes } = await encodeFromJson(save, source.codec);
  const writable = await source.fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

export function downloadBytes(filename, bytes, mime = "application/octet-stream") {
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

export async function backupBesideIfPossible(source, bytes, { suffix = "bak" } = {}) {
  const base = source?.displayName ?? "save";
  const name = `${base}.${suffix}-${nowStamp()}`;

  // Best effort: folder handle (create in selected folder root).
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
  // Chrome/Edge: folder picker via webkitdirectory
  input.webkitdirectory = true;

  return await new Promise((resolve) => {
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      resolve(files.length ? files : null);
    });
    input.click();
  });
}

export async function openSaveFolderViaInputFallback() {
  const files = await pickFolderFilesViaInput();
  if (!files) return null;

  // Auto-find: biggest likely payloads first until one decodes cleanly.
  const candidates = files
    .filter((f) => (f?.size ?? 0) >= 256)
    .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    .slice(0, 220);

  const asCandidates = candidates.map((file) => ({ file, name: file.name, path: file.webkitRelativePath || file.name, fileHandle: null, depth: 0 }));
  const { valid, lastErr } = await decodeValidChoices(asCandidates, { max: 160 });
  if (!valid.length) throw lastErr ?? new Error("No decodable save payload found.");

  const choices = valid.map(({ candidate: c, decoded }) => {
    const display = c.path || c.file.name;
    return {
      source: {
        mode: "folder-fallback",
        fileHandle: null,
        dirHandle: null,
        displayName: display,
        codec: decoded.codec,
        originalBytes: decoded.originalBytes,
      },
      save: decoded.json,
      meta: { path: display, size: c.file.size, lastModified: c.file.lastModified },
    };
  });

  choices.sort((a, b) => (b.meta?.lastModified ?? 0) - (a.meta?.lastModified ?? 0) || (b.meta?.size ?? 0) - (a.meta?.size ?? 0));
  if (choices.length === 1) return choices[0];
  return { choices };
}
