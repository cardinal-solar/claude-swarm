import { useHealth } from '@/hooks/useHealth';

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function HealthPage() {
  const { data, loading, error } = useHealth();

  if (loading && !data) return <div className="text-sm text-gray-500">Loading...</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;
  if (!data) return null;

  const { scheduler, uptime } = data;
  const utilization = scheduler.maxConcurrency > 0
    ? Math.round((scheduler.running / scheduler.maxConcurrency) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900">Health</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Running" value={scheduler.running} sub={`of ${scheduler.maxConcurrency} slots`} />
        <KpiCard label="Queued" value={scheduler.queued} />
        <KpiCard label="Utilization" value={`${utilization}%`} />
        <KpiCard label="Uptime" value={formatUptime(uptime)} />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-xs font-medium text-gray-500 uppercase mb-2">Pool Capacity</p>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gray-900 h-3 rounded-full transition-all"
            style={{ width: `${utilization}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {scheduler.running} running / {scheduler.maxConcurrency} max concurrency
        </p>
      </div>
    </div>
  );
}
