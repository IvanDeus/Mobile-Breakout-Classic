// game.ts
import {
  Component, ElementRef, ViewChild, AfterViewInit, OnDestroy,
  HostListener, NgZone, ChangeDetectionStrategy, signal, computed
} from '@angular/core';
import { AudioService } from '../services/audio.service';
import { StorageService } from '../services/storage.service';
import { LevelService } from '../services/level.service';

interface Brick {
  x: number; y: number; w: number; h: number;
  hit: boolean; bonus: 'speed' | 'paddle' | 'score' | null;
}

interface Paddle {
  x: number; y: number; w: number; h: number;
  prevX: number; vx: number;
}

interface Ball {
  x: number; y: number; r: number;
  vx: number; vy: number;
}

// Canvas sizing constants – fixed 360×600 portrait mobile
const CANVAS_W = 358;
const CANVAS_H = 640;

// Brick constants – 7 columns fitting 360 px width
const BRICK_COLS = 7;
const BRICK_W = 40;
const BRICK_H = 16;
const BRICK_PADDING = 6;
const BRICK_OFFSET_TOP = 60;
const BRICK_OFFSET_LEFT = (CANVAS_W - BRICK_COLS * (BRICK_W + BRICK_PADDING) + BRICK_PADDING) / 2;

// Gameplay constants
const BASE_PADDLE_W = 70;
const BASE_BALL_SPEED = 3.5;
const MAX_BALL_SPEED = 8;
const MAX_PADDLE_W = 150;
const BONUS_DURATION_MS = 5000;

// Smoothing constants
const PADDLE_LERP = 0.28;        // 0–1: higher = snappier, lower = smoother
const MAX_PADDLE_PX_PER_FRAME = 18; // hard cap on paddle travel per frame
const MAX_PADDLE_INFLUENCE = 1.8;   // max velocity the paddle can impart to the ball

