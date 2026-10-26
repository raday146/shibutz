// Unit tests: pure code, no I/O. Files: src/**/*.spec.ts
/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testRegex: '\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleNameMapper: { '^@shibutz/contracts$': '<rootDir>/../../../packages/contracts/src' },
};
