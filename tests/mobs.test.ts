import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import {
  isNightTime,
  MAX_NIGHTLINGS,
  MobManager,
} from "../src/game/mobs";
import type { VoxelWorld } from "../src/game/world";

class OpenMobWorld {
  getSurfaceY(): number {
    return 0;
  }

  getBlock(): undefined {
    return undefined;
  }

  isSolid(_x: number, y: number): boolean {
    return y <= 0;
  }
}

class BlockedMobWorld extends OpenMobWorld {
  override isSolid(_x: number, y: number): boolean {
    return y <= 3;
  }
}

function createManager(world: OpenMobWorld): MobManager {
  return new MobManager(
    new THREE.Scene(),
    world as unknown as VoxelWorld,
    () => {},
    12345,
  );
}

test("night detection handles cycle boundaries and wrapped values", () => {
  assert.equal(isNightTime(0), true);
  assert.equal(isNightTime(0.169), true);
  assert.equal(isNightTime(0.17), false);
  assert.equal(isNightTime(0.74), false);
  assert.equal(isNightTime(0.741), true);
  assert.equal(isNightTime(1.02), true);
  assert.equal(isNightTime(-0.1), true);
});

test("nightlings stay capped and disappear quickly after dawn", () => {
  const manager = createManager(new OpenMobWorld());
  const playerPosition = new THREE.Vector3(0, 1, 0);

  for (let frame = 0; frame < 2_400; frame += 1) {
    manager.update(0.05, 0.9, playerPosition);
    assert.ok(manager.count("nightling") <= MAX_NIGHTLINGS);
  }

  assert.ok(manager.count("nightling") > 0);
  for (let frame = 0; frame < 60; frame += 1) {
    manager.update(0.05, 0.5, playerPosition);
  }
  assert.equal(manager.count("nightling"), 0);
  manager.dispose();
});

test("mobs do not spawn inside blocked terrain", () => {
  const manager = createManager(new BlockedMobWorld());
  const playerPosition = new THREE.Vector3(0, 1, 0);

  for (let frame = 0; frame < 800; frame += 1) {
    manager.update(0.05, 0.9, playerPosition);
  }

  assert.equal(manager.count(), 0);
  manager.dispose();
});

test("ten complete day/night cycles keep population bounded and dispose every mesh", () => {
  const scene = new THREE.Scene();
  const manager = new MobManager(scene, new OpenMobWorld() as unknown as VoxelWorld, ()=>{}, 71);
  const position = new THREE.Vector3(0,8,0);
  for(let cycle=0;cycle<10;cycle++) {
    for(let frame=0;frame<7200;frame++) {
      manager.update(.05,frame/7200,position);
      assert.ok(manager.count("nightling")<=MAX_NIGHTLINGS);
      assert.ok(manager.count()<=12);
    }
  }
  manager.dispose();
  assert.equal(scene.children.length,0);
});
