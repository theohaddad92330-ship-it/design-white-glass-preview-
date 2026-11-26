import { DOSSIER_SCORE_AXES } from '@bellum/contracts'

/**
 * 14/10/2026 (Louis, « go pour tout ») — AUCUN compte de la salle n'affiche « antérieure à la lecture en sept axes »
 * ni « antérieure à la grille de fiabilité » : chaque compte porte `evaluation.dossier_read` (les sept axes) et
 * `data_confidence`, calculés ICI à partir de la matière DÉJÀ semée du compte (offres, signaux, ESN citées, brief,
 * défis informatiques). Même forme que `orangeDossierRead` (Orange, écrit à la main).
 *
 * Doctrine : un axe que la matière ne permet pas de juger reste « inconnu » — SANS valeur, jamais un zéro — et son
 * impact le NOMME ; il sort du dénominateur (GA-18 / GA-19). Rien n'est inventé : chaque note vient d'un décompte.
 * Un dossier qui porte déjà sa lecture (Société Générale, SNCF, TotalEnergies, Orange) n'est jamais écrasé.
 */
type Raw = Record<string, unknown>
type Axis = {
  key: (typeof DOSSIER_SCORE_AXES)[number]
  state: 'measured' | 'partial' | 'unknown'
  value?: number
  impact: string
  lever: string
}

const AXIS_LABEL: Record<Axis['key'], string> = {
  adequation_offre: 'L’adéquation avec ton offre',
  potentiel_commercial: 'Le potentiel commercial',
  fraicheur: 'La fraîcheur du dossier',
  accessibilite: 'L’accès à un décideur',
  concurrence: 'La pression concurrentielle',
  capacite_achat_externe: 'La capacité d’achat externe (panel, grille, procédure)',
  qualite_preuves: 'La qualité des preuves',
}

const asRecord = (value: unknown): Raw | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : null
const countOf = (value: unknown): number => (Array.isArray(value) ? value.length : 0)

/** Le palier 1..5 d'un décompte : 0 → aucune note (l'axe est inconnu). */
function tier(count: number, steps: readonly [number, number, number, number]): number | null {
  if (count <= 0) return null
  const reached = steps.filter(step => count >= step).length
  return Math.min(5, reached + 1)
}

function hasWrittenRead(raw: Raw): boolean {
  const reads = [
    asRecord(raw['evaluation'])?.['dossier_read'],
    asRecord(asRecord(raw['plan'])?.['evaluation'])?.['dossier_read'],
  ]
  return reads.some(read => {
    const axes = asRecord(read)?.['axes']
    if (!Array.isArray(axes)) return false
    const keys = new Set(axes.map(axis => asRecord(axis)?.['key']))
    return DOSSIER_SCORE_AXES.every(key => keys.has(key))
  })
}

function hasConfidence(raw: Raw): boolean {
  return typeof raw['data_confidence'] === 'number' || typeof asRecord(raw['plan'])?.['data_confidence'] === 'number'
}

type Matter = {
  offers: number
  signals: number
  freshSignals: number
  challenges: number
  competitors: number
  purchasing: number
  hasOpening: boolean
  hasBrief: boolean
}

function matterOf(raw: Raw): Matter {
  const plan = asRecord(raw['plan'])
  const brief = asRecord(raw['commercial_brief'])
  const sections = Array.isArray(brief?.['sections']) ? (brief?.['sections'] as unknown[]) : []
  const rowsOf = (pattern: RegExp) =>
    sections.reduce<number>((total, section) => {
      const record = asRecord(section)
      return pattern.test(String(record?.['key'] ?? '')) ? total + countOf(record?.['rows']) : total
    }, 0)
  const signals = Array.isArray(raw['recent_signals']) ? (raw['recent_signals'] as unknown[]) : []
  const fresh = signals.filter(signal => asRecord(signal)?.['freshness'] !== 'archive')
  return {
    offers: Math.max(countOf(raw['offers_to_propose']), countOf(plan?.['offers_to_propose'])),
    signals: signals.length,
    freshSignals: fresh.length,
    challenges: countOf(raw['it_challenges']),
    competitors: Math.max(countOf(raw['competitors']), countOf(brief?.['esn'])),
    purchasing: rowsOf(/^achats-avant-d-appeler$/),
    hasOpening: Boolean(raw['comment_ouvrir_compte']),
    hasBrief: brief != null,
  }
}

