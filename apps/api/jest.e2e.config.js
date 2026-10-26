// E2E (*.e2e-spec.ts) against shibutz_test, plus integration tests (*.int-spec.ts)
// against real OSRM/VROOM that skip when those services are down. Run with --runInBand.
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'test',
  testRegex: '\\.(e2e|int)-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleNameMapper: { '^@shibutz/contracts$': '<rootDir>/../../../packages/contracts/src' },
  globalSetup: '<rootDir>/global-setup.ts',
};
