// The Sentry Expo plugin's "Upload Debug Symbols to Sentry" phase calls node without sourcing
// ios/.xcode.env (unlike the React Native phases): Xcode has no Homebrew PATH, so the build fails
// with "node: command not found". This plugin makes the phase source .xcode.env(.local) first.
// Listed BEFORE @sentry/react-native in app.json: Expo runs mods in reverse order.
const { withXcodeProject } = require('expo/config-plugins');

const PHASE = 'Upload Debug Symbols to Sentry';
const MARKER = '# daily-edge: xcode env';
const PREFIX = [
  MARKER,
  'if [ -f "$PODS_ROOT/../.xcode.env" ]; then . "$PODS_ROOT/../.xcode.env"; fi',
  'if [ -f "$PODS_ROOT/../.xcode.env.local" ]; then . "$PODS_ROOT/../.xcode.env.local"; fi',
  '',
].join('\n');

module.exports = function withSentryXcodeEnv(config) {
  return withXcodeProject(config, (config) => {
    const phase = config.modResults.pbxItemByComment(PHASE, 'PBXShellScriptBuildPhase');
    if (phase && typeof phase.shellScript === 'string') {
      const script = JSON.parse(phase.shellScript);
      if (!script.includes(MARKER)) phase.shellScript = JSON.stringify(PREFIX + script);
    }
    return config;
  });
};
