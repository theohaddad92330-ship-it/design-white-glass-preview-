import type { Consultant, OpenNeedRow } from '@bellum/contracts'
import { renderChatScopeObject, type ChatScopeMissionRead } from './chat-scope-object'

/**
 * #1951.2 / #1951.3 / #1910.6 — la fiche que Laura lit quand un fil est cadré
 * sur UN consultant, UN besoin ou UNE mission.
 *
 * Trois garanties :
 *  1. le texte vient d'une fiche RELUE par le serveur — le rendu ne voit jamais
 *     un libellé du navigateur ;
 *  2. une valeur absente n'est pas écrite (ni « 0 », ni « inconnu » inventé) ;
 *  3. rien de ce qui ne doit pas atteindre un prompt n'y entre : coordonnées,
 *     photo, montants financiers, notes libres, CV brut.
 */

const consultant = {
  id: '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11',
  full_name: 'Sophie Martin',
  title: 'Consultante Java',
  seniority: 'senior',
  years_experience: 11,
  availability: 'sous_1_mois',
  available_from: '2026-10-01',
  engagement_kind: 'freelance',
  stack: ['Java', 'Spring', 'Kafka'],
  sectors: ['Banque'],
  zones: ['Lyon'],
  languages: [],
  references: [],
  photoUrl: 'https://cdn.example/sophie.jpg',
  email: 'sophie.martin@example.com',
  phone: '+33612345678',
  public_profile_url: 'https://profiles.example/sophie',
  tjm: 650,
  min_tjm_cents: 60000,
  cost_rate_cents: 42000,
  purchase_tjm_cents: 50000,
  notes: 'Ne pas proposer chez ACME (conflit personnel)',
  cv_text: 'CV COMPLET CONFIDENTIEL',
} as unknown as Consultant

const need = {
  id: '0b8a1d52-7a52-4f6b-8a7e-3c9d2e1f4a10',
  title: 'Data engineer',
  account_name: 'SNCF',
  project_label: 'Data platform 2026',
  status: 'open',
  urgency: 'high',
  seniority: 'senior',
  headcount: 2,
  start_on: '2026-10-15',
  duration_months: 6,
  location: 'Lyon',
  contract_kind: 'regie',
  skills: [
    { term: 'Kafka', required: true },
    { term: 'Spark', required: false },
  ],
  shortlist_count: 0,
  target_tjm_cents: 70000,
  budget_cents: 12000000,
  min_tjm_cents: 60000,
} as unknown as OpenNeedRow

describe('renderChatScopeObject — un consultant', () => {
  const text = renderChatScopeObject({ kind: 'consultant', status: 'found', consultant })

  it('nomme la personne et ce qui sert à la positionner', () => {
    expect(text).toContain('Sophie Martin')
    expect(text).toContain('Consultante Java')
    expect(text).toContain('Java, Spring, Kafka')
    expect(text).toContain('2026-10-01')
    expect(text).toContain('Lyon')
  })

  it('n’envoie ni coordonnées, ni photo, ni montants, ni notes, ni CV', () => {
    for (const secret of [
      'sophie.martin@example.com',
      '+33612345678',
      'cdn.example',
      'profiles.example',
      '650',
      '60000',
      '42000',
      '50000',
      'conflit personnel',
      'CONFIDENTIEL',
    ]) {
      expect(text).not.toContain(secret)
    }
  })

  it('une valeur absente n’est pas écrite — ni « 0 », ni une valeur de remplissage', () => {
    const sparse = renderChatScopeObject({
      kind: 'consultant',
      status: 'found',
      consultant: { ...consultant, title: null, available_from: null, stack: [], zones: [] } as Consultant,
    })
    expect(sparse).toContain('Sophie Martin')
    expect(sparse).not.toContain('Poste')
    expect(sparse).not.toContain('Compétences')
    expect(sparse).not.toMatch(/\b0\b/)
  })
})

