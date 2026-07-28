import base from '@voiceflow/oxfmt-config';

export default {
  ...base,
  ignorePatterns: [
    ...base.ignorePatterns,
    '**/sonar/**',
    '**/openapi.json',
    '**/openapi.*.json',
    '**/.mikro-orm/**',
    '**/.snapshot-main.json',
    '**/templates/*.json',
  ],
};
