import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { SecurityDashboard, NetworkFlowViz } from '@/components/security/SecurityDashboard';

export function SecurityPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Security" subtitle="Traffic Control & API Monitoring" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Main security dashboard */}
          <div className="col-span-2 space-y-4">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="card p-5"
            >
              <h2 className="section-title">Security & Traffic Analysis</h2>
              <SecurityDashboard />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="card p-5"
            >
              <h2 className="section-title">About Security Controls</h2>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { title: 'File Validation', desc: 'CSV extension, MIME type, and size limits enforced on every upload' },
                  { title: 'Rate Limiting', desc: 'Sliding-window 120 req/min per IP. Excess requests return 429' },
                  { title: 'Input Sanitization', desc: 'All CSV values sanitized — control chars and null bytes stripped' },
                  { title: 'Safe Errors', desc: 'No stack traces exposed. Clean human-readable error messages only' },
                  { title: 'Non-root Containers', desc: 'API and Loader containers run as uid 1001, not root' },
                  { title: 'Env-based Secrets', desc: 'All credentials in environment variables, never hardcoded' },
                ].map((item) => (
                  <div key={item.title} className="p-3 rounded-lg bg-white/[0.03]">
                    <div className="text-xs font-medium text-white/70 mb-1">{item.title}</div>
                    <div className="text-[10px] text-white/40 leading-relaxed">{item.desc}</div>
                  </div>
                ))}
              </div>
            </motion.section>
          </div>

          {/* Right column — network flow */}
          <div className="space-y-4">
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="card p-5"
            >
              <h2 className="section-title">Network Flow</h2>
              <NetworkFlowViz />
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card p-5"
            >
              <h2 className="section-title">CORS Policy</h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-white/50">Origins restricted to known UI hostnames</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-white/50">Configurable via CORS_ORIGINS env var</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span className="text-white/50">No wildcard in production mode</span>
                </div>
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="card p-5"
            >
              <h2 className="section-title">Idempotency</h2>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">◈</span>
                  <span className="text-white/50">MERGE on (dataset_id, row_index)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">◈</span>
                  <span className="text-white/50">Same CSV uploaded twice = no duplicates</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-400 mt-0.5">◈</span>
                  <span className="text-white/50">Graph remains reproducible</span>
                </div>
              </div>
            </motion.section>
          </div>
        </div>
      </div>
    </div>
  );
}
