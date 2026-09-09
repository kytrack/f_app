const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql'); // Drizzle migration files

module.exports = withNativeWind(config, { input: './global.css' });
