import { describe, expect } from 'vitest';

import { $vf, isDateString, sequential, setupProjectTest } from './utils';

const VARIABLE_DEFAULTS = {
  id: expect.any(String),
  isSystem: false,
  description: null,
  defaultValue: null,
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf variable', () => {
  const project = setupProjectTest();

  const $vf_variable: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, '--environment-alias=main', 'variable', ...args], options);

  describe('CRUD', { concurrent: false }, () => {
    const color = '#defa13';
    const it = sequential();
    let variable1: any;
    let variable2: any;
    let variable3: any;

    it('create with args', async () => {
      const name = 'variable from args';

      ({ variable: variable1 } = await $vf_variable(['create', `--name=${name}`, `--color-param=${color}`]));

      expect(variable1).toEqual({ ...VARIABLE_DEFAULTS, name, color });
    });

    it('create with body', async () => {
      const name = 'variable from body';

      ({ variable: variable2 } = await $vf_variable(['create', `--body=${JSON.stringify({ name, color })}`]));

      expect(variable2).toEqual({ ...VARIABLE_DEFAULTS, name, color });
    });

    it('create with stdin', async () => {
      const name = 'variable from stdin';

      ({ variable: variable3 } = await $vf_variable(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ name, color }),
      }));

      expect(variable3).toEqual({ ...VARIABLE_DEFAULTS, name, color });
    });

    it('update with args', async () => {
      const result = await $vf_variable(['update', `--variable-id=${variable1.id}`, '--name=renamed with args']);

      expect(result).toEqual({ message: `Variable ${variable1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_variable([
        'update',
        `--variable-id=${variable2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `Variable ${variable2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_variable(['update', `--variable-id=${variable3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `Variable ${variable3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_variable(['get', `--variable-id=${variable1.id}`]);

      expect(result).toEqual({
        variable: expect.objectContaining({ id: variable1.id, name: 'renamed with args' }),
      });
    });

    it('delete', async () => {
      const result = await $vf_variable(['delete', `--variable-id=${variable1.id}`]);

      expect(result).toEqual({ message: `Variable ${variable1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_variable(['list']);

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
