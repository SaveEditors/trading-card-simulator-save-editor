import { el, fmtNumber } from "../lib/dom.js";
import { buildItemRows } from "../lib/save.js";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function makeFilterRow({ onChange }) {
  const q = el("input", { type: "text", placeholder: "Filter by item id (e.g. 12)…" });
  const sel = el(
    "select",
    {},
    el("option", { value: "nonzero" }, "Non-zero / licensed"),
    el("option", { value: "all" }, "All items (500)"),
    el("option", { value: "licensed" }, "Licensed only")
  );
  const limit = el(
    "select",
    {},
    el("option", { value: "50" }, "50 rows"),
    el("option", { value: "100" }, "100 rows"),
    el("option", { value: "250" }, "250 rows")
  );

  const row = el("div", { class: "row" }, el("div", { class: "pillwarn" }, "Item IDs are internal indices (0–499)"), q, sel, limit);

  const fire = () => onChange?.({ q: q.value.trim(), mode: sel.value, limit: Number(limit.value) || 50 });
  q.addEventListener("input", fire);
  sel.addEventListener("change", fire);
  limit.addEventListener("change", fire);
  fire();
  return row;
}

export function renderItemsPanel({ save, getAdvancedUnlocked, onSafeEdit, onRiskyEdit }) {
  const advanced = !!getAdvancedUnlocked?.();
  const root = el("div", {});

  root.appendChild(
    el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Items (Inventory + Pricing)"),
      el(
        "div",
        { class: "card__desc" },
        "Cross-links your item totals, set prices, costs, market prices, percent change, sold count, and license flags by item index."
      ),
      el(
        "div",
        { class: "hint" },
        "This editor does not ship proprietary item names. If/when item catalogs are extracted from game data, IDs will be labeled automatically."
      ),
      el(
        "div",
        { class: "row", style: { marginTop: "10px" } },
        el(
          "button",
          {
            class: "btn btn--accent",
            disabled: !advanced,
            title: advanced ? "Set every set-price to the current market price." : "Unlock Advanced Edits to use bulk operations.",
            onclick: () => {
              const market = save.m_GeneratedMarketPriceList;
              if (!Array.isArray(market) || !Array.isArray(save.m_SetItemPriceList)) return;
              for (let i = 0; i < save.m_SetItemPriceList.length; i++) save.m_SetItemPriceList[i] = n(market[i]);
              onRiskyEdit?.();
            },
          },
          "Bulk: Set Prices = Market"
        ),
        el(
          "button",
          {
            class: "btn",
            disabled: !advanced,
            title: advanced ? "Unlock every item license flag (length permitting)." : "Unlock Advanced Edits to use bulk operations.",
            onclick: () => {
              if (!Array.isArray(save.m_IsItemLicenseUnlocked)) return;
              for (let i = 0; i < save.m_IsItemLicenseUnlocked.length; i++) save.m_IsItemLicenseUnlocked[i] = true;
              onRiskyEdit?.();
            },
          },
          "Bulk: Unlock All Licenses"
        )
      )
    )
  );

  const tableCard = el("div", { class: "card" });
  tableCard.appendChild(el("div", { class: "card__title" }, "Item Index Table"));
  tableCard.appendChild(
    el("div", { class: "card__desc" }, advanced ? "Advanced edits are unlocked: totals and set prices are editable." : "Locked: view-only.")
  );

  const filterHost = el("div", { style: { marginTop: "10px" } });
  tableCard.appendChild(filterHost);

  const tableWrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
  const table = el("table", {});
  const thead = el(
    "thead",
    {},
    el(
      "tr",
      {},
      el("th", {}, "Item ID"),
      el("th", {}, "Licensed"),
      el("th", {}, "Total"),
      el("th", {}, "Set Price"),
      el("th", {}, "Market"),
      el("th", {}, "Avg Cost"),
      el("th", {}, "Sold")
    )
  );
  const tbody = el("tbody", {});
  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  tableCard.appendChild(tableWrap);
  root.appendChild(tableCard);

  const rows = buildItemRows(save);

  function renderRows({ q, mode, limit }) {
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const qn = q && /^\d+$/.test(q) ? Number(q) : null;
    const out = [];
    for (const r of rows) {
      const licensed = r.licensed == null ? null : !!r.licensed;
      const nonzero = n(r.count) !== 0 || n(r.setPrice) !== 0 || n(r.sold) !== 0 || licensed === true;
      if (mode === "nonzero" && !nonzero) continue;
      if (mode === "licensed" && licensed !== true) continue;
      if (qn != null && r.id !== qn) continue;
      out.push(r);
      if (out.length >= limit) break;
    }

    for (const r of out) {
      const licensedCell =
        r.licensed == null
          ? el("span", { class: "muted" }, "—")
          : el("span", { class: r.licensed ? "pillwarn" : "pillbad", title: "License flag from m_IsItemLicenseUnlocked." }, r.licensed ? "Yes" : "No");

      const totalInput = el("input", {
        type: "number",
        value: String(Math.trunc(n(r.count))),
        min: "0",
        step: "1",
        disabled: !advanced,
        title: advanced ? "Edits m_CurrentTotalItemCountList[itemId]." : "Unlock Advanced Edits.",
      });
      totalInput.addEventListener("change", () => {
        save.m_CurrentTotalItemCountList[r.id] = Math.max(0, Math.trunc(Number(totalInput.value) || 0));
        onRiskyEdit?.();
      });

      const priceInput = el("input", {
        type: "number",
        value: String(n(r.setPrice)),
        min: "0",
        step: "0.01",
        disabled: !advanced,
        title: advanced ? "Edits m_SetItemPriceList[itemId]." : "Unlock Advanced Edits.",
      });
      priceInput.addEventListener("change", () => {
        save.m_SetItemPriceList[r.id] = Math.max(0, Number(priceInput.value) || 0);
        onRiskyEdit?.();
      });

      tbody.appendChild(
        el(
          "tr",
          {},
          el("td", { class: "mono" }, String(r.id)),
          el("td", {}, licensedCell),
          el("td", {}, totalInput),
          el("td", {}, priceInput),
          el("td", {}, fmtNumber(r.market)),
          el("td", {}, fmtNumber(r.avgCost)),
          el("td", {}, fmtNumber(r.sold))
        )
      );
    }
  }

  filterHost.appendChild(makeFilterRow({ onChange: renderRows }));

  root.appendChild(
    el(
      "div",
      { class: "card" },
      el("div", { class: "card__title" }, "Shelf/box contents"),
      el(
        "div",
        { class: "card__desc" },
        "This save includes per-shelf and per-box contents (itemType + amount), plus placement state (positions/rotations/object types). The editor shows a safe summary here; layout editing is left to the All Fields explorer (Advanced Edits required)."
      ),
      (() => {
        const placed = new Map();
        const add = (itemType, amount) => {
          const id = Math.trunc(n(itemType));
          const a = Math.trunc(n(amount));
          if (!Number.isFinite(id) || !Number.isFinite(a) || a === 0) return;
          placed.set(id, (placed.get(id) ?? 0) + a);
        };

        const shelves = Array.isArray(save.m_ShelfSaveDataList) ? save.m_ShelfSaveDataList : [];
        for (const s of shelves) {
          const list = Array.isArray(s?.itemTypeAmountList) ? s.itemTypeAmountList : [];
          for (const it of list) add(it?.itemType, it?.amount);
        }

        const boxes = Array.isArray(save.m_PackageBoxItemSaveDataList) ? save.m_PackageBoxItemSaveDataList : [];
        for (const b of boxes) add(b?.itemTypeAmount?.itemType, b?.itemTypeAmount?.amount);

        const rows = [...placed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200);
        if (!rows.length) return el("div", { class: "hint" }, "No placed item amounts found (or everything is zero).");

        const wrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
        const t = el("table", {});
        t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Item ID"), el("th", {}, "Placed Amount (sum)"))));
        const tb = el("tbody", {});
        for (const [id, amt] of rows) tb.appendChild(el("tr", {}, el("td", { class: "mono" }, String(id)), el("td", {}, fmtNumber(amt))));
        t.appendChild(tb);
        wrap.appendChild(t);
        return wrap;
      })(),
      el("div", { class: "hint", style: { marginTop: "10px" } }, "Placed totals are derived from shelf + package box content lists and may not match global totals 1:1.")
    )
  );

  return root;
}
