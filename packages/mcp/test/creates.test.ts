import { describe, expect, test } from 'bun:test';
import { toolDefinitions } from '../src/server.ts';

describe('creating tools', () => {
  test('every create_* tool, and every other tool that adds a record, is marked as creating', () => {
    const creating = toolDefinitions.filter(t => 'creates' in t && t.creates).map(t => t.name);
    const named = toolDefinitions.filter(t => t.name.startsWith('create_')).map(t => t.name);
    expect(named.filter(n => !creating.includes(n))).toEqual([]);
    expect(creating.filter(n => !named.includes(n)).sort()).toEqual([
      'add_comment',
      'invite_member',
      'log_time',
      'request_org_export',
      'start_csv_import',
      'upload_attachment',
    ]);
  });

  test('each takes client_ref, and no other tool does', () => {
    for (const tool of toolDefinitions) {
      const creates = 'creates' in tool && tool.creates === true;
      expect('client_ref' in tool.input.shape, tool.name).toBe(creates);
    }
  });
});
