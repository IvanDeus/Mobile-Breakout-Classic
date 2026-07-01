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
const CANVAS_W = 360;
const CANVAS_H = 600;

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

@Component({
  selector: 'app-game',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './game.html',
  styleUrl: './game.css'
})
export class GameComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  // Reactive signals for template binding
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

  // Game objects
  private paddle: Paddle = { x: CANVAS_W / 2 - BASE_PADDLE_W / 2, y: 570, w: BASE_PADDLE_W, h: 10, prevX: CANVAS_W / 2 - BASE_PADDLE_W / 2, vx: 0 };
  private ball: Ball = { x: CANVAS_W / 2, y: CANVAS_H / 2, r: 7, vx: BASE_BALL_SPEED, vy: -BASE_BALL_SPEED };
  private bricks: Brick[] = [];

  // Bonus timers
  private speedBonusTimer: any = null;
  private paddleBonusTimer: any = null;
  private speedBonusExpiry = 0;
  private paddleBonusExpiry = 0;

  // Level transition
  private showingLevelTransition = false;
  private levelTransitionAlpha = 0;
  private levelFadeInterval: any = null;

  // Touch / pointer tracking
  private canvasRect: DOMRect | null = null;

  // DPR for crisp rendering
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

  // ── Canvas sizing ──
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

  // ── Menu screen ──
  drawMenu(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    grad.addColorStop(0, '#0f0c29');
    grad.addColorStop(0.5, '#302b63');
    grad.addColorStop(1, '#24243e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Decorative bricks on menu
    this.drawMenuBricks(ctx);

    // Title
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

    // Hi Score & Last Level
    ctx.font = '15px "Inter", sans-serif';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`🏆 Hi Score: ${this.hiScore()}`, CANVAS_W / 2, 260);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`📊 Last Level: ${this.lastLevel()} / ${this.totalLevels}`, CANVAS_W / 2, 288);

    // Start button
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

    // Controls hint
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

  // ── Start game ──
  startGame(): void {
    this.score.set(0);
    this.level.set(1);
    this.gameOver.set(false);
    this.gameWon.set(false);
    this.isNewHiScore.set(false);
    this.gameState.set('playing');
    this.paddle = { x: CANVAS_W / 2 - BASE_PADDLE_W / 2, y: 570, w: BASE_PADDLE_W, h: 10, prevX: CANVAS_W / 2 - BASE_PADDLE_W / 2, vx: 0 };
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

  // ── Input handlers ──
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
    this.paddle.x = Math.max(0, Math.min(CANVAS_W - this.paddle.w, mx - this.paddle.w / 2));
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
    this.paddle.x = Math.max(0, Math.min(CANVAS_W - this.paddle.w, mx - this.paddle.w / 2));
  }

  @HostListener('document:keydown')
  onKeyDown(): void {
    const state = this.gameState();
    if (state === 'gameover' || state === 'won' || state === 'menu') {
      this.startGame();
    }
  }

  // ── Brick creation ──
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

  // ── Bonus application ──
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
      this.paddle.w = Math.min(this.paddle.w * 1.5, MAX_PADDLE_W);
      if (this.paddle.x + this.paddle.w > CANVAS_W) this.paddle.x = CANVAS_W - this.paddle.w;
      this.audio.playSound(500);
      clearTimeout(this.paddleBonusTimer);
      this.paddleBonusExpiry = Date.now() + BONUS_DURATION_MS;
      this.paddleBonusTimer = setTimeout(() => {
        this.paddle.w = BASE_PADDLE_W;
        if (this.paddle.x + this.paddle.w > CANVAS_W) this.paddle.x = CANVAS_W - this.paddle.w;
        this.paddleBonusExpiry = 0;
      }, BONUS_DURATION_MS);
    } else if (brick.bonus === 'score') {
      this.score.update(s => s + 100);
      this.audio.playSound(600);
    }
  }

  // ── Update logic ──
  private update(): void {
    if (this.gameOver() || this.gameWon()) return;

    this.paddle.vx = this.paddle.x - this.paddle.prevX;
    this.paddle.prevX = this.paddle.x;

    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    // Wall collisions
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
      this.ball.vx += this.paddle.vx * momentumFactor;
      const maxVx = MAX_BALL_SPEED * 0.75;
      this.ball.vx = Math.max(-maxVx, Math.min(maxVx, this.ball.vx));
      const minVy = 2.5;
      if (Math.abs(this.ball.vy) < minVy) {
        this.ball.vy = (Math.sign(this.ball.vy) || -1) * minVy;
      }
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

    // Level complete
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

    // Ball fell
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

  // ── Drawing ──
  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
    grad.addColorStop(0, '#0f0c29');
    grad.addColorStop(0.5, '#302b63');
    grad.addColorStop(1, '#24243e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // HUD - Score
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 15px "Inter", sans-serif';
    ctx.fillText('Score: ' + this.score(), 10, 24);

    // HUD - Hi Score
    ctx.fillStyle = '#fbbf24';
    ctx.font = '12px "Inter", sans-serif';
    ctx.fillText('🏆 ' + this.displayHiScore(), 10, 42);

    // HUD - Level
    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px "Inter", sans-serif';
    ctx.fillText('Level ' + this.level() + ' / ' + this.totalLevels, CANVAS_W / 2, 24);
    ctx.textAlign = 'left';

    // Bonus timers
    this.drawBonusTimers();

    // Paddle with gradient
    const pg = ctx.createLinearGradient(this.paddle.x, this.paddle.y, this.paddle.x + this.paddle.w, this.paddle.y);
    pg.addColorStop(0, '#7c3aed');
    pg.addColorStop(1, '#a78bfa');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.roundRect(this.paddle.x, this.paddle.y, this.paddle.w, this.paddle.h, 5);
    ctx.fill();

    // Ball with glow
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Bricks
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

        // Subtle top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(b.x + 2, b.y + 1, b.w - 4, 2);
      }
    });

    // Overlays
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

  // ── Level transition ──
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

  // ── Game loop ──
  private loop = (): void => {
    this.update();
    this.draw();
    this.drawLevelTransition();
    if (!this.gameOver() && !this.gameWon()) {
      this.animFrameId = requestAnimationFrame(this.loop);
    } else {
      // Final frame is already drawn with overlay
      this.ngZone.run(() => {}); // trigger CD for template
    }
  };
}
