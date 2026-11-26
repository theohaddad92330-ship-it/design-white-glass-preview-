import type {
  AuditContradiction,
  AuditUnknown,
  CommercialTensionRuleId,
  ProfileContext,
  RenewalStatus,
  Submission,
  TalentStats,
} from '@bellum/contracts'

/**
 * #2064.1-.12 — le MOTEUR des douze détecteurs de tension.
 * #2066.11-.16 — six détecteurs supplémentaires, le jour où #2066 remplace la
 * chaîne à six macro-étapes par la chaîne fine à neuf (voir `audit-chain.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, ET POURQUOI IL RESTE PUR
 * ─────────────────────────────────────────────────────────────────────────
 * L'écran `/settings/profile/audit` tourne en production et il est honnête —
 * il NOMME « non mesuré » plutôt que d'inventer. Mais jusqu'à ce lot,
 * `buildCommercialAuditContext` écrivait `contradictions: null`
 * inconditionnellement : aucun détecteur n'existait pour produire ce bloc. Ce
 * fichier EST la source qui manquait.
 *
 * ⚠️ Le corollaire du lot, à tenir sur CHAQUE détecteur : tant qu'il n'a pas
 * de fait à lire, il rend `unknown` (« inconnu »), jamais `clear` (« rien à
 * signaler »). Confondre les deux ferait dire à l'écran « tout va bien »
 * quand la vraie réponse est « je ne sais pas » — exactement le défaut que le
 * reste du produit évite depuis des mois (`UnknownValue` vs `MeasuredValue`).
 *
 * Comme `build-audit.ts`, ce module reste SANS React et SANS i18n : c'est ce
 * qui permet à un test de lui faire dire NON directement. Les LIBELLÉS fixes
 * de chaque règle (le nom court d'une tension) vivent en i18n
 * (`commercialAudit.tensions.rule.<ruleId>.label`, FR+EN) ; les FAITS et le
 * corps de chaque tension produits ICI sont du contenu personnalisé — de la
 * même nature que `coachingInsights.mainWeakness` ou `bellumPhrases.welcome`,
 * jamais retraduits ailleurs dans le produit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2066.18 — CHAQUE RUPTURE PORTE MAINTENANT UNE RECOMMANDATION ET UN
 * INDICATEUR, PAS SEULEMENT UN CONSTAT
 * ─────────────────────────────────────────────────────────────────────────
 * Une rupture SANS geste à faire ensuite est un reproche, pas un audit :
 * `recommendation` nomme le geste concret ; `indicator` nomme ce qu'il
 * faudrait mesurer pour vérifier qu'il a été fait. Les deux sont du texte
 * personnalisé, au même titre que `tension` — jamais une probabilité, jamais
 * un jugement sur la personne (#2066.17 situe un ENDROIT de la chaîne, pas
 * une faute).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS DÉTECTEURS D'ORIGINE (#2064.9/.11/.12) ONT UN VOISIN DÉJÀ LIVRÉ, ET
 * NE LE RECODENT PAS — LES SIX NOUVEAUX (#2066.11-.16) SUIVENT LA MÊME RÈGLE
 * ─────────────────────────────────────────────────────────────────────────
 * `.9` (partenaires), `.11` (appels d'offres) et `.12` (missions) lisent une
 * réalité que trois modules NestJS suivent déjà : `apps/api/src/modules/
 * partners`, `apps/api/src/modules/rfp` + `decision-gates`, et
 * `apps/api/src/modules/capitalisation`. `.11-.16` (#2066) lisent de même le
 * vocabulaire de `contacts`, `qualification-leads`, `consultants`,
 * `meeting-notes`, `delivery` et `account-feedback` — mais AUCUN de ces
 * modules n'expose encore les compteurs qu'il faudrait ici, et câbler un vrai
 * comptage cross-module dans une dérivation web PURE et SYNCHRONE
 * (`build-audit.ts`) est un chantier séparé. Ce lot pose la FORME
 * (`CommercialTensionExternalSignals`, ci-dessous) avec le VOCABULAIRE de ces
 * modules, et chaque détecteur rend honnêtement `unknown` tant que rien ne la
 * remplit — `build-audit.ts` n'appelle `detectCommercialTensions` qu'avec
 * `context`, jamais `signals` : c'est la même discipline que le reste de ce
 * contrat (`thirtyDayPlan`, `milestones`… restent `null` pour la même
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ #2074.12 (W43, 24/09/2026) — `candidatePool` N'EST PLUS DANS CE TROU
 * ─────────────────────────────────────────────────────────────────────────
 * Contrairement aux six autres, `consultants` exposait DÉJÀ le compteur
 * demandé : le bandeau du vivier (`TalentStatsBanner.tsx`, écran Vivier) lit
 * `useTalentStats()` → `GET /talents/stats` → `TalentService.stats()`, qui
 * rend `{ total, availableNow }` sur TOUT l'espace — exactement le
 * VOCABULAIRE que `candidatePool` réclamait. Rien n'est recalculé ni inventé
 * ici : `build-audit.ts` reçoit ce MÊME objet (nouveau paramètre
 * `talentStats`, même convention que `myActions`) et le relaie tel quel.
 * `detectPoolWithoutAvailability` (#2064.5) sort donc du diagnostic honnête,
 * et REND `triggered`/`clear` — jamais 0 inventé sur les sept autres champs
 * de `CommercialTensionExternalSignals`, toujours sans producteur.
 * raison : « pas encore de source », nommé).
 */

