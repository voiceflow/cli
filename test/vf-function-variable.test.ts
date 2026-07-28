import { beforeAll, describe, expect } from 'vitest';

import { PROJECT_ID } from './config';
import { $vf, isDateString, sequential } from './utils';

const VARIABLE_DEFAULTS = {
  id: expect.any(String),
  description: null,
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf function variable', () => {
  const $vf_function_variable: typeof $vf = (args, options) =>
    $vf([`--project-id=${PROJECT_ID}`, `--environment-alias=main`, 'function', 'variable', ...args], options);

  describe('CRUD', { concurrent: false }, () => {
    const type = 'input';
    const it = sequential();
    let function_: any;
    let variable1: any;
    let variable2: any;
    let variable3: any;

    beforeAll(async () => {
      ({ function: function_ } = await $vf([
        `--project-id=${PROJECT_ID}`,
        `--environment-alias=main`,
        'function',
        'create',
        `--name=shared function`,
        `--code=var foo = 123;`,
      ]));
    });

    it('create with args', async () => {
      const name = 'variable from args';
      ({ variable: variable1 } = await $vf_function_variable([
        'create',
        `--type=${type}`,
        `--name=${name}`,
        `--function-id=${function_.id}`,
      ]));

      expect(variable1).toEqual({ ...VARIABLE_DEFAULTS, type, name, functionID: function_.id });
    });

    it('create with body', async () => {
      const name = 'variable from body';
      ({ variable: variable2 } = await $vf_function_variable([
        'create',
        `--body=${JSON.stringify({ type, name, functionID: function_.id })}`,
      ]));

      expect(variable2).toEqual({ ...VARIABLE_DEFAULTS, type, name, functionID: function_.id });
    });

    it('create with stdin', async () => {
      const name = 'variable from stdin';
      ({ variable: variable3 } = await $vf_function_variable(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ type, name, functionID: function_.id }),
      }));

      expect(variable3).toEqual({ ...VARIABLE_DEFAULTS, type, name, functionID: function_.id });
    });

    it('update with args', async () => {
      const result = await $vf_function_variable([
        'update',
        `--variable-id=${variable1.id}`,
        '--name=renamed with args',
      ]);

      expect(result).toEqual({ message: `Variable ${variable1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_function_variable([
        'update',
        `--variable-id=${variable2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `Variable ${variable2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_function_variable(['update', `--variable-id=${variable3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `Variable ${variable3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_function_variable(['get', `--variable-id=${variable1.id}`]);

      expect(result).toEqual({
        variable: expect.objectContaining({ id: variable1.id, name: 'renamed with args' }),
      });
    });

    it('delete', async () => {
      const result = await $vf_function_variable(['delete', `--variable-id=${variable1.id}`]);

      expect(result).toEqual({ message: `Variable ${variable1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_function_variable(['list', `--function-id=${function_.id}`]);

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
