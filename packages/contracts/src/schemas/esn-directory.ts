import { z } from 'zod'
import { COMMUNITY_THRESHOLD } from './community-facts.js'

/**
 * Le référentiel ESN — l'ENTITÉ, partagée entre espaces (tome 4, D62).
 *
 * Ce qui est partagé et ce qui ne l'est jamais, c'est toute la décision :
 *
 * | Partagé (cette table) | Privé à l'espace (ailleurs) |
 * | --- | --- |
 * | registre, hiérarchie, établissements | la relation, son étape, son score vécu |
 * | volume de recrutement, marchés publics | les besoins reçus, les marges, les placements |
 * | ouverture au rang 2 **agrégée** (≥ 3 espaces) | la déclaration d'un espace, tant qu'elle est seule |
 *
 * La raison est économique autant que morale : enrichir 477 entités coûte le
 * même travail à chaque espace, et aucune donnée COMMERCIALE ne remonte. Un
 * concurrent qui lit « SII a 14 établissements » lit le registre public ; il ne
 * lit ni nos clients, ni nos marges, ni qui a déclaré quoi.
 */

/**
 * Où en est la résolution d'un nom brut au registre (étage 1).
 *
 * `resolving` est un état de TRAVAIL et non un verdict : il dit qu'un lot a
 * pris ce nom en charge. C'est ce qui permet à deux instances de se partager
 * les 477 noms sans se marcher dessus et sans verrou global — chacune réserve
 * ce qu'elle traite. Une réservation abandonnée (processus tué en plein vol)
 * redevient disponible au bout d'une demi-heure : sans cette reprise, un nom
 * resterait « en cours » pour toujours.
 */
export const ESN_RESOLUTION_STATUSES = [
  'pending',
  'resolving',
  'resolved',
  'ambiguous',
  'foreign',
  'unresolved',
] as const
export type EsnResolutionStatus = (typeof ESN_RESOLUTION_STATUSES)[number]

/** Le lien d'une entité à sa maison mère (étage 2). */
export const ESN_PARENT_RELATIONS = ['groupe', 'filiale', 'agence', 'marque', 'international'] as const
export type EsnParentRelation = (typeof ESN_PARENT_RELATIONS)[number]

/**
 * La confiance d'un rattachement. `confirmed` exige une source capitalistique ;
 * un pattern de nom seul reste `inferred`, **toujours** — « Accenture » et
 * « Accenture Song » sont deux entités du même groupe, pas un groupe et son
 * agence, et rien dans le nom ne permet de les distinguer.
 */
export const ESN_HIERARCHY_CONFIDENCES = ['confirmed', 'inferred'] as const
export type EsnHierarchyConfidence = (typeof ESN_HIERARCHY_CONFIDENCES)[number]

/** Le drapeau de risque (§9.3). `alerte` RETIRE l'ESN des propositions. */
export const ESN_RISK_FLAGS = ['aucun', 'vigilance', 'alerte'] as const
export type EsnRiskFlag = (typeof ESN_RISK_FLAGS)[number]

/**
 * L'ouverture à la sous-traitance (§16.8) — la donnée qui n'existe nulle part.
 *
 * **Défaut `inconnu`, jamais `non`.** Un « non » se déclare, il ne se déduit
 * pas d'une absence : conclure « elle ne sous-traite pas » parce que personne
 * n'a répondu ferait écarter des partenaires que personne n'a jamais appelés.
 */
export const ESN_SUBCONTRACTING_OPENNESS = ['oui', 'non', 'inconnu'] as const
export type EsnSubcontractingOpenness = (typeof ESN_SUBCONTRACTING_OPENNESS)[number]

/** La confiance de cette ouverture, selon d'où elle vient. */
export const ESN_SUBCONTRACTING_CONFIDENCES = ['certain', 'probable', 'suppose'] as const
export type EsnSubcontractingConfidence = (typeof ESN_SUBCONTRACTING_CONFIDENCES)[number]

/**
 * Une valeur qu'un espace peut DÉCLARER — jamais `inconnu`, qui n'est pas une
 * réponse mais l'absence de toute déclaration (§16.8, D589).
 */
export const ESN_SUBCONTRACTING_DECLARABLE = ['oui', 'non'] as const
export type EsnSubcontractingDeclarable = (typeof ESN_SUBCONTRACTING_DECLARABLE)[number]

