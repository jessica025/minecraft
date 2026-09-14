import { test, expect, type Page } from "@playwright/test";

const seed = "RELEASE-QA";
const key = `blockfrontier:world:${seed}`;
const save = { version: 1, seed, edits: [], time: 0.32, elapsed: 0,
  player: { x:0, y:7.51, z:0, health:10, stamina:10, yaw:0, pitch:-0.65 } };

async function prepare(page: Page, data: unknown = save) {
  await page.addInitScript(({ key, data }) => {
    localStorage.setItem(key, typeof data === "string" ? data : JSON.stringify(data));
    // Embedded browsers use this supported fallback when pointer lock is denied.
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new Error("Test fallback"));
  }, { key, data });
  await page.goto("/");
}
async function start(page: Page, expectTarget = true) {
  await page.getByLabel("世界种子", { exact: true }).fill(seed);
  await page.getByRole("button", { name: "生成新世界" }).click();
  await expect(page.locator("#start-screen")).not.toHaveClass(/active/);
  await expect(page.locator("#crosshair")).toBeVisible();
  if (expectTarget) await expect(page.locator("#target-hint")).toContainText("已选中");
}
async function pause(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-screen")).toHaveClass(/active/);
}
async function snapshot(page: Page) {
  await page.getByRole("button", { name:"保存世界", exact:true }).click();
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
}

test("mine, place, save, export and resume without runtime errors", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await prepare(page);
  await start(page);
  await page.locator("#game-canvas").click({ position: { x:700, y:430 } });
  await expect(page.locator("#toast-region")).toContainText("已删除");
  await page.keyboard.press("f");
  await expect(page.locator("#toast-region")).toContainText("已放置");
  await page.screenshot({ path: info.outputPath("gameplay.png") });
  await pause(page);
  const saved = await snapshot(page);
  expect(saved.edits.length).toBeGreaterThan(0);
  const time = await page.locator("#world-time").textContent();
  await page.waitForTimeout(400);
  expect(await page.locator("#world-time").textContent()).toBe(time);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name:"导出备份" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`blockfrontier-${seed}.json`);
  await download.saveAs(info.outputPath("world-backup.json"));
  await page.getByRole("button", { name:"返回主菜单", exact:true }).click();
  await start(page);
  await pause(page);
  const restored = await snapshot(page);
  expect(restored.edits).toEqual(saved.edits);
  expect(Math.abs(restored.player.z-saved.player.z)).toBeLessThan(.1);
  expect(errors).toEqual([]);
});

test("movement, stamina, hotbar and blur pause work", async ({ page }) => {
  await prepare(page);
  await start(page);
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ShiftLeft");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ShiftLeft");
  await page.keyboard.press("Digit8");
  await expect(page.locator(".hotbar-slot.selected")).toHaveAttribute("aria-label","长矛");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator("#pause-screen")).toHaveClass(/active/);
  const saved = await snapshot(page);
  expect(saved.player.z).toBeLessThan(-1);
  expect(saved.player.stamina).toBeLessThan(10);
  const before = JSON.stringify(saved.player);
  await page.waitForTimeout(400);
  expect(JSON.stringify((await snapshot(page)).player)).toBe(before);
});

test("guide input accepts G and stale responses cannot overwrite the latest answer", async ({ page }) => {
  await prepare(page);
  await start(page);
  await page.keyboard.press("g");
  await expect(page.locator("#guide-panel")).toHaveClass(/active/);
  await page.locator("#guide-input").fill("building");
  await page.locator("#guide-input").press("g");
  await expect(page.locator("#guide-panel")).toHaveClass(/active/);
  await page.route("**/api/guide", async route => {
    const prompt = route.request().postDataJSON().prompt;
    if (prompt === "first") await new Promise(resolve => setTimeout(resolve, 650));
    await route.fulfill({ json: { text: prompt === "first" ? "旧回答" : "新回答" } }).catch(()=>{});
  });
  await page.locator("#guide-input").fill("first");
  await page.getByRole("button", { name:"发送", exact:true }).click();
  await page.locator("#guide-input").fill("second");
  await page.getByRole("button", { name:"发送", exact:true }).click();
  await expect(page.locator("#guide-output")).toContainText("新回答");
  await page.waitForTimeout(800);
  await expect(page.locator("#guide-output")).toContainText("新回答");
});

test("offline guide degrades to playable local advice", async ({ page }) => {
  await prepare(page);
  await page.route("**/api/guide", route => route.abort());
  await start(page);
  await page.keyboard.press("g");
  await page.getByRole("button", { name:"建筑挑战", exact:true }).click();
  await expect(page.locator("#guide-output")).toContainText("瞭望塔");
  await expect(page.locator("#guide-status")).toContainText("本地建议");
  await page.getByRole("button", { name:"关闭", exact:true }).click();
  await expect(page.locator("#crosshair")).toBeVisible();
});

