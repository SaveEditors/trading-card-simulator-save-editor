import { el } from "../lib/dom.js";

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

  root.appendChild(
    renderBoolArray({
      title: "Item Licenses",
      desc: "m_IsItemLicenseUnlocked (often 0–500).",
      arr: save.m_IsItemLicenseUnlocked,
      advanced,
      onEdit: () => onRiskyEdit?.(),
    })
  );
  root.appendChild(
    renderBoolArray({
      title: "Workers Hired",
      desc: "m_IsWorkerHired (often 0–99).",
      arr: save.m_IsWorkerHired,
      advanced,
      onEdit: () => onRiskyEdit?.(),
    })
  );
  root.appendChild(
    renderBoolArray({
      title: "Achievements",
      desc: "m_IsAchievementUnlocked (often 0–99).",
      arr: save.m_IsAchievementUnlocked,
      advanced,
      onEdit: () => onRiskyEdit?.(),
    })
  );

  return root;
}

