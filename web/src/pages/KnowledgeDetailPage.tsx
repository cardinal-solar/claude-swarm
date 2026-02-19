import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useKnowledgeEntry, useKnowledgeArtifacts } from '@/hooks/useKnowledge';
import { api } from '@/lib/api-client';
import { RatingStars } from '@/components/knowledge/RatingStars';

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  deprecated: 'bg-gray-100 text-gray-700',
};

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

type Tab = 'info' | 'prompt' | 'artifacts';

export function KnowledgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: entry, loading, error } = useKnowledgeEntry(id!);
  const { data: artifacts } = useKnowledgeArtifacts(id!);
  const [activeTab, setActiveTab] = useState<Tab>('info');

  const handleRate = async (score: number) => {
    await api.knowledge.rate(id!, score);
  };

  if (loading && !entry) return <div className="text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!entry) return <div className="text-sm text-gray-500">Knowledge entry not found.</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Info' },
    { key: 'prompt', label: 'Prompt' },
    { key: 'artifacts', label: `Artifacts${artifacts ? ` (${artifacts.length})` : ''}` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/app/knowledge" className="text-sm text-gray-500 hover:text-gray-700">&larr; Back</Link>
        <h2 className="text-xl font-semibold text-gray-900">{entry.title}</h2>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[entry.status] || 'bg-gray-100 text-gray-700'}`}>
          {entry.status}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <RatingStars rating={entry.avgRating} count={entry.voteCount} interactive onRate={handleRate} />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Info</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">ID</dt>
              <dd className="font-mono text-gray-900">{entry.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Description</dt>
              <dd className="text-gray-900 text-right max-w-md">{entry.description}</dd>
            </div>
            {entry.category && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Category</dt>
                <dd className="text-gray-900">{entry.category}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Source</dt>
              <dd className="text-gray-900">{entry.source}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Tags</dt>
              <dd className="flex flex-wrap gap-1 justify-end">
                {entry.tags.map((tag) => (
                  <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                    {tag}
                  </span>
                ))}
                {entry.tags.length === 0 && <span className="text-gray-400">none</span>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd className="text-gray-900">{new Date(entry.createdAt).toLocaleString()}</dd>
            </div>
            {entry.originTaskId && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Origin Task</dt>
                <dd>
                  <Link to={`/app/tasks/${entry.originTaskId}`} className="text-sm font-mono text-blue-600 hover:text-blue-800">
                    {entry.originTaskId.slice(0, 8)}...
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {activeTab === 'prompt' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Prompt Template</h3>
          <div className="text-sm text-gray-500 bg-gray-50 rounded p-3">
            <p>Stored at: <span className="font-mono text-gray-700">{entry.folderPath}</span></p>
            <p className="mt-2 text-xs text-gray-400">Prompt content preview is not yet available via the API.</p>
          </div>
        </div>
      )}

      {activeTab === 'artifacts' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-medium text-gray-500 uppercase">Artifacts</h3>
          {!artifacts || artifacts.length === 0 ? (
            <p className="text-sm text-gray-500">No artifacts found.</p>
          ) : (
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
                    href={api.knowledge.artifactUrl(entry.id, a.path)}
                    download
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium shrink-0 ml-4"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
