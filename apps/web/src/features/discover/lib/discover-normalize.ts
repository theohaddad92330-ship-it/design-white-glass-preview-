import {
  discoverCandidateSchema,
  discoverKnownNeedSchema,
  criteriaWidenedBySchema,
  discoverResponseSchema,
  discoverSkillEvidenceSchema,
  discoverSkillIntermediarySchema,
  discoverSkillPendingEmployerSchema,
  discoverSourceAxesSchema,
  offersVolumeSchema,
  type DiscoverSourceAxes,
} from '@bellum/contracts'
import type {
  DiscoverAggregatedSignal,
  DiscoverOfferAuthorKind,
  DiscoverOfferRequester,
  DiscoverRequesterMethodStep,
  DiscoverCandidate,
  DiscoverCoverage,
  DiscoverDegradedSource,
  DiscoverPortfolioState,
  DiscoverQualification,
  DiscoverResponse,
  DiscoverScoreFactor,
  DiscoverSignal,
  DiscoverSource,
  DiscoverSuggestedRole,
  DiscoverListingFilter,
  DiscoverTargetSectorFilter,
  ScoreCriterion,
} from './discover-types'
import { isOtherActorKind } from './discover-other-actors'
import { SCORE_CRITERIA } from './discover-types'
import { normalizeCandidateZone, normalizeZoneWidening } from './discover-zone-widening'

/* ------------------------------------------------------------------ */
/*  Normalisation défensive de la réponse Découvrir.                    */
/*                                                                     */
/*  Règle cardinale du contrat : « Un candidat sans SIREN résolu n'est  */
/*  JAMAIS rendu. » L'écran v1 affichait « Fabricant Fenêtres » comme   */
/*  une entreprise ; ce module est le point où ça ne peut plus arriver. */
/* ------------------------------------------------------------------ */

// #4068 — `funding` (levées, #3941) et `business` (projet, nomination, presse) sont au contrat
// (`discoverSignalTypeSchema`) : absents d'ici, ils n'atteignaient JAMAIS la carte.
// #4115 — les omettre retirait en silence les faits FORTS de la grille (levée, nomination).
const SIGNAL_TYPES: ReadonlySet<string> = new Set([
  'tender',
  'award',
  'hiring',
  'legal',
  'tech',
  'funding',
  'business',
  'ecosystem',
])
const PORTFOLIO_STATES: ReadonlySet<string> = new Set(['new', 'analyzed', 'watched', 'customer'])
const QUALIFICATION_VERDICTS: ReadonlySet<string> = new Set(['recommended', 'to_verify', 'excluded'])

type Raw = Record<string, unknown>

function asRecord(value: unknown): Raw | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Trimmed string, or `null` — jamais `''`, jamais une valeur inventée. */
function str(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * #4436.3 (recette R23g) — une taille ABSENTE ne s'écrit jamais « 0 salarié » : la tranche INSEE « 00 » (« 0 salarié »,
 * unité sans effectif publié) est une taille NON PUBLIÉE — la carte la dit (« taille non publiée »), le compte reste.
 */
