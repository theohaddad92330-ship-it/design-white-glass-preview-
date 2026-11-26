import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Signaux d'achat dans l'Opportunity Graph (restitution V2 §6).
 *
 * Le graphe portait quatre natures — douleur, chantier, projet, implication —
 * toutes issues des besoins. Le §6 le veut plus large : « compte, besoin,
 * SIGNAL, projet, source, date, confiance ». Un signal n'est pas un besoin
 * (c'est un fait daté et sourcé qui en annonce peut-être un), il entre donc sous
 * sa PROPRE nature : les deux vivent dans le même graphe sans qu'aucun compteur
 * de besoins soit gonflé par des signaux.
 *
 * Rattrapage du stock existant, avec la MÊME projection déterministe que
 * `ProjectsService.materialize` (lane 4) : libellé sous ses quatre clés
 * historiques, vraie source conservée, confiance dérivée de la règle déjà en
 * vigueur côté Veille (sans source, pas de preuve). `ON CONFLICT DO NOTHING`
 * ⇒ re-run sûr, aucun doublon, aucun cycle de vie écrasé.
 */
export class OpportunitySignals1788245117903 implements MigrationInterface {
  name = 'OpportunitySignals1788245117903'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO opportunities (workspace_id, account_id, kind, label, detail, source, confidence)
      SELECT a.workspace_id, a.id, 'signal',
             NULLIF(btrim(COALESCE(s->>'title', s->>'label', s->>'description', s->>'signal')), ''),
             NULLIF(btrim(COALESCE(s->>'salesImplication', s->>'sales_implication')), ''),
             COALESCE(NULLIF(btrim(s->>'source'), ''), 'signal'),
             CASE WHEN NULLIF(btrim(s->>'source'), '') IS NULL THEN 'low' ELSE 'medium' END
      FROM accounts a
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.recent_signals, '[]'::jsonb)) AS s
      WHERE a.status <> 'deleted'
        AND jsonb_typeof(a.recent_signals) = 'array'
        AND NULLIF(btrim(COALESCE(s->>'title', s->>'label', s->>'description', s->>'signal')), '') IS NOT NULL
      ON CONFLICT (account_id, kind, md5(label)) DO NOTHING
    `)
  }

  /** Convention du dépôt : les migrations sont additives et forward-only. */
  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