/** #2064.2 — au-delà de ce nombre de secteurs prioritaires SIMULTANÉS, une
 *  seule activité commerciale se disperse. Mesuré en démonstration :
 *  `DEMO_PROFILE_CONTEXT` en nomme 4 et déclenche la règle — ni un hasard, ni
 *  un seuil arbitraire caché : il est nommé ici, une seule fois. */
export const MAX_SIMULTANEOUS_MARKETS = 3

/** #2064.6 — sous ce ratio de besoins qualifiés, la qualification n'est plus
 *  la règle mais l'exception. */
export const NEEDS_QUALIFICATION_MIN_RATIO = 0.5

/** #2064.1 — nombre de semaines utilisé pour convertir une cadence
 *  hebdomadaire recommandée en capacité mensuelle IMPLIQUÉE (jamais mesurée
 *  telle quelle : `capacity.state === 'unknown'` ailleurs dans ce contrat le
 *  dit déjà, cette conversion reste une hypothèse nommée, pas un fait). */
const MONTHLY_WEEKS = 4

type TensionDetectorOutcome =
  | { status: 'triggered'; contradiction: AuditContradiction }
  | { status: 'clear' }
  | { status: 'unknown'; label: string; reason: string }

/**
 * Le vocabulaire des modules voisins (#2064.9/.11/.12, #2066.11-.16), en
 * attente d'être rempli par un chantier séparé — voir le docblock plus haut.
 * `null` ou absent = strictement « aucun signal relié », jamais un compte à
 * zéro deviné.
 */
export type CommercialTensionExternalSignals = {
  /** #4422.3 — l'espace est au forfait/conseil ET spécialisé sur une fonction
   *  (`hasFunctionalSpecialization`, contracts) : la diversité de secteurs
   *  n'est alors pas une dispersion. Calculé par `build-audit.ts`, jamais ici. */
  functionalSpecialization?: boolean
  /** #2064.5 — le vivier de consultants (écran « Vivier »). #2074.12 —
   *  `availabilityUnknown` : les fiches sans aucune affectation enregistrée,
   *  dont on ne peut dire ni « disponible » ni « occupée ». */
  candidatePool?: { total: number; availableNow: number; availabilityUnknown?: number } | null
  /** #2064.6 — les besoins clients ouverts. */
  clientNeeds?: { total: number; qualified: number } | null
  /** #2064.7 — les profils présentés à un client. */
  candidateSubmissions?: { total: number; withClientEngagement: number } | null
  /** #2064.9 — voisin `apps/api/src/modules/partners`. */
  partners?: { total: number; withEconomics: number; withFeedback: number } | null
  /** #2064.10 — le contenu produit (articles, études de cas…). */
  content?: { total: number; withCommercialUse: number } | null
  /** #2064.11 — voisin `apps/api/src/modules/rfp` + `decision-gates`. */
  rfps?: { total: number; withDecision: number } | null
  /** #2064.12 — voisin `apps/api/src/modules/capitalisation`. */
  missions?: { completed: number; withCapitalisation: number } | null
  /** #2066.11 — voisin `apps/api/src/modules/contacts` (date de reprise). */
  contactFollowUps?: { total: number; withNextStepDate: number } | null
  /** #2066.12 — voisin `apps/api/src/modules/qualification-leads`. */
  needDetailing?: { total: number; withOnlyATitle: number } | null
  /** #2066.13 — voisin `apps/api/src/modules/consultants` (sécurisation). */
  candidateSecurisation?: { total: number; secured: number } | null
  /** #2066.14 — voisin `apps/api/src/modules/meeting-notes`. */
  interviews?: { total: number; withFollowUp: number } | null
  /** #2066.15 — voisin `apps/api/src/modules/delivery` (missions éligibles
   *  à un renouvellement). */
  missionRenewals?: { eligibleForRenewal: number; renewed: number } | null
  /** #2066.16 — voisin `apps/api/src/modules/account-feedback`. */
  missionFeedback?: { total: number; recorded: number } | null
}

function triggered(
  ruleId: CommercialTensionRuleId,
  facts: string[],
  tension: string,
  possibleExplanation: string,
  questionToValidate: string,
  consequenceIfUnaddressed: string,
  recommendation: string,
  indicator: string,
): TensionDetectorOutcome {
  return {
    status: 'triggered',
    contradiction: {
      ruleId,
      facts,
      tension,
      possibleExplanation,
      questionToValidate,
      consequenceIfUnaddressed,
      // #2066.18 — le geste concret, et ce qui prouverait qu'il a été fait.
      recommendation,
      indicator,
      // Une règle déduite d'une seule source (le profil, ou un signal isolé)
      // — jamais `corroborated` : rien ici n'a été recoupé entre plusieurs
      // sources indépendantes.
      confidence: 'deduced',
    },
  }
}

function unknown(label: string, reason: string): TensionDetectorOutcome {
  return { status: 'unknown', label, reason }
}

function clear(): TensionDetectorOutcome {
  return { status: 'clear' }
}

/** Les entrées non vides d'une liste de chaînes — même règle que `build-audit.ts`. */
function trimmedEntries(values: readonly string[]): string[] {
  return values.map(v => v.trim()).filter(v => v.length > 0)
}