function publishedHeadcount(value: unknown): string | null {
  const label = str(value)
  if (label === null) return null
  return /^0{1,2}$/.test(label) || /^0\s*salari/i.test(label) ? null : label
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Un entier ≥ 0, ou `null` — jamais `0` deviné sur une valeur illisible
 *  (même garde que `count`, mais NULLABLE : « non mesuré » ≠ « zéro »). */
function groupLinkOrUndefined(value: unknown): DiscoverCandidate['groupLink'] {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as { kind?: unknown; entities?: unknown }
  if (raw.kind !== 'capital_link' && raw.kind !== 'legal_entity_officer') return undefined
  const entities = Array.isArray(raw.entities)
    ? raw.entities.filter((e): e is string => typeof e === 'string' && e.trim() !== '').map(e => e.trim())
    : []
  return entities.length > 0 ? { kind: raw.kind, entities: entities.slice(0, 3) } : undefined
}

function brandGroupOrUndefined(value: unknown): DiscoverCandidate['brandGroup'] {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as { role?: unknown; headSiren?: unknown; headName?: unknown; members?: unknown }
  if (raw.role === 'member') {
    const headSiren = normalizeSiren(raw.headSiren)
    const headName = str(raw.headName)
    return headSiren ? { role: 'member', headSiren, ...(headName ? { headName } : {}) } : undefined
  }
  if (raw.role !== 'head' || !Array.isArray(raw.members)) return undefined
  const members = raw.members.flatMap(entry => {
    const m = entry as { siren?: unknown; name?: unknown }
    const siren = normalizeSiren(m?.siren)
    const name = str(m?.name)
    return siren && name ? [{ siren, name }] : []
  })
  return members.length > 0 ? { role: 'head', members } : undefined
}

function nonNegativeIntOrNull(value: unknown): number | null {
  const n = num(value)
  return n === null || n < 0 ? null : Math.round(n)
}

/** SIREN = 9 chiffres. Les séparateurs de présentation sont tolérés en entrée. */
function normalizeSiren(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  const digits = raw.replace(/[\s.-]/g, '')
  return /^\d{9}$/.test(digits) ? digits : null
}

/** Le badge est sur l'échelle 0-100 : une valeur hors bornes est ramenée, pas rejetée. */
function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function isScoreCriterion(value: unknown): value is ScoreCriterion {
  return typeof value === 'string' && (SCORE_CRITERIA as readonly string[]).includes(value)
}

function normalizeSignal(value: unknown): DiscoverSignal | null {
  const raw = asRecord(value)
  if (!raw) return null
  const type = str(raw.type)
  const label = str(raw.label)
  // La date est obligatoire : c'est tout l'intérêt d'un signal (« pourquoi maintenant »).
  const date = str(raw.date)
  if (!type || !SIGNAL_TYPES.has(type) || !label || !date) return null
  return {
    type: type as DiscoverSignal['type'],
    label,
    date,
    ...(str(raw.url) ? { url: str(raw.url) as string } : {}),
    ...(str(raw.detail) ? { detail: str(raw.detail) as string } : {}),
    // #2165.46 — recopié champ par champ, comme `block`/`barrier` juste au-dessus
    // le documentent : un champ oublié ici n'atteint jamais l'écran.
    ...(typeof raw.intermediated === 'boolean' ? { intermediated: raw.intermediated } : {}),
    // #2616.2 — MÊME défaut : déclaré au contrat, jamais recopié ici, donc
    // jamais atteint le filtre qui exclut l'employeur public du signal `hiring`.
    ...(typeof raw.publicEmployer === 'boolean' ? { publicEmployer: raw.publicEmployer } : {}),
    // #4045.3 — posé par le serveur quand le signal recoupe le mot-clé ; seul `true` voyage.
    ...(raw.keywordMatch === true ? { keywordMatch: true } : {}),
    // #4115 — la tranche de la grille (serveur) : seules les deux valeurs connues voyagent.
    ...(raw.tier === 'strong' || raw.tier === 'context' ? { tier: raw.tier } : {}),
    ...normalizeSignalExtraction(raw),
  }
}

const HIRING_SIGNAL_CLASSES: ReadonlySet<string> = new Set([
  'internal_hiring',
  'contracting',
  'staffing_signal',
  'skill_demand_signal',
  'agency_posting',
])
const FIT_LEVELS: ReadonlySet<string> = new Set(['compatible', 'potentially_compatible', 'unknown', 'incompatible'])
const REMOTE_POLICIES: ReadonlySet<string> = new Set(['sur_site', 'hybride', 'full_remote'])
const SENIORITIES: ReadonlySet<string> = new Set(['junior', 'confirme', 'senior'])

/**
 * #3238 (recette prod 02/10) — « Verdal n'affiche que Lille · 59 » : cette
 * fonction reconstruit le signal CHAMP PAR CHAMP et n'avait jamais recopié
 * `siteCity` (ni les champs #3096/#3097/#3203/#3204) — la puce « Sites » était
 * livrée, testée avec un candidat construit à la main, et ne pouvait jamais
 * recevoir de donnée. Une valeur absente ou hors contrat reste ABSENTE.
 */
function normalizeSignalExtraction(raw: Raw): Partial<DiscoverSignal> {
  const out: Partial<DiscoverSignal> = {}
  const text = (key: 'jobFamily' | 'team' | 'reportsTo' | 'thirdPartyProviderMention' | 'siteCity' | 'salaryLabel') => {
    const v = str(raw[key])
    if (v) out[key] = v
  }
  text('siteCity')
  text('jobFamily')
  text('team')
  text('reportsTo')
  text('thirdPartyProviderMention')
  text('salaryLabel')
  const technologies = asArray(raw.technologies)
    .map(str)
    .filter((t): t is string => t !== null)
  if (technologies.length > 0) out.technologies = technologies
  if (typeof raw.stillOpen === 'boolean') out.stillOpen = raw.stillOpen
  if (typeof raw.replacementSignal === 'boolean') out.replacementSignal = raw.replacementSignal
  const similar = num(raw.similarOfferCount)
  if (similar !== null && similar >= 0) out.similarOfferCount = similar
  const cls = str(raw.hiringSignalClass)
  if (cls && HIRING_SIGNAL_CLASSES.has(cls)) out.hiringSignalClass = cls as DiscoverSignal['hiringSignalClass']
  const fit = str(raw.deliveryFit)
  if (fit && FIT_LEVELS.has(fit)) out.deliveryFit = fit as DiscoverSignal['deliveryFit']
  const axes = asRecord(raw.deliveryFitAxes)
  if (axes) {
    const kept = Object.entries(axes).filter(([, v]) => typeof v === 'string' && FIT_LEVELS.has(v))
    if (kept.length > 0) out.deliveryFitAxes = Object.fromEntries(kept) as DiscoverSignal['deliveryFitAxes']
  }
  const requester = normalizeRequester(raw.requester)
  if (requester) out.requester = requester
  // #4999 — le CONTRAT réel de la source : CDI, ou freelance/mission/indépendant. Rien n'est déduit du texte libre.
  // #5000 — CDD et intérim sont des valeurs à part (l'intérim n'est plus compté freelance).
  if (
    raw.contractType === 'CDI' ||
    raw.contractType === 'CDD' ||
    raw.contractType === 'INTERIM' ||
    raw.contractType === 'FREELANCE'
  )
    out.contractType = raw.contractType
  const remote = str(raw.remoteWorkPolicy)
  if (remote && REMOTE_POLICIES.has(remote)) out.remoteWorkPolicy = remote as DiscoverSignal['remoteWorkPolicy']
  const seniority = str(raw.seniority)
  if (seniority && SENIORITIES.has(seniority)) out.seniority = seniority as DiscoverSignal['seniority']
  return out
}

const REQUESTER_AUTHORS: ReadonlySet<string> = new Set(['rh', 'cabinet', 'non_precise'])
const REQUESTER_STEPS: ReadonlySet<string> = new Set([
  'lire_offre',
  'fonction_rh_nomme_auteur',
  'chercher_fonction_operationnelle',
  'demander_au_premier_interlocuteur',
])

/** #4182 — le dossier « qui demande ce profil ? » ; hors contrat → ABSENT, jamais complété. */
export function normalizeRequester(value: unknown): DiscoverOfferRequester | null {
  const raw = asRecord(value)
  if (!raw) return null
  const status = str(raw.status)
  if (status !== 'etaye' && status !== 'a_identifier') return null
  const authorRaw = str(asRecord(raw.author)?.kind)
  const manager = asRecord(raw.possibleManager)
  return {
    author: authorRaw && REQUESTER_AUTHORS.has(authorRaw) ? (authorRaw as DiscoverOfferAuthorKind) : 'non_precise',
    possibleManagerFunction: str(manager?.function),
    team: str(raw.team),
    city: str(asRecord(raw.scope)?.city),
    status,
    method: asArray(raw.method)
      .map(str)
      .filter((step): step is DiscoverRequesterMethodStep => step !== null && REQUESTER_STEPS.has(step)),
  }
}

function normalizeAggregatedSignal(value: unknown): DiscoverAggregatedSignal | null {
  const raw = asRecord(value)
  if (!raw) return null
  const aggregateClass = str(raw.aggregateClass)
  const jobFamily = str(raw.jobFamily)
  const reason = str(raw.reason)
  if ((aggregateClass !== 'team_growth_signal' && aggregateClass !== 'replacement_signal') || !jobFamily || !reason) {
    return null
  }
  const supportingOffers = asArray(raw.supportingOffers).flatMap(o => {
    const rec = asRecord(o)
    const label = str(rec?.label)
    const date = str(rec?.date)
    return label && date ? [{ label, date }] : []
  })
  return { aggregateClass, jobFamily, supportingOffers, reason }
}

/** Une liste de textes non vides sous `key` ; vide ou absente = AUCUNE clé, jamais une liste devinée. */
function namedList<K extends string>(key: K, value: unknown): { [P in K]?: string[] } {
  const items = asArray(value)
    .map(str)
    .filter((item): item is string => item !== null)
  return items.length > 0 ? ({ [key]: items } as { [P in K]?: string[] }) : {}
}

function normalizeScoreFactor(value: unknown): DiscoverScoreFactor | null {
  const raw = asRecord(value)
  if (!raw) return null
  const label = str(raw.label)
  const points = num(raw.points)
  if (!label || points === null) return null
  // Le BLOC du barème voyage depuis le 22/08 (`discoverScoreFactorSchema.block`).
  // Il était recopié nulle part, donc l'écran retombait sur la reconnaissance
  // par libellé — le repli explicitement décrit comme faux pour trois blocs sur
  // huit. Une clé inconnue est écartée plutôt que crue : elle rangerait le
  // facteur dans un bloc qui n'existe pas.
  const block = str(raw.block)
  // ⚠️ TROISIÈME occurrence de la même cause dans CE fichier — après `block`
  // ci-dessus et `barrier` juste en dessous, qui la racontent tous les deux.
  // Le service IA émet `label_key`/`label_params` depuis le 09/09 pour que
  // l'anglais cesse de lire du français dans un facteur de score ; le contrat
  // les déclare ; `CandidateScore.tsx` sait déjà les préférer. Sans ces deux
  // lignes, ils n'atteignaient PAS l'écran Découvrir : ce normaliseur
  // reconstruit le facteur CHAMP PAR CHAMP, et ce qu'il ne recopie pas
  // n'existe pas plus loin. Le défaut est indolore à la lecture — l'écran
  // affiche le français de repli, exactement comme avant, donc rien ne casse
  // et personne ne voit que le correctif est mort en chemin.
  const labelKey = str(raw.label_key)
  const labelParams = asRecord(raw.label_params)
  return {
    label,
    points,
    ...(str(raw.evidence) ? { evidence: str(raw.evidence) as string } : {}),
    ...(block && isScoreCriterion(block) ? { block } : {}),
    ...(labelKey ? { label_key: labelKey } : {}),
    ...(labelKey && labelParams ? { label_params: interpolationParams(labelParams) } : {}),
  }
}

/** Les paramètres d'interpolation, filtrés à ce que le contrat autorise
 *  (`z.record(z.string(), z.union([z.string(), z.number()]))`). Une valeur
 *  d'un autre type est ÉCARTÉE plutôt que crue : elle s'afficherait telle
 *  quelle dans la phrase traduite. */
function interpolationParams(raw: Raw): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))) out[key] = value
  }
  return out
}

