function u8(input) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function looksLikeBase64Text(text) {
  const t = text.trim();
  if (t.length < 64) return false;
  if (t.length % 4 !== 0) return false;
  // Common base64 alphabets (+, /) and url-safe (-, _)
  const ok = /^[A-Za-z0-9+/_=-]+$/.test(t);
  if (!ok) return false;
  // Avoid treating JSON as base64
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
  if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) return { kind: "gzip" };
  // zlib (most common): 78 01 / 78 9c / 78 da
  if (b.length >= 2 && b[0] === 0x78 && (b[1] === 0x01 || b[1] === 0x9c || b[1] === 0xda)) return { kind: "deflate" };
  // plain JSON text
  if (b.length >= 1 && (b[0] === 0x7b || b[0] === 0x5b)) return { kind: "json" }; // { or [
  return { kind: "unknown" };
}

export async function decodeToJson(bytes) {
  const original = u8(bytes);

  // 1) try direct UTF-8 text JSON
  const head = original.slice(0, 1);
  if (head[0] === 0x7b || head[0] === 0x5b) {
    const text = bytesToUtf8(original);
    return { json: JSON.parse(text), codec: { kind: "json" }, originalBytes: original };
  }

  // 2) try compression containers
  const s = sniff(original);
  if (s.kind === "gzip" || s.kind === "deflate") {
    const decompressed = await decompress(original, s.kind);
    const text = bytesToUtf8(decompressed);
    return { json: JSON.parse(text), codec: { kind: s.kind }, originalBytes: original };
  }

  // 3) try base64-wrapped content
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

export async function encodeFromJson(json, codec) {
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
    // btoa() requires a binary string; build it in chunks to avoid call-stack limits.
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < innerBytes.length; i += chunk) {
      const sub = innerBytes.subarray(i, i + chunk);
      bin += String.fromCharCode(...sub);
    }
    let b64 = btoa(bin);
    if (codec?.urlSafe) b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const out = new TextEncoder().encode(b64);
    return { bytes: out, mime: "text/plain" };
  }

  // fallback: write JSON
  return { bytes: raw, mime: "application/json" };
}
