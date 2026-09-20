import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryLedger, LedgerError, dayKey } from '../src/ledger/inventory';

/** 造一个固定时钟的台账，now 初始为 day 09:00，可手动推进 */
function makeLedger(base = '2026-09-20T09:00:00') {
  let t = new Date(base).getTime();
  const ledger = new InventoryLedger({ now: () => t, initialStock: 100, defaultReorderLevel: 30 });
  return {
    ledger,
    get t() { return t; },
    advance(ms: number) { t += ms; },
    set(iso: string) { t = new Date(iso).getTime(); },
  };
}

describe('InventoryLedger 建账与库存', () => {
  it('新药味按默认期初存量立账', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    expect(ledger.getStock('甘草')?.onHand).toBe(100);
    expect(ledger.getStock('甘草')?.reorderLevel).toBe(30);
  });

  it('已立账的药重复 ensure 不重置存量', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    ledger.dispense('甘草', 40);
    ledger.ensureHerb('甘草', 100, 30);
    expect(ledger.getStock('甘草')?.onHand).toBe(60);
  });
});

describe('抓药出账（抓一味扣一味，不够先拦住）', () => {
  it('抓药后立即从账上扣，并累计抓走量', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('当归');
    const m = ledger.dispense('当归', 15, 'rx-1');
    expect(m.delta).toBe(-15);
    expect(m.type).toBe('dispense');
    expect(m.ref).toBe('rx-1');
    expect(ledger.getStock('当归')?.onHand).toBe(85);
    expect(ledger.getStock('当归')?.totalDispensed).toBe(15);
  });

  it('账上不够时拦住，账不动，抛 INSUFFICIENT_STOCK', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('黄芪'); // 100g
    expect(ledger.canDispense('黄芪', 120)).toBe(false);
    expect(ledger.shortage('黄芪', 120)).toBe(20);
    expect(() => ledger.dispense('黄芪', 120)).toThrowError(LedgerError);
    try {
      ledger.dispense('黄芪', 120);
      throw new Error('should not reach');
    } catch (e) {
      expect((e as LedgerError).code).toBe('INSUFFICIENT_STOCK');
    }
    expect(ledger.getStock('黄芪')?.onHand).toBe(100);
    expect(ledger.queryMovements({ type: 'dispense' })).toHaveLength(0);
  });

  it('账上没有的药味抓药报 UNKNOWN_HERB', () => {
    const { ledger } = makeLedger();
    expect(() => ledger.dispense('不存在', 10)).toThrowError(/没有/);
  });

  it('抓 0 或负数被拒绝', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    expect(() => ledger.dispense('甘草', 0)).toThrowError(LedgerError);
    expect(() => ledger.dispense('甘草', -5)).toThrowError(LedgerError);
  });

  it('恰好抓空允许（onHand 可以到 0）', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    ledger.dispense('甘草', 100);
    expect(ledger.getStock('甘草')?.onHand).toBe(0);
    expect(ledger.isLow('甘草')).toBe(true);
  });

  it('小数克重保留一位，不产生浮点尾巴', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    ledger.dispense('甘草', 0.1);
    ledger.dispense('甘草', 0.2);
    expect(ledger.getStock('甘草')?.onHand).toBe(99.7);
  });
});

describe('补货入账（同日两回分开认）', () => {
  it('补进来多少记多少，存量与累计补进同时增加', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    const r = ledger.restock('甘草', 50, { supplier: '安国药市' });
    expect(r.qty).toBe(50);
    expect(ledger.getStock('甘草')?.onHand).toBe(150);
    expect(ledger.getStock('甘草')?.totalRestocked).toBe(50);
    expect(r.supplier).toBe('安国药市');
  });

  it('同一天补两回货，批号序号不同、到货时间不同，可以分开认', () => {
    const env = makeLedger('2026-09-20T08:00:00');
    env.ledger.ensureHerb('甘草');
    const r1 = env.ledger.restock('甘草', 20, { note: '头一回' });
    env.set('2026-09-20T15:30:00');
    const r2 = env.ledger.restock('甘草', 30, { note: '二一回' });

    expect(r1.batchNo).toBe('2026-09-20-01');
    expect(r2.batchNo).toBe('2026-09-20-02');
    expect(r1.batchOfDay).toBe(1);
    expect(r2.batchOfDay).toBe(2);
    expect(r1.day).toBe(r2.day);
    expect(r2.arrivedAt - r1.arrivedAt).toBe(7.5 * 3600 * 1000);

    const todays = env.ledger.listRestocks({ day: '2026-09-20' });
    expect(todays).toHaveLength(2);
    expect(todays.map(r => r.qty)).toEqual([20, 30]);
  });

  it('隔天补货批号重新从 01 开始', () => {
    const env = makeLedger('2026-09-20T23:00:00');
    env.ledger.ensureHerb('甘草');
    expect(env.ledger.restock('甘草', 10).batchNo).toBe('2026-09-20-01');
    env.set('2026-09-21T06:00:00');
    expect(env.ledger.restock('甘草', 10).batchNo).toBe('2026-09-21-01');
  });

  it('补货同时生成对应入账流水', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    const r = ledger.restock('甘草', 40);
    const m = ledger.queryMovements({ type: 'restock' })[0];
    expect(m.delta).toBe(40);
    expect(m.ref).toBe(r.batchNo);
  });
});

