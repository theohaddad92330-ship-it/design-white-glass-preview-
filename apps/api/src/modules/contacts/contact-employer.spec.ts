import { accountDomainsFrom, isHomonymEmail, selectHomonymsToArchive } from './contact-employer'

// LUDB.5 — miroir TS de `apps/ia/app/services/contact_employer.py`.
describe('LUDB.5 — employeur d’un contact vs domaine du compte', () => {
  const still = accountDomainsFrom('https://www.still.fr/contact', ['still.de'])

  it('refuse un contact @stillfront.com et @still.sk pour le compte STILL', () => {
    expect(still).toEqual(['still.fr', 'still.de'])
    expect(isHomonymEmail('cfo@stillfront.com', still)).toBe(true)
    expect(isHomonymEmail('cto@still.sk', still)).toBe(true)
  })

  it('garde les domaines du compte, du groupe et leurs sous-domaines', () => {
    expect(isHomonymEmail('a@still.fr', still)).toBe(false)
    expect(isHomonymEmail('a@mail.still.de', still)).toBe(false)
  })

  it('SAIT DIRE NON à rejeter sur une absence : pas d’e-mail ou pas de domaine de compte', () => {
    expect(isHomonymEmail(null, still)).toBe(false)
    expect(isHomonymEmail('a@stillfront.com', [])).toBe(false)
  })
})

// LUDOVIC-C LC.1 — la remise aux règles actuelles de l'EXISTANT (fiche STILL, 1467 contacts).
describe('LC.1 — selectHomonymsToArchive', () => {
  const still = accountDomainsFrom('https://www.still.fr')
  const row = (id: string, email: string | null, patch: Record<string, unknown> = {}) => ({
    id,
    email,
    source: 'apollo',
    identity_confirmed_at: null,
    excluded_at: null,
    ...patch,
  })

  it('archive stillfront.com, garde still.fr et la même marque sur un autre pays (rangée derrière, pas archivée)', () => {
    const ids = selectHomonymsToArchive(
      [
        row('front', 'cfo@stillfront.com'),
        row('fr', 'a@still.fr'),
        row('de', 'b@still.de'),
        row('nz', 'c@still.co.nz'),
      ],
      still,
    )
    expect(ids).toEqual(['front'])
  })

  it('dit NON à toucher un contact corrigé ou apporté par un humain, ou déjà écarté', () => {
    const ids = selectHomonymsToArchive(
      [
        row('confirmed', 'x@stillfront.com', { identity_confirmed_at: new Date() }),
        row('manual', 'y@stillfront.com', { source: 'manual' }),
        row('crm', 'z@stillfront.com', { source: 'crm' }),
        row('already', 'w@stillfront.com', { excluded_at: new Date() }),
      ],
      still,
    )
    expect(ids).toEqual([])
  })

  it('sans domaine de compte connu : rien (une absence ne rejette jamais)', () => {
    expect(selectHomonymsToArchive([row('front', 'cfo@stillfront.com')], [])).toEqual([])
  })
})

// CEDRIC-FIX C.2 — SAFRAN AIRCRAFT ENGINES : 18 contacts → 14 après « Remettre aux règles actuelles ».
// Les e-mails du groupe (safrangroup.com) étaient pris pour ceux d'un homonyme : leur marque
// (« safrangroup ») différait de celle du site de l'entité (« safran-aircraft-engines »).
describe('C.2 — la marque du GROUPE n’est pas un homonyme', () => {
  const entity = accountDomainsFrom('https://www.safran-aircraft-engines.com')
  const row = (id: string, email: string) => ({
    id,
    email,
    source: 'apollo',
    identity_confirmed_at: null,
    excluded_at: null,
  })

  it('garde safrangroup.com / safran.fr (la maison mère) et archive un vrai homonyme', () => {
    const ids = selectHomonymsToArchive(
      [row('grp', 'a@safrangroup.com'), row('fr', 'b@safran.fr'), row('hom', 'c@safranfinancial.com')],
      entity,
    )
    expect(ids).toEqual(['hom'])
  })

  it('SAIT DIRE NON — still ≠ stillfront reste un homonyme (le suffixe « group » est le seul retiré)', () => {
    const still = accountDomainsFrom('https://www.still.fr')
    expect(selectHomonymsToArchive([row('front', 'x@stillfront.com'), row('g', 'y@stillgroup.com')], still)).toEqual([
      'front',
    ])
  })

  it('un domaine de GROUPE connu (autre compte du même groupe) est un domaine du compte', () => {
    const withGroup = accountDomainsFrom('https://www.safran-aircraft-engines.com', ['safran-seats.com'])
    expect(isHomonymEmail('d@safran-seats.com', withGroup)).toBe(false)
  })
})
