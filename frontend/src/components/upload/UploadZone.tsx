import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { ingestCSV, getStatus } from '@/services/api';
import type { StatusResponse } from '@/types';
import { cn, formatBytes, statusColor } from '@/lib/utils';

interface UploadZoneProps {
  onComplete?: (status: StatusResponse) => void;
  onStatusChange?: (status: StatusResponse) => void;
}

export function UploadZone({ onComplete, onStatusChange }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rowCount, setRowCount] = useState<number | null>(null);

  const parseRowCount = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim().length > 0);
      setRowCount(Math.max(0, lines.length - 1)); // subtract header
    };
    reader.readAsText(file.slice(0, 50000)); // read first 50KB for preview
  }, []);

  const handleFile = useCallback((f: File) => {
    if (!f.name.endsWith('.csv')) {
      setError('Only .csv files are accepted');
      return;
    }
    setFile(f);
    setError(null);
    setStatus(null);
    parseRowCount(f);
  }, [parseRowCount]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file || uploading) return;
    setUploading(true);
    setError(null);

    try {
      const result = await ingestCSV(file);

      // Poll status
      let attempts = 0;
      const poll = async () => {
        const s = await getStatus(result.job_id);
        setStatus(s);
        if (onStatusChange) onStatusChange(s);
        if (s.status === 'complete' || s.status === 'failed' || attempts > 60) {
          if (s.status === 'complete' && onComplete) onComplete(s);
          setUploading(false);
        } else {
          attempts++;
          setTimeout(poll, 1000);
        }
      };

      await poll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setUploading(false);
    }
  };

  const progress = status
    ? status.rows_total > 0
      ? Math.round((status.rows_loaded / status.rows_total) * 100)
      : 0
    : 0;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => !file && document.getElementById('csv-file-input')?.click()}
        className={cn(
          'relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer',
          isDragging
            ? 'border-accent-500/70 bg-accent-500/5'
            : file
            ? 'border-emerald-500/40 bg-emerald-500/5 cursor-default'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.02]'
        )}
      >
        <input
          id="csv-file-input"
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        <div className="px-6 py-8 text-center">
          {file ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center">
                <FileText className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-white">{file.name}</div>
                <div className="text-xs text-white/40 mt-1">
                  {formatBytes(file.size)}
                  {rowCount !== null && ` · ~${rowCount.toLocaleString()} rows`}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setStatus(null);
                  setRowCount(null);
                  setUploading(false);
                }}
                className="text-xs text-white/30 hover:text-red-400 transition-colors flex items-center gap-1 mx-auto"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center">
                <Upload className="w-8 h-8 text-white/20" />
              </div>
              <div>
                <div className="text-sm text-white/60">
                  Drag & drop a CSV file, or <span className="text-accent-400">browse</span>
                </div>
                <div className="text-xs text-white/30 mt-1">Max 50MB · CSV only</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
          >
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Button */}
      {file && !uploading && (!status || status.status === 'failed') && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleUpload}
          className="btn-primary w-full justify-center"
        >
          <Upload className="w-4 h-4" />
          Ingest via Kafka Pipeline
        </motion.button>
      )}

      {/* Status */}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3 p-4 card"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {status.status === 'complete' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : status.status === 'failed' ? (
                  <AlertCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <Loader2 className="w-4 h-4 text-accent-400 animate-spin" />
                )}
                <span className={cn('text-sm font-medium', statusColor(status.status))}>
                  {status.status.toUpperCase()}
                </span>
              </div>
              <span className="text-xs text-white/40 font-mono">
                {status.rows_loaded.toLocaleString()} / {status.rows_total.toLocaleString()} rows
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  status.status === 'complete' ? 'bg-emerald-500' :
                  status.status === 'failed' ? 'bg-red-500' : 'progress-bar-active'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-sm font-semibold text-white">{status.rows_loaded.toLocaleString()}</div>
                <div className="text-[10px] text-white/40">Loaded</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-red-400">{status.rows_failed.toLocaleString()}</div>
                <div className="text-[10px] text-white/40">Failed</div>
              </div>
              <div>
                <div className="text-sm font-semibold text-white/50">{status.rows_total.toLocaleString()}</div>
                <div className="text-[10px] text-white/40">Total</div>
              </div>
            </div>

            {status.dataset_id && (
              <div className="text-[10px] font-mono text-white/25 truncate">
                ID: {status.dataset_id}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
