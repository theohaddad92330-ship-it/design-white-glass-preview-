import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactSelectionPanel } from './ContactSelectionPanel'

/**
 * Audit restitution V2 §5 — le panneau savait enrichir, générer, envoyer et
 * exporter une sélection, mais pas l'ATTRIBUER ni la verser au plan d'action.
 * Ces deux gestes existaient au contact près (fiche contact) ou au compte près
 * (portefeuille) et nulle part en masse.
 */
const contact = (id: string, overrides: Partial<GlobalContact> = {}): GlobalContact =>
  ({
    id,
    account_id: `acc-${id}`,
    full_name: `Contact ${id}`,
    title: 'DSI',
    entity: null,
    decision_role: 'technical',
    priority: 3,
    email: `${id}@example.com`,
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    company_name: 'ACME',
    ...overrides,
  }) as GlobalContact

const members: WorkspaceMember[] = [
  { userId: 'u-1', email: 'lea@esn.fr', fullName: 'Léa Martin', role: 'sales', isSelf: false },
  { userId: 'u-2', email: 'moi@esn.fr', fullName: 'Moi', role: 'owner', isSelf: true },
]

function renderPanel(overrides: Partial<Parameters<typeof ContactSelectionPanel>[0]> = {}) {
  const props = {
    contacts: [contact('c-1'), contact('c-2')],
    availableContacts: [],
    onAddContact: vi.fn(),
    onClear: vi.fn(),
    onQuickAction: vi.fn(),
    onSendBulkEmail: vi.fn(),
    onExecuteActions: vi.fn(),
    members,
    onAssign: vi.fn(),
    onAddToPlan: vi.fn(),
    onAddToSequence: vi.fn(),
    onPrepareEmails: vi.fn(),
    onCreateTargetList: vi.fn(),
    onVerifyForced: vi.fn(),
    ...overrides,
  }
  render(<ContactSelectionPanel {...props} />)
  return props
}

/**
 * ⚠️ Budget d'horloge, pas de logique.
 *
 * Ces cas ouvrent un menu en portail puis cliquent dedans : deux `userEvent`
 * complets, avec leurs délais de pointeur. Sur un runner chargé, les 5 s par
 * défaut de vitest ne suffisent pas — échec du 28/08 en CI, vert en local sur
 * la suite complète.
 *
 * Et le dépassement ne casse pas QUE son cas : le `userEvent` resté en vol
 * finit par se résoudre PENDANT le test suivant, sur le menu que celui-ci vient
 * d'ouvrir. Le second cas a donc reçu l'appel du premier — « attendu `null`,
 * reçu Léa Martin ». Un test qui expire en contamine un autre : c'est ce qui
 * rend ce genre de rouge si difficile à lire.
 *
 * Aucune assertion n'est touchée. Seul le temps accordé change.
 */
const MENU_INTERACTION_MS = 20_000

describe('ContactSelectionPanel — attribution en masse', () => {
  it(
    'liste les membres RÉELS de l’espace et attribue la sélection au membre choisi',
    async () => {
      const props = renderPanel()

      await userEvent.click(screen.getByRole('button', { name: /Attribuer à/ }))
      await userEvent.click(await screen.findByText('Léa Martin'))

      expect(props.onAssign).toHaveBeenCalledWith({ userId: 'u-1', name: 'Léa Martin' })
    },
    MENU_INTERACTION_MS,
  )

  it(
    'propose de retirer l’attribution (null), pas seulement d’en poser une',
    async () => {
      const props = renderPanel()

      await userEvent.click(screen.getByRole('button', { name: /Attribuer à/ }))
      await userEvent.click(await screen.findByText("Retirer l'attribution"))

      expect(props.onAssign).toHaveBeenCalledWith(null)
    },
    MENU_INTERACTION_MS,
  )

  // Jamais d'annuaire fabriqué : sans membre chargé l'action se désactive.
  it('désactive l’action quand aucun membre n’est chargé', () => {
    renderPanel({ members: [] })

    expect(screen.getByRole('button', { name: /Attribuer à/ })).toBeDisabled()
  })

  it(
    'coche le porteur quand TOUTE la sélection lui est déjà attribuée',
    async () => {
      renderPanel({ contacts: [contact('c-1', { assigned_to: 'u-1' }), contact('c-2', { assigned_to: 'u-1' })] })

      await userEvent.click(screen.getByRole('button', { name: /Attribuer à/ }))

      const lea = await screen.findByRole('menuitem', { name: /Léa Martin/ })
      expect(lea.querySelector('svg')).not.toBeNull()
    },
    MENU_INTERACTION_MS,
  )

  // Une coche posée sur « le premier trouvé » mentirait sur les autres lignes.
  it(
    'ne coche personne quand la sélection est hétérogène',
    async () => {
      renderPanel({ contacts: [contact('c-1', { assigned_to: 'u-1' }), contact('c-2', { assigned_to: 'u-2' })] })

      await userEvent.click(screen.getByRole('button', { name: /Attribuer à/ }))

      const lea = await screen.findByRole('menuitem', { name: /Léa Martin/ })
      expect(lea.querySelector('svg')).toBeNull()
    },
    MENU_INTERACTION_MS,
  )
})

