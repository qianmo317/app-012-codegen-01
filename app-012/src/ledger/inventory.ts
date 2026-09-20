/**
 * 药柜台账：每味药剩多少、抓走多少、补进来多少，一本账记清楚。
 *
 * 设计要点：
 * - 所有存量以克(g)为单位，保留一位小数，内部四舍五入避免浮点误差。
 * - 每一笔出入库都生成一条流水(movement)，流水只追加、不修改；记错账走"改账"，
 *   改账另留一条 adjustment 痕迹（改前/改后/原因/时间），原流水仍在。
 * - 同一天补两回货，靠"批号 = 日期 + 当日序号"分开认，另带到货时间戳。
 * - 时间通过构造函数的 now 函数注入，方便测试跨天场景。
 */

export type MovementType = 'dispense' | 'restock' | 'adjust';

/** 流水账上的一条记录（出账 / 入账 / 调账） */
export interface Movement {
  /** 全局唯一流水号，自增 */
  seq: number;
  /** 药名 */
  herb: string;
  /** 出账 / 入账 / 调账 */
  type: MovementType;
  /**
   * 数量变化，克：
   * dispense 为负数，restock 为正数，adjust 可正可负（改后-改前）。
   */
  delta: number;
  /** 发生时间（毫秒时间戳） */
  at: number;
  /** 业务日期，YYYY-MM-DD（本地时区） */
  day: string;
  /** 关联说明：处方号 / 批号 / 改账原因 */
  ref?: string;
  /** 备注 */
  note?: string;
}

/** 一味药当前在柜上的存量账 */
export interface StockEntry {
  herb: string;
  /** 当前存量，克 */
  onHand: number;
  /** 最低存量（补货线），克 */
  reorderLevel: number;
  /** 累计抓走，克 */
  totalDispensed: number;
  /** 累计补进，克 */
  totalRestocked: number;
}

/** 一笔来货记录；同一天补两回各是一条，批号不同 */
export interface RestockRecord {
  /** 批号，形如 2026-09-20-01，同日序号从 01 开始 */
  batchNo: string;
  herb: string;
  /** 本次补进数量，克 */
  qty: number;
  /** 到货时间戳 */
  arrivedAt: number;
  /** 到货业务日期 */
  day: string;
  /** 当日第几笔补货 */
  batchOfDay: number;
  supplier?: string;
  note?: string;
}

/** 改账痕迹：谁、什么时候、把什么从多少改成多少 */
export interface AdjustmentRecord {
  id: number;
  herb: string;
  before: number;
  after: number;
  delta: number;
  reason: string;
  at: number;
  day: string;
  operator?: string;
}

/** 某天收工时的汇总快照 */
export interface DailySummary {
  day: string;
  /** 当天全柜消耗合计，克 */
  totalDispensed: number;
  /** 每味药当天消耗，克 */
  perHerb: Record<string, number>;
  /** 当天补货合计，克 */
  totalRestocked: number;
  closedAt: number;
}

/** 近 N 天消耗排名中的一行 */
export interface ConsumptionRow {
  herb: string;
  grams: number;
}

/** 一次操作失败（通常是库存不足被拦住） */
export class LedgerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

/** 可序列化的台账数据（用于存档） */
export interface LedgerData {
  version: 1;
  stocks: Record<string, StockEntry>;
  movements: Movement[];
  restocks: RestockRecord[];
  adjustments: AdjustmentRecord[];
  dailyReports: DailySummary[];
  seqCounter: number;
  adjustCounter: number;
  /** 每天的补货序号计数：day -> 已用序号 */
  restockDayCounter: Record<string, number>;
}

export interface LedgerOptions {
  /** 注入当前时间，默认 Date.now */
  now?: () => number;
  /** 默认最低存量（克），首次上药时使用 */
  defaultReorderLevel?: number;
  /** 默认期初存量（克），首次上药时使用 */
  initialStock?: number;
}

const DEFAULT_REORDER = 50;
const DEFAULT_INITIAL = 200;

