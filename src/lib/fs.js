import { decodeToJson, encodeFromJson } from "./codec.js";
import { nowStamp } from "./dom.js";

function supportsFsAccess() {
  return typeof window.showOpenFilePicker === "function" && typeof window.showDirectoryPicker === "function";
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

export async function openSaveFileAny() {
  if (supportsFsAccess()) {
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

export async function openSaveFolderAutoFind() {
  if (!supportsFsAccess()) throw new Error("Folder picking is not supported in this browser. Use Open Save File instead.");

  const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  if (!dirHandle) return null;

  // Auto-find: try the biggest likely payloads first until one decodes cleanly.
  const candidates = [];
  for await (const entry of walkDir(dirHandle, { maxDepth: 8 })) {
    const file = await entry.fileHandle.getFile();
    if (file.size < 256) continue;
    const first = await readFirstByte(file);
    if (first !== 0x7b && first !== 0x5b && first !== 0x1f && first !== 0x78) continue; // { [ gzip zlib
    candidates.push({ ...entry, file });
  }
  candidates.sort((a, b) => b.file.size - a.file.size);
  if (!candidates.length) return null;

  let lastErr = null;
  for (const c of candidates.slice(0, 25)) {
    try {
      const ab = await c.file.arrayBuffer();
      const bytes = new Uint8Array(ab);
      const decoded = await decodeToJson(bytes);
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
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr ?? new Error("No decodable save payload found in the selected folder.");
}

export async function writeBack(source, save) {
  if (!source?.fileHandle) throw new Error("No file handle available for write-back.");
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
