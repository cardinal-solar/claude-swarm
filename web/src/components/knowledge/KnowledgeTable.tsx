import { Link } from 'react-router-dom';
import type { KnowledgeEntry } from '@/lib/api-client';
import { RatingStars } from './RatingStars';

const statusStyles: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  deprecated: 'bg-gray-100 text-gray-700',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function KnowledgeTable({ entries }: { entries: KnowledgeEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-sm">No knowledge entries found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link to={`/app/knowledge/${entry.id}`} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  {entry.title}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{entry.description}</p>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {entry.category || '-'}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {entry.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                      {tag}
                    </span>
                  ))}
                  {entry.tags.length > 3 && (
                    <span className="text-[10px] text-gray-400">+{entry.tags.length - 3}</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <RatingStars rating={entry.avgRating} count={entry.voteCount} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{entry.source}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[entry.status] || 'bg-gray-100 text-gray-700'}`}>
                  {entry.status}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{timeAgo(entry.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
