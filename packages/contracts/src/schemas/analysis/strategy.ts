import { z } from 'zod'
import { nullableString } from './base.js'

/**
 * Strategy-phase payload: attack angles, account opening narrative,
 * entry points. Defined by BELLUM-STRATEGY and a subset of BELLUM-RESEARCH
 * (apps/ia/app/prompts/*.py). Only the surface that the web app actually
 * renders is declared here.
 *
 * Wire shape is **snake_case** — see ./account-analysis.ts header.
 */

/**
 * Le verdict porté sur la PREUVE d'un angle (tome 5 §32.2).
 *
 * Trois états, jamais deux. « Aucune preuve » et « une preuve que rien ne
 * soutient » ne se disent pas pareil, et les confondre est la cause racine
 * « cassé et non mesurable se ressemblent » appliquée à la rédaction :
 *
 * - `absent`        — le champ est vide. HONNÊTE : le modèle a obéi à la consigne.
 * - `mobilisable`   — la preuve cite une référence que l'ESN a DÉCLARÉE. Elle est
 *                     soutenable en rendez-vous, donc elle s'affiche.
 * - `non_verifiable`— il y a une phrase, et rien dans le profil ne l'étaye. Ce
 *                     n'est pas « faux » — l'ESN a peut-être omis de la déclarer —
 *                     mais ce n'est pas une chose à dire devant un client, et le
 *                     service IA l'a donc EFFACÉE avant de l'écrire.
 *
 * ⚠️ Un angle SANS ce champ n'est pas « non vérifiable » : il est **non vérifié**.
 * Les dossiers analysés avant le 29/08/2026 sont dans ce cas. `angleProofState()`
 * rend `'non_verifie'` pour eux — un quatrième état, qui est celui de l'absence
 * de mesure et pas celui d'un échec. « Non mesuré » n'est jamais « 0 ».
 */
export const ANGLE_PROOF_STATUSES = ['absent', 'mobilisable', 'non_verifiable'] as const
export type AngleProofStatus = (typeof ANGLE_PROOF_STATUSES)[number]

export const attackAngleSchema = z.object({
  title: nullableString,
  strategy: nullableString,
  description: nullableString,
  entry_contact_persona: nullableString,
  specific_offer: nullableString,
  offer: nullableString,
  estimated_deal_size: nullableString,
  /**
   * La PREUVE, isolée de la prose (tome 5 §32.2 : `preuve + transposition +
   * engagement`, et la preuve vient EN PREMIER).
   *
   * Elle vivait noyée dans `strategy`, où le prompt demandait « PROMESSE +
   * PREUVE + ACTION » en un seul champ libre. Conséquence : rien ne pouvait la
   * vérifier, le barème d'éval mesurait deux tiers de la formule qu'il
   * annonçait, et `first-move-input.ts` écrivait `proof: null` en dur faute de
   * champ à lire — le brief de tout compte annonçait « aucune preuve
   * mobilisable », y compris quand il y en avait une.
   */
  proof: nullableString,
  proof_status: z.enum(ANGLE_PROOF_STATUSES).nullish(),
})
export type AttackAngle = z.infer<typeof attackAngleSchema>

/** Ce que l'écran a le droit d'affirmer d'une preuve d'angle. */
export type AngleProofState = AngleProofStatus | 'non_verifie'

/**
 * L'état d'une preuve, TEL QUE L'ÉCRAN doit le dire — la dérivation vit ici,
 * une seule fois, parce que deux écrans qui la refont divergent.
 *
 * Le cas qui compte est le dernier : un angle sans verdict n'a pas été mesuré.
 * L'afficher comme « aucune preuve » serait affirmer qu'on a regardé.
 *
 * L'entrée est `unknown` À DESSEIN : la source est `raw_analysis`, du JSONB que
 * personne ne valide à la lecture. Une signature typée obligerait chaque écran
 * à un cast, et un cast est une affirmation non vérifiée — exactement ce que ce
 * module refuse par ailleurs.
 */
export function angleProofState(angle: unknown): AngleProofState {
  const status = readField(angle, 'proof_status') ?? readField(angle, 'proofStatus')
  return (ANGLE_PROOF_STATUSES as readonly string[]).includes(status ?? '')
    ? (status as AngleProofStatus)
    : 'non_verifie'
}

/** La preuve à AFFICHER, ou `null` quand rien n'est soutenable. */
export function displayableAngleProof(angle: unknown): string | null {
  const proof = readField(angle, 'proof')?.trim()
  if (!proof) return null
  // Une preuve non vérifiable est déjà effacée à la source ; si elle survit sur
  // une ligne ancienne, l'écran ne la relaie pas pour autant.
  return angleProofState(angle) === 'mobilisable' ? proof : null
}