// #2064.1 — des objectifs supérieurs à la capacité.
export function detectObjectivesAboveCapacity(context: ProfileContext | null | undefined): TensionDetectorOutcome {
  const coaching = context?.coachingInsights
  if (!coaching)
    return unknown('Objectifs vs capacité', 'aucune lecture des réponses (coachingInsights) n’est encore disponible')
  const targets = coaching.kpiTargets
  if (!targets) return unknown('Objectifs vs capacité', 'aucun objectif chiffré n’a été fixé (kpiTargets absent)')
  const cadence = coaching.cadenceRecommendation
  if (!cadence) return unknown('Objectifs vs capacité', 'aucune cadence recommandée n’a été calculée')

  const impliedMonthlyCapacity = cadence.analysesPerWeek * MONTHLY_WEEKS
  if (targets.accountsPerMonth > impliedMonthlyCapacity) {
    return triggered(
      'objectivesAboveCapacity',
      [
        `Objectif : ${targets.accountsPerMonth} comptes analysés par mois`,
        `Cadence recommandée : ${cadence.analysesPerWeek} analyses par semaine, soit environ ${impliedMonthlyCapacity} par mois`,
      ],
      "L'objectif mensuel de comptes dépasse ce que la cadence recommandée permet d'analyser.",
      "Le rythme recommandé a pu être fixé avant que l'objectif ne soit revu à la hausse, ou l'objectif inclut des comptes déjà en portefeuille qui n'ont pas besoin d'une nouvelle analyse.",
      "Faut-il revoir l'objectif mensuel, ou augmenter la cadence d'analyses ?",
      "Sans ajustement, l'objectif se fixe sur un rythme que la cadence recommandée ne peut pas tenir.",
      "Revoir l'objectif mensuel à la baisse, ou augmenter la cadence d'analyses recommandée.",
      "Écart entre l'objectif mensuel de comptes et la capacité mensuelle implicite (cadence × 4 semaines).",
    )
  }
  return clear()
}

// #2064.2 — trop de marchés simultanés.
export function detectTooManySimultaneousMarkets(
  context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const ideal = context?.idealAccountProfile
  if (!ideal) return unknown('Marchés simultanés', 'aucun profil de compte idéal n’est encore établi')
  // #4422.3 — spécialisation fonctionnelle (forfait/conseil, un seul métier) : la
  // dispersion se juge sur les métiers, pas sur les secteurs. Le pourquoi est dit
  // sur l'axe Ciblage (`maturity-axes.ts`).
  if (signals?.functionalSpecialization) return clear()
  const sectors = trimmedEntries(ideal.sectorsPriority)
  if (sectors.length > MAX_SIMULTANEOUS_MARKETS) {
    return triggered(
      'tooManySimultaneousMarkets',
      [`${sectors.length} secteurs prioritaires nommés : ${sectors.join(', ')}`],
      `Plus de ${MAX_SIMULTANEOUS_MARKETS} secteurs visés à la fois, pour une seule activité commerciale.`,
      'Une phase exploratoire avant resserrement, ou plusieurs commerciaux qui couvrent chacun un secteur, peuvent expliquer ce nombre.',
      'Combien de secteurs comptes-tu vraiment travailler activement ce trimestre ?',
      'La prospection se disperse et aucun secteur ne devient un point fort reconnu.',
      `Resserrer la liste des secteurs prioritaires à ${MAX_SIMULTANEOUS_MARKETS} au maximum pour ce trimestre.`,
      'Nombre de secteurs prioritaires nommés simultanément.',
    )
  }
  return clear()
}

// #2064.3 — une offre sans preuve.
export function detectOfferWithoutProof(context: ProfileContext | null | undefined): TensionDetectorOutcome {
  const messaging = context?.messagingStyle
  if (!messaging) return unknown('Offre sans preuve', 'aucun style de messagerie n’est encore établi')
  const angle = messaging.valuePropositionAngle.trim()
  const points = trimmedEntries(messaging.differentiationPoints)
  if (angle.length > 0 && points.length === 0) {
    return triggered(
      'offerWithoutProof',
      [`Angle de valeur formulé : « ${angle} »`, 'Aucun point de différenciation nommé'],
      'Une offre affirmée, sans aucun point de différenciation nommé pour la crédibiliser.',
      'Les points de différenciation existent peut-être déjà, sans avoir encore été mis en mots pour ce profil.',
      'Quelles preuves concrètes (référence, résultat, méthode) appuient cet angle ?',
      "Un prospect qui challenge l'angle n'a rien de nommé à quoi se raccrocher.",
      "Nommer au moins un point de différenciation concret pour appuyer l'angle de valeur.",
      'Nombre de points de différenciation nommés.',
    )
  }
  return clear()
}

// #2064.4 — de l'acquisition sans routine.
export function detectAcquisitionWithoutRoutine(context: ProfileContext | null | undefined): TensionDetectorOutcome {
  const cadence = context?.coachingInsights?.cadenceRecommendation
  if (!cadence)
    return unknown('Acquisition sans routine', 'aucune cadence d’acquisition recommandée n’est encore calculée')
  const parameters = context?.analysisParameters
  if (!parameters) {
    return triggered(
      'acquisitionWithoutRoutine',
      [
        `Cadence recommandée : ${cadence.analysesPerWeek} analyses/semaine, ${cadence.messagesPerDay} messages/jour`,
        "Aucune routine d'analyse configurée",
      ],
      "Une cadence d'acquisition est recommandée sans routine d'analyse configurée pour la tenir.",
      'La routine peut exister ailleurs (agenda, CRM) sans être encore déclarée dans le profil.',
      'Où et quand cette cadence est-elle réellement tenue ?',
      'Une cadence recommandée mais non outillée retombe vite au premier pic de charge.',
      "Déclarer la routine d'analyse (jour, créneau, volume) qui doit tenir la cadence recommandée.",
      "Présence d'une routine d'analyse configurée.",
    )
  }
  return clear()
}

