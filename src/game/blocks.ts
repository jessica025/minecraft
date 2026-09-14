import * as THREE from "three";

export type BlockId =
  | "bedrock"
  | "grass"
  | "dirt"
  | "stone"
  | "cobblestone"
  | "sand"
  | "snow"
  | "wood"
  | "leaves"
  | "cherryWood"
  | "cherryLeaves"
  | "water"
  | "coalOre"
  | "copperOre"
  | "lantern";

export type HotbarItem = BlockId | "spear";

export interface BlockDefinition {
  id: BlockId;
  label: string;
  color: string;
  accent: string;
  transparent?: boolean;
  liquid?: boolean;
  unbreakable?: boolean;
  emissive?: boolean;
  texture:
    | "soil"
    | "grass"
    | "stone"
    | "sand"
    | "snow"
    | "wood"
    | "leaves"
    | "ore"
    | "water"
    | "lantern";
}

export const BLOCKS: Record<BlockId, BlockDefinition> = {
  bedrock: {
    id: "bedrock",
    label: "基岩",
    color: "#30343a",
    accent: "#111418",
    unbreakable: true,
    texture: "stone",
  },
  grass: {
    id: "grass",
    label: "草方块",
    color: "#6f9c3f",
    accent: "#345c2b",
    texture: "grass",
  },
  dirt: {
    id: "dirt",
    label: "泥土",
    color: "#876344",
    accent: "#4f3727",
    texture: "soil",
  },
  stone: {
    id: "stone",
    label: "石头",
    color: "#8a8d89",
    accent: "#555b5b",
    texture: "stone",
  },
  cobblestone: {
    id: "cobblestone",
    label: "圆石",
    color: "#777b78",
    accent: "#343838",
    texture: "stone",
  },
  sand: {
    id: "sand",
    label: "沙子",
    color: "#d7c37d",
    accent: "#aa8c4c",
    texture: "sand",
  },
  snow: {
    id: "snow",
    label: "雪块",
    color: "#e8f3f4",
    accent: "#b5d4dc",
    texture: "snow",
  },
  wood: {
    id: "wood",
    label: "橡木",
    color: "#8a673d",
    accent: "#4c361f",
    texture: "wood",
  },
  leaves: {
    id: "leaves",
    label: "橡树叶",
    color: "#477c3d",
    accent: "#244d2a",
    transparent: true,
    texture: "leaves",
  },
  cherryWood: {
    id: "cherryWood",
    label: "樱木",
    color: "#8c574d",
    accent: "#4f3130",
    texture: "wood",
  },
  cherryLeaves: {
    id: "cherryLeaves",
    label: "樱花叶",
    color: "#f09bb2",
    accent: "#b6557e",
    transparent: true,
    texture: "leaves",
  },
  water: {
    id: "water",
    label: "水",
    color: "#397fbd",
    accent: "#73b8dc",
    transparent: true,
    liquid: true,
    texture: "water",
  },
  coalOre: {
    id: "coalOre",
    label: "煤矿石",
    color: "#777b78",
    accent: "#242728",
    texture: "ore",
  },
  copperOre: {
    id: "copperOre",
    label: "铜矿石",
    color: "#777b78",
    accent: "#c4724d",
    texture: "ore",
  },
  lantern: {
    id: "lantern",
    label: "铜灯",
    color: "#d89545",
    accent: "#fff2a8",
    emissive: true,
    texture: "lantern",
  },
};

export const HOTBAR_ITEMS: HotbarItem[] = [
  "grass",
  "dirt",
  "stone",
  "wood",
  "cherryWood",
  "copperOre",
  "lantern",
  "spear",
];

export const ITEM_LABELS: Record<HotbarItem, string> = {
  ...Object.fromEntries(
    Object.values(BLOCKS).map((definition) => [definition.id, definition.label]),
  ),
  spear: "长矛",
} as Record<HotbarItem, string>;

function randomPixel(seed: number, x: number, y: number): number {
  const value = Math.sin(seed * 71.17 + x * 31.31 + y * 97.73) * 43758.5453;
  return value - Math.floor(value);
}

function shade(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  color.offsetHSL(0, 0, amount);
  return `#${color.getHexString()}`;
}

