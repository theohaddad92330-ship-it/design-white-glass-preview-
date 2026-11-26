import {
  OUTREACH_PLAYBOOK_KEYS,
  outreachTemplateKeySchema,
  triggerFromSignalType,
  type OutreachPlaybookKey,
  type OutreachTemplateKey,
} from '@bellum/contracts'

/**
 * Pré-remplissage de l'écran Séquences depuis l'URL
 * (`/actions/sequences?contact_ids=…&objective=…`).
 *
 * #1903.10 / #1903.15 / #1903.17 / #1903.18 / #1903.19 / #1935 — LE PATRON DE
 * `discover-prefill.ts`, ÉTENDU ICI plutôt que réinventé (GA-26 : une
 * dérivation vit à un seul endroit). Sert la proposition `prepare_campaign` du
 * Copilote : le chat n'exécute AUCUNE création, il prépare des critères ; le
 * clic de l'utilisateur ouvre cet écran déjà cadré. Sans ce lecteur, le bouton
 * mènerait à un écran vierge — une action fantôme (#1903.24).
 *
 * Tolérant par conception : une valeur hors vocabulaire est IGNORÉE, jamais
 * appliquée « au mieux ».
 */

const RELATIONS = ('cold,warm,referred,existing' as const).split(',')
const CHANNELS = ('email,linkedin,phone' as const).split(',')
const MODES = ('outreach,nurturing' as const).split(',')
// #1935.14 — le type de sortie calculé par `prepare_campaign` (`chat_tools.py`) :
// `call_list` quand SEUL le téléphone est visé, `sequence_campaign` sinon.
// `sequence_campaign` reste le chemin implicite, silencieux, comme `mode`.
const OUTPUT_KINDS = ('sequence_campaign,call_list' as const).split(',')

type CampaignRelation = (typeof RELATIONS)[number]
type CampaignChannel = (typeof CHANNELS)[number]
type CampaignMode = (typeof MODES)[number]
type CampaignOutputKind = (typeof OUTPUT_KINDS)[number]

type CampaignPrefill = {
  contactIds: string[]
  objective: string
  persona: string | null
  relation: CampaignRelation | null
  channels: CampaignChannel[]
  tone: string | null
  mode: CampaignMode
  template: OutreachTemplateKey | null
  outputKind: CampaignOutputKind
}

function pickKnown<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  const wanted = String(raw ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean)
  return allowed.filter(value => wanted.includes(value))
}

function pickOne<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase()
  return allowed.find(candidate => candidate === value) ?? null
}

/**
 * La campagne portée par l'URL, ou `null` quand elle n'en porte aucune (cas
 * normal : l'écran s'ouvre alors dans son état d'accueil, comportement
 * inchangé). Les DEUX moitiés obligatoires — l'audience et l'objectif — sont
 * requises ensemble : l'une sans l'autre n'est pas une campagne exploitable.
 */
export function campaignFromSearch(search: Record<string, unknown>): CampaignPrefill | null {
  const contactIds = String(search.contact_ids ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  const objective = String(search.objective ?? '').trim()
  if (contactIds.length === 0 || !objective) return null

  const persona = String(search.persona ?? '').trim()
  const tone = String(search.tone ?? '').trim()

  return {
    contactIds,
    objective,
    persona: persona || null,
    relation: pickOne<CampaignRelation>(search.relation, RELATIONS),
    channels: pickKnown<CampaignChannel>(search.channels, CHANNELS),
    tone: tone || null,
    mode: pickOne<CampaignMode>(search.mode, MODES) ?? 'outreach',
    template: pickOne<OutreachTemplateKey>(search.template, outreachTemplateKeySchema.options),
    outputKind: pickOne<CampaignOutputKind>(search.output_kind, OUTPUT_KINDS) ?? 'sequence_campaign',
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * #3700 — la séquence que l'URL demande d'ouvrir (`/actions/sequences?sequence=<id>`),
 * posée par le résumé de la fiche contact : le lien mène à LA campagne exacte,
 * pas à la liste. Une valeur qui n'est pas un identifiant est ignorée.
 */
export function openedSequenceIdFromSearch(search: Record<string, unknown>): string | null {
  const raw = search['sequence']
  return typeof raw === 'string' && UUID.test(raw) ? raw : null
}

/**
 * Lot L-C (#4166) — l'ASSISTANT en 4 questions ouvert depuis un compte ou un
 * signal : `?playbook_contact=<uuid>&signal=hiring` (ou `&playbook=new_cio`).
 * Le contact est requis (question 1) ; le signal pré-remplit la question 2.
 * Un signal ou un modèle hors vocabulaire est ignoré, jamais deviné.
 */
export function playbookFromSearch(
  search: Record<string, unknown>,
): { contactId: string; trigger: OutreachPlaybookKey | null } | null {
  const contact = search['playbook_contact']
  if (typeof contact !== 'string' || !UUID.test(contact)) return null
  const named = OUTREACH_PLAYBOOK_KEYS.find(key => key === search['playbook'])
  const signal = typeof search['signal'] === 'string' ? triggerFromSignalType(search['signal']) : null
  return { contactId: contact, trigger: named ?? signal }
}

/**
 * #4492 (PR 12C) — « Modèles de séquence » est joignable depuis Actions › Séquences SANS route neuve : la
 * bibliothèque est une vue de la page Séquences, et `?vue=modeles` l'ouvre. Cette constante est le lien que les
 * autres écrans posent (`<Link to="/actions/sequences" search={SEQUENCE_LIBRARY_SEARCH}>`), et la page la lit
 * par {@link libraryFromSearch} — une seule source, jamais deux orthographes.
 */
export const SEQUENCE_LIBRARY_SEARCH = { vue: 'modeles' } as const

/** `?vue=modeles` : la page Séquences s'ouvre sur la bibliothèque de modèles. Toute autre valeur : la liste. */
export function libraryFromSearch(search: Record<string, unknown>): boolean {
  return search['vue'] === SEQUENCE_LIBRARY_SEARCH.vue
}
