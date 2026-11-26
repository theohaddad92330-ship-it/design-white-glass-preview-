import { BRIEFING_ACTIONS_SHOWN } from '@bellum/contracts'
import type { AgendaEvent, BriefingAction, BriefingArtifact } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * LES CARTES DU MATIN — ce qu'elles montrent, et ce qu'elles refusent de
 * montrer.
 *
 * Ces tests tiennent des INVARIANTS, pas des phrases : « le dépli dit le compte
 * réel » plutôt que « le dépli dit 2 ». Un test qui épingle une ligne se casse
 * à l'intégration ; un test qui épingle une règle survit au renommage suivant.
 *
 * Les deux moitiés qui comptent :
 *  - ce que la carte AJOUTE quand la donnée existe (le fait, sa source, sa
 *    date, sa péremption) ;
 *  - ce qu'elle N'ÉCRIT PAS quand elle manque — pas de source inventée, pas de
 *    date du jour posée par défaut, pas de « rien de préparé » en gris.
 */

vi.mock('@/features/briefing/hooks/useAccountLastOutcome', () => ({ useAccountLastOutcome: vi.fn(() => null) }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

// #2397.7 — `PriorityCard` (rendue par `ActionsBlock`) lit désormais le retour
// utilisateur via `useSetRoleFit` (`useMutation`/`useQueryClient`), qui exige
// un `QueryClientProvider` — hors du périmètre de CE fichier, qui teste le
// dépli et le bandeau, pas le geste « prioritaire pour moi » (couvert par
// `PriorityCard.test.tsx`). Mocké pour garder ces tests sur leur invariant.
vi.mock('../api', () => ({
  useSetRoleFit: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCardDisposition: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

// #2102.1/#2102.2/#2390.11/#2390.12 — `ConflictDialog` (ouverte par la carte
// de conflit) lit désormais `useAgendaStatus`/`useRescheduleEvent`
// (`useQuery`/`useMutation`), qui exigent un `QueryClientProvider` — même mock
// que `ConflictDialog.test.tsx`, pour garder CE fichier sur son invariant (le
// clic ouvre les deux rendez-vous) sans monter un vrai client.
vi.mock('@/features/agenda/api', () => ({
  useAgendaStatus: () => ({ data: undefined }),
  useRescheduleEvent: () => ({ mutate: vi.fn(), isPending: false }),
}))

// #2105.24/.53 — même raison : la transformation en tâche (`useTasks`,
// `useCreateTask`) exige elle aussi un `QueryClientProvider`. Le geste et la
// garde de dédup ont leur propre fichier (`ActionsBlock.transform.test.tsx`) ;
// ici on garde l'invariant du dépli indépendant de tout réseau.
vi.mock('@/features/tasks/hooks/useTasks', () => ({
  useTasks: () => ({ data: [] }),
  useCreateTask: () => ({ mutate: vi.fn(), isPending: false }),
}))

// #3265.13 (épopée #3287) — la carte lit désormais `usePlanItems` (dernier
// résultat déclaré du compte), même exigence de `QueryClientProvider` que
// `useTasks` juste au-dessus ; ce fichier n'a pas ce point pour objet.
vi.mock('@/features/actions/hooks/usePlanItems', () => ({
  usePlanItems: () => ({ items: [] }),
}))

// #3749.2 — même raison : `useQualificationSummary` (`useQuery`) exige lui
// aussi un `QueryClientProvider`. Le rendu du verdict a son propre test
// (`ActionsBlock.qualificationVerdict.test.tsx`) ; ce fichier n'a pas ce
// point pour objet.
vi.mock('@/features/accounts/view/accounts-list/useQualificationSummary', () => ({
  useQualificationSummary: () => ({ data: [] }),
}))

const { ActionsBlock } = await import('./ActionsBlock')

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
    // #2095 / #2099 — les sept facettes du contrat canonique. Toutes à leur
    // valeur d'ABSENCE ici : ces tests-ci mesurent les quatre champs d'origine,
    // et une facette remplie par défaut leur ferait mesurer autre chose.
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

// #2106.12 à #2106.19 — les sept champs dédiés d'un artefact, à leur valeur
// neutre : ces tests-ci mesurent les CINQ champs d'origine (id/kind/labelKey/
// labelVars/href), une facette remplie par défaut leur ferait mesurer autre
// chose.
function artifact(
  partial: Partial<BriefingArtifact> & Pick<BriefingArtifact, 'id' | 'kind' | 'labelKey'>,
): BriefingArtifact {
  return {
    labelVars: {},
    href: null,
    businessObject: null,
    preparedAt: null,
    version: 1,
    source: null,
    status: 'ready',
    preparedBy: 'laura',
    creditsCost: null,
    ...partial,
  }
}

/** `n` cartes distinctes — de quoi dépasser le nombre rendu d'emblée. */
function cards(n: number): BriefingAction[] {
  return Array.from({ length: n }, (_, index) => card({ id: `a${index}` }))
}

/**
 * #2098.3 — LE MESSAGE CALME, EXACT.
 *
 * L'issue #2098 cite littéralement « Ta journée est calme avec les sources
 * actuellement lisibles. » quand il n'y a aucune vraie priorité. #2098.4
 * (déjà là) exige déjà de NE JAMAIS le dire si une source est indisponible —
 * c'est ce que `everySourceReady` porte : ce test couvre le libellé, pas la
 * condition, déjà testée ailleurs (`BriefingPage.test.tsx`).
 */
describe('#2098.3 — le message calme quand il n’y a rien d’urgent', () => {
  it('dit le libellé exact quand les sources sont lisibles', () => {
    render(<ActionsBlock actions={[]} everySourceReady />)

    expect(screen.getByText('Ta journée est calme avec les sources actuellement lisibles.')).toBeInTheDocument()
  })
})

describe('ActionsBlock — le dépli dit le compte RÉEL', () => {
  it('ne rend que les premières cartes et replie le reste', () => {
    render(<ActionsBlock actions={cards(BRIEFING_ACTIONS_SHOWN + 2)} everySourceReady />)
    // Le rang est écrit dans chaque carte : compter les rangs compte les cartes.
    expect(screen.getAllByText(String(BRIEFING_ACTIONS_SHOWN))).toHaveLength(1)
    expect(screen.queryByText(String(BRIEFING_ACTIONS_SHOWN + 1))).not.toBeInTheDocument()
  })

  it('annonce DEUX autres actions quand il y en a deux', () => {
    render(<ActionsBlock actions={cards(BRIEFING_ACTIONS_SHOWN + 2)} everySourceReady />)
    expect(screen.getByText(/et 2 autres actions/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2 autres/i })).toBeInTheDocument()
  })

  it('passe au SINGULIER quand il n’en reste qu’une — jamais un « 2 » en dur', () => {
    // Le défaut que ce test existe pour empêcher : un compte écrit en dur ment
    // un jour sur deux, et personne ne le voit.
    render(<ActionsBlock actions={cards(BRIEFING_ACTIONS_SHOWN + 1)} everySourceReady />)
    expect(screen.getByText(/et 1 autre action/i)).toBeInTheDocument()
    expect(screen.queryByText(/2 autres/i)).not.toBeInTheDocument()
  })

  it('ne montre aucun dépli quand tout tient à l’écran', () => {
    render(<ActionsBlock actions={cards(3)} everySourceReady />)
    expect(screen.queryByText(/autres? actions?/i)).not.toBeInTheDocument()
  })

  it('déplie les cartes cachées au clic — et le geste est un vrai bouton', () => {
    // « Ce qui se clique se tabule » : un `<div onClick>` n'a ni tabulation ni
    // Entrée ni annonce. `getByRole('button')` échouerait sur un `<div>`.
    render(<ActionsBlock actions={cards(BRIEFING_ACTIONS_SHOWN + 2)} everySourceReady />)
    fireEvent.click(screen.getByRole('button', { name: /2 autres/i }))
    expect(screen.getByText(String(BRIEFING_ACTIONS_SHOWN + 2))).toBeInTheDocument()
  })
})

/**
 * #2107 (Centre d'actions, recette écran du 25/09/2026) — un genre entier
 * (mission sans date, profil sans retour, exigence AO non couverte…) pouvait
 * être évincé par `BRIEFING_ACTIONS_MAX` SANS AUCUN lien nulle part : le
 * dépli ci-dessus ne peut jamais le montrer, il ne reçoit que les 7 places
 * déjà classées par le serveur. `totalCandidateCount` (compte non plafonné,
 * `GET /briefing/actions`) est ce qui permet à l'écran de le DIRE.
 */
describe('ActionsBlock — le lien vers le Centre d’actions au-delà du plafond (#2107)', () => {
  it('aucun lien quand le total ne dépasse pas ce qui est déjà affiché', () => {
    render(
      <ActionsBlock
        actions={cards(BRIEFING_ACTIONS_SHOWN + 2)}
        everySourceReady
        totalCandidateCount={BRIEFING_ACTIONS_SHOWN + 2}
      />,
    )
    expect(screen.queryByText(/Centre d'actions/)).not.toBeInTheDocument()
  })

  it('aucun lien tant que le compte total n’a pas répondu — jamais un compte deviné', () => {
    render(<ActionsBlock actions={cards(BRIEFING_ACTIONS_SHOWN + 2)} everySourceReady />)
    expect(screen.queryByText(/Centre d'actions/)).not.toBeInTheDocument()
  })

  // #2097 (correctif du 26/09) — UN SEUL « voir plus » à la fois, mesuré sur
  // iPhone en prod : ce lien et le bouton local « Voir les N autres »
  // rendaient tous les deux en permanence. Quand le bouton local existe
  // (`hidden.length > 0`, le cas ici), le lien ne se découvre plus qu'APRÈS
  // avoir déplié la liste.
  it('reste ABSENT tant que la liste locale n’est pas dépliée — un seul « voir plus » à la fois', () => {
    const actions = cards(BRIEFING_ACTIONS_SHOWN + 2)
    render(<ActionsBlock actions={actions} everySourceReady totalCandidateCount={actions.length + 5} />)
    expect(screen.queryByText(/Centre d'actions/)).not.toBeInTheDocument()
  })

  it('apparaît sous la liste DÉPLIÉE, avec son libellé fixe — le compte reste porté par le bouton local', () => {
    const actions = cards(BRIEFING_ACTIONS_SHOWN + 2)
    render(<ActionsBlock actions={actions} everySourceReady totalCandidateCount={actions.length + 5} />)
    fireEvent.click(screen.getByRole('button', { name: /voir les 2 autres/i }))
    const link = screen.getByText("Tout voir dans le Centre d'actions")
    expect(link.closest('a')).toHaveAttribute('href', '/actions')
  })

  it('sans bouton local (aucune carte repliée ICI), le lien reste visible — seule porte disponible', () => {
    // BRIEFING_ACTIONS_SHOWN cartes ou moins : `hidden` est vide, aucun
    // dépli local n'existe pour faire doublon avec ce lien.
    const actions = cards(BRIEFING_ACTIONS_SHOWN)
    render(<ActionsBlock actions={actions} everySourceReady totalCandidateCount={actions.length + 5} />)
    expect(screen.getByText("Tout voir dans le Centre d'actions")).toBeInTheDocument()
  })
})

describe('ActionsBlock — le bandeau', () => {
  it('promet que rien ne sera envoyé — aucun artefact préparé', () => {
    render(<ActionsBlock actions={cards(6)} everySourceReady />)
    expect(screen.getByText(/rien ne sera envoyé/i)).toBeInTheDocument()
  })

  // #2401.6 — le résumé distingue PRÉPARÉ d'ENVOYÉ, au passé : ce qui a été
  // préparé (compté sur les artefacts RÉELS des cartes, jamais deviné) n'a
  // pas été envoyé pour autant.
  it('#2401.6 — compte les artefacts préparés et précise que rien n’a été envoyé', () => {
    const prepared = card({
      id: 'a',
      preparedArtifacts: [artifact({ id: 'd1', kind: 'draft_message', labelKey: 'briefing.artifacts.draft' })],
    })
    render(<ActionsBlock actions={[prepared, card({ id: 'b' })]} everySourceReady />)
    expect(screen.getByText(/1 élément préparé/i)).toBeInTheDocument()
    expect(screen.getByText(/rien n’a été envoyé/i)).toBeInTheDocument()
    // La promesse générique (au futur) ne s'affiche plus doublée avec la
    // nouvelle phrase — une seule affirmation « rien n'est parti », pas deux.
    expect(screen.queryByText(/rien ne sera envoyé/i)).not.toBeInTheDocument()
  })

  it('#2401.6 — accorde le pluriel quand plusieurs artefacts sont préparés', () => {
    const a = card({
      id: 'a',
      preparedArtifacts: [artifact({ id: 'd1', kind: 'draft_message', labelKey: 'briefing.artifacts.draft' })],
    })
    const b = card({
      id: 'b',
      preparedArtifacts: [
        artifact({
          id: 'shortlist:m1',
          kind: 'shortlist',
          labelKey: 'briefing.artifacts.meetingAttendees',
          labelVars: { count: 3 },
        }),
      ],
    })
    render(<ActionsBlock actions={[a, b]} everySourceReady />)
    expect(screen.getByText(/2 éléments préparés/i)).toBeInTheDocument()
  })

  it('ne nomme QUE les sources réellement lues par les cartes', () => {
    // Une liste figée annoncerait « agenda » à quelqu'un dont aucun agenda
    // n'est branché : le bandeau affirmerait une lecture qui n'a pas eu lieu.
    render(<ActionsBlock actions={[card({ id: 'a' })]} everySourceReady />)
    // La ligne du bandeau, pas n'importe quelle mention : la provenance de la
    // carte nomme elle aussi la capacité, et chercher le mot les confondrait.
    const sources = screen.getByText(/^Sources :/)
    expect(sources.textContent).toMatch(/ta messagerie/i)
    expect(sources.textContent).not.toMatch(/ton agenda/i)
  })

  it('dit qu’aucune source n’est lisible plutôt que d’en inventer une', () => {
    render(<ActionsBlock actions={[card({ id: 'a', fact: null })]} everySourceReady />)
    expect(screen.getByText(/aucune source lisible/i)).toBeInTheDocument()
  })
})

describe('ActionsBlock — ce qu’une carte refuse d’écrire', () => {
  it('n’affiche AUCUNE provenance quand la carte ne sait pas d’où vient son fait', () => {
    render(<ActionsBlock actions={[card({ id: 'a', fact: null })]} everySourceReady />)
    // Aucune des quatre sources possibles, aucune date, aucune capacité : la
    // carte n'écrit rien plutôt que « détecté par Bellum ».
    expect(screen.queryByText(/lu dans un outil connecté/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/calculé par l’analyse|calculé par l'analyse/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ta messagerie/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/date inconnue/i)).not.toBeInTheDocument()
  })

  it('dit que la date est INCONNUE plutôt que d’écrire celle du jour', () => {
    const undated = card({
      id: 'a',
      fact: {
        labelKey: null,
        labelVars: {},
        provenance: { source: 'connector', capability: 'mailbox', observedAt: null },
      },
    })
    render(<ActionsBlock actions={[undated]} everySourceReady />)
    expect(screen.getByText(/date inconnue/i)).toBeInTheDocument()
  })

  it('ne montre pas de bloc « préparation » quand rien n’est prêt', () => {
    render(<ActionsBlock actions={[card({ id: 'a' })]} everySourceReady />)
    expect(screen.queryByText(/préparation disponible/i)).not.toBeInTheDocument()
  })

  it('montre « préparation disponible » dès qu’un artefact existe', () => {
    // L'autre moitié de la règle : le bloc n'est pas mort, il attend un
    // producteur. Sans ce test, le champ pourrait ne jamais s'afficher.
    const prepared = card({
      id: 'a',
      preparedArtifacts: [artifact({ id: 'd1', kind: 'draft_message', labelKey: 'briefing.artifacts.draft' })],
    })
    render(<ActionsBlock actions={[prepared]} everySourceReady />)
    expect(screen.getByText(/préparation disponible/i)).toBeInTheDocument()
  })

  it('nomme CE QUI est prêt, avec son compte — pas seulement qu’il y a quelque chose', () => {
    // #2106.2 — le producteur d'artefacts compose `labelKey` + `labelVars`
    // côté serveur. Sans cette lecture, l'écran jetait les deux : le champ
    // était calculé, renvoyé, et personne ne l'affichait.
    const prepared = card({
      id: 'a',
      preparedArtifacts: [
        artifact({
          id: 'shortlist:m1',
          kind: 'shortlist',
          labelKey: 'briefing.artifacts.meetingAttendees',
          labelVars: { count: 3 },
        }),
      ],
    })
    render(<ActionsBlock actions={[prepared]} everySourceReady />)
    expect(screen.getByText(/3 participants externes identifiés/i)).toBeInTheDocument()
  })

  it('accorde le singulier quand un seul participant externe est connu', () => {
    const prepared = card({
      id: 'a',
      preparedArtifacts: [
        artifact({
          id: 'shortlist:m1',
          kind: 'shortlist',
          labelKey: 'briefing.artifacts.meetingAttendees',
          labelVars: { count: 1 },
        }),
      ],
    })
    render(<ActionsBlock actions={[prepared]} everySourceReady />)
    expect(screen.getByText(/1 participant externe identifié/i)).toBeInTheDocument()
  })

  it('n’affiche pas d’échéance quand rien ne date la fin du fait', () => {
    render(<ActionsBlock actions={[card({ id: 'a', expiresAt: null })]} everySourceReady />)
    expect(screen.queryByText(/valable jusqu/i)).not.toBeInTheDocument()
  })

  it('affiche l’échéance quand elle est connue', () => {
    render(<ActionsBlock actions={[card({ id: 'a', expiresAt: '2026-09-01T08:00:00.000Z' })]} everySourceReady />)
    expect(screen.getByText(/valable jusqu/i)).toBeInTheDocument()
  })

  it('ne propose AUCUN geste sur une carte sans destination', () => {
    // Un conflit d'agenda n'a pas d'écran où atterrir : lui promettre un lien
    // se lit comme une panne au premier clic.
    render(
      <ActionsBlock
        actions={[
          card({ id: 'a', kind: 'conflict', href: null, labelKey: 'briefing.actions.conflict', labelVars: {} }),
        ]}
        everySourceReady
      />,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('nomme le geste, et le verbe CHANGE selon la carte', () => {
    render(
      <ActionsBlock
        actions={[
          card({ id: 'a' }),
          card({
            id: 'b',
            kind: 'account',
            labelKey: 'briefing.actions.freshSignal',
            labelVars: { company: 'ACME' },
            href: '/accounts/1',
          }),
        ]}
        everySourceReady
      />,
    )
    expect(screen.getByText(/préparer une relance/i)).toBeInTheDocument()
    expect(screen.getByText(/analyser l’opportunité|analyser l'opportunité/i)).toBeInTheDocument()
  })
})

// #2106.21 — le bloc COMPACT, distinct des cartes : une seule question, « qu'a
// préparé BellumAI pour moi ? », sans avoir à ouvrir chacune des cinq cartes.
//
// ⚠️ Il ne RÉPÈTE PAS l'étiquette exacte que la carte affiche déjà (GA-26,
// « rien n'apparaît deux fois sous la même forme ») : il compte les artefacts
// PAR NATURE (un brouillon, une liste courte, une check-list), une phrase que
// la carte, elle, ne dit jamais.
describe('ActionsBlock — « BellumAI a préparé pour toi » (#2106.21)', () => {
  it('n’apparaît PAS quand aucun artefact n’est prêt — pas de bloc vide', () => {
    render(<ActionsBlock actions={cards(3)} everySourceReady />)
    expect(screen.queryByText(/a préparé/i)).not.toBeInTheDocument()
  })

  it('compte CE QUI est prêt par nature, distinct de l’étiquette de la carte', () => {
    const prepared = card({
      id: 'a',
      preparedArtifacts: [
        artifact({
          id: 'shortlist:m1',
          kind: 'shortlist',
          labelKey: 'briefing.artifacts.meetingAttendees',
          labelVars: { count: 3 },
        }),
      ],
    })
    render(<ActionsBlock actions={[prepared, card({ id: 'b' })]} everySourceReady />)
    expect(screen.getByText(/a préparé/i)).toBeInTheDocument()
    expect(screen.getByText(/1 liste courte prête/i)).toBeInTheDocument()
    // La carte, elle, garde SA propre étiquette — les deux coexistent sans
    // se confondre : `getByText` échouerait s'il y avait deux fois la MÊME
    // chaîne dans le document.
    expect(screen.getByText(/3 participants externes identifiés/i)).toBeInTheDocument()
  })

  it('regroupe plusieurs artefacts de la MÊME nature sous un seul compte', () => {
    const prepared = card({
      id: 'a',
      preparedArtifacts: [
        artifact({ id: 'd1', kind: 'draft_message', labelKey: 'briefing.artifacts.draft' }),
        artifact({ id: 'd2', kind: 'draft_message', labelKey: 'briefing.artifacts.draft' }),
      ],
    })
    render(<ActionsBlock actions={[prepared]} everySourceReady />)
    expect(screen.getByText(/2 brouillons prêts/i)).toBeInTheDocument()
  })
})

describe('ActionsBlock — quand il n’y a rien', () => {
  it('distingue « journée calme » de « je n’ai pas pu regarder »', () => {
    const { rerender } = render(<ActionsBlock actions={[]} everySourceReady />)
    // #2098.3 — libellé exact.
    expect(screen.getByText('Ta journée est calme avec les sources actuellement lisibles.')).toBeInTheDocument()
    rerender(<ActionsBlock actions={[]} everySourceReady={false} />)
    expect(screen.getByText(/pas toutes connectées/i)).toBeInTheDocument()
  })
})

// #2389.6 — chaque carte porte une des quatre étiquettes (urgent / important /
// opportunité / administratif), jamais un cinquième mot ni aucune.
describe('ActionsBlock — l’étiquette d’urgence (#2389.6)', () => {
  it('un conflit d’agenda porte l’étiquette URGENT', () => {
    render(<ActionsBlock actions={[card({ id: 'a', kind: 'conflict' })]} everySourceReady />)
    expect(screen.getByText('Urgent')).toBeInTheDocument()
  })

  it('une tâche générique porte l’étiquette ADMINISTRATIF, jamais URGENT', () => {
    render(<ActionsBlock actions={[card({ id: 'a', kind: 'task' })]} everySourceReady />)
    expect(screen.getByText('Administratif')).toBeInTheDocument()
    expect(screen.queryByText('Urgent')).not.toBeInTheDocument()
  })

  it('un signal frais de compte porte l’étiquette OPPORTUNITÉ', () => {
    render(
      <ActionsBlock
        actions={[
          card({ id: 'a', kind: 'account', labelKey: 'briefing.actions.freshSignal', labelVars: { company: 'ACME' } }),
        ]}
        everySourceReady
      />,
    )
    expect(screen.getByText('Opportunité')).toBeInTheDocument()
  })
})

// #2102.1 / #2102.2 — la carte de conflit ouvre désormais un VRAI geste :
// aucune route n'existe (`href` reste `null`), mais un clic montre les deux
// rendez-vous plutôt que de rester un constat sans CTA.
describe('ActionsBlock — le conflit ouvre les deux rendez-vous (#2102.1, #2102.2)', () => {
  function agendaEvent(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id'>): AgendaEvent {
    return {
      summary: 'Point client',
      description: null,
      location: null,
      start: '2026-08-03T09:00:00.000Z',
      end: '2026-08-03T10:00:00.000Z',
      organizer: 'moi@bellum.fr',
      attendees: [],
      conferenceUrl: null,
      webUrl: null,
      status: 'confirmed',
      isExternal: true,
      cancelled: false,
      ...partial,
    }
  }

  const first = agendaEvent({ id: 'e1', summary: 'Point ACME' })
  const second = agendaEvent({ id: 'e2', summary: 'Point Decathlon', start: '2026-08-03T09:20:00.000Z' })
  const conflictAction = card({
    id: 'conflict:e1:e2',
    kind: 'conflict',
    href: null,
    labelKey: 'briefing.actions.conflict',
    labelVars: { first: 'Point ACME', second: 'Point Decathlon', minutes: 10 },
  })

  it('sans les deux rendez-vous en entrée, la carte reste un simple constat (aucune régression)', () => {
    render(<ActionsBlock actions={[conflictAction]} everySourceReady />)
    expect(screen.queryByText('Voir les deux rendez-vous')).not.toBeInTheDocument()
  })

  it('un clic sur « Voir les deux rendez-vous » montre les deux, avec leur titre', () => {
    render(
      <ActionsBlock actions={[conflictAction]} everySourceReady conflicts={[{ first, second, overlapMinutes: 10 }]} />,
    )
    fireEvent.click(screen.getByText('Voir les deux rendez-vous'))
    expect(screen.getByText('Point ACME')).toBeInTheDocument()
    expect(screen.getByText('Point Decathlon')).toBeInTheDocument()
  })
})
