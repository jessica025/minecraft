import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import "./style.css";
import {
  BLOCKS,
  HOTBAR_ITEMS,
  ITEM_LABELS,
  type BlockId,
  type HotbarItem,
} from "./game/blocks";
import { BlockParticles, GameAudio } from "./game/effects";
import { WorldEnvironment } from "./game/environment";
import {
  isNightTime,
  MAX_NIGHTLINGS,
  MobManager,
} from "./game/mobs";
import {
  evaluatePlacement,
  faceOffset,
  type PlacementBlockReason,
  type PlacementEvaluation,
} from "./game/placement";
import { PlacementInputController } from "./game/placement-input";
import { Player } from "./game/player";
import { raycastVoxels } from "./game/raycast";
import { decodeSave, MAX_SAVE_BYTES } from "./game/save";
import {
  type SavedWorld,
  VoxelWorld,
  WORLD_RADIUS,
} from "./game/world";

function element<T extends HTMLElement>(selector: string): T {
  const result = document.querySelector<T>(selector);
  if (!result) {
    throw new Error(`Missing element: ${selector}`);
  }
  return result;
}

const canvas = element<HTMLCanvasElement>("#game-canvas");
const startScreen = element<HTMLElement>("#start-screen");
const pauseScreen = element<HTMLElement>("#pause-screen");
const startButton = element<HTMLButtonElement>("#start-button");
const resumeButton = element<HTMLButtonElement>("#resume-button");
const saveButton = element<HTMLButtonElement>("#save-button");
const quitButton = element<HTMLButtonElement>("#quit-button");
const randomSeedButton = element<HTMLButtonElement>("#random-seed");
const seedInput = element<HTMLInputElement>("#seed-input");
const hud = element<HTMLElement>("#hud");
const hotbar = element<HTMLElement>("#hotbar");
const actionHint = element<HTMLElement>("#action-hint");
const crosshair = element<HTMLElement>("#crosshair");
const targetHint = element<HTMLElement>("#target-hint");
const interactionHint = element<HTMLElement>("#interaction-hint");
const worldTimeLabel = element<HTMLElement>("#world-time");
const biomeLabel = element<HTMLElement>("#biome-label");
const positionLabel = element<HTMLElement>("#position-label");
const healthMeter = element<HTMLElement>("#health-meter");
const staminaMeter = element<HTMLElement>("#stamina-meter");
const toastRegion = element<HTMLElement>("#toast-region");
const guideButton = element<HTMLButtonElement>("#guide-button");
const guidePanel = element<HTMLElement>("#guide-panel");
const guideClose = element<HTMLButtonElement>("#guide-close");
const guideForm = element<HTMLFormElement>("#guide-form");
const guideInput = element<HTMLInputElement>("#guide-input");
const guideOutput = element<HTMLElement>("#guide-output");
const guideStatus = element<HTMLElement>("#guide-status");
const vignette = element<HTMLElement>("#vignette");

function createRenderer(): THREE.WebGLRenderer {
  try {
    return new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (error) {
    startButton.disabled = true;
    element<HTMLElement>(".hero-copy").textContent =
      "无法启动 3D 画面。请使用支持 WebGL 2 的桌面浏览器，开启硬件加速后刷新。";
    throw error;
  }
}
const renderer = createRenderer();
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  72,
  window.innerWidth / window.innerHeight,
  0.05,
  150,
);
scene.add(camera);

const environment = new WorldEnvironment(scene);
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
const audio = new GameAudio();
const clock = new THREE.Clock();
const placementFrameGeometry = new LineSegmentsGeometry();
placementFrameGeometry.setPositions(
  new Float32Array([
    -0.525, -0.525, 0,
    0.525, -0.525, 0,
    0.525, -0.525, 0,
    0.525, 0.525, 0,
    0.525, 0.525, 0,
    -0.525, 0.525, 0,
    -0.525, 0.525, 0,
    -0.525, -0.525, 0,
  ]),
);
const placementFrameMaterial = new LineMaterial({
  color: 0xffd84a,
  linewidth: 3.2,
  worldUnits: false,
  transparent: true,
  opacity: 1,
  depthTest: false,
  depthWrite: false,
});
placementFrameMaterial.toneMapped = false;
placementFrameMaterial.resolution.set(window.innerWidth, window.innerHeight);
const placementFrame = new LineSegments2(
  placementFrameGeometry,
  placementFrameMaterial,
);
placementFrame.computeLineDistances();
placementFrame.renderOrder = 20;
placementFrame.visible = false;
scene.add(placementFrame);

