import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck, AlertTriangle, Activity, Clock,
  Ban, Zap, TrendingUp
} from 'lucide-react';
import { getSecurityStats } from '@/services/api';
import type { SecurityStats, SecurityEvent } from '@/types';
import { cn, formatLatency, formatTimestamp, scoreColor, severityColor } from '@/lib/utils';

interface SecurityDashboardProps {
  compact?: boolean;
}

export function SecurityDashboard({ compact = false }: SecurityDashboardProps) {
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const s = await getSecurityStats();
        setStats(s);
        setLoading(false);
      } catch {
        setLoading(false);
      }
    };
    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !stats) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 bg-white/5 rounded-lg" />
        ))}
      </div>
    );
  }

  const metrics = [
    {
      label: 'Req/min',
      value: stats.requests_per_minute.toFixed(1),
      icon: Activity,
      color: 'text-blue-400',
    },
    {
      label: 'Blocked',
      value: stats.blocked_requests.toString(),
      icon: Ban,
      color: stats.blocked_requests > 0 ? 'text-red-400' : 'text-emerald-400',
    },
    {
      label: 'Avg Latency',
      value: formatLatency(stats.avg_latency_ms),
      icon: Clock,
      color: stats.avg_latency_ms > 500 ? 'text-orange-400' : 'text-emerald-400',
    },
    {
      label: 'p95 Latency',
      value: formatLatency(stats.p95_latency_ms),
      icon: TrendingUp,
      color: stats.p95_latency_ms > 1000 ? 'text-orange-400' : 'text-white/60',
    },
    {
      label: 'Rate Limits',
      value: stats.rate_limit_events.toString(),
      icon: Zap,
      color: stats.rate_limit_events > 5 ? 'text-yellow-400' : 'text-white/60',
    },
    {
      label: 'Error Rate',
      value: `${stats.error_rate.toFixed(1)}%`,
      icon: AlertTriangle,
      color: stats.error_rate > 10 ? 'text-orange-400' : 'text-emerald-400',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Score */}
      <div className="flex items-center gap-4">
        <div className="relative w-14 h-14 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
            <motion.circle
              cx="28" cy="28" r="24"
              fill="none"
              stroke={stats.security_score >= 90 ? '#10b981' : stats.security_score >= 70 ? '#f59e0b' : '#ef4444'}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={150.8}
              initial={{ strokeDashoffset: 150.8 }}
              animate={{ strokeDashoffset: 150.8 * (1 - stats.security_score / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn('text-base font-bold', scoreColor(stats.security_score))}>
              {stats.security_score}
            </span>
          </div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Security Score</div>
          <div className="text-xs text-white/40">Based on live traffic analysis</div>
        </div>
        <div className="ml-auto">
          <ShieldCheck className={cn('w-6 h-6', scoreColor(stats.security_score))} />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className="p-2 rounded-lg bg-white/[0.03] text-center">
            <div className={cn('text-sm font-semibold tabular-nums', m.color)}>
              {m.value}
            </div>
            <div className="text-[10px] text-white/35 mt-0.5">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Recent events */}
      {!compact && (
        <div className="space-y-1.5">
          <div className="section-title">Recent Events</div>
          {stats.events.slice(0, 8).map((event, i) => (
            <EventRow key={i} event={event} />
          ))}
          {stats.events.length === 0 && (
            <div className="text-xs text-white/25 py-2">No events recorded yet</div>
          )}
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: SecurityEvent }) {
  const statusColors: Record<number, string> = {
    200: 'text-emerald-400',
    201: 'text-emerald-400',
    400: 'text-orange-400',
    401: 'text-red-400',
    403: 'text-red-400',
    404: 'text-white/30',
    429: 'text-yellow-400',
    500: 'text-red-400',
  };

  const statusColor = statusColors[event.status_code] || 'text-white/40';
  const icon = event.event_type === 'RATE_LIMITED' ? '⚡' :
               event.event_type === 'INVALID_UPLOAD' ? '⚠' :
               event.event_type === 'SUSPICIOUS' ? '🚨' : '✓';

  return (
    <div className="flex items-center gap-2 py-1 text-[10px] font-mono border-b border-white/[0.04] last:border-0">
      <span className="text-white/20 flex-shrink-0 w-16 truncate">
        {formatTimestamp(event.timestamp)}
      </span>
      <span className="text-white/15">{icon}</span>
      <span className="text-white/40 truncate flex-1">{event.endpoint}</span>
      <span className={cn('flex-shrink-0 font-semibold', statusColor)}>
        {event.status_code}
      </span>
    </div>
  );
}

// Network flow visualization
export function NetworkFlowViz() {
  const nodes = [
    { label: 'CLIENTS', color: '#6366f1' },
    { label: 'GATEWAY', color: '#3b82f6' },
    { label: 'RATE LIMITER', color: '#f59e0b' },
    { label: 'API', color: '#8b5cf6' },
    { label: 'KAFKA', color: '#f59e0b' },
    { label: 'NEO4J', color: '#10b981' },
  ];

  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      {nodes.map((node, i) => (
        <div key={node.label} className="flex flex-col items-center">
          <div
            className="px-3 py-1.5 rounded text-[10px] font-mono font-medium border"
            style={{
              background: `${node.color}10`,
              borderColor: `${node.color}30`,
              color: node.color,
            }}
          >
            {node.label}
          </div>
          {i < nodes.length - 1 && (
            <div className="flex flex-col items-center my-0.5">
              <div
                className="w-px h-4"
                style={{ background: `${node.color}30` }}
              />
              <div
                className="w-1 h-1 rounded-full animate-pulse"
                style={{ background: nodes[i + 1].color + '80' }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
