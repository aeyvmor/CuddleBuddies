// Keep Metro inside apps/mobile. The repo root is an npm workspace (web/backend)
// with its own node_modules, including a different React version; the spike must
// not resolve packages from there. Nested node_modules inside apps/mobile still
// resolve normally.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repoNodeModules = path.resolve(projectRoot, "..", "..", "node_modules");
const config = getDefaultConfig(projectRoot);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

config.watchFolders = [projectRoot];
config.resolver.nodeModulesPaths = [path.join(projectRoot, "node_modules")];
config.resolver.blockList = [new RegExp(`^${escape(repoNodeModules)}[\\\\/].*`)];

module.exports = config;
