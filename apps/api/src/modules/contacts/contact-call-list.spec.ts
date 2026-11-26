import {
  buildCallListContacts,
  matchCallListAccounts,
  toCallListSignal,
  type CallListContactSourceRow,
} from './contact-call-list'

/* #2545 / #3819 — démo Ludovic 08/10 : la liste d'appels lisait les 50 derniers
 * contacts de l'espace ; elle lit désormais ceux DU compte, classés. */

function row(overrides: Partial<CallListContactSourceRow> & { id: string }): CallListContactSourceRow {
  return {
    account_id: 'acc-1',
    full_name: 'Jean Dupont',
    title: null,
    entity: null,
    decision_role: null,
    email: null,
    email_verified: null,
    phone: null,
    linkedin_url: null,
    source: null,
    user_status: 'new',
    email_sent_at: null,
    last_enrichment_at: null,
    priority: null,
    demo_seed_first_door: null,
    hidden: null,
    excluded_at: null,
    lifecycle_state: null,
    recommendation_authorized_reason: null,
    why_contact: null,
    location: null,
    ...overrides,
  }
}

describe('matchCallListAccounts', () => {
  const accounts = [
    { id: 'a-arquus', siren: '123456789', company_name: 'ARQUUS' },
    { id: 'a-schneider', siren: null, company_name: 'Schneider Electric SA' },
    { id: 'a-other', siren: '999999999', company_name: 'Autre' },
  ]

  it('rapproche par identifiant, puis SIREN, puis nom normalisé (forme juridique neutralisée)', () => {
    const matched = matchCallListAccounts(
      [
        { key: 'k1', accountId: 'a-other', siren: null, name: 'peu importe' },
        { key: 'k2', siren: '123456789', name: 'Arquus Garchizy' },
        { key: 'k3', siren: '555', name: 'Schneider Électric' },
        { key: 'k4', siren: '000', name: 'Inconnue' },
      ],
      accounts,
    )
    expect(matched.get('k1')).toBe('a-other')
    expect(matched.get('k2')).toBe('a-arquus')
    expect(matched.get('k3')).toBe('a-schneider')
    expect(matched.has('k4')).toBe(false)
  })

  it("n'accepte jamais un identifiant de compte hors de l'espace (absent de la liste lue)", () => {
    const matched = matchCallListAccounts([{ key: 'k', accountId: 'a-foreign', siren: null, name: null }], accounts)
    expect(matched.has('k')).toBe(false)
  })
})

describe('buildCallListContacts', () => {
  it('rend au plus dix personnes, classées, nom complet et coordonnées EN CLAIR', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => row({ id: `c${i}`, full_name: `Personne ${i} Nom${i}` })),
      row({
        id: 'dsi',
        full_name: 'Claire Martin',
        title: 'Directrice des systèmes d’information',
        email: 'claire.martin@arquus.fr',
        email_verified: true,
        phone: '+33 3 86 00 00 00',
      }),
    ]
    const result = buildCallListContacts(rows, new Set())
    expect(result.total).toBe(13)
    expect(result.contacts).toHaveLength(10)
    expect(result.contacts[0]).toMatchObject({
      id: 'dsi',
      full_name: 'Claire Martin',
      email: 'claire.martin@arquus.fr',
      email_verified: true,
      phone: '+33 3 86 00 00 00',
    })
  })

  // Recette 21/10 D.4 (LC.4) — la liste d'appels montrait « Damien », « Pia », « Sylvie » : l'offre de recherche
  // masque le nom de famille. On ne CACHE aucun prénom seul (il reste une piste), mais une fiche au nom complet
  // passe devant, à rang égal — la liste, plafonnée par entreprise, montre d'abord des personnes qu'on peut nommer.
  it('D.4 — un nom complet passe devant un prénom seul, le prénom seul reste dans la liste', () => {
    const rows = [
      row({ id: 'alone', full_name: 'Damien', title: 'Directeur des systèmes d’information' }),
      row({ id: 'full', full_name: 'Claire Martin', title: 'Directrice des systèmes d’information' }),
    ]
    const ids = buildCallListContacts(rows, new Set()).contacts.map(c => c.id)
    expect(ids).toEqual(['full', 'alone'])
  })

  it("écarte ce que la porte d'éligibilité écarte (exclu, fiche incorrecte)", () => {
    const rows = [
      row({ id: 'ok', full_name: 'Anne Leroy' }),
      row({ id: 'excluded', full_name: 'Paul Roy', excluded_at: '2026-10-01' }),
      row({ id: 'flagged', full_name: 'Marc Petit' }),
    ]
    const result = buildCallListContacts(rows, new Set(['flagged']))
    expect(result.contacts.map(c => c.id)).toEqual(['ok'])
    expect(result.total).toBe(1)
  })

  it('aucune ligne → liste vide, jamais un contact inventé', () => {
    expect(buildCallListContacts([], new Set())).toEqual({ total: 0, contacts: [] })
  })
})

describe('toCallListSignal', () => {
  const base = {
    label: "Appel d'offres maintenance automatismes — site de Dijon",
    signal_type: 'appel_offres',
    source: 'Registre public',
    signal_date: '2026-10-02',
    first_detected_at: new Date('2026-10-07T08:00:00Z'),
    first_detection_exact: true,
  }

  it('garde la date DU signal quand elle est lisible', () => {
    expect(toCallListSignal(base)).toEqual({
      kind: 'appel_offres',
      label: base.label,
      date: '2026-10-02',
      dateIsDetection: false,
      source: 'Registre public',
    })
  })

  it('lit un mois écrit en toutes lettres (« juillet 2026 » → 2026-07)', () => {
    expect(toCallListSignal({ ...base, signal_date: 'juillet 2026' })?.date).toBe('2026-07')
  })

  it('date illisible → date EXACTE de première détection, nommée comme telle', () => {
    expect(toCallListSignal({ ...base, signal_date: 'récemment' })).toMatchObject({
      date: '2026-10-07',
      dateIsDetection: true,
    })
  })

  it('ni date lisible ni détection exacte → pas de signal (jamais une date devinée)', () => {
    expect(toCallListSignal({ ...base, signal_date: null, first_detection_exact: false })).toBeNull()
  })

  it('#3928.3 — un signal ARCHIVÉ par l’analyse ne rejoint pas la carte (la fiche et Laura ne le montrent pas)', () => {
    expect(toCallListSignal({ ...base, freshness: 'archive' })).toBeNull()
    expect(toCallListSignal({ ...base, signal_date: '2019-03-01' })).toBeNull()
    expect(toCallListSignal({ ...base, freshness: 'current' })).not.toBeNull()
  })

  // #4045.1 — « je veux aussi le lien de l'offre » : l'URL vérifiable du signal (lue sur l'analyse)
  // voyage avec lui ; sans URL, la clé n'existe pas (aucun lien deviné).
  it("porte le lien source quand l'analyse en a un, et seulement alors", () => {
    expect(toCallListSignal(base, 'https://emploi.example/offre/1')).toMatchObject({
      url: 'https://emploi.example/offre/1',
    })
    expect(toCallListSignal(base, null)).not.toHaveProperty('url')
    expect(toCallListSignal(base)).not.toHaveProperty('url')
  })

  it('une nature inconnue reste un signal, sans nature', () => {
    expect(toCallListSignal({ ...base, signal_type: 'autre_chose' })?.kind).toBeNull()
  })
})
