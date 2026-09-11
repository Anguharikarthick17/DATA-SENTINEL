import { useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { StatusResponse } from '@/types';

interface PipelineNode {
  label: string;
  sublabel?: string;
  position: [number, number, number];
  color: string;
  count?: number | string;
  isError?: boolean;
}

function PipelineNodeMesh({
  node,
  isActive,
}: {
  node: PipelineNode;
  isActive: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    // Subtle breathing
    const scale = isActive
      ? 1 + Math.sin(t * 3) * 0.08
      : 1 + Math.sin(t * 1.2) * 0.02;
    meshRef.current.scale.setScalar(scale);
    if (glowRef.current) {
      glowRef.current.scale.setScalar(isActive ? 1.4 + Math.sin(t * 3) * 0.1 : 1.2);
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = isActive
        ? 0.14 + Math.sin(t * 3) * 0.04
        : 0.06;
    }
  });

  return (
    <group position={node.position}>
      {/* Glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshBasicMaterial color={node.color} transparent opacity={0.08} />
      </mesh>
      {/* Main sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.26, 24, 24]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={isActive ? 0.6 : 0.25}
          roughness={0.25}
          metalness={0.75}
        />
      </mesh>
      {/* Label */}
      <Text
        position={[0, -0.45, 0]}
        fontSize={0.16}
        color={node.isError ? '#f87171' : 'rgba(255,255,255,0.7)'}
        anchorX="center"
        anchorY="top"
        font="https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2"
      >
        {node.label}
      </Text>
      {/* Live Counter */}
      {node.count !== undefined && (
        <Text
          position={[0, 0.48, 0]}
          fontSize={0.15}
          color={node.isError ? '#ef4444' : '#60a5fa'}
          anchorX="center"
          anchorY="bottom"
          font="https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2"
        >
          {String(node.count)}
        </Text>
      )}
      {/* Sublabel */}
      {node.sublabel && (
        <Text
          position={[0, -0.68, 0]}
          fontSize={0.11}
          color="rgba(255,255,255,0.35)"
          anchorX="center"
          anchorY="top"
          font="https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff2"
        >
          {node.sublabel}
        </Text>
      )}
    </group>
  );
}

interface DataPacketProps {
  fromPos: [number, number, number];
  toPos: [number, number, number];
  speed: number;
  color: string;
  delay: number;
}

function DataPacket({ fromPos, toPos, speed, color, delay }: DataPacketProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(delay);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    progressRef.current = (progressRef.current + delta * speed) % 1;
    const t = progressRef.current;

    // Linear interpolation between nodes with slight arc
    const x = fromPos[0] + (toPos[0] - fromPos[0]) * t;
    const y = fromPos[1] + (toPos[1] - fromPos[1]) * t + Math.sin(t * Math.PI) * 0.16;
    const z = fromPos[2] + (toPos[2] - fromPos[2]) * t;

    meshRef.current.position.set(x, y, z);
    meshRef.current.scale.setScalar(0.5 + Math.sin(t * Math.PI) * 0.5);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.055, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}

function ConnectionLine({ from, to, color = 'rgba(255,255,255,0.08)' }: { from: [number, number, number]; to: [number, number, number]; color?: string }) {
  const points = useMemo(() => [
    new THREE.Vector3(...from),
    new THREE.Vector3(...to),
  ], [from, to]);

  return (
    <Line
      points={points}
      color={color}
      lineWidth={1}
    />
  );
}

interface PipelineViz3DProps {
  isActive: boolean;
  telemetry?: StatusResponse | null;
}

