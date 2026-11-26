import type { ActionPlanItem, BriefingAction } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCurrentLauraIntro, resetLauraIntro } from '@/features/laura/bubble/laura-intro-store'
import { useAccountLastOutcome } from '@/features/briefing/hooks/useAccountLastOutcome'
import { apiFetch } from '@/lib/api'
import { PriorityCard } from './PriorityCard'

// #3265.13 (épopée #3287) — la carte lit `useAccountLastOutcome` pour son dernier
// résultat déclaré ; les autres describe de ce fichier ne testent pas ce
// point et n'ont pas besoin de plus qu'une liste vide (le repli du hook réel
// sans session, byte-identique).
vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@/features/actions/hooks/usePlanItems', () => ({ usePlanItems: vi.fn(() => ({ items: [] })) }))

/**
 * #2397.7 — LE RETOUR UTILISATEUR, DEPUIS LA CARTE ELLE-MÊME.
 *
 * `ActionsBlock.test.tsx` mocke `useSetRoleFit` pour garder ses tests sur leur
 * propre invariant (le dépli) ; CE fichier teste le geste réel : le bouton
 * « prioritaire pour moi » POSTe `/briefing/role-fit` avec le genre de LA carte
 * cliquée, jamais un autre, et son état visuel suit l'axe `roleFit` déjà porté
 * par `rankingAxes` (#2397.2) — pas une seconde vérité (GA-26).
 */