describe('最低存量与待补单', () => {
  it('掉到线下（含压线）挑出来，按缺口排序', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草', 30, 30);  // 压线
    ledger.ensureHerb('当归', 10, 50);  // 缺 40
    ledger.ensureHerb('黄芪', 100, 20); // 充足
    const list = ledger.getReorderList();
    expect(list.map(s => s.herb)).toEqual(['当归', '甘草']);
    expect(list[0].shortfall).toBe(40);
    expect(ledger.isLow('黄芪')).toBe(false);
  });

  it('可以修改最低存量线', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草', 100, 30);
    expect(ledger.isLow('甘草')).toBe(false);
    ledger.setReorderLevel('甘草', 120);
    expect(ledger.getStock('甘草')?.reorderLevel).toBe(120);
    expect(ledger.isLow('甘草')).toBe(true);
  });
});

describe('改账留痕', () => {
  it('改账记录改前、改后、差额、原因、时间', () => {
    const env = makeLedger();
    env.ledger.ensureHerb('甘草', 100, 30);
    const rec = env.ledger.adjust('甘草', 92, '盘点盘亏，发现虫蛀', { operator: '掌柜' });
    expect(rec.before).toBe(100);
    expect(rec.after).toBe(92);
    expect(rec.delta).toBe(-8);
    expect(rec.reason).toContain('虫蛀');
    expect(rec.operator).toBe('掌柜');
    expect(rec.day).toBe('2026-09-20');
    expect(env.ledger.getStock('甘草')?.onHand).toBe(92);
  });

  it('调大存量 delta 为正', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草', 100, 30);
    const rec = ledger.adjust('甘草', 120, '上月漏记一笔来货');
    expect(rec.delta).toBe(20);
  });

  it('不写原因不让改', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    expect(() => ledger.adjust('甘草', 90, '   ')).toThrowError(/原因/);
  });

  it('改账不抹掉历史流水，另追加一条 adjust 流水', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    ledger.dispense('甘草', 10);
    ledger.adjust('甘草', 80, '盘亏');
    const dispenses = ledger.queryMovements({ type: 'dispense' });
    const adjusts = ledger.queryMovements({ type: 'adjust' });
    expect(dispenses).toHaveLength(1);
    expect(dispenses[0].delta).toBe(-10);
    expect(adjusts).toHaveLength(1);
    expect(adjusts[0].delta).toBe(-10); // 90 -> 80
  });

  it('改成相同数量不产生 adjust 流水但仍留痕', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    ledger.adjust('甘草', 100, '复核无误');
    expect(ledger.queryMovements({ type: 'adjust' })).toHaveLength(0);
    expect(ledger.listAdjustments()).toHaveLength(1);
  });
});

