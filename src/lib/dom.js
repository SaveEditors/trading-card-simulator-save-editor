export function el(tag, attrs = {}, ...children) {
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

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function fmtNumber(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const decimals = abs < 1000 ? 2 : 0;
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: decimals }).format(n);
}

export function nowStamp() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function bytesToHex(u8, max = 16) {
  const a = [];
  for (let i = 0; i < Math.min(u8.length, max); i++) a.push(u8[i].toString(16).padStart(2, "0"));
  return a.join(" ");
}