/**
 * La barrière d'ACHAT (tome 3) — le troisième nombre.
 *
 * Recopiée ici et pas seulement typée : le normaliseur construit le candidat
 * champ par champ, et un champ oublié n'atteint JAMAIS l'écran. C'est la faute
 * exacte qui a rendu l'adressabilité invisible pendant un jour entier.
 */
function normalizeBarrier(value: unknown): DiscoverCandidate['barrier'] {
  const raw = asRecord(value)
  if (!raw) return undefined
  const klass = str(raw.access_class)
  return {
    score: num(raw.score),
    accessibility: num(raw.accessibility),
    access_class: klass === 'A' || klass === 'B' || klass === 'C' || klass === 'D' ? klass : null,
    label: str(raw.label),
    measurable: raw.measurable === true,
    missing: asArray(raw.missing)
      .map(entry => str(entry))
      .filter((entry): entry is string => entry !== null),
    proxies: asArray(raw.proxies).flatMap(entry => {
      const proxy = asRecord(entry)
      const key = str(proxy?.key)
      if (!proxy || !key) return []
      return [
        {
          key,
          contribution: num(proxy.contribution) ?? 0,
          evidence: str(proxy.evidence) ?? '',
          measurable: proxy.measurable === true,
        },
      ]
    }),
    corrections: asArray(raw.corrections).flatMap(entry => {
      const correction = asRecord(entry)
      const key = str(correction?.key)
      if (!correction || !key) return []
      return [
        {
          key,
          delta: num(correction.delta) ?? 0,
          label: str(correction.label) ?? '',
          evidence: str(correction.evidence) ?? '',
        },
      ]
    }),
  }
}

