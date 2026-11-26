import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2948 (#2329.45-.51) — ACCORD À 7 CONDITIONS avant présentation, tranche
 * TJM validé + CV validé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI SEULEMENT 2 DES 5 CONDITIONS RESTANTES
 * ─────────────────────────────────────────────────────────────────────────────
 * Sur les 7 conditions de l'accord (disponibilité confirmée, mission comprise,
 * TJM/conditions validées, intérêt réel, compte autorisé, autres processus
 * connus, CV validé/règles d'usage acceptées), DEUX étaient déjà gatées avant
 * ce lot (disponibilité, compte autorisé). Ce lot en ajoute TROIS de plus,
 * mais seulement DEUX portent une colonne : `tjm_validated_at`,
 * `cv_validated_at`. La troisième — « autres processus connus » — ne prend
 * PAS de colonne : elle se LIT sur `consultants.process_other_interviews`
 * (#2329.32, non NULL = la question a été posée), qui existe déjà. Une
 * colonne de plus dupliquerait le même fait sous un autre nom (GA-26).
 *
 * « Mission comprise » et « intérêt réel » (#2329.46/.48) restent HORS de ce
 * lot : ce sont des faits PAR OPPORTUNITÉ (un consultant peut comprendre la
 * mission A sans connaître la mission B), pas des faits globaux sur la
 * personne — les modéliser correctement suppose une table liée au besoin, pas
 * une colonne sur `consultants`. Le bilan du 26/09 avait déjà écarté de les
 * brancher sur `submission_consultant_feedback` (un retour RÉTROSPECTIF,
 * post-positionnement) précisément parce que #2329.52 interdit de relire un
 * retour comme un accord PRÉALABLE — construire la bonne table est un
 * chantier séparé, pas une colonne ajoutée à l'aveugle en fin de nuit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN GESTE, JAMAIS UNE DÉDUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `null` = jamais confirmé. Écrit UNIQUEMENT par une action explicite du
 * commercial (`ConsultantsService.confirmTjmValidated`/`confirmCvValidated`),
 * jamais déduit d'un autre champ — même doctrine que
 * `availability_checked_at`/#2185.48.
 */
export class ConsultantPositioningAgreement20260927181300 implements MigrationInterface {
  name = 'ConsultantPositioningAgreement20260927181300'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        ADD COLUMN IF NOT EXISTS tjm_validated_at timestamptz NULL,
        ADD COLUMN IF NOT EXISTS cv_validated_at timestamptz NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE consultants
        DROP COLUMN IF EXISTS cv_validated_at,
        DROP COLUMN IF EXISTS tjm_validated_at
    `)
  }
}
