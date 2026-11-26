import { z } from 'zod'
import type { CreateOutreachSequenceRequest } from './outreach-sequence.js'
import { buildPlaybookCreateRequest, playbookSequenceName } from './outreach-playbooks.js'

/**
 * #5029.1 — PROPOSER UN CONSULTANT EN INTERCONTRAT À UN COMPTE, depuis son
 * Reverse Market. Revient sur le NO-GO « Préparer un push profil »
 * (`chantiers-livres.md`, Reverse Market #2968) : levé par Louis le 31/10/2026,
 * SEULEMENT sur geste explicite par compte, profil anonymisé, mail validé.
 *
 * #5029.3 — UN compte, UN contact par lancement : le schéma n'accepte qu'un
 * `contact_id` (`.strict()` refuse un `contact_ids` glissé), jamais une
 * audience (c74/c131 et l'envoi groupé #4050 restent hors de ce parcours).
 */
export const benchPushRequestSchema = z
  .object({
    consultant_id: z.string().guid(),
    contact_id: z.string().guid(),
    /**
     * Le contexte du compte tel que le Reverse Market l'affiche (raison du
     * verdict, besoin, signal) : il nourrit le brouillon, que le commercial
     * relit de toute façon. Absent = le brouillon ne cite que le compte.
     */
    account_context: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
export type BenchPushRequest = z.infer<typeof benchPushRequestSchema>

/** Le playbook d'une séquence intercontrat : F, `bench_consultant`. */
export const BENCH_PUSH_PLAYBOOK = 'bench_consultant' as const

/** Combien de compétences le profil anonymisé cite, au plus. */
const BENCH_PUSH_MAX_SKILLS = 5

/**
 * Le profil ANONYMISÉ qui seul entre dans le brouillon : poste, séniorité,
 * années, compétences, date de disponibilité. JAMAIS le nom, le tarif (TJM),
 * l'e-mail, le téléphone, la photo ni l'adresse — un profil qu'on propose à
 * un client ne dit pas qui c'est ni combien il coûte avant un échange.
 * Une valeur absente ne fait aucune ligne (jamais « 0 », jamais « inconnu »).
 */
export type BenchPushProfile = {
  title: string | null
  seniority: string | null
  years_experience: number | null
  skills: string[]
  available_from: string | null
}

const UNKNOWN = new Set(['', 'inconnu', 'unknown'])

function known(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return UNKNOWN.has(trimmed.toLowerCase()) ? null : trimmed
}

/** Ne lit QUE les champs autorisés : un objet plus riche (nom, TJM…) n'en fait rien passer. */
export function anonymizedBenchProfile(input: {
  title: string | null
  seniority: string | null
  years_experience: number | null
  skills: readonly string[]
  available_from: string | null
}): BenchPushProfile {
  const skills: string[] = []
  for (const skill of input.skills) {
    const name = known(skill)
    if (name && !skills.some(s => s.toLowerCase() === name.toLowerCase())) skills.push(name)
    if (skills.length === BENCH_PUSH_MAX_SKILLS) break
  }
  return {
    title: known(input.title),
    seniority: known(input.seniority),
    years_experience:
      typeof input.years_experience === 'number' && input.years_experience > 0 ? input.years_experience : null,
    skills,
    available_from: known(input.available_from),
  }
}

function frenchDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : iso
}

/**
 * Le brouillon de la PREMIÈRE étape (e-mail : profil anonymisé et
 * disponibilité). Les autres étapes restent vides : rien n'est inventé, le
 * commercial les rédige ou les fait préparer par Laura, et les relit.
 */
export function buildBenchPushDraft(input: {
  profile: BenchPushProfile
  accountName: string
  accountContext?: string | null
}): { subject: string; body: string } {
  const { profile } = input
  const role = profile.title ?? 'consultant'
  const lines = [
    profile.seniority ? `- Séniorité : ${profile.seniority}` : null,
    profile.years_experience ? `- Expérience : ${profile.years_experience} ans` : null,
    profile.skills.length > 0 ? `- Compétences : ${profile.skills.join(', ')}` : null,
    profile.available_from
      ? `- Disponible à partir du ${frenchDate(profile.available_from)} (selon notre planning)`
      : null,
  ].filter((line): line is string => line !== null)
  const context = input.accountContext?.trim()
  const body = [
    'Bonjour,',
    context
      ? `En lisant ce qui se passe chez ${input.accountName} (${context}), je pense à un profil ${role} de notre équipe.`
      : `Je pense à un profil ${role} de notre équipe pour ${input.accountName}.`,
    lines.length > 0 ? `Profil anonymisé :\n${lines.join('\n')}` : null,
    'Est-ce un sujet chez vous en ce moment ? Si oui, je vous envoie le dossier complet.',
  ]
    .filter((part): part is string => part !== null)
    .join('\n\n')
  return { subject: `Un profil ${role} pour ${input.accountName}`, body }
}

/**
 * La requête de création : le playbook F par le constructeur UNIQUE
 * (`buildPlaybookCreateRequest`), un seul contact, aucune étiquette de
 * campagne (une proposition n'est pas une campagne).
 */
export function buildBenchPushCreateRequest(input: {
  contactId: string
  contactName: string
  profile: BenchPushProfile
  accountName: string
  accountContext?: string | null
}): CreateOutreachSequenceRequest {
  return buildPlaybookCreateRequest({
    contactId: input.contactId,
    playbook: BENCH_PUSH_PLAYBOOK,
    name: playbookSequenceName(BENCH_PUSH_PLAYBOOK, input.contactName),
    drafts: { 0: buildBenchPushDraft(input) },
  })
}
