import { z } from 'zod'

/**
 * BEL-SC-243 — REX PERTE : le retour d'expérience d'une opportunité perdue,
 * bloquée ou classée no-go (#3272).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS `rex_entries`
 * ─────────────────────────────────────────────────────────────────────────
 * `rex_entries` (Capitalisation, PDF 2 §12) est le débrief d'une MISSION
 * terminée — ce qui a marché une fois la mission gagnée et livrée. Ce module
 * porte l'autre moitié, qui n'existait pas : pourquoi une OPPORTUNITÉ
 * (`projects`, stade `lost`) ne s'est PAS transformée en mission. Les deux
 * objets sourcent des maisons différentes (Mission vs Opportunité,
 * instruction commune #3249 règle 5) et ne se fusionnent pas.
 *
 * `loss_reason` (une chaîne libre, exigée au passage en `lost` —
 * `project.loss-reason.test.ts`) reste le motif bref qu'un commercial tape en
 * fermant l'étape. Ce REX est un objet SÉPARÉ, plus riche, rempli à froid : il
 * ne remplace pas `loss_reason`, il l'approfondit quand l'équipe prend le
 * temps de le faire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DISTINCTIONS — pourquoi certains champs sont « evidenced »
 * ─────────────────────────────────────────────────────────────────────────
 * La spec sépare fait confirmé, retour du client, interprétation commerciale,
 * hypothèse et inconnu (`lostDealRexEvidenceSchema`). Appliquer cette
 * distinction aux CHAMPS FACTUELS (compte, périmètre, dates) n'aurait aucun
 * sens — un périmètre n'est pas une opinion. Elle s'applique aux champs où le
 * texte pourrait sinon se lire comme un fait acquis : le motif déclaré (ce
 * que le client a dit) versus le motif supposé (ce que le commercial
 * pense réellement), la dernière action, et la synthèse « ce que l'équipe
 * sait maintenant » — exactement les endroits où confondre une hypothèse et
 * un fait ferait apprendre une leçon fausse à toute l'équipe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RÉUTILISATION — ce que ce module NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * `reuse_targets` est une liste DÉCLARATIVE : le commercial coche ce que ce
 * REX devrait faire bouger. Aucun code de ce module n'écrit automatiquement
 * dans la stratégie de compte, la route ou un message — la spec le dit noir
 * sur blanc (« Il ne modifie pas automatiquement la méthode globale
 * Bellum »), et la doctrine plus largement (« on PROPOSE, on n'écrit jamais
 * tout seul »). Appliquer réellement un `reuse_target` reste un geste humain,
 * hors de ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO-GO — la garde qui manque nulle part ailleurs
 * ─────────────────────────────────────────────────────────────────────────
 * « Un échec isolé entraîne l'exclusion automatique de tout un secteur ou
 * d'un canal » est le comportement que la spec interdit. `reuse_targets`
 * n'offre AUCUNE valeur de cette forme — la portée la plus large qu'il permet
 * est `workspace_rule`, et faire d'un `workspace_rule` une RÈGLE appliquée
 * passe par {@link ../lost-deal-rule-proposal.js}, qui exige plusieurs cas
 * convergents et une validation humaine avant d'exister comme autre chose
 * qu'une proposition. `lost-deal-rex.no-go.test.ts` fixe cette liste.
 */

// ── MOTIFS DE PERTE — la spec, mot pour mot, quatorze valeurs ────────────────

export const LOST_DEAL_MOTIFS = [
  'timing',
  'budget',
  'concurrence',
  'panel',
  'sponsor_absent',
  'mauvaise_personne',
  'mauvais_besoin',
  'proposition',
  'prix',
  'consultant',
  'delivery',
  'decision_interne',
  'aucune_decision',
  'inconnu',
] as const
export const lostDealMotifSchema = z.enum(LOST_DEAL_MOTIFS)
export type LostDealMotif = z.infer<typeof lostDealMotifSchema>

