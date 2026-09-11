import { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, ZoomIn, ZoomOut } from 'lucide-react';
import { getGraphData } from '@/services/api';
import type { GraphData, GraphNode } from '@/types';

interface GraphViewProps {
  datasetId?: string;
}

const NODE_COLORS: Record<string, string> = {
  Dataset: '#3b82f6',
  Row: '#6366f1',
  Customer: '#10b981',
  Order: '#f59e0b',
  Product: '#8b5cf6',
  Department: '#ec4899',
  default: '#64748b',
};

export function GraphView({ datasetId = 'latest' }: GraphViewProps) {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [limit, setLimit] = useState(150);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getGraphData(datasetId, limit);
        setGraphData(data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load graph');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [datasetId, limit]);

  // Simple force-directed simulation on canvas
  useEffect(() => {
    if (!graphData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;

    // Initialize node positions
    interface SimNode {
      id: string;
      x: number; y: number; vx: number; vy: number;
      type: string; label: string;
    }

    const nodes: SimNode[] = graphData.nodes.map((n, i) => ({
      id: n.id,
      x: W / 2 + Math.cos((i / graphData.nodes.length) * Math.PI * 2) * 200,
      y: H / 2 + Math.sin((i / graphData.nodes.length) * Math.PI * 2) * 150,
      vx: 0, vy: 0,
      type: n.type,
      label: n.label,
    }));

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    let tick = 0;
    const simulate = () => {
      if (tick++ > 150) return; // stop after converging

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 2000 / (dist * dist);
          a.vx -= dx / dist * force;
          a.vy -= dy / dist * force;
          b.vx += dx / dist * force;
          b.vy += dy / dist * force;
        }
      }

      // Attraction along edges
      for (const link of graphData.links) {
        const src = nodeMap.get(link.source);
        const tgt = nodeMap.get(link.target);
        if (!src || !tgt) continue;
        const dx = tgt.x - src.x, dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 80) * 0.05;
        src.vx += dx / dist * force;
        src.vy += dy / dist * force;
        tgt.vx -= dx / dist * force;
        tgt.vy -= dy / dist * force;
      }

      // Center gravity
      for (const n of nodes) {
        n.vx += (W / 2 - n.x) * 0.01;
        n.vy += (H / 2 - n.y) * 0.01;
        // Damping
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
        // Bounds
        n.x = Math.max(20, Math.min(W - 20, n.x));
        n.y = Math.max(20, Math.min(H - 20, n.y));
      }

      draw();
      animFrameRef.current = requestAnimationFrame(simulate);
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(6,8,16,0)';
      ctx.fillRect(0, 0, W, H);

      // Draw edges
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (const link of graphData.links) {
        const src = nodeMap.get(link.source);
        const tgt = nodeMap.get(link.target);
        if (!src || !tgt) continue;
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.stroke();
      }

      // Draw nodes
      const maxShown = Math.min(nodes.length, 150);
      for (let i = 0; i < maxShown; i++) {
        const n = nodes[i];
        const color = NODE_COLORS[n.type] || NODE_COLORS.default;
        const r = n.type === 'Dataset' ? 10 : 5;

        // Glow
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 2);
        grad.addColorStop(0, color + '40');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 2, 0, Math.PI * 2);
        ctx.fill();

        // Node
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Label for dataset node only
        if (n.type === 'Dataset') {
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = '10px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label.substring(0, 12), n.x, n.y + 20);
        }
      }
    };

    animFrameRef.current = requestAnimationFrame(simulate);

    // Click handler for node selection
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      let found: GraphNode | null = null;
      for (let i = 0; i < Math.min(nodes.length, 150); i++) {
        const n = nodes[i];
        const r = n.type === 'Dataset' ? 14 : 9;
        const dx = clickX - n.x;
        const dy = clickY - n.y;
        if (dx * dx + dy * dy <= r * r) {
          const original = graphData.nodes.find(gn => gn.id === n.id);
          if (original) {
            found = original;
            break;
          }
        }
      }
      setSelected(found);
    };

    canvas.addEventListener('click', handleClick);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      canvas.removeEventListener('click', handleClick);
    };
  }, [graphData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
        <span className="ml-2 text-sm text-white/40">Loading graph...</span>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-white/30">
        <AlertTriangle className="w-5 h-5" />
        <span className="text-sm">{error || 'No graph data'}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        style={{ background: 'transparent' }}
      />

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={() => setLimit(Math.min(limit + 50, 500))}
          className="btn-ghost text-xs px-2 py-1"
        >
          <ZoomIn className="w-3 h-3" /> Load More
        </button>
        <button
          onClick={() => setLimit(Math.max(limit - 50, 50))}
          className="btn-ghost text-xs px-2 py-1"
        >
          <ZoomOut className="w-3 h-3" /> Reduce
        </button>
      </div>

      {/* Stats overlay */}
      <div className="absolute top-4 left-4 text-xs text-white/30 space-y-1">
        <div>{graphData.total_nodes.toLocaleString()} nodes</div>
        <div>{graphData.total_links.toLocaleString()} relationships</div>
        <div className="mt-2 space-y-1">
          {Object.entries(NODE_COLORS).filter(([k]) => k !== 'default').map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span>{type}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected node panel */}
      {selected && (
        <div className="absolute top-4 right-4 card p-3 max-w-48 text-xs space-y-2">
          <div className="font-medium text-white">{selected.label}</div>
          <div className="text-white/40">{selected.type}</div>
          <div className="space-y-1">
            {Object.entries(selected.properties).slice(0, 5).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-white/30 flex-shrink-0">{k}:</span>
                <span className="text-white/60 truncate">{String(v)}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setSelected(null)} className="text-white/20 hover:text-white/40">
            ✕ Close
          </button>
        </div>
      )}
    </div>
  );
}
