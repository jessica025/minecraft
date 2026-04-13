'use strict';

const game = new Game();
game.init();
document.getElementById('hud').style.display = 'block';

document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('overlay').style.display = 'none';
  document.getElementById('canvas').requestPointerLock();
  game.started = true;
});
