import { CHANGELOG_IDS, LATEST_CHANGELOG_ID, type ChangelogEntry } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * Static, in-repo changelog. This is the real source for the "Nouveautés"
 * sidebar indicator — no backend involved. Newest entry first; `id` doubles as
 * the "seen" marker persisted in localStorage.
 *
 * The catalogue itself (ids, item counts AND the FR/EN labels) now lives in
 * `@bellum/contracts` — the API emails those exact entries as the « Newsletter
 * Changelog » and must not read a file out of the web app. How to add an entry
 * is documented there: `packages/contracts/src/changelog/entries.ts`.
 *
 * What is left here is the binding to the running i18n instance: the labels are
 * registered as the `changelog` namespace (see `i18n/resources.ts`) and resolved
 * at call time, so the panel follows the active language.
 */
export { CHANGELOG_IDS, LATEST_CHANGELOG_ID }
export type { ChangelogEntry }

export function getChangelog(): ChangelogEntry[] {
  return CHANGELOG_IDS.map(({ id, itemCount }) => ({
    id,
    date: i18n.t(`changelog:entries.${id}.date`),
    title: i18n.t(`changelog:entries.${id}.title`),
    items: Array.from({ length: itemCount }, (_, i) => i18n.t(`changelog:entries.${id}.item${i + 1}`)),
  }))
}
