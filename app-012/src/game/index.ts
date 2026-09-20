import { GameCanvas } from '../renderer/canvas';
import { CabinetRenderer } from '../renderer/cabinet';
import { ScaleRenderer } from '../renderer/scale';
import { UIRenderer } from '../renderer/ui';
import { GameManager } from './state';
import { getHerbByName } from '../herbs';
import { resumeAudio, playDrawerSound, playDropSound, playPointerSound, playErrorSound, playSuccessSound } from '../audio/synth';
import { InventoryLedger } from '../ledger/inventory';
import { loadLedger, saveLedger } from '../ledger/storage';
import { LedgerPanel } from '../ledger/panel';

export class ApothecaryGame {
  canvas: GameCanvas;
  cabinet: CabinetRenderer;
  scale: ScaleRenderer;
  ui: UIRenderer;
  game: GameManager;
  ledgerPanel: LedgerPanel;
  animId = 0;
  mouseX = 0;
  mouseY = 0;
  /** 台账本打开时游戏暂停 */
  ledgerOpen = false;

  constructor(canvasId: string, ledger?: InventoryLedger) {
    this.canvas = new GameCanvas(canvasId);
    this.cabinet = new CabinetRenderer();
    this.scale = new ScaleRenderer();
    this.ui = new UIRenderer();
    this.game = new GameManager(ledger ?? loadLedger());
    this.game.onLedgerChange = () => saveLedger(this.game.ledger);
    this.ledgerPanel = new LedgerPanel({
      ledger: this.game.ledger,
      onChange: () => saveLedger(this.game.ledger),
      onToggle: open => { this.ledgerOpen = open; },
    });
    this.setupInput();
    this.resize();
    this.loop = this.loop.bind(this);
  }

  resize(): void {
    this.canvas.resize();
    this.cabinet.layout(this.canvas.width, this.canvas.height);
    this.scale.layout(this.canvas.width, this.canvas.height);
    this.ui.layout(this.canvas.width, this.canvas.height);
  }

  start(): void {
    document.getElementById('loading')!.style.display = 'none';
    this.loop(performance.now());
  }

  loop(now: number): void {
    this.animId = requestAnimationFrame(this.loop);
    if (!this.ledgerOpen) this.game.tick(now);
    this.scale.animate();
    this.render();
  }

  render(): void {
    const ctx = this.canvas.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (this.game.phase === 'menu') {
      this.renderMenu(ctx, w, h);
      this.drawLedgerButton(ctx, w);
      return;
    }

    ctx.fillStyle = '#2d2418';
    ctx.fillRect(0, 0, w, h);

    this.cabinet.draw(ctx);
    this.drawLowStock(ctx);
    this.scale.draw(ctx, this.game.currentWeight, this.game.zeroOffset);

    if (this.game.prescription) {
      this.ui.drawPrescription(ctx, this.game.prescription, this.game.weighed, this.game.currentHerb);
    }

    this.ui.drawStatus(ctx, this.game.state.level, this.game.state.score, this.game.state.combo, this.game.state.queue, this.game.state.satisfaction, this.game.getTimeLeft());
    this.ui.drawPackageArea(ctx, w, h, this.game.packages);
    this.ui.drawInstructions(ctx, w, h);

    if (this.game.levelConfig.requireTare) {
      this.ui.drawTareButton(ctx, this.scale.x + this.scale.w - 60, this.scale.y + this.scale.h + 10, false);
    }

    this.drawLedgerButton(ctx, w);
    if (this.game.isBlockedActive()) {
      this.drawBlockedBanner(ctx, w, this.game.blockedReason!);
    }

    if (this.game.currentHerb) {
      const herbMeta = getHerbByName(this.game.currentHerb);
      if (herbMeta) {
        this.drawHerbPile(ctx, this.scale.x + this.scale.w / 2 - 20, this.scale.y + this.scale.h - 40, herbMeta.color, Math.min(40, this.game.currentWeight * 2));
      }
    }

    if (this.game.draggingHerb) {
      const herbMeta = getHerbByName(this.game.draggingHerb);
      if (herbMeta) {
        ctx.globalAlpha = 0.8;
        this.drawHerbPile(ctx, this.mouseX - 20, this.mouseY - 20, herbMeta.color, 30);
        ctx.globalAlpha = 1;
      }
    }

    if (this.game.flashingDrawer) {
      const drawer = this.cabinet.drawers.find(d => d.herb === this.game.flashingDrawer);
      if (drawer) {
        ctx.fillStyle = `rgba(255, 0, 0, ${0.3 + Math.sin(performance.now() / 50) * 0.2})`;
        ctx.fillRect(drawer.x, drawer.y, drawer.w, drawer.h);
      }
    }

    if (this.game.phase === 'review') {
      if (this.game.reviewQuestion) {
        this.ui.drawReview(ctx, w, h, this.game.reviewQuestion.herb, this.game.reviewQuestion.options, this.game.reviewSelected, this.game.reviewResult);
      }
    } else if (this.game.phase === 'result') {
      this.ui.drawResult(ctx, w, h, this.game.state.score, this.game.state.level, this.game.results, this.game.results.every(r => r.ok));
    } else if (this.game.phase === 'gameover') {
      this.ui.drawGameOver(ctx, w, h, this.game.state.score, this.game.state.level);
    }
  }

