import {
  REGISTRY_ANNOUNCEMENTS_SQL,
  toAccountRegistryAnnouncements,
  toRegistryAnnouncement,
} from './registry-announcements'

const row = {
  siren: '403355726',
  source: 'bodacc',
  kind: 'collective_proceeding',
  family_label: 'Procédures collectives',
  published_on: '2026-10-05',
  url: 'https://www.bodacc.fr/pages/annonce-visualisation/?q.id=id:A1',
  tribunal: 'TC Paris',
}

describe('#3916.b — les annonces de registre de la fiche compte', () => {
  it('rend chaque annonce avec sa date et son lien', () => {
    expect(toRegistryAnnouncement(row)).toEqual({
      source: 'bodacc',
      kind: 'collective_proceeding',
      type: 'Procédures collectives',
      date: '2026-10-05',
      url: row.url,
      tribunal: 'TC Paris',
    })
  })

  it('une source inconnue ne fait aucune ligne ; un genre inconnu n’est jamais deviné', () => {
    expect(toRegistryAnnouncement({ ...row, source: 'scraping' })).toBeNull()
    expect(toRegistryAnnouncement({ ...row, kind: 'opportunite' })?.kind).toBe('other')
  })

  it('#3921.11 — un événement du registre national (rne) est rendu, daté, avec son lien', () => {
    expect(
      toRegistryAnnouncement({
        ...row,
        source: 'rne',
        kind: 'executive_change',
        family_label: 'Changement de dirigeant',
        tribunal: null,
      }),
    ).toEqual({
      source: 'rne',
      kind: 'executive_change',
      type: 'Changement de dirigeant',
      date: '2026-10-05',
      url: row.url,
      tribunal: null,
    })
  })

  it('une date au format Date (pg) reste un jour ISO', () => {
    expect(toRegistryAnnouncement({ ...row, published_on: new Date('2026-09-01T00:00:00Z') })?.date).toBe('2026-09-01')
  })

  it('jamais lu en continu : checkedAt null, jamais une date inventée', () => {
    expect(toAccountRegistryAnnouncements([], null)).toEqual({ announcements: [], checkedAt: null, truncated: false })
    const read = toAccountRegistryAnnouncements([row], { checked_at: '2026-10-09T04:10:00.000Z', truncated: true })
    expect(read.checkedAt).toBe('2026-10-09T04:10:00.000Z')
    expect(read.truncated).toBe(true)
    expect(read.announcements).toHaveLength(1)
  })
})

// #3915.decp — les marchés publics attribués lus en continu deviennent des annonces datées du compte.
describe('#3915.decp — un marché attribué lu en continu', () => {
  const award = {
    siren: '428677124',
    source: 'decp',
    kind: 'award_won',
    family_label: 'Expertise DATA-IA',
    label: 'MINISTERE DE L EUROPE',
    published_on: '2026-09-01',
    url: null,
    tribunal: null,
  }

  it('rend le marché avec sa date et la partie d’en face', () => {
    expect(toRegistryAnnouncement(award)).toEqual({
      source: 'decp',
      kind: 'award_won',
      type: 'Expertise DATA-IA',
      date: '2026-09-01',
      url: null,
      tribunal: null,
      counterpart: 'MINISTERE DE L EUROPE',
    })
  })

  it('NON : une ligne decp d’un autre genre qu’un marché n’est jamais rendue', () => {
    expect(toRegistryAnnouncement({ ...award, kind: 'sale' })).toBeNull()
  })

  it('la lecture SQL rapporte la partie d’en face (colonne label)', () => {
    expect(REGISTRY_ANNOUNCEMENTS_SQL).toMatch(/SELECT[^]*\blabel\b[^]*FROM public_registry_announcements/)
  })
})
