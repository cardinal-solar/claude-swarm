import { useState } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { TaskTable } from '@/components/tasks/TaskTable';

const STATUSES = ['all', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const;

export function TasksPage() {
  const [filter, setFilter] = useState<string>('all');
  const { data: tasks, loading, error } = useTasks(filter === 'all' ? undefined : filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Tasks</h2>
        <div className="flex gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                filter === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
      {loading && !tasks ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <TaskTable tasks={tasks || []} />
      )}
    </div>
  );
}
