// Metro: also watch the pure modules shared with the Edge Functions (habits schedule, rates).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../supabase/functions/_shared')];

module.exports = config;
