import * as THREE from "three";
import {
  BLOCKS,
  type BlockId,
  createBlockMaterials,
  isSolidBlock,
  isTransparentBlock,
} from "./blocks";
import { fbm2D, hashString, mulberry32, valueNoise2D } from "./noise";

export interface BlockPosition {
  x: number;
  y: number;
  z: number;
}

export type BiomeId = "plains" | "desert" | "snow" | "cherry";

export interface SavedWorld {
  version?: 1;
  seed: string;
  edits: Array<[string, BlockId | null]>;
  time: number;
  elapsed?: number;
  player?: {
    x: number;
    y: number;
    z: number;
    health: number;
    stamina: number;
    yaw: number;
    pitch: number;
  };
}

const NEIGHBORS: BlockPosition[] = [
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -1, z: 0 },
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
];

const BIOME_LABELS: Record<BiomeId, string> = {
  plains: "风原",
  desert: "金沙滩",
  snow: "霜脊",
  cherry: "樱谷",
};

export const WORLD_RADIUS = 25;
export const WORLD_MAX_Y = 24;
export const WATER_LEVEL = 5;

export function isWithinWorldBounds(
  x: number,
  y: number,
  z: number,
): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Number.isInteger(z) &&
    Math.abs(x) <= WORLD_RADIUS &&
    Math.abs(z) <= WORLD_RADIUS &&
    y >= 0 &&
    y <= WORLD_MAX_Y
  );
}