// #2064.5 — un vivier sans disponibilité.
export function detectPoolWithoutAvailability(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const pool = signals?.candidatePool
  if (!pool)
    return unknown('Vivier sans disponibilité', "aucune donnée de vivier de consultants n'est reliée à cet audit")
  // #2074.12 — seule la part du vivier dont la disponibilité est CONNUE peut
  // conclure « aucun disponible » : une fiche sans affectation enregistrée
  // n'est ni disponible ni occupée (`talentStatsSchema.availabilityUnknownCount`).
  const unknownCount = pool.availabilityUnknown ?? 0
  const knownCount = pool.total - unknownCount
  if (pool.total > 0 && knownCount <= 0)
    return unknown(
      'Vivier sans disponibilité',
      "aucune affectation n'est enregistrée pour les profils du vivier : leur disponibilité n'est pas mesurable",
    )
  if (pool.total > 0 && pool.availableNow === 0) {
    const facts = [`${pool.total} profils au vivier`]
    if (unknownCount > 0)
      facts.push(
        `${unknownCount} sans affectation enregistrée (disponibilité inconnue)`,
        `Aucun disponible immédiatement parmi les ${knownCount} dont la disponibilité est connue`,
      )
    else facts.push('Aucun disponible immédiatement')
    return triggered(
      'poolWithoutAvailability',
      facts,
      "Un vivier de profils existe, mais aucun n'est disponible immédiatement.",
      "Les profils sont peut-être tous en mission, ou leur disponibilité n'est pas à jour.",
      'La disponibilité de ces profils est-elle à jour ?',
      'Une opportunité qui se présente ne peut être servie sans consultant disponible.',
      'Mettre à jour la disponibilité des profils du vivier, ou en qualifier de nouveaux.',
      'Part du vivier disponible immédiatement.',
    )
  }
  return clear()
}

// #2064.6 — des besoins sans qualification.
export function detectNeedsWithoutQualification(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const needs = signals?.clientNeeds
  if (!needs) return unknown('Besoins sans qualification', "aucune donnée de besoins clients n'est reliée à cet audit")
  if (needs.total > 0 && needs.qualified / needs.total < NEEDS_QUALIFICATION_MIN_RATIO) {
    return triggered(
      'needsWithoutQualification',
      [`${needs.total} besoins ouverts`, `${needs.qualified} qualifiés`],
      `Moins de ${NEEDS_QUALIFICATION_MIN_RATIO * 100}% des besoins ouverts ont été qualifiés.`,
      'Le volume de besoins entrants a pu dépasser la capacité de qualification du moment.',
      'Quels besoins qualifier en priorité cette semaine ?',
      'Un besoin non qualifié se traite au hasard, ou pas du tout.',
      'Qualifier en priorité les besoins ouverts les plus anciens avant d’en ouvrir de nouveaux.',
      'Part des besoins ouverts qualifiés.',
    )
  }
  return clear()
}

// #2064.7 — des profils présentés sans engagement.
export function detectProfilesWithoutCommitment(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const submissions = signals?.candidateSubmissions
  if (!submissions)
    return unknown('Profils sans engagement', "aucune donnée de profils présentés n'est reliée à cet audit")
  if (submissions.total > 0 && submissions.withClientEngagement === 0) {
    return triggered(
      'profilesWithoutCommitment',
      [`${submissions.total} profils présentés`, 'Aucun engagement client enregistré'],
      "Des profils sont présentés sans qu'aucun engagement client (retour, entretien, décision) ne soit enregistré.",
      'Les retours clients peuvent exister hors de ce que cet audit peut observer.',
      'Où est tracé le retour du client sur ces profils ?',
      'Un profil présenté sans suite connue ne dit rien de la solidité du dossier.',
      'Tracer systématiquement le retour client (entretien, décision) après chaque profil présenté.',
      'Part des profils présentés avec un engagement client enregistré.',
    )
  }
  return clear()
}

// #2064.8 — des grands comptes sans voie d'accès.
export function detectKeyAccountsWithoutAccessPath(context: ProfileContext | null | undefined): TensionDetectorOutcome {
  const ideal = context?.idealAccountProfile
  if (!ideal) return unknown('Grands comptes sans voie d’accès', 'aucun profil de compte idéal n’est encore établi')
  const targetsKeyAccounts = ideal.size === 'grandCompte' || ideal.size === 'all'
  if (targetsKeyAccounts && ideal.entryStrategy === 'bottomUp') {
    return triggered(
      'keyAccountsWithoutAccessPath',
      [
        `Taille visée : ${ideal.size}`,
        `Stratégie d'entrée retenue : ${ideal.entryStrategy}`,
        `Niveau de décision visé : ${ideal.decisionLevel}`,
      ],
      "Les grands comptes visés supposent un accès décideur, alors que l'entrée retenue part du terrain.",
      "L'entrée par le terrain peut être un choix délibéré pour identifier le bon relais avant de monter au niveau décideur.",
      'Cette entrée par le terrain a-t-elle déjà permis d’atteindre le niveau décideur sur un grand compte ?',
      "Le dossier peut s'arrêter avant d'atteindre qui décide vraiment.",
      'Identifier le relais qui peut faire remonter le dossier au niveau décideur visé.',
      'Nombre de grands comptes ayant atteint le niveau décideur visé.',
    )
  }
  return clear()
}

