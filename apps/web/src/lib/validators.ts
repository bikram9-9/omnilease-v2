// Re-export shim — the canonical validators now live in @omnilease/shared so
// the Expo mobile app can use them too. Existing `@/lib/validators` imports
// keep working unchanged.
export * from '@omnilease/shared';
