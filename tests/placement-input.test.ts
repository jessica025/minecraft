import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PlacementInputController,
  type PlacementInputSource,
} from "../src/game/placement-input";

function createController(): {
  controller: PlacementInputController;
  events: PlacementInputSource[];
} {
  const events: PlacementInputSource[] = [];
  return {
    controller: new PlacementInputController((source) => events.push(source)),
    events,
  };
}

test("two rapid F taps both trigger placement", () => {
  const { controller, events } = createController();

  controller.keyboardDown(0);
  controller.keyboardUp();
  controller.keyboardDown(20);
  controller.keyboardUp();

  assert.deepEqual(events, ["keyboard", "keyboard"]);
});

test("holding F repeats placement at the configured interval", () => {
  const { controller, events } = createController();

  controller.keyboardDown(0);
  controller.keyboardDown(50);
  controller.update(184);
  controller.update(185);
  controller.update(369);
  controller.update(370);
  controller.keyboardUp();
  controller.update(1000);

  assert.deepEqual(events, ["keyboard", "repeat", "repeat"]);
});

test("one right click is not doubled by its contextmenu event", () => {
  const { controller, events } = createController();

  controller.pointerDown(100);
  controller.pointerUp();
  controller.contextMenu(120);

  assert.deepEqual(events, ["pointer"]);
});

test("contextmenu-only browsers can still place and clearing stops repeats", () => {
  const { controller, events } = createController();

  controller.contextMenu(0);
  controller.pointerDown(500);
  controller.clear();
  controller.update(1000);

  assert.deepEqual(events, ["contextmenu", "pointer"]);
});

test("releasing one input keeps repetition active while the other is held", () => {
  const { controller, events } = createController();

  controller.keyboardDown(0);
  controller.pointerDown(20);
  controller.keyboardUp();
  controller.update(204);
  controller.update(205);
  controller.pointerUp();

  assert.deepEqual(events, ["keyboard", "pointer", "repeat"]);
});
