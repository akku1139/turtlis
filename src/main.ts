import { GameManager } from './gamemanager';
import './style.css';

window.onload = () => {
  const game = new GameManager();
  game.start();
};
