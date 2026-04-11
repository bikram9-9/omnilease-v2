// Default barrel — exports only platform-agnostic helpers. Web entry points
// live behind subpath exports (`./web-client`, `./web-server`). The native
// (React Native) client is constructed inside `apps/mobile` directly so this
// package never depends on Expo / React Native.
export * from './queries';
export * from './env';
