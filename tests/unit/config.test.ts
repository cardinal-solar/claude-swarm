import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig } from '../../src/config';

describe('getConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns defaults when no env vars set', () => {
    const config = getConfig();
    expect(config.port).toBe(3000);
    expect(config.maxConcurrency).toBe(3);
    expect(config.defaultTimeout).toBe(900000);
    expect(config.defaultMode).toBe('process');
    expect(config.knowledgeMaxContext).toBe(20);
    expect(config.knowledgeAutoLearn).toBe(true);
    expect(config.knowledgeDir).toContain('knowledge');
  });

  it('reads from environment variables', () => {
    process.env.PORT = '8080';
    process.env.MAX_CONCURRENCY = '5';
    process.env.DEFAULT_TIMEOUT = '60000';
    process.env.DEFAULT_MODE = 'container';
    process.env.DATA_DIR = '/tmp/swarm-data';

    const config = getConfig();
    expect(config.port).toBe(8080);
    expect(config.maxConcurrency).toBe(5);
    expect(config.defaultTimeout).toBe(60000);
    expect(config.defaultMode).toBe('container');
    expect(config.dataDir).toBe('/tmp/swarm-data');
  });
});
