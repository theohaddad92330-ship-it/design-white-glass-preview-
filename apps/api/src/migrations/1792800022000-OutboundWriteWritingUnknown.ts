import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1943.8 — `outbound_write_requests.state` accepte `writing` et `unknown`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * La porte d'écriture CRM (BEL-INT-603) retient une écriture de SYSTÈME (la note
 * d'un appel versée par la téléphonie) jusqu'à ce qu'un humain la valide. Mais
 * `requireApproved` n'avait AUCUN appelant : une demande validée passait
 * `approved` et rien ne partait, jamais.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX ÉTATS DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `writing` — la demande est RÉCLAMÉE avant l'appel au fournisseur, par une
 * transition atomique `approved → writing` : deux validations concurrentes (deux
 * onglets, un double clic) ne produisent qu'une écriture. Aucun des états
 * existants ne dit « en vol » sans mentir : `approved` se réécrirait, `written`
 * affirmerait un succès que personne n'a observé.
 *
 * `unknown` — la requête est PARTIE et la réponse s'est perdue (doctrine « un
 * timeout n'est pas un échec »). `failed` la rendrait rejouable, et une note
 * déposée deux fois dans le CRM d'un client ne se répare pas.
 *
 * Additive : aucune valeur retirée, les deux nouvelles ajoutées EN FIN (GA-08),
 * et la contrainte s'élargit AVANT le code qui écrit ces valeurs (GA-11/GA-12).
 */
export class OutboundWriteWritingUnknown1792800022000 implements MigrationInterface {
  public name = 'OutboundWriteWritingUnknown1792800022000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests
        DROP CONSTRAINT IF EXISTS outbound_write_requests_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests
        ADD CONSTRAINT outbound_write_requests_state_check
        CHECK (state IN ('pending', 'approved', 'rejected', 'expired', 'failed', 'written', 'superseded', 'writing', 'unknown'))
    `)
  }

  /**
   * ⚠️ Le retour arrière ne peut pas rétrécir une colonne qui porte ces valeurs.
   * `unknown` reste le moins faux en `failed` avec sa réponse gardée ; `writing`
   * (une écriture en vol au moment du retour arrière) aussi — jamais `approved`,
   * qui la ferait repartir. Le `down` est là pour être exécutable, pas pour être
   * exécuté.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE outbound_write_requests SET state = 'failed' WHERE state IN ('writing', 'unknown')`)
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests
        DROP CONSTRAINT IF EXISTS outbound_write_requests_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE outbound_write_requests
        ADD CONSTRAINT outbound_write_requests_state_check
        CHECK (state IN ('pending', 'approved', 'rejected', 'expired', 'failed', 'written', 'superseded'))
    `)
  }
}
