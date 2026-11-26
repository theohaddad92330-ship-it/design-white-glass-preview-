import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `finance_margin_targets` — l'objectif mensuel de marge d'un espace
 * (D7 du 26/08/2026, REFUSÉ ; **rouvert et LEVÉ par Louis le 31/08/2026**).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ, AVANT D'ÉCRIRE UNE LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux recherches, deux formes chacune (`grep -rn` puis `grep -rnE`, pour ne pas
 * conclure d'un faux zéro) sur `apps/api/src`, `apps/web/src` et
 * `packages/contracts/src` :
 *
 *   - `margin_target` / `marginTarget`      → 0 occurrence
 *   - `objectif` en table / `monthly_goal`  → 0 occurrence
 *
 * Le seul voisin est `mission_margin_threshold` (PDF 5, D36) — un **seuil
 * d'ALERTE par mission**, qui répond à « celle-ci mérite-t-elle un coup d'œil ».
 * L'objectif d'ESPACE répond à « où en est le mois ». Deux questions, deux
 * portées, deux tables : les fondre aurait fait servir un seuil d'alerte comme
 * dénominateur d'un taux de réalisation, et une valeur qui gagne un second sens
 * ne peut plus changer sans casser le premier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE LIGNE PAR MOIS, ET NON UNE COLONNE SUR `workspaces`
 * ─────────────────────────────────────────────────────────────────────────────
 * Un objectif ANNUEL rangé sur l'espace se réécrirait à chaque révision, et
 * l'écran de janvier afficherait rétroactivement l'objectif de décembre — le
 * défaut exact que la photo mensuelle (`stock_snapshots`) existe pour éviter.
 * Une ligne par mois est un FAIT daté : elle dit ce qu'on s'était fixé à ce
 * moment-là, et une révision de mars ne réécrit pas le verdict de février.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CONTRAINTES, POSÉES AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `target_percent > 0 AND <= 100` : « objectif : 0 % de marge » n'est pas un
 *    objectif, et il servirait de DÉNOMINATEUR au taux de réalisation. Le
 *    refuser en base est ce qui garantit que `marginAttainment` ne peut jamais
 *    diviser par zéro — la fonction le re-teste, la base le TIENT.
 *  - `month ~ '^[0-9]{4}-[0-9]{2}$'` : le mois est une CLÉ de comparaison. Un
 *    `2026-8` et un `2026-08` seraient deux mois différents pour la base et le
 *    même pour un humain, et l'objectif se dédoublerait en silence.
 *  - une seule ligne par (espace, mois) : un objectif est UN objectif. La saisie
 *    passe par un `ON CONFLICT … DO UPDATE`, donc rééditer remplace au lieu
 *    d'empiler — « une correction humaine gagne toujours ».
 *
 * ⚠️ **Aucune contrainte d'énumération ici, donc aucune entrée dans le `MAPPING`
 * de GA-12** : les deux `CHECK` sont un intervalle numérique et un motif de
 * chaîne, pas une liste de valeurs. La garde lit `CHECK (col IN (…))` et
 * `= ANY (ARRAY[…])` ; ces deux formes-là n'ont pas de contrepartie TypeScript à
 * couvrir, et en inventer une aurait ajouté une taxonomie que rien ne lit.
 * Elles sont en revanche NOMMÉES, ce qu'exige GA-177.
 *
 * `set_by` est un `uuid` NU, sans clé étrangère — comme `mission_adv_records`
 * juste à côté, et pour la même raison : un membre qui quitte l'espace ne doit
 * pas faire échouer le ménage de son compte sur un objectif qu'il a saisi. Un
 * identifiant qui ne résout plus se traite comme un auteur inconnu, pas comme
 * une erreur.
 */
export class FinanceMarginTargets1790982000001 implements MigrationInterface {
  public name = 'FinanceMarginTargets1790982000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance_margin_targets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        month text NOT NULL,
        target_percent numeric(5,2) NOT NULL,
        set_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT finance_margin_targets_percent_check
          CHECK (target_percent > 0 AND target_percent <= 100),
        CONSTRAINT finance_margin_targets_month_check
          CHECK (month ~ '^[0-9]{4}-[0-9]{2}$')
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS finance_margin_targets_workspace_month_idx
        ON finance_margin_targets (workspace_id, month)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance_margin_targets_workspace_month_idx`)
    await queryRunner.query(`DROP TABLE IF EXISTS finance_margin_targets`)
  }
}
