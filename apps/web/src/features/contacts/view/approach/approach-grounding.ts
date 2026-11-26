import {
  readRecentSignals,
  toAccountJobOffer,
  withoutHomonymSignals,
  type AccountSignalLine,
  type MessageGrounding,
} from '@bellum/contracts'
import type { MessageInsight } from '@/lib/message-insight'
import { groupEvidence } from './approach-model'

/**
 * #4524 — « Sur quoi Laura s'appuie » : le modèle PUR du bloc au-dessus de « Générer ». Aucune lecture réseau.
 *
 * Les faits viennent de ce que la fiche SAIT déjà : les signaux du compte (dans l'ordre du dossier, celui que le
 * serveur a calculé — on n'en invente pas un autre), les signaux et les besoins du contact. Un fait absent ne fait
 * aucune ligne ; aucun n'est deviné.
 */

type GroundingFactKind = 'account_signal' | 'contact_signal' | 'contact_need'

type GroundingFact = {
  id: string
  kind: GroundingFactKind
  label: string
  /** La source et la date quand on les a — `null` sinon, jamais une preuve inventée. */
  proof: string | null
  /** #4524.9 — la fiche a un doute d'homonyme : ce fait du CONTACT peut concerner quelqu'un d'autre. Jamais sur le compte. */
  homonymDoubt?: true
  /** #4977 — ce signal du compte est une OFFRE d'emploi (signal de recrutement) : l'appel s'ouvre dessus. */
  jobOffer?: true
}

type GroundingFacts = { account: GroundingFact[]; contact: GroundingFact[] }

/** Le choix du commercial : des faits cochés (par `id`), ou « Angle libre ». `null` = rien choisi encore. */
export type GroundingChoice = { mode: 'facts'; ids: string[] } | { mode: 'free_angle' }

/** Combien de signaux sont cochés d'emblée : « les 2 meilleurs » (#4524.1). */
const DEFAULT_CHECKED = 2

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const proofOf = (source: string | null | undefined, date: string | null | undefined): string | null => {
  const parts = [clean(source), clean(date)].filter((part): part is string => part !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** #4977.1 — le poste ET la ville d'une offre : la ville connue s'ajoute (sauf si le libellé la dit déjà) ; inconnue, rien. */
const withPlace = (label: string, place: string | null | undefined): string => {
  const city = clean(place)
  return city && !label.toLowerCase().includes(city.toLowerCase()) ? `${label} — ${city}` : label
}

/** #4977 — l'offre collectée (`it_job_signals`, hors stages) la plus récente, en fait `jobOffer` : poste + ville. */
function readCollectedJobOffer(rawAnalysis: Record<string, unknown> | undefined): GroundingFact | null {
  const raw = rawAnalysis?.['it_job_signals']
  const offers = (Array.isArray(raw) ? raw : []).flatMap(item => {
    const offer = toAccountJobOffer(item)
    return offer ? [offer] : []
  })
  if (offers.length === 0) return null
  const latest = [...offers].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))[0]
  if (!latest) return null
  return {
    id: 'account-job-offer',
    kind: 'account_signal',
    label: `${latest.title}${latest.city ? ` — ${latest.city}` : ''}`,
    proof: clean(latest.publishedAt),
    jobOffer: true,
  }
}

/** Une ligne-RÉSUMÉ (« Vingt offres récentes couvrent… ») n'est pas une offre : pas de poste à citer. */
const OFFER_SUMMARY = /^\s*[\p{L}\d]+\s+(?:\p{L}+\s+){0,3}offres?\b/iu

/**
 * #4977.1 — l'offre RÉCENTE du compte telle que l'onglet « Signaux & besoins » la montre (`signal-lines`, la lecture
 * unique des quatre familles) : la plus récente ligne de recrutement ACTUELLE, poste + ville si la ligne la porte.
 * Une ville inconnue reste inconnue ; aucune offre actuelle ⇒ `null`, rien d'inventé.
 */
function readLineJobOffer(lines: readonly AccountSignalLine[] | undefined): GroundingFact | null {
  const latest = [...(lines ?? [])]
    .filter(line => line.type === 'recrutement' && line.period === 'now' && !OFFER_SUMMARY.test(line.title))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!latest) return null
  const city = clean(latest.people_hints.location)
  return {
    id: 'account-job-offer',
    kind: 'account_signal',
    label: `${latest.title}${city ? ` — ${city}` : ''}`,
    proof: clean(latest.date),
    jobOffer: true,
  }
}

