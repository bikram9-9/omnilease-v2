// Metro config for Expo + pnpm monorepo.
// Tells Metro about the workspace root so it can resolve @omnilease/shared
// and @omnilease/supabase, and enables symlink resolution for pnpm's layout.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so edits to packages/* trigger HMR.
config.watchFolders = [workspaceRoot];

// Resolve modules from both the app's own node_modules AND the workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Required for pnpm's symlinked package layout.
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
