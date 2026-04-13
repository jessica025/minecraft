'use strict';

class Game {
  constructor() {
    this.scene    = null;
    this.camera   = null;
    this.renderer = null;
    this.world    = null;

    this.pos  = new THREE.Vector3(8.5, 20, 8.5);
    this.vel  = new THREE.Vector3();
    this.yaw  = 0;
    this.pitch= 0;
    this.onGround  = false;
    this.flying    = false;
    this.crouching = false;

    this.keys           = {};
    this.mLeft          = false;
    this.mRight         = false;
    this.mRightCooldown = 0;

    this.hotbar    = [B.GRASS,B.DIRT,B.STONE,B.WOOD,B.PLANKS,B.SAND,B.COBBLE,B.GLASS,B.BRICK];
    this.hotbarIdx = 0;

    this.chunks    = new Map();
    this.loadedSet = new Set();
    this.RDIST     = 5;
    this.lastCX    = null;
    this.lastCZ    = null;

    this.highlight   = null;
    this.target      = null;
    this.breakTarget = null;
    this.breakTime   = 0;

    this.fps       = 0;
    this.fpsFrames = 0;
    this.fpsTimer  = 0;
    this.paused    = false;
    this.started   = false;
  }

  init() {
    const canvas = document.getElementById('canvas');
    this.renderer = new THREE.WebGLRenderer({canvas, antialias:false});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    this.renderer.setSize(window.innerWidth,window.innerHeight);
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.Fog(0x87ceeb, 60, 130);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.05, 200);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff0e0, 0.9);
    sun.position.set(80,120,60);
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0x87ceeb,0x3d2b1f,0.3));

    const hlGeo = new THREE.BoxGeometry(1.005,1.005,1.005);
    const hlMat = new THREE.MeshBasicMaterial({color:0x000000,wireframe:true,opacity:0.4,transparent:true});
    this.highlight = new THREE.Mesh(hlGeo,hlMat);
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.world = new World(Math.floor(Math.random()*99999));
    this.updateChunks(true);
    const sh = this.world.height(8,8);
    this.pos.set(8.5, sh+3, 8.5);

    this._bindEvents(canvas);
    this.buildHotbarUI();
    requestAnimationFrame(t => this.loop(t));
  }

  _bindEvents(canvas) {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code==='KeyF') { this.flying=!this.flying; this.vel.y=0; }
      if (e.code==='Escape' && document.pointerLockElement) document.exitPointerLock();
      const num = ['Digit1','Digit2','Digit3','Digit4','Digit5',
                   'Digit6','Digit7','Digit8','Digit9'].indexOf(e.code);
      if (num !== -1) { this.hotbarIdx=num; this.updateHotbarUI(); this.showBlockName(); }
    });

    window.addEventListener('keyup', e => { this.keys[e.code]=false; });

    window.addEventListener('mousemove', e => {
      if (document.pointerLockElement && !this.paused) {
        this.yaw   -= e.movementX*0.002;
        this.pitch -= e.movementY*0.002;
        this.pitch  = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, this.pitch));
      }
    });

    window.addEventListener('mousedown', e => {
      if (!document.pointerLockElement) { canvas.requestPointerLock(); return; }
      if (e.button===0) { this.mLeft=true; this.breakTime=0; this.breakTarget=null; }
      if (e.button===2) this.mRight=true;
    });

    window.addEventListener('mouseup', e => {
      if (e.button===0) { this.mLeft=false; this.breakTime=0; this.breakTarget=null; }
      if (e.button===2) this.mRight=false;
    });

    window.addEventListener('wheel', e => {
      const d = e.deltaY>0?1:-1;
      this.hotbarIdx = (this.hotbarIdx+d+this.hotbar.length)%this.hotbar.length;
      this.updateHotbarUI();
      this.showBlockName();
    });

    window.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth,window.innerHeight);
      this.camera.aspect = window.innerWidth/window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    document.addEventListener('pointerlockchange', () => {
      const locked = !!document.pointerLockElement;
      this.paused = !locked && this.started;
      document.getElementById('pause-screen').style.display = this.paused?'flex':'none';
    });
  }

  buildHotbarUI() {
    const hb = document.getElementById('hotbar');
    hb.innerHTML = '';
    this.hotbar.forEach((bid,i) => {
      const slot = document.createElement('div');
      slot.className = 'slot'+(i===this.hotbarIdx?' active':'');
      slot.id = `slot${i}`;

      const num = document.createElement('div');
      num.className = 'slot-num';
      num.textContent = i+1;

      const icon = document.createElement('canvas');
      icon.className = 'slot-icon';
      icon.width = icon.height = 32;
      if (bid && BLOCK_COLORS[bid]) {
        const ctx = icon.getContext('2d');
        const [tr,tg,tb] = parseColor(BLOCK_COLORS[bid][0]);
        const [sr,sg,sb] = parseColor(BLOCK_COLORS[bid][4]);
        ctx.fillStyle = `rgb(${tr*255|0},${tg*255|0},${tb*255|0})`;
        ctx.beginPath();
        ctx.moveTo(8,0); ctx.lineTo(32,0); ctx.lineTo(32,16); ctx.lineTo(8,16);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgb(${sr*255|0},${sg*255|0},${sb*255|0})`;
        ctx.fillRect(8,16,24,16);
        ctx.fillStyle = `rgb(${sr*0.85*255|0},${sg*0.85*255|0},${sb*0.85*255|0})`;
        ctx.fillRect(0,8,8,24);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(8,16,24,16);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0,8,8,24);
      }

      const lbl = document.createElement('div');
      lbl.className = 'slot-label';
      lbl.textContent = BLOCK_NAME[bid]||'';

      slot.appendChild(num);
      slot.appendChild(icon);
      slot.appendChild(lbl);
      hb.appendChild(slot);
    });
  }

  updateHotbarUI() {
    document.querySelectorAll('.slot').forEach((el,i) => {
      el.classList.toggle('active', i===this.hotbarIdx);
    });
  }

  showBlockName() {
    const el = document.getElementById('selected-name');
    el.textContent = BLOCK_NAME[this.hotbar[this.hotbarIdx]] || '';
    el.style.opacity = '1';
    clearTimeout(this._nameTimer);
    this._nameTimer = setTimeout(() => el.style.opacity='0', 1500);
  }

  raycast(maxDist=6) {
    const dir = new THREE.Vector3(0,0,-1)
      .applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const eye = this.pos.clone().add(new THREE.Vector3(0,1.62,0));

    let x=Math.floor(eye.x), y=Math.floor(eye.y), z=Math.floor(eye.z);
    const sx=dir.x>=0?1:-1, sy=dir.y>=0?1:-1, sz=dir.z>=0?1:-1;
    const dtx=Math.abs(1/dir.x)||Infinity;
    const dty=Math.abs(1/dir.y)||Infinity;
    const dtz=Math.abs(1/dir.z)||Infinity;
    let tmx=dir.x>=0?(x+1-eye.x)/dir.x:(eye.x-x)/(-dir.x);
    let tmy=dir.y>=0?(y+1-eye.y)/dir.y:(eye.y-y)/(-dir.y);
    let tmz=dir.z>=0?(z+1-eye.z)/dir.z:(eye.z-z)/(-dir.z);
    if(!isFinite(tmx))tmx=Infinity;
    if(!isFinite(tmy))tmy=Infinity;
    if(!isFinite(tmz))tmz=Infinity;

    let face=null, dist=0;
    while (dist<maxDist) {
      const b=this.world.get(x,y,z);
      if (b!==B.AIR) return {x,y,z,face};
      if (tmx<tmy&&tmx<tmz) { x+=sx; dist=tmx; tmx+=dtx; face=[-sx,0,0]; }
      else if (tmy<tmz)      { y+=sy; dist=tmy; tmy+=dty; face=[0,-sy,0]; }
      else                   { z+=sz; dist=tmz; tmz+=dtz; face=[0,0,-sz]; }
    }
    return null;
  }

  move(dx,dy,dz) {
    const W=0.28, H=1.8;
    const tryAxis = (axis, d) => {
      if (Math.abs(d)<1e-6) return;
      const nx=this.pos.x+(axis===0?d:0);
      const ny=this.pos.y+(axis===1?d:0);
      const nz=this.pos.z+(axis===2?d:0);
      for (let bx=Math.floor(nx-W); bx<=Math.floor(nx+W); bx++) {
        for (let by=Math.floor(ny); by<=Math.floor(ny+H); by++) {
          for (let bz=Math.floor(nz-W); bz<=Math.floor(nz+W); bz++) {
            if (this.world.isSolid(bx,by,bz)) {
              if (axis===1) { if (d<0) this.onGround=true; this.vel.y=0; }
              else { this.vel[axis===0?'x':'z']=0; }
              return;
            }
          }
        }
      }
      if (axis===0) this.pos.x=nx;
      else if (axis===1) this.pos.y=ny;
      else this.pos.z=nz;
    };
    tryAxis(0,dx); tryAxis(1,dy); tryAxis(2,dz);
  }

  updateChunks(initial=false) {
    const cx=Math.floor(this.pos.x/CHUNK_SIZE);
    const cz=Math.floor(this.pos.z/CHUNK_SIZE);
    if (!initial && cx===this.lastCX && cz===this.lastCZ) return;
    this.lastCX=cx; this.lastCZ=cz;

    const needed = new Set();
    for (let dcx=-this.RDIST; dcx<=this.RDIST; dcx++) {
      for (let dcz=-this.RDIST; dcz<=this.RDIST; dcz++) {
        if (dcx*dcx+dcz*dcz > this.RDIST*this.RDIST) continue;
        const key=`${cx+dcx},${cz+dcz}`;
        needed.add(key);
        if (!this.loadedSet.has(key)) {
          this.loadedSet.add(key);
          this.world.genChunk(cx+dcx, cz+dcz);
          const mesh=this.world.buildMesh(cx+dcx, cz+dcz);
          if (mesh) { this.scene.add(mesh); this.chunks.set(key,mesh); }
        }
      }
    }
    for (const key of [...this.loadedSet]) {
      if (!needed.has(key)) {
        const m=this.chunks.get(key);
        if (m) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); this.chunks.delete(key); }
        this.loadedSet.delete(key);
      }
    }
  }

  rebuildChunk(wx,wz) {
    const cx=Math.floor(wx/CHUNK_SIZE), cz=Math.floor(wz/CHUNK_SIZE);
    const key=`${cx},${cz}`;
    const old=this.chunks.get(key);
    if (old) { this.scene.remove(old); old.geometry.dispose(); old.material.dispose(); }
    const m=this.world.buildMesh(cx,cz);
    if (m) { this.scene.add(m); this.chunks.set(key,m); }
    else this.chunks.delete(key);
  }

  rebuildAround(wx,_wy,wz) {
    this.rebuildChunk(wx,wz);
    const CS=CHUNK_SIZE;
    if (wx%CS===0)    this.rebuildChunk(wx-1,wz);
    if (wx%CS===CS-1) this.rebuildChunk(wx+1,wz);
    if (wz%CS===0)    this.rebuildChunk(wx,wz-1);
    if (wz%CS===CS-1) this.rebuildChunk(wx,wz+1);
  }

  update(dt) {
    if (this.paused || !this.started) return;

    const SPEED  = this.flying ? 12 : (this.crouching?2:5);
    const ACCEL  = this.flying ? 25 : 50;
    const GRAVITY = -25;
    const JUMP    = 9;

    let mx=0, mz=0;
    if (this.keys['KeyW']||this.keys['ArrowUp'])    mz-=1;
    if (this.keys['KeyS']||this.keys['ArrowDown'])  mz+=1;
    if (this.keys['KeyA']||this.keys['ArrowLeft'])  mx-=1;
    if (this.keys['KeyD']||this.keys['ArrowRight']) mx+=1;
    this.crouching = !!(this.keys['ShiftLeft']||this.keys['ShiftRight']);

    const len=Math.hypot(mx,mz); if(len>0){mx/=len;mz/=len;}
    const cy=Math.cos(this.yaw), sy=Math.sin(this.yaw);
    const wx=mx*cy+mz*sy, wz=-mx*sy+mz*cy;

    if (this.flying) {
      const tvy = this.keys['Space']?SPEED:(this.crouching?-SPEED:0);
      this.vel.x += (wx*SPEED - this.vel.x)*Math.min(1,ACCEL*dt);
      this.vel.y += (tvy      - this.vel.y)*Math.min(1,ACCEL*dt);
      this.vel.z += (wz*SPEED - this.vel.z)*Math.min(1,ACCEL*dt);
    } else {
      this.vel.x += (wx*SPEED - this.vel.x)*Math.min(1,ACCEL*dt);
      this.vel.z += (wz*SPEED - this.vel.z)*Math.min(1,ACCEL*dt);
      this.vel.y += GRAVITY*dt;
      if (this.keys['Space'] && this.onGround) { this.vel.y=JUMP; this.onGround=false; }
    }

    this.onGround = false;
    this.move(this.vel.x*dt, this.vel.y*dt, this.vel.z*dt);
    if (this.pos.y<0) { this.pos.y=0; this.vel.y=0; }

    this.camera.position.copy(this.pos).add(new THREE.Vector3(0,1.62,0));
    this.camera.rotation.order='YXZ';
    this.camera.rotation.y=this.yaw;
    this.camera.rotation.x=this.pitch;

    const hit = this.raycast();
    if (hit) {
      this.target=hit;
      this.highlight.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5);
      this.highlight.visible=true;
    } else {
      this.target=null;
      this.highlight.visible=false;
    }

    // Break block
    const bb=document.getElementById('break-bar');
    const bf=document.getElementById('break-fill');
    if (this.mLeft && hit) {
      const hkey=`${hit.x},${hit.y},${hit.z}`;
      if (this.breakTarget!==hkey) { this.breakTarget=hkey; this.breakTime=0; }
      const b  = this.world.get(hit.x,hit.y,hit.z);
      const bt = BREAK_TIME[b] ?? 0.5;
      if (bt !== Infinity) {
        this.breakTime += dt;
        bb.style.display='block';
        bf.style.width=Math.min(100,this.breakTime/bt*100)+'%';
        if (this.breakTime >= bt) {
          this.world.set(hit.x,hit.y,hit.z, B.AIR);
          this.rebuildAround(hit.x,hit.y,hit.z);
          this.breakTarget=null; this.breakTime=0;
          bb.style.display='none'; bf.style.width='0%';
        }
      }
    } else {
      this.breakTarget=null; this.breakTime=0;
      bb.style.display='none'; bf.style.width='0%';
    }

    // Place block
    this.mRightCooldown = Math.max(0, this.mRightCooldown-dt);
    if (this.mRight && hit && hit.face && this.mRightCooldown<=0) {
      const px=hit.x+hit.face[0], py=hit.y+hit.face[1], pz=hit.z+hit.face[2];
      const W=0.28;
      const inPlayer =
        px+1>this.pos.x-W && px<this.pos.x+W &&
        py+1>this.pos.y   && py<this.pos.y+1.8 &&
        pz+1>this.pos.z-W && pz<this.pos.z+W;
      if (!inPlayer) {
        this.world.set(px,py,pz, this.hotbar[this.hotbarIdx]);
        this.rebuildAround(px,py,pz);
        this.mRightCooldown=0.2;
      }
    }

    this.updateChunks(false);

    // FPS counter
    this.fpsFrames++; this.fpsTimer+=dt;
    if (this.fpsTimer>=1) { this.fps=this.fpsFrames; this.fpsFrames=0; this.fpsTimer=0; }

    const bn = hit ? BLOCK_NAME[this.world.get(hit.x,hit.y,hit.z)]||'?' : '无';
    document.getElementById('debug').innerHTML =
      `FPS: ${this.fps} &nbsp; ${this.flying?'✦ 飞行模式':''}<br>` +
      `X:${this.pos.x.toFixed(1)} Y:${this.pos.y.toFixed(1)} Z:${this.pos.z.toFixed(1)}<br>` +
      `目标方块: ${bn}`;
  }

  loop(t) {
    const dt = Math.min((t-(this._lastT||t))/1000, 0.05);
    this._lastT = t;
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(tt => this.loop(tt));
  }
}
