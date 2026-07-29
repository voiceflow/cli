import { describe, expect } from 'vitest';

import { $vf, isDateString, sequential, setupProjectTest } from './utils';

const API_TOOL_DEFAULTS = {
  id: expect.any(String),
  url: null,
  body: null,
  image: null,
  headers: [],
  settings: null,
  description: null,
  queryParameters: [],
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf api-tool', () => {
  const project = setupProjectTest();

  const $vf_api_tool: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, `--environment-alias=main`, 'api-tool', ...args], options);

  describe('CRUD', { concurrent: false }, () => {
    const httpMethod = 'get';
    const it = sequential();
    let apiTool1: any;
    let apiTool2: any;
    let apiTool3: any;

    it('create with args', async () => {
      const name = 'api-tool from args';

      ({ apiTool: apiTool1 } = await $vf_api_tool(['create', `--name=${name}`, `--http-method=${httpMethod}`]));

      expect(apiTool1).toEqual({ ...API_TOOL_DEFAULTS, name, httpMethod });
    });

    it('create with body', async () => {
      const name = 'api-tool from body';

      ({ apiTool: apiTool2 } = await $vf_api_tool(['create', `--body=${JSON.stringify({ name, httpMethod })}`]));

      expect(apiTool2).toEqual({ ...API_TOOL_DEFAULTS, name, httpMethod });
    });

    it('create with stdin', async () => {
      const name = 'api-tool from stdin';

      ({ apiTool: apiTool3 } = await $vf_api_tool(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ name, httpMethod }),
      }));

      expect(apiTool3).toEqual({ ...API_TOOL_DEFAULTS, name, httpMethod });
    });

    it('update with args', async () => {
      const result = await $vf_api_tool(['update', `--tool-id=${apiTool1.id}`, '--name=renamed with args']);

      expect(result).toEqual({ message: `API tool ${apiTool1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_api_tool([
        'update',
        `--tool-id=${apiTool2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `API tool ${apiTool2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_api_tool(['update', `--tool-id=${apiTool3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `API tool ${apiTool3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_api_tool(['get', `--tool-id=${apiTool1.id}`]);

      expect(result).toEqual({
        apiTool: expect.objectContaining({ id: apiTool1.id, name: 'renamed with args' }),
      });
    });

    it('delete', async () => {
      const result = await $vf_api_tool(['delete', `--tool-id=${apiTool1.id}`]);

      expect(result).toEqual({ message: `API tool ${apiTool1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_api_tool(['list']);

      expect(result).toEqual({
        apiTools: expect.not.arrayContaining([expect.objectContaining({ id: apiTool1.id })]),
      });
      expect(result).toEqual({
        apiTools: expect.arrayContaining([
          expect.objectContaining({ id: apiTool2.id }),
          expect.objectContaining({ id: apiTool3.id }),
        ]),
      });
    });
  });
});
