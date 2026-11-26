import { useReadPreferences, type NameDisplay } from './preferences-provider'

/**
 * Format a person's display name per the user's `nameDisplay` preference.
 *
 *  - `full`     → the name unchanged.
 *  - `first`    → the first token only ("Jean Dupont" → "Jean").
 *  - `initials` → the initials of the first + last tokens ("Jean Dupont" → "JD").
 *
 * Present-only: an empty or single-token name degrades gracefully (never invents
 * a surname). Meant for actual person names — callers pass real names only, not
 * role placeholders.
 */
export function formatName(name: string, mode: NameDisplay): string {
  const trimmed = name.trim()
  if (!trimmed || mode === 'full') return trimmed

  const tokens = trimmed.split(/\s+/).filter(Boolean)
  if (mode === 'first') return tokens[0] ?? trimmed

  // initials
  if (tokens.length === 1) return (tokens[0]?.[0] ?? '').toUpperCase()
  const first = tokens[0]?.[0] ?? ''
  const last = tokens[tokens.length - 1]?.[0] ?? ''
  return `${first}${last}`.toUpperCase()
}

/** Hook returning a formatter bound to the active `nameDisplay` preference.
 *  Tolerates a missing provider (degrades to `full`) so it can be dropped into
 *  widely-reused rows rendered in isolation. */
export function useFormatName(): (name: string) => string {
  const preferences = useReadPreferences()
  return (name: string) => formatName(name, preferences.nameDisplay)
}
