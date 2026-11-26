import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ProjectRow } from '@bellum/contracts'

// Le tiroir monte de nombreux panneaux qui font leur propre requête réseau —
// hors sujet ici, où seul le HERO (#2171.7/.10/.12/.13/.14/.15) est visé.
// Les mocker garde le test rapide et concentré sur ce qu'il vérifie vraiment.
const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
const workspaceProfile = vi.hoisted(() => ({ value: null as string | null }))
vi.mock('@/features/profile/hooks/useWorkspaceProfile', () => ({ useWorkspaceProfile: () => workspaceProfile.value }))
vi.mock('./ProjectFramingBlock', () => ({ ProjectFramingBlock: () => <div data-testid="project-framing" /> }))
vi.mock('./BtmmpPanel', () => ({ BtmmpPanel: () => null }))
vi.mock('./ProjectSectorsPanel', () => ({ ProjectSectorsPanel: () => null }))
vi.mock('./ProjectAmountControl', () => ({ ProjectAmountControl: () => null }))
vi.mock('@/features/activities/view/TimelinePanel', () => ({ TimelinePanel: () => null }))
vi.mock('@/features/submissions/view/SubmissionsPanel', () => ({ SubmissionsPanel: () => null }))
vi.mock('@/features/chains/view/ChainProgressBlock', () => ({ ChainProgressBlock: () => null }))
vi.mock('./ProjectNeedsPanel', () => ({ ProjectNeedsPanel: () => null }))
vi.mock('./ProjectStepsPanel', () => ({ ProjectStepsPanel: () => null }))
vi.mock('./ProjectSynthesisPanel', () => ({ ProjectSynthesisPanel: () => null }))
vi.mock('./ProjectDocumentsPanel', () => ({ ProjectDocumentsPanel: () => null }))
vi.mock('./LostDealRexPanel', () => ({ LostDealRexPanel: () => null }))
vi.mock('./LostDealCaseDimensions', () => ({ LostDealCaseDimensions: () => null }))
vi.mock('./LostDealDecisionOrganisation', () => ({
  LostDealDecisionOrganisation: () => null,
  LostDealComparableLosses: () => null,
}))
vi.mock('./ProjectStageControl', () => ({ ProjectStageControl: () => null }))
vi.mock('./ProjectOwnerControl', () => ({ ProjectOwnerControl: () => null }))
vi.mock('./ForecastCategoryField', () => ({ ProjectForecastCategoryControl: () => null }))
vi.mock('./ProjectContactsPanel', () => ({ ProjectContactsPanel: () => null }))
vi.mock('./ProjectPartnerGovernancePanel', () => ({ ProjectPartnerGovernancePanel: () => null }))
vi.mock('../hooks/useProjectOwners', () => ({
  useProjectOwners: () => ({ selfId: null, ownerName: (id: string | null) => (id === 'u-1' ? 'Alice Martin' : null) }),
}))
// #2170.24 — le mock capture ce qui est envoyé à `useCreateTask`, sans requête
// réseau : ce test vise le CONTRÔLE, pas la mutation elle-même (déjà testée
// dans `useTasks.test.ts`).
const createTaskMutate = vi.fn()
vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useCreateTask: () => ({ mutate: createTaskMutate, isPending: false }),
}))
// #2171.37 — capture l'appel d'export CRM, sans requête réseau (déjà testé
// dans `useExportProjectToCrm.test.ts`).
const exportToCrmMutate = vi.fn()
vi.mock('../hooks/useExportProjectToCrm', () => ({
  useExportProjectToCrm: () => ({ mutate: exportToCrmMutate, isPending: false }),
}))
// #2171.39 — capture l'appel d'archivage, sans requête réseau (déjà testé
// dans `projects.archive.spec.ts` côté API).
const archiveOpportunityMutate = vi.fn()
vi.mock('../hooks/useArchiveOpportunity', () => ({
  useArchiveOpportunity: () => ({ mutate: archiveOpportunityMutate, isPending: false }),
}))
// #2170.29 — capture ce qui est déclaré à Laura, sans monter le vrai composant
// (qui suppose des magasins non fournis par ce test de HERO).
const askLauraProps: { question: string; label: string; accountId?: string }[] = []
vi.mock('@/components/primitives/AskLaura', () => ({
  AskLaura: (props: { question: string; label: string; accountId?: string }) => {
    askLauraProps.push({ question: props.question, label: props.label, accountId: props.accountId })
    return <span data-testid="ask-laura">{props.label}</span>
  },
}))
vi.mock('@/features/tasks/view/TaskComposer', () => ({
  TaskComposer: ({
    initialTitle,
    onSubmit,
  }: {
    initialTitle?: string
    onSubmit: (draft: { title: string; dueOn: string }) => void
  }) => (
    <div data-testid="task-composer">
      <span data-testid="task-composer-initial-title">{initialTitle ?? ''}</span>
      <button type="button" onClick={() => onSubmit({ title: initialTitle || 'Relancer', dueOn: '2026-09-30' })}>
        Valider
      </button>
    </div>
  ),
}))
// #4291.8 — les missions du compte, pilotées par test (le lien projet → mission est `opportunity_id`).
const accountMissions = vi.hoisted(() => ({ value: { missions: [] } as unknown }))
vi.mock('@/features/missions/api', () => ({ useMissions: () => ({ data: accountMissions.value }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// Un vrai avatar dessine un canvas de rendu complexe qu'un test de HERO n'a
// pas à vérifier deux fois (`CompanyAvatar` a ses propres tests) : un témoin
// nommé suffit à prouver qu'il est monté DANS le hero, pas ailleurs.
vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: ({ name }: { name: string }) => <div data-testid="company-avatar">{name}</div>,
}))

const { ProjectPropertiesContent } = await import('./ProjectPropertiesContent')

function project(over: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'p-1',
    account_id: 'a-1',
    company_name: 'ACME',
    sector: null,
    logo_url: null,
    website: null,
    kind: 'pain',
    label: 'Migration data lake',
    detail: null,
    offer: null,
    source: null,
    confidence: null,
    urgency: null,
    stage: 'qualified',
    stage_entered_at: new Date().toISOString(),
    owner_id: null,
    expected_close_on: null,
    closed_at: null,
    outcome: null,
    loss_reason: null,
    first_detected_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z',
    amount_cents: null,
    ...over,
  } as ProjectRow
}

