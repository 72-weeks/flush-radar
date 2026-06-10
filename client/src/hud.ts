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

  setPing(ms: number): void {
    el('ping').textContent = `${Math.round(ms)} ms`;
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
