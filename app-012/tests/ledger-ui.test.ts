import { describe, it, expect, beforeEach } from 'vitest';
import { UIRenderer } from '../src/renderer/ui';
import { GameManager } from '../src/game/state';
import { getAllTotals, getRestockList, closeDay, todayString, dispense } from '../src/inventory';
import { clearInventory } from '../src/storage';

/** 吸收所有调用的 2D 上下文桩，只验证绘制流程不抛错、按钮注册正确 */
function makeCtxStub(): CanvasRenderingContext2D {
  const target: Record<PropertyKey, unknown> = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop in t) return t[prop];
      return () => undefined;
    },
    set(t, prop, value) {
      t[prop] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function drawLedgerFor(gm: GameManager, ui: UIRenderer): void {
  ui.drawLedger(ctx, 1024, 768, {
    date: todayString(),
    totals: getAllTotals(gm.inventory),
    restockList: getRestockList(gm.inventory),
    close: closeDay(gm.inventory, todayString()),
    entries: [...gm.inventory.entries].reverse(),
    selectedEntryId: gm.ledgerSelectedEntry,
  });
}

let ctx: CanvasRenderingContext2D;

beforeEach(() => {
  ctx = makeCtxStub();
  clearInventory();
});

describe('账本界面', () => {
  it('should render ledger page and register close button', () => {
    const ui = new UIRenderer();
    const gm = new GameManager();
    drawLedgerFor(gm, ui);
    expect(ui.buttonRects.some(b => b.action === 'close-ledger')).toBe(true);
  });

  it('should register restock buttons for herbs below minimum', () => {
    const ui = new UIRenderer();
    const gm = new GameManager();
    dispense(gm.inventory, '白芍', 160, todayString(), 1);
    drawLedgerFor(gm, ui);
    expect(ui.buttonRects.some(b => b.action === 'restock:白芍')).toBe(true);
  });

  it('should register correction buttons when an entry is selected', () => {
    const ui = new UIRenderer();
    const gm = new GameManager();
    gm.startLevel(1, false);
    const item = gm.prescription!.items[0];
    gm.selectDrawer(item.herb);
    gm.setWeight(item.grams);
    gm.confirmWeight();
    const entry = gm.inventory.entries.find(e => e.type === 'dispense')!;
    gm.selectLedgerEntry(entry.id);
    drawLedgerFor(gm, ui);
    expect(ui.buttonRects.some(b => b.action === `entry:${entry.id}`)).toBe(true);
    expect(ui.buttonRects.some(b => b.action === 'adj:-5')).toBe(true);
    expect(ui.buttonRects.some(b => b.action === 'adj:5')).toBe(true);
  });

  it('menu and result screens should offer the ledger entry', () => {
    const ui = new UIRenderer();
    ui.drawMenu(ctx, 1024, 768, 0, 0);
    expect(ui.buttonRects.some(b => b.action === 'open-ledger')).toBe(true);
    const gm = new GameManager();
    ui.drawResult(ctx, 1024, 768, 100, 1, gm.results, true);
    expect(ui.buttonRects.some(b => b.action === 'open-ledger')).toBe(true);
  });
});
