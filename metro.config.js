const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql'); // Drizzle migration files
config.resolver.assetExts.push('wasm'); // expo-sqlite on web

// expo-sqlite web (alpha) needs SharedArrayBuffer → COOP/COEP headers on the dev server.
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return middleware(req, res, next);
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
