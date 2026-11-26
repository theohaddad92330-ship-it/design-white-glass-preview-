import {
  OUTREACH_PLAYBOOKS,
  OUTREACH_PLAYBOOK_KEYS,
  OUTREACH_SEQUENCE_TEMPLATES,
  OUTREACH_TEMPLATE_CATEGORY,
  outreachTemplateKeySchema,
  type OutreachPlaybookKey,
  type OutreachStepKind,
  type OutreachTemplateKey,
} from '@bellum/contracts'
import { familyOfPlaybook, type PlaybookFamily } from './playbook-families'

/**
 * Théo C sequences-bibliotheque — LE CATALOGUE : une seule liste de modèles, les huit situations ESN et les
 * gabarits d'avant, chacun avec sa famille (le « usage » de la maquette), ses étapes et ses canaux.
 *
 * Une lecture du contrat, rien de stocké : aucune migration, aucun modèle déplacé ni retiré. Un gabarit
 * rangé sous une situation prend la famille de cette situation ; ceux sans situation propre ont la leur ici.
 */

export type CatalogEntry = {
  /** `playbook:<clé>` ou `template:<clé>` — stable, sert de clé React et de cible de test. */
  id: string
  kind: 'playbook' | 'template'
  key: OutreachPlaybookKey | OutreachTemplateKey
  family: PlaybookFamily
  stepKinds: readonly OutreachStepKind[]
  spanDays: number
}

const FAMILY_OF_OTHER_TEMPLATE: Record<OutreachTemplateKey, PlaybookFamily | null> = {
  prospection_3_touches: 'prospecting',
  cold_linkedin: 'prospecting',
  cold_email: 'prospecting',
  fresh_signal: null,
  profile_push: null,
  existing_client: null,
  single_message: 'development',
  call_session: 'prospecting',
  light_sequence: null,
  nurturing: null,
  post_meeting_followup: null,
  referred_contact: null,
  dormant_connection: null,
  esn_partner: 'development',
}

function templateFamily(key: OutreachTemplateKey): PlaybookFamily {
  const category = OUTREACH_TEMPLATE_CATEGORY[key]
  if (category !== 'other') return familyOfPlaybook(category)
  return FAMILY_OF_OTHER_TEMPLATE[key] ?? 'prospecting'
}

export function sequenceCatalog(): CatalogEntry[] {
  const playbooks = OUTREACH_PLAYBOOK_KEYS.map((key): CatalogEntry => {
    const steps = OUTREACH_PLAYBOOKS[key].steps
    return {
      id: `playbook:${key}`,
      kind: 'playbook',
      key,
      family: familyOfPlaybook(key),
      stepKinds: steps.map(step => step.kind),
      spanDays: steps.reduce((max, step) => Math.max(max, step.offset_days), 0),
    }
  })
  const templates = outreachTemplateKeySchema.options.map((key): CatalogEntry => {
    const steps = OUTREACH_SEQUENCE_TEMPLATES[key].steps
    return {
      id: `template:${key}`,
      kind: 'template',
      key,
      family: templateFamily(key),
      stepKinds: steps.map(step => step.kind),
      spanDays: steps.reduce((max, step) => Math.max(max, step.offset_days), 0),
    }
  })
  return [...playbooks, ...templates]
}

/** Les canaux distincts d'un modèle, dans l'ordre où ils apparaissent. */
export function distinctChannels(kinds: readonly OutreachStepKind[]): OutreachStepKind[] {
  return [...new Set(kinds)]
}

type CatalogFilter = {
  /** Texte libre, déjà passé en minuscules sans accents par l'appelant (`foldText`). */
  query: string
  /** Multi-sélection : vide = aucune restriction. */
  families: ReadonlySet<PlaybookFamily>
}

/** Minuscules sans accents : « Réactivation » se trouve en tapant « reactiv ». */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Garde les entrées dont la famille est cochée (ou toutes si aucune) ET dont le texte contient la requête.
 * `textOf` rend le texte cherchable de l'entrée (nom + description, dans la langue de l'écran).
 */
export function filterCatalog<T extends { family: PlaybookFamily }>(
  entries: readonly T[],
  filter: CatalogFilter,
  textOf: (entry: T) => string,
): T[] {
  return entries.filter(entry => {
    if (filter.families.size > 0 && !filter.families.has(entry.family)) return false
    if (filter.query === '') return true
    return foldText(textOf(entry)).includes(filter.query)
  })
}
