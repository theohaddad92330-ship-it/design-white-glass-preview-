import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LauraJobView } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { lauraJobApi } from '../api/lauraJobApi'
import { LauraJobCard } from './LauraJobCard'

vi.mock('../api/lauraJobApi', () => ({ lauraJobApi: { get: vi.fn(), gesture: vi.fn() } }))
// #3860.4 — les liens de la synthèse, rendus comme des ancres lisibles en test.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children }: { to: string; params?: { id?: string }; children: React.ReactNode }) => (
    <a href={params?.id ? to.replace('$id', params.id) : to}>{children}</a>
  ),
}))

/** #2276.59 — une étape neuve ne porte aucune preuve. */
type StepIdentity = 'key' | 'label' | 'capability' | 'units' | 'dependsOn' | 'requiresApproval' | 'status'
const NO_PROOF: Omit<LauraJobView['brief']['steps'][number], StepIdentity> = {
  startedAt: null,
  finishedAt: null,
  creditsSpent: null,
  creditsReserved: null,
  creditsRefunded: null,
  note: null,
  approvedBy: null,
  approvedAt: null,
  // #3860.1 / #3860.2 — ni filtre, ni attente, ni identité produite.
  criteria: null,
  awaiting: [],
  produced: { accountIds: [], contactIds: [] },
}

/**
 * #2276 — le job composite de Laura, rendu dans le fil. La carte LIT la vue du
 * job servie par l'API (`context.laura_job`) : elle ne recalcule ni coût, ni
 * état, ni avancement, et une forme qui n'est pas celle du contrat ne rend RIEN.
 */

const JOB: LauraJobView = {
  id: '44444444-4444-4444-8444-444444444444',
  state: 'to_confirm',
  brief: {
    originalRequest: 'Analyse les 20 filiales de Thales et trouve 50 décideurs',
    intent: 'Cartographier les décideurs des filiales',
    expectedOutcome: '50 décideurs rattachés à leur filiale',
    scope: { description: 'Filiales françaises de Thales', accountIds: [], contactIds: [] },
    assumptions: ['Je suppose les filiales françaises seulement'],
    steps: [
      {
        key: 'analyse',
        label: 'Analyser les filiales',
        capability: 'account_analysis',
        units: 20,
        dependsOn: [],
        requiresApproval: false,
        status: 'todo',
        ...NO_PROOF,
      },
      {
        key: 'crm',
        label: 'Remonter dans le CRM',
        capability: 'crm_write',
        units: 1,
        dependsOn: ['analyse'],
        requiresApproval: false,
        status: 'todo',
        ...NO_PROOF,
      },
    ],
    sources: ['Registre des entreprises'],
    estimatedDurationSeconds: null,
    estimatedDurationBasis: null,
    intermediateResults: [],
    errors: [],
    createdObjects: [],
  },
  tools: ['account_analysis', 'crm_write'],
  validationsRequired: [{ key: 'crm', label: 'Remonter dans le CRM' }],
  progress: { done: 0, total: 2 },
  resume: { resumable: false, fromStepKey: null },
  ownerId: '9d359267-0000-4000-8000-000000000001',
  conversationId: 'conv-1',
  turnId: '33333333-3333-4333-8333-333333333331',
  estimatedCredits: 160,
  spentCredits: 0,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-09-24T10:00:00.000Z',
  synthesis: null,
}

