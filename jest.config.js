module.exports = {
  preset: 'jest-expo',
  clearMocks: true,
  testMatch: ['<rootDir>/tests/journeys/**/*.test.ts', '<rootDir>/tests/journeys/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/tests/journeys/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/lib/**/*.{ts,tsx}',
    'src/providers/**/*.{ts,tsx}',
    'src/app/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
  ],
};
