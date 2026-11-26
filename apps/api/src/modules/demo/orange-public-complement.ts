import type {
  CommercialBrief,
  ItChallenge,
  KeyNote,
  PainPoint,
  ProgramName,
  RecentSignal,
  TechnologyEntry,
} from '@bellum/contracts'

import { ORANGE_COLLECTED_JOBS } from './orange-jobs-collected-13-10'

/**
 * PARITÉ ORANGE / GROUPE BPCE (Louis, 13/10/2026) — le compte Orange était à moitié vide : le dossier de compte de Théo
 * (projets, achats, marché, décideurs) n'alimentait ni les besoins, ni les signaux de RECRUTEMENT, ni la lecture
 * stratégique, ni les domaines d'opportunité, ni la stack, ni le plan d'action que Groupe BPCE porte (`bpce-seed.ts`).
 *
 * Ce fichier comble l'écart avec trois sources, jamais une donnée devinée :
 *  1. le dossier de compte déjà dans le dépôt (`data/commercial-briefs/orange.json`, relevé du Drive « DÉMO CLIENTS ») —
 *     les chiffres de marché, les achats, la fiche et les ESN sont REPRIS (voir `orangeRawAnalysisComplement`) ;
 *  2. des faits PUBLICS sur le groupe (plans « Lead the Future » et « Trust the Future », Bleu, Live Intelligence, Orange
 *     Cyberdefense, Orange Business, extinction du cuivre…) ;
 *  3. des OFFRES D'EMPLOI RÉELLES, collectées par les collecteurs emploi du produit (`orange-jobs-collected-13-10.ts`,
 *     jamais inventées : la collecte du 13/10/2026 n'en a retenu aucune, donc le compte n'affiche aucune ligne de
 *     recrutement). Leur date est RELATIVE à l'ouverture de la salle (`posted_days_ago` = écart réel publication → collecte,
 *     résolue au semis par {@link resolveOrangeRelativeDates}) — jamais une date figée dans l'empreinte du jeu de démo.
 *
 * Les plans stratégiques sont des signaux `transformation` ou `projet`, JAMAIS `appel_offres` : ce sont des
 * orientations du groupe, pas une consultation ouverte.
 *
 * Fichier pur : aucun import du jeu de données (pas de cycle), les types viennent du contrat.
 */

export const ORANGE_PUBLIC_SOURCE_LABEL = 'Faits publics du groupe, consolidés le 13/10/2026'

/* ------------------------------------------------------------------ */
/* Offres d'emploi (signaux de RECRUTEMENT)                            */
/* ------------------------------------------------------------------ */

type OrangeOffer = {
  title: string
  /** `null` = la source ne le rend pas (jamais deviné). */
  city: string | null
  entity: string
  /** `null` = la source ne le rend pas (jamais deviné). */
  contract: string | null
  url: string
  /** Jours entre la publication RÉELLE et la date de collecte (13/10/2026) : l'écart réel, ré-ancré à l'ouverture de la salle. */
  posted_days_ago: number
}

const DAY_MS = 86_400_000

/** Les offres RÉELLES collectées (voir `orange-jobs-collected-13-10.ts`) ; vide si le pipe produit n'en a rien ramené. */
export const ORANGE_OFFERS: readonly OrangeOffer[] = ORANGE_COLLECTED_JOBS.offers.map(job => ({
  title: job.title,
  city: job.city,
  entity: job.entity,
  contract: job.contract,
  url: job.url,
  posted_days_ago: Math.max(
    0,
    Math.round((Date.parse(ORANGE_COLLECTED_JOBS.collected_on) - Date.parse(job.published_at)) / DAY_MS),
  ),
}))

function offerSignal(offer: OrangeOffer, index: number): RecentSignal {
  return {
    id: `orange-offre-${index + 1}`,
    signal: offer.title,
    source: 'Offre d’emploi publiée',
    type: 'recrutement',
    // `date` est posée AU SEMIS (resolveOrangeRelativeDates) : relative à l'ouverture de la salle.
    date: null,
    location: offer.city ?? null,
    url: offer.url,
    source_kind: 'job',
    // « On n'affiche pas ce qu'on n'a pas » : lieu et contrat absents de la source ne font AUCUNE mention.
    impact: [
      offer.city ? `Lieu : ${offer.city}.` : null,
      `Entité : ${offer.entity}.`,
      offer.contract ? `Contrat : ${offer.contract}.` : null,
    ]
      .filter(Boolean)
      .join(' '),
    sales_implication: 'Poste ouvert : un besoin de compétence à qualifier avec le manager concerné.',
    freshness: 'current',
    posted_days_ago: offer.posted_days_ago,
  } as RecentSignal
}

