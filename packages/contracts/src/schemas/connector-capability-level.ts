import { z } from 'zod'

/**
 * #2383.1 — LES SEPT NIVEAUX DE CAPACITÉ D'UN CONNECTEUR (LAU-FINAL-097).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE ÉCHELLE RÉPOND, ET CE QU'ELLE NE RÉPOND PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle répond à UNE seule question : jusqu'où CE GESTE, sur CE connecteur, est
 * TECHNIQUEMENT capable d'aller — une lecture, une préparation, une écriture
 * confirmée, une automatisation bornée. Elle ne répond à aucune des questions
 * que le dépôt pose déjà ailleurs, et ce n'est PAS un quatrième modèle
 * d'autorisation qui s'ajoute par-dessus (GA-26) :
 *
 *   `AutomationLevel` (N0-N5, `action-os.ts`) — ce que la POLITIQUE exige :
 *       qui doit dire oui avant qu'un effet parte, pour un PAS de workflow.
 *   `UserAutonomyBand` (A0-A3, `action-os.ts`) — le même sujet, DIT à
 *       l'utilisateur en quatre bandes.
 *   `CopilotActionLevel` (respond_only/prepare/execute/automate, #2449,
 *       `copilot-action-gate.ts` — pas encore fusionné à l'écriture de ce
 *       fichier) — jusqu'où l'utilisateur a MANDATÉ le copilote pour un
 *       travail donné.
 *
 * Ces trois échelles répondent à « qui autorise, et jusqu'où ». Celle-ci
 * répond à une question antérieure et différente : « ce connecteur PEUT-IL
 * seulement le faire ? ». Un connecteur au niveau 1 (lecture seule) reste au
 * niveau 1 quel que soit le mandat que l'utilisateur donnerait au copilote —
 * aucun mandat n'invente une capacité que l'intégration ne porte pas. C'est
 * la distinction que #2383 pose : la première dit ce qu'un connecteur SAIT
 * faire, les trois autres disent ce que l'espace ou l'utilisateur AUTORISENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ÉCHELLE, DU PLUS INERTE AU PLUS AUTONOME
 * ─────────────────────────────────────────────────────────────────────────────
 * Déclarée PAR ACTION (`CapabilityDeclaration.level`,
 * `apps/api/.../tool-registry/tool-capabilities.ts`), jamais par connecteur :
 * Gmail lit à L1 et prépare un brouillon à L2, ce n'est pas la même capacité.
 */
export const connectorCapabilityLevelSchema = z.enum([
  /** Non relié, ou portée absente : aucune capacité de ce connecteur n'est exerçable. */
  'l0_disconnected',
  /** Lit ou cherche, sans écrire nulle part (`read`, `search`, `summarize`). */
  'l1_consult',
  /** Prépare un objet, sans qu'il quitte encore le connecteur (`prepare`). */
  'l2_prepare',
  /** Dépose une notification à SENS UNIQUE, sans dialogue possible (`webhook`). */
  'l3_notify',
  /** Écrit ou planifie chez le fournisseur, un geste CONFIRMÉ à la fois (`create`, `update`, `schedule`). */
  'l4_write_confirmed',
  /** Envoie réellement vers une personne, toujours sur clic explicite (`send`) — jamais automatique. */
  'l5_send_confirmed',
  /**
   * Agit sans confirmation par instance, sous conditions bornées
   * (#2449.26-.31). ⚠️ AUCUNE capacité déclarée aujourd'hui n'atteint ce
   * niveau (2383.11, à trancher) : la doctrine « le copilote n'envoie jamais
   * seul » interdit qu'une capacité `send` porte ce niveau, et rien d'autre
   * dans la table n'a encore été jugé assez borné pour y prétendre.
   */
  'l6_automate',
])
export type ConnectorCapabilityLevel = z.infer<typeof connectorCapabilityLevelSchema>

/** Ordre croissant d'autonomie — sert à comparer deux niveaux sans table ad hoc. */
export const CONNECTOR_CAPABILITY_LEVEL_ORDER: readonly ConnectorCapabilityLevel[] = [
  'l0_disconnected',
  'l1_consult',
  'l2_prepare',
  'l3_notify',
  'l4_write_confirmed',
  'l5_send_confirmed',
  'l6_automate',
] as const