/**
 * Le SECOND nombre (tome 1 §6.4) — « peux-tu entrer chez ce compte ? ».
 *
 * Il ne se fond JAMAIS dans le premier : c'est la thèse du tome, et c'est
 * structurel ici aussi — l'objet est recopié à part, il n'entre dans aucune
 * somme. Un payload d'avant le 22/08 n'en porte pas : l'absence reste une
 * absence, jamais un zéro (qui se lirait « ce compte est inatteignable »).
 *
 * Un facteur SANS axe est écarté : l'axe est ce qui nomme la mesure, et un
 * point sans nom d'axe n'explique rien à celui qui le lit.
 */
function normalizeAddressability(value: unknown): DiscoverCandidate['addressability'] {
  const raw = asRecord(value)
  if (!raw) return undefined
  const max = num(raw.max)
  if (max === null || max < 0) return undefined
  const score = num(raw.score)
  return {
    score,
    max,
    unmeasured: asArray(raw.unmeasured)
      .map(axis => str(axis))
      .filter((axis): axis is string => axis !== null),
    factors: asArray(raw.factors).flatMap(entry => {
      const factor = normalizeScoreFactor(entry)
      const axis = str(asRecord(entry)?.axis)
      return factor && axis ? [{ ...factor, axis }] : []
    }),
  }
}

function normalizeRole(value: unknown): DiscoverSuggestedRole | null {
  const raw = asRecord(value)
  const title = str(raw?.title)
  if (!title) return null
  return { title, department: str(raw?.department) ?? '' }
}

function normalizeSource(value: unknown): DiscoverSource | null {
  const raw = asRecord(value)
  const name = str(raw?.name)
  if (!name) return null
  return {
    name,
    ...(str(raw?.url) ? { url: str(raw?.url) as string } : {}),
    fetchedAt: str(raw?.fetchedAt) ?? '',
  }
}

/**
 * #3983.1 — la base de la géographie (siège / implantation) voyage de l'IA
 * jusqu'ici, mais ce normaliseur reconstruit `DiscoverCandidate` CHAMP PAR CHAMP :
 * l'oubli ici couperait la chaîne. Un bloc illisible est ABSENT, jamais complété.
 */
function geographyField(value: unknown): Pick<DiscoverCandidate, 'geography'> | Record<string, never> {
  const raw = asRecord(value)
  if (!raw) return {}
  const basis = str(raw.basis)
  const count = num(raw.siteCount)
  if ((basis !== 'headquarters' && basis !== 'establishment') || count === null || count < 0) return {}
  const headquarters = asRecord(raw.headquarters)
  return {
    geography: {
      basis,
      headquarters: { city: str(headquarters?.city), department: str(headquarters?.department) },
      siteCount: Math.floor(count),
      sites: asArray(raw.sites).flatMap(entry => {
        const site = asRecord(entry)
        return site
          ? [
              {
                siret: str(site.siret),
                city: str(site.city),
                department: str(site.department),
                region: str(site.region),
              },
            ]
          : []
      }),
      zoneRegion: str(raw.zoneRegion),
    },
  }
}

