import { useParams, Link } from 'react-router-dom';
import { useTask, useArtifacts } from '@/hooks/useTasks';
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

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: task, loading, error } = useTask(id!);
  const { data: artifacts } = useArtifacts(id!);

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