describe('LauraJobCard — #2276', () => {
  it('nomme l’état, l’intention, le résultat attendu, le périmètre, les hypothèses et les étapes', () => {
    render(<LauraJobCard job={JOB} />)
    expect(screen.getByText('À confirmer')).toBeTruthy()
    expect(screen.getByText('Cartographier les décideurs des filiales')).toBeTruthy()
    expect(screen.getByText(/50 décideurs rattachés/)).toBeTruthy()
    expect(screen.getByText(/Filiales françaises de Thales/)).toBeTruthy()
    expect(screen.getByText(/Je suppose les filiales françaises/)).toBeTruthy()
    expect(screen.getByText('Analyser les filiales')).toBeTruthy()
    // La dépendance se NOMME par l'étape dont elle dépend, jamais par un rang.
    expect(screen.getByText(/après « Analyser les filiales »/)).toBeTruthy()
  })

  it('annonce la validation qu’exige l’écriture CRM — et plus le coût maximum (#4463)', () => {
    render(<LauraJobCard job={JOB} />)
    // #4463 — le job porte un coût maximum côté serveur ; la carte ne le chiffre pas.
    expect(screen.queryByText(/crédit|160/i)).toBeNull()
    expect(screen.getByText(/1 étape attendra ta validation/)).toBeTruthy()
    expect(screen.getByText(/validation requise/)).toBeTruthy()
  })

  it('dit que rien n’est lancé tant qu’il attend', () => {
    render(<LauraJobCard job={JOB} />)
    expect(screen.getByText(/Rien n’est lancé/)).toBeTruthy()
  })

  it('une durée non estimée ne s’affiche pas — jamais « 0 min »', () => {
    render(<LauraJobCard job={JOB} />)
    expect(screen.queryByText(/min/)).toBeNull()
  })

  it('une forme qui n’est pas celle du contrat ne rend rien', () => {
    const { container } = render(<LauraJobCard job={{ id: 'x', state: 'to_confirm' }} />)
    expect(container.textContent).toBe('')
  })

  // #2276.29 — l'état `failed` du contrat se LIT « Échoué » à l'écran.
  it('un job en échec s’affiche « Échoué »', () => {
    render(<LauraJobCard job={{ ...JOB, state: 'failed' }} />)
    expect(screen.getByText('Échoué')).toBeTruthy()
  })

  it('le Brouillon dit ce qui manque', () => {
    render(<LauraJobCard job={{ ...JOB, state: 'draft' }} />)
    expect(screen.getByText('Brouillon')).toBeTruthy()
    expect(screen.getByText(/précise le périmètre/i)).toBeTruthy()
  })
})

