import { buildActionBody } from './boond-action-body'

/** Corps PROUVÉ le 02/11/2026 sur l'instance de test (UI web, réponse 200, contact fictif). */
describe('buildActionBody — POST /api/actions (#4692)', () => {
  const input = {
    typeOf: '61',
    title: 'Appel',
    text: 'Rappel',
    startDate: '2026-11-02T11:00:00.000Z',
    endDate: '2026-11-02T12:00:00.000Z',
    timezone: 'Europe/Paris',
    contactId: '1',
    mainManagerId: '1',
    companyId: '1',
  }

  it('fige EXACTEMENT la forme prouvée', () => {
    expect(buildActionBody(input)).toEqual({
      data: {
        type: 'action',
        attributes: {
          typeOf: 61,
          title: 'Appel',
          text: '<div>Rappel</div>',
          location: '',
          startDate: '2026-11-02T11:00:00.000Z',
          endDate: '2026-11-02T12:00:00.000Z',
          startTimezone: 'Europe/Paris',
          endTimezone: 'Europe/Paris',
          synchronizeWithAdvancedAppCalendar: false,
          relationType: 'parent',
          guests: [],
        },
        relationships: {
          dependsOn: { data: { type: 'contact', id: '1' } },
          mainManager: { data: { type: 'resource', id: '1' } },
          company: { data: { type: 'company', id: '1' } },
          file: { data: null },
          createdBy: { data: null },
          positioning: { data: null },
          delivery: { data: null },
        },
      },
    })
  })

  it('échappe le texte du commercial : jamais d’HTML brut injecté', () => {
    const body = buildActionBody({ ...input, text: '<script>alert(1)</script> & "x"\nligne 2' })
    const attrs = (body['data'] as { attributes: { text: string } }).attributes
    expect(attrs.text).toBe('<div>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;<br>ligne 2</div>')
  })

  it('société ou responsable inconnus : la relation est omise, jamais devinée', () => {
    const body = buildActionBody({ ...input, companyId: null, mainManagerId: null })
    const rel = (body['data'] as { relationships: Record<string, unknown> }).relationships
    expect(rel).not.toHaveProperty('company')
    expect(rel).not.toHaveProperty('mainManager')
    expect(rel).toHaveProperty('dependsOn')
  })

  it('dates normalisées en ISO UTC ; fin par défaut = début + 1 h', () => {
    const body = buildActionBody({ ...input, startDate: '2026-11-02T12:00:00+01:00', endDate: undefined })
    const attrs = (body['data'] as { attributes: Record<string, string> }).attributes
    expect(attrs['startDate']).toBe('2026-11-02T11:00:00.000Z')
    expect(attrs['endDate']).toBe('2026-11-02T12:00:00.000Z')
  })

  it('typeOf non numérique : refus (le dictionnaire de Boond ne rend que des identifiants numériques)', () => {
    expect(() => buildActionBody({ ...input, typeOf: 'abc' })).toThrow(/typeOf/)
  })
})
