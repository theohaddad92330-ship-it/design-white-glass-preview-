import {
  classifyTemporalStatus,
  parseAccountAnalysis,
  readRecentSignals,
  signalImportance,
  type Account,
  type QualifiedHypothesis,
  type ReadRecentSignal,
  withoutHomonymSignals,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { isJobOffer } from '@/lib/signal-dedupe'
import { anglesForSignal, citesEnoughFoundingSignals } from './signalAngles'
import { evaluateSignalActionGate } from './signalActionGate'
import type { WatchCategory, WatchHypothesis, WatchInsight, WatchScenario, WatchSignal } from './watch'

type AccountWatchData = {
  /** #3939.a — les hypothèses qualifiées, rattachées à TOUS les signaux du compte. */
  hypotheses: WatchHypothesis[]
  insights: WatchInsight[]
  scenario: WatchScenario
  signals: WatchSignal[]
}

/**
 * `extraSignals` — des signaux lus HORS de l'analyse (lot M01 #3918.b : les
 * signaux CRM du compte) passent par CE MÊME lecteur (#3928.a), jamais une
 * seconde liste à part : mêmes catégories, même doublon, même lien.
 */
export function buildAccountWatchData(account: Account, extraSignals: readonly unknown[] = []): AccountWatchData {
  const analysis = parseAccountAnalysis(account.raw_analysis)
  // #3928.a — le lecteur UNIQUE de `recent_signals` (même libellé, même lien,
  // même doublon que Mes cibles, la cloche et Laura) : l'analyse d'abord, puis
  // la colonne héritée.
  // LUDOVIC-D LC.2 — un signal d'HOMONYME déjà stocké (« Still Waters Farm » sur STILL) n'est pas
  // affiché : masqué à la lecture, jamais supprimé (même décision que les contacts, `@bellum/contracts`).
  const read = withoutHomonymSignals(
    readRecentSignals([...(analysis.recent_signals ?? []), ...(account.recent_signals ?? []), ...extraSignals]),
    account.website,
  )
  // #2687 — les hypothèses qualifiées de CETTE analyse : c'est là que vivent
  // l'angle ESN et la première action, et le seul endroit d'où elles peuvent
  // être rattachées à un signal (par `based_on_signal_ids`, jamais autrement).
  const hypotheses = analysis.qualified_hypotheses ?? []
  // #2966 (#2119.22) — les noms d'entités connus de CE compte, pour répondre
  // « où ? » sur chaque signal (voir `derivePerimeter`).
  const entityNames = entityNamesOf(analysis.entities_exhaustive)
  const accountName = account.company_name?.trim() || i18n.t('accounts:watch.unknownPerimeter')
  const signals = read.map((signal, index) =>
    normalizeSignal(account.id, signal, index, hypotheses, entityNames, accountName),
  )

  return {
    signals,
    hypotheses: buildWatchHypotheses(hypotheses, signals),
    scenario: signals.length === 0 ? 'empty' : signals.length < 4 ? 'partial' : 'full',
    insights: buildInsights(signals),
  }
}

const HYPOTHESIS_CONFIDENCES: ReadonlySet<string> = new Set(['confirmee', 'probable', 'a_verifier'])

/**
 * #3939.a — recette prod 09/10 : « hypothèses qualifiées + signaux fondateurs »
 * introuvables dans la Veille. Elles n'y vivaient que comme sous-ligne d'une
 * carte signal (`SignalAngles`) ; or les signaux qui les fondent sont ceux qui
 * deviennent des « pistes », et la liste les retire (#3676.6) — l'hypothèse
 * disparaissait avec eux. Lues ici pour elles-mêmes, sur la liste COMPLÈTE.
 *
 * Le rattachement suit `based_on_signal_ids` et lui seul (#2687, jamais un
 * rapprochement de texte) ; sans identifiant, la prose `based_on_signals` est
 * citée TELLE QUELLE, comme ce que l'analyse a écrit — jamais reliée à un signal.
 */
function buildWatchHypotheses(
  hypotheses: readonly QualifiedHypothesis[],
  signals: readonly WatchSignal[],
): WatchHypothesis[] {
  return hypotheses.flatMap(hypothesis => {
    const label = hypothesis.hypothesis?.trim()
    if (!label) return []
    const ids = new Set((hypothesis.based_on_signal_ids ?? []).map(id => id.trim()).filter(Boolean))
    const foundingSignals = signals.filter(signal => (signal.analysisId ? ids.has(signal.analysisId) : false))
    const confidence = hypothesis.confidence?.trim().toLowerCase() ?? ''
    const esnAngle = hypothesis.esn_angle?.trim()
    const firstAction = hypothesis.first_action?.trim()
    return [
      {
        hypothesis: label,
        confidence:
          HYPOTHESIS_CONFIDENCES.has(confidence) && citesEnoughFoundingSignals(hypothesis)
            ? (confidence as WatchHypothesis['confidence'])
            : null,
        ...(esnAngle ? { esnAngle } : {}),
        ...(firstAction ? { firstAction } : {}),
        foundingSignals,
        citedSignals:
          foundingSignals.length > 0
            ? []
            : (hypothesis.based_on_signals ?? []).map(text => text.trim()).filter(Boolean),
      },
    ]
  })
}

function entityNamesOf(entities: unknown): string[] {
  if (!Array.isArray(entities)) return []
  return entities
    .map(entity => (entity && typeof entity === 'object' ? (entity as { name?: unknown }).name : undefined))
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
}

function normaliseForMatch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * #2966 (#2119.22) — « où ? », TOUJOURS répondue, jamais devinée : le nom
 * d'entité que le TEXTE du signal contient réellement (correspondance
 * textuelle, comme `EntitiesGraphCard`'s `matchPerimeterSignal`) ; à défaut,
 * le compte lui-même — un signal est toujours AU MOINS scopé à son compte,
 * ce n'est pas une hypothèse.
 *
 * `isSpecific` (#2952, #2305.44) distingue les deux cas : un signal rattaché
 * à une entité NOMMÉE a un périmètre clair ; un signal replié sur le compte
 * entier ne l'a pas — c'est la même distinction que le GATE d'action demande
 * avant de transformer un signal en action.
 */
function derivePerimeter(
  signalText: string,
  entityNames: readonly string[],
  accountName: string,
): { value: string; isSpecific: boolean } {
  const haystack = normaliseForMatch(signalText)
  const match = entityNames.find(name => haystack.includes(normaliseForMatch(name)))
  return match ? { value: match, isSpecific: true } : { value: accountName, isSpecific: false }
}

function normalizeSignal(
  accountId: string,
  value: ReadRecentSignal,
  index: number,
  hypotheses: readonly QualifiedHypothesis[],
  entityNames: readonly string[],
  accountName: string,
): WatchSignal {
  const signal = value.label
  const type = value.type || 'signal'
  const freshness = value.freshness ?? 'undated'
  const perimeter = derivePerimeter(`${type} ${signal}`, entityNames, accountName)
  const hasRealSource = Boolean(value.source)
  return {
    // ⚠️ La clé de RENDU, dérivée de la position dans la liste fusionnée et
    // dédupliquée ci-dessus. Elle n'a rien à voir avec `value.id`, l'identifiant
    // que l'analyse pose sur le signal et que les hypothèses citent (#2687) :
    // celui-là sert au rattachement et ne doit jamais être remplacé par celui-ci.
    id: `${accountId}-watch-${index}`,
    analysisId: value.id,
    angles: anglesForSignal(hypotheses, value.id),
    category: categoryFor(type, signal, value.source_kind, value.source),
    date: value.date || i18n.t('accounts:watch.unknownDate'),
    // Pass the IA's deterministic age class straight through. Absent = `undated`
    // (honest — an unclassified signal is never assumed to be current).
    freshness,
    // #3206.3 — trusts the IA-stamped `temporal_status` first, else derives it
    // with the SAME rule for analyses recorded before this field existed.
    temporalStatus: classifyTemporalStatus({
      temporal_status: value.temporal_status,
      freshness,
      date: value.date,
      type,
    }),
    importance: signalImportance({ freshness, date: value.date, source: value.source }),
    type,
    signal,
    source: value.source || i18n.t('accounts:watch.unknownSource'),
    // #3922.3 — l'URL telle que le pipeline l'a posée, ou `null` : jamais devinée.
    sourceUrl: value.source_url,
    sourceKind: value.source_kind,
    // #4020 / #4022 — le lieu collecté de l'offre (écran Opportunités : France → non précisé → hors France).
    location: value.location,
    // #4733.2 — posé seulement quand l'IA l'a posé : absent reste absent.
    ...(value.executive_role === true ? { executiveRole: true } : {}),
    sales_implication: value.sales_implication || undefined,
    perimeter: perimeter.value,
    // #2952 (#2305.43/.44/.45/.47/.48) — la porte avant qu'un signal devienne
    // une action ; voir `signalActionGate.ts` pour les cinq conditions.
    actionGate: evaluateSignalActionGate({
      type,
      signal,
      perimeterIsSpecific: perimeter.isSpecific,
      freshness,
      hasRealSource,
    }),
    tags: value.tags.length ? value.tags : extractTags(`${type} ${signal}`),
  }
}

// #2617.1 — le `type` que l'analyse pose déjà (`signalKindSchema`,
// `@bellum/contracts`) porte parfois DIRECTEMENT une des six catégories
// demandées par Simon : le prendre au mot évite de re-deviner par mots-clés ce
// que le serveur a déjà nommé. Les autres genres du même contrat (`projet`,
// `incident`, `regulation`, `acquisition`, `partenariat`, `restructuration`)
// et tout `type` libre/legacy retombent sur la lecture du texte ci-dessous.
const DIRECT_WATCH_CATEGORIES: ReadonlySet<string> = new Set([
  'recrutement',
  'appel_offres',
  'marche_public',
  'nomination',
  'budget',
])

/**
 * #2617.1 — RÉFUTÉ : la classification ne couvrait pas les six catégories
 * métier demandées par Simon (recrutement · appel d'offres · marché public ·
 * nomination · budget · historique) — recrutement et nomination étaient
 * fondus dans « jobs », appel d'offres et marché public dans « budget ». Une
 * nomination annonce un NOUVEAU contact à approcher ; un marché PUBLIC (une
 * collectivité, une administration) n'a ni le même acheteur ni le même
 * calendrier qu'un appel d'offres privé — deux paires que le commercial doit
 * pouvoir filtrer séparément.
 */
function categoryFor(type: string, signal: string, sourceKind?: string | null, source?: string | null): WatchCategory {
  const normalizedType = type.trim().toLowerCase()
  if (DIRECT_WATCH_CATEGORIES.has(normalizedType)) return normalizedType as WatchCategory
  // #3885 — une OFFRE D'EMPLOI se reconnaît à sa nature collectée (`job`), à son type ou à sa source :
  // un intitulé étranger ou sans mot-clé n'est pas lu par l'heuristique de texte, et le filtre
  // Recrutements affichait « 0 sur 5 » alors que deux offres du 11/10 étaient là. Même règle que
  // l'écran Opportunités (`isJobSignal`, #4022.3).
  if (isJobOffer({ type: normalizedType, source_kind: sourceKind, source })) return 'recrutement'
  // #3928.2 — une levée de fonds est du contexte (historique), pas un besoin actif :
  // son libellé parle de « financement » sans que ce soit un budget à capter.
  if (normalizedType === 'levee_fonds') return 'historique'

  const text = `${type} ${signal}`.toLowerCase()
  if (/nomm[ée]|nomination|prend la (direction|tête)|rejoint .*(en tant que|comme)/.test(text)) return 'nomination'
  if (/recrut|embauch|\bposte\b|\bemploi\b/.test(text)) return 'recrutement'
  // Marché PUBLIC (collectivité, administration) avant l'appel d'offres
  // générique : un acheteur public n'est pas un acheteur privé.
  if (/march[ée]s? publics?|collectivité|administration publique|ministère|hôpital public/.test(text)) {
    return 'marche_public'
  }
  if (/appel d.offres|consultation/.test(text)) return 'appel_offres'
  if (/budget|investissement|achat|march[ée]|financement/.test(text)) return 'budget'
  // Catch-all HONNÊTE : un signal compris (jurid, stack, incident,
  // restructuration…) qui ne relève d'aucune des cinq catégories nommées
  // reste visible sous « historique », jamais un septième panier inventé.
  return 'historique'
}

function extractTags(text: string): string[] {
  const candidates = ['Cloud', 'Data', 'IA', 'Cybersécurité', 'SAP', 'Azure', 'Organisation', 'Budget']
  return candidates.filter(tag => text.toLowerCase().includes(tag.toLowerCase())).slice(0, 3)
}

/**
 * Only signals the analysis actually commented on make an insight — an insight
 * whose detail merely restates its own title carries no information.
 *
 * #3676 (réfuté en recette 07/10 : un même fait affiché 2 fois sur `?tab=veille`,
 * sous « Pistes à qualifier » ET sous « Ce que cela implique commercialement ») —
 * exporté pour que l'appelant (`TabSignal.tsx`) puisse le rappeler sur les signaux
 * déjà filtrés par `signalsNotCoveredByLeads` : un fait déjà présenté comme piste
 * ne redevient pas un second « insight » (GA-26).
 */
export function buildInsights(signals: WatchSignal[]): WatchInsight[] {
  return signals
    .filter((signal): signal is WatchSignal & { sales_implication: string } => Boolean(signal.sales_implication))
    .slice(0, 3)
    .map(signal => ({ title: signal.signal, detail: signal.sales_implication }))
}
