import { describe, expect } from 'vitest';

import { $vf, isDateString, sequential, setupProjectTest } from './utils';

const FUNCTION_DEFAULTS = {
  id: expect.any(String),
  image: null,
  pathOrder: [],
  description: null,
  settings: null,
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf function', () => {
  const project = setupProjectTest();

  const $vf_function: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, '--environment-alias=main', 'function', ...args], options);

  describe('CRUD', { concurrent: false }, () => {
    const code = 'var foo = 123;';
    const it = sequential();
    let function1: any;
    let function2: any;
    let function3: any;

    it('create with args', async () => {
      const name = 'function from args';

      ({ function: function1 } = await $vf_function(['create', `--name=${name}`, `--code=${code}`]));

      expect(function1).toEqual({ ...FUNCTION_DEFAULTS, name, code });
    });

    it('create with body', async () => {
      const name = 'function from body';

      ({ function: function2 } = await $vf_function(['create', `--body=${JSON.stringify({ name, code })}`]));

      expect(function2).toEqual({ ...FUNCTION_DEFAULTS, name, code });
    });

    it('create with stdin', async () => {
      const name = 'function from stdin';

      ({ function: function3 } = await $vf_function(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ name, code }),
      }));

      expect(function3).toEqual({ ...FUNCTION_DEFAULTS, name, code });
    });

    it('update with args', async () => {
      const result = await $vf_function(['update', `--function-id=${function1.id}`, '--name=renamed with args']);

      expect(result).toEqual({ message: `Function ${function1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_function([
        'update',
        `--function-id=${function2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `Function ${function2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_function(['update', `--function-id=${function3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `Function ${function3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_function(['get', `--function-id=${function1.id}`]);

      expect(result).toEqual({
        function: expect.objectContaining({ id: function1.id, name: 'renamed with args' }),
      });
    });

    it('delete', async () => {
      const result = await $vf_function(['delete', `--function-id=${function1.id}`]);

      expect(result).toEqual({ message: `Function ${function1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_function(['list']);

      expect(result).toEqual({
        functions: expect.not.arrayContaining([expect.objectContaining({ id: function1.id })]),
      });
      expect(result).toEqual({
        functions: expect.arrayContaining([
          expect.objectContaining({ id: function2.id }),
          expect.objectContaining({ id: function3.id }),
        ]),
      });
    });
  });
});
