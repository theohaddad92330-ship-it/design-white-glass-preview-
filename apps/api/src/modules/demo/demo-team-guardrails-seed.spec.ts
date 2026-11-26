import { DEMO_TEAM_GUARDRAILS_COVERAGE, DEMO_TEAM_SCOPES_COVERAGE } from './demo-coverage'
import {
  DEMO_BUSINESS_UNITS,
  DEMO_DOSSIERS,
  DEMO_SG_ZONE_BUSINESS_UNIT,
  DEMO_SG_ZONE_ENTITY_LABELS,
} from './demo-dataset'
import { DEMO_PURGE_TABLES } from './demo-reset.service'
import {
  DEMO_DO_NOT_CONTACT_DOMAIN,
  DEMO_DO_NOT_CONTACT_LINKEDIN,
  seedTeamGuardrails,
} from './demo-team-guardrails-seed'

const WS = 'ws-demo'
const OWNER = 'u-owner'

type Scene = { colleague?: string; account?: string; contact?: string }

const input = (scene: Scene) => ({
  workspaceId: WS,
  ownerUserId: OWNER,
  accountId: scene.account ?? null,
  contactId: scene.contact ?? null,
})

function fakeDb(scene: Scene) {
  const writes: { sql: string; params: unknown[] }[] = []
  async function query<T>(sql: string, params: unknown[] = []): Promise<T> {
    if (sql.includes('FROM workspace_members')) return (scene.colleague ? [{ user_id: scene.colleague }] : []) as T
    writes.push({ sql, params })
    return [] as T
  }
  return { db: { query }, writes }
}

