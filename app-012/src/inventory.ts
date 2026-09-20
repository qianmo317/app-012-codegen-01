/**
 * 药柜台账：每味药的剩余、抓走、补进都记账在册。
 * 账本是只增不改的流水（LedgerEntry），改账通过 corrections 留痕。
 */

export type LedgerType = 'dispense' | 'restock';

/** 一次改账的留痕：改前、改后、什么时候改的 */
export interface Correction {
  before: number;
  after: number;
  time: number;
  reason?: string;
}

/** 一条流水。id 含日期与递增序号，同一天补两回货也能分开认 */
export interface LedgerEntry {
  id: string;
  seq: number;
  date: string; // YYYY-MM-DD 业务日期（哪天抓的、哪天到的）
  time: number; // 记录时间戳（毫秒）
  herb: string;
  type: LedgerType;
  amount: number; // 克，恒为正；方向由 type 决定
  note?: string;
  corrections: Correction[];
}

export interface InventoryState {
  seq: number;
  entries: LedgerEntry[];
  minStock: Record<string, number>; // 每味药的最低存量
}

export interface HerbStockInit {
  name: string;
  minStock: number;
  initialStock: number;
}

export interface HerbTotals {
  herb: string;
  stock: number; // 还剩多少
  dispensed: number; // 累计抓走
  restocked: number; // 累计补进
  minStock: number;
  belowMin: boolean;
}

export interface RestockItem {
  herb: string;
  stock: number;
  minStock: number;
  shortage: number; // 距底线还差多少
}

export interface ConsumptionItem {
  herb: string;
  grams: number;
}

/** 收工汇总：当天一份、最近七天一份 */
export interface DayClose {
  date: string;
  today: ConsumptionItem[];
  week: ConsumptionItem[];
}

export const DEFAULT_MIN_STOCK = 50;
export const DEFAULT_INITIAL_STOCK = 200;
/** 补货补到的目标量 */
export const RESTOCK_TARGET = 200;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayString(now: Date = new Date()): string {
  return formatDate(now);
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return formatDate(dt);
}

/** 建账：为期初库存大于零的药各记一笔「期初结存」 */
export function createInventory(inits: HerbStockInit[], date: string, time: number): InventoryState {
  const state: InventoryState = { seq: 0, entries: [], minStock: {} };
  for (const init of inits) {
    state.minStock[init.name] = init.minStock;
    if (init.initialStock > 0) {
      appendEntry(state, init.name, 'restock', init.initialStock, date, time, '期初结存');
    }
  }
  return state;
}

function appendEntry(
  state: InventoryState,
  herb: string,
  type: LedgerType,
  amount: number,
  date: string,
  time: number,
  note?: string
): LedgerEntry {
  state.seq += 1;
  const entry: LedgerEntry = {
    id: `${date}#${state.seq}`,
    seq: state.seq,
    date,
    time,
    herb,
    type,
    amount: round1(amount),
    corrections: [],
  };
  if (note) entry.note = note;
  state.entries.push(entry);
  return entry;
}

export function getStock(state: InventoryState, herb: string): number {
  const t = getHerbTotals(state, herb);
  return t.stock;
}

export function getHerbTotals(state: InventoryState, herb: string): { stock: number; dispensed: number; restocked: number } {
  let dispensed = 0;
  let restocked = 0;
  for (const e of state.entries) {
    if (e.herb !== herb) continue;
    if (e.type === 'dispense') dispensed += e.amount;
    else restocked += e.amount;
  }
  return { stock: round1(restocked - dispensed), dispensed: round1(dispensed), restocked: round1(restocked) };
}

/** 全柜总账：每味药一行，剩余/已抓/已补/底线一目了然 */
export function getAllTotals(state: InventoryState): HerbTotals[] {
  const herbs = new Set<string>([...Object.keys(state.minStock), ...state.entries.map(e => e.herb)]);
  return Array.from(herbs)
    .map(herb => {
      const t = getHerbTotals(state, herb);
      const minStock = state.minStock[herb] ?? 0;
      return { herb, ...t, minStock, belowMin: t.stock < minStock };
    })
    .sort((a, b) => a.herb.localeCompare(b.herb, 'zh'));
}

