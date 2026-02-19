import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTasks } from '@/hooks/useTasks';
import { TaskTable } from '@/components/tasks/TaskTable';
import { api } from '@/lib/api-client';

const STATUSES = ['all', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const;

export function TasksPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<string>('all');
  const { data: tasks, loading, error } = useTasks(filter === 'all' ? undefined : filter);

  const [showForm, setShowForm] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'process' | 'container' | 'sdk'>('process');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleCreate() {
    if (!prompt.trim()) {
      setFormError('Prompt is required');
      return;
    }
    if (!apiKey.trim()) {
      setFormError('API key is required');
      return;
    }
    setSubmitting(true);
    setFormError('');
    try {
      const task = await api.tasks.create({ prompt, apiKey, mode });
      navigate(`/app/tasks/${task.id}`);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Tasks</h2>
        <div className="flex items-center gap-3">
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
          <button
            onClick={() => { setShowForm(!showForm); setFormError(''); }}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Task'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <textarea
            placeholder="Enter your prompt..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <div className="flex gap-3">
            <input
              type="password"
              placeholder="Anthropic API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'process' | 'container' | 'sdk')}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
            >
              <option value="process">process</option>
              <option value="container">container</option>
              <option value="sdk">sdk</option>
            </select>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            onClick={handleCreate}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      )}

      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
      {loading && !tasks ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <TaskTable tasks={tasks || []} />
      )}
    </div>
  );
}
