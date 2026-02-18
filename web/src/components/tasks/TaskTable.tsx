import { Link } from 'react-router-dom';
import type { TaskRecord } from '@/lib/api-client';
import { StatusBadge } from './StatusBadge';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TaskTable({ tasks }: { tasks: TaskRecord[] }) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">No tasks found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prompt</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {tasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap">
                <StatusBadge status={task.status} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <Link to={`/app/tasks/${task.id}`} className="text-sm font-mono text-blue-600 hover:text-blue-800">
                  {task.id.slice(0, 8)}...
                </Link>
              </td>
              <td className="px-4 py-3 text-sm text-gray-700 max-w-md truncate">
                {task.prompt.slice(0, 80)}{task.prompt.length > 80 ? '...' : ''}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{task.mode}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{timeAgo(task.createdAt)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {task.duration ? `${(task.duration / 1000).toFixed(1)}s` : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
