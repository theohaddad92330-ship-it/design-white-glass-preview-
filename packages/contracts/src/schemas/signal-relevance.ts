/**
 * #3923 (lot Y12, 08/10/2026) — pertinence d'un signal au contexte DÉCLARÉ de
 * l'espace : « un commercial IT n'a que faire d'un appel d'offres de
 * gestionnaire de charge ou d'un poste de professeur ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE NE FAIT PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Il ne classe JAMAIS un signal `hors_metier` sans preuve EXPLICITE déclarée
 * par l'utilisateur (`placedRoles`, `noGoSectors` — `esn_profiles.placed_roles`
 * / `.no_go_sectors`). Deviner une taxonomie métier à partir du seul texte
 * d'un signal serait inventer un classement — exactement ce que la doctrine
 * du dépôt refuse (« aucune probabilité », « non mesuré n'est jamais 0 »).
 * Sans comparaison possible, le verdict est `non_evaluable`, jamais
 * `pertinent` par défaut (ce serait prétendre une évaluation qui n'a pas eu
 * lieu) ni `hors_metier` par défaut (ce serait pénaliser un compte sur une
 * absence d'information, le défaut que #3901/#3906/#3819 décrivent déjà).
 *
 * `placedRoles` (`esn_profiles.placed_roles`) — ce module en est le premier
 * lecteur réel, sur une colonne déjà déclarative, jamais une nouvelle collecte.
 * Transportée jusqu'au web depuis #3923.a (`esnAnswersSchema`, `GET
 * /onboarding/state` → `Discover.tsx` → `relevanceProfileFromAnswers`).
 *
 * ⚠️ Un jeu d'étalonnage de 30 signaux annotés à la main, avec un seuil de
 * précision fixé AVANT mesure (critère de l'issue), exige une annotation
 * humaine que ce module ne peut pas fabriquer — inventer les 30 lignes
 * serait exactement la donnée fictive que la doctrine interdit. Nommé dans
 * le commentaire de l'issue, pas construit ici.
 */

export const SIGNAL_RELEVANCE_STATUSES = ['pertinent', 'hors_metier', 'non_evaluable'] as const
export type SignalRelevanceStatus = (typeof SIGNAL_RELEVANCE_STATUSES)[number]

export type SignalRelevanceVerdict = {
  status: SignalRelevanceStatus
  reasonFr: string
  reasonEn: string
}

export type SignalRelevanceInput = {
  /** Mêmes natures que `discoverSignalTypeSchema` (discover.ts) — `ecosystem` depuis #4734. */
  type: 'tender' | 'award' | 'hiring' | 'legal' | 'tech' | 'business' | 'funding' | 'ecosystem'
  label: string
}

export type SalesProfileForRelevance = {
  /** `esn_profiles.placed_roles` — les métiers que l'espace place RÉELLEMENT. */
  placedRoles: readonly string[]
  /** `esn_profiles.no_go_sectors` — les secteurs EXPLICITEMENT refusés. */
  noGoSectors: readonly string[]
  /**
   * #1124.1 — `esn_profiles` : l'espace place aussi des profils EN CDI chez ses clients.
   * Décision Louis 14/10/2026 : elle GAGNE sur la note du 09/10 (#3901.w, domaine = métiers
   * placés) — toute ouverture de poste est alors une piste, aucune offre n'est « hors métier ».
   */
  recruitsForClients?: boolean
  /**
   * #3901.p — métiers DÉDUITS (lot du 11/10, `esn_profiles.inferred_placed_roles`) : lus par Découvrir
   * (`hiringScopeVerdict`) quand rien n'est déclaré. `signalRelevance` ne les lit pas.
   */
  inferredPlacedRoles?: readonly { role: string; terms: readonly string[] }[]
}

/** Normalise pour une comparaison insensible à la casse et aux accents —
 *  « DÉVELOPPEUR » et « developpeur » désignent le même métier déclaré. */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function containsToken(haystack: string, needle: string): boolean {
  const n = normalize(needle)
  return n.length > 0 && normalize(haystack).includes(n)
}

