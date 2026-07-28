import { isAfter } from 'date-fns';
import { describe, expect, it } from 'vitest';

import { WORKSPACE_ID } from './config';
import { $vf, isDateString, sequential } from './utils';

const PROJECT_DEFAULTS = {
  id: expect.any(String),
  image: null,
  description: null,
  workspaceID: expect.any(String),
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf project', () => {
  describe('CRUD', () => {
    const itSeq = sequential();
    let project1: any;
    let project2: any;
    let project3: any;

    itSeq('create with args', async () => {
      const name = 'project from args';
      ({ project: project1 } = await $vf([
        'project',
        'create',
        '--type=webchat',
        `--name=${name}`,
        `--workspace-id=${WORKSPACE_ID}`,
      ]));

      expect(project1).toEqual({ ...PROJECT_DEFAULTS, name });
    });

    itSeq('create with body', async () => {
      const name = 'project from body';
      ({ project: project2 } = await $vf([
        'project',
        'create',
        `--workspace-id=${WORKSPACE_ID}`,
        `--body=${JSON.stringify({ name, type: 'webchat' })}`,
      ]));

      expect(project2).toEqual({ ...PROJECT_DEFAULTS, name });
    });

    itSeq('create with stdin', async () => {
      const name = 'project from stdin';
      ({ project: project3 } = await $vf(['project', 'create', `--workspace-id=${WORKSPACE_ID}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name, type: 'webchat' }),
      }));

      expect(project3).toEqual({ ...PROJECT_DEFAULTS, name });
    });

    itSeq('update with args', async () => {
      const result = await $vf(['project', 'update', `--project-id=${project1.id}`, '--name=renamed with args']);

      expect(result).toEqual({ message: `Project ${project1.id} updated.` });
    });

    itSeq('update with body', async () => {
      const result = await $vf([
        'project',
        'update',
        `--project-id=${project2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `Project ${project2.id} updated.` });
    });

    itSeq('update with stdin', async () => {
      const result = await $vf(['project', 'update', `--project-id=${project3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `Project ${project3.id} updated.` });
    });

    itSeq('get', async () => {
      const result = await $vf(['project', 'get', `--project-id=${project1.id}`]);

      expect(result).toEqual({
        project: {
          ...project1,
          name: 'renamed with args',
          updatedAt: expect.toSatisfy((date) => isAfter(date, project1.updatedAt)),
        },
      });
    });

    it.skip('delete', async () => {
      const result = await $vf(['project', 'delete', `--project-id=${project1.id}`]);

      expect(result).toEqual({ message: `Project ${project1.id} deleted.` });
    });

    itSeq('list', async () => {
      const result = await $vf(['project', 'list', `--workspace-id=${WORKSPACE_ID}`]);

      // TODO: re-enable after fixing project delete
      // expect(result).toEqual({ projects: expect.not.arrayContaining([expect.objectContaining({ id: project1.id })]) });
      expect(result).toEqual({
        projects: expect.arrayContaining([
          expect.objectContaining({ id: project2.id }),
          expect.objectContaining({ id: project3.id }),
        ]),
      });
    });
  });
});
