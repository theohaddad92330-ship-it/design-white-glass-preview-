import { OUTREACH_SEQUENCE_MAX_STEPS, SEQUENCE_TIER_LABELS, SEQUENCE_VARIABLES } from '@bellum/contracts'
import { readUniversalRecords } from '../universal-import/universal-import-parser'

/**
 * #3756.1 — LECTURE d'une bibliothèque de campagnes (xlsx ou csv) : une
 * campagne = un modèle de séquence (secteur, tier, étapes J+n, objet, corps).
 *
 * Colonnes tolérantes FR/EN ; une colonne non reconnue est IGNORÉE, jamais
 * devinée. En particulier les colonnes de STATS (taux d'ouverture, réponses…)
 * ne sont jamais lues : ce sont des chiffres de l'outil d'envoi du client, pas
 * des mesures Bellum — la sortie n'a aucun champ où les ranger. Seule la
 * feuille qui PORTE une colonne corps est lue (#4426.7 — « contenu », pas la
 * première) ; l'onglet de stats n'en porte pas, il n'est donc jamais importé.
 * Une feuille « listecampagnes » donne leur nom (Campagne + Secteur) aux
 * campagnes ; sans elle, le nom du fichier est gardé tel quel.
 *
 * Une ligne invalide est ÉCARTÉE avec sa raison et son numéro de ligne.
 */

type ParsedSequenceTemplate = {
  name: string
  sector: string | null
  tier_label: 'A' | 'B' | 'C' | null
  steps: { position: number; delay_days: number; subject: string; body: string }[]
  /** #4426.7 — les scripts d'appel de la campagne (« Script : Accroche »…), dans l'ordre du fichier. */
  call_scripts: { position: number; title: string; body: string }[]
}

type SkipReason = 'no_campaign' | 'no_body' | 'bad_delay' | 'bad_tier' | 'too_many_steps'

type ParsedSequenceLibrary = {
  templates: ParsedSequenceTemplate[]
  skipped: { line: number; reason: SkipReason; campaign: string | null }[]
  /** #4426.7 — les `{{variables}}` que le produit ne connaît pas : laissées telles quelles, nommées ici. */
  unknownVariables: string[]
}

/** #4426.7 — le nom (et le secteur) d'une campagne, lus dans la feuille « listecampagnes ». */
type CampaignNames = ReadonlyMap<string, { name: string; sector: string | null }>

type Field = 'campaign' | 'sector' | 'tier' | 'step' | 'delay' | 'subject' | 'body'

// Clés NORMALISÉES (minuscules, sans accents ni ponctuation hors `+`).
const ALIASES: Record<Field, string[]> = {
  campaign: ['campagne', 'campaign', 'nom campagne', 'nom de la campagne', 'modele', 'sequence'],
  sector: ['secteur', 'sector', 'industry', 'segment'],
  tier: ['tier', 'niveau', 'priorite', 'tier label'],
  step: ['etape', 'type etape', 'step', 'n etape', 'numero etape', 'email', 'touche'],
  delay: ['j+n', 'j+', 'delai', 'delay', 'delai jours', 'delay days', 'jour', 'day', 'j'],
  subject: ['objet', 'titre intitule', 'titre', 'intitule', 'subject', 'sujet', 'objet mail', 'objet email'],
  body: ['corps', 'body', 'message', 'contenu', 'texte', 'corps du mail', 'corps email'],
}

function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .trim()
}

function pick(record: Record<string, string>, field: Field): string {
  const wanted = new Set(ALIASES[field])
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizeHeader(key))) return (value ?? '').trim()
  }
  return ''
}

/** `J+3`, `j + 3`, `J3`, `3`, `3 jours` → 3 ; `J0`/`0` → 0 ; sinon `null`. */
function parseDelay(raw: string): number | null {
  const m = /^j?\s*\+?\s*(\d{1,3})(?:\s*(?:jours?|days?|j))?$/i.exec(raw.trim())
  if (!m) return null
  const n = Number(m[1])
  return n <= 365 ? n : null
}

function parseTier(raw: string): { ok: true; tier: 'A' | 'B' | 'C' | null } | { ok: false } {
  if (!raw) return { ok: true, tier: null }
  const m = /^(?:tier\s*)?([abc])$/i.exec(raw.trim())
  const letter = m?.[1]?.toUpperCase()
  const found = SEQUENCE_TIER_LABELS.find(t => t === letter)
  return found ? { ok: true, tier: found } : { ok: false }
}

/** #4426.7 — HTML simple (`<br>`, `<p>`) → texte avec retours à la ligne ; les autres balises tombent. */
export function htmlToText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<p(?:\s[^>]*)?>/gi, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .trim()
}

const VARIABLE_RE = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g

type Draft = {
  sector: string | null
  tier: ParsedSequenceTemplate['tier_label']
  rows: DraftRow[]
  scripts: ParsedSequenceTemplate['call_scripts']
}
type DraftRow = { line: number; step: number; delay: number; subject: string; body: string }

