import * as THREE from "three";

export class WorldEnvironment {
  readonly sunLight: THREE.DirectionalLight;
  readonly moonLight: THREE.DirectionalLight;
  readonly hemisphereLight: THREE.HemisphereLight;
  private readonly sun: THREE.Mesh;
  private readonly moon: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly clouds = new THREE.Group();
  private readonly daySky = new THREE.Color("#86c8e8");
  private readonly dawnSky = new THREE.Color("#d9916d");
  private readonly nightSky = new THREE.Color("#13263d");
  private readonly tempColor = new THREE.Color();
  private elapsed = 0;

  constructor(private readonly scene: THREE.Scene) {
    scene.fog = new THREE.Fog("#86c8e8", 24, 65);

    this.hemisphereLight = new THREE.HemisphereLight("#bfe5ff", "#52633d", 1.8);
    scene.add(this.hemisphereLight);

    this.sunLight = new THREE.DirectionalLight("#fff0c1", 2.2);
    this.sunLight.position.set(18, 28, 12);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -28;
    this.sunLight.shadow.camera.right = 28;
    this.sunLight.shadow.camera.top = 28;
    this.sunLight.shadow.camera.bottom = -28;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 85;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    this.moonLight = new THREE.DirectionalLight("#7ea4d8", 0.12);
    this.moonLight.position.set(-18, 22, -12);
    scene.add(this.moonLight);

    this.sun = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 4.5, 0.7),
      new THREE.MeshBasicMaterial({ color: "#ffe286", fog: false }),
    );
    scene.add(this.sun);

    this.moon = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 3.2, 0.6),
      new THREE.MeshBasicMaterial({ color: "#d6e6f2", fog: false }),
    );
    scene.add(this.moon);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions: number[] = [];
    for (let index = 0; index < 600; index += 1) {
      const radius = 72;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.82);
      starPositions.push(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.abs(Math.cos(phi)) * radius + 8,
        Math.sin(phi) * Math.sin(theta) * radius,
      );
    }
    starGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(starPositions, 3),
    );
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: "#d7e8ff",
        size: 0.35,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        fog: false,
      }),
    );
    scene.add(this.stars);

    this.createClouds();
    scene.add(this.clouds);
  }

  private createClouds(): void {
    const cloudMaterial = new THREE.MeshLambertMaterial({
      color: "#f5f5ea",
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    const cloudShapes = [
      [-18, 18, -11, 1.1],
      [5, 20, -22, 0.8],
      [20, 17, 5, 1.35],
      [-4, 22, 19, 0.95],
    ];

    cloudShapes.forEach(([x, y, z, scale], cloudIndex) => {
      const cloud = new THREE.Group();
      const pieces = [
        [-2.6, 0, 0, 4.4, 1.1, 2.1],
        [0.8, 0.35, 0, 4, 1.5, 2.4],
        [3, 0, 0.2, 2.8, 0.9, 1.7],
      ];
      for (const [px, py, pz, sx, sy, sz] of pieces) {
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(sx, sy, sz),
          cloudMaterial,
        );
        mesh.position.set(px, py, pz);
        cloud.add(mesh);
      }
      cloud.position.set(x, y, z);
      cloud.scale.setScalar(scale);
      cloud.userData.speed = 0.18 + cloudIndex * 0.035;
      this.clouds.add(cloud);
    });
  }

  update(
    delta: number,
    time: number,
    focus: THREE.Vector3,
  ): void {
    this.elapsed += delta;
    const dayPhase = time % 1;
    const angle = dayPhase * Math.PI * 2 - Math.PI / 2;
    const elevation = Math.sin(angle);
    const horizontal = Math.cos(angle);
    const distance = 58;

    this.sun.position.set(
      focus.x + horizontal * distance,
      focus.y + elevation * distance,
      focus.z + 28,
    );
    this.sun.lookAt(focus);
    this.moon.position.copy(focus).multiplyScalar(0);
    this.moon.position.set(
      focus.x - horizontal * distance,
      focus.y - elevation * distance,
      focus.z - 28,
    );
    this.moon.lookAt(focus);

    this.sunLight.position.set(
      focus.x + horizontal * 30,
      Math.max(4, focus.y + elevation * 36),
      focus.z + 20,
    );
    this.sunLight.target.position.copy(focus);
    this.moonLight.position.set(
      focus.x - horizontal * 24,
      Math.max(3, focus.y - elevation * 28),
      focus.z - 14,
    );

    const daylight = THREE.MathUtils.smoothstep(elevation, -0.18, 0.28);
    const twilight = 1 - Math.min(1, Math.abs(elevation) * 4.2);
    this.sunLight.intensity = daylight * 2.35;
    this.moonLight.intensity = (1 - daylight) * 0.62;
    this.hemisphereLight.intensity = 0.58 + daylight * 1.22;

    this.tempColor
      .copy(this.nightSky)
      .lerp(this.daySky, daylight)
      .lerp(this.dawnSky, twilight * 0.5);
    this.scene.background = this.tempColor.clone();
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.tempColor);
      this.scene.fog.near = 23 + daylight * 4;
      this.scene.fog.far = 58 + daylight * 12;
    }

    this.sun.visible = elevation > -0.22;
    this.moon.visible = elevation < 0.24;
    (this.stars.material as THREE.PointsMaterial).opacity =
      THREE.MathUtils.smoothstep(-elevation, -0.05, 0.42) * 0.9;
    this.stars.position.set(focus.x, 0, focus.z);

    for (const cloud of this.clouds.children) {
      cloud.position.x += Number(cloud.userData.speed) * delta;
      if (cloud.position.x > focus.x + 38) {
        cloud.position.x = focus.x - 38;
      }
      cloud.position.z += Math.sin(this.elapsed * 0.05) * delta * 0.03;
    }
  }

  dispose(): void {
    this.scene.remove(
      this.hemisphereLight,
      this.sunLight,
      this.sunLight.target,
      this.moonLight,
      this.sun,
      this.moon,
      this.stars,
      this.clouds,
    );
  }
}
