// Sentry's Xcode phases, made to work on a plain Mac (Xcode archive) as well as on EAS:
// 1. "Upload Debug Symbols to Sentry" calls node without sourcing ios/.xcode.env (unlike the React
//    Native phases): Xcode has no Homebrew PATH, so the build fails with "node: command not
//    found". The phase now sources .xcode.env(.local) first.
// 2. Without SENTRY_AUTH_TOKEN, both uploads (source maps, debug symbols) are skipped instead of
//    failing the build ("An organization ID or slug is required"). ios/.xcode.env.local is
//    rewritten by every prebuild, so this cannot rely on it.
// Listed BEFORE @sentry/react-native in app.json: Expo runs mods in reverse order.
const { withXcodeProject } = require('expo/config-plugins');

const DEBUG_FILES_PHASE = 'Upload Debug Symbols to Sentry';
const ENV_MARKER = '# daily-edge: xcode env';
const ENV_PREFIX = [
  ENV_MARKER,
  'if [ -f "$PODS_ROOT/../.xcode.env" ]; then . "$PODS_ROOT/../.xcode.env"; fi',
  'if [ -f "$PODS_ROOT/../.xcode.env.local" ]; then . "$PODS_ROOT/../.xcode.env.local"; fi',
  '',
].join('\n');

const UPLOAD_MARKER = '# daily-edge: sentry upload only with a token';
const UPLOAD_GUARD = [
  UPLOAD_MARKER,
  'if [ -z "$SENTRY_AUTH_TOKEN" ]; then export SENTRY_DISABLE_AUTO_UPLOAD=true; fi',
  '',
].join('\n');
// Both Sentry phases end by running Sentry's script through /bin/sh
const CALL = '/bin/sh "`';

function guardUploads(script) {
  if (!script.includes('sentry-xcode') || script.includes(UPLOAD_MARKER)) return script;
  const at = script.lastIndexOf(CALL);
  return at < 0 ? script : script.slice(0, at) + UPLOAD_GUARD + script.slice(at);
}

module.exports = function withSentryXcodeEnv(config) {
  return withXcodeProject(config, (config) => {
    const phases = config.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const [key, phase] of Object.entries(phases)) {
      if (key.endsWith('_comment') || typeof phase.shellScript !== 'string') continue;
      // Only Sentry's phases; other scripts may not be JSON-compatible strings
      if (!phase.shellScript.includes('sentry')) continue;
      let script = JSON.parse(phase.shellScript);
      if (phases[`${key}_comment`] === DEBUG_FILES_PHASE && !script.includes(ENV_MARKER)) {
        script = ENV_PREFIX + script;
      }
      phase.shellScript = JSON.stringify(guardUploads(script));
    }
    return config;
  });
};