function keyOf(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function parseKey(key: string): BlockPosition {
  const [x, y, z] = key.split(",").map(Number);
  return { x, y, z };
}

export class VoxelWorld {
  readonly seed: string;
  readonly seedNumber: number;
  readonly group = new THREE.Group();
  readonly raycastTargets: THREE.InstancedMesh[] = [];
  private readonly blocks = new Map<string, BlockId>();
  private readonly edits = new Map<string, BlockId | null>();
  private readonly heights = new Map<string, number>();
  private readonly biomes = new Map<string, BiomeId>();
  private readonly materials = createBlockMaterials();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly lanternLights: THREE.PointLight[] = [];
  private readonly meshes = new Map<BlockId, THREE.InstancedMesh>();
  private readonly visible = new Map<string, { block: BlockId; index: number }>();
  private readonly instanceMatrix = new THREE.Matrix4();

  constructor(
    private readonly scene: THREE.Scene,
    seed: string,
  ) {
    this.seed = seed;
    this.seedNumber = hashString(seed);
    this.group.name = "voxel-world";
    this.scene.add(this.group);
    this.generate();
    this.rebuildMeshes();
  }

  private generate(): void {
    this.blocks.clear();
    this.heights.clear();
    this.biomes.clear();
    const random = mulberry32(this.seedNumber);

    for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x += 1) {
      for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z += 1) {
        const terrain = fbm2D(this.seedNumber, x, z);
        const ridge = valueNoise2D(this.seedNumber + 9021, x, z, 13);
        const centerDistance = Math.hypot(x, z);
        let height = Math.floor(3 + terrain * 9 + Math.max(0, ridge - 0.67) * 10);

        if (centerDistance < 10) {
          height = 7;
        } else if (centerDistance < 16) {
          height = Math.round(
            7 + (height - 7) * ((centerDistance - 10) / 6),
          );
        }

        height = THREE.MathUtils.clamp(height, 3, 17);
        const biome = this.calculateBiome(x, z, height);
        this.heights.set(`${x},${z}`, height);
        this.biomes.set(`${x},${z}`, biome);

        for (let y = 0; y <= height; y += 1) {
          let block: BlockId;

          if (y === 0) {
            block = "bedrock";
          } else if (y === height) {
            block =
              biome === "desert"
                ? "sand"
                : biome === "snow"
                  ? "snow"
                  : "grass";
          } else if (y >= height - 2) {
            block = biome === "desert" ? "sand" : "dirt";
          } else {
            const oreNoise = valueNoise2D(
              this.seedNumber + y * 237,
              x * 3.1,
              z * 3.1,
              6,
            );
            if (y < 8 && oreNoise > 0.82) {
              block = "copperOre";
            } else if (y < 11 && oreNoise < 0.12) {
              block = "coalOre";
            } else {
              block = "stone";
            }
          }

          this.blocks.set(keyOf(x, y, z), block);
        }

        if (height < WATER_LEVEL) {
          for (let y = height + 1; y <= WATER_LEVEL; y += 1) {
            this.blocks.set(keyOf(x, y, z), "water");
          }
        }
      }
    }

    for (let x = -WORLD_RADIUS + 2; x <= WORLD_RADIUS - 2; x += 1) {
      for (let z = -WORLD_RADIUS + 2; z <= WORLD_RADIUS - 2; z += 1) {
        if (Math.hypot(x, z) < 11) {
          continue;
        }
        const height = this.getGeneratedHeight(x, z);
        const biome = this.getBiome(x, z);
        const treeChance = biome === "cherry" ? 0.105 : biome === "plains" ? 0.055 : 0;
        const localRandom =
          random() * 0.45 +
          valueNoise2D(this.seedNumber + 441, x * 9, z * 9, 3) * 0.55;

        if (localRandom > 1 - treeChance) {
          this.addTree(x, height + 1, z, biome === "cherry");
        }
      }
    }
  }

  private calculateBiome(x: number, z: number, height: number): BiomeId {
    if (height >= 13) {
      return "snow";
    }

    const moisture = valueNoise2D(this.seedNumber + 1237, x, z, 34);
    const temperature = valueNoise2D(this.seedNumber + 8621, x, z, 42);

    if (moisture < 0.31 && temperature > 0.42) {
      return "desert";
    }

    if (moisture > 0.61 && temperature > 0.47) {
      return "cherry";
    }

    return "plains";
  }

  private addTree(x: number, y: number, z: number, cherry: boolean): void {
    const trunk: BlockId = cherry ? "cherryWood" : "wood";
    const leaves: BlockId = cherry ? "cherryLeaves" : "leaves";
    const trunkHeight =
      3 +
      Math.floor(
        valueNoise2D(this.seedNumber + 123, x * 4, z * 4, 5) * 3,
      );

    for (let offset = 0; offset < trunkHeight; offset += 1) {
      this.blocks.set(keyOf(x, y + offset, z), trunk);
    }

    const crownY = y + trunkHeight - 1;
    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dz = -2; dz <= 2; dz += 1) {
        for (let dy = -1; dy <= 2; dy += 1) {
          const distance = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 0.7;
          const cornerNoise = valueNoise2D(
            this.seedNumber + crownY,
            x + dx * 7,
            z + dz * 7,
            4,
          );
          if (distance <= 3.7 && cornerNoise > 0.13) {
            const leafKey = keyOf(x + dx, crownY + dy, z + dz);
            if (!this.blocks.has(leafKey)) {
              this.blocks.set(leafKey, leaves);
            }
          }
        }
      }
    }
  }

  private getGeneratedHeight(x: number, z: number): number {
    return this.heights.get(`${x},${z}`) ?? 0;
  }

  getBlock(x: number, y: number, z: number): BlockId | undefined {
    return this.blocks.get(keyOf(x, y, z));
  }

  setBlock(
    x: number,
    y: number,
    z: number,
    block: BlockId | null,
    trackEdit = true,
  ): boolean {
    if (!isWithinWorldBounds(x, y, z)) {
      return false;
    }

    const key = keyOf(x, y, z);
    const current = this.blocks.get(key);

    if (current && BLOCKS[current].unbreakable) {
      return false;
    }
    if ((current ?? null) === block) return false;

    if (block === null) {
      this.blocks.delete(key);
    } else {
      this.blocks.set(key, block);
    }

    if (trackEdit) {
      this.edits.set(key, block);
    }
    this.syncCell(x, y, z);
    for (const offset of NEIGHBORS) {
      this.syncCell(x + offset.x, y + offset.y, z + offset.z);
    }
    if (current === "lantern" || block === "lantern") this.updateLanterns();
    return true;
  }

  isSolid(x: number, y: number, z: number): boolean {
    return isSolidBlock(this.getBlock(x, y, z));
  }

  getSurfaceY(x: number, z: number): number {
    const blockX = Math.round(x);
    const blockZ = Math.round(z);
    for (let y = WORLD_MAX_Y; y >= 0; y -= 1) {
      const block = this.getBlock(blockX, y, blockZ);
      if (
        block &&
        isSolidBlock(block) &&
        block !== "leaves" &&
        block !== "cherryLeaves" &&
        block !== "wood" &&
        block !== "cherryWood"
      ) {
        return y;
      }
    }
    return 0;
  }

  getSpawnPosition(): THREE.Vector3 {
    for (let radius = 0; radius <= WORLD_RADIUS; radius += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        for (let z = -radius; z <= radius; z += 1) {
          if (radius > 0 && Math.abs(x) !== radius && Math.abs(z) !== radius) {
            continue;
          }
          for (let y = WORLD_MAX_Y; y >= 0; y -= 1) {
            if (
              this.isSolid(x, y, z) &&
              !this.isSolid(x, y + 1, z) &&
              !this.isSolid(x, y + 2, z) &&
              this.getBlock(x, y + 1, z) !== "water"
            ) {
              return new THREE.Vector3(x, y + 0.51, z);
            }
          }
        }
      }
    }

    return new THREE.Vector3(0, 1.51, 0);
  }

  getBiome(x: number, z: number): BiomeId {
    const roundedX = THREE.MathUtils.clamp(
      Math.round(x),
      -WORLD_RADIUS,
      WORLD_RADIUS,
    );
    const roundedZ = THREE.MathUtils.clamp(
      Math.round(z),
      -WORLD_RADIUS,
      WORLD_RADIUS,
    );
    return this.biomes.get(`${roundedX},${roundedZ}`) ?? "plains";
  }

  getBiomeLabel(x: number, z: number): string {
    return BIOME_LABELS[this.getBiome(x, z)];
  }

  getNearbySummary(position: THREE.Vector3, radius = 6): Record<string, number> {
    const counts: Record<string, number> = {};
    const centerX = Math.round(position.x);
    const centerY = Math.round(position.y);
    const centerZ = Math.round(position.z);

    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      for (let y = Math.max(0, centerY - radius); y <= centerY + radius; y += 1) {
        for (let z = centerZ - radius; z <= centerZ + radius; z += 1) {
          const block = this.getBlock(x, y, z);
          if (block) {
            counts[BLOCKS[block].label] = (counts[BLOCKS[block].label] ?? 0) + 1;
          }
        }
      }
    }

    return Object.fromEntries(
      Object.entries(counts)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 8),
    );
  }

  getBlockFromIntersection(
    intersection: THREE.Intersection,
  ): BlockPosition | null {
    if (
      !(intersection.object instanceof THREE.InstancedMesh) ||
      intersection.instanceId === undefined
    ) {
      return null;
    }

    const positions = intersection.object.userData.positions as
      | BlockPosition[]
      | undefined;
    return positions?.[intersection.instanceId] ?? null;
  }

  serialize(
    time: number,
    elapsed = 0,
    player?: SavedWorld["player"],
  ): SavedWorld {
    return {
      version: 1,
      seed: this.seed,
      edits: [...this.edits.entries()],
      time,
      elapsed,
      player,
    };
  }

  loadEdits(edits: SavedWorld["edits"]): void {
    for (const [key, block] of edits) {
      const position = parseKey(key);
      const validPosition =
        Number.isInteger(position.x) &&
        Number.isInteger(position.y) &&
        Number.isInteger(position.z);
      const validBlock =
        block === null ||
        (typeof block === "string" &&
          Object.prototype.hasOwnProperty.call(BLOCKS, block));
      if (
        validPosition &&
        key === keyOf(position.x, position.y, position.z) &&
        validBlock &&
        position.y !== 0 &&
        isWithinWorldBounds(position.x, position.y, position.z)
      ) {
        if (block === null) {
          this.blocks.delete(key);
        } else if (block && BLOCKS[block]) {
          this.blocks.set(key, block);
        }
        this.edits.set(key, block);
      }
    }
    this.rebuildMeshes();
  }

  private isExposed(x: number, y: number, z: number, block: BlockId): boolean {
    return NEIGHBORS.some((neighbor) => {
      const adjacent = this.getBlock(
        x + neighbor.x,
        y + neighbor.y,
        z + neighbor.z,
      );
      if (!adjacent) {
        return true;
      }
      if (block === "water") {
        return adjacent !== "water";
      }
      return isTransparentBlock(adjacent);
    });
  }

  rebuildMeshes(): void {
    for (const mesh of this.meshes.values()) {
      this.group.remove(mesh);
      mesh.dispose();
    }
    this.meshes.clear();
    this.visible.clear();
    this.raycastTargets.length = 0;
    for (const [key, block] of this.blocks) {
      const { x, y, z } = parseKey(key);
      if (this.isExposed(x, y, z, block)) {
        this.addInstance(key, block, { x, y, z });
      }
    }
    this.updateLanterns();
  }

  private addInstance(key: string, block: BlockId, position: BlockPosition): void {
    let mesh = this.meshes.get(block);
    if (!mesh || mesh.count === mesh.instanceMatrix.count) {
      const previous = mesh;
      const capacity = previous ? previous.instanceMatrix.count * 2 : 64;
      mesh = new THREE.InstancedMesh(this.geometry, this.materials.get(block), capacity);
      mesh.name = `blocks-${block}`;
      mesh.count = previous?.count ?? 0;
      mesh.userData.positions = previous?.userData.positions ?? [];
      mesh.castShadow = block !== "water";
      mesh.receiveShadow = block !== "water";
      mesh.renderOrder = block === "water" ? 2 : 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Conservative fixed bounds avoid O(n) bounds recomputation on each edit.
      mesh.boundingBox = new THREE.Box3(
        new THREE.Vector3(-WORLD_RADIUS - 1, -1, -WORLD_RADIUS - 1),
        new THREE.Vector3(WORLD_RADIUS + 1, WORLD_MAX_Y + 8, WORLD_RADIUS + 1),
      );
      mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere());
      if (previous) {
        mesh.instanceMatrix.array.set(previous.instanceMatrix.array);
        this.group.remove(previous);
        this.raycastTargets.splice(this.raycastTargets.indexOf(previous), 1);
        previous.dispose();
      }
      this.meshes.set(block, mesh);
      this.group.add(mesh);
      this.raycastTargets.push(mesh);
    }
    const index = mesh.count++;
    (mesh.userData.positions as BlockPosition[]).push(position);
    this.visible.set(key, { block, index });
    const scale = block === "water" ? 0.92 : 1;
    this.instanceMatrix.makeScale(1, scale, 1).setPosition(
      position.x, position.y - (1 - scale) * 0.5, position.z,
    );
    mesh.setMatrixAt(index, this.instanceMatrix);
    mesh.instanceMatrix.addUpdateRange(index * 16, 16);
    mesh.instanceMatrix.needsUpdate = true;
  }

  private syncCell(x: number, y: number, z: number): void {
    const key = keyOf(x, y, z);
    const block = this.getBlock(x, y, z);
    const exposed = block && this.isExposed(x, y, z, block);
    const previous = this.visible.get(key);
    if (previous && exposed && previous.block === block) return;
    if (previous) {
      const mesh = this.meshes.get(previous.block)!;
      const positions = mesh.userData.positions as BlockPosition[];
      const last = --mesh.count;
      if (previous.index !== last) {
        mesh.getMatrixAt(last, this.instanceMatrix);
        mesh.setMatrixAt(previous.index, this.instanceMatrix);
        const moved = positions[last];
        positions[previous.index] = moved;
        this.visible.get(keyOf(moved.x, moved.y, moved.z))!.index = previous.index;
        mesh.instanceMatrix.addUpdateRange(previous.index * 16, 16);
      }
      positions.pop();
      mesh.instanceMatrix.needsUpdate = true;
      this.visible.delete(key);
    }
    if (exposed && block) this.addInstance(key, block, { x, y, z });
  }

  private updateLanterns(): void {
    for (const light of this.lanternLights) this.scene.remove(light);
    this.lanternLights.length = 0;
    for (const [key, block] of this.blocks) {
      if (block !== "lantern") continue;
      const position = parseKey(key);
      const light = new THREE.PointLight("#ffc66d", 1.4, 8, 1.8);
      light.position.set(position.x, position.y + 0.2, position.z);
      this.scene.add(light);
      this.lanternLights.push(light);
      if (this.lanternLights.length === 16) break;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    for (const mesh of this.meshes.values()) mesh.dispose();
    this.meshes.clear();
    this.visible.clear();
    this.group.clear();
    this.raycastTargets.length = 0;
    this.geometry.dispose();
    for (const material of this.materials.values()) {
      if (
        (material instanceof THREE.MeshLambertMaterial ||
          material instanceof THREE.MeshPhongMaterial) &&
        material.map
      ) {
        material.map.dispose();
      }
      material.dispose();
    }
    for (const light of this.lanternLights) {
      this.scene.remove(light);
    }
  }
}
