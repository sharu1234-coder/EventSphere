
import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import type { Group } from "three";

function Sculpture() {
  const group = useRef<Group>(null);

  useFrame((state, delta) => {
    if (!group.current) return;

    group.current.rotation.y += delta * 0.15;

    group.current.rotation.x +=
      (state.pointer.y * 0.12 - group.current.rotation.x) * 0.025;
  });

  return (
    <group ref={group}>
      <Float
        speed={1.4}
        rotationIntensity={0.25}
        floatIntensity={0.5}
      >
        <mesh>
          <icosahedronGeometry args={[2, 2]} />
          <meshPhysicalMaterial
            color="#9b5cff"
            metalness={0.55}
            roughness={0.16}
            clearcoat={1}
            clearcoatRoughness={0.1}
          />
        </mesh>

        <mesh scale={0.7}>
          <icosahedronGeometry args={[2, 1]} />
          <meshStandardMaterial
            color="#c084fc"
            emissive="#7c3aed"
            emissiveIntensity={0.65}
            wireframe
          />
        </mesh>

        <mesh rotation={[0.5, 0.4, 0.7]}>
          <torusGeometry args={[2.8, 0.025, 8, 120]} />
          <meshStandardMaterial
            color="#c4b5fd"
            emissive="#8b5cf6"
            emissiveIntensity={1}
          />
        </mesh>

        <mesh rotation={[1.1, 0.2, -0.5]}>
          <torusGeometry args={[2.65, 0.02, 8, 120]} />
          <meshStandardMaterial
            color="#f0abfc"
            emissive="#a855f7"
            emissiveIntensity={0.8}
          />
        </mesh>
      </Float>
    </group>
  );
}

export default function Hero3D() {
  return (
    <div className="h-full w-full" aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 9], fov: 45 }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "low-power",
        }}
      >
        <ambientLight intensity={1.5} />

        <pointLight
          position={[5, 5, 5]}
          intensity={35}
          color="#a78bfa"
        />

        <pointLight
          position={[-5, -3, 3]}
          intensity={20}
          color="#ec4899"
        />

        <Suspense fallback={null}>
          <Sculpture />
        </Suspense>
      </Canvas>
    </div>
  );
}
