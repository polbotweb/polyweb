import { DEFAULT_LIGHT_TOKENS, DEFAULT_DARK_TOKENS } from '@/lib/theme-tokens';

// Theme settings seed — default theme with full light/dark token maps.
export default [
  {
    name: "default",
    isActive: true,
    lightTokens: JSON.stringify(DEFAULT_LIGHT_TOKENS),
    darkTokens: JSON.stringify(DEFAULT_DARK_TOKENS),
    primaryColor: "oklch(0.880 0.200 68)",
    secondaryColor: "oklch(0.922 0.012 75)",
    accentColor: "oklch(0.962 0.008 78)",
    backgroundColor: "oklch(1 0 0)",
    foregroundColor: "oklch(0.148 0.018 75)",
    mutedColor: "oklch(0.962 0.008 78)",
    mutedForegroundColor: "oklch(0.400 0.016 75)",
    fontHeading: "system-ui, sans-serif",
    fontBody: "system-ui, sans-serif",
    borderRadius: "0.625rem",
  },
];