let world: VoxelWorld | null = null;
let player: Player | null = null;
let mobs: MobManager | null = null;
let particles: BlockParticles | null = null;
let selectedIndex = 0;
let gameStarted = false;
let paused = true;
let guideOpen = false;
let worldTime = 0.32;
let wasNight = false;
let totalElapsed = 0;
let hudAccumulator = 0;
let saveAccumulator = 0;
let swingTime = 0;
let heldItem: THREE.Group | null = null;
let fallbackControls = false;
let draggingLook = false;
let dragDistance = 0;
let lastDragX = 0;
let lastDragY = 0;
let fallbackTimer: number | null = null;
let playRequestVersion = 0;
let lastPlacementFeedbackAt = -Infinity;
let lastPlacementFeedbackMessage = "";
let targetHintSignature = "";
let placementStreak = 0;
let lastPlacedAt = -Infinity;
let guideRequest: AbortController | null = null;
let saveUnavailable = false;
let savedSnapshot: string | null = null;
let saveConflict = false;

const PLACEMENT_REPEAT_MS = 185;
const placementInput = new PlacementInputController(
  () => performAction(2),
  PLACEMENT_REPEAT_MS,
);

function createMeter(container: HTMLElement, count: number, className: string): void {
  if (container.dataset.value === String(count)) return;
  container.dataset.value = String(count);
  container.setAttribute("aria-label", `${className === "health-cell" ? "生命" : "体力"} ${count}/10`);
  if (container.children.length === 10) {
    [...container.children].forEach((cell, index) => cell.classList.toggle("filled", index < count));
    return;
  }
  container.replaceChildren();
  for (let index = 0; index < 10; index += 1) {
    const cell = document.createElement("span");
    cell.className = `${className}${index < count ? " filled" : ""}`;
    container.append(cell);
  }
}

function updateMeters(): void {
  if (!player) {
    return;
  }
  createMeter(healthMeter, Math.ceil(player.health), "health-cell");
  createMeter(staminaMeter, Math.ceil(player.stamina), "stamina-cell");
}

function createHotbar(): void {
  hotbar.replaceChildren();
  HOTBAR_ITEMS.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(index);
    button.className = "hotbar-slot";
    button.setAttribute("aria-label", ITEM_LABELS[item]);
    const number = document.createElement("span");
    number.className = "slot-number";
    number.textContent = String(index + 1);
    const icon = document.createElement("span");
    icon.className = item === "spear" ? "item-icon spear-icon" : "item-icon block-icon";
    if (item !== "spear") {
      icon.style.setProperty("--block-color", BLOCKS[item].color);
      icon.style.setProperty("--block-accent", BLOCKS[item].accent);
    }
    const label = document.createElement("span");
    label.className = "slot-label";
    label.textContent = ITEM_LABELS[item];
    button.append(number, icon, label);
    button.addEventListener("click", () => selectHotbar(index));
    hotbar.append(button);
  });
  selectHotbar(0, false);
}

function selectHotbar(index: number, notify = true): void {
  selectedIndex = (index + HOTBAR_ITEMS.length) % HOTBAR_ITEMS.length;
  for (const slot of hotbar.querySelectorAll<HTMLElement>(".hotbar-slot")) {
    slot.classList.toggle("selected", Number(slot.dataset.index) === selectedIndex);
  }
  updateHeldItem();
  if (notify && gameStarted) {
    showToast(ITEM_LABELS[HOTBAR_ITEMS[selectedIndex]]);
  }
}

function updateHeldItem(): void {
  if (heldItem) {
    camera.remove(heldItem);
    heldItem.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
  }

  const item = HOTBAR_ITEMS[selectedIndex];
  const group = new THREE.Group();
  group.position.set(0.56, -0.5, -0.9);
  group.rotation.set(-0.12, -0.35, -0.12);

  if (item === "spear") {
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.065, 0.065, 1.25),
      new THREE.MeshLambertMaterial({ color: "#795537" }),
    );
    shaft.rotation.x = -0.35;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.34, 4),
      new THREE.MeshLambertMaterial({ color: "#b9c4c1" }),
    );
    tip.rotation.x = Math.PI / 2 - 0.35;
    tip.position.set(0, 0.2, -0.66);
    group.add(shaft, tip);
  } else {
    const definition = BLOCKS[item];
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.32, 0.32),
      new THREE.MeshLambertMaterial({ color: definition.color }),
    );
    cube.rotation.set(0.25, 0.42, 0.1);
    group.add(cube);
  }

  heldItem = group;
  camera.add(group);
}

function animateHeldItem(delta: number): void {
  if (!heldItem) {
    return;
  }
  swingTime = Math.max(0, swingTime - delta);
  const progress = swingTime > 0 ? 1 - swingTime / 0.22 : 0;
  const swing = swingTime > 0 ? Math.sin(progress * Math.PI) : 0;
  heldItem.rotation.x = -0.12 - swing * 0.85;
  heldItem.rotation.y = -0.35 + swing * 0.48;
  heldItem.position.y = -0.5 - swing * 0.08;
}