/** 毫秒时间戳 -> 本地 YYYY-MM-DD */
export function dayKey(t: number): string {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 保留一位小数，消除 0.1 + 0.2 这类浮点尾巴 */
function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function positive(n: number, label: string): void {
  if (typeof n !== 'number' || Number.isNaN(n) || n <= 0) {
    throw new LedgerError('BAD_AMOUNT', `${label}必须是大于 0 的数字`);
  }
}

export class InventoryLedger {
  private stocks = new Map<string, StockEntry>();
  private movements: Movement[] = [];
  private restocks: RestockRecord[] = [];
  private adjustments: AdjustmentRecord[] = [];
  private dailyReports: DailySummary[] = [];
  private seqCounter = 0;
  private adjustCounter = 0;
  private restockDayCounter = new Map<string, number>();

  private readonly now: () => number;
  private readonly defaultReorder: number;
  private readonly defaultInitial: number;

  constructor(opts: LedgerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.defaultReorder = opts.defaultReorderLevel ?? DEFAULT_REORDER;
    this.defaultInitial = opts.initialStock ?? DEFAULT_INITIAL;
  }

  // ---------- 建账 / 上药 ----------

  /**
   * 确保药味在账上有户头。已经在账上的不动（不会重置存量）。
   * 新味药按期初存量、默认最低线立账。
   */
  ensureHerb(herb: string, initial?: number, reorderLevel?: number): StockEntry {
    const existing = this.stocks.get(herb);
    if (existing) return existing;
    const entry: StockEntry = {
      herb,
      onHand: round1(initial ?? this.defaultInitial),
      reorderLevel: round1(reorderLevel ?? this.defaultReorder),
      totalDispensed: 0,
      totalRestocked: 0,
    };
    this.stocks.set(herb, entry);
    return entry;
  }

  /** 设定最低存量线（补货线） */
  setReorderLevel(herb: string, level: number): void {
    if (typeof level !== 'number' || Number.isNaN(level) || level < 0) {
      throw new LedgerError('BAD_AMOUNT', '最低存量不能是负数');
    }
    const entry = this.stocks.get(herb) ?? this.ensureHerb(herb);
    entry.reorderLevel = round1(level);
  }

  getStock(herb: string): StockEntry | undefined {
    return this.stocks.get(herb);
  }

  /** 全柜存量，按药名排序 */
  listStocks(): StockEntry[] {
    return [...this.stocks.values()].sort((a, b) => a.herb.localeCompare(b.herb, 'zh'));
  }

  // ---------- 抓药（出账） ----------

  /**
   * 账上够不够抓 grams 克。不改账。
   */
  canDispense(herb: string, grams: number): boolean {
    const entry = this.stocks.get(herb);
    return !!entry && round1(entry.onHand - grams) >= 0;
  }

  /** 还差多少克才够（够了返回 0） */
  shortage(herb: string, grams: number): number {
    const entry = this.stocks.get(herb);
    const onHand = entry ? entry.onHand : 0;
    return Math.max(0, round1(grams - onHand));
  }

  /**
   * 抓药出账：抓完一味就从账上扣一味。
   * 账上不够先拦住不让抓（LedgerError: INSUFFICIENT_STOCK），账不动。
   * @returns 记上的流水
   */
  dispense(herb: string, grams: number, ref?: string, note?: string): Movement {
    positive(grams, '抓药量');
    const entry = this.stocks.get(herb);
    if (!entry) {
      throw new LedgerError('UNKNOWN_HERB', `账上没有「${herb}」这味药，先立账`);
    }
    const g = round1(grams);
    if (entry.onHand < g) {
      throw new LedgerError(
        'INSUFFICIENT_STOCK',
        `「${herb}」账上只剩 ${entry.onHand}g，不够抓 ${g}g`,
      );
    }
    entry.onHand = round1(entry.onHand - g);
    entry.totalDispensed = round1(entry.totalDispensed + g);
    return this.appendMovement('dispense', herb, -g, ref, note);
  }

  // ---------- 补货（入账） ----------

  /**
   * 来货入账。同一天补两回各生成独立批号（YYYY-MM-DD-01 / -02…），分开认。
   * @returns 补货记录（含批号、到货时间）
   */
  restock(
    herb: string,
    qty: number,
    opts: { supplier?: string; note?: string; arrivedAt?: number } = {},
  ): RestockRecord {
    positive(qty, '补货量');
    const entry = this.stocks.get(herb) ?? this.ensureHerb(herb);
    const q = round1(qty);
    const at = opts.arrivedAt ?? this.now();
    const day = dayKey(at);
    const batchOfDay = (this.restockDayCounter.get(day) ?? 0) + 1;
    this.restockDayCounter.set(day, batchOfDay);
    const batchNo = `${day}-${`${batchOfDay}`.padStart(2, '0')}`;

    entry.onHand = round1(entry.onHand + q);
    entry.totalRestocked = round1(entry.totalRestocked + q);

    const record: RestockRecord = {
      batchNo,
      herb,
      qty: q,
      arrivedAt: at,
      day,
      batchOfDay,
      supplier: opts.supplier,
      note: opts.note,
    };
    this.restocks.push(record);
    this.appendMovement('restock', herb, q, batchNo, opts.note ?? opts.supplier);
    return record;
  }

  // ---------- 改账 ----------

  /**
   * 账记错了可以改，但必须留下痕迹：改前、改后、差额、原因、时间。
   * 注意：这是直接修正存量，不抹掉历史流水。
   */
  adjust(
    herb: string,
    newOnHand: number,
    reason: string,
    opts: { operator?: string; at?: number } = {},
  ): AdjustmentRecord {
    if (typeof newOnHand !== 'number' || Number.isNaN(newOnHand) || newOnHand < 0) {
      throw new LedgerError('BAD_AMOUNT', '改后存量不能是负数');
    }
    if (!reason || !reason.trim()) {
      throw new LedgerError('NO_REASON', '改账必须写明原因');
    }
    const entry = this.stocks.get(herb) ?? this.ensureHerb(herb);
    const after = round1(newOnHand);
    const before = entry.onHand;
    const delta = round1(after - before);
    const at = opts.at ?? this.now();

    const rec: AdjustmentRecord = {
      id: ++this.adjustCounter,
      herb,
      before,
      after,
      delta,
      reason: reason.trim(),
      at,
      day: dayKey(at),
      operator: opts.operator,
    };
    this.adjustments.push(rec);
    entry.onHand = after;
    if (delta !== 0) {
      this.appendMovement('adjust', herb, delta, `改账#${rec.id}`, reason.trim(), at);
    }
    return rec;
  }

  // ---------- 待补单 ----------

  /** 掉到最低存量线下（含压线）的药，按缺口从大到小挑出来 */
  getReorderList(): Array<StockEntry & { shortfall: number }> {
    return this.listStocks()
      .filter(s => s.onHand <= s.reorderLevel)
      .map(s => ({ ...s, shortfall: round1(s.reorderLevel - s.onHand) }))
      .sort((a, b) => b.shortfall - a.shortfall || a.herb.localeCompare(b.herb, 'zh'));
  }

  isLow(herb: string): boolean {
    const s = this.stocks.get(herb);
    return !!s && s.onHand <= s.reorderLevel;
  }

  // ---------- 消耗汇总 ----------

  /**
   * 一段时间窗内每味药的消耗（只算 dispense 出账）。
   * @param from 起始时间戳（含）
   * @param to   截止时间戳（不含），默认现在
   */
  consumptionBetween(from: number, to: number = this.now()): ConsumptionRow[] {
    const totals = new Map<string, number>();
    for (const m of this.movements) {
      if (m.type === 'dispense' && m.at >= from && m.at < to) {
        totals.set(m.herb, round1((totals.get(m.herb) ?? 0) + -m.delta));
      }
    }
    return [...totals.entries()]
      .map(([herb, grams]) => ({ herb, grams }))
      .sort((a, b) => b.grams - a.grams || a.herb.localeCompare(b.herb, 'zh'));
  }

  /** 某一天（00:00 起 24 小时）的消耗排名，走得快的排前面 */
  consumptionOfDay(day: string): { total: number; rows: ConsumptionRow[] } {
    const start = new Date(`${day}T00:00:00`).getTime();
    const rows = this.consumptionBetween(start, start + 24 * 3600 * 1000);
    return { total: round1(rows.reduce((s, r) => s + r.grams, 0)), rows };
  }

  /**
   * 最近 N 天（含今天，按自然日）的消耗排名。
   * 默认 7 天。
   */
  consumptionRecentDays(days = 7, now: number = this.now()): {
    total: number;
    rows: ConsumptionRow[];
    fromDay: string;
    toDay: string;
  } {
    const todayStart = new Date(`${dayKey(now)}T00:00:00`).getTime();
    const from = todayStart - (days - 1) * 24 * 3600 * 1000;
    const rows = this.consumptionBetween(from, now);
    return {
      total: round1(rows.reduce((s, r) => s + r.grams, 0)),
      rows,
      fromDay: dayKey(from),
      toDay: dayKey(now),
    };
  }

  // ---------- 收工 ----------

  /**
   * 每天收工汇总一次：当天各药消耗 + 全柜合计，存为日报。
   * 同一天重复收工以最后一次为准（覆盖当天日报）。
   */
  closeDay(day: string = dayKey(this.now())): DailySummary {
    const { total, rows } = this.consumptionOfDay(day);
    const perHerb: Record<string, number> = {};
    for (const r of rows) perHerb[r.herb] = r.grams;

    let restocked = 0;
    for (const r of this.restocks) {
      if (r.day === day) restocked = round1(restocked + r.qty);
    }

    const report: DailySummary = {
      day,
      totalDispensed: total,
      perHerb,
      totalRestocked: restocked,
      closedAt: this.now(),
    };
    const idx = this.dailyReports.findIndex(r => r.day === day);
    if (idx >= 0) this.dailyReports[idx] = report;
    else this.dailyReports.push(report);
    this.dailyReports.sort((a, b) => a.day.localeCompare(b.day));
    return report;
  }

  getDailyReport(day: string): DailySummary | undefined {
    return this.dailyReports.find(r => r.day === day);
  }

  listDailyReports(): DailySummary[] {
    return [...this.dailyReports];
  }

  // ---------- 查流水 ----------

  /** 查流水，可按药味 / 类型 / 日期过滤；默认按时间正序，reverse 取最新在前 */
  queryMovements(filter: {
    herb?: string;
    type?: MovementType;
    day?: string;
    from?: number;
    to?: number;
    reverse?: boolean;
  } = {}): Movement[] {
    let list = this.movements.filter(m => {
      if (filter.herb && m.herb !== filter.herb) return false;
      if (filter.type && m.type !== filter.type) return false;
      if (filter.day && m.day !== filter.day) return false;
      if (filter.from !== undefined && m.at < filter.from) return false;
      if (filter.to !== undefined && m.at > filter.to) return false;
      return true;
    });
    if (filter.reverse) list = [...list].reverse();
    return list;
  }

  listRestocks(filter: { herb?: string; day?: string } = {}): RestockRecord[] {
    return this.restocks.filter(
      r => (!filter.herb || r.herb === filter.herb) && (!filter.day || r.day === filter.day),
    );
  }

  listAdjustments(filter: { herb?: string } = {}): AdjustmentRecord[] {
    const list = filter.herb
      ? this.adjustments.filter(a => a.herb === filter.herb)
      : [...this.adjustments];
    return list.sort((a, b) => b.at - a.at);
  }

  // ---------- 存档 ----------

  toJSON(): LedgerData {
    return {
      version: 1,
      stocks: Object.fromEntries(this.stocks),
      movements: this.movements,
      restocks: this.restocks,
      adjustments: this.adjustments,
      dailyReports: this.dailyReports,
      seqCounter: this.seqCounter,
      adjustCounter: this.adjustCounter,
      restockDayCounter: Object.fromEntries(this.restockDayCounter),
    };
  }

  static fromJSON(data: unknown, opts: LedgerOptions = {}): InventoryLedger {
    const ledger = new InventoryLedger(opts);
    if (!data || typeof data !== 'object') return ledger;
    const d = data as Partial<LedgerData>;
    if (d.stocks) {
      for (const [herb, s] of Object.entries(d.stocks)) {
        ledger.stocks.set(herb, { ...s });
      }
    }
    ledger.movements = Array.isArray(d.movements) ? [...d.movements] : [];
    ledger.restocks = Array.isArray(d.restocks) ? [...d.restocks] : [];
    ledger.adjustments = Array.isArray(d.adjustments) ? [...d.adjustments] : [];
    ledger.dailyReports = Array.isArray(d.dailyReports) ? [...d.dailyReports] : [];
    ledger.seqCounter = d.seqCounter ?? 0;
    ledger.adjustCounter = d.adjustCounter ?? 0;
    ledger.restockDayCounter = new Map(Object.entries(d.restockDayCounter ?? {}));
    return ledger;
  }

  // ---------- 内部 ----------

  private appendMovement(
    type: MovementType,
    herb: string,
    delta: number,
    ref?: string,
    note?: string,
    atOverride?: number,
  ): Movement {
    const at = atOverride ?? this.now();
    const m: Movement = {
      seq: ++this.seqCounter,
      herb,
      type,
      delta: round1(delta),
      at,
      day: dayKey(at),
      ref,
      note,
    };
    this.movements.push(m);
    return m;
  }
}
