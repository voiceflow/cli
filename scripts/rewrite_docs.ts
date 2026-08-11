import fs from 'node:fs/promises';

import { OpenAPIV3 } from 'openapi-types';
import z from 'zod';

const OperationMetadata = z.looseObject({
  cli: z.looseObject({
    command: z.string(),
    description: z.string().optional(),
    example: z.string().optional(),
  }),
});

/**
 * Extensions this script reads off an operation. Declaring them keeps a typo in an
 * extension key a compile error rather than a guard that silently never fires.
 */
interface OperationExtensions {
  'x-speakeasy-ignore'?: unknown;
  'x-vf'?: unknown;
}

enum Method {
  GET = 'get',
  PUT = 'put',
  HEAD = 'head',
  POST = 'post',
  PATCH = 'patch',
  DELETE = 'delete',
}

/**
 * Injected descriptions are delimited so a re-run replaces the previous block instead of
 * appending a second copy. This matters because `docs/` is NOT regenerated between runs:
 * it is produced by cmd/gendocs, which nothing in the repo invokes -- `yarn codegen` is
 * `speakeasy run && tsx ./scripts/rewrite_docs.ts`. This script must therefore be
 * idempotent against its own previous output.
 */
const DESCRIPTION_BLOCK = /<!-- vf:description -->[\s\S]*?<!-- \/vf:description -->\n?/;
const descriptionBlock = (body: string) => `<!-- vf:description -->\n${body}\n<!-- /vf:description -->\n`;

/** Injected content sits inside a section, so a heading of its own would break the anchors. */
const HEADING_LINE = /^### /m;

const document: OpenAPIV3.Document = JSON.parse(await fs.readFile('openapi.stable.json', 'utf-8'));

/** Commands that carry enrichment but whose docs page is absent — reported once at the end. */
const missingDocsPages: string[] = [];
let candidateCount = 0;
let rewrittenCount = 0;

for (const [path, operations] of Object.entries(document.paths)) {
  if (!operations) continue;

  for (const method of Object.values(Method)) {
    const operation = operations[method] as (OpenAPIV3.OperationObject & OperationExtensions) | undefined;
    if (!operation) continue;

    // Speakeasy generates no command for ignored operations, so they have no docs page.
    if (operation['x-speakeasy-ignore'] === true) continue;

    const metadata = operation['x-vf'];

    // Operations without CLI metadata are not exposed as commands and have nothing to
    // enrich. Anything else malformed falls through to the parse below and fails loudly.
    if (metadata === undefined || metadata === null) continue;
    if (typeof metadata === 'object' && !('cli' in metadata)) continue;

    let parsed: z.infer<typeof OperationMetadata>;
    try {
      parsed = OperationMetadata.parse(metadata);
    } catch (cause) {
      throw new Error(`Invalid x-vf.cli metadata on ${method.toUpperCase()} ${path}`, { cause });
    }
    const { cli } = parsed;

    if (!cli.example && !cli.description) continue;

    for (const field of ['example', 'description'] as const) {
      const value = cli[field];
      if (value && HEADING_LINE.test(value)) {
        throw new Error(
          `x-vf.cli.${field} on ${method.toUpperCase()} ${path} contains a "### " heading, ` +
            'which would break the structure of the docs page it is injected into'
        );
      }
    }

    candidateCount += 1;

    // Mirrors the filename cmd/gendocs builds: strings.ReplaceAll(cmd.CommandPath(), " ", "_").
    // `replace` would substitute only the first space and break every subgrouped command.
    const docsPath = `docs/vf_${cli.command.replaceAll(' ', '_')}.md`;

    let markdown: string;
    try {
      markdown = await fs.readFile(docsPath, 'utf-8');
    } catch (error) {
      // Only a genuinely absent page is tolerable; a permissions or I/O fault is not.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      missingDocsPages.push(`${cli.command} -> ${docsPath}`);
      continue;
    }

    const original = markdown;

    // markdown = markdown.replaceAll(/\[([^\]]+)\]\(([^)]+)\.md\)/, '[$1](./$2)');

    // Both injections use replacer functions rather than replacement strings: `$1`, `$&`,
    // `$'` and `$$` are substitution directives inside a replacement string, and authored
    // shell examples contain them routinely (`awk '{print $1}'`, `$$` for a PID).
    if (cli.example) {
      const { example } = cli;
      markdown = markdown.replace(
        /(### Examples).+?(### Options\n)/s,
        (_match, heading: string, options: string) => `${heading}\n\n${example}\n${options}`
      );
    }

    if (cli.description) {
      const block = descriptionBlock(cli.description);
      markdown = DESCRIPTION_BLOCK.test(markdown)
        ? markdown.replace(DESCRIPTION_BLOCK, () => block)
        : markdown.replace(
            /(### Synopsis.+?)(### Examples\n)/s,
            (_match, synopsis: string, examples: string) => `${synopsis}${block}${examples}`
          );
    }

    //     const lastCommand = cli.command.split(' ').at(-1);
    //     if (lastCommand) {
    //       markdown = `---
    // sidebarTitle: "${lastCommand}"
    // ---

    // ${markdown}`;
    //     }

    if (markdown === original) continue;

    await fs.writeFile(docsPath, markdown, 'utf-8');
    rewrittenCount += 1;
  }
}

// Every page missing means docs/ was never generated, not that a few commands are new.
// Warning and exiting 0 there would turn a broken pipeline into a green build.
if (candidateCount > 0 && missingDocsPages.length === candidateCount) {
  throw new Error(
    `No docs page exists for any of the ${candidateCount} command(s) carrying x-vf enrichment. ` +
      'docs/ is generated by cmd/gendocs, which `yarn codegen` does not run — regenerate it with `go run ./cmd/gendocs`.'
  );
}

if (missingDocsPages.length > 0) {
  console.warn(
    `[rewrite_docs] ${missingDocsPages.length} command(s) carry x-vf enrichment but have no docs page. ` +
      'docs/ is generated by cmd/gendocs — regenerate it with `go run ./cmd/gendocs`:'
  );
  for (const entry of missingDocsPages) console.warn(`  - ${entry}`);
}

console.log(`[rewrite_docs] rewrote ${rewrittenCount} docs page(s)`);
