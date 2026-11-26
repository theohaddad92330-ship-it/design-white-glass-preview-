import { z } from 'zod'

/**
 * COMPETENCE-TROUVE (Louis 20/10/2026) — une compétence posée TROUVE les comptes qui recrutent dessus.
 *
 * Constat prod du 20/10 : « SAP » + Île-de-France et Grand Est rendait 0 compte — la compétence ne
 * faisait que FILTRER une liste tirée du registre, et un compte sans pile connue sortait. Désormais le
 * service IA part des OFFRES (sources gratuites, cache commun d'offres) : chaque compte trouvé porte
 * sa PREUVE (`skillEvidence`), et les cabinets de recrutement et ESN qui recrutent sur la compétence
 * vont dans une section à part (`skillIntermediaries`), jamais dans la liste principale.
 *
 * `latestOffer.source` reste dans la DONNÉE : l'écran ne nomme jamais une source (doctrine).
 */
/** #4664 — une offre du détail : ce qu'on n'a pas est absent (jamais une chaîne vide). `source` n'y figure jamais. */
const discoverSkillEvidenceOfferSchema = z.object({
  title: z.string().nullish(),
  city: z.string().nullish(),
  date: z.string().nullish(),
  url: z.string().nullish(),
  /** #5000.2 — le contrat que l'annonce DÉCLARE (« CDI », « MIS »…), brut ; absent = non déclaré, jamais lu dans le titre. */
  contractType: z.string().nullish(),
})

export type DiscoverSkillEvidenceOffer = z.infer<typeof discoverSkillEvidenceOfferSchema>

/** #4664 — le détail porte 10 offres au plus (`EVIDENCE_OFFERS_MAX` côté IA) ; `offerCount` dit le vrai total. */
export const EVIDENCE_OFFERS_MAX = 10

export const discoverSkillEvidenceSchema = z.object({
  /** La compétence telle que tapée (« SAP »). */
  skill: z.string().min(1),
  /** Offres de moins de 90 jours, hors stage, qui la citent. Jamais 0 : sans offre, pas de preuve. */
  offerCount: z.number().int().positive(),
  /**
   * #4664 — les offres qui ont fait sortir le compte, la plus récente d'abord ; absent d'une réponse d'avant.
   * #4646 — ce sont AUSSI les offres datées qui suivent le compte jusqu'au dossier (10 au plus,
   * `EVIDENCE_OFFERS_MAX`) : une seule clé pour les deux usages, et `city` accepte `null` (la démo
   * comme l'IA posent `null` quand le lieu de l'offre n'est pas connu).
   */
  offers: z.array(discoverSkillEvidenceOfferSchema).optional(),
  latestOffer: z.object({
    title: z.string().nullable(),
    city: z.string().nullable(),
    date: z.string().nullable(),
    url: z.string().nullable(),
    /** #5000.2 — le contrat déclaré de l'offre la plus récente (brut) ; `null`/absent = non déclaré. */
    contractType: z.string().nullable().optional(),
    source: z.string().nullable(),
    /** #4469 — où le mot se lit : l'intitulé, la description, ou `null` (non dit). Absent des réponses d'avant. */
    foundIn: z.enum(['title', 'description']).nullable().optional(),
  }),
})

export type DiscoverSkillEvidence = z.infer<typeof discoverSkillEvidenceSchema>

/** Un cabinet de recrutement (`recruiter`) ou une ESN / un conseil IT (`esn`) qui recrute sur la compétence. */
export const discoverSkillIntermediarySchema = z.object({
  siren: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['recruiter', 'esn']),
  /** #4420.4 — le code NAF du registre, sur lequel le secteur coché filtre cette section ; absent = non publié. */
  nafCode: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  skillEvidence: discoverSkillEvidenceSchema,
})

export type DiscoverSkillIntermediary = z.infer<typeof discoverSkillIntermediarySchema>

