import { GameManager } from './gamemanager.ts';
import './style.css';

window.onload = () => {
  const game = new GameManager();
  game.start();
};