// Radix `Sheet` portale son contenu dans `document.body`, hors du conteneur
// que `render()` rend : chercher dans `container` renvoie toujours `null`,
// pour une raison qui n'a rien à voir avec ce que le test vise à vérifier.
function stickyHeader(): HTMLElement {
  const node = document.body.querySelector('[data-slot="opportunity-primary"]')
  expect(node).not.toBeNull()
  return node as HTMLElement
}

// #3420 (X76) — le hero (owner, dates, prochaine action, confiance, gestes) défile
// avec le contenu ; seul l'en-tête compact (`stickyHeader`) reste collé.
function hero(): HTMLElement {
  const node = document.body.querySelector('[data-slot="opportunity-hero"]')
  expect(node).not.toBeNull()
  return node as HTMLElement
}

/**
 * #2171.7 / .10 / .12 / .13 / .14 / .15 (lot W20, registre 16/09) — LE HERO
 * DU DOSSIER OPPORTUNITÉ dit compte+logo, owner, confiance, date de création,
 * dernière activité et prochaine action — DANS le hero (`data-slot=
 * "sheet-header"`), pas ailleurs sur l'écran défilant.
 */
describe('ProjectPropertiesContent — le hero dit qui, quand, avec quelle preuve', () => {
  it("affiche l'owner dans le hero (#2171.10)", () => {
    render(<ProjectPropertiesContent project={project({ owner_id: 'u-1' })} />)
    expect(hero().textContent).toContain('Alice Martin')
  })

  it('affiche la confiance DANS le hero, pas seulement plus bas (#2171.12)', () => {
    render(<ProjectPropertiesContent project={project({ confidence: 'high', source: 'pain' })} />)
    expect(hero().textContent).toMatch(/Confiance élevée|Élevée/i)
  })

  it('affiche la date de création dans le hero (#2171.13)', () => {
    render(<ProjectPropertiesContent project={project({ first_detected_at: '2026-06-01T00:00:00.000Z' })} />)
    expect(hero().textContent).toMatch(/juin 2026|1 juin/i)
  })

  it('affiche la dernière activité dans le hero (#2171.14)', () => {
    render(<ProjectPropertiesContent project={project({ updated_at: '2026-09-10T00:00:00.000Z' })} />)
    expect(hero().textContent).toMatch(/10 sept|septembre 2026/i)
  })

  it('affiche la prochaine action dans le hero quand elle existe (#2171.15)', () => {
    render(
      <ProjectPropertiesContent
        project={project({ next_action: { title: 'Relancer le client', due_on: '2026-09-25' } })}
      />,
    )
    expect(hero().textContent).toContain('Relancer le client')
  })
})

