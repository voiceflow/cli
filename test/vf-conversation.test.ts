import { randomUUID } from 'node:crypto';

import { describe, expect } from 'vitest';

import { $vf, isDateString, sequential, setupProjectTest } from './utils';

describe('vf conversation', () => {
  const project = setupProjectTest();

  const $vf_conversation: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, '--environment-alias=main', 'conversation', ...args], options);

  describe('interact', { concurrent: false }, () => {
    const userID = `user_${randomUUID()}`;
    const it = sequential();

    it('launch with args', async () => {
      const result = await $vf_conversation([
        'send',
        '--version-param=draft',
        `--user-id=${userID}`,
        `--action=${JSON.stringify({ type: 'launch' })}`,
      ]);

      expect(result).toEqual({
        traces: expect.arrayContaining([
          {
            type: 'debug',
            time: expect.any(Number),
            turnID: expect.any(String),
            payload: expect.objectContaining({ context: 'Start', level: 'info', message: 'starting conversation' }),
          },
          {
            type: 'text',
            time: expect.any(Number),
            turnID: expect.any(String),
            payload: expect.objectContaining({ ai: true, message: expect.any(String), messageID: expect.any(String) }),
          },
        ]),
      });
    });

    it('send message with body', async () => {
      const result = await $vf_conversation([
        'send',
        `--user-id=${userID}`,
        `--body=${JSON.stringify({
          action: { type: 'text', payload: 'how should I get in contact' },
          version: 'draft',
        })}`,
      ]);

      expect(result).toEqual({
        traces: expect.arrayContaining([
          {
            type: 'text',
            time: expect.any(Number),
            turnID: expect.any(String),
            payload: expect.objectContaining({ ai: true, message: expect.any(String), messageID: expect.any(String) }),
          },
        ]),
      });
    });

    it('end conversation with stdin', async () => {
      const result = await $vf_conversation(['send', `--user-id=${userID}`], {
        stdin: 'pipe',
        input: JSON.stringify({ action: { type: 'end' }, version: 'draft' }),
      });

      expect(result).toEqual({
        traces: expect.arrayContaining([
          {
            type: 'text',
            time: expect.any(Number),
            turnID: expect.any(String),
            payload: expect.objectContaining({ ai: true, message: expect.any(String), messageID: expect.any(String) }),
          },
        ]),
      });
    });
  });
});
