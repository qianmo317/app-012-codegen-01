import { InventoryLedger, type LedgerData } from './inventory';

const LEDGER_KEY = 'apothecary-ledger-v1';

/**
 * 台账存档。与游戏最高分的存档分开存，互不影响。
 */
export function loadLedger(): InventoryLedger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (raw) {
      const data = JSON.parse(raw) as LedgerData;
      return InventoryLedger.fromJSON(data);
    }
  } catch {
    // 存档损坏时从空账开始，不拖垮游戏
  }
  return new InventoryLedger();
}

export function saveLedger(ledger: InventoryLedger): void {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger.toJSON()));
  } catch {
    // 存储满或被禁用时静默，账在本次会话内仍然有效
  }
}

export function clearLedgerStorage(): void {
  try {
    localStorage.removeItem(LEDGER_KEY);
  } catch {
    // ignore
  }
}
