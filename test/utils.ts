import { isValid, parseISO } from 'date-fns';
import { execa, Options } from 'execa';
import { it, TestFunction } from 'vitest';

const DEFAULT_OPTIONS = { stdin: 'ignore' } as const;

export const $ = execa(DEFAULT_OPTIONS);

export const $vf = async (args: string[], options?: Pick<Options, 'stdin' | 'input'>) => {
  const result = await execa({ ...DEFAULT_OPTIONS, ...options })('./vf', [
    '--output-format=json',
    '--timeout=4s',
    ...args,
  ]);

  try {
    return JSON.parse(result.stdout);
  } catch {
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
