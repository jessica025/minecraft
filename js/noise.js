'use strict';

class Noise {
  constructor(seed = 42) {
    seed = seed >>> 0;
    const p = Array.from({length:256}, (_,i) => i);
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  fade(t) { return t*t*t*(t*(t*6-15)+10); }
  lerp(a, b, t) { return a + t*(b-a); }
  grad(h, x, y) {
    h &= 3;
    return ((h&1)?-x:x) + ((h&2)?-y:y);
  }

  raw(x, y) {
    const X = Math.floor(x)&255, Y = Math.floor(y)&255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = this.fade(x), v = this.fade(y);
    const a = this.perm[X]+Y, b = this.perm[X+1]+Y;
    return this.lerp(
      this.lerp(this.grad(this.perm[a],   x,   y), this.grad(this.perm[b],   x-1, y),   u),
      this.lerp(this.grad(this.perm[a+1], x,   y-1), this.grad(this.perm[b+1], x-1, y-1), u),
      v
    );
  }

  fbm(x, y, oct=4, per=0.5, lac=2) {
    let v=0, a=1, f=1, mx=0;
    for (let i=0; i<oct; i++) { v+=this.raw(x*f,y*f)*a; mx+=a; a*=per; f*=lac; }
    return v/mx;
  }
}