/** COMPETENCE-TROUVE — la preuve par offres, validée par le contrat ; invalide ou absente = aucune ligne. */
/** #4430 / #4437 — la provenance d'un compte proposé, validée sur le contrat (une valeur hors contrat tombe). */
function provenanceOf(
  raw: Raw,
): Pick<DiscoverCandidate, 'jobsAsOf' | 'skillFreshFill' | 'widenedFrom' | 'observedNeed' | 'fromCommonBase'> {
  const shape = discoverCandidateSchema.shape
  const asOf = shape.jobsAsOf.safeParse(raw.jobsAsOf)
  const widened = shape.widenedFrom.safeParse(raw.widenedFrom)
  // #4791.2 — un besoin sans date (ou hors contrat) tombe : la carte n'affiche pas ce qu'on n'a pas.
  const need = shape.observedNeed.safeParse(raw.observedNeed)
  return {
    ...(asOf.success && asOf.data ? { jobsAsOf: asOf.data } : {}),
    ...(need.success && need.data ? { observedNeed: need.data } : {}),
    ...(raw.skillFreshFill === true ? { skillFreshFill: true } : {}),
    // #4793.1 — le compte venu de la base commune se reconnaît ; seul le booléen vrai passe.
    ...(raw.fromCommonBase === true ? { fromCommonBase: true } : {}),
    ...(widened.success && widened.data ? { widenedFrom: widened.data } : {}),
  }
}

function skillEvidenceOf(raw: Raw): Pick<DiscoverCandidate, 'skillEvidence'> {
  const parsed = discoverSkillEvidenceSchema.safeParse(raw.skillEvidence)
  return parsed.success ? { skillEvidence: parsed.data } : {}
}

/** #4433 — l'étiquette d'élargissement, validée par le contrat ; invalide ou absente = résultat exact. */
function widenedByOf(raw: Raw): Pick<DiscoverCandidate, 'widenedBy'> {
  const parsed = criteriaWidenedBySchema.safeParse(raw.widenedBy)
  return parsed.success ? { widenedBy: parsed.data } : {}
}

function offersVolumeOf(raw: Raw): Pick<DiscoverCandidate, 'offersVolume'> {
  const parsed = offersVolumeSchema.safeParse(raw.offersVolume)
  return parsed.success ? { offersVolume: parsed.data } : {}
}

