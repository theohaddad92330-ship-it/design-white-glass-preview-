import { describe, expect, it } from 'vitest'
import { accountCrumbTarget, contactOriginSearch, contactsCrumbTarget, readContactOrigin } from './contactOrigin'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

/**
 * #2150.62 — « ne jamais perdre où l'on était en passant par un contact ».
 *
 * La fiche contact déduisait son fil d'Ariane du SEUL `contact.account_id`, onglet
 * Contacts : ouverte depuis l'organigramme d'un compte, le retour ramenait à
 * l'onglet Contacts. L'origine voyage désormais dans l'URL, et c'est elle que le
 * fil d'Ariane relit.
 */
describe('contactOrigin — l’objet d’origine voyage dans l’URL', () => {
  it('lit une origine COMPTE avec son onglet', () => {
    expect(readContactOrigin({ from: 'account', fromId: ACCOUNT, fromTab: 'organigramme' })).toEqual({
      kind: 'account',
      accountId: ACCOUNT,
      tab: 'organigramme',
    })
  })

  it('#3674.3 — la STRATÉGIE (vue d’ensemble) est une origine : le retour ramène à la stratégie, pas aux contacts', () => {
    const origin = { kind: 'account', accountId: ACCOUNT, tab: 'overview' } as const
    expect(readContactOrigin(contactOriginSearch(origin))).toEqual(origin)
    expect(accountCrumbTarget(origin, OTHER)).toEqual({ accountId: ACCOUNT, tab: 'overview' })
    const fallbackOrigin = readContactOrigin({ from: 'account', fromId: ACCOUNT, fromTab: 'inconnu' })
    expect(fallbackOrigin?.kind === 'account' ? fallbackOrigin.tab : null).toBe('contacts')
  })

  it('une origine sans identifiant, ou d’un genre inconnu, n’est PAS une origine — jamais un retour deviné', () => {
    expect(readContactOrigin({ from: 'account' })).toBeNull()
    expect(readContactOrigin({ from: 'chat', fromId: 'conv-1' })).toBeNull()
    expect(readContactOrigin({ from: 'welcome', fromId: ACCOUNT })).toBeNull()
    expect(readContactOrigin({})).toBeNull()
  })

  it('écrit ce qu’elle relit — aller-retour exact', () => {
    const origin = { kind: 'account', accountId: ACCOUNT, tab: 'contacts' } as const
    expect(readContactOrigin(contactOriginSearch(origin))).toEqual(origin)
  })

  it('le maillon « compte » ramène au compte D’ORIGINE et à son onglet, avant le compte du contact', () => {
    expect(accountCrumbTarget({ kind: 'account', accountId: OTHER, tab: 'organigramme' }, ACCOUNT)).toEqual({
      accountId: OTHER,
      tab: 'organigramme',
    })
  })

  it('sans origine, le maillon garde le comportement d’avant : le compte du contact, onglet Contacts', () => {
    expect(accountCrumbTarget(null, ACCOUNT)).toEqual({ accountId: ACCOUNT, tab: 'contacts' })
    // #1473 — un contact À QUALIFIER n'a pas de dossier : pas de maillon mort.
    expect(accountCrumbTarget(null, null)).toBeNull()
  })

  /**
   * #3674.R1 — le fil d'Ariane ramène aux FILTRES de l'onglet Contacts, pas
   * seulement au compte/onglet. Le bouton navigateur les gardait déjà (ils
   * sont dans l'URL) ; le fil d'Ariane devait les perdre.
   */
  it('#3674.R1 — une origine Contacts avec filtres actifs voyage et se relit à l’identique', () => {
    const origin = {
      kind: 'account',
      accountId: ACCOUNT,
      tab: 'contacts',
      filters: { role: 'decision-maker', entity: 'it', q: 'dsi' },
    } as const
    expect(readContactOrigin(contactOriginSearch(origin))).toEqual(origin)
    expect(accountCrumbTarget(origin, OTHER)).toEqual({
      accountId: ACCOUNT,
      tab: 'contacts',
      filters: { role: 'decision-maker', entity: 'it', q: 'dsi' },
    })
  })

  it('#4061.b — l’état de l’organigramme quitté voyage avec l’origine et revient au fil d’Ariane', () => {
    const org = { ov: 'system', od: 'e2', of: 'level=L2', os: 'p-claire' }
    const origin = { kind: 'account', accountId: ACCOUNT, tab: 'organigramme', org } as const
    expect(readContactOrigin(contactOriginSearch(origin))).toEqual(origin)
    expect(accountCrumbTarget(origin, OTHER)).toEqual({ accountId: ACCOUNT, tab: 'organigramme', org })
  })

  it('#4061.b — SAIT DIRE NON : sans état d’organigramme, aucune clé fromOrg ; un JSON trafiqué est ignoré', () => {
    expect(contactOriginSearch({ kind: 'account', accountId: ACCOUNT, tab: 'organigramme' })).not.toHaveProperty(
      'fromOrg',
    )
    const read = readContactOrigin({
      from: 'account',
      fromId: ACCOUNT,
      fromTab: 'organigramme',
      fromOrg: '{pas du json',
    })
    expect(read).toEqual({ kind: 'account', accountId: ACCOUNT, tab: 'organigramme' })
    const stray = readContactOrigin({
      from: 'account',
      fromId: ACCOUNT,
      fromTab: 'organigramme',
      fromOrg: JSON.stringify({ os: 'p-x', tab: 'admin' }),
    })
    expect(stray).toEqual({ kind: 'account', accountId: ACCOUNT, tab: 'organigramme', org: { os: 'p-x' } })
  })

  it('#3674.R1 — une origine sans filtre actif n’écrit aucune clé de filtre', () => {
    const origin = { kind: 'account', accountId: ACCOUNT, tab: 'contacts' } as const
    const search = contactOriginSearch(origin)
    expect(search).not.toHaveProperty('fromQ')
    expect(search).not.toHaveProperty('fromRole')
    expect(search).not.toHaveProperty('fromEntity')
    expect(search).not.toHaveProperty('fromLevel')
    expect(search).not.toHaveProperty('fromPlace')
  })
})