function showToast(message: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.classList.add("leaving"), 1500);
  window.setTimeout(() => toast.remove(), 1850);
}

function storageKey(seed: string): string {
  return `blockfrontier:world:${seed}`;
}

function readSavedWorld(seed: string): SavedWorld | null {
  saveUnavailable = false;
  saveConflict = false;
  savedSnapshot = null;
  try {
    savedSnapshot = localStorage.getItem(storageKey(seed));
  } catch {
    saveUnavailable = true;
    showToast("浏览器存储不可用，请在暂停菜单导出备份");
    return null;
  }
  // Let creation fail rather than silently overwriting an unreadable save.
  return savedSnapshot === null ? null : decodeSave(savedSnapshot, seed);
}

function saveWorld(showMessage = false): boolean {
  if (!world || saveConflict) {
    if (showMessage && saveConflict) showToast("另一页面已更新存档，请导出当前进度后重新载入");
    return false;
  }
  try {
    const key = storageKey(world.seed);
    if (localStorage.getItem(key) !== savedSnapshot) {
      saveConflict = true;
      showToast("另一页面已更新存档，已停止覆盖；请导出当前进度");
      return false;
    }
    const raw = JSON.stringify(world.serialize(worldTime, totalElapsed, player?.serialize()));
    localStorage.setItem(key, raw);
    savedSnapshot = raw;
    saveUnavailable = false;
  } catch {
    if (showMessage || !saveUnavailable) showToast("保存失败：存储空间不足或不可用，请导出备份");
    saveUnavailable = true;
    return false;
  }
  if (showMessage) {
    showToast("世界已保存");
    audio.notify();
  }
  return true;
}

async function startWorld(): Promise<void> {
  const seed = seedInput.value.trim() || "FANGJING-2026";
  startButton.disabled = true;
  startButton.querySelector("span")!.textContent = "正在生成地形";

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 40);
  });

  try {
    cancelGuideRequest();
    clearPendingFallback();
    clearPlacementHold();
    fallbackControls = false;
    draggingLook = false;
    player?.clearKeys();
    world?.dispose();
    mobs?.dispose();
    particles?.dispose();

    const saved = readSavedWorld(seed);
    world = new VoxelWorld(scene, seed);
    if (saved) {
      world.loadEdits(saved.edits);
      worldTime = saved.time;
      totalElapsed = saved.elapsed ?? 0;
    } else {
      worldTime = 0.32;
      totalElapsed = 0;
    }
    wasNight = isNightTime(worldTime);
    player = new Player(camera, world, {
      onJump: () => audio.jump(),
      onDamage: () => {
        vignette.classList.add("damage");
        window.setTimeout(() => vignette.classList.remove("damage"), 180);
        audio.hit();
        updateMeters();
      },
    });
    if (saved?.player) {
      player.restore(saved.player);
    }
    mobs = new MobManager(
      scene,
      world,
      (amount) => player?.takeDamage(amount),
      world.seedNumber,
    );
    particles = new BlockParticles(scene);
    gameStarted = true;
    paused = true;
    guideOpen = false;
    hudAccumulator = 0;
    saveAccumulator = 0;
    guideInput.value = "";
    guideOutput.innerHTML =
      '<span class="guide-avatar">AI</span><p>我可以根据你所在的位置、时间和附近资源，给出一个简短的探索目标。</p>';
    guideStatus.textContent = "等待连接";
    startScreen.classList.remove("active");
    pauseScreen.classList.remove("active");
    guidePanel.classList.remove("active");
    hud.classList.remove("hidden");
    hotbar.classList.remove("hidden");
    actionHint.classList.remove("hidden");
    crosshair.classList.remove("hidden");
    targetHint.classList.add("hidden");
    interactionHint.classList.remove("hidden");
    updateMeters();
    updateHud();
    if (saved) {
      showToast("已载入保存的世界");
    } else {
      showToast(`世界种子：${seed}`);
    }
    beginPlay();
  } catch (error) {
    console.error("World creation failed", error);
    clearPendingFallback();
    gameStarted = false;
    paused = true;
    world?.dispose();
    mobs?.dispose();
    particles?.dispose();
    world = null;
    player = null;
    mobs = null;
    particles = null;
    startScreen.classList.add("active");
    hud.classList.add("hidden");
    hotbar.classList.add("hidden");
    actionHint.classList.add("hidden");
    crosshair.classList.add("hidden");
    targetHint.classList.add("hidden");
    placementFrame.visible = false;
    showToast("无法载入世界，原存档已保留；请更换种子或恢复备份");
  } finally {
    startButton.disabled = false;
    startButton.querySelector("span")!.textContent = "生成新世界";
  }
}