@Component({
  selector: 'app-game',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game.html',
  styleUrl: './game.css'
})
export class GameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly score = signal(0);
  readonly level = signal(1);
  readonly hiScore = signal(0);
  readonly lastLevel = signal(1);
  readonly gameOver = signal(false);
  readonly gameWon = signal(false);
  readonly gameState = signal<'menu' | 'playing' | 'gameover' | 'won'>('menu');
  readonly totalLevels: number;
  readonly isNewHiScore = signal(false);

  readonly displayHiScore = computed(() => Math.max(this.hiScore(), this.score()));

  private ctx!: CanvasRenderingContext2D;
  private animFrameId = 0;

  private paddle: Paddle = { x: CANVAS_W / 2 - BASE_PADDLE_W / 2, y: 570, w: BASE_PADDLE_W, h: 10, prevX: CANVAS_W / 2 - BASE_PADDLE_W / 2, vx: 0 };
  private ball: Ball = { x: CANVAS_W / 2, y: CANVAS_H / 2, r: 7, vx: BASE_BALL_SPEED, vy: -BASE_BALL_SPEED };
  private bricks: Brick[] = [];

  // Where the paddle is trying to go (set by input, approached smoothly in update())
  private paddleTargetX = CANVAS_W / 2 - BASE_PADDLE_W / 2;

  private speedBonusTimer: any = null;
  private paddleBonusTimer: any = null;
  private speedBonusExpiry = 0;
  private paddleBonusExpiry = 0;

  private showingLevelTransition = false;
  private levelTransitionAlpha = 0;
  private levelFadeInterval: any = null;

  private canvasRect: DOMRect | null = null;
  private dpr = 1;

  constructor(
    private audio: AudioService,
    private storage: StorageService,
    private levelService: LevelService,
    private ngZone: NgZone
  ) {
    this.totalLevels = this.levelService.TOTAL_LEVELS;
    this.hiScore.set(this.storage.getHiScore());
    this.lastLevel.set(this.storage.getLastLevel());
  }

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
    this.resizeCanvas();
    this.drawMenu();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animFrameId);
    clearTimeout(this.speedBonusTimer);
    clearTimeout(this.paddleBonusTimer);
    clearInterval(this.levelFadeInterval);
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = CANVAS_W * this.dpr;
    canvas.height = CANVAS_H * this.dpr;
    canvas.style.width = CANVAS_W + 'px';
    canvas.style.height = CANVAS_H + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.canvasRect = canvas.getBoundingClientRect();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.canvasRect = this.canvasRef.nativeElement.getBoundingClientRect();
  }

  drawMenu(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    grad.addColorStop(0, '#0f0c29');
    grad.addColorStop(0.5, '#302b63');
    grad.addColorStop(1, '#24243e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this.drawMenuBricks(ctx);

    ctx.textAlign = 'center';
    ctx.shadowColor = '#a78bfa';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Inter", sans-serif';
    ctx.fillText('BREAKOUT', CANVAS_W / 2, 170);
    ctx.shadowBlur = 0;
    ctx.font = '16px "Inter", sans-serif';
    ctx.fillStyle = '#a78bfa';
    ctx.fillText('CLASSIC', CANVAS_W / 2, 196);

    ctx.font = '15px "Inter", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`🏆 Hi Score: ${this.hiScore()}`, CANVAS_W / 2, 260);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`📊 Last Level: ${this.lastLevel()} / ${this.totalLevels}`, CANVAS_W / 2, 288);

    const bw = 200, bh = 50;
    const bx = CANVAS_W / 2 - bw / 2, by = 330;
    const btnGrad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    btnGrad.addColorStop(0, '#7c3aed');
    btnGrad.addColorStop(1, '#a855f7');
    ctx.fillStyle = btnGrad;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 14);
    ctx.fill();
    ctx.shadowColor = '#7c3aed';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px "Inter", sans-serif';
    ctx.fillText('TAP TO PLAY', CANVAS_W / 2, 362);

    ctx.fillStyle = '#64748b';
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillText('Touch to control paddle', CANVAS_W / 2, 420);
    ctx.fillText('Break bricks • Collect bonuses', CANVAS_W / 2, 440);
    ctx.fillText('Beat 10 levels', CANVAS_W / 2, 460);
    ctx.textAlign = 'left';
  }

  private drawMenuBricks(ctx: CanvasRenderingContext2D): void {
    const colors = ['#22c55e', '#f97316', '#3b82f6', '#d946ef', '#fbbf24'];
    for (let i = 0; i < 6; i++) {
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = colors[i % colors.length];
      const bx = 30 + i * 55;
      ctx.beginPath();
      ctx.roundRect(bx, 80, 40, 16, 4);
      ctx.fill();
      ctx.roundRect(bx + 10, 530, 40, 16, 4);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  startGame(): void {
    // 🟢 Load the last saved level from local storage (defaults to 1 if none)
    const savedLevel = this.storage.getLastLevel();
    let startLevel = savedLevel > 0 ? savedLevel : 1;

    // 🟢 If the player just beat the game, start a fresh run from level 1
    if (this.gameState() === 'won' || startLevel > this.totalLevels) {
      startLevel = 1;
      this.storage.setLastLevel(1);
      this.lastLevel.set(1);
    }

    this.score.set(0);
    this.level.set(startLevel); 
    this.gameOver.set(false);
    this.gameWon.set(false);
    this.isNewHiScore.set(false);
    this.gameState.set('playing');
    this.paddle = { x: CANVAS_W / 2 - BASE_PADDLE_W / 2, y: 570, w: BASE_PADDLE_W, h: 10, prevX: CANVAS_W / 2 - BASE_PADDLE_W / 2, vx: 0 };
    this.paddleTargetX = this.paddle.x;
    this.ball = { x: CANVAS_W / 2, y: CANVAS_H / 2, r: 7, vx: BASE_BALL_SPEED, vy: -BASE_BALL_SPEED };
    clearTimeout(this.speedBonusTimer);
    clearTimeout(this.paddleBonusTimer);
    this.speedBonusExpiry = 0;
    this.paddleBonusExpiry = 0;
    this.createBricks();
    this.showLevelTransition();

    this.ngZone.runOutsideAngular(() => {
      this.loop();
    });
  }

  onCanvasClick(): void {
    const state = this.gameState();
    if (state === 'menu' || state === 'gameover' || state === 'won') {
      this.startGame();
    }
  }

  onMouseMove(event: MouseEvent): void {
    if (this.gameState() !== 'playing') return;
    if (!this.canvasRect) this.canvasRect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = CANVAS_W / this.canvasRect.width;
    const mx = (event.clientX - this.canvasRect.left) * scaleX;
    this.setPaddleTarget(mx - this.paddle.w / 2);
  }

  onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    const state = this.gameState();
    if (state === 'menu' || state === 'gameover' || state === 'won') {
      this.startGame();
      return;
    }
    this.handleTouch(event);
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    if (this.gameState() !== 'playing') return;
    this.handleTouch(event);
  }

  onTouchEnd(event: TouchEvent): void {
    event.preventDefault();
  }

  private handleTouch(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    if (!this.canvasRect) this.canvasRect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = CANVAS_W / this.canvasRect.width;
    const mx = (touch.clientX - this.canvasRect.left) * scaleX;
    this.setPaddleTarget(mx - this.paddle.w / 2);
  }

  /** Clamp and store the desired paddle left-edge position. */
  private setPaddleTarget(rawX: number): void {
    this.paddleTargetX = Math.max(0, Math.min(CANVAS_W - this.paddle.w, rawX));
  }

  @HostListener('document:keydown')
  onKeyDown(): void {
    const state = this.gameState();
    if (state === 'gameover' || state === 'won' || state === 'menu') {
      this.startGame();
    }
  }

  private createBricks(): void {
    this.bricks = [];
    const layout = this.levelService.getLevelLayout(this.level());
    const bonusChance = 0.15 + this.level() * 0.01;
    layout.forEach(({ r, c }) => {
      const hasBonus = Math.random() < bonusChance;
      this.bricks.push({
        x: BRICK_OFFSET_LEFT + c * (BRICK_W + BRICK_PADDING),
        y: BRICK_OFFSET_TOP + r * (BRICK_H + BRICK_PADDING),
        w: BRICK_W, h: BRICK_H, hit: false,
        bonus: hasBonus ? this.randomBonus() : null
      });
    });
  }

  private randomBonus(): 'speed' | 'paddle' | 'score' {
    const r = Math.random();
    if (r < 0.33) return 'speed';
    if (r < 0.66) return 'paddle';
    return 'score';
  }

  private applyBonus(brick: Brick): void {
    if (!brick.bonus) return;
    if (brick.bonus === 'speed') {
      const newVx = this.ball.vx * 1.5, newVy = this.ball.vy * 1.5;
      if (Math.abs(newVx) <= MAX_BALL_SPEED) { this.ball.vx = newVx; this.ball.vy = newVy; }
      this.audio.playSound(400);
      clearTimeout(this.speedBonusTimer);
      this.speedBonusExpiry = Date.now() + BONUS_DURATION_MS;
      this.speedBonusTimer = setTimeout(() => {
        const dir = Math.sign(this.ball.vx) || 1, dirY = Math.sign(this.ball.vy) || -1;
        const lvlSpeed = BASE_BALL_SPEED + (this.level() - 1) * 0.3;
        this.ball.vx = dir * lvlSpeed; this.ball.vy = dirY * lvlSpeed;
        this.speedBonusExpiry = 0;
      }, BONUS_DURATION_MS);
    } else if (brick.bonus === 'paddle') {
      // Keep the paddle centered on its current position when width changes
      const oldCenter = this.paddle.x + this.paddle.w / 2;
      this.paddle.w = Math.min(this.paddle.w * 1.5, MAX_PADDLE_W);
      const newLeft = Math.max(0, Math.min(CANVAS_W - this.paddle.w, oldCenter - this.paddle.w / 2));
      this.paddle.x = newLeft;
      this.paddleTargetX = newLeft;
      this.audio.playSound(500);
      clearTimeout(this.paddleBonusTimer);
      this.paddleBonusExpiry = Date.now() + BONUS_DURATION_MS;
      this.paddleBonusTimer = setTimeout(() => {
        const oldC = this.paddle.x + this.paddle.w / 2;
        this.paddle.w = BASE_PADDLE_W;
        const resetLeft = Math.max(0, Math.min(CANVAS_W - this.paddle.w, oldC - this.paddle.w / 2));
        this.paddle.x = resetLeft;
        this.paddleTargetX = resetLeft;
        this.paddleBonusExpiry = 0;
      }, BONUS_DURATION_MS);
    } else if (brick.bonus === 'score') {
      this.score.update(s => s + 100);
      this.audio.playSound(600);
    }
  }

  private update(): void {
    if (this.gameOver() || this.gameWon()) return;

    // ── Smooth paddle motion toward target ──
    const diff = this.paddleTargetX - this.paddle.x;
    if (Math.abs(diff) > 0.5) {
      // Lerp + per-frame speed cap: gives easing feel without teleporting
      const lerpStep = diff * PADDLE_LERP;
      const capped = Math.sign(lerpStep) * Math.min(Math.abs(lerpStep), MAX_PADDLE_PX_PER_FRAME);
      this.paddle.x += capped;
    } else {
      this.paddle.x = this.paddleTargetX;
    }
    // Safety clamp
    this.paddle.x = Math.max(0, Math.min(CANVAS_W - this.paddle.w, this.paddle.x));

    // Velocity is now derived from the *smoothed* motion, so it stays small
    this.paddle.vx = this.paddle.x - this.paddle.prevX;
    this.paddle.prevX = this.paddle.x;

    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    if (this.ball.x + this.ball.r > CANVAS_W || this.ball.x - this.ball.r < 0) this.ball.vx *= -1;
    if (this.ball.y - this.ball.r < 0) this.ball.vy *= -1;

    // Paddle collision
    if (
      this.ball.vy > 0 &&
      this.ball.y + this.ball.r > this.paddle.y &&
      this.ball.y + this.ball.r < this.paddle.y + this.paddle.h + 4 &&
      this.ball.x > this.paddle.x &&
      this.ball.x < this.paddle.x + this.paddle.w
    ) {
      this.ball.vy *= -1;
      this.ball.y = this.paddle.y - this.ball.r;

      const momentumFactor = 0.25;
      const rawInfluence = this.paddle.vx * momentumFactor;
      const clampedInfluence = Math.max(-MAX_PADDLE_INFLUENCE, Math.min(MAX_PADDLE_INFLUENCE, rawInfluence));
      this.ball.vx += clampedInfluence;

      // 🟢 Normalize the velocity vector to prevent infinite acceleration
      const baseSpeed = BASE_BALL_SPEED + (this.level() - 1) * 0.3;
      let targetSpeed = this.speedBonusExpiry > Date.now() ? baseSpeed * 1.5 : baseSpeed;
      targetSpeed = Math.min(targetSpeed, MAX_BALL_SPEED);

      const mag = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
      if (mag > 0) {
        this.ball.vx = (this.ball.vx / mag) * targetSpeed;
        this.ball.vy = (this.ball.vy / mag) * targetSpeed;
      }

      // Prevent the ball from getting stuck in a purely horizontal loop
      const minVy = 2.5;
      if (Math.abs(this.ball.vy) < minVy) {
        this.ball.vy = (this.ball.vy >= 0 ? 1 : -1) * minVy;
        // Re-normalize after forcing minVy
        const newMag = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
        if (newMag > 0) {
          this.ball.vx = (this.ball.vx / newMag) * targetSpeed;
          this.ball.vy = (this.ball.vy / newMag) * targetSpeed;
        }
      }

      // Absolute safety net to ensure ball always moves away from paddle
      if (this.ball.vy > 0) this.ball.vy *= -1;

      this.audio.playSound(300);
    }

    // Brick collision
    for (let i = 0; i < this.bricks.length; i++) {
      const b = this.bricks[i];
      if (!b.hit && this.ball.x > b.x && this.ball.x < b.x + b.w && this.ball.y - this.ball.r < b.y + b.h && this.ball.y + this.ball.r > b.y) {
        b.hit = true; this.ball.vy *= -1;
        this.score.update(s => s + 10);
        this.audio.playSound(200);
        this.applyBonus(b);
        break;
      }
    }

    if (this.bricks.every(b => b.hit)) {
      this.storage.setLastLevel(this.level());
      this.lastLevel.set(this.level());
      if (this.level() >= this.totalLevels) {
        this.gameWon.set(true);
        this.gameState.set('won');
        this.saveScore();
      } else {
        this.advanceLevel();
      }
    }

    if (this.ball.y - this.ball.r > CANVAS_H) {
      this.gameOver.set(true);
      this.gameState.set('gameover');
      this.saveScore();
    }
  }

  private saveScore(): void {
    const isNew = this.storage.updateHiScore(this.score());
    if (isNew) {
      this.hiScore.set(this.score());
      this.isNewHiScore.set(true);
    }
    this.storage.setLastLevel(this.level());
    this.lastLevel.set(this.level());
  }

  private advanceLevel(): void {
    this.level.update(l => l + 1);
    clearTimeout(this.speedBonusTimer);
    clearTimeout(this.paddleBonusTimer);
    this.speedBonusExpiry = 0;
    this.paddleBonusExpiry = 0;
    this.paddle.w = BASE_PADDLE_W;
    this.paddle.x = CANVAS_W / 2 - BASE_PADDLE_W / 2;
    this.paddle.prevX = this.paddle.x;
    this.paddle.vx = 0;
    this.paddleTargetX = this.paddle.x;
    this.ball.x = CANVAS_W / 2;
    this.ball.y = CANVAS_H / 2;
    const lvlSpeed = BASE_BALL_SPEED + (this.level() - 1) * 0.3;
    this.ball.vx = lvlSpeed;
    this.ball.vy = -lvlSpeed;
    this.createBricks();
    this.showLevelTransition();
    this.audio.playSound(700);
    this.storage.setLastLevel(this.level());
    this.lastLevel.set(this.level());
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    grad.addColorStop(0, '#0f0c29');
    grad.addColorStop(0.5, '#302b63');
    grad.addColorStop(1, '#24243e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.fillText('Score: ' + this.score(), 10, 24);

    ctx.fillStyle = '#fbbf24';
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillText('🏆 ' + this.displayHiScore(), 10, 42);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px "Inter", sans-serif';
    ctx.fillText('Level ' + this.level() + ' / ' + this.totalLevels, CANVAS_W / 2, 24);
    ctx.textAlign = 'left';

    this.drawBonusTimers();

    const pg = ctx.createLinearGradient(this.paddle.x, this.paddle.y, this.paddle.x + this.paddle.w, this.paddle.y);
    pg.addColorStop(0, '#7c3aed');
    pg.addColorStop(1, '#a78bfa');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(this.paddle.x, this.paddle.y, this.paddle.w, this.paddle.h, 5);
    ctx.fill();

    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.shadowBlur = 0;

    this.bricks.forEach(b => {
      if (!b.hit) {
        let color: string;
        switch (b.bonus) {
          case 'speed': color = '#f97316'; break;
          case 'paddle': color = '#3b82f6'; break;
          case 'score': color = '#d946ef'; break;
          default: color = '#22c55e';
        }
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(b.x, b.y, b.w, b.h, 4);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(b.x + 2, b.y + 1, b.w - 4, 2);
      }
    });

    if (this.gameOver()) this.drawOverlay('GAME OVER', `Score: ${this.score()}`, this.isNewHiScore() ? '🎉 NEW HI SCORE!' : 'Tap to restart');
    if (this.gameWon()) this.drawOverlay('🎉 YOU WIN!', `Final Score: ${this.score()}`, this.isNewHiScore() ? '🎉 NEW HI SCORE!' : 'Tap to play again');
  }

  private drawBonusTimers(): void {
    const ctx = this.ctx;
    const now = Date.now();
    let y = 16;
    const x = CANVAS_W - 10;
    ctx.textAlign = 'right';
    ctx.font = '11px "Inter", sans-serif';

    if (this.speedBonusExpiry > now) {
      const rem = ((this.speedBonusExpiry - now) / 1000).toFixed(1);
      const frac = (this.speedBonusExpiry - now) / BONUS_DURATION_MS;
      const bW = 60, bH = 4, bX = x - bW, bY = y + 4;
      ctx.fillStyle = 'rgba(249,115,22,0.2)';
      ctx.fillRect(bX, bY, bW, bH);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(bX, bY, bW * frac, bH);
      ctx.fillStyle = '#f97316';
      ctx.fillText('⚡ ' + rem + 's', x, y);
      y += 18;
    }
    if (this.paddleBonusExpiry > now) {
      const rem = ((this.paddleBonusExpiry - now) / 1000).toFixed(1);
      const frac = (this.paddleBonusExpiry - now) / BONUS_DURATION_MS;
      const bW = 60, bH = 4, bX = x - bW, bY = y + 4;
      ctx.fillStyle = 'rgba(59,130,246,0.2)';
      ctx.fillRect(bX, bY, bW, bH);
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(bX, bY, bW * frac, bH);
      ctx.fillStyle = '#3b82f6';
      ctx.fillText('🏓 ' + rem + 's', x, y);
    }
    ctx.textAlign = 'left';
  }

  private drawOverlay(title: string, subtitle: string, hint: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px "Inter", sans-serif';
    ctx.fillText(title, CANVAS_W / 2, CANVAS_H / 2 - 40);
    ctx.font = '18px "Inter", sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(subtitle, CANVAS_W / 2, CANVAS_H / 2 + 5);
    ctx.font = '13px "Inter", sans-serif';
    ctx.fillStyle = hint.includes('HI SCORE') ? '#fbbf24' : '#94a3b8';
    ctx.fillText(hint, CANVAS_W / 2, CANVAS_H / 2 + 40);
    ctx.textAlign = 'left';
  }

  private showLevelTransition(): void {
    this.showingLevelTransition = true;
    this.levelTransitionAlpha = 1.0;
    clearInterval(this.levelFadeInterval);
    this.levelFadeInterval = setInterval(() => {
      this.levelTransitionAlpha -= 0.02;
      if (this.levelTransitionAlpha <= 0) {
        this.levelTransitionAlpha = 0;
        this.showingLevelTransition = false;
        clearInterval(this.levelFadeInterval);
      }
    }, 30);
  }

  private drawLevelTransition(): void {
    if (!this.showingLevelTransition) return;
    const ctx = this.ctx;
    ctx.fillStyle = `rgba(0,0,0,${this.levelTransitionAlpha * 0.7})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.textAlign = 'center';
    ctx.globalAlpha = this.levelTransitionAlpha;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Inter", sans-serif';
    ctx.fillText('Level ' + this.level(), CANVAS_W / 2, CANVAS_H / 2);
    ctx.globalAlpha = 1.0;
    ctx.textAlign = 'left';
  }

  private loop = (): void => {
    this.update();
    this.draw();
    this.drawLevelTransition();
    if (!this.gameOver() && !this.gameWon()) {
      this.animFrameId = requestAnimationFrame(this.loop);
    } else {
      this.ngZone.run(() => {});
    }
  };
}
