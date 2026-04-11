import { config } from 'dotenv';
import path from 'path';

// Load test-local env before any module (including @omnilease/db) is evaluated.
// This must run in a setupFile (not inline in the test) because ES module
// imports are hoisted — inline loadEnv() calls run AFTER the imported module
// code, which means DATABASE_URL would still be undefined when db/src/index.ts
// executes its guard check.
config({ path: path.resolve(__dirname, '.env.test.local') });
