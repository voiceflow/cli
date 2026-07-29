import { beforeAll, describe, expect, vi } from 'vitest';

import { $vf, sequential, setupProjectTest } from './utils';

describe('vf knowledge-base', () => {
  const project = setupProjectTest();

  const $vf_knowledge_base: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, '--environment-alias=main', 'knowledge-base', ...args], options);

  const waitUntilProcessed = (documentID: string) =>
    vi.waitUntil(
      async () => {
        const result = await $vf([
          `--project-id=${project().id}`,
          '--environment-alias=main',
          'document',
          'get',
          `--document-id=${documentID}`,
        ]).catch(() => null);

        if (!result) return false;

        return result.document.status.type === 'SUCCESS';
      },
      { timeout: 10000 }
    );

  describe('CRUD', { concurrent: false }, () => {
    const it = sequential();
    let document: any;

    beforeAll(async () => {
      ({ document } = await $vf([
        `--project-id=${project().id}`,
        '--environment-alias=main',
        'document',
        'create-url',
        '--url=https://www.york.ac.uk/teaching/cws/wws/webpage1.html',
      ]));
      await waitUntilProcessed(document.id);
    });

    it('query documents', async () => {
      const result = await $vf_knowledge_base(['query', '--version-param=draft', '--question=why should I learn HTML']);

      expect(result).toEqual({
        answer: {
          answerTokens: expect.any(Number),
          base: {
            answerTokens: expect.any(Number),
            cacheWriteTokens: expect.any(Number),
            queryCachedTokens: expect.any(Number),
            queryTokens: expect.any(Number),
          },
          chunks: expect.arrayContaining([
            {
              score: expect.any(Number),
              source: document.data,
              chunkID: expect.any(String),
              content: expect.any(String),
              metadata: {},
              documentID: document.id,
            },
          ]),
          cacheMultiplier: expect.any(Number),
          cacheWriteMultiplier: expect.any(Number),
          cacheWriteTokens: expect.any(Number),
          duration: expect.any(Number),
          inputMultiplier: expect.any(Number),
          model: 'voiceflow-core-4.1',
          output: expect.any(String),
          outputMultiplier: expect.any(Number),
          queryCachedTokens: expect.any(Number),
          queryRemainderTokens: expect.any(Number),
          queryTokens: expect.any(Number),
          tokens: expect.any(Number),
        },
      });
    });
  });
});
