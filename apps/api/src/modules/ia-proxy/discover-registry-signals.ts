import { isSignalArchived, type DiscoverResponse, type RegistryAnnouncement } from '@bellum/contracts'

type DiscoverSignal = DiscoverResponse['candidates'][number]['signals'][number]

const SOURCE_LABEL: Readonly<Record<RegistryAnnouncement['source'], string>> = {
  bodacc: 'BODACC',
  sirene: 'Registre officiel des entreprises (Sirene)',
  // #3915.decp — une source publique se dit par sa NATURE (doctrine 12/10), jamais « DECP ».
  decp: 'Marchés publics attribués',
  // #3921.11 — idem : le registre national se dit par sa nature (dirigeant, établissements).
  rne: 'Registre national des entreprises',
}

/**
 * #3915.decp — un marché public attribué lu en continu devient un signal `award`
 * daté, comme ceux que le moteur trouve lui-même. La partie d'en face n'est
 * nommée que si le registre l'a résolue ; sinon la ligne dit seulement le rôle.
 */
function toAwardSignal(announcement: RegistryAnnouncement): DiscoverSignal {
  const won = announcement.kind === 'award_won'
  const counterpart = announcement.counterpart?.trim()
  const role = won
    ? counterpart
      ? `Remporté auprès de ${counterpart}`
      : 'Marché remporté'
    : counterpart
      ? `Titulaire : ${counterpart}`
      : null
  return {
    type: 'award',
    label: announcement.type?.trim() || (won ? 'Marché remporté' : 'Marché attribué'),
    date: announcement.date,
    ...(announcement.url ? { url: announcement.url } : {}),
    detail: [SOURCE_LABEL.decp, role].filter(Boolean).join(' · '),
  }
}

/**
 * #3916.b — une annonce de registre public devient un signal « pourquoi
 * maintenant » de Découvrir (`legal`, que l'écran ne compte jamais comme un
 * signal commercial — `discover-known-signals.ts`). Une procédure collective
 * le DIT dans son libellé : c'est un risque pour l'ESN, pas une opportunité.
 */
function toDiscoverSignal(announcement: RegistryAnnouncement): DiscoverSignal {
  if (announcement.source === 'decp') return toAwardSignal(announcement)
  const base =
    announcement.type?.trim() || (announcement.kind === 'new_establishment' ? 'Nouvel établissement' : 'Annonce légale')
  return {
    type: 'legal',
    label: announcement.kind === 'collective_proceeding' ? `${base} — risque, pas une opportunité` : base,
    date: announcement.date,
    ...(announcement.url ? { url: announcement.url } : {}),
    detail: SOURCE_LABEL[announcement.source],
  }
}

/**
 * #3916.b — ajoute aux candidats de Découvrir les annonces de registre lues EN
 * CONTINU pour leur SIREN (table partagée `public_registry_announcements`).
 * Rien n'est appelé ici : seules les annonces déjà collectées (comptes suivis)
 * sont connues — un prospect jamais suivi n'en a pas, et rien n'est inventé.
 * Une annonce périmée (`isSignalArchived`) ne justifie pas d'appeler
 * aujourd'hui ; une annonce déjà portée par le moteur (même lien) n'est pas doublée.
 */
export function withRegistrySignals(
  response: DiscoverResponse,
  bySiren: ReadonlyMap<string, readonly RegistryAnnouncement[]>,
  now: Date = new Date(),
): DiscoverResponse {
  if (bySiren.size === 0) return response
  const nowMs = now.getTime()
  return {
    ...response,
    candidates: (response.candidates ?? []).map(candidate => {
      const known = bySiren.get(candidate.siren) ?? []
      const fresh = known.filter(a => !isSignalArchived({ freshness: null, date: a.date }, nowMs))
      if (fresh.length === 0) return candidate
      const urls = new Set(candidate.signals.map(s => s.url).filter(Boolean))
      const added = fresh.filter(a => !a.url || !urls.has(a.url)).map(toDiscoverSignal)
      return added.length > 0 ? { ...candidate, signals: [...candidate.signals, ...added] } : candidate
    }),
  }
}
