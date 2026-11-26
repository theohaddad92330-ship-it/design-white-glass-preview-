import { describe, expect, it } from 'vitest'
import { countExaminedContacts, RECENT_HIRE_WINDOW_DAYS, recentHires, type RecentHireContact } from './recent-hires.js'

const NOW = Date.parse('2026-10-09T12:00:00Z')

function contact(overrides: Partial<RecentHireContact> = {}): RecentHireContact {
  return {
    id: 'c1',
    full_name: 'Claire Martin',
    title: 'DSI',
    email: 'claire.martin@acme.fr',
    phone: null,
    linkedin_url: 'https://www.linkedin.com/in/claire-martin',
    apollo_enrichment: {
      employment_history: [
        { organization_name: 'ACME SA', title: 'DSI', start_date: '2026-08-01', current: true },
        { organization_name: 'Autre Groupe', title: 'DSI adjointe', start_date: '2021-01-01', current: false },
      ],
    },
    ...overrides,
  }
}

const EMPTY_PROFILE = { personas: [], placedRoles: [] }

describe('recentHires — qui a rejoint le compte récemment (#3970)', () => {
  it('rend le poste COURANT chez ce compte, commencé dans la fenêtre, avec sa date et ses coordonnées pro', () => {
    const [hire, ...rest] = recentHires([contact()], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW })
    expect(rest).toEqual([])
    expect(hire).toMatchObject({
      contactId: 'c1',
      name: 'Claire Martin',
      role: 'DSI',
      startedOn: '2026-08-01',
      email: 'claire.martin@acme.fr',
      linkedinUrl: 'https://www.linkedin.com/in/claire-martin',
      source: 'people_enrichment',
    })
  })

  it('sait dire NON : une date inconnue ne fait jamais un recrutement « récent »', () => {
    const undated = contact({
      apollo_enrichment: { employment_history: [{ organization_name: 'ACME', title: 'DSI', current: true }] },
    })
    expect(recentHires([undated], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW })).toEqual([])
  })

  it('sait dire NON : une prise de poste plus ancienne que la fenêtre ne fait aucune ligne', () => {
    const old = contact({
      apollo_enrichment: {
        employment_history: [{ organization_name: 'ACME', title: 'DSI', start_date: '2025-12-01', current: true }],
      },
    })
    expect(RECENT_HIRE_WINDOW_DAYS).toBe(183)
    expect(recentHires([old], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW })).toEqual([])
  })

  it("sait dire NON : un poste courant chez une AUTRE entreprise n'est pas un recrutement de ce compte", () => {
    const elsewhere = contact({
      apollo_enrichment: {
        employment_history: [
          { organization_name: 'Concurrent', title: 'DSI', start_date: '2026-09-01', current: true },
        ],
      },
    })
    expect(recentHires([elsewhere], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW })).toEqual([])
  })

  it('un poste terminé ou une date future ne comptent pas', () => {
    const ended = contact({
      apollo_enrichment: {
        employment_history: [{ organization_name: 'ACME', title: 'DSI', start_date: '2026-09-01', current: false }],
      },
    })
    const future = contact({
      apollo_enrichment: {
        employment_history: [{ organization_name: 'ACME', title: 'DSI', start_date: '2027-01-01', current: true }],
      },
    })
    expect(recentHires([ended, future], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW })).toEqual([])
  })

  it('une date au mois près reste une date (affichée telle quelle)', () => {
    const monthOnly = contact({
      apollo_enrichment: {
        employment_history: [
          { organization_name: 'ACME', title: 'Data engineer', start_date: '2026-07', current: true },
        ],
      },
    })
    expect(recentHires([monthOnly], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW })[0]?.startedOn).toBe(
      '2026-07',
    )
  })

  it('les plus récents d’abord', () => {
    const a = contact({ id: 'a' })
    const b = contact({
      id: 'b',
      apollo_enrichment: {
        employment_history: [{ organization_name: 'ACME', title: 'CTO', start_date: '2026-09-15', current: true }],
      },
    })
    expect(
      recentHires([a, b], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW }).map(hire => hire.contactId),
    ).toEqual(['b', 'a'])
  })
})

describe('recentHires — la pertinence au contexte de l’espace, en raisons nommées', () => {
  it('nouveau DSI = décideur de ta persona', () => {
    const [hire] = recentHires([contact()], {
      companyName: 'ACME',
      profile: { personas: ["DSI / Directeur des Systèmes d'Information"], placedRoles: [] },
      nowMs: NOW,
    })
    expect(hire?.relevance.status).toBe('pertinent')
    expect(hire?.relevance.reasonFr).toContain('persona')
    expect(hire?.relevance.reasonFr).toContain('DSI')
    expect(hire?.relevance.reasonEn).toContain('persona')
  })

  it('une apostrophe typographique ne fait pas rater la persona', () => {
    const dsi = contact({
      apollo_enrichment: {
        employment_history: [
          {
            organization_name: 'ACME',
            title: 'Directeur des systèmes d’information',
            start_date: '2026-09-01',
            current: true,
          },
        ],
      },
    })
    const [hire] = recentHires([dsi], {
      companyName: 'ACME',
      profile: { personas: ["DSI / Directeur des Systèmes d'Information"], placedRoles: [] },
      nowMs: NOW,
    })
    expect(hire?.relevance.status).toBe('pertinent')
  })

  it('Data engineer recruté = ta famille métier', () => {
    const dataEngineer = contact({
      title: 'Data engineer',
      apollo_enrichment: {
        employment_history: [
          { organization_name: 'ACME', title: 'Data engineer', start_date: '2026-09-01', current: true },
        ],
      },
    })
    const [hire] = recentHires([dataEngineer], {
      companyName: 'ACME',
      profile: { personas: [], placedRoles: ['Data'] },
      nowMs: NOW,
    })
    expect(hire?.relevance.status).toBe('pertinent')
    expect(hire?.relevance.reasonFr).toContain('« Data »')
  })

  it('sait dire NON : un rôle hors de tes personas et métiers est nommé hors contexte, avec ce qui a été comparé', () => {
    const [hire] = recentHires(
      [
        contact({
          apollo_enrichment: {
            employment_history: [
              { organization_name: 'ACME', title: 'Responsable paie', start_date: '2026-09-01', current: true },
            ],
          },
        }),
      ],
      {
        companyName: 'ACME',
        profile: { personas: ['CTO / Directeur Technique'], placedRoles: ['Développeur'] },
        nowMs: NOW,
      },
    )
    expect(hire?.relevance.status).toBe('hors_metier')
    expect(hire?.relevance.reasonFr).toContain('CTO')
    expect(hire?.relevance.reasonFr).toContain('Développeur')
  })

  it('sans persona ni métier déclaré : non évaluable, jamais une pénalité', () => {
    const [hire] = recentHires([contact()], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW })
    expect(hire?.relevance.status).toBe('non_evaluable')
  })

  it('aucune probabilité ni score dans le verdict', () => {
    const [hire] = recentHires([contact()], { companyName: 'ACME', profile: EMPTY_PROFILE, nowMs: NOW })
    expect(JSON.stringify(hire)).not.toMatch(/%|probab|score/i)
  })
})

describe('countExaminedContacts — « non mesuré » n’est pas « aucun recrutement »', () => {
  it('ne compte que les contacts dont le parcours est connu', () => {
    expect(countExaminedContacts([contact(), contact({ id: 'x', apollo_enrichment: null })])).toBe(1)
    expect(countExaminedContacts([])).toBe(0)
  })
})
