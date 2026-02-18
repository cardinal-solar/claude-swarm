import { McpProfileStore } from '../storage/mcp-profile.store';
import type { McpProfile } from '../shared/types';
import type { CreateMcpProfileInput } from '../api/schemas/mcp-profile.schema';

export class McpProfileService {
  constructor(private store: McpProfileStore) {}

  create(input: CreateMcpProfileInput): McpProfile {
    const id = this.store.create(input);
    return this.store.getById(id)!;
  }

  getById(id: string): McpProfile | null {
    return this.store.getById(id);
  }

  list(): McpProfile[] {
    return this.store.list();
  }

  delete(id: string): void {
    this.store.delete(id);
  }
}
