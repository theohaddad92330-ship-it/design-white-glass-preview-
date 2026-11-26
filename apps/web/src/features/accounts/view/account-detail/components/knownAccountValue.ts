import { resolveSignalSourceLink } from '@bellum/contracts'
import { offerTitleKey } from '@/lib/signal-dedupe'
import type { CrmPresence } from '@/features/crm/api'

/**
 * #2556 — « Ce que BellumAI ajoute à ce que tu sais », sur un compte que le CRM
 * branché connaît déjà (recette prod 07/10, Thales : « Déjà dans ton CRM » et
 * rien d'autre).
 *
 * Tiré UNIQUEMENT de données existantes, jamais inventé :
 *  · les signaux DATÉS postérieurs au dernier contact CRM (`lastActivityAt`) —
 *    sans cette date, pas de ligne ;
 *  · les contacts du dossier ABSENTS du CRM — seulement quand le CRM a rendu sa
 *    liste COMPLÈTE (`contacts.length === contactsCount`) : sur une liste
 *    tronquée, « absent » serait deviné, donc pas de ligne.
 * Une absence ne fait aucune ligne ; aucune ligne ⇒ aucun bloc (`null`).
 */
type ValueInput = {
  presence: CrmPresence | undefined | null
  contacts: ReadonlyArray<{ full_name?: string | null; email?: string | null }>
  signals: ReadonlyArray<{ signal: string; date: string; sourceUrl?: string | null; sourceKind?: string | null }>
  /** Recette 21/10 K3 — les intitulés déjà listés dans « Signaux de recrutement » : une offre n'y est pas répétée. */
  listedOfferTitles?: readonly string[]
}

type KnownAccountValue = {
  lastActivityAt: string | null
  newSignals: string[]
  /** #3925 — le lien des signaux cités qui en portent un (URL http(s) vérifiable) ; sans URL, aucune entrée. */
  newSignalSources: { url: string; sourceKind: string }[]
  contactsNotInCrm: { count: number; names: string[] } | null
}

const MAX_LISTED = 3
const normaliseName = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

export function buildKnownAccountValue({
  presence,
  contacts,
  signals,
  listedOfferTitles = [],
}: ValueInput): KnownAccountValue | null {
  if (!presence?.provider || !presence.matched) return null

  const listedOffers = new Set(listedOfferTitles.map(offerTitleKey))
  const since = presence.lastActivityAt ? Date.parse(presence.lastActivityAt) : Number.NaN
  const newItems = Number.isFinite(since)
    ? signals
        .map(signal => ({ ...signal, at: Date.parse(signal.date) }))
        .filter(item => Number.isFinite(item.at) && item.at > since && item.signal.trim())
        .filter(
          item => !(item.sourceKind?.trim().toLowerCase() === 'job' && listedOffers.has(offerTitleKey(item.signal))),
        )
        .sort((a, b) => b.at - a.at)
    : []
  const newSignals = newItems.map(item => item.signal)
  // #3925 — « Voir l'offre » / « Voir l'article » pour les signaux effectivement nommés (les trois premiers).
  const newSignalSources = newItems.slice(0, MAX_LISTED).flatMap(item => {
    const link = resolveSignalSourceLink({ url: item.sourceUrl, source_kind: item.sourceKind })
    return link.kind === 'link' ? [{ url: link.url, sourceKind: link.sourceKind }] : []
  })

  let contactsNotInCrm: KnownAccountValue['contactsNotInCrm'] = null
  if (presence.contacts.length === presence.contactsCount) {
    const crmNames = new Set(presence.contacts.map(c => normaliseName(c.name ?? '')).filter(Boolean))
    const crmEmails = new Set(presence.contacts.map(c => (c.email ?? '').trim().toLowerCase()).filter(Boolean))
    const absent = contacts.filter(contact => {
      const name = normaliseName(contact.full_name ?? '')
      if (!name) return false
      const email = (contact.email ?? '').trim().toLowerCase()
      return !crmNames.has(name) && !(email && crmEmails.has(email))
    })
    if (absent.length > 0) {
      contactsNotInCrm = {
        count: absent.length,
        names: absent.slice(0, MAX_LISTED).map(contact => (contact.full_name ?? '').trim()),
      }
    }
  }

  if (newSignals.length === 0 && !contactsNotInCrm) return null
  return { lastActivityAt: presence.lastActivityAt, newSignals, newSignalSources, contactsNotInCrm }
}
