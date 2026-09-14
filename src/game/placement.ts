import type * as THREE from "three";
import {
  isWithinWorldBounds,
  type BlockPosition,
} from "./world";

const PLAYER_RADIUS = 0.32;
const PLAYER_HEIGHT = 1.78;
const CONTACT_EPSILON = 0.00001;

export type PlacementBlockReason =
  | "invalid-face"
  | "outside-world"
  | "occupied"
  | "player-overlap";

export type PlacementEvaluation =
  | {
      valid: true;
      position: BlockPosition;
    }
  | {
      valid: false;
      position: BlockPosition | null;
      reason: PlacementBlockReason;
    };

export function faceOffset(
  normal: Pick<THREE.Vector3, "x" | "y" | "z">,
): BlockPosition | null {
  if (
    !Number.isFinite(normal.x) ||
    !Number.isFinite(normal.y) ||
    !Number.isFinite(normal.z)
  ) {
    return null;
  }

  const absoluteX = Math.abs(normal.x);
  const absoluteY = Math.abs(normal.y);
  const absoluteZ = Math.abs(normal.z);
  const largest = Math.max(absoluteX, absoluteY, absoluteZ);
  if (largest < 0.5) {
    return null;
  }

  if (absoluteX === largest) {
    return { x: Math.sign(normal.x), y: 0, z: 0 };
  }
  if (absoluteY === largest) {
    return { x: 0, y: Math.sign(normal.y), z: 0 };
  }
  return { x: 0, y: 0, z: Math.sign(normal.z) };
}

export function playerIntersectsBlock(
  playerPosition: Pick<THREE.Vector3, "x" | "y" | "z">,
  blockPosition: BlockPosition,
): boolean {
  return (
    Math.abs(playerPosition.x - blockPosition.x) <
      PLAYER_RADIUS + 0.5 - CONTACT_EPSILON &&
    playerPosition.y < blockPosition.y + 0.5 - CONTACT_EPSILON &&
    playerPosition.y + PLAYER_HEIGHT >
      blockPosition.y - 0.5 + CONTACT_EPSILON &&
    Math.abs(playerPosition.z - blockPosition.z) <
      PLAYER_RADIUS + 0.5 - CONTACT_EPSILON
  );
}

export function evaluatePlacement(
  source: BlockPosition,
  normal: Pick<THREE.Vector3, "x" | "y" | "z">,
  playerPosition: Pick<THREE.Vector3, "x" | "y" | "z">,
  getBlock: (x: number, y: number, z: number) => unknown,
): PlacementEvaluation {
  const offset = faceOffset(normal);
  if (!offset) {
    return {
      valid: false,
      position: null,
      reason: "invalid-face",
    };
  }

  const position = {
    x: source.x + offset.x,
    y: source.y + offset.y,
    z: source.z + offset.z,
  };

  if (!isWithinWorldBounds(position.x, position.y, position.z)) {
    return {
      valid: false,
      position,
      reason: "outside-world",
    };
  }
  if (getBlock(position.x, position.y, position.z)) {
    return {
      valid: false,
      position,
      reason: "occupied",
    };
  }
  if (playerIntersectsBlock(playerPosition, position)) {
    return {
      valid: false,
      position,
      reason: "player-overlap",
    };
  }

  return {
    valid: true,
    position,
  };
}