describe('ContactSelectionPanel — plus aucun coût affiché (#4463)', () => {
  // Le prix vivait uniquement dans la confirmation, donc APRÈS le clic ; et il
  // comptait « à qui il manque l'un des trois champs », donc un contact déjà
  // pourvu d'un e-mail était facturé. Les deux se corrigent au même endroit :
  // le panneau lit `bulkEnrichmentCost`, la fonction qui choisit aussi le lot.
  it('le bouton « Enrichir maintenant » ne porte aucun nombre de crédits', () => {
    renderPanel({ contacts: [contact('c-1', { email: null }), contact('c-2', { email: null })] })

    // Le prix est SUR le bouton, pas seulement sous lui : c'est le libellé du
    // geste qui porte le nombre, donc on ne peut pas cliquer sans l'avoir lu.
    const button = screen.getByRole('button', { name: /Enrichir maintenant/ })
    expect(button).toBeEnabled()
    expect(button).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('reste actif dès qu’un contact est à enrichir, même si un autre a déjà une coordonnée', () => {
    // c-1 a un e-mail (le défaut de la fabrique), c-2 non : un seul est à enrichir.
    renderPanel({ contacts: [contact('c-1'), contact('c-2', { email: null })] })

    expect(screen.getByRole('button', { name: /Enrichir maintenant/ })).toBeEnabled()
  })

  it('dit qu’il n’y a rien à enrichir plutôt que de laisser un bouton actif', () => {
    renderPanel({ contacts: [contact('c-1'), contact('c-2')] })

    // Le libellé ne dit plus « tout est complet » : ce serait FAUX pour un
    // contact dont le nom complet reste à confirmer, qui n'est pas facturable
    // non plus. Il nomme les deux raisons possibles sans en affirmer une.
    expect(screen.getByText(/il n’y a rien à enrichir/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rien à enrichir/i })).toBeDisabled()
  })

  // #2297 (recette prod 02/10) — Hugo Delannoy seul : le bouton est grisé, mais la
  // raison affichée parlait de « coordonnée déjà là » ou de « nom à confirmer »,
  // jamais du vrai motif : il a été enrichi récemment, sans résultat.
  it('un contact enrichi récemment (sans résultat) NOMME ce motif sous le bouton grisé', () => {
    const recent = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    const hugo = contact('hugo', {
      email: null,
      last_enrichment_at: recent,
      last_enrichment_result: 'no_new_data',
    } as Partial<GlobalContact>)
    renderPanel({ contacts: [hugo] })
    expect(screen.getByRole('button', { name: /Rien à enrichir/i })).toBeDisabled()
    expect(screen.getByText(/déjà été enrichi récemment/i)).toBeInTheDocument()
    expect(screen.queryByText(/aucune coordonnée déjà|nom complet reste à confirmer/i)).not.toBeInTheDocument()
  })

  // #3822.1 (recette prod 08/10, W 5b4b10d2f3) — l'action rapide ET le bouton
  // du bas s'appelaient TOUS LES DEUX « Enrichir maintenant » (régression du
  // lot V08, qui avait aligné le libellé de l'action rapide sur celui du
  // bouton chiffré pour corriger #3822.5 — sans remarquer qu'il créait ainsi
  // un doublon, GA-26 : « un réglage vit à un seul endroit »). Les deux
  // déclenchaient le MÊME geste (`handleQuickAction({kind:'enrich-missing'})`) :
  // l'action rapide n'ajoutait rien, elle doublait. Retirée du panneau — UN
  // seul « Enrichir maintenant » reste, le bouton chiffré du bas.
  it('#3822.1 — un SEUL bouton « Enrichir maintenant » (l’action rapide a disparu)', () => {
    renderPanel({ contacts: [contact('c-1', { email: null })] })
    const matches = screen.getAllByRole('button', { name: /Enrichir maintenant/i })
    expect(matches).toHaveLength(1)
    expect(matches[0]).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('#3822.1 — les actions rapides ne proposent plus que LinkedIn, e-mail, téléphone', () => {
    renderPanel()
    const title = screen.getByText('Actions rapides')
    const quickActionsBox = title.parentElement as HTMLElement
    const quickButtons = quickActionsBox.querySelectorAll('button')
    expect(quickButtons.length).toBe(3)
  })

  it('une coordonnée absente ne s’affiche jamais « 0 » dans les compteurs', () => {
    renderPanel({ contacts: [contact('c-1', { email: null })] })
    for (const label of [/Emails trouvés/i, /LinkedIn trouvés/i, /Téléphones trouvés/i]) {
      const row = screen.getByText(label).closest('div')?.parentElement as HTMLElement
      expect(row).not.toHaveTextContent(/(^|\D)0$/)
      expect(row).toHaveTextContent('—')
    }
  })

  it('rappelle que « jusqu’à » n’est pas un débit certain', () => {
    renderPanel({ contacts: [contact('c-1', { email: null })] })

    expect(screen.getByText(/rien n’est débité pour un profil sans résultat/i)).toBeInTheDocument()
  })
})

describe('ContactSelectionPanel — vérification forcée (#2964, #2296.38-.41)', () => {
  // Son PROPRE prédicat : contrairement à « Enrichir maintenant », TOUS les
  // contacts sélectionnés sont facturés — même déjà pourvus d'une coordonnée.
  it('propose la vérification pour TOUS les contacts sélectionnés, sans coût affiché', () => {
    renderPanel({ contacts: [contact('c-1'), contact('c-2')] })

    const verify = screen.getByRole('button', { name: /Vérifier maintenant/ })
    expect(verify).toBeEnabled()
    expect(verify).not.toHaveTextContent(/cr[ée]dit/i)
  })

  it('déclenche onVerifyForced au clic', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /Vérifier maintenant/ }))

    expect(props.onVerifyForced).toHaveBeenCalledTimes(1)
  })

  it('annonce la vérification en cours plutôt que de rester muet', () => {
    renderPanel({ verifyPending: true })

    expect(screen.getByRole('button', { name: /Vérification en cours/i })).toBeDisabled()
  })
})