/**
 * La déclaration d'un espace — chantier N16, « une ESN déclare si elle
 * sous-traite ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D589 — LA DÉCLARATION INDIVIDUELLE EST SCOPÉE, L'AGRÉGAT SEUL EST PARTAGÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `esn_directory` est un fait de MARCHÉ (`table-scopes.ts`), mais CE QU'UN
 * ESPACE A DIT n'en est pas un : c'est une opinion, datée, d'un concurrent sur
 * un autre. Elle vit dans `esn_subcontracting_declarations`, une table SCOPÉE
 * (`workspace_id`), jamais lue par un autre espace directement. Seul l'AGRÉGAT
 * — ≥ {@link COMMUNITY_THRESHOLD} espaces distincts, sans divergence — est
 * promu dans `esn_directory.open_to_subcontracting`, exactement le modèle déjà
 * documenté en tête de ce fichier : « ouverture au rang 2 agrégée (≥ 3
 * espaces) | la déclaration d'un espace, tant qu'elle est seule ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D590 — POURQUOI CE N'EST PAS L'AGRÉGATION INTERDITE PAR GA-43
 * ─────────────────────────────────────────────────────────────────────────────
 * `COMMUNITY_FORBIDDEN_KINDS.cost` interdit d'agréger ce qu'une ESN PAIE pour
 * entrer chez un client — un terme commercial entre concurrents. « Cette ESN
 * accepte-t-elle le rang 2 » n'en est pas un : c'est un fait d'ORGANISATION
 * d'un tiers, de la même famille que `lock` / `mode` / `path`
 * (`COMMUNITY_AGGREGABLE_KINDS`) — jamais un prix, jamais une commission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D591 — LA CONFIANCE PROMUE EST LA PLUS FAIBLE DES CONCORDANTES
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois espaces qui confirment `oui` peuvent l'avoir appris différemment — un
 * appel direct (`certain`), un appel d'offres qui le mentionne (`probable`),
 * une supposition (`suppose`). L'agrégat ne vaut que ce que vaut son maillon le
 * plus faible : promouvoir `certain` parce qu'UN SEUL espace l'a affirmé
 * inventerait une vérification que les deux autres n'ont pas faite.
 */
export type EsnSubcontractingDeclarationInput = {
  /** Ne ressort JAMAIS de cette fonction — il ne sert qu'à COMPTER les espaces. */
  workspaceId: string
  value: EsnSubcontractingDeclarable
  confidence: EsnSubcontractingConfidence
}

export type EsnSubcontractingAggregate = {
  value: EsnSubcontractingDeclarable
  confidence: EsnSubcontractingConfidence
  /** Combien d'espaces DISTINCTS portent cette valeur. */
  sourcesCount: number
} | null

const SUBCONTRACTING_CONFIDENCE_RANK: Record<EsnSubcontractingConfidence, number> = {
  suppose: 0,
  probable: 1,
  certain: 2,
}

/**
 * L'agrégat CANONIQUE — celui qui EST écrit dans `esn_directory`, pas une vue
 * par espace demandeur.
 *
 * ⚠️ Ne pas confondre avec `aggregateAccessFacts` : celle-là calcule une VUE
 * pour UN espace qui demande (sa propre déclaration gagne toujours sur la
 * communauté). Ici, aucun espace n'a de vue privilégiée — ce n'est le compte
 * de personne, c'est un fait de marché — donc il n'y a qu'UNE réponse, la même
 * pour tout le monde. Le principe du SEUIL et celui de l'ANONYMAT sont les
 * mêmes ({@link COMMUNITY_THRESHOLD}, aucune identité d'espace en sortie) ;
 * dupliquer la fonction plutôt que de la réutiliser telle quelle est donc un
 * choix, pas un oubli — les deux dérivations répondent à deux questions
 * différentes.
 */
