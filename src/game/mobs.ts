import * as THREE from "three";
import type { VoxelWorld } from "./world";
import { WORLD_RADIUS } from "./world";
import { mulberry32 } from "./noise";

export type MobKind = "woolback" | "copperGolem" | "nightling";
export const MAX_NIGHTLINGS = 3;

export function isNightTime(timeOfDay: number): boolean {
  const normalized = timeOfDay - Math.floor(timeOfDay);
  return normalized < 0.17 || normalized > 0.74;
}

interface Mob {
  id: number;
  kind: MobKind;
  label: string;
  group: THREE.Group;
  parts: THREE.Mesh[];
  health: number;
  direction: THREE.Vector2;
  turnTimer: number;
  speed: number;
  attackTimer: number;
  phase: number;
}

export interface MobHit {
  mobId: number;
  distance: number;
  point: THREE.Vector3;
}

function material(color: string, emissive?: string): THREE.MeshLambertMaterial {
  const parameters: THREE.MeshLambertMaterialParameters = {
    color,
    flatShading: true,
  };
  if (emissive) {
    parameters.emissive = new THREE.Color(emissive);
    parameters.emissiveIntensity = 0.42;
  }
  return new THREE.MeshLambertMaterial(parameters);
}

export class MobManager {
  readonly raycastTargets: THREE.Mesh[] = [];
  private readonly mobs = new Map<number, Mob>();
  private readonly random: () => number;
  private nextId = 1;
  private nightSpawnTimer = 12;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly world: VoxelWorld,
    private readonly onPlayerDamage: (amount: number) => void,
    seed: number,
  ) {
    this.random = mulberry32(seed + 773);
    this.spawnInitialMobs();
  }

  private spawnInitialMobs(): void {
    for (let index = 0; index < 6; index += 1) {
      this.spawn("woolback", 7 + this.random() * 17);
    }
    for (let index = 0; index < 2; index += 1) {
      this.spawn("copperGolem", 6 + this.random() * 13);
    }
  }

  private spawn(kind: MobKind, distance: number): boolean {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const angle = this.random() * Math.PI * 2;
      const localDistance = distance + (this.random() - 0.5) * 3;
      const x = Math.round(Math.cos(angle) * localDistance);
      const z = Math.round(Math.sin(angle) * localDistance);
      if (
        Math.abs(x) >= WORLD_RADIUS - 1 ||
        Math.abs(z) >= WORLD_RADIUS - 1
      ) {
        continue;
      }

      const surface = this.world.getSurfaceY(x, z);
      const spawnBlock = this.world.getBlock(x, surface + 1, z);
      const hasRoom = [1, 2, 3].every(
        (offset) => !this.world.isSolid(x, surface + offset, z),
      );
      const separated = [...this.mobs.values()].every((mob) => {
        const dx = mob.group.position.x - x;
        const dz = mob.group.position.z - z;
        return dx * dx + dz * dz >= 6.25;
      });
      if (spawnBlock === "water" || !hasRoom || !separated) {
        continue;
      }

      const mob = this.createMob(kind);
      mob.group.position.set(x, surface + 0.52, z);
      mob.group.rotation.y = angle + Math.PI;
      this.scene.add(mob.group);
      this.mobs.set(mob.id, mob);
      this.raycastTargets.push(...mob.parts);
      return true;
    }
    return false;
  }

  private createMob(kind: MobKind): Mob {
    const id = this.nextId;
    this.nextId += 1;
    const group = new THREE.Group();
    const parts: THREE.Mesh[] = [];

    const addPart = (
      size: [number, number, number],
      position: [number, number, number],
      color: string,
      emissive?: string,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        material(color, emissive),
      );
      mesh.position.set(...position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.mobId = id;
      group.add(mesh);
      parts.push(mesh);
      return mesh;
    };

    let label: string;
    let health: number;
    let speed: number;

    if (kind === "woolback") {
      label = "绒背兽";
      health = 4;
      speed = 0.72;
      addPart([1.15, 0.78, 1.5], [0, 0.72, 0], "#ece7d4");
      addPart([0.72, 0.68, 0.62], [0, 0.79, -0.9], "#514b43");
      for (const x of [-0.4, 0.4]) {
        for (const z of [-0.48, 0.48]) {
          addPart([0.22, 0.62, 0.22], [x, 0.24, z], "#514b43");
        }
      }
    } else if (kind === "copperGolem") {
      label = "铜傀儡";
      health = 8;
      speed = 0.56;
      addPart([0.7, 0.88, 0.48], [0, 0.85, 0], "#b96845");
      addPart([0.62, 0.55, 0.55], [0, 1.52, 0], "#d18457");
      addPart([0.14, 0.14, 0.08], [-0.17, 1.58, -0.3], "#79c4b4", "#5ca895");
      addPart([0.14, 0.14, 0.08], [0.17, 1.58, -0.3], "#79c4b4", "#5ca895");
      addPart([0.2, 0.66, 0.2], [-0.2, 0.24, 0], "#8d4d38");
      addPart([0.2, 0.66, 0.2], [0.2, 0.24, 0], "#8d4d38");
      addPart([0.18, 0.72, 0.18], [-0.45, 0.88, 0], "#8d4d38");
      addPart([0.18, 0.72, 0.18], [0.45, 0.88, 0], "#8d4d38");
    } else {
      label = "夜行苔灵";
      health = 5;
      speed = 1.35;
      addPart([0.72, 1.12, 0.58], [0, 0.92, 0], "#365c42");
      addPart([0.76, 0.68, 0.62], [0, 1.76, 0], "#4f8157");
      addPart([0.12, 0.12, 0.08], [-0.2, 1.83, -0.34], "#cce985", "#a2cc56");
      addPart([0.12, 0.12, 0.08], [0.2, 1.83, -0.34], "#cce985", "#a2cc56");
      addPart([0.22, 0.7, 0.22], [-0.2, 0.26, 0], "#294d37");
      addPart([0.22, 0.7, 0.22], [0.2, 0.26, 0], "#294d37");
    }

    return {
      id,
      kind,
      label,
      group,
      parts,
      health,
      direction: new THREE.Vector2(this.random() - 0.5, this.random() - 0.5).normalize(),
      turnTimer: 1 + this.random() * 4,
      speed,
      attackTimer: 0,
      phase: this.random() * Math.PI * 2,
    };
  }

  update(delta: number, timeOfDay: number, playerPosition: THREE.Vector3): void {
    const isNight = isNightTime(timeOfDay);
    if (isNight) {
      this.nightSpawnTimer -= delta;
    } else {
      this.nightSpawnTimer = Math.max(this.nightSpawnTimer, 8);
    }

    if (
      isNight &&
      this.count("nightling") < MAX_NIGHTLINGS &&
      this.nightSpawnTimer <= 0
    ) {
      const spawned = this.spawn("nightling", 18 + this.random() * 5);
      this.nightSpawnTimer = spawned
        ? 12 + this.random() * 7
        : 4 + this.random() * 3;
    }

    for (const mob of [...this.mobs.values()]) {
      mob.turnTimer -= delta;
      mob.attackTimer = Math.max(0, mob.attackTimer - delta);
      const toPlayer = new THREE.Vector2(
        playerPosition.x - mob.group.position.x,
        playerPosition.z - mob.group.position.z,
      );
      const playerDistance = toPlayer.length();
      const playerVerticalDistance = Math.abs(
        playerPosition.y - mob.group.position.y,
      );

      if (
        mob.kind === "nightling" &&
        isNight &&
        playerDistance < 12 &&
        playerVerticalDistance < 4
      ) {
        mob.direction.copy(toPlayer.normalize());
      } else if (mob.turnTimer <= 0) {
        mob.direction
          .set(this.random() - 0.5, this.random() - 0.5)
          .normalize();
        mob.turnTimer = 2 + this.random() * 5;
      }

      const nextX = mob.group.position.x + mob.direction.x * mob.speed * delta;
      const nextZ = mob.group.position.z + mob.direction.y * mob.speed * delta;
      const nextSurface = this.world.getSurfaceY(nextX, nextZ);
      const currentSurface = this.world.getSurfaceY(
        mob.group.position.x,
        mob.group.position.z,
      );
      const nextBlockX = Math.round(nextX);
      const nextBlockZ = Math.round(nextZ);
      const hasRoom =
        !this.world.isSolid(nextBlockX, nextSurface + 1, nextBlockZ) &&
        !this.world.isSolid(nextBlockX, nextSurface + 2, nextBlockZ);

      if (
        Math.abs(nextX) < WORLD_RADIUS - 1 &&
        Math.abs(nextZ) < WORLD_RADIUS - 1 &&
        Math.abs(nextSurface - currentSurface) <= 1 &&
        hasRoom &&
        this.world.getBlock(nextBlockX, nextSurface + 1, nextBlockZ) !== "water"
      ) {
        mob.group.position.x = nextX;
        mob.group.position.z = nextZ;
      } else {
        mob.direction.multiplyScalar(-1);
        mob.turnTimer = 1;
      }

      const surface = this.world.getSurfaceY(
        mob.group.position.x,
        mob.group.position.z,
      );
      mob.group.position.y = THREE.MathUtils.damp(
        mob.group.position.y,
        surface + 0.52,
        12,
        delta,
      );
      mob.group.rotation.y = Math.atan2(mob.direction.x, mob.direction.y) + Math.PI;
      mob.group.position.y += Math.sin(performance.now() * 0.004 + mob.phase) * 0.012;

      if (mob.kind === "nightling" && playerDistance > 32) {
        this.removeMob(mob.id);
        continue;
      }

      const attackDistance = Math.hypot(
        playerPosition.x - mob.group.position.x,
        playerPosition.z - mob.group.position.z,
      );
      const attackVerticalDistance = Math.abs(
        playerPosition.y - mob.group.position.y,
      );
      if (
        mob.kind === "nightling" &&
        isNight &&
        attackDistance < 1.05 &&
        attackVerticalDistance < 1.55 &&
        mob.attackTimer <= 0 &&
        this.hasLineOfSight(mob.group.position, playerPosition)
      ) {
        this.onPlayerDamage(1);
        mob.attackTimer = 1.6;
      }

      if (mob.kind === "nightling" && !isNight) {
        mob.health -= delta * 2.5;
        if (mob.health <= 0) {
          this.removeMob(mob.id);
        }
      }
    }
  }

  raycast(raycaster: THREE.Raycaster): MobHit | null {
    const hit = raycaster.intersectObjects(this.raycastTargets, false)[0];
    if (!hit) {
      return null;
    }
    const mobId = hit.object.userData.mobId as number | undefined;
    if (!mobId || !this.mobs.has(mobId)) {
      return null;
    }
    return { mobId, distance: hit.distance, point: hit.point };
  }

  damage(mobId: number, amount: number, knockbackFrom: THREE.Vector3): string | null {
    const mob = this.mobs.get(mobId);
    if (!mob) {
      return null;
    }

    mob.health -= amount;
    const direction = mob.group.position.clone().sub(knockbackFrom);
    direction.y = 0;
    if (direction.lengthSq() > 0) {
      direction.normalize();
      mob.group.position.addScaledVector(direction, 0.42);
    }

    mob.group.scale.set(1.12, 0.86, 1.12);
    window.setTimeout(() => {
      if (this.mobs.has(mobId)) {
        mob.group.scale.set(1, 1, 1);
      }
    }, 90);

    if (mob.health <= 0) {
      const label = mob.label;
      this.removeMob(mobId);
      return label;
    }
    return null;
  }

  nearbyLabels(position: THREE.Vector3, radius = 14): string[] {
    const labels = new Set<string>();
    for (const mob of this.mobs.values()) {
      if (mob.group.position.distanceTo(position) <= radius) {
        labels.add(mob.label);
      }
    }
    return [...labels];
  }

  count(kind?: MobKind): number {
    if (!kind) {
      return this.mobs.size;
    }
    let count = 0;
    for (const mob of this.mobs.values()) {
      if (mob.kind === kind) {
        count += 1;
      }
    }
    return count;
  }

  private hasLineOfSight(
    mobPosition: THREE.Vector3,
    playerPosition: THREE.Vector3,
  ): boolean {
    const start = mobPosition.clone().add(new THREE.Vector3(0, 1.05, 0));
    const end = playerPosition.clone().add(new THREE.Vector3(0, 0.9, 0));
    const offset = end.sub(start);
    const distance = offset.length();
    if (distance <= 0.01) {
      return true;
    }

    const steps = Math.max(2, Math.ceil(distance / 0.2));
    for (let step = 1; step < steps; step += 1) {
      const progress = step / steps;
      const sample = start.clone().addScaledVector(offset, progress);
      if (
        this.world.isSolid(
          Math.round(sample.x),
          Math.round(sample.y),
          Math.round(sample.z),
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private removeMob(id: number): void {
    const mob = this.mobs.get(id);
    if (!mob) {
      return;
    }

    this.scene.remove(mob.group);
    this.mobs.delete(id);
    for (const part of mob.parts) {
      const index = this.raycastTargets.indexOf(part);
      if (index >= 0) {
        this.raycastTargets.splice(index, 1);
      }
      part.geometry.dispose();
      (part.material as THREE.Material).dispose();
    }
  }

  dispose(): void {
    for (const id of [...this.mobs.keys()]) {
      this.removeMob(id);
    }
  }
}
