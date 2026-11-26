import { CHANGELOG_IDS, type ChangelogCatalog, type ChangelogEntry } from './entries.js'
import { changelogEn } from './labels.en.js'
import { changelogFr } from './labels.fr.js'

export * from './entries.js'
export { changelogEn } from './labels.en.js'
export { changelogFr } from './labels.fr.js'

/** Languages the changelog is written in — the product's two UI languages. */
export const CHANGELOG_LANGUAGES = ['fr', 'en'] as const
export type ChangelogLanguage = (typeof CHANGELOG_LANGUAGES)[number]

/** The label catalogues keyed by language — what the web feeds i18next with. */
export const changelogLocales: Record<ChangelogLanguage, ChangelogCatalog> = {
  fr: changelogFr,
  en: changelogEn,
}

/** `fr` for anything francophone (`fr`, `fr-BE`…), `en` otherwise. Mirrors the
 *  web's own language resolution so an email lands in the language the user
 *  actually reads the app in. */
export function resolveChangelogLanguage(value: string | null | undefined): ChangelogLanguage {
  const base = (value ?? '').trim().toLowerCase().split('-')[0]
  return base === 'fr' ? 'fr' : base === 'en' ? 'en' : 'fr'
}

/**
 * Resolve the catalogue into fully-labelled entries, newest first.
 *
 * An entry whose labels are missing is DROPPED rather than rendered with its
 * raw id: the changelog must never show (nor email) a placeholder. The FR/EN
 * parity test makes that branch unreachable in practice — it is the belt on top
 * of the braces.
 */
export function resolveChangelogEntries(language: ChangelogLanguage): ChangelogEntry[] {
  const catalog = changelogLocales[language]
  const resolved: ChangelogEntry[] = []
  for (const { id, itemCount } of CHANGELOG_IDS) {
    const labels = catalog.entries[id]
    if (!labels) continue
    const date = labels['date']
    const title = labels['title']
    if (!date || !title) continue
    const items: string[] = []
    for (let i = 1; i <= itemCount; i += 1) {
      const item = labels[`item${i}`]
      if (item) items.push(item)
    }
    resolved.push({ id, date, title, items })
  }
  return resolved
}

/**
 * The entries published SINCE `sinceId` (exclusive), newest first — the delta a
 * user who last heard about `sinceId` has not been told about yet.
 *
 * - `sinceId` is the newest entry → `[]` (nothing to say, so no email).
 * - `sinceId` is null/unknown (never marked, or an id retired from the
 *   catalogue) → `[]` too. Callers treat that as "seed the marker, send
 *   nothing": a brand-new reader must never be blasted with the whole history.
 */
export function changelogEntriesSince(language: ChangelogLanguage, sinceId: string | null): ChangelogEntry[] {
  if (!sinceId) return []
  const entries = resolveChangelogEntries(language)
  const index = entries.findIndex(entry => entry.id === sinceId)
  if (index < 0) return []
  return entries.slice(0, index)
}
