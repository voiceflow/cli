// The suite must never reach the developer's own credentials. test/setup.ts
// gives every spawned vf an empty HOME and no session bus, and test/env.ts
// keeps the shell's VF_* variables out. Both rely on how today's platforms
// find their stores: the macOS Keychain through $HOME, a Linux keyring over
// D-Bus. This checks the result from outside, the way every test runs vf, so
// that if a platform ever finds its store some other way, the suite fails here
// instead of quietly running against a real account.
//
// Requires: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

describe('a vf spawned by this suite', () => {
  it('finds no token and no OAuth session, and no config in the real home', async () => {
    const result = await execa({ reject: false, stdin: 'ignore' })(VF, ['whoami']);

    expect(result.exitCode, result.stderr).toBe(0);
    // "[unset]" means no flag, VF_TOKEN, OS keyring entry or config file.
    expect(result.stdout).toMatch(/--token\s+\[unset\s*\]/);
    expect(result.stdout).toMatch(/OAuth session:\s+not signed in/);

    // os.userInfo() reads the user database, not $HOME, so it names the real home.
    const configFile = result.stdout.match(/^Config file: (.+)$/m)?.[1] ?? '';
    expect(configFile).not.toBe('');
    expect(configFile.startsWith(os.userInfo().homedir + path.sep)).toBe(false);
  });
});
