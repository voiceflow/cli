import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect } from 'vitest';

import { createProject } from './fixtures';
import { $vf, isDateString, sequential } from './utils';

const SERVER_DEFAULTS = {
  id: expect.any(String),
  image: null,
  description: null,
  specification: '2025-06-18',
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};
const TOOL_DEFAULTS = {
  id: expect.any(String),
  description: expect.any(String),
  inputSchema: expect.any(Object),
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf mcp-tool', () => {
  let project: any;

  const $vf_mcp_tool: typeof $vf = (args, options) =>
    $vf([`--project-id=${project.id}`, `--environment-alias=main`, 'mcp-tool', ...args], options);

  beforeAll(async () => {
    ({ project } = await createProject());
  });

  afterAll(async () => {
    await $vf(['project', 'delete', `--project-id=${project.id}`]);
  });

  describe('CRUD', { concurrent: false }, () => {
    const url = ['https://learn.microsoft.com/api/mcp'];
    const it = sequential();
    let mcpServer: any;
    let mcpTool: any;

    beforeAll(async () => {
      ({ project } = await createProject());
      ({ mcpServer } = await $vf([
        `--project-id=${project.id}`,
        `--environment-alias=main`,
        'mcp-server',
        'create',
        `--name=shared server ${randomUUID()}`,
        `--url=${JSON.stringify(url)}`,
      ]));
    });

    it('list', async () => {
      const result = await $vf_mcp_tool(['list']);

      expect(result).toEqual({
        mcpTools: [
          {
            ...TOOL_DEFAULTS,
            name: 'microsoft_docs_search',
            serverID: mcpServer.id,
          },
          {
            ...TOOL_DEFAULTS,
            name: 'microsoft_code_sample_search',
            serverID: mcpServer.id,
          },
          {
            ...TOOL_DEFAULTS,
            name: 'microsoft_docs_fetch',
            serverID: mcpServer.id,
          },
        ],
      });

      mcpTool = result.mcpTools[0];
    });

    it('get', async () => {
      const result = await $vf_mcp_tool(['get', `--tool-id=${mcpTool.id}`]);

      expect(result).toEqual({ mcpTool });
    });
  });
});
