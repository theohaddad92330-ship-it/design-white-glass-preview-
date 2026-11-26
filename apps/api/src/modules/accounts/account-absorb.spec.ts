import { planAbsorb, refuseAbsorb, type AbsorbAccount } from './account-absorb'

/**
 * #1111 — « KLESIA et KLESIA ADP, c'est la même chose, simplement des entités.
 * Ce serait bien de pouvoir "fusionner" deux prospects / clients en un seul
 * compte. »
 *
 * Ce que ces tests protègent : le geste est IRRÉVERSIBLE côté ressenti (un
 * dossier disparaît de la liste), donc il ne doit jamais rien perdre en
 * silence, ni violer l'unicité par nom qui a fait tomber trois runs en #983.
 */

const account = (over: Partial<AbsorbAccount> = {}): AbsorbAccount => ({
  id: 'a-klesia-adp',
  companyName: 'KLESIA ADP',
  siren: '752610147',
  website: 'klesia.fr',
  status: 'completed',
  mergedIntoId: null,
  ...over,
})

describe('les refus du rattachement (#1111)', () => {
  it('refuse de rattacher un dossier à lui-même', () => {
    expect(refuseAbsorb(account(), account())).toBe('same_account')
  })

  it('refuse un dossier déjà rattaché — ce n’est plus un doublon', () => {
    expect(refuseAbsorb(account({ mergedIntoId: 'a-klesia' }), account({ id: 'a-autre' }))).toBe('already_merged')
  })

  it('refuse une cible elle-même rattachée ailleurs', () => {
    expect(refuseAbsorb(account(), account({ id: 'a-autre', mergedIntoId: 'a-tiers' }))).toBe('target_merged')
  })

  it('refuse une cible archivée — sinon les DEUX dossiers seraient rangés', () => {
    expect(refuseAbsorb(account(), account({ id: 'a-autre', status: 'archived' }))).toBe('target_archived')
  })

  it('accepte un rattachement légitime', () => {
    expect(refuseAbsorb(account(), account({ id: 'a-klesia', companyName: 'KLESIA' }))).toBeNull()
  })
})

describe('le plan de rattachement (#1111)', () => {
  it('crée l’entité d’accueil avec ce que le dossier absorbé sait de lui-même', () => {
    const plan = planAbsorb({ absorbed: account(), absorbedContacts: [], keptContacts: [] })

    // `subsidiary` : le clic EST l'affirmation que ce dossier est une
    // subdivision de l'autre. C'est la seule chose qu'il déclare.
    expect(plan.entity).toEqual({ name: 'KLESIA ADP', kind: 'subsidiary', siren: '752610147', domain: 'klesia.fr' })
  })

  it('déplace les contacts que le compte gardé n’a pas', () => {
    const plan = planAbsorb({
      absorbed: account(),
      absorbedContacts: [
        { id: 'c-1', fullName: 'Caroline Jaouen' },
        { id: 'c-2', fullName: 'Marc Petit' },
      ],
      keptContacts: [{ id: 'c-9', fullName: 'Sophie Durand' }],
    })

    expect(plan.movedContactIds).toEqual(['c-1', 'c-2'])
    expect(plan.keptContacts).toEqual([])
  })

  it('LAISSE un homonyme déjà présent, avec sa raison', () => {
    // Le déplacer violerait l'unicité par nom (l'incident #983), et l'écraser
    // effacerait la fiche la plus renseignée des deux.
    const plan = planAbsorb({
      absorbed: account(),
      absorbedContacts: [{ id: 'c-1', fullName: 'caroline  JAOUEN' }],
      keptContacts: [{ id: 'c-9', fullName: 'Caroline Jaouen' }],
    })

    expect(plan.movedContactIds).toEqual([])
    expect(plan.keptContacts).toEqual([{ id: 'c-1', fullName: 'caroline  JAOUEN', reason: 'already_there' }])
  })

  it('ne déplace qu’UNE fois deux homonymes du dossier absorbé', () => {
    // L'unicité porte sur le compte d'ARRIVÉE : le second violerait l'index une
    // fois le premier posé.
    const plan = planAbsorb({
      absorbed: account(),
      absorbedContacts: [
        { id: 'c-1', fullName: 'Marc Petit' },
        { id: 'c-2', fullName: 'MARC PETIT' },
      ],
      keptContacts: [],
    })

    expect(plan.movedContactIds).toEqual(['c-1'])
    expect(plan.keptContacts).toHaveLength(1)
  })

  it('laisse un contact sans nom exploitable là où il est', () => {
    const plan = planAbsorb({
      absorbed: account(),
      absorbedContacts: [{ id: 'c-1', fullName: '   ' }],
      keptContacts: [],
    })

    expect(plan.movedContactIds).toEqual([])
    expect(plan.keptContacts).toHaveLength(1)
  })
})