function readField(source: unknown, key: string): string | undefined {
  if (!source || typeof source !== 'object') return undefined
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Un angle d'attaque DÉLIBÉRÉMENT écarté pour le profil ESN courant.
 *
 * La phase 1 le produit depuis toujours — l'angle, la raison de l'écarter, et
 * comment le réactiver — et **personne ne le lisait** : ni le contrat, ni
 * l'écran. Le modèle payait donc des jetons pour expliquer sa sélection, et
 * l'explication partait à la poubelle.
 *
 * Ça se voyait sur un dossier réel : les garde-fous (« pas d'audit flash sans
 * référence déclarée ») écartaient les trois plays, le panneau affichait
 * « Aucun angle identifié — les angles apparaîtront dès que l'analyse fournit
 * assez de signaux », et c'était faux : le dossier avait six signaux et vingt
 * actions. Ce n'est pas la matière qui manquait, c'est la sélection qui avait
 * tranché — en sachant pourquoi.
 */
export const discardedAxisSchema = z.object({
  angle: nullableString,
  raison: nullableString,
  comment_reactiver: nullableString,
})
export type DiscardedAxis = z.infer<typeof discardedAxisSchema>

export const entryPointSchema = z.object({
  label: nullableString,
  target_profile: nullableString,
  justification: nullableString,
})
export type EntryPoint = z.infer<typeof entryPointSchema>

/**
 * #2116.17 — Un item de `entry_points` peut arriver comme une chaîne brute
 * plutôt que l'objet `{ label, target_profile, justification }` — la liste
 * penche parfois vers une énumération de chaînes au lieu de la forme
 * structurée que le prompt annonce par ailleurs. Coercé ITEM PAR ITEM,
 * jamais en bloc : avec `z.array(entryPointSchema)` nu, UN item non conforme
 * (une string, un nombre égaré) fait échouer tout le `z.array`, et
 * `parseAccountAnalysis` (per-field `safeParse`) jette alors
 * `comment_ouvrir_compte` EN ENTIER — pas seulement l'item fautif. C'est une
 * des deux causes de #2116.17-24 (« deux lectures qui divergent » : le
 * service la lisait avec zod strict, l'écran sans zod, item par item).
 */
function coerceEntryPointItem(item: unknown): EntryPoint | null {
  if (typeof item === 'string') {
    const label = item.trim()
    return label.length > 0 ? { label, target_profile: null, justification: null } : null
  }
  const parsed = entryPointSchema.safeParse(item)
  return parsed.success ? parsed.data : null
}

const entryPointListSchema = z
  .array(z.unknown())
  .transform(items => items.map(coerceEntryPointItem).filter((item): item is EntryPoint => item !== null))

/**
 * ``comment_ouvrir_compte`` may arrive as either a free-form narrative or a
 * structured object with ``strategy`` + ``entry_points``. Both shapes happen
 * in the wild — the string is in fact the MAJORITY shape of the current
 * pipeline (3-4 sentences — `apps/ia/app/prompts/bellum_strategy.py:200`,
 * `apps/ia/app/contracts/schemas/research.schema.json:467`).
 *
 * ⚠️ Le type reste l'union `string | Partial<{...}>`, TELLE QUELLE — pas
 * normalisée en un seul objet ici. `apps/web` (`useAccountOverviewData.ts`,
 * `evaluationViewData.ts`) fait déjà, chacun de son côté, le
 * `typeof value === 'string'` sur ce même champ typé ; l'écrire ici en dur
 * transformerait leur branche string en `never` côté TypeScript (testé : ça
 * casse `tsc` sur `apps/web` sans qu'aucune ligne de web n'ait changé). La
 * COERCION qui manquait vraiment est plus bas, sur `entry_points` — voir
 * `entryPointListSchema` ci-dessus — et c'est `account-intelligence-context.
 * service.ts` qui lit désormais `.strategy` OU la string brute pour en
 * extraire une narration, quelle que soit la forme (#2116.17).
 */
export const commentOuvrirCompteSchema = z.union([
  z.string(),
  z
    .object({
      strategy: nullableString,
      entry_points: entryPointListSchema.optional(),
    })
    .partial(),
])
export type CommentOuvrirCompte = z.infer<typeof commentOuvrirCompteSchema>

/** Outbound LinkedIn / email / phone message ready for the rep to send. */
export const messageSchema = z.object({
  contact_name: nullableString,
  linkedin_message: nullableString,
  email_subject: nullableString,
  email_body: nullableString,
  phone_opener: nullableString,
})
export type Message = z.infer<typeof messageSchema>