  renderMenu(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const save = loadSaveData();
    this.ui.drawMenu(ctx, w, h, save.highestScore, save.highestLevel);
  }

  /** 台账按钮位置（右上角，所有界面通用） */
  ledgerButtonRect(w: number): { x: number; y: number; w: number; h: number } {
    return { x: w - 150, y: 8, w: 140, h: 34 };
  }

  drawLedgerButton(ctx: CanvasRenderingContext2D, w: number): void {
    const { x, y, w: bw, h: bh } = this.ledgerButtonRect(w);
    const lowCount = this.game.ledger.getReorderList().length;
    ctx.fillStyle = '#6b4e23';
    ctx.fillRect(x, y, bw, bh);
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, bh);
    ctx.fillStyle = '#f5e6d3';
    ctx.font = 'bold 15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📒 药柜台账 (L)', x + bw / 2, y + bh / 2 + 1);
    if (lowCount > 0) {
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.arc(x + bw - 8, y + 8, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`${lowCount}`, x + bw - 8, y + 9);
    }
  }

  drawBlockedBanner(ctx: CanvasRenderingContext2D, w: number, message: string): void {
    ctx.font = 'bold 16px "Microsoft YaHei", sans-serif';
    const bw = Math.max(340, ctx.measureText(message).width + 48);
    const x = (w - bw) / 2;
    const y = 56;
    ctx.fillStyle = 'rgba(142,36,21,0.94)';
    ctx.fillRect(x, y, bw, 40);
    ctx.strokeStyle = '#f0c9b0';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, bw, 40);
    ctx.fillStyle = '#fdeee8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, x + bw / 2, y + 20);
  }

  /** 掉到最低存量线下的抽屉画上红框，提醒伙计 */
  drawLowStock(ctx: CanvasRenderingContext2D): void {
    for (const d of this.cabinet.drawers) {
      if (d.herb && this.game.ledger.isLow(d.herb)) {
        ctx.strokeStyle = `rgba(220,60,40,${0.55 + Math.sin(performance.now() / 350) * 0.25})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
        ctx.fillStyle = '#c0392b';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('缺', d.x + 4, d.y + 3);
      }
    }
  }

  drawHerbPile(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, size: number): void {
    const particles = Math.max(5, Math.floor(size / 3));
    for (let i = 0; i < particles; i++) {
      const px = x + Math.random() * size - size / 2;
      const py = y + Math.random() * size / 2;
      const r = 2 + Math.random() * 3;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7 + Math.random() * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  setupInput(): void {
    const c = this.canvas.canvas;

    c.addEventListener('mousedown', e => {
      resumeAudio();
      const pos = this.canvas.getMousePos(e);
      this.handlePointerDown(pos.x, pos.y);
    });

    c.addEventListener('mousemove', e => {
      const pos = this.canvas.getMousePos(e);
      this.mouseX = pos.x;
      this.mouseY = pos.y;
      this.handlePointerMove(pos.x, pos.y);
    });

    c.addEventListener('mouseup', () => {
      this.handlePointerUp();
    });

    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (this.game.phase === 'weighing') {
        const dir = e.deltaY > 0 ? 1 : -1;
        this.game.addWeight(dir * 0.5);
        playPointerSound();
      }
    }, { passive: false });

    c.addEventListener('touchstart', e => {
      resumeAudio();
      e.preventDefault();
      if (e.touches.length > 0) {
        const pos = this.canvas.getMousePos(e.touches[0]);
        this.handlePointerDown(pos.x, pos.y);
      }
    }, { passive: false });

    c.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const pos = this.canvas.getMousePos(e.touches[0]);
        this.mouseX = pos.x;
        this.mouseY = pos.y;
        this.handlePointerMove(pos.x, pos.y);
      }
    }, { passive: false });

    c.addEventListener('touchend', () => {
      this.handlePointerUp();
    });

    window.addEventListener('keydown', e => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // 在台账表单里打字时，按键只属于表单，不驱动游戏（避免输入 L 关账本、方向键带动秤）
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      this.handleKey(e.key);
    });
  }

  handlePointerDown(x: number, y: number): void {
    if (this.ledgerOpen) return;

    const lb = this.ledgerButtonRect(this.canvas.width);
    if (x >= lb.x && x <= lb.x + lb.w && y >= lb.y && y <= lb.y + lb.h) {
      this.ledgerPanel.open();
      playPointerSound();
      return;
    }

    if (this.game.phase === 'menu') {
      const btn = this.ui.buttonRects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (btn) {
        if (btn.action === 'start') {
          this.game.startLevel(1, false);
          this.cabinet.setHerbs(this.game.herbs);
        } else if (btn.action === 'endless') {
          this.game.startLevel(1, true);
          this.cabinet.setHerbs(this.game.herbs);
        }
      }
      return;
    }

    if (this.game.phase === 'review') {
      const btn = this.ui.buttonRects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (btn && btn.action.startsWith('review-')) {
        const val = parseInt(btn.action.replace('review-', ''));
        const correct = this.game.answerReview(val);
        if (correct) playSuccessSound();
        else playErrorSound();
      }
      return;
    }

    if (this.game.phase === 'result' || this.game.phase === 'gameover') {
      const btn = this.ui.buttonRects.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
      if (btn) {
        if (btn.action === 'next') {
          this.game.nextLevel();
          this.cabinet.setHerbs(this.game.herbs);
        } else if (btn.action === 'retry') {
          this.game.retryLevel();
          this.cabinet.setHerbs(this.game.herbs);
        } else if (btn.action === 'menu') {
          this.game.phase = 'menu';
        }
      }
      return;
    }

    if (this.game.phase === 'playing') {
      const drawer = this.cabinet.getDrawerAt(x, y);
      if (drawer && drawer.herb) {
        const ok = this.game.selectDrawer(drawer.herb);
        if (ok) {
          playDrawerSound();
          this.cabinet.openDrawer(drawer.herb);
        } else {
          playErrorSound();
        }
      }
      return;
    }

    if (this.game.phase === 'weighing') {
      const sx = this.scale.x;
      const sy = this.scale.y + this.scale.h + 10;
      if (x >= sx && x <= sx + 40 && y >= sy && y <= sy + 32) {
        this.game.addWeight(1);
        playPointerSound();
        return;
      }
      if (x >= sx + 50 && x <= sx + 90 && y >= sy && y <= sy + 32) {
        this.game.addWeight(-1);
        playPointerSound();
        return;
      }
      if (x >= sx + 100 && x <= sx + 160 && y >= sy && y <= sy + 32) {
        this.game.tare();
        playPointerSound();
        return;
      }

      const scaleArea = { x: this.scale.x, y: this.scale.y, w: this.scale.w, h: this.scale.h };
      if (x >= scaleArea.x && x <= scaleArea.x + scaleArea.w && y >= scaleArea.y && y <= scaleArea.y + scaleArea.h) {
        this.game.draggingHerb = this.game.currentHerb;
      }
      return;
    }
  }

  handlePointerMove(x: number, y: number): void {
    this.cabinet.updateHover(x, y);
    if (this.game.phase === 'weighing' && this.game.draggingHerb) {
      const scaleArea = { x: this.scale.x, y: this.scale.y, w: this.scale.w, h: this.scale.h };
      this.game.onScale = x >= scaleArea.x && x <= scaleArea.x + scaleArea.w && y >= scaleArea.y && y <= scaleArea.y + scaleArea.h;
    }
  }

  handlePointerUp(): void {
    if (this.game.phase === 'weighing' && this.game.draggingHerb) {
      if (this.game.onScale) {
        this.game.currentWeight = Math.min(50, this.game.currentWeight + 5);
        playDropSound();
      }
      this.game.draggingHerb = null;
      this.game.onScale = false;
    }
  }

  handleKey(key: string): void {
    if (key === 'l' || key === 'L') {
      this.ledgerPanel.toggle();
      return;
    }
    if (this.ledgerOpen) return;

    if (this.game.phase === 'menu') {
      if (key === 'Enter' || key === ' ') {
        this.game.startLevel(1, false);
        this.cabinet.setHerbs(this.game.herbs);
      }
      return;
    }

    if (this.game.phase === 'playing') {
      const idx = parseInt(key);
      if (!isNaN(idx) && idx >= 1 && idx <= 9) {
        const drawers = this.cabinet.drawers.filter(d => d.herb);
        if (idx <= drawers.length) {
          const ok = this.game.selectDrawer(drawers[idx - 1].herb);
          if (ok) {
            playDrawerSound();
            this.cabinet.openDrawer(drawers[idx - 1].herb);
          } else {
            playErrorSound();
          }
        }
      }
      return;
    }

    if (this.game.phase === 'weighing') {
      if (key === ' ' || key === 'Enter') {
        const result = this.game.confirmWeight();
        if (result) {
          if (result.blocked) {
            playErrorSound();
          } else if (result.ok) {
            playSuccessSound();
          } else {
            playErrorSound();
          }
        }
      } else if (key === 'z' || key === 'Z') {
        this.game.tare();
        playPointerSound();
      } else if (key === 'ArrowUp' || key === 'ArrowRight') {
        this.game.addWeight(0.5);
        playPointerSound();
      } else if (key === 'ArrowDown' || key === 'ArrowLeft') {
        this.game.addWeight(-0.5);
        playPointerSound();
      }
      return;
    }

    if (this.game.phase === 'result') {
      if (key === 'Enter' || key === ' ') {
        const passed = this.game.results.every(r => r.ok);
        if (passed) {
          this.game.nextLevel();
        } else {
          this.game.retryLevel();
        }
        this.cabinet.setHerbs(this.game.herbs);
      }
      return;
    }

    if (this.game.phase === 'gameover') {
      if (key === 'Enter' || key === ' ') {
        this.game.phase = 'menu';
      }
      return;
    }
  }
}

function loadSaveData(): { highestScore: number; highestLevel: number } {
  try {
    const raw = localStorage.getItem('apothecary-weighing-v1');
    if (raw) {
      const data = JSON.parse(raw);
      return { highestScore: data.highestScore ?? 0, highestLevel: data.highestLevel ?? 0 };
    }
  } catch {
    // ignore
  }
  return { highestScore: 0, highestLevel: 0 };
}
