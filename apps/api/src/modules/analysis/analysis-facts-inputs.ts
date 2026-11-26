import type { AccountFact, AccountFactKind } from '@bellum/contracts'

/**
 * #4070 — CE QUE LE PIPELINE D'ANALYSE REÇOIT DU SOCLE DES FAITS DU COMPTE.
 *
 * Constat (#4068, carte du 12/10) : la recherche ne lisait le CRM que comme un
 * drapeau, les contacts n'avaient aucune source, le plan réduisait gagné/perdu
 * à `has_positive_rex`, et une ré-analyse ne relisait jamais la précédente.
 * Décision Louis 12/10 : toute la donnée accumulée est un intrant du TRAITEMENT.
 *
 * Ce fichier ne lit RIEN : ce sont les fonctions PURES qui mettent en forme ce
 * que `AccountFactsService` (#4069.1, lecteur UNIQUE — on n'en écrit pas un
 * second), le CRM et les tables de l'espace ont rendu. La lecture vit dans
 * `analysis-facts-inputs.service.ts`, le transport dans `analysis.worker.ts` →
 * `ia.client.ts` → `/graph/analyze`.
 *
 * Trois règles tiennent dans la FORME :
 *  - **jamais de provenance** : un fait part en 4 clés (`kind`, `label`, `date`,
 *    `ageDays`) — ni poids (le rang suffit, jamais une probabilité), ni lien,
 *    ni source ;
 *  - **toujours daté** : un fait sans date n'est pas un fait du socle ;
 *  - **borné** : {@link ANALYSIS_FACTS_MAX} faits ≈ 2 000 tokens côté IA
 *    (budget de 8 000 caractères, `FACTS_BLOCK_MAX_CHARS`), les plus pertinents
 *    d'abord (le socle les rend triés par poids) ; le reste se DIT côté IA, il
 *    ne se tait pas.
 */

/** Le jeton de la lecture des faits (GA-07 : ce service ne connaît pas `AccountFactsService`). */
export const ANALYSIS_ACCOUNT_FACTS_SOURCE = Symbol('ANALYSIS_ACCOUNT_FACTS_SOURCE')

/** Ce que le module branche derrière le jeton. */
export interface AnalysisAccountFactsSource {
  /** Les faits du compte, pesés, les plus pertinents d'abord. `null` = compte hors espace. */
  facts(args: { workspaceId: string; accountId: string; userId: string }): Promise<readonly AccountFact[] | null>
  /** Les motifs de perte DÉCLARÉS par l'équipe, condensés. `null` = aucun REX de perte. */
  lostDealRex(args: { workspaceId: string; accountId: string }): Promise<string | null>
}

export type AnalysisAccountFact = Pick<AccountFact, 'date' | 'label' | 'ageDays'> & { kind: AccountFactKind }

export type AnalysisKnownContact = {
  name: string
  role: string | null
  relation: 'crm' | 'mission'
  /** Jour ISO du dernier échange connu ; `null` = inconnu, jamais deviné. */
  lastSeen: string | null
}

/** 40 faits ≈ 2 000 tokens à l'arrivée (voir le docblock). */
export const ANALYSIS_FACTS_MAX = 40
export const KNOWN_CONTACTS_MAX = 20

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/

