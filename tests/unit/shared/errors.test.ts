import { describe, it, expect } from 'vitest';
import {
  SwarmError,
  TaskNotFoundError,
  ValidationError,
  ExecutionError,
  TimeoutError,
  WorkspaceError,
} from '../../../src/shared/errors';

describe('SwarmError', () => {
  it('is an instance of Error with code and details', () => {
    const err = new SwarmError('test', 'UNKNOWN', { foo: 'bar' });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test');
    expect(err.code).toBe('UNKNOWN');
    expect(err.details).toEqual({ foo: 'bar' });
  });
});

describe('TaskNotFoundError', () => {
  it('has TASK_NOT_FOUND code', () => {
    const err = new TaskNotFoundError('abc-123');
    expect(err.code).toBe('TASK_NOT_FOUND');
    expect(err.message).toContain('abc-123');
  });
});

describe('ValidationError', () => {
  it('has VALIDATION_ERROR code', () => {
    const err = new ValidationError('bad input', [{ path: 'prompt', message: 'required' }]);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details.issues).toHaveLength(1);
  });
});

describe('ExecutionError', () => {
  it('has EXECUTION_ERROR code', () => {
    const err = new ExecutionError('claude crashed', 'task-1', 'stderr output');
    expect(err.code).toBe('EXECUTION_ERROR');
    expect(err.details.taskId).toBe('task-1');
  });
});

describe('TimeoutError', () => {
  it('has TIMEOUT code', () => {
    const err = new TimeoutError('task-1', 30000);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toContain('30000');
  });
});

describe('WorkspaceError', () => {
  it('has WORKSPACE_ERROR code', () => {
    const err = new WorkspaceError('zip extract failed');
    expect(err.code).toBe('WORKSPACE_ERROR');
  });
});
