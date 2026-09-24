const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Allow bundling reader assets (epubjs fallback, fonts, offline dict seed)
config.resolver.assetExts.push('epub', 'pdf', 'mobi', 'azw3', 'cbz', 'cbr', 'fb2', 'ttf', 'otf', 'json');

module.exports = withNativeWind(config, { input: './global.css' });
