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

async function readFirstByte(file) {
  const ab = await file.slice(0, 1).arrayBuffer();
  const b = new Uint8Array(ab);
  return b[0] ?? 0;
}

async function tryGetFile(fileHandle) {
  try {
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

async function tryReadFirstByte(file) {
  try {
    return await readFirstByte(file);
  } catch {
    return null;
  }
}

async function* walkDir(dirHandle, { maxDepth = 7, depth = 0 } = {}) {
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
      if (handle.kind === "file") yield { name, fileHandle: handle, depth };
      else if (handle.kind === "directory") yield* walkDir(handle, { maxDepth, depth: depth + 1 });
    }
  } catch {
    // Some folders can contain inaccessible/system entries; best-effort walk.
  }
}

export async function openSaveFileAny() {
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
        originalBytes: decoded.originalBytes,
      },
      save: decoded.json,
    };
  }

  // Fallback: <input type="file"> (no handle; download-only backups/saves)
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
          save: decoded.json,
        });
      } catch (e) {
        resolve({ error: e });
      }
    });
    input.click();
  });
}

function isLikelyPayloadFirstByte(first) {
  // { [ gzip zlib
  return first === 0x7b || first === 0x5b || first === 0x1f || first === 0x78;
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

export async function openSaveFolderFromDirectoryHandle(dirHandle) {
  if (!dirHandle) return null;

  // Cap scanning so selecting the wrong folder (e.g. a whole game install) doesn't hang forever.
  const MAX_FILES_SCANNED = 6500;
  const MAX_CANDIDATES = 140;

  const candidates = [];
  let scanned = 0;
  for await (const entry of walkDir(dirHandle, { maxDepth: 8 })) {
    scanned++;
    if (scanned > MAX_FILES_SCANNED) break;

    const file = await tryGetFile(entry.fileHandle);
    if (!file) continue;
    if (file.size < 256) continue;

    const first = await tryReadFirstByte(file);
    if (first == null) continue;
    if (!isLikelyPayloadFirstByte(first)) continue;

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
      originalBytes: decoded.originalBytes,
    },
    save: decoded.json,
  };
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
    .slice(0, 60);

  // Build candidate objects compatible with decodeFirstDecodable
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
      originalBytes: decoded.originalBytes,
    },
    save: decoded.json,
  };
}
