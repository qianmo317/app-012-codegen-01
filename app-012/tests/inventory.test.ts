import { describe, it, expect, beforeEach } from 'vitest';
import {
  createInventory,
  getStock,
  getHerbTotals,
  getAllTotals,
  canDispense,
  dispense,
  restock,
  correctEntry,
  setMinStock,
  getRestockList,
  summarizeConsumption,
  summarizeRange,
  closeDay,
  formatDate,
  addDays,
  todayString,
  round1,
} from '../src/inventory';
import type { InventoryState } from '../src/inventory';
import { saveInventory, loadInventory, clearInventory } from '../src/storage';
import { GameManager } from '../src/game/state';

const DAY1 = '2026-09-18';
const DAY2 = '2026-09-19';
const DAY3 = '2026-09-20';

function makeInventory(): InventoryState {
  return createInventory(
    [
      { name: '白芍', minStock: 50, initialStock: 200 },
      { name: '熟地', minStock: 50, initialStock: 100 },
      { name: '甘草', minStock: 30, initialStock: 60 },
    ],
    DAY1,
    1000
  );
}

describe('createInventory', () => {
  it('should record opening stock as restock entries', () => {
    const inv = makeInventory();
    expect(getStock(inv, '白芍')).toBe(200);
    expect(getStock(inv, '熟地')).toBe(100);
    const opening = inv.entries.filter(e => e.note === '期初结存');
    expect(opening.length).toBe(3);
    expect(opening.every(e => e.type === 'restock' && e.date === DAY1)).toBe(true);
  });

  it('should give every entry a unique id', () => {
    const inv = makeInventory();
    const ids = inv.entries.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('dispense 抓药扣账', () => {
  let inv: InventoryState;
  beforeEach(() => {
    inv = makeInventory();
  });

  it('should deduct stock after dispensing', () => {
    const r = dispense(inv, '白芍', 12, DAY2, 2000);
    expect(r.ok).toBe(true);
    expect(getStock(inv, '白芍')).toBe(188);
  });

  it('should accumulate dispensed totals per herb', () => {
    dispense(inv, '白芍', 12, DAY2, 2000);
    dispense(inv, '白芍', 8, DAY2, 3000);
    const t = getHerbTotals(inv, '白芍');
    expect(t.dispensed).toBe(20);
    expect(t.restocked).toBe(200);
    expect(t.stock).toBe(180);
  });

  it('should block dispensing when stock is insufficient', () => {
    const r = dispense(inv, '熟地', 150, DAY2, 2000);
    expect(r.ok).toBe(false);
    expect(r.entry).toBeNull();
    expect(getStock(inv, '熟地')).toBe(100);
    expect(inv.entries.filter(e => e.type === 'dispense').length).toBe(0);
  });

  it('should allow dispensing exactly the remaining stock', () => {
    const r = dispense(inv, '熟地', 100, DAY2, 2000);
    expect(r.ok).toBe(true);
    expect(getStock(inv, '熟地')).toBe(0);
    expect(canDispense(inv, '熟地', 0.1)).toBe(false);
  });

  it('should reject zero or negative grams', () => {
    expect(dispense(inv, '白芍', 0, DAY2, 2000).ok).toBe(false);
    expect(dispense(inv, '白芍', -5, DAY2, 2000).ok).toBe(false);
    expect(canDispense(inv, '白芍', 0)).toBe(false);
  });

  it('should handle fractional grams without float drift', () => {
    dispense(inv, '甘草', 10.5, DAY2, 2000);
    dispense(inv, '甘草', 0.3, DAY2, 3000);
    expect(getStock(inv, '甘草')).toBe(49.2);
  });
});

describe('restock 补货', () => {
  it('should increase stock and record arrival date', () => {
    const inv = makeInventory();
    dispense(inv, '白芍', 160, DAY2, 2000);
    const entry = restock(inv, '白芍', 160, DAY3, 5000);
    expect(entry).not.toBeNull();
    expect(entry!.date).toBe(DAY3);
    expect(entry!.amount).toBe(160);
    expect(getStock(inv, '白芍')).toBe(200);
    expect(getHerbTotals(inv, '白芍').restocked).toBe(360);
  });

  it('should keep two restocks on the same day as separate entries', () => {
    const inv = makeInventory();
    const a = restock(inv, '白芍', 50, DAY3, 5000);
    const b = restock(inv, '白芍', 30, DAY3, 6000);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.id).not.toBe(b!.id);
    const todays = inv.entries.filter(e => e.type === 'restock' && e.herb === '白芍' && e.date === DAY3);
    expect(todays.length).toBe(2);
    expect(todays[0].amount).toBe(50);
    expect(todays[1].amount).toBe(30);
  });

  it('should reject invalid restock amount', () => {
    const inv = makeInventory();
    expect(restock(inv, '白芍', 0, DAY3, 5000)).toBeNull();
    expect(restock(inv, '白芍', -10, DAY3, 5000)).toBeNull();
  });
});

describe('correctEntry 改账留痕', () => {
  it('should keep before/after and correction time', () => {
    const inv = makeInventory();
    const d = dispense(inv, '白芍', 12, DAY2, 2000).entry!;
    const c = correctEntry(inv, d.id, 10, 9000, '记错了');
    expect(c).not.toBeNull();
    expect(c!.before).toBe(12);
    expect(c!.after).toBe(10);
    expect(c!.time).toBe(9000);
    expect(c!.reason).toBe('记错了');
    expect(d.amount).toBe(10);
    expect(d.corrections.length).toBe(1);
    expect(getStock(inv, '白芍')).toBe(190);
  });

  it('should accumulate multiple corrections on one entry', () => {
    const inv = makeInventory();
    const d = dispense(inv, '白芍', 12, DAY2, 2000).entry!;
    correctEntry(inv, d.id, 10, 9000);
    correctEntry(inv, d.id, 14, 9500);
    expect(d.corrections.length).toBe(2);
    expect(d.corrections[0].before).toBe(12);
    expect(d.corrections[0].after).toBe(10);
    expect(d.corrections[1].before).toBe(10);
    expect(d.corrections[1].after).toBe(14);
    expect(getStock(inv, '白芍')).toBe(186);
  });

  it('should return null for unknown entry or invalid amount', () => {
    const inv = makeInventory();
    expect(correctEntry(inv, 'no-such-id', 10, 9000)).toBeNull();
    const d = dispense(inv, '白芍', 12, DAY2, 2000).entry!;
    expect(correctEntry(inv, d.id, 0, 9000)).toBeNull();
    expect(correctEntry(inv, d.id, -3, 9000)).toBeNull();
    expect(d.amount).toBe(12);
  });
});

describe('getRestockList 待补清单', () => {
  it('should list herbs below minimum stock, biggest shortage first', () => {
    const inv = makeInventory();
    dispense(inv, '白芍', 160, DAY2, 2000); // 余 40 < 50 缺 10
    dispense(inv, '熟地', 90, DAY2, 3000); // 余 10 < 50 缺 40
    const list = getRestockList(inv);
    expect(list.map(i => i.herb)).toEqual(['熟地', '白芍']);
    expect(list[0].shortage).toBe(40);
    expect(list[1].shortage).toBe(10);
  });

  it('should be empty when everything is above the line', () => {
    const inv = makeInventory();
    expect(getRestockList(inv)).toEqual([]);
  });

  it('should follow min stock changes', () => {
    const inv = makeInventory();
    setMinStock(inv, '白芍', 250);
    const list = getRestockList(inv);
    expect(list.length).toBe(1);
    expect(list[0].herb).toBe('白芍');
    expect(list[0].shortage).toBe(50);
  });
});

describe('getAllTotals 总账', () => {
  it('should report stock/dispensed/restocked for every herb', () => {
    const inv = makeInventory();
    dispense(inv, '白芍', 12, DAY2, 2000);
    restock(inv, '白芍', 50, DAY3, 5000);
    const totals = getAllTotals(inv);
    const bs = totals.find(t => t.herb === '白芍')!;
    expect(bs.stock).toBe(238);
    expect(bs.dispensed).toBe(12);
    expect(bs.restocked).toBe(250);
    expect(bs.minStock).toBe(50);
    expect(bs.belowMin).toBe(false);
    expect(totals.length).toBe(3);
  });
});

describe('收工汇总', () => {
  it('should summarize one day only', () => {
    const inv = makeInventory();
    dispense(inv, '白芍', 12, DAY2, 2000);
    dispense(inv, '白芍', 8, DAY3, 3000);
    dispense(inv, '熟地', 20, DAY3, 4000);
    const s = summarizeConsumption(inv, DAY3);
    expect(s).toEqual([
      { herb: '熟地', grams: 20 },
      { herb: '白芍', grams: 8 },
    ]);
  });

  it('should sort fastest movers first', () => {
    const inv = makeInventory();
    dispense(inv, '白芍', 5, DAY2, 2000);
    dispense(inv, '熟地', 30, DAY2, 3000);
    dispense(inv, '甘草', 15, DAY2, 4000);
    const s = summarizeConsumption(inv, DAY2);
    expect(s.map(i => i.herb)).toEqual(['熟地', '甘草', '白芍']);
  });

  it('should summarize the last 7 days including the end date', () => {
    const inv = makeInventory();
    dispense(inv, '白芍', 10, addDays(DAY3, -6), 2000); // 窗口内最早一天
    dispense(inv, '白芍', 20, DAY3, 3000);
    dispense(inv, '熟地', 99, addDays(DAY3, -7), 4000); // 窗口外
    const s = summarizeRange(inv, DAY3, 7);
    expect(s.find(i => i.herb === '白芍')!.grams).toBe(30);
    expect(s.find(i => i.herb === '熟地')).toBeUndefined();
  });

  it('closeDay should give both today and last-7-days summaries', () => {
    const inv = makeInventory();
    dispense(inv, '白芍', 10, DAY1, 2000);
    dispense(inv, '白芍', 5, DAY3, 3000);
    dispense(inv, '熟地', 7, DAY3, 4000);
    const close = closeDay(inv, DAY3);
    expect(close.date).toBe(DAY3);
    expect(close.today).toEqual([
      { herb: '熟地', grams: 7 },
      { herb: '白芍', grams: 5 },
    ]);
    expect(close.week.find(i => i.herb === '白芍')!.grams).toBe(15);
  });
});

describe('日期工具', () => {
  it('formatDate should zero-pad month and day', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(formatDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });

  it('addDays should move across month boundaries', () => {
    expect(addDays('2026-09-20', -6)).toBe('2026-09-14');
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('todayString should match YYYY-MM-DD', () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('抓药与台账联动', () => {
  beforeEach(() => {
    clearInventory();
  });

  it('抓准一味就从账上扣一味', () => {
    const gm = new GameManager();
    gm.startLevel(1, false);
    const item = gm.prescription!.items[0];
    const before = getStock(gm.inventory, item.herb);
    expect(gm.selectDrawer(item.herb)).toBe(true);
    gm.setWeight(item.grams);
    const r = gm.confirmWeight();
    expect(r).not.toBeNull();
    expect(r!.ok).toBe(true);
    expect(getStock(gm.inventory, item.herb)).toBe(round1(before - item.grams));
  });

  it('账上不够的味，拉抽屉时就被拦住', () => {
    const gm = new GameManager();
    gm.startLevel(1, false);
    const item = gm.prescription!.items[0];
    dispense(gm.inventory, item.herb, 199, todayString(), 1); // 只剩 1g，不够任何处方
    expect(gm.selectDrawer(item.herb)).toBe(false);
    expect(gm.phase).toBe('playing');
    expect(gm.stockBlockMsg).toContain(item.herb);
  });

  it('称超了账上余量，确认时拦住不让抓', () => {
    const gm = new GameManager();
    gm.startLevel(1, false);
    const item = gm.prescription!.items[0];
    dispense(gm.inventory, item.herb, round1(200 - item.grams), todayString(), 1); // 账上只剩目标克数
    expect(gm.selectDrawer(item.herb)).toBe(true);
    gm.setWeight(item.grams + 0.5); // 误差内但超账上余量
    expect(gm.confirmWeight()).toBeNull();
    expect(gm.phase).toBe('weighing');
    expect(getStock(gm.inventory, item.herb)).toBe(item.grams);
    gm.setWeight(item.grams); // 减回目标量就能抓
    expect(gm.confirmWeight()!.ok).toBe(true);
    expect(getStock(gm.inventory, item.herb)).toBe(0);
  });

  it('ledger 里补货后就能继续抓', () => {
    const gm = new GameManager();
    gm.startLevel(1, false);
    const item = gm.prescription!.items[0];
    dispense(gm.inventory, item.herb, 199, todayString(), 1);
    expect(gm.selectDrawer(item.herb)).toBe(false);
    expect(gm.restockHerb(item.herb)).toBe(true);
    expect(getStock(gm.inventory, item.herb)).toBe(200);
    expect(gm.selectDrawer(item.herb)).toBe(true);
  });

  it('改账微调会留痕并改变库存', () => {
    const gm = new GameManager();
    gm.startLevel(1, false);
    const item = gm.prescription!.items[0];
    gm.selectDrawer(item.herb);
    gm.setWeight(item.grams);
    gm.confirmWeight();
    const entry = gm.inventory.entries.find(e => e.type === 'dispense')!;
    gm.selectLedgerEntry(entry.id);
    gm.adjustSelectedEntry(-2);
    expect(entry.amount).toBe(round1(item.grams - 2));
    expect(entry.corrections.length).toBe(1);
    expect(entry.corrections[0].before).toBe(item.grams);
    expect(entry.corrections[0].after).toBe(round1(item.grams - 2));
  });
});

describe('台账持久化', () => {
  beforeEach(() => {
    clearInventory();
  });

  it('should round-trip inventory through localStorage', () => {
    const inv = makeInventory();
    dispense(inv, '白芍', 12, DAY2, 2000);
    const d = inv.entries.find(e => e.type === 'dispense')!;
    correctEntry(inv, d.id, 10, 9000);
    saveInventory(inv);
    const loaded = loadInventory();
    expect(loaded).not.toBeNull();
    expect(getStock(loaded!, '白芍')).toBe(190);
    expect(loaded!.entries.find(e => e.id === d.id)!.corrections.length).toBe(1);
    expect(loaded!.minStock['白芍']).toBe(50);
  });

  it('should return null when nothing saved or data is broken', () => {
    expect(loadInventory()).toBeNull();
    localStorage.setItem('apothecary-inventory-v1', '{broken json');
    expect(loadInventory()).toBeNull();
    localStorage.setItem('apothecary-inventory-v1', JSON.stringify({ seq: 'x' }));
    expect(loadInventory()).toBeNull();
  });
});