describe('renderChatScopeObject — un besoin', () => {
  const text = renderChatScopeObject({ kind: 'need', status: 'found', need })

  it('nomme le besoin, son compte, et sépare requis et souhaité', () => {
    expect(text).toContain('Data engineer')
    expect(text).toContain('SNCF')
    expect(text).toContain('Data platform 2026')
    expect(text).toMatch(/requises : Kafka/)
    expect(text).toMatch(/souhaitées : Spark/)
  })

  it('un compteur de shortlist à zéro est une VRAIE mesure et se dit', () => {
    expect(text).toMatch(/shortlist : 0/)
  })

  it('n’envoie aucun montant', () => {
    for (const amount of ['70000', '700', '12000000', '60000']) expect(text).not.toContain(amount)
  })
})

/**
 * #1910.6 — UNE MISSION. Les montants sont l'enjeu de ce bloc : une mission
 * porte le TJM vendu, le coût chargé et la marge, et aucun des trois n'a le
 * droit d'entrer dans un prompt — ils suivent `finance:read`, que cette lecture
 * ne connaît pas.
 */
const mission = {
  id: 'c0ffee00-1111-4222-8333-444455556666',
  label: 'Refonte du SI paiement',
  status: 'active',
  role_title: 'Architecte de plateforme',
  contract_kind: 'regie',
  started_on: '2026-03-02',
  ends_on: '2026-12-31',
  accountName: 'Société Générale',
  assignees: [{ id: 'a1', fullName: 'Sophie Martin', photoUrl: 'https://cdn.example/sophie.jpg' }],
  // Ce qui ne doit JAMAIS sortir.
  daily_rate: 650,
  daily_cost: 420,
  marginPercent: 35,
} as unknown as ChatScopeMissionRead

describe('renderChatScopeObject — une mission (#1910.6)', () => {
  const text = renderChatScopeObject({ kind: 'mission', status: 'found', mission })

  it('nomme la mission, son compte, son rôle et son calendrier', () => {
    expect(text).toContain('Refonte du SI paiement')
    expect(text).toContain('Société Générale')
    expect(text).toContain('Architecte de plateforme')
    expect(text).toContain('2026-03-02')
    expect(text).toContain('2026-12-31')
  })

  it('nomme qui est dessus aujourd’hui — l’identité, jamais la photo', () => {
    expect(text).toContain('Sophie Martin')
    expect(text).not.toContain('cdn.example')
  })

  it('n’envoie AUCUN montant — ni TJM, ni coût chargé, ni marge', () => {
    for (const amount of ['650', '420', '35']) expect(text).not.toContain(amount)
  })

  it('une valeur absente n’est pas écrite, et « personne d’affecté » se distingue de « on ne sait pas »', () => {
    const unstaffed = renderChatScopeObject({
      kind: 'mission',
      status: 'found',
      mission: { ...mission, role_title: null, ends_on: null, assignees: [] } as ChatScopeMissionRead,
    })
    expect(unstaffed).not.toContain('Rôle')
    expect(unstaffed).not.toContain('Fin prévue')
    expect(unstaffed).toContain('Personne n’est affecté')

    const unknownStaffing = renderChatScopeObject({
      kind: 'mission',
      status: 'found',
      mission: { ...mission, assignees: null } as ChatScopeMissionRead,
    })
    expect(unknownStaffing).not.toContain('Personne n’est affecté')
    expect(unknownStaffing).not.toContain('Affectés')
  })
})

describe('renderChatScopeObject — une fiche qu’on ne peut pas lire', () => {
  it('introuvable : le dit, sans nommer personne', () => {
    const text = renderChatScopeObject({ kind: 'consultant', status: 'not_found' })
    expect(text).toContain('introuvable')
  })

  it('illisible pour ce tour : le dit, et ce n’est pas « aucune fiche »', () => {
    const text = renderChatScopeObject({ kind: 'need', status: 'unavailable' })
    expect(text).toContain('illisible')
    expect(text).toContain('introuvable')
  })

  it('#1910.6 — une mission introuvable le dit aussi, sans nommer de mission', () => {
    const text = renderChatScopeObject({ kind: 'mission', status: 'not_found' })
    expect(text).toContain('introuvable')
    expect(text).toContain('mission')
  })
})
