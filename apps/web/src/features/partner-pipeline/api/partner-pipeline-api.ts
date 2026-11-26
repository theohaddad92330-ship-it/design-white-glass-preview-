import type {
  EsnRank2ObservationSummary,
  PartnerGovernanceFields,
  PartnerGovernanceReadiness,
  PartnerGovernanceStatus,
  PartnerCvPush,
  PartnerCvPushOutcome,
  PartnerRelationScore,
  PartnerRole,
  PartnerScoreAxis,
  PartnerStage,
  UpdatePartnerGovernance,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export interface PartnerRelationView {
  id: string
  siren: string | null
  name: string
  stage: PartnerStage
  roles: string[]
  contactName: string | null
  notes: string | null
  needsReceived90d: number
  needsGiven90d: number
  placementsActive: number
  placementsTotal: number
  lastActivityAt: string | null
  /** La clause de non-sollicitation TELLE QU'ELLE A ÉTÉ DÉCLARÉE. `null` =
   *  personne ne l'a déclarée — ce qui n'est pas « il n'y en a pas ». */
  nonSolicitation: boolean | null
  score: PartnerRelationScore
  /** Les axes qu'aucune source ne peut nourrir, et pourquoi. À distinguer de
   *  `score.unmeasured`, qui dit « pas mesuré » sans dire s'il sert d'attendre. */
  notCollected: { axis: PartnerScoreAxis; why: string }[]
  /** #3270 — le cadre de gouvernance rang 2, tel que déclaré. */
  governance: PartnerGovernanceFields
  /** #3270 — PARTNER READINESS : cadré / manquant / risque / prochaine validation. */
  governanceReadiness: PartnerGovernanceReadiness
  /** #3270 — STATUTS PARTENAIRE, dérivé côté serveur. */
  governanceStatus: PartnerGovernanceStatus
  pausedAt: string | null
  pausedReason: string | null
  blockedAt: string | null
  blockedReason: string | null
}

interface EsnOnMyAccounts {
  name: string
  accounts: number
  rank1: number
  /**
   * #2151.34 — combien de comptes de l'espace tiennent cette ESN en rang 2 :
   * une ouverture à formaliser, jamais fondue dans `rank1`. Optionnel pour la
   * même raison que `certainty` ci-dessous — une réponse d'avant ce lot ne le
   * porte pas, et l'écran retombe alors sur « aucune ouverture connue »,
   * jamais sur une valeur devinée.
   */
  rank2?: number
  /**
   * #2151.33 — combien de comptes portent une relation CONNUE (`partner` ou
   * `competitor`, jamais `unknown`) pour cette ESN. Même repli optionnel.
   */
  knownRelationship?: number
  /**
   * #1799 — la certitude de la détection, sortie du nom (« Capgemini — probable »
   * devient le nom « Capgemini » + cette certitude). `null` quand aucune ligne
   * du groupe ne la porte — jamais devinée. Optionnel : une API antérieure à ce
   * lot ne le rend pas du tout (fenêtre de déploiement Vercel/Railway), et
   * l'écran doit se replier proprement dessus.
   */
  certainty?: 'forte' | 'moyenne' | 'faible' | null
  /**
   * #2151.62 — les comptes eux-mêmes, pas seulement leur nombre : un seul
   * chemin de lecture (GA-26) avec la fiche compte. Optionnel pour la même
   * raison que `certainty` — une réponse d'avant ce lot ne le porte pas.
   */
  accountsList?: { id: string; name: string }[]
  /**
   * #2151.32 — combien de comptes de l'espace où la mémoire marché a OBSERVÉ
   * cette ESN (parcours de personnes, pas une présence déclarée/détectée).
   * Optionnel pour la même raison que `certainty`/`rank2` — une réponse
   * d'avant ce lot ne le porte pas, et l'écran retombe sur « aucune
   * observation connue », jamais sur une valeur devinée.
   */
  observedAtAccounts?: number
  /**
   * #2151.32 — combien de comptes, PARMI ceux qui portent cette ESN, n'ont pas
   * pu être résolus par la mémoire marché — « inconnu », jamais compté comme
   * « non observé » (doctrine c65, GA-259). Même repli optionnel.
   */
  unresolvedAtAccounts?: number
  /**
   * #2298.8 — rank2Potential : un CONSTAT « déjà vue en rang 2 », datable et
   * sourçable — jamais un score (décision Louis 18/09/2026). Distinct de
   * `rank2` ci-dessus (un simple compte) : celui-ci porte la DATE de la
   * dernière observation, et `measured: false` plutôt qu'un compte à zéro
   * quand rien n'est daté (GA-18/GA-19). Optionnel pour la même raison que
   * `rank2`/`certainty` — une réponse d'avant ce lot ne le porte pas.
   */
  rank2Observations?: EsnRank2ObservationSummary
}

/**
 * #1798 — une ESN du référentiel dont le SIÈGE tombe dans une zone du profil.
 *
 * Un LISTING, pas un score : `esn_directory` ne connaît ni secteur ni
 * expertise d'une ESN, seulement son siège et sa position de sous-traitance —
 * un score construit sur les axes qui manquent serait inventé. Voir
 * `apps/api/src/modules/partner-pipeline/partner-pipeline.service.ts`.
 */
interface ProfileMatchEsn {
  name: string
  city: string | null
  department: string | null
  sizeClass: string | null
  /** Agrégat ANONYME inter-espaces promu sur le référentiel partagé — jamais
   *  la déclaration d'un espace précis. `'inconnu'` = personne ne l'a déclaré. */
  openToSubcontracting: string
}

/**
 * `no_geo_signal` distingue deux causes qui n'appellent pas le même geste :
 * `unset` (compléter le profil) et `unmappable` (des zones existent, mais
 * aucune ne désigne un territoire précis — remote, national, international).
 */
interface ProfileMatchResult {
  status: 'matched' | 'no_geo_signal'
  reason: 'unset' | 'unmappable' | null
  geoZones: string[]
  matches: ProfileMatchEsn[]
}

export const PARTNER_PIPELINE_KEY = ['partners', 'pipeline'] as const
export const PARTNER_ON_ACCOUNTS_KEY = ['partners', 'on-my-accounts'] as const
/** #1798 — la clé de cache PORTE les zones déjà lues du profil (triées, donc
 *  stables même si l'utilisateur les recoche dans un autre ordre) : la même
 *  liste de zones réutilise le cache, une liste qui a CHANGÉ en sort — c'est
 *  ce qui évite de recalculer à chaque ouverture d'onglet sans jamais servir
 *  une réponse née d'un profil différent. Voir `PartnerPipeline.tsx`. */
export const partnerProfileMatchesKey = (geoZones: readonly string[]) =>
  ['partners', 'profile-matches', [...geoZones].sort()] as const

export async function fetchPartnerRelations(): Promise<PartnerRelationView[]> {
  return apiFetch<PartnerRelationView[]>({ path: '/partners' })
}

export async function fetchEsnOnMyAccounts(): Promise<EsnOnMyAccounts[]> {
  return apiFetch<EsnOnMyAccounts[]>({ path: '/partners/on-my-accounts' })
}

export async function fetchPartnerProfileMatches(): Promise<ProfileMatchResult> {
  return apiFetch<ProfileMatchResult>({ path: '/partners/profile-matches' })
}

/**
 * DÉCLARER une relation partenaire.
 *
 * `POST /partners` existait depuis le tome 4, gardé par `records:write` et
 * testé côté service — et aucun écran ne l'appelait (Louis, 01/09/2026). La
 * liste ne se remplissait donc que de ce que l'analyse détectait, sur un écran
 * qui dit « un partenaire, c'est une ESN à qui tu confies des besoins ».
 */
export async function createPartnerRelation(input: {
  name: string
  roles?: PartnerRole[]
  stage?: PartnerStage
}): Promise<PartnerRelationView> {
  return apiFetch<PartnerRelationView>({ path: '/partners', method: 'POST', body: input })
}

export async function setPartnerStage(id: string, stage: PartnerStage): Promise<PartnerRelationView> {
  return apiFetch<PartnerRelationView>({ path: `/partners/${id}/stage`, method: 'PATCH', body: { stage } })
}

/**
 * Déclarer — ou retirer — la clause de non-sollicitation du cadre.
 *
 * `null` est une valeur À PART ENTIÈRE et non une omission : elle remet la
 * relation dans son état honnête, « personne ne l'a déclarée ». C'est ce geste
 * qui arme la première des deux gardes dures du score partenaire ; sans lui,
 * le refus resterait ce qu'il était — écrit, testé, et jamais déclenché.
 */
export async function setPartnerNonSolicitation(
  id: string,
  nonSolicitation: boolean | null,
): Promise<PartnerRelationView> {
  return apiFetch<PartnerRelationView>({
    path: `/partners/${id}/non-solicitation`,
    method: 'PATCH',
    body: { nonSolicitation },
  })
}

/**
 * #3270 (BEL-SC-241) — LE CADRE DE GOUVERNANCE RANG 2, un formulaire
 * générique (doctrine c75) : poser n'importe lequel des dix-sept champs, ou
 * poser/lever une pause ou un blocage via `pausedReason`/`blockedReason`.
 */
export async function updatePartnerGovernance(
  id: string,
  patch: UpdatePartnerGovernance,
): Promise<PartnerRelationView> {
  return apiFetch<PartnerRelationView>({ path: `/partners/${id}/governance`, method: 'PATCH', body: patch })
}

/**
 * #2887 (#2371.8) — la revue d'un CV poussé à ce partenaire. Une clé PAR
 * partenaire (jamais une liste globale) : c'est la question posée par la
 * carte de CE partenaire, jamais « tous les pushes de l'espace ».
 */
export const partnerCvPushesKey = (partnerId: string) => ['partners', partnerId, 'cv-pushes'] as const

export async function fetchPartnerCvPushes(partnerId: string): Promise<PartnerCvPush[]> {
  return apiFetch<PartnerCvPush[]>({ path: `/partners/${partnerId}/cv-pushes` })
}

/** PRÉPARE la revue — jamais un envoi (Laura prépare, le commercial envoie). */
export async function preparePartnerCvPush(partnerId: string, consultantId: string): Promise<PartnerCvPush> {
  return apiFetch<PartnerCvPush>({
    path: `/partners/${partnerId}/cv-pushes`,
    method: 'POST',
    body: { consultantId },
  })
}

/** DÉCLARE le push envoyé — un geste du commercial, jamais une preuve technique. */
export async function declarePartnerCvPushSent(partnerId: string, pushId: string): Promise<PartnerCvPush> {
  return apiFetch<PartnerCvPush>({ path: `/partners/${partnerId}/cv-pushes/${pushId}/declare-sent`, method: 'PATCH' })
}

/** Le retour du partenaire — saisi par un humain, jamais deviné. */
export async function recordPartnerCvPushOutcome(
  partnerId: string,
  pushId: string,
  outcome: PartnerCvPushOutcome,
): Promise<PartnerCvPush> {
  return apiFetch<PartnerCvPush>({
    path: `/partners/${partnerId}/cv-pushes/${pushId}/outcome`,
    method: 'PATCH',
    body: { outcome },
  })
}
