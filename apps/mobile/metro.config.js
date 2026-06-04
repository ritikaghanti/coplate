// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo so changes in packages/shared hot-reload.
config.watchFolders = [monorepoRoot];

// 2. Let Metro resolve dependencies from both the app and the monorepo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// 3. Force a single copy of these packages to be resolved from the app's
//    own node_modules. This prevents the duplicate-dependency problem
//    (e.g. two expo-constants) that breaks the runtime in a monorepo.
config.resolver.disableHierarchicalLookup = true;

// The shared package's source uses explicit ".js" extensions in its relative
// imports (correct for Node ESM), but those files are actually ".ts". Tell
// Metro to resolve a ".js" relative import to the matching ".ts" source.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
