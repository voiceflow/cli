import { isAfter } from 'date-fns';
import { afterAll, describe, expect } from 'vitest';

import { ORGANIZATION_ID } from './config';
import { $vf, isDateString, sequential } from './utils';

const WORKSPACE_DEFAULTS = {
  id: expect.any(String),
  image: null,
  organizationID: ORGANIZATION_ID,
  createdAt: expect.toSatisfy(isDateString),
  updatedAt: expect.toSatisfy(isDateString),
};

describe('vf workspace', () => {
  const $vf_workspace: typeof $vf = (args, options) => $vf(['workspace', ...args], options);

  describe('CRUD', () => {
    const it = sequential();
    let workspace1: any;
    let workspace2: any;
    let workspace3: any;

    afterAll(async () => {
      await Promise.allSettled(
        [workspace1.id, workspace2.id, workspace3.id].map((workspaceID) =>
          $vf_workspace(['delete', `--workspace-id=${workspaceID}`])
        )
      );
    });

    it('create with args', async () => {
      const name = 'workspace from args';

      ({ workspace: workspace1 } = await $vf_workspace([
        'create',
        `--name=${name}`,
        `--organization-id=${ORGANIZATION_ID}`,
      ]));

      expect(workspace1).toEqual({ ...WORKSPACE_DEFAULTS, name });
    });

    it('create with body', async () => {
      const name = 'workspace from body';

      ({ workspace: workspace2 } = await $vf_workspace([
        'create',
        `--organization-id=${ORGANIZATION_ID}`,
        `--body=${JSON.stringify({ name })}`,
      ]));

      expect(workspace2).toEqual({ ...WORKSPACE_DEFAULTS, name });
    });

    it('create with stdin', async () => {
      const name = 'workspace from stdin';

      ({ workspace: workspace3 } = await $vf_workspace(['create', `--organization-id=${ORGANIZATION_ID}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name }),
      }));

      expect(workspace3).toEqual({ ...WORKSPACE_DEFAULTS, name });
    });

    it('update with args', async () => {
      const result = await $vf_workspace(['update', `--workspace-id=${workspace1.id}`, '--name=renamed with args']);

      expect(result).toEqual({ message: `Workspace ${workspace1.id} updated.` });
    });

    it('update with body', async () => {
      const result = await $vf_workspace([
        'update',
        `--workspace-id=${workspace2.id}`,
        `--body=${JSON.stringify({ name: 'renamed with body' })}`,
      ]);

      expect(result).toEqual({ message: `Workspace ${workspace2.id} updated.` });
    });

    it('update with stdin', async () => {
      const result = await $vf_workspace(['update', `--workspace-id=${workspace3.id}`], {
        stdin: 'pipe',
        input: JSON.stringify({ name: 'renamed with stdin' }),
      });

      expect(result).toEqual({ message: `Workspace ${workspace3.id} updated.` });
    });

    it('get', async () => {
      const result = await $vf_workspace(['get', `--workspace-id=${workspace1.id}`]);

      expect(result).toEqual({
        workspace: {
          ...workspace1,
          name: 'renamed with args',
          updatedAt: expect.toSatisfy((date) => isAfter(date, workspace1.updatedAt)),
        },
      });
    });

    it('delete', async () => {
      const result = await $vf_workspace(['delete', `--workspace-id=${workspace1.id}`]);

      expect(result).toEqual({ message: `Workspace ${workspace1.id} deleted.` });
    });

    it('list', async () => {
      const result = await $vf_workspace(['list']);

      expect(result).toEqual({
        workspaces: expect.not.arrayContaining([expect.objectContaining({ id: workspace1.id })]),
      });
      expect(result).toEqual({
        workspaces: expect.arrayContaining([
          expect.objectContaining({ id: workspace2.id }),
          expect.objectContaining({ id: workspace3.id }),
        ]),
      });
    });
  });
});
