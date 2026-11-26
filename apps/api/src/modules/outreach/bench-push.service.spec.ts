import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { BenchPushService } from './bench-push.service'

/**
 * #5029.1 — proposer un consultant en intercontrat à UN compte : tout se lit
 * dans l'ESPACE ACTIF. Un consultant, un contact ou un compte d'un autre espace
 * est introuvable (404) ; un refus de représentation pour CE compte arrête (403).
 */

const CONSULTANT = {
  id: 'cons-1',
  workspace_id: 'ws-1',
  full_name: 'Camille Martin',
  tjm: 650,
  title: 'Data engineer',
  seniority: 'senior',
  years_experience: 8,
  available_from: '2026-11-15',
}
const CONTACT = { id: 'ct-1', workspace_id: 'ws-1', full_name: 'Marie Dubois', account_id: 'acc-1' }
const ACCOUNT = { id: 'acc-1', workspace_id: 'ws-1', company_name: 'Thales' }

/** Un dépôt qui ne rend une ligne que si TOUS les critères `where` la décrivent. */
function repo<T extends Record<string, unknown>>(rows: T[]) {
  const matches = (row: T, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value)
  return {
    findOne: jest.fn(
      async ({ where }: { where: Record<string, unknown> }) => rows.find(r => matches(r, where)) ?? null,
    ),
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter(r => matches(r, where))),
  }
}

function build(over: { consents?: Record<string, unknown>[] } = {}) {
  const service = new BenchPushService(
    repo([CONSULTANT]) as never,
    repo([{ consultant_id: 'cons-1', workspace_id: 'ws-1', skill: 'Spark' }]) as never,
    repo([CONTACT]) as never,
    repo([ACCOUNT]) as never,
    repo(over.consents ?? []) as never,
  )
  return service
}

describe('BenchPushService.prepare (#5029.1)', () => {
  it('prépare UNE séquence playbook F sur le contact, brouillon anonymisé qui nomme le compte', async () => {
    const request = await build().prepare('ws-1', {
      consultant_id: 'cons-1',
      contact_id: 'ct-1',
      account_context: 'trois postes data ouverts',
    })
    expect(request.contact_id).toBe('ct-1')
    const draft = request.steps?.[0]?.draft
    expect(draft?.subject).toContain('Thales')
    expect(draft?.body).toContain('Spark')
    expect(draft?.body).toContain('trois postes data ouverts')
    expect(JSON.stringify(request)).not.toMatch(/Camille|650/)
  })

  it('REFUS — un consultant d’un AUTRE espace est introuvable (404)', async () => {
    await expect(build().prepare('ws-2', { consultant_id: 'cons-1', contact_id: 'ct-1' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('REFUS — un contact hors de l’espace du consultant est introuvable (404)', async () => {
    await expect(build().prepare('ws-1', { consultant_id: 'cons-1', contact_id: 'ct-x' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('REFUS — la personne a refusé d’être représentée auprès de CE compte (403)', async () => {
    const service = build({ consents: [{ consultant_id: 'cons-1', account_id: 'acc-1', can_represent: false }] })
    await expect(service.prepare('ws-1', { consultant_id: 'cons-1', contact_id: 'ct-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })
})
