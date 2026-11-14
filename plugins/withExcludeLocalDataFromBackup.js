// Excludes local-mode data from iCloud backup (iOS). Android is handled by android.allowBackup=false in app.json.
// Marks Documents/SQLite (expo-sqlite default dir) and Documents/files (fileStore.local.native.ts) isExcludedFromBackup
// on every launch; the flag covers files created inside later.
const { withAppDelegate } = require('expo/config-plugins');

const MARKER = 'excludeLocalDataFromBackup';
const FN = `
// Added by plugins/withExcludeLocalDataFromBackup.js
private func ${MARKER}() {
  guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
  for name in ["SQLite", "files"] {
    var url = docs.appendingPathComponent(name, isDirectory: true)
    try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? url.setResourceValues(values)
  }
}
`;

module.exports = (config) =>
  withAppDelegate(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (cfg.modResults.language !== 'swift') throw new Error('withExcludeLocalDataFromBackup: expected a Swift AppDelegate');
    if (!src.includes(`${MARKER}()`)) {
      const re = /(func application\(\s*_ application: UIApplication,\s*didFinishLaunchingWithOptions[^{]*\{\n)/;
      if (!re.test(src)) throw new Error('withExcludeLocalDataFromBackup: didFinishLaunching not found in AppDelegate');
      src = src.replace(re, `$1    ${MARKER}()\n`) + FN;
    }
    cfg.modResults.contents = src;
    return cfg;
  });
