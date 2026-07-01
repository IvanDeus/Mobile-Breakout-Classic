import { Injectable } from '@angular/core';

const STORAGE_KEY_HI_SCORE = 'breakout_hi_score';
const STORAGE_KEY_LAST_LEVEL = 'breakout_last_level';

@Injectable({ providedIn: 'root' })
export class StorageService {

  getHiScore(): number {
    const val = localStorage.getItem(STORAGE_KEY_HI_SCORE);
    return val ? parseInt(val, 10) : 0;
  }

  setHiScore(score: number): void {
    localStorage.setItem(STORAGE_KEY_HI_SCORE, score.toString());
  }

  updateHiScore(score: number): boolean {
    const current = this.getHiScore();
    if (score > current) {
      this.setHiScore(score);
      return true;
    }
    return false;
  }

  getLastLevel(): number {
    const val = localStorage.getItem(STORAGE_KEY_LAST_LEVEL);
    return val ? parseInt(val, 10) : 1;
  }

  setLastLevel(level: number): void {
    localStorage.setItem(STORAGE_KEY_LAST_LEVEL, level.toString());
  }
}
