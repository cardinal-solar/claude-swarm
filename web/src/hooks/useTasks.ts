import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePolling } from './useApi';

export function useTasks(statusFilter?: string) {
  const fetcher = useCallback(() => api.tasks.list(statusFilter), [statusFilter]);
  return usePolling(fetcher, 5000);
}

export function useTask(id: string) {
  const fetcher = useCallback(() => api.tasks.get(id), [id]);
  return usePolling(fetcher, 3000);
}

export function useArtifacts(id: string) {
  const fetcher = useCallback(() => api.tasks.artifacts(id), [id]);
  return usePolling(fetcher, 10000);
}