function quitToMenu(discard = false): void {
  if (!discard && !saveWorld(true)) {
    element<HTMLElement>("#discard-button").classList.remove("hidden");
    return;
  }
  element<HTMLElement>("#discard-button").classList.add("hidden");
  cancelGuideRequest();
  gameStarted = false;
  paused = true;
  guideOpen = false;
  fallbackControls = false;
  draggingLook = false;
  clearPendingFallback();
  clearPlacementHold();
  player?.clearKeys();
  document.exitPointerLock();
  world?.dispose();
  mobs?.dispose();
  particles?.dispose();
  world = null;
  player = null;
  mobs = null;
  particles = null;
  startScreen.classList.add("active");
  pauseScreen.classList.remove("active");
  guidePanel.classList.remove("active");
  hud.classList.add("hidden");
  hotbar.classList.add("hidden");
  actionHint.classList.add("hidden");
  crosshair.classList.add("hidden");
  targetHint.classList.add("hidden");
  interactionHint.classList.add("hidden");
  placementFrame.visible = false;
}

function toggleGuide(open = !guideOpen): void {
  if (!gameStarted) {
    return;
  }
  guideOpen = open;
  guidePanel.classList.toggle("active", guideOpen);
  pauseScreen.classList.remove("active");
  if (guideOpen) {
    clearPendingFallback();
    clearPlacementHold();
    document.exitPointerLock();
    fallbackControls = false;
    draggingLook = false;
    paused = true;
    player?.clearKeys();
    guideInput.focus();
  } else {
    cancelGuideRequest();
    guideInput.blur();
    beginPlay();
  }
}

function cancelGuideRequest(): void {
  guideRequest?.abort();
  guideRequest = null;
  guideOutput.classList.remove("loading");
}

