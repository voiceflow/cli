import { beforeAll, describe, expect } from 'vitest';

import { $vf, isDateString, sequential, setupProjectTest } from './utils';

const PATH_DEFAULTS = {
  id: expect.any(String),
  label: null,
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf function path', () => {
  const project = setupProjectTest();

  const $vf_function_path: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, `--environment-alias=main`, 'function', 'path', ...args], options);

  describe('CRUD', { concurrent: false }, () => {
    const it = sequential();
    let function_: any;
    let path1: any;
    let path2: any;
    let path3: any;

    beforeAll(async () => {
      ({ function: function_ } = await $vf([
        `--project-id=${project().id}`,
        `--environment-alias=main`,
        'function',
        'create',
        `--name=shared function`,
        `--code=var foo = 123;`,
      ]));
    });

    it('create with args', async () => {
      const name = 'path from args';

      ({ path: path1 } = await $vf_function_path(['create', `--name=${name}`, `--function-id=${function_.id}`]));

      expect(path1).toEqual({ ...PATH_DEFAULTS, name, functionID: function_.id });
    });

    it('create with body', async () => {
      const name = 'path from body';

      ({ path: path2 } = await $vf_function_path([
        'create',
        `--body=${JSON.stringify({ name, functionID: function_.id })}`,
      ]));

      expect(path2).toEqual({ ...PATH_DEFAULTS, name, functionID: function_.id });
    });

    it('create with stdin', async () => {
      const name = 'path from stdin';

      ({ path: path3 } = await $vf_function_path(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ name, functionID: function_.id }),
      }));

      expect(path3).toEqual({ ...PATH_DEFAULTS, name, functionID: function_.id });
    });

    it('update with args', async () => {
      const result = await $vf_function_path(['update', `--path-id=${path1.id}`, '--name=renamed with args']);

      expect(result).toEqual({ message: `Path ${path1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_function_path([
        'update',
        `--path-id=${path2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `Path ${path2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_function_path(['update', `--path-id=${path3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `Path ${path3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_function_path(['get', `--path-id=${path1.id}`]);

      expect(result).toEqual({
        path: expect.objectContaining({ id: path1.id, name: 'renamed with args' }),
      });
    });

    it('delete', async () => {
      const result = await $vf_function_path(['delete', `--path-id=${path1.id}`]);

      expect(result).toEqual({ message: `Path ${path1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_function_path(['list', `--function-id=${function_.id}`]);

      expect(result).toEqual({
        paths: expect.not.arrayContaining([expect.objectContaining({ id: path1.id })]),
      });
      expect(result).toEqual({
        paths: expect.arrayContaining([
          expect.objectContaining({ id: path2.id }),
          expect.objectContaining({ id: path3.id }),
        ]),
      });
    });
  });
});
