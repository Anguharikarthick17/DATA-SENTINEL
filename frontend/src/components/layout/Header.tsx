import { useEffect, useState } from 'react';
import { getHealth } from '@/services/api';
import type { HealthResponse } from '@/types';
import { cn } from '@/lib/utils';

interface ServiceStatusProps {
  label: string;
  connected: boolean;
}

function ServiceStatus({ label, connected }: ServiceStatusProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          connected ? 'bg-emerald-400' : 'bg-red-400'
        )}
        style={connected ? {
          boxShadow: '0 0 6px rgba(52, 211, 153, 0.6)',
          animation: 'pulse 2s infinite',
        } : undefined}
      />
      <span className={cn('font-medium', connected ? 'text-white/60' : 'text-red-400/70')}>
        {label}
      </span>
    </div>
  );
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  useEffect(() => {
    const check = async () => {
      try {
        const h = await getHealth();
        setHealth(h);
        setLastChecked(new Date());
      } catch {
        setHealth({ status: 'unreachable', kafka_connected: false, neo4j_connected: false });
      }
    };

    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#080b14]/80 backdrop-blur-sm">
      <div>
        <h1 className="text-sm font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-5">
        {health ? (
          <>
            <ServiceStatus label="Kafka" connected={health.kafka_connected} />
            <div className="w-px h-3 bg-white/10" />
            <ServiceStatus label="Neo4j" connected={health.neo4j_connected} />
            <div className="w-px h-3 bg-white/10" />
            <ServiceStatus label="API" connected={health.status !== 'unreachable'} />
          </>
        ) : (
          <div className="text-xs text-white/30 animate-pulse">Checking services...</div>
        )}
      </div>
    </header>
  );
}
