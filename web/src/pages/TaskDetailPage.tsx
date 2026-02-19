import { useParams, Link } from 'react-router-dom';
import { useRef, useEffect } from 'react';
import { useTask, useArtifacts } from '@/hooks/useTasks';
import { useTaskLogs } from '@/hooks/useTaskLogs';
import { api } from '@/lib/api-client';
import { StatusBadge } from '@/components/tasks/StatusBadge';

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

// --- Log line styling helpers ---

const LOG_STYLES: Record<string, string> = {
  system: 'text-gray-500',
  assistant: 'text-gray-200',
  tool: 'text-blue-400',
  result: 'text-green-400',
  error: 'text-red-400',
};

function LogLine({ line }: { line: string }) {
  const match = line.match(/^\[(\w+)\]/);
  const tag = match?.[1] || '';
  const style = LOG_STYLES[tag] || 'text-gray-400';
  return <div className={style}>{line}</div>;
}

function LogsPanel({
  logs,
  connected,
  done,
  status,
  logsEndRef,
}: {
  logs: string;
  connected: boolean;
  done: boolean;
  status: string;
  logsEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isStreaming = status === 'running' || status === 'queued';

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current;
      // Only auto-scroll if user is near the bottom
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (isNearBottom) {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [logs, logsEndRef]);

  const lines = logs.split('\n').filter(Boolean);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wide">Logs</h3>
        <div className="flex items-center gap-2">
          {isStreaming && !done && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`} />
              {connected ? 'Streaming' : 'Connecting...'}
            </span>
          )}
          {done && (
            <span className="text-xs text-gray-500">Complete</span>
          )}
          <span className="text-xs text-gray-600">{lines.length} lines</span>
        </div>
      </div>
      <div
        ref={containerRef}
        className="p-4 max-h-[32rem] overflow-auto font-mono text-xs leading-5"
      >
        {lines.map((line, i) => (
          <LogLine key={i} line={line} />
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: task, loading, error } = useTask(id!);
  const { data: artifacts } = useArtifacts(id!);
  const { logs, connected, done: logsDone } = useTaskLogs(id!, task?.status || '');
  const logsEndRef = useRef<HTMLDivElement>(null);

  if (loading && !task) return <div className="text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!task) return <div className="text-sm text-gray-500">Task not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/app" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</Link>
        <h2 className="text-xl font-semibold text-gray-900">Task {task.id.slice(0, 8)}...</h2>
        <StatusBadge status={task.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Info card */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Info</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">ID</dt>
              <dd className="font-mono text-gray-900">{task.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Mode</dt>
              <dd className="text-gray-900">{task.mode}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">{new Date(task.createdAt).toLocaleString()}</dd>
            </div>
            {task.startedAt && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Started</dt>
                <dd className="text-gray-900">{new Date(task.startedAt).toLocaleString()}</dd>
              </div>
            )}
            {task.completedAt && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Completed</dt>
                <dd className="text-gray-900">{new Date(task.completedAt).toLocaleString()}</dd>
              </div>
            )}
            {task.duration != null && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Duration</dt>
                <dd className="text-gray-900">{(task.duration / 1000).toFixed(1)}s</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Prompt card */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Prompt</h3>
          <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-64 overflow-auto">
            {task.prompt}
          </pre>
        </div>
      </div>

      {/* Live Logs */}
      {logs && (
        <LogsPanel
          logs={logs}
          connected={connected}
          done={logsDone}
          status={task.status}
          logsEndRef={logsEndRef}
        />
      )}

      {/* Result */}
      {task.result && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">
            Result {task.result.valid ? '(valid)' : '(invalid)'}
          </h3>
          <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-96 overflow-auto">
            {JSON.stringify(task.result.data, null, 2)}
          </pre>
        </div>
      )}

      {/* Error */}
      {task.error && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-5 space-y-2">
          <h3 className="text-sm font-medium text-red-700 uppercase">Error: {task.error.code}</h3>
          <p className="text-sm text-red-600">{task.error.message}</p>
        </div>
      )}

      {/* Artifacts */}
      {artifacts && artifacts.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Artifacts ({artifacts.length})</h3>
          <ul className="divide-y divide-gray-100">
            {artifacts.map((a) => (
              <li key={a.path} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {fileExt(a.name) || 'file'}
                  </span>
                  <span className="text-sm text-gray-900 truncate">{a.name}</span>
                  <span className="text-xs text-gray-400">{formatSize(a.size)}</span>
                </div>
                <a
                  href={api.tasks.artifactUrl(task.id, a.path)}
                  download
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium shrink-0 ml-4"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