// #2064.9 — des partenaires sans économie ni feedback (voisin `partners`).
export function detectPartnersWithoutEconomicsOrFeedback(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const partners = signals?.partners
  if (!partners)
    return unknown(
      'Partenaires sans économie ni feedback',
      "le module partenaires ne relie pas encore l'économie ni le feedback par partenaire à cet audit",
    )
  if (partners.total > 0 && (partners.withEconomics === 0 || partners.withFeedback === 0)) {
    return triggered(
      'partnersWithoutEconomicsOrFeedback',
      [
        `${partners.total} partenaires`,
        `${partners.withEconomics} avec une économie connue`,
        `${partners.withFeedback} avec un feedback enregistré`,
      ],
      'Des partenariats existent sans économie connue ou sans feedback enregistré sur leur exécution.',
      "L'économie et le feedback peuvent être suivis ailleurs, par exemple dans un contrat ou un échange oral.",
      "Quelle est l'économie réelle de ces partenariats, et comment se sont-ils passés ?",
      "Un partenariat sans économie ni feedback connus se reconduit ou s'arrête au hasard.",
      "Documenter l'économie et recueillir un feedback sur chaque partenariat actif.",
      'Part des partenaires avec économie ET feedback enregistrés.',
    )
  }
  return clear()
}

// #2064.10 — du contenu sans exploitation commerciale.
export function detectContentWithoutCommercialUse(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const content = signals?.content
  if (!content)
    return unknown('Contenu sans exploitation commerciale', "aucune donnée de contenu n'est reliée à cet audit")
  if (content.total > 0 && content.withCommercialUse === 0) {
    return triggered(
      'contentWithoutCommercialUse',
      [`${content.total} contenus produits`, 'Aucun réutilisé dans une action commerciale'],
      "Du contenu est produit sans qu'aucune trace ne montre qu'il sert la prospection.",
      'Le contenu peut être diffusé en dehors de ce que cet audit peut observer.',
      'Comment ce contenu est-il réutilisé auprès des comptes visés ?',
      'Du contenu produit sans usage commercial reste un coût sans retour mesuré.',
      'Relier chaque contenu produit à une action commerciale qui le réutilise.',
      'Part du contenu produit réutilisé dans une action commerciale.',
    )
  }
  return clear()
}

// #2064.11 — des appels d'offres sans GO/NO-GO (voisin `rfp` + `decision-gates`).
export function detectRfpsWithoutGoNoGo(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const rfps = signals?.rfps
  if (!rfps) return unknown('Appels d’offres sans GO/NO-GO', "aucun appel d'offres n'est relié à cet audit")
  if (rfps.total > 0 && rfps.withDecision < rfps.total) {
    return triggered(
      'rfpsWithoutGoNoGo',
      [`${rfps.total} appels d'offres reçus`, `${rfps.withDecision} avec une décision GO/NO-GO tracée`],
      "Des appels d'offres restent sans décision GO/NO-GO tracée.",
      'La décision a pu être prise oralement, sans être enregistrée.',
      'Quelle est la décision GO/NO-GO sur les appels d’offres restants ?',
      "Un appel d'offres sans décision consomme du temps de réponse sans arbitrage assumé.",
      "Trancher un GO/NO-GO sur chaque appel d'offres reçu, même informellement d'abord.",
      "Part des appels d'offres avec une décision GO/NO-GO tracée.",
    )
  }
  return clear()
}

// #2064.12 — des missions sans capitalisation (voisin `capitalisation`).
export function detectMissionsWithoutCapitalisation(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const missions = signals?.missions
  if (!missions) return unknown('Missions sans capitalisation', "aucune mission terminée n'est reliée à cet audit")
  if (missions.completed > 0 && missions.withCapitalisation === 0) {
    return triggered(
      'missionsWithoutCapitalisation',
      [`${missions.completed} missions terminées`, 'Aucune capitalisation enregistrée'],
      "Des missions se terminent sans qu'aucune capitalisation (retour d'expérience, référence, preuve) ne soit enregistrée.",
      'La capitalisation peut être faite ailleurs, sans être encore reliée à ces missions.',
      "Quelle preuve ou retour d'expérience peut-on tirer de ces missions terminées ?",
      'Une mission qui se termine sans capitalisation est une preuve commerciale perdue.',
      'Recueillir une preuve ou un retour d’expérience à la fin de chaque mission.',
      'Part des missions terminées avec une capitalisation enregistrée.',
    )
  }
  return clear()
}

