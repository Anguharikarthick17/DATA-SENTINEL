import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, TrendingDown, Copy, AlertTriangle, CheckCircle } from 'lucide-react';
import { getDataHealth } from '@/services/api';
import type { DataHealthResponse } from '@/types';
import { cn, scoreColor } from '@/lib/utils';

interface DataHealthCardProps {
  datasetId?: string;
  compact?: boolean;
}

export function DataHealthCard({ datasetId = 'latest', compact = false }: DataHealthCardProps) {
  const [health, setHealth] = useState<DataHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        setLoading(true);
        const h = await getDataHealth(datasetId);
        setHealth(h);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [datasetId]);

  if (loading) return <SkeletonHealth />;
  if (error || !health) return <ErrorState message={error || 'No data yet'} />;

  const metrics = [
    {
      label: 'Total Rows',
      value: health.total_rows.toLocaleString(),
      icon: Activity,
      color: 'text-blue-400',
    },
    {
      label: 'Missing Values',
      value: `${health.missing_value_pct.toFixed(1)}%`,
      icon: TrendingDown,
      color: health.missing_value_pct > 10 ? 'text-orange-400' : 'text-emerald-400',
    },
    {
      label: 'Duplicate Risk',
      value: health.duplicate_risk_count.toLocaleString(),
      icon: Copy,
      color: health.duplicate_risk_count > 0 ? 'text-yellow-400' : 'text-emerald-400',
    },
    {
      label: 'Anomalies',
      value: health.anomaly_count.toString(),
      icon: AlertTriangle,
      color: health.anomaly_count > 0 ? 'text-orange-400' : 'text-emerald-400',
    },
    {
      label: 'Schema',
      value: `${health.schema_consistency.toFixed(0)}%`,
      icon: CheckCircle,
      color: health.schema_consistency >= 95 ? 'text-emerald-400' : 'text-yellow-400',
    },
  ];

  return (
    <div className={cn('space-y-4', compact ? '' : '')}>
      {/* Score */}
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
            <motion.circle
              cx="32" cy="32" r="28"
              fill="none"
              stroke={health.score >= 90 ? '#10b981' : health.score >= 70 ? '#f59e0b' : '#ef4444'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={175.93}
              initial={{ strokeDashoffset: 175.93 }}
              animate={{ strokeDashoffset: 175.93 * (1 - health.score / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn('text-lg font-bold tabular-nums', scoreColor(health.score))}>
              {health.score}
            </span>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Health Score</div>
          <div className="text-xs text-white/40 mt-0.5">
            {health.explanation[0] || 'Data quality analysis'}
          </div>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03]">
            <m.icon className={cn('w-3.5 h-3.5 flex-shrink-0', m.color)} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-white tabular-nums">{m.value}</div>
              <div className="text-[10px] text-white/40 truncate">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Explanation */}
      {!compact && health.explanation.length > 1 && (
        <div className="space-y-1">
          {health.explanation.slice(1, 3).map((exp, i) => (
            <div key={i} className="text-xs text-white/40 flex gap-2">
              <span className="text-white/20">·</span>
              <span>{exp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonHealth() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-white/5" />
        <div className="space-y-2">
          <div className="h-4 w-24 bg-white/5 rounded" />
          <div className="h-3 w-32 bg-white/5 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-white/5 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-white/30">
      <AlertTriangle className="w-4 h-4" />
      <span className="text-sm">{message}</span>
    </div>
  );
}
