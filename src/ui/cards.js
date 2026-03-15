import { el, fmtNumber } from "../lib/dom.js";
import { getCardExpansions, getCardLists } from "../lib/save.js";

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function renderCardsPanel({ save, getAdvancedUnlocked, onSafeEdit, onRiskyEdit }) {
  const advanced = !!getAdvancedUnlocked?.();
  const root = el("div", {});

  const header = el(
    "div",
    { class: "card" },
    el("div", { class: "card__title" }, "Card Binder"),
    el(
      "div",
      { class: "card__desc" },
      "Browse card indices by expansion. Each row links owned count + collected flag + set price + market price."
    ),
    el("div", { class: "hint" }, "No copyrighted card names/art are included. IDs are internal indices (0–2099).")
  );

  const exSel = el("select", {});
  for (const ex of getCardExpansions()) exSel.appendChild(el("option", { value: ex.suffix }, ex.label));

  const filterSel = el(
    "select",
    {},
    el("option", { value: "collected" }, "Collected or owned > 0"),
    el("option", { value: "owned" }, "Owned > 0"),
    el("option", { value: "priced" }, "Has set price"),
    el("option", { value: "all" }, "All cards")
  );
  const pageSizeSel = el("select", {}, el("option", { value: "50" }, "50/page"), el("option", { value: "100" }, "100/page"), el("option", { value: "200" }, "200/page"));
  const pageInput = el("input", { type: "number", value: "1", min: "1", step: "1", style: { width: "100px" } });
  const jumpInput = el("input", { type: "text", placeholder: "Jump to card id…" });

  header.appendChild(el("div", { class: "row", style: { marginTop: "10px" } }, el("div", { class: "pillwarn" }, "Expansion"), exSel, filterSel, pageSizeSel, pageInput, jumpInput));

  header.appendChild(
    el(
      "div",
      { class: "row", style: { marginTop: "10px" } },
      el(
        "button",
        {
          class: "btn btn--accent",
          disabled: !advanced,
          title: advanced ? "Marks every card in the selected expansion as collected." : "Unlock Advanced Edits to use bulk operations.",
          onclick: () => {
            const lists = getCardLists(save, exSel.value);
            if (!Array.isArray(lists.collected)) return;
            for (let i = 0; i < lists.collected.length; i++) lists.collected[i] = true;
            onRiskyEdit?.();
          },
        },
        "Bulk: Mark All Collected"
      ),
      el(
        "button",
        {
          class: "btn",
          disabled: !advanced,
          title: advanced ? "Sets owned count to 1 for every collected card (selected expansion)." : "Unlock Advanced Edits to use bulk operations.",
          onclick: () => {
            const lists = getCardLists(save, exSel.value);
            if (!Array.isArray(lists.owned) || !Array.isArray(lists.collected)) return;
            for (let i = 0; i < lists.owned.length; i++) {
              if (lists.collected[i]) lists.owned[i] = Math.max(1, Math.trunc(n(lists.owned[i])));
            }
            onRiskyEdit?.();
          },
        },
        "Bulk: Own 1 of Collected"
      )
    )
  );

  const tableCard = el("div", { class: "card" });
  tableCard.appendChild(el("div", { class: "card__title" }, "Cards Table"));
  tableCard.appendChild(el("div", { class: "card__desc" }, advanced ? "Advanced edits unlocked: owned/collected/set price are editable." : "Locked: view-only."));

  const tableWrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
  const table = el("table", {});
  const thead = el("thead", {}, el("tr", {}, el("th", {}, "Card ID"), el("th", {}, "Collected"), el("th", {}, "Owned"), el("th", {}, "Set Price"), el("th", {}, "Market")));
  const tbody = el("tbody", {});
  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  tableCard.appendChild(tableWrap);

  const pagesHint = el("div", { class: "hint", style: { marginTop: "10px" } }, "");
  tableCard.insertBefore(pagesHint, tableWrap);

  function render() {
    const lists = getCardLists(save, exSel.value);
    const owned = Array.isArray(lists.owned) ? lists.owned : [];
    const collected = Array.isArray(lists.collected) ? lists.collected : [];
    const setPrice = Array.isArray(lists.setPrice) ? lists.setPrice : [];
    const market = Array.isArray(lists.market) ? lists.market : [];

    const mode = filterSel.value;
    const pageSize = Math.max(10, Number(pageSizeSel.value) || 50);
    let page = Math.max(1, Math.trunc(Number(pageInput.value) || 1));

    const filtered = [];
    for (let i = 0; i < owned.length; i++) {
      const o = Math.trunc(n(owned[i]));
      const c = !!collected[i];
      const p = n(setPrice[i]);
      if (mode === "owned" && o <= 0) continue;
      if (mode === "priced" && p <= 0) continue;
      if (mode === "collected" && !(c || o > 0)) continue;
      filtered.push(i);
    }

    const j = jumpInput.value.trim();
    if (j && /^\d+$/.test(j)) {
      const id = Number(j);
      const pos = filtered.indexOf(id);
      if (pos >= 0) page = Math.floor(pos / pageSize) + 1;
      else {
        filterSel.value = "all";
        return render();
      }
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) page = totalPages;
    pageInput.value = String(page);

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const start = (page - 1) * pageSize;
    const ids = filtered.slice(start, start + pageSize);

    for (const id of ids) {
      const chk = el("input", { type: "checkbox", checked: !!collected[id], disabled: !advanced });
      chk.addEventListener("change", () => {
        lists.collected[id] = chk.checked;
        onRiskyEdit?.();
      });

      const ownedInput = el("input", { type: "number", value: String(Math.trunc(n(owned[id]))), min: "0", step: "1", disabled: !advanced });
      ownedInput.addEventListener("change", () => {
        lists.owned[id] = Math.max(0, Math.trunc(Number(ownedInput.value) || 0));
        onRiskyEdit?.();
      });

      const priceInput = el("input", { type: "number", value: String(n(setPrice[id])), min: "0", step: "0.01", disabled: !advanced });
      priceInput.addEventListener("change", () => {
        lists.setPrice[id] = Math.max(0, Number(priceInput.value) || 0);
        onRiskyEdit?.();
      });

      tbody.appendChild(
        el("tr", {}, el("td", { class: "mono" }, String(id)), el("td", {}, chk), el("td", {}, ownedInput), el("td", {}, priceInput), el("td", {}, fmtNumber(market[id])))
      );
    }

    pagesHint.textContent = `Showing ${ids.length} of ${filtered.length} filtered cards • Page ${page}/${totalPages}`;
  }

  [exSel, filterSel, pageSizeSel, pageInput].forEach((c) => c.addEventListener("change", render));
  jumpInput.addEventListener("input", () => {
    const t = jumpInput.value.trim();
    if (t === "" || /^\d+$/.test(t)) render();
  });

  root.appendChild(header);
  root.appendChild(tableCard);
  render();

  // Card pack counts (index-based)
  const packArr = save.m_CollectionCardPackCountList;
  root.appendChild(
    (() => {
      const card = el(
        "div",
        { class: "card" },
        el("div", { class: "card__title" }, "Pack Counts"),
        el("div", { class: "card__desc" }, "m_CollectionCardPackCountList (index-based). Useful for debugging missing pack unlocks."),
        advanced ? el("div", { class: "hint" }, "Advanced edits unlocked: pack counts are editable.") : el("div", { class: "hint" }, "Locked: view-only.")
      );
      if (!Array.isArray(packArr)) {
        card.appendChild(el("div", { class: "hint" }, "Not present in this save."));
        return card;
      }
      const start = el("input", { type: "number", value: "0", min: "0", step: "1", style: { width: "110px" } });
      const count = el("select", {}, el("option", { value: "25" }, "25"), el("option", { value: "50", selected: true }, "50"), el("option", { value: "100" }, "100"));
      card.appendChild(el("div", { class: "row", style: { marginTop: "10px" } }, el("div", { class: "pillwarn" }, `Length ${packArr.length}`), start, count));
      const wrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
      const t = el("table", {});
      const tb = el("tbody", {});
      t.appendChild(el("thead", {}, el("tr", {}, el("th", {}, "Pack ID"), el("th", {}, "Count"))));
      t.appendChild(tb);
      wrap.appendChild(t);
      card.appendChild(wrap);
      const renderP = () => {
        while (tb.firstChild) tb.removeChild(tb.firstChild);
        const s = Math.max(0, Math.trunc(Number(start.value) || 0));
        const c = Math.max(1, Number(count.value) || 50);
        for (let i = s; i < Math.min(packArr.length, s + c); i++) {
          const inp = el("input", { type: "number", value: String(Math.trunc(n(packArr[i]))), min: "0", step: "1", disabled: !advanced });
          inp.addEventListener("change", () => {
            packArr[i] = Math.max(0, Math.trunc(Number(inp.value) || 0));
            onRiskyEdit?.();
          });
          tb.appendChild(el("tr", {}, el("td", { class: "mono" }, String(i)), el("td", {}, inp)));
        }
      };
      start.addEventListener("change", renderP);
      count.addEventListener("change", renderP);
      renderP();
      return card;
    })()
  );

  // Grading submit set (structured object with small fixed list)
  root.appendChild(
    (() => {
      const g = save.m_CurrentGradeCardSubmitSet;
      const card = el(
        "div",
        { class: "card" },
        el("div", { class: "card__title" }, "Grading (Submit Set)"),
        el(
          "div",
          { class: "card__desc" },
          "m_CurrentGradeCardSubmitSet. These fields are internal state; edits are locked unless Advanced Edits is enabled."
        )
      );
      if (!g || typeof g !== "object") {
        card.appendChild(el("div", { class: "hint" }, "Not present in this save."));
        return card;
      }

      const disabled = !advanced;
      if (disabled) card.appendChild(el("div", { class: "pillbad", style: { marginTop: "10px" } }, "Locked: unlock Advanced Edits to modify."));

      const service = el("input", { type: "number", value: String(Math.trunc(n(g.m_ServiceLevel ?? 0))), min: "0", step: "1", disabled });
      service.addEventListener("change", () => {
        g.m_ServiceLevel = Math.max(0, Math.trunc(Number(service.value) || 0));
        onRiskyEdit?.();
      });
      const day = el("input", { type: "number", value: String(Math.trunc(n(g.m_DayPassed ?? 0))), min: "0", step: "1", disabled });
      day.addEventListener("change", () => {
        g.m_DayPassed = Math.max(0, Math.trunc(Number(day.value) || 0));
        onRiskyEdit?.();
      });
      const minutes = el("input", { type: "number", value: String(n(g.m_MinutePassed ?? 0)), min: "0", step: "0.01", disabled });
      minutes.addEventListener("change", () => {
        g.m_MinutePassed = Math.max(0, Number(minutes.value) || 0);
        onRiskyEdit?.();
      });

      card.appendChild(
        el(
          "div",
          { class: "row", style: { marginTop: "10px" } },
          el("div", { class: "field", style: { marginTop: "0", minWidth: "180px" } }, el("label", {}, "Service Level"), service),
          el("div", { class: "field", style: { marginTop: "0", minWidth: "180px" } }, el("label", {}, "Day Passed"), day),
          el("div", { class: "field", style: { marginTop: "0", minWidth: "180px" } }, el("label", {}, "Minute Passed"), minutes)
        )
      );

      const list = Array.isArray(g.m_CardDataList) ? g.m_CardDataList : [];
      const wrap = el("div", { class: "tablewrap", style: { marginTop: "12px" } });
      const t = el("table", {});
      t.appendChild(
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            el("th", {}, "#"),
            el("th", {}, "ExpansionType"),
            el("th", {}, "MonsterType"),
            el("th", {}, "BorderType"),
            el("th", {}, "Foil"),
            el("th", {}, "Grade"),
            el("th", {}, "GradedIndex")
          )
        )
      );
      const tb = el("tbody", {});
      t.appendChild(tb);
      wrap.appendChild(t);
      card.appendChild(wrap);

      list.forEach((c, idx) => {
        const exp = el("input", { type: "number", value: String(Math.trunc(n(c.expansionType ?? 0))), min: "0", step: "1", disabled });
        exp.addEventListener("change", () => {
          c.expansionType = Math.max(0, Math.trunc(Number(exp.value) || 0));
          onRiskyEdit?.();
        });
        const mon = el("input", { type: "number", value: String(Math.trunc(n(c.monsterType ?? 0))), min: "0", step: "1", disabled });
        mon.addEventListener("change", () => {
          c.monsterType = Math.max(0, Math.trunc(Number(mon.value) || 0));
          onRiskyEdit?.();
        });
        const border = el("input", { type: "number", value: String(Math.trunc(n(c.borderType ?? 0))), min: "0", step: "1", disabled });
        border.addEventListener("change", () => {
          c.borderType = Math.max(0, Math.trunc(Number(border.value) || 0));
          onRiskyEdit?.();
        });
        const foil = el("input", { type: "checkbox", checked: !!c.isFoil, disabled });
        foil.addEventListener("change", () => {
          c.isFoil = !!foil.checked;
          onRiskyEdit?.();
        });
        const grade = el("input", { type: "number", value: String(Math.trunc(n(c.cardGrade ?? 0))), min: "0", step: "1", disabled });
        grade.addEventListener("change", () => {
          c.cardGrade = Math.max(0, Math.trunc(Number(grade.value) || 0));
          onRiskyEdit?.();
        });
        const gidx = el("input", { type: "number", value: String(Math.trunc(n(c.gradedCardIndex ?? 0))), min: "0", step: "1", disabled });
        gidx.addEventListener("change", () => {
          c.gradedCardIndex = Math.max(0, Math.trunc(Number(gidx.value) || 0));
          onRiskyEdit?.();
        });

        tb.appendChild(el("tr", {}, el("td", { class: "mono" }, String(idx)), el("td", {}, exp), el("td", {}, mon), el("td", {}, border), el("td", {}, foil), el("td", {}, grade), el("td", {}, gidx)));
      });

      card.appendChild(el("div", { class: "hint", style: { marginTop: "10px" } }, "If you are unsure what these IDs mean, leave them unchanged and use the normal binder/table controls instead."));
      return card;
    })()
  );

  return root;
}
