// Entry point: menu wiring -> Game.

import { LEVELS, type LevelId } from '../../shared/constants';
import { Game } from './game';

const ICONS: Record<LevelId, string> = { arena: '🏒', race: '🏔️', pipe: '🛹' };

const menu = document.getElementById('menu')!;
const cards = document.getElementById('level-cards')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
const status = document.getElementById('conn-status')!;

let selected: LevelId = 'arena';

for (const level of LEVELS) {
  const card = document.createElement('div');
  card.className = 'level-card' + (level.id === selected ? ' selected' : '');
  card.innerHTML = `<div class="icon">${ICONS[level.id]}</div><h3>${level.name}</h3><p>${level.tagline}</p>`;
  card.onclick = () => {
    selected = level.id;
    for (const c of cards.children) c.classList.remove('selected');
    card.classList.add('selected');
  };
  cards.appendChild(card);
}

nameInput.value = localStorage.getItem('callsign') ?? '';

function play(): void {
  const name = (nameInput.value.trim() || 'PLAYER').toUpperCase();
  localStorage.setItem('callsign', name);
  status.textContent = 'connecting…';
  playBtn.disabled = true;

  const game = new Game(document.getElementById('game') as HTMLCanvasElement);
  game.onDisconnect = () => {
    status.textContent = 'connection lost — refresh to rejoin';
    menu.classList.remove('hidden');
    playBtn.disabled = false;
  };
  game.start(name, selected);
  menu.classList.add('hidden');
}

playBtn.onclick = play;
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') play();
});
