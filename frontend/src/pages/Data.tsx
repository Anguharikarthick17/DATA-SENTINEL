import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { GitBranch, CheckCircle2, ArrowRight } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { UploadZone } from '@/components/upload/UploadZone';
import { DataHealthCard } from '@/components/health/DataHealthCard';
import { AnomalyPanel } from '@/components/anomaly/AnomalyPanel';
import { getDatasets, getCrossRelationships } from '@/services/api';
import type { Dataset, StatusResponse, CrossRelationship } from '@/types';
import { cn } from '@/lib/utils';

export function DataPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [lastStatus, setLastStatus] = useState<StatusResponse | null>(null);
  const [relationships, setRelationships] = useState<CrossRelationship[]>([]);

  useEffect(() => {
    const fetch = async () => {
      try {
        const result = await getDatasets();
        setDatasets(result.datasets);
        if (result.datasets.length > 0 && !selectedId) {
          setSelectedId(result.datasets[0].id);
        }
      } catch { /* ignore */ }

      try {
        const relData = await getCrossRelationships();
        setRelationships(relData.relationships || []);
      } catch { /* ignore */ }
    };
    fetch();
    const interval = setInterval(fetch, 10000);
    return () => clearInterval(interval);
  }, [selectedId]);

  const handleComplete = (status: StatusResponse) => {
    setLastStatus(status);
    if (status.dataset_id) setSelectedId(status.dataset_id);
    // Refresh datasets list and relationships
    getDatasets().then(r => setDatasets(r.datasets)).catch(() => {});
    getCrossRelationships().then(r => setRelationships(r.relationships)).catch(() => {});
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Data" subtitle="Ingestion & Quality Analysis" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 gap-6">
          {/* Left — upload + datasets + relationship intelligence */}
          <div className="space-y-4">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-5"
            >
              <h2 className="section-title">Ingest CSV</h2>
              <UploadZone onComplete={handleComplete} />
            </motion.section>

            {/* Relationship Intelligence Section */}
            {relationships.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="card p-4 border-indigo-500/20 bg-indigo-500/[0.02]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-indigo-400" />
                    <h2 className="section-title mb-0">Relationship Intelligence</h2>
                  </div>
                  <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                    {relationships.length} Discovered
                  </span>
                </div>

                <div className="space-y-2">
                  {relationships.map((rel, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-white/[0.02] border border-white/5 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-white">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          {rel.shared_column}
                        </div>
                        <span className="text-[10px] text-white/40 font-mono">
                          {rel.match_count} shared values
                        </span>
                      </div>
                      <div className="text-[11px] text-white/60">
                        {rel.source_filename} ↔ {rel.target_filename}
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-emerald-400/80 font-mono">
                          ✓ {rel.basis}
                        </span>
                        <Link
                          to="/graph"
                          className="text-[10px] text-accent-400 hover:text-accent-300 flex items-center gap-1 font-mono transition-colors"
                        >
                          View in Graph <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}

            {/* Dataset list */}
            {datasets.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card p-4"
              >
                <h2 className="section-title">Uploaded Datasets</h2>
                <div className="space-y-2">
                  {datasets.map((ds) => (
                    <button
                      key={ds.id}
                      onClick={() => setSelectedId(ds.id)}
                      className={cn(
                        'w-full flex items-center justify-between p-3 rounded-lg text-left transition-all',
                        selectedId === ds.id
                          ? 'bg-accent-600/15 border border-accent-500/20'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border border-transparent'
                      )}
                    >
                      <div>
                        <div className="text-sm font-medium text-white">{ds.filename}</div>
                        <div className="text-xs text-white/35 mt-0.5 font-mono">
                          {ds.id.substring(0, 8)}...
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-white tabular-nums">
                          {(ds.loaded_count || 0).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-white/35">rows loaded</div>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.section>
            )}
          </div>

          {/* Right — health + anomalies */}
          <div className="space-y-4">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="card p-5"
            >
              <h2 className="section-title">Data Health Analysis</h2>
              <DataHealthCard datasetId={selectedId || 'latest'} />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card p-5"
            >
              <h2 className="section-title">Anomaly Detection</h2>
              <AnomalyPanel datasetId={selectedId || 'latest'} />
            </motion.section>
          </div>
        </div>
      </div>
    </div>
  );
}
