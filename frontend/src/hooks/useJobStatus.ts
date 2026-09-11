import { useState, useEffect, useCallback } from 'react';
import { getStatus } from '@/services/api';
import type { StatusResponse } from '@/types';

export function useJobStatus(jobId: string | null, pollIntervalMs = 1500) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    if (!jobId) return;
    try {
      const s = await getStatus(jobId);
      setStatus(s);
      if (s.status === 'complete' || s.status === 'failed') {
        return false; // stop polling
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Status check failed');
      return false;
    }
    return true; // continue polling
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout>;

    const doPoll = async () => {
      const cont = await poll();
      if (cont && active) {
        timeout = setTimeout(doPoll, pollIntervalMs);
      }
    };

    doPoll();
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [jobId, poll, pollIntervalMs]);

  return { status, error };
}

export function useInterval(callback: () => void, delay: number | null) {
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(callback, delay);
    return () => clearInterval(id);
  }, [callback, delay]);
}