// #2066.11 — un contact sans date de reprise (voisin `contacts`).
export function detectContactWithoutFollowUpDate(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const contacts = signals?.contactFollowUps
  if (!contacts)
    return unknown('Contact sans date de reprise', "aucune donnée de suivi de contact n'est reliée à cet audit")
  if (contacts.total > 0 && contacts.withNextStepDate === 0) {
    return triggered(
      'contactWithoutFollowUpDate',
      [`${contacts.total} contacts pris`, 'Aucune date de reprise fixée'],
      "Des contacts sont pris sans qu'aucune date de reprise ne soit fixée.",
      "La reprise a pu être convenue à l'oral, sans être notée nulle part.",
      'Quelle est la prochaine date de reprise sur ces contacts ?',
      'Un contact sans date de reprise se dilue dans la liste des choses à refaire un jour.',
      'Fixer une date de reprise avant de clore chaque échange, systématiquement.',
      'Part des contacts avec une date de reprise fixée.',
    )
  }
  return clear()
}

// #2066.12 — un besoin réduit à un intitulé (voisin `qualification-leads`).
export function detectNeedReducedToTitle(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const detailing = signals?.needDetailing
  if (!detailing)
    return unknown('Besoin réduit à un intitulé', "aucune donnée de détail de besoin n'est reliée à cet audit")
  if (detailing.total > 0 && detailing.withOnlyATitle > 0) {
    return triggered(
      'needReducedToTitle',
      [`${detailing.total} besoins ouverts`, `${detailing.withOnlyATitle} réduits à un simple intitulé`],
      "Des besoins existent en base sans rien au-delà d'un intitulé — ni contexte, ni contrainte, ni échéance.",
      "Le détail a pu être échangé oralement avant d'être noté, ou la qualification n'a pas encore eu lieu.",
      'Quel contexte, quelle contrainte et quelle échéance porte réellement ce besoin ?',
      'Un besoin réduit à un intitulé ne permet pas de préparer une proposition pertinente.',
      "Compléter chaque besoin d'un contexte, d'une contrainte et d'une échéance avant de le qualifier clos.",
      "Part des besoins ouverts avec plus qu'un simple intitulé.",
    )
  }
  return clear()
}

// #2066.13 — un profil non sécurisé (voisin `consultants`).
export function detectProfileNotSecured(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const securisation = signals?.candidateSecurisation
  if (!securisation)
    return unknown('Profil non sécurisé', "aucune donnée de sécurisation de profil n'est reliée à cet audit")
  if (securisation.total > 0 && securisation.secured === 0) {
    return triggered(
      'profileNotSecured',
      [`${securisation.total} profils engagés sur un dossier`, 'Aucun sécurisé (exclusivité, accord écrit)'],
      "Des profils sont engagés sur un dossier sans qu'aucun ne soit sécurisé auprès du consultant.",
      "L'accord peut être verbal, ou la sécurisation formelle peut ne pas encore être jugée nécessaire à ce stade.",
      'Ce profil est-il toujours disponible et engagé sur ce seul dossier ?',
      'Un profil non sécurisé peut se placer ailleurs pendant que le dossier avance.',
      'Sécuriser (accord écrit ou exclusivité) chaque profil engagé sur un dossier actif.',
      'Part des profils engagés effectivement sécurisés.',
    )
  }
  return clear()
}

// #2066.14 — un entretien sans suite (voisin `meeting-notes`).
export function detectInterviewWithoutFollowUp(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const interviews = signals?.interviews
  if (!interviews) return unknown('Entretien sans suite', "aucune donnée d'entretien n'est reliée à cet audit")
  if (interviews.total > 0 && interviews.withFollowUp === 0) {
    return triggered(
      'interviewWithoutFollowUp',
      [`${interviews.total} entretiens tenus`, 'Aucune suite enregistrée'],
      "Des entretiens ont lieu sans qu'aucune suite (décision, prochaine étape) ne soit enregistrée ensuite.",
      'La suite a pu être donnée oralement ou par un canal que cet audit ne voit pas.',
      'Quelle est la suite donnée à ces entretiens ?',
      'Un entretien sans suite connue laisse le dossier ouvert sans que personne ne sache où il en est.',
      'Noter la suite (décision ou prochaine étape) immédiatement après chaque entretien.',
      'Part des entretiens avec une suite enregistrée.',
    )
  }
  return clear()
}

// #2066.15 — une mission sans renouvellement (voisin `delivery`).
export function detectMissionWithoutRenewal(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const renewals = signals?.missionRenewals
  if (!renewals)
    return unknown('Mission sans renouvellement', "aucune donnée de renouvellement de mission n'est reliée à cet audit")
  if (renewals.eligibleForRenewal > 0 && renewals.renewed === 0) {
    return triggered(
      'missionWithoutRenewal',
      [`${renewals.eligibleForRenewal} missions éligibles à un renouvellement`, 'Aucune renouvelée'],
      'Des missions arrivées à échéance et éligibles à un renouvellement ne sont renouvelées dans aucun cas.',
      "Le client a pu choisir de ne pas renouveler pour une raison qui n'a pas encore été demandée, ou la relance n'a pas eu lieu à temps.",
      "La question du renouvellement a-t-elle été posée avant l'échéance ?",
      "Une mission qui s'arrête sans qu'on sache pourquoi ne dit rien à faire différemment sur la suivante.",
      "Poser la question du renouvellement avant l'échéance de chaque mission éligible.",
      'Part des missions éligibles effectivement renouvelées.',
    )
  }
  return clear()
}

