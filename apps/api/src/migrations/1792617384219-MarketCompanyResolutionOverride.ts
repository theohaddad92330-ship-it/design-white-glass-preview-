import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1617.4 — LA DÉCISION HUMAINE SUR UN RAPPROCHEMENT DE MÉMOIRE MARCHÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU, ÉCRIT PAR LE PRODUIT LUI-MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/web/src/features/market-memory/view/MarketReviewQueue.tsx` le disait en
 * toutes lettres avant ce lot :
 *
 *   « "relation corrigée par utilisateur" n'a AUCUN mécanisme dans le produit :
 *     rien n'enregistre qu'un humain a corrigé une observation de mémoire
 *     marché, et la mémoire est PARTAGÉE entre espaces concurrents — une
 *     correction d'un espace ne la réécrit jamais. »
 *
 * Les deux moitiés sont vraies. La résolution se recalculait à chaque lecture,
 * et un humain qui départageait deux « Thales » recommençait le lendemain.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE TABLE EST SCOPÉE, ET PAS PARTAGÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les six tables `market_*` sont PARTAGÉES : un fait de marché est le même pour
 * tout le monde, et le stocker par espace multiplierait 60 067 lignes par
 * client. Celle-ci est l'exception, et le registre des tables avait déjà écrit
 * pourquoi, sur `market_company_signal` :
 *
 *   « une correction d'espace PRIME sur l'observation partagée sans jamais la
 *     réécrire »
 *
 * Elle porte un `account_id` — donc un compte d'UN espace — et l'identité de
 * qui a tranché. Les espaces sont des ESN, donc des concurrents : la décision
 * de l'un ne doit jamais devenir la vérité de l'autre. `workspace_id` est donc
 * NOT NULL et l'unicité le porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA TABLE NE STOCKE PAS, ET C'EST DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * · **L'ÉTAT calculé** (`resolved` / `ambiguous` / `unresolved`). #1617 le
 *   demandait ; il n'entre pas. Cet état est le résultat d'un calcul qui doit
 *   rester VIVANT — le corpus grossit, les alias s'ajoutent. Le figer ici
 *   créerait deux vérités qui divergeraient au premier import, et personne ne
 *   saurait laquelle fait foi. La table porte la DÉCISION, le calcul reste le
 *   calcul, et `applyResolutionOverride` les superpose à la lecture.
 *
 * · **`confidence`** — refusée, et pas par oubli. Une probabilité ne se
 *   persiste pas dans ce dépôt (doctrine `c26_probabilite`, garde GA-64
 *   `no-persisted-probability.spec.ts`, refus prononcé six fois). Et elle
 *   n'aurait rien à mesurer : une décision humaine n'est pas probable, elle est
 *   prise. L'ORDRE de confiance que #1617 demandait (SIREN > registre > domaine
 *   > LinkedIn > nom) est déjà porté par `matchedOn`, qui dit PAR QUEL CÔTÉ le
 *   rapprochement s'est fait — un nom, pas un nombre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORTE « AJOUT SEULEMENT »
 * ─────────────────────────────────────────────────────────────────────────────
 * Création pure : aucune colonne existante n'est touchée, aucune contrainte
 * rétrécie, aucune donnée réécrite. `down()` ne fait tomber que ce que `up()` a
 * créé. Le `CHECK` sur `decision` est posé DÈS LA CRÉATION — la contrainte
 * précède le code qui écrit la valeur (GA-11 / GA-12), jamais l'inverse.
 */
export class MarketCompanyResolutionOverride1792617384219 implements MigrationInterface {
  name = 'MarketCompanyResolutionOverride1792617384219'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS market_company_resolution_override (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id uuid NOT NULL,
        account_id uuid NOT NULL,
        -- La clé du corpus que l'humain a désignée. NULL quand il a dit « ce
        -- n'est pas exact » : il écarte une lecture sans en proposer une autre,
        -- et c'est une réponse complète.
        market_company_key text NULL,
        decision text NOT NULL,
        -- La raison, quand la personne a pris la peine de l'écrire. Jamais
        -- obligatoire : exiger une justification ferait cliquer « autre » à
        -- tout le monde et on n'apprendrait rien.
        note text NULL,
        reviewed_at timestamptz NOT NULL DEFAULT now(),
        reviewed_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // ⚠️ `ADD CONSTRAINT` n'accepte PAS `IF NOT EXISTS` en PostgreSQL, et c'est
    // ce qui a bloqué la production : cette migration a tourné une première
    // fois, puis a été RENOMMÉE — TypeORM l'a donc revue comme neuve et l'a
    // rejouée. `CREATE TABLE IF NOT EXISTS` passait sans bruit, et c'est
    // l'`ADD CONSTRAINT` qui tombait sur « already exists », faisant échouer le
    // démarrage du service entier.
    //
    // La leçon est écrite dans `migrations.spec.ts` et je l'ai apprise à mes
    // dépens : une migration déjà déployée ne se renomme pas. Mais la vraie
    // protection est ici — une migration doit pouvoir REJOUER sans échouer,
    // quelle que soit la raison pour laquelle elle rejoue.
    //
    // Deux valeurs, pas quatre — voir le docbloc : l'état calculé n'entre pas.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'market_company_resolution_override_decision_check'
        ) THEN
          ALTER TABLE market_company_resolution_override
          ADD CONSTRAINT market_company_resolution_override_decision_check
          CHECK (decision IN ('confirmed', 'dismissed'));
        END IF;
      END $$;
    `)

    // Un rattachement confirmé DOIT désigner une entreprise ; un rejet n'en
    // désigne aucune. Sans cette contrainte, un « confirmed » sans clé serait
    // lu comme un rattachement vers rien — exactement le genre de ligne qui
    // fait taire un écran sans que personne ne comprenne pourquoi.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'market_company_resolution_override_key_check'
        ) THEN
          ALTER TABLE market_company_resolution_override
          ADD CONSTRAINT market_company_resolution_override_key_check
          CHECK (
            (decision = 'confirmed' AND market_company_key IS NOT NULL)
            OR (decision = 'dismissed' AND market_company_key IS NULL)
          );
        END IF;
      END $$;
    `)

    // Une décision par compte et par espace. C'est la dernière qui vaut : une
    // correction humaine gagne toujours, y compris sur une correction humaine
    // plus ancienne.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS market_company_resolution_override_unique
      ON market_company_resolution_override (workspace_id, account_id)
    `)

    // La lecture réelle est « toutes les décisions de CET espace », faite une
    // fois par rendu de portefeuille, pas une par compte.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS market_company_resolution_override_workspace_idx
      ON market_company_resolution_override (workspace_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS market_company_resolution_override_workspace_idx`)
    await queryRunner.query(`DROP INDEX IF EXISTS market_company_resolution_override_unique`)
    await queryRunner.query(`DROP TABLE IF EXISTS market_company_resolution_override`)
  }
}
