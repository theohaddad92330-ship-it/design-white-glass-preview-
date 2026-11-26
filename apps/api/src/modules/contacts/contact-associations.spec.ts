import { loadContactAssociations } from './contact-associations'

const WS = '00000000-0000-4000-8000-0000000000aa'
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Un exécuteur SQL qui répond selon la table interrogée et garde la trace des appels. */
function runner(rows: Record<string, unknown[]>) {
  const calls: { sql: string; params: unknown[] }[] = []
  return {
    calls,
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      const table = Object.keys(rows).find(t => sql.includes(`FROM ${t}`))
      return table ? rows[table] : []
    },
  }
}

const CONTACT = {
  id: ID(1),
  account_id: ID(2),
  entity: 'Acme Cyber',
  entity_id: null,
  lifecycle_state: 'actionnable',
  employment_verified_at: null,
}

const VIEWER = { userId: ID(99), canSeePrivate: false }

describe('loadContactAssociations (#3712)', () => {
  it('lie par identité : projets (project_contacts), besoins (interlocuteur/décideur), missions (facturation)', async () => {
    const r = runner({
      accounts: [{ id: ID(2), company_name: 'Acme' }],
      project_contacts: [{ id: ID(10), label: 'Refonte SI', stage: 'qualified', role: 'sponsor' }],
      project_needs: [
        { id: ID(11), title: 'Architecte cloud', status: 'open', project_id: ID(10), role: 'decision_maker' },
      ],
      missions: [
        {
          id: ID(12),
          label: 'Mission data',
          status: 'active',
          is_billing: true,
          is_cra: false,
          is_client_manager: false,
        },
      ],
    })
    const out = await loadContactAssociations(r, CONTACT, WS, VIEWER)
    expect(out.account).toEqual({ id: ID(2), name: 'Acme' })
    expect(out.items.map(i => [i.kind, i.basis, i.role])).toEqual([
      ['project', 'documented', 'sponsor'],
      ['need', 'documented', 'decision_maker'],
      ['mission', 'declared', 'billing'],
    ])
    expect(out.items[1]?.project_id).toBe(ID(10))
  })

  it('#3712.7 — une mission porte TOUS les rôles que la personne y tient, le plus opérationnel d’abord, tous déclarés', async () => {
    const r = runner({
      missions: [
        {
          id: ID(12),
          label: 'Mission data',
          status: 'active',
          is_billing: true,
          is_cra: true,
          is_client_manager: true,
        },
        {
          id: ID(13),
          label: 'Mission RUN',
          status: 'active',
          is_billing: false,
          is_cra: true,
          is_client_manager: false,
        },
      ],
    })
    const out = await loadContactAssociations(r, CONTACT, WS, VIEWER)
    const missions = out.items.filter(item => item.kind === 'mission')
    expect(missions.map(item => [item.id, item.role, item.roles, item.basis])).toEqual([
      [ID(12), 'client_manager', ['client_manager', 'cra', 'billing'], 'declared'],
      [ID(13), 'cra', ['cra'], 'declared'],
    ])
    // une seule requête, trois colonnes de lien : jamais « toutes les missions du compte »
    const sql = r.calls.find(call => call.sql.includes('FROM missions'))?.sql ?? ''
    expect(sql).toMatch(/billing_contact_id = \$1 OR m\.cra_contact_id = \$1 OR m\.client_manager_contact_id = \$1/)
  })

  it('chaque requête est bornée au workspace, et aucune ne passe par un nom', async () => {
    const r = runner({})
    await loadContactAssociations(r, CONTACT, WS, VIEWER)
    for (const call of r.calls) {
      expect(call.sql).toMatch(/workspace_id = \$2/)
      expect(call.params).toContain(WS)
      expect(call.sql).not.toMatch(/ILIKE|full_name|company_name\s*=/i)
    }
  })

  it('un compte seul : aucun dossier, aucune ligne à zéro', async () => {
    const r = runner({ accounts: [{ id: ID(2), company_name: 'Acme' }] })
    const out = await loadContactAssociations(r, CONTACT, WS, VIEWER)
    expect(out.items).toEqual([])
    expect(out.account?.name).toBe('Acme')
  })

  it('sans compte : pas de requête compte, le libellé d’entité reste « déclaré »', async () => {
    const r = runner({})
    const out = await loadContactAssociations(r, { ...CONTACT, account_id: null }, WS, VIEWER)
    expect(out.account).toBeNull()
    expect(out.entity).toBeNull()
    expect(out.entity_label).toBe('Acme Cyber')
    expect(r.calls.some(c => c.sql.includes('FROM accounts'))).toBe(false)
  })

  it('une entité validée (clé) remplace le libellé libre', async () => {
    const r = runner({ account_entities: [{ id: ID(3), name: 'Acme Cyber SAS' }] })
    const out = await loadContactAssociations(r, { ...CONTACT, entity_id: ID(3) }, WS, VIEWER)
    expect(out.entity).toEqual({ id: ID(3), name: 'Acme Cyber SAS' })
    expect(out.entity_label).toBeNull()
  })

  it('un contact historique n’est pas présenté comme en poste ; un libellé enrichi ne confirme pas', async () => {
    const r = runner({})
    expect(
      (await loadContactAssociations(r, { ...CONTACT, lifecycle_state: 'historique' }, WS, VIEWER)).employment,
    ).toBe('historical')
    expect((await loadContactAssociations(r, CONTACT, WS, VIEWER)).employment).toBe('to_verify')
    expect(
      (await loadContactAssociations(r, { ...CONTACT, employment_verified_at: new Date('2026-09-01') }, WS, VIEWER))
        .employment,
    ).toBe('current')
  })
})

// #4158.34 — un objet PRIVÉ ne fait AUCUNE ligne (ni nom, ni compteur) chez qui
// n'a pas les droits : le filtre est dans le SQL, donc le LIMIT compte les
// seuls objets visibles et rien de privé ne remonte jusqu'à la réponse.
describe('loadContactAssociations — objets privés (#4158.34)', () => {
  const PRIVATE_TABLES = ['opportunities', 'project_needs', 'missions']

  it('chaque lecture d’objet filtre le privé, avec le lecteur et son droit en paramètres', async () => {
    const r = runner({})
    await loadContactAssociations(r, CONTACT, WS, VIEWER)
    for (const table of PRIVATE_TABLES) {
      const call = r.calls.find(c => c.sql.includes(table))
      expect(call).toBeDefined()
      expect(call?.sql).toMatch(/is_private = false OR \w+\.owner_id = \$3 OR \$4::boolean/)
      expect(call?.params.slice(0, 4)).toEqual([CONTACT.id, WS, VIEWER.userId, false])
    }
  })

  it('un lecteur qui a les droits de gestion passe le drapeau à true', async () => {
    const r = runner({})
    await loadContactAssociations(r, CONTACT, WS, { userId: ID(98), canSeePrivate: true })
    const call = r.calls.find(c => c.sql.includes('missions'))
    expect(call?.params[3]).toBe(true)
  })

  it('la lecture du compte et de l’entité n’est pas concernée (aucun drapeau sur ces objets)', async () => {
    const r = runner({})
    await loadContactAssociations(r, CONTACT, WS, VIEWER)
    expect(r.calls.find(c => c.sql.includes('FROM accounts'))?.sql).not.toContain('is_private')
  })
})
