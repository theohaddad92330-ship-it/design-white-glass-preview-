import { deriveAccountStrategy5P } from '@bellum/contracts'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { cancelProgramsDetailScroll } from '../veille/SignalPrograms'
import { AccountStrategy5PCard } from './AccountStrategy5PCard'

describe('AccountStrategy5PCard', () => {
  // #4845 — le CTA « Programmes » pose deux défilements différés (400 / 1200 ms) : sans annulation ils tirent APRÈS le
  // démontage de l'environnement (`document is not defined`) et font sortir le shard en 1 avec 0 test rouge.
  afterEach(() => {
    cancelProgramsDetailScroll()
  })

  // #4845 — ce test était SYNCHRONE : il rendait `RouterProvider` (chargement de route asynchrone) puis finissait avant
  // que le routeur ait fini. La tâche survivait au démontage et jetait `document is not defined` APRÈS l'environnement
  // (shard 2/4 en échec avec 7239 tests verts). On attend donc que le routeur ait terminé son premier chargement.
  it('rend `null` — jamais « rien de connu » — quand la façade n’a pas répondu', async () => {
    const { container } = renderWithRouter(<AccountStrategy5PCard strategy={null} />)
    await act(async () => {
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche la readiness et désigne la dimension qui mérite la prochaine action', async () => {
    const strategy = deriveAccountStrategy5P({
      accountId: 'acc-1',
      analysis: { pains: [{ pain: 'Migration bloquée', business_impact: null, esn_offer: null, urgency: null }] },
      contacts: [],
    })
    // Perimeter est vide et précède Problem dans l'ordre canonique ; les
    // quatre autres dimensions (perimeter/people/proof/passage) sont vides →
    // BLOCKED (quatre trous sur cinq, voir accountStrategy5PReadinessFor).
    expect(strategy.next_action_dimension).toBe('perimeter')
    expect(strategy.readiness).toBe('BLOCKED')

    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)

    expect(await screen.findByText('Cinq questions de terrain')).toBeInTheDocument()
    expect(screen.getByText('Bloqué')).toBeInTheDocument()
    // #3675 — la dimension désignée devient UNE action précise, plus un libellé de case à remplir.
    expect(screen.getByText(/À faire : Cadrer le périmètre visé/)).toBeInTheDocument()
  })

  it('sans `onOpenTab`, aucun CTA ne s’affiche — un appelant qui ne navigue pas ne promet rien', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('#3675 — plus de compteur « N éléments connus » ni de « Compléter ce P » ; l’action désignée ouvre sa vue', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    const onOpenTab = vi.fn()
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={onOpenTab} />)

    // #3675 — l'action est NOMMÉE sur la dimension désignée ; ici le périmètre passe avant Passage.
    await screen.findByText('Cinq questions de terrain')
    expect(screen.queryByText('Aucune voie d’accès identifiée.')).not.toBeInTheDocument()
    expect(screen.queryByText(/élément.* connu/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Compléter/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Trouver une autre route' })).not.toBeInTheDocument()
  })

  it('« Challenger la stratégie » apparaît quand la readiness est bloquée ou NO-GO', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    const onOpenTab = vi.fn()
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={onOpenTab} />)

    const challenge = await screen.findByRole('button', { name: 'Challenger la stratégie' })
    await userEvent.click(challenge)
    expect(onOpenTab).toHaveBeenCalledWith('plan')
  })

  it('« Préparer le premier mouvement » apparaît quand les cinq P sont solides', async () => {
    // `passage` (P5) est VIDE par construction dans ce lot (aucune source
    // canonique câblée — voir le docblock de `account-strategy-5p.ts`) : un
    // compte réel n'atteint donc jamais `READY_TO_ACT` avant l'épopée #3260.
    // Le comportement d'AFFICHAGE de la carte, lui, ne dépend que de
    // `next_action_dimension`/`readiness` — on le teste directement plutôt
    // que d'attendre une dérivation que rien ne peut produire aujourd'hui.
    const base = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    const strategy = { ...base, readiness: 'READY_TO_ACT' as const, next_action_dimension: null }

    const onOpenTab = vi.fn()
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={onOpenTab} />)

    const cta = await screen.findByRole('button', { name: 'Préparer le premier mouvement' })
    await userEvent.click(cta)
    expect(onOpenTab).toHaveBeenCalledWith('plan')
  })

  it('#3277.3 — « Ajouter au plan » sur la SEULE dimension désignée, avec cette dimension', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    expect(strategy.next_action_dimension).toBe('perimeter')
    const onAddToPlan = vi.fn()
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={vi.fn()} onAddToPlan={onAddToPlan} />)

    const buttons = await screen.findAllByRole('button', { name: 'Ajouter au plan' })
    expect(buttons).toHaveLength(1)
    await userEvent.click(buttons[0])
    expect(onAddToPlan).toHaveBeenCalledWith('perimeter')
  })

  it('#3277.3 — sans `onAddToPlan`, ou les cinq P solides, aucun « Ajouter au plan »', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={vi.fn()} />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.queryByRole('button', { name: 'Ajouter au plan' })).not.toBeInTheDocument()
  })

  // #3277 (recette prod 02/10) — la mission en cours chez le compte n'apparaissait nulle part sur la carte :
  // elle comptait dans « 3 éléments connus sur 9 » sans jamais être nommée.
  it('#3277 — nomme ce qui est connu sous Preuve et Voie d’accès, et ne contredit plus « Aucune preuve »', async () => {
    const strategy = deriveAccountStrategy5P({
      accountId: 'acc-1',
      analysis: {},
      contacts: [],
      missions: [{ label: 'Portail transporteurs', status: 'active', consultants: ['Awa Diallo'] }],
    })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
    await screen.findByText('Cinq questions de terrain')

    expect(screen.queryByText('Aucune preuve mobilisable sur ce compte.')).not.toBeInTheDocument()
    expect(screen.getAllByText(/Awa Diallo/).length).toBeGreaterThan(0)
    expect(screen.getByText(/1 mission en cours/)).toBeInTheDocument()
  })

  // #3277 (recette 02/10, VISUEL KO) — les mêmes noms de consultants revenaient sous Preuve ET sous
  // Voie d'accès : un nom ne s'affiche qu'une fois par carte, sous « Voie d'accès » (qui est en poste).
  it('#3277 — les consultants placés sont nommés UNE fois dans la carte, jamais sous Preuve ET Voie d’accès', async () => {
    const strategy = deriveAccountStrategy5P({
      accountId: 'acc-1',
      analysis: {},
      contacts: [],
      missions: [{ label: 'Portail transporteurs', status: 'active', consultants: ['Awa Diallo', 'Hakim Barreau'] }],
    })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.getAllByText(/Awa Diallo/)).toHaveLength(1)
    expect(screen.getAllByText(/Hakim Barreau/)).toHaveLength(1)
  })

  it('#3277 — sans rien de connu, aucune ligne « Connu : » ni détail dépliable (une absence ne fait aucune ligne)', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.queryByText(/^Connu : /)).not.toBeInTheDocument()
    expect(screen.queryByText('Voir le détail')).not.toBeInTheDocument()
  })

  // #3675 — les cinq P sont cinq QUESTIONS de terrain avec une réponse courte + un détail dépliable.
  it('#3675 — cinq questions nommées Périmètre, Problème, Personnes, Preuves, Passage, chacune avec sa question', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
    await screen.findByText('Cinq questions de terrain')
    for (const nom of ['Périmètre', 'Problème', 'Personnes', 'Preuves', 'Passage']) {
      expect(screen.getByRole('heading', { name: nom })).toBeInTheDocument()
    }
    expect(screen.queryByText('Preuve')).not.toBeInTheDocument()
    expect(screen.queryByText('Voie d’accès')).not.toBeInTheDocument()
    for (const question of ['Où entrer ?', 'Avec qui ?', 'Par quelle voie ?']) {
      expect(screen.getByText(question)).toBeInTheDocument()
    }
  })

  it('#3675 — une dimension sans réponse dit « À vérifier. », jamais un compteur ni un zéro', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.getAllByText('À vérifier.').length).toBeGreaterThanOrEqual(1)
    expect(document.body.textContent).not.toMatch(/\b0 (élément|sur)|\d+ sur \d+/)
  })

  it('#3675 — les personnes sont nommées en clair dans la réponse, le détail déplie le reste sans les répéter', async () => {
    const strategy = deriveAccountStrategy5P({
      accountId: 'acc-1',
      analysis: {},
      contacts: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          full_name: 'Alice Martin',
          title: 'DSI',
          decision_role: 'economic',
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          full_name: 'Bruno Petit',
          title: 'Responsable achats',
          decision_role: 'champion',
        },
      ],
    })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
    await screen.findByText('Cinq questions de terrain')
    // Chaque nom n'apparaît qu'UNE fois dans la carte (réponse OU détail).
    expect(screen.getAllByText(/Alice Martin/)).toHaveLength(1)
    expect(screen.getAllByText(/Bruno Petit/)).toHaveLength(1)
  })

  it('#3675 — Passage sans voie connue : l’action est « Trouver une autre route », et « Ajouter au plan » reste sur la SEULE dimension désignée', async () => {
    const base = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    const strategy = { ...base, next_action_dimension: 'passage' as const }
    const onAddToPlan = vi.fn()
    const onOpenTab = vi.fn()
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={onOpenTab} onAddToPlan={onAddToPlan} />)
    await screen.findByText(/À faire : Trouver une autre route/)
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir l’accès' }))
    expect(onOpenTab).toHaveBeenCalledWith('access')
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter au plan' }))
    expect(onAddToPlan).toHaveBeenCalledWith('passage')
  })

  it('#3677.6 — un programme connu est cité sous Périmètre, avec un lien vers son détail unique', async () => {
    const strategy = deriveAccountStrategy5P({
      accountId: 'acc-1',
      analysis: { program_names: [{ name: 'Plan stratégique 2029', entity: 'Société Générale' }] },
      contacts: [],
    })
    const onOpenTab = vi.fn()
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={onOpenTab} />)

    await userEvent.click(await screen.findByRole('button', { name: 'Voir ce programme dans Signaux et besoins' }))
    expect(onOpenTab).toHaveBeenCalledWith('veille')
  })

  it('#3677.6 — sans programme connu, ou sans navigation, aucun lien', async () => {
    const none = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    renderWithRouter(<AccountStrategy5PCard strategy={none} onOpenTab={vi.fn()} />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.queryByRole('button', { name: /Voir ce programme/ })).not.toBeInTheDocument()
  })

  // #3715 — les cinq cartes annexes sont absorbées : chaque vue propriétaire reste atteignable depuis la carte 5P.
  it('#3715 — Périmètre, Personnes et Passage portent la porte vers LEUR vue détaillée (bon onglet)', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    const onOpenTab = vi.fn()
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={onOpenTab} />)
    await screen.findByText('Cinq questions de terrain')
    const expected: [string, string][] = [
      ['Voir le périmètre détaillé', 'sites'],
      ['Voir l’organigramme et l’influence', 'organigramme'],
      ['Voir le comité d’achat', 'committee'],
      ['Voir les partenaires', 'partners'],
    ]
    for (const [name, tab] of expected) {
      await userEvent.click(screen.getByRole('button', { name }))
      expect(onOpenTab).toHaveBeenLastCalledWith(tab)
    }
  })

  it('#3715 — Passage dit « aucune voie » lui-même, sans recopier la liste des partenaires', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    expect(strategy.passage.no_path.value).toBe(true)
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} onOpenTab={vi.fn()} />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.getAllByText(/Aucune voie d’accès identifiée/)).toHaveLength(1)
  })

  it('#3715 — SAIT DIRE NON : sans `onOpenTab`, aucune porte ; aucun flux de décision présenté', async () => {
    const strategy = deriveAccountStrategy5P({ accountId: 'acc-1', analysis: {}, contacts: [] })
    renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
    await screen.findByText('Cinq questions de terrain')
    expect(screen.queryByRole('button', { name: /Voir le/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Flux de décision|Vit le problème/)).not.toBeInTheDocument()
  })

  // LOIC-FIX2 RÔLES (recette 20/10, OGF) — « 1 rôle de décision non identifié » sans dire lequel, alors que la synthèse
  // comptait cinq décideurs économiques. Un rôle manquant se NOMME ; l'absence de bloqueur n'est pas un manque.
  describe('LOIC-FIX2 RÔLES — le rôle manquant est nommé', () => {
    const ids = [1, 2, 3, 4, 5, 6].map(
      n =>
        `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`,
    )
    const withRoles = (
      roles: Array<'technical' | 'economic' | 'user' | 'champion' | 'influencer' | 'procurement' | 'blocker'>,
    ) =>
      deriveAccountStrategy5P({
        accountId: 'acc-1',
        analysis: {},
        contacts: roles.map((role, index) => ({
          id: ids[index]!,
          full_name: `Contact ${role}`,
          title: null,
          decision_role: role,
        })),
      })

    it('nomme le rôle absent au lieu de « 1 rôle de décision non identifié »', async () => {
      const strategy = withRoles(['technical', 'economic', 'user', 'champion', 'influencer', 'blocker'])
      expect(strategy.people.missing_roles.value).toEqual(['procurement'])
      renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
      await screen.findByText('Cinq questions de terrain')
      expect(screen.queryByText(/rôle de décision non identifié/)).not.toBeInTheDocument()
      expect(screen.getByText('Aucun contact Achats identifié.')).toBeInTheDocument()
    })

    // #4324.1 (recette 22/10, STEF Logistique) — pas de DSI : le siège vide dit POURQUOI.
    it('#4324.1 — le DSI manquant dit sa raison (collecte), et se tait quand un DSI est connu', async () => {
      const strategy = withRoles(['economic', 'user', 'champion', 'influencer', 'procurement', 'blocker'])
      expect(strategy.people.technical_gap?.reason).toBe('no_it_contact')
      const { unmount } = renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
      await screen.findByText('Cinq questions de terrain')
      expect(screen.getByText(/Aucun contact IT collecté sur ce compte/)).toBeInTheDocument()
      unmount()
      renderWithRouter(
        <AccountStrategy5PCard strategy={withRoles(['technical', 'economic', 'user', 'champion', 'influencer'])} />,
      )
      await screen.findByText('Cinq questions de terrain')
      expect(screen.queryByText(/contact IT/)).not.toBeInTheDocument()
    })

    it('un bloqueur non identifié n’est pas un siège à pourvoir : rien n’est affiché', async () => {
      const strategy = withRoles(['technical', 'economic', 'user', 'champion', 'influencer', 'procurement'])
      expect(strategy.people.missing_roles.value).toEqual(['blocker'])
      renderWithRouter(<AccountStrategy5PCard strategy={strategy} />)
      await screen.findByText('Cinq questions de terrain')
      expect(screen.queryByText(/non identifié/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Bloqueur/)).not.toBeInTheDocument()
    })
  })

  it('#4845 — cancelProgramsDetailScroll annule les défilements différés du CTA', async () => {
    const { openProgramsDetail } = await import('../veille/SignalPrograms')
    const scrollIntoView = vi.fn()
    const target = document.createElement('div')
    target.id = 'dossier-programs'
    target.scrollIntoView = scrollIntoView
    document.body.append(target)
    vi.useFakeTimers()
    try {
      openProgramsDetail(vi.fn())
      cancelProgramsDetailScroll()
      vi.advanceTimersByTime(2000)
      expect(scrollIntoView).not.toHaveBeenCalled()
      // sait dire NON à l'inverse : sans annulation, le défilement a bien lieu
      openProgramsDetail(vi.fn())
      vi.advanceTimersByTime(2000)
      expect(scrollIntoView).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
      target.remove()
    }
  })
})