function normalizeCandidate(value: unknown, zonePlace?: string): DiscoverCandidate | null {
  const raw = asRecord(value)
  if (!raw) return null

  const name = str(raw.name)
  const siren = normalizeSiren(raw.siren)
  if (!name || !siren) return null

  const portfolioState = str(raw.portfolioState)
  // Un score absent reste ABSENT. Le remplacer par 0 fabriquait une mesure : la
  // liste s'affichait « 0/100 » de haut en bas alors que le backend n'avait rien
  // calculé (règle CLAUDE.md — jamais de donnée inventée).
  const rawScore = num(raw.score)
  const score = rawScore === null ? null : clampScore(rawScore)
  const rawMax = num(raw.scoreMax)
  const addressability = normalizeAddressability(raw.addressability)
  const barrier = normalizeBarrier(raw.barrier)
  const qualification = normalizeQualification(raw.qualification)

  return {
    name,
    siren,
    nafCode: str(raw.nafCode),
    sector: str(raw.sector),
    // #4358.4 — la provenance du secteur, seulement parmi les trois connues et seulement si un secteur existe.
    ...(str(raw.sector) &&
    (raw.sectorBasis === 'naf' || raw.sectorBasis === 'declared_activity' || raw.sectorBasis === 'website')
      ? { sectorBasis: raw.sectorBasis }
      : {}),
    city: str(raw.city),
    department: str(raw.department),
    headcountRange: publishedHeadcount(raw.headcountRange),
    creationDate: str(raw.creationDate),
    // #3877.4 — déjà calculé côté IA (`apps/ia/app/routers/discover.py`), jeté
    // ici jusqu'à ce lot : la chaîne coupée laissait ce compteur mort avant
    // même d'atteindre l'écran.
    establishmentCount: nonNegativeIntOrNull(raw.establishmentCount),
    // #3705.5 — lien de groupe sourcé ; absent reste absent (aucune ligne).
    ...(groupLinkOrUndefined(raw.groupLink) ? { groupLink: groupLinkOrUndefined(raw.groupLink) } : {}),
    // #4892.1 — regroupement de marque proposé ; absent reste absent.
    ...(brandGroupOrUndefined(raw.brandGroup) ? { brandGroup: brandGroupOrUndefined(raw.brandGroup) } : {}),
    ...geographyField(raw.geography),
    // #4429.4 — le palier d'un compte ajouté par l'élargissement de zone ; absent sur un compte exact.
    ...(normalizeCandidateZone(raw.zone, zonePlace) ? { zone: normalizeCandidateZone(raw.zone, zonePlace) } : {}),

    score,
    // Pas de dénominateur annoncé mais un score produit → le barème complet
    // (100) ; pas de score du tout → pas de dénominateur non plus.
    scoreMax: score === null ? null : rawMax === null ? 100 : clampScore(rawMax),
    scoreUnmeasured: asArray(raw.scoreUnmeasured).filter(isScoreCriterion),
    scoreFactors: asArray(raw.scoreFactors)
      .map(normalizeScoreFactor)
      .filter((f): f is DiscoverScoreFactor => f !== null),
    ...(addressability ? { addressability } : {}),
    ...(barrier ? { barrier } : {}),
    ...(qualification ? { qualification } : {}),
    signals: asArray(raw.signals)
      .map(normalizeSignal)
      .filter((s): s is DiscoverSignal => s !== null),
    ...(Array.isArray(raw.aggregatedSignals)
      ? {
          aggregatedSignals: raw.aggregatedSignals
            .map(normalizeAggregatedSignal)
            .filter((a): a is DiscoverAggregatedSignal => a !== null),
        }
      : {}),

    angle: str(raw.angle),
    suggestedRoles: asArray(raw.suggestedRoles)
      .map(normalizeRole)
      .filter((r): r is DiscoverSuggestedRole => r !== null),

    portfolioState:
      portfolioState && PORTFOLIO_STATES.has(portfolioState) ? (portfolioState as DiscoverPortfolioState) : 'new',
    accountId: str(raw.accountId),

    dataConfidence: num(raw.dataConfidence) === null ? null : clampScore(num(raw.dataConfidence) as number),

    sources: asArray(raw.sources)
      .map(normalizeSource)
      .filter((s): s is DiscoverSource => s !== null),

    // #2265.14 — même chaîne coupée que `qualification` ci-dessus (#2614.1) :
    // `isIntermediary` voyage depuis l'IA (`discover_signals.py`) mais cette
    // fonction reconstruit `DiscoverCandidate` CHAMP PAR CHAMP, et l'oubli
    // ici referme la chaîne aussi sûrement qu'une absence côté backend.
    ...(typeof raw.isIntermediary === 'boolean' ? { isIntermediary: raw.isIntermediary } : {}),
    // #3757 — même chaîne coupée : l'ESN n'est pas un client final.
    ...(typeof raw.isEsnPeer === 'boolean' ? { isEsnPeer: raw.isEsnPeer } : {}),
    // #4746.2 — même chaîne coupée : la pastille d'« Autres acteurs » voyage jusqu'à l'écran.
    ...(isOtherActorKind(raw.actorKind) ? { actorKind: raw.actorKind } : {}),
    ...(raw.esnRecognition === 'referential' || raw.esnRecognition === 'offers'
      ? { esnRecognition: raw.esnRecognition }
      : {}),
    // #3819.1 — même chaîne coupée : « besoins connus », 0 compris (un fait
    // mesuré pour un compte déjà possédé, jamais une absence).
    ...(num(raw.knownNeedsCount) !== null ? { knownNeedsCount: num(raw.knownNeedsCount) as number } : {}),
    // #4068 — un besoin illisible est écarté, jamais réparé ; aucune liste devinée.
    ...(Array.isArray(raw.knownNeeds)
      ? {
          knownNeeds: raw.knownNeeds.flatMap(need => {
            const parsed = discoverKnownNeedSchema.safeParse(need)
            return parsed.success ? [parsed.data] : []
          }),
        }
      : {}),
    // #3819 — même chaîne coupée : « cherché, rien trouvé » ≠ « jamais interrogé » ; sans ce champ la carte
    // écrivait « Non cherché : offres » sur un compte dont la recherche avait bien eu lieu.
    ...(typeof raw.signalsSearched === 'boolean' ? { signalsSearched: raw.signalsSearched } : {}),
    // #4677 — trois états nommés, jamais devinés : une valeur inconnue ne se rend pas.
    ...(raw.signalsState === 'pending' || raw.signalsState === 'none' || raw.signalsState === 'unavailable'
      ? { signalsState: raw.signalsState }
      : {}),
    // #4284.26 — même chaîne coupée : « hors de ton métier » vient de l'IA, jamais deviné ici.
    ...(raw.outOfTrade === true ? { outOfTrade: true } : {}),
    // DISCOVER-OFFRES (15/10) — même chaîne coupée : un volume mesuré (> 0) ou rien, jamais « 0 ».
    ...offersVolumeOf(raw),
    ...skillEvidenceOf(raw),
    ...widenedByOf(raw),
    ...provenanceOf(raw),
    // #3757 (reste) — même chaîne coupée : un fait déclaré, pas une hypothèse NAF.
    ...(typeof raw.isDeclaredPartner === 'boolean' ? { isDeclaredPartner: raw.isDeclaredPartner } : {}),
    // #3408 — la pile OBSERVÉE (mémoire marché, `annotateObservedStacks` côté API) : même
    // chaîne coupée, elle nourrit le « Périmètre conseillé » quand aucune offre ne nomme de techno.
    ...namedList('technologiesObserved', raw.technologiesObserved),
    // #4067 — même chaîne coupée : les axes de sources (`DiscoverSourcesService`
    // côté API). Validés par le schéma partagé — un objet malformé ne fait
    // aucun axe, jamais un axe à moitié vrai.
    ...sourceAxesOf(raw.sourceAxes),
  }
}

