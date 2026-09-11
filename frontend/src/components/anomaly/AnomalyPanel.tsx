import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ChevronDown, ChevronUp, Search, Code2, Database } from 'lucide-react';
import { getAnomalies } from '@/services/api';
import type { AnomalyItem, AnomaliesResponse } from '@/types';
import { cn, severityColor, severityBg } from '@/lib/utils';

interface AnomalyPanelProps {
  datasetId?: string;
  compact?: boolean;
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function AnomalyPanel({ datasetId = 'latest', compact = false }: AnomalyPanelProps) {
  const [data, setData] = useState<AnomaliesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const result = await getAnomalies(datasetId);
        setData(result);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load anomalies');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [datasetId]);

  if (loading) return <SkeletonAnomalies />;

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 py-4 text-white/30">
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm">{error || 'No data yet'}</span>
      </div>
    );
  }

  const sorted = [...data.anomalies].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );
  const displayed = compact ? sorted.slice(0, 3) : sorted;

  if (displayed.length === 0) {
    return (
      <div className="flex items-center gap-3 py-4 text-white/30">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <Search className="w-4 h-4 text-emerald-400" />
        </div>
        <span className="text-sm">No anomalies detected</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map((anomaly) => (
        <AnomalyCard
          key={anomaly.id}
          anomaly={anomaly}
          isExpanded={expanded === anomaly.id}
          onToggle={() => setExpanded(expanded === anomaly.id ? null : anomaly.id)}
        />
      ))}
      {compact && sorted.length > 3 && (
        <div className="text-xs text-white/30 text-center pt-1">
          +{sorted.length - 3} more anomalies
        </div>
      )}
    </div>
  );
}

function AnomalyCard({
  anomaly,
  isExpanded,
  onToggle,
}: {
  anomaly: AnomalyItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      className={cn('border rounded-lg overflow-hidden', severityBg(anomaly.severity))}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-3 text-left hover:bg-white/[0.02] transition-colors"
        aria-expanded={isExpanded}
      >
        <AlertTriangle className={cn('w-3.5 h-3.5 flex-shrink-0 mt-0.5', severityColor(anomaly.severity))} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('text-[10px] font-bold tracking-widest', severityColor(anomaly.severity))}>
              {anomaly.severity}
            </span>
            {anomaly.column && (
              <span className="text-[10px] text-white/30 font-mono">·  {anomaly.column}</span>
            )}
          </div>
          <div className="text-xs font-medium text-white/80 mt-0.5 truncate">
            {anomaly.title}
          </div>
          <div className="text-[10px] text-white/40 mt-0.5">
            {anomaly.affected_count.toLocaleString()} affected records
          </div>
        </div>
        <div className="flex-shrink-0 text-white/20">
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Expanded investigation panel */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-3 border-t border-white/5 pt-3">
              {/* Reason */}
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Search className="w-3 h-3" /> Why?
                </div>
                <p className="text-xs text-white/60">{anomaly.reason}</p>
              </div>

              {/* Evidence */}
              <div>
                <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Database className="w-3 h-3" /> Evidence
                </div>
                <p className="text-xs text-white/50 font-mono bg-black/20 rounded p-2">
                  {anomaly.evidence}
                </p>
              </div>

              {/* Cypher */}
              {anomaly.cypher && (
                <div>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                    <Code2 className="w-3 h-3" /> Cypher
                  </div>
                  <div className="code-block text-[10px]">{anomaly.cypher}</div>
                </div>
              )}

              <div className="text-[10px] text-emerald-400/60 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 inline-block" />
                Grounded — generated from actual graph data
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SkeletonAnomalies() {
  return (
    <div className="space-y-2 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-16 bg-white/5 rounded-lg" />
      ))}
    </div>
  );
}
