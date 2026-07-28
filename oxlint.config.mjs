import base from '@voiceflow/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
  ...base,

  ignorePatterns: [...base.ignorePatterns],

  overrides: [...base.overrides],
});
