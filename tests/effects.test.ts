import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { BlockParticles } from "../src/game/effects";

test("particle bursts stay bounded, expire, and release materials", () => {
  const scene = new THREE.Scene();
  const particles = new BlockParticles(scene);
  particles.burst(new THREE.Vector3(), "stone", 1000);
  assert.equal(scene.children.length, 192);
  particles.burst(new THREE.Vector3(), "stone", 1000);
  assert.equal(scene.children.length, 192);
  let disposed = 0;
  for (const child of scene.children) {
    ((child as THREE.Mesh).material as THREE.Material).addEventListener("dispose",()=>disposed++);
  }
  particles.update(1);
  assert.equal(scene.children.length, 0);
  assert.equal(disposed, 192);
  particles.burst(new THREE.Vector3(), "dirt");
  particles.dispose();
  assert.equal(scene.children.length, 0);
});