describe('#4158 — la démo des garde-fous entre collègues', () => {
  it('SANS collègue fictif : aucune trace de collègue, mais la liste « ne pas contacter » est semée au nom du visiteur (#4295.11)', async () => {
    const scene = { account: 'a1', contact: 'c1' }
    const { db, writes } = fakeDb(scene)
    expect(await seedTeamGuardrails(db, input(scene))).toEqual({ seeded: false })
    // #4295.11 — l'écran « Ne pas contacter » ne dépend pas d'un collègue : un domaine et deux contacts.
    const dnc = writes.filter(w => w.sql.includes('INSERT INTO workspace_do_not_contact'))
    expect(dnc).toHaveLength(3)
    expect(dnc.every(w => w.params.includes(OWNER))).toBe(true)
    // …mais rien d'autre : ni action, ni message, ni équipe attribués à un collègue qui n'existe pas.
    // Seule autre écriture permise sans collègue : le switch « Privé » (G.9), qui ne désigne personne.
    expect(
      writes.filter(w => !w.sql.includes('workspace_do_not_contact') && !w.sql.includes('SET is_private')),
    ).toEqual([])
  })

  it('#4295.11 — le premier contact « ne pas contacter » est le fictif de SNCF (visible sur la 1re page), pas un tirage au hasard', async () => {
    const scene = { account: 'a1', contact: 'c1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    const contactWrites = writes.filter(w => w.sql.includes("'contact'"))
    expect(contactWrites).toHaveLength(2)
    expect(contactWrites[0]?.params).toContain(DEMO_DO_NOT_CONTACT_LINKEDIN)
    expect(contactWrites[1]?.params).not.toContain(DEMO_DO_NOT_CONTACT_LINKEDIN)
  })

  it('G.9 — le dossier « Privé » est choisi sur first_detected_at (opportunities n’a pas de created_at)', async () => {
    const scene = { account: 'a1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    const privateWrite = writes.find(w => w.sql.includes('SET is_private'))
    expect(privateWrite?.sql).toContain('ORDER BY first_detected_at DESC')
    expect(privateWrite?.sql).not.toContain('created_at')
  })

  it('sans compte vitrine : ne devine pas un autre compte', async () => {
    const scene = { colleague: 'u-bob' }
    const { db, writes } = fakeDb(scene)
    expect(await seedTeamGuardrails(db, input(scene))).toEqual({ seeded: false })
    expect(writes).toEqual([])
  })

  it('avec un collègue : sème #20, #21, #22, #23 et #25 au nom du collègue, jamais du visiteur', async () => {
    const scene = { colleague: 'u-bob', account: 'a1', contact: 'c1' }
    const { db, writes } = fakeDb(scene)
    expect(await seedTeamGuardrails(db, input(scene))).toEqual({ seeded: true })
    const sqls = writes.map(w => w.sql)
    expect(sqls.some(s => s.includes('INSERT INTO user_actions'))).toBe(true)
    expect(sqls.some(s => s.includes('INSERT INTO outreach_messages') && s.includes("'sent'"))).toBe(true)
    expect(sqls.some(s => s.includes('INSERT INTO workspace_do_not_contact'))).toBe(true)
    expect(sqls.some(s => s.includes('INSERT INTO submissions') && s.includes("'submitted'"))).toBe(true)
    expect(sqls.some(s => s.includes('INSERT INTO account_team_members'))).toBe(true)
    expect(writes.some(w => w.params.includes(DEMO_DO_NOT_CONTACT_DOMAIN))).toBe(true)
    // Le visiteur n'est jamais l'auteur d'un geste de collègue : il n'est que celui qui ajoute à l'équipe.
    const authored = writes.filter(
      w => !w.sql.includes('account_team_members') && !w.sql.includes('account_team_scopes'),
    )
    expect(authored.every(w => !w.params.includes(OWNER))).toBe(true)
  })

  it('R24-FIX-B — sème 1 à 2 CONTACTS « ne pas contacter » du compte vitrine, jamais celui contacté par le collègue', async () => {
    const scene = { colleague: 'u-bob', account: 'a1', contact: 'c1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    const contactRows = writes.filter(
      w => w.sql.includes('INSERT INTO workspace_do_not_contact') && w.sql.includes("'contact'"),
    )
    expect(contactRows).toHaveLength(2)
    for (const row of contactRows) {
      // Le contact à exclure est LU dans le compte vitrine, hors celui déjà contacté (c1) : deux garde-fous distincts.
      expect(row.sql).toContain('FROM contacts')
      expect(row.sql).toContain('deleted_at IS NULL')
      expect(row.sql).toContain('<> $4')
      expect(row.params).toContain('c1')
      expect(row.params).toContain('u-bob')
    }
    expect(new Set(contactRows.map(r => r.params[2])).size).toBe(2) // deux motifs distincts
  })

  it('est idempotent : chaque écriture est gardée (NOT EXISTS / ON CONFLICT)', async () => {
    const scene = { colleague: 'u-bob', account: 'a1', contact: 'c1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    expect(writes.length).toBeGreaterThan(0)
    // `SET is_private = true` (G.9) est idempotent par nature : le rejouer écrit la même valeur sur la même ligne.
    const guarded = writes.filter(w => !w.sql.includes('SET is_private'))
    expect(guarded.every(w => w.sql.includes('NOT EXISTS') || w.sql.includes('ON CONFLICT'))).toBe(true)
  })

  it('sans contact : n’invente ni action ni message de contact', async () => {
    const scene = { colleague: 'u-bob', account: 'a1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    expect(writes.some(w => w.sql.includes('INSERT INTO outreach_messages'))).toBe(false)
  })
})

describe('#4996 L7 — les zones de l’équipe démo (account_team_scopes)', () => {
  const scopeWrites = (writes: { sql: string; params: unknown[] }[]) =>
    writes.filter(w => w.sql.includes('INSERT INTO account_team_scopes'))
  // #4996.4 — deux écritures de zone : les entités du compte, puis la BU de l'espace.
  const entityZoneWrites = (writes: { sql: string; params: unknown[] }[]) =>
    scopeWrites(writes).filter(w => !w.sql.includes('FROM business_units'))
  const unitZoneWrites = (writes: { sql: string; params: unknown[] }[]) =>
    scopeWrites(writes).filter(w => w.sql.includes('FROM business_units'))

  it('avec un collègue : lui pose des zones d’ENTITÉ de Société Générale, libellé recopié du nom de l’entité', async () => {
    const scene = { colleague: 'u-bob', account: 'a1', contact: 'c1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    const zones = entityZoneWrites(writes)
    expect(zones.length).toBeGreaterThan(0)
    for (const zone of zones) {
      // L'entité vient des entités DU compte vitrine, dans l'espace, jamais de la division d'accueil.
      expect(zone.sql).toContain('FROM account_entities')
      expect(zone.sql).toMatch(/account_id = \$2/)
      expect(zone.sql).toMatch(/workspace_id = \$1/)
      expect(zone.sql).toContain('is_default = false')
      // Le libellé est la copie du nom de l'entité (jamais un texte inventé), l'auteur est le visiteur.
      expect(zone.sql).toMatch(/e\.name/)
      expect(zone.sql).not.toMatch(/FROM contacts/) // GA-405 : aucune lecture brute de contacts de plus
      expect(zone.params).toContainEqual([...DEMO_SG_ZONE_ENTITY_LABELS])
      expect(zone.params).toEqual(expect.arrayContaining([WS, 'a1', 'u-bob', OWNER]))
      // Idempotent : une entité ne se pose qu'une fois par membre actif.
      expect(zone.sql).toContain('NOT EXISTS')
      expect(zone.sql).toContain('removed_at IS NULL')
    }
  })

  it('#4996.4 — avec un collègue : lui pose aussi UNE zone de BU de l’espace, libellé recopié du nom de la BU', async () => {
    const scene = { colleague: 'u-bob', account: 'a1', contact: 'c1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    const zones = unitZoneWrites(writes)
    expect(zones).toHaveLength(1)
    const [zone] = zones
    // La BU est une BU DE CET ESPACE, cherchée par son nom ; jamais une entité en même temps.
    expect(zone.sql).toMatch(/b\.workspace_id = \$1/)
    expect(zone.sql).toMatch(/b\.name = \$5/)
    expect(zone.sql).toMatch(/business_unit_id/)
    expect(zone.sql).toMatch(/NULL, b\.id, b\.name/)
    expect(zone.sql).toContain('NOT EXISTS')
    expect(zone.sql).toContain('removed_at IS NULL')
    expect(zone.params).toEqual([WS, 'a1', 'u-bob', OWNER, DEMO_SG_ZONE_BUSINESS_UNIT])
  })

  it('#4996.4 — la BU de la zone démo est l’une des BU semées de la salle', () => {
    expect(DEMO_BUSINESS_UNITS.map(unit => unit.name)).toContain(DEMO_SG_ZONE_BUSINESS_UNIT)
  })

  it('#4996.4 — classé seedé, la raison nomme la zone de BU', () => {
    expect(DEMO_TEAM_SCOPES_COVERAGE.state).toBe('seede')
    expect(DEMO_TEAM_SCOPES_COVERAGE.reason).toContain('#4996.4')
    expect(DEMO_TEAM_SCOPES_COVERAGE.reason).toContain(DEMO_SG_ZONE_BUSINESS_UNIT)
  })

  it('NÉGATIF — sans collègue : aucune zone (rien n’est inventé pour le visiteur)', async () => {
    const scene = { account: 'a1', contact: 'c1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    expect(scopeWrites(writes)).toEqual([])
  })

  it('NÉGATIF — sans compte vitrine : aucune zone', async () => {
    const scene = { colleague: 'u-bob' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    expect(scopeWrites(writes)).toEqual([])
  })

  it('la zone n’est jamais posée au visiteur : le membre est le collègue', async () => {
    const scene = { colleague: 'u-bob', account: 'a1' }
    const { db, writes } = fakeDb(scene)
    await seedTeamGuardrails(db, input(scene))
    for (const zone of scopeWrites(writes)) expect(zone.params[2]).toBe('u-bob')
  })

  it('la purge au reset emporte les zones (sinon le visiteur suivant hérite d’un périmètre qu’il n’a pas posé)', () => {
    expect([...DEMO_PURGE_TABLES]).toContain('account_team_scopes')
  })

  it('la zone est dérivée des contacts de Société Générale : deux entités, et il en reste hors périmètre', () => {
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
    const labels = new Set(
      (sg?.contacts ?? []).map(contact => (contact.entity ?? '').trim().toLowerCase()).filter(label => label),
    )
    expect(DEMO_SG_ZONE_ENTITY_LABELS).toHaveLength(2)
    for (const label of DEMO_SG_ZONE_ENTITY_LABELS) expect(labels.has(label)).toBe(true)
    expect(labels.size).toBeGreaterThan(DEMO_SG_ZONE_ENTITY_LABELS.length)
  })
})

describe('#4158 — classement dans demo-coverage.ts', () => {
  it('est classé seedé, avec une raison qui nomme la condition (un collègue fictif) et ce qui reste vide', () => {
    expect(DEMO_TEAM_GUARDRAILS_COVERAGE.state).toBe('seede')
    expect(DEMO_TEAM_GUARDRAILS_COVERAGE.reason).toContain('collègue fictif')
    expect(DEMO_TEAM_GUARDRAILS_COVERAGE.reason).toContain('Vide à dessein')
  })
})
