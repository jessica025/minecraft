import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { raycastVoxels } from "../src/game/raycast";

test("axis aligned rays hit all six faces and honor reach", () => {
  for(const axis of ["x","y","z"] as const) for(const sign of [-1,1]) {
    const origin = new THREE.Vector3(); origin[axis] = 3*sign;
    const direction = new THREE.Vector3(); direction[axis] = -sign;
    const ray = new THREE.Ray(origin,direction);
    const read = (x:number,y:number,z:number) => x===0 && y===0 && z===0 ? "stone" as const : undefined;
    const hit = raycastVoxels(ray,3,read)!;
    assert.equal(hit.distance,2.5);
    assert.equal(hit.normal[axis],sign);
    assert.equal(raycastVoxels(ray,2.49,read),null);
  }
});
test("zero/invalid rays terminate and empty reach visits only crossed cells", () => {
  assert.equal(raycastVoxels(new THREE.Ray(new THREE.Vector3(),new THREE.Vector3()),6,()=>undefined),null);
  let reads=0;
  raycastVoxels(new THREE.Ray(new THREE.Vector3(),new THREE.Vector3(0,0,-1)),6,()=>{reads++;return undefined;});
  assert.ok(reads<=8);
});
test("water raycasts respect the visible lowered surface", () => {
  const hit=raycastVoxels(new THREE.Ray(new THREE.Vector3(0,2,0),new THREE.Vector3(0,-1,0)),3,
    (x,y,z)=>x===0&&y===0&&z===0?"water":undefined)!;
  assert.ok(Math.abs(hit.point.y-.42)<1e-9);
  assert.equal(hit.normal.y,1);
});
