import type { ProjectRow } from '@bellum/contracts'
import {
  emptyAccountProjectFilters,
  filterAccountProjects,
  isNarrowed,
  type AccountProjectFilters,
} from './accountProjectsFilters'

/**
 * #1889 — « pouvoir filtrer, chercher […] dans cette page ».
 *
 * Le filtre est une fonction pure : il se prouve sans monter d'écran, et c'est
 * lui qui décide ce qu'on retrouve — donc ce qui se teste.
 */
const project = (over: Partial<ProjectRow> = {}): ProjectRow =>
  ({
    id: 'p-1',
    account_id: 'acc-1',
    company_name: 'Thales',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'program',
    label: 'Refonte du référentiel',
    detail: null,
    offer: null,
    source: null,
    confidence: 'high',
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    next_action: null,
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    access_mode: null,
    loss_reason: null,
    first_detected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    amount_cents: null,
    ...over,
  }) as ProjectRow

const withFilters = (over: Partial<AccountProjectFilters>): AccountProjectFilters => ({
  ...emptyAccountProjectFilters(),
  ...over,
})

const labels = (rows: ProjectRow[]) => rows.map(row => row.label)

describe('#1889 — filtrer et chercher les projets d’un compte', () => {
  it('ne resserre RIEN à l’arrivée — la liste s’ouvre entière', () => {
    const rows = [project(), project({ id: 'p-2', kind: 'signal', stage: 'detected', label: 'Un signal' })]

    expect(filterAccountProjects(rows, emptyAccountProjectFilters())).toHaveLength(2)
    expect(isNarrowed(emptyAccountProjectFilters())).toBe(false)
  })

  describe('la recherche', () => {
    it('plie les ACCENTS et la casse — « referentiel » trouve « référentiel »', () => {
      // ⚠️ `toLowerCase()` seul ne l'aurait pas trouvé : la casse se plie, les
      // diacritiques non. Un commercial qui tape vite ne met pas les accents.
      const rows = [project()]

      expect(labels(filterAccountProjects(rows, withFilters({ query: 'REFERENTIEL' })))).toEqual([
        'Refonte du référentiel',
      ])
    })

    it('lit AUSSI le détail et l’offre — pas seulement le libellé', () => {
      const rows = [
        project({ id: 'p-1', label: 'Chantier A', detail: 'migration du socle de données' }),
        project({ id: 'p-2', label: 'Chantier B', offer: 'Data engineering' }),
        project({ id: 'p-3', label: 'Chantier C' }),
      ]

      expect(labels(filterAccountProjects(rows, withFilters({ query: 'socle' })))).toEqual(['Chantier A'])
      expect(labels(filterAccountProjects(rows, withFilters({ query: 'data eng' })))).toEqual(['Chantier B'])
    })

    it('ne lit PAS le nom de l’entreprise — toutes les lignes sont du même compte', () => {
      // Le lire ferait répondre « tout » à la frappe la plus naturelle sur un
      // dossier de compte, celle du nom du compte.
      const rows = [project({ company_name: 'Thales', label: 'Chantier A' })]

      expect(filterAccountProjects(rows, withFilters({ query: 'thales' }))).toEqual([])
    })

    it('ne trouve rien quand rien ne correspond — jamais la liste entière', () => {
      expect(filterAccountProjects([project()], withFilters({ query: 'zzzz' }))).toEqual([])
    })
  })

  describe('la nature', () => {
    const rows = [
      project({ id: 'p-1', kind: 'program', label: 'Un programme' }),
      project({ id: 'p-2', kind: 'signal', stage: 'detected', label: 'Un signal' }),
      project({ id: 'p-3', kind: 'pain', label: 'Une douleur' }),
    ]

    it('« Signaux » ne garde que les signaux', () => {
      expect(labels(filterAccountProjects(rows, withFilters({ nature: 'signals' })))).toEqual(['Un signal'])
    })

    it('« Projets » écarte les signaux — un signal n’est pas un projet', () => {
      expect(labels(filterAccountProjects(rows, withFilters({ nature: 'projects' })))).toEqual([
        'Un programme',
        'Une douleur',
      ])
    })
  })

  describe('les filtres rapides', () => {
    it('« Dans le pipe » écarte ce que personne n’a encore regardé', () => {
      const rows = [
        project({ id: 'p-1', stage: 'qualified', label: 'Qualifié' }),
        project({ id: 'p-2', stage: 'detected', label: 'Détecté' }),
        project({ id: 'p-3', stage: 'potential', label: 'Potentiel' }),
      ]

      expect(labels(filterAccountProjects(rows, withFilters({ inPipe: true })))).toEqual(['Qualifié'])
    })

    it('« Sans prochaine action » distingue « aucune tâche » de « l’API n’a pas dit »', () => {
      // ⚠️ Le champ est TRIVALENT. `undefined` = réponse d'API antérieure au
      // champ, pendant un déploiement : compter cette ligne comme « sans
      // prochaine action » fabriquerait un reproche.
      const rows = [
        project({ id: 'p-1', label: 'Aucune tâche', next_action: null }),
        project({ id: 'p-2', label: 'Une tâche', next_action: { title: 'Rappeler', due_on: '2026-09-20' } }),
        project({ id: 'p-3', label: 'API muette', next_action: undefined }),
      ]

      expect(labels(filterAccountProjects(rows, withFilters({ withoutNextAction: true })))).toEqual(['Aucune tâche'])
    })

    it('les critères se CUMULENT en ET — la file la plus courte, donc la plus utile', () => {
      const rows = [
        project({ id: 'p-1', label: 'Refonte du socle', stage: 'qualified', next_action: null }),
        project({ id: 'p-2', label: 'Refonte du socle', stage: 'detected', next_action: null }),
        project({
          id: 'p-3',
          label: 'Refonte du socle',
          stage: 'qualified',
          next_action: { title: 'Rappeler', due_on: '2026-09-20' },
        }),
      ]

      const kept = filterAccountProjects(rows, withFilters({ query: 'refonte', inPipe: true, withoutNextAction: true }))

      expect(kept.map(row => row.id)).toEqual(['p-1'])
    })
  })

  describe('isNarrowed', () => {
    it('dit OUI dès qu’un seul critère resserre', () => {
      expect(isNarrowed(withFilters({ query: '  ' }))).toBe(false)
      expect(isNarrowed(withFilters({ query: 'a' }))).toBe(true)
      expect(isNarrowed(withFilters({ nature: 'signals' }))).toBe(true)
      expect(isNarrowed(withFilters({ inPipe: true }))).toBe(true)
      expect(isNarrowed(withFilters({ withoutNextAction: true }))).toBe(true)
    })
  })
})
