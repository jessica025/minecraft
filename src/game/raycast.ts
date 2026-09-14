import * as THREE from "three";
import type { BlockId } from "./blocks";
import type { BlockPosition } from "./world";

export interface VoxelHit {
  position: BlockPosition;
  normal: THREE.Vector3;
  point: THREE.Vector3;
  distance: number;
}

/** Visit only the grid cells crossed by the ray, independent of world size. */
export function raycastVoxels(
  ray: THREE.Ray,
  far: number,
  getBlock: (x: number, y: number, z: number) => BlockId | undefined,
): VoxelHit | null {
  if (!Number.isFinite(far) || far < 0 ||
      ![...ray.origin, ...ray.direction].every(Number.isFinite) ||
      ray.direction.lengthSq() < 1e-12) return null;
  const direction = ray.direction.clone().normalize();
  const normalizedRay = new THREE.Ray(ray.origin, direction);
  const cell = ray.origin.clone().addScalar(0.5).floor();
  const step = new THREE.Vector3(
    Math.sign(direction.x), Math.sign(direction.y), Math.sign(direction.z),
  );
  const axes = ["x", "y", "z"] as const;
  const next = new THREE.Vector3();
  const stride = new THREE.Vector3();
  for (const axis of axes) {
    stride[axis] = direction[axis] === 0 ? Infinity : Math.abs(1 / direction[axis]);
    next[axis] = direction[axis] === 0 ? Infinity :
      (cell[axis] + step[axis] * 0.5 - ray.origin[axis]) / direction[axis];
  }
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  let distance = 0;
  while (distance <= far) {
    const block = getBlock(cell.x, cell.y, cell.z);
    if (block) {
      box.min.copy(cell).addScalar(-0.5);
      box.max.copy(cell).addScalar(0.5);
      if (block === "water") box.max.y -= 0.08;
      if (normalizedRay.intersectBox(box, point)) {
        const hitDistance = point.distanceTo(ray.origin);
        if (hitDistance <= far) {
          const normal = new THREE.Vector3();
          let nearest = Infinity;
          for (const axis of axes) {
            for (const sign of [-1, 1]) {
              const gap = Math.abs(point[axis] - (sign < 0 ? box.min[axis] : box.max[axis]));
              if (gap < nearest) {
                nearest = gap;
                normal.set(0, 0, 0);
                normal[axis] = sign;
              }
            }
          }
          return { position: { x: cell.x, y: cell.y, z: cell.z },
            normal, point: point.clone(), distance: hitDistance };
        }
      }
    }
    const axis = next.x <= next.y && next.x <= next.z ? "x" :
      next.y <= next.z ? "y" : "z";
    distance = next[axis];
    cell[axis] += step[axis];
    next[axis] += stride[axis];
  }
  return null;
}
