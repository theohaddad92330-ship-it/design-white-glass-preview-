import type { PipelineStage } from '@bellum/contracts'

/**
 * GA-07 — LE PORT ÉTROIT, PAS L'IMPORT DIRECT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QU'IL CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré à l'intégration du 10/09/2026 (branche `feat/lot-vague2-2026-09-10`) :
 * `laura-settings-catalog.ts` importait `type { StageSlaRow }` DEPUIS
 * `../crm-core/deal-stage-sla.service` — un import service → service de plus,
 * et `SERVICE_TO_SERVICE_AT_FREEZE` (`module-boundaries.spec.ts`) est un
 * CLIQUET : il ne remonte pas. 254 → 255, un fichier neuf → 124 → 125.
 *
 * L'inversion : ce fichier (côté CONSOMMATEUR, `copilot-bridge/`) déclare
 * l'interface étroite dont ce module a besoin — UNE méthode, `effectiveFor` —
 * et le jeton qui la porte. **Il n'importe RIEN de `crm-core`** : c'est ce qui
 * lui permet d'être un fichier de logique ordinaire (pas un `.module.ts`) sans
 * jamais apparaître dans le compte GA-07. `laura-settings-catalog.ts` et le
 * contrôleur dépendent de CE fichier (`./deal-stage-sla.port`, à l'intérieur de
 * LEUR PROPRE module) — jamais de `../crm-core/deal-stage-sla.service`.
 *
 * Le SEUL endroit qui connaît encore `DealStageSlaService` par son nom est
 * `copilot-bridge.module.ts` — un fichier de MODULE, exclu par construction de
 * la mesure GA-07 (composition, pas logique) — où vit la `useFactory` qui relie
 * ce port à la vraie classe. Voir sa doc.
 *
 * ⚠️ `PipelineStageSlaRow` est RECOPIÉ, jamais importé depuis
 * `deal-stage-sla.service` (`StageSlaRow`) : importer le type recréerait
 * exactement le couplage qu'on vient de retirer, un cran plus haut. Les deux
 * formes doivent rester IDENTIQUES à l'usage — c'est le test qui le vérifie en
 * faisant tourner le VRAI `DealStageSlaService` derrière le port
 * (`copilot-bridge.module.spec.ts`).
 */
export type PipelineStageSlaRow = { stage: PipelineStage; slaDays: number | null; isDefault: boolean }

/** Le port : la SEULE méthode que `copilot-bridge` consomme de
 *  `DealStageSlaService`. Écrire une durée cible reste un geste de l'écran
 *  authentifié (`PUT /pipeline/stage-sla/:stage`) — ce port ne l'expose pas. */
export interface DealStageSlaPort {
  effectiveFor(workspaceId: string): Promise<PipelineStageSlaRow[]>
}

/** Jeton d'injection — un `Symbol`, jamais la classe concrète : rien
 *  n'accroche `copilot-bridge` à `DealStageSlaService` au niveau du TYPE
 *  d'injection, seulement à l'interface `DealStageSlaPort` ci-dessus. */
export const DEAL_STAGE_SLA_PORT = Symbol('DEAL_STAGE_SLA_PORT')
