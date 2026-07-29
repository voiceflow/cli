import baseConfig from '@voiceflow/vitest-config/unit';
import { mergeConfig, type ViteUserConfig } from 'vitest/config';

export default mergeConfig<ViteUserConfig, ViteUserConfig>(baseConfig, {
  test: {
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 10000,
  },
});
