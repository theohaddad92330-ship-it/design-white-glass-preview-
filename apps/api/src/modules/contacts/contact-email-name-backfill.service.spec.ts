import { ContactEmailNameBackfillService } from './contact-email-name-backfill.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'

type Row = { id: string; full_name: string; email: string | null; source: string | null; raw_data: unknown }

function monter(rows: Row[], options: { collideOn?: string } = {}) {
  const update = jest.fn(async (_where: unknown, patch: Record<string, unknown>) => {
    if (options.collideOn && patch['full_name'] === options.collideOn) {
      throw Object.assign(new Error('dup'), { code: '23505', constraint: 'idx_contacts_account_normalized_name' })
    }
    return { affected: 1 }
  })
  const find = jest.fn(async () => rows)
  const service = new ContactEmailNameBackfillService({ find, update } as never)
  return { service, find, update }
}

const row = (id: string, full_name: string, extra: Partial<Row> = {}): Row => ({
  id,
  full_name,
  email: full_name.includes('@') ? full_name : null,
  source: 'crm',
  raw_data: null,
  ...extra,
})

describe('#4586 — rattrapage CIBLÉ des fiches nommées par leur adresse', () => {
  it('SIMULE d’abord : compte ce qui changerait, n’écrit rien', async () => {
    const { service, update } = monter([
      row('c1', 'menette.sebastien@societe.example'),
      row('c2', 'contact@societe.example'),
      row('c3', 'Marie Dupont'),
    ])
    const out = await service.run(WORKSPACE, { dryRun: true })
    expect(update).not.toHaveBeenCalled()
    expect(out).toMatchObject({ dryRun: true, candidates: 2, wouldDerive: 1, wouldComplete: 1, updated: 0 })
  })

  it('en réel : écrit le nom lisible (marqué dérivé) ou « à compléter », conserve l’e-mail, ne touche que le nom', async () => {
    const { service, update } = monter([
      row('c1', 'menette.sebastien@societe.example'),
      row('c2', 'contact@societe.example'),
    ])
    const out = await service.run(WORKSPACE, { dryRun: false })
    expect(update).toHaveBeenCalledWith(
      { id: 'c1', workspace_id: WORKSPACE },
      { full_name: 'Menette Sebastien', raw_data: { nameDerivedFromEmail: true } },
    )
    expect(update).toHaveBeenCalledWith({ id: 'c2', workspace_id: WORKSPACE }, { full_name: 'Contact à compléter' })
    expect(out.updated).toBe(2)
  })

  it('sait dire NON : une saisie à la main (source manual) n’est JAMAIS réécrite', async () => {
    const { service, update } = monter([row('c1', 'menette.sebastien@societe.example', { source: 'manual' })])
    const out = await service.run(WORKSPACE, { dryRun: false })
    expect(update).not.toHaveBeenCalled()
    expect(out).toMatchObject({ candidates: 0, updated: 0, skippedManual: 1 })
  })

  it('un nom déjà porté sur le compte : compté en collision, l’import ne s’arrête pas', async () => {
    const { service } = monter([row('c1', 'menette.sebastien@societe.example')], { collideOn: 'Menette Sebastien' })
    const out = await service.run(WORKSPACE, { dryRun: false })
    expect(out).toMatchObject({ updated: 0, collisions: 1 })
  })
})

describe('#4586 — rattrapage des noms mal formés', () => {
  function monterNoms(rows: Array<Row & { account_id: string | null }>) {
    const update = jest.fn(async () => ({ affected: 1 }))
    const contacts = { find: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(rows), update }
    const accounts = { find: jest.fn(async () => [{ id: 'a1', company_name: 'Exemple Société' }]) }
    return { service: new ContactEmailNameBackfillService(contacts as never, accounts as never), update, contacts }
  }
  const sqlDuPrefiltre = (contacts: { find: jest.Mock }, alias: string): string => {
    const arg = contacts.find.mock.calls[1]?.[0] as { where: { full_name: { getSql?: (a: string) => string } } }
    return arg.where.full_name.getSql?.(alias) ?? ''
  }

  // Prod 01/11/2026 : le 500 « missing FROM-clause entry for table "contactentity" » venait d'une
  // sous-requête corrélée construite sur l'alias non quoté que TypeORM passe à Raw.
  it('le pré-filtre SQL n’a ni sous-requête ni référence à l’alias de ligne', async () => {
    const { service, contacts } = monterNoms([])
    await service.run(WORKSPACE, { dryRun: true })
    const sql = sqlDuPrefiltre(contacts, 'ContactEntity.full_name')
    expect(sql).toContain('ContactEntity.full_name')
    expect(sql).not.toMatch(/SELECT|FROM|account_id/i)
    expect(sql).not.toContain('ContactEntity."')
  })

  it('le pré-filtre vise virgule OU trois mots et plus (pas deux mots)', async () => {
    const { service, contacts } = monterNoms([])
    await service.run(WORKSPACE, { dryRun: true })
    const sql = sqlDuPrefiltre(contacts, 'x')
    expect(sql).toContain("LIKE '%,%'")
    const motif = /~ '([^']+)'/.exec(sql)?.[1] ?? ''
    // Équivalent JS du motif POSIX : 3 mots séparés par des blancs.
    const js = new RegExp(motif.replace(/\[\^\[:space:\]\]/g, '\\S').replace(/\[\[:space:\]\]/g, '\\s'))
    expect(js.test('Camille Martin Exemple Société')).toBe(true)
    expect(js.test('Camille Martin')).toBe(false)
  })

  it('un nom « Prénom Nom <Société du compte> » est réparé', async () => {
    const { service, update } = monterNoms([nom('c1', 'Camille Martin Exemple Société')])
    await service.run(WORKSPACE, { dryRun: false })
    expect(update).toHaveBeenCalledTimes(1)
  })
  const nom = (id: string, full_name: string, extra: Partial<Row> = {}) => ({
    ...row(id, full_name, extra),
    email: null,
    account_id: 'a1',
  })

  it('simulation : compte, n’écrit rien', async () => {
    const { service, update } = monterNoms([nom('c1', 'Camille Martin Exemple Société')])
    const out = await service.run(WORKSPACE, { dryRun: true })
    expect(out.namesRepaired).toBe(1)
    expect(update).not.toHaveBeenCalled()
  })

  it('réel : retire la société du compte, garde l’ancien nom, n’écrase jamais une saisie à la main', async () => {
    const { service, update } = monterNoms([
      nom('c1', 'Camille Martin Exemple Société'),
      nom('c2', 'Camille, Camille, Camille MARTIN'),
      nom('c3', 'Jean Dupont Exemple Société', { source: 'manual' }),
      nom('c4', 'Léa Roy Autre Société'),
    ])
    const out = await service.run(WORKSPACE, { dryRun: false })
    expect(out.namesRepaired).toBe(2)
    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', workspace_id: WORKSPACE }), {
      full_name: 'Camille Martin',
      raw_data: { nameBeforeRepair: 'Camille Martin Exemple Société' },
    })
  })
})
