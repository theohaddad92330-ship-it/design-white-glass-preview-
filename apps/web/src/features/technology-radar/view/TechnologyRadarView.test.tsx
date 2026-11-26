import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { technologyRadarSchema, type TechnologyRadar } from '@bellum/contracts'
import '@/i18n'
import { TechnologyRadarView } from './TechnologyRadarView'

/** #4282 — les sept blocs, dans l'ordre rendu par la sortie commune ; aucune valeur absente en « 0 ». */
const RADAR: TechnologyRadar = technologyRadarSchema.parse({
  technology: { kind: 'closed', code: 'SAP', label: 'SAP' },
  generatedAt: '2026-10-19T00:00:00Z',
  accounts: [
    {
      accountName: 'Cabinet Talentis (démo)',
      siren: null,
      pocket: 'immediate',
      rank: 1,
      program: null,
      targetIsPublisher: true,
      awardedTender: null,
      missions: [
        {
          title: 'Consultant SAP FI/CO',
          publisher: 'Cabinet Talentis (démo)',
          location: 'Lyon',
          tjmEur: null,
          publishedAt: '2026-10-16',
          url: 'https://demo.test/1',
        },
      ],
      proofs: [{ kind: 'offer', label: 'Consultant SAP FI/CO', date: '2026-10-16', url: 'https://demo.test/1' }],
      profiles: ['Consultant SAP FI/CO'],
      toVerify: null,
    },
    {
      accountName: 'Cévennes Défense Systèmes (démo)',
      siren: null,
      pocket: 'programs',
      rank: 2,
      program: 'Migration SAP ECC vers S/4HANA',
      targetIsPublisher: false,
      awardedTender: null,
      missions: [],
      proofs: [{ kind: 'tender_open', label: 'Migration SAP ECC vers S/4HANA', date: '2026-10-01', url: null }],
      profiles: [],
      toVerify: null,
    },
  ],
  historicalNeeds: [
    {
      accountName: 'Groupe Aurélys (démo)',
      title: 'Consultant SAP MM',
      status: 'GAGNE',
      date: '2025-09-01',
      tjmEur: 650,
      prescriberRole: 'DSI adjointe',
    },
  ],
  prescribers: [
    {
      accountName: 'Groupe Aurélys (démo)',
      name: null,
      role: 'DSI adjointe',
      freshness: { kind: 'to_revalidate', date: null },
    },
  ],
  footprints: [{ accountName: 'Groupe Aurélys (démo)', observedProfiles: 14, label: 'profils observés' }],
  notEvaluated: ['passe web fraîche (indisponible)'],
})

describe('#4282 — TechnologyRadarView', () => {
  it('rend les sept blocs dans l’ordre de l’issue', () => {
    render(<TechnologyRadarView radar={RADAR} />)
    const titles = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(titles).toEqual([
      'Missions plaçables maintenant',
      'Comptes les plus chauds',
      'Routes de rang 2',
      'Besoins historiques',
      'Relais et prescripteurs',
      'Empreinte par compte',
      'Classement en trois poches',
    ])
  })

  it('client masqué : la cible est le publieur ; TJM absent dit, jamais « 0 »', () => {
    render(<TechnologyRadarView radar={RADAR} />)
    const missions = screen.getByRole('region', { name: 'Missions plaçables maintenant' })
    expect(within(missions).getByText('Client final non affiché : la cible est le publieur.')).toBeTruthy()
    expect(within(missions).getByText(/TJM non affiché/)).toBeTruthy()
    expect(missions.textContent).not.toMatch(/\b0 €/)
  })

  it('empreinte = profils observés, prescripteur à revalider, rang 2 vide dit vide, aucun pourcentage', () => {
    render(<TechnologyRadarView radar={RADAR} />)
    expect(screen.getByText('Ce sont des profils observés chez ce compte, pas des missions ouvertes.')).toBeTruthy()
    expect(screen.getByText(/à revalider/)).toBeTruthy()
    expect(screen.getByText('Aucun marché attribué à un titulaire connu.')).toBeTruthy()
    const pockets = screen.getByRole('region', { name: 'Classement en trois poches' })
    expect(pockets.textContent).toContain('Rang 1 · Cabinet Talentis (démo)')
    expect(pockets.textContent).toContain('Rang 2 · Cévennes Défense Systèmes (démo)')
    expect(screen.getByTestId('technology-radar').textContent).not.toContain('%')
    expect(screen.getByText('passe web fraîche (indisponible)')).toBeTruthy()
  })
})
