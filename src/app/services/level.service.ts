import { Injectable } from '@angular/core';

export interface BrickPosition {
  r: number;
  c: number;
}

@Injectable({ providedIn: 'root' })
export class LevelService {
  readonly TOTAL_LEVELS = 10;

  getLevelLayout(lvl: number): BrickPosition[] {
    const positions: BrickPosition[] = [];
    const maxR = 8, maxC = 7;

    switch (lvl) {
      case 1:
        for (let r = 0; r < 3; r++) for (let c = 0; c < maxC; c++) positions.push({ r, c });
        break;
      case 2:
        for (let r = 0; r < 5; r++) for (let c = 0; c < maxC; c++) if ((r + c) % 2 === 0) positions.push({ r, c });
        break;
      case 3: {
        const cx = 3, cy = 3;
        for (let r = 0; r < 7; r++) for (let c = 0; c < maxC; c++) if (Math.abs(r - cy) + Math.abs(c - cx) <= 3) positions.push({ r, c });
        break;
      }
      case 4:
        for (let r = 0; r < 5; r++) { const s = r, e = maxC - 1 - r; for (let c = s; c <= e; c++) positions.push({ r, c }); }
        break;
      case 5:
        for (let r = 0; r < 6; r++) for (let c = 0; c < maxC; c++) if (r === 0 || r === 5 || c === 0 || c === maxC - 1) positions.push({ r, c });
        break;
      case 6:
        for (let r = 0; r < 7; r++) for (let c = 0; c < maxC; c++) if ((c >= 2 && c <= 4) || (r >= 2 && r <= 4)) positions.push({ r, c });
        break;
      case 7:
        for (let r = 0; r < 5; r++) {
          const l = r, ri = maxC - 1 - r;
          positions.push({ r, c: l });
          if (l + 1 <= 3) positions.push({ r, c: l + 1 });
          if (ri !== l) { positions.push({ r, c: ri }); if (ri - 1 >= 4) positions.push({ r, c: ri - 1 }); }
        }
        break;
      case 8:
        for (let r = 0; r < 5; r++) for (let c = 0; c < maxC; c++) if (c < 3 || c > 3) positions.push({ r, c });
        break;
      case 9:
        for (let r = 0; r < 6; r++) { const o = (r % 2 === 0) ? 0 : 1; for (let c = o; c < o + 5 && c < maxC; c++) positions.push({ r, c }); }
        break;
      case 10:
        for (let r = 0; r < maxR; r++) for (let c = 0; c < maxC; c++) positions.push({ r, c });
        break;
      default:
        for (let r = 0; r < 5; r++) for (let c = 0; c < maxC; c++) positions.push({ r, c });
    }
    return positions;
  }
}
