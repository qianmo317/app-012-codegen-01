import type { GameState, GamePhase, Prescription, WeighResult, LevelConfig } from '../types';
import { getLevelConfig } from '../levels';
import { generatePrescription, generateReviewQuestion } from '../prescription';
import { judgeWeight, getWeightStatus } from '../weighing';
import { scoreRound } from '../scoring';
import { getRandomHerbs, HERBS } from '../herbs';
import type { HerbMeta } from '../types';
import {
  createInventory,
  canDispense,
  dispense,
  restock,
  correctEntry,
  getStock,
  round1,
  todayString,
  DEFAULT_MIN_STOCK,
  DEFAULT_INITIAL_STOCK,
  RESTOCK_TARGET,
} from '../inventory';
import type { InventoryState } from '../inventory';
import { loadInventory, saveInventory } from '../storage';

function initInventory(): InventoryState {
  const saved = loadInventory();
  if (saved) return saved;
  return createInventory(
    HERBS.map(h => ({ name: h.name, minStock: DEFAULT_MIN_STOCK, initialStock: DEFAULT_INITIAL_STOCK })),
    todayString(),
    Date.now()
  );
}

export class GameManager {
  state: GameState = {
    level: 1,
    score: 0,
    combo: 0,
    queue: 3,
    satisfaction: 100,
    expired: false,
  };

  phase: GamePhase = 'menu';
  endless = false;
  prescription: Prescription | null = null;
  herbs: HerbMeta[] = [];
  currentWeight = 0;
  zeroOffset = 0;
  targetGrams = 0;
  currentHerb: string | null = null;
  weighed = new Set<string>();
  results: WeighResult[] = [];
  packages: Array<{ herb: string; grams: number; decoct: string }> = [];
  reviewQuestion: ReturnType<typeof generateReviewQuestion> = null;
  reviewSelected: number | null = null;
  reviewResult: boolean | null = null;
  levelConfig: LevelConfig = getLevelConfig(1);

  timeLeft: number | null = null;
  timeUsed = 0;
  lastTick = 0;

  drawerOpen = new Set<string>();
  draggingHerb: string | null = null;
  dragX = 0;
  dragY = 0;
  onScale = false;
  flashingDrawer: string | null = null;
  flashTime = 0;

  inventory: InventoryState = initInventory();
  ledgerReturnPhase: GamePhase = 'menu';
  ledgerSelectedEntry: string | null = null;
  stockBlockMsg: string | null = null;
  stockBlockTime = 0;

  startLevel(level: number, endless = false): void {
    this.endless = endless;
    this.state.level = level;
    this.state.expired = false;
    this.levelConfig = getLevelConfig(level);
    this.prescription = generatePrescription(this.levelConfig);
    this.herbs = getRandomHerbs(this.levelConfig.herbCount + (this.levelConfig.hasSimilarHerbs ? 2 : 0), this.levelConfig.hasSimilarHerbs);
    this.currentWeight = 0;
    this.zeroOffset = 0;
    this.targetGrams = 0;
    this.currentHerb = null;
    this.weighed = new Set();
    this.results = [];
    this.packages = [];
    this.reviewQuestion = null;
    this.reviewSelected = null;
    this.reviewResult = null;
    this.timeLeft = this.levelConfig.timeLimit;
    this.timeUsed = 0;
    this.lastTick = performance.now();
    this.drawerOpen = new Set();
    this.draggingHerb = null;
    this.phase = 'playing';
  }

