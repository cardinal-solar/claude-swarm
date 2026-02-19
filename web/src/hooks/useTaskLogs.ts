import { useState, useEffect, useRef, useCallback } from 'react';

interface UseTaskLogsResult {
  logs: string;
  connected: boolean;
  done: boolean;
}

/**
 * Hook that streams task logs in real-time via SSE for running/queued tasks,
 * or fetches accumulated logs for completed/failed tasks.
 */
export function useTaskLogs(taskId: string, taskStatus: string): UseTaskLogsResult {
  const [logs, setLogs] = useState('');
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fetchedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!taskId || !taskStatus) return;

    const isActive = taskStatus === 'running' || taskStatus === 'queued';
    const isTerminal = taskStatus === 'completed' || taskStatus === 'failed' || taskStatus === 'cancelled';

    // For running/queued tasks, use SSE streaming
    if (isActive) {
      cleanup();
      fetchedRef.current = false;
      const url = `/api/tasks/${encodeURIComponent(taskId)}/logs`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'snapshot') {
            // Full log snapshot from server – replace, don't append
            setLogs(data.content);
          } else if (data.type === 'log') {
            setLogs((prev) => prev + data.content);
          } else if (data.type === 'done') {
            setDone(true);
            cleanup();
          }
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        setConnected(false);
      };

      return cleanup;
    }

    // For completed/failed/cancelled tasks, fetch one-shot logs
    // (only if we haven't already fetched or accumulated SSE logs)
    if (isTerminal && !fetchedRef.current) {
      fetchedRef.current = true;
      setDone(true);
      cleanup();

      fetch(`/api/tasks/${encodeURIComponent(taskId)}/logs`)
        .then((res) => res.json())
        .then((data) => {
          if (data.logs) {
            // Replace logs with full accumulated content from server
            setLogs(data.logs);
          }
        })
        .catch(() => {});
    }

    return cleanup;
  }, [taskId, taskStatus, cleanup]);

  return { logs, connected, done };
}
