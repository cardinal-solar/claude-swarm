import { Hono } from 'hono';
import { HealthService } from '../../services/health.service';

export function healthRoutes(healthService: HealthService) {
  const router = new Hono();
  router.get('/', (c) => {
    return c.json(healthService.getHealth());
  });
  return router;
}
