import { ApothecaryGame } from './game';
import { loadSave, saveSave } from './storage';
import { saveLedger } from './ledger/storage';

const game = new ApothecaryGame('game-canvas');
game.start();

window.addEventListener('beforeunload', () => {
  saveLedger(game.game.ledger);
  const save = loadSave();
  const currentScore = (game.game?.state?.score) ?? 0;
  const currentLevel = (game.game?.state?.level) ?? 0;
  saveSave({
    highestScore: Math.max(save.highestScore, currentScore),
    highestLevel: Math.max(save.highestLevel, currentLevel),
    lastPlayed: Date.now(),
  });
});
