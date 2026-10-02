import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll } from 'vitest';

import { loadTestEnv } from './env';

// VF_* settings come from .env.test alone, never from the developer's shell.
loadTestEnv();

// Every vf this suite spawns inherits this process's environment, and vf keeps
// credentials in two places: ~/.config/vf (config.yaml and the OAuth session)
// and the OS keyring. Run against the developer's own, the suite was neither
// hermetic nor harmless: tests that expect no credentials found a session and
// failed, and a run refreshed the real OAuth session, rewriting oauth.json and
// rotating the tokens in the keyring.
//
// So each test file gets an empty HOME of its own, and no way to a keyring:
//   - macOS: /usr/bin/security finds the login Keychain through $HOME, so under
//     an empty HOME there is no default keychain to read or write.
//   - Linux: the Secret Service is reached over the D-Bus session bus, found
//     through DBUS_SESSION_BUS_ADDRESS or $XDG_RUNTIME_DIR/bus, never $HOME.
//     An address whose socket does not exist wins over the fallback and fails
//     at once, and vf then treats the keyring as unavailable.
// The suite runs only on Unix, since it spawns ./vf and sh. The integration
// tests are unaffected: they authenticate with VF_TOKEN from .env.test.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vf-test-home-'));
process.env.HOME = home;
process.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${path.join(home, 'no-session-bus')}`;

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});