describe('LauraJobCard — les gestes et l’exécution (#2276 tranche 2)', () => {
  const gesture = vi.mocked(lauraJobApi.gesture)
  const get = vi.mocked(lauraJobApi.get)
  beforeEach(() => {
    gesture.mockReset()
    get.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('à confirmer : « Confirmer » lance par l’API et la carte montre l’état RELU du serveur', async () => {
    gesture.mockResolvedValue({ ...JOB, state: 'planned' })
    render(<LauraJobCard job={JOB} />)
    expect(screen.getByRole('button', { name: /Annuler/ })).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmer et lancer/ }))
    })
    expect(gesture).toHaveBeenCalledWith(JOB.id, 'confirm', undefined)
    expect(screen.getByText('Planifié')).toBeTruthy()
  })

  it('NON : solde épuisé — la carte dit le frein doux SANS chiffre et reste à confirmer (#4463)', async () => {
    gesture.mockRejectedValue(new ApiError('Crédits insuffisants', 402))
    render(<LauraJobCard job={JOB} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirmer et lancer/ }))
    })
    const alert = screen.getByRole('alert').textContent ?? ''
    expect(alert).toMatch(/Tu as beaucoup utilisé Bellum ce mois/)
    expect(alert).not.toMatch(/crédit|\d/i)
    expect(screen.getByText('À confirmer')).toBeTruthy()
  })

  it('en attente de validation : le bouton nomme l’étape validée, et rien d’autre', async () => {
    const waiting: LauraJobView = {
      ...JOB,
      state: 'awaiting_approval',
      brief: {
        ...JOB.brief,
        steps: JOB.brief.steps.map((step, index) => (index === 0 ? { ...step, status: 'done' } : step)),
      },
    }
    gesture.mockResolvedValue({ ...waiting, state: 'planned' })
    render(<LauraJobCard job={waiting} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Valider « Remonter dans le CRM »/ }))
    })
    expect(gesture).toHaveBeenCalledWith(JOB.id, 'approve', 'crm')
  })

  it('un job exécuté montre la preuve de chaque étape, ce qui est créé, et aucun geste', () => {
    const done: LauraJobView = {
      ...JOB,
      state: 'done',
      spentCredits: 40,
      progress: { done: 2, total: 2 },
      brief: {
        ...JOB.brief,
        steps: JOB.brief.steps.map(step => ({
          ...step,
          status: 'done' as const,
          creditsSpent: step.key === 'analyse' ? 40 : null,
          finishedAt: '2026-09-24T10:05:00.000Z',
        })),
        intermediateResults: [{ stepKey: 'analyse', summary: '20/20', at: '2026-09-24T10:05:00.000Z' }],
        createdObjects: [{ kind: 'crm_note', id: 'n1', label: 'Note CRM' }],
      },
    }
    render(<LauraJobCard job={done} />)
    expect(screen.getAllByText(/Fait/).length).toBe(2)
    // #4463 — la preuve des étapes reste (« Fait », résultat, objet créé) ; le débit ne se lit plus.
    expect(screen.queryByText(/crédit|débités/i)).toBeNull()
    expect(screen.getByText(/20\/20/)).toBeTruthy()
    expect(screen.getByText(/Note CRM/)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByText(/Rien n’est lancé/)).toBeNull()
  })

  it('NON : un job `unknown` ne propose pas de reprise et dit pourquoi', () => {
    const unknown: LauraJobView = {
      ...JOB,
      state: 'unknown',
      brief: {
        ...JOB.brief,
        steps: JOB.brief.steps.map((step, index) =>
          index === 0 ? { ...step, status: 'unknown' as const, note: 'timeout' as const } : step,
        ),
      },
    }
    render(<LauraJobCard job={unknown} />)
    expect(screen.queryByRole('button', { name: /Reprendre/ })).toBeNull()
    expect(screen.getByText(/on ne sait pas si elle est partie/)).toBeTruthy()
  })

  it('une étape qui ne s’exécute pas dans un job le dit', () => {
    const blocked: LauraJobView = {
      ...JOB,
      state: 'blocked',
      brief: {
        ...JOB.brief,
        steps: JOB.brief.steps.map((step, index) =>
          index === 0
            ? { ...step, status: 'blocked' as const, note: 'not_executable_in_job' as const }
            : { ...step, status: 'dropped' as const, note: 'dependency_not_done' as const },
        ),
      },
    }
    render(<LauraJobCard job={blocked} />)
    expect(screen.getByText(/ne s’exécute pas encore dans un job/)).toBeTruthy()
  })

  it('un job partiel reprenable propose « Reprendre »', () => {
    const partial: LauraJobView = {
      ...JOB,
      state: 'partial',
      brief: {
        ...JOB.brief,
        steps: JOB.brief.steps.map((step, index) =>
          index === 0 ? { ...step, status: 'done' as const } : { ...step, status: 'failed' as const },
        ),
      },
    }
    render(<LauraJobCard job={partial} />)
    expect(screen.getByRole('button', { name: /Reprendre/ })).toBeTruthy()
  })

  it('#2276.52 — pendant qu’il tourne, la carte relit la fiche (on peut fermer l’onglet et revenir)', async () => {
    vi.useFakeTimers()
    get.mockResolvedValue({ ...JOB, state: 'done' })
    render(<LauraJobCard job={{ ...JOB, state: 'running' }} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(get).toHaveBeenCalledWith(JOB.id)
    expect(screen.getByText('Terminé')).toBeTruthy()
  })
})