export function subcontractingAggregate(
  declarations: readonly EsnSubcontractingDeclarationInput[],
): EsnSubcontractingAggregate {
  const spacesByValue = new Map<EsnSubcontractingDeclarable, Set<string>>()
  const confidencesByValue = new Map<EsnSubcontractingDeclarable, EsnSubcontractingConfidence[]>()

  for (const entry of declarations) {
    const workspaceId = entry.workspaceId.trim()
    if (!workspaceId) continue
    const spaces = spacesByValue.get(entry.value) ?? new Set<string>()
    spaces.add(workspaceId)
    spacesByValue.set(entry.value, spaces)
    const confidences = confidencesByValue.get(entry.value) ?? []
    confidences.push(entry.confidence)
    confidencesByValue.set(entry.value, confidences)
  }

  const values = [...spacesByValue.entries()].map(([value, spaces]) => ({ value, sourcesCount: spaces.size }))
  // Une divergence contredit — on ne tranche JAMAIS entre deux affirmations,
  // même si l'une des deux dépasse le seuil (règle reprise d'`aggregateAccessFacts`).
  if (values.length !== 1) return null

  const [{ value, sourcesCount }] = values as [{ value: EsnSubcontractingDeclarable; sourcesCount: number }]
  if (sourcesCount < COMMUNITY_THRESHOLD) return null

  const confidences = confidencesByValue.get(value) ?? []
  const confidence = confidences.reduce((weakest, current) =>
    SUBCONTRACTING_CONFIDENCE_RANK[current] < SUBCONTRACTING_CONFIDENCE_RANK[weakest] ? current : weakest,
  )
  return { value, confidence, sourcesCount }
}

/** La charge utile d'une déclaration (chantier N16). */
export const declareEsnSubcontractingSchema = z.object({
  /** Le nom BRUT — normalisé côté serveur, comme partout dans le référentiel. */
  esnName: z.string().min(1),
  value: z.enum(ESN_SUBCONTRACTING_DECLARABLE),
  confidence: z.enum(ESN_SUBCONTRACTING_CONFIDENCES),
  /** Ce qui fonde la déclaration, en clair. `null` : une simple affirmation. */
  evidence: z.string().trim().min(1).max(2000).nullable().optional(),
})
export type DeclareEsnSubcontracting = z.infer<typeof declareEsnSubcontractingSchema>

export const esnSubcontractingDeclarationResultSchema = z.object({
  esnId: z.string(),
  recorded: z.literal(true),
  /** L'état PARTAGÉ après recalcul — `null` si l'agrégat n'a pas (encore)
   *  atteint le seuil ou reste contredit : la déclaration est enregistrée,
   *  mais rien n'a changé pour les autres espaces. */
  aggregate: z
    .object({
      openToSubcontracting: z.enum(ESN_SUBCONTRACTING_DECLARABLE),
      subcontractingConfidence: z.enum(ESN_SUBCONTRACTING_CONFIDENCES),
      subcontractingSourcesCount: z.number().int().min(COMMUNITY_THRESHOLD),
    })
    .nullable(),
})
export type EsnSubcontractingDeclarationResult = z.infer<typeof esnSubcontractingDeclarationResultSchema>

/**
 * Un FAIT de rang 2 observé — jamais un potentiel, jamais un score (#2298.8).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉCISION LOUIS 18/09/2026 — DES FAITS OBSERVÉS UNIQUEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue d'origine (#2298, bloc PARTENAIRES/ESN) demandait de distinguer
 * `externalWorkforceObserved` / `openToSubcontracting` / `rank2Potential`. Le
 * troisième nom promettait une PRÉDICTION — la doctrine refuse toute
 * probabilité (chance de closing, prévisionnel pondéré), refusée six fois
 * déjà. Ce que Louis a tranché : ce n'est jamais une note ni un score, c'est
 * un CONSTAT datable et sourçable — « a déjà sous-traité N fois », « publie
 * des offres en sous-traitance ». Mesuré avant d'écrire ce type :
 * `rank2Potential` a 0 occurrence dans tout le dépôt — il n'y avait rien à
 * renommer, ce type EST la définition, pas un renommage.
 *
 * À distinguer de `openToSubcontracting` ci-dessus : celui-ci est DÉCLARATIF
 * (ce qu'un espace affirme, agrégé communautairement) ; une observation de
 * rang 2 est FACTUELLE (ce qui a été VU se produire), et les deux peuvent
 * diverger sans se contredire — une ESN peut avoir déjà sous-traité sans
 * jamais l'avoir déclaré, et inversement.
 *
 * ⚠️ Ce type et {@link summarizeRank2Observations} posent la RÈGLE (jamais 0,
 * toujours daté et sourcé) ; ils n'ont PAS encore de pipeline de détection
 * qui les appelle — `esn_directory` ne porte aucune colonne pour ces
 * observations. Construire cette détection (dépouiller les AO publics, les
 * offres d'emploi en sous-traitance) est un chantier séparé, non commencé,
 * hors du périmètre borné de ce lot.
 */
