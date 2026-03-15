import { el } from "../lib/dom.js";

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
  return path.map((p) => (typeof p === "number" ? `[${p}]` : p)).join(".");
}

function getAt(root, path) {
  let cur = root;
  for (const seg of path) {
    if (cur == null) return undefined;
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
    const input = el("input", { type: "number", value: String(value), step: "0.01", disabled });
    input.addEventListener("change", () => onChange?.(Number(input.value)));
    return input;
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
        },
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
  const q = el("input", { type: "text", placeholder: `Filter keys (${keys.length})…` });
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
          },
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
            },
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
            },
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

export function renderRawPanel({ save, getAdvancedUnlocked, onRiskyEdit }) {
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
  const pathBox = el("input", { type: "text", value: "", placeholder: "Current path (e.g. m_WorkerSaveDataList)…", disabled: true });
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
        },
      });
      view = el("div", { class: "card" }, el("div", { class: "card__title" }, "Value"), el("div", { class: "card__desc" }, pathToString(path)), ed);
    }

    view.addEventListener("open-path", (e) => {
      openPath(e.detail.path);
    });
    host.appendChild(view);
  };

  // Root view starts at the save object, but many users want a quick key filter.
  openPath([]);
  return root;
}