/**
 * #4674 — un employeur PROUVÉ par une offre réelle dont le registre n'a pas (encore) établi l'identité. Il sort dans
 * la liste avec ce que l'offre prouve (nom tel que l'annonce l'écrit, ville, lien et date) et un état d'identité
 * nommé. Il ne porte AUCUN SIREN — jamais deviné — donc il n'est PAS un candidat : analyse, contacts, enrichissement
 * et ajout au CRM exigent un SIREN et restent fermés (`id` n'est qu'une clé d'affichage, jamais un identifiant métier).
 * `identity` : `pending` (le registre n'a pas répondu / le délai a manqué), `ambiguous` (homonymie non tranchée,
 * jamais fusionnée), `unmatched` (aucune entité proche).
 */
export const discoverEmployerCandidateSchema = z.object({
  siren: z.string().regex(/^\d{9}$/),
  name: z.string().min(1),
  city: z.string().nullable().optional(),
  nafCode: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  headcountTranche: z.string().nullable().optional(),
})

export type DiscoverEmployerCandidate = z.infer<typeof discoverEmployerCandidateSchema>

export const discoverSkillPendingEmployerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  identity: z.enum(['pending', 'ambiguous', 'unmatched']),
  identityReason: z.string().min(1).optional(),
  city: z.string().nullable().optional(),
  /** #4419.8 — homonymie non tranchée : 2 à 5 entités parmi lesquelles le commercial choisit (jamais choisi pour lui). */
  candidates: z.array(discoverEmployerCandidateSchema).max(5).optional(),
  skillEvidence: discoverSkillEvidenceSchema,
})

export type DiscoverSkillPendingEmployer = z.infer<typeof discoverSkillPendingEmployerSchema>

/**
 * Ce compte est-il PROUVÉ par une offre sur l'une des technologies demandées ? L'offre EST la preuve de
 * la techno : un tel compte n'a pas besoin d'une pile connue en mémoire marché pour passer le filtre
 * « technologies observées ». Comparaison pliée (casse), par inclusion — même règle que ce filtre.
 */
export function candidateProvenBySkill(
  candidate: { readonly skillEvidence?: DiscoverSkillEvidence | null },
  wanted: readonly string[],
): boolean {
  const evidence = candidate.skillEvidence
  if (!evidence || evidence.offerCount <= 0) return false
  const skill = evidence.skill.trim().toLowerCase()
  return wanted.some(term => {
    const folded = term.trim().toLowerCase()
    return folded.length > 0 && (skill.includes(folded) || folded.includes(skill))
  })
}

const count = z.number().int().nonnegative()

/**
 * #4419.1 — `query.skillSearch` : ce que la recherche par compétence a fait, ÉTAPE PAR ÉTAPE (posé par
 * `apps/ia/app/services/discover_skill_offers.py`). Mesure prod du 21/10 : « Java » en Hauts-de-France
 * rendait 1 compte sans qu'aucun écran ne puisse dire où la récolte se perdait.
 *
 * Les compteurs postérieurs à #4419 sont optionnels : une réponse d'avant (cache de requêtes) se lit encore.
 * Les clés de `offersBySource` / `calls` nomment nos sources : elles restent dans la DONNÉE, jamais à l'écran.
 */
