import * as THREE from "three";
import type { VoxelWorld } from "./world";
import { WORLD_MAX_Y, WORLD_RADIUS } from "./world";

export interface PlayerEvents {
  onJump?: () => void;
  onLand?: (impact: number) => void;
  onDamage?: (amount: number) => void;
}

export interface PlayerSaveData {
  x: number;
  y: number;
  z: number;
  health: number;
  stamina: number;
  yaw: number;
  pitch: number;
}

const PLAYER_RADIUS = 0.32;
const PLAYER_HEIGHT = 1.78;
const EYE_HEIGHT = 1.62;

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  health = 10;
  stamina = 10;
  grounded = false;
  private yaw = 0;
  private pitch = 0;
  private readonly keys = new Set<string>();
  private bobTime = 0;
  private bobAmount = 0;
  private exhausted = false;
  private lastAttackAt = 0;
  private damageCooldown = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly world: VoxelWorld,
    private readonly events: PlayerEvents = {},
  ) {
    this.camera.rotation.order = "YXZ";
    this.respawn();
  }

  setKey(code: string, pressed: boolean): void {
    if (pressed) {
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  clearKeys(): void {
    this.keys.clear();
  }

  addLook(deltaX: number, deltaY: number): void {
    const sensitivity = 0.00225;
    this.yaw -= deltaX * sensitivity;
    this.pitch -= deltaY * sensitivity;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02,
    );
  }

  update(delta: number, active: boolean): void {
    if (!active) {
      this.updateCamera(0);
      return;
    }

    this.damageCooldown = Math.max(0, this.damageCooldown - delta);

    const forwardInput =
      (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const strafeInput =
      (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const moving = forwardInput !== 0 || strafeInput !== 0;
    const wantsSprint =
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const sprinting = moving && wantsSprint && !this.exhausted;
    const inWater = this.isInWater();
    const speed = inWater ? 2.6 : sprinting ? 6.2 : 4.25;

    const input = new THREE.Vector2(strafeInput, forwardInput);
    if (input.lengthSq() > 1) {
      input.normalize();
    }

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const targetX = (input.x * cos - input.y * sin) * speed;
    const targetZ = (-input.x * sin - input.y * cos) * speed;
    const acceleration = this.grounded ? 16 : 5.5;
    this.velocity.x = THREE.MathUtils.damp(
      this.velocity.x,
      targetX,
      acceleration,
      delta,
    );
    this.velocity.z = THREE.MathUtils.damp(
      this.velocity.z,
      targetZ,
      acceleration,
      delta,
    );

    if (this.grounded && this.keys.has("Space")) {
      this.velocity.y = inWater ? 5.2 : 7.1;
      this.grounded = false;
      this.events.onJump?.();
    }

    if (inWater) {
      this.velocity.y += (this.keys.has("Space") ? 5 : -1.1) * delta;
      this.velocity.y *= Math.pow(0.34, delta);
    } else {
      this.velocity.y -= 20.5 * delta;
      this.velocity.y = Math.max(this.velocity.y, -28);
    }

    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - delta * 1.6);
      if (this.stamina <= 0.05) {
        this.exhausted = true;
      }
    } else {
      this.stamina = Math.min(10, this.stamina + delta * 0.85);
      if (this.stamina > 3.2) {
        this.exhausted = false;
      }
    }

    const wasGrounded = this.grounded;
    this.grounded = false;
    const steppedX = this.moveAxis("x", this.velocity.x * delta, wasGrounded);
    this.moveAxis("z", this.velocity.z * delta, wasGrounded && !steppedX);
    this.moveAxis("y", this.velocity.y * delta);

    if (this.position.y < -8) {
      this.takeDamage(4, true);
      this.respawn();
    }

    if (this.position.y > WORLD_MAX_Y + 12) {
      this.position.y = WORLD_MAX_Y + 12;
      this.velocity.y = 0;
    }

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    this.bobAmount = THREE.MathUtils.damp(
      this.bobAmount,
      this.grounded && moving ? Math.min(1, horizontalSpeed / 5) : 0,
      9,
      delta,
    );
    this.bobTime += delta * (sprinting ? 13 : 9);
    this.updateCamera(this.bobAmount);
  }

  private moveAxis(
    axis: "x" | "y" | "z",
    amount: number,
    canStep = false,
  ): boolean {
    if (Math.abs(amount) < 0.00001) {
      return false;
    }

    const impactVelocity = this.velocity.y;
    const subdivisions = Math.max(1, Math.ceil(Math.abs(amount) / 0.24));
    const stepAmount = amount / subdivisions;
    let stepped = false;

    for (let index = 0; index < subdivisions; index += 1) {
      const previous = this.position[axis];
      this.position[axis] += stepAmount;

      if (!this.collidesAt(this.position)) {
        continue;
      }

      if (
        axis !== "y" &&
        canStep &&
        !stepped &&
        !this.collidesAt(
          this.position.clone().setY(this.position.y + 1.001),
        )
      ) {
        this.position.y += 1.001;
        stepped = true;
        continue;
      }

      this.position[axis] = previous;
      this.velocity[axis] = 0;

      if (axis === "y" && amount < 0) {
        this.grounded = true;
        const impact = Math.abs(impactVelocity);
        if (impact > 10.5) {
          this.events.onLand?.(impact);
          this.takeDamage(
            Math.max(1, Math.floor((impact - 9.5) / 2.6)),
            true,
          );
        }
      }
      break;
    }

    return stepped;
  }

  private collidesAt(position: THREE.Vector3): boolean {
    if (
      position.x - PLAYER_RADIUS < -WORLD_RADIUS - 0.49 ||
      position.x + PLAYER_RADIUS > WORLD_RADIUS + 0.49 ||
      position.z - PLAYER_RADIUS < -WORLD_RADIUS - 0.49 ||
      position.z + PLAYER_RADIUS > WORLD_RADIUS + 0.49
    ) {
      return true;
    }

    const minX = Math.floor(position.x - PLAYER_RADIUS + 0.5);
    const maxX = Math.floor(position.x + PLAYER_RADIUS + 0.5);
    const minY = Math.floor(position.y + 0.5);
    const maxY = Math.floor(position.y + PLAYER_HEIGHT - 0.001 + 0.5);
    const minZ = Math.floor(position.z - PLAYER_RADIUS + 0.5);
    const maxZ = Math.floor(position.z + PLAYER_RADIUS + 0.5);

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          if (this.world.isSolid(x, y, z)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private isInWater(): boolean {
    const x = Math.round(this.position.x);
    const y = Math.round(this.position.y + 0.65);
    const z = Math.round(this.position.z);
    return this.world.getBlock(x, y, z) === "water";
  }

  private updateCamera(bob: number): void {
    const bobX = Math.cos(this.bobTime * 0.5) * 0.025 * bob;
    const bobY = Math.abs(Math.sin(this.bobTime)) * 0.04 * bob;
    this.camera.position.set(
      this.position.x + bobX,
      this.position.y + EYE_HEIGHT + bobY,
      this.position.z,
    );
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  takeDamage(amount: number, bypassCooldown = false): boolean {
    if (!bypassCooldown && this.damageCooldown > 0) {
      return false;
    }
    if (!bypassCooldown) {
      this.damageCooldown = 0.72;
    }
    this.health = Math.max(0, this.health - amount);
    this.events.onDamage?.(amount);
    if (this.health <= 0) {
      this.health = 10;
      this.respawn();
    }
    return true;
  }

  heal(amount: number): void {
    this.health = Math.min(10, this.health + amount);
  }

  canAttack(cooldown = 280): boolean {
    const now = performance.now();
    if (now - this.lastAttackAt < cooldown) {
      return false;
    }
    this.lastAttackAt = now;
    return true;
  }

  serialize(): PlayerSaveData {
    return {
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      health: this.health,
      stamina: this.stamina,
      yaw: this.yaw,
      pitch: this.pitch,
    };
  }

  restore(data: Partial<PlayerSaveData> | undefined): boolean {
    if (!data) {
      return false;
    }

    const { x, y, z, health, stamina, yaw, pitch } = data;
    if (
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      typeof y !== "number" ||
      !Number.isFinite(y) ||
      typeof z !== "number" ||
      !Number.isFinite(z) ||
      typeof health !== "number" ||
      !Number.isFinite(health) ||
      typeof stamina !== "number" ||
      !Number.isFinite(stamina) ||
      typeof yaw !== "number" ||
      !Number.isFinite(yaw) ||
      typeof pitch !== "number" ||
      !Number.isFinite(pitch)
    ) {
      return false;
    }

    const candidate = new THREE.Vector3(x, y, z);
    if (
      Math.abs(candidate.x) > WORLD_RADIUS ||
      Math.abs(candidate.z) > WORLD_RADIUS ||
      candidate.y < -2 ||
      candidate.y > WORLD_MAX_Y + 12 ||
      this.collidesAt(candidate)
    ) {
      return false;
    }

    this.position.copy(candidate);
    this.health = THREE.MathUtils.clamp(health, 1, 10);
    this.stamina = THREE.MathUtils.clamp(stamina, 0, 10);
    this.exhausted = this.stamina <= 0.05;
    this.yaw = yaw;
    this.pitch = THREE.MathUtils.clamp(
      pitch,
      -Math.PI / 2 + 0.02,
      Math.PI / 2 - 0.02,
    );
    this.velocity.set(0, 0, 0);
    this.updateCamera(0);
    return true;
  }

  respawn(): void {
    this.position.copy(this.world.getSpawnPosition());
    this.velocity.set(0, 0, 0);
    this.clearKeys();
    this.updateCamera(0);
  }
}