/** 账上够不够抓。够才允许抓，不够的在外面拦住 */
export function canDispense(state: InventoryState, herb: string, grams: number): boolean {
  if (!Number.isFinite(grams) || grams <= 0) return false;
  return getStock(state, herb) + 1e-9 >= grams;
}

/** 抓走一味：从账上扣。账上不够则拦住，账不动 */
export function dispense(
  state: InventoryState,
  herb: string,
  grams: number,
  date: string,
  time: number
): { ok: boolean; entry: LedgerEntry | null } {
  if (!canDispense(state, herb, grams)) return { ok: false, entry: null };
  return { ok: true, entry: appendEntry(state, herb, 'dispense', grams, date, time) };
}

/** 补进一味：记数量与到货日期。同一天补两回是两笔独立的账 */
export function restock(
  state: InventoryState,
  herb: string,
  grams: number,
  date: string,
  time: number,
  note?: string
): LedgerEntry | null {
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return appendEntry(state, herb, 'restock', grams, date, time, note);
}

/** 改账：留下改前改后与改的时间，原流水不删 */
export function correctEntry(
  state: InventoryState,
  entryId: string,
  newAmount: number,
  time: number,
  reason?: string
): Correction | null {
  const entry = state.entries.find(e => e.id === entryId);
  if (!entry) return null;
  if (!Number.isFinite(newAmount) || newAmount <= 0) return null;
  const after = round1(newAmount);
  const correction: Correction = { before: entry.amount, after, time };
  if (reason) correction.reason = reason;
  entry.corrections.push(correction);
  entry.amount = after;
  return correction;
}

export function setMinStock(state: InventoryState, herb: string, minStock: number): void {
  if (!Number.isFinite(minStock) || minStock < 0) return;
  state.minStock[herb] = round1(minStock);
}

/** 待补清单：掉到最低存量线下的药，按缺口从大到小排 */
export function getRestockList(state: InventoryState): RestockItem[] {
  return Object.keys(state.minStock)
    .map(herb => {
      const stock = getStock(state, herb);
      const minStock = state.minStock[herb];
      return { herb, stock, minStock, shortage: round1(minStock - stock) };
    })
    .filter(i => i.shortage > 0)
    .sort((a, b) => b.shortage - a.shortage || a.herb.localeCompare(b.herb, 'zh'));
}

/** 某一天各味药抓走了多少，走得快的排前面 */
export function summarizeConsumption(state: InventoryState, date: string): ConsumptionItem[] {
  return sumDispense(state, e => e.date === date);
}

/** 最近 N 天（含 endDate 当天）各味药抓走了多少 */
export function summarizeRange(state: InventoryState, endDate: string, days: number): ConsumptionItem[] {
  const start = addDays(endDate, -(days - 1));
  return sumDispense(state, e => e.date >= start && e.date <= endDate);
}

function sumDispense(state: InventoryState, match: (e: LedgerEntry) => boolean): ConsumptionItem[] {
  const map = new Map<string, number>();
  for (const e of state.entries) {
    if (e.type !== 'dispense' || !match(e)) continue;
    map.set(e.herb, (map.get(e.herb) ?? 0) + e.amount);
  }
  return Array.from(map, ([herb, grams]) => ({ herb, grams: round1(grams) })).sort(
    (a, b) => b.grams - a.grams || a.herb.localeCompare(b.herb, 'zh')
  );
}

/** 收工：当天与最近七天各汇总一次消耗 */
export function closeDay(state: InventoryState, date: string): DayClose {
  return { date, today: summarizeConsumption(state, date), week: summarizeRange(state, date, 7) };
}
