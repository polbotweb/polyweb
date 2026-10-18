// Shared type aliases derived from the auth configuration.
// These keep component Props in sync with the BetterAuth schema
// without importing the heavy auth module directly.

/** Authenticated user object (from BetterAuth session). */
export type AppUser = NonNullable<App.Locals['user']>;

/** Authenticated session object. */
export type AppSession = NonNullable<App.Locals['session']>;
