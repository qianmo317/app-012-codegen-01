import type { GameState, GamePhase, Prescription, WeighResult, LevelConfig } from '../types';
import { getLevelConfig } from '../levels';
import { generatePrescription, generateReviewQuestion } from '../prescription';
import { judgeWeight, getWeightStatus } from '../weighing';
import { scoreRound } from '../scoring';
import { getRandomHerbs } from '../herbs';
import type { HerbMeta } from '../types';
import { InventoryLedger, LedgerError } from '../ledger/inventory';

export class GameManager {
  state: GameState = {
    level: 1,
    score: 0,
    combo: 0,
    queue: 3,
    satisfaction: 100,
    expired: false,
  };

  /** 药柜台账：库存、出入账、补货、改账留痕都在这本账上 */
  ledger: InventoryLedger;
  /** 台账发生变动后的持久化回调（由入口层注入） */
  onLedgerChange: (() => void) | null = null;
  /** 库存不足被拦住时的提示文字（canvas 上短暂显示） */
  blockedReason: string | null = null;
  private blockedUntil = 0;

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

  constructor(ledger?: InventoryLedger) {
    this.ledger = ledger ?? new InventoryLedger();
  }

  /** 台账库存不足提示是否还在显示窗口内 */
  isBlockedActive(now: number = performance.now()): boolean {
    return this.blockedReason !== null && now < this.blockedUntil;
  }

  private block(message: string): void {
    this.blockedReason = message;
    this.blockedUntil = performance.now() + 2600;
  }

  /** 本次抓药需要用到的药味全部在台账上立户（已立的不受影响） */
  private ensureLedgerHerbs(): void {
    const names = new Set<string>(this.herbs.map(h => h.name));
    this.prescription?.items.forEach(i => names.add(i.herb));
    names.forEach(name => this.ledger.ensureHerb(name));
  }

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
    this.blockedReason = null;
    this.ensureLedgerHerbs();
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

    if (this.blockedReason !== null && performance.now() >= this.blockedUntil) {
      this.blockedReason = null;
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
    // 账上不够的先拦住，抽屉不让开
    if (!this.ledger.canDispense(herb, needed.grams)) {
      const short = this.ledger.shortage(herb, needed.grams);
      const onHand = this.ledger.getStock(herb)?.onHand ?? 0;
      this.block(`「${herb}」账上只剩 ${onHand}g，不够抓 ${needed.grams}g（缺 ${short}g），请先补货`);
      this.flashingDrawer = herb;
      this.flashTime = 0.8;
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

  confirmWeight(): (WeighResult & { blocked?: boolean }) | null {
    if (!this.currentHerb || !this.prescription) return null;
    const result = judgeWeight(this.currentWeight, this.targetGrams, this.levelConfig.tolerance);
    result.herb = this.currentHerb;

    const status = getWeightStatus(result, this.levelConfig.tolerance);
    const timeLimit = this.levelConfig.timeLimit;
    const breakdown = scoreRound(result, this.levelConfig.tolerance, this.state.combo, this.timeUsed, timeLimit);

    if (status === 'fail') {
      // 称重本身不合格，药不算抓走，账也不动
      this.results.push(result);
      this.state.combo = 0;
    } else {
      // 抓完一味就从账上扣一味（按实际秤上的克数）；账上不够先拦住
      const herb = this.currentHerb;
      const grams = this.currentWeight;
      try {
        this.ledger.dispense(herb, grams, this.prescription.id, `第${this.state.level}关抓药`);
        this.onLedgerChange?.();
      } catch (e) {
        if (e instanceof LedgerError && e.code === 'INSUFFICIENT_STOCK') {
          this.block(e.message);
          // 停在称重界面让伙计补货后再来，不计成绩、不分包、不扣秤
          return { ...result, blocked: true };
        }
        throw e;
      }
      this.results.push(result);
      this.state.combo++;
      this.state.score += breakdown.total;
      this.weighed.add(herb);
      const item = this.prescription.items.find(i => i.herb === herb);
      if (item) {
        this.packages.push({ herb: item.herb, grams, decoct: item.decoct });
      }
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
}
