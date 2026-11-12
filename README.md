# Android: setting a view's background drawable alpha from 1 to 254 makes its border disappear

![Build](https://github.com/YevheniiKotyrlo/rn-background-alpha-erases-border/workflows/Pre%20Merge%20Checks/badge.svg)

React Native 0.90.0-nightly-20261112-897cca827, from the [React Native reproducer template](https://github.com/react-native-community/reproducer-react-native). `App.tsx` renders three views with an 8 dp red border on a gray background. `MainActivity` sets `view.background.alpha = 128` on the second and the third, which it finds by their `nativeID` through `ReactFindViewUtil`; the third has blue top, right and bottom edges, so its border is drawn edge by edge.

## Steps

By hand, on an Android device:

1. Build and install the release APK: `cd ReproducerApp/android && ./gradlew assembleRelease && adb install -r app/build/outputs/apk/release/app-release.apk`.
2. Open the app. The second and the third view draw their gray background at half its alpha, and no red border.

Scripted: `./reproduce.sh`, with one Android device attached, builds and installs the app, waits for `MainActivity` to log the alpha it set, takes a screenshot and reads the middle of each view's left border edge. It exits 1 while a view at background alpha 128 draws its red border at another alpha than half, 0 once each draws it at half, and 2 when a step fails or the first view draws no opaque red border. The screenshot lands in `screenshots/`.