function clearPendingFallback(): void {
  playRequestVersion += 1;
  if (fallbackTimer !== null) {
    window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

function beginPlay(): void {
  if (!gameStarted) {
    return;
  }
  clearPendingFallback();
  clearPlacementHold();
  const requestVersion = playRequestVersion;
  paused = true;
  draggingLook = false;
  player?.clearKeys();
  pauseScreen.classList.remove("active");
  const activateFallback = () => {
    if (
      requestVersion === playRequestVersion &&
      document.pointerLockElement !== canvas &&
      gameStarted &&
      !guideOpen &&
      !fallbackControls
    ) {
      fallbackControls = true;
      paused = false;
      pauseScreen.classList.remove("active");
      interactionHint.classList.add("hidden");
      crosshair.classList.remove("hidden");
      showToast("拖动鼠标转向，按 Esc 暂停");
    }
  };
  fallbackTimer = window.setTimeout(() => {
    fallbackTimer = null;
    activateFallback();
  }, 260);
  try {
    const request = canvas.requestPointerLock();
    if (request instanceof Promise) {
      void request.catch(activateFallback);
    }
  } catch {
    activateFallback();
  }
}

function fallbackGuide(prompt: string): string {
  if (!world || !player) {
    return "先生成一个世界，我才能读取附近环境。";
  }
  const biome = world.getBiomeLabel(player.position.x, player.position.z);
  const resources = Object.keys(world.getNearbySummary(player.position, 5)).slice(0, 3);
  const isNight = isNightTime(worldTime);
  if (prompt.includes("建筑") || prompt.includes("挑战")) {
    return `试着在${biome}建一座三层瞭望塔：底层用石头，中层留出环形窗，顶层放一盏铜灯。完成后从塔顶观察下一片地貌。`;
  }
  if (prompt.includes("选址") || prompt.includes("建家")) {
    return `你正在${biome}，附近常见${resources.join("、") || "基础方块"}。选择一块高出水面两格以上的平地，把入口朝向日落方向，夜里更容易辨认归途。`;
  }
  return isNight
    ? `夜色已经降临。先收集附近的${resources[0] ?? "石头"}，放置铜灯划出安全范围，再沿高地短距离侦察。`
    : `现在适合向${biome}边缘探索。带上一盏铜灯，每隔一段距离做路标，并在日落前返回出生点附近。`;
}

async function askGuide(prompt: string): Promise<void> {
  if (!world || !player || !mobs) {
    return;
  }
  const trimmed = prompt.trim();
  if (!trimmed) {
    return;
  }

  guideOutput.classList.add("loading");
  guideOutput.innerHTML = '<span class="guide-avatar">AI</span><p>正在读取世界状态...</p>';
  guideStatus.textContent = "正在查询世界向导";

  const context = {
    seed: world.seed,
    day: Math.floor(totalElapsed / 360) + 1,
    time: formatClock(worldTime),
    biome: world.getBiomeLabel(player.position.x, player.position.z),
    position: {
      x: Math.round(player.position.x),
      y: Math.round(player.position.y),
      z: Math.round(player.position.z),
    },
    health: player.health,
    stamina: Math.round(player.stamina),
    selectedItem: ITEM_LABELS[HOTBAR_ITEMS[selectedIndex]],
    nearbyBlocks: world.getNearbySummary(player.position),
    nearbyCreatures: mobs.nearbyLabels(player.position),
  };

  cancelGuideRequest();
  guideOutput.classList.add("loading");
  const abortController = new AbortController();
  guideRequest = abortController;
  const timeout = window.setTimeout(() => abortController.abort(), 16_000);
  try {
    const response = await fetch("/api/guide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: trimmed, context }),
      signal: abortController.signal,
    });
    const body = (await response.json()) as {
      text?: string;
      error?: string;
      modelId?: string;
    };
    if (guideRequest !== abortController) return;
    if (!response.ok || !body.text) {
      throw new Error(body.error ?? "Bedrock Runtime unavailable");
    }
    guideOutput.innerHTML = '<span class="guide-avatar">AI</span><p></p>';
    guideOutput.querySelector("p")!.textContent = body.text;
    guideStatus.textContent = "世界向导已连接";
    audio.notify();
  } catch {
    if (guideRequest !== abortController) return;
    guideOutput.innerHTML = '<span class="guide-avatar">AI</span><p></p>';
    guideOutput.querySelector("p")!.textContent = fallbackGuide(trimmed);
    guideStatus.textContent = "网络向导暂不可用，已提供本地建议";
  } finally {
    window.clearTimeout(timeout);
    if (guideRequest === abortController) {
      guideRequest = null;
      guideOutput.classList.remove("loading");
    }
  }
}

function formatClock(time: number): string {
  const hours = Math.floor((time % 1) * 24);
  const minutes = Math.floor(((time % 1) * 24 - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function updateHud(): void {
  if (!world || !player) {
    return;
  }
  const day = Math.floor(totalElapsed / 360) + 1;
  const isNight = isNightTime(worldTime);
  worldTimeLabel.textContent =
    `第 ${day} 天 ${formatClock(worldTime)} · ${isNight ? "夜晚" : "白昼"}`;
  const biome = world.getBiomeLabel(player.position.x, player.position.z);
  biomeLabel.textContent = isNight
    ? `${biome} · 夜怪 ${mobs?.count("nightling") ?? 0}/${MAX_NIGHTLINGS}`
    : biome;
  positionLabel.textContent = `X ${Math.round(player.position.x)} · Y ${Math.round(
    player.position.y,
  )} · Z ${Math.round(player.position.z)}`;
  updateMeters();
}

function placementFeedback(message: string): void {
  const now = performance.now();
  if (
    message === lastPlacementFeedbackMessage &&
    now - lastPlacementFeedbackAt < 650
  ) {
    return;
  }
  lastPlacementFeedbackAt = now;
  lastPlacementFeedbackMessage = message;
  showToast(message);
}

function recordPlacement(): void {
  const now = performance.now();
  placementStreak =
    now - lastPlacedAt <= PLACEMENT_REPEAT_MS * 2.5
      ? placementStreak + 1
      : 1;
  lastPlacedAt = now;
}

function recentPlacementSuffix(): string {
  if (
    placementStreak >= 2 &&
    performance.now() - lastPlacedAt < 1600
  ) {
    return ` · 已连续放置 ${placementStreak} 格`;
  }
  return "";
}

function clearPlacementHold(): void {
  placementInput.clear();
}

function setTargetHint(
  message: string,
  state: "neutral" | "valid" | "blocked" = "neutral",
): void {
  const signature = `${state}:${message}`;
  if (signature === targetHintSignature) {
    return;
  }
  targetHintSignature = signature;
  targetHint.textContent = message;
  targetHint.classList.toggle("valid", state === "valid");
  targetHint.classList.toggle("blocked", state === "blocked");
}

function setPlacementFrame(
  evaluation: PlacementEvaluation | null,
  normal: { x: number; y: number; z: number } | null,
): void {
  if (!evaluation?.position || !normal) {
    placementFrame.visible = false;
    return;
  }

  const normalVector = new THREE.Vector3(
    normal.x,
    normal.y,
    normal.z,
  ).normalize();
  placementFrame.position.set(
    evaluation.position.x,
    evaluation.position.y,
    evaluation.position.z,
  ).addScaledVector(normalVector, -0.49);
  placementFrame.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normalVector,
  );
  placementFrameMaterial.color.set(evaluation.valid ? "#ffd84a" : "#ff3b30");
  placementFrame.visible = true;
}

function placementReasonMessage(reason: PlacementBlockReason): string {
  switch (reason) {
    case "outside-world":
      return "红色框超出世界边界，换一个位置";
    case "occupied":
      return "红色框的位置已有方块；先左键删除或换一个面";
    case "player-overlap":
      return "红色框碰到你了；按 S 后退一步再放";
    case "invalid-face":
      return "没有找到可放置的方块面";
  }
}

function getPlacementTarget(): {
  sourceBlock: BlockId;
  normal: { x: number; y: number; z: number } | null;
  evaluation: PlacementEvaluation;
} | null {
  if (!world || !player) {
    return null;
  }

  raycaster.far = 6;
  camera.updateMatrixWorld();
  raycaster.setFromCamera(center, camera);
  const hit = raycastVoxels(raycaster.ray, raycaster.far, (x, y, z) => world!.getBlock(x, y, z));
  if (!hit || hit.distance > raycaster.far) {
    return null;
  }

  const source = hit.position;
  if (!source) {
    return null;
  }

  const sourceBlock = world.getBlock(source.x, source.y, source.z);
  if (!sourceBlock) {
    return null;
  }
  const normal = faceOffset(hit.normal);

  return {
    sourceBlock,
    normal,
    evaluation: evaluatePlacement(
      source,
      hit.normal,
      player.position,
      (x, y, z) => world?.getBlock(x, y, z),
    ),
  };
}

function updateHeldPlacement(): void {
  placementInput.update(performance.now());
}

function performAction(button: number): void {
  if (!world || !player || !mobs || !particles || paused || guideOpen) {
    return;
  }

  const item = HOTBAR_ITEMS[selectedIndex];
  if (button === 2 && item === "spear") {
    placementFeedback("长矛不能放置，请选择第 1–7 格方块");
    return;
  }

  if (button === 2) {
    const target = getPlacementTarget();
    swingTime = 0.22;
    if (!target) {
      placementFeedback(
        "把屏幕中央的白色十字移到附近方块上；黄色框就是新方块的位置",
      );
      return;
    }
    if (!target.evaluation.valid) {
      placementFeedback(placementReasonMessage(target.evaluation.reason));
      return;
    }

    const { x, y, z } = target.evaluation.position;
    if (world.setBlock(x, y, z, item as BlockId)) {
      particles.burst(new THREE.Vector3(x, y, z), item as BlockId, 5);
      audio.place();
      saveAccumulator = 9;
      recordPlacement();
      placementFeedback(`已放置${ITEM_LABELS[item]}`);
    } else {
      placementFeedback("这个位置已失效，请重新对准");
    }
    return;
  }

  raycaster.far = item === "spear" ? 7.5 : 6;
  camera.updateMatrixWorld();
  raycaster.setFromCamera(center, camera);
  const blockHit = raycastVoxels(raycaster.ray, raycaster.far, (x, y, z) => world!.getBlock(x, y, z));
  scene.updateMatrixWorld();
  const mobHit = mobs.raycast(raycaster);
  swingTime = 0.22;

  if (
    button === 0 &&
    mobHit &&
    mobHit.distance <= raycaster.far &&
    (!blockHit || mobHit.distance < blockHit.distance)
  ) {
    if (!player.canAttack(item === "spear" ? 420 : 300)) {
      return;
    }
    const defeated = mobs.damage(
      mobHit.mobId,
      item === "spear" ? 3 : 1,
      player.position,
    );
    particles.burst(mobHit.point, item === "spear" ? "stone" : "dirt", 8);
    audio.hit();
    if (defeated) {
      showToast(`击退了${defeated}`);
    }
    return;
  }

  if (!blockHit || blockHit.distance > raycaster.far) {
    return;
  }

  const blockPosition = blockHit.position;
  if (!blockPosition) {
    return;
  }

  if (button === 0 && item !== "spear") {
    const block = world.getBlock(blockPosition.x, blockPosition.y, blockPosition.z);
    if (block && world.setBlock(blockPosition.x, blockPosition.y, blockPosition.z, null)) {
      particles.burst(blockHit.point, block);
      audio.mine();
      saveAccumulator = 9;
      showToast(`已删除${BLOCKS[block].label}`);
    } else if (block === "bedrock") {
      showToast("基岩无法被破坏");
    }
  }

}

function updateSelection(): void {
  if (!world || paused || guideOpen) {
    placementFrame.visible = false;
    targetHint.classList.add("hidden");
    return;
  }

  targetHint.classList.remove("hidden");
  const item = HOTBAR_ITEMS[selectedIndex];
  if (item !== "spear") {
    const target = getPlacementTarget();
    if (!target) {
      placementFrame.visible = false;
      setTargetHint(
        "准星未选中方块：移动视角；左键删除，右键 / F 放置",
      );
      return;
    }

    const selectedLabel = BLOCKS[target.sourceBlock].label;
    setPlacementFrame(target.evaluation, target.normal);
    if (target.evaluation.valid) {
      setTargetHint(
        `已选中${selectedLabel}：左键删除 · 黄色框右键 / F 放置${ITEM_LABELS[item]}${recentPlacementSuffix()}`,
        "valid",
      );
    } else {
      setTargetHint(
        `已选中${selectedLabel}：左键删除 · ${placementReasonMessage(target.evaluation.reason)}`,
        "blocked",
      );
    }
    return;
  }

  placementFrame.visible = false;
  setTargetHint("长矛不能放置；切换第 1–7 格即可建造", "blocked");
}

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  placementFrameMaterial.resolution.set(window.innerWidth, window.innerHeight);
}

function animate(): void {
  const delta = Math.min(clock.getDelta(), 0.05);

  if (gameStarted && world && player && mobs && particles) {
    const active = !paused && !guideOpen;
    if (active) {
      totalElapsed += delta;
      worldTime = (worldTime + delta / 360) % 1;
      const isNight = isNightTime(worldTime);
      if (isNight !== wasNight) {
        wasNight = isNight;
        if (isNight) {
          showToast(`夜幕降临：夜行苔灵最多 ${MAX_NIGHTLINGS} 只，铜灯可照明`);
        } else {
          player.heal(1);
          showToast("天亮了：夜行苔灵正在消散，恢复 1 点生命");
        }
        updateHud();
      }
    }
    player.update(delta, active);
    if (active) {
      updateHeldPlacement();
      mobs.update(delta, worldTime, player.position);
      particles.update(delta);
      animateHeldItem(delta);
    }
    environment.update(active ? delta : 0, worldTime, player.position);
    updateSelection();

    hudAccumulator += active ? delta : 0;
    saveAccumulator += active ? delta : 0;
    if (hudAccumulator >= 0.15) {
      updateHud();
      hudAccumulator = 0;
    }
    if (saveAccumulator >= 10) {
      saveWorld();
      saveAccumulator = 0;
    }
  } else {
    environment.update(delta, 0.32, new THREE.Vector3());
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

document.addEventListener("pointerlockchange", () => {
  if (!gameStarted) {
    return;
  }
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    clearPendingFallback();
    fallbackControls = false;
  } else {
    clearPlacementHold();
  }
  paused = !locked && !fallbackControls;
  player?.clearKeys();
  crosshair.classList.toggle("hidden", !locked && !fallbackControls);
  interactionHint.classList.toggle("hidden", locked || fallbackControls || guideOpen);
  if (!locked && !fallbackControls && !guideOpen) {
    pauseScreen.classList.add("active");
  } else {
    pauseScreen.classList.remove("active");
  }
});

document.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === canvas && player) {
    player.addLook(event.movementX, event.movementY);
  } else if (fallbackControls && draggingLook && player) {
    const deltaX = event.clientX - lastDragX;
    const deltaY = event.clientY - lastDragY;
    dragDistance += Math.abs(deltaX) + Math.abs(deltaY);
    lastDragX = event.clientX;
    lastDragY = event.clientY;
    player.addLook(deltaX, deltaY);
  }
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (event.code === "Escape") {
    if (guideOpen) {
      event.preventDefault();
      toggleGuide(false);
      return;
    }
    if (fallbackControls) {
      clearPendingFallback();
      clearPlacementHold();
      fallbackControls = false;
      draggingLook = false;
      paused = true;
      player?.clearKeys();
      pauseScreen.classList.add("active");
      interactionHint.classList.remove("hidden");
      crosshair.classList.add("hidden");
      return;
    }
  }
  if (event.code === "KeyG" && !event.repeat && !typing) {
    event.preventDefault();
    toggleGuide();
    return;
  }
  if (typing) {
    return;
  }
  if (
    event.code === "KeyF" &&
    (document.pointerLockElement === canvas || fallbackControls)
  ) {
    event.preventDefault();
    if (!event.repeat) {
      placementInput.keyboardDown(performance.now());
    }
    return;
  }
  if (event.code.startsWith("Digit")) {
    const index = Number(event.code.slice(5)) - 1;
    if (index >= 0 && index < HOTBAR_ITEMS.length) {
      selectHotbar(index);
    }
  }
  if (document.pointerLockElement === canvas || fallbackControls) {
    player?.setKey(event.code, true);
    if (["Space", "ArrowUp", "ArrowDown"].includes(event.code)) {
      event.preventDefault();
    }
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "KeyF") {
    placementInput.keyboardUp();
  }
  player?.setKey(event.code, false);
});

