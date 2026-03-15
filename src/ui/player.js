import { el } from "../lib/dom.js";

function numberField({ label, tip, value, min = 0, step = "1", disabled = false, onChange }) {
  const input = el("input", { type: "number", value: String(value ?? 0), min: String(min), step: String(step), disabled });
  input.addEventListener("change", () => {
    const n = Number(input.value);
    onChange?.(Number.isFinite(n) ? n : value);
  });
  return el(
    "div",
    { class: "field" },
    el("label", {}, el("span", {}, label), tip ? el("span", { class: "tiny muted", title: tip }, "?") : null),
    input
  );
}

function textField({ label, tip, value, disabled = false, onChange }) {
  const input = el("input", { type: "text", value: String(value ?? ""), disabled });
  input.addEventListener("change", () => onChange?.(input.value));
  return el(
    "div",
    { class: "field" },
    el("label", {}, el("span", {}, label), tip ? el("span", { class: "tiny muted", title: tip }, "?") : null),
    input
  );
}

function boolSelect({ label, tip, value, disabled = false, onChange }) {
  const input = el(
    "select",
    { disabled },
    el("option", { value: "false", selected: String(!!value) === "false" }, "False"),
    el("option", { value: "true", selected: String(!!value) === "true" }, "True")
  );
  input.addEventListener("change", () => onChange?.(input.value === "true"));
  return el(
    "div",
    { class: "field" },
    el("label", {}, el("span", {}, label), tip ? el("span", { class: "tiny muted", title: tip }, "?") : null),
    input
  );
}

