import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePolling } from './useApi';

export function useProfiles() {
  const fetcher = useCallback(() => api.profiles.list(), []);
  return usePolling(fetcher, 10000);
}
