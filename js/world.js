'use strict';

class World {
  constructor(seed) {
    this.seed      = seed;
    this.noise     = new Noise(seed);
    this.blocks    = new Map();
    this.generated = new Set();
  }

  key(x,y,z) { return `${x|0},${y|0},${z|0}`; }

  get(x,y,z) {
    if (y < 0 || y >= WORLD_H) return B.AIR;
    return this.blocks.get(this.key(x,y,z)) ?? B.AIR;
  }

  set(x,y,z, id) {
    if (y<0 || y>=WORLD_H) return;
    if (id===B.AIR) this.blocks.delete(this.key(x,y,z));
    else this.blocks.set(this.key(x,y,z), id);
  }

  height(x,z) {
    const n  = this.noise.fbm(x*0.012, z*0.012, 5, 0.55, 2.1);
    const n2 = this.noise.fbm(x*0.04+50, z*0.04+50, 2, 0.5, 2)*0.25;
    return Math.max(1, Math.floor(SEA_LEVEL + (n+n2+1)*0.5*22) + 4);
  }

  genChunk(cx,cz) {
    const ck = `${cx},${cz}`;
    if (this.generated.has(ck)) return;
    this.generated.add(ck);

    for (let lx=0; lx<CHUNK_SIZE; lx++) {
      for (let lz=0; lz<CHUNK_SIZE; lz++) {
        const wx = cx*CHUNK_SIZE+lx;
        const wz = cz*CHUNK_SIZE+lz;
        const h  = this.height(wx,wz);

        this.set(wx,0,wz, B.BEDROCK);

        const biomeN   = this.noise.raw(wx*0.02+200, wz*0.02+200);
        const isSand   = biomeN > 0.35 && h <= SEA_LEVEL+3;
        const isSnow   = h >= SEA_LEVEL+18;
        const isGravel = biomeN < -0.4;

        for (let y=1; y<h-3; y++) {
          const r = this.noise.raw(wx*0.3+300, y*0.3+wz*0.3);
          this.set(wx,y,wz, r>0.6 ? B.GRAVEL : B.STONE);
        }

        for (let y=Math.max(1,h-3); y<h; y++) {
          this.set(wx,y,wz, isSand?B.SAND : isGravel?B.GRAVEL : B.DIRT);
        }

        if (isSand)        this.set(wx,h,wz, B.SAND);
        else if (isGravel) this.set(wx,h,wz, B.GRAVEL);
        else if (isSnow)   this.set(wx,h,wz, B.SNOW_GRASS);
        else               this.set(wx,h,wz, B.GRASS);

        if (!isSand && !isGravel && !isSnow && h>SEA_LEVEL) {
          const tn = this.noise.raw(wx*0.6+777, wz*0.6+777);
          if (tn > 0.72) this.placeTree(wx, h+1, wz);
        }
      }
    }
  }

  placeTree(x,y,z) {
    const trunk = 4 + (this.noise.raw(x*0.9,z*0.9)>0?1:0);
    for (let i=0; i<trunk; i++) this.set(x,y+i,z, B.WOOD);
    const top = y+trunk;
    for (let dy=-1; dy<=1; dy++) {
      const r = dy<1 ? 2 : 1;
      for (let dx=-r; dx<=r; dx++) {
        for (let dz=-r; dz<=r; dz++) {
          if (Math.abs(dx)===r && Math.abs(dz)===r) continue;
          if (dx===0 && dz===0 && dy<1) continue;
          if (!this.get(x+dx,top+dy,z+dz)) this.set(x+dx,top+dy,z+dz, B.LEAVES);
        }
      }
    }
    this.set(x,top+2,z, B.LEAVES);
  }

  isSolid(x,y,z) { return this.get(x,y,z) !== B.AIR; }

  buildMesh(cx,cz) {
    const FACES = [
      {dir:[0,1,0],  corners:[[0,1,0],[1,1,0],[1,1,1],[0,1,1]], ci:0, shade:1.00},
      {dir:[0,-1,0], corners:[[0,0,1],[1,0,1],[1,0,0],[0,0,0]], ci:1, shade:0.50},
      {dir:[0,0,-1], corners:[[1,0,0],[0,0,0],[0,1,0],[1,1,0]], ci:2, shade:0.75},
      {dir:[0,0,1],  corners:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]], ci:3, shade:0.75},
      {dir:[1,0,0],  corners:[[1,0,0],[1,0,1],[1,1,1],[1,1,0]], ci:4, shade:0.85},
      {dir:[-1,0,0], corners:[[0,0,1],[0,0,0],[0,1,0],[0,1,1]], ci:5, shade:0.85},
    ];

    const pos=[], col=[], nor=[], idx=[];
    let vi=0;

    for (let lx=0; lx<CHUNK_SIZE; lx++) {
      for (let lz=0; lz<CHUNK_SIZE; lz++) {
        const wx=cx*CHUNK_SIZE+lx, wz=cz*CHUNK_SIZE+lz;
        for (let y=0; y<WORLD_H; y++) {
          const b = this.get(wx,y,wz);
          if (b===B.AIR) continue;
          const bcolors = BLOCK_COLORS[b] || BLOCK_COLORS[B.STONE];
          for (const face of FACES) {
            const [nx,ny,nz] = face.dir;
            const nb = this.get(wx+nx, y+ny, wz+nz);
            const showFace = nb===B.AIR ||
              (b!==B.GLASS  && nb===B.GLASS) ||
              (b!==B.LEAVES && nb===B.LEAVES);
            if (!showFace) continue;
            const [r,g,bl] = parseColor(bcolors[face.ci]);
            const s = face.shade;
            for (const [cx2,cy2,cz2] of face.corners) {
              pos.push(lx+cx2, y+cy2, lz+cz2);
              col.push(r*s, g*s, bl*s);
              nor.push(nx,ny,nz);
            }
            idx.push(vi,vi+1,vi+2, vi,vi+2,vi+3);
            vi+=4;
          }
        }
      }
    }

    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(col,3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nor,3));
    geo.setIndex(idx);
    const mat  = new THREE.MeshLambertMaterial({vertexColors:true});
    const mesh = new THREE.Mesh(geo,mat);
    mesh.position.set(cx*CHUNK_SIZE, 0, cz*CHUNK_SIZE);
    return mesh;
  }
}
