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

for (const operations of Object.values(document.paths).slice(0, 3)) {
  if (!operations) continue;

  for (const method of Object.values(Method)) {
    const operation = operations[method];
    if (!operation) continue;

    const { cli } = OperationMetadata.parse((operation as any)['x-vf']);

    const docsPath = `docs/vf_${cli.command.replace(' ', '_')}.md`;
    let markdown = await fs.readFile(docsPath, 'utf-8');

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

    await fs.writeFile(docsPath, markdown, 'utf-8');
  }
}
