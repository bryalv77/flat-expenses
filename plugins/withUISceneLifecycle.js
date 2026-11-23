// iOS 27 SDK (Xcode 27) aborts at launch unless the app adopts the UIScene life cycle
// ("UIScene life cycle is required for apps built with this SDK"). Expo ships ExpoAppSceneDelegate but its
// prebuild template does not use it yet, so: the AppDelegate stops creating the window / starting React Native
// (the scene delegate does it) and Info.plist declares the scene manifest.
// Drop this plugin once the Expo template adopts scenes itself.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const withAppDelegateScenes = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') throw new Error('withUISceneLifecycle: expected a Swift AppDelegate');
    let src = cfg.modResults.contents;
    if (!src.includes('SceneDelegate')) {
      const cls = /class AppDelegate: ExpoAppDelegate \{/;
      const start = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\n#endif\n/;
      if (!cls.test(src) || !start.test(src)) throw new Error('withUISceneLifecycle: unexpected AppDelegate template');
      src = src.replace(cls, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {').replace(start, '');
      src += `
// Added by plugins/withUISceneLifecycle.js: creates the window and starts React Native for each scene.
class SceneDelegate: ExpoAppSceneDelegate {}
`;
    }
    cfg.modResults.contents = src;
    return cfg;
  });

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return cfg;
  });

module.exports = (config) => withSceneManifest(withAppDelegateScenes(config));