export function parseSequenceLibrary(
  records: readonly { line: number; record: Record<string, string> }[],
  campaignNames: CampaignNames = new Map(),
): ParsedSequenceLibrary {
  const unknownVariables = new Set<string>()
  const campaigns = new Map<string, Draft & { name: string }>()
  const skipped: ParsedSequenceLibrary['skipped'] = []

  for (const { line, record } of records) {
    const name = pick(record, 'campaign')
    if (!name) {
      // Une ligne entièrement vide n'est pas une erreur : on ne la compte pas.
      if (Object.values(record).some(v => (v ?? '').trim() !== ''))
        skipped.push({ line, reason: 'no_campaign', campaign: null })
      continue
    }
    const body = htmlToText(pick(record, 'body'))
    if (!body) {
      skipped.push({ line, reason: 'no_body', campaign: name })
      continue
    }
    // #4426.7 — « Mail 2 (J+3) » : le rang et le délai se lisent dans la cellule d'étape quand il n'y a pas de colonne délai.
    const stepCell = pick(record, 'step')
    // #4426.7 — « Script : Accroche » n'est pas un mail daté : c'est un script d'appel de la campagne. Gardé, jamais
    // écarté comme « délai illisible » (les 54 lignes de la recette PROD du 22/10).
    const script = /^\s*script\s*[:\-–]?\s*(.*)$/i.exec(stepCell)
    if (script) {
      const key = name.toLowerCase()
      const named = campaignNames.get(key)
      const draft = campaigns.get(key) ?? {
        name: named?.name ?? name,
        sector: named?.sector ?? null,
        tier: null,
        rows: [],
        scripts: [],
      }
      draft.scripts.push({
        position: draft.scripts.length,
        title: (script[1] ?? '').trim() || htmlToText(pick(record, 'subject')) || `Script ${draft.scripts.length + 1}`,
        body,
      })
      campaigns.set(key, draft)
      continue
    }
    const inStep = /\(?\s*J\s*\+\s*(\d{1,3})\s*\)?/i.exec(stepCell)
    const delay = parseDelay(pick(record, 'delay') || (inStep ? `J+${inStep[1]}` : ''))
    if (delay === null) {
      skipped.push({ line, reason: 'bad_delay', campaign: name })
      continue
    }
    const tier = parseTier(pick(record, 'tier'))
    if (!tier.ok) {
      skipped.push({ line, reason: 'bad_tier', campaign: name })
      continue
    }
    const named = campaignNames.get(name.toLowerCase())
    const key = name.toLowerCase()
    const draft = campaigns.get(key) ?? {
      name: named?.name ?? name,
      sector: named?.sector ?? null,
      tier: null,
      rows: [],
      scripts: [],
    }
    if (draft.rows.length >= OUTREACH_SEQUENCE_MAX_STEPS) {
      skipped.push({ line, reason: 'too_many_steps', campaign: name })
      continue
    }
    draft.sector = draft.sector ?? (pick(record, 'sector') || null)
    draft.tier = draft.tier ?? tier.tier
    const rank = /(\d+)/.exec(stepCell.replace(/\(?\s*J\s*\+\s*\d+\s*\)?/gi, ''))
    for (const match of body.matchAll(VARIABLE_RE)) {
      const variable = match[1] as string
      if (!(SEQUENCE_VARIABLES as readonly string[]).includes(variable)) unknownVariables.add(variable)
    }
    draft.rows.push({
      line,
      step: rank ? Number(rank[1]) : Number.MAX_SAFE_INTEGER,
      delay,
      subject: htmlToText(pick(record, 'subject')),
      body,
    })
    campaigns.set(key, draft)
  }

  const templates = [...campaigns.values()].map(draft => ({
    name: draft.name,
    sector: draft.sector,
    tier_label: draft.tier,
    steps: [...draft.rows]
      .sort((a, b) => a.step - b.step || a.delay - b.delay || a.line - b.line)
      .map((row, position) => ({ position, delay_days: row.delay, subject: row.subject, body: row.body })),
    call_scripts: draft.scripts,
  }))
  return { templates, skipped, unknownVariables: [...unknownVariables] }
}

export async function readSequenceLibraryFile(buffer: Buffer, format: 'xlsx' | 'csv'): Promise<ParsedSequenceLibrary> {
  async function* parts(): AsyncGenerator<Buffer> {
    yield buffer
  }
  // #4426.7 — la feuille retenue est celle qui porte une colonne corps (« Contenu », « Corps », « Message », « Body »).
  const hasBody = (headers: string[]) => headers.some(header => ALIASES.body.includes(normalizeHeader(header)))
  const records: { line: number; record: Record<string, string> }[] = []
  let sheets: { name: string; rows: number }[] = []
  let selected = ''
  for await (const event of readUniversalRecords(parts(), format, { recognises: hasBody })) {
    if (event.kind === 'sheets') {
      sheets = event.sheets
      selected = event.selected
    } else if (event.kind === 'row') records.push({ line: event.line, record: event.record })
  }
  return parseSequenceLibrary(records, format === 'xlsx' ? await readCampaignNames(parts, sheets, selected) : new Map())
}

/** #4426.7 — « listecampagnes » : `Campagne` → « Campagne — Secteur ». Absente = aucun nom changé. */
async function readCampaignNames(
  parts: () => AsyncGenerator<Buffer>,
  sheets: readonly { name: string }[],
  selected: string,
): Promise<CampaignNames> {
  const names = new Map<string, { name: string; sector: string | null }>()
  const list = sheets.find(
    sheet => sheet.name !== selected && normalizeHeader(sheet.name).replace(/ /g, '') === 'listecampagnes',
  )
  if (!list) return names
  for await (const event of readUniversalRecords(parts(), 'xlsx', { sheet: list.name })) {
    if (event.kind !== 'row') continue
    const campaign = pick(event.record, 'campaign')
    if (!campaign) continue
    const sector = pick(event.record, 'sector') || null
    names.set(campaign.toLowerCase(), { name: sector ? `${campaign} — ${sector}` : campaign, sector })
  }
  return names
}