export const ESN_RANK2_OBSERVATION_KINDS = ['already_subcontracted', 'posts_subcontracting_offers'] as const
export type EsnRank2ObservationKind = (typeof ESN_RANK2_OBSERVATION_KINDS)[number]

export const esnRank2ObservationSchema = z.object({
  kind: z.enum(ESN_RANK2_OBSERVATION_KINDS),
  /** Date ISO du CONSTAT — jamais devinée, jamais la date du jour par défaut. */
  observedAt: z.string(),
  /** D'où vient le fait, en clair — jamais un simple `true` sans preuve. */
  source: z.string().trim().min(1),
})
export type EsnRank2Observation = z.infer<typeof esnRank2ObservationSchema>

export type EsnRank2ObservationSummary =
  | { measured: false }
  | { measured: true; count: number; mostRecentAt: string; kinds: EsnRank2ObservationKind[] }

/**
 * Résume des observations de rang 2 SANS jamais inventer un score.
 *
 * Aucune probabilité, aucune moyenne pondérée : seulement ce qui a été VU,
 * combien de fois, et quand pour la dernière fois. Une liste vide rend
 * `measured: false` — jamais `count: 0` rendu tel quel à l'écran, qui se
 * lirait comme un fait plutôt que comme une absence de mesure (GA-18/GA-19).
 */
export function summarizeRank2Observations(observations: readonly EsnRank2Observation[]): EsnRank2ObservationSummary {
  if (observations.length === 0) return { measured: false }
  const mostRecentAt = observations.reduce(
    (latest, o) => (o.observedAt > latest ? o.observedAt : latest),
    observations[0]!.observedAt,
  )
  const kinds = [...new Set(observations.map(o => o.kind))]
  return { measured: true, count: observations.length, mostRecentAt, kinds }
}

/** L'exposition à la commande publique, calculée sur 24 mois. */
export const ESN_PUBLIC_EXPOSURES = ['forte', 'moyenne', 'nulle'] as const
export type EsnPublicExposure = (typeof ESN_PUBLIC_EXPOSURES)[number]

/** L'état d'un domaine. Un domaine `unverified` n'est JAMAIS affiché comme le
 *  site officiel — 93 % de ceux du fichier d'origine sont dérivés du nom. */
export const ESN_DOMAIN_STATUSES = ['verified', 'unverified', 'invalid'] as const
export type EsnDomainStatus = (typeof ESN_DOMAIN_STATUSES)[number]

export const esnEstablishmentSchema = z.object({
  siret: z.string(),
  commune: z.string().nullable(),
  departement: z.string().nullable(),
  effectifTranche: z.string().nullable(),
})

export const esnDirectoryEntrySchema = z.object({
  id: z.string(),
  /** Le nom BRUT du fichier d'origine. Conservé même après résolution : c'est
   *  lui qu'un utilisateur reconnaît, et c'est la clé de la ré-exécution. */
  inputName: z.string(),
  siren: z.string().nullable(),
  resolutionStatus: z.enum(ESN_RESOLUTION_STATUSES),
  /** Pourquoi ça n'a pas abouti, en clair. Une entrée non résolue est
   *  CONSERVÉE : la supprimer perdrait le nom, qu'on ne saurait pas retrouver. */
  resolutionReason: z.string().nullable(),
  legalName: z.string().nullable(),
  nafCode: z.string().nullable(),
  createdOn: z.string().nullable(),
  sizeClass: z.string().nullable(),
  headcountRange: z.string().nullable(),
  headquartersCity: z.string().nullable(),
  headquartersDepartment: z.string().nullable(),
  establishmentCount: z.number().int().nonnegative().nullable(),
  establishments: z.array(esnEstablishmentSchema),
  parentSiren: z.string().nullable(),
  relationToParent: z.enum(ESN_PARENT_RELATIONS).nullable(),
  hierarchyConfidence: z.enum(ESN_HIERARCHY_CONFIDENCES).nullable(),
  hierarchyEvidence: z.string().nullable(),
  domain: z.string().nullable(),
  domainStatus: z.enum(ESN_DOMAIN_STATUSES).nullable(),
  riskFlag: z.enum(ESN_RISK_FLAGS),
  riskEvidence: z.string().nullable(),
  openToSubcontracting: z.enum(ESN_SUBCONTRACTING_OPENNESS),
  subcontractingConfidence: z.enum(ESN_SUBCONTRACTING_CONFIDENCES).nullable(),
  subcontractingSourcesCount: z.number().int().nonnegative(),
  resolvedAt: z.string().nullable(),
})
export type EsnDirectoryEntry = z.infer<typeof esnDirectoryEntrySchema>

