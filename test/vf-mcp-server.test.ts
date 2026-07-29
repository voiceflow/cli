import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import { $vf, isDateString, sequential, setupProjectTest } from './utils';

const SERVER_DEFAULTS = {
  id: expect.any(String),
  image: null,
  description: null,
  specification: '2025-06-18',
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf mcp-server', () => {
  const project = setupProjectTest();

  const $vf_mcp_server: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, `--environment-alias=main`, 'mcp-server', ...args], options);

  describe('CRUD', { concurrent: false }, () => {
    const url = ['https://learn.microsoft.com/api/mcp'];
    const it = sequential();
    let server1: any;
    let server2: any;
    let server3: any;

    it('create with args', async () => {
      const name = `server from args ${randomUUID()}`;

      ({ mcpServer: server1 } = await $vf_mcp_server(['create', `--name=${name}`, `--url=${JSON.stringify(url)}`]));

      expect(server1).toEqual({ ...SERVER_DEFAULTS, name, url });
    });

    it('create with body', async () => {
      const name = `server from body ${randomUUID()}`;

      ({ mcpServer: server2 } = await $vf_mcp_server(['create', `--body=${JSON.stringify({ name, url })}`]));

      expect(server2).toEqual({ ...SERVER_DEFAULTS, name, url });
    });

    it('create with stdin', async () => {
      const name = `server from stdin ${randomUUID()}`;

      ({ mcpServer: server3 } = await $vf_mcp_server(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ name, url }),
      }));

      expect(server3).toEqual({ ...SERVER_DEFAULTS, name, url });
    });

    it('update with args', async () => {
      const result = await $vf_mcp_server([
        'update',
        `--server-id=${server1.id}`,
        `--name=renamed with args ${randomUUID()}`,
      ]);

      expect(result).toEqual({ message: `MCP server ${server1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_mcp_server([
        'update',
        `--server-id=${server2.id}`,
        `--body=${JSON.stringify({ name: `renamed with body ${randomUUID()}` })}`,
      ]);

      expect(result).toEqual({ message: `MCP server ${server2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_mcp_server(['update', `--server-id=${server3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: `renamed_with_stdin_${randomUUID()}` }),
      });

      expect(result).toEqual({ message: `MCP server ${server3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_mcp_server(['get', `--server-id=${server1.id}`]);

      expect(result).toEqual({
        mcpServer: expect.objectContaining({ id: server1.id, name: expect.stringMatching(/^renamed with args/) }),
      });
    });

    it('delete', async () => {
      const result = await $vf_mcp_server(['delete', `--server-id=${server1.id}`]);

      expect(result).toEqual({ message: `MCP server ${server1.id} deleted.` });
    });

    it('sync', async () => {
      const result = await $vf_mcp_server(['sync', `--server-id=${server2.id}`]);

      expect(result).toEqual({ message: `MCP server ${server2.id} synced.` });
    });

    it('list', async () => {
      const result = await $vf_mcp_server(['list']);

      expect(result).toEqual({
        mcpServers: expect.not.arrayContaining([expect.objectContaining({ id: server1.id })]),
      });
      expect(result).toEqual({
        mcpServers: expect.arrayContaining([
          expect.objectContaining({ id: server2.id }),
          expect.objectContaining({ id: server3.id }),
        ]),
      });
    });
  });
});