/**
 * #2170.24 — AJOUTER UNE PROCHAINE ACTION depuis le tiroir de l'opportunité.
 * `next_action` n'était qu'une LECTURE ; le contrôle ouvre le même
 * compositeur que celui des comptes (#2150.22, `TaskComposer`) et crée une
 * tâche rattachée au PROJET (`projectId`), jamais une seconde saisie.
 */
describe('ProjectPropertiesContent — ajouter une prochaine action (#2170.24)', () => {
  it('ouvre le compositeur et crée une tâche rattachée au projet', () => {
    createTaskMutate.mockClear()
    render(<ProjectPropertiesContent project={project()} />)

    fireEvent.click(screen.getByRole('button', { name: /prochaine action/i }))
    expect(screen.getByTestId('task-composer')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(createTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Relancer', dueOn: '2026-09-30', projectId: 'p-1' }),
      expect.anything(),
    )
  })
})

/**
 * #4194 — le bouton Laura vit dans l'en-tête du panneau (`RecordPanel`), UN seul :
 * ces propriétés n'en portent plus aucun.
 */
describe('ProjectPropertiesContent — aucun bouton Laura (#4194)', () => {
  it('ne monte pas AskLaura — le panneau en porte un seul', () => {
    askLauraProps.length = 0
    render(<ProjectPropertiesContent project={project({ label: 'Migration data lake', account_id: 'a-42' })} />)
    expect(askLauraProps).toHaveLength(0)
  })
})

/**
 * #2324.37 — LE RISQUE DE L'AFFAIRE, sur la fiche : écrit à l'écran ou proposé
 * par Laura. Absent : AUCUNE ligne (« on n'affiche pas ce qu'on n'a pas »).
 */
describe('ProjectPropertiesContent — les risques (#2324.37)', () => {
  it('montre les risques écrits', () => {
    render(<ProjectPropertiesContent project={project({ risks: 'Budget 2027 non voté' })} />)
    const block = document.body.querySelector('[data-testid="project-risks"]')
    expect(block?.textContent).toContain('Risques')
    expect(block?.textContent).toContain('Budget 2027 non voté')
  })

  it('sans risque écrit : aucune ligne, ni titre ni « aucun »', () => {
    render(<ProjectPropertiesContent project={project({ risks: null })} />)
    expect(document.body.querySelector('[data-testid="project-risks"]')).toBeNull()
  })
})

/**
 * #3266.1 (#3292, tranché sans Louis) — LE GRAIN équipe/site/projet, sur la
 * fiche : saisi à la création. Absent : AUCUNE ligne, même règle que risques.
 */
describe('ProjectPropertiesContent — le grain équipe/site/projet (#3266.1, #3292)', () => {
  it('montre le grain saisi', () => {
    render(<ProjectPropertiesContent project={project({ scope_label: 'Équipe Data / Site Lyon' })} />)
    const block = document.body.querySelector('[data-testid="project-scope-label"]')
    expect(block?.textContent).toContain('Périmètre')
    expect(block?.textContent).toContain('Équipe Data / Site Lyon')
  })

  it('sans grain saisi : aucune ligne', () => {
    render(<ProjectPropertiesContent project={project({ scope_label: null })} />)
    expect(document.body.querySelector('[data-testid="project-scope-label"]')).toBeNull()
  })
})

/**
 * #2171.37 — EXPORTER VERS LE CRM, depuis la fiche canonique de l'opportunité.
 * `POST /projects/:id/export-crm` et `useExportProjectToCrm` existaient déjà,
 * montés ailleurs (`NeedsAccountSheet.tsx`) — jamais sur ce tiroir.
 */
describe('ProjectPropertiesContent — exporter vers le CRM (#2171.37)', () => {
  it("pousse CE projet à l'export CRM", () => {
    exportToCrmMutate.mockClear()
    render(<ProjectPropertiesContent project={project({ id: 'p-42' })} />)

    fireEvent.click(screen.getByRole('button', { name: /Ajouter au CRM/i }))
    expect(exportToCrmMutate).toHaveBeenCalledWith('p-42')
  })
})

/**
 * #2171.21 — SECTION « CONDITIONS COMMERCIALES ». `BtmmpPanel` couvrait déjà
 * le contenu (budget/timing/mission/management/process) ; aucun bloc ne le
 * nommait comme tel.
 */
describe('ProjectPropertiesContent — la section conditions commerciales (#2171.21)', () => {
  it('nomme le bloc qui porte la qualification BTMMP', () => {
    render(<ProjectPropertiesContent project={project()} />)
    const heading = document.body.querySelector('[data-testid="commercial-conditions-heading"]')
    expect(heading?.textContent).toContain('Conditions commerciales')
  })
})

/**
 * #2171.16 — L'ACTION PRINCIPALE DYNAMIQUE, dans le hero. Un seul CTA, dont
 * le texte change avec l'étape — jamais les boutons FIXES d'avant.
 */
describe('ProjectPropertiesContent — action principale dynamique (#2171.16)', () => {
  it('« Qualifier l’affaire » sur une opportunité détectée', () => {
    render(<ProjectPropertiesContent project={project({ stage: 'detected' })} />)
    expect(stickyHeader().textContent).toContain('Qualifier l’affaire')
  })

  it('« Lancer le matching » une fois le besoin confirmé', () => {
    render(<ProjectPropertiesContent project={project({ stage: 'confirmed' })} />)
    expect(stickyHeader().textContent).toContain('Lancer le matching')
  })

  it('« Préparer l’entretien » quand un entretien est prévu', () => {
    render(<ProjectPropertiesContent project={project({ stage: 'profiles_submitted', interview_count: 1 })} />)
    expect(stickyHeader().textContent).toContain('Préparer l’entretien')
  })

  it("aucun CTA principal sur une affaire perdue — le bouton d'avant n'existe plus, aucun ne le remplace", () => {
    render(<ProjectPropertiesContent project={project({ stage: 'lost' })} />)
    expect(stickyHeader().textContent).not.toContain('Qualifier l’affaire')
    expect(stickyHeader().textContent).not.toContain('Lancer le matching')
  })
})

/**
 * #2171.39 — ARCHIVER l'opportunité, un geste distinct de `lost`/`dormant`.
 */
describe('ProjectPropertiesContent — archiver (#2171.39)', () => {
  it('une opportunité active propose « Archiver », jamais de pastille', () => {
    render(<ProjectPropertiesContent project={project({ archived_at: null })} />)
    expect(hero().textContent).toContain('Archiver')
    expect(hero().textContent).not.toContain('Archivée')
  })

  it('archive CETTE opportunité au clic', () => {
    archiveOpportunityMutate.mockClear()
    render(<ProjectPropertiesContent project={project({ id: 'p-7', archived_at: null })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Archiver' }))
    expect(archiveOpportunityMutate).toHaveBeenCalledWith({ id: 'p-7', archived: true })
  })

  it('une opportunité archivée porte la pastille et propose « Désarchiver »', () => {
    render(<ProjectPropertiesContent project={project({ archived_at: '2026-09-20T00:00:00.000Z' })} />)
    expect(hero().textContent).toContain('Archivée')
    expect(hero().textContent).toContain('Désarchiver')
  })
})

/**
 * #2171.38 — PARTAGER, équivalent à `onShare` de la fiche besoin
 * (`NeedDetailPage.tsx`) : copier le lien du dossier canonique, jamais un
 * second mécanisme de partage.
 */
describe('ProjectPropertiesContent — partager (#2171.38)', () => {
  it('copie le lien du dossier canonique de CETTE opportunité', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ProjectPropertiesContent project={project({ id: 'p-9' })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Partager' }))
    await Promise.resolve()

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/projects/p-9'))
  })
})

/**
 * #2171.35 — PLANIFIER UN RENDEZ-VOUS. Même compositeur que « Créer une
 * tâche » (#2170.24, #2171.36) — une tâche datée EST un rendez-vous, et
 * BellumAI n'a aucun connecteur calendrier (agent_docs/env-reference.md) : un
 * second objet ferait une deuxième file à côté de celle qui existe déjà.
 * Seul l'intitulé pré-rempli distingue les deux gestes.
 */
describe('ProjectPropertiesContent — planifier un rendez-vous (#2171.35)', () => {
  it('ouvre le compositeur avec un intitulé de rendez-vous pré-rempli', () => {
    render(<ProjectPropertiesContent project={project()} />)

    fireEvent.click(screen.getByRole('button', { name: /rendez-vous/i }))
    expect(screen.getByTestId('task-composer-initial-title').textContent).toBe('Rendez-vous')
  })

  it('crée une tâche rattachée au projet, distincte de la prochaine action libre', () => {
    createTaskMutate.mockClear()
    render(<ProjectPropertiesContent project={project({ id: 'p-3' })} />)

    fireEvent.click(screen.getByRole('button', { name: /rendez-vous/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    expect(createTaskMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Rendez-vous', projectId: 'p-3' }),
      expect.anything(),
    )
  })
})

/**
 * #2171.17 — SECTION « SYNTHÈSE ET DÉCISION ACTUELLE ». Même geste que
 * #2171.19/.21 : NOMMER un regroupement qui existait déjà (le contexte et les
 * risques, chacun affiché séparément) plutôt que recalculer un second bloc —
 * « on n'affiche pas ce qu'on n'a pas » : aucun titre sur un dossier qui n'a
 * ni contexte ni risque écrit.
 */
describe('ProjectPropertiesContent — section « Synthèse et décision actuelle » (#2171.17)', () => {
  it('nomme le regroupement quand le contexte ou les risques existent', () => {
    render(<ProjectPropertiesContent project={project({ detail: 'Migrer 40 To vers le cloud' })} />)
    const heading = document.body.querySelector('[data-testid="current-synthesis-heading"]')
    expect(heading?.textContent).toContain('Synthèse et décision actuelle')
  })

  it('aucune ligne sans contexte ni risque écrit', () => {
    render(<ProjectPropertiesContent project={project({ detail: null, risks: null })} />)
    expect(document.body.querySelector('[data-testid="current-synthesis-heading"]')).toBeNull()
  })
})

/**
 * #3420 (X76) / #4194 — la zone collée du contenu ne garde que l'action principale ;
 * le hero défile et porte les gestes secondaires, sans bouton Laura.
 */
describe('ProjectPropertiesContent — hero (#3420, #4194)', () => {
  it('le hero qui défile porte les gestes secondaires, sans Laura', () => {
    render(<ProjectPropertiesContent project={project()} />)
    expect(hero().querySelector('[data-testid="ask-laura"]')).toBeNull()
    expect(hero().querySelectorAll('button, a').length).toBeGreaterThan(3)
  })
})

/**
 * #4194 (L3) — LES GESTES DE NAVIGATION déménagés avec `ProjectDetailSheet` :
 * mêmes conditions, mêmes destinations qu'avant la suppression du tiroir.
 */
describe('ProjectPropertiesContent — gestes de navigation (#1453, #1327, #4194)', () => {
  it('« Préparer la proposition » ouvre le studio avec CE dossier, tant qu’il n’est ni gagné ni perdu', () => {
    navigateMock.mockClear()
    render(<ProjectPropertiesContent project={project({ id: 'p-9', stage: 'qualified' })} />)
    fireEvent.click(screen.getByRole('button', { name: /Préparer la proposition/ }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/propositions', search: { project: 'p-9' } })
  })

  it.each(['won', 'lost'] as const)('aucune « Préparer la proposition » sur un dossier %s', stage => {
    render(<ProjectPropertiesContent project={project({ stage })} />)
    expect(screen.queryByRole('button', { name: /Préparer la proposition/ })).toBeNull()
  })

  it('gagné sans mission : « Créer la mission » part de CE projet', () => {
    navigateMock.mockClear()
    render(<ProjectPropertiesContent project={project({ id: 'p-3', stage: 'won', has_mission: false })} />)
    fireEvent.click(screen.getByRole('button', { name: /Créer la mission/ }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/missions/nouvelle', search: { project_id: 'p-3' } })
  })

  // #4291.8 — gagné AVEC mission : le détail NOMME la mission et y mène ; il n'en crée aucune.
  it('gagné avec mission : « Suivi comme mission — <nom> », lien vers sa fiche, pas de création', () => {
    accountMissions.value = { missions: [{ id: 'm-5', label: 'ROCHE — squad data', opportunity_id: 'p-4' }] }
    render(<ProjectPropertiesContent project={project({ id: 'p-4', stage: 'won', has_mission: true })} />)
    const link = screen.getByRole('link', { name: /Suivi comme mission — ROCHE — squad data/ })
    expect(link).toHaveAttribute('href', '/missions/$id')
    expect(screen.queryByRole('button', { name: /Créer la mission/ })).toBeNull()
    accountMissions.value = { missions: [] }
  })

  it('gagné, mission du même client mais d’un autre projet : pas de lien nommé', () => {
    accountMissions.value = { missions: [{ id: 'm-6', label: 'Autre', opportunity_id: 'p-99' }] }
    render(<ProjectPropertiesContent project={project({ id: 'p-4', stage: 'won', has_mission: true })} />)
    expect(screen.queryByText(/Suivi comme mission/)).toBeNull()
    accountMissions.value = { missions: [] }
  })
})

/**
 * #4499 (arbitrage Louis 24/10) — la carte du pipe est ALLÉGÉE (maquette V22) : le badge de preuve, l'objectif et
 * l'alerte de stagnation n'y sont plus. Ils n'avaient pas d'autre chemin : ils se lisent donc ICI, dans le hero du
 * détail (jamais une fonction perdue). L'origine et le besoin principal y étaient déjà (ProjectProvenanceLine, panneau
 * des besoins).
 */
describe('ProjectPropertiesContent — ce que la carte allégée a laissé au détail (#4499)', () => {
  it('le niveau de preuve se lit dans le hero', () => {
    render(
      <ProjectPropertiesContent
        project={{
          ...project(),
          // `evidence` est servi par `GET /projects` (ProjectReadRow), pas porté par le type de ligne de base.
          evidence: {
            level: 'confirmed_demand',
            requirement: { fr: 'Une demande formulée', en: 'A stated demand' },
            missing: [],
          },
        }}
      />,
    )
    expect(hero().textContent).toContain('Besoin exprimé')
  })

  it('l’objectif se lit dans le hero quand quelqu’un l’a écrit — et aucune ligne sinon', () => {
    const { unmount } = render(<ProjectPropertiesContent project={project({ objective: 'Réduire les coûts cloud' })} />)
    expect(hero().textContent).toContain('Réduire les coûts cloud')
    unmount()
    render(<ProjectPropertiesContent project={project({ objective: null })} />)
    expect(hero().textContent).not.toMatch(/Objectif/)
  })

  it('l’alerte de stagnation se lit dans le hero, et se tait sur une affaire récente', () => {
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString()
    const { unmount } = render(<ProjectPropertiesContent project={project({ stage_entered_at: old })} />)
    expect(hero().textContent).toMatch(/40 jours sans mouvement/)
    unmount()
    render(<ProjectPropertiesContent project={project({ stage_entered_at: new Date().toISOString() })} />)
    expect(hero().textContent).not.toMatch(/sans mouvement/)
  })
})
// #4291.7 (recette 23/10, démo forfait) — le parcours SERVI : en espace forfait / conseil, une demande confirmée n'offre
// pas « Lancer le matching » en action principale, elle se cadre ; en staffing, rien ne change.
describe('ProjectPropertiesContent — espace forfait / conseil (#4291.7)', () => {
  it('forfait : « Cadrer le projet » à la place de « Lancer le matching », et le bloc périmètre / sponsor / budget est monté', () => {
    workspaceProfile.value = 'forfait_conseil'
    render(<ProjectPropertiesContent project={project({ stage: 'confirmed' })} />)
    expect(screen.getByRole('button', { name: 'Cadrer le projet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lancer le matching' })).toBeNull()
    expect(screen.getByTestId('project-framing')).toBeInTheDocument()
    workspaceProfile.value = null
  })

  it('NON : espace staffing, « Lancer le matching » reste l’action principale et aucun bloc de cadrage', () => {
    workspaceProfile.value = 'staffing'
    render(<ProjectPropertiesContent project={project({ stage: 'confirmed' })} />)
    expect(screen.getByRole('button', { name: 'Lancer le matching' })).toBeInTheDocument()
    expect(screen.queryByTestId('project-framing')).toBeNull()
    workspaceProfile.value = null
  })
})
