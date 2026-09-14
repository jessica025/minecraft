import { test, expect } from "@playwright/test";

test("trackpad scrolling never changes selection; number keys and hotbar clicks still work", async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock =
      () => Promise.reject(new Error("Test embedded-browser fallback"));
  });
  await page.goto("/");
  await page.getByLabel("世界种子", { exact: true }).fill("TRACKPAD-QA");
  await page.getByRole("button", { name: "生成新世界" }).click();
  await expect(page.locator("#crosshair")).toBeVisible();
  await page.keyboard.press("Digit1");
  const selected = page.locator(".hotbar-slot.selected");
  await expect(selected).toHaveAttribute("aria-label", "草方块");
  const cancelled = await page.evaluate(async () => {
    const canvas = document.querySelector("#game-canvas")!;
    let allCancelled = true;
    for (let i = 0; i < 40; i++) {
      const event = new WheelEvent("wheel", {
        deltaY: i < 10 ? 12 : 1, bubbles: true, cancelable: true,
      });
      canvas.dispatchEvent(event);
      allCancelled &&= event.defaultPrevented;
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    return allCancelled;
  });
  expect(cancelled).toBe(true);
  await expect(selected).toHaveAttribute("aria-label", "草方块");
  await page.waitForTimeout(220);
  await page.locator("#game-canvas").dispatchEvent("wheel", { deltaX: 100, deltaY: 0 });
  await page.locator("#game-canvas").dispatchEvent("wheel", { deltaY: 120, ctrlKey: true });
  await expect(selected).toHaveAttribute("aria-label", "草方块");
  await page.waitForTimeout(220);
  await page.locator("#game-canvas").dispatchEvent("wheel", { deltaY: -80 });
  await expect(selected).toHaveAttribute("aria-label", "草方块");
  await page.keyboard.press("Digit2");
  await expect(selected).toHaveAttribute("aria-label", "泥土");
  await page.locator('.hotbar-slot[aria-label="石头"]').click();
  await expect(selected).toHaveAttribute("aria-label", "石头");
});
