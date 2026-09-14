import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import {
  evaluatePlacement,
  faceOffset,
  playerIntersectsBlock,
} from "../src/game/placement";
import {
  isWithinWorldBounds,
  WORLD_MAX_Y,
  WORLD_RADIUS,
} from "../src/game/world";

const farAwayPlayer = { x: 10, y: 10, z: 10 };
const emptyWorld = () => undefined;

test("placement resolves every block face to the adjacent grid cell", () => {
  const source = { x: 4, y: 5, z: 6 };
  const cases = [
    [{ x: 1, y: 0, z: 0 }, { x: 5, y: 5, z: 6 }],
    [{ x: -1, y: 0, z: 0 }, { x: 3, y: 5, z: 6 }],
    [{ x: 0, y: 1, z: 0 }, { x: 4, y: 6, z: 6 }],
    [{ x: 0, y: -1, z: 0 }, { x: 4, y: 4, z: 6 }],
    [{ x: 0, y: 0, z: 1 }, { x: 4, y: 5, z: 7 }],
    [{ x: 0, y: 0, z: -1 }, { x: 4, y: 5, z: 5 }],
  ] as const;

  for (const [normal, expected] of cases) {
    const result = evaluatePlacement(
      source,
      normal,
      farAwayPlayer,
      emptyWorld,
    );
    assert.equal(result.valid, true);
    assert.deepEqual(result.position, expected);
  }
});

test("placement uses the dominant face axis and rejects invalid normals", () => {
  assert.deepEqual(faceOffset({ x: 0.91, y: 0.12, z: 0.02 }), {
    x: 1,
    y: 0,
    z: 0,
  });
  assert.deepEqual(faceOffset({ x: 0, y: -0.8, z: 0.1 }), {
    x: 0,
    y: -1,
    z: 0,
  });
  assert.equal(faceOffset({ x: 0.2, y: 0.1, z: 0.1 }), null);
  assert.equal(faceOffset({ x: Number.NaN, y: 0, z: 1 }), null);
});

test("placement rejects occupied cells", () => {
  const result = evaluatePlacement(
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    farAwayPlayer,
    (x, y, z) => (x === 1 && y === 1 && z === 0 ? "stone" : undefined),
  );

  assert.deepEqual(result, {
    valid: false,
    position: { x: 1, y: 1, z: 0 },
    reason: "occupied",
  });
});

test("placement rejects blocks that overlap the player but allows touching", () => {
  const block = { x: 0, y: 1, z: 0 };
  assert.equal(
    playerIntersectsBlock({ x: 0, y: 0.51, z: 0 }, block),
    true,
  );
  assert.equal(
    playerIntersectsBlock({ x: 0.82, y: 0.51, z: 0 }, block),
    false,
  );
  assert.equal(
    playerIntersectsBlock({ x: 0, y: 1.5, z: 0 }, block),
    false,
  );
  assert.equal(
    playerIntersectsBlock({ x: 0, y: -1.28, z: 0 }, block),
    false,
  );

  const result = evaluatePlacement(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0.51, z: 0 },
    emptyWorld,
  );
  assert.equal(result.valid, false);
  assert.equal(result.reason, "player-overlap");
});

test("world build bounds include the edge and reject invalid coordinates", () => {
  assert.equal(isWithinWorldBounds(WORLD_RADIUS, WORLD_MAX_Y, -WORLD_RADIUS), true);
  assert.equal(isWithinWorldBounds(WORLD_RADIUS + 1, 1, 0), false);
  assert.equal(isWithinWorldBounds(0, WORLD_MAX_Y + 1, 0), false);
  assert.equal(isWithinWorldBounds(0, -1, 0), false);
  assert.equal(isWithinWorldBounds(0.5, 1, 0), false);
  assert.equal(isWithinWorldBounds(Number.NaN, 1, 0), false);
});

test("placement reports world-edge failures at horizontal and vertical limits", () => {
  const horizontal = evaluatePlacement(
    { x: WORLD_RADIUS, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    farAwayPlayer,
    emptyWorld,
  );
  assert.equal(horizontal.valid, false);
  assert.equal(horizontal.reason, "outside-world");

  const vertical = evaluatePlacement(
    { x: 0, y: WORLD_MAX_Y, z: 0 },
    { x: 0, y: 1, z: 0 },
    farAwayPlayer,
    emptyWorld,
  );
  assert.equal(vertical.valid, false);
  assert.equal(vertical.reason, "outside-world");
});

test("raycasting can place a second block immediately after the first", () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 150);
  const raycaster = new THREE.Raycaster();
  const center = new THREE.Vector2(0, 0);
  const player = { x: 0, y: 7.51, z: 0 };
  let positions = [{ x: 0, y: 7, z: -3 }];

  camera.position.set(0, 9.13, 0);
  camera.lookAt(new THREE.Vector3(0, 7.2, -3));
  camera.updateMatrixWorld(true);
  raycaster.far = 6;

  const placeFromCurrentRay = () => {
    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      positions.length,
    );
    const matrix = new THREE.Matrix4();
    positions.forEach((position, index) => {
      matrix.makeTranslation(position.x, position.y, position.z);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.updateMatrixWorld(true);

    raycaster.setFromCamera(center, camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    assert.ok(hit);
    assert.notEqual(hit.instanceId, undefined);
    const source = positions[hit.instanceId!];
    const occupied = new Set(
      positions.map(({ x, y, z }) => `${x},${y},${z}`),
    );
    return evaluatePlacement(
      source,
      hit.face?.normal ?? new THREE.Vector3(),
      player,
      (x, y, z) => occupied.has(`${x},${y},${z}`),
    );
  };

  const first = placeFromCurrentRay();
  assert.equal(first.valid, true);
  if (!first.valid) {
    return;
  }
  positions = [...positions, first.position];

  const second = placeFromCurrentRay();
  assert.equal(second.valid, true);
  if (second.valid) {
    assert.notDeepEqual(second.position, first.position);
  }

  geometry.dispose();
  material.dispose();
});
