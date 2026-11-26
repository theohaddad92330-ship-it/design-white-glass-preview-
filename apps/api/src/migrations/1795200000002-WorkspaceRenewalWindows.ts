import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LES FENÊTRES DE RENOUVELLEMENT D'UN ESPACE
 * (`workspaces.renewal_window_days`) — décision de Louis du 16/09/2026, #2195.8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA COLONNE PORTE, ET CE QU'ELLE NE PORTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une liste ORDONNÉE de bornes en JOURS — `[15, 30, 45, 60]` par défaut, et par
 * exemple `[20, 40, 70, 100]` chez une ESN dont les contrats se négocient plus
 * tôt. Elle ne porte ni `overdue`, ni `imminent`, ni « sans date de fin » : ces
 * trois-là ne se règlent pas, et le troisième est le garde-fou n°3 de la
 * décision — une mission sans échéance n'entre dans aucune fenêtre, et la
 * masquer la ferait disparaître de l'écran qui existe pour la rattraper.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `NULL` = L'ÉCHELLE DU PRODUIT, ET CE N'EST PAS UN DÉFAUT RECOPIÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun `DEFAULT '[15,30,45,60]'` n'est posé : écrire l'échelle du produit sur
 * chaque espace la figerait le jour où elle bouge, et ferait passer pour un
 * CHOIX d'opérateur ce que personne n'a choisi. `NULL` veut dire « cet espace
 * n'a rien réglé », et la valeur se lit alors dans le contrat
 * (`DEFAULT_RENEWAL_WINDOW_DAYS`, `packages/contracts/src/schemas/mission.ts`),
 * où le réglage vit à UN seul endroit (GA-26).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE PART DEVANT LE CODE QUI L'ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-11 / GA-12 : la contrainte SQL s'élargit AVANT le code qui écrit la
 * valeur. La contrainte posée ici est volontairement GROSSIÈRE — un tableau
 * JSON non vide d'au plus quatre entrées. Les trois garde-fous (plancher à
 * quinze jours, bornes strictement croissantes, « sans date de fin »
 * irretirable) sont tenus par `renewalWindowDaysSchema` côté contrat : les
 * écrire deux fois, en SQL et en zod, ferait diverger les deux le jour où l'un
 * bouge. Ce que la base garde, c'est la FORME ; ce que le contrat garde, c'est
 * la RÈGLE — et le service refuse avant d'écrire.
 *
 * ⚠️ `jsonb` et non `integer[]` : la lecture retombe sur l'échelle du produit
 * quand le contenu est abîmé (`resolveRenewalWindowDays`), ce qui vaut mieux
 * qu'une erreur de pilote sur un tableau Postgres mal formé — l'écran des
 * renouvellements ne doit jamais refuser de s'ouvrir à cause d'un réglage.
 */
export class WorkspaceRenewalWindows1795200000002 implements MigrationInterface {
  public name = 'WorkspaceRenewalWindows1795200000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspaces
        ADD COLUMN IF NOT EXISTS renewal_window_days jsonb
    `)
    await queryRunner.query(`
      ALTER TABLE workspaces
        DROP CONSTRAINT IF EXISTS workspaces_renewal_window_days_shape
    `)
    await queryRunner.query(`
      ALTER TABLE workspaces
        ADD CONSTRAINT workspaces_renewal_window_days_shape CHECK (
          renewal_window_days IS NULL OR (
            jsonb_typeof(renewal_window_days) = 'array'
            AND jsonb_array_length(renewal_window_days) BETWEEN 1 AND 4
          )
        )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS workspaces_renewal_window_days_shape`)
    await queryRunner.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS renewal_window_days`)
  }
}
