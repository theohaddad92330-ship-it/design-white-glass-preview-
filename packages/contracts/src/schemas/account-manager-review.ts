import { z } from 'zod'
import { accountChangeDigestSchema } from './account-refresh-triggers.js'

/**
 * #2319.112-.116 (section G, épopée #2985) — la revue de compte MANAGER n'est
 * pas un deuxième dossier (CLAUDE.md § Doctrine) : chaque champ ci-dessous
 * RÉUTILISE une lecture qui existe déjà ailleurs dans le produit — le tiroir
 * « ce qui a changé » de la fiche compte (`AccountsService.changeDigest`), le
 * plan d'action de l'onglet Plan (`ActionPlanItemsService.listForAccount`) et
 * les risques saisis sur les affaires de l'onglet Projets (`projects.risks`).
 * Aucun second calcul, aucune donnée inventée.
 *
 * #2985 (01/10) — tranché sans Louis : le verdict est un STATUT fermé avec
 * raisons comptées (jamais une probabilité), la couverture résume la carte
 * existante, les faits importants sont les signaux `high` actifs de la Veille,
 * la décision demandée est une action préparée en attente de geste. L'arbitrage
 * d'owner/ressource (lot X60, 02/10) se LIT sur les porteurs déjà saisis — voir
 * `accountManagerReviewArbitrationSchema`.
 */
export const accountManagerReviewActionSchema = z.object({
  id: z.string().guid(),
  label: z.string(),
  /** Le nom de l'objet visé (opportunité, besoin, mission…), ou `null` sur une action ancienne sans cible. */
  targetLabel: z.string().nullable(),
  /** Le responsable saisi à la main sur l'action, ou `null` si non renseigné. */
  ownerName: z.string().nullable(),
})

export const accountManagerReviewCompletedActionSchema = accountManagerReviewActionSchema.extend({
  /** `null` sur une ligne marquée faite avant que la date de complétion soit enregistrée. */
  completedAt: z.string().nullable(),
})
export type AccountManagerReviewCompletedAction = z.infer<typeof accountManagerReviewCompletedActionSchema>

export const accountManagerReviewStalledActionSchema = accountManagerReviewActionSchema.extend({
  /** L'échéance dépassée (`YYYY-MM-DD`) — toujours renseignée : c'est ce qui rend l'action "non avancée". */
  dueDate: z.string(),
})
export type AccountManagerReviewStalledAction = z.infer<typeof accountManagerReviewStalledActionSchema>

/** Un risque tel qu'écrit sur une affaire du compte (`PATCH /projects/:id/risks`) — jamais deviné. */
export const accountManagerReviewRiskSchema = z.object({
  projectId: z.string().guid(),
  projectLabel: z.string(),
  risks: z.string(),
})
export type AccountManagerReviewRisk = z.infer<typeof accountManagerReviewRiskSchema>

/**
 * #2985 — LE VERDICT, sans probabilité. Un statut d'un vocabulaire FERMÉ
 * (jamais un pourcentage : « chance de closing » est refusée, CLAUDE.md §
 * Doctrine) et ses RAISONS — chacune un décompte nommé, jamais un score nu.
 * Les axes qu'on n'a pas pu lire sortent du verdict et sont NOMMÉS dans
 * `notEvaluated` (GA-18/GA-19) ; sans aucun axe lu, le statut est
 * `not_evaluable`, jamais « stable ».
 */
export const accountManagerReviewVerdictStatusSchema = z.enum(['attention', 'stable', 'not_evaluable'])
export const accountManagerReviewVerdictReasonKindSchema = z.enum([
  'stalled_actions',
  'risks',
  'coverage_gaps',
  'decisions_pending',
  'arbitrations_pending',
])
export const accountManagerReviewVerdictAxisSchema = z.enum(['coverage', 'plan', 'change_digest', 'signals'])
export const accountManagerReviewVerdictSchema = z
  .object({
    status: accountManagerReviewVerdictStatusSchema,
    /** Une raison par axe qui pèse — jamais une raison à zéro (une absence ne fait aucune ligne). */
    reasons: z.array(
      z.object({ kind: accountManagerReviewVerdictReasonKindSchema, count: z.number().int().min(1) }).strict(),
    ),
    notEvaluated: z.array(accountManagerReviewVerdictAxisSchema),
  })
  .strict()
export type AccountManagerReviewVerdict = z.infer<typeof accountManagerReviewVerdictSchema>

/** Les manques de la carte de couverture du compte — la MÊME lecture que `get_account_coverage_map`, résumée. */
export const accountManagerReviewCoverageSchema = z.object({
  gapCount: z.number().int().min(0),
  gaps: z.array(z.object({ label: z.string(), reason: z.string() })),
})

/** Un signal que la Veille classe `high` et qui est encore actif — jamais un classement inventé ici. */
export const accountManagerReviewImportantFactSchema = z.object({
  label: z.string(),
  date: z.string().nullable(),
})

/**
 * #2319 (arbitrage owner/ressource, lot X60) — UN conflit de porteur, lu sur
 * des champs RÉELS : un consultant dont le référent commercial (`consultants.
 * owner_user_id`) n'est pas le porteur de l'affaire (`opportunities.owner_id`)
 * est positionné (`submissions`, non clos) sur un besoin de cette affaire.
 * Les DEUX porteurs doivent être connus et nommés : un porteur absent ne fait
 * aucune ligne (on n'affiche pas ce qu'on n'a pas). Un arbitrage se PROPOSE à
 * un humain — rien n'est réattribué ici.
 */
export const accountManagerReviewArbitrationSchema = z
  .object({
    projectId: z.string().guid(),
    projectLabel: z.string(),
    needTitle: z.string().nullable(),
    consultantId: z.string().guid(),
    consultantName: z.string(),
    accountOwnerName: z.string().min(1),
    resourceOwnerName: z.string().min(1),
  })
  .strict()
export type AccountManagerReviewArbitration = z.infer<typeof accountManagerReviewArbitrationSchema>

export const accountManagerReviewSchema = z.object({
  accountId: z.string().guid(),
  /** Le nom du compte, déjà chargé par le contrôleur pour vérifier l'accès — aucune seconde requête. */
  accountName: z.string().min(1),
  generatedAt: z.string(),
  /** `null` = pas de version antérieure à comparer (même sémantique que `AccountsService.changeDigest`). */
  changeDigest: accountChangeDigestSchema.nullable(),
  actionsCompleted: z.array(accountManagerReviewCompletedActionSchema),
  actionsStalled: z.array(accountManagerReviewStalledActionSchema),
  risks: z.array(accountManagerReviewRiskSchema),
  verdict: accountManagerReviewVerdictSchema,
  /** `null` = la carte de couverture n'a pas pu être lue (nommé dans `verdict.notEvaluated`), jamais « aucun manque ». */
  coverage: accountManagerReviewCoverageSchema.nullable(),
  importantFacts: z.array(accountManagerReviewImportantFactSchema),
  /**
   * Les actions PRÉPARÉES (`execution_status: 'prepared'`) qui attendent un
   * geste humain : la seule décision EN ATTENTE qui ait une source réelle.
   * Laura prépare, le commercial/manager décide — rien n'est envoyé.
   */
  decisionsRequested: z.array(accountManagerReviewActionSchema),
  /** Les conflits porteur-de-l'affaire / porteur-de-la-ressource (voir le schéma) ; vide = aucun conflit connu. */
  arbitrationsRequested: z.array(accountManagerReviewArbitrationSchema),
})
export type AccountManagerReview = z.infer<typeof accountManagerReviewSchema>
