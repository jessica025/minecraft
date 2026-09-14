import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeSave } from "../src/game/save";

test("legacy and versioned saves preserve edits and normalize time", () => {
  for (const version of [undefined, 1]) {
    const save = decodeSave(JSON.stringify({
      version, seed:"test", edits:[["1,8,0","lantern"],["0,7,0",null]], time:-.25, elapsed:-9,
    }), "test");
    assert.equal(save.time,.75);
    assert.equal(save.elapsed,0);
    assert.deepEqual(save.edits,[["1,8,0","lantern"],["0,7,0",null]]);
  }
});
test("corrupt, incompatible and noncanonical saves fail without partial loading", () => {
  const invalid = [null, [], { seed:"other",edits:[] }, {seed:"test",edits:[],version:2},
    ...[["1,2,3,4","stone"], ["01,2,3","stone"], ["0,0,26",null],
      ["0,2,0","constructor"], [1,"stone"], null].map(edit => ({ seed:"test",edits:[edit] }))];
  for (const data of invalid) assert.throws(() => decodeSave(JSON.stringify(data),"test"));
  assert.throws(() => decodeSave("{","test"));
});
test("save loading protects the bedrock layer", () => {
  assert.deepEqual(decodeSave(JSON.stringify({
    seed:"test",edits:[["0,0,0",null]], time:0,
  }),"test").edits,[]);
});
