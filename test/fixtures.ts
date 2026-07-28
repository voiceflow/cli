import { WORKSPACE_ID } from './config';
import { $vf } from './utils';

export const createProject = () =>
  $vf(['project', 'create', '--type=webchat', `--name=shared project`, `--workspace-id=${WORKSPACE_ID}`]);
