import { Utils } from '@voiceflow/common';
import { isValid, parseISO } from 'date-fns';
import { execa, Options } from 'execa';
import { afterAll, beforeAll, it, TestFunction } from 'vitest';

import { createProject } from './fixtures';

const DEFAULT_OPTIONS = { stdin: 'ignore' } as const;

export const $ = execa(DEFAULT_OPTIONS);

export const $vf = async (args: string[], options?: Pick<Options, 'stdin' | 'input'>) => {
  const result = await execa({ ...DEFAULT_OPTIONS, ...options })('./vf', [
    '--output-format=json',
    '--timeout=15s',
    ...args,
  ]);

  try {
    return JSON.parse(result.stdout);
  } catch {
    if (result.failed) throw new Error(result.cause);
    if (result.message) throw new Error(result.message);
    if (!result.stdout) throw new Error('empty response');
    return result;
  }
};

export const isDateString = (value: any) => !!value && isValid(parseISO(value));

export const sequential = () => {
  let failed = false;

  return (name: string, fn: TestFunction) =>
    it(name, async (ctx) => {
      if (failed) return ctx.skip('sequence failed');

      try {
        return await fn(ctx);
      } catch (err) {
        failed = true;
        throw err;
      }
    });
};

export const setupProjectTest = () => {
  let project: any;

  beforeAll(async () => {
    ({ project } = await createProject());
  });

  afterAll(async () => {
    await $vf(['project', 'delete', `--project-id=${project.id}`])
      // TODO: remove once project deletion is fixed (COR-13141)
      .catch(Utils.functional.noop);
  });

  return () => project;
};