vi.mock('@tanstack/react-router', () => ({
  // #2097.46 — `className` doit traverser le faux, sinon un test qui vérifie
  // le plancher tactile (`pointer-coarse:min-h-11`) du VRAI lien mesurerait un
  // attribut que le mock a lui-même effacé, jamais le composant réel.
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

const apiFetchMock = vi.mocked(apiFetch)

function card(partial: Partial<BriefingAction> & Pick<BriefingAction, 'id'>): BriefingAction {
  return {
    labelKey: 'briefing.actions.followUp',
    labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
    href: '/mailbox?intent=no_reply&thread=t1',
    kind: 'follow_up',
    priority: 4,
    fact: {
      labelKey: null,
      labelVars: {},
      provenance: { source: 'connector', capability: 'mailbox', observedAt: '2026-08-25T09:00:00.000Z' },
    },
    context: { labelKey: 'briefing.context.silence', labelVars: { count: 9 } },
    preparedArtifacts: [],
    expiresAt: null,
    businessObject: null,
    verdict: null,
    consequence: null,
    confidence: null,
    estimatedMinutes: null,
    rankingAxes: [],
    processingState: 'suggested',
    owner: null,
    permission: null,
    ...partial,
  }
}

function mount(
  action: BriefingAction,
  onOpenMeetingPrep?: (actionId: string) => void,
  onOpenConflict?: (action: BriefingAction) => void,
  extra: Partial<{
    onTransformToTask: (action: BriefingAction, headline: string) => void
    transformedToTask: boolean
    qualificationVerdict: 'GO' | 'PRUDENT' | 'NO-GO' | null
  }> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <PriorityCard
        action={action}
        rank={1}
        onOpenMeetingPrep={onOpenMeetingPrep}
        onOpenConflict={onOpenConflict}
        {...extra}
      />
    </QueryClientProvider>,
  )
}

// #2106.6 — une carte avec un `href` réel doit rendre un lien cliquable, pas
// un `<span/>` silencieux : `ctaKey && action.href` retombe à `undefined` tant
// que le genre n'a pas d'entrée dans `BRIEFING_ACTION_CTA` (`action-cta.ts`),
// même quand `href` est bien posé. Un producteur juste, un href juste, et
// pourtant rien à cliquer à l'écran — le motif que ce dépôt paie le plus.
describe('PriorityCard — un href réel s’ouvre (#2106.6)', () => {
  beforeEach(() => cleanup())

  it('consultant_available (href posé) rend un lien vers la fiche du consultant', () => {
    mount(card({ id: 'consultant-available:c-1', kind: 'consultant_available', href: '/consultants/c-1' }))
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/consultants/c-1')
  })
})

describe('PriorityCard — le geste « prioritaire pour moi » (#2397.7)', () => {
  beforeEach(() => {
    cleanup()
    apiFetchMock.mockReset()
    apiFetchMock.mockResolvedValue({ engaged: true })
  })

  it('non engagé (roleFit absent des axes) : le bouton se propose, pas encore marqué', () => {
    mount(card({ id: 'a1', kind: 'follow_up', rankingAxes: [{ axis: 'roleFit', evaluated: false }] }))
    expect(screen.getByRole('button', { name: /prioritaire pour mon rôle/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('engagé (roleFit évalué dans les axes) : le bouton reflète cet état, jamais une seconde vérité', () => {
    mount(card({ id: 'a1', kind: 'follow_up', rankingAxes: [{ axis: 'roleFit', evaluated: true }] }))
    expect(screen.getByRole('button', { name: /tes priorités/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('un clic POSTe le genre de CETTE carte avec engaged=true — jamais un autre genre', async () => {
    mount(card({ id: 'a1', kind: 'follow_up', rankingAxes: [{ axis: 'roleFit', evaluated: false }] }))
    fireEvent.click(screen.getByRole('button', { name: /prioritaire pour mon rôle/i }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/briefing/role-fit',
        method: 'POST',
        body: { kind: 'follow_up', engaged: true },
      }),
    )
  })

  it('un clic sur une carte déjà engagée RETIRE le geste (engaged=false)', async () => {
    mount(card({ id: 'a1', kind: 'account', rankingAxes: [{ axis: 'roleFit', evaluated: true }] }))
    fireEvent.click(screen.getByRole('button', { name: /tes priorités/i }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/briefing/role-fit',
        method: 'POST',
        body: { kind: 'account', engaged: false },
      }),
    )
  })
})

// #2105.24/.53 — « Transformer ce sujet en prochaine action ».
describe('PriorityCard — transformer en tâche (#2105.24, #2105.53)', () => {
  it('sans appelant qui le porte, la carte ne propose rien — pas de bouton mort', () => {
    mount(card({ id: 'a1' }))
    expect(screen.queryByRole('button', { name: /transformer/i })).not.toBeInTheDocument()
  })

  it('un clic transmet la carte ET son libellé affiché — jamais recalculés à part', () => {
    const onTransformToTask = vi.fn()
    mount(
      card({
        id: 'a1',
        kind: 'follow_up',
        labelKey: 'briefing.actions.followUp',
        labelVars: { counterpart: 'jean@acme.com', days: 9, subject: 'Proposition' },
        fact: null,
      }),
      undefined,
      undefined,
      { onTransformToTask },
    )
    fireEvent.click(screen.getByRole('button', { name: /transformer/i }))
    expect(onTransformToTask).toHaveBeenCalledTimes(1)
    const [passedAction, passedHeadline] = onTransformToTask.mock.calls[0] as [BriefingAction, string]
    expect(passedAction.id).toBe('a1')
    expect(typeof passedHeadline).toBe('string')
    expect(passedHeadline.length).toBeGreaterThan(0)
  })

  it('déjà transformée (#2105.53) : plus de bouton, un simple constat — pas de second clic possible', () => {
    mount(card({ id: 'a1' }), undefined, undefined, { onTransformToTask: vi.fn(), transformedToTask: true })
    expect(screen.queryByRole('button', { name: /transformer/i })).not.toBeInTheDocument()
    expect(screen.getByText('Déjà transformée en tâche')).toBeInTheDocument()
  })
})

// #2106.35 — la carte « meeting_prep » ouvre le MÊME dialogue que le bandeau
// « prochain rendez-vous », par une porte que `BriefingPage` fournit.
describe('PriorityCard — la porte « Préparer le rendez-vous » (#2106.35)', () => {
  function meetingCard(): BriefingAction {
    return card({
      id: 'meeting:evt-1',
      kind: 'meeting_prep',
      labelKey: 'briefing.actions.meetingPrep',
      labelVars: { subject: 'Point besoin', start: '2026-09-24T10:00:00.000Z' },
      href: null,
      preparedArtifacts: [
        {
          id: 'shortlist:evt-1',
          kind: 'shortlist',
          labelKey: 'briefing.artifacts.meetingAttendees',
          labelVars: { count: 2 },
          href: null,
          businessObject: null,
          preparedAt: null,
          version: 1,
          source: null,
          status: 'ready',
          preparedBy: 'laura',
          creditsCost: null,
        },
      ],
    })
  }

  it('sans callback, l’artefact reste un CONSTAT — aucun bouton', () => {
    mount(meetingCard())
    expect(screen.queryByRole('button', { name: /participants externes/i })).not.toBeInTheDocument()
    expect(screen.getByText(/2 participants externes identifiés/i)).toBeInTheDocument()
  })

  it('avec callback, l’artefact devient un BOUTON qui ouvre CETTE carte-ci', () => {
    const onOpenMeetingPrep = vi.fn()
    mount(meetingCard(), onOpenMeetingPrep)
    fireEvent.click(screen.getByRole('button', { name: /2 participants externes identifiés/i }))
    expect(onOpenMeetingPrep).toHaveBeenCalledWith('meeting:evt-1')
  })

  it('les AUTRES genres de carte ne gagnent pas de bouton, même avec le callback', () => {
    const onOpenMeetingPrep = vi.fn()
    mount(
      card({
        id: 'a1',
        kind: 'follow_up',
        preparedArtifacts: [
          {
            id: 'd1',
            kind: 'draft_message',
            labelKey: 'briefing.artifacts.draft',
            labelVars: {},
            href: null,
            businessObject: null,
            preparedAt: null,
            version: 1,
            source: null,
            status: 'ready',
            preparedBy: 'laura',
            creditsCost: null,
          },
        ],
      }),
      onOpenMeetingPrep,
    )
    expect(screen.queryByRole('button', { name: /artifacts.draft/i })).not.toBeInTheDocument()
  })
})

/**
 * #2095.57 — LA MOITIÉ CONVERSATIONNELLE DE « POURQUOI CE RANG ».
 *
 * La moitié structurelle (quels axes ont pesé) a déjà sa garde plus haut
 * (`ActionsBlock.test.tsx`, #2099.43-47). Celle-ci prouve la moitié qui
 * manquait : la carte passe SON contexte à `AskLaura`, pas une question
 * générique. `AskLaura` dépose dans le magasin partagé (`laura-intro-store`)
 * — sur desktop, une instance SEULE se retire de l'écran pour laisser la
 * bulle prendre le relais (#1812), donc la preuve se lit dans le DÉPÔT, pas
 * dans un lien affiché (même patron que `AskLaura.test.tsx`).
 */
function IntroReader() {
  const intro = useCurrentLauraIntro()
  return <span data-testid="intro">{intro ? `${intro.question}|${intro.label}|${intro.accountId ?? ''}` : 'rien'}</span>
}

/**
 * #2097 — LA RECETTE ÉCRAN DU 25/09/2026 A RÉFUTÉ TROIS POINTS SUR CETTE CARTE.
 *
 * `r6-verdicts.md` : (1) bordure identique que la carte porte « Urgent » ou
 * « Important » — seule une pastille interne changeait (#2097.23) ; (2) 0
 * `role`/0 `aria-label` sur le conteneur carte, aucun repère pour un lecteur
 * d'écran (#2097.52) ; (3) `animation: none`, aucun mouvement d'arrivée câblé
 * (#2097.34).
 */
describe('PriorityCard — hiérarchie de recette du 25/09 (#2097)', () => {
  beforeEach(() => cleanup())

  it('#2097.52 — porte role="article" et un nom accessible qui cite la priorité', () => {
    mount(card({ id: 'a1', kind: 'follow_up' }))
    const article = screen.getByRole('article')
    const label = article.getAttribute('aria-label') ?? ''
    expect(label).toContain('Important')
    expect(label).toContain('jean@acme.com')
  })

  it('#2097.23 — la bordure porte la tonalité sémantique : urgent ≠ important ≠ administratif', () => {
    mount(card({ id: 'urgent-1', kind: 'conflict' }))
    const urgentClass = screen.getByRole('article').className
    cleanup()
    mount(card({ id: 'important-1', kind: 'follow_up' }))
    const importantClass = screen.getByRole('article').className
    cleanup()
    mount(card({ id: 'admin-1', kind: 'task' }))
    const administrativeClass = screen.getByRole('article').className

    expect(urgentClass).toContain('border-[var(--danger-soft-border)]')
    expect(importantClass).toContain('border-[var(--warning-soft-border)]')
    expect(administrativeClass).toContain('border-[var(--bellum-border)]')
    expect(urgentClass).not.toBe(importantClass)
    expect(importantClass).not.toBe(administrativeClass)
  })

  it('#2097.34 — arrive avec le mouvement d’entrée de la grammaire du dépôt (MOTION.enterFromBelow)', () => {
    mount(card({ id: 'a1' }))
    const article = screen.getByRole('article')
    // framer-motion applique l'état `initial` en style inline dès le montage
    // — même vérification que `OnboardingWizard.test.tsx` (#2021.10).
    expect(article.style.opacity).not.toBe('')
  })

  // #2097.46 — CARTES UTILISABLES À UNE MAIN : le CTA principal, nu (un
  // `<Link>` ou un `<button>`, pas le `Button` partagé qui porte déjà le
  // plancher GA-30), doit quand même atteindre 44 px sous un doigt.
  it('#2097.46 — le CTA principal (lien) atteint 44 px sous pointer-coarse', () => {
    mount(card({ id: 'a1', kind: 'follow_up' }))
    const link = screen.getByRole('link', { name: /Préparer une relance/ })
    expect(link.className).toContain('pointer-coarse:min-h-11')
  })

  it('#2097.46 — le CTA principal (bouton conflit) atteint 44 px sous pointer-coarse', () => {
    mount(card({ id: 'conflict-1', kind: 'conflict', href: null }), undefined, () => {})
    const button = screen.getByRole('button', { name: /Voir les deux rendez-vous/ })
    expect(button.className).toContain('pointer-coarse:min-h-11')
  })

  // #2097.35 — LE SEUL geste que cette carte valide sur PLACE (marquer/retirer
  // « prioritaire pour moi », #2397.7) rejoue MOTION.confirm (« c'est fait »).
  it('#2097.35 — la bascule du VERDICT SERVEUR (rankingAxes) rejoue MOTION.confirm', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const notEngaged = card({ id: 'a1', kind: 'follow_up', rankingAxes: [{ axis: 'roleFit', evaluated: false }] })
    const engaged = card({ id: 'a1', kind: 'follow_up', rankingAxes: [{ axis: 'roleFit', evaluated: true }] })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <PriorityCard action={notEngaged} rank={1} />
      </QueryClientProvider>,
    )
    // Jamais un état optimiste posé au clic : c'est la MÊME prop qui change
    // ici qu'après le refetch réel qui suit un clic (#2397.2).
    rerender(
      <QueryClientProvider client={client}>
        <PriorityCard action={engaged} rank={1} />
      </QueryClientProvider>,
    )
    const button = screen.getByRole('button', { name: /tes priorités/i })
    // framer-motion applique l'état `initial` en style inline dès le montage
    // de l'élément dont la `key` vient de changer — même vérification que
    // #2097.34 juste au-dessus.
    expect(button.closest('span')?.style.opacity).not.toBe('')
  })
})

/**
 * #2097.21 — RECETTE ÉCRAN DU 25/09/2026 : `contact` et `talent` (consultant)
 * n'avaient AUCUN avatar sur cette carte, texte seul, alors que `account` en
 * portait déjà un. Chaque genre d'objet métier a maintenant SON repli — jamais
 * vide, jamais une photo inventée : `CompanyAvatar` pour un compte,
 * `ContactAvatar` (déjà utilisé fiche contact / vivier, GA-26) pour une
 * personne. Une mission n'a ni logo ni personne : elle garde son icône
 * actuelle, c'est-à-dire aucun avatar ici.
 */
describe('PriorityCard — l’avatar de l’objet métier (#2097.21)', () => {
  beforeEach(() => cleanup())

  it('compte : logo, ou son repli en monogramme via CompanyAvatar', () => {
    mount(
      card({
        id: 'a1',
        businessObject: { kind: 'account', id: 'acc-1', name: 'Damaris Industries', logoUrl: null, website: null },
      }),
    )
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('contact : aucun avatar dédié — initiales via ContactAvatar, jamais vide', () => {
    mount(
      card({
        id: 'a1',
        businessObject: { kind: 'contact', id: 'c-1', name: 'Sophie Marchand', logoUrl: null, website: null },
      }),
    )
    expect(screen.getByText('SM')).toBeInTheDocument()
  })

  it('talent (consultant) : initiales via ContactAvatar, jamais vide', () => {
    mount(
      card({
        id: 'a1',
        kind: 'consultant_available',
        businessObject: { kind: 'talent', id: 't-1', name: 'Karim Haddad', logoUrl: null, website: null },
      }),
    )
    expect(screen.getByText('KH')).toBeInTheDocument()
  })

  it('mission : aucun avatar — la carte garde son icône actuelle', () => {
    mount(
      card({
        id: 'a1',
        businessObject: { kind: 'mission', id: 'mission-1', name: 'Refonte SI', logoUrl: null, website: null },
      }),
    )
    expect(screen.getByText('Refonte SI')).toBeInTheDocument()
    expect(screen.queryByText('RS')).not.toBeInTheDocument()
    expect(screen.queryByText('R')).not.toBeInTheDocument()
  })
})

// #3749.2 — recette prod : la colonne « Grille de qualification » de la
// liste des comptes a un verdict ; rien ne le remontait sur /briefing. La
// carte lit `qualificationVerdict` (fusionné par `ActionsBlock`, GA-26) et
// l'affiche VERBATIM quand il existe, sans aucune ligne quand il manque —
// cette carte n'est pas une liste dense, « chaque facette disparaît quand
// la donnée manque » (doctrine en tête de fichier).
describe('PriorityCard — le verdict de la grille de qualification (#3749.2)', () => {
  beforeEach(() => cleanup())

  it.each(['GO', 'PRUDENT', 'NO-GO'] as const)('affiche le verdict %s quand il existe', verdict => {
    mount(
      card({ id: 'a1', businessObject: { kind: 'account', id: 'acc-1', name: 'Acme', logoUrl: null, website: null } }),
      undefined,
      undefined,
      {
        qualificationVerdict: verdict,
      },
    )
    expect(screen.getByText(`Grille de qualification : ${verdict}`)).toBeInTheDocument()
  })

  it('sans grille active ou sans compte évalué (null), aucune ligne — jamais un tiret ni une raison nommée', () => {
    mount(
      card({ id: 'a1', businessObject: { kind: 'account', id: 'acc-1', name: 'Acme', logoUrl: null, website: null } }),
      undefined,
      undefined,
      {
        qualificationVerdict: null,
      },
    )
    expect(screen.queryByText(/Grille de qualification/)).not.toBeInTheDocument()
  })

  it('sans appelant qui le passe (undefined), aucune ligne — comportement d’avant, byte-identique', () => {
    mount(
      card({ id: 'a1', businessObject: { kind: 'account', id: 'acc-1', name: 'Acme', logoUrl: null, website: null } }),
    )
    expect(screen.queryByText(/Grille de qualification/)).not.toBeInTheDocument()
  })
})

describe('PriorityCard — le contexte de la carte part avec « Pourquoi ? » (#2095.57)', () => {
  beforeEach(() => cleanup())
  afterEach(() => {
    cleanup()
    resetLauraIntro()
  })

  it('dépose une question qui porte le FAIT de cette carte, jamais une question générique', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <PriorityCard action={card({ id: 'a1' })} rank={1} />
        <IntroReader />
      </QueryClientProvider>,
    )
    const intro = screen.getByTestId('intro').textContent ?? ''
    expect(intro).toContain('jean@acme.com')
    expect(intro).toContain('|Pourquoi ?|')
  })

  it('emporte l’identifiant du compte quand la carte en mentionne un', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <PriorityCard
          action={card({
            id: 'a1',
            businessObject: { kind: 'account', id: 'acc-42', name: 'Acme', logoUrl: null, website: null },
          })}
          rank={1}
        />
        <IntroReader />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('intro')).toHaveTextContent(/\|acc-42$/)
  })

  it('n’emporte AUCUN identifiant quand l’objet de la carte n’est pas un compte', () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <PriorityCard
          action={card({
            id: 'a1',
            businessObject: { kind: 'mission', id: 'mission-1', name: 'Refonte', logoUrl: null, website: null },
          })}
          rank={1}
        />
        <IntroReader />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('intro')).toHaveTextContent(/\|$/)
  })
})

function planItem(over: Partial<ActionPlanItem>): ActionPlanItem {
  return {
    id: crypto.randomUUID(),
    account_id: 'acc-42',
    label: 'Appeler',
    contact_id: null,
    execution_status: 'todo',
    outcome: null,
    result: null,
    completed_at: null,
    due_date: null,
    reason: null,
    ...over,
  } as ActionPlanItem
}

/**
 * #3265.13 (épopée #3287) — LE DERNIER RÉSULTAT DÉCLARÉ du compte, lu sur
 * cette carte du tableau de bord Aujourd'hui, sur la même ligne que le Plan
 * de compte et la fiche Contact (`action_plan_items`).
 */
describe('PriorityCard — le dernier résultat déclaré du compte (#3265.13)', () => {
  beforeEach(() => cleanup())

  it('une action FAITE avec une issue sur le compte de la carte : la carte la nomme', () => {
    const done = planItem({
      execution_status: 'done',
      outcome: 'orientation_given',
      completed_at: '2026-09-20T10:00:00Z',
    })
    vi.mocked(useAccountLastOutcome).mockImplementation(id => (id === 'acc-42' ? done : null))
    mount(
      card({
        id: 'a1',
        businessObject: { kind: 'account', id: 'acc-42', name: 'Acme', logoUrl: null, website: null },
      }),
    )
    expect(screen.getByText('Dernier résultat déclaré : Introduction obtenue')).toBeInTheDocument()
  })

  it('aucune action faite avec une issue : aucune ligne (on n’affiche pas ce qu’on n’a pas)', () => {
    vi.mocked(useAccountLastOutcome).mockReturnValue(null)
    mount(
      card({
        id: 'a1',
        businessObject: { kind: 'account', id: 'acc-42', name: 'Acme', logoUrl: null, website: null },
      }),
    )
    expect(screen.queryByText(/Dernier résultat déclaré/)).not.toBeInTheDocument()
  })

  it('carte sans compte : aucune ligne, même si le hook a des items (autre compte)', () => {
    const done = planItem({ execution_status: 'done', outcome: 'positive', completed_at: '2026-09-20T10:00:00Z' })
    vi.mocked(useAccountLastOutcome).mockImplementation(id => (id ? done : null))
    mount(
      card({
        id: 'a1',
        businessObject: { kind: 'mission', id: 'mission-1', name: 'Refonte', logoUrl: null, website: null },
      }),
    )
    expect(screen.queryByText(/Dernier résultat déclaré/)).not.toBeInTheDocument()
  })
})