function createTexture(definition: BlockDefinition): THREE.CanvasTexture {
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }

  context.fillStyle = definition.color;
  context.fillRect(0, 0, size, size);
  const seed = definition.id
    .split("")
    .reduce((total, letter) => total + letter.charCodeAt(0), 0);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const noise = randomPixel(seed, x, y);
      if (noise > 0.72) {
        context.fillStyle = shade(definition.color, noise > 0.91 ? 0.11 : -0.08);
        context.fillRect(x, y, 1, 1);
      }
    }
  }

  if (definition.texture === "grass") {
    context.fillStyle = definition.accent;
    for (let x = 0; x < size; x += 2) {
      const y = 10 + Math.floor(randomPixel(seed, x, 3) * 5);
      context.fillRect(x, y, 1, size - y);
    }
  }

  if (definition.texture === "stone") {
    context.fillStyle = definition.accent;
    for (let index = 0; index < 18; index += 1) {
      const x = Math.floor(randomPixel(seed + index, index, 2) * size);
      const y = Math.floor(randomPixel(seed, index, 7) * size);
      context.fillRect(x, y, index % 3 === 0 ? 2 : 1, 1);
    }
  }

  if (definition.texture === "wood") {
    context.fillStyle = definition.accent;
    for (let x = 1; x < size; x += 4) {
      context.fillRect(x, 0, 1, size);
    }
    context.fillStyle = shade(definition.color, 0.08);
    context.fillRect(8, 0, 1, size);
  }

  if (definition.texture === "leaves") {
    for (let index = 0; index < 36; index += 1) {
      const x = Math.floor(randomPixel(seed + index, index, 4) * size);
      const y = Math.floor(randomPixel(seed, index, 8) * size);
      context.fillStyle =
        index % 5 === 0 ? "rgba(0,0,0,0)" : definition.accent;
      context.fillRect(x, y, 1, 1);
    }
  }

  if (definition.texture === "ore") {
    context.fillStyle = definition.accent;
    const deposits = [
      [2, 3, 3, 2],
      [10, 2, 2, 3],
      [6, 8, 3, 2],
      [1, 12, 2, 2],
      [12, 11, 3, 3],
    ];
    for (const [x, y, width, height] of deposits) {
      context.fillRect(x, y, width, height);
      context.fillStyle = shade(definition.accent, 0.08);
      context.fillRect(x + 1, y, 1, 1);
      context.fillStyle = definition.accent;
    }
  }

  if (definition.texture === "water") {
    context.globalAlpha = 0.35;
    context.fillStyle = definition.accent;
    for (let y = 1; y < size; y += 4) {
      context.fillRect(0, y, size, 1);
    }
    context.globalAlpha = 1;
  }

  if (definition.texture === "lantern") {
    context.fillStyle = "#493326";
    context.fillRect(0, 0, size, 2);
    context.fillRect(0, size - 2, size, 2);
    context.fillRect(0, 0, 2, size);
    context.fillRect(size - 2, 0, 2, size);
    context.fillStyle = definition.accent;
    context.fillRect(4, 4, 8, 8);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

export function createBlockMaterials(): Map<BlockId, THREE.Material> {
  const materials = new Map<BlockId, THREE.Material>();

  for (const definition of Object.values(BLOCKS)) {
    const map = createTexture(definition);
    let material: THREE.Material;

    if (definition.liquid) {
      material = new THREE.MeshPhongMaterial({
        map,
        color: 0xffffff,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        shininess: 90,
      });
    } else {
      const parameters: THREE.MeshLambertMaterialParameters = {
        map,
        color: 0xffffff,
        transparent: Boolean(definition.transparent),
        alphaTest: definition.transparent ? 0.18 : 0,
      };
      if (definition.emissive) {
        parameters.emissive = new THREE.Color("#7a4a13");
        parameters.emissiveIntensity = 0.8;
      }
      material = new THREE.MeshLambertMaterial(parameters);
    }

    materials.set(definition.id, material);
  }

  return materials;
}

export function isSolidBlock(id: BlockId | undefined): boolean {
  if (!id) {
    return false;
  }
  return !BLOCKS[id].liquid;
}

export function isTransparentBlock(id: BlockId | undefined): boolean {
  if (!id) {
    return true;
  }
  return Boolean(BLOCKS[id].transparent);
}
