import type { Repository } from 'typeorm'
import { TALENT_POOL_SEGMENTS } from '@bellum/contracts'
import type { ConsultantEntity } from '../../database/entities/consultant.entity'
import { TalentPoolService } from './talent-pool.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'

function makeService() {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      return []
    }),
  }
  const consultants = { manager } as unknown as Repository<ConsultantEntity>
  return { service: new TalentPoolService(consultants), queries }
}

/**
 * Le pool de réactivation (PDF 3 §11).
 *
 * Ce que ces tests protègent : chaque segment doit rendre la RAISON de la
 * présence, pas seulement un nom. Une liste de noms sans raison se referme sans
 * qu'on en fasse rien — « Yanis Berthier » n'appelle aucune action, « libre le
 * 12 septembre » en appelle une.
 */
describe('TalentPoolService', () => {
  it('couvre les sept segments du §11', async () => {
    const { service, queries } = makeService()
    for (const segment of TALENT_POOL_SEGMENTS) await service.entries(WORKSPACE, segment)
    expect(queries).toHaveLength(TALENT_POOL_SEGMENTS.length)
  })

  it.each(TALENT_POOL_SEGMENTS)('%s explique POURQUOI la personne est là', async segment => {
    const { service, queries } = makeService()
    await service.entries(WORKSPACE, segment)
    expect(queries[0]?.sql).toContain('AS because')
  })

  it.each(TALENT_POOL_SEGMENTS.filter(segment => segment !== 'archived'))(
    '%s exclut les fiches archivées',
    async segment => {
      // Un archivé n'est pas « à réveiller » : il a son propre segment, et le
      // mélanger aux autres ferait relancer des gens qui ont quitté l'ESN.
      const { service, queries } = makeService()
      await service.entries(WORKSPACE, segment)
      expect(queries[0]?.sql).toContain('archived_at IS NULL')
    },
  )

  it('« bientôt disponible » IGNORE une affectation sans date de fin', async () => {
    // On n'invente pas une libération : le §6.2 l'interdit, et un pool qui
    // annonce une date fausse est pire qu'un pool vide.
    const { service, queries } = makeService()
    await service.entries(WORKSPACE, 'soon_available')
    expect(queries[0]?.sql).toContain('ma.ends_on IS NOT NULL')
  })

  it('« dormant » retombe sur la date de création quand aucun contact n’est noté', async () => {
    const { service, queries } = makeService()
    await service.entries(WORKSPACE, 'dormant')
    expect(queries[0]?.sql).toContain('COALESCE(c.last_contact_at, c.created_at)')
  })

  it('« refusés récupérables » ne retient QUE les motifs non bloquants', async () => {
    // « Compétences » dit « pas cette personne » : la reproposer ailleurs sur
    // ce motif referait la même erreur.
    const { service, queries } = makeService()
    await service.entries(WORKSPACE, 'recoverable_rejects')
    expect(queries[0]?.sql).toContain("'price', 'availability', 'need_cancelled'")
    expect(queries[0]?.sql).not.toContain("'skills'")
  })

  it('« jamais positionné » ne compte que les fiches RELUES', async () => {
    // Une fiche « à relire » n'a pas encore été proposée parce qu'elle n'est
    // pas prête, pas parce qu'on l'a oubliée.
    const { service, queries } = makeService()
    await service.entries(WORKSPACE, 'never_submitted')
    expect(queries[0]?.sql).toContain("review_status = 'qualified'")
  })

  it('ne lit RIEN sans espace de travail', async () => {
    const { service, queries } = makeService()
    expect(await service.entries(null, 'dormant')).toEqual([])
    expect(queries).toEqual([])
  })
})