function axesOf(matter: Matter): Axis[] {
  const volume = matter.offers + matter.signals + matter.challenges
  const potential = tier(volume, [3, 6, 10, 16])
  const freshness = tier(matter.freshSignals, [2, 4, 7, 12])
  const competition = tier(matter.competitors, [1, 3, 7, 13])
  const access = matter.purchasing > 0 ? 3 : matter.hasOpening ? 3 : null
  const proofs = matter.signals + matter.challenges > 0 ? tier(matter.signals + matter.challenges, [2, 4, 8, 14]) : null

  const axis = (
    key: Axis['key'],
    value: number | null,
    state: 'measured' | 'partial',
    impact: string,
    lever: string,
    unknownImpact: string,
    unknownLever: string,
  ): Axis =>
    value == null
      ? { key, state: 'unknown', impact: unknownImpact, lever: unknownLever }
      : { key, state, value, impact, lever }

  return [
    {
      key: 'adequation_offre',
      state: 'unknown',
      impact:
        'Le dossier dit ce que le compte cherche, pas ce que ton ESN vend : l’adéquation se juge sur tes domaines d’offre.',
      lever: 'Renseigner tes domaines d’offre pour comparer aux chantiers relevés.',
    },
    axis(
      'potentiel_commercial',
      potential,
      'measured',
      `${matter.offers} offres à proposer, ${matter.signals} signaux et ${matter.challenges} défis informatiques relevés : le volume existe.`,
      'Partir d’un signal récent ou d’un poste ouvert pour proposer du renfort.',
      'Ni offre, ni signal, ni défi informatique relevé : le volume du compte n’a pas pu être jugé.',
      'Lancer une collecte de signaux et d’offres sur le compte.',
    ),
    axis(
      'fraicheur',
      freshness,
      'partial',
      `${matter.freshSignals} signaux encore valides sur ${matter.signals} relevés : la lecture est datée, les arbitrages internes ne le sont pas.`,
      'Recouper un signal récent avec un interlocuteur du compte avant de le citer.',
      'Aucun signal daté encore valide : la fraîcheur du dossier n’a pas pu être jugée.',
      'Relancer la collecte de signaux pour dater le dossier.',
    ),
    axis(
      'accessibilite',
      access,
      'partial',
      matter.purchasing > 0
        ? `${matter.purchasing} points d’achat à connaître avant d’appeler sont documentés ; le circuit exact reste à confirmer.`
        : 'Une stratégie d’ouverture du compte est posée ; l’accès à un décideur reste à confirmer.',
      'Qualifier le circuit prestataire directement auprès de l’acheteur.',
      'Aucun circuit d’achat ni stratégie d’ouverture documentés : l’accès n’a pas pu être jugé.',
      'Le demander au premier échange : il ne se déduit pas d’une source publique.',
    ),
    axis(
      'concurrence',
      competition,
      'partial',
      `${matter.competitors} ESN ou prestataires cités au dossier, sans panel confirmé : la pression est réelle mais mal cadrée.`,
      'Viser un périmètre ou une entité où aucun titulaire n’est cité.',
      'Aucune ESN ni aucun prestataire cité : la pression concurrentielle n’a pas pu être jugée.',
      'Demander à l’acheteur qui intervient déjà sur le périmètre.',
    ),
    {
      key: 'capacite_achat_externe',
      state: 'unknown',
      impact: 'Panel ESN, grille tarifaire et procédure prestataire IT : non trouvés dans les sources publiques.',
      lever: 'Le demander au premier échange avec l’acheteur.',
    },
    axis(
      'qualite_preuves',
      proofs,
      'partial',
      `${matter.signals + matter.challenges} faits relevés (signaux et défis) avec source ; l’organigramme et les coordonnées restent à revalider.`,
      'Revalider les contacts avant tout usage commercial.',
      'Aucun fait sourcé relevé : la qualité des preuves n’a pas pu être jugée.',
      'Ajouter une source datée au dossier.',
    ),
  ]
}

/** La fiabilité du dossier /100 : un décompte de ce qui est sourcé, plafonné à 80 (jamais « parfait »). */
function confidenceOf(matter: Matter): number {
  const score =
    35 +
    Math.min(25, matter.signals * 2) +
    Math.min(10, matter.offers) +
    (matter.competitors > 0 ? 5 : 0) +
    (matter.hasBrief ? 5 : 0)
  return Math.min(80, score)
}

/** Ajoute `evaluation.dossier_read` et `data_confidence` à un compte qui ne les porte pas — jamais l'inverse. */
export function withDemoDossierRead<T extends { raw_analysis?: unknown }>(account: T): T {
  const raw = asRecord(account.raw_analysis) ?? {}
  const needsRead = !hasWrittenRead(raw)
  const needsConfidence = !hasConfidence(raw)
  if (!needsRead && !needsConfidence) return account
  const matter = matterOf(raw)
  const axes = axesOf(matter)
  const confidence = confidenceOf(matter)
  const unknownLabels = axes.filter(axis => axis.state === 'unknown').map(axis => axis.key)
  const evaluation = asRecord(raw['evaluation']) ?? {}
  return {
    ...account,
    raw_analysis: {
      ...raw,
      ...(needsRead
        ? {
            evaluation: {
              ...evaluation,
              dossier_read: {
                ...asRecord(evaluation['dossier_read']),
                axes,
                reliability: {
                  quality: {
                    state: 'partial',
                    value: confidence,
                    note: 'Faits publics sourcés ; ce qui n’a pas pu être jugé est nommé, jamais noté.',
                  },
                },
                missing: unknownLabels.map(key => ({
                  label: AXIS_LABEL[key],
                  why: 'La matière du dossier ne permet pas de le juger ; il sort du dénominateur.',
                })),
              },
            },
          }
        : {}),
      ...(needsConfidence ? { data_confidence: confidence } : {}),
    },
  }
}
