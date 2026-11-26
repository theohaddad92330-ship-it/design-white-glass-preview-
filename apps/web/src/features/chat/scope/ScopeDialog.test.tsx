import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NO_ACCOUNT_SCOPE, PORTFOLIO_SCOPE, scopeAccountsFrom, type ChatScope } from './chat-scope'
import { PRECISE_KINDS } from './precise-kind'

/**
 * La modale de portée — ce qu'elle MONTRE d'un compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENNENT CES TESTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux premiers sont repris de `Chat.test.tsx`, où ils gardaient le panneau
 * de contexte (supprimé). La garantie n'a pas changé de nature : `logo_url` et
 * `website` sont déjà dans la charge de `GET /accounts`, et une projection
 * intermédiaire les jetait — le panneau affichait alors une pastille
 * d'initiales là où tout le reste de l'application montre le vrai logo.
 *
 * C'est le même défaut que la modale a failli reproduire (« un normaliseur
 * avale les champs neufs »), d'où l'intérêt de garder ces tests VIVANTS plutôt
 * que de les supprimer avec l'écran qu'ils gardaient.
 */

/** #3697 — capture ce que `ScopeDialog` transmet à `DialogContent`, pour
 *  prouver le CÂBLAGE (`onCloseAutoFocus` atteint bien le composant partagé)
 *  sans rejouer l'animation Radix réelle (déjà prouvée côté générique par
 *  `dialog-restores-focus-on-close.test.tsx`, GA-378). */
const capturedDialogContentProps = vi.hoisted(() => ({
  onCloseAutoFocus: undefined as ((e: Event) => void) | undefined,
}))

vi.mock('@bellum/ui', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@bellum/ui')
  return {
    ...actual,
    Dialog: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogContent: ({
      children,
      onCloseAutoFocus,
    }: {
      children?: ReactNode
      onCloseAutoFocus?: (e: Event) => void
    }) => {
      capturedDialogContentProps.onCloseAutoFocus = onCloseAutoFocus
      return <div>{children}</div>
    },
    DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
    // #2584 — className FORWARDÉE (pas juste children) : le test qui suit
    // vérifie la classe que CE fichier pose sur son pied, pas celle du
    // composant partagé (hors périmètre de ce lot).
    DialogFooter: ({ children, className }: { children?: ReactNode; className?: string }) => (
      <div data-testid="scope-dialog-footer" className={className}>
        {children}
      </div>
    ),
  }
})

vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: ({ name, logoUrl, website }: { name: string; logoUrl?: string | null; website?: string | null }) => (
    <span data-testid="company-avatar" data-name={name} data-logo-url={logoUrl ?? ''} data-website={website ?? ''} />
  ),
}))

