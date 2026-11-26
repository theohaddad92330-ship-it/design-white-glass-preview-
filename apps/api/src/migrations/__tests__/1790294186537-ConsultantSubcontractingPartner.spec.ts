import type { QueryRunner } from 'typeorm'
import { ConsultantSubcontractingPartner1790294186537 } from '../1790294186537-ConsultantSubcontractingPartner'

/**
 * E-09 — « un sous-traitant porte toujours son partenaire », tenu par la BASE.
 *
 * Le sujet de ces tests est le TEXTE SQL, comme pour les vingt-six autres specs
 * de migration de ce dossier : ce qu'une base réelle en fait a été mesuré à
 * part, sur une instance PostgreSQL 16 jetable, et le résultat est recopié dans
 * l'en-tête de la migration.
 *
 * Ce que la spec doit empêcher de dériver, dans l'ordre d'importance :
 *
 *  1. le SENS de la contrainte — elle est à sens UNIQUE. Un `partner_account_id`
 *     posé sur un freelance reste légal, et l'écrire en équivalence rejetterait
 *     des lignes que l'API accepte aujourd'hui ;
 *  2. le `NOT VALID` — sans lui, une seule ligne héritée en violation fait
 *     échouer `migration:run:prod`, qui est le `preDeployCommand` de Railway :
 *     le déploiement est ABANDONNÉ et l'ancienne image reste en ligne ;
 *  3. le fait qu'on ne RÉPARE rien tout seul — inventer un partenaire est une
 *     donnée fictive, et rétrograder l'engagement effacerait une saisie humaine.
 */

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

async function upSql(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new ConsultantSubcontractingPartner1790294186537().up(runner)
  return queries.map(normalize)
}

describe('ConsultantSubcontractingPartner1790294186537', () => {
  it('émet du SQL (garde-fou : la migration LIT quelque chose)', async () => {
    expect((await upSql()).length).toBeGreaterThan(0)
  })

  it('pose la contrainte à SENS UNIQUE — sous-traitant ⇒ partenaire, jamais l’inverse', async () => {
    const add = (await upSql()).find(q => q.includes('ADD CONSTRAINT consultants_subcontracting_partner_check'))

    expect(add).toContain("CHECK (engagement_kind IS DISTINCT FROM 'sous_traitance' OR partner_account_id IS NOT NULL)")
    // `IS DISTINCT FROM` et non `<>` : une colonne nulle rendrait `<>` nul, et
    // un CHECK nul PASSE — le bon sens ici, mais par accident. On l'écrit.
    expect(add).not.toContain("engagement_kind <> 'sous_traitance'")
    // La réciproque n'est PAS exigée : rien dans l'API n'interdit un partenaire
    // sur une autre nature, et l'interdire rejetterait des lignes légitimes.
    expect(add).not.toContain('partner_account_id IS NULL')
  })

  it('ajoute la contrainte en NOT VALID — une ligne héritée ne doit pas abandonner le déploiement', async () => {
    const add = (await upSql()).find(q => q.includes('ADD CONSTRAINT consultants_subcontracting_partner_check'))

    expect(add).toContain('NOT VALID')
  })

  it('tente la validation, et SURVIT à son échec', async () => {
    const sql = await upSql()
    const validate = sql.find(q => q.includes('VALIDATE CONSTRAINT'))

    expect(validate).toContain('VALIDATE CONSTRAINT consultants_subcontracting_partner_check')
    // La validation est enveloppée : elle scanne la table, donc elle peut
    // échouer sur l'existant. Sans le gestionnaire, on aurait rétabli
    // exactement le défaut que le `NOT VALID` évite.
    expect(validate).toContain('EXCEPTION WHEN check_violation')
    expect(validate).toContain('RAISE WARNING')
  })

  it('est rejouable : la contrainte est retirée avant d’être posée', async () => {
    const sql = await upSql()
    const drop = sql.findIndex(q => q.includes('DROP CONSTRAINT IF EXISTS consultants_subcontracting_partner_check'))
    const add = sql.findIndex(q => q.includes('ADD CONSTRAINT consultants_subcontracting_partner_check'))

    expect(drop).toBeGreaterThanOrEqual(0)
    expect(add).toBeGreaterThan(drop)
  })

  it('ne RÉPARE rien tout seul — ni partenaire inventé, ni engagement rétrogradé', async () => {
    const sql = await upSql()

    expect(sql.some(q => q.startsWith('UPDATE'))).toBe(false)
    expect(sql.some(q => q.includes('INSERT INTO'))).toBe(false)
    expect(sql.some(q => q.startsWith('DELETE'))).toBe(false)
  })

  it('n’ajoute ni ne retire aucune colonne — le sujet est la contrainte seule', async () => {
    const sql = await upSql()

    expect(sql.some(q => q.includes('ADD COLUMN'))).toBe(false)
    expect(sql.some(q => q.includes('DROP COLUMN'))).toBe(false)
  })

  it('down() retire la contrainte, et rien d’autre', async () => {
    const { runner, queries } = createRunner()
    await new ConsultantSubcontractingPartner1790294186537().down(runner)
    const sql = queries.map(normalize)

    expect(sql).toEqual(['ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_subcontracting_partner_check'])
  })
})