describe('消耗汇总（当天 / 最近七天）', () => {
  let env: ReturnType<typeof makeLedger>;
  beforeEach(() => {
    env = makeLedger('2026-09-20T08:00:00');
    env.ledger.ensureHerb('甘草', 1000, 10);
    env.ledger.ensureHerb('当归', 1000, 10);
    env.ledger.ensureHerb('黄芪', 1000, 10);
  });

  it('只汇总 dispense，补货不算消耗', () => {
    env.ledger.dispense('甘草', 30);
    env.ledger.dispense('当归', 20);
    env.ledger.restock('甘草', 100);
    const today = env.ledger.consumptionOfDay('2026-09-20');
    expect(today.total).toBe(50);
    expect(today.rows.map(r => r.herb)).toEqual(['甘草', '当归']);
  });

  it('走得快的排最前面', () => {
    env.ledger.dispense('甘草', 10);
    env.ledger.dispense('当归', 50);
    env.ledger.dispense('黄芪', 30);
    const rows = env.ledger.consumptionOfDay('2026-09-20').rows;
    expect(rows.map(r => [r.herb, r.grams])).toEqual([['当归', 50], ['黄芪', 30], ['甘草', 10]]);
  });

  it('最近七天覆盖前后 7 个自然日且含今天', () => {
    env.set('2026-09-13T10:00:00'); // 窗口之外（早于 09-14 00:00）
    env.ledger.dispense('甘草', 5); // 不计入
    env.set('2026-09-14T10:00:00');
    env.ledger.dispense('甘草', 7); // 窗口最早一天
    env.set('2026-09-20T20:00:00');
    env.ledger.dispense('当归', 3);

    const week = env.ledger.consumptionRecentDays(7, env.t);
    expect(week.fromDay).toBe('2026-09-14');
    expect(week.toDay).toBe('2026-09-20');
    const gancao = week.rows.find(r => r.herb === '甘草');
    expect(gancao?.grams).toBe(7);
  });

  it('收工汇总生成日报，含当天消耗与来货；重复收工覆盖', () => {
    env.ledger.dispense('甘草', 40);
    env.ledger.restock('当归', 60);
    env.set('2026-09-20T21:00:00');
    const r1 = env.ledger.closeDay('2026-09-20');
    expect(r1.totalDispensed).toBe(40);
    expect(r1.totalRestocked).toBe(60);
    expect(r1.perHerb['甘草']).toBe(40);

    env.set('2026-09-20T22:00:00');
    env.ledger.dispense('甘草', 5);
    env.ledger.closeDay('2026-09-20');
    expect(env.ledger.listDailyReports().filter(r => r.day === '2026-09-20')).toHaveLength(1);
    expect(env.ledger.getDailyReport('2026-09-20')?.totalDispensed).toBe(45);
  });
});

describe('流水查询', () => {
  it('可按药味、类型、日期、时间窗过滤', () => {
    const env = makeLedger('2026-09-20T08:00:00');
    env.ledger.ensureHerb('甘草');
    env.ledger.ensureHerb('当归');
    env.ledger.dispense('甘草', 10);
    env.ledger.dispense('当归', 5);
    env.set('2026-09-21T08:00:00');
    env.ledger.dispense('甘草', 8);

    expect(env.ledger.queryMovements({ herb: '甘草' })).toHaveLength(2);
    expect(env.ledger.queryMovements({ day: '2026-09-20' })).toHaveLength(2);
    expect(env.ledger.queryMovements({ herb: '甘草', day: '2026-09-21' })).toHaveLength(1);
    const from = new Date('2026-09-21T00:00:00').getTime();
    expect(env.ledger.queryMovements({ from })).toHaveLength(1);
  });

  it('流水号自增且全局唯一', () => {
    const { ledger } = makeLedger();
    ledger.ensureHerb('甘草');
    ledger.dispense('甘草', 1);
    ledger.restock('甘草', 1);
    ledger.adjust('甘草', 99, '平账');
    const seqs = ledger.queryMovements().map(m => m.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });
});

describe('存档序列化', () => {
  it('toJSON / fromJSON 往返后账完全一致', () => {
    const env = makeLedger();
    env.ledger.ensureHerb('甘草');
    env.ledger.dispense('甘草', 25);
    env.ledger.restock('甘草', 40, { supplier: '药批' });
    env.ledger.adjust('甘草', 120, '盘点调整');
    env.ledger.closeDay('2026-09-20');

    const json = env.ledger.toJSON();
    const restored = InventoryLedger.fromJSON(json, { now: () => env.t });
    expect(restored.getStock('甘草')?.onHand).toBe(120);
    expect(restored.queryMovements()).toHaveLength(3);
    expect(restored.listRestocks()[0].batchNo).toBe('2026-09-20-01');
    expect(restored.listAdjustments()[0].reason).toBe('盘点调整');
    expect(restored.getDailyReport('2026-09-20')?.totalDispensed).toBe(25);

    // 恢复后批号序号继续递增，不与旧批号冲突
    const next = restored.restock('甘草', 5);
    expect(next.batchNo).toBe('2026-09-20-02');
  });

  it('fromJSON 容忍坏数据', () => {
    expect(() => InventoryLedger.fromJSON(null)).not.toThrow();
    expect(() => InventoryLedger.fromJSON({})).not.toThrow();
    const l = InventoryLedger.fromJSON({ stocks: { 甘草: { herb: '甘草', onHand: 1, reorderLevel: 2, totalDispensed: 3, totalRestocked: 4 } } });
    expect(l.getStock('甘草')?.onHand).toBe(1);
  });
});

describe('dayKey', () => {
  it('格式为 YYYY-MM-DD 并补零', () => {
    expect(dayKey(new Date('2026-01-02T03:04:05').getTime())).toBe('2026-01-02');
    expect(dayKey(new Date('2026-12-31T23:59:59').getTime())).toBe('2026-12-31');
  });
});
