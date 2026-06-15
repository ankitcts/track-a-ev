"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox, ContactShadows } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { AvatarState } from "./Avatar";

const ACCENT: Record<AvatarState, string> = {
  idle: "#38bdf8",
  listening: "#22d3ee",
  thinking: "#fbbf24",
  speaking: "#34d399",
};

// Gait/animation speed (radians/sec multiplier) per state.
const SPEED: Record<AvatarState, number> = {
  idle: 2.0,
  listening: 7.5,
  thinking: 3.5,
  speaking: 5.0,
};

function Robot({ state }: { state: AvatarState }) {
  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const lLeg = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const accentLight = useRef<THREE.PointLight>(null);
  const mouthRef = useRef<THREE.Group>(null);

  const accent = ACCENT[state];

  // Shared PBR materials.
  const metal = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#cfd5df", metalness: 0.95, roughness: 0.3 }),
    []
  );
  const dark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2a3040", metalness: 0.8, roughness: 0.5 }),
    []
  );
  const glow = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: new THREE.Color(accent),
        emissiveIntensity: 1.8,
        metalness: 0.2,
        roughness: 0.4,
      }),
    [accent]
  );

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    const sp = SPEED[state];
    const swing = Math.sin(t * sp);

    if (lLeg.current) lLeg.current.rotation.x = swing * 0.5;
    if (rLeg.current) rLeg.current.rotation.x = -swing * 0.5;
    if (lArm.current) lArm.current.rotation.x = -swing * 0.45;
    if (rArm.current) rArm.current.rotation.x = swing * 0.45;

    // Torso bob (twice per stride) + breathing.
    if (root.current) {
      const bob = Math.abs(Math.cos(t * sp)) * 0.06;
      root.current.position.y = -0.9 + bob;
      // Whole body gently turns toward the cursor for a "live" feel.
      root.current.rotation.y = THREE.MathUtils.lerp(root.current.rotation.y, st.pointer.x * 0.35, 0.06);
    }

    // Head tracks the cursor.
    if (head.current) {
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, st.pointer.x * 0.6, 0.1);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -st.pointer.y * 0.35, 0.1);
    }

    // Mouth "speaking" pulse.
    if (mouthRef.current) {
      const s = state === "speaking" ? 0.5 + Math.abs(Math.sin(t * 16)) * 0.9 : 1;
      mouthRef.current.scale.y = s;
    }

    // Accent light flicker while listening.
    if (accentLight.current) {
      accentLight.current.intensity =
        state === "listening" ? 2.2 + Math.sin(t * 10) * 0.8 : state === "idle" ? 1.0 : 1.8;
    }
  });

  return (
    <group ref={root} position={[0, -0.9, 0]} rotation={[0, 0, 0]}>
      <pointLight ref={accentLight} color={accent} intensity={1.4} distance={6} position={[0, 1.4, 1.2]} />

      {/* ===== LEGS ===== */}
      <group ref={lLeg} position={[-0.25, 0.55, 0]}>
        <RoundedBox args={[0.3, 0.95, 0.3]} radius={0.08} smoothness={4} position={[0, -0.48, 0]} material={metal} />
        <mesh position={[0, -0.45, 0]} material={glow}>
          <boxGeometry args={[0.32, 0.06, 0.32]} />
        </mesh>
        <RoundedBox args={[0.34, 0.16, 0.5]} radius={0.05} smoothness={4} position={[0, -0.96, 0.1]} material={dark} />
      </group>
      <group ref={rLeg} position={[0.25, 0.55, 0]}>
        <RoundedBox args={[0.3, 0.95, 0.3]} radius={0.08} smoothness={4} position={[0, -0.48, 0]} material={metal} />
        <mesh position={[0, -0.45, 0]} material={glow}>
          <boxGeometry args={[0.32, 0.06, 0.32]} />
        </mesh>
        <RoundedBox args={[0.34, 0.16, 0.5]} radius={0.05} smoothness={4} position={[0, -0.96, 0.1]} material={dark} />
      </group>

      {/* ===== HIPS ===== */}
      <RoundedBox args={[0.78, 0.28, 0.45]} radius={0.08} smoothness={4} position={[0, 0.62, 0]} material={dark} />

      {/* ===== TORSO ===== */}
      <RoundedBox args={[0.95, 1.05, 0.55]} radius={0.14} smoothness={4} position={[0, 1.3, 0]} material={metal} />
      {/* chest plate */}
      <RoundedBox args={[0.55, 0.62, 0.08] as [number, number, number]} radius={0.06} smoothness={4} position={[0, 1.32, 0.27]} material={dark} />
      {/* Tesla "T" */}
      <mesh position={[0, 1.45, 0.32]} material={glow}>
        <boxGeometry args={[0.34, 0.06, 0.04]} />
      </mesh>
      <mesh position={[0, 1.28, 0.32]} material={glow}>
        <boxGeometry args={[0.06, 0.34, 0.04]} />
      </mesh>

      {/* ===== ARMS ===== */}
      <group ref={lArm} position={[-0.62, 1.62, 0]}>
        <RoundedBox args={[0.22, 0.7, 0.22]} radius={0.07} smoothness={4} position={[0, -0.38, 0]} material={metal} />
        <mesh position={[0, -0.2, 0]} material={glow}>
          <boxGeometry args={[0.24, 0.05, 0.24]} />
        </mesh>
        <RoundedBox args={[0.2, 0.45, 0.2]} radius={0.06} smoothness={4} position={[0, -0.85, 0.05]} material={metal} />
        <mesh position={[0, -1.12, 0.05]} material={dark}>
          <sphereGeometry args={[0.14, 16, 16]} />
        </mesh>
      </group>
      <group ref={rArm} position={[0.62, 1.62, 0]}>
        <RoundedBox args={[0.22, 0.7, 0.22]} radius={0.07} smoothness={4} position={[0, -0.38, 0]} material={metal} />
        <mesh position={[0, -0.2, 0]} material={glow}>
          <boxGeometry args={[0.24, 0.05, 0.24]} />
        </mesh>
        <RoundedBox args={[0.2, 0.45, 0.2]} radius={0.06} smoothness={4} position={[0, -0.85, 0.05]} material={metal} />
        <mesh position={[0, -1.12, 0.05]} material={dark}>
          <sphereGeometry args={[0.14, 16, 16]} />
        </mesh>
      </group>
      {/* shoulder pads */}
      <mesh position={[-0.62, 1.78, 0]} material={dark}>
        <sphereGeometry args={[0.2, 20, 20]} />
      </mesh>
      <mesh position={[0.62, 1.78, 0]} material={dark}>
        <sphereGeometry args={[0.2, 20, 20]} />
      </mesh>

      {/* ===== NECK ===== */}
      <mesh position={[0, 1.95, 0]} material={dark}>
        <cylinderGeometry args={[0.12, 0.14, 0.18, 16]} />
      </mesh>

      {/* ===== HEAD (cursor-tracking) ===== */}
      <group ref={head} position={[0, 2.25, 0]}>
        <RoundedBox args={[0.66, 0.6, 0.6]} radius={0.16} smoothness={5} material={metal} />
        {/* visor */}
        <RoundedBox args={[0.56, 0.26, 0.12]} radius={0.08} smoothness={4} position={[0, 0.02, 0.27]} material={dark} />
        {/* eyes */}
        <mesh position={[-0.12, 0.04, 0.34]} material={glow}>
          <boxGeometry args={[0.13, 0.11, 0.05]} />
        </mesh>
        <mesh position={[0.12, 0.04, 0.34]} material={glow}>
          <boxGeometry args={[0.13, 0.11, 0.05]} />
        </mesh>
        {/* mouth */}
        <group ref={mouthRef} position={[0, -0.18, 0.31]}>
          <mesh material={glow}>
            <boxGeometry args={[0.22, 0.04, 0.04]} />
          </mesh>
        </group>
        {/* audio pods */}
        <mesh position={[-0.36, 0.02, 0]} material={dark}>
          <cylinderGeometry args={[0.08, 0.08, 0.34, 16]} />
        </mesh>
        <mesh position={[0.36, 0.02, 0]} material={dark}>
          <cylinderGeometry args={[0.08, 0.08, 0.34, 16]} />
        </mesh>
        {/* antenna */}
        <mesh position={[0, 0.42, 0]} material={dark}>
          <cylinderGeometry args={[0.02, 0.02, 0.22, 8]} />
        </mesh>
        <mesh position={[0, 0.58, 0]} material={glow}>
          <sphereGeometry args={[0.06, 16, 16]} />
        </mesh>
      </group>
    </group>
  );
}

export default function RobotScene({ state }: { state: AvatarState }) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0.6, 5], fov: 38 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} castShadow />
      <directionalLight position={[-5, 3, -4]} intensity={0.5} color="#9bd0ff" />
      <Robot state={state} />
      <ContactShadows position={[0, -1.85, 0]} opacity={0.5} scale={6} blur={2.4} far={4} />
    </Canvas>
  );
}
