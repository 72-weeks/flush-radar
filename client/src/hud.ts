// DOM HUD overlay.

import { TEAM_NAMES } from '../../shared/constants';

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export class Hud {
  private bannerTimer = 0;
  private subTimer = 0;
  private trickTimer = 0;

  show(): void {
    el('hud').classList.remove('hidden');
  }

  setArenaMode(arena: boolean): void {
    el('score-blue').classList.toggle('hidden', !arena);
    el('score-orange').classList.toggle('hidden', !arena);
  }

  setScore(score: [number, number]): void {
    el('score-blue').textContent = String(score[0]);
    el('score-orange').textContent = String(score[1]);
  }

  setClock(seconds: number): void {
    const s = Math.max(0, Math.ceil(seconds));
    el('clock').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  setSpeed(kmh: number): void {
    el('speed').textContent = String(Math.round(kmh));
  }

  setBoost(frac: number): void {
    el('boost-bar').style.width = `${Math.round(frac * 100)}%`;
  }

  setRacePos(text: string): void {
    const e = el('race-pos');
    e.classList.toggle('hidden', !text);
    e.textContent = text;
  }

  banner(text: string, ms = 2000, color = ''): void {
    const e = el('banner');
    e.textContent = text;
    e.style.color = color || '#fff';
    e.classList.remove('hidden');
    // restart pop animation
    e.style.animation = 'none';
    void e.offsetWidth;
    e.style.animation = '';
    clearTimeout(this.bannerTimer);
    if (ms > 0) this.bannerTimer = window.setTimeout(() => e.classList.add('hidden'), ms);
  }

  subBanner(text: string, ms = 2500): void {
    const e = el('sub-banner');
    e.textContent = text;
    e.classList.remove('hidden');
    clearTimeout(this.subTimer);
    if (ms > 0) this.subTimer = window.setTimeout(() => e.classList.add('hidden'), ms);
  }

  hideBanner(): void {
    el('banner').classList.add('hidden');
    el('sub-banner').classList.add('hidden');
  }

  trickPopup(text: string, ms = 1800): void {
    const e = el('trick-popup');
    e.innerHTML = text;
    e.classList.remove('hidden');
    e.style.animation = 'none';
    void e.offsetWidth;
    e.style.animation = '';
    clearTimeout(this.trickTimer);
    this.trickTimer = window.setTimeout(() => e.classList.add('hidden'), ms);
  }

  // ---- race minimap ----

  private mapCanvas: HTMLCanvasElement | null = null;
  private mapPath: { x: number; z: number }[] = [];
  private mapCps: { x: number; z: number; boost: boolean }[] = [];
  private mapRange = { halfW: 84, halfL: 480 };

  initMinimap(path: { x: number; z: number }[], cps: { x: number; z: number; boost: boolean }[], halfW: number, halfL: number): void {
    this.mapPath = path;
    this.mapCps = cps;
    this.mapRange = { halfW, halfL };
    const c = document.createElement('canvas');
    c.id = 'minimap';
    c.width = 130;
    c.height = 390;
    document.getElementById('hud')!.appendChild(c);
    this.mapCanvas = c;
  }

  updateMinimap(entities: { x: number; z: number; color: string; me: boolean }[]): void {
    const c = this.mapCanvas;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const { halfW, halfL } = this.mapRange;
    const px = (x: number) => ((x + halfW) / (2 * halfW)) * c.width;
    const pz = (z: number) => ((halfL - z) / (2 * halfL)) * c.height;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgba(8,16,32,0.55)';
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, 10);
    ctx.fill();
    // course
    ctx.strokeStyle = 'rgba(168,220,240,0.8)';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const [i, p] of this.mapPath.entries()) {
      if (i === 0) ctx.moveTo(px(p.x), pz(p.z));
      else ctx.lineTo(px(p.x), pz(p.z));
    }
    ctx.stroke();
    // checkpoints
    for (const cp of this.mapCps) {
      ctx.fillStyle = cp.boost ? '#ffb347' : '#6fe3ff';
      ctx.beginPath();
      ctx.arc(px(cp.x), pz(cp.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // entities (draw me last, bigger)
    for (const e of [...entities].sort((a, b) => Number(a.me) - Number(b.me))) {
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(px(e.x), pz(e.z), e.me ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (e.me) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  /** Fullscreen color flash that fades out. */
  flash(color: string): void {
    let e = document.getElementById('flash');
    if (!e) {
      e = document.createElement('div');
      e.id = 'flash';
      document.getElementById('hud')!.appendChild(e);
    }
    e.style.background = color;
    e.classList.remove('fading');
    void e.offsetWidth;
    e.classList.add('fading');
  }

  feed(text: string, color = '#fff'): void {
    const wrap = el('feed');
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.textContent = text;
    item.style.color = color;
    wrap.prepend(item);
    while (wrap.children.length > 5) wrap.removeChild(wrap.lastChild!);
    setTimeout(() => item.remove(), 6000);
  }

  setPing(ms: number, fps?: number): void {
    el('ping').textContent = fps ? `${fps} fps · ${Math.round(ms)} ms` : `${Math.round(ms)} ms`;
  }

  showLeaderboard(rows: { name: string; team: number; value: string; me: boolean; bot: boolean }[], title: string, visible: boolean): void {
    const board = el('leaderboard');
    board.classList.toggle('hidden', !visible);
    if (!visible) return;
    let html = `<h2>${title}</h2><table>`;
    for (const r of rows) {
      const teamTag = r.team >= 0 ? `<td class="t${r.team}">${TEAM_NAMES[r.team]}</td>` : '';
      html += `<tr class="${r.me ? 'me' : ''}"><td>${r.name}${r.bot ? ' 🤖' : ''}</td>${teamTag}<td style="text-align:right">${r.value}</td></tr>`;
    }
    board.innerHTML = html + '</table>';
  }
}