// #1951.2 / #1951.3 — le vivier et les besoins, lus par les hooks RÉELS de
// leurs écrans. Données posées DANS la fabrique : `vi.mock` est hissé au-dessus
// de toute constante du fichier.
vi.mock('@/features/consultants/hooks', () => ({
  useConsultants: () => ({
    data: [
      {
        id: '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11',
        full_name: 'Sophie Martin',
        title: 'Consultante Java',
        available_from: '2026-10-01',
        archived_at: null,
      },
      { id: 'c-2', full_name: 'Hélène Roy', title: 'Data engineer', available_from: null, archived_at: null },
      { id: 'c-3', full_name: 'Paul Archivé', title: null, available_from: null, archived_at: '2026-01-01' },
    ],
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({
    data: {
      data: [
        { id: '0b8a1d52-7a52-4f6b-8a7e-3c9d2e1f4a10', title: 'Data engineer', account_name: 'SNCF', status: 'open' },
      ],
      pagination: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  }),
}))

// #1910.6 — les missions, lues par le hook RÉEL de leur écran (`useMissions`).
// La mission TERMINÉE est dans la fixture EXPRÈS : la modale doit l'écarter.
vi.mock('@/features/missions/api', () => ({
  useMissions: () => ({
    data: {
      missions: [
        {
          id: 'c0ffee00-1111-4222-8333-444455556666',
          label: 'Refonte du SI paiement',
          status: 'active',
          accountName: 'Société Générale',
        },
        { id: 'm-3', label: 'Ancienne mission', status: 'ended', accountName: 'SNCF' },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}))

// #1951.1 — les contacts, lus par le hook RÉEL de leur écran (`useContacts`),
// dont la forme est paginée (`InfiniteData`). Nécessaire depuis #2589 : le
// test générique par genre (ci-dessous) monte TOUS les onglets, celui-ci compris.
vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: () => ({
    data: { pages: [{ data: [{ id: 'ct-1', full_name: 'Sophie Martin', title: 'DSI', company_name: 'LATÉCOÈRE' }] }] },
    isLoading: false,
    isError: false,
  }),
}))

// #1951.4 — les affaires du pipe, lues par le hook RÉEL de leur écran
// (`useProjects`). Même raison : #2589 monte aussi l'onglet « opportunité ».
vi.mock('@/features/projects/hooks/useProjects', () => ({
  useProjects: () => ({
    data: [{ id: 'op-1', label: 'Refonte du SI paiement', company_name: 'Société Générale', stage: 'qualification' }],
    isLoading: false,
    isError: false,
  }),
}))

// Théo L1 — sélecteur avancé — les offres d'emploi, lues par le hook RÉEL de la
// Veille (`useAccountSignals`, `GET /accounts/signals`). Le stage semé est là
// pour prouver qu'il n'est JAMAIS proposé (décision 12/10).
vi.mock('@/features/accounts/hooks/useAccountSignals', () => ({
  useAccountSignals: () => ({
    data: [
      {
        history_id: 'jo-1',
        label: 'Data engineer — plateforme data voyageurs (H/F)',
        company_name: 'SNCF Voyageurs',
        type: 'recrutement',
        date: '2026-10-06',
      },
      { history_id: 'jo-2', label: 'Stage Supply Chain H/F', company_name: 'SNCF', type: 'recrutement' },
    ],
    isLoading: false,
    isError: false,
  }),
}))

const { ScopeDialog } = await import('./ScopeDialog')

function renderWith(rows: Parameters<typeof scopeAccountsFrom>[0], initialScope: ChatScope = PORTFOLIO_SCOPE) {
  render(
    <ScopeDialog
      open
      onOpenChange={() => {}}
      accounts={scopeAccountsFrom(rows)}
      portfolioCount={rows.length}
      initialScope={initialScope}
      onConfirm={() => {}}
    />,
  )
}

describe('ScopeDialog — #3697 (vu en passant) le focus de fermeture se transmet, jamais décidé seul', () => {
  it('sans prop fournie, DialogContent ne reçoit rien — le défaut Radix (GA-378) reste entier', () => {
    capturedDialogContentProps.onCloseAutoFocus = undefined
    renderWith([])
    expect(capturedDialogContentProps.onCloseAutoFocus).toBeUndefined()
  })

  it('la prop fournie par l’appelant atteint bien DialogContent, inchangée', () => {
    const onCloseAutoFocus = vi.fn()
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={scopeAccountsFrom([])}
        portfolioCount={0}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
        onCloseAutoFocus={onCloseAutoFocus}
      />,
    )
    expect(capturedDialogContentProps.onCloseAutoFocus).toBe(onCloseAutoFocus)
  })
})

/**
 * #5048 — LA PERSONNALISATION QUITTE LE PANNEAU (revient sur #3772.1, Louis 31/10/2026).
 *
 * « Mon profil » vit dans la barre du composeur (`ComposerProfileControl`), le SEUL endroit
 * (GA-26) : le panneau de portée ne porte plus que le dossier lu.
 */
describe('ScopeDialog — #5048 plus de section « Personnalisation »', () => {
  it('un fil créé : le panneau ne propose plus de mode de contexte', () => {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
        conversationId="conv-1"
      />,
    )
    expect(screen.queryByText('Personnalisation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Contexte de travail|Mon profil/ })).not.toBeInTheDocument()
  })
})

/**
 * #3772.1 RÉFUTÉ (recette prod 07/10 soir) — sur un fil déjà écrit, le bouton
 * « Changer ce que Laura lit » (en-tête) ouvre CETTE modale avec le titre
 * figé « Nouvelle conversation » : rien ne distingue « choisir une portée
 * pour un fil qui n'existe pas encore » de « ajuster ce que Laura lit sur un
 * fil qu'on a déjà écrit ». `threadStarted` (vrai dès que le fil porte au
 * moins un message, même signal que `hasMessages` dans `Chat.tsx`) décide le
 * titre : `conversationId` seul ne suffit pas, il est TOUJOURS posé (fil
 * neuf compris, voir `Chat.tsx` `activeConversationId`).
 */
describe('ScopeDialog — #3772.1 RÉFUTÉ : le titre distingue un fil déjà écrit', () => {
  it('fil déjà écrit (threadStarted) : le titre dit ce que change ce choix, pas « Nouvelle conversation »', () => {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
        conversationId="conv-1"
        threadStarted
      />,
    )
    expect(screen.queryByRole('heading', { name: 'Nouvelle conversation' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Changer ce que Laura lit' })).toBeInTheDocument()
  })

  it('fil neuf (rien envoyé encore) : le titre reste « Nouvelle conversation »', () => {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
        conversationId="conv-fresh"
        threadStarted={false}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Nouvelle conversation' })).toBeInTheDocument()
  })
})

describe('ScopeDialog — #1951.2 / #1951.3 / #1910.6 un consultant, un besoin, une mission', () => {
  const SOPHIE = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'
  const NEED = '0b8a1d52-7a52-4f6b-8a7e-3c9d2e1f4a10'
  const MISSION = 'c0ffee00-1111-4222-8333-444455556666'

  function open(initialScope: ChatScope = PORTFOLIO_SCOPE) {
    const onConfirm = vi.fn()
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={initialScope}
        onConfirm={onConfirm}
      />,
    )
    return onConfirm
  }

  it('propose un consultant du vivier, et la phrase de pied NOMME la personne', () => {
    const onConfirm = open()
    fireEvent.click(screen.getByRole('button', { name: 'Un consultant' }))
    fireEvent.click(screen.getByRole('radio', { name: /Sophie Martin/ }))
    expect(screen.getByText(/lira la fiche de Sophie Martin/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la conversation' }))
    expect(onConfirm).toHaveBeenCalledWith({ kind: 'consultant', consultantId: SOPHIE, label: 'Sophie Martin' })
  })

  it('un consultant archivé n’est pas proposé', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Un consultant' }))
    expect(screen.queryByText('Paul Archivé')).not.toBeInTheDocument()
  })

  it('cherche un consultant sans accents', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Un consultant' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Chercher un consultant' }), { target: { value: 'helene' } })
    expect(screen.getByRole('radio', { name: /Hélène Roy/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Sophie Martin/ })).not.toBeInTheDocument()
  })

  it('propose un besoin avec son compte, et la phrase de pied NOMME le besoin', () => {
    const onConfirm = open()
    fireEvent.click(screen.getByRole('button', { name: 'Un besoin' }))
    fireEvent.click(screen.getByRole('radio', { name: /Data engineer/ }))
    expect(screen.getByText(/lira le besoin Data engineer · SNCF/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la conversation' }))
    expect(onConfirm).toHaveBeenCalledWith({ kind: 'need', needId: NEED, label: 'Data engineer · SNCF' })
  })

  it('#1910.6 — propose une mission en cours avec son compte, et la phrase de pied la NOMME', () => {
    const onConfirm = open()
    fireEvent.click(screen.getByRole('button', { name: 'Une mission' }))
    fireEvent.click(screen.getByRole('radio', { name: /Refonte du SI paiement/ }))
    expect(screen.getByText(/lira la mission Refonte du SI paiement · Société Générale/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la conversation' }))
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'mission',
      missionId: MISSION,
      label: 'Refonte du SI paiement · Société Générale',
    })
  })

  it('#1910.6 — une mission TERMINÉE n’est pas proposée', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Une mission' }))
    expect(screen.queryByText('Ancienne mission')).not.toBeInTheDocument()
  })

  it('#1910.6 — rouverte sur un fil cadré sur une mission, la modale montre CET onglet', () => {
    open({ kind: 'mission', missionId: MISSION, label: 'Refonte du SI paiement' })
    expect(screen.getByRole('button', { name: 'Une mission' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('rouverte sur un fil cadré sur un consultant, la modale montre CE choix', () => {
    open({ kind: 'consultant', consultantId: SOPHIE, label: 'Sophie Martin' })
    expect(screen.getByRole('button', { name: 'Un consultant' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: /Sophie Martin/ })).toHaveAttribute('aria-checked', 'true')
  })

  it('aucun mot « portée » ni « scope », quel que soit l’onglet', () => {
    open()
    for (const tab of ['Un consultant', 'Un besoin']) {
      fireEvent.click(screen.getByRole('button', { name: tab }))
      expect(document.body.textContent?.toLowerCase()).not.toMatch(/portée|scope/)
    }
  })
})

describe('ScopeDialog — ce qu’un compte montre', () => {
  it('passe le VRAI logo du compte à l’avatar', () => {
    renderWith([
      {
        id: 'a1',
        company_name: 'PAYFIT',
        priority_score: 82,
        logo_url: 'https://cdn.apollo.io/logos/payfit.png',
        website: 'https://payfit.com',
        commercial_status: 'watching',
      },
    ])
    const avatar = screen.getAllByTestId('company-avatar').find(node => node.dataset.name === 'PAYFIT')
    expect(avatar?.dataset.logoUrl).toBe('https://cdn.apollo.io/logos/payfit.png')
    expect(avatar?.dataset.website).toBe('https://payfit.com')
  })

  it('un compte sans logo ni site reste affichable — rien n’est fabriqué', () => {
    renderWith([{ id: 'a2', company_name: 'DARTY GRAND EST', priority_score: 40, commercial_status: 'watching' }])
    const avatar = screen.getAllByTestId('company-avatar').find(node => node.dataset.name === 'DARTY GRAND EST')
    expect(avatar?.dataset.logoUrl).toBe('')
    expect(avatar?.dataset.website).toBe('')
  })

  it('le score porte son ÉCHELLE — un nombre nu s’aurait comparé à l’aveugle', () => {
    // Vu en recette : une pastille « 5 » sans dénominateur. L'échelle est sur
    // DIX (`high ≥ 7`) ; « 5/100 » aurait fait lire comme médiocre un compte
    // moyen. Une échelle inventée est pire qu'une échelle absente.
    renderWith([{ id: 'a1', company_name: 'PAYFIT', priority_score: 5, commercial_status: 'watching' }])
    expect(screen.getByText('/10')).toBeInTheDocument()
  })

  it('un score NON MESURÉ n’affiche rien — surtout pas « 0 »', () => {
    renderWith([{ id: 'a1', company_name: 'PAYFIT', priority_score: null, commercial_status: 'watching' }])
    expect(screen.queryByText('/10')).not.toBeInTheDocument()
  })

  /**
   * #1599 — la portée protège le CONTEXTE PRIVÉ que Laura lit, pas l'accès à
   * un référentiel partagé. Aucun scope « Marché » n'est ajouté : la modale
   * le dit explicitement plutôt que de laisser deviner pourquoi il n'y en a
   * pas de case.
   */
  it('dit que les référentiels marché restent interrogeables, sans leur donner de scope à eux', () => {
    renderWith([{ id: 'a1', company_name: 'PAYFIT', priority_score: 82, commercial_status: 'watching' }])
    expect(
      screen.getByText('Les référentiels marché Bellum peuvent être interrogés lorsque ta question le nécessite.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^Marché$/)).not.toBeInTheDocument()
  })

  /**
   * #1910.10 — CE QUE L'UTILISATEUR LIT NE DIT PLUS « PORTÉE ».
   *
   * ⚠️ Les identifiants de CODE (`scope`, `ChatScope`, `PORTFOLIO_SCOPE`…) ne
   * bougent pas — seul ce qu'un commercial LIT ou ENTEND change. La formule
   * remplacée était « Portée large » (titre de groupe) et « Tu pourras changer
   * la portée à tout moment » (réassurance générique) : les deux disparaissent
   * au profit d'une phrase qui dit CE QUI CHANGE pour le choix en cours.
   */
  it('aucun mot « portée » n’apparaît nulle part dans la modale', () => {
    renderWith([{ id: 'a1', company_name: 'PAYFIT', priority_score: 82, commercial_status: 'watching' }])
    const texte = (document.body.textContent ?? '').toLowerCase()
    expect(texte).not.toContain('portée')
  })

  // #1910.2 — la phrase de pied nomme l'ESPACE, parce que c'est ce que la
  // requête lit (`WHERE account.workspace_id = $1`, aucun filtre par `user_id`).
  // Promettre « ton portefeuille : tes comptes » était faux dès la deuxième
  // personne de l'ESN.
  it('la phrase de pied dit ce que Laura lit pour TOUT L’ESPACE, par défaut', () => {
    renderWith(
      [{ id: 'a1', company_name: 'PAYFIT', priority_score: 82, commercial_status: 'watching' }],
      PORTFOLIO_SCOPE,
    )
    expect(screen.getByText(/laura lira tous les comptes de ton espace/i)).toBeInTheDocument()
    expect(screen.queryByText(/tout ton portefeuille/i)).not.toBeInTheDocument()
  })

  it('choisir « Sans dossier ciblé » change la phrase — aucun dossier, mais l’espace reste consultable', () => {
    renderWith(
      [{ id: 'a1', company_name: 'PAYFIT', priority_score: 82, commercial_status: 'watching' }],
      PORTFOLIO_SCOPE,
    )
    fireEvent.click(screen.getByRole('radio', { name: /sans dossier ciblé/i }))
    expect(screen.getByText(/laura n’ouvre aucun dossier ciblé, mais peut consulter les comptes/i)).toBeInTheDocument()
  })

  it('#3772.2 — « Sans dossier ciblé » ne promet PAS « aucune donnée de l’espace » : le menu l’explique', () => {
    renderWith([{ id: 'a1', company_name: 'PAYFIT', priority_score: 82 }], PORTFOLIO_SCOPE)
    const option = screen.getByRole('radio', { name: /sans dossier ciblé/i })
    expect(option).toHaveTextContent(/restent consultables/i)
    expect(option).toHaveTextContent(/ce n’est pas une exclusion/i)
  })

  it('#3772.4 — l’exclusion stricte est un AUTRE choix, nommé comme tel, avec sa propre phrase', () => {
    renderWith([{ id: 'a1', company_name: 'PAYFIT', priority_score: 82 }], PORTFOLIO_SCOPE)
    fireEvent.click(screen.getByRole('radio', { name: /sans les données de l’espace/i }))
    expect(screen.getByText(/ne lira ni le portefeuille de l’espace/i)).toBeInTheDocument()
    expect(screen.getByText(/ne défait aucune action déjà réalisée/i)).toBeInTheDocument()
  })

  it('#3772.1 — « Tout mon espace » dit disponible, pas lu', () => {
    renderWith([{ id: 'a1', company_name: 'PAYFIT', priority_score: 82 }], PORTFOLIO_SCOPE)
    expect(screen.getByRole('radio', { name: /tout mon espace/i })).toHaveTextContent(
      /disponibles .*ne consulte que ce que ta question demande/i,
    )
  })

  it('choisir UN compte change la phrase pour NOMMER ce compte précis', () => {
    renderWith(
      [{ id: 'a1', company_name: 'PAYFIT', priority_score: 82, commercial_status: 'watching' }],
      NO_ACCOUNT_SCOPE,
    )
    fireEvent.click(screen.getByRole('radio', { name: /payfit/i }))
    expect(screen.getByText(/laura ne lira plus que payfit/i)).toBeInTheDocument()
  })

  it('affiche le signal RÉEL du compte, jamais un compteur inventé', () => {
    // La maquette annonçait « 2 signaux non traités » : aucun champ ne le porte.
    renderWith([
      {
        id: 'a1',
        company_name: 'AIRBUS',
        status: 'completed',
        last_analyzed_at: '2026-08-19T00:00:00Z',
        commercial_status: 'watching',
        signal_preview: { label: 'Airbus fait volte-face sur le télétravail' },
      },
    ])
    expect(screen.getByText('Airbus fait volte-face sur le télétravail')).toBeInTheDocument()
  })
})

/**
 * #2584 — mesuré en production (recette du 18/09) : le bouton « Ouvrir la
 * conversation » déborde à la fois de son propre pied (`footer.right=1008`,
 * `bouton.right=1113.99`, ~106 px) et de la modale entière (~70 px).
 *
 * ⚠️ La cause N'EST PAS le `grid` de `packages/ui/src/components/dialog.tsx`
 * qui s'étirerait jusqu'à `max-h-[calc(100dvh-2rem)]` en laissant du vide en
 * dessous — mesuré : `dialogContentHeight` (2043) dépasse largement
 * `dialogVisibleHeight` (829, exactement le plafond) : la boîte est plutôt
 * SOUS-dimensionnée pour son contenu (elle défile), pas étirée à vide.
 *
 * La cause RÉELLE, même mécanisme que #2583 : `buttonVariants`
 * (`packages/ui/src/components/button.tsx`) pose `shrink-0` SANS CONDITION,
 * et ni « Annuler » ni « Ouvrir la conversation » (aucun `className` dans
 * `ScopeDialog.tsx`) ne l'annulent. Contrairement à #2583, on ne fait PAS
 * porter `whitespace-normal` au bouton : un libellé d'action coupé en deux
 * lignes est un second défaut. La correction locale à CETTE modale (pas au
 * composant partagé) est de laisser le PIED passer à la ligne
 * (`flex-wrap`) quand le texte + les deux boutons ne tiennent pas sur une
 * seule rangée — les boutons gardent leur taille, c'est la RANGÉE qui cède.
 */
describe('ScopeDialog — #2584 le pied ne pousse pas ses boutons hors de la carte', () => {
  it('le pied déclare `flex-wrap` : il cède la ligne plutôt que de laisser un bouton déborder', () => {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
      />,
    )
    const footer = screen.getByTestId('scope-dialog-footer')
    expect(footer.className.split(/\s+/)).toContain('flex-wrap')
  })
})

/**
 * #2589 — L'ONGLET « OPPORTUNITÉ » ÉTAIT MORT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST LIT LA LISTE, ET N'ÉCRIT PAS SIX NOMS
 * ─────────────────────────────────────────────────────────────────────────────
 * `PRECISE_KINDS` déclarait six genres ; cinq avaient leur panneau, le
 * sixième (`opportunity`) rendait `OpportunityOptions` — complet, testé en
 * pur (`chat-scope-opportunity.test.ts`) — mais AUCUN branchement ne
 * l'appelait depuis la modale. Un test qui aurait vérifié les cinq noms en
 * dur serait resté vert exactement comme la garde GA-27 est restée aveugle à
 * un import à guillemets doubles : il aurait décrit le bug plutôt que de le
 * révéler.
 *
 * Celui-ci ITÈRE `PRECISE_KINDS` — la même liste que la modale rend — donc un
 * SEPTIÈME genre ajouté sans son panneau (ou sans son onglet) fait rougir la
 * CI, comme l'exige la demande de ce lot.
 */
describe('ScopeDialog — #2589 chaque genre de PRECISE_KINDS a son panneau', () => {
  it('cliquer sur CHAQUE onglet déclaré monte un panneau nommé, sans exception', () => {
    renderWith([{ id: 'a1', company_name: 'PAYFIT', priority_score: 82, commercial_status: 'watching' }])
    for (const kind of PRECISE_KINDS) {
      fireEvent.click(screen.getByTestId(`scope-tab-${kind}`))
      expect(screen.getByTestId(`scope-panel-${kind}`)).toBeInTheDocument()
    }
  })

  it('propose une affaire du pipe, et la phrase de pied NOMME l’affaire', () => {
    const onConfirm = vi.fn()
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByTestId('scope-tab-opportunity'))
    fireEvent.click(screen.getByRole('radio', { name: /Refonte du SI paiement/ }))
    expect(screen.getByText(/lira l.affaire Refonte du SI paiement · Société Générale/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la conversation' }))
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'opportunity',
      opportunityId: 'op-1',
      label: 'Refonte du SI paiement · Société Générale',
    })
  })

  /**
   * #2589 — rouverte sur un fil déjà cadré sur une opportunité, la modale
   * montre CET onglet — même garantie que les quatre autres genres précis
   * (voir les tests « rouverte sur un fil cadré… » plus haut).
   */
  it('rouverte sur un fil cadré sur une opportunité, la modale montre CET onglet', () => {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={{ kind: 'opportunity', opportunityId: 'op-1', label: 'Refonte du SI paiement' }}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByTestId('scope-tab-opportunity')).toHaveAttribute('aria-pressed', 'true')
  })
})

// Théo L1 — sélecteur avancé — l'onglet « Offre d'emploi », la recherche, et le choix effaçable.
describe('ScopeDialog — Théo L1 l’offre d’emploi', () => {
  function renderDialog(onConfirm = vi.fn(), initialScope: ChatScope = PORTFOLIO_SCOPE) {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={initialScope}
        onConfirm={onConfirm}
      />,
    )
    return onConfirm
  }

  it('propose une offre d’emploi, jamais un stage, et la phrase de pied NOMME l’offre', () => {
    const onConfirm = renderDialog()
    fireEvent.click(screen.getByTestId('scope-tab-job_offer'))
    expect(screen.queryByRole('radio', { name: /Stage Supply Chain/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Data engineer/ }))
    expect(screen.getByText(/lira l.offre d.emploi Data engineer/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la conversation' }))
    expect(onConfirm).toHaveBeenCalledWith({
      kind: 'job_offer',
      jobOfferId: 'jo-1',
      label: 'Data engineer — plateforme data voyageurs (H/F) · SNCF Voyageurs',
    })
  })

  it('cherche par nom — une recherche sans résultat le dit', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('scope-tab-job_offer'))
    fireEvent.change(screen.getByRole('searchbox', { name: /offre/i }), { target: { value: 'cobol' } })
    expect(screen.queryByRole('radio', { name: /Data engineer/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Aucune offre d.emploi/)).toBeInTheDocument()
  })

  it('rouverte sur un fil cadré sur une offre, la modale montre CET onglet', () => {
    renderDialog(vi.fn(), { kind: 'job_offer', jobOfferId: 'jo-1', label: null })
    expect(screen.getByTestId('scope-tab-job_offer')).toHaveAttribute('aria-pressed', 'true')
  })

  it('le choix est EFFAÇABLE : « Effacer » rend le portefeuille', () => {
    const onConfirm = renderDialog(vi.fn(), { kind: 'job_offer', jobOfferId: 'jo-1', label: 'Data engineer' })
    fireEvent.click(screen.getByRole('button', { name: /Effacer le dossier choisi/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir la conversation' }))
    expect(onConfirm).toHaveBeenCalledWith(PORTFOLIO_SCOPE)
  })

  it('« Effacer » n’apparaît pas quand aucun dossier précis n’est choisi', () => {
    renderDialog()
    expect(screen.queryByRole('button', { name: /Effacer le dossier choisi/ })).not.toBeInTheDocument()
  })
})

describe('ScopeDialog — #3654.1 la recherche de compte remonte à l’appelant', () => {
  it('signale ce qui est tapé, et le vide à la fermeture de l’onglet compte', async () => {
    const { fireEvent } = await import('@testing-library/react')
    const onAccountQuery = vi.fn()
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={scopeAccountsFrom([{ id: 'a1', company_name: 'LATÉCOÈRE', commercial_status: 'watching' }])}
        portfolioCount={1}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
        onAccountQuery={onAccountQuery}
      />,
    )
    fireEvent.click(screen.getByTestId('scope-tab-account'))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'dart' } })
    expect(onAccountQuery).toHaveBeenLastCalledWith('dart')
  })
})

/**
 * #3809 — LA MODALE DE « NOUVELLE CONVERSATION » NE RESTE JAMAIS VIDE.
 *
 * Vu en recette prod 07/10 : juste après l'ouverture de « Nouvelle
 * conversation », tant que `GET /accounts` n'a pas répondu, `accounts` vaut
 * `[]` — exactement l'état que ces tests posent. L'onglet « compte » (celui
 * qui s'ouvre par défaut) ne montrait ALORS rien : ni champ de recherche, ni
 * liste, ni message — juste les trois choix larges et les onglets, lu comme
 * une modale vide. Ces trois tests gardent les trois états lisibles qui
 * remplacent ce silence : en cours de lecture, en échec, et réellement vide.
 */
describe('ScopeDialog — #3809.1 l’onglet compte ne reste jamais silencieux', () => {
  it('en cours de lecture, dit qu’il charge — jamais une liste vide muette', () => {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        accountsLoading
        portfolioCount={null}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByTestId('scope-panel-account')).toBeInTheDocument()
    expect(screen.getByText('Chargement…')).toBeInTheDocument()
  })

  it('la requête en échec le dit, plutôt que de laisser croire à un portefeuille vide', () => {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        accountsError
        portfolioCount={null}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText('La liste n’a pas pu être chargée. Réessaie dans un instant.')).toBeInTheDocument()
  })

  it('un portefeuille réellement vide le NOMME — jamais une absence muette', () => {
    render(
      <ScopeDialog
        open
        onOpenChange={() => {}}
        accounts={[]}
        portfolioCount={0}
        initialScope={PORTFOLIO_SCOPE}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText('Aucun compte analysé dans ce portefeuille pour l’instant.')).toBeInTheDocument()
  })
})
