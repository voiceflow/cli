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

enum Method {
  GET = 'get',
  PUT = 'put',
  HEAD = 'head',
  POST = 'post',
  PATCH = 'patch',
  DELETE = 'delete',
}

const document: OpenAPIV3.Document = JSON.parse(await fs.readFile('openapi.stable.json', 'utf-8'));

/** Commands that carry enrichment but whose docs page is absent — reported once at the end. */
const missingDocsPages: string[] = [];
let rewrittenCount = 0;

for (const operations of Object.values(document.paths)) {
  if (!operations) continue;

  for (const method of Object.values(Method)) {
    const operation = operations[method] as (OpenAPIV3.OperationObject & Record<string, unknown>) | undefined;
    if (!operation) continue;

    // Speakeasy generates no command for ignored operations, so they have no docs page to enrich.
    if (operation['x-speakeasy-ignore'] === true) continue;

    const metadata = operation['x-vf'];

    // Operations without CLI metadata are not exposed as commands and have nothing to enrich.
    // A malformed `cli` block is still a spec error, so parsing below stays strict.
    if (!metadata || typeof metadata !== 'object' || !('cli' in metadata)) continue;

    const { cli } = OperationMetadata.parse(metadata);

    if (!cli.example && !cli.description) continue;

    // Mirrors the filename cmd/gendocs builds: strings.ReplaceAll(cmd.CommandPath(), " ", "_").
    // `replace` would substitute only the first space and break every command with a subgroup.
    const docsPath = `docs/vf_${cli.command.replaceAll(' ', '_')}.md`;

    let markdown: string;
    try {
      markdown = await fs.readFile(docsPath, 'utf-8');
    } catch {
      missingDocsPages.push(`${cli.command} -> ${docsPath}`);
      continue;
    }

    const original = markdown;

    // markdown = markdown.replaceAll(/\[([^\]]+)\]\(([^)]+)\.md\)/, '[$1](./$2)');

    if (cli.example) {
      markdown = markdown.replace(/(### Examples).+(### Options\n)/s, `$1\n\n${cli.example}\n$2`);
    }

    if (cli.description) {
      markdown = markdown.replace(/(### Synopsis.+)(### Examples\n)/s, `$1\n${cli.description}\n$2`);
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

if (missingDocsPages.length > 0) {
  console.warn(
    `[rewrite_docs] ${missingDocsPages.length} command(s) carry x-vf enrichment but have no docs page. ` +
      `Run \`speakeasy run\` to regenerate docs/ first:`
  );
  for (const entry of missingDocsPages) console.warn(`  - ${entry}`);
}

console.log(`[rewrite_docs] rewrote ${rewrittenCount} docs page(s)`);
