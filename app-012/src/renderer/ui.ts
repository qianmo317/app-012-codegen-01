import type { Prescription, WeighResult } from '../types';
import type { HerbTotals, RestockItem, DayClose, LedgerEntry } from '../inventory';
import { RESTOCK_TARGET } from '../inventory';

export interface LedgerViewData {
  date: string;
  totals: HerbTotals[];
  restockList: RestockItem[];
  close: DayClose;
  entries: LedgerEntry[];
  selectedEntryId: string | null;
}

export class UIRenderer {
  prescriptionX: number = 20;
  prescriptionY: number = 60;
  prescriptionW: number = 260;
  buttonRects: Array<{ x: number; y: number; w: number; h: number; action: string }> = [];

  layout(canvasW: number, _canvasH: number): void {
    this.prescriptionX = 20;
    this.prescriptionY = 60;
    this.prescriptionW = Math.min(260, canvasW * 0.3);
  }

  drawPrescription(ctx: CanvasRenderingContext2D, prescription: Prescription, weighed: Set<string>, currentHerb: string | null): void {
    const x = this.prescriptionX;
    const y = this.prescriptionY;
    const w = this.prescriptionW;
    const lineH = 32;

    ctx.fillStyle = 'rgba(255, 252, 245, 0.95)';
    ctx.fillRect(x, y, w, prescription.items.length * lineH + 50);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, prescription.items.length * lineH + 50);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('处方', x + 10, y + 24);