/* ------------------------------------------------------------------ */
/* Signaux de vision, de plan stratégique et de projets                 */
/* ------------------------------------------------------------------ */

const STRATEGIC_SIGNALS: readonly RecentSignal[] = [
  {
    id: 'orange-plan-1',
    signal: 'Plan « Lead the Future » 2023-2025 — bilan du plan précédent',
    source: 'Plan stratégique du groupe (février 2023), faits publics',
    type: 'transformation',
    date: '2023-02',
    impact:
      'Réinventer le métier d’opérateur, accélérer dans les services aux entreprises, valoriser les actifs du groupe. Le plan 2026-2028 « Trust the Future » prend sa suite.',
    sales_implication:
      'Orientation du groupe, pas une consultation : elle explique les chantiers cloud, IA et cyber qui nourrissent les besoins.',
    freshness: 'archive',
  },
  {
    id: 'orange-plan-2',
    signal: 'Trajectoire « net zéro carbone » du groupe à l’horizon 2040',
    source: 'Engagements publics du groupe',
    type: 'transformation',
    date: '2024',
    impact: 'Objectif de neutralité carbone en 2040 ; effets sur les datacenters, le réseau et les achats.',
    sales_implication: 'Cadre de long terme : les offres d’efficience énergétique du SI se présentent sous cet angle.',
    freshness: 'archive',
  },
  {
    id: 'orange-plan-3',
    signal: 'Orange Business : de l’opérateur d’entreprise à l’intégrateur de confiance',
    source: 'Résultats S1 2026 du groupe, faits publics',
    type: 'transformation',
    date: '2026-07',
    impact:
      'Le chiffre d’affaires de l’entité recule (-3,1 %) pendant que l’IT et l’intégration progressent (+1,3 %) ; le partenariat avec Tech Mahindra transfère 2 600 salariés.',
    sales_implication:
      'L’entité est à la fois concurrente et canal de rang 2 : deux logiques d’achat à distinguer avant d’approcher.',
    freshness: 'current',
  },
]

const PROJECT_SIGNALS: readonly RecentSignal[] = [
  {
    id: 'orange-projet-1',
    signal: 'Bleu — offre de cloud de confiance portée par Orange et Capgemini',
    source: 'Annonces publiques du groupe',
    type: 'projet',
    date: '2024',
    impact: 'Cloud de confiance fondé sur la technologie d’un hyperscaler, opéré en France par une société dédiée.',
    sales_implication: 'Un chantier de migration et d’exploitation pour les ESN qui connaissent le cloud souverain.',
    freshness: 'archive',
  },
  {
    id: 'orange-projet-2',
    signal: 'Live Intelligence — offre d’IA générative d’Orange Business',
    source: 'Annonces publiques du groupe',
    type: 'projet',
    date: '2024',
    impact:
      'Plateforme d’IA générative proposée aux entreprises clientes par l’entité de services aux entreprises du groupe.',
    sales_implication: 'Les cas d’usage passent en production : besoin d’intégration, de sécurité et de supervision.',
    freshness: 'archive',
  },
  {
    id: 'orange-projet-3',
    signal: 'Extinction progressive du réseau cuivre (2023-2030)',
    source: 'Calendrier public du groupe',
    type: 'projet',
    date: '2023',
    impact: 'Fermeture technique du cuivre par zones jusqu’en 2030 ; bascule vers la fibre.',
    sales_implication:
      'Les systèmes d’exploitation et de facturation liés à la bascule génèrent des besoins de TMA et de migration.',
    freshness: 'archive',
  },
]

/** Les signaux ajoutés au compte, AVANT ceux du brief (le brief ne redouble jamais un libellé déjà là). */
export function orangePublicSignals(): RecentSignal[] {
  return [...ORANGE_OFFERS.map(offerSignal), ...STRATEGIC_SIGNALS, ...PROJECT_SIGNALS]
}

/**
 * Au semis : la date de chaque offre est RELATIVE à l'ouverture de la salle (`nowMs` − `posted_days_ago`). Les signaux
 * sans `posted_days_ago` sont rendus tels quels. Pure.
 */
export function resolveOrangeRelativeDates(signals: readonly RecentSignal[], nowMs: number): RecentSignal[] {
  return signals.map(signal => {
    const { posted_days_ago: days, ...rest } = signal as RecentSignal & { posted_days_ago?: number }
    if (typeof days !== 'number') return signal
    return { ...rest, date: new Date(nowMs - days * 86_400_000).toISOString().slice(0, 10) } as RecentSignal
  })
}
