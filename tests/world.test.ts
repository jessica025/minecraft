import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import * as THREE from "three";
import { VoxelWorld, WORLD_RADIUS, WORLD_MAX_Y } from "../src/game/world";
import { isTransparentBlock } from "../src/game/blocks";
import { raycastVoxels } from "../src/game/raycast";
import { mulberry32 } from "../src/game/noise";

const oldDocument = globalThis.document;
before(() => {
  // Textures are irrelevant to CPU geometry/physics tests.
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ width: 16, height: 16,
      getContext: () => ({ fillStyle: "", globalAlpha: 1, fillRect() {} }) }),
  } });
});
after(() => Object.defineProperty(globalThis, "document", { configurable: true, value: oldDocument }));

test("incremental edits match full rebuild geometry after 400 seeded operations", () => {
  const world = new VoxelWorld(new THREE.Scene(), "geometry-regression");
  const random = mulberry32(813);
  for (let i = 0; i < 400; i++) {
    const x = Math.floor(random() * 10) - 5, z = Math.floor(random() * 10) - 5;
    world.setBlock(x, 5 + Math.floor(random() * 5), z, random() < 0.5 ? null : "stone");
  }
  function snapshot() {
    return world.raycastTargets.flatMap(mesh =>
      (mesh.userData.positions as { x: number; y: number; z: number }[]).map((p, i) => {
        const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m);
        assert.equal(m.elements[12], p.x);
        assert.equal(m.elements[14], p.z);
        assert.equal(mesh.count, mesh.userData.positions.length);
        return `${mesh.name}:${p.x},${p.y},${p.z}`;
      })).sort();
  }
  const incremental = snapshot();
  assert.equal(new Set(incremental).size, incremental.length, "duplicate instances");
  world.rebuildMeshes();
  assert.deepEqual(snapshot(), incremental);
  // Independently enumerate exposed voxels, including water/leaf adjacency.
  let exposed = 0;
  for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x++) {
    for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z++) {
      for (let y = 0; y <= WORLD_MAX_Y; y++) {
        const block = world.getBlock(x, y, z);
        if (!block) continue;
        const neighbors = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
        if (neighbors.some(([dx,dy,dz]) => {
          const adjacent = world.getBlock(x+dx,y+dy,z+dz);
          return !adjacent || (block === "water" ? adjacent !== "water" : isTransparentBlock(adjacent));
        })) exposed++;
      }
    }
  }
  assert.equal(incremental.length, exposed);
  world.dispose();
});

test("grid raycast matches rendered mesh intersections for 300 seeded rays", () => {
  const scene = new THREE.Scene();
  const world = new VoxelWorld(scene, "ray-regression");
  scene.updateMatrixWorld(true);
  const random = mulberry32(7321);
  for (let i = 0; i < 300; i++) {
    const origin = new THREE.Vector3(random()*44-22, 30 + random()*8, random()*44-22);
    const direction = new THREE.Vector3(random()-.5, -0.5-random(), random()-.5).normalize();
    const raycaster = new THREE.Raycaster(origin, direction, 0, 40);
    const expected = raycaster.intersectObjects(world.raycastTargets, false)[0];
    const hit = raycastVoxels(raycaster.ray, 40, (x,y,z) => world.getBlock(x,y,z));
    assert.equal(Boolean(hit), Boolean(expected));
    if (hit && expected) {
      assert.ok(Math.abs(hit.distance - expected.distance) < 1e-5);
      assert.deepEqual(hit.position, world.getBlockFromIntersection(expected));
      assert.ok(hit.normal.distanceTo(expected.face!.normal) < 1e-5);
    }
  }
  world.dispose();
});

test("instance buffers dispose on capacity growth, full rebuild and world disposal", () => {
  const world = new VoxelWorld(new THREE.Scene(), "dispose");
  let disposed = 0;
  for (const mesh of world.raycastTargets) mesh.addEventListener("dispose", () => disposed++);
  const initialCount = world.raycastTargets.length;
  world.setBlock(-20, 20, -20, "cobblestone");
  const first = world.raycastTargets.find(mesh => mesh.name === "blocks-cobblestone")!;
  let grown = 0;
  first.addEventListener("dispose", () => grown++);
  for (let i=0; i<160; i++) world.setBlock(-20 + i%20,20,-20 + Math.floor(i/20),"cobblestone");
  assert.equal(grown,1,"capacity growth must dispose the old instance buffer");
  assert.equal(world.raycastTargets.find(mesh=>mesh.name==="blocks-cobblestone")!.count,160);
  world.rebuildMeshes();
  assert.equal(disposed, initialCount);
  const stone = world.raycastTargets.find(m => m.name === "blocks-stone")!;
  stone.addEventListener("dispose", () => disposed++);
  world.dispose();
  assert.equal(disposed, initialCount + 1);
  assert.equal(world.raycastTargets.length, 0);
  assert.equal(world.group.children.length, 0);
});

test("bedrock cannot be replaced or removed, including legacy saves", () => {
  const world = new VoxelWorld(new THREE.Scene(), "protected");
  assert.equal(world.setBlock(0,0,0,null), false);
  assert.equal(world.setBlock(0,0,0,"stone"), false);
  world.loadEdits([["0,0,0",null], ["01,8,0","lantern"], ["1,8,0,3","stone"]]);
  assert.equal(world.getBlock(0,0,0), "bedrock");
  assert.equal(world.serialize(0).edits.length, 0);
  assert.equal(world.setBlock(0,7,0,"grass"), false);
  world.setBlock(0,24,0,"stone");
  assert.equal(world.getSpawnPosition().y, 24.51);
  world.dispose();
});

test("world seeds are deterministic and modified worlds round trip", () => {
  const a = new VoxelWorld(new THREE.Scene(), "round-trip");
  a.setBlock(0,7,0,null);
  a.setBlock(1,8,0,"lantern");
  const data = a.serialize(.75, 900);
  const b = new VoxelWorld(new THREE.Scene(), data.seed);
  b.loadEdits(data.edits);
  for (let x=-25; x<=25; x++) for(let z=-25;z<=25;z++) for(let y=0;y<=24;y++) {
    assert.equal(a.getBlock(x,y,z), b.getBlock(x,y,z));
  }
  assert.deepEqual(b.serialize(.75,900), data);
  a.dispose(); b.dispose();
});