    prescription.items.forEach((item, i) => {
      const iy = y + 44 + i * lineH;
      const isWeighed = weighed.has(item.herb);
      const isCurrent = currentHerb === item.herb;

      if (isCurrent) {
        ctx.fillStyle = 'rgba(212, 165, 116, 0.3)';
        ctx.fillRect(x + 4, iy - 18, w - 8, lineH - 2);
      }

      ctx.fillStyle = isWeighed ? '#999' : '#333';
      ctx.font = `${isWeighed ? '' : 'bold '}15px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'left';
      let text = `${item.herb} ${item.grams}g`;
      if (item.decoct === 'first') text += ' [先煎]';
      if (item.decoct === 'last') text += ' [后下]';
      ctx.fillText(text, x + 12, iy);

      if (isWeighed) {
        ctx.beginPath();
        ctx.moveTo(x + 12, iy - 4);
        ctx.lineTo(x + w - 12, iy - 4);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  }

  drawStatus(ctx: CanvasRenderingContext2D, level: number, score: number, combo: number, queue: number, satisfaction: number, timeLeft: number | null): void {
    const x = 20;
    const y = 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, 600, 48);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let text = `第${level}关  分数:${score}  连击:${combo}  排队:${queue}  满意度:${satisfaction}`;
    if (timeLeft !== null) {
      const color = timeLeft < 10 ? '#ff4444' : '#f5e6d3';
      ctx.fillStyle = color;
      text += `  时间:${Math.ceil(timeLeft)}s`;
    }
    ctx.fillText(text, x, y + 24);
  }

  drawPackageArea(ctx: CanvasRenderingContext2D, _canvasW: number, canvasH: number, packages: Array<{ herb: string; grams: number; decoct: string }>): void {
    const x = 20;
    const y = canvasH - 120;
    const w = 400;
    const h = 100;

    ctx.fillStyle = 'rgba(245, 230, 211, 0.9)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('已分包', x + 10, y + 20);

    packages.forEach((pkg, i) => {
      const px = x + 10 + (i % 4) * 95;
      const py = y + 36 + Math.floor(i / 4) * 28;
      ctx.fillStyle = '#fff8f0';
      ctx.fillRect(px, py, 88, 24);
      ctx.strokeStyle = '#d4a574';
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, 88, 24);
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let label = `${pkg.herb}`;
      if (pkg.decoct !== 'normal') label += '*';
      ctx.fillText(label, px + 44, py + 12);
    });
  }

  drawButtons(_ctx: CanvasRenderingContext2D): void {
    this.buttonRects = [];
  }

  drawMenu(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, highestScore: number, highestLevel: number): void {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('中药柜抓药', cx, cy - 120);
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.fillText('戥子称重模拟', cx, cy - 80);

    const buttons = [
      { label: '开始游戏', action: 'start' },
      { label: '无尽模式', action: 'endless' },
      { label: '药柜账本', action: 'open-ledger' },
    ];

    this.buttonRects = [];
    buttons.forEach((btn, i) => {
      const bx = cx - 80;
      const by = cy - 20 + i * 60;
      const bw = 160;
      const bh = 44;

      ctx.fillStyle = '#6b4e23';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#d4a574';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#f5e6d3';
      ctx.font = '18px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, cx, by + bh / 2);

      this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: btn.action });
    });

    ctx.fillStyle = '#888';
    ctx.font = '14px sans-serif';
    ctx.fillText(`最高分: ${highestScore}  最高关卡: ${highestLevel}`, cx, cy + 170);
  }

  drawReview(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, herb: string, options: number[], selected: number | null, result: boolean | null): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const w = 360;
    const h = 240;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 20px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`复核：刚才 ${herb} 抓了多少克？`, cx, cy - 70);

    this.buttonRects = [];
    options.forEach((opt, i) => {
      const bx = cx - 140 + i * 100;
      const by = cy - 20;
      const bw = 80;
      const bh = 44;

      ctx.fillStyle = selected === opt && result === false ? '#ff6b6b' : selected === opt && result === true ? '#90ee90' : '#f5e6d3';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#8b6914';
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#333';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${opt}g`, bx + bw / 2, by + bh / 2);

      this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: `review-${opt}` });
    });

    if (result !== null) {
      ctx.fillStyle = result ? '#228b22' : '#dc143c';
      ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
      ctx.fillText(result ? '回答正确！' : '回答错误！', cx, cy + 50);
    }
  }

  drawResult(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, score: number, level: number, results: WeighResult[], passed: boolean): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#fff8f0';
    ctx.fillRect(cx - 200, cy - 180, 400, 360);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 200, cy - 180, 400, 360);

    ctx.fillStyle = passed ? '#228b22' : '#dc143c';
    ctx.font = 'bold 28px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(passed ? '关卡通过！' : '关卡失败', cx, cy - 140);

    ctx.fillStyle = '#333';
    ctx.font = '18px sans-serif';
    ctx.fillText(`第${level}关  得分: ${score}`, cx, cy - 100);

    results.forEach((r, i) => {
      const ry = cy - 60 + i * 28;
      const color = r.ok ? '#228b22' : '#dc143c';
      ctx.fillStyle = color;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${r.herb}: 目标${r.target}g 实际${r.actual.toFixed(1)}g 差${r.deltaG > 0 ? '+' : ''}${r.deltaG.toFixed(1)}g`, cx - 160, ry);
    });

    this.buttonRects = [];
    const btnLabel = passed ? '下一关' : '重试';
    const by = cy + 140;

    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(cx - 130, by, 120, 40);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 130, by, 120, 40);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btnLabel, cx - 70, by + 20);

    this.buttonRects.push({ x: cx - 130, y: by, w: 120, h: 40, action: passed ? 'next' : 'retry' });

    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(cx + 10, by, 120, 40);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 10, by, 120, 40);

    ctx.fillStyle = '#f5e6d3';
    ctx.fillText('账本', cx + 70, by + 20);

    this.buttonRects.push({ x: cx + 10, y: by, w: 120, h: 40, action: 'open-ledger' });
  }

  drawGameOver(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, score: number, level: number): void {
    const cx = canvasW / 2;
    const cy = canvasH / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#dc143c';
    ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('病人都走光了', cx, cy - 60);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '20px sans-serif';
    ctx.fillText(`最终得分: ${score}  通过关卡: ${level}`, cx, cy);

    this.buttonRects = [];
    const bx = cx - 60;
    const by = cy + 50;
    const bw = 120;
    const bh = 40;

    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.fillStyle = '#f5e6d3';
    ctx.font = '18px "Microsoft YaHei", sans-serif';
    ctx.fillText('返回菜单', cx, by + bh / 2);

    this.buttonRects.push({ x: bx, y: by, w: bw, h: bh, action: 'menu' });
  }

  drawInstructions(ctx: CanvasRenderingContext2D, _canvasW: number, canvasH: number): void {
    const x = 20;
    const y = canvasH - 80;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, 500, 70);
    ctx.fillStyle = '#ccc';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('操作: 1-9选抽屉 / 拖拽药材到秤盘 / 滚轮微调 / 空格确认 / Z归零', x + 10, y + 10);
    ctx.fillText('目标: 按处方抓药，误差在允许范围内', x + 10, y + 30);
    ctx.fillText('注意: 先煎/后下药要单独分包', x + 10, y + 48);
  }

  drawTareButton(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean): void {
    ctx.fillStyle = active ? '#d4a574' : '#f5e6d3';
    ctx.fillRect(x, y, 60, 32);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 60, 32);
    ctx.fillStyle = '#333';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('归零', x + 30, y + 16);
  }

  /** 抓药界面顶部的账本入口 */
  drawLedgerButton(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(x, y, 100, 32);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 100, 32);
    ctx.fillStyle = '#f5e6d3';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('账本', x + 50, y + 16);
    this.buttonRects.push({ x, y, w: 100, h: 32, action: 'open-ledger' });
  }

  drawLedger(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, data: LedgerViewData): void {
    this.buttonRects = [];
    const pad = 20;
    const colW = (canvasW - pad * 3) / 2;
    const leftX = pad;
    const rightX = pad * 2 + colW;

    ctx.fillStyle = '#1a1208';
    ctx.fillRect(0, 0, canvasW, canvasH);

    ctx.fillStyle = '#d4a574';
    ctx.font = 'bold 24px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('药柜账本', leftX, 34);
    ctx.fillStyle = '#888';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${data.date} 收工`, leftX + 130, 36);

    this.drawLedgerCloseButton(ctx, canvasW - pad - 88, 16);

    // 库存总账
    const rowH = 20;
    const rowsPerCol = Math.ceil(data.totals.length / 2);
    const ledgerH = 44 + rowsPerCol * rowH + 10;
    this.drawPanel(ctx, leftX, 64, colW, ledgerH, '库存总账（余 / 抓 / 补 / 底）');
    const innerW = (colW - 24) / 2;
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    data.totals.forEach((t, i) => {
      const col = Math.floor(i / rowsPerCol);
      const row = i % rowsPerCol;
      const cx = leftX + 12 + col * innerW;
      const cy = 64 + 44 + row * rowH;
      if (t.belowMin) {
        ctx.fillStyle = 'rgba(220, 20, 60, 0.12)';
        ctx.fillRect(cx - 4, cy - 1, innerW, rowH - 2);
      }
      ctx.fillStyle = t.belowMin ? '#b22222' : '#333';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(t.herb, cx, cy + 3);
      ctx.fillText(`余${t.stock} 抓${t.dispensed} 补${t.restocked} 底${t.minStock}`, cx + 56, cy + 3);
    });

    // 收工汇总：当天与最近七天
    const sumY = 64 + ledgerH + 12;
    const sumH = canvasH - sumY - pad;
    this.drawPanel(ctx, leftX, sumY, colW, sumH, '收工汇总 · 消耗排行');
    const halfW = (colW - 36) / 2;
    this.drawConsumptionList(ctx, leftX + 12, sumY + 34, halfW, '今日消耗', data.close.today);
    this.drawConsumptionList(ctx, leftX + 24 + halfW, sumY + 34, halfW, '近7日消耗', data.close.week);

    // 待补清单
    const restockRows = Math.min(6, Math.max(1, data.restockList.length));
    const restockH = 34 + restockRows * 26 + (data.restockList.length > 6 ? 18 : 0) + 10;
    this.drawPanel(ctx, rightX, 64, colW, restockH, '待补清单（低于最低存量）');
    ctx.textBaseline = 'middle';
    if (data.restockList.length === 0) {
      ctx.fillStyle = '#228b22';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('库存充足，无需补货', rightX + 12, 64 + 34 + 13);
    } else {
      data.restockList.slice(0, 6).forEach((r, i) => {
        const ry = 64 + 34 + i * 26 + 13;
        ctx.fillStyle = '#b22222';
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${r.herb}  余${r.stock}g / 底${r.minStock}g  缺${r.shortage}g`, rightX + 12, ry);
        this.drawSmallButton(ctx, rightX + colW - 88, ry - 11, 76, 22, `补至${RESTOCK_TARGET}g`, `restock:${r.herb}`);
      });
      if (data.restockList.length > 6) {
        ctx.fillStyle = '#888';
        ctx.font = '12px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`…共 ${data.restockList.length} 味待补`, rightX + 12, 64 + 34 + 6 * 26 + 9);
      }
    }

    // 最近流水与改账
    const flowY = 64 + restockH + 12;
    const flowH = canvasH - flowY - pad;
    this.drawPanel(ctx, rightX, flowY, colW, flowH, '最近流水（点「改」可改账）');
    const selected = data.entries.find(e => e.id === data.selectedEntryId) ?? null;
    const correctionH = selected ? 92 : 0;
    const maxRows = Math.max(2, Math.min(7, Math.floor((flowH - 34 - correctionH - 8) / 22)));
    const shown = data.entries.slice(0, maxRows);
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    shown.forEach((e, i) => {
      const ry = flowY + 34 + i * 22 + 11;
      const isSel = e.id === data.selectedEntryId;
      if (isSel) {
        ctx.fillStyle = 'rgba(212, 165, 116, 0.35)';
        ctx.fillRect(rightX + 6, ry - 10, colW - 12, 21);
      }
      ctx.fillStyle = '#333';
      ctx.textAlign = 'left';
      const typeLabel = e.type === 'dispense' ? '抓' : '补';
      const corrected = e.corrections.length > 0 ? `（改${e.corrections.length}次）` : '';
      ctx.fillText(`${e.date.slice(5)}  ${e.herb}  ${typeLabel} ${e.amount}g${corrected}`, rightX + 12, ry);
      this.drawSmallButton(ctx, rightX + colW - 52, ry - 10, 40, 20, '改', `entry:${e.id}`);
    });
    if (shown.length === 0) {
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.fillText('暂无流水', rightX + 12, flowY + 34 + 11);
    }

    if (selected) {
      const ay = flowY + 34 + shown.length * 22 + 8;
      ctx.fillStyle = '#8b4513';
      ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`改账：${selected.herb} ${selected.type === 'dispense' ? '抓' : '补'} ${selected.amount}g`, rightX + 12, ay + 8);
      const deltas = [-5, -1, 1, 5];
      deltas.forEach((d, i) => {
        const label = d > 0 ? `+${d}` : `${d}`;
        this.drawSmallButton(ctx, rightX + 12 + i * 52, ay + 18, 44, 22, label, `adj:${d}`);
      });
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#666';
      const history = selected.corrections.slice(-3).reverse();
      history.forEach((c, i) => {
        const t = new Date(c.time);
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        ctx.fillText(`${hh}:${mm}  ${c.before}g → ${c.after}g`, rightX + 12 + 4 * 52 + 8, ay + 27 + i * 14);
      });
    }
  }

  private drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string): void {
    ctx.fillStyle = 'rgba(255, 252, 245, 0.95)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#8b6914';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + 12, y + 17);
  }

  private drawSmallButton(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, action: string): void {
    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#f5e6d3';
    ctx.font = '11px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
    this.buttonRects.push({ x, y, w, h, action });
  }

  private drawLedgerCloseButton(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(x, y, 88, 34);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 88, 34);
    ctx.fillStyle = '#f5e6d3';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('返回', x + 44, y + 17);
    this.buttonRects.push({ x, y, w: 88, h: 34, action: 'close-ledger' });
  }

  private drawConsumptionList(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, title: string, items: Array<{ herb: string; grams: number }>): void {
    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x, y + 8);
    const top = items.slice(0, 5);
    if (top.length === 0) {
      ctx.fillStyle = '#999';
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillText('暂无消耗', x, y + 30);
      return;
    }
    const max = top[0].grams;
    const barMaxW = w - 96;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    top.forEach((item, i) => {
      const iy = y + 30 + i * 20;
      ctx.fillStyle = '#333';
      ctx.fillText(`${item.herb} ${item.grams}g`, x, iy);
      ctx.fillStyle = '#d4a574';
      ctx.fillRect(x + 90, iy - 5, Math.max(2, (item.grams / max) * barMaxW), 10);
    });
  }
}
