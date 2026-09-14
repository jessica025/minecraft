import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { Player } from "../src/game/player";
import type { VoxelWorld } from "../src/game/world";

class TestWorld {
  constructor(
    private readonly extraSolid: (
      x: number,
      y: number,
      z: number,
    ) => boolean = () => false,
  ) {}

  isSolid(x: number, y: number, z: number): boolean {
    return y <= 0 || this.extraSolid(x, y, z);
  }

  getSpawnPosition(): THREE.Vector3 {
    return new THREE.Vector3(0, 0.51, 0);
  }

  getBlock(): undefined {
    return undefined;
  }
}

function createPlayer(world = new TestWorld()): Player {
  const camera = new THREE.PerspectiveCamera();
  return new Player(camera, world as unknown as VoxelWorld);
}

function advance(player: Player, frames: number, delta = 1 / 60): void {
  for (let frame = 0; frame < frames; frame += 1) {
    player.update(delta, true);
  }
}

test("player moves forward and stays on the ground", () => {
  const player = createPlayer();
  advance(player, 10);
  player.setKey("KeyW", true);
  advance(player, 90);
  player.setKey("KeyW", false);

  assert.ok(player.position.z < -3, `expected forward movement, got z=${player.position.z}`);
  assert.ok(player.position.y >= 0.5, `player fell through ground at y=${player.position.y}`);
});

test("S moves backward while A and D move left and right", () => {
  const backward = createPlayer();
  advance(backward, 10);
  backward.setKey("KeyS", true);
  advance(backward, 90);
  backward.setKey("KeyS", false);
  assert.ok(backward.position.z > 3, `expected backward movement, got z=${backward.position.z}`);

  const left = createPlayer();
  advance(left, 10);
  left.setKey("KeyA", true);
  advance(left, 90);
  left.setKey("KeyA", false);
  assert.ok(left.position.x < -3, `expected left movement, got x=${left.position.x}`);

  const right = createPlayer();
  advance(right, 10);
  right.setKey("KeyD", true);
  advance(right, 90);
  right.setKey("KeyD", false);
  assert.ok(right.position.x > 3, `expected right movement, got x=${right.position.x}`);
});

test("player jumps and lands without falling through blocks at low frame rates", () => {
  const player = createPlayer();
  advance(player, 10);
  player.setKey("Space", true);
  player.update(1 / 60, true);
  player.setKey("Space", false);

  let peak = player.position.y;
  for (let frame = 0; frame < 120; frame += 1) {
    player.update(0.05, true);
    peak = Math.max(peak, player.position.y);
  }

  assert.ok(peak > 1.2, `jump did not leave the ground, peak=${peak}`);
  assert.ok(player.position.y >= 0.5, `player tunneled through ground at y=${player.position.y}`);
  assert.equal(player.grounded, true);
});

test("player automatically steps over a one-block ledge", () => {
  const world = new TestWorld(
    (x, y, z) => x === 0 && y === 1 && z === -2,
  );
  const player = createPlayer(world);
  advance(player, 10);
  player.setKey("KeyW", true);
  advance(player, 120);
  player.setKey("KeyW", false);

  assert.ok(player.position.z < -2.4, `player was stuck at z=${player.position.z}`);
  assert.ok(player.position.y >= 0.5);
});

test("player cannot step through a two-block wall", () => {
  const world = new TestWorld(
    (x, y, z) => x === 0 && (y === 1 || y === 2) && z === -2,
  );
  const player = createPlayer(world);
  advance(player, 10);
  player.setKey("KeyW", true);
  advance(player, 120);
  player.setKey("KeyW", false);

  assert.ok(player.position.z > -1.5, `player crossed a solid wall at z=${player.position.z}`);
});

test("saved player state restores only when the position is safe", () => {
  const player = createPlayer();
  assert.equal(
    player.restore({
      x: 3,
      y: 2,
      z: -4,
      health: 7,
      stamina: 6,
      yaw: 1.2,
      pitch: -0.25,
    }),
    true,
  );
  assert.equal(player.position.x, 3);
  assert.equal(player.position.y, 2);
  assert.equal(player.health, 7);

  assert.equal(
    player.restore({
      x: 0,
      y: 0,
      z: 0,
      health: 10,
      stamina: 10,
      yaw: 0,
      pitch: 0,
    }),
    false,
  );
});

test("hostile damage cannot stack during the brief invulnerability window", () => {
  const player = createPlayer();

  assert.equal(player.takeDamage(1), true);
  assert.equal(player.takeDamage(1), false);
  assert.equal(player.health, 9);

  advance(player, 44);
  assert.equal(player.takeDamage(1), true);
  assert.equal(player.health, 8);

  assert.equal(player.takeDamage(2, true), true);
  assert.equal(player.health, 6);
});

test("sprinting exhausts stamina and recovers without crossing world boundaries", () => {
  const player = createPlayer();
  player.setKey("KeyD", true);
  player.setKey("ShiftLeft", true);
  advance(player, 500);
  assert.ok(player.stamina < 10);
  assert.ok(player.position.x <= 25.17);
  player.clearKeys();
  advance(player, 1000);
  assert.equal(player.stamina, 10);
  assert.ok(Number.isFinite(player.position.y));
});

test("pause freezes position, velocity, health and stamina", () => {
  const player = createPlayer();
  player.setKey("KeyW", true);
  advance(player, 10);
  const before = player.serialize();
  for(let i=0;i<100;i++) player.update(.05,false);
  assert.deepEqual(player.serialize(), before);
});

test("fatal damage restores health and safe spawn; malformed saves are rejected", () => {
  const player = createPlayer();
  player.position.set(5,5,5);
  player.takeDamage(20,true);
  assert.equal(player.health,10);
  assert.deepEqual(player.position.toArray(),[0,.51,0]);
  for(const value of [NaN,Infinity,-Infinity]) {
    assert.equal(player.restore({...player.serialize(),x:value}),false);
  }
  assert.equal(player.restore({...player.serialize(),x:26}),false);
});
