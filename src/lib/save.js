const REQUIRED_KEYS = [
  "m_PlayerName",
  "m_CoinAmountDouble",
  "m_ShopLevel",
  "m_CurrentDay",
  "m_CurrentTotalItemCountList",
  "m_SetItemPriceList",
  "m_GeneratedMarketPriceList",
  "m_StockSoldList",
  "m_CardCollectedList",
  "m_IsCardCollectedList",
  "m_CardPriceSetList",
  "m_GenCardMarketPriceList",
];

export function detectTcgShopSave(obj) {
  if (!obj || typeof obj !== "object") return { ok: false, missing: REQUIRED_KEYS };
  const missing = REQUIRED_KEYS.filter((k) => !(k in obj));
  return { ok: missing.length === 0, missing };
}

export function normalizeForWrite(save) {
  // Keep it conservative: sync known duplicate coin fields when present.
  if (typeof save.m_CoinAmountDouble === "number" && "m_CoinAmount" in save) {
    save.m_CoinAmount = save.m_CoinAmountDouble;
  }
  return save;
}

export function summarizeSave(save) {
  if (!save) return {};
  return {
    playerName: typeof save.m_PlayerName === "string" ? save.m_PlayerName : null,
    coins: typeof save.m_CoinAmountDouble === "number" ? save.m_CoinAmountDouble : null,
    day: Number.isFinite(save.m_CurrentDay) ? save.m_CurrentDay : null,
    shopLevel: Number.isFinite(save.m_ShopLevel) ? save.m_ShopLevel : null,
  };
}

export function buildItemRows(save) {
  const n = Array.isArray(save.m_CurrentTotalItemCountList) ? save.m_CurrentTotalItemCountList.length : 0;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: i,
      count: save.m_CurrentTotalItemCountList?.[i] ?? 0,
      setPrice: save.m_SetItemPriceList?.[i] ?? 0,
      avgCost: save.m_AverageItemCostList?.[i] ?? 0,
      genCost: save.m_GeneratedCostPriceList?.[i] ?? 0,
      market: save.m_GeneratedMarketPriceList?.[i] ?? 0,
      pct: save.m_ItemPricePercentChangeList?.[i] ?? 0,
      sold: save.m_StockSoldList?.[i] ?? 0,
      licensed: Array.isArray(save.m_IsItemLicenseUnlocked) ? !!save.m_IsItemLicenseUnlocked?.[i] : null,
    });
  }
  return rows;
}

const CARD_EXPANSIONS = [
  { key: "base", suffix: "", label: "Base" },
  { key: "destiny", suffix: "Destiny", label: "Destiny" },
  { key: "ghost", suffix: "Ghost", label: "Ghost" },
  { key: "ghostBlack", suffix: "GhostBlack", label: "Ghost (Black)" },
  { key: "megabot", suffix: "Megabot", label: "Megabot" },
  { key: "fantasyRPG", suffix: "FantasyRPG", label: "Fantasy RPG" },
  { key: "catJob", suffix: "CatJob", label: "Cat Job" },
];

export function getCardExpansions() {
  return CARD_EXPANSIONS.slice();
}

export function getCardLists(save, suffix) {
  const s = suffix ?? "";
  return {
    owned: save[`m_CardCollectedList${s}`],
    collected: save[`m_IsCardCollectedList${s}`],
    setPrice: save[`m_CardPriceSetList${s}`],
    market: save[`m_GenCardMarketPriceList${s}`],
  };
}