export function groundingFacts({
  rawAnalysis,
  contact,
  signalLines,
  homonymDoubt = false,
  accountWebsite = null,
}: {
  /** #4977.1 — les lignes de signaux du compte (`GET /accounts/:id/signal-lines`) : source de l'offre récente. */
  signalLines?: readonly AccountSignalLine[]
  rawAnalysis: Record<string, unknown> | undefined
  /** #4524.9 — le site du compte : un signal du compte qui parle d'un HOMONYME n'est jamais cochable. */
  accountWebsite?: string | null
  /** #4524.9 — le doute d'identité de la fiche (`homonym_conflict` / `entity_mismatch`), non levé. */
  homonymDoubt?: boolean
  contact: {
    signals?: { label: string; source?: string | null; date?: string | null }[] | null
    key_points?: string[] | null
  }
}): GroundingFacts {
  // #4524.9 — même filtre d'homonyme que la veille (`buildAccountWatchData`) : masqué à la lecture, jamais supprimé.
  const account = withoutHomonymSignals(readRecentSignals(rawAnalysis?.['recent_signals']), accountWebsite).map(
    (signal): GroundingFact => ({
      id: `account-${signal.index}`,
      kind: 'account_signal',
      label: signal.type === 'recrutement' ? withPlace(signal.label, signal.location) : signal.label,
      proof: proofOf(signal.source, signal.date),
      ...(signal.type === 'recrutement' ? { jobOffer: true as const } : {}),
    }),
  )
  // #4977 — même modèle que les signaux de recrutement : un fait `jobOffer` (topic « job_offer » au moteur), en fin de
  // liste ; `defaultGroundingIds(…, { preferOffers })` le fait passer devant pour l'appel. Sans offre, aucun fait.
  const jobOffer = readLineJobOffer(signalLines) ?? readCollectedJobOffer(rawAnalysis)
  if (jobOffer) account.push(jobOffer)
  const signals = (contact.signals ?? []).flatMap((signal, index): GroundingFact[] => {
    const label = clean(signal.label)
    return label
      ? [
          {
            id: `contact-signal-${index}`,
            kind: 'contact_signal',
            label,
            proof: proofOf(signal.source, signal.date),
            ...(homonymDoubt ? { homonymDoubt: true as const } : {}),
          },
        ]
      : []
  })
  const needs = (contact.key_points ?? []).flatMap((point, index): GroundingFact[] => {
    const label = clean(point)
    return label
      ? [
          {
            id: `contact-need-${index}`,
            kind: 'contact_need',
            label,
            proof: null,
            ...(homonymDoubt ? { homonymDoubt: true as const } : {}),
          },
        ]
      : []
  })
  return { account, contact: [...signals, ...needs] }
}

/** Les 2 premiers faits dans l'ordre : le compte d'abord, puis le contact. Rien de connu, rien de coché ; un fait
 *  qui peut concerner un homonyme (#4524.9) n'est jamais coché d'emblée. */
export function defaultGroundingIds(facts: GroundingFacts, { preferOffers = false } = {}): string[] {
  const ordered = [...facts.account, ...facts.contact]
  // #4977 — pour l'appel, l'offre d'emploi passe devant : l'ouverture part d'elle (ordre du dossier sinon).
  // L'offre RÉCENTE du compte (`account-job-offer`) passe avant les autres offres du dossier.
  const offers = [
    ...ordered.filter(f => f.jobOffer && f.id === 'account-job-offer'),
    ...ordered.filter(f => f.jobOffer && f.id !== 'account-job-offer'),
  ]
  const ranked = preferOffers ? [...offers, ...ordered.filter(f => !f.jobOffer)] : ordered
  return ranked
    .filter(fact => !fact.homonymDoubt)
    .slice(0, DEFAULT_CHECKED)
    .map(fact => fact.id)
}

const allOf = (facts: GroundingFacts) => [...facts.account, ...facts.contact]

/**
 * Ce qui part au moteur (#4524.2). Des faits cochés → ces faits seuls ; « Angle libre » ou rien de coché → aucun fait
 * imposé (jamais « tous les signaux »). Aucun fait connu et aucun choix → `undefined` : la clé est omise.
 */
export function groundingPayload(choice: GroundingChoice | null, facts: GroundingFacts): MessageGrounding | undefined {
  const known = allOf(facts)
  if (choice?.mode === 'free_angle') return { mode: 'free_angle' }
  if (known.length === 0) return undefined
  const checked = choice === null ? [] : known.filter(fact => choice.ids.includes(fact.id))
  if (checked.length === 0) return { mode: 'free_angle' }
  return {
    mode: 'facts',
    facts: checked.map(fact => ({
      kind: fact.kind,
      label: fact.label,
      ...(fact.proof ? { proof: fact.proof } : {}),
      ...(fact.jobOffer ? { topic: 'job_offer' as const } : {}),
    })),
  }
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Le fait que le brouillon a UTILISÉ (#4524.3) : parmi les faits cochés, celui que le brouillon a réellement cité
 * (`specificity.elements`) ; à défaut de citation lisible, le premier coché. « Angle libre » ou rien de coché → `null`.
 */
export function usedGroundingFact(
  choice: GroundingChoice | null,
  facts: GroundingFacts,
  insight: MessageInsight,
): { label: string; proof: string | null } | null {
  if (choice?.mode !== 'facts') return null
  const checked = allOf(facts).filter(fact => choice.ids.includes(fact.id))
  const cited = (insight.specificity?.elements ?? []).map(element => normalize(element.value))
  const used =
    checked.find(fact => {
      const label = normalize(fact.label)
      return cited.some(value => value.includes(label) || label.includes(value))
    }) ?? checked[0]
  return used ? { label: used.label, proof: used.proof } : null
}

/**
 * #4524.3 — « Élément utilisé » du panneau « Le contexte à garder » : LE fait utilisé (libellé + preuve), jamais le nom
 * du contact. Sans choix de faits, le premier élément réellement cité, hors l'élément « contact précis » (c'est le nom
 * de la personne, pas un fait). « Angle libre » : aucun fait n'est imposé, donc aucun élément.
 */
export function contextElement(
  choice: GroundingChoice | null,
  facts: GroundingFacts,
  insight: MessageInsight,
): { label: string; proof: string | null } | null {
  if (choice?.mode === 'free_angle') return null
  const used = usedGroundingFact(choice, facts, insight)
  if (used) return used
  const evidence = groupEvidence(insight)
  const cited = [...evidence.observed, ...evidence.history, ...evidence.esn].find(
    item => item.kind !== 'precise_contact',
  )
  return cited ? { label: cited.value, proof: null } : null
}

/** #4977 — l'offre d'emploi sur laquelle l'appel s'ouvre (la première cochée), ou `null` : l'écran le dit, le script reste général. */
export function callOfferLabel(choice: GroundingChoice | null, facts: GroundingFacts): string | null {
  if (choice?.mode !== 'facts') return null
  return allOf(facts).find(fact => fact.jobOffer && choice.ids.includes(fact.id))?.label ?? null
}