function Scene({ isActive, telemetry }: PipelineViz3DProps) {
  const rowsRead = telemetry ? (telemetry.rows_read ?? telemetry.rows_total) : undefined;
  const kafkaMsgs = telemetry ? (telemetry.messages_published ?? telemetry.rows_total) : undefined;
  const rowsLoaded = telemetry ? telemetry.rows_loaded : undefined;
  const rowsFailed = telemetry ? telemetry.rows_failed : undefined;
  const hasFailed = (rowsFailed ?? 0) > 0;

  const nodes: PipelineNode[] = [
    { label: 'CSV', sublabel: 'Source', position: [-5, 0, 0], color: '#6366f1', count: rowsRead },
    { label: 'API', sublabel: 'FastAPI Ingest', position: [-2.5, 0, 0], color: '#3b82f6', count: rowsRead },
    { label: 'KAFKA', sublabel: 'csv-rows', position: [0, 0, 0], color: '#f59e0b', count: kafkaMsgs },
    { label: 'LOADER', sublabel: 'Consumer', position: [2.5, 0, 0], color: '#8b5cf6', count: rowsLoaded },
    { label: 'NEO4J', sublabel: 'Committed', position: [5, 0, 0], color: '#10b981', count: rowsLoaded },
  ];

  // Optional DLQ / Failed node if failures detected
  const dlqNode: PipelineNode = {
    label: 'FAILED / DLQ',
    sublabel: 'Dead Letter',
    position: [2.5, -1.3, 0],
    color: '#ef4444',
    count: rowsFailed,
    isError: true,
  };

  return (
    <>
      <ambientLight intensity={0.4} />
      <pointLight position={[0, 5, 5]} intensity={0.8} color="#3b82f6" />
      <pointLight position={[0, -5, 5]} intensity={0.3} color="#8b5cf6" />

      {/* Main pipeline connection lines */}
      {nodes.slice(0, -1).map((node, i) => (
        <ConnectionLine
          key={`conn-${i}`}
          from={node.position}
          to={nodes[i + 1].position}
        />
      ))}

      {/* DLQ branch line from Loader */}
      {hasFailed && (
        <ConnectionLine
          from={nodes[3].position} // LOADER
          to={dlqNode.position}
          color="rgba(239, 68, 68, 0.25)"
        />
      )}

      {/* Pipeline nodes */}
      {nodes.map((node, i) => (
        <PipelineNodeMesh
          key={node.label}
          node={node}
          isActive={isActive && i > 0}
        />
      ))}

      {/* DLQ node */}
      {hasFailed && (
        <PipelineNodeMesh
          node={dlqNode}
          isActive={true}
        />
      )}

      {/* Data packets — along primary pipeline */}
      {isActive && nodes.slice(0, -1).map((node, i) => (
        <DataPacket
          key={`packet-${i}`}
          fromPos={node.position}
          toPos={nodes[i + 1].position}
          speed={0.45 + i * 0.05}
          color={nodes[i + 1].color}
          delay={i * 0.25}
        />
      ))}

      {/* Failed packets branching to DLQ */}
      {isActive && hasFailed && (
        <DataPacket
          key="packet-dlq"
          fromPos={nodes[3].position}
          toPos={dlqNode.position}
          speed={0.35}
          color="#ef4444"
          delay={0.1}
        />
      )}
    </>
  );
}

function FallbackViz({ isActive, telemetry }: PipelineViz3DProps) {
  const nodes = [
    { label: 'CSV', count: telemetry?.rows_read ?? telemetry?.rows_total },
    { label: 'API', count: telemetry?.rows_read ?? telemetry?.rows_total },
    { label: 'KAFKA', count: telemetry?.messages_published ?? telemetry?.rows_total },
    { label: 'LOADER', count: telemetry?.rows_loaded },
    { label: 'NEO4J', count: telemetry?.rows_loaded },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-6">
      {nodes.map((node, i) => (
        <div key={node.label} className="flex items-center gap-2">
          <div className="text-center">
            {node.count !== undefined && (
              <div className="text-[10px] font-mono text-accent-400 mb-0.5">{node.count}</div>
            )}
            <div
              className="w-10 h-10 rounded-full mx-auto flex items-center justify-center text-xs font-bold"
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                color: '#60a5fa',
                animation: isActive && i > 0 ? 'pulse 2s infinite' : 'none',
              }}
            >
              {node.label[0]}
            </div>
            <div className="text-[10px] text-white/40 mt-1">{node.label}</div>
          </div>
          {i < nodes.length - 1 && (
            <div className="text-white/20 text-lg mx-1">→</div>
          )}
        </div>
      ))}
      {(telemetry?.rows_failed ?? 0) > 0 && (
        <div className="text-center ml-2 pl-2 border-l border-white/10">
          <div className="text-[10px] font-mono text-red-400 mb-0.5">{telemetry?.rows_failed}</div>
          <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center text-xs font-bold bg-red-500/10 border border-red-500/30 text-red-400">
            !
          </div>
          <div className="text-[10px] text-red-400 mt-1">DLQ</div>
        </div>
      )}
    </div>
  );
}

export function PipelineViz3D({ isActive, telemetry }: PipelineViz3DProps) {
  return (
    <div className="w-full h-full relative">
      <Suspense fallback={<FallbackViz isActive={isActive} telemetry={telemetry} />}>
        <Canvas
          camera={{ position: [0, 0.1, 7.2], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <Scene isActive={isActive} telemetry={telemetry} />
        </Canvas>
      </Suspense>
    </div>
  );
}

