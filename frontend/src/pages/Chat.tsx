import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { ChatInterface } from '@/components/chat/ChatInterface';

export function ChatPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Intelligence" subtitle="Grounded Natural Language Queries" />

      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatInterface />
        </div>

        {/* Side panel — Sentinel Verification Firewall & Relationship Intelligence */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-72 flex-shrink-0 border-l border-white/[0.06] p-5 space-y-6 overflow-y-auto"
        >
          <div>
            <h3 className="section-title">Sentinel Firewall</h3>
            <div className="space-y-2.5">
              {[
                { step: '01', label: 'QUESTION RECEIVED', desc: 'Incoming NL request' },
                { step: '02', label: 'INTENT DETECTED', desc: 'Deterministic classifier' },
                { step: '03', label: 'CYPHER GENERATED', desc: 'Strict AST/template match' },
                { step: '04', label: 'NEO4J EXECUTED', desc: 'Actual graph query' },
                { step: '05', label: 'EVIDENCE FOUND', desc: 'Non-empty result verification' },
                { step: '06', label: 'ANSWER VERIFIED', desc: 'Grounded in real evidence' },
              ].map((item) => (
                <div key={item.step} className="flex gap-2.5 items-start">
                  <div className="w-5 h-5 rounded bg-accent-600/20 flex items-center justify-center text-[10px] font-mono font-bold text-accent-400 flex-shrink-0 mt-0.5">
                    {item.step}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-white/80">{item.label}</div>
                    <div className="text-[10px] text-white/35">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="text-[10px] font-semibold text-emerald-400 mb-1">Anti-Hallucination Rule</div>
            <div className="text-[10px] text-white/40 leading-relaxed">
              If an answer cannot be verified from actual Neo4j evidence, the query is immediately blocked with
              <span className="text-red-400 font-mono"> grounded: false</span>. Zero fabricated explanations.
            </div>
          </div>

          <div>
            <h3 className="section-title">Supported Queries</h3>
            <div className="space-y-1.5">
              {[
                'Row counts & totals',
                'Schema / column listing',
                'Filter by category value',
                'Distinct value listing',
                'Top N by numeric field',
                'Average / sum calculations',
                'Missing value counts',
                'Dataset metadata',
              ].map((q) => (
                <div key={q} className="flex items-center gap-2 text-[10px] text-white/40">
                  <span className="text-emerald-400/60">✓</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