test("corrupt save stays untouched and a different seed can still start", async ({ page }) => {
  await prepare(page, "{broken");
  await page.getByLabel("世界种子", { exact:true }).fill(seed);
  await page.getByRole("button", { name:"生成新世界" }).click();
  await expect(page.locator("#toast-region")).toContainText("原存档已保留");
  expect(await page.evaluate(key=>localStorage.getItem(key),key)).toBe("{broken");
  await page.getByLabel("世界种子", { exact:true }).fill("FRESH");
  await page.getByRole("button", { name:"生成新世界" }).click();
  await expect(page.locator("#crosshair")).toBeVisible();
});

test("quota failure is visible and backup/discard stay usable", async ({ page }) => {
  await prepare(page);
  await start(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  });
  await pause(page);
  await page.getByRole("button", { name:"返回主菜单", exact:true }).click();
  await expect(page.locator("#toast-region")).toContainText("保存失败");
  await expect(page.locator("#pause-screen")).toHaveClass(/active/);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name:"导出备份" }).click();
  await downloadEvent;
  await page.getByRole("button", { name:"放弃未保存进度并返回" }).click();
  await expect(page.locator("#start-screen")).toHaveClass(/active/);
});

test("concurrent save changes are preserved", async ({ page }) => {
  await prepare(page);
  await start(page);
  await page.evaluate(({key,save})=>localStorage.setItem(key,JSON.stringify({...save,elapsed:999})),{key,save});
  await pause(page);
  await page.getByRole("button", { name:"保存世界", exact:true }).click();
  await expect(page.locator("#toast-region")).toContainText("另一页面已更新存档");
  expect((await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key)).elapsed).toBe(999);
});

test("backups import with validation and invalid files do not replace data", async ({ page }) => {
  await prepare(page);
  await page.locator("#import-file").setInputFiles({
    name:"backup.json",mimeType:"application/json",
    buffer:Buffer.from(JSON.stringify({...save,seed:"IMPORTED",edits:[["1,8,0","lantern"]]})),
  });
  await expect(page.locator("#storage-status")).toContainText("已恢复");
  await expect(page.locator("#seed-input")).toHaveValue("IMPORTED");
  await page.locator("#import-file").setInputFiles({
    name:"bad.json",mimeType:"application/json",buffer:Buffer.from("{}"),
  });
  await expect(page.locator("#storage-status")).toContainText("恢复失败");
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("blockfrontier:world:IMPORTED")!).edits))
    .toEqual([["1,8,0","lantern"]]);
});

test("repeated world switches release GPU buffers", async ({ page }) => {
  await page.addInitScript(() => {
    const live=new Set<WebGLBuffer>();
    const proto=WebGL2RenderingContext.prototype;
    const create=proto.createBuffer, remove=proto.deleteBuffer;
    proto.createBuffer=function(){const buffer=create.call(this);if(buffer)live.add(buffer);return buffer;};
    proto.deleteBuffer=function(buffer){if(buffer)live.delete(buffer);remove.call(this,buffer);};
    Object.defineProperty(window,"qaBuffers",{get:()=>live.size});
  });
  await prepare(page);
  const counts:number[]=[];
  for(let i=0;i<5;i++) {
    await start(page);
    await page.waitForTimeout(250);
    await pause(page);
    counts.push(await page.evaluate(()=>Reflect.get(window,"qaBuffers") as number));
    await page.getByRole("button", {name:"返回主菜单",exact:true}).click();
  }
  expect(Math.max(...counts)-Math.min(...counts)).toBeLessThanOrEqual(8);
});

test("unsupported WebGL shows a recovery message", async ({ page }) => {
  await page.addInitScript(() => {
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:unknown[]) {
      if(kind.includes("webgl")) return null;
      return Reflect.apply(original,this,[kind,...args]);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.locator(".hero-copy")).toContainText("无法启动 3D 画面");
  await expect(page.locator("#start-button")).toBeDisabled();
});

test("night survives sustained rendering and pause freezes the clock", async ({page},info)=>{
  test.setTimeout(60_000);
  await prepare(page,{...save,time:.8,player:{...save.player,y:12.51},edits:[["0,12,0","stone"]]});
  await start(page, false);
  await expect(page.locator("#world-time")).toContainText("夜晚");
  await page.waitForTimeout(20_000);
  await expect(page.locator("#biome-label")).toContainText(/夜怪 [0-3]\/3/);
  await page.screenshot({path:info.outputPath("night.png")});
  await pause(page);
  const time=await page.locator("#world-time").textContent();
  await page.waitForTimeout(600);
  expect(await page.locator("#world-time").textContent()).toBe(time);
  expect((await snapshot(page)).player.health).toBeGreaterThan(0);
});