export function renderPlayerPanel({ save, onEdit }) {
  const grid = el("div", { class: "grid" });

  const player = el(
    "div",
    { class: "card" },
    el("div", { class: "card__title" }, "Player Card"),
    el("div", { class: "card__desc" }, "Currency, levels, and the stats you most often want to tweak."),
    textField({
      label: "Player Name",
      tip: "Name shown in the shop / UI.",
      value: save.m_PlayerName,
      onChange: (v) => {
        save.m_PlayerName = String(v ?? "");
        onEdit?.();
      },
    }),
    numberField({
      label: "Coins (Wallet)",
      tip: "Updates both m_CoinAmountDouble and m_CoinAmount (when present).",
      value: save.m_CoinAmountDouble,
      step: "0.01",
      min: 0,
      onChange: (n) => {
        const v = Math.max(0, n);
        save.m_CoinAmountDouble = v;
        if ("m_CoinAmount" in save) save.m_CoinAmount = v;
        onEdit?.();
      },
    }),
    numberField({
      label: "Fame Points",
      tip: "Your shop fame progression.",
      value: save.m_FamePoint,
      min: 0,
      onChange: (n) => {
        save.m_FamePoint = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Total Fame Added",
      tip: "Cumulative fame delta tracking.",
      value: save.m_TotalFameAdd,
      min: 0,
      onChange: (n) => {
        save.m_TotalFameAdd = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Current Day",
      tip: "Day counter (used by schedules/bills).",
      value: save.m_CurrentDay,
      min: 0,
      onChange: (n) => {
        save.m_CurrentDay = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Shop Level",
      tip: "Shop level (unlocks often depend on it).",
      value: save.m_ShopLevel,
      min: 0,
      onChange: (n) => {
        save.m_ShopLevel = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Shop XP",
      tip: "Experience points towards shop level.",
      value: save.m_ShopExpPoint,
      min: 0,
      onChange: (n) => {
        save.m_ShopExpPoint = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    })
  );

  const shop = el(
    "div",
    { class: "card" },
    el("div", { class: "card__title" }, "Shop State"),
    el("div", { class: "card__desc" }, "Open/closed state, unlock toggles, and room counters."),
    boolSelect({
      label: "Shop Open (m_IsShopOpen)",
      tip: "If you change this mid-day, verify behavior in-game.",
      value: save.m_IsShopOpen,
      onChange: (v) => {
        save.m_IsShopOpen = !!v;
        onEdit?.();
      },
    }),
    boolSelect({
      label: "Shop Once Opened (m_IsShopOnceOpen)",
      tip: "Tracks whether the shop has ever been opened.",
      value: save.m_IsShopOnceOpen,
      onChange: (v) => {
        save.m_IsShopOnceOpen = !!v;
        onEdit?.();
      },
    }),
    boolSelect({
      label: "Warehouse Door Closed (m_IsWarehouseDoorClosed)",
      tip: "Door state tracking.",
      value: save.m_IsWarehouseDoorClosed,
      onChange: (v) => {
        save.m_IsWarehouseDoorClosed = !!v;
        onEdit?.();
      },
    }),
    boolSelect({
      label: "Warehouse Room Unlocked (m_IsWarehouseRoomUnlocked)",
      tip: "Main toggle for warehouse availability. Room counts are separate.",
      value: save.m_IsWarehouseRoomUnlocked,
      onChange: (v) => {
        save.m_IsWarehouseRoomUnlocked = !!v;
        onEdit?.();
      },
    }),
    numberField({
      label: "Unlocked Rooms (Shop) (m_UnlockRoomCount)",
      tip: "How many shop rooms you have unlocked.",
      value: save.m_UnlockRoomCount,
      min: 0,
      onChange: (n) => {
        save.m_UnlockRoomCount = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Unlocked Rooms (Warehouse) (m_UnlockWarehouseRoomCount)",
      tip: "How many warehouse rooms you have unlocked.",
      value: save.m_UnlockWarehouseRoomCount,
      min: 0,
      onChange: (n) => {
        save.m_UnlockWarehouseRoomCount = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    })
  );

  const tools = el(
    "div",
    { class: "card" },
    el("div", { class: "card__title" }, "Workbench + Quick Fill"),
    el("div", { class: "card__desc" }, "Limits and filters used by workbench and quick-fill automation features."),
    numberField({
      label: "Workbench: Minimum Card Limit",
      tip: "m_WorkbenchMinimumCardLimit",
      value: save.m_WorkbenchMinimumCardLimit,
      min: 0,
      onChange: (n) => {
        save.m_WorkbenchMinimumCardLimit = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Workbench: Price Limit",
      tip: "m_WorkbenchPriceLimit",
      value: save.m_WorkbenchPriceLimit,
      min: 0,
      step: "0.01",
      onChange: (n) => {
        save.m_WorkbenchPriceLimit = Math.max(0, n);
        onEdit?.();
      },
    }),
    numberField({
      label: "Workbench: Price Minimum",
      tip: "m_WorkbenchPriceMinimum",
      value: save.m_WorkbenchPriceMinimum,
      min: 0,
      step: "0.01",
      onChange: (n) => {
        save.m_WorkbenchPriceMinimum = Math.max(0, n);
        onEdit?.();
      },
    }),
    numberField({
      label: "Workbench: Rarity Limit",
      tip: "m_WorkbenchRarityLimit",
      value: save.m_WorkbenchRarityLimit,
      min: 0,
      onChange: (n) => {
        save.m_WorkbenchRarityLimit = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Workbench: Card Expansion Type",
      tip: "m_WorkbenchCardExpansionType (internal enum index)",
      value: save.m_WorkbenchCardExpansionType,
      min: 0,
      onChange: (n) => {
        save.m_WorkbenchCardExpansionType = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    el("div", { class: "divider" }),
    numberField({
      label: "Quick Fill: Minimum Card Limit",
      tip: "m_QuickFillMinimumCardLimit",
      value: save.m_QuickFillMinimumCardLimit,
      min: 0,
      onChange: (n) => {
        save.m_QuickFillMinimumCardLimit = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Quick Fill: Price Limit",
      tip: "m_QuickFillPriceLimit",
      value: save.m_QuickFillPriceLimit,
      min: 0,
      step: "0.01",
      onChange: (n) => {
        save.m_QuickFillPriceLimit = Math.max(0, n);
        onEdit?.();
      },
    }),
    numberField({
      label: "Quick Fill: Price Minimum",
      tip: "m_QuickFillPriceMinimum",
      value: save.m_QuickFillPriceMinimum,
      min: 0,
      step: "0.01",
      onChange: (n) => {
        save.m_QuickFillPriceMinimum = Math.max(0, n);
        onEdit?.();
      },
    }),
    numberField({
      label: "Quick Fill: Rarity Limit",
      tip: "m_QuickFillRarityLimit",
      value: save.m_QuickFillRarityLimit,
      min: 0,
      onChange: (n) => {
        save.m_QuickFillRarityLimit = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    }),
    numberField({
      label: "Quick Fill: Card Expansion Type",
      tip: "m_QuickFillCardExpansionType (internal enum index)",
      value: save.m_QuickFillCardExpansionType,
      min: 0,
      onChange: (n) => {
        save.m_QuickFillCardExpansionType = Math.max(0, Math.trunc(n));
        onEdit?.();
      },
    })
  );

  const audio = el(
    "div",
    { class: "card" },
    el("div", { class: "card__title" }, "Audio + UI"),
    el("div", { class: "card__desc" }, "Simple sliders that sometimes get stuck after patches/settings resets."),
    numberField({
      label: "Music Volume Decrease",
      tip: "m_MusicVolumeDecrease",
      value: save.m_MusicVolumeDecrease,
      min: 0,
      step: "0.01",
      onChange: (n) => {
        save.m_MusicVolumeDecrease = Math.max(0, n);
        onEdit?.();
      },
    }),
    numberField({
      label: "Sound Volume Decrease",
      tip: "m_SoundVolumeDecrease",
      value: save.m_SoundVolumeDecrease,
      min: 0,
      step: "0.01",
      onChange: (n) => {
        save.m_SoundVolumeDecrease = Math.max(0, n);
        onEdit?.();
      },
    })
  );

  grid.appendChild(player);
  grid.appendChild(shop);
  grid.appendChild(tools);
  grid.appendChild(audio);
  return grid;
}
