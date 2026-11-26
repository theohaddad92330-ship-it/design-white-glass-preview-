/**
 * Ce que la salle de démonstration répond À LA PLACE d'un modèle.
 *
 * Le bandeau de l'espace de démonstration promet trois choses : « données
 * fictives, aucun crédit consommé, les analyses réelles sont désactivées ».
 * Vérifié dans le navigateur le 03/08, trois écrans le démentaient :
 *
 * - **Découvrir** rendait de VRAIES entreprises avec leur SIREN (une caisse
 *   d'épargne, deux sociétés de conseil réelles) — dans un espace qui annonce
 *   des données fictives, à un prospect à qui on montre l'écran ;
 * - **Appels d'offres** faisait une analyse Claude complète sur le texte collé,
 *   trente-cinq secondes, depuis un lien PUBLIC ;
 * - le **plan d'attaque d'un besoin** et la **réécriture de CV** débitaient un
 *   crédit d'enrichissement, ce que le bandeau dit ne pas arriver.
 *
 * Le copilote, l'analyse de compte, les sujets de publication et le compte rendu
 * de rendez-vous étaient déjà scriptés. Ces réponses complètent la règle plutôt
 * que d'en inventer une : **en démonstration, aucun geste n'atteint un modèle,
 * un registre ou un fournisseur.** Le visiteur fait le geste, l'écran se
 * remplit, et rien ne part.
 *
 * Deux contraintes tiennent la fiction honnête :
 *
 * 1. tout ce qui ressemble à une identité est en `.example` et porte la mention
 *    « démo » — un prospect ne doit jamais repartir avec un SIREN qu'il croit
 *    vrai ;
 * 2. les réponses sont ANCRÉES sur le jeu de données fictif (`demo-dataset.ts`)
 *    et se disent scriptées quand elles ne peuvent pas l'être — jamais une
 *    référence client inventée.
 */

import type { CompiledNeed, DiscoverContractModel, DiscoverSourceFacts, ProjectSynthesis } from '@bellum/contracts'
import {
  computeDiscoverSourceAxes,
  DISCOVER_START_CITY_RADIUS_KM,
  needsZoneWidening,
  ZONE_AUTO_MAX_TIER,
} from '@bellum/contracts'
import { DEMO_REAL_DISCOVER_COMPANIES, demoRealCompanySignals } from './demo-discover-real-companies'
import { matchesTargetSectors } from '../accounts/similar-scoring'
import { DEMO_DELIVERY_CARRIER, DEMO_ESN_PROFILE } from './demo-dataset'

/**
 * #3819.1 (lot RBB2) — les cartes SCRIPTÉES de Découvrir que le contrôleur
 * rapproche du vrai portefeuille de la salle (`DiscoverPortfolioService`) : leur
 * `accountId` et leur « N besoins connus » viennent de la base, jamais d'un
 * nombre tapé ici. Le compte client semé (porteur des besoins) seulement.
 */
export const DEMO_DISCOVER_OWNED_CANDIDATE_NAMES: readonly string[] = [DEMO_DELIVERY_CARRIER]

/** Date de collecte affichée sous les sources du jeu fictif. Fixe : calculée,
 *  elle ferait glisser la démonstration sans que personne la relise. */
const DEMO_FETCHED_AT = '2026-08-01T09:00:00.000Z'

/**
 * #2546.2 — LA NATURE DU REGISTRE, PAS UN LIBELLÉ GÉNÉRIQUE.
 *
 * Mesuré à l'écran le 18/09/2026 : chaque candidat de démonstration portait
 * `sources: [{ name: 'Jeu de démonstration', ... }]` — un nom que
 * `dataSourceLabel` (`apps/web/src/lib/data-source-label.ts`) ne reconnaît
 * pas, donc replié sur `common:dataSources.unknown` = « une source de
 * données » : le vocabulaire des registres publics existe déjà côté écran
 * (`sources.decp`, `sources.franceTravail`, `sources.bodacc`…) et n'était
 * simplement pas TRANSPORTÉ jusqu'ici.
 *
 * La nature de chaque signal, elle, existe déjà en amont, dans le code réel :
 *   · tender / award / hiring — miroir exact de `SOURCE_LABELS`
 *     (`apps/ia/app/routers/discover_signals.py:88`, BOAMP / DECP / France
 *     Travail), le seul endroit qui le déclare ;
 *   · legal / tech — aucun collecteur ne les produit encore en production
 *     (`discover_signals.py` n'émet que tender/award/hiring), mais leur SENS
 *     est déjà écrit au barème (`discover_scoring.py:139-140`) : `legal` =
 *     BODACC (« évènement de vie »), `tech` = la pile détectée par notre
 *     propre mémoire marché — jamais un fournisseur qu'on paie (GA-44), donc
 *     `market-memory`, déjà dans `DATA_SOURCE_LABEL_KEYS`.
 *
 * Chaque candidat affiche donc les registres RÉELLEMENT désignés par SES
 * propres signaux plutôt qu'un nom de jeu de données que rien ne reconnaît.
 */
// #4045 — `business` (projet, levée, nomination…) n'a AUCUN registre : il vient de l'historique du
// compte, la salle ne lui invente donc pas de source.
const SIGNAL_TYPE_REGISTRY: Record<'tender' | 'award' | 'hiring' | 'legal' | 'tech' | 'funding', string> = {
  tender: 'BOAMP',
  award: 'DECP',
  hiring: 'France Travail',
  legal: 'BODACC',
  tech: 'market-memory',
  // #3941 — les fils publics de levées (`funding_feed.py`).
  funding: 'funding-feed',
}

/** Les registres distincts désignés par les signaux d'UN candidat, dans leur ordre d'apparition. */
function sourcesFromSignals(
  signals: readonly { type: 'tender' | 'award' | 'hiring' | 'legal' | 'tech' | 'funding' | 'business' }[],
): { name: string; fetchedAt: string }[] {
  const seen = new Set<string>()
  const sources: { name: string; fetchedAt: string }[] = []
  for (const signal of signals) {
    if (signal.type === 'business') continue
    const name = SIGNAL_TYPE_REGISTRY[signal.type]
    if (seen.has(name)) continue
    seen.add(name)
    sources.push({ name, fetchedAt: DEMO_FETCHED_AT })
  }
  return sources
}

/** Un appel d'offres analysé, dans la forme que rend `/rfp/analyse`. */
export function demoRfpAnalysis(title: string): {
  title: string
  issuer: string
  dueAt: string
  reference: string
  lots: string[]
  requirements: unknown[]
  decision: unknown
  sourceText: null
  documentExtraction: unknown
} {
  return {
    title: title.trim() || 'Consultation (démo)',
    issuer: 'Donneur d’ordre fictif (démonstration)',
    // Une échéance FIXE : calculée depuis la date du jour, elle ferait glisser
    // la démonstration d'un mois à l'autre sans que personne la relise.
    dueAt: '2026-09-30',
    // #2957 (#2180.39) — une référence de consultation, pour que le doublon
    // par référence se voie en salle (réimporter le dossier la retrouve).
    reference: 'DEMO-2026-INFRA-042',
    lots: ['Lot 1 — renfort d’exploitation (démo)', 'Lot 2 — socle de données (démo)'],
    // Le vocabulaire est celui du normaliseur (`text`, `weight`, `kind`,
    // `ownerRole`) : la démonstration passe par le MÊME chemin que le vrai
    // import, sinon elle montrerait un écran que le produit ne sait pas rendre.
    requirements: [
      {
        text: 'Certification ISO 27001 en cours de validité',
        section: 'Cadre administratif',
        kind: 'security',
        weight: 'mandatory',
        ownerRole: 'security',
        risk: 'Aucune attestation dans la base de connaissance de l’espace de démonstration.',
      },
      {
        text: 'Deux références de moins de trois ans dans le secteur',
        section: 'Références',
        kind: 'other',
        weight: 'mandatory',
        ownerRole: 'sales',
        risk: 'Les références réelles vivent dans ton espace, pas dans la démonstration.',
      },
      {
        text: 'Équipe de 4 ETP dont un architecte, mobilisée sur trois ans',
        section: 'Moyens humains',
        kind: 'team',
        weight: 'mandatory',
        ownerRole: 'hr',
        risk: 'Disponibilité à confirmer auprès du staffing.',
      },
      {
        text: 'Stack React / Node.js / PostgreSQL pour la conception et le développement',
        section: 'Exigences techniques',
        kind: 'technical',
        weight: 'desirable',
        ownerRole: 'expert',
        risk: null,
      },
      {
        text: 'Pénalités de retard et réversibilité en fin de marché',
        section: 'Cadre contractuel',
        // Volontairement AMBIGUË : c'est la position prudente du produit quand
        // le document ne dit pas si l'exigence est obligatoire. Une
        // démonstration qui ne montrerait que des exigences bien rangées
        // cacherait la garde la plus utile de l'écran.
        kind: 'contractual',
        weight: 'ambiguous',
        ownerRole: 'legal',
        risk: 'Le document ne précise ni le plafond de pénalités ni le format de réversibilité.',
      },
    ],
    // Les champs sont EXACTEMENT ceux de `bidDecisionSchema` — verdict,
    // rationale, fit, capacity, conditions, questions, redFlags. Une clé
    // inventée ici (« blockers ») laisse `redFlags` indéfini, et l'écran, qui
    // le parcourt, tombe : c'est ce qui s'est produit en production.
    decision: {
      verdict: 'conditional',
      // La démonstration montre le RAISONNEMENT, et le dit : un verdict présenté
      // comme calculé alors qu'il est écrit d'avance serait la démonstration
      // d'une promesse qu'on ne tient pas.
      rationale:
        'Verdict scripté pour la démonstration : deux exigences bloquantes (certification et références) ne peuvent pas être satisfaites depuis un espace fictif. Sur ton espace, ce verdict est calculé à partir de ton profil ESN et de ta base de connaissance.',
      fit: 45,
      capacity: 60,
      conditions: [
        'Obtenir ou porter la certification via un partenaire',
        'Présenter deux références sectorielles de moins de trois ans',
      ],
      questions: [
        'La certification doit-elle être détenue en propre, ou une équivalence portée par un sous-traitant est-elle acceptée ?',
        'Les références doivent-elles être dans le même secteur, ou un secteur comparable suffit-il ?',
      ],
      redFlags: [
        'Certification ISO 27001 obligatoire, non couverte par l’espace de démonstration',
        'Aucune référence sectorielle dans un espace fictif',
      ],
    },
    sourceText: null,
    // #2957 (#2180.9-.26) — la structure DOSSIER, dans le MÊME vocabulaire que
    // le normaliseur (`value`/`page`/`confidence`/`status`) : la démonstration
    // passe par le même chemin que le vrai import. Quatre catégories TROUVÉES
    // (crédibles sur un script court), le reste honnêtement `not_found` —
    // une extraction scriptée qui remplirait les douze case inventerait des
    // pages et des confidences qu'aucun document réel n'a produites ici.
    documentExtraction: {
      legal_entity: {
        value: 'Collectivité fictive de démonstration',
        page: '1',
        confidence: 'high',
        status: 'found',
      },
      calendar: {
        value: 'Publication le 2026-08-15, questions jusqu’au 2026-09-15, remise le 2026-09-30 (démo)',
        page: '2',
        confidence: 'high',
        status: 'found',
      },
      scoring_criteria: {
        value: 'Prix 40 %, valeur technique 40 %, délais 20 % (démo)',
        page: '4',
        confidence: 'medium',
        status: 'found',
      },
      security_compliance: {
        value: 'Certification ISO 27001 exigée (démo)',
        page: '5',
        confidence: 'high',
        status: 'found',
      },
      qa: { value: null, page: null, confidence: null, status: 'not_found' },
      requested_documents: { value: null, page: null, confidence: null, status: 'not_found' },
      requested_profiles: { value: null, page: null, confidence: null, status: 'not_found' },
      volumes: { value: null, page: null, confidence: null, status: 'not_found' },
      pricing: { value: null, page: null, confidence: null, status: 'not_found' },
      contractual_terms: { value: null, page: null, confidence: null, status: 'not_found' },
      contacts: { value: null, page: null, confidence: null, status: 'not_found' },
      submission_format: { value: null, page: null, confidence: null, status: 'not_found' },
    },
  }
}

/** Une exigence rédigée, dans la forme que rend `/rfp/draft`. */
export function demoRfpDraft(): {
  status: string
  answer: string
  source: string
  ownerRole: string
  missing: string | undefined
} {
  return {
    status: 'drafted',
    answer:
      'Réponse scriptée pour la démonstration. Sur ton espace, cette réponse est rédigée à partir des seules sources que tu as approuvées, et la source utilisée est affichée sous le texte.',
    source: 'Dossier de démonstration',
    ownerRole: 'sales',
    // Rien à signaler comme manquant : le champ existe pour que la forme rendue
    // soit celle du vrai chemin, et non une variante que l'appelant devrait
    // savoir distinguer.
    missing: undefined,
  }
}

/**
 * Ce que « Découvrir » rend en démonstration.
 *
 * L'écran doit montrer qu'une recherche RAPPORTE — sinon la démonstration
 * s'arrête sur une liste vide — sans interroger le registre réel depuis un lien
 * public.
 *
 * Les cinq candidats restent ouvertement FICTIFS, et ne reprennent PAS les cinq
 * sociétés réelles du portefeuille. Deux raisons : « Découvrir » sert à trouver
 * des comptes qu'on n'a pas encore, donc y afficher ceux qu'on a déjà serait
 * faux ; et une fiche de candidat prétend décrire une entreprise — la remplir
 * pour une société réelle sans l'avoir analysée fabriquerait exactement la
 * donnée que ce produit refuse.
 *
 * **Le SIREN est le point délicat**, et le premier essai s'est trompé. Écrire le
 * mot « DÉMO » était l'idée juste — personne ne peut le confondre avec un
 * identifiant de registre — mais l'écran normalise le SIREN et REJETTE tout ce
 * qui n'est pas neuf chiffres : les cinq candidats disparaissaient, et la
 * démonstration annonçait « aucune entreprise ne correspond ».
 *
 * La valeur doit donc être numérique. On prend `00000000X` : huit zéros de tête,
 * qu'aucun SIREN réel ne porte, une clé de Luhn fausse (donc invalide pour tout
 * outil qui vérifie), et un numéro distinct par candidat pour que l'écran puisse
 * les distinguer. Un prospect qui le recopie ne trouvera rien — ce qui est
 * exactement le comportement voulu, à l'inverse d'un numéro plausible.
 *
 * Les scores restent EXPLIQUÉS, comme sur le vrai écran : `score` est la somme
 * de `scoreFactors[].points`, invariant que l'écran affiche. Un score rond sans
 * facteur montrerait le contraire de ce que le produit garantit.
 */
