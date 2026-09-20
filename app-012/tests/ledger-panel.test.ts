import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryLedger } from '../src/ledger/inventory';
import { LedgerPanel } from '../src/ledger/panel';

/** 面板是纯 DOM 操作，jsdom 下做交互冒烟测试 */
describe('LedgerPanel 台账面板', () => {
  let ledger: InventoryLedger;
  let panel: LedgerPanel;

  beforeEach(() => {
    document.body.replaceChildren();
    ledger = new InventoryLedger({ initialStock: 100, defaultReorderLevel: 30 });
    ledger.ensureHerb('甘草');
    panel = new LedgerPanel({ ledger });
  });

  it('挂载到 body 且默认隐藏', () => {
    expect(document.querySelector('.ledger-overlay')).toBeTruthy();
    expect(panel.isOpen).toBe(false);
  });

  it('打开后渲染库存表，显示现存克数', () => {
    panel.open();
    expect(panel.isOpen).toBe(true);
    const text = document.querySelector('.ledger-body')?.textContent ?? '';
    expect(text).toContain('甘草');
    expect(text).toContain('100g');
  });

  it('打开面板触发 onToggle(true)', () => {
    let opened = false;
    const p = new LedgerPanel({ ledger, onToggle: o => { opened = o; } });
    p.open();
    expect(opened).toBe(true);
    p.close();
    expect(opened).toBe(false);
  });

  it('待补标签只列出低于线的药', () => {
    ledger.dispense('甘草', 75); // 剩 25，低于 30
    panel.open('reorder');
    const text = document.querySelector('.ledger-body')?.textContent ?? '';
    expect(text).toContain('甘草');
    expect(text).toContain('5g'); // 缺口
  });

  it('在库存页提交补货，账上增加并生成批号；同页可二次补货得到 -02 批号', () => {
    panel.open('stocks');
    const restockBtn = [...document.querySelectorAll('.ledger-body button')]
      .find(b => b.textContent === '补货') as HTMLButtonElement;
    restockBtn.click();
    const qty = document.querySelector('.ledger-inline input[type=number]') as HTMLInputElement;
    qty.value = '40';
    const submit = [...document.querySelectorAll('.ledger-inline button')]
      .find(b => b.textContent === '入账') as HTMLButtonElement;
    submit.click();
    expect(ledger.getStock('甘草')?.onHand).toBe(140);
    expect(ledger.listRestocks()[0].batchNo).toMatch(/-\d{2}$/);

    // 同日再来一笔
    restockBtn.click();
    const qty2 = document.querySelector('.ledger-inline input[type=number]') as HTMLInputElement;
    qty2.value = '10';
    const submit2 = [...document.querySelectorAll('.ledger-inline button')]
      .find(b => b.textContent === '入账') as HTMLButtonElement;
    submit2.click();
    expect(ledger.listRestocks().map(r => r.batchNo)).toHaveLength(2);
    expect(ledger.listRestocks()[1].batchNo.endsWith('-02')).toBe(true);
  });

  it('改账表单不填原因时拒绝，账不变', () => {
    panel.open('stocks');
    const adjustBtn = [...document.querySelectorAll('.ledger-body button')]
      .find(b => b.textContent === '改账') as HTMLButtonElement;
    adjustBtn.click();
    const submit = [...document.querySelectorAll('.ledger-inline button')]
      .find(b => b.textContent === '入账') as HTMLButtonElement;
    submit.click();
    expect(ledger.getStock('甘草')?.onHand).toBe(100);
  });

  it('消耗汇总页显示今日与七天两个榜单', () => {
    ledger.dispense('甘草', 20);
    panel.open('consume');
    const text = document.querySelector('.ledger-body')?.textContent ?? '';
    expect(text).toContain('今日消耗');
    expect(text).toContain('最近七天消耗');
    expect(text).toContain('20g');
  });

  it('改账留痕页列出改前改后', () => {
    ledger.adjust('甘草', 88, '盘点盘亏');
    panel.open('adjust');
    const text = document.querySelector('.ledger-body')?.textContent ?? '';
    expect(text).toContain('100g');
    expect(text).toContain('88g');
    expect(text).toContain('盘点盘亏');
  });

  it('onChange 在入账后被调用（用于持久化）', () => {
    let count = 0;
    const p = new LedgerPanel({ ledger, onChange: () => count++ });
    p.open('stocks');
    const restockBtn = [...document.querySelectorAll('.ledger-body button')]
      .find(b => b.textContent === '补货') as HTMLButtonElement;
    restockBtn.click();
    const submit = [...document.querySelectorAll('.ledger-inline button')]
      .find(b => b.textContent === '入账') as HTMLButtonElement;
    submit.click();
    expect(count).toBe(1);
  });
});
