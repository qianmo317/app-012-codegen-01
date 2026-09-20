import { describe, it, expect, beforeEach } from 'vitest';
import { GameManager } from '../src/game/state';
import { InventoryLedger } from '../src/ledger/inventory';
import { HERBS } from '../src/herbs';

/**
 * 游戏与台账的联动：
 * - 抓药成功按实际秤量扣库存
 * - 库存不足在开抽屉时就拦住
 * - 确认称重时若库存不足（被补货线变化等影响）也拦住，不计分包
 */
describe('GameManager × 台账', () => {
  let gm: GameManager;
  let ledger: InventoryLedger;

  beforeEach(() => {
    ledger = new InventoryLedger({ initialStock: 100, defaultReorderLevel: 20 });
    gm = new GameManager(ledger);
    gm.startLevel(1, false);
  });

  it('每关开始为本关药味立账', () => {
    for (const h of gm.herbs) {
      expect(ledger.getStock(h.name)?.onHand).toBe(100);
    }
    if (gm.prescription) {
      for (const item of gm.prescription.items) {
        expect(ledger.getStock(item.herb)).toBeDefined();
      }
    }
  });

  it('库存充足时开抽屉进入称重，成功确认后按实际克数扣账', () => {
    const herb = gm.prescription!.items[0].herb;
    const target = gm.prescription!.items[0].grams;
    expect(gm.selectDrawer(herb)).toBe(true);
    expect(gm.currentHerb).toBe(herb);

    // 秤到目标克重并确认（必定判定通过）
    gm.setWeight(target);
    const result = gm.confirmWeight();
    expect(result?.blocked).toBeFalsy();
    expect(ledger.getStock(herb)?.onHand).toBeCloseTo(100 - target, 1);
    expect(ledger.queryMovements({ herb, type: 'dispense' })).toHaveLength(1);
  });

  it('库存不足时开抽屉被拦住，给出现存量与缺口提示', () => {
    const item = gm.prescription!.items[0];
    ledger.adjust(item.herb, item.grams - 5, '盘亏');
    expect(gm.selectDrawer(item.herb)).toBe(false);
    expect(gm.blockedReason).toContain(item.herb);
    expect(gm.blockedReason).toContain('不够抓');
    expect(gm.phase).toBe('playing');
  });

  it('库存为 0 的抽屉一律拦住', () => {
    const item = gm.prescription!.items[0];
    ledger.adjust(item.herb, 0, '全部用完');
    expect(gm.selectDrawer(item.herb)).toBe(false);
    expect(gm.blockedReason).toContain('只剩 0g');
  });

  it('称重通过但扣账时发现库存不足：拦截且不记分、不分包、不扣秤', () => {
    const item = gm.prescription!.items[0];
    // 开抽屉时账上够
    expect(gm.selectDrawer(item.herb)).toBe(true);
    // 开抽屉后、确认前账被改少（模拟另一处消耗/改账）
    ledger.adjust(item.herb, Math.max(0, item.grams - 10), '突查盘亏');
    gm.setWeight(item.grams);
    const scoreBefore = gm.state.score;
    const pkgsBefore = gm.packages.length;
    const result = gm.confirmWeight();
    expect(result?.blocked).toBe(true);
    expect(gm.state.score).toBe(scoreBefore);
    expect(gm.packages.length).toBe(pkgsBefore);
    expect(gm.currentHerb).toBe(item.herb); // 停在称重界面
    expect(gm.blockedReason).toContain('不够抓');
  });

  it('称重不合格不扣库存', () => {
    const item = gm.prescription!.items[0];
    gm.selectDrawer(item.herb);
    gm.setWeight(item.grams + 99); // 远超容差，必判 fail
    gm.confirmWeight();
    expect(ledger.getStock(item.herb)?.onHand).toBe(100);
    expect(ledger.queryMovements({ type: 'dispense' })).toHaveLength(0);
  });

  it('台账通过 onLedgerChange 通知持久化', () => {
    let calls = 0;
    gm.onLedgerChange = () => calls++;
    const item = gm.prescription!.items[0];
    gm.selectDrawer(item.herb);
    gm.setWeight(item.grams);
    gm.confirmWeight();
    expect(calls).toBe(1);
  });

  it('所有 HERBS 名称都能正常立账（不依赖随机结果）', () => {
    for (const h of HERBS) ledger.ensureHerb(h.name);
    expect(ledger.listStocks().length).toBe(HERBS.length);
  });
});
