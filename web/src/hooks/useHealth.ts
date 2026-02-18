import { useCallback } from 'react';
import { api } from '@/lib/api-client';
import { usePolling } from './useApi';

export function useHealth() {
  const fetcher = useCallback(() => api.health(), []);
  return usePolling(fetcher, 10000);
}
