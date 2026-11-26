import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * GA-12 — `telephonyProviderSchema` (`@bellum/contracts`) déclare désormais
 * `'allo'` en plus de `'aircall'`/`'ringover'`, mais la contrainte SQL posée
 * par `TelephonyConnections1788900000002` n'acceptait que les deux premiers.
 * Une connexion Allo aurait levé une violation de contrainte au premier
 * geste — souvent avalée dans un try/catch, donc invisible autrement que par
 * une erreur générique.
 *
 * La contrainte est élargie AVANT le code qui écrit la valeur (GA-11 / GA-12),
 * en ajout seulement et en FIN de liste (GA-08) : aucune ligne existante ne
 * change de sens, aucune ne devient invalide.
 */
export class TelephonyConnectionsAlloProvider1796349966697 implements MigrationInterface {
  public name = 'TelephonyConnectionsAlloProvider1796349966697'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE telephony_connections DROP CONSTRAINT IF EXISTS telephony_connections_provider_check`,
    )
    await queryRunner.query(
      `ALTER TABLE telephony_connections ADD CONSTRAINT telephony_connections_provider_check
         CHECK (provider IN ('aircall', 'ringover', 'allo'))`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
