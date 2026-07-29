import { describe, expect, it, vi } from 'vitest';

import { $vf, sequential, setupProjectTest } from './utils';

const DOCUMENT_DEFAULTS = {
  id: expect.any(String),
  status: { type: 'PENDING' },
  smartChunking: {
    llmBasedChunks: false,
    llmContentSummarization: false,
    llmGeneratedQ: false,
    llmPrependContext: false,
    markdownConversion: false,
  },
};

describe('vf document', () => {
  const project = setupProjectTest();

  const $vf_document: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, `--environment-alias=main`, 'document', ...args], options);

  const waitUntilProcessed = (documentID: string) =>
    vi.waitUntil(
      async () => {
        const result = await $vf_document(['get', `--document-id=${documentID}`]);

        return result.document.status.type !== 'PENDING' && result.document.status.type !== 'INITIALIZED';
      },
      { timeout: 10000 }
    );

  describe('CRUD', { concurrent: false }, () => {
    const itSeq = sequential();
    let urlDocument1: any;
    let urlDocument2: any;
    let urlDocument3: any;

    itSeq('create url document with args', async () => {
      const url = 'https://example.com/from-args';

      ({ document: urlDocument1 } = await $vf_document(['create-url', `--url=${url}`]));

      expect(urlDocument1).toEqual({
        ...DOCUMENT_DEFAULTS,
        data: {
          url,
          type: 'url',
          name: 'example.com/from-args',
          refreshRate: 'never',
        },
      });
    });

    itSeq('create url document with body', async () => {
      const url = 'https://example.com/from-body';

      ({ document: urlDocument2 } = await $vf_document(['create-url', `--body=${JSON.stringify({ url })}`]));

      expect(urlDocument2).toEqual({
        ...DOCUMENT_DEFAULTS,
        data: {
          url,
          type: 'url',
          name: 'example.com/from-body',
          refreshRate: 'never',
        },
      });
    });

    itSeq('create url document with stdin', async () => {
      const url = 'https://example.com/from-stdin';

      ({ document: urlDocument3 } = await $vf_document(['create-url'], {
        stdin: 'pipe',
        input: JSON.stringify({ url }),
      }));

      expect(urlDocument3).toEqual({
        ...DOCUMENT_DEFAULTS,
        data: {
          url,
          type: 'url',
          name: 'example.com/from-stdin',
          refreshRate: 'never',
        },
      });
    });

    itSeq('document processed', async () => {
      await waitUntilProcessed(urlDocument1.id);
    });

    // TODO: fix openapi schema (missing formdata body)
    it('create text document with args');
    it('create text document with body');
    it('create text document with stdin');

    // TODO: fix openapi schema (missing searchable & metadata fields)
    it('create table document with args');
    it('create table document with body');
    it('create table document with stdin');

    itSeq('update with args', async () => {
      const result = await $vf_document([
        'update',
        `--document-id=${urlDocument1.id}`,
        `--metadata=${JSON.stringify([{ key: 'source', values: ['args'] }])}`,
      ]);

      expect(result).toEqual({ message: `Document ${urlDocument1.id} updated.` });
    });

    itSeq('update with body', async () => {
      const result = await $vf_document([
        'update',
        `--document-id=${urlDocument2.id}`,
        `--body=${JSON.stringify({ metadata: [{ key: 'source', values: ['body'] }] })}`,
      ]);

      expect(result).toEqual({ message: `Document ${urlDocument2.id} updated.` });
    });

    itSeq('update with stdin', async () => {
      const result = await $vf_document(['update', `--document-id=${urlDocument3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ metadata: [{ key: 'source', values: ['stdin'] }] }),
      });

      expect(result).toEqual({ message: `Document ${urlDocument3.id} updated.` });
    });

    itSeq('get', async () => {
      const result = await $vf_document(['get', `--document-id=${urlDocument1.id}`]);

      expect(result).toEqual({
        document: expect.objectContaining({
          id: urlDocument1.id,
          metadata: [{ key: 'source', values: ['args'] }],
        }),
      });
    });

    itSeq('document updated', async () => {
      await waitUntilProcessed(urlDocument1.id);
    });

    itSeq('delete', async () => {
      const result = await $vf_document(['delete', `--document-id=${urlDocument1.id}`]);

      expect(result).toEqual({ message: `Document ${urlDocument1.id} deleted.` });
    });

    itSeq('list', async () => {
      const result = await $vf_document(['list']);

      expect(result).toEqual({
        documents: expect.not.arrayContaining([expect.objectContaining({ id: urlDocument1.id })]),
      });
      expect(result).toEqual({
        documents: expect.arrayContaining([
          expect.objectContaining({ id: urlDocument2.id }),
          expect.objectContaining({ id: urlDocument3.id }),
        ]),
      });
    });
  });
});
