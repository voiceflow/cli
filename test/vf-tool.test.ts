import { randomUUID } from 'node:crypto';

import { Utils } from '@voiceflow/common';
import { isAfter } from 'date-fns';
import { beforeAll, describe, expect, it } from 'vitest';

import { $vf, isDateString, sequential, setupProjectTest } from './utils';

const TOOL_DEFAULTS = {
  id: expect.any(String),
  messages: null,
  description: null,
  inputVariables: {},
  captureResponse: {},
  captureInputVariables: {},
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf tool', () => {
  const project = setupProjectTest();
  let playbook: any;

  const $vf_tool: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, '--environment-alias=main', 'tool', ...args], options);

  beforeAll(async () => {
    ({ playbook } = await $vf([
      `--project-id=${project().id}`,
      '--environment-alias=main',
      'playbook',
      'create',
      `--name=shared playbook`,
    ]));
  });

  describe('list', () => {
    it('filter tools by type', async () => {
      const [{ function: function_ }, { apiTool }] = await Promise.all([
        $vf([
          `--project-id=${project().id}`,
          '--environment-alias=main',
          'function',
          'create',
          `--name=shared function`,
          `--code=var foo = 123;`,
        ]),
        $vf([
          `--project-id=${project().id}`,
          '--environment-alias=main',
          'api-tool',
          'create',
          `--name=shared api tool`,
          `--http-method=get`,
        ]),
      ]);

      const { tool: functionTool } = await $vf_tool([
        'create',
        `--body-param.function=${JSON.stringify({ functionID: function_.id, target: { playbookID: playbook.id } })}`,
      ]);
      const { tool: apiToolTool } = await $vf_tool([
        'create',
        `--body-param.api=${JSON.stringify({ apiToolID: apiTool.id, target: { playbookID: playbook.id } })}`,
      ]);

      await expect($vf_tool(['list', '--type=function', `--playbook-id=${playbook.id}`])).resolves.toEqual({
        tools: [expect.objectContaining({ id: functionTool.id })],
      });
      await expect($vf_tool(['list', '--type=api', `--playbook-id=${playbook.id}`])).resolves.toEqual({
        tools: [expect.objectContaining({ id: apiToolTool.id })],
      });
    });
  });

  describe('function tool CRUD', () => {
    const it = sequential();
    let function_: any;
    let tool1: any;
    let tool2: any;

    beforeAll(async () => {
      ({ function: function_ } = await $vf([
        `--project-id=${project().id}`,
        '--environment-alias=main',
        'function',
        'create',
        `--name=shared function`,
        `--code=var foo = 123;`,
      ]));
    });

    it('create with body', async () => {
      ({ tool: tool1 } = await $vf_tool([
        'create',
        `--body-param.function=${JSON.stringify({ functionID: function_.id, target: { playbookID: playbook.id } })}`,
      ]));

      expect(tool1).toEqual({ ...TOOL_DEFAULTS, type: 'function', functionID: function_.id, asyncExecution: false });
    });

    it('create with stdin', async () => {
      ({ tool: tool2 } = await $vf_tool(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ type: 'function', functionID: function_.id, target: { playbookID: playbook.id } }),
      }));

      expect(tool2).toEqual({ ...TOOL_DEFAULTS, type: 'function', functionID: function_.id, asyncExecution: false });
    });

    it('update with body', async () => {
      await Utils.promise.delay(1000);

      const result = await $vf_tool([
        'update',
        `--tool-id=${tool1.id}`,
        `--body-param.function=${JSON.stringify({ description: 'updated with body' })}`,
      ]);

      expect(result).toEqual({ message: `Tool ${tool1.id} updated.` });
    });

    it('update with stdin', async () => {
      await Utils.promise.delay(1000);

      const result = await $vf_tool(['update', `--tool-id=${tool2.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ type: 'function', description: 'updated with stdin' }),
      });

      expect(result).toEqual({ message: `Tool ${tool2.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_tool(['get', '--type=function', `--tool-id=${tool1.id}`]);

      expect(result).toEqual({
        tool: {
          ...tool1,
          description: 'updated with body',
          updatedAt: expect.toSatisfy((date) => isAfter(date, tool1.updatedAt)),
        },
      });
    });

    it('delete', async () => {
      const result = await $vf_tool(['delete', '--type=function', `--tool-id=${tool1.id}`]);

      expect(result).toEqual({ message: `Tool ${tool1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_tool(['list', `--playbook-id=${playbook.id}`]);

      expect(result).toEqual({
        tools: expect.not.arrayContaining([expect.objectContaining({ id: tool1.id })]),
      });
      expect(result).toEqual({
        tools: expect.arrayContaining([expect.objectContaining({ id: tool2.id })]),
      });
    });
  });

  describe('api tool CRUD', () => {
    const it = sequential();
    let apiTool: any;
    let tool1: any;
    let tool2: any;

    beforeAll(async () => {
      ({ apiTool } = await $vf([
        `--project-id=${project().id}`,
        '--environment-alias=main',
        'api-tool',
        'create',
        `--name=shared api tool`,
        `--http-method=get`,
      ]));
    });

    it('create with body', async () => {
      ({ tool: tool1 } = await $vf_tool([
        'create',
        `--body-param.api=${JSON.stringify({ apiToolID: apiTool.id, target: { playbookID: playbook.id } })}`,
      ]));

      expect(tool1).toEqual({ ...TOOL_DEFAULTS, type: 'api', apiToolID: apiTool.id, asyncExecution: false });
    });

    it('create with stdin', async () => {
      ({ tool: tool2 } = await $vf_tool(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ type: 'api', apiToolID: apiTool.id, target: { playbookID: playbook.id } }),
      }));

      expect(tool2).toEqual({ ...TOOL_DEFAULTS, type: 'api', apiToolID: apiTool.id, asyncExecution: false });
    });

    it('update with body', async () => {
      await Utils.promise.delay(1000);

      const result = await $vf_tool([
        'update',
        `--tool-id=${tool1.id}`,
        `--body-param.api=${JSON.stringify({ description: 'updated with body' })}`,
      ]);

      expect(result).toEqual({ message: `Tool ${tool1.id} updated.` });
    });

    it('update with stdin', async () => {
      await Utils.promise.delay(1000);

      const result = await $vf_tool(['update', `--tool-id=${tool2.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ type: 'api', description: 'updated with stdin' }),
      });

      expect(result).toEqual({ message: `Tool ${tool2.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_tool(['get', '--type=api', `--tool-id=${tool1.id}`]);

      expect(result).toEqual({
        tool: {
          ...tool1,
          description: 'updated with body',
          updatedAt: expect.toSatisfy((date) => isAfter(date, tool1.updatedAt)),
        },
      });
    });

    it('delete', async () => {
      const result = await $vf_tool(['delete', '--type=api', `--tool-id=${tool1.id}`]);

      expect(result).toEqual({ message: `Tool ${tool1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_tool(['list', `--playbook-id=${playbook.id}`]);

      expect(result).toEqual({
        tools: expect.not.arrayContaining([expect.objectContaining({ id: tool1.id })]),
      });
      expect(result).toEqual({
        tools: expect.arrayContaining([expect.objectContaining({ id: tool2.id })]),
      });
    });
  });

  describe('mcp tool CRUD', () => {
    const it = sequential();
    let mcpTool: any;
    let tool1: any;
    let tool2: any;

    beforeAll(async () => {
      await $vf([
        `--project-id=${project().id}`,
        '--environment-alias=main',
        'mcp-server',
        'create',
        `--name=shared server ${randomUUID()}`,
        `--url=${JSON.stringify(['https://learn.microsoft.com/api/mcp'])}`,
      ]);
      await Utils.promise.delay(1000);
      const { mcpTools } = await $vf([`--project-id=${project().id}`, '--environment-alias=main', 'mcp-tool', 'list']);

      mcpTool = mcpTools[0];
    });

    it('create with body', async () => {
      ({ tool: tool1 } = await $vf_tool([
        'create',
        `--body-param.mcp=${JSON.stringify({ mcpToolID: mcpTool.id, target: { playbookID: playbook.id } })}`,
      ]));

      expect(tool1).toEqual({ ...TOOL_DEFAULTS, type: 'mcp', mcpToolID: mcpTool.id });
    });

    it('create with stdin', async () => {
      ({ tool: tool2 } = await $vf_tool(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ type: 'mcp', mcpToolID: mcpTool.id, target: { playbookID: playbook.id } }),
      }));

      expect(tool2).toEqual({ ...TOOL_DEFAULTS, type: 'mcp', mcpToolID: mcpTool.id });
    });

    it('update with body', async () => {
      await Utils.promise.delay(1000);

      const result = await $vf_tool([
        'update',
        `--tool-id=${tool1.id}`,
        `--body-param.mcp=${JSON.stringify({ description: 'updated with body' })}`,
      ]);

      expect(result).toEqual({ message: `Tool ${tool1.id} updated.` });
    });

    it('update with stdin', async () => {
      await Utils.promise.delay(1000);

      const result = await $vf_tool(['update', `--tool-id=${tool2.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ type: 'mcp', description: 'updated with stdin' }),
      });

      expect(result).toEqual({ message: `Tool ${tool2.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_tool(['get', '--type=mcp', `--tool-id=${tool1.id}`]);

      expect(result).toEqual({
        tool: {
          ...tool1,
          description: 'updated with body',
          updatedAt: expect.toSatisfy((date) => isAfter(date, tool1.updatedAt)),
        },
      });
    });

    it('delete', async () => {
      const result = await $vf_tool(['delete', '--type=mcp', `--tool-id=${tool1.id}`]);

      expect(result).toEqual({ message: `Tool ${tool1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_tool(['list', `--playbook-id=${playbook.id}`]);

      expect(result).toEqual({
        tools: expect.not.arrayContaining([expect.objectContaining({ id: tool1.id })]),
      });
      expect(result).toEqual({
        tools: expect.arrayContaining([expect.objectContaining({ id: tool2.id })]),
      });
    });
  });
});
