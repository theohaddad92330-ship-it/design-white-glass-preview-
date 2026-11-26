import type { QueryRunner } from 'typeorm'
import { UserFavorites1790300000003 } from '../1790300000003-UserFavorites'

/** Capture chaque instruction SQL émise (aucune base réelle n'est nécessaire). */
function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function ranQueries(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new UserFavorites1790300000003().up(runner)
  return queries.map(normalize)
}

describe('UserFavorites1790300000003', () => {
  it('crée user_favorites de façon idempotente, clé PERSONNELLE en tête', async () => {
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS user_favorites'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE')
    expect(create).toContain('entity_type text NOT NULL')
    expect(create).toContain('entity_id uuid NOT NULL')
    expect(create).toContain('created_at timestamptz NOT NULL DEFAULT now()')
    // La clé primaire commence par `user_id` : c'est ce qui rend le favori
    // personnel dans la STRUCTURE et pas seulement dans les requêtes.
    expect(create).toContain('PRIMARY KEY (user_id, entity_type, entity_id)')
  })

  it('ne porte AUCUN workspace_id — un favori n’est pas une veille', async () => {
    // La veille (`watchlist_rules`) est unique par `(workspace_id, kind, value)` :
    // deux commerciaux d'une même ESN partagent une règle. Un favori, non. Si
    // cette colonne apparaissait un jour, le favori deviendrait visible de
    // l'équipe sans que personne ne l'ait décidé.
    const create = (await ranQueries()).find(q => q.includes('CREATE TABLE IF NOT EXISTS user_favorites'))
    expect(create).not.toContain('workspace_id')
  })

  it('nomme la contrainte d’énumération et la fait couvrir le contrat TypeScript DE L’ÉPOQUE', async () => {
    const flat = await ranQueries()
    const check = flat.find(q => q.includes('user_favorites_entity_type_check') && q.includes('ADD CONSTRAINT'))
    expect(check).toBeDefined()
    // ⚠️ 31/08/2026 — CETTE migration est un instantané figé : elle teste ce
    // que SA PROPRE requête `up()` a réellement posé, `('contact', 'account')`,
    // pas l'état COURANT de `FAVORITE_ENTITY_TYPES` (qui porte maintenant
    // `talent`, ajouté par `1790973000002-TalentFavorites`). Importer
    // l'énumération vivante ici ferait échouer ce test à chaque valeur future
    // ajoutée EN FIN — exactement l'additivité que GA-08 encourage — alors que
    // la couverture COURANTE de la contrainte est le travail de GA-12
    // (`check-constraints-cover-enums.spec.ts`), qui lit la DERNIÈRE migration
    // déclarant `user_favorites_entity_type_check`, pas celle-ci.
    expect(check).toContain("'contact'")
    expect(check).toContain("'account'")
    // Et elle est DÉPOSÉE avant d'être posée : sans ça, une seconde exécution
    // de la migration échoue sur « constraint already exists ».
    expect(flat).toContain('ALTER TABLE user_favorites DROP CONSTRAINT IF EXISTS user_favorites_entity_type_check')
  })

  it('REPREND les favoris de contact existants, sans écraser leur date', async () => {
    // C'est ce qui distingue une MIGRATION d'un second système posé à côté. Sans
    // ce report, l'étoile resterait allumée sur la fiche contact et « Mes
    // favoris » s'ouvrirait vide — deux favoris qui ne se voient pas.
    const backfill = (await ranQueries()).find(q => q.includes('INSERT INTO user_favorites'))
    expect(backfill).toBeDefined()
    expect(backfill).toContain("SELECT f.user_id, 'contact', f.contact_id, f.created_at")
    expect(backfill).toContain('FROM user_contact_favorites f')
    expect(backfill).toContain('ON CONFLICT (user_id, entity_type, entity_id) DO NOTHING')
    // Conditionné à l'existence de la table historique : une base neuve passe.
    expect(backfill).toContain("to_regclass('public.user_contact_favorites') IS NOT NULL")
  })

  it('active la RLS possédée par l’utilisateur, comme les autres tables métier', async () => {
    const flat = await ranQueries()
    expect(flat).toContain('ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY')
    const policy = flat.find(q => q.includes('CREATE POLICY') && q.includes('user_favorites'))
    expect(policy).toBeDefined()
    expect(policy).toContain('auth.uid() = user_id')
  })

  it('pose l’index de lecture par objet', async () => {
    const index = (await ranQueries()).find(q => q.includes('user_favorites_entity_idx'))
    expect(index).toBeDefined()
    expect(index).toContain('ON user_favorites (entity_type, entity_id)')
  })

  it('down() ne jette QUE la table neuve — les favoris de contact survivent', async () => {
    const { runner, queries } = createRunner()
    await new UserFavorites1790300000003().down(runner)
    expect(queries.map(normalize)).toEqual(['DROP TABLE IF EXISTS user_favorites'])
  })
})
