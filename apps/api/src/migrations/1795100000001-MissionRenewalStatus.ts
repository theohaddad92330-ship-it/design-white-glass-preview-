import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LE STATUT DE RENOUVELLEMENT D'UNE MISSION (`missions.renewal_status`) —
 * décision de Louis du 16/09/2026, #2195.22 à .29.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE MIGRATION PART SEULE, ET DEVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-11 et GA-12 : une valeur qui voyage du code vers la base voit sa contrainte
 * SQL élargie AVANT le code qui l'écrit. Ce n'est pas une précaution abstraite —
 * `account_vocabulary.kind` l'a payé le 21/07/2026 en dossiers COMPLETS marqués
 * « erreur », et `accounts.status = 'prospect'` le 22/08 en « Impossible
 * d'ajouter ce compte au portefeuille », parce que la contrainte rejetait une
 * valeur que le TypeScript trouvait pourtant légitime.
 *
 * La colonne et sa contrainte arrivent donc dans ce commit ; le service qui
 * l'écrit et l'écran qui la lit arrivent dans les suivants.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES HUIT VALEURS, ET CELLE QUI N'Y EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue demandait « Renouvellement probable ». Il n'est pas là : la doctrine
 * refuse toute PROBABILITÉ affichée (`c26_probabilite`, refusée six fois), et un
 * libellé de tableau se lit hors contexte. Le palier survit sous le FAIT qui le
 * fonde — `reconduction_annoncee`, « Reconduction annoncée par le client ».
 * Règle commune aux huit : un statut nomme un ÉVÉNEMENT qui a eu lieu ou une
 * ÉCHÉANCE qui arrive, jamais une chance.
 *
 * L'ordre est celui de `RENEWAL_STATUSES` (`packages/contracts/src/schemas/
 * mission.ts`) et il est gelé (GA-08). La correspondance
 * `missions_renewal_status_check` → `RENEWAL_STATUSES` est inscrite au `MAPPING`
 * de `check-constraints-cover-enums.spec.ts` : ajouter une neuvième valeur en
 * TypeScript sans élargir cette contrainte fait rougir la CI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NULLABLE, ET `NULL` N'EST PAS `non_engage`
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun défaut n'est posé, et c'est la règle « non mesuré n'est pas mesuré à
 * zéro » appliquée à une énumération. `NULL` veut dire « personne n'a encore
 * ouvert cette ligne » ; `non_engage` veut dire « quelqu'un l'a ouverte et a
 * constaté que rien n'était engagé ». Un `DEFAULT 'non_engage'` aurait affirmé,
 * sur les milliers de missions déjà en base, un constat que personne n'a fait —
 * et l'écran ne pourrait plus distinguer ce qu'il reste à regarder de ce qui a
 * été regardé.
 *
 * La contrainte accepte donc explicitement `IS NULL` : c'est la forme qu'une
 * colonne d'énumération nullable prend ici, et GA-12 sait la lire depuis le
 * 22/08/2026.
 *
 * ⚠️ Pas d'index : la colonne ne filtre aucune requête serveur. La liste des
 * renouvellements est déjà bornée au périmètre de l'espace, et le tri comme le
 * filtrage se font sur la liste chargée. Un index ici coûterait une écriture de
 * plus à chaque mise à jour de mission sans servir une seule lecture.
 */
export class MissionRenewalStatus1795100000001 implements MigrationInterface {
  public name = 'MissionRenewalStatus1795100000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS renewal_status text
    `)
    await queryRunner.query(`
      ALTER TABLE missions
        DROP CONSTRAINT IF EXISTS missions_renewal_status_check
    `)
    await queryRunner.query(`
      ALTER TABLE missions
        ADD CONSTRAINT missions_renewal_status_check CHECK (
          renewal_status IS NULL OR renewal_status IN (
            'non_engage',
            'feedback_demande',
            'discussion_en_cours',
            'reconduction_annoncee',
            'renouvele',
            'fin_confirmee',
            'repositionnement_lance',
            'bloque'
          )
        )
    `)
    // QUI a posé le statut, et QUAND. Sans ces deux colonnes, « Feedback
    // demandé » ne dit pas depuis combien de temps on attend — or c'est
    // précisément ce qui décide s'il faut relancer. Et `renewal_status_at` est
    // la seule chose qui permette de rendre « information du 3 mars, à
    // revérifier » plutôt que de laisser un fait périmé passer pour un fait.
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS renewal_status_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS renewal_status_by uuid
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_renewal_status_check`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS renewal_status_by`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS renewal_status_at`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS renewal_status`)
  }
}
