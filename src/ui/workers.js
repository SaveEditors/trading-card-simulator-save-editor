import { el } from "../lib/dom.js";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function renderWorkersPanel({ save, getAdvancedUnlocked, onSafeEdit, onRiskyEdit }) {
  const advanced = !!getAdvancedUnlocked?.();
  const root = el("div", {});

  const list = Array.isArray(save.m_WorkerSaveDataList) ? save.m_WorkerSaveDataList : [];
  root.appendChild(
    el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Workers"),
      el(
        "div",
        { class: "card__desc" },
        "Workers include task/state + position/rotation. This editor focuses on safe toggles and price multipliers."
      )
    )
  );

  const card = el("div", { class: "card" }, el("div", { class: "card__title" }, `Worker List (${list.length})`));
  if (!list.length) {
    card.appendChild(el("div", { class: "card__desc" }, "No worker entries found in this save."));
    root.appendChild(card);
    return root;
  }

  const tableWrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
  const table = el("table", {});
  const thead = el(
    "thead",
    {},
    el("tr", {}, el("th", {}, "#"), el("th", {}, "Primary Task"), el("th", {}, "State"), el("th", {}, "Item Price Mult"), el("th", {}, "Card Price Mult"))
  );
  const tbody = el("tbody", {});
  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);

  list.forEach((w, idx) => {
    const itemMult = el("input", { type: "number", value: String(n(w.setPriceMultiplier ?? 1)), step: "0.01", min: "0", disabled: !advanced });
    itemMult.addEventListener("change", () => {
      w.setPriceMultiplier = Math.max(0, n(itemMult.value));
      onRiskyEdit?.();
    });
    const cardMult = el("input", { type: "number", value: String(n(w.setCardPriceMultiplier ?? 1)), step: "0.01", min: "0", disabled: !advanced });
    cardMult.addEventListener("change", () => {
      w.setCardPriceMultiplier = Math.max(0, n(cardMult.value));
      onRiskyEdit?.();
    });

    tbody.appendChild(
      el(
        "tr",
        {},
        el("td", { class: "mono" }, String(idx)),
        el("td", {}, String(w.primaryTask ?? 0)),
        el("td", {}, String(w.currentState ?? 0)),
        el("td", {}, itemMult),
        el("td", {}, cardMult)
      )
    );
  });

  card.appendChild(el("div", { class: "hint", style: { marginTop: "10px" } }, "Positions/rotations and task IDs are internal state. Use All Fields/Raw only if you know what they do."));
  root.appendChild(card);
  return root;
}

