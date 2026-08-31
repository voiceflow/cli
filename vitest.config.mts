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
// Credentials are resolved here rather than in test/setup.ts because setupFiles
// run after the config is built, which is too late to choose what to include.
dotenv.config({ path: '.env.test' });

const hasCredentials = Boolean(process.env.VF_TOKEN && process.env.VF_WORKSPACE_ID);

if (!hasCredentials) {
  // Say so loudly. Silently running a subset is how a suite quietly stops
  // covering the thing it was written to cover.
  console.warn(
    '\n  Skipping test/vf-*.test.ts — set VF_TOKEN and VF_WORKSPACE_ID (or create .env.test) to run them.\n',
  );
}

export default mergeConfig<ViteUserConfig, ViteUserConfig>(baseConfig, {
  test: {
    include: ['test/**/*.test.ts'],
    exclude: hasCredentials ? [] : ['test/vf-*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30000,
  },
});
