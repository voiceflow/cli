import dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll } from 'vitest';

dotenv.config({ path: '.env.test' });

// Every vf this suite spawns inherits this process's environment, and vf keeps
// its state under $HOME: config.yaml and the OAuth session in ~/.config/vf, and
// on macOS the tokens in the login Keychain, which /usr/bin/security also finds
// through $HOME. Run against the developer's own HOME, the suite was neither
// hermetic nor harmless: tests that expect no credentials found a session and
// failed, and a run refreshed the real OAuth session, rewriting oauth.json and
// rotating the tokens in the Keychain.
//
// So each test file gets an empty HOME of its own. Under it vf finds no config,
// no session and no default Keychain, so it can neither read nor overwrite the
// developer's. The integration tests are unaffected: they authenticate with
// VF_TOKEN from .env.test, which does not depend on HOME.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-home-'));
process.env.HOME = home;

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});
