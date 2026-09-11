import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false });
}

export function severityColor(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return 'text-red-400';
    case 'HIGH': return 'text-orange-400';
    case 'MEDIUM': return 'text-yellow-400';
    case 'LOW': return 'text-blue-400';
    case 'INFO': return 'text-slate-400';
    case 'WARN': return 'text-yellow-400';
    default: return 'text-slate-400';
  }
}

export function severityBg(severity: string): string {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return 'bg-red-500/10 border-red-500/30';
    case 'HIGH': return 'bg-orange-500/10 border-orange-500/30';
    case 'MEDIUM': return 'bg-yellow-500/10 border-yellow-500/30';
    case 'LOW': return 'bg-blue-500/10 border-blue-500/30';
    default: return 'bg-slate-500/10 border-slate-500/30';
  }
}

export function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
}

export function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'complete': return 'text-emerald-400';
    case 'loading': return 'text-blue-400';
    case 'queued': return 'text-yellow-400';
    case 'failed': return 'text-red-400';
    default: return 'text-slate-400';
  }
}