// #2066.16 — un feedback non consigné (voisin `account-feedback`).
export function detectFeedbackNotRecorded(
  _context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): TensionDetectorOutcome {
  const feedback = signals?.missionFeedback
  if (!feedback) return unknown('Feedback non consigné', "aucune donnée de feedback n'est reliée à cet audit")
  if (feedback.total > 0 && feedback.recorded === 0) {
    return triggered(
      'feedbackNotRecorded',
      [`${feedback.total} missions terminées`, 'Aucun feedback client consigné'],
      "Des missions se terminent sans qu'aucun feedback client ne soit consigné.",
      'Le feedback a pu être donné oralement en fin de mission, sans être noté.',
      'Quel retour le client a-t-il fait sur cette mission ?',
      'Un feedback non consigné ne peut ni corriger la prochaine mission ni devenir une preuve commerciale.',
      'Consigner un feedback client à la clôture de chaque mission, même bref.',
      'Part des missions terminées avec un feedback consigné.',
    )
  }
  return clear()
}

type Detector = (
  context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
) => TensionDetectorOutcome

const ALL_DETECTORS: readonly Detector[] = [
  detectObjectivesAboveCapacity,
  detectTooManySimultaneousMarkets,
  detectOfferWithoutProof,
  detectAcquisitionWithoutRoutine,
  detectPoolWithoutAvailability,
  detectNeedsWithoutQualification,
  detectProfilesWithoutCommitment,
  detectKeyAccountsWithoutAccessPath,
  detectPartnersWithoutEconomicsOrFeedback,
  detectContentWithoutCommercialUse,
  detectRfpsWithoutGoNoGo,
  detectMissionsWithoutCapitalisation,
  detectContactWithoutFollowUpDate,
  detectNeedReducedToTitle,
  detectProfileNotSecured,
  detectInterviewWithoutFollowUp,
  detectMissionWithoutRenewal,
  detectFeedbackNotRecorded,
]

/**
 * #2457 — le compte TOTAL de règles, pour la raison DÉRIVÉE du verdict et de
 * la priorité de la semaine (`build-audit.ts`, `unestablished`) : « aucune
 * des 18 règles n'a détecté de rupture » NOMME combien ont été vérifiées,
 * jamais un « indisponible » nu. Une seule lecture (`ALL_DETECTORS.length`) —
 * un total écrit à la main dériverait le jour où une règle s'ajoute.
 */
export const TENSION_RULE_COUNT = ALL_DETECTORS.length

/**
 * L'AGRÉGATEUR — l'APPELANT de ce fichier est `buildCommercialAuditContext`
 * (`build-audit.ts`). Sans cet appel, chaque détecteur ci-dessus serait « du
 * code juste, calculé, testé, que personne n'appelle » — le défaut n°1 du
 * dépôt.
 *
 * `contradictions` est TOUJOURS un tableau (jamais `null`) : les 18 règles
 * tournent systématiquement, donc le bloc est toujours « mesuré » au sens du
 * contrat — vide s'il n'y a rien à signaler, rempli sinon. Ce qui n'a pas pu
 * être évalué part dans `unknowns`, jamais fondu dans le silence d'un tableau
 * vide.
 */
/**
 * #2074.12 — LE PREMIER PRODUCTEUR RÉEL de {@link CommercialTensionExternalSignals}.
 *
 * Le bandeau du vivier (`GET /talents/stats`, `talentStatsSchema`) compte déjà,
 * sur TOUT l'espace, les profils actifs, ceux disponibles maintenant et ceux
 * dont la disponibilité est inconnue. Il suffit à la règle #2064.5 — et donc au
 * mouvement « un engagement à faire avancer », qui ne pouvait JAMAIS sortir
 * tant qu'aucun signal n'était relié. Statistiques non lues ⇒ `{}` : chaque
 * règle à signal reste « inconnue », jamais un vivier à zéro deviné.
 *
 * Les autres signaux (besoins, positionnements, partenaires…) restent sans
 * producteur : chacun demande son propre compteur côté API, nommé dans le
 * docblock de tête.
 */
export function commercialTensionSignalsFromTalentStats(
  stats: Pick<TalentStats, 'total' | 'availableNow' | 'availabilityUnknownCount'> | null | undefined,
): CommercialTensionExternalSignals {
  if (!stats) return {}
  return {
    candidatePool: {
      total: stats.total,
      availableNow: stats.availableNow,
      availabilityUnknown: stats.availabilityUnknownCount,
    },
  }
}

/**
 * #2842.1 (épopée #2074.13-.19) — LE DEUXIÈME PRODUCTEUR RÉEL de
 * {@link CommercialTensionExternalSignals}.
 *
 * Les positionnements (`GET /submissions`, `useSubmissions()`) sont déjà lus
 * par l'écran Positionnements — aucun comptage backend neuf. `firstFeedbackAt`
 * EST l'engagement client que la règle #2064.7 réclame (« Où est tracé le
 * retour du client sur ces profils ? ») : le même fait que l'entonnoir des
 * positionnements compte déjà (`submissionFunnel`), jamais un second calcul
 * (GA-26). Non lu (chargement, erreur) ⇒ `{}` ; lu et vide ⇒
 * `{ total: 0, withClientEngagement: 0 }`, un zéro MESURÉ, jamais deviné.
 */