describe('LauraJobCard — la prévisualisation avant « Confirmer » (#2276.46 / .47 / .49 / .51)', () => {
  const READ = {
    key: 'read',
    label: 'Relire le dossier Thales',
    capability: 'read_workspace' as const,
    units: 1,
    dependsOn: [],
    requiresApproval: false,
    status: 'todo' as const,
    ...NO_PROOF,
  }
  const WITH_READ: LauraJobView = { ...JOB, brief: { ...JOB.brief, steps: [READ, ...JOB.brief.steps] } }

  it('.46 / .47 — distingue les données RÉUTILISÉES des actions NOUVELLES', () => {
    render(<LauraJobCard job={WITH_READ} />)
    expect(screen.getByText(/Réutilise ce que l’espace sait déjà : Relire le dossier Thales/)).toBeTruthy()
    expect(screen.getByText(/Fera du neuf : Analyser les filiales · Remonter dans le CRM/)).toBeTruthy()
  })

  it('NON — sans lecture de l’existant, aucune ligne « réutilise » (on n’affiche pas ce qu’on n’a pas)', () => {
    render(<LauraJobCard job={JOB} />)
    expect(screen.queryByText(/Réutilise ce que l’espace sait déjà/)).toBeNull()
  })

  it('.51 — nomme les limites servies par le contrat, jamais des chiffres écrits à l’écran', () => {
    render(<LauraJobCard job={WITH_READ} />)
    // #3860.1 — l'analyse est raccordée : elle vise les COMPTES du périmètre, et le dit quand il n'y en a pas.
    expect(screen.getByText(/« Analyser les filiales » : aucun compte dans le périmètre/)).toBeTruthy()
    // #3860.2 — les contacts de l'étape CRM viendront de l'analyse en amont.
    expect(
      screen.getByText(/« Remonter dans le CRM » : ses contacts viendront de l’étape « Analyser les filiales »/),
    ).toBeTruthy()
    // Les plafonds d'une fiche viennent de LAURA_JOB_LIMITS.
    expect(screen.getByText(/au plus 500 contacts et 200 comptes par travail/)).toBeTruthy()
  })

  it('.51 — au plus N contacts : le nombre que l’exécuteur traitera réellement', () => {
    const contacts = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
    const scoped: LauraJobView = {
      ...WITH_READ,
      brief: { ...WITH_READ.brief, scope: { ...WITH_READ.brief.scope, contactIds: contacts } },
    }
    render(<LauraJobCard job={scoped} />)
    expect(screen.getByText(/« Remonter dans le CRM » : au plus 1 contact/)).toBeTruthy()
  })

  it('#3860.1 — une étape à filtre sans filtre le dit AVANT le clic', () => {
    const memory = {
      ...READ,
      key: 'memory',
      label: 'Chercher dans la mémoire marché',
      capability: 'search_market_memory' as const,
    }
    const job: LauraJobView = { ...JOB, brief: { ...JOB.brief, steps: [memory] } }
    render(<LauraJobCard job={job} />)
    expect(screen.getByText(/« Chercher dans la mémoire marché » : aucun filtre/)).toBeTruthy()
  })

  it('.49 — la durée ne s’affiche que MESURÉE, avec sa base', () => {
    const measured: LauraJobView = {
      ...JOB,
      brief: { ...JOB.brief, estimatedDurationSeconds: 90, estimatedDurationBasis: 2 },
    }
    render(<LauraJobCard job={measured} />)
    expect(screen.getByText(/Durée prévue : 2 min, d’après 2 étapes mesurées/)).toBeTruthy()
  })

  it('NON — une durée sans base de mesure ne s’affiche pas (jamais inventée)', () => {
    const invented: LauraJobView = { ...JOB, brief: { ...JOB.brief, estimatedDurationSeconds: 600 } }
    render(<LauraJobCard job={invented} />)
    expect(screen.queryByText(/Durée prévue/)).toBeNull()
  })
})

/**
 * #3860.4 — DÉCISION LOUIS 09/10 : la synthèse est la DERNIÈRE étape du job —
 * ce qu'il a produit, avec ses liens, et ce qui a échoué ou reste `unknown`.
 */
