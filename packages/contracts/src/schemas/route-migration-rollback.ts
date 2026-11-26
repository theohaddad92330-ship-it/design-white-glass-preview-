import { z } from 'zod'
import {
  ROUTE_MIGRATION_REGISTRY,
  routeMigrationKeySchema,
  type RouteMigrationKey,
} from './route-migration-registry.js'

/**
 * Le rollback de déploiement — #2154.7.
 *
 * #2154 (section FEATURE FLAGS) demande un déploiement PROGRESSIF en cinq
 * étapes — nouvelle navigation, nouvelles redirections, nouvelles maisons
 * canoniques, suppression des anciens onglets, nettoyage du code — « permettre
 * rollback ». Aucun fichier ne portait ces étapes avant ce commit.
 *
 * Ce que ce fichier livre N'EST PAS un moteur de feature flags vivant (jours de
 * travail, cité par #2958 comme hors de portée d'un lot) : c'est l'OUTILLAGE —
 * pour chacune des vingt-et-une routes du registre #2154.3/#2208, l'étape RÉELLEMENT
 * atteinte (pas déclarée à la main : calculée depuis {@link ROUTE_MIGRATION_REGISTRY},
 * seule source, GA-26) et l'action concrète qui annulerait la migration de
 * cette route précise si elle devait être défaite.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI L'ÉTAPE 5 N'EST JAMAIS ATTEINTE
 * ─────────────────────────────────────────────────────────────────────────
 * « On archive, on ne supprime pas » (CLAUDE.md § Doctrine) : un fichier de
 * redirection reste indéfiniment, il ne se retire jamais du dépôt. L'étape 5
 * (nettoyage du code) est donc bloquée PAR DOCTRINE pour les vingt-et-une routes,
 * pas par un oubli — {@link STAGE_5_DOCTRINE_BLOCK} le nomme une fois, à
 * l'endroit qui décide, plutôt que dans chaque entrée.
 */

export const MIGRATION_STAGES = [
  'nouvelle_navigation',
  'nouvelles_redirections',
  'nouvelles_maisons_canoniques',
  'suppression_anciens_onglets',
  'nettoyage_code',
] as const
export const migrationStageSchema = z.enum(MIGRATION_STAGES)
export type MigrationStage = (typeof MIGRATION_STAGES)[number]

export const STAGE_5_DOCTRINE_BLOCK =
  "« on archive, on ne supprime pas » (CLAUDE.md § Doctrine) — un fichier de redirection reste indéfiniment servi, il ne se retire jamais. L'étape 5 (nettoyage du code) n'est donc jamais atteinte pour une route migrée par redirection, par choix documenté, pas par retard."

export const routeMigrationRollbackEntrySchema = z.object({
  key: routeMigrationKeySchema,
  sourceIssue: z.literal('#2154.7'),
  /** `null` : aucune migration prouvée pour cette route (voir le registre), donc
   *  aucune étape n'est atteignable. */
  stageReached: migrationStageSchema.nullable(),
  /** Ce qui prouve l'étape — jamais une affirmation à vide. */
  evidence: z.string().min(1),
  /** Le fichier à modifier pour défaire CETTE migration précise. `null` quand
   *  aucun rollback n'a de sens (rien n'a été prouvé migré). */
  rollbackHolderFile: z.string().min(1).nullable(),
  /** L'action concrète, jamais un renvoi vers un mécanisme qui n'existe pas. */
  rollbackAction: z.string().min(1),
  canRollback: z.boolean(),
})
export type RouteMigrationRollbackEntry = z.infer<typeof routeMigrationRollbackEntrySchema>

function buildEntry(key: RouteMigrationKey): RouteMigrationRollbackEntry {
  const source = ROUTE_MIGRATION_REGISTRY.find(entry => entry.key === key)
  if (!source) throw new Error(`route-migration-rollback: clé inconnue du registre — ${key}`)

  // #4359 — `removed` : la route a été retirée par un commit ; la défaire = revert de ce commit.
  if (source.targetStatus === 'removed') {
    return {
      key,
      sourceIssue: '#2154.7',
      stageReached: 'suppression_anciens_onglets',
      evidence: `\`${source.currentRoute}\` n'a plus de fichier de route ni de ligne dans \`lib/legacy-addresses.ts\` (#4359, registre #2154.3) : la page « introuvable » répond.`,
      rollbackHolderFile: null,
      rollbackAction: `Recréer le fichier de route de \`${source.currentRoute}\` avec \`git revert\` du commit #4359, ou ajouter une ligne \`'${source.currentRoute}': '${source.newDestination}'\` à \`apps/web/src/lib/legacy-addresses.ts\` (une table, pas un fichier de route).`,
      canRollback: false,
    }
  }
  if (source.targetStatus !== 'redirected') {
    return {
      key,
      sourceIssue: '#2154.7',
      stageReached: null,
      evidence: `Aucune migration prouvée par le registre #2154.3 (\`targetStatus: '${source.targetStatus}'\`) : ${source.gap}`,
      rollbackHolderFile: null,
      rollbackAction: "Rien à défaire — aucune étape de migration n'est prouvée pour cette route.",
      canRollback: false,
    }
  }

  // Les sept routes `redirected` ont toutes une nouvelle destination
  // DIFFÉRENTE de la route actuelle (vérifié par le test) : elles ont donc
  // atteint l'étape 3 (nouvelles maisons canoniques), pas seulement l'étape 2.
  // Le test programmatique vérifie ensuite qu'aucune des vingt-et-une routes
  // actuelles n'apparaît plus dans la navigation active
  // (`components/navigation/sections.ts`) pour faire monter l'étape à 4.
  return {
    key,
    sourceIssue: '#2154.7',
    stageReached: 'suppression_anciens_onglets',
    evidence: `Redirection vérifiée vers une destination différente (\`${source.newDestination}\` ≠ \`${source.currentRoute}\`, registre #2154.3) — étape 3 atteinte. \`${source.currentRoute}\` n'apparaît plus dans \`components/navigation/sections.ts\` (vérifié par le test) — étape 4 atteinte.`,
    rollbackHolderFile: source.holderFile,
    rollbackAction:
      source.holderFile === 'apps/web/src/lib/legacy-addresses.ts'
        ? `Retirer la ligne \`'${source.currentRoute}': '${source.newDestination}'\` de \`${source.holderFile}\` (#4359) et recréer le fichier de route d'origine — la table est le SEUL appelant de cette adresse, donc un changement à un seul endroit.`
        : `Modifier le \`beforeLoad\` de \`${source.holderFile}\` : remplacer le \`throw redirect({ to: '${source.newDestination}' })\` par le rendu de l'écran d'origine — c'est le SEUL appelant de cette route (fichier dédié, sans autre logique), donc un changement à un seul endroit.`,
    canRollback: true,
  }
}

export const ROUTE_MIGRATION_ROLLBACK: readonly RouteMigrationRollbackEntry[] = ROUTE_MIGRATION_REGISTRY.map(entry =>
  buildEntry(entry.key),
)

export function rollbackableRoutes(): RouteMigrationRollbackEntry[] {
  return ROUTE_MIGRATION_ROLLBACK.filter(entry => entry.canRollback)
}