/**
 * #2842 (reste, 26/09) — `substatus` porte le détail « entretien tenu » que
 * `interviews` réclame (`SUBSTATUS_TO_STAGE`, seize valeurs) : deux positions
 * SEULEMENT comptent comme un entretien TENU (`interview_done`,
 * `second_interview`) — `interview_to_schedule`/`interview_scheduled` restent
 * un entretien à venir, pas un fait. `second_interview` EST la suite
 * (`withFollowUp`) : une deuxième rencontre programmée après le premier
 * entretien. Un positionnement déjà tranché (`selected`/`declined`…) sort du
 * champ d'observation courant — son substatus courant ne dit plus
 * « entretien » — donc il ne compte ni pour ni contre (mesuré sur ce qui est
 * observable maintenant, jamais une reconstitution d'historique).
 */
const INTERVIEW_HELD_SUBSTATUSES: ReadonlySet<string> = new Set(['interview_done', 'second_interview'])

export function commercialTensionSignalsFromSubmissions(
  submissions: readonly Pick<Submission, 'firstFeedbackAt' | 'substatus'>[] | null | undefined,
): CommercialTensionExternalSignals {
  if (!submissions) return {}
  const interviewsHeld = submissions.filter(
    submission => submission.substatus !== null && INTERVIEW_HELD_SUBSTATUSES.has(submission.substatus),
  )
  return {
    candidateSubmissions: {
      total: submissions.length,
      withClientEngagement: submissions.filter(submission => submission.firstFeedbackAt !== null).length,
    },
    interviews: {
      total: interviewsHeld.length,
      withFollowUp: interviewsHeld.filter(submission => submission.substatus === 'second_interview').length,
    },
  }
}

/**
 * #2842.2 (épopée #2074.13-.19) — LE TROISIÈME PRODUCTEUR RÉEL.
 *
 * L'écran de décision de renouvellement (`GET /delivery/renewals`,
 * `useRenewals()`) ne rend QUE les missions qui demandent encore une action
 * (`renewalsToAct`, `delivery.service.ts`) — exactement « éligible à un
 * renouvellement », aucun comptage backend neuf. `renewal_status ===
 * 'renouvele'` EST signé (`RENEWAL_STATUSES`, `mission.ts`), jamais une étape
 * intermédiaire parmi les sept autres. Non lu ⇒ `{}` ; lu et vide ⇒ un zéro
 * MESURÉ.
 */
export function commercialTensionSignalsFromRenewals(
  missions: readonly { renewal_status?: RenewalStatus | null }[] | null | undefined,
): CommercialTensionExternalSignals {
  if (!missions) return {}
  return {
    missionRenewals: {
      eligibleForRenewal: missions.length,
      renewed: missions.filter(mission => mission.renewal_status === 'renouvele').length,
    },
  }
}

/**
 * #2842 (reste, 26/09) — LE QUATRIÈME PRODUCTEUR RÉEL, un comptage backend
 * NEUF cette fois (`OpenNeedsService.commercialAuditSignals`,
 * `GET /projects/needs/commercial-audit-signals`) : contrairement à
 * `candidateSubmissions`/`missionRenewals`, aucun écran n'exposait déjà « des
 * besoins ouverts qualifiés » ni « réduits à un intitulé » — l'agrégat riche
 * de l'écran Besoins ouverts (`OpenNeedsCounters`) ne porte ni l'un ni
 * l'autre. Les deux comptes viennent de la MÊME requête serveur, sur la même
 * population (besoins ouverts, non archivés) — jamais un second calcul par
 * signal. Non lu (chargement, erreur) ⇒ `{}` ; lu ⇒ relayé tel quel, un zéro
 * MESURÉ si l'espace n'a aucun besoin ouvert.
 */
export function commercialTensionSignalsFromNeeds(
  signals: Pick<CommercialTensionExternalSignals, 'clientNeeds' | 'needDetailing'> | null | undefined,
): CommercialTensionExternalSignals {
  if (!signals) return {}
  return { clientNeeds: signals.clientNeeds, needDetailing: signals.needDetailing }
}

/**
 * #2842 (reste, 26/09) — LE CINQUIÈME PRODUCTEUR RÉEL, comptage backend NEUF
 * (`ContactsService.getFollowUpStats`, `GET /contacts/follow-up-stats`) :
 * `total` = les contacts PRIS (`contacts.email_sent_at`, le même fait que
 * `getDeliverability().sent`, GA-26) ; `withNextStepDate` = ceux qui ont
 * encore au moins une touche de cadence OUVERTE (`action_plan_items.
 * cadence_step IS NOT NULL AND done = false`) — la date de reprise que la
 * règle réclame. Non lu ⇒ `{}` ; lu ⇒ relayé tel quel.
 */
export function commercialTensionSignalsFromContactFollowUps(
  stats: CommercialTensionExternalSignals['contactFollowUps'] | null | undefined,
): CommercialTensionExternalSignals {
  if (!stats) return {}
  return { contactFollowUps: stats }
}

export function detectCommercialTensions(
  context: ProfileContext | null | undefined,
  signals?: CommercialTensionExternalSignals,
): { contradictions: AuditContradiction[]; unknowns: AuditUnknown[] } {
  const contradictions: AuditContradiction[] = []
  const unknowns: AuditUnknown[] = []
  for (const detect of ALL_DETECTORS) {
    const outcome = detect(context, signals)
    if (outcome.status === 'triggered') contradictions.push(outcome.contradiction)
    else if (outcome.status === 'unknown') unknowns.push({ label: outcome.label, reason: outcome.reason })
  }
  return { contradictions, unknowns }
}