/**
 * #3901.w (décision Louis 09/10/2026) — le DOMAINE d'un recrutement est le métier
 * placé DÉCLARÉ qu'il recoupe (`esn_profiles.placed_roles`) : une ESN cyber voit
 * « Recrutement cybersécurité », une ESN industrie « Recrutement HSE ». Aucune
 * liste de secteurs inventée ici : la même comparaison que `signalRelevance`.
 * `null` = pas un recrutement, profil muet ou aucun recoupement (jamais deviné).
 */
export function hiringDomain(signal: SignalRelevanceInput, profile: SalesProfileForRelevance): string | null {
  if (signal.type !== 'hiring') return null
  return profile.placedRoles.find(role => containsToken(signal.label, role)) ?? null
}

/** Remplace l'étiquette de genre fixe (« Recrutement » / « Recrutement IT ») par le domaine déclaré. */
export function hiringDomainLabel(label: string, domain: string): string {
  // #3901.w (recette 10/10) — « Poste ouvert » / « Offre publiée » (veille du compte, /mes-cibles)
  // sont des genres de recrutement : ils nomment eux aussi le métier placé, l'intitulé vient après.
  const match = /^(?:Recrutement(?: IT)?|Poste ouvert|Offre publiée)(?=\s|:|$)/i.exec(label)
  return match ? `Recrutement ${domain}${label.slice(match[0].length)}` : label
}

/**
 * Calcule la pertinence d'UN signal contre le profil DÉCLARÉ de l'espace.
 *
 * - `hiring` : comparé à `placedRoles`. Sans aucun métier placé déclaré,
 *   `non_evaluable` — y compris si des `noGoSectors` existent par ailleurs
 *   (un no-go sectoriel ne dit rien d'un métier).
 * - `tender` / `award` / `legal` / `tech` / `business` : comparé à
 *   `noGoSectors` seulement. Un signal qui ne recoupe aucun no-go reste
 *   `non_evaluable` — l'absence de preuve n'est jamais une preuve négative.
 */
export function signalRelevance(
  signal: SignalRelevanceInput,
  profile: SalesProfileForRelevance,
): SignalRelevanceVerdict {
  if (signal.type === 'hiring') {
    // #1124.1 — renversement daté (Louis 14/10/2026) : le placement en CDI fait de toute offre une piste.
    if (profile.recruitsForClients === true) {
      return {
        status: 'pertinent',
        reasonFr:
          'Pertinent — l’espace place aussi des profils en CDI chez ses clients : toute ouverture de poste est une piste.',
        reasonEn: 'Relevant — the workspace also places permanent hires at its clients: every opening is a lead.',
      }
    }
    const placedRoles = profile.placedRoles.filter(role => role.trim().length > 0)
    if (placedRoles.length === 0) {
      return {
        status: 'non_evaluable',
        reasonFr: 'Pertinence non évaluable — aucun métier placé n’est déclaré dans le profil de l’espace.',
        reasonEn: 'Relevance not evaluable — the workspace profile declares no placed role.',
      }
    }
    const matched = placedRoles.find(role => containsToken(signal.label, role))
    if (matched) {
      return {
        status: 'pertinent',
        reasonFr: `Pertinent — recoupe le métier placé « ${matched} ».`,
        reasonEn: `Relevant — matches the placed role "${matched}".`,
      }
    }
    return {
      status: 'hors_metier',
      reasonFr: `Hors métier — ne recoupe aucun des métiers placés déclarés (${placedRoles.join(', ')}).`,
      reasonEn: `Off-trade — matches none of the declared placed roles (${placedRoles.join(', ')}).`,
    }
  }

  const noGoSectors = profile.noGoSectors.filter(sector => sector.trim().length > 0)
  const matchedNoGo = noGoSectors.find(sector => containsToken(signal.label, sector))
  if (matchedNoGo) {
    return {
      status: 'hors_metier',
      reasonFr: `Hors métier — recoupe le secteur explicitement refusé « ${matchedNoGo} ».`,
      reasonEn: `Off-trade — matches the explicitly refused sector "${matchedNoGo}".`,
    }
  }
  return {
    status: 'non_evaluable',
    reasonFr: 'Pertinence non évaluable — aucun secteur refusé déclaré ne permet de trancher.',
    reasonEn: 'Relevance not evaluable — no declared refused sector allows a verdict.',
  }
}
