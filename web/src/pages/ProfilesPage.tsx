import { useState } from 'react';
import { useProfiles } from '@/hooks/useProfiles';
import { api } from '@/lib/api-client';

export function ProfilesPage() {
  const { data: profiles, loading, error, refresh } = useProfiles();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [serverJson, setServerJson] = useState('[\n  {\n    "name": "example",\n    "command": "npx",\n    "args": ["-y", "example-mcp"]\n  }\n]');
  const [formError, setFormError] = useState('');

  async function handleCreate() {
    if (!name.trim()) {
      setFormError('Name is required');
      return;
    }
    try {
      const servers = JSON.parse(serverJson);
      await api.profiles.create({ name, servers });
      setName('');
      setShowForm(false);
      setFormError('');
      refresh();
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete profile "${name}"?`)) return;
    try {
      await api.profiles.delete(id);
      refresh();
    } catch (e) {
      setFormError((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">MCP Profiles</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Profile'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
          <input
            type="text"
            placeholder="Profile name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <textarea
            value={serverJson}
            onChange={(e) => setServerJson(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            onClick={handleCreate}
            className="px-4 py-2 text-sm font-medium rounded-md bg-gray-900 text-white hover:bg-gray-800"
          >
            Create
          </button>
        </div>
      )}

      {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

      {loading && !profiles ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : profiles && profiles.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">No profiles.</div>
      ) : (
        <div className="space-y-2">
          {profiles?.map((p) => (
            <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-500">{p.servers.length} server(s) - Created {new Date(p.createdAt).toLocaleDateString()}</p>
              </div>
              <button
                onClick={() => handleDelete(p.id, p.name)}
                className="text-xs text-red-600 hover:text-red-800 font-medium"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
