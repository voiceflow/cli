import baseConfig from '@voiceflow/vitest-config/unit';
import dotenv from 'dotenv';
import { mergeConfig, type ViteUserConfig } from 'vitest/config';

// Two kinds of test live in test/:
//
//   test/vf-*.test.ts   drive the real API — they create and delete projects
//   everything else     hermetic: a local mock server, --dry-run, or --help
//
// The integration tests used to FAIL rather than skip when no credentials were
// present, because createProject sent `--workspace-id=undefined`. That made
// `yarn test` red for anyone without a token — including CI — so a red suite
// carried no information and the hermetic tests had no gate.
//
// Running a subset must never be the silent default: a suite that quietly stops
// covering what it was written to cover is worse than one that fails. So the
// absence of credentials is an error, and dropping the integration tests has to
// be asked for explicitly. CI asks for it, in the workflow, where it is visible.
//
// Credentials are resolved here rather than in test/setup.ts because setupFiles
// run after the config is built, which is too late to choose what to include.
dotenv.config({ path: '.env.test' });

const hasCredentials = Boolean(process.env.VF_TOKEN && process.env.VF_WORKSPACE_ID);
const integrationOptOut = process.env.VF_SKIP_INTEGRATION_TESTS === '1';

if (!hasCredentials && !integrationOptOut) {
  throw new Error(
    [
      'test/vf-*.test.ts need VF_TOKEN and VF_WORKSPACE_ID — they create and delete real projects.',
      '',
      '  To run everything:      add both to .env.test',
      '  To run only the rest:   VF_SKIP_INTEGRATION_TESTS=1 yarn test',
    ].join('\n'),
  );
}

const runIntegration = hasCredentials && !integrationOptOut;

if (!runIntegration) {
  console.warn('\n  Running without test/vf-*.test.ts (VF_SKIP_INTEGRATION_TESTS=1).\n');
}

export default mergeConfig<ViteUserConfig, ViteUserConfig>(baseConfig, {
  test: {
    include: ['test/**/*.test.ts'],
    exclude: runIntegration ? [] : ['test/vf-*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30000,
  },
});
