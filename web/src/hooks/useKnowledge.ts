import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePolling } from './useApi';

export function useKnowledge(filter?: { status?: string; sort?: string }) {
  const fetcher = useCallback(() => api.knowledge.list(filter), [filter]);
  return usePolling(fetcher, 5000);
}

export function useKnowledgeEntry(id: string) {
  const fetcher = useCallback(() => api.knowledge.get(id), [id]);
  return usePolling(fetcher, 5000);
}

export function useKnowledgeArtifacts(id: string) {
  const fetcher = useCallback(() => api.knowledge.artifacts(id), [id]);
  return usePolling(fetcher, 10000);
}