  tick(now: number): void {
    if (this.phase !== 'playing' && this.phase !== 'weighing') return;
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.timeUsed += dt;

    if (this.timeLeft !== null) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.handleTimeout();
      }
    }

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flashingDrawer = null;
    }

    if (this.stockBlockTime > 0) {
      this.stockBlockTime -= dt;
      if (this.stockBlockTime <= 0) this.stockBlockMsg = null;
    }
  }

  selectDrawer(herb: string): boolean {
    if (!this.prescription) return false;
    const needed = this.prescription.items.find(i => i.herb === herb && !this.weighed.has(i.herb));
    if (!needed) {
      this.flashingDrawer = herb;
      this.flashTime = 0.5;
      return false;
    }
    if (!canDispense(this.inventory, herb, needed.grams)) {
      this.flashingDrawer = herb;
      this.flashTime = 0.5;
      this.stockBlockMsg = `${herb} 账上只剩 ${getStock(this.inventory, herb)}g，不够抓 ${needed.grams}g，请先到账本补货`;
      this.stockBlockTime = 2.5;
      return false;
    }
    this.drawerOpen.add(herb);
    this.currentHerb = herb;
    this.targetGrams = needed.grams;
    this.currentWeight = 0;
    this.phase = 'weighing';
    return true;
  }

  setWeight(w: number): void {
    this.currentWeight = Math.max(0, w);
  }

  addWeight(delta: number): void {
    this.currentWeight = Math.max(0, parseFloat((this.currentWeight + delta).toFixed(1)));
  }

  tare(): void {
    this.zeroOffset = this.currentWeight;
  }

  confirmWeight(): WeighResult | null {
    if (!this.currentHerb || !this.prescription) return null;
    const result = judgeWeight(this.currentWeight, this.targetGrams, this.levelConfig.tolerance);
    result.herb = this.currentHerb;

    const status = getWeightStatus(result, this.levelConfig.tolerance);

    // 称合格了但账上不够扣：拦住不让抓，药还在秤上，可以减了再称
    if (status !== 'fail' && !canDispense(this.inventory, this.currentHerb, this.currentWeight)) {
      this.stockBlockMsg = `${this.currentHerb} 账上只剩 ${getStock(this.inventory, this.currentHerb)}g，称不了 ${this.currentWeight}g，请减药或先到账本补货`;
      this.stockBlockTime = 2.5;
      return null;
    }

    this.results.push(result);
    const timeLimit = this.levelConfig.timeLimit;
    const breakdown = scoreRound(result, this.levelConfig.tolerance, this.state.combo, this.timeUsed, timeLimit);

    if (status === 'fail') {
      this.state.combo = 0;
    } else {
      this.state.combo++;
      this.state.score += breakdown.total;
      this.weighed.add(this.currentHerb);
      const item = this.prescription.items.find(i => i.herb === this.currentHerb);
      if (item) {
        this.packages.push({ herb: item.herb, grams: this.currentWeight, decoct: item.decoct });
      }
      const deducted = dispense(this.inventory, this.currentHerb, this.currentWeight, todayString(), Date.now());
      if (deducted.ok) saveInventory(this.inventory);
    }

    this.drawerOpen.delete(this.currentHerb);
    this.currentHerb = null;
    this.currentWeight = 0;
    this.zeroOffset = 0;

    if (this.weighed.size >= this.prescription.items.length) {
      this.startReview();
    } else {
      this.phase = 'playing';
    }

    return result;
  }

  startReview(): void {
    if (!this.prescription) return;
    this.reviewQuestion = generateReviewQuestion(this.prescription);
    this.reviewSelected = null;
    this.reviewResult = null;
    this.phase = 'review';
  }

  answerReview(answer: number): boolean {
    if (!this.reviewQuestion || this.reviewSelected !== null) return false;
    this.reviewSelected = answer;
    const correct = answer === this.reviewQuestion.correct;
    this.reviewResult = correct;
    if (!correct) {
      this.state.satisfaction -= 10;
      this.state.combo = 0;
    } else {
      this.state.satisfaction = Math.min(100, this.state.satisfaction + 5);
    }
    setTimeout(() => this.finishLevel(), 1500);
    return correct;
  }

  finishLevel(): void {
    const passed = this.results.every(r => r.ok) && this.state.satisfaction > 0;
    if (passed) {
      this.state.queue = Math.min(10, this.state.queue + 1);
    } else {
      this.state.queue--;
      this.state.satisfaction = Math.max(0, this.state.satisfaction - 20);
    }

    if (this.state.queue <= 0 || this.state.satisfaction <= 0) {
      this.phase = 'gameover';
    } else {
      this.phase = 'result';
    }
  }

  nextLevel(): void {
    this.startLevel(this.state.level + 1, this.endless);
  }

  retryLevel(): void {
    this.startLevel(this.state.level, this.endless);
  }

  handleTimeout(): void {
    this.state.queue--;
    this.state.satisfaction -= 15;
    this.state.combo = 0;
    if (this.state.queue <= 0 || this.state.satisfaction <= 0) {
      this.phase = 'gameover';
    } else {
      this.startLevel(this.state.level, this.endless);
    }
  }

  getTimeLeft(): number | null {
    return this.timeLeft;
  }

  isDrawerOpen(herb: string): boolean {
    return this.drawerOpen.has(herb);
  }

  openLedger(): void {
    if (this.phase === 'ledger') return;
    this.ledgerReturnPhase = this.phase;
    this.ledgerSelectedEntry = null;
    this.phase = 'ledger';
  }

  closeLedger(): void {
    if (this.phase !== 'ledger') return;
    this.phase = this.ledgerReturnPhase;
    this.ledgerSelectedEntry = null;
    // 账本停留期间不计入关卡用时
    this.lastTick = performance.now();
  }

  /** 补货：补到目标量，记一笔带日期的补进流水 */
  restockHerb(herb: string): boolean {
    const amount = round1(RESTOCK_TARGET - getStock(this.inventory, herb));
    if (amount <= 0) return false;
    const entry = restock(this.inventory, herb, amount, todayString(), Date.now());
    if (!entry) return false;
    saveInventory(this.inventory);
    return true;
  }

  selectLedgerEntry(entryId: string): void {
    this.ledgerSelectedEntry = this.ledgerSelectedEntry === entryId ? null : entryId;
  }

  /** 改账：对选中的流水微调数量，改前改后与时间都会留痕 */
  adjustSelectedEntry(delta: number): void {
    if (!this.ledgerSelectedEntry) return;
    const entry = this.inventory.entries.find(e => e.id === this.ledgerSelectedEntry);
    if (!entry) return;
    const after = round1(entry.amount + delta);
    if (after <= 0) return;
    const correction = correctEntry(this.inventory, entry.id, after, Date.now(), '手工改账');
    if (correction) saveInventory(this.inventory);
  }
}
