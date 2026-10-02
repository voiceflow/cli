import dotenv from 'dotenv';

// The one VF_ variable a run may set from outside .env.test: it is how a run
// asks to skip the integration tests, and CI sets it in its environment.
const SKIP_INTEGRATION_TESTS = 'VF_SKIP_INTEGRATION_TESTS';

/**
 * Loads the suite's VF_* settings from .env.test, and from nowhere else.
 *
 * Developers often export VF_TOKEN, VF_WORKSPACE_ID or VF_OUTPUT_FORMAT in
 * their shell for everyday use, and dotenv never overrides a variable that is
 * already set, so those values used to win. With a real token and workspace
 * in the shell, the integration tests would create and delete projects in that
 * workspace, and every spawned vf would see the token. So every other VF_
 * variable is dropped first.
 */
export function loadTestEnv(): void {
  for (const name of Object.keys(process.env)) {
    if (name.startsWith('VF_') && name !== SKIP_INTEGRATION_TESTS) {
      delete process.env[name];
    }
  }
  dotenv.config({ path: '.env.test' });
}
