import { el } from "../lib/dom.js";

function renderBoolArray({ title, desc, arr, advanced, onEdit }) {
  const card = el("div", { class: "card" }, el("div", { class: "card__title" }, title), el("div", { class: "card__desc" }, desc));
  if (!Array.isArray(arr)) {
    card.appendChild(el("div", { class: "hint" }, "Not present in this save."));
    return card;
  }

  const bulkRow = el("div", { class: "row", style: { marginTop: "10px" } });
  bulkRow.appendChild(el("div", { class: "pillwarn" }, `Length ${arr.length}`));
  const mkBulkBtn = (label, title, fn, cls = "btn") =>
    el(
      "button",
      {
        class: cls,
        disabled: !advanced,
        title: advanced ? title : "Unlock Advanced Edits to change flags.",
        onclick: () => {
          fn?.();
          onEdit?.();
        },
      },
      label
    );
  bulkRow.appendChild(mkBulkBtn("Bulk: Unlock All", "Sets every entry to true.", () => arr.fill(true), "btn btn--accent"));
  bulkRow.appendChild(mkBulkBtn("Bulk: Lock All", "Sets every entry to false.", () => arr.fill(false)));
  bulkRow.appendChild(
    mkBulkBtn("Bulk: Invert", "Flips every entry (true↔false).", () => {
      for (let i = 0; i < arr.length; i++) arr[i] = !arr[i];
    })
  );
  card.appendChild(bulkRow);

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

export function renderFlagsPanel({ save, getAdvancedUnlocked, onSafeEdit, onRiskyEdit }) {
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

  const known = [
    { key: "m_IsItemLicenseUnlocked", title: "Item Licenses", desc: "m_IsItemLicenseUnlocked (often 0–500)." },
    { key: "m_IsWorkerHired", title: "Workers Hired", desc: "m_IsWorkerHired (often 0–99)." },
    { key: "m_IsAchievementUnlocked", title: "Achievements", desc: "m_IsAchievementUnlocked (often 0–99)." },
  ];

  for (const k of known) {
    root.appendChild(
      renderBoolArray({
        title: k.title,
        desc: k.desc,
        arr: save?.[k.key],
        advanced,
        onEdit: () => onRiskyEdit?.(),
      })
    );
  }

  const isBoolArray = (v) => Array.isArray(v) && v.length && v.slice(0, 240).every((x) => typeof x === "boolean");
  const knownKeys = new Set(known.map((k) => k.key));
  const otherKeys = Object.keys(save ?? {})
    .filter((k) => !knownKeys.has(k))
    .filter((k) => /unlock|unlocked|license|achievement|hire|hired/i.test(k))
    .filter((k) => isBoolArray(save[k]))
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 40);

  if (otherKeys.length) {
    const card = el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Other Unlock Lists"),
      el("div", { class: "card__desc" }, "Auto-detected boolean lists on the save root (unlock, unlocked, hire, achievement, license).")
    );
    const sel = el("select", {}, ...otherKeys.map((k) => el("option", { value: k }, `${k} (${save[k].length})`)));
    const host = el("div", { style: { marginTop: "12px" } });
    const renderPicked = () => {
      while (host.firstChild) host.removeChild(host.firstChild);
      const key = sel.value;
      const title = key.replace(/^m_/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
      host.appendChild(
        renderBoolArray({
          title,
          desc: `${key} (auto-detected).`,
          arr: save[key],
          advanced,
          onEdit: () => onRiskyEdit?.(),
        })
      );
    };
    sel.addEventListener("change", renderPicked);
    card.appendChild(el("div", { class: "row", style: { marginTop: "10px" } }, el("span", { class: "muted tiny" }, "Pick list"), sel));
    card.appendChild(host);
    renderPicked();
    root.appendChild(card);
  }

  return root;
}