export const discoverSkillSearchSchema = z.object({
  skills: z.array(z.string().min(1)).min(1),
  /** #4579.5 — ce qui a été cherché, terme par terme : la saisie (ou le métier d'une expertise) et ses écritures d'annonce. */
  searched: z.array(z.object({ skill: z.string().min(1), forms: z.array(z.string().min(1)) })).optional(),
  /** Étape 1 — offres reçues par source, appels passés, moisson resservie du cache, lectures coupées par le délai. */
  offersBySource: z.record(z.string(), count).optional(),
  calls: z.record(z.string(), count).optional(),
  /**
   * #4419 — le compteur PAR SOURCE : reçues, retenues, rejets par motif, appels payés, servis par le cache 30 j, non
   * tentés (plafond d'achats). Adzuna ajoute `pagesOk` / `pagesFailed` / `rawReturned` / `noEmployer` / `quotaSkipped`.
   * Les clés nomment nos sources : donnée seulement, jamais à l'écran.
   */
  sources: z
    .record(
      z.string(),
      z
        .object({ rejected: z.record(z.string(), count).optional() })
        .catchall(z.union([count, z.record(z.string(), count)])),
    )
    .optional(),
  /**
   * #4420 — la matrice de couverture : POURQUOI la récolte a peu rendu. `causes` (sans clé, quota, 4xx, 5xx, délai,
   * cache, plafond d'achats) en total et par source ; `filtered` = ce que le tri a écarté par motif ; `silentFilters`
   * = les sources qui envoient des offres sans qu'aucun rejet soit compté (un tri qui ne tourne pas). Les clés nomment
   * nos sources : donnée seulement, jamais à l'écran.
   */
  coverage: z
    .object({
      causes: z.record(z.string(), count),
      bySource: z.record(z.string(), z.record(z.string(), count)).optional(),
      filtered: z.record(z.string(), count),
      silentFilters: z.array(z.string()),
    })
    .optional(),
  harvestCached: z.boolean().optional(),
  sourcesCut: count.optional(),
  /** Étape 2 — offres retenues, et chaque rejet par motif. */
  offersSeen: count,
  offersRejected: z
    .object({
      anonymous: count,
      tooOld: count,
      internship: count,
      skillAbsent: count,
      outsideTrade: count,
      outsideZone: count,
    })
    .partial()
    .optional(),
  /** Étape 3 — groupes d'employeurs, et ceux au-delà du plafond de résolution. */
  employerGroups: count.optional(),
  beyondCap: count.optional(),
  /** Étape 4 — échecs de résolution par motif ; `notAttempted` = le temps a manqué (jamais « introuvable »). */
  resolutionFailures: z
    .object({ homonym: count, registrySilent: count, publicAdministration: count, unavailable: count })
    .partial()
    .optional(),
  /** Employeurs non identifiés au registre (homonymie, registre muet, administration). */
  unresolvedEmployers: count,
  notAttempted: count.optional(),
  /** #4674 — employeurs non résolus RENDUS quand même (`skillPendingEmployers`) ; un sous-ensemble des échecs ci-dessus. */
  unresolvedRendered: count.optional(),
  /** #4674 — cabinets et ESN non résolus : jamais rendus comme comptes cibles. */
  unresolvedIntermediaries: count.optional(),
  /** Étape 5 — hors zone, intermédiaires, comptes, hors effectif. */
  outsideZone: count.optional(),
  employersFound: count,
  intermediaries: count,
  accountsFound: count.optional(),
  outsideHeadcount: count.optional(),
  /** #4420.4 a (Louis 23/10) — comptes écartés car hors du secteur coché (NAF connu, hors liste). */
  outsideSector: count.optional(),
  city: z.string().optional(),
  outsideCity: count.optional(),
  /** La recherche a été coupée par son budget de temps : la relancer (cache 30 j) va plus loin. */
  deadlineCut: z.boolean().optional(),
  /** #4419.8 — des employeurs n'ont pas été lus (registre public non joint, budget, plafond) : une page plus
   *  longue peut rendre plus. Une liste COURTE n'est donc pas une source épuisée. */
  more: z.boolean().optional(),
  emptyCause: z
    .enum([
      'no_offers',
      'no_offers_in_city',
      'only_intermediaries',
      'no_employer_identified',
      'sources_unavailable',
      'outside_headcount',
    ])
    .nullable()
    .optional(),
})

export type DiscoverSkillSearch = z.infer<typeof discoverSkillSearchSchema>

/** `query.skillSearch` d'une réponse `/discover`, ou `null` (hors recherche par compétence, ou illisible). */
export function readSkillSearch(query: Readonly<Record<string, unknown>> | undefined): DiscoverSkillSearch | null {
  const parsed = discoverSkillSearchSchema.safeParse(query?.skillSearch)
  return parsed.success ? parsed.data : null
}

/** #4419.6 — « Java, Vue » : une virgule ET une espace, même quand une compétence arrive collée (« Java,Vue »). */
export function skillSearchLabel(skills: readonly string[]): string {
  return skills
    .flatMap(skill => skill.split(','))
    .map(skill => skill.trim())
    .filter(Boolean)
    .join(', ')
}
