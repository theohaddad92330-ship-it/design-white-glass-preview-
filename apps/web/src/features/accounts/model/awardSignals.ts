import { isSignalArchived, type RecentSignal, type RegistryAnnouncement } from '@bellum/contracts'

/** La source se nomme par sa NATURE, jamais par son jeu de données (même libellé que l'API, `award-signals.ts`). */
const AWARD_SOURCE_LABEL = 'Marchés publics attribués'

/**
 * #4286.1 (#3915.30) — les marchés publics attribués lus EN CONTINU pour le SIREN du compte
 * (`/accounts/:id/registry-announcements`, source `decp`) passent par LE lecteur de la veille
 * (`buildAccountWatchData`), comme les signaux CRM : la frise de la fiche les montre, datés, avec la
 * partie d'en face et le lien. Jusque-là ils n'étaient que sur la carte « Données publiques ».
 * Même règle que le flux du portefeuille (API `awardSignalItems`) : un marché sans objet ne dit rien,
 * un marché périmé ne justifie pas d'appeler, une autre source n'est pas un marché.
 */
export function awardSignalsForWatch(
  announcements: readonly RegistryAnnouncement[] | undefined,
  nowMs: number = Date.now(),
): RecentSignal[] {
  const out: RecentSignal[] = []
  for (const a of announcements ?? []) {
    if (a.source !== 'decp' || (a.kind !== 'award' && a.kind !== 'award_won')) continue
    const object = a.type?.trim()
    if (!object || isSignalArchived({ freshness: null, date: a.date }, nowMs)) continue
    const won = a.kind === 'award_won'
    const counterpart = a.counterpart?.trim()
    out.push({
      id: null,
      signal: `${won ? 'Marché remporté' : 'Marché attribué'} — ${object}${
        counterpart ? ` (${won ? 'acheteur' : 'titulaire'} : ${counterpart})` : ''
      }`,
      source: AWARD_SOURCE_LABEL,
      source_ref: null,
      url: a.url ?? null,
      source_kind: 'tender',
      type: 'tender',
      date: a.date,
      sales_implication: null,
      impact: null,
      freshness: 'current',
    })
  }
  return out
}
