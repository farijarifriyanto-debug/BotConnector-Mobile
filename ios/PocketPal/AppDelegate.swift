import UIKit
import RNFBAppCheck
import FirebaseCore
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Firebase is optional for the BotConnector first release. It is only
    // initialized when a real production GoogleService-Info.plist is bundled.
    // CI placeholder configuration intentionally keeps upstream benchmark/PalsHub
    // Firebase integrations disabled instead of talking to a dummy project.
    if let configPath = Bundle.main.path(
      forResource: "GoogleService-Info",
      ofType: "plist"
    ),
      let config = NSDictionary(contentsOfFile: configPath),
      let projectID = config["PROJECT_ID"] as? String,
      !projectID.isEmpty,
      projectID != "botconnector-ci"
    {
      RNFBAppCheckModule.sharedInstance()
      FirebaseApp.configure()
    }

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "PocketPal",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // MARK: - Deep Linking Support

  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey : Any] = [:]
  ) -> Bool {
    // Handle deep links from Shortcuts
    if url.scheme == "botconnector" {
      NotificationCenter.default.post(
        name: NSNotification.Name("RCTOpenURLNotification"),
        object: nil,
        userInfo: ["url": url]
      )
      return true
    }

    // Handle other URL schemes (e.g., Google Sign-In)
    return false
  }

  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return false
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
