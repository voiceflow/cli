import { beforeAll, describe, expect } from 'vitest';

import { PROJECT_ID } from './config';
import { $vf, isDateString, sequential } from './utils';

const VARIABLE_DEFAULTS = {
  id: expect.any(String),
  description: null,
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf api-tool variable', () => {
  const $vf_api_tool_variable: typeof $vf = (args, options) =>
    $vf([`--project-id=${PROJECT_ID}`, `--environment-alias=main`, 'api-tool', 'variable', ...args], options);

  describe('CRUD', { concurrent: false }, () => {
    const it = sequential();
    let apiTool: any;
    let variable1: any;
    let variable2: any;
    let variable3: any;

    beforeAll(async () => {
      ({ apiTool } = await $vf([
        `--project-id=${PROJECT_ID}`,
        `--environment-alias=main`,
        'api-tool',
        'create',
        `--name=shared api tool`,
        `--http-method=get`,
      ]));
    });

    it('create with args', async () => {
      const name = 'variable from args';
      ({ variable: variable1 } = await $vf_api_tool_variable([
        'create',
        `--name=${name}`,
        `--api-tool-id=${apiTool.id}`,
      ]));

      expect(variable1).toEqual({ ...VARIABLE_DEFAULTS, name, apiToolID: apiTool.id });
    });

    it('create with body', async () => {
      const name = 'variable from body';
      ({ variable: variable2 } = await $vf_api_tool_variable([
        'create',
        `--body=${JSON.stringify({ name, apiToolID: apiTool.id })}`,
      ]));

      expect(variable2).toEqual({ ...VARIABLE_DEFAULTS, name, apiToolID: apiTool.id });
    });

    it('create with stdin', async () => {
      const name = 'variable from stdin';
      ({ variable: variable3 } = await $vf_api_tool_variable(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ name, apiToolID: apiTool.id }),
      }));

      expect(variable3).toEqual({ ...VARIABLE_DEFAULTS, name, apiToolID: apiTool.id });
    });

    it('update with args', async () => {
      const result = await $vf_api_tool_variable([
        'update',
        `--variable-id=${variable1.id}`,
        '--name=renamed with args',
      ]);

      expect(result).toEqual({ message: `Input variable ${variable1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_api_tool_variable([
        'update',
        `--variable-id=${variable2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `Input variable ${variable2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_api_tool_variable(['update', `--variable-id=${variable3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `Input variable ${variable3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_api_tool_variable(['get', `--variable-id=${variable1.id}`]);

      expect(result).toEqual({
        variable: expect.objectContaining({ id: variable1.id, name: 'renamed with args' }),
      });
    });

    it('delete', async () => {
      const result = await $vf_api_tool_variable(['delete', `--variable-id=${variable1.id}`]);

      expect(result).toEqual({ message: `Input variable ${variable1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_api_tool_variable(['list', `--api-tool-id=${apiTool.id}`]);

      expect(result).toEqual({
        variables: expect.not.arrayContaining([expect.objectContaining({ id: variable1.id })]),
      });
      expect(result).toEqual({
        variables: expect.arrayContaining([
          expect.objectContaining({ id: variable2.id }),
          expect.objectContaining({ id: variable3.id }),
        ]),
      });
    });
  });
});
