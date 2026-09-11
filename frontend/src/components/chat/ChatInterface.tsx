import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, CheckCircle2, XCircle, AlertTriangle, ShieldCheck,
  Code2, Database, ChevronDown, ChevronUp, Search, Terminal
} from 'lucide-react';
import { chat } from '@/services/api';
import type { ChatMessage, ChatResponse } from '@/types';
import { cn } from '@/lib/utils';

const EXAMPLE_QUESTIONS = [
  'How many rows are in the dataset?',
  'What columns does the dataset have?',
  'How many rows belong to Billing?',
  'Show me the top 5 records by amount',
  'What are the unique categories?',
  'How many rows have missing values?',
];

interface ChatInterfaceProps {
  datasetId?: string;
}

export function ChatInterface({ datasetId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const send = useCallback(async (question: string) => {
    if (!question.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };
    const loadingMsg: ChatMessage = {
      id: Date.now().toString() + '-loading',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loading: true,
    };

    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setInput('');
    setLoading(true);

    try {
      const response = await chat({ question, dataset_id: datasetId });
      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMsg.id
            ? { ...m, content: response.answer, response, loading: false }
            : m
        )
      );
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : 'Failed to get response';
      setMessages(prev =>
        prev.map(m =>
          m.id === loadingMsg.id
            ? {
                ...m,
                content: errMsg,
                loading: false,
                response: {
                  answer: errMsg,
                  cypher: '',
                  result: [],
                  grounded: false,
                  verification_status: 'UNSUPPORTED',
                },
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading, datasetId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] space-y-6">
            <div className="text-center space-y-1">
              <div className="text-sm font-medium text-white/40">Ask anything about your data</div>
              <div className="text-xs text-white/20">Sentinel Verification Firewall · No Hallucinations</div>
            </div>
            <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-left text-xs p-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white/50 hover:text-white/70 transition-all border border-white/5 hover:border-white/10"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 pb-4 border-t border-white/[0.06] pt-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything about your uploaded data..."
              rows={1}
              disabled={loading}
              className="input w-full resize-none max-h-32 min-h-[40px] py-2.5 pr-12"
              style={{ height: 'auto' }}
              aria-label="Chat input"
            />
          </div>
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className={cn(
              'btn-primary h-10 w-10 justify-center p-0 flex-shrink-0',
              (!input.trim() || loading) && 'opacity-40 cursor-not-allowed'
            )}
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-[10px] text-white/20 mt-2">
          Press Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-accent-600/20 border border-accent-500/20 rounded-xl rounded-tr-sm px-4 py-2.5">
          <p className="text-sm text-white/90">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.loading) {
    return (
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
          <div className="flex gap-0.5">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
        <div className="flex-1" />
      </div>
    );
  }

  const resp = message.response;
  const status = resp?.verification_status || (resp?.grounded ? 'VERIFIED' : 'UNSUPPORTED');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-3"
    >
      <div className={cn(
        'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
        status === 'VERIFIED' ? 'bg-emerald-500/10' :
        status === 'NO_EVIDENCE' ? 'bg-amber-500/10' :
        'bg-red-500/10'
      )}>
        {status === 'VERIFIED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
        {status === 'NO_EVIDENCE' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
        {(status === 'UNSUPPORTED' || status === 'NO_DATASET') && <XCircle className="w-3.5 h-3.5 text-red-400" />}
      </div>

      <div className="flex-1 min-w-0 space-y-2.5">
        {/* Answer */}
        <div className="prose prose-invert prose-sm max-w-none">
          <p
            className="text-sm text-white/80 leading-relaxed m-0"
            dangerouslySetInnerHTML={{
              __html: message.content
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/`([^`]+)`/g, '<code class="font-mono text-accent-300 bg-black/30 px-1 rounded text-xs">$1</code>')
            }}
          />
        </div>

        {/* Sentinel Verification Firewall Status Badges */}
        {resp && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {status === 'VERIFIED' && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium rounded px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> GROUNDED · VERIFIED FROM NEO4J
              </span>
            )}
            {status === 'NO_EVIDENCE' && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium rounded px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <AlertTriangle className="w-3 h-3" /> NOT FOUND IN DATA · NO EVIDENCE
              </span>
            )}
            {status === 'UNSUPPORTED' && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium rounded px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400">
                <XCircle className="w-3 h-3" /> OUTSIDE DATASET · ANSWER BLOCKED
              </span>
            )}
            {status === 'NO_DATASET' && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium rounded px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400">
                <XCircle className="w-3 h-3" /> NO DATASET UPLOADED
              </span>
            )}

            {/* Why this answer? Audit trail toggle */}
            {resp.verification_steps && resp.verification_steps.length > 0 && (
              <button
                onClick={() => setShowWhy(!showWhy)}
                className="text-[10px] font-mono text-accent-400/80 hover:text-accent-300 flex items-center gap-1 transition-colors ml-1"
              >
                <ShieldCheck className="w-3 h-3" />
                {showWhy ? '[Hide verification]' : '[Why this answer?]'}
              </button>
            )}
          </div>
        )}

        {/* Sentinel Verification Audit Trail Panel */}
        <AnimatePresence>
          {showWhy && resp?.verification_steps && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden card p-3 space-y-2.5 bg-white/[0.02] border border-white/10 rounded-lg text-xs"
            >
              <div className="text-[10px] font-mono tracking-wider uppercase text-accent-400/70 border-b border-white/5 pb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> SENTINEL VERIFICATION FIREWALL
              </div>
              <div className="space-y-2">
                {resp.verification_steps.map((step) => (
                  <div key={step.step} className="flex items-start gap-2.5 font-mono text-[11px]">
                    <span className="text-white/30 font-bold">{step.step}</span>
                    <div className="flex-1">
                      <span className="text-white/50 uppercase tracking-wide text-[10px] block">
                        {step.label}
                      </span>
                      <span className={cn(
                        'text-xs',
                        step.status === 'VERIFIED' ? 'text-emerald-400' :
                        step.status === 'BLOCKED' ? 'text-red-400' :
                        'text-white/80'
                      )}>
                        {step.detail}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cypher and Raw Result expander */}
        {resp && (resp.cypher || resp.result.length > 0) && (
          <div className="pt-1">
            <button
              onClick={() => setShowEvidence(!showEvidence)}
              className="flex items-center gap-1.5 text-[10px] text-white/30 hover:text-white/50 transition-colors"
            >
              {showEvidence ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showEvidence ? 'Hide' : 'Show'} Cypher & Result
            </button>

            <AnimatePresence>
              {showEvidence && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-2 space-y-2"
                >
                  {/* Cypher */}
                  {resp.cypher && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] text-white/25 mb-1">
                        <Code2 className="w-3 h-3" /> CYPHER
                      </div>
                      <div className="code-block">{resp.cypher}</div>
                    </div>
                  )}

                  {/* Raw result */}
                  {resp.result.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] text-white/25 mb-1">
                        <Database className="w-3 h-3" /> RAW RESULT
                      </div>
                      <div className="code-block max-h-32 overflow-y-auto">
                        {JSON.stringify(resp.result, null, 2)}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