/* ------------------------------------------------------------------ */
/*  Étage 2 — la hiérarchie par patterns de nom.                       */
/* ------------------------------------------------------------------ */

/** Les régions et suffixes qui trahissent une AGENCE plutôt qu'une société. */
const AGENCY_SUFFIXES = [
  'est',
  'ouest',
  'nord',
  'sud',
  'sud-ouest',
  'sud-est',
  'nord-ouest',
  'nord-est',
  'atlantique',
  'mediterranee',
  'rhone-alpes',
  'ile-de-france',
  'grand-est',
  'centre',
  'normandie',
  'bretagne',
  'occitanie',
  'aquitaine',
]

const INTERNATIONAL_SUFFIXES = ['international', 'group (international)', 'group international', 'worldwide', 'global']

/** `France` : une filiale nationale, pas une agence régionale. */
const NATIONAL_SUFFIXES = ['france', 'belgique', 'suisse', 'luxembourg', 'espagne', 'maroc', 'tunisie']

function normalize(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface HierarchyGuess {
  parentName: string
  relation: EsnParentRelation
  /** La règle qui l'a produit, en clair — jamais un code. */
  evidence: string
  /** Toujours `inferred` ici. Voir {@link ESN_HIERARCHY_CONFIDENCES}. */
  confidence: EsnHierarchyConfidence
}

/**
 * Le rattachement qu'un NOM suggère, ou `null`.
 *
 * `null` est la réponse la plus fréquente et c'est voulu : sur 477 entités, la
 * grande majorité n'a pas de parent dans la liste. Deviner en produirait des
 * centaines de faux, et un faux rattachement fait travailler la mauvaise
 * maison — le contraire du service rendu.
 *
 * La règle de sûreté tient en une ligne : **on ne rattache qu'à un nom qui est
 * lui-même dans la liste**. « SII Est » ne devient une agence que parce que
 * « SII » existe ; sans lui, c'est une société comme une autre.
 */
export function hierarchyFromName(name: string, knownNames: readonly string[]): HierarchyGuess | null {
  const normalized = normalize(name)
  const known = new Map(knownNames.map(n => [normalize(n), n]))
  known.delete(normalized)

  // « Groupe X » → X est la marque, le groupe en est le porteur. On ne rattache
  // pas : c'est le PARENT, pas l'enfant.
  if (/^groupe\s+/.test(normalized)) return null

  for (const [candidate, original] of known) {
    if (!normalized.startsWith(`${candidate} `)) continue
    const suffix = normalized.slice(candidate.length + 1).trim()
    if (!suffix) continue
    if (INTERNATIONAL_SUFFIXES.includes(suffix)) {
      return {
        parentName: original,
        relation: 'international',
        evidence: `« ${name} » porte le nom de « ${original} » suivi de « ${suffix} »`,
        confidence: 'inferred',
      }
    }
    if (NATIONAL_SUFFIXES.includes(suffix)) {
      return {
        parentName: original,
        relation: 'filiale',
        evidence: `« ${name} » est « ${original} » suivi d'un pays`,
        confidence: 'inferred',
      }
    }
    if (AGENCY_SUFFIXES.includes(suffix)) {
      return {
        parentName: original,
        relation: 'agence',
        evidence: `« ${name} » est « ${original} » suivi d'une région`,
        confidence: 'inferred',
      }
    }
    // Un suffixe QUELCONQUE (« Accenture Song », « Inetum Software ») : même
    // groupe, mais ce n'est ni une agence ni une filiale nationale. C'est le
    // piège que le tome nomme, et la seule réponse honnête est « marque ».
    return {
      parentName: original,
      relation: 'marque',
      evidence: `« ${name} » commence par « ${original} » — même groupe, périmètre distinct`,
      confidence: 'inferred',
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  Le signal NÉGATIF — celui qu'on oublie toujours (§9.3).            */
/* ------------------------------------------------------------------ */

export interface EsnRiskInput {
  /** Une procédure collective publiée au BODACC, avec sa date si elle en a une. */
  collectiveProceeding?: { date: string | null; label: string } | null
  /** La tranche d'effectif a-t-elle BAISSÉ d'un cran depuis la dernière lecture ? */
  headcountDropped?: boolean | null
  /** Un changement de direction récent. */
  leadershipChanged?: boolean | null
}

export interface EsnRisk {
  flag: EsnRiskFlag
  /** L'événement qui a produit le drapeau, en clair. `null` quand il n'y en a
   *  pas — et l'absence d'évènement n'est pas une preuve d'absence de risque,
   *  ce que la date de vérification dit à côté. */
  evidence: string | null
}

/**
 * Le drapeau de risque d'une ESN.
 *
 * Deux niveaux au-dessus de `aucun`, et la différence est un GESTE :
 *
 * - `alerte` **retire** l'ESN des propositions de partenariat. Ne s'adosser à
 *   personne pendant une procédure collective n'est pas de la prudence
 *   excessive : une mission commencée sous une procédure peut s'arrêter du jour
 *   au lendemain, et c'est notre consultant qui rentre.
 * - `vigilance` ne retire rien. Une baisse d'effectif ou un changement de
 *   direction appelle un regard, pas un bannissement — retirer sur un signal
 *   faible ferait disparaître des partenaires parfaitement valables.
 *
 * Réversible par construction : le drapeau se recalcule, il ne se pose pas une
 * fois pour toutes. Une procédure close cesse d'exclure.
 */
export function esnRisk(input: EsnRiskInput): EsnRisk {
  if (input.collectiveProceeding) {
    const when = input.collectiveProceeding.date
    return {
      flag: 'alerte',
      evidence: when
        ? `${input.collectiveProceeding.label} publiée au BODACC du ${when}`
        : `${input.collectiveProceeding.label} publiée au BODACC (date inconnue)`,
    }
  }
  const reasons: string[] = []
  if (input.headcountDropped) reasons.push('effectif en baisse d’un cran au registre')
  if (input.leadershipChanged) reasons.push('changement de direction récent')
  if (reasons.length > 0) return { flag: 'vigilance', evidence: reasons.join(' · ') }
  return { flag: 'aucun', evidence: null }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  #1887 — LA SUGGESTION DE NOM D'ESN, DEPUIS NOTRE PROPRE RÉFÉRENTIEL.      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Une proposition du référentiel pour une saisie partielle (« cap » →
 * « Capgemini »).
 *
 * ⚠️ Ce qui voyage ici sort TOUJOURS d'une ligne d'`esn_directory` : aucune
 * entreprise n'est fabriquée à partir de la frappe de l'utilisateur. Quand rien
 * ne correspond, la liste est VIDE et l'écran le dit — il ne propose jamais de
 * « créer » le nom tapé sous les traits d'une suggestion.
 *
 * Les faits qui accompagnent le nom sont ceux qui DÉPARTAGENT deux entrées
 * proches (« Capgemini » / « Capgemini Invent ») : la ville du siège, la
 * tranche d'effectif, le SIREN. Chacun est `null` tant que la résolution au
 * registre n'a pas eu lieu — 477 noms ont été semés sans aucun de ces faits, et
 * une entrée non résolue reste une ESN : elle se propose avec son seul nom
 * plutôt que de disparaître.
 */
export const esnDirectorySuggestionSchema = z.object({
  /** Le nom tel que le référentiel le porte — celui qui sera écrit si on le choisit. */
  name: z.string(),
  /** La clé du référentiel (accents pliés, casse repliée) — ce que le serveur a comparé. */
  normalizedName: z.string(),
  siren: z.string().nullable(),
  city: z.string().nullable(),
  headcountRange: z.string().nullable(),
  /** La maison mère quand le référentiel la connaît. `null` = non rattachée. */
  parentName: z.string().nullable(),
})
export type EsnDirectorySuggestion = z.infer<typeof esnDirectorySuggestionSchema>

export const esnDirectorySuggestResponseSchema = z.object({
  suggestions: z.array(esnDirectorySuggestionSchema),
})
export type EsnDirectorySuggestResponse = z.infer<typeof esnDirectorySuggestResponseSchema>

/**
 * Sous deux caractères, aucune requête ne part : « c » rendrait un échantillon
 * arbitraire de la moitié du référentiel, ce qui ne suggère rien.
 *
 * Un réglage vit à UN seul endroit (GA-26) : le web s'en sert pour décider s'il
 * interroge, l'API pour décider si elle répond.
 */
export const ESN_SUGGEST_MIN_QUERY_LENGTH = 2
/** Ce qu'une liste déroulante peut montrer sans devenir un annuaire à défiler. */
export const ESN_SUGGEST_DEFAULT_LIMIT = 6
