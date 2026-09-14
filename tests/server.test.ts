import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp, type AppOptions } from "../server/app";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function serve(options: AppOptions, run: (url: string) => Promise<void>) {
  const server=createApp(options).listen(0,"127.0.0.1");
  await new Promise<void>(resolve=>server.once("listening",resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
const post=(url:string,body:unknown)=>fetch(`${url}/api/guide`,{
  method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
});
test("health, local guide fallback and unknown API return bounded JSON", async()=>{
  await serve({},async url=>{
    const health=await fetch(`${url}/api/health`);
    assert.deepEqual(await health.json(),{ok:true,guide:"local"});
    assert.equal(health.headers.get("cache-control"),"no-store");
    assert.equal((await post(url,{prompt:"hello"})).status,503);
    const unknown=await fetch(`${url}/api/missing`);
    assert.equal(unknown.status,404);
    assert.match(unknown.headers.get("content-type")! ,/json/);
  });
});
test("invalid, oversized and cross-site input never invokes the model",async()=>{
  let calls=0;
  await serve({guide:async()=>{calls++;return "ok";}},async url=>{
    for(const body of [{prompt:{}},{prompt:""},{prompt:"x".repeat(241)},{prompt:"hi",context:[]}]) {
      assert.equal((await post(url,body)).status,400);
    }
    assert.equal((await post(url,{prompt:"x".repeat(20000)})).status,413);
    const malformed=await fetch(`${url}/api/guide`,{method:"POST",headers:{"Content-Type":"application/json"},body:"{"});
    assert.equal(malformed.status,400);
    const cross=await fetch(`${url}/api/guide`,{method:"POST",headers:{"sec-fetch-site":"cross-site"}});
    assert.equal(cross.status,403);
    assert.equal(calls,0);
  });
});
test("guide success and per-client rate limit",async()=>{
  let calls=0;
  await serve({guide:async(prompt)=>{calls++;return prompt;}},async url=>{
    for(let i=0;i<6;i++) assert.deepEqual(await (await post(url,{prompt:" 建筑 "})).json(),{text:"建筑"});
    const blocked=await post(url,{prompt:"again"});
    assert.equal(blocked.status,429);
    assert.ok(blocked.headers.get("retry-after"));
    assert.equal(calls,6);
  });
});
test("provider failures and deadlines return 503 without exposing secrets",async()=>{
  await serve({guide:async()=>{throw new Error("secret-account-id");}},async url=>{
    const response=await post(url,{prompt:"hello"});
    assert.equal(response.status,503);
    assert.ok(!(await response.text()).includes("secret-account-id"));
  });
  let signal:AbortSignal|undefined;
  await serve({guideTimeoutMs:20,guide:async(_p,_c,s)=>{signal=s;return new Promise(()=>{});}},async url=>{
    assert.equal((await post(url,{prompt:"hello"})).status,503);
    assert.equal(signal?.aborted,true);
  });
});
test("at most two provider requests execute concurrently",async()=>{
  let release:()=>void=()=>{};
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let active=0;
  await serve({guide:async()=>{active++;await gate;return "ok";}},async url=>{
    const a=post(url,{prompt:"a"}), b=post(url,{prompt:"b"});
    while(active<2) await new Promise(resolve=>setTimeout(resolve,5));
    try { assert.equal((await post(url,{prompt:"c"})).status,429); }
    finally {release();}
    assert.equal((await a).status,200);assert.equal((await b).status,200);
  });
});
test("production serves compressed immutable assets, revalidates HTML and rejects missing assets",async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"blockfrontier-http-"));
  try {
    await mkdir(path.join(dir,"assets"));
    await writeFile(path.join(dir,"index.html"),"<!doctype html><title>Game</title>");
    await writeFile(path.join(dir,"assets","test.js"),"const repeated = 1;\n".repeat(500));
    await serve({distDir:dir},async url=>{
      const html=await fetch(url);
      assert.equal(html.status,200);
      assert.equal(html.headers.get("cache-control"),"no-cache");
      assert.ok(html.headers.get("content-security-policy")?.includes("script-src 'self'"));
      assert.equal(html.headers.get("x-content-type-options"),"nosniff");
      const js=await fetch(`${url}/assets/test.js`,{headers:{"Accept-Encoding":"gzip"}});
      assert.match(js.headers.get("cache-control")!,/immutable/);
      assert.equal(js.headers.get("content-encoding"),"gzip");
      assert.equal((await fetch(`${url}/assets/missing.js`)).status,404);
      assert.equal((await fetch(`${url}/missing`)).status,404);
    });
  } finally {await rm(dir,{recursive:true});}
});
