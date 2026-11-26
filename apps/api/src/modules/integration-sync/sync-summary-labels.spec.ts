import {
  accountsSummaryLine,
  actionsSummaryLine,
  ambiguitiesSummaryLine,
  contactsSummaryLine,
  exchangesSummaryLine,
  meetingsSummaryLine,
  meetingsToPrepareSummaryLine,
  pagesSummaryLine,
} from './sync-summary-labels'

describe('#2207.26 — accountsSummaryLine', () => {
  it('rend `null` quand rien n’a changé — jamais une ligne « 0 compte »', () => {
    expect(accountsSummaryLine(0)).toBeNull()
  })

  it('accorde singulier/pluriel FR+EN', () => {
    expect(accountsSummaryLine(1)).toEqual({
      domain: 'accounts',
      count: 1,
      label: { fr: '1 compte mis à jour', en: '1 account updated' },
    })
    expect(accountsSummaryLine(3)).toEqual({
      domain: 'accounts',
      count: 3,
      label: { fr: '3 comptes mis à jour', en: '3 accounts updated' },
    })
  })
})

describe('#2207.27 — contactsSummaryLine', () => {
  it('rend `null` quand rien n’a changé — jamais une ligne « 0 contact »', () => {
    expect(contactsSummaryLine(0)).toBeNull()
  })

  it('accorde singulier/pluriel FR+EN', () => {
    expect(contactsSummaryLine(1)).toEqual({
      domain: 'contacts',
      count: 1,
      label: { fr: '1 contact retrouvé', en: '1 contact found' },
    })
    expect(contactsSummaryLine(5)).toEqual({
      domain: 'contacts',
      count: 5,
      label: { fr: '5 contacts retrouvés', en: '5 contacts found' },
    })
  })
})

describe('#2207.28 — meetingsSummaryLine', () => {
  it('rend `null` quand rien n’a changé — jamais une ligne « 0 rendez-vous »', () => {
    expect(meetingsSummaryLine(0)).toBeNull()
  })

  it('accorde singulier/pluriel FR+EN', () => {
    expect(meetingsSummaryLine(1)).toEqual({
      domain: 'meetings',
      count: 1,
      label: { fr: '1 rendez-vous retrouvé', en: '1 meeting found' },
    })
    expect(meetingsSummaryLine(2)).toEqual({
      domain: 'meetings',
      count: 2,
      label: { fr: '2 rendez-vous retrouvés', en: '2 meetings found' },
    })
  })
})

describe('#2388.42 — meetingsToPrepareSummaryLine', () => {
  it('rend `null` quand rien n’a changé — jamais une ligne « 0 rendez-vous »', () => {
    expect(meetingsToPrepareSummaryLine(0)).toBeNull()
  })

  it('accorde singulier/pluriel FR+EN', () => {
    expect(meetingsToPrepareSummaryLine(1)).toEqual({
      domain: 'meetings_to_prepare',
      count: 1,
      label: { fr: '1 rendez-vous à préparer', en: '1 meeting to prepare' },
    })
    expect(meetingsToPrepareSummaryLine(3)).toEqual({
      domain: 'meetings_to_prepare',
      count: 3,
      label: { fr: '3 rendez-vous à préparer', en: '3 meetings to prepare' },
    })
  })
})

describe('#2207.29 — exchangesSummaryLine', () => {
  it('rend `null` quand rien n’a changé — jamais une ligne « 0 échange »', () => {
    expect(exchangesSummaryLine(0)).toBeNull()
  })

  it('accorde singulier/pluriel FR+EN', () => {
    expect(exchangesSummaryLine(1)).toEqual({
      domain: 'exchanges',
      count: 1,
      label: { fr: '1 échange retrouvé', en: '1 exchange found' },
    })
    expect(exchangesSummaryLine(8)).toEqual({
      domain: 'exchanges',
      count: 8,
      label: { fr: '8 échanges retrouvés', en: '8 exchanges found' },
    })
  })
})

describe('#2207.30 — actionsSummaryLine', () => {
  it('rend `null` quand rien n’a changé — jamais une ligne « 0 action »', () => {
    expect(actionsSummaryLine(0)).toBeNull()
  })

  it('accorde singulier/pluriel FR+EN', () => {
    expect(actionsSummaryLine(1)).toEqual({
      domain: 'actions',
      count: 1,
      label: { fr: '1 action enregistrée', en: '1 action logged' },
    })
    expect(actionsSummaryLine(4)).toEqual({
      domain: 'actions',
      count: 4,
      label: { fr: '4 actions enregistrées', en: '4 actions logged' },
    })
  })
})

describe('#2207.31 — ambiguitiesSummaryLine', () => {
  it('rend `null` quand rien n’est ambigu — jamais une ligne « 0 ambiguïté »', () => {
    expect(ambiguitiesSummaryLine(0)).toBeNull()
  })

  it('accorde singulier/pluriel FR+EN, en langage clair (jamais « ambigu » ni « doublon »)', () => {
    expect(ambiguitiesSummaryLine(1)).toEqual({
      domain: 'ambiguities',
      count: 1,
      label: { fr: '1 fiche à confirmer avant de la rapprocher', en: '1 record to confirm before merging it' },
    })
    expect(ambiguitiesSummaryLine(3)).toEqual({
      domain: 'ambiguities',
      count: 3,
      label: { fr: '3 fiches à confirmer avant de les rapprocher', en: '3 records to confirm before merging them' },
    })
  })
})

describe('#2207.32 — pagesSummaryLine', () => {
  it('rend `null` quand rien n’a été appris — jamais une ligne « 0 page »', () => {
    expect(pagesSummaryLine(0)).toBeNull()
  })

  it('accorde singulier/pluriel FR+EN, jamais le mot « RAG »', () => {
    expect(pagesSummaryLine(1)).toEqual({
      domain: 'pages',
      count: 1,
      label: { fr: '1 page alimentée', en: '1 page indexed for Laura' },
    })
    expect(pagesSummaryLine(6)).toEqual({
      domain: 'pages',
      count: 6,
      label: { fr: '6 pages alimentées', en: '6 pages indexed for Laura' },
    })
  })
})