canvas.addEventListener("mousedown", (event) => {
  if (!gameStarted) {
    return;
  }
  if (document.pointerLockElement !== canvas && !fallbackControls) {
    beginPlay();
    return;
  }
  if (event.button === 2 || (event.button === 0 && event.ctrlKey)) {
    event.preventDefault();
    placementInput.pointerDown(performance.now());
    return;
  }
  if (fallbackControls && event.button === 0) {
    draggingLook = true;
    dragDistance = 0;
    lastDragX = event.clientX;
    lastDragY = event.clientY;
    return;
  }
  performAction(event.button);
});

document.addEventListener("mouseup", (event) => {
  if (
    event.button === 2 ||
    event.button === 0
  ) {
    placementInput.pointerUp();
  }
  if (fallbackControls && event.button === 0 && draggingLook) {
    draggingLook = false;
    if (dragDistance < 8) {
      performAction(0);
    }
  }
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  if (
    gameStarted &&
    !paused &&
    !guideOpen &&
    (document.pointerLockElement === canvas || fallbackControls)
  ) {
    placementInput.contextMenu(performance.now());
  }
});
canvas.addEventListener(
  "wheel",
  (event) => {
    if (gameStarted && !paused && !guideOpen) {
      event.preventDefault();
    }
  },
  { passive: false },
);

