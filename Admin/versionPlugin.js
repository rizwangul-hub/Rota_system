import fs from 'fs';
import path from 'path';

export default function versionPlugin(options = {}) {
  const version = options.version || '2.5.0';
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA || `build-${Date.now().toString(36)}`;
  const buildTime = new Date().toISOString();

  return {
    name: 'version-plugin',
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(version),
          __APP_BUILD_ID__: JSON.stringify(buildId),
          __APP_BUILD_TIME__: JSON.stringify(buildTime)
        }
      };
    },
    buildStart() {
      try {
        const publicDir = path.resolve(process.cwd(), 'public');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        const versionData = {
          version,
          buildId,
          buildTime,
          type: 'normal',
          title: '🚀 System Update Available!',
          message: 'We have improved the system with new features, enhancements, and bug fixes.\n\nPlease refresh the system to experience the latest improvements.'
        };
        fs.writeFileSync(
          path.join(publicDir, 'version.json'),
          JSON.stringify(versionData, null, 2),
          'utf8'
        );
      } catch (err) {
        console.warn('Could not write version.json:', err);
      }
    }
  };
}