// ── DISTINCTIONS — la spec, mot pour mot, cinq valeurs ───────────────────────

export const LOST_DEAL_REX_EVIDENCE_KINDS = [
  'fait_confirme',
  'retour_client',
  'interpretation_commerciale',
  'hypothese',
  'inconnu',
] as const
export const lostDealRexEvidenceSchema = z.enum(LOST_DEAL_REX_EVIDENCE_KINDS)
export type LostDealRexEvidence = z.infer<typeof lostDealRexEvidenceSchema>

/** Une affirmation interprétable, jamais nue : elle porte toujours son statut. */
export const evidencedClaimSchema = z.object({
  value: z.string().trim().min(1).max(2000),
  distinction: lostDealRexEvidenceSchema,
})
export type EvidencedClaim = z.infer<typeof evidencedClaimSchema>
const nullableEvidencedClaimSchema = evidencedClaimSchema.nullable()

// ── RÉUTILISATION — la spec, mot pour mot, sept cibles ───────────────────────
// ⚠️ Aucune valeur « secteur » ni « canal » : voir NO-GO ci-dessus.

export const LOST_DEAL_REX_REUSE_TARGETS = [
  'account_local_strategy',
  'route',
  'message',
  'blocker_list',
  'review_date',
  'comparable_case',
  'workspace_rule',
] as const
export const lostDealRexReuseTargetSchema = z.enum(LOST_DEAL_REX_REUSE_TARGETS)
export type LostDealRexReuseTarget = z.infer<typeof lostDealRexReuseTargetSchema>

// ── REX PERTE — l'objet, champ pour champ ────────────────────────────────────

const rexBodyShape = {
  project_id: z.string().guid(),
  account_id: z.string().guid().nullable(),
  perimeter: z.string().trim().max(2000).nullable(),
  need: z.string().trim().max(2000).nullable(),
  people_involved: z.string().trim().max(2000).nullable(),
  real_decider: z.string().trim().max(500).nullable(),
  sponsor: z.string().trim().max(500).nullable(),
  route_used: z.string().trim().max(2000).nullable(),
  proof_used: z.string().trim().max(2000).nullable(),
  angle_tried: z.string().trim().max(2000).nullable(),
  angles_not_tried: z.array(z.string().trim().min(1).max(500)).max(20),
  last_action: nullableEvidencedClaimSchema,
  declared_motif: lostDealMotifSchema.nullable(),
  declared_motif_note: nullableEvidencedClaimSchema,
  suspected_motif: lostDealMotifSchema.nullable(),
  suspected_motif_note: nullableEvidencedClaimSchema,
  competitor: z.string().trim().max(500).nullable(),
  timing: z.string().trim().max(500).nullable(),
  cycle_days: z.number().int().nonnegative().nullable(),
  procurement_friction: z.string().trim().max(2000).nullable(),
  consultant_gap: z.string().trim().max(2000).nullable(),
  economics: z.string().trim().max(2000).nullable(),
  what_team_knows_now: nullableEvidencedClaimSchema,
  /** Date ISO (yyyy-mm-dd) — `null` = pas de date de revisite fixée. */
  revisit_on: z.string().trim().min(1).nullable(),
  reuse_targets: z.array(lostDealRexReuseTargetSchema),
}

export const lostDealRexSchema = z.object({
  id: z.string().guid(),
  workspace_id: z.string().guid(),
  created_by: z.string().guid(),
  created_at: z.string(),
  ...rexBodyShape,
})
export type LostDealRex = z.infer<typeof lostDealRexSchema>

/** Corps de `POST /capitalisation/lost-deal-rex` — ni `id`, ni `workspace_id`,
 *  ni `created_by`/`created_at` : posés par le serveur, jamais par le client. */
export const createLostDealRexSchema = z.object(rexBodyShape)
export type CreateLostDealRex = z.infer<typeof createLostDealRexSchema>