startButton.addEventListener("click", startWorld);
resumeButton.addEventListener("click", beginPlay);
saveButton.addEventListener("click", () => saveWorld(true));
quitButton.addEventListener("click", () => quitToMenu());
element<HTMLButtonElement>("#discard-button").addEventListener("click", () => quitToMenu(true));
randomSeedButton.addEventListener("click", () => {
  const words = ["COPPER", "CHERRY", "MIST", "RIDGE", "LANTERN", "RIVER"];
  const word = words[Math.floor(Math.random() * words.length)];
  seedInput.value = `${word}-${Math.floor(1000 + Math.random() * 9000)}`;
});
guideButton.addEventListener("click", () => toggleGuide(true));
guideClose.addEventListener("click", () => toggleGuide(false));
guideForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void askGuide(guideInput.value);
});
for (const chip of document.querySelectorAll<HTMLButtonElement>("[data-prompt]")) {
  chip.addEventListener("click", () => {
    const prompt = chip.dataset.prompt ?? "";
    guideInput.value = prompt;
    void askGuide(prompt);
  });
}
window.addEventListener("resize", resize);
window.addEventListener("blur", () => {
  player?.clearKeys();
  draggingLook = false;
  clearPlacementHold();
  if (gameStarted && !guideOpen) {
    clearPendingFallback();
    fallbackControls = false;
    paused = true;
    document.exitPointerLock();
    pauseScreen.classList.add("active");
    interactionHint.classList.remove("hidden");
    crosshair.classList.add("hidden");
    targetHint.classList.add("hidden");
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    saveWorld();
    window.dispatchEvent(new Event("blur"));
  }
});
window.addEventListener("pagehide", () => saveWorld());
canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  saveWorld();
  window.dispatchEvent(new Event("blur"));
  showToast("图形设备暂时中断，进度已尝试保存；请刷新页面恢复");
});
canvas.addEventListener("webglcontextrestored", () => {
  showToast("图形设备已恢复，可以继续探索");
});
element<HTMLButtonElement>("#export-button").addEventListener("click", () => {
  if (!world) return;
  const raw = JSON.stringify(world.serialize(worldTime, totalElapsed, player?.serialize()), null, 2);
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `blockfrontier-${world.seed.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const importFile = element<HTMLInputElement>("#import-file");
element<HTMLButtonElement>("#import-button").addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  const status = element<HTMLElement>("#storage-status");
  importFile.value = "";
  if (!file) return;
  try {
    if (file.size > MAX_SAVE_BYTES) throw new Error("File too large");
    const raw = await file.text();
    const candidate: unknown = JSON.parse(raw);
    const seed = candidate && typeof candidate === "object" && "seed" in candidate ? candidate.seed : null;
    if (typeof seed !== "string" || seed !== seed.trim() ||
        !/^[^\p{Cc}]{1,32}$/u.test(seed)) throw new Error("Invalid seed");
    const saved = decodeSave(raw, seed);
    const key = storageKey(seed);
    if (localStorage.getItem(key) !== null &&
        !window.confirm(`恢复“${seed}”将覆盖此种子的现有存档。确定恢复吗？`)) return;
    localStorage.setItem(key, JSON.stringify({ ...saved, version: 1 }));
    seedInput.value = seed;
    status.textContent = `已恢复“${seed}”，点击生成新世界即可继续。`;
  } catch {
    status.textContent = "恢复失败：备份无效、版本不兼容或浏览器存储不可用。现有存档未改变。";
  }
});
window.addEventListener("beforeunload", (event) => {
  if (gameStarted && !saveWorld()) {
    event.preventDefault();
    event.returnValue = "";
  }
});

createHotbar();
createMeter(healthMeter, 10, "health-cell");
createMeter(staminaMeter, 10, "stamina-cell");
updateHeldItem();
animate();