/**
 * #2544.2 — la date de constat des personnes de démonstration.
 *
 * Fixe, et posée à UN seul endroit (GA-26) : une date calculée à la volée
 * ferait bouger la capture d'écran d'une réunion à l'autre, et « constaté
 * aujourd'hui » sur un mandat ancien est exactement le mensonge que la
 * provenance existe pour empêcher.
 */
const DEMO_PEOPLE_OBSERVED_AT = '2026-08-25T16:33:12'

/**
 * #2291.2 — jour du constat du modèle de contrat SCRIPTÉ. Fixe, comme
 * `DEMO_PEOPLE_OBSERVED_AT` : la salle ne cherche rien, elle rejoue une
 * recherche déjà faite, et ses dates doivent rester cohérentes avec les
 * signaux datés qu'elle montre.
 */
const DEMO_CONTRACT_MODEL_OBSERVED_AT = '2026-08-25'

/** Minuscules, sans accents ni ponctuation — pour rapprocher un texte tapé d'un nom ou d'une ville. */
function foldForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** #2291.2 — une observation d'offres publiées, dans la forme du contrat. */
function demoJobOffers(
  counts: Partial<Record<'permanent' | 'fixedTerm' | 'interim' | 'freelance' | 'other', number>>,
  since: string,
  until: string,
): DiscoverContractModel {
  const full = { permanent: 0, fixedTerm: 0, interim: 0, freelance: 0, other: 0, ...counts }
  return {
    observedAt: DEMO_CONTRACT_MODEL_OBSERVED_AT,
    jobOffers: {
      source: 'France Travail',
      total: Object.values(full).reduce((sum, value) => sum + value, 0),
      counts: full,
      since,
      until,
    },
    publicContracts: null,
  }
}

/** #4182 — la forme du dossier « qui demande ce profil ? » (`apps/ia/app/services/offer_requester.py`). */
type DemoOfferRequester = {
  author: { kind: 'rh' | 'cabinet' | 'non_precise'; evidence: string | null }
  possibleManager: { function: string; entity: string | null; evidence: string } | null
  team: string | null
  scope: { city: string | null }
  jobFamily: string | null
  status: 'etaye' | 'a_identifier'
  openFreelanceMission: false
  method?: string[]
}

type DemoDeliveryFitLevel = 'compatible' | 'potentially_compatible' | 'unknown' | 'incompatible'

const DEMO_DELIVERY_FIT_AXES = [
  'site_presence',
  'presence_frequency',
  'authorized_countries',
  'languages',
  'timezones',
  'security',
  'sensitive_data',
  'mandated_equipment',
  'clearances',
  'contractual_status',
  'team_model',
  'travel',
  'source_freshness',
] as const

/**
 * #3237 — les treize axes d'un signal de démo, `unknown` par défaut, et le niveau
 * COMPOSÉ selon la règle de `compose_delivery_fit_axes` (apps/ia) : un axe
 * incompatible l'emporte, sinon un axe à vérifier, sinon compatible si au moins
 * un axe est évalué, sinon unknown.
 */
function demoDeliveryFit(evaluated: Partial<Record<(typeof DEMO_DELIVERY_FIT_AXES)[number], DemoDeliveryFitLevel>>): {
  deliveryFit: DemoDeliveryFitLevel
  deliveryFitAxes: Record<string, DemoDeliveryFitLevel>
} {
  const deliveryFitAxes: Record<string, DemoDeliveryFitLevel> = {}
  for (const axis of DEMO_DELIVERY_FIT_AXES) deliveryFitAxes[axis] = evaluated[axis] ?? 'unknown'
  const levels = Object.values(deliveryFitAxes).filter(l => l !== 'unknown')
  const deliveryFit: DemoDeliveryFitLevel = levels.includes('incompatible')
    ? 'incompatible'
    : levels.includes('potentially_compatible')
      ? 'potentially_compatible'
      : levels.length > 0
        ? 'compatible'
        : 'unknown'
  return { deliveryFit, deliveryFitAxes }
}

/**
 * #3238 (recette Z1 04/10) — la piste « Comptes qui recrutent » doit montrer
 * Verdal Distribution (« Sites : Lyon, Marseille ») SANS geste : c'est le
 * candidat qui porte l'extraction du signal métier. Il reste hors de la cible
 * déclarée (le secteur n'est pas ajouté au profil : tout le scoring de la salle
 * en bougerait) ; c'est la liste scriptée qui le garde, comme un compte déjà
 * repéré. Le compteur `excludedCount` ne le compte donc pas.
 */
const DEMO_RECRUITING_TRACK_HEADLINER = 'Verdal Distribution (démo)'

/**
 * #4067 — CE QUE LA SALLE « SAIT DÉJÀ » de quelques candidats (craft rule n°9) :
 * des faits FICTIFS, comme les sociétés qui les portent, passés par le MÊME
 * calcul que le vrai chemin (`computeDiscoverSourceAxes`, `@bellum/contracts`).
 * Les dates sont RELATIVES à aujourd'hui, pour qu'un signal ancien se lise
 * toujours « il y a 8 mois » et jamais comme récent. Une carte absente d'ici
 * ne porte que des axes NON MESURÉS — jamais des zéros.
 */
const DEMO_SOURCE_NO_FACTS: DiscoverSourceFacts = {
  signalHistory: null,
  crm: null,
  marketMemory: null,
  dataforge: null,
  drive: null,
  missions: null,
}
const demoDaysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString()

/**
 * #4068 (lot DECOUVRIR-CARTE, 13/10) — les dates des signaux scriptés sont écrites
 * telles qu'au 13/10/2026 et RE-DATÉES à aujourd'hui (même écart) : la carte coupe
 * un fait de plus de 180 j (`classifyCardFact`), une salle à dates figées se serait
 * vidée en quelques semaines. Une date illisible reste telle quelle.
 */
