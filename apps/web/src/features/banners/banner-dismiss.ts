const PREFIX = 'bellum:banner-dismissed:'

/**
 * A dismissal is keyed on `${id}:${version}`. Because the server bumps a
 * banner's `version` on every save, re-publishing an edited (or re-activated)
 * banner produces a new key, so a previously-dismissed banner reappears.
 */
function storageKey(id: string, version: number): string {
  return `${PREFIX}${id}:${version}`
}

export function isBannerDismissed(id: string, version: number): boolean {
  try {
    return window.localStorage.getItem(storageKey(id, version)) === '1'
  } catch {
    return false
  }
}

export function dismissBanner(id: string, version: number): void {
  try {
    window.localStorage.setItem(storageKey(id, version), '1')
  } catch {
    // ignore — a private-mode / quota failure just means the banner reappears
  }
}