describe('ContactSelectionPanel — ajout au plan en masse', () => {
  it('expose « Ajouter au plan d’action » et le déclenche pour la sélection', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /Ajouter au plan d'action/ }))

    expect(props.onAddToPlan).toHaveBeenCalledTimes(1)
  })

  it('annonce l’ajout en cours plutôt que de rester muet', () => {
    renderPanel({ addToPlanPending: true })

    expect(screen.getByText(/Ajout au plan/)).toBeInTheDocument()
  })
})

/**
 * #2157.5 — « Créer une cible depuis Contacts ». La notion de cible
 * (`target-lists`, #2155/#2156) n'avait aucun chemin depuis l'annuaire
 * canonique : la construire supposait de partir de zéro sur /mes-cibles,
 * sans jamais partir d'une sélection déjà qualifiée.
 */
describe('ContactSelectionPanel — créer une cible depuis la sélection (#2157.5)', () => {
  it('expose « Créer une cible » et le déclenche pour la sélection', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /Créer une cible/ }))

    expect(props.onCreateTargetList).toHaveBeenCalledTimes(1)
  })
})

describe('ContactSelectionPanel — préparer un e-mail par personne (#3942.2)', () => {
  it('expose « Préparer un e-mail par personne » et le déclenche pour la sélection', async () => {
    const props = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: /Préparer un e-mail par personne/ }))

    expect(props.onPrepareEmails).toHaveBeenCalledTimes(1)
  })
})

