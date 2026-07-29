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
    $vf([`--project-id=${project().id}`, '--environment-alias=main', 'document', ...args], options);

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
    let tableDocument1: any;
    let tableDocument2: any;
    let tableDocument3: any;

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

    // TODO: fix openapi schema (missing formdata body)
    it('create text document with args');
    it('create text document with body');
    it('create text document with stdin');

    itSeq('create table document with args', async () => {
      const name = 'table document from args';

      ({ document: tableDocument1 } = await $vf_document([
        'create-table',
        `--name=${name}`,
        `--items=${JSON.stringify([{ title: 'Starter' }, { title: 'Business' }, { title: 'Enterprise' }])}`,
        `--schema=${JSON.stringify({ searchableFields: ['title'] })}`,
      ]));

      expect(tableDocument1).toEqual({
        ...DOCUMENT_DEFAULTS,
        data: {
          url: null,
          name,
          type: 'table',
          rowsCount: 3,
        },
        smartChunking: null,
      });
    });

    itSeq('create table document with body', async () => {
      const name = 'table document from body';

      ({ document: tableDocument2 } = await $vf_document([
        'create-table',
        `--body=${JSON.stringify({
          name,
          items: [{ name: 'Captain Hook' }, { name: 'Peter Pan' }],
          schema: { searchableFields: ['name'] },
        })}`,
      ]));

      expect(tableDocument2).toEqual({
        ...DOCUMENT_DEFAULTS,
        data: {
          url: null,
          name,
          type: 'table',
          rowsCount: 2,
        },
        smartChunking: null,
      });
    });

    itSeq('create table document with stdin', async () => {
      const name = 'table document from stdin';

      ({ document: tableDocument3 } = await $vf_document([
        'create-table',
        `--body=${JSON.stringify({
          name,
          items: [{ author: 'Tolkein' }, { author: 'Sanderson' }],
          schema: { searchableFields: ['author'] },
        })}`,
      ]));

      expect(tableDocument3).toEqual({
        ...DOCUMENT_DEFAULTS,
        data: {
          url: null,
          name,
          type: 'table',
          rowsCount: 2,
        },
        smartChunking: null,
      });
    });

    itSeq('document processed', async () => {
      await waitUntilProcessed(urlDocument1.id);
    });

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
          expect.objectContaining({ id: tableDocument1.id }),
          expect.objectContaining({ id: tableDocument2.id }),
          expect.objectContaining({ id: tableDocument3.id }),
        ]),
      });
    });
  });
});