/**
 * #3687.16 — « retour : origine, filtres, position ». Ouverte depuis la liste
 * /contacts avec des filtres actifs, la fiche ramenait au maillon « Contacts »
 * en `/contacts` NU : les filtres (et la page qu'on lisait) étaient perdus.
 * Même mécanisme que l'origine COMPTE ci-dessus (#2150.62) — une seconde
 * variante, pas un second système.
 */
describe('contactOrigin — origine LISTE : les filtres voient le retour (#3687.16)', () => {
  const LIST_SEARCH = { role: 'decideur', company: 'Acme' }

  it('écrit ce qu’elle relit — aller-retour exact', () => {
    const origin = { kind: 'list', search: JSON.stringify(LIST_SEARCH) } as const
    expect(readContactOrigin(contactOriginSearch(origin))).toEqual(origin)
  })

  it('le maillon « Contacts » ramène aux MÊMES filtres que ceux quittés', () => {
    const origin = { kind: 'list', search: JSON.stringify(LIST_SEARCH) } as const
    expect(contactsCrumbTarget(origin)).toEqual(LIST_SEARCH)
  })

  it('sans origine, le maillon garde le comportement d’avant : la liste NUE', () => {
    expect(contactsCrumbTarget(null)).toEqual({})
  })

  it('une origine LISTE avec un JSON corrompu ne casse pas la page — retombe sur la liste nue', () => {
    expect(contactsCrumbTarget({ kind: 'list', search: '{not json' })).toEqual({})
  })

  it('une origine LISTE sans `fromSearch`, ou avec un `fromSearch` vide, n’en est pas une', () => {
    expect(readContactOrigin({ from: 'list' })).toBeNull()
    expect(readContactOrigin({ from: 'list', fromSearch: '' })).toBeNull()
  })

  it('une origine COMPTE n’offre aucun filtre de liste à restaurer', () => {
    expect(contactsCrumbTarget({ kind: 'account', accountId: ACCOUNT, tab: 'contacts' })).toEqual({})
  })
})
