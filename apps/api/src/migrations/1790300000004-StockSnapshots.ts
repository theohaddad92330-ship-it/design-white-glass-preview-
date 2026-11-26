import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La photo mensuelle des indicateurs de STOCK (D2 · 26/08, D49 · 26/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE TABLE, ALORS QUE LE RESTE SE RECALCULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Presque tous les chiffres du produit sont des FLUX : ils comptent des lignes
 * datées, et « le mois dernier » se retrouve en déplaçant une borne. Le motif
 * canonique est `ManagerService.monthlyTrend` — même requête, même table, même
 * `WHERE`, seule la fenêtre du `FILTER` change. Pour ceux-là, une photo serait
 * une seconde vérité, c'est-à-dire un second chiffre qui finit par contredire
 * le premier.
 *
 * Neuf indicateurs ne sont pas des flux. Ce sont des états courants portés par
 * des colonnes que la mise à jour ÉCRASE : `consultants.availability`,
 * `accounts.commercial_status`, `contacts.email`, `missions.ends_on`… Il n'y a
 * pas de « borne à déplacer » : l'information d'il y a un mois n'existe plus
 * nulle part. Sans photo, l'écran ne peut RIEN dire de leur évolution — et
 * c'est bien ce qu'il disait jusqu'ici : rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME, ET CE QUE CHAQUE COLONNE TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le précédent du dépôt est `territory_snapshots` et son `UNIQUE (department,
 * taken_on)`. Trois différences, chacune délibérée :
 *
 *  · `workspace_id` — le vivier d'une ESN n'est PAS un fait de marché : deux
 *    espaces sont deux concurrents, et le nombre de leurs clients actifs ne se
 *    mélange sous aucun prétexte. `territory_snapshots` s'en passe pour la
 *    raison inverse, écrite dans sa propre migration.
 *  · une ligne par (espace, mois, INDICATEUR) plutôt qu'une ligne large — la
 *    liste des indicateurs photographiés bougera, et une colonne par
 *    indicateur ferait d'un ajout une migration de schéma. Un `metric_key`
 *    contraint garde la même sûreté sans la rigidité.
 *  · `value integer NOT NULL` — **une valeur non lue ne s'écrit pas**. Il n'y a
 *    donc pas de ligne à `NULL` : l'absence de ligne EST « on ne sait pas », et
 *    elle ne peut pas se recopier en zéro par étourderie. C'est la traduction
 *    en SQL de « non mesuré n'est jamais mesuré à zéro » (GA-18/GA-19). Les
 *    neuf indicateurs sont des DÉNOMBREMENTS, d'où `integer` et non `numeric`.
 *
 * `taken_on` porte le DERNIER jour du mois photographié, jamais le 1er du mois
 * suivant : pendant tout le mois de mars, l'écran compare la valeur du jour à
 * celle du 28 février, et c'est exactement ce que « vs mois précédent » veut
 * dire. Le balayage tourne le 1er à 03:00 et date sa ligne de la veille.
 *
 * ⚠️ L'`UNIQUE` n'est pas un ornement : c'est LUI qui rend le balayage
 * idempotent. Deux exécutions le même mois écrivent le même triplet, la
 * seconde ne fait rien (`ON CONFLICT DO NOTHING`), et la première photo — celle
 * prise au plus près de la fin du mois — reste. Une intention dans le code ne
 * tiendrait pas contre deux replicas qui démarrent à la même seconde.
 *
 * ⚠️ La contrainte `CHECK` est déclarée AVANT tout code qui écrit (GA-11/GA-12),
 * et elle couvre exactement `STOCK_METRIC_KEYS`. Une clé ajoutée au TypeScript
 * sans élargir la contrainte produirait une violation avalée dans un `catch`,
 * donc une photo qui manque sans que personne ne le sache.
 */
export class StockSnapshots1790300000004 implements MigrationInterface {
  name = 'StockSnapshots1790300000004'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS stock_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        taken_on date NOT NULL,
        metric_key text NOT NULL,
        value integer NOT NULL,
        provenance text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT stock_snapshots_metric_key_check CHECK (metric_key IN (
          'benchAvailable',
          'activeClients',
          'accounts_without_next_action',
          'contacts_without_email',
          'projects_without_amount',
          'missions_without_end_date',
          'needs_without_skills',
          'talents_unknown_availability',
          'missions_without_cost'
        ))
      )
    `)
    // Une photo par espace, par mois et par indicateur. C'est cette contrainte,
    // et elle seule, qui empêche deux exécutions du même mois de créer deux
    // points — une intention dans le code ne survit pas à deux replicas.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS stock_snapshots_unique
         ON stock_snapshots (workspace_id, taken_on, metric_key)`,
    )
    // La lecture de l'écran : « la photo du mois précédent, pour cet espace ».
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS stock_snapshots_lookup_idx
         ON stock_snapshots (workspace_id, taken_on DESC)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS stock_snapshots`)
  }
}