const DEMO_SCRIPT_REFERENCE_DAY_MS = Date.parse('2026-10-13T00:00:00Z')
const demoRebasedDay = (now: Date, day: string): string => {
  const parsed = Date.parse(`${day.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(parsed)) return day
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return new Date(parsed + (today - DEMO_SCRIPT_REFERENCE_DAY_MS)).toISOString().slice(0, 10)
}
const DEMO_DISCOVER_SOURCE_FACTS: Readonly<Record<string, (now: Date) => Partial<DiscoverSourceFacts>>> = {
  'Aubrac Aerostructures (démo)': now => ({
    signalHistory: {
      signals: [
        { type: 'hiring', date: demoDaysAgo(now, 240), changeCount: 0 },
        { type: 'hiring', date: demoDaysAgo(now, 410), changeCount: 1 },
      ],
    },
    drive: { documents: 2, latestAt: demoDaysAgo(now, 35) },
  }),
  // #4294.9 — trois besoins passés FICTIFS observés sur ce compte, dont un gagné il y a 14 mois.
  'Cévennes Défense Systèmes (démo)': now => ({
    dataforge: { status: 'CIBLE_PRIORITAIRE', needs: { total: 3, won: 1, latestAt: demoDaysAgo(now, 425) } },
    marketMemory: { externalRecourse: true, stackOverlap: ['java'] },
  }),
  // SNCF (compte semé, `DEMO_DISCOVER_OWNED_CANDIDATE_NAMES`) n'est PAS ici : sa carte passe par
  // le VRAI calcul sur la base de la salle (`IaProxyController.withDemoOwnedCandidates`).
  'Groupe Aurélys (démo)': now => ({
    crm: { won: 1, lost: 0, open: 0, dormant: 0, contacts: 0, lastActivityAt: demoDaysAgo(now, 120) },
    missions: { missions: 0, consultants: 2, latestAt: null },
  }),
  'Marenval Financement (démo)': now => ({
    crm: { won: 0, lost: 1, open: 0, dormant: 1, contacts: 0, lastActivityAt: demoDaysAgo(now, 200) },
    // #4067.11 (#4286.15.d) — trois personnes en poste FICTIVES que la base commune connaît déjà : un compte,
    // jamais un nom (même forme que le réel, `DiscoverSourcesService.readSharedPeople`).
    marketMemory: { externalRecourse: null, stackOverlap: null, sharedPeople: 3 },
  }),
}

/** Distance d'édition (Levenshtein) — pour la proximité d'une ville tapée, la salle n'ayant pas de référentiel de communes. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i]
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(previous[j]! + 1, row[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = row
  }
  return previous[b.length]!
}

/** Proximité minimale d'une ville tapée à une ville de la salle (1 = identique) : « Tolouse » 0,88 ; « Toulan » 0,75. */
const DEMO_PLACE_MIN_RATIO = 0.85

/**
 * #4429.6 — « Tolouse » : la ville tapée est corrigée par proximité sur les villes de la salle, la correction
 * est NOMMÉE (`query.placeResolution`, la forme du vrai chemin `place_resolution.py`) et la recherche part sur
 * la ville corrigée. Un nom exact ou trop éloigné passe tel quel : rien n'est deviné.
 */
export function demoDiscoverResponse(query: Record<string, unknown>): ReturnType<typeof demoDiscoverResolved> {
  const typed = typeof query.city === 'string' ? query.city.trim() : ''
  if (!typed) return demoDiscoverResolved(query)
  const known = demoDiscoverResolved({ includeOutOfTarget: true }).candidates as { city: string | null }[]
  const folded = foldForMatch(typed)
  if (known.some(row => foldForMatch(row.city ?? '') === folded)) return demoDiscoverResolved(query)
  const scored = known
    .filter((row): row is { city: string } => Boolean(row.city))
    .map(row => {
      const other = foldForMatch(row.city)
      return { row, ratio: 1 - editDistance(folded, other) / Math.max(folded.length, other.length) }
    })
    .filter(entry => entry.ratio >= DEMO_PLACE_MIN_RATIO)
    .sort((a, b) => b.ratio - a.ratio)
  const best = scored[0]?.row
  if (!best) return demoDiscoverResolved(query)
  const response = demoDiscoverResolved({ ...query, city: best.city })
  return {
    ...response,
    query: {
      ...response.query,
      placeResolution: {
        kind: 'corrected',
        typed,
        chosen: best.city,
      },
    },
  }
}

function demoDiscoverResolved(query: Record<string, unknown>): {
  candidates: unknown[]
  query: Record<string, unknown>
  degraded: unknown[]
  targetSectorFilter?: { applied: boolean; excludedCount: number; excludedSectors: string[] }
  coverage?: { filteredByEntityType: number }
} {
  let rank = 0
  // Sept zéros de tête ET clé de Luhn fausse : aucun SIREN officiel ne ressemble à ceux-là (voir le spec).
  const luhnOk = (digits: string): boolean => {
    let sum = 0
    for (let i = 0; i < digits.length; i += 1) {
      let d = Number(digits[digits.length - 1 - i])
      if (i % 2 === 1) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
    }
    return sum % 10 === 0
  }
  const nextFakeSiren = (): string => {
    let siren: string
    do siren = String(++rank).padStart(9, '0')
    while (luhnOk(siren))
    return siren
  }
  const now = new Date()
  const candidate = (input: {
    name: string
    sector: string
    // #3876 — `null` = le registre ne publie aucune commune pour ce siège (jamais une ville devinée).
    city: string | null
    department: string | null
    headcountRange: string | null
    nafCode: string
    signals: {
      type: 'tender' | 'award' | 'hiring' | 'legal' | 'tech' | 'funding' | 'business'
      label: string
      date: string
      detail?: string
      // #4068.8 — le lien du fait (« Voir l'annonce » / « Voir la source » côté écran, jamais le nom d'une
      // source). Réservé : `example.org` n'est pas un site réel. Absent = aucun lien (parité des deux cas).
      url?: string
      // #2616.1 — le CDI distinguable, filtrable : parité démo (craft rule n°9)
      // du filtre « CDI uniquement » du rail Découvrir ; « Alternance » reste un fait de contexte (#4115).
      contractType?: 'CDI' | 'Alternance' | 'FREELANCE'
      // #3204.2 (épopée #3238) — EXTRACTION, parité démo (craft rule n°9) :
      // les champs manquants de LAU-FINAL-210 que ce lot a ajoutés.
      technologies?: string[]
      jobFamily?: string
      team?: string
      reportsTo?: string
      stillOpen?: boolean
      similarOfferCount?: number
      hiringSignalClass?: 'internal_hiring' | 'contracting' | 'staffing_signal' | 'skill_demand_signal'
      // #3238 (recette 02/10) — la séniorité que l'offre affiche, croisée aux niveaux que la société place.
      seniority?: 'junior' | 'confirme' | 'senior'
      // #3205.1 (épopée #3239) — le prestataire tiers mentionné, parité démo.
      thirdPartyProviderMention?: string
      // #3204.2 (épopée #3238, reste) — la ville EXACTE du site qui a publié
      // CE signal, parité démo (craft rule n°9) : un employeur multi-sites
      // publie dans des villes différentes sans que le nom résolu du groupe
      // ne les distingue.
      siteCity?: string
      // #3204.7 (épopée #3238, reste du 30/09) — REPLACEMENT_SIGNAL, parité
      // démo : le texte de l'offre nomme explicitement un remplacement.
      replacementSignal?: boolean
      // #3237 (#3203.4/.5) — DELIVERY FIT, parité démo : le niveau composé et
      // les treize axes évalués séparément (jamais un axe omis).
      deliveryFit?: DemoDeliveryFitLevel
      deliveryFitAxes?: Record<string, DemoDeliveryFitLevel>
      // #4182 (EX-12) — « qui demande ce profil ? », parité démo (craft rule n°9) : même forme que
      // `offer_requester.py` (auteur ≠ manager, équipe, entité = site de l'offre, étayé / à identifier + méthode).
      requester?: DemoOfferRequester
      // #4115 — la tranche de la grille (`discover_signal_grid.py`) : fort (5 au plus) ou contexte (10 au plus).
      tier?: 'strong' | 'context'
    }[]
    // #3204.6/.7 (épopée #3238) — AGRÉGATION, parité démo (craft rule n°9) :
    // au moins deux offres de la même famille métier citant les offres qui
    // les soutiennent (team_growth_signal), ou une seule offre dont le texte
    // nomme explicitement un départ (replacement_signal, reste du 30/09).
    aggregatedSignals?: {
      aggregateClass: 'team_growth_signal' | 'replacement_signal'
      jobFamily: string
      supportingOffers: { label: string; date: string }[]
      reason: string
    }[]
    factors: { label: string; points: number; evidence: string }[]
    angle: string | null
    roles: { title: string; department: string }[]
    /**
     * #2544.2 — LES PERSONNES QUE LA SALLE MONTRE (craft rule n°9).
     *
     * Le bloc « Personnes nommées » est user-facing : sans lui en démonstration,
     * un prospect ne saurait pas qu'il existe. Ces personnes sont FICTIVES comme
     * les cinq sociétés qui les portent — sur le vrai chemin, elles viennent des
     * mandataires que le registre public NOMME.
     *
     * ⚠️ AUCUNE ne porte de lieu de travail, et c'est le point : aucune source
     * vérifiée ne rattache une personne à un établissement, donc le contrat le
     * refuse (`attestedWorkplaceSchema`) et la démonstration ne l'invente pas.
     * Une salle qui montrerait « Directeur · Lille » enseignerait un
     * comportement que le produit n'a pas.
     */
    people?: { name: string; role?: string }[]
    /**
     * #2291.2 — le modèle de contrat OBSERVÉ (craft rule n°9). Absent = la
     * salle ne le montre pas pour cette ligne ; `null` = cherché, non observé —
     * le même état que le vrai chemin pose sur un candidat cherché sans rien
     * d'attribuable.
     */
    contractModel?: DiscoverContractModel | null
    /**
     * #3705.5 — le rattachement de groupe SOURCÉ (craft rule n°9). Absent = aucune ligne, comme le
     * vrai chemin sans clé ni lien connu ; jamais « indépendante ».
     */
    groupLink?: { kind: 'capital_link' | 'legal_entity_officer'; entities: string[] }
    /**
     * #2614.1 — le verdict du conseil de qualification (craft rule n°9).
     * Absent = comme le vrai chemin sur une réponse d'avant #2165 : l'écran se
     * comporte comme s'il n'existait pas. Pas dans `discoverCandidateSchema`
     * (`@bellum/contracts`) — le champ n'y a jamais été déclaré — d'où le type
     * local plutôt qu'un import qui n'existe pas.
     */
    qualification?: {
      verdict: 'recommended' | 'to_verify' | 'excluded'
      code: string | null
      reason: string
      /** #3983.1 — filiales retenues d'une holding écartée (miroir du chemin réel). */
      subsidiaries?: Array<{ name: string }>
      /** #4358.4 — secteur lu par l'activité ou le site (NAF flou), miroir du chemin réel. */
      sectorAttachment?: { sector: string; via: 'activity' | 'site' }
    }
    /**
     * #2166.11 (épopée #2806) — LA RÉFÉRENCE COMPARABLE (craft rule n°9).
     *
     * Absent = comme le vrai chemin sur un candidat déjà possédé, un secteur
     * NAF non apparié, ou une réponse d'avant ce déploiement — l'écran ne
     * montre alors aucune ligne (`SimilarityHeadlineNote`, rendu SEULEMENT
     * quand `kind === 'sector'`). Dans `discoverCandidateSchema`
     * (`@bellum/contracts`), donc porté par `discoverResponseSchema.parse`
     * sans passe-plat local.
     */
    similarityHeadline?: { kind: 'sector'; referenceAccount: string }
    /**
     * #3757 — une ESN n'est pas un client final (craft rule n°9) : posé comme le fait le
     * vrai chemin (`discover_signals.py`, `isEsnPeer`) — SEULEMENT à `true`, jamais `false`
     * sur les autres lignes inventées (le badge n'affiche rien hors `true`).
     */
    isEsnPeer?: true
    /**
     * Lot T point 1 (Louis 02/11) — POURQUOI une ESN que son NAF ne dit pas (71.12B) est dans « Autres acteurs » : ses
     * propres offres le disent (`offers`) ou le référentiel la nomme (`referential`). Posé comme le vrai chemin
     * (`actor_fields`, apps/ia) — SEULEMENT avec `isEsnPeer`. Aucune source nommée.
     */
    esnRecognition?: 'offers' | 'referential'
    /**
     * #3757 (reste) — un fait DÉCLARÉ par l'espace (craft rule n°9), distinct de
     * l'hypothèse NAF ci-dessus : posé comme le fait le vrai chemin
     * (`discover_signals.py`, `isDeclaredPartner`) — SEULEMENT à `true`, jamais
     * `false` ni cumulé avec `isEsnPeer` (même classement, un seul type par ligne).
     */
    isDeclaredPartner?: true
    /**
     * #4814 — intérim, VMS, MSP, apporteur d'affaires : « Intermédiaire, pas client final » (craft rule n°9).
     * Posé comme le vrai chemin (`discover_signals.py`, `isIntermediary` ← `INTERMEDIARY_ACTOR_TYPES`) —
     * SEULEMENT à `true`. Le filtre « Clients finaux » retire ces lignes ; les lectures « ESN » et « tous » les gardent.
     */
    isIntermediary?: true
    /**
     * #4294.7 — « Déjà travaillée », parité démo (craft rule n°9) : comme le vrai chemin (`discover-portfolio.service`),
     * un compte de l'espace qui porte une mission passée est `customer` ET `workedBefore: true`. Absent = candidat neuf.
     */
    workedBefore?: true
    /**
     * DISCOVER-OFFRES (15/10) — le volume d'offres de la carte (craft rule n°9) : posé comme le vrai chemin
     * (`discover.py::_page_volumes`), SEULEMENT quand il est mesuré (> 0) ; absent = aucune ligne, jamais « 0 ».
     */
    offersVolume?: number
    /** #4284.26 (21/10) — le compte est hors du métier de l'espace : marque « hors de ton métier », rangé plus bas. */
    outOfTrade?: boolean
  }) => ({
    ...(input.outOfTrade ? { outOfTrade: true } : {}),
    name: input.name,
    siren: nextFakeSiren(),
    nafCode: input.nafCode,
    sector: input.sector,
    city: input.city,
    department: input.department,
    headcountRange: input.headcountRange,
    creationDate: null,
    score: input.factors.reduce((total, factor) => total + factor.points, 0),
    scoreMax: 100,
    scoreUnmeasured: [],
    scoreFactors: input.factors,
    signals: input.signals.map(signal => ({ ...signal, date: demoRebasedDay(now, signal.date) })),
    // #4067 — les axes de sources, par le MÊME calcul que le vrai chemin.
    sourceAxes: computeDiscoverSourceAxes(
      { ...DEMO_SOURCE_NO_FACTS, ...(DEMO_DISCOVER_SOURCE_FACTS[input.name]?.(now) ?? {}) },
      now,
    ),
    // Décision 1 (18/09/2026) — zéro appel réseau en démo : ce champ est semé
    // ici, jamais cherché. La salle SIMULE le résultat d'une recherche de
    // signaux déjà faite pour ce candidat (`input.signals`), donc le dit —
    // jamais « non mesuré » sur une ligne dont la démo invente déjà le contenu.
    //
    // #3819.4 — RÉFUTÉ en recette le 09/10 : dériver ce fait de
    // `input.signals.length > 0` fabriquait exactement la confusion que ce
    // champ existe pour éviter (décision 1) — une recherche FAITE qui ne
    // trouve RIEN (`signals: []`) retombait sur `false`, le même état qu'un
    // candidat JAMAIS interrogé. Semée EXPLICITEMENT ici : vraie pour toute
    // ligne où la démo simule un contenu (recherche faite, qu'elle trouve ou
    // non), fausse SEULEMENT pour la ligne qu'un verdict EXCLU écarte avant
    // même qu'un signal ne soit simulé (Roggeman, plus bas — le commentaire
    // posé sur sa ligne le dit déjà).
    signalsSearched: input.qualification?.verdict !== 'excluded',
    dataConfidence: 100,
    angle: input.angle,
    suggestedRoles: input.roles,
    // #2544.2 — chaque fait porte sa provenance et sa date de constat, comme
    // sur le vrai chemin. `role` absent = mandat inconnu : la carte l'écrit
    // « Non su », elle ne le remplit pas.
    ...(input.people
      ? {
          people: input.people.map(person => ({
            name: { value: person.name, origin: 'registry' as const, observedAt: DEMO_PEOPLE_OBSERVED_AT },
            ...(person.role
              ? { role: { value: person.role, origin: 'registry' as const, observedAt: DEMO_PEOPLE_OBSERVED_AT } }
              : {}),
          })),
        }
      : {}),
    ...(input.contractModel !== undefined ? { contractModel: input.contractModel } : {}),
    ...(input.groupLink ? { groupLink: input.groupLink } : {}),
    // #3204.6/.7 (épopée #3238) — absent = comme le vrai chemin sur une
    // moisson sans famille métier récurrente : aucune ligne agrégée.
    ...(input.aggregatedSignals !== undefined ? { aggregatedSignals: input.aggregatedSignals } : {}),
    // #2614.1 — `otherCodes: []` : la démo ne simule qu'UN doute à la fois,
    // comme le vrai chemin fait pour la plupart de ses lignes.
    ...(input.qualification !== undefined ? { qualification: { ...input.qualification, otherCodes: [] } } : {}),
    ...(input.similarityHeadline !== undefined ? { similarityHeadline: input.similarityHeadline } : {}),
    ...(input.offersVolume !== undefined
      ? { offersVolume: { count: input.offersVolume, windowDays: 90, country: 'FR' as const } }
      : {}),
    ...(input.isEsnPeer ? { isEsnPeer: true } : {}),
    ...(input.esnRecognition ? { esnRecognition: input.esnRecognition } : {}),
    ...(input.isDeclaredPartner ? { isDeclaredPartner: true } : {}),
    ...(input.isIntermediary ? { isIntermediary: true } : {}),
    portfolioState: input.workedBefore ? ('customer' as const) : ('new' as const),
    accountId: null,
    ...(input.workedBefore ? { workedBefore: true as const } : {}),
    // #2546.2 — la nature du registre que CE candidat désigne réellement,
    // jamais le nom du jeu de données lui-même.
    sources: sourcesFromSignals(input.signals),
  })

  /**
   * ⚠️ La démo HONORE les filtres, elle ne les ignore plus.
   *
   * Trouvé par la recette live du 04/09/2026 : cocher « Aéronautique & spatial »
   * rendait une enseigne de grande distribution (NAF 47.11F). La fonction
   * recevait `query` et se contentait de la RENVOYER — les cinq candidats
   * partaient quel que soit le critère.
   *
   * Ce n'est pas cosmétique : le lien de démonstration est ce qu'un prospect voit
   * du produit, et un filtre qui ne filtre visiblement rien lui apprend que le
   * produit est cassé. C'est la craft rule n°9 du dépôt, appliquée au COMPORTEMENT
   * et pas seulement à la présence de données.
   *
   * Le croisement se fait sur les mêmes faits que la vraie recherche — le code NAF
   * que chaque ligne porte, et son département. Une ligne dont on ne peut pas LIRE
   * son NAF n'est jamais écartée : on n'écarte pas sur une absence. #3876 — l'inverse
   * pour le DÉPARTEMENT : un siège sans commune connue (`null`) ne correspond à aucun
   * département demandé, comme sur le registre où le filtre se fait à la source.
   */
  const wantedNaf = String(query.nafCode ?? '')
    .split(',')
    .map(code => code.replace(/\D/g, '').slice(0, 4))
    .filter(Boolean)
  const wantedDepartments = [
    ...(Array.isArray(query.departments) ? query.departments.map(value => String(value)) : []),
    ...(query.department ? [String(query.department)] : []),
  ].filter(Boolean)
  // #3983.8 — la zone peut aussi être une RÉGION (codes INSEE, `region` ou `regions`), comme le rail de Découvrir.
  const wantedRegions = [
    ...(Array.isArray(query.regions) ? query.regions.map(value => String(value)) : []),
    ...(query.region ? String(query.region).split(',') : []),
  ]
    .map(code => code.trim())
    .filter(Boolean)
  const zoneRequested = wantedDepartments.length > 0 || wantedRegions.length > 0
  /** Un département est dans la zone quand il satisfait CHAQUE critère posé (départements ET régions). */
  const departmentInZone = (department: string | null): boolean =>
    !!department &&
    (wantedDepartments.length === 0 || wantedDepartments.includes(department)) &&
    (wantedRegions.length === 0 || wantedRegions.includes(DEMO_REGION_BY_DEPARTMENT[department] ?? ''))

  // #3983.4 (#3705.3) — SIÈGE ≠ IMPLANTATION, parité démo (craft rule n°9). Comme le vrai registre,
  // une zone département tient aussi par un établissement : « siège dans la zone » (`siteBasis`)
  // retire ce cas. Les implantations sont fictives, sans SIRET ni effectif local.
  const siteBasisHeadquarters = query.siteBasis === 'headquarters'
  const sitesInZone = (name: string): { city: string; department: string }[] =>
    (DEMO_SITES_BY_ACCOUNT[name] ?? []).filter(site => departmentInZone(site.department))

  const matches = (row: { name: string; nafCode: string; department: string | null }): boolean => {
    if (wantedNaf.length > 0) {
      const digits = row.nafCode.replace(/\D/g, '').slice(0, 4)
      if (digits && !wantedNaf.includes(digits)) return false
    }
    // #3876 — un siège sans commune connue (`null`) ne correspond à aucun département demandé ;
    // #3983.4 — il tient quand même par une implantation dans la zone, sauf « siège dans la zone ».
    if (zoneRequested && !departmentInZone(row.department)) {
      return !siteBasisHeadquarters && sitesInZone(row.name).length > 0
    }
    return true
  }

  // #4892.1 — une marque = une ligne : deux entités juridiques FICTIVES de la même marque, même ville (SIREN distincts).
  // La tête porte `brandGroup.members`, le membre nomme sa tête : la liste n'affiche qu'UNE ligne, dépliable.
  const brandMember = candidate({
    name: 'Maison Valcourt (démo)',
    sector: 'Tech & Startups — éditeur de logiciels',
    city: 'Lille',
    department: '59',
    headcountRange: '50 à 249 salariés',
    nafCode: '62.01Z',
    signals: [
      { type: 'hiring', label: 'Développeur Java — plateforme e-commerce', date: '2026-10-12', contractType: 'CDI' },
    ],
    factors: [{ label: 'Activité de recrutement', points: 10, evidence: '1 offre ouverte' }],
    angle: null,
    roles: [],
    people: [],
  })
  const brandHead = candidate({
    name: 'Valcourt France (démo)',
    sector: 'Tech & Startups — éditeur de logiciels',
    city: 'Lille',
    department: '59',
    headcountRange: '1 000 à 1 999 salariés',
    nafCode: '62.01Z',
    signals: [
      { type: 'hiring', label: 'Développeur Java — plateforme e-commerce', date: '2026-10-12', contractType: 'CDI' },
    ],
    factors: [{ label: 'Activité de recrutement', points: 10, evidence: '1 offre ouverte' }],
    angle: null,
    roles: [],
    people: [],
  })
  const brandRows = [
    { ...brandHead, brandGroup: { role: 'head', members: [{ siren: brandMember.siren, name: brandMember.name }] } },
    { ...brandMember, brandGroup: { role: 'member', headSiren: brandHead.siren } },
  ]
  const all = [
    candidate({
      name: 'Verdal Distribution (démo)',
      sector: 'Grande distribution & retail',
      city: 'Lille',
      department: '59',
      headcountRange: '10 000 à 19 999 salariés',
      // Retrait des quatre comptes non cibles (01/10/2026) : plus aucun
      // compte du portefeuille ne partage ce NAF, donc ce candidat ne porte
      // PLUS de `similarityHeadline` (jamais une référence devinée). La
      // référence comparable est re-semée sur Marenval Financement (démo),
      // qui partage le NAF exact de Société Générale.
      nafCode: '47.11F',
      signals: [
        {
          type: 'legal',
          label: 'Programme de transformation pluriannuel annoncé',
          date: '2026-05-12',
          // #4068.8 — un fait ANCIEN (> 90 j) AVEC lien : daté, typé « Signal », jamais présenté comme récent.
          url: 'https://example.org/demo/verdal-programme-transformation',
        },
        {
          type: 'hiring',
          label: '14 offres ouvertes pour développeurs et data engineers',
          date: '2026-06-20',
          contractType: 'CDI',
          // #3204.2 (épopée #3238) — EXTRACTION, parité démo (craft rule n°9).
          technologies: ['SAP', 'AWS'],
          jobFamily: 'data_ia',
          team: 'data',
          hiringSignalClass: 'internal_hiring',
          stillOpen: true,
          similarOfferCount: 1,
          // #3205.1 (épopée #3239) — prestataire tiers mentionné, parité démo.
          thirdPartyProviderMention: 'sopra steria',
          // #3204.2 (épopée #3238, reste) — entité précise, parité démo :
          // Lyon pour cette offre, Marseille pour l'autre ci-dessous, même
          // employeur (Verdal Distribution) — le nom résolu du groupe ne les
          // distingue pas.
          siteCity: 'Lyon',
          ...demoDeliveryFit({
            authorized_countries: 'compatible',
            languages: 'compatible',
            site_presence: 'compatible',
          }),
        },
        {
          type: 'hiring',
          label: 'Data engineer confirmé — pôle décisionnel',
          date: '2026-06-08',
          contractType: 'CDI',
          technologies: ['Kafka'],
          jobFamily: 'data_ia',
          hiringSignalClass: 'internal_hiring',
          stillOpen: true,
          similarOfferCount: 1,
          siteCity: 'Marseille',
        },
      ],
      // #3204.6/.7 (épopée #3238) — AGRÉGATION, parité démo : les deux offres
      // « data_ia » ci-dessus, citées comme preuve d'une expansion d'équipe.
      aggregatedSignals: [
        {
          aggregateClass: 'team_growth_signal',
          jobFamily: 'data_ia',
          supportingOffers: [
            { label: '14 offres ouvertes pour développeurs et data engineers', date: '2026-06-20' },
            { label: 'Data engineer confirmé — pôle décisionnel', date: '2026-06-08' },
          ],
          reason: '2 offres data_ia rapprochées — expansion probable de cette équipe.',
        },
      ],
      factors: [
        { label: 'Secteur dans ta cible', points: 25, evidence: 'Grande distribution & retail' },
        { label: 'Programme de transformation financé', points: 30, evidence: 'Volet numérique annoncé' },
        { label: 'Recrutement IT engagé', points: 25, evidence: '14 offres ouvertes' },
      ],
      angle: 'Se positionner sur le lot de construction avant le re-référencement des prestataires.',
      roles: [
        { title: 'Directeur des systèmes d’information', department: 'DSI' },
        { title: 'CTO Digital', department: 'Digital' },
      ],
      // Deux personnes, dont UNE sans mandat libellé : la carte écrit alors
      // « Non su : le mandat · le lieu de travail » au lieu de remplir.
      people: [{ name: 'Hélène Vasseur (démo)', role: 'Présidente du directoire' }, { name: 'Bruno Delcourt (démo)' }],
      // #2291.2 — observé SANS indépendant ni régie : le filtre le retire,
      // mais il est CONNU — jamais compté parmi les inconnus.
      contractModel: demoJobOffers({ permanent: 12, fixedTerm: 2 }, '2026-03-24', '2026-06-20'),
    }),
    // #4284.1 / #4284.26 (recette 21/10, craft rule n°9) — le COMPTE et l'OFFRE « hors de ton métier » se voient en
    // démo : un commerce de détail (NAF 47.11B) dont la seule offre est hors des métiers du profil démo. Il n'est
    // jamais caché : il reste dans la liste, plus bas, marqué. Fictif, suffixé « (démo) ».
    candidate({
      name: 'Maison Delcourt Proximité (démo)',
      sector: 'Commerce de détail — proximité',
      city: 'Lille',
      department: '59',
      headcountRange: '250 à 499 salariés',
      nafCode: '47.11B',
      outOfTrade: true,
      signals: [{ type: 'hiring', label: 'Gérant de magasin H/F', date: '2026-10-08', contractType: 'CDI' }],
      factors: [],
      angle: 'Hors de ton métier : ses seules offres ne sont pas dans les métiers que ton espace place.',
      roles: [],
      people: [],
    }),
    candidate({
      name: 'Marenval Financement (démo)',
      sector: 'Services financiers — financement spécialisé',
      city: 'Nantes',
      department: '44',
      headcountRange: '1 000 à 1 999 salariés',
      // #2166.11 — LA RÉFÉRENCE COMPARABLE (craft rule n°9, re-semée le
      // 01/10/2026) : NAF EXACTEMENT celui de Société Générale
      // (`societeGeneraleDossier`, 64.19Z), ce qui rend `similarityHeadline`
      // VRAIE, pas un texte de secteur libre — même précision que
      // `resolveSimilarityHeadlines` (discover-portfolio.service.ts).
      nafCode: '64.19Z',
      similarityHeadline: { kind: 'sector', referenceAccount: 'Société Générale' },
      offersVolume: 41,
      signals: [{ type: 'legal', label: 'Réorganisation des filiales de financement annoncée', date: '2026-06-02' }],
      factors: [
        { label: 'Secteur comparable à un compte analysé', points: 10, evidence: 'Même code d’activité (64.19Z)' },
      ],
      angle: 'Ouvrir par la réorganisation annoncée, avant que les budgets de filiale ne soient arbitrés.',
      roles: [{ title: 'Directeur des systèmes d’information', department: 'DSI' }],
      people: [],
    }),
    candidate({
      name: 'Pharmatek Santé (démo)',
      sector: 'Santé privée — cliniques & imagerie',
      city: 'Lyon',
      department: '69',
      headcountRange: '2 000 à 4 999 salariés',
      nafCode: '86.10Z',
      // #3705.5 — rattachement de groupe SOURCÉ : « Filiale de Groupe Aurélys (démo) » sur la ligne.
      groupLink: { kind: 'capital_link', entities: ['Groupe Aurélys (démo)'] },
      signals: [
        {
          type: 'tender',
          label: 'Appel d’offres en préparation pour l’hébergement de données de santé',
          date: '2026-06-05',
          // #3237 (#3203.8) — extension tender : données de santé = indice à vérifier.
          ...demoDeliveryFit({ sensitive_data: 'potentially_compatible', security: 'potentially_compatible' }),
        },
      ],
      factors: [
        { label: 'Secteur dans ta cible', points: 25, evidence: 'Santé & médico-social' },
        { label: 'Appel d’offres en préparation', points: 30, evidence: 'Hébergement de données de santé' },
      ],
      angle: 'Entrer par la contrainte réglementaire, avant la publication de la consultation.',
      roles: [{ title: 'Responsable de la sécurité des systèmes d’information', department: 'DSI' }],
      // #3983.11 — filiale sans dirigeant propre : le dirigeant de la maison mère, marqué « Dirigeant du groupe · <mandat> »
      // (même forme que `inherit_group_people`, jamais présenté comme celui de la filiale).
      people: [{ name: 'Marc Oberlé (démo)', role: 'Dirigeant du groupe · Directeur général' }],
    }),
    candidate({
      name: 'Altiver Industries (démo)',
      sector: 'Industrie — équipements électromécaniques',
      city: 'Toulouse',
      department: '31',
      headcountRange: '1 000 à 1 999 salariés',
      nafCode: '27.11Z',
      signals: [{ type: 'award', label: 'Contrat cadre remporté auprès d’un avionneur', date: '2026-04-22' }],
      factors: [
        { label: 'Secteur dans ta cible', points: 20, evidence: 'Industrie' },
        { label: 'Contrat cadre remporté', points: 25, evidence: 'Nouvelle exigence de traçabilité' },
      ],
      angle: 'La traçabilité exigée par l’aéronautique dépasse ce que l’usine sait produire aujourd’hui.',
      roles: [{ title: 'Directeur industriel', department: 'Opérations' }],
    }),
    candidate({
      name: 'Kermorvan Négoce (démo)',
      sector: 'Commerce & distribution',
      city: 'Nantes',
      department: '44',
      headcountRange: '500 à 999 salariés',
      nafCode: '46.90Z',
      signals: [{ type: 'hiring', label: 'Recrutement de deux profils data', date: '2026-06-18', contractType: 'CDI' }],
      factors: [
        { label: 'Secteur dans ta cible', points: 20, evidence: 'Commerce & distribution' },
        { label: 'Recrutement data engagé', points: 20, evidence: 'Deux postes ouverts' },
      ],
      angle: 'Un recrutement engagé signale un budget déjà voté — proposer le renfort avant l’arrivée.',
      roles: [{ title: 'Responsable data', department: 'DSI' }],
    }),
    candidate({
      name: 'Sablé Pharma (démo)',
      sector: 'Santé & médico-social',
      city: 'Strasbourg',
      department: '67',
      headcountRange: '2 000 à 4 999 salariés',
      nafCode: '21.20Z',
      signals: [
        {
          type: 'award',
          label: 'Marché public IT attribué',
          date: '2026-02-10',
          detail: 'Titulaire : un concurrent — la fenêtre est fermée pour douze mois',
        },
      ],
      factors: [
        { label: 'Secteur dans ta cible', points: 20, evidence: 'Santé & médico-social' },
        { label: 'Marché récemment attribué à un concurrent', points: -10, evidence: 'Attribution 02/2026' },
      ],
      // Pas d'angle : les faits ne le portent pas. Un angle écrit pour remplir
      // la carte serait exactement ce que le produit s'interdit.
      angle: null,
      roles: [],
    }),
    candidate({
      name: 'Aubrac Aerostructures (démo)',
      sector: 'Aéronautique & spatial',
      city: 'Toulouse',
      department: '31',
      headcountRange: '500 à 999 salariés',
      nafCode: '30.30Z',
      // DISCOVER-OFFRES (15/10) — « 179 offres en France sur 90 jours » (ordre de grandeur mesuré le 15/10).
      offersVolume: 179,
      // #4115 — la GRILLE, parité démo (craft rule n°9) : ce compte porte le plafond de la
      // règle Louis du 13/10 — 5 signaux FORTS puis 10 de CONTEXTE, chaque tranche du plus
      // frais au plus ancien. Rien d'autre n'est ajouté que ce que la grille garde.
      signals: [
        {
          type: 'tender',
          label: 'Appel d’offres — infogérance des postes de calcul du bureau d’études',
          date: '2026-09-18',
          tier: 'strong',
          ...demoDeliveryFit({ site_presence: 'incompatible' }),
        },
        {
          type: 'funding',
          label: 'Levée de fonds de 40 M€ pour moderniser la chaîne numérique',
          date: '2026-09-02',
          detail: 'Presse spécialisée',
          url: 'https://aubrac-aerostructures.example/presse/levee-de-fonds-40-meur',
          tier: 'strong',
        },
        {
          type: 'business',
          label: 'Nomination d’un nouveau directeur des systèmes d’information',
          date: '2026-08-28',
          tier: 'strong',
        },
        {
          type: 'hiring',
          label: '9 offres ouvertes pour développeurs calcul et simulation',
          date: '2026-08-22',
          tier: 'strong',
          detail: 'Bureau d’études — dimensionnement structure, rattaché(e) au Directeur Technique',
          // #3204.2 (épopée #3238) — rattachement hiérarchique, parité démo.
          reportsTo: 'directeur technique',
          jobFamily: 'developpement',
          // #3238 (recette 02/10) — « senior » : un niveau que la société PLACE (confirmé, senior).
          seniority: 'senior',
          // #3204.2 (épopée #3238, recette 30/09) — `siteCity` sur un compte DANS LA
          // CIBLE : Verdal (hors cible) la porte aussi, mais la vue par défaut ne
          // le montre pas — la salle la voit donc ici, sans cocher « hors cible ».
          siteCity: 'Blagnac',
          // #4182 — le rattachement est ÉCRIT dans l'offre : demandeur probable étayé, auteur ≠ manager.
          requester: {
            author: { kind: 'rh', evidence: 'texte_de_l_offre' },
            possibleManager: { function: 'directeur technique', entity: 'Blagnac', evidence: 'texte_de_l_offre' },
            team: null,
            scope: { city: 'Blagnac' },
            jobFamily: 'developpement',
            status: 'etaye',
            openFreelanceMission: false,
          },
          ...demoDeliveryFit({ site_presence: 'incompatible', clearances: 'incompatible' }),
        },
        {
          type: 'hiring',
          label: 'Quatre développeurs PLM recherchés pour la migration',
          date: '2026-08-05',
          contractType: 'CDI',
          hiringSignalClass: 'internal_hiring',
          jobFamily: 'developpement',
          // #4182 — l'offre ne dit pas quel service la demande : un rôle à identifier, avec sa méthode.
          requester: {
            author: { kind: 'non_precise', evidence: null },
            possibleManager: null,
            team: null,
            scope: { city: null },
            jobFamily: 'developpement',
            status: 'a_identifier',
            openFreelanceMission: false,
            method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'],
          },
          tier: 'strong',
        },
        // #4068 (lot DECOUVRIR-CARTE) — le résultat financier, repris par DEUX sources (une
        // seule ligne de carte, qui garde le lien) : reste dans le plafond 5 forts/10 contexte
        // de la grille #4115 en remplaçant deux signaux `business` sans suite (ex-fillers), pas
        // en ajoutant au-delà du plafond. Fait fictif ; `example.org` n'est pas un site réel.
        {
          type: 'business',
          label: 'Aubrac Aerostructures publie un CA semestriel en hausse de 12 % sur S1 2026',
          date: '2026-09-25',
          tier: 'context',
          url: 'https://example.org/aubrac-aerostructures/resultats-s1-2026',
        },
        {
          type: 'business',
          label: 'Aubrac Aerostructures : chiffre d’affaires S1 2026 en hausse de 12 %',
          date: '2026-09-24',
          tier: 'context',
        },
        // #4115 (Louis 13/10) — l'alternance se voit, en CONTEXTE : jamais une place de signal fort. Dans un métier placé
        // du profil démo (#3901.p, 16/10) : un poste hors métier n'aurait pas survécu à la lecture de Découvrir.
        {
          type: 'hiring',
          label: 'Alternance – data analyst H/F',
          date: '2026-09-18',
          contractType: 'Alternance',
          tier: 'context',
        },
        { type: 'legal', label: 'Cession d’un établissement de sous-traitance', date: '2026-08-14', tier: 'context' },
        { type: 'tech', label: 'Pile de simulation observée : Abaqus, ANSYS', date: '2026-07-18', tier: 'context' },
        { type: 'tech', label: 'Migration PLM annoncée', date: '2026-07-04', tier: 'context' },
        { type: 'business', label: 'Participation au salon du Bourget', date: '2026-06-22', tier: 'context' },
        { type: 'business', label: 'Certification EN 9100 renouvelée', date: '2026-06-10', tier: 'context' },
        { type: 'tech', label: 'Pile CAO observée : CATIA V5, ENOVIA', date: '2026-05-27', tier: 'context' },
        {
          type: 'hiring',
          label: 'Développeur qualité — offre retirée',
          date: '2025-02-10',
          tier: 'context',
          detail: 'Poste en remplacement du titulaire précédent, parti en mobilité interne',
          // #3204.2 (épopée #3238) — RÈGLE : une offre retirée ne reste pas
          // un signal actuel, parité démo (craft rule n°9).
          stillOpen: false,
          // #3204.7 (épopée #3238, reste du 30/09) — REPLACEMENT_SIGNAL,
          // parité démo : le texte nomme explicitement un remplacement, même
          // sur une offre depuis retirée.
          replacementSignal: true,
        },
      ],
      // #3204.7 (épopée #3238, reste du 30/09) — REPLACEMENT_SIGNAL, parité
      // démo : l'offre « Ingénieur qualité » ci-dessus cite son propre texte.
      aggregatedSignals: [
        {
          aggregateClass: 'replacement_signal',
          jobFamily: '',
          supportingOffers: [{ label: 'Développeur qualité — offre retirée', date: '2025-02-10' }],
          reason: 'Le texte de cette offre nomme explicitement un remplacement ou une succession.',
        },
      ],
      factors: [
        { label: 'Secteur dans ta cible', points: 25, evidence: 'Aéronautique & spatial' },
        { label: 'Recrutement soutenu sur ton cœur de métier', points: 20, evidence: '9 offres calcul/simulation' },
      ],
      angle: 'Le PLM qui bouge et neuf postes de calcul ouverts : la charge dépasse l’équipe interne.',
      roles: [
        { title: 'Directeur du bureau d’études', department: 'Ingénierie' },
        { title: 'Responsable PLM', department: 'DSI' },
      ],
      // #2291.2 — le filtre « recourt au freelance / à la régie » le GARDE :
      // trois offres « Profession libérale » sur les neuf lues.
      contractModel: demoJobOffers({ permanent: 5, fixedTerm: 1, freelance: 3 }, '2026-06-03', '2026-08-22'),
    }),
    candidate({
      name: 'Cévennes Défense Systèmes (démo)',
      sector: 'Défense',
      // #4294.7 — l'espace a déjà livré une mission ici : « Déjà travaillées » le retient, et il se COMBINE avec le
      // secteur (aéronautique & défense) — Aubrac, du même secteur mais jamais travaillé, sort.
      workedBefore: true,
      // #3876 — LA carte sans commune connue de la salle (un site de défense ne publie pas toujours
      // son adresse) : aucune puce « ville · département » (jamais un libellé vide), et un filtre
      // de département ne la retient pas — un lieu inconnu ne correspond à aucun département.
      city: null,
      department: null,
      headcountRange: '250 à 499 salariés',
      nafCode: '25.40Z',
      signals: [
        {
          type: 'tender',
          label: 'Consultation sur le maintien en condition opérationnelle',
          date: '2026-08-30',
          // #4068.8 — un « Besoin » AVEC lien (« Voir l'annonce »).
          url: 'https://example.org/demo/consultation-mco',
        },
        {
          // #3941.5 (Louis 17/10) — l'augmentation de capital (annonce de registre) : daté, lié à son annonce,
          // sans montant ni mot « levée » (on ne nomme pas ce que le registre ne dit pas). Données fictives.
          type: 'business',
          label: 'Augmentation de capital',
          date: '2026-09-09',
          url: 'https://example.org/demo/cevennes-annonce-augmentation-de-capital',
        },
        {
          // #4732.1 (recette 01/11) — « Rachat ou fusion » : critère qui se coche, fait fort de la carte. Daté, lié
          // à son annonce, sans acquéreur ni montant (le registre ne dit pas qui achète). Données fictives.
          type: 'business',
          label: 'Rachat ou fusion',
          date: '2026-09-11',
          url: 'https://example.org/demo/cevennes-annonce-rachat-fusion',
        },
        {
          type: 'hiring',
          label: 'Développeur support applicatif — offre ouverte',
          date: '2026-09-14',
          // #4068.8 — un « Recrutement » AVEC lien ; les autres faits de la démo n'en ont pas (cas sans lien).
          url: 'https://jobs.lever.example/demo/offre-support-applicatif',
          detail: 'Premier poste, accompagnement par l’équipe en place',
          // #3238 (recette 02/10) — « junior » : le niveau que la société NE place PAS (profil démo :
          // confirmé, senior), pour que les deux rendus se voient dans la vue par défaut.
          seniority: 'junior',
          // #2616.1 — le contrat distingué (CDI) : la source ATS et le type de contrat sont visibles ensemble.
          contractType: 'CDI',
          stillOpen: true,
        },
        // #4045.1 — parité démo du tri par mot-clé : une offre cyber plus ANCIENNE que la précédente,
        // qui remonte en tête quand la recherche porte « cybersécurité » (sans mot-clé, l'ordre ne change pas).
        {
          type: 'hiring',
          label: 'Ingénieur DevOps SOC N2 — cybersécurité (démo)',
          date: '2026-08-12',
          contractType: 'CDI',
        },
      ],
      factors: [{ label: 'Secteur dans ta cible', points: 25, evidence: 'Défense' }],
      // Un seul fait porteur : l'angle reste NON écrit plutôt qu'inventé.
      angle: null,
      roles: [{ title: 'Responsable des systèmes d’information', department: 'DSI' }],
      // #2291.2 — cherché, rien d'attribuable : « non observé ». Coché, le
      // filtre le retire ET le rail le dit (« 1 compte retiré faute
      // d'observation ») — le geste réel, pas un trou.
      contractModel: null,
    }),
    // #2614.1 — LE CANDIDAT EXCLU. Dans la cible (même secteur qu'Aubrac
    // Aerostructures, donc visible dans la vue PAR DÉFAUT) pour que le
    // masquage se voie sans geste supplémentaire : le conseil de
    // qualification a rendu un verdict EXCLU, la liste ne le propose plus, et
    // le compteur nommé de `ResultsToolbar` dit combien a été masqué.
    candidate({
      name: 'Roggeman Structures — M. Roggeman (démo)',
      sector: 'Aéronautique & spatial',
      city: 'Bordeaux',
      department: '33',
      headcountRange: 'Non salarié — activité individuelle',
      nafCode: '71.12B',
      // Un verdict EXCLU voyage avant le score et le domine (discover.py) :
      // la démo ne simule ni signal ni facteur pour une ligne que le conseil
      // écarte déjà — un angle ou un facteur inventés ici promettraient un
      // travail que le vrai chemin ne fait jamais sur une ligne exclue.
      signals: [],
      factors: [],
      angle: null,
      roles: [],
      qualification: {
        verdict: 'excluded',
        code: 'natural_person',
        reason: 'Le registre associe ce SIREN à une personne physique (profession libérale), pas à une organisation.',
      },
    }),
    // #3983 (reste, Louis 11/10) — « HOLDING → FILIALE » (craft rule n°9). La holding de Pharmatek
    // Santé (démo) a son siège à Paris ; sa filiale, implantée à Lyon, est la cible (« Filiale de
    // Groupe Aurélys (démo) » sur sa ligne). La holding est ÉCARTÉE avec sa raison nommée, comme le
    // vrai chemin (`holding_subsidiary.py`) quand le lien capitalistique est sourcé. « Santé privée »
    // la garde dans la cible déclarée : le masquage se voit dans la vue PAR DÉFAUT. Aucun signal ni
    // facteur : une ligne écartée n'en reçoit jamais (même règle que Roggeman, plus haut).
    candidate({
      name: 'Groupe Aurélys (démo)',
      sector: 'Santé privée — société holding du groupe',
      city: 'Paris',
      department: '75',
      headcountRange: '10 à 19 salariés',
      nafCode: '64.20Z',
      signals: [],
      factors: [],
      angle: null,
      roles: [],
      qualification: {
        verdict: 'excluded',
        code: 'holding_subsidiary_in_zone',
        reason:
          'Holding dont le siège est hors de la zone : sa filiale Pharmatek Santé (démo) y est implantée (lien capitalistique sourcé) et sort comme cible à sa place.',
        subsidiaries: [{ name: 'Pharmatek Santé (démo)' }],
      },
    }),
    // #4358.4 (décision Louis 21/10) — LE SECTEUR SE LIT PAR NAF + ACTIVITÉ + SITE (craft rule n°9). Une
    // place de marché fictive, codée « commerce de gros » (46.90Z), reste dans « E-commerce &
    // marketplaces » parce que son activité déclarée le dit : sa ligne NOMME « rattaché par son activité ».
    candidate({
      name: 'Marché Reconditionné (démo)',
      sector: 'Commerce & distribution',
      city: 'Paris',
      department: '75',
      headcountRange: '50 à 99 salariés',
      nafCode: '46.90Z',
      signals: [],
      factors: [],
      angle: null,
      roles: [],
      qualification: {
        verdict: 'recommended',
        code: null,
        reason: 'Entité opérationnelle valide.',
        sectorAttachment: { sector: 'ecommerce', via: 'activity' },
      },
    }),
    // #3238 (recette démo 05/10) — « Comptes qui recrutent » sur un compte RÉEL des briefs (Naval
    // Group) : deux offres publiées par deux sites distincts du siège (Paris) — Indret (La Montagne,
    // pôle propulsion, brief : « 150 recrutements par an ») et Lorient (site côtier cité au brief).
    // Le secteur est dans la cible : la puce « Sites : La Montagne, Lorient » se voit SANS cocher
    // « hors cible », sur la carte du compte comme sur la ligne de « Besoins et signaux ».
    candidate({
      // #3819 (démo Ludovic 08/10) — le NOM du compte semé, sans suffixe : Naval
      // Group est un compte RÉEL des briefs, et la liste d'appels
      // (`POST /contacts/call-list`) rapproche le candidat du compte de la salle
      // par son nom (le compte semé n'a pas de SIREN) — avec le suffixe, ses
      // personnes et leurs coordonnées n'apparaissaient jamais.
      name: 'Naval Group',
      sector: 'Aéronautique & Défense — construction navale',
      city: 'Paris',
      department: '75',
      headcountRange: '10 000 à 19 999 salariés',
      nafCode: '30.11Z',
      signals: [
        {
          type: 'hiring',
          label: 'Développeurs outils d’ingénierie propulsion nucléaire — recrutement continu',
          date: '2026-09-18',
          detail: 'Site d’Indret : charge 2026-2032 supérieure à la capacité de 2,5 M d’heures par an',
          contractType: 'CDI',
          jobFamily: 'ingenierie',
          hiringSignalClass: 'internal_hiring',
          stillOpen: true,
          siteCity: 'La Montagne',
          url: 'https://www.apec.example/demo/offres/naval-group-ingenieur-propulsion-nucleaire',
        },
        {
          type: 'hiring',
          label: 'Data engineers planification et PMO de programme — offres ouvertes',
          date: '2026-09-02',
          contractType: 'CDI',
          jobFamily: 'gestion_projet',
          hiringSignalClass: 'internal_hiring',
          stillOpen: true,
          siteCity: 'Lorient',
          url: 'https://www.welcometothejungle.example/demo/offres/naval-group-pmo-programme',
        },
        // #4045 — projet et vie de l'entreprise (fictifs), chacun avec son lien : parité démo de la ligne Découvrir.
        {
          type: 'business',
          label: 'Projet : nouvelle ligne d’assemblage numérique du site de Lorient',
          date: '2026-09-25',
          url: 'https://presse.demo.example/naval-group/ligne-assemblage-lorient',
        },
        {
          type: 'business',
          label: 'Nomination d’un directeur des systèmes d’information groupe',
          date: '2026-09-10',
          url: 'https://presse.demo.example/naval-group/nomination-dsi',
        },
      ],
      factors: [
        { label: 'Secteur dans ta cible', points: 25, evidence: 'Aéronautique & Défense' },
        { label: 'Recrutement soutenu sur deux sites', points: 20, evidence: '2 offres, 2 sites' },
      ],
      angle: 'La charge des programmes dépasse la capacité du site : proposer du renfort PMO et planification.',
      roles: [{ title: 'Directeur de programme', department: 'Programmes' }],
      people: [],
    }),
    // #3757 — la dernière ligne, EXPRÈS : une ESN (NAF 62.02A) passe APRÈS les clients finaux
    // (le rôle change l'ORDRE, jamais le CONTENU) et porte le badge « concurrente ou partenaire
    // rang 2, pas client final ». Fictive comme les autres lignes de la salle.
    candidate({
      name: 'Orvane Digital Services (démo)',
      sector: 'Tech & Startups — services numériques (ESN)',
      city: 'Lyon',
      department: '69',
      headcountRange: '1 000 à 1 999 salariés',
      nafCode: '62.02A',
      signals: [
        {
          type: 'hiring',
          label: 'Développeurs Java et consultants cloud — recrutement continu',
          date: '2026-09-20',
          detail: 'Offres publiées pour renforcer ses équipes de régie, pas pour un besoin interne',
          jobFamily: 'ingenierie',
          hiringSignalClass: 'staffing_signal',
          stillOpen: true,
        },
      ],
      factors: [{ label: 'Activité de recrutement', points: 10, evidence: '1 offre ouverte' }],
      angle: null,
      roles: [{ title: 'Directeur des partenariats', department: 'Direction commerciale' }],
      people: [],
      isEsnPeer: true,
    }),
    // Lot T point 1 — une ESN que son NAF (71.12B, ingénierie) ne dit PAS : deux de ses offres parlent de « chez nos
    // clients » et d'« intercontrat ». Elle va dans « Autres acteurs » avec le motif « reconnue ESN : ses offres le
    // disent ». Fictive comme les autres lignes de la salle ; sans ces offres, elle resterait client final.
    candidate({
      name: 'Calderis Ingénierie (démo)',
      sector: 'Ingénierie et études techniques',
      city: 'Strasbourg',
      department: '67',
      headcountRange: '250 à 499 salariés',
      nafCode: '71.12B',
      signals: [
        {
          type: 'hiring',
          label: 'Ingénieur Java — mission chez nos clients grands comptes',
          date: '2026-09-24',
          detail: 'Interventions chez nos clients, en régie',
          jobFamily: 'ingenierie',
          hiringSignalClass: 'staffing_signal',
          stillOpen: true,
        },
        {
          type: 'hiring',
          label: 'Consultant data — mission chez un client, intercontrat accompagné',
          date: '2026-09-26',
          detail: 'Consultant en régie',
          jobFamily: 'ingenierie',
          hiringSignalClass: 'staffing_signal',
          stillOpen: true,
        },
      ],
      factors: [{ label: 'Activité de recrutement', points: 10, evidence: '2 offres ouvertes' }],
      angle: null,
      roles: [{ title: 'Directeur des opérations', department: 'Opérations' }],
      people: [],
      isEsnPeer: true,
      esnRecognition: 'offers',
    }),
    // #3757 (reste) — un SIREN que CET espace a DÉCLARÉ partenaire
    // (`partner_relations`) porte son propre badge « Partenaire déclaré »,
    // jamais celui d'Orvane ci-dessus (une hypothèse NAF) : les deux lignes
    // montrent la DISTINCTION, pas la même carte redite. Fictive comme les
    // autres lignes de la salle.
    candidate({
      name: 'Askelia Partners (démo)',
      sector: 'Tech & Startups — services numériques (ESN)',
      city: 'Nantes',
      department: '44',
      headcountRange: '250 à 499 salariés',
      nafCode: '62.02A',
      signals: [
        {
          type: 'hiring',
          label: 'Consultants data — recrutement continu',
          date: '2026-09-22',
          detail: 'Offres publiées pour renforcer ses équipes de régie, pas pour un besoin interne',
          jobFamily: 'ingenierie',
          hiringSignalClass: 'staffing_signal',
          stillOpen: true,
        },
        // #3941 — une levée annoncée (datée, sourcée « Presse spécialisée »), la nature `funding`
        // que les fils publics de levées alimentent en production.
        {
          type: 'funding',
          label: 'Levée de fonds : 12 M€ · série B',
          date: '2026-09-30',
          detail: 'Presse spécialisée',
          // #4285.1 — l'annonce de la levée (domaine fictif `.example`) : une levée affichée porte son lien.
          url: 'https://askelia.example/actualites/levee-de-fonds-serie-b',
        },
      ],
      factors: [{ label: 'Activité de recrutement', points: 10, evidence: '1 offre ouverte' }],
      angle: null,
      roles: [{ title: 'Directeur des partenariats', department: 'Direction commerciale' }],
      people: [],
      isDeclaredPartner: true,
    }),
    // #4814 (arbitrage Louis 31/10, « les quatre ») — intérim, VMS, MSP, apporteur d'affaires : quatre lignes
    // FICTIVES qui portent `isIntermediary`, pour que le filtre « Clients finaux » les retire à l'écran (et que
    // « ESN »/« tous » les gardent). Aucune ne porte `isEsnPeer`/`isDeclaredPartner` (un seul type par ligne).
    candidate({
      name: 'Ouest Intérim Services (démo)',
      sector: 'Tech & Startups — services numériques (ESN)',
      city: 'Rennes',
      department: '35',
      headcountRange: '50 à 249 salariés',
      nafCode: '78.20Z',
      signals: [
        {
          type: 'hiring',
          label: 'Développeurs Java — missions d’intérim',
          date: '2026-09-24',
          detail: 'Mission proposée pour le compte d’une entreprise cliente non nommée',
          jobFamily: 'ingenierie',
          stillOpen: true,
        },
      ],
      factors: [{ label: 'Activité de recrutement', points: 10, evidence: '1 offre ouverte' }],
      angle: null,
      roles: [],
      people: [],
      isIntermediary: true,
    }),
    candidate({
      name: 'Vendorly Flex (démo)',
      sector: 'Tech & Startups — services numériques (ESN)',
      city: 'Paris',
      department: '75',
      headcountRange: '50 à 249 salariés',
      nafCode: '62.01Z',
      signals: [
        {
          type: 'hiring',
          label: 'Développeurs freelances — appel d’offres fournisseurs',
          date: '2026-09-24',
          detail: 'Plateforme qui orchestre les fournisseurs d’un donneur d’ordre, pas un besoin interne',
          jobFamily: 'ingenierie',
          stillOpen: true,
        },
      ],
      factors: [{ label: 'Activité de recrutement', points: 10, evidence: '1 offre ouverte' }],
      angle: null,
      roles: [],
      people: [],
      isIntermediary: true,
    }),
    candidate({
      name: 'Sourcia Managed Staffing (démo)',
      sector: 'Tech & Startups — services numériques (ESN)',
      city: 'Lille',
      department: '59',
      headcountRange: '50 à 249 salariés',
      nafCode: '78.30Z',
      signals: [
        {
          type: 'hiring',
          label: 'Développeurs data — programme prestataires',
          date: '2026-09-24',
          detail: 'Programme de prestataires géré pour le compte de grands comptes',
          jobFamily: 'ingenierie',
          stillOpen: true,
        },
      ],
      factors: [{ label: 'Activité de recrutement', points: 10, evidence: '1 offre ouverte' }],
      angle: null,
      roles: [],
      people: [],
      isIntermediary: true,
    }),
    candidate({
      name: 'Passerelle Affaires Conseil (démo)',
      sector: 'Tech & Startups — services numériques (ESN)',
      city: 'Bordeaux',
      department: '33',
      headcountRange: '50 à 249 salariés',
      nafCode: '70.22Z',
      signals: [
        {
          type: 'hiring',
          label: 'Chargé de développement — réseau d’apporteurs',
          date: '2026-09-24',
          detail: 'Met en relation des entreprises avec des prestataires, contre commission',
          jobFamily: 'ingenierie',
          stillOpen: true,
        },
      ],
      factors: [{ label: 'Activité de recrutement', points: 10, evidence: '1 offre ouverte' }],
      angle: null,
      roles: [],
      people: [],
      isIntermediary: true,
    }),
    // R24-FIX-B (15/10) — plus de compte fictif « 0 salarié » : une absence d'effectif n'est jamais « 0 »
    // (GA-18 / GA-19). La salle montre de vraies entreprises (`DEMO_REAL_DISCOVER_COMPANIES`), effectif absent
    // quand il n'est pas publié ; le tri « Taille » (#3814.4) reste tenu par `discover-ranking.test.ts`.
    // #3819.4 — recette prod 09/10 : le libellé « sélectionné sur le profil,
    // aucun signal mesuré » restait absent du tirage démo — AUCUN candidat
    // scripté non exclu ne portait `signals: []`, le seul autre candidat à
    // zéro signal (Roggeman, plus haut) étant écarté par le conseil de
    // qualification avant que la ligne ne s'affiche. Une recherche a bien eu
    // lieu (`signalsSearched: true`, posé par défaut ci-dessous) : c'est un
    // FAIT mesuré, « sans signal » — pas un compte jamais interrogé.
    candidate({
      name: 'Castelnau Ingénierie (démo)',
      sector: 'Aéronautique & Défense — sous-traitance mécanique',
      city: 'Mérignac',
      department: '33',
      headcountRange: '50 à 249 salariés',
      nafCode: '25.62B',
      signals: [],
      factors: [{ label: 'Correspond au profil ESN déclaré', points: 5, evidence: 'Secteur et taille compatibles' }],
      angle: null,
      roles: [],
      people: [],
    }),
    // #4758 / #4761 (28/10) — LE compte qui remonte sur son SEUL historique : trois offres Java datées de 2025-2026,
    // aucune dans la fenêtre récente (90 j). Il passe dans le bloc « Comptes à historique » et sa carte nomme la
    // raison (« 3 offres Java entre 2025 et 2026, la dernière il y a … »). Fictif, comme les autres lignes scriptées.
    candidate({
      name: 'Vauclair Logistique (démo)',
      sector: 'Transport & Logistique — entrepôts et messagerie',
      city: 'Lille',
      department: '59',
      headcountRange: '250 à 499 salariés',
      nafCode: '52.29A',
      signals: [
        {
          type: 'hiring',
          label: 'Développeur Java — système de gestion d’entrepôt',
          date: '2025-04-14',
          contractType: 'CDI',
        },
        {
          type: 'hiring',
          label: 'Développeur Java senior — plateforme de suivi des colis',
          date: '2025-12-02',
          contractType: 'CDI',
        },
        {
          type: 'hiring',
          label: 'Architecte Java — refonte du portail transporteurs',
          date: '2026-03-20',
          contractType: 'CDI',
        },
      ],
      factors: [{ label: 'Correspond au profil ESN déclaré', points: 5, evidence: 'Secteur et taille compatibles' }],
      angle: null,
      roles: [],
      people: [],
    }),
    // #4819.4 — LE cas vu en production : un compte dont la SEULE offre récente est FERMÉE. Une offre retirée n'est pas
    // un signal actuel : le compte ne passe pas en « Signaux récents » mais en « Comptes à historique », et la carte dit
    // pourquoi (« offre fermée ») au lieu d'afficher une date récente sans raison. Date relative : elle reste dans la
    // fenêtre quel que soit le jour où la salle est ouverte. Fictif, comme les autres lignes scriptées.
    candidate({
      name: 'Castaing Transports (démo)',
      sector: 'Transport & Logistique — transport routier et affrètement',
      city: 'Nantes',
      department: '44',
      headcountRange: '500 à 999 salariés',
      nafCode: '49.41A',
      signals: [
        {
          type: 'hiring',
          label: 'Lead développeur Java — supervision de la flotte',
          date: new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10),
          contractType: 'CDI',
          stillOpen: false,
        },
      ],
      factors: [{ label: 'Correspond au profil ESN déclaré', points: 5, evidence: 'Secteur et taille compatibles' }],
      angle: null,
      roles: [],
      people: [],
    }),
    // R24-FIX-B (15/10) — de VRAIES entreprises (décision Louis 04/10), effectif réel ou absent, offres datées.
    ...DEMO_REAL_DISCOVER_COMPANIES.map((company, index) =>
      candidate({
        ...company,
        signals: demoRealCompanySignals(index),
        factors: [{ label: 'Secteur dans ta cible', points: 25, evidence: company.sector }],
        angle: null,
        roles: [{ title: 'Directeur des systèmes d’information', department: 'DSI' }],
        people: [],
      }),
    ),
    // #3819.1 (lot RBB2) — le compte CLIENT déjà possédé par l'équipe de démonstration :
    // c'est la seule carte que le contrôleur rapproche du VRAI portefeuille (voir
    // `DEMO_DISCOVER_OWNED_CANDIDATE_NAMES`), pour que « N besoins connus » se voie en salle.
    candidate({
      name: DEMO_DELIVERY_CARRIER,
      sector: 'Transport ferroviaire & Aérien',
      city: 'Saint-Denis',
      department: '93',
      headcountRange: '10 000 à 19 999 salariés',
      nafCode: '49.10Z',
      signals: [],
      factors: [{ label: 'Secteur dans ta cible', points: 25, evidence: 'Transport ferroviaire' }],
      angle: null,
      roles: [],
      people: [],
    }),
    ...brandRows,
  ]

  /**
   * #3983 (recette prod 13/10) — LA TÊTE DE GROUPE SUIT SA FILIALE RETENUE. « Groupe Aurélys (démo) »
   * (NAF 64.20Z, siège parisien) n'apparaissait nulle part dès que la recherche visait la santé
   * (NAF 86.10Z) ou la zone de sa filiale : `matches` la retirait AVANT qu'elle ne soit écartée,
   * alors que le vrai chemin (`holding_subsidiary.py`) la rend écartée AVEC son motif. Une tête de
   * groupe dont la filiale (lien capitalistique sourcé, `groupLink`) est retenue reste donc dans la
   * liste — son verdict « écartée » la masque de la vue principale et la compte dans les exclues.
   */
  const matched = all.filter(row => matches(row))
  const isHeadOfKeptSubsidiary = (row: (typeof all)[number], kept: readonly (typeof all)[number][]): boolean =>
    kept.some(candidate => {
      const link = candidate.groupLink as { kind: string; entities: string[] } | undefined
      return link?.kind === 'capital_link' && link.entities.includes(row.name)
    })
  const nafFiltered = [...matched, ...all.filter(row => !matched.includes(row) && isHeadOfKeptSubsidiary(row, matched))]

  /**
   * #2489.3/D1 (décision Louis 18/09/2026 après-midi) — la démo montre le
   * filtre cible À L'ŒUVRE, pas juste sa présence dans le code (craft rule
   * n°9 : « un écran livré mais vide en démo se découvre en réunion »).
   *
   * `DEMO_ESN_PROFILE.target_sectors` (banque, aéronautique & défense, tech,
   * transport) ne couvre RÉELLEMENT que deux des sept candidats scriptés
   * ci-dessus (Aubrac Aerostructures, Cévennes Défense Systèmes) — les cinq
   * autres (distribution, santé ×2, industrie, commerce) sont donc écartés
   * par défaut, exactement comme la mesure de production du 18/09 l'a montré
   * pour un vrai espace. `matchesTargetSectors` est le MÊME appariement que
   * le vrai chemin (`similar-scoring.ts`, GA-26) — pas une troisième copie.
   */
  const targetSectors = DEMO_ESN_PROFILE.target_sectors
  const includeOutOfTarget = query.includeOutOfTarget === true
  /**
   * #3238 (recette démo 01/10) — UNE RECHERCHE QUI NOMME UN CANDIDAT LE MONTRE.
   *
   * Verdal Distribution est hors cible (distribution) : la vue par défaut le
   * masque, et la liste scriptée ignorait le texte libre — « Verdal
   * Distribution », « Lyon » ou « Marseille » ne remontaient donc jamais
   * l'entreprise ni la ville de ses offres (`siteCity`). Taper le NOM d'un
   * candidat, ou la ville d'une de ses offres, est un choix explicite : il
   * passe avant le filtre de cible par défaut (même esprit que
   * `includeOutOfTarget`). Aucun texte ne FILTRE la liste (voir
   * `demandeIllisible`, `demo-coverage.ts`) : il ne fait qu'AJOUTER un
   * candidat nommé, jamais n'en retire.
   */
  const freeText = foldForMatch(
    [query.freetext, query.keywords, query.city]
      .filter((value): value is string => typeof value === 'string')
      .join(' '),
  )
  const isNamedByQuery = (row: (typeof all)[number]): boolean => {
    if (!freeText) return false
    const company = foldForMatch(String(row.name).replace(/\(démo\)/i, ''))
    if (company && freeText.includes(company)) return true
    const firstWord = company.split(' ')[0]
    if (firstWord && firstWord.length >= 5 && freeText.split(' ').includes(firstWord)) return true
    const cities = (row.signals as Array<{ siteCity?: string }>)
      .map(signal => foldForMatch(signal.siteCity ?? ''))
      .filter(Boolean)
    return cities.some(city => freeText.includes(city))
  }
  let candidates: typeof nafFiltered = nafFiltered
  let targetSectorFilter: { applied: boolean; excludedCount: number; excludedSectors: string[] } | undefined
  if (targetSectors.length > 0) {
    const kept: typeof nafFiltered = []
    const excludedSectors: string[] = []
    const passesTarget = (row: (typeof nafFiltered)[number]): boolean =>
      !row.sector ||
      matchesTargetSectors(row.sector, targetSectors) ||
      includeOutOfTarget ||
      isNamedByQuery(row) ||
      row.name === DEMO_RECRUITING_TRACK_HEADLINER
    const passing = nafFiltered.filter(passesTarget)
    for (const row of nafFiltered) {
      // Secteur inconnu : jamais écarté en silence (GA-18/GA-19). #3983 — une tête de groupe dont la
      // filiale passe la cible la suit : elle est listée (écartée, motif nommé), pas « hors cible ».
      if (passesTarget(row) || isHeadOfKeptSubsidiary(row, passing)) {
        kept.push(row)
        continue
      }
      excludedSectors.push(row.sector || '')
    }
    candidates = kept
    targetSectorFilter = {
      applied: !includeOutOfTarget,
      excludedCount: includeOutOfTarget ? 0 : excludedSectors.length,
      excludedSectors: includeOutOfTarget ? [] : [...new Set(excludedSectors)].sort(),
    }
  }

  // #4361.2 — « Exclure les sociétés cotées » : la salle rejoue la FORME du vrai chemin (`discover.py`,
  // `_apply_listing_filter`) — les sociétés dont la cotation est connue sortent, les autres RESTENT et
  // sont comptées « cotation non établie », jamais « non cotées ». Sans interrupteur, aucun compteur.
  let listingFilter:
    { applied: boolean; excludedCount: number; unknownCount: number; sourceAvailable: boolean } | undefined
  if (query.excludeListed === true) {
    const kept = candidates.filter(row => !DEMO_LISTED_COMPANY_NAMES.includes(String(row.name)))
    listingFilter = {
      applied: true,
      excludedCount: candidates.length - kept.length,
      unknownCount: kept.length,
      sourceAvailable: true,
    }
    candidates = kept
  }

  // #4746.7 — « Clients finaux » : la salle rejoue la FORME du vrai chemin (`discover_signals.py`) — l'exclusion
  // porte sur ce que l'entreprise EST (ESN, intermédiaire, partenaire déclaré) et `coverage.filteredByEntityType`
  // dit combien. Les lectures « ESN » et « tous » ne retirent rien (rang 2 voulu, #4285.3) ; zéro retiré ⇒ aucun compteur.
  let filteredByEntityType = 0
  if (query.entityType === 'client') {
    const flags = (row: unknown): { isEsnPeer?: true; isIntermediary?: true; isDeclaredPartner?: true } =>
      row as { isEsnPeer?: true; isIntermediary?: true; isDeclaredPartner?: true }
    const kept = candidates.filter(
      row => !(flags(row).isEsnPeer || flags(row).isIntermediary || flags(row).isDeclaredPartner),
    )
    filteredByEntityType = candidates.length - kept.length
    candidates = kept
  }

  // #3983.4 — le bloc « où », seulement quand une zone est demandée (comme le service IA) : le siège
  // y est (base « siège »), ou seules des implantations la tiennent (base « implantation »).
  const withGeography = zoneRequested ? candidates.map(row => ({ ...row, geography: demoGeography(row) })) : candidates
  // #3876 — siège sans commune connue : `null`, jamais deviné (ni siège dans la zone).
  function demoGeography(row: { name: string; city: string | null; department: string | null }): unknown {
    const sites = sitesInZone(row.name)
    return {
      basis: departmentInZone(row.department) ? 'headquarters' : 'establishment',
      headquarters: { city: row.city, department: row.department },
      siteCount: sites.length,
      sites: sites.map(site => ({
        siret: null,
        city: site.city,
        department: site.department,
        region: DEMO_REGION_LABELS[DEMO_REGION_BY_DEPARTMENT[site.department] ?? ''] ?? null,
      })),
      // Comme le service IA : le code de région seulement quand la zone EST une région (pas un département).
      zoneRegion: wantedDepartments.length === 0 && wantedRegions.length === 1 ? wantedRegions[0] : null,
    }
  }

  // #4045.1 — le mot-clé TRIE les signaux (parité du vrai chemin, `discover.py`) : le recoupement
  // passe en tête et porte `keywordMatch`. Aucun compte ni signal retiré ; sans mot-clé, rien ne change.
  const keywordList = (Array.isArray(query.keywords) ? query.keywords : [query.keywords])
    .filter((value): value is string => typeof value === 'string')
    .flatMap(value => value.split(/[,;]+/))
    .map(foldForMatch)
    .filter(Boolean)
  const rankedByKeyword =
    keywordList.length === 0
      ? withGeography
      : withGeography.map(row => {
          const signals = row.signals as Array<{ label: string; technologies?: string[] }>
          const hit = (signal: { label: string; technologies?: string[] }): boolean => {
            const text = foldForMatch([signal.label, ...(signal.technologies ?? [])].join(' '))
            return keywordList.some(word => text.includes(word))
          }
          return {
            ...row,
            signals: [
              ...signals.filter(hit).map(signal => ({ ...signal, keywordMatch: true })),
              ...signals.filter(signal => !hit(signal)),
            ],
          }
        })

  // #4429.4 — la ville seule rend moins de `ZONE_WIDEN_MIN_RESULTS` comptes : la salle rejoue la FORME du
  // vrai chemin (`_widen_by_zone_tiers`, apps/ia), UN palier à la fois. ⚠️ c144 (Louis 27/10/2026 au
  // soir ; Louis 02/11 : 25 km → 50 km → département → région, plus de 100 km) : 50 km, puis le département, la région — l'automatique S'ARRÊTE à la région, même sous le seuil, jamais
  // de lecture « France » (renverse c143) ; le palier dit est le barreau le plus lointain que porte une ligne rendue, l'arrêt à la région est dit à part (`autoCapReached`). La salle ne publie aucune position : le barreau
  // 50 km est franchi à vide (et NOMMÉ dans `steps`) ; le rayon de départ envoyé par le web est 25 km. « Revenir au palier d'avant » (`zoneCeiling`) borne l'échelle.
  const zoneCity = typeof query.city === 'string' ? query.city.trim() : ''
  const exact = rankedByKeyword.filter(row => foldForMatch(row.city ?? '') === foldForMatch(zoneCity))
  const ladder = ['radius_50', 'department', 'region'] as const
  type DemoZoneTier = (typeof ladder)[number]
  const ceilingAt = ladder.indexOf(query.zoneCeiling as DemoZoneTier)
  const zoneTiers = ladder.slice(0, ceilingAt >= 0 ? ceilingAt + 1 : ladder.length)
  const widenable =
    zoneCity !== '' &&
    !zoneRequested &&
    query.zoneStrict !== true &&
    (query.radiusKm === undefined || query.radiusKm === DISCOVER_START_CITY_RADIUS_KM) &&
    exact.length > 0
  const cityDepartment = exact[0]?.department ?? ''
  const zoneRegion = DEMO_REGION_BY_DEPARTMENT[cityDepartment]
  const inTier = (row: (typeof rankedByKeyword)[number], tier: DemoZoneTier): boolean =>
    (tier === 'department' && row.department === cityDepartment) ||
    (tier === 'region' && zoneRegion !== undefined && DEMO_REGION_BY_DEPARTMENT[row.department ?? ''] === zoneRegion)
  const zoneSteps: DemoZoneTier[] = []
  const widened: Array<{ row: (typeof rankedByKeyword)[number]; tier: DemoZoneTier }> = []
  if (widenable && needsZoneWidening(exact.length)) {
    for (const tier of zoneTiers) {
      zoneSteps.push(tier)
      for (const row of rankedByKeyword) {
        if (!exact.includes(row) && !widened.some(w => w.row === row) && tier !== 'radius_50' && inTier(row, tier)) {
          widened.push({ row, tier })
        }
      }
      if (!needsZoneWidening(exact.length + widened.length)) break
    }
  }
  // 2710N — deux faits DISTINCTS, comme le vrai chemin (`zone_widening_of_list`, apps/ia) : `tier` est ce qui a été
  // TROUVÉ (le barreau le plus lointain que porte une ligne rendue — on n'annonce jamais un barreau qui n'a rien
  // ajouté, #4627) ; `autoCapReached` est ce qui a été TENTÉ (l'échelle est allée jusqu'à la région et la liste reste
  // courte). Une aire inconnue ne se nomme pas (jamais devinée).
  const reached: DemoZoneTier = widened.reduce<DemoZoneTier>(
    (far, { tier }) => (ladder.indexOf(tier) > ladder.indexOf(far) ? tier : far),
    'radius_50',
  )
  const autoCapReached = zoneSteps.includes(ZONE_AUTO_MAX_TIER) && needsZoneWidening(exact.length + widened.length)
  const areaOf = (tier: DemoZoneTier, department: string | null | undefined): string | undefined =>
    tier === 'region' ? DEMO_REGION_LABELS[zoneRegion ?? ''] : DEMO_DEPARTMENT_LABELS[department ?? '']
  const zoneArea = areaOf(reached, cityDepartment)
  const zoneWidening =
    widened.length > 0
      ? {
          place: exact[0]?.city ?? zoneCity,
          tier: reached,
          steps: zoneSteps.slice(0, zoneSteps.indexOf(reached) + 1),
          ...(zoneArea ? { area: zoneArea } : {}),
          exactCount: exact.length,
          widenedCount: widened.length,
          ...(autoCapReached ? { autoCapReached } : {}),
        }
      : undefined
  const listed = zoneWidening
    ? [
        ...exact,
        ...widened.map(({ row, tier }) => {
          const area = areaOf(tier, row.department)
          return { ...row, zone: { tier, ...(area ? { area } : {}) } }
        }),
      ]
    : rankedByKeyword

  return {
    candidates: listed,
    // #4305.2 — l'effort de la recherche, DIT comme le vrai chemin (`discover.py::_search_effort`) : trois sources de
    // la salle interrogées, et la salle n'avait plus rien à rendre. Une liste vide ne dit rien (jamais « 0 source »).
    query: {
      ...query,
      ...(listed.length > 0 ? { searchEffort: { sourcesQueried: 3, stoppedBy: 'exhausted' } } : {}),
      // #4419 — l'entonnoir de rejet, DIT comme le vrai chemin (`query.funnel`, apps/ia `discover_funnel.py`) : la
      // ville a retenu ses comptes et écarté « hors ville » le reste de la salle (rendu à part, étiqueté, par l'élargissement).
      ...(zoneWidening
        ? {
            funnel: {
              entered: exact.length + widened.length,
              kept: exact.length,
              rejected: { city: widened.length },
            },
          }
        : {}),
    },
    degraded: [],
    ...(targetSectorFilter ? { targetSectorFilter } : {}),
    ...(listingFilter ? { listingFilter } : {}),
    ...(filteredByEntityType > 0 ? { coverage: { filteredByEntityType } } : {}),
    ...(zoneWidening ? { zoneWidening } : {}),
  }
}

/**
 * #4361.2 — les sociétés de la salle dont la cotation est PUBLIQUEMENT connue (Euronext Paris). Ce sont de
 * vraies entreprises des briefs (décision Louis 04/10) : on ne leur attribue qu'un fait public, jamais un
 * chiffre. Natixis, CNP Assurances et EDF n'y sont PAS : retirées de la cote (offre de rachat, nationalisation).
 */
export const DEMO_LISTED_COMPANY_NAMES: readonly string[] = [
  'BNP Paribas',
  'Société Générale',
  'Crédit Agricole S.A.',
  'AXA',
  'Airbus',
  'Thales',
  'Orange',
  'Renault',
]

/**
 * #3983.8 — département → code INSEE de région (métropole), pour qu'une zone RÉGION se lise comme sur le registre.
 * Une table de démonstration : un département absent n'appartient à aucune région demandée (jamais deviné).
 */
const DEMO_REGION_BY_DEPARTMENT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    '84': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
    '27': ['21', '25', '39', '58', '70', '71', '89', '90'],
    '53': ['22', '29', '35', '56'],
    '24': ['18', '28', '36', '37', '41', '45'],
    '94': ['2A', '2B'],
    '44': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
    '32': ['02', '59', '60', '62', '80'],
    '11': ['75', '77', '78', '91', '92', '93', '94', '95'],
    '28': ['14', '27', '50', '61', '76'],
    '75': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
    '76': ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
    '52': ['44', '49', '53', '72', '85'],
    '93': ['04', '05', '06', '13', '83', '84'],
  }).flatMap(([region, departments]) => departments.map(department => [department, region])),
)
/** Lot DÉCOUVRIR-ZONE (27/10) — le nom des départements de la salle, pour nommer le palier « département » et
 *  l'étiquette d'un compte ajouté par la France. Un département absent n'est pas nommé (jamais deviné). */
const DEMO_DEPARTMENT_LABELS: Readonly<Record<string, string>> = {
  '06': 'Alpes-Maritimes',
  '13': 'Bouches-du-Rhône',
  '29': 'Finistère',
  '31': 'Haute-Garonne',
  '33': 'Gironde',
  '35': 'Ille-et-Vilaine',
  '38': 'Isère',
  '44': 'Loire-Atlantique',
  '59': 'Nord',
  '67': 'Bas-Rhin',
  '69': 'Rhône',
  '75': 'Paris',
  '78': 'Yvelines',
  '91': 'Essonne',
  '92': 'Hauts-de-Seine',
  '93': 'Seine-Saint-Denis',
  '94': 'Val-de-Marne',
  '95': "Val-d'Oise",
}
const DEMO_REGION_LABELS: Readonly<Record<string, string>> = {
  '84': 'Auvergne-Rhône-Alpes',
  '27': 'Bourgogne-Franche-Comté',
  '53': 'Bretagne',
  '24': 'Centre-Val de Loire',
  '94': 'Corse',
  '44': 'Grand Est',
  '32': 'Hauts-de-France',
  '11': 'Île-de-France',
  '28': 'Normandie',
  '75': 'Nouvelle-Aquitaine',
  '76': 'Occitanie',
  '52': 'Pays de la Loire',
  '93': "Provence-Alpes-Côte d'Azur",
}

/**
 * #3983.4 — les implantations (établissements actifs hors siège) des comptes démo qui en ont : Naval Group,
 * siège à Paris, a Indret (La Montagne, Loire-Atlantique) et Lorient (Morbihan). Fictif : ni SIRET ni effectif.
 */
const DEMO_SITES_BY_ACCOUNT: Readonly<Record<string, readonly { city: string; department: string }[]>> = {
  // #3819 — clé = le nom exact du candidat (sans suffixe « (démo) », compte réel des briefs).
  'Naval Group': [
    { city: 'La Montagne', department: '44' },
    { city: 'Lorient', department: '56' },
  ],
}

/**
 * Une proposition de mission, dans la forme que rend `/missions/extract`
 * (#2560). Scriptée, jamais un appel modèle — la démonstration ne consomme ni
 * crédit ni réseau, exactement comme `demoRfpAnalysis` juste au-dessus.
 *
 * Toutes les valeurs sont fictives et le disent (`(démo)`) : un prospect à qui
 * on montre cet écran ne doit jamais repartir avec un TJM ou un client qu'il
 * croit réel.
 */
export function demoMissionExtraction(): {
  status: 'ok'
  costUsd: null
  fields: {
    accountName: { value: string; confidence: number; sourceExcerpt: string }
    roleTitle: { value: string; confidence: number; sourceExcerpt: string }
    startedOn: { value: string; confidence: number; sourceExcerpt: string }
    endsOn: { value: string; confidence: number; sourceExcerpt: string }
    dailyRate: { value: number; confidence: number; sourceExcerpt: string }
    days: { value: number; confidence: number; sourceExcerpt: string }
    supervisedForfait: { value: 'supervised'; confidence: number; sourceExcerpt: string }
  }
} {
  return {
    status: 'ok',
    // Aucun appel de modèle n'a eu lieu : un coût à zéro se lirait « gratuit »,
    // `null` dit honnêtement qu'aucun appel n'a été fait — même règle que le
    // reste du fichier.
    costUsd: null,
    fields: {
      accountName: {
        value: 'Client fictif (démo)',
        confidence: 0.95,
        sourceExcerpt: 'Fiche de mission — Client fictif (démo)',
      },
      roleTitle: {
        value: 'Développeur backend (démo)',
        confidence: 0.9,
        sourceExcerpt: 'Poste : Développeur backend (démo)',
      },
      startedOn: { value: '2026-10-01', confidence: 0.9, sourceExcerpt: 'Début : 2026-10-01' },
      endsOn: { value: '2027-03-31', confidence: 0.9, sourceExcerpt: 'Fin prévue : 2027-03-31' },
      dailyRate: { value: 550, confidence: 0.88, sourceExcerpt: 'TJM : 550 euros (démo)' },
      days: { value: 120, confidence: 0.85, sourceExcerpt: 'Volume : 120 jours (démo)' },
      // X66 / #3547 — la proposition du forfait encadré se VOIT en salle : le
      // document fictif dit que le forfait est réalisé par les équipes du client.
      supervisedForfait: {
        value: 'supervised',
        confidence: 0.9,
        sourceExcerpt: 'Forfait : cadrage et supervision, réalisé par les équipes du client (démo)',
      },
    },
  }
}

/**
 * #2939 (#2174.3/.5) — COLLER UN BRIEF OU UN E-MAIL en démonstration : le
 * geste marche, mais rien n'atteint Claude — même règle que
 * `demoMissionExtraction` juste au-dessus. Scriptée, jamais un appel modèle.
 *
 * Une seule inconnue bloquante volontaire (`work_to_do`) : sans elle, l'étape
 * 5 de l'assistant (#2174.36) n'aurait jamais l'occasion de montrer une
 * inconnue nommée en démonstration.
 */
export function demoNeedCompileText(sourceKind: 'free_brief' | 'email'): {
  status: 'ok'
  compiled: CompiledNeed
  dropped: { field: string; reason: string }[]
} {
  const excerptCompany =
    sourceKind === 'email' ? 'Client fictif (démo) recherche un renfort' : 'Le client fictif (démo) cherche un renfort'
  return {
    status: 'ok',
    compiled: {
      source: { kind: sourceKind, locator: null, stated_at: null },
      account_id: null,
      company_hint: 'Client fictif (démo)',
      fields: [
        {
          field: 'title',
          value: 'Développeur backend (démo)',
          provenance: {
            source_kind: sourceKind,
            excerpt: excerptCompany,
            locator: null,
            stated_at: null,
            confidence: 'explicite',
          },
        },
        {
          field: 'skills',
          value: [{ term: 'Python (démo)', required: true }],
          provenance: {
            source_kind: sourceKind,
            excerpt: 'il faudra du Python (démo)',
            locator: null,
            stated_at: null,
            confidence: 'explicite',
          },
        },
      ],
      proposed_contacts: [],
      unknowns: [
        {
          field: 'work_to_do',
          question: 'Concrètement, quel travail cette personne aurait-elle à faire ?',
        },
      ],
      contradictions: [],
      confirmation_level: 'rapporte',
      clarification: {
        field: 'work_to_do',
        reason: 'blocking_unknown',
        question: 'Concrètement, quel travail cette personne aurait-elle à faire ?',
        why: 'sans le travail réel, on ne propose qu’un intitulé de poste',
      },
      not_understood: ['work_to_do', 'expected_outcome'],
      status: 'proposition',
    },
    dropped: [],
  }
}

/**
 * La synthèse en 7 questions d'une opportunité, dans la forme que rend
 * `POST /projects/:id/synthesis` (#2171.27). Scriptée, jamais un appel
 * modèle — même garde que `demoMissionExtraction` juste au-dessus : la
 * démonstration ne consomme ni crédit ni réseau.
 *
 * Fait et hypothèse restent distincts (#2171.44) et aucune phrase de la liste
 * bannie n'y figure sans fait pour la porter (#2171.28) — le script suit sa
 * propre garde comme une vraie génération le ferait.
 */
export function demoProjectSynthesis(projectId: string): ProjectSynthesis {
  return {
    projectId,
    problem: 'Le client cherche à absorber la charge de migration de son SI achats sans recruter en interne (démo).',
    confirmed: [
      'Le sponsor a confirmé un budget alloué pour le T1 2027 (démo).',
      'Le périmètre technique (ERP + interfaces comptables) est cadré dans le cahier des charges reçu (démo).',
    ],
    hypotheses: ['Le déclencheur serait un audit interne récent, jamais confirmé explicitement par le client (démo).'],
    decisionMaker: 'DSI',
    blockingConditions: ['Validation du comité achats encore en attente (démo).'],
    nextToObtain: 'Obtenir la date du comité achats pour caler la proposition (démo).',
    whatNotToDo:
      'Ne pas relancer avant le comité achats : la décision n’est pas encore entre les mains du sponsor (démo).',
    generatedAt: new Date().toISOString(),
  }
}

/**
 * #2060.9 — « Reformuler avec Laura » en démonstration : le geste marche,
 * mais rien ne part vers un modèle depuis un lien PUBLIC. La contrainte
 * « jamais une référence inventée » se tient différemment ici — il n'y a pas
 * de client ni de TJM fictif à afficher, seulement le texte que LE VISITEUR
 * vient de taper. On le reformate donc légèrement (majuscule initiale,
 * ponctuation finale), sans y ajouter un seul mot : la promesse « données
 * fictives » ne peut pas s'appliquer aux propres mots de la personne qui
 * teste l'écran.
 */
export function demoOnboardingReformulate(answerText: string): { reformulated: string } {
  const trimmed = answerText.trim()
  if (!trimmed) return { reformulated: trimmed }
  const capitalised = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return { reformulated: /[.!?…]$/.test(capitalised) ? capitalised : `${capitalised}.` }
}