function isoDay(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null
  // Une chaîne n'est lue que si elle est ISO : jamais de date devinée.
  if (typeof value === 'string' && ISO_DAY.test(value)) return value.slice(0, 10)
  return null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/** Les faits du socle → le wire du pipeline. L'ordre reçu est celui du poids : conservé. */
export function analysisFactsWire(facts: readonly AccountFact[]): AnalysisAccountFact[] {
  const seen = new Set<string>()
  const out: AnalysisAccountFact[] = []
  for (const fact of facts) {
    const key = `${fact.kind}|${fact.date.slice(0, 10)}|${fact.label.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind: fact.kind, label: fact.label.trim(), date: fact.date.slice(0, 10), ageDays: fact.ageDays })
    if (out.length >= ANALYSIS_FACTS_MAX) break
  }
  return out
}

/** Les contacts que le CRM connaît chez ce groupe : nom et poste, JAMAIS l'e-mail. */
export function knownContactsFromCrm<T extends { name: string | null; jobTitle: string | null }>(
  contacts: readonly T[],
): AnalysisKnownContact[] {
  return contacts.flatMap(c => {
    const name = text(c.name)
    return name ? [{ name, role: text(c.jobTitle) || null, relation: 'crm' as const, lastSeen: null }] : []
  })
}

/** Les interlocuteurs de missions passées chez ce client, datés par la mission. */
export function knownContactsFromMissions(
  rows: ReadonlyArray<{
    full_name: string | null
    title: string | null
    started_on: string | Date | null
    created_at: string | Date | null
  }>,
): AnalysisKnownContact[] {
  return rows.flatMap(r => {
    const name = text(r.full_name)
    if (!name) return []
    return [
      {
        name,
        role: text(r.title) || null,
        relation: 'mission' as const,
        lastSeen: isoDay(r.started_on) ?? isoDay(r.created_at),
      },
    ]
  })
}

/** Dédoublonne par nom (la première liste gagne : le CRM d'abord) et borne. */
export function mergeKnownContacts(...lists: ReadonlyArray<readonly AnalysisKnownContact[]>): AnalysisKnownContact[] {
  const seen = new Set<string>()
  const out: AnalysisKnownContact[] = []
  for (const contact of lists.flat()) {
    const key = contact.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(contact)
    if (out.length >= KNOWN_CONTACTS_MAX) break
  }
  return out
}

// ── .4 l'analyse précédente ──────────────────────────────────────────────────

const FIELD_LABEL: Readonly<Record<string, string>> = {
  sector: 'Secteur',
  employees: 'Effectif',
  revenue: "Chiffre d'affaires",
  headquarters: 'Siège',
  website: 'Site',
  address: 'Adresse',
  phone: 'Téléphone',
  tradeName: 'Nom commercial',
}

/** Les champs de fiche que l'analyse précédente a écrits, dans l'ordre où on les lit. */
export const PREVIOUS_ANALYSIS_FIELDS = Object.keys(FIELD_LABEL)

type PreviousAnalysisInput = {
  /** Dernière analyse TERMINÉE ; `null` = inconnue (jamais `created_at` : voir `completedAnalysisDates`). */
  analyzedAt: string | Date | null
  businessDescription?: string | null
  angles?: readonly string[]
  fields: ReadonlyArray<{ key: string; value: string | null; humanCorrectedAt: string | Date | null }>
}

const DESCRIPTION_MAX = 400
const ANGLES_MAX = 5
const MONTH_MS = 30.44 * 86_400_000

function agePhrase(from: Date, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 86_400_000))
  if (days < 1) return "aujourd'hui"
  if (days < 31) return `il y a ${days} jour${days > 1 ? 's' : ''}`
  if (days < 731) return `il y a ${Math.max(1, Math.round((days * 86_400_000) / MONTH_MS))} mois`
  const years = Math.floor(days / 365.25)
  return `il y a ${years} an${years > 1 ? 's' : ''}`
}

/**
 * L'analyse précédente du compte, en TRACE DATÉE — jamais un fait actuel.
 *
 * Ce qu'un humain a corrigé est NOMMÉ « corrigé par l'équipe » avec sa date :
 * côté IA, la correction gagne toujours, quelle que soit sa date. Une valeur
 * vide ne fait aucune ligne (jamais « 0 », jamais un « non renseigné » inventé).
 * `null` = rien d'exploitable : aucun bloc, le prompt reste byte-identique.
 */
export function renderPreviousAnalysis(input: PreviousAnalysisInput, now: Date = new Date()): string | null {
  const lines: string[] = []
  for (const key of PREVIOUS_ANALYSIS_FIELDS) {
    const field = input.fields.find(f => f.key === key)
    const value = text(field?.value)
    if (!field || !value) continue
    const corrected = isoDay(field.humanCorrectedAt)
    lines.push(`- ${FIELD_LABEL[key]} : ${value}${corrected ? ` (corrigé par l'équipe le ${corrected})` : ''}`)
  }
  const description = text(input.businessDescription).slice(0, DESCRIPTION_MAX)
  if (description) lines.push(`- Activité : ${description}`)
  const angles = (input.angles ?? []).map(text).filter(Boolean).slice(0, ANGLES_MAX)
  if (angles.length > 0) lines.push(`- Angles retenus : ${angles.join(' ; ')}`)
  if (lines.length === 0) return null

  const analyzed =
    input.analyzedAt instanceof Date ? input.analyzedAt : input.analyzedAt ? new Date(input.analyzedAt) : null
  const dated = analyzed && Number.isFinite(analyzed.getTime()) ? analyzed : null
  const head = dated
    ? `Analyse du ${dated.toISOString().slice(0, 10)} (${agePhrase(dated, now)})`
    : 'Analyse précédente (date non connue)'
  return [head, ...lines].join('\n')
}