function sourceAxesOf(value: unknown): { sourceAxes?: DiscoverSourceAxes } {
  if (value === undefined || value === null) return {}
  const parsed = discoverSourceAxesSchema.safeParse(value)
  return parsed.success ? { sourceAxes: parsed.data } : {}
}

/**
 * #2614.1 — le verdict du conseil de qualification voyage AVEC le candidat
 * (`apps/ia/app/routers/discover.py`, `candidate["qualification"] = qualification`)
 * mais cette fonction reconstruit `DiscoverCandidate` CHAMP PAR CHAMP et
 * `qualification` n'y figurait jusqu'ici jamais lu — la chaîne coupée :
 * `hiddenCandidatesBreakdown` comptait donc TOUJOURS 0 exclu côté écran, sur
 * les cinq sous-onglets, quel que soit le verdict réel rendu par le backend.
 *
 * `verdict` hors énum (payload d'avant cette fonctionnalité, ou illisible)
 * ⇒ objet ENTIER absent, jamais un verdict deviné.
 */
function normalizeQualification(value: unknown): DiscoverQualification | undefined {
  const raw = asRecord(value)
  if (!raw) return undefined
  const verdict = str(raw.verdict)
  if (!verdict || !QUALIFICATION_VERDICTS.has(verdict)) return undefined
  return {
    verdict: verdict as DiscoverQualification['verdict'],
    code: str(raw.code),
    reason: str(raw.reason) ?? '',
    otherCodes: asArray(raw.otherCodes)
      .map(str)
      .filter((code): code is string => code !== null),
    ...subsidiariesOf(raw.subsidiaries),
    ...sectorAttachmentOf(raw.sectorAttachment),
  }
}

// #4358.4 — le rattachement par l'activité ou le site ; une valeur inconnue n'est pas rendue.
function sectorAttachmentOf(value: unknown): {
  sectorAttachment?: NonNullable<DiscoverQualification['sectorAttachment']>
} {
  const raw = asRecord(value)
  const sector = raw ? str(raw.sector) : null
  const via = raw ? str(raw.via) : null
  if (!sector || (via !== 'activity' && via !== 'site')) return {}
  return { sectorAttachment: { sector, via } }
}

function subsidiariesOf(value: unknown): { subsidiaries?: Array<{ name: string }> } {
  const names = asArray(value)
    .map(item => str(asRecord(item)?.name))
    .filter((name): name is string => name !== null)
  return names.length > 0 ? { subsidiaries: names.map(name => ({ name })) } : {}
}

function normalizeDegraded(value: unknown): DiscoverDegradedSource | null {
  const raw = asRecord(value)
  const source = str(raw?.source)
  if (!source) return null
  const rawCount = num(raw?.count)
  const kind = str(raw?.kind)
  const fields = asArray(raw?.fields)
    .map(field => str(field))
    .filter((field): field is string => field !== null)
  return {
    source,
    reason: str(raw?.reason) ?? '',
    ...(rawCount !== null && rawCount >= 0 ? { count: Math.round(rawCount) } : {}),
    ...(kind ? { kind } : {}),
    ...(fields.length > 0 ? { fields } : {}),
  }
}

/** Compteur de couverture : un entier ≥ 0, sinon 0. Un compteur illisible ne
 *  doit jamais devenir un chiffre affiché — on préfère « 0 » à une invention. */
function count(value: unknown): number {
  const n = num(value)
  return n === null || n < 0 ? 0 : Math.round(n)
}

/**
 * #2489.3/D1 — `undefined` quand l'espace n'a déclaré aucune cible (jamais
 * `{applied: false, excludedCount: 0}` inventé) : un payload illisible ou
 * sans `applied` booléen ne fabrique PAS de compteur, il en absente un —
 * même prudence que le reste de ce module (« ne lève jamais, une réponse
 * illisible est une liste vide, pas un écran blanc »).
 */
function normalizeTargetSectorFilter(value: unknown): DiscoverTargetSectorFilter | undefined {
  const raw = asRecord(value)
  if (!raw || typeof raw.applied !== 'boolean') return undefined
  return {
    applied: raw.applied,
    excludedCount: count(raw.excludedCount),
    excludedSectors: asArray(raw.excludedSectors)
      .map(str)
      .filter((sector): sector is string => sector !== null),
  }
}

/** #4361.2 — le compteur de « Exclure les sociétés cotées ». Illisible (pas de booléen `applied`) =
 *  absent : jamais un « 0 retirée » inventé. */
function normalizeListingFilter(value: unknown): DiscoverListingFilter | undefined {
  const raw = asRecord(value)
  if (!raw || typeof raw.applied !== 'boolean') return undefined
  return {
    applied: raw.applied,
    excludedCount: count(raw.excludedCount),
    unknownCount: count(raw.unknownCount),
    sourceAvailable: raw.sourceAvailable !== false,
  }
}

