// Tests for stdin handling on commands that accept a request body.
//
// Two failure modes are covered, both of which used to hang the CLI forever:
//
//   sleep 30 | vf ...            stdin never sends data and never closes
//   ( echo '{}'; sleep 3 ) | vf  stdin sends data but holds the write end open
//
// Every case here drives a REAL SHELL PIPELINE rather than execa's `input:`
// option. That distinction is the whole point of this file. `input:` writes from
// an already-warm parent process at spawn time, so it is the fastest possible
// producer and it survives designs that a real pipeline does not — an earlier
// version of this fix polled stdin for readiness, passed the entire existing
// suite, and silently discarded the body from every curl, node and python3
// pipeline. The suite was green while the CLI was broken.
//
// So: cold producers, through `sh -c`, asserting the body actually arrived.
//
// Requires the CLI binary at the repo root: go build -o vf ./cmd/vf

import { execa } from 'execa';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const VF = path.resolve(__dirname, '..', 'vf');

// --dry-run prints the request it would send to stderr and makes no network
// call, so these stay hermetic while still proving what reached the body.
const ARGS = [
  'agent', 'update',
  '--project-id', 'p',
  '--environment-alias', 'main',
  '--dry-run',
  '--token', 'vfp_not_a_real_token',
].join(' ');

/** Runs a real shell pipeline: <producer> | vf agent update --dry-run */
function pipeline(producer: string, options: { timeout?: number } = {}) {
  return execa({ reject: false, timeout: options.timeout ?? 20_000, stdin: 'ignore' })(
    'sh', ['-c', `${producer} | ${VF} ${ARGS}`],
  );
}

/** The dry-run output contains the request body; pull the prompt back out. */
function sentPrompt(output: string): string | null {
  const m = output.match(/"prompt":\s*"([^"]*)"/);
  return m ? m[1] : null;
}

describe('stdin from cold producers', () => {
  // Each of these is a producer that does real work before writing. They are
  // the shapes that a readiness check drops, so they are the regression guard.
  const producers: Array<[name: string, script: string, marker: string]> = [
    ['node', `node -e 'process.stdout.write(JSON.stringify({prompt:"from-node"}))'`, 'from-node'],
    ['python3', `python3 -c 'print("{\\"prompt\\":\\"from-python\\"}")'`, 'from-python'],
    ['echo', `echo '{"prompt":"from-echo"}'`, 'from-echo'],
    ['slow (500ms)', `sh -c 'sleep 0.5; echo "{\\"prompt\\":\\"from-slow\\"}"'`, 'from-slow'],
  ];

  for (const [name, script, marker] of producers) {
    it(`receives the body from a ${name} producer`, async () => {
      const result = await pipeline(script);
      expect(result.timedOut, `${name} pipeline timed out`).toBe(false);
      expect(sentPrompt(result.stderr + result.stdout), `${name} body was dropped`).toBe(marker);
    });
  }

  // A race that shows up one run in three is still a broken CLI, so the
  // timing-sensitive producer is repeated rather than sampled once.
  it('receives the body from a node producer on every one of 20 runs', async () => {
    const marker = 'from-node';
    const script = `node -e 'process.stdout.write(JSON.stringify({prompt:"${marker}"}))'`;
    const results = await Promise.all(Array.from({ length: 20 }, () => pipeline(script)));

    const dropped = results.filter((r) => sentPrompt(r.stderr + r.stdout) !== marker).length;
    expect(dropped, `${dropped}/20 runs lost the body — this is a race, not a flake`).toBe(0);
  });
});

describe('stdin that never delivers', () => {
  it('gives up on an open silent pipe instead of hanging, and says how to fix it', async () => {
    // The producer must outlive the CLI's 10s stdin budget so the pipe really is
    // "open and silent". `sh` then waits for the producer too, so the wall time
    // here is the producer's lifetime, not the CLI's — the CLI gives up at 10s.
    const result = await pipeline('sleep 15', { timeout: 40_000 });

    expect(result.timedOut, 'the CLI hung instead of bounding the read').toBe(false);
    expect(result.exitCode, 'giving up must be an error, not a silent empty body').not.toBe(0);
    expect(result.stderr).toContain('stdin is open but sent no data');
    expect(result.stderr).toContain('</dev/null');
  });

  it('still receives the body when a producer writes and then holds the pipe open', async () => {
    const result = await pipeline(`( echo '{"prompt":"from-held"}'; sleep 3 )`);

    expect(result.timedOut).toBe(false);
    expect(sentPrompt(result.stderr + result.stdout), 'body lost when producer held the write end').toBe('from-held');
  });
});

describe('backward compatibility', () => {
  // execa's `input:` is how the rest of the suite pipes stdin. It must keep
  // working, but it is deliberately NOT counted as coverage for the cases above.
  it('still accepts execa input: (the shape the rest of the suite uses)', async () => {
    const result = await execa({ reject: false, timeout: 20_000, input: '{"prompt":"from-execa"}' })(
      VF, ARGS.split(' '),
    );
    expect(sentPrompt(result.stderr + result.stdout)).toBe('from-execa');
  });

  it('runs normally with stdin closed', async () => {
    const result = await execa({ reject: false, timeout: 20_000, stdin: 'ignore' })(
      VF, [...ARGS.split(' '), '--prompt', 'from-flag'],
    );
    expect(result.timedOut).toBe(false);
    expect(sentPrompt(result.stderr + result.stdout)).toBe('from-flag');
  });
});
