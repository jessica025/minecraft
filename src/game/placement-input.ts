export type PlacementInputSource =
  | "keyboard"
  | "pointer"
  | "contextmenu"
  | "repeat";

export class PlacementInputController {
  private keyboardHeld = false;
  private pointerHeld = false;
  private nextRepeatAt = Infinity;
  private lastPointerPlacementAt = -Infinity;

  constructor(
    private readonly trigger: (source: PlacementInputSource) => void,
    private readonly repeatMs = 185,
    private readonly contextMenuDedupMs = 300,
  ) {}

  keyboardDown(now: number): void {
    if (this.keyboardHeld) {
      return;
    }
    this.keyboardHeld = true;
    this.trigger("keyboard");
    this.nextRepeatAt = now + this.repeatMs;
  }

  keyboardUp(): void {
    this.keyboardHeld = false;
    this.stopRepeatWhenReleased();
  }

  pointerDown(now: number): void {
    if (this.pointerHeld) {
      return;
    }
    this.pointerHeld = true;
    this.lastPointerPlacementAt = now;
    this.trigger("pointer");
    this.nextRepeatAt = now + this.repeatMs;
  }

  pointerUp(): void {
    this.pointerHeld = false;
    this.stopRepeatWhenReleased();
  }

  contextMenu(now: number): void {
    if (now - this.lastPointerPlacementAt < this.contextMenuDedupMs) {
      return;
    }
    this.trigger("contextmenu");
  }

  update(now: number): void {
    if (
      (!this.keyboardHeld && !this.pointerHeld) ||
      now < this.nextRepeatAt
    ) {
      return;
    }
    this.trigger("repeat");
    this.nextRepeatAt = now + this.repeatMs;
  }

  clear(): void {
    this.keyboardHeld = false;
    this.pointerHeld = false;
    this.nextRepeatAt = Infinity;
    this.lastPointerPlacementAt = -Infinity;
  }

  private stopRepeatWhenReleased(): void {
    if (!this.keyboardHeld && !this.pointerHeld) {
      this.nextRepeatAt = Infinity;
    }
  }
}
