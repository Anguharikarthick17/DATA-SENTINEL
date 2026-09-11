import { useState } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { PipelineViz3D } from '@/components/pipeline/PipelineViz3D';
import { UploadZone } from '@/components/upload/UploadZone';
import { DataHealthCard } from '@/components/health/DataHealthCard';
import { AnomalyPanel } from '@/components/anomaly/AnomalyPanel';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { SecurityDashboard } from '@/components/security/SecurityDashboard';
import type { StatusResponse } from '@/types';

export function Dashboard() {
  const [lastStatus, setLastStatus] = useState<StatusResponse | null>(null);
  const isActive = lastStatus?.status === 'loading' || lastStatus?.status === 'complete';
  const datasetId = lastStatus?.dataset_id;

  const progress = lastStatus?.rows_total
    ? Math.round((lastStatus.rows_loaded / lastStatus.rows_total) * 100)
    : 0;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Overview"
        subtitle="Real-Time Data Intelligence"
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Pipeline Visualization */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Live Pipeline</h2>
              <p className="text-xs text-white/40 mt-0.5">
                CSV → API → Kafka → Loader → Neo4j
              </p>
            </div>
            {lastStatus && (
              <div className="text-right">
                <div className="text-xs font-mono text-white/40">
                  {lastStatus.rows_loaded.toLocaleString()} / {lastStatus.rows_total.toLocaleString()} rows
                </div>
                <div className="text-xs text-white/25 mt-0.5">
                  {lastStatus.filename}
                </div>
              </div>
            )}
          </div>

          {/* 3D visualization */}
          <div className="h-44">
            <PipelineViz3D isActive={isActive} telemetry={lastStatus} />
          </div>

          {/* Progress bar */}
          {lastStatus && lastStatus.status !== 'complete' && (
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-white/30 mb-1">
                <span>INGESTING VIA KAFKA</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full progress-bar-active rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Live Ingestion Telemetry Card */}
          {lastStatus && (
            <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 md:grid-cols-6 gap-3">
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Rows Read</div>
                <div className="text-sm font-semibold font-mono text-white mt-0.5">
                  {(lastStatus.rows_read ?? lastStatus.rows_total).toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Kafka Messages</div>
                <div className="text-sm font-semibold font-mono text-amber-400 mt-0.5">
                  {(lastStatus.messages_published ?? lastStatus.rows_total).toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Processed</div>
                <div className="text-sm font-semibold font-mono text-indigo-400 mt-0.5">
                  {lastStatus.rows_loaded.toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Neo4j Committed</div>
                <div className="text-sm font-semibold font-mono text-emerald-400 mt-0.5">
                  {lastStatus.rows_loaded.toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">Failed / DLQ</div>
                <div className={`text-sm font-semibold font-mono mt-0.5 ${lastStatus.rows_failed > 0 ? 'text-red-400' : 'text-white/40'}`}>
                  {lastStatus.rows_failed.toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                <div className="text-[10px] uppercase tracking-wider text-white/40">
                  {lastStatus.throughput_rows_sec !== undefined ? 'Throughput' : 'Progress'}
                </div>
                <div className="text-sm font-semibold font-mono text-accent-400 mt-0.5">
                  {lastStatus.throughput_rows_sec !== undefined
                    ? `${lastStatus.throughput_rows_sec} r/s`
                    : `${progress}%`}
                  {lastStatus.duration_ms !== undefined && (
                    <span className="text-[10px] text-white/30 ml-1.5 font-normal">
                      ({Math.round(lastStatus.duration_ms)}ms)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.section>

        {/* Main 3-column grid */}
        <div className="grid grid-cols-3 gap-6">
          {/* Upload + Data Health */}
          <div className="space-y-4">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="card p-4"
            >
              <h2 className="section-title">Upload CSV</h2>
              <UploadZone onComplete={setLastStatus} onStatusChange={setLastStatus} />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="card p-4"
            >
              <h2 className="section-title">Data Health</h2>
              <DataHealthCard datasetId={datasetId || 'latest'} compact />
            </motion.section>
          </div>

          {/* Anomalies */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card p-4 flex flex-col"
          >
            <h2 className="section-title">Intelligence Alerts</h2>
            <div className="flex-1 overflow-y-auto">
              <AnomalyPanel datasetId={datasetId || 'latest'} compact />
            </div>
          </motion.section>

          {/* Security + Chat */}
          <div className="space-y-4">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="card p-4"
            >
              <h2 className="section-title">Security Status</h2>
              <SecurityDashboard compact />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="card overflow-hidden"
              style={{ height: '300px' }}
            >
              <div className="px-4 pt-4 pb-2">
                <h2 className="section-title">Ask Your Data</h2>
              </div>
              <div className="h-[calc(100%-2.5rem)]">
                <ChatInterface datasetId={datasetId} />
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </div>
  );
}