function normalizeCoverage(value: unknown): DiscoverCoverage | null {
  const raw = asRecord(value)
  if (!raw) return null
  return {
    candidatesFound: count(raw.candidatesFound),
    resolutionsAttempted: count(raw.resolutionsAttempted),
    resolved: count(raw.resolved),
    rejectedAmbiguous: count(raw.rejectedAmbiguous),
    rejectedUnreachable: count(raw.rejectedUnreachable),
    notExamined: count(raw.notExamined),
    // #4319.2 — des noms lisibles ou rien : une liste sans élément ne fait aucune ligne.
    notIdentifiedNames: asArray(raw.notIdentifiedNames).flatMap(name => {
      const clean = str(name)?.trim()
      return clean ? [clean] : []
    }),
    stoppedOn: str(raw.stoppedOn) ?? 'complete',
    resolveOffset: count(raw.resolveOffset),
    hasMore: raw.hasMore === true,
    ...(typeof raw.filteredByEntityType === 'number' && raw.filteredByEntityType > 0
      ? { filteredByEntityType: Math.floor(raw.filteredByEntityType) }
      : {}),
  }
}

/**
 * Rend une réponse Découvrir exploitable, quelle que soit la qualité du payload.
 * Ne lève jamais : une réponse illisible est une liste vide, pas un écran blanc.
 * La déduplication se fait sur le SIREN (identité légale) et non sur le nom.
 */
export function normalizeDiscoverResponse(payload: unknown): DiscoverResponse {
  const raw = asRecord(payload)
  const seen = new Set<string>()
  const candidates: DiscoverCandidate[] = []
  const zoneWidening = normalizeZoneWidening(raw?.zoneWidening)

  for (const entry of asArray(raw?.candidates)) {
    const candidate = normalizeCandidate(entry, zoneWidening?.place)
    if (!candidate || seen.has(candidate.siren)) continue
    seen.add(candidate.siren)
    candidates.push(candidate)
  }

  const targetSectorFilter = normalizeTargetSectorFilter(raw?.targetSectorFilter)
  const listingFilter = normalizeListingFilter(raw?.listingFilter)
  // COMPETENCE-TROUVE — un intermédiaire hors contrat (nature inconnue, sans nom) n'est pas affiché.
  const widening = discoverResponseSchema.shape.widening.safeParse(raw?.widening)
  const skillIntermediaries = asArray(raw?.skillIntermediaries).flatMap(entry => {
    const parsed = discoverSkillIntermediarySchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
  // #4674 — un employeur « identité en cours » hors contrat (sans nom, état inconnu) n'est pas affiché.
  const skillPendingEmployers = asArray(raw?.skillPendingEmployers).flatMap(entry => {
    const parsed = discoverSkillPendingEmployerSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })

  return {
    candidates,
    query: asRecord(raw?.query) ?? {},
    degraded: asArray(raw?.degraded)
      .map(normalizeDegraded)
      .filter((d): d is DiscoverDegradedSource => d !== null),
    coverage: normalizeCoverage(raw?.coverage),
    ...(typeof raw?.needsFilteredOut === 'number' && raw.needsFilteredOut > 0
      ? { needsFilteredOut: Math.floor(raw.needsFilteredOut) }
      : {}),
    ...(targetSectorFilter ? { targetSectorFilter } : {}),
    ...(listingFilter ? { listingFilter } : {}),
    ...(zoneWidening ? { zoneWidening } : {}),
    ...(raw?.jobsPending === true ? { jobsPending: true } : {}),
    ...(skillIntermediaries.length > 0 ? { skillIntermediaries } : {}),
    ...(skillPendingEmployers.length > 0 ? { skillPendingEmployers } : {}),
    ...(widening.success && widening.data ? { widening: widening.data } : {}),
  }
}

/** Signaux du plus récent au plus ancien — copie, l'entrée n'est pas mutée. */
export function sortSignalsByDate(signals: readonly DiscoverSignal[]): DiscoverSignal[] {
  return [...signals].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/**
 * #4045.3 — l'ordre D'AFFICHAGE des signaux d'un compte : ceux qui recoupent le mot-clé de la recherche
 * (`keywordMatch`, posé par le serveur) d'abord, puis du plus récent au plus ancien. Sans mot-clé, c'est
 * exactement `sortSignalsByDate`. (`sortSignalsByDate` reste l'ordre « le plus frais » des autres lecteurs.)
 */
export function sortSignalsForDisplay(signals: readonly DiscoverSignal[]): DiscoverSignal[] {
  const byDate = sortSignalsByDate(signals)
  return [...byDate.filter(s => s.keywordMatch === true), ...byDate.filter(s => s.keywordMatch !== true)]
}

/** Somme des contributions signées — permet à l'UI de montrer que le score
 *  affiché correspond bien à la rubrique détaillée. */
export function scoreFactorTotal(factors: readonly DiscoverScoreFactor[]): number {
  return factors.reduce((total, factor) => total + factor.points, 0)
}

/** `552100554` → `552 100 554`. Une entrée inattendue ressort telle quelle. */
export function formatSiren(siren: string): string {
  return /^\d{9}$/.test(siren) ? `${siren.slice(0, 3)} ${siren.slice(3, 6)} ${siren.slice(6)}` : siren
}