describe('LauraJobCard — la synthèse (#3860.4)', () => {
  const ACCOUNT = '11111111-1111-4111-8111-111111111111'
  const CONTACT = '22222222-2222-4222-8222-222222222222'
  const DONE: LauraJobView = {
    ...JOB,
    state: 'partial',
    synthesis: {
      accounts: [{ id: ACCOUNT, name: 'Alstom' }],
      contacts: [{ id: CONTACT, name: 'Directrice des achats' }],
      messages: [{ id: 'm-1', label: 'Brouillon — DSI' }],
      failed: [],
      unknown: [{ key: 'crm', label: 'Remonter dans le CRM' }],
      errors: [],
    },
  }

  it('rend la synthèse en dernière étape, avec un lien par compte, contact et message', () => {
    render(<LauraJobCard job={DONE} />)
    const steps = screen.getAllByRole('listitem').map(item => item.textContent ?? '')
    expect(steps.some(text => text.includes('Synthèse'))).toBe(true)
    expect(screen.getByRole('link', { name: 'Alstom' })).toHaveAttribute('href', `/accounts/${ACCOUNT}`)
    expect(screen.getByRole('link', { name: 'Directrice des achats' })).toHaveAttribute('href', `/contacts/${CONTACT}`)
    expect(screen.getByRole('link', { name: 'Brouillon — DSI' })).toHaveAttribute('href', '/actions/sequences')
    expect(screen.getByText(/Remonter dans le CRM/, { selector: '[data-testid="laura-job-synthesis"] *' })).toBeTruthy()
  })

  it('NON : un job sans synthèse (encore en cours) n’en affiche aucune', () => {
    render(<LauraJobCard job={{ ...JOB, state: 'running' }} />)
    expect(screen.queryByTestId('laura-job-synthesis')).toBeNull()
  })
})

// #5045 — la forme V8 : statut dérivé de l'état réel, détail repliable, aucune durée inventée.
describe('LauraJobCard — recherche accompagnée V8 (#5045)', () => {
  const withSteps = (
    state: LauraJobView['state'],
    statuses: LauraJobView['brief']['steps'][number]['status'][],
    done: number,
  ) => ({
    ...JOB,
    state,
    progress: { done, total: statuses.length },
    brief: { ...JOB.brief, steps: JOB.brief.steps.map((s, i) => ({ ...s, status: statuses[i] ?? 'todo' })) },
  })

  it('en cours : kicker, étape courante lue au serveur, « 1 sur 2 », détail replié', () => {
    const { container } = render(<LauraJobCard job={withSteps('running', ['done', 'running'], 1)} />)
    expect(screen.getByText('Recherche en cours')).toBeTruthy()
    expect(screen.getByTestId('laura-work-current').textContent).toContain('Remonter dans le CRM')
    expect(screen.getByText('1 sur 2')).toBeTruthy()
    const details = container.querySelector('details')
    expect(details?.open).toBe(false)
    expect(details?.querySelector('summary')?.textContent).toContain('Voir le détail')
    // Les VRAIES étapes sont dans le détail, avec leur capacité nommée.
    expect(details?.textContent).toContain('Analyser les filiales')
    expect(details?.textContent).toContain('Analyse de compte')
  })

  it('terminé / interrompu : le kicker suit l’état réel', () => {
    const { rerender } = render(<LauraJobCard job={withSteps('done', ['done', 'done'], 2)} />)
    expect(screen.getByText('Recherche terminée')).toBeTruthy()
    rerender(<LauraJobCard job={withSteps('cancelled', ['done', 'todo'], 1)} />)
    expect(screen.getByText('Recherche interrompue à ta demande')).toBeTruthy()
  })

  it('avant lancement : étapes visibles, « Rien n’est lancé » gardé, aucun kicker', () => {
    const { container } = render(<LauraJobCard job={JOB} />)
    expect(container.querySelector('details')).toBeNull()
    expect(screen.getByText(/Rien n’est lancé/)).toBeTruthy()
    expect(screen.queryByText(/Recherche (en cours|terminée|interrompue)/)).toBeNull()
  })

  it('aucune durée inventée, aucun « Voir l’activité », aucun second Arrêter', () => {
    render(<LauraJobCard job={withSteps('running', ['running', 'todo'], 0)} />)
    expect(screen.queryByText(/Environ|Plus long que prévu|\d+\s?s\b|min/)).toBeNull()
    expect(screen.queryByText(/Voir l’activité/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Arrêter/ })).toBeNull()
  })
})
