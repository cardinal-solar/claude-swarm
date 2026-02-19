import { useState, useMemo } from 'react';
import { useKnowledge } from '@/hooks/useKnowledge';
import { KnowledgeTable } from '@/components/knowledge/KnowledgeTable';

const STATUSES = ['all', 'active', 'draft', 'deprecated'] as const;
const SORTS = [
  { value: 'rating', label: 'Rating' },
  { value: 'date', label: 'Date' },
  { value: 'title', label: 'Title' },
] as const;

export function KnowledgePage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sort, setSort] = useState<string>('rating');

  const filter = useMemo(
    () => ({
      status: statusFilter === 'all' ? undefined : statusFilter,
      sort,
    }),
    [statusFilter, sort],
  );

  const { data, loading, error } = useKnowledge(filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Knowledge</h2>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}
      {loading && !data ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <KnowledgeTable entries={data?.data || []} />
      )}
    </div>
  );
}
