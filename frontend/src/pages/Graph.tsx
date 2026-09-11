import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { GraphView } from '@/components/graph/GraphView';
import { getDatasets } from '@/services/api';
import type { Dataset } from '@/types';
import { cn } from '@/lib/utils';

export function GraphPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string>('latest');

  useEffect(() => {
    getDatasets().then(r => {
      setDatasets(r.datasets);
      if (r.datasets[0]) setSelectedId(r.datasets[0].id);
    }).catch(() => {});
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Header title="Graph" subtitle="Neo4j Relationship Visualization" />

      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-4">
        {/* Dataset selector */}
        {datasets.length > 1 && (
          <div className="flex gap-2 flex-shrink-0">
            {datasets.map((ds) => (
              <button
                key={ds.id}
                onClick={() => setSelectedId(ds.id)}
                className={cn(
                  'text-xs px-3 py-1.5 rounded-lg border transition-all',
                  selectedId === ds.id
                    ? 'bg-accent-600/15 border-accent-500/30 text-accent-300'
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
                )}
              >
                {ds.filename}
              </button>
            ))}
          </div>
        )}

        {/* Graph */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex-1 card overflow-hidden"
        >
          <GraphView datasetId={selectedId} />
        </motion.div>

        {/* Legend */}
        <div className="flex-shrink-0 flex items-center gap-6 text-[10px] text-white/30">
          <span className="font-semibold tracking-widest uppercase">Node Types</span>
          {[
            { type: 'Dataset', color: '#3b82f6' },
            { type: 'Row', color: '#6366f1' },
            { type: 'Customer', color: '#10b981' },
            { type: 'Order', color: '#f59e0b' },
            { type: 'Product', color: '#8b5cf6' },
          ].map(({ type, color }) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: color }} />
              <span>{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
