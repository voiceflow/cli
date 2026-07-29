import { describe, expect } from 'vitest';

import { $vf, isDateString, sequential, setupProjectTest } from './utils';

const PLAYBOOK_DEFAULTS = {
  id: expect.any(String),
  endTool: null,
  cardTool: null,
  settings: {},
  buttonTool: null,
  description: null,
  instructions: null,
  carouselTool: null,
  skipTurnTool: null,
  pathToolOrder: [],
  webSearchTool: null,
  callForwardTool: null,
  knowledgeBaseTool: null,
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf playbook', () => {
  const project = setupProjectTest();

  const $vf_playbook: typeof $vf = (args, options) =>
    $vf([`--project-id=${project().id}`, `--environment-alias=main`, 'playbook', ...args], options);

  describe('CRUD', { concurrent: false }, () => {
    const it = sequential();
    let playbook1: any;
    let playbook2: any;
    let playbook3: any;

    it('create with args', async () => {
      const name = 'playbook from args';

      ({ playbook: playbook1 } = await $vf_playbook(['create', `--name=${name}`]));

      expect(playbook1).toEqual({ ...PLAYBOOK_DEFAULTS, name });
    });

    it('create with body', async () => {
      const name = 'playbook from body';

      ({ playbook: playbook2 } = await $vf_playbook(['create', `--body=${JSON.stringify({ name })}`]));

      expect(playbook2).toEqual({ ...PLAYBOOK_DEFAULTS, name });
    });

    it('create with stdin', async () => {
      const name = 'playbook from stdin';

      ({ playbook: playbook3 } = await $vf_playbook(['create'], {
        stdin: 'pipe',
        input: JSON.stringify({ name }),
      }));

      expect(playbook3).toEqual({ ...PLAYBOOK_DEFAULTS, name });
    });

    it('update with args', async () => {
      const result = await $vf_playbook(['update', `--playbook-id=${playbook1.id}`, '--name=renamed with args']);

      expect(result).toEqual({ message: `Playbook ${playbook1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_playbook([
        'update',
        `--playbook-id=${playbook2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `Playbook ${playbook2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_playbook(['update', `--playbook-id=${playbook3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `Playbook ${playbook3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_playbook(['get', `--playbook-id=${playbook1.id}`]);

      expect(result).toEqual({
        playbook: expect.objectContaining({ id: playbook1.id, name: 'renamed with args' }),
      });
    });

    it('delete', async () => {
      const result = await $vf_playbook(['delete', `--playbook-id=${playbook1.id}`]);

      expect(result).toEqual({ message: `Playbook ${playbook1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_playbook(['list']);

      expect(result).toEqual({
        playbooks: expect.not.arrayContaining([expect.objectContaining({ id: playbook1.id })]),
      });
      expect(result).toEqual({
        playbooks: expect.arrayContaining([
          expect.objectContaining({ id: playbook2.id }),
          expect.objectContaining({ id: playbook3.id }),
        ]),
      });
    });
  });
});
