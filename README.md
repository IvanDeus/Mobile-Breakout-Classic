# Mobile-Breakout-Classic
The classic Breakout-like arcade game built with Angular.

<p align="center">
  <img src="https://img.shields.io/badge/Angular-22-dd0031?logo=angular&logoColor=white" alt="Angular 22" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript&logoColor=white" alt="TypeScript 6" />
  <img src="https://img.shields.io/badge/Canvas-2D-f7df1e?logo=html5&logoColor=white" alt="HTML5 Canvas" />
  <img src="https://img.shields.io/badge/License-GPL--3.0-blue" alt="GPL-3.0" />
  <img src="https://img.shields.io/badge/Mobile-First-22c55e" alt="Mobile First" />
</p>

A polished, mobile-first **Breakout arcade game** built entirely with **Angular 22** and the **HTML5 Canvas API**. Break bricks, collect power-ups, and chase your hi-score across **10 hand-crafted levels** — all running silky-smooth at 60 fps right in your browser.

<p align="center">
  <em>Touch to control • Collect bonuses • Beat all 10 levels</em>
</p>

---

## ✨ Features

| Feature | Description |
| --- | --- |
| 🎮 **10 Unique Levels** | Hand-designed brick layouts — diamonds, chevrons, grids, crosses, and a full-board finale |
| ⚡ **Power-Up System** | Speed boost, paddle expansion, magnet and score bonuses with visible countdown timers |
| 🏆 **Persistent Hi-Score** | Local storage saves your best score and last-reached level between sessions |
| 📱 **Mobile-First Touch** | Smooth lerp-based paddle movement tuned for touch with `passive: false` event handling |
| 🔊 **Retro Sound FX** | Procedural square-wave audio via the Web Audio API — no asset files needed |
| 🖥️ **DPR-Aware Canvas** | Crisp rendering on Retina / HiDPI displays with automatic device-pixel-ratio scaling |
| ⏱️ **Frame-Rate Independent** | Delta-time game loop prevents speed-up/slow-down on irregular frame timing |
| 🎨 **Sleek Dark UI** | Deep purple gradient aesthetic with glow effects and Inter typography |

---

## 🕹️ Gameplay

```
┌───────────────────────────────────┐
│  Score: 120    Level 3 / 10   ⚡3s
│                                   
│  ██ ██ ██ ██ ██ ██ ██  ← bricks   
│     ██ ██ ██ ██ ██                
│        ██ ██ ██                   
│                                   
│            ●  ← ball              
│                                   
│       ▬▬▬▬▬▬▬  ← paddle           
└───────────────────────────────────┘
```

**Controls:**
- **Mobile** — Touch and drag anywhere on the canvas to move the paddle
- **Desktop** — Move the mouse over the canvas; click or press any key to start

**Brick Colors:**
| Color | Meaning |
| --- | --- |
| 🟢 Green | Standard brick (+10 pts) |
| 🟠 Orange | ⚡ Speed boost (ball speeds up for 5s) |
| 🔵 Blue | 🏓 Paddle expand (wider paddle for 5s) |
| 🔮 Pink | 🧲 Paddle magnet (ball steers for 5s) |
| 🟣 Purple | 💎 Score bonus (+100 pts instantly) |

---

## 🏗️ Architecture

```
src/
├── index.html                   # Entry point with mobile-web-app meta tags
├── main.ts                      # Angular bootstrap
├── styles.css                   # Global dark-theme styles (Inter font)
└── app/
    ├── app.ts                   # Root component
    ├── app.html
    ├── app.css
    ├── app.config.ts            # App configuration
    ├── game/
    │   ├── game.ts              # Core game loop, physics, rendering (~670 LOC)
    │   ├── game.html            # Canvas wrapper template
    │   └── game.css             # Glassmorphism canvas styling
    └── services/
        ├── audio.service.ts     # Web Audio API procedural SFX
        ├── level.service.ts     # 10 level brick-layout definitions
        └── storage.service.ts   # localStorage hi-score & level persistence
```

The game runs a single `requestAnimationFrame` loop **outside Angular's zone** (`NgZone.runOutsideAngular`) for zero change-detection overhead during gameplay. UI state uses Angular **signals** for efficient reactivity only when the game state actually changes.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### Install & Run

```bash
# Clone the repository
git clone https://github.com/IvanDeus/Mobile-Breakout-Classic.git
cd Mobile-Breakout-Classic

# Install dependencies
npm install

# Start development server (port 7001)
npm start
```

Then open **http://localhost:7001** in your browser (or scan the network URL on your phone).

### Build for Production

```bash
npm run build
```

Optimized output lands in `dist/`.

---

### Run Nginx (Recommended for Production)

1. **Install Nginx:**
   ```bash
   sudo apt update
   sudo apt install nginx
   ```

2. **Copy build files:**
   ```bash
   sudo cp -r dist/Mobile-Breakout-Classic/browser/* /var/www/html/
   ```

3. **Configure Nginx** (`/etc/nginx/sites-available/default`):
   ```nginx
   server {
       listen 7001 default_server;
       root /var/www/html;
       index index.html;
       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

4. **Restart Nginx:**
   ```bash
   sudo systemctl restart nginx
   ```
   
## ⚙️ Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Angular 22 (standalone components, signals) |
| Language | TypeScript 6.0 |
| Rendering | HTML5 Canvas 2D |
| Audio | Web Audio API (procedural synthesis) |
| Styling | Vanilla CSS with CSS custom properties |
| Formatter | Prettier |

---

## 📄 License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

---

2026 [ ivan deus ]
