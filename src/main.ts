import { GameManager } from './gamemanager.ts';
import './style.css';

window.onload = () => {
  const game = new GameManager();
  game.start();

  const aiBtn = document.getElementById('aiSuggestBtn');
  aiBtn?.addEventListener('click', () => game.suggestAI());
};
