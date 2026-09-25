/**
 * Dynamic bits on top of app.json.
 *
 * The installed APK / TestFlight builds use the `appVersion` runtime policy. Expo Go can only
 * load updates whose runtime version is its own SDK version, so the "friends" channel (iPhone
 * users running the app inside Expo Go, see docs/PHONE.md) publishes with the `sdkVersion`
 * policy instead. Selected by the LIFEOS_EXPO_GO env var – scripts/friends-update.js sets it.
 */
module.exports = ({ config }) => ({
  ...config,
  runtimeVersion: process.env.LIFEOS_EXPO_GO ? { policy: 'sdkVersion' } : config.runtimeVersion,
});
