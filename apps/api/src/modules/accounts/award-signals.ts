import { isSignalArchived, type AccountSignalItem, type RegistryAnnouncement } from '@bellum/contracts'

/** Ce qu'un signal du portefeuille dit du compte qui le porte. */
type AwardSignalAccount = {
  id: string
  company_name: string
  sector: string | null
  priority_score: number | null
  created_at: string
  logo_url?: string | null
  website?: string | null
  signals_collected_at?: string | null
}

/** La source se nomme par sa NATURE (doctrine 12/10/2026), jamais par son jeu de données. */
const AWARD_SOURCE_LABEL = 'Marchés publics attribués'

/**
 * #3915.decp (décision Louis 16/10/2026) — les marchés publics attribués lus EN
 * CONTINU pour le SIREN du compte (`public_registry_announcements`, source `decp`)
 * deviennent des signaux datés du compte, à côté de `recent_signals` : la Veille
 * et Laura (`get_account_signals`) les lisent par la même liste, sans second moteur.
 *
 * Un marché sans objet ne dit rien ; un marché périmé (`isSignalArchived`) ne
 * justifie pas d'appeler aujourd'hui ; une autre source n'est pas un marché.
 * La partie d'en face n'est nommée que si le registre l'a résolue.
 */
export function awardSignalItems(
  account: AwardSignalAccount,
  announcements: readonly RegistryAnnouncement[],
  nowMs: number = Date.now(),
): AccountSignalItem[] {
  const items: AccountSignalItem[] = []
  for (const a of announcements) {
    if (a.source !== 'decp' || (a.kind !== 'award' && a.kind !== 'award_won')) continue
    const object = a.type?.trim()
    if (!object || isSignalArchived({ freshness: null, date: a.date }, nowMs)) continue
    const won = a.kind === 'award_won'
    const counterpart = a.counterpart?.trim()
    const who = counterpart ? ` (${won ? 'acheteur' : 'titulaire'} : ${counterpart})` : ''
    items.push({
      id: `${account.id}-award-${items.length}-${a.date}`,
      account_id: account.id,
      account_created_at: account.created_at,
      account_score: account.priority_score,
      company_name: account.company_name,
      date: a.date,
      label: `${won ? 'Marché remporté' : 'Marché attribué'} — ${object}${who}`,
      sector: account.sector,
      source: AWARD_SOURCE_LABEL,
      source_url: a.url ?? null,
      source_kind: 'tender',
      type: 'tender',
      logo_url: account.logo_url ?? null,
      website: account.website ?? null,
      signals_collected_at: account.signals_collected_at ?? null,
    })
  }
  return items
}
