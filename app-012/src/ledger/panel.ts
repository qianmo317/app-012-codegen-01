import {
  InventoryLedger,
  dayKey,
  type MovementType,
} from './inventory';

type TabId = 'stocks' | 'reorder' | 'movements' | 'consume' | 'adjust' | 'restock';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'stocks', label: '库存' },
  { id: 'reorder', label: '待补' },
  { id: 'movements', label: '流水账' },
  { id: 'consume', label: '消耗汇总' },
  { id: 'restock', label: '来货记录' },
  { id: 'adjust', label: '改账留痕' },
];

let styleInjected = false;

function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const css = `
.ledger-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(26,18,8,0.62);
  display: none; align-items: center; justify-content: center;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}
.ledger-overlay.ledger-open { display: flex; }
.ledger-panel {
  width: min(960px, 94vw); max-height: 90vh; display: flex; flex-direction: column;
  background: #f7efdc; color: #3a2a16;
  border: 3px solid #8b6914; border-radius: 6px;
  box-shadow: 0 18px 60px rgba(0,0,0,0.5);
}
.ledger-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 18px; background: #8b4513; color: #f5e6d3;
  border-bottom: 3px double #d4a574;
}
.ledger-header h2 { font-size: 20px; letter-spacing: 4px; }
.ledger-header .ledger-sub { font-size: 12px; opacity: .8; margin-top: 2px; letter-spacing: 1px; }
.ledger-close {
  border: 2px solid #d4a574; background: #6b3a13; color: #f5e6d3;
  width: 34px; height: 34px; font-size: 18px; border-radius: 4px; cursor: pointer;
}
.ledger-close:hover { background: #a0522d; }
.ledger-tabs { display: flex; gap: 2px; padding: 8px 12px 0; background: #e8d9b8; border-bottom: 2px solid #8b6914; }
.ledger-tab {
  padding: 8px 18px; cursor: pointer; border: 2px solid transparent; border-bottom: none;
  background: #d9c69a; color: #5a4326; font-size: 15px; border-radius: 6px 6px 0 0;
}
.ledger-tab.ledger-tab-active { background: #f7efdc; border-color: #8b6914; color: #3a2a16; font-weight: bold; }
.ledger-body { padding: 14px 18px; overflow-y: auto; }
.ledger-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.ledger-table th, .ledger-table td { border: 1px solid #c2a86f; padding: 6px 8px; text-align: left; }
.ledger-table th { background: #e8d9b8; white-space: nowrap; }
.ledger-table tr.low td { background: #f6ddd3; }
.ledger-table tr.low td:first-child { border-left: 4px solid #c0392b; }
.ledger-tag { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 12px; }
.ledger-tag-ok { background: #d8e8c8; color: #3d6b1e; }
.ledger-tag-low { background: #e8b4a8; color: #8e2415; }
.ledger-tag-out { background: #c0392b; color: #fff; }
.ledger-tag-dispense { background: #e8d9b8; color: #6b4e23; }
.ledger-tag-restock { background: #cfe3c2; color: #2f5d16; }
.ledger-tag-adjust { background: #e3d2ee; color: #5b2d82; }
.ledger-btn {
  border: 1px solid #8b6914; background: #c8a15a; color: #2e1f0c;
  padding: 3px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; margin-right: 4px;
}
.ledger-btn:hover { background: #d8b76f; }
.ledger-btn.ledger-btn-primary { background: #8b4513; color: #f5e6d3; border-color: #6b3a13; }
.ledger-btn.ledger-btn-primary:hover { background: #a0522d; }
.ledger-btn.ledger-btn-ghost { background: transparent; }
.ledger-inline { background: #efe1bf; border: 1px dashed #8b6914; border-radius: 4px; padding: 8px 10px; margin: 6px 0; }
.ledger-inline label { font-size: 13px; margin-right: 8px; }
.ledger-inline input[type=number], .ledger-inline input[type=date], .ledger-inline input[type=text] {
  padding: 3px 6px; border: 1px solid #a8894f; border-radius: 3px; background: #fffaf0;
  font-size: 14px; width: 90px;
}
.ledger-inline input[type=text] { width: 200px; }
.ledger-section-title { font-weight: bold; font-size: 15px; margin: 14px 0 6px; color: #6b3a13; border-left: 4px solid #8b6914; padding-left: 8px; }
.ledger-muted { color: #8a7653; font-size: 13px; }
.ledger-rank { display: inline-block; width: 26px; font-weight: bold; color: #8b6914; }
.ledger-bar { display: inline-block; height: 12px; background: linear-gradient(90deg,#c8a15a,#8b4513); border-radius: 3px; vertical-align: middle; margin-right: 8px; }
.ledger-toast {
  position: absolute; top: 64px; left: 50%; transform: translateX(-50%);
  background: #3d6b1e; color: #f5fbe8; padding: 8px 20px; border-radius: 4px;
  font-size: 14px; opacity: 0; transition: opacity .25s; pointer-events: none;
}
.ledger-toast.ledger-toast-show { opacity: 1; }
.ledger-footer { padding: 8px 18px; border-top: 1px solid #c2a86f; background: #ece0c2; font-size: 12px; color: #7a6238; }
.ledger-filters { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.ledger-filters select { padding: 3px 6px; border: 1px solid #a8894f; background: #fffaf0; border-radius: 3px; }
.ledger-empty { padding: 30px; text-align: center; color: #9a845c; }
`;
  const style = document.createElement('style');
  style.id = 'ledger-panel-style';
  style.textContent = css;
  document.head.appendChild(style);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v as string;
    else if (k === 'style') node.setAttribute('style', v as string);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else (node as Record<string, unknown>)[k] = v;
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

function fmtDateTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => `${n}`.padStart(2, '0');
  return `${dayKey(t)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtGrams(n: number): string {
  return `${Math.round(n * 10) / 10}g`;
}

export interface LedgerPanelOptions {
  ledger: InventoryLedger;
  /** 台账变动后回调：持久化存档 + 刷新外部（如抽屉红标） */
  onChange?: () => void;
  /** 打开/关闭面板回调（用于暂停游戏计时） */
  onToggle?: (open: boolean) => void;
}

export class LedgerPanel {
  private ledger: InventoryLedger;
  private onChange?: () => void;
  private onToggle?: (open: boolean) => void;

  private overlay: HTMLDivElement;
  private body: HTMLDivElement;
  private toast: HTMLDivElement;
  private tabButtons: Partial<Record<TabId, HTMLDivElement>> = {};
  private tab: TabId = 'stocks';

  /** 流水账筛选 */
  private flowType: MovementType | 'all' = 'all';
  private flowDay = '';

  /** 当前展开的内联表单：tab:药名 */
  private openForm: string | null = null;

  constructor(opts: LedgerPanelOptions) {
    this.ledger = opts.ledger;
    this.onChange = opts.onChange;
    this.onToggle = opts.onToggle;
    injectStyle();

    this.overlay = el('div', { class: 'ledger-overlay' });
    const panel = el('div', { class: 'ledger-panel' });

    const header = el('div', { class: 'ledger-header' }, [
      el('div', {}, [
        el('h2', {}, ['药 柜 台 账']),
        el('div', { class: 'ledger-sub' }, ['抓一味扣一味 · 账上不够先拦着 · 来货留批号 · 改错留痕迹']),
      ]),
    ]);
    const closeBtn = el('button', { class: 'ledger-close', textContent: '×', title: '关闭 (Esc)' });
    closeBtn.addEventListener('click', () => this.close());
    header.append(closeBtn);

    const tabs = el('div', { class: 'ledger-tabs' });
    for (const t of TABS) {
      const btn = el('div', { class: 'ledger-tab', textContent: t.label });
      btn.addEventListener('click', () => {
        this.tab = t.id;
        this.openForm = null;
        this.render();
      });
      this.tabButtons[t.id] = btn;
      tabs.append(btn);
    }

    this.body = el('div', { class: 'ledger-body' });
    this.toast = el('div', { class: 'ledger-toast' });

    const footer = el('div', { class: 'ledger-footer' }, [
      '快捷键 L 开/关账本 · 同日多次来货按批号（日期-序号）分别记账 · 改账不改旧流水，另留痕迹',
    ]);

    panel.append(header, tabs, this.body, footer);
    panel.appendChild(this.toast);
    this.overlay.append(panel);
    this.overlay.addEventListener('mousedown', e => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
    document.body.append(this.overlay);
  }

  get isOpen(): boolean {
    return this.overlay.classList.contains('ledger-open');
  }

  open(tab?: TabId): void {
    if (tab) this.tab = tab;
    this.overlay.classList.add('ledger-open');
    this.render();
    this.onToggle?.(true);
  }

  close(): void {
    this.overlay.classList.remove('ledger-open');
    this.onToggle?.(false);
  }

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  // ---------- 渲染 ----------

  private render(): void {
    for (const [id, btn] of Object.entries(this.tabButtons)) {
      btn?.classList.toggle('ledger-tab-active', id === this.tab);
    }
    this.body.replaceChildren();
    switch (this.tab) {
      case 'stocks': this.renderStocks(); break;
      case 'reorder': this.renderReorder(); break;
      case 'movements': this.renderMovements(); break;
      case 'consume': this.renderConsume(); break;
      case 'restock': this.renderRestocks(); break;
      case 'adjust': this.renderAdjustments(); break;
    }
    // 待补数量角标
    const lowCount = this.ledger.getReorderList().length;
    const reorderBtn = this.tabButtons.reorder;
    if (reorderBtn) reorderBtn.textContent = lowCount > 0 ? `待补 (${lowCount})` : '待补';
  }

  private stockTag(onHand: number, line: number): HTMLSpanElement {
    if (onHand <= 0) return el('span', { class: 'ledger-tag ledger-tag-out', textContent: '告罄' });
    if (onHand <= line) return el('span', { class: 'ledger-tag ledger-tag-low', textContent: '待补' });
    return el('span', { class: 'ledger-tag ledger-tag-ok', textContent: '充足' });
  }

  private renderStocks(): void {
    const stocks = this.ledger.listStocks();
    if (stocks.length === 0) {
      this.body.append(el('div', { class: 'ledger-empty', textContent: '账上还没有药，开始游戏后会自动立账。' }));
      return;
    }
    const table = el('table', { class: 'ledger-table' });
    table.append(el('thead', {}, [
      el('tr', {}, [
        el('th', { textContent: '药名' }), el('th', { textContent: '现存' }),
        el('th', { textContent: '最低存量' }), el('th', { textContent: '状态' }),
        el('th', { textContent: '累计抓走' }), el('th', { textContent: '累计补进' }),
        el('th', { textContent: '操作' }),
      ]),
    ]));
    const tbody = el('tbody');
    for (const s of stocks) {
      const low = s.onHand <= s.reorderLevel;
      const tr = el('tr', { class: low ? 'low' : '' });
      tr.append(
        el('td', { textContent: s.herb }),
        el('td', { textContent: fmtGrams(s.onHand) }),
        el('td', { textContent: fmtGrams(s.reorderLevel) }),
        el('td', {}, [this.stockTag(s.onHand, s.reorderLevel)]),
        el('td', { textContent: fmtGrams(s.totalDispensed) }),
        el('td', { textContent: fmtGrams(s.totalRestocked) }),
      );
      const actions = el('td');
      const restockBtn = el('button', { class: 'ledger-btn', textContent: '补货' });
      restockBtn.addEventListener('click', () => {
        this.openForm = this.openForm === `restock:${s.herb}` ? null : `restock:${s.herb}`;
        this.render();
      });
      const lineBtn = el('button', { class: 'ledger-btn ledger-btn-ghost', textContent: '设最低线' });
      lineBtn.addEventListener('click', () => {
        this.openForm = this.openForm === `line:${s.herb}` ? null : `line:${s.herb}`;
        this.render();
      });
      const adjustBtn = el('button', { class: 'ledger-btn ledger-btn-ghost', textContent: '改账' });
      adjustBtn.addEventListener('click', () => {
        this.openForm = this.openForm === `adjust:${s.herb}` ? null : `adjust:${s.herb}`;
        this.render();
      });
      actions.append(restockBtn, lineBtn, adjustBtn);
      tr.append(actions);
      tbody.append(tr);

      if (this.openForm === `restock:${s.herb}`) {
        tbody.append(this.formRow(7, this.restockForm(s.herb, s.reorderLevel * 2 - s.onHand)));
      } else if (this.openForm === `line:${s.herb}`) {
        tbody.append(this.formRow(7, this.lineForm(s.herb, s.reorderLevel)));
      } else if (this.openForm === `adjust:${s.herb}`) {
        tbody.append(this.formRow(7, this.adjustForm(s.herb, s.onHand)));
      }
    }
    table.append(tbody);
    this.body.append(table);
  }

  private formRow(colspan: number, rest: HTMLDivElement): HTMLTableRowElement {
    return el('tr', {}, [el('td', { colSpan: colspan, style: 'padding:0;border:none;' }, [rest])]);
  }

  private renderReorder(): void {
    const list = this.ledger.getReorderList();
    this.body.append(el('div', { class: 'ledger-section-title', textContent: '掉到最低存量线下的药（待补单）' }));
    if (list.length === 0) {
      this.body.append(el('div', { class: 'ledger-empty', textContent: '所有药都在最低存量线以上，无需补货。' }));
      return;
    }
    const table = el('table', { class: 'ledger-table' });
    table.append(el('thead', {}, [
      el('tr', {}, [
        el('th', { textContent: '药名' }), el('th', { textContent: '现存' }),
        el('th', { textContent: '最低存量' }), el('th', { textContent: '缺口' }),
        el('th', { textContent: '操作' }),
      ]),
    ]));
    const tbody = el('tbody');
    for (const s of list) {
      const tr = el('tr', { class: 'low' });
      tr.append(
        el('td', { textContent: s.herb }),
        el('td', { textContent: fmtGrams(s.onHand) }),
        el('td', { textContent: fmtGrams(s.reorderLevel) }),
        el('td', { textContent: fmtGrams(s.shortfall) }),
      );
      const td = el('td');
      const btn = el('button', { class: 'ledger-btn ledger-btn-primary', textContent: '来货入账' });
      btn.addEventListener('click', () => {
        this.openForm = this.openForm === `reorder-restock:${s.herb}` ? null : `reorder-restock:${s.herb}`;
        this.render();
      });
      td.append(btn);
      tr.append(td);
      tbody.append(tr);
      if (this.openForm === `reorder-restock:${s.herb}`) {
        const row = el('tr', {}, [el('td', { colSpan: 5, style: 'padding:0;border:none;' }, [
          this.restockForm(s.herb, Math.max(s.shortfall, s.reorderLevel)),
        ])]);
        tbody.append(row);
      }
    }
    table.append(tbody);
    this.body.append(table);
  }

  // ---------- 内联表单 ----------

  private restockForm(herb: string, suggested: number): HTMLDivElement {
    const qty = el('input', { type: 'number', min: '0.1', step: '0.1', value: `${Math.max(0.1, Math.round(suggested * 10) / 10)}` });
    const supplier = el('input', { type: 'text', placeholder: '来源（可选）' });
    const note = el('input', { type: 'text', placeholder: '备注（可选）' });
    return el('div', { class: 'ledger-inline' }, [
      el('label', { textContent: `给「${herb}」补货` }),
      el('label', {}, ['数量(g)', qty]),
      el('label', {}, ['来源', supplier]),
      el('label', {}, ['备注', note]),
      this.formActions(() => {
        const rec = this.ledger.restock(herb, parseFloat(qty.value), {
          supplier: supplier.value || undefined,
          note: note.value || undefined,
        });
        this.mutated(`「${herb}」来货 ${fmtGrams(rec.qty)} 已入账，批号 ${rec.batchNo}`);
      }),
    ]);
  }

  private lineForm(herb: string, current: number): HTMLDivElement {
    const level = el('input', { type: 'number', min: '0', step: '1', value: `${current}` });
    return el('div', { class: 'ledger-inline' }, [
      el('label', { textContent: `「${herb}」最低存量(g)` }),
      level,
      this.formActions(() => {
        this.ledger.setReorderLevel(herb, parseFloat(level.value));
        this.mutated(`「${herb}」最低存量改为 ${fmtGrams(parseFloat(level.value))}`);
      }),
    ]);
  }

  private adjustForm(herb: string, current: number): HTMLDivElement {
    const target = el('input', { type: 'number', min: '0', step: '0.1', value: `${current}` });
    const reason = el('input', { type: 'text', placeholder: '改账原因（必填，如：盘点盘亏）' });
    const operator = el('input', { type: 'text', placeholder: '经手人（可选）' });
    return el('div', { class: 'ledger-inline' }, [
      el('label', { textContent: `「${herb}」账上现存应为(g)` }),
      target,
      el('label', {}, ['原因', reason]),
      el('label', {}, ['经手人', operator]),
      this.formActions(() => {
        const rec = this.ledger.adjust(herb, parseFloat(target.value), reason.value, {
          operator: operator.value || undefined,
        });
        const sign = rec.delta > 0 ? '+' : '';
        this.mutated(`已改账：${fmtGrams(rec.before)} → ${fmtGrams(rec.after)}（${sign}${fmtGrams(rec.delta)}），痕迹已留存`);
      }),
    ]);
  }

  private formActions(submit: () => void): HTMLSpanElement {
    const wrap = el('span');
    const ok = el('button', { class: 'ledger-btn ledger-btn-primary', textContent: '入账' });
    ok.addEventListener('click', () => {
      try {
        submit();
      } catch (e) {
        this.showToast((e as Error).message, true);
      }
    });
    const cancel = el('button', { class: 'ledger-btn ledger-btn-ghost', textContent: '取消' });
    cancel.addEventListener('click', () => { this.openForm = null; this.render(); });
    wrap.append(ok, cancel);
    return wrap;
  }

  private mutated(message: string): void {
    this.openForm = null;
    this.onChange?.();
    this.render();
    this.showToast(message);
  }

  private showToast(message: string, error = false): void {
    this.toast.textContent = message;
    this.toast.style.background = error ? '#8e2415' : '#3d6b1e';
    this.toast.classList.add('ledger-toast-show');
    window.setTimeout(() => this.toast.classList.remove('ledger-toast-show'), 2600);
  }

  // ---------- 流水 ----------

  private renderMovements(): void {
    const filters = el('div', { class: 'ledger-filters' });
    const select = el('select');
    for (const [v, label] of [
      ['all', '全部流水'], ['dispense', '出账（抓药）'],
      ['restock', '入账（补货）'], ['adjust', '调账'],
    ] as Array<[MovementType | 'all', string]>) {
      const opt = el('option', { value: v, textContent: label });
      if (v === this.flowType) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => { this.flowType = select.value as MovementType | 'all'; this.render(); });
    const dayInput = el('input', { type: 'date', value: this.flowDay });
    dayInput.addEventListener('change', () => { this.flowDay = dayInput.value; this.render(); });
    const clearDay = el('button', { class: 'ledger-btn ledger-btn-ghost', textContent: '清除日期' });
    clearDay.addEventListener('click', () => { this.flowDay = ''; this.render(); });
    filters.append(select, el('label', {}, ['日期', dayInput]), clearDay);
    this.body.append(filters);

    const list = this.ledger.queryMovements({
      type: this.flowType === 'all' ? undefined : this.flowType,
      day: this.flowDay || undefined,
      reverse: true,
    });
    if (list.length === 0) {
      this.body.append(el('div', { class: 'ledger-empty', textContent: '这段时间没有流水。' }));
      return;
    }
    const table = el('table', { class: 'ledger-table' });
    table.append(el('thead', {}, [
      el('tr', {}, [
        el('th', { textContent: '#' }), el('th', { textContent: '时间' }),
        el('th', { textContent: '药名' }), el('th', { textContent: '类型' }),
        el('th', { textContent: '数量' }), el('th', { textContent: '关联' }),
        el('th', { textContent: '备注' }),
      ]),
    ]));
    const tbody = el('tbody');
    const typeLabel: Record<MovementType, string> = {
      dispense: '出账', restock: '入账', adjust: '调账',
    };
    for (const m of list) {
      tbody.append(el('tr', {}, [
        el('td', { textContent: `${m.seq}` }),
        el('td', { textContent: fmtDateTime(m.at) }),
        el('td', { textContent: m.herb }),
        el('td', {}, [el('span', { class: `ledger-tag ledger-tag-${m.type}`, textContent: typeLabel[m.type] })]),
        el('td', {
          textContent: `${m.delta > 0 ? '+' : ''}${fmtGrams(m.delta)}`,
          style: m.delta < 0 ? 'color:#8e2415;' : 'color:#2f5d16;',
        }),
        el('td', { textContent: m.ref ?? '' }),
        el('td', { textContent: m.note ?? '' }),
      ]));
    }
    table.append(tbody);
    this.body.append(table);
  }

  // ---------- 消耗汇总 ----------

  private renderConsume(): void {
    const today = dayKey(Date.now());
    const dayData = this.ledger.consumptionOfDay(today);
    const weekData = this.ledger.consumptionRecentDays(7);

    this.body.append(el('div', { class: 'ledger-section-title', textContent: `今日消耗（${today}）合计 ${fmtGrams(dayData.total)}` }));
    this.body.append(this.rankTable(dayData.rows));

    this.body.append(el('div', { class: 'ledger-section-title', textContent:
      `最近七天消耗（${weekData.fromDay} 至 ${weekData.toDay}）合计 ${fmtGrams(weekData.total)} · 走得快的在最上面` }));
    this.body.append(this.rankTable(weekData.rows));

    const actions = el('div', { class: 'ledger-filters' }, [el('div', { style: 'flex:1;' })]);
    const closeBtn = el('button', { class: 'ledger-btn ledger-btn-primary', textContent: '收工：汇总今天' });
    closeBtn.addEventListener('click', () => {
      const report = this.ledger.closeDay();
      this.mutated(`收工已汇总：今日共抓走 ${fmtGrams(report.totalDispensed)}，来货 ${fmtGrams(report.totalRestocked)}`);
    });
    actions.append(closeBtn);
    this.body.append(actions);

    const reports = this.ledger.listDailyReports().reverse();
    this.body.append(el('div', { class: 'ledger-section-title', textContent: '历日收工汇总' }));
    if (reports.length === 0) {
      this.body.append(el('div', { class: 'ledger-muted', textContent: '还没做过收工汇总。' }));
    } else {
      const table = el('table', { class: 'ledger-table' });
      table.append(el('thead', {}, [
        el('tr', {}, [
          el('th', { textContent: '日期' }), el('th', { textContent: '当日消耗合计' }),
          el('th', { textContent: '当日来货合计' }), el('th', { textContent: '消耗明细' }),
          el('th', { textContent: '收工时间' }),
        ]),
      ]));
      const tbody = el('tbody');
      for (const r of reports) {
        const detail = Object.entries(r.perHerb)
          .sort((a, b) => b[1] - a[1])
          .map(([h, g]) => `${h} ${fmtGrams(g)}`).join('，');
        tbody.append(el('tr', {}, [
          el('td', { textContent: r.day }),
          el('td', { textContent: fmtGrams(r.totalDispensed) }),
          el('td', { textContent: fmtGrams(r.totalRestocked) }),
          el('td', { textContent: detail || '—' }),
          el('td', { textContent: fmtDateTime(r.closedAt) }),
        ]));
      }
      table.append(tbody);
      this.body.append(table);
    }
  }

  private rankTable(rows: Array<{ herb: string; grams: number }>): HTMLTableElement {
    const table = el('table', { class: 'ledger-table' });
    if (rows.length === 0) {
      table.append(el('tbody', {}, [el('tr', {}, [el('td', { class: 'ledger-muted', textContent: '这段时间没有抓药记录。' })])]));
      return table;
    }
    const max = rows[0].grams || 1;
    const tbody = el('tbody');
    rows.forEach((r, i) => {
      const bar = el('span', {
        class: 'ledger-bar',
        style: `width:${Math.max(6, Math.round((r.grams / max) * 140))}px;`,
      });
      tbody.append(el('tr', {}, [
        el('td', { style: 'width:260px;' }, [
          el('span', { class: 'ledger-rank', textContent: `${i + 1}.` }),
          el('span', { textContent: r.herb }),
        ]),
        el('td', {}, [bar, el('span', { textContent: fmtGrams(r.grams) })]),
      ]));
    });
    table.append(tbody);
    return table;
  }

  // ---------- 来货记录 ----------

  private renderRestocks(): void {
    const list = [...this.ledger.listRestocks()].reverse();
    if (list.length === 0) {
      this.body.append(el('div', { class: 'ledger-empty', textContent: '还没有来货记录。' }));
      return;
    }
    const table = el('table', { class: 'ledger-table' });
    table.append(el('thead', {}, [
      el('tr', {}, [
        el('th', { textContent: '批号' }), el('th', { textContent: '药名' }),
        el('th', { textContent: '数量' }), el('th', { textContent: '到货时间' }),
        el('th', { textContent: '来源' }), el('th', { textContent: '备注' }),
      ]),
    ]));
    const tbody = el('tbody');
    // 同一天补两回：批号末两位不同，额外标出"当日第N笔"
    for (const r of list) {
      tbody.append(el('tr', {}, [
        el('td', {}, [
          el('strong', { textContent: r.batchNo }),
          el('div', { class: 'ledger-muted', textContent: `${r.day} 当日第${r.batchOfDay}笔` }),
        ]),
        el('td', { textContent: r.herb }),
        el('td', { textContent: fmtGrams(r.qty) }),
        el('td', { textContent: fmtDateTime(r.arrivedAt) }),
        el('td', { textContent: r.supplier ?? '' }),
        el('td', { textContent: r.note ?? '' }),
      ]));
    }
    table.append(tbody);
    this.body.append(table);
  }

  // ---------- 改账记录 ----------

  private renderAdjustments(): void {
    const list = this.ledger.listAdjustments();
    if (list.length === 0) {
      this.body.append(el('div', { class: 'ledger-empty', textContent: '还没有改过账。' }));
      return;
    }
    const table = el('table', { class: 'ledger-table' });
    table.append(el('thead', {}, [
      el('tr', {}, [
        el('th', { textContent: '#' }), el('th', { textContent: '时间' }),
        el('th', { textContent: '药名' }), el('th', { textContent: '改前' }),
        el('th', { textContent: '改后' }), el('th', { textContent: '差额' }),
        el('th', { textContent: '原因' }), el('th', { textContent: '经手人' }),
      ]),
    ]));
    const tbody = el('tbody');
    for (const a of list) {
      tbody.append(el('tr', {}, [
        el('td', { textContent: `${a.id}` }),
        el('td', { textContent: fmtDateTime(a.at) }),
        el('td', { textContent: a.herb }),
        el('td', { textContent: fmtGrams(a.before) }),
        el('td', { textContent: fmtGrams(a.after) }),
        el('td', {
          textContent: `${a.delta > 0 ? '+' : ''}${fmtGrams(a.delta)}`,
          style: a.delta < 0 ? 'color:#8e2415;' : 'color:#2f5d16;',
        }),
        el('td', { textContent: a.reason }),
        el('td', { textContent: a.operator ?? '—' }),
      ]));
    }
    table.append(tbody);
    this.body.append(table);
  }
}