/**
 * #2484 — le panneau de sélection de `/contacts`, audité contre les règles de
 * design : trois manquements mesurés, un test chacun.
 */
describe('ContactSelectionPanel — #2484 : les règles de design', () => {
  const classesOf = (element: Element) => element.getAttribute('class')?.split(/\s+/) ?? []

  it('le bouton rond « ajouter » reste ROND et à 44 px sous le doigt (GA-30)', () => {
    renderPanel()
    const trigger = screen.getByRole('button', { name: 'Ajouter des contacts à la sélection' })
    const classes = classesOf(trigger)
    // `Button` pose `pointer-coarse:min-h-11` ; avec `size-10` seul, la cible
    // faisait 40 × 44 — une ellipse, et 40 px de large sous le doigt.
    expect(classes).toContain('rounded-full')
    expect(classes).toContain('pointer-coarse:min-h-11')
    expect(classes).toContain('pointer-coarse:min-w-11')
  })

  it('« Effacer la sélection » garde un texte lisible au survol (GA-33)', () => {
    renderPanel()
    const clear = screen.getByRole('button', { name: /effacer la sélection/i })
    const classes = classesOf(clear)
    // Témoin : le repos passe par la variante `soft-text`, qui tient AA.
    expect(classes).toContain('text-[var(--danger-soft-text)]')
    // Le mélange `--bellum-danger` × noir donnait 3,93:1 (clair) et 3,63:1
    // (sombre) sur le fond de survol — sous AA des deux côtés.
    expect(classes.filter(cls => /color-mix\([^\]]*--bellum-danger/.test(cls))).toEqual([])
  })

  it('aucune durée n’est réglée à la main dans le panneau (GA-25)', () => {
    renderPanel()
    // La carte du panneau : la seule à porter la largeur de colonne latérale.
    const panel = screen.getByRole('button', { name: /effacer la sélection/i }).closest('[class*="lg:w-"]')
    expect(panel).not.toBeNull()
    const buttons = panel?.querySelectorAll('button') ?? []
    // LIT quelque chose : les actions rapides, la croix, l'ajout, l'effacement.
    expect(buttons.length).toBeGreaterThanOrEqual(5)
    const timed = [...(panel?.querySelectorAll('*') ?? [])].filter(el =>
      classesOf(el).some(cls => /^duration-\d+$/.test(cls)),
    )
    expect(timed).toEqual([])
  })
})

describe('ContactSelectionPanel — #4188 : envoyer les contacts vers mon CRM (R24)', () => {
  it('propose « Envoyer vers mon CRM » quand la sortie est permise, et ouvre l’envoi', async () => {
    const onPushToCrm = vi.fn()
    renderPanel({ onPushToCrm })
    await userEvent.click(screen.getByRole('button', { name: /Envoyer vers mon CRM/ }))
    expect(onPushToCrm).toHaveBeenCalledTimes(1)
  })

  it('sans geste fourni (sortie refusée par la règle d’espace), aucun bouton', () => {
    renderPanel()
    expect(screen.queryByRole('button', { name: /Envoyer vers mon CRM/ })).not.toBeInTheDocument()
  })
})

// #3702.14 — l'entrée de la relecture porte le NOM de la relecture : « Relire les e-mails », pas « Envoyer ».
describe('ContactSelectionPanel — entrée « Relire les e-mails » (#3702.14)', () => {
  it('deux contacts avec e-mail : un bouton « Relire les e-mails (2) » ouvre la relecture', async () => {
    const props = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Relire les e-mails (2)' }))
    expect(props.onSendBulkEmail).toHaveBeenCalledTimes(1)
  })

  it('aucun e-mail : le bouton reste visible, désactivé, et dit pourquoi', () => {
    renderPanel({ contacts: [contact('c-1', { email: null }), contact('c-2', { email: null })] })
    const button = screen.getByRole('button', { name: 'Aucun e-mail à relire' })
    expect(button).toBeDisabled()
  })
})
