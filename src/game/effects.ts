import * as THREE from "three";
import type { BlockId } from "./blocks";
import { BLOCKS } from "./blocks";

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export class BlockParticles {
  private readonly particles: Particle[] = [];
  private readonly geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

  constructor(private readonly scene: THREE.Scene) {}

  burst(position: THREE.Vector3, block: BlockId, count = 12): void {
    const color = BLOCKS[block].color;
    count = Math.max(0, Math.min(count, 192 - this.particles.length));
    for (let index = 0; index < count; index += 1) {
      const material = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.position.copy(position).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.7,
        ),
      );
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2.8,
          1.4 + Math.random() * 2.1,
          (Math.random() - 0.5) * 2.8,
        ),
        life: 0.55 + Math.random() * 0.25,
      });
    }
  }

  update(delta: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= delta;
      particle.velocity.y -= 8 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.rotation.x += delta * 5;
      particle.mesh.rotation.y += delta * 4;
      const scale = Math.max(0.01, particle.life * 1.4);
      particle.mesh.scale.setScalar(scale);

      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        (particle.mesh.material as THREE.Material).dispose();
        this.particles.splice(index, 1);
      }
    }
  }

  dispose(): void {
    for (const particle of this.particles) {
      this.scene.remove(particle.mesh);
      (particle.mesh.material as THREE.Material).dispose();
    }
    this.particles.length = 0;
    this.geometry.dispose();
  }
}

export class GameAudio {
  private context: AudioContext | null = null;
  private unavailable = false;

  private getContext(): AudioContext | null {
    if (this.unavailable) {
      return null;
    }
    try {
      this.context ??= new AudioContext();
    } catch {
      this.unavailable = true;
      return null;
    }
    return this.context;
  }

  play(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume = 0.04,
    endFrequency?: number,
  ): void {
    const context = this.getContext();
    if (!context) {
      return;
    }

    try {
      if (context.state === "suspended") {
        void context.resume().catch(() => undefined);
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      if (endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(
          Math.max(20, endFrequency),
          now + duration,
        );
      }
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      this.unavailable = true;
    }
  }

  mine(): void {
    this.play(115, 0.09, "square", 0.035, 62);
  }

  place(): void {
    this.play(92, 0.075, "square", 0.028, 118);
  }

  jump(): void {
    this.play(170, 0.08, "triangle", 0.025, 240);
  }

  hit(): void {
    this.play(78, 0.13, "sawtooth", 0.035, 44);
  }

  notify(): void {
    this.play(420, 0.12, "sine", 0.025, 620);
  }
}
