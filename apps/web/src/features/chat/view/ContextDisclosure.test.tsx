import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { markSettingsOpenedFromLaura } from '@/features/laura/laura-settings-origin'
import { ContextDisclosure, type ChatResponseContext } from './ContextDisclosure'

vi.mock('@/features/laura/laura-settings-origin', () => ({ markSettingsOpenedFromLaura: vi.fn() }))

function makeContext(overrides?: Partial<ChatResponseContext>): ChatResponseContext {
  return {
    active: {
      profile: { present: true, name: 'Skaizen' },
      account: { present: true, name: 'SNCF' },
      contacts_count: 3,
      plan: { present: true },
      portfolio: { present: false, count: 0 },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources: [{ kind: 'knowledge_doc', label: 'Playbook SNCF' }],
    not_consulted: ['CRM HubSpot non connecté', 'LinkedIn non interrogé'],
    ...overrides,
  }
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

/** Le panneau propose des raccourcis (« Connecter ») : il lui faut un routeur,
 *  qui monte de façon asynchrone — d'où le `findBy` avant chaque dépliage. */
async function expand(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: /Contexte utilisé/ }))
}

describe('ContextDisclosure', () => {
  it('annonce en UNE ligne ce que la réponse utilise, sans avoir à déplier (V2 §13)', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    // Visible d'emblée : la transparence ne compte que si elle est lue.
    expect(await screen.findByText(/Cette réponse utilise/)).toBeInTheDocument()
  })

  it('is collapsed by default and shows the source count', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    const toggle = await screen.findByRole('button', { name: /Contexte utilisé/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    // Le compteur vit sur le bouton ; la phrase de résumé (V2 §13) le répète
    // volontairement au-dessus, replié ou non — on cible donc le bouton.
    expect(toggle).toHaveTextContent(/1 source/)
    // Collapsed → the detailed sections aren't rendered yet.
    expect(screen.queryByText('CRM HubSpot non connecté')).not.toBeInTheDocument()
  })

  it('reveals active context, cited sources and the NON-consulté list when expanded', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    // Active context — only the truthy parts, with names.
    expect(screen.getByText('Profil ESN : Skaizen')).toBeInTheDocument()
    expect(screen.getByText('Compte : SNCF')).toBeInTheDocument()
    // Cited source.
    expect(screen.getByText('Playbook SNCF')).toBeInTheDocument()
    // The honest "not consulted" list — the core P0 guarantee.
    expect(screen.getByText('CRM HubSpot non connecté')).toBeInTheDocument()
    expect(screen.getByText('LinkedIn non interrogé')).toBeInTheDocument()
  })

  // W-G (13/10) — le bloc « faits du compte » envoyé au modèle se LISTE ; sans fait, aucune puce (jamais « 0 »).
  it('liste les faits du compte quand le tour en a reçu, et rien quand il n’en a pas', async () => {
    const base = makeContext()
    const { unmount } = renderWithRouter(
      <ContextDisclosure
        context={{ ...base, active: { ...base.active, account_facts: { present: true, count: 2 } } }}
      />,
    )
    await expand()
    expect(screen.getByText('Faits du compte (2)')).toBeInTheDocument()
    unmount()
    renderWithRouter(<ContextDisclosure context={base} />)
    await expand()
    expect(screen.queryByText(/Faits du compte/)).not.toBeInTheDocument()
  })

  // #4071.3 (recette R6 14/10) — ce que l'espace a gardé (recherches enregistrées,
  // listes de cibles, résumés de fils) se liste comme les faits du compte ; sans
  // rien fourni, aucune puce (jamais « 0 »).
  it('liste ce que l’espace a gardé quand le tour en a reçu, et rien quand il n’en a pas', async () => {
    const base = makeContext()
    const { unmount } = renderWithRouter(
      <ContextDisclosure
        context={{ ...base, active: { ...base.active, workspace_recall: { present: true, count: 3 } } }}
      />,
    )
    await expand()
    expect(screen.getByText("Mémoire de l'espace (3)")).toBeInTheDocument()
    unmount()
    renderWithRouter(<ContextDisclosure context={base} />)
    await expand()
    expect(screen.queryByText(/Mémoire de l'espace/)).not.toBeInTheDocument()
  })

  // #2889 — le périmètre du profil (secteurs prioritaires, taille cible) est
  // une puce séparée quand l'appelant la fournit, jamais fondue dans le nom.
  it('#2889 — affiche le périmètre du profil en puce séparée quand fourni', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          active: {
            ...makeContext().active,
            profile: { present: true, name: 'Skaizen', perimeter: 'Périmètre : ETI · Banque, Assurance.' },
          },
        })}
      />,
    )
    await expand()
    expect(screen.getByText('Profil ESN : Skaizen')).toBeInTheDocument()
    expect(screen.getByText('Périmètre : ETI · Banque, Assurance.')).toBeInTheDocument()
  })

  it('#2889 — aucun périmètre connu : pas de puce, jamais une ligne vide', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.queryByText(/Périmètre/)).not.toBeInTheDocument()
  })

  /**
   * #1941.5 / #1941.8 — les droits EFFECTIFS du lecteur, tels que le SERVEUR
   * les a calculés (`context.permissions`). L'écran les AFFICHE, il ne les
   * recalcule jamais depuis un rôle deviné.
   */
  it('#1941.5 / #1941.8 — affiche les droits du lecteur, traduits, quand le serveur les fournit', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ permissions: ['team:manage', 'billing:manage'] })} />)
    await expand()
    expect(screen.getByText('Gérer l’équipe')).toBeInTheDocument()
    expect(screen.getByText('Gérer la facturation')).toBeInTheDocument()
  })

  it('#1941.5 / #1941.8 — un lecteur SANS droit voit « lecture seule », jamais une liste vide muette', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ permissions: [] })} />)
    await expand()
    expect(screen.getByText(/lecture seule/)).toBeInTheDocument()
  })

  it('#1941.5 / #1941.8 — n’attrape pas ce qu’elle ne vise pas : sans permissions du serveur, rien n’est deviné', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.queryByText('Tes droits')).not.toBeInTheDocument()
  })

  it('states plainly when no knowledge document was used', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ sources: [] })} />)
    await expand()
    expect(screen.getByText(/Aucun document de la base de connaissance/)).toBeInTheDocument()
  })

  it('shows the real excerpt of a knowledge document alongside its title (#1954.21/#1954.31)', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [{ kind: 'knowledge_doc', label: 'Playbook SNCF', excerpt: 'Le budget cyber a été voté en mars.' }],
        })}
      />,
    )
    await expand()
    expect(screen.getByText(/Le budget cyber a été voté en mars\./)).toBeInTheDocument()
  })

  it('never shows raw markdown asterisks in a source label or excerpt (#3382, recette prod 26755bbac3, lot C1, 30/09)', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [
            {
              kind: 'method_rule',
              label: 'Règle métier « **contact_fit_score_100** » — méthode Bellum',
              excerpt: 'Le **budget** cyber a été voté en mars.',
            },
          ],
        })}
      />,
    )
    await expand()
    expect(screen.getAllByText(/contact_fit_score_100/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Le budget cyber a été voté en mars\./)).toBeInTheDocument()
    for (const node of screen.getAllByText(/contact_fit_score_100|budget cyber/)) {
      expect(node.textContent).not.toContain('**')
    }
  })

  it('names the scope, confidence and relation to the object of a source when it carries them (#2264.17/.18/.20)', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [
            {
              kind: 'crm',
              label: 'Votre CRM — présence du compte croisée',
              scope: 'ce compte',
              confidence: 'high',
              relatesTo: 'Latecoere',
            },
          ],
        })}
      />,
    )
    await expand()
    expect(screen.getByText(/ce compte/)).toBeInTheDocument()
    expect(screen.getByText(/forte/)).toBeInTheDocument()
    expect(screen.getByText(/Latecoere/)).toBeInTheDocument()
  })

  it('shows none of the scope/confidence/relation line when a source carries none of them', async () => {
    renderWithRouter(
      <ContextDisclosure context={makeContext({ sources: [{ kind: 'account_dossier', label: 'TF1' }] })} />,
    )
    await expand()
    expect(screen.queryByText('Périmètre')).not.toBeInTheDocument()
  })

  it('shows no excerpt line when the source carries none (older reply, or non-document source)', async () => {
    renderWithRouter(
      <ContextDisclosure context={makeContext({ sources: [{ kind: 'account_dossier', label: 'TF1' }] })} />,
    )
    await expand()
    expect(screen.queryByText('Extrait consulté')).not.toBeInTheDocument()
  })

  it('date chaque source pour distinguer un vieux document d’un signal d’hier (V2 §13)', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [
            { kind: 'knowledge_doc', label: 'Playbook 2024', as_of: '2024-03-12T10:00:00+00:00' },
            { kind: 'knowledge_doc', label: 'Note récente', as_of: daysAgo(1) },
          ],
        })}
      />,
    )
    await expand()
    // Au-delà d'un mois la date parle mieux qu'un nombre de jours ; en deçà, le
    // relatif est immédiat. Les deux sources ne se ressemblent plus.
    expect(screen.getByText(/·.*2024/).parentElement).toHaveTextContent('Playbook 2024')
    expect(screen.getByText(/·.*hier/).parentElement).toHaveTextContent('Note récente')
  })

  it('n’affiche aucune fraîcheur quand la date est inconnue ou illisible', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [
            { kind: 'knowledge_doc', label: 'Sans date' },
            { kind: 'knowledge_doc', label: 'Date cassée', as_of: 'pas une date' },
          ],
        })}
      />,
    )
    await expand()
    // Correspondance EXACTE sur le libellé : rien n'a été accolé, donc rien
    // n'a été inventé pour combler une date manquante ou illisible.
    expect(screen.getByText('Sans date')).toBeInTheDocument()
    expect(screen.getByText('Date cassée')).toBeInTheDocument()
  })

  it('propose de connecter ce qui manque, et seulement ça (V2 §13)', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          not_consulted_actions: [{ label: 'CRM HubSpot non connecté', action: 'connect_crm' }],
        })}
      />,
    )
    await expand()
    expect(screen.getByRole('link', { name: /Connecter/ })).toHaveAttribute('href', '/integrations')
    // Une ligne sans action reste un simple constat — scopé à la liste « Non
    // consulté » : le lien de confidentialité (#1941.14), lui, est toujours là.
    const notConsultedList = screen.getByText('CRM HubSpot non connecté').closest('ul')
    expect(within(notConsultedList as HTMLElement).getAllByRole('link')).toHaveLength(1)
  })

  it('#2145.23 (via #2925) — propose de connecter la messagerie absente, vers le même écran que le CRM', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          not_consulted: ['Aucune messagerie connectée'],
          not_consulted_actions: [{ label: 'Aucune messagerie connectée', action: 'connect_email' }],
        })}
      />,
    )
    await expand()
    expect(screen.getByRole('link', { name: /Connecter/ })).toHaveAttribute('href', '/integrations')
  })

  // #2208.30 — Intégrations a quitté les Réglages (`/integrations`) : le clic « Connecter » ne part
  // plus vers les Réglages, il ne pose donc plus le signal #2925 (réservé aux destinations `/settings/*`).
  it('#2925 (#2145.20) — « Connecter » vise /integrations, hors Réglages : aucun signal « ouvert depuis Laura »', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          not_consulted_actions: [{ label: 'CRM HubSpot non connecté', action: 'connect_crm' }],
        })}
      />,
    )
    await expand()
    fireEvent.click(screen.getByRole('link', { name: /Connecter/ }))
    expect(markSettingsOpenedFromLaura).not.toHaveBeenCalled()
  })

  const NO_ACCOUNT_LABEL = 'Aucun compte analysé rattaché à cette conversation'

  it('#1933.2 — le lien « Analyser un compte » porte le compte déjà SCOPÉ', async () => {
    renderWithRouter(
      <ContextDisclosure
        accountId="a800466a-4194-4394-bd74-8d15a52df24f"
        context={makeContext({
          not_consulted: [NO_ACCOUNT_LABEL],
          not_consulted_actions: [{ label: NO_ACCOUNT_LABEL, action: 'analyse_account' }],
        })}
      />,
    )
    await expand()
    expect(screen.getByRole('link', { name: /analyse/i })).toHaveAttribute(
      'href',
      '/search?accountId=a800466a-4194-4394-bd74-8d15a52df24f',
    )
  })

  it('#1933.2 — sans compte scopé, le lien reste NU : jamais un identifiant inventé', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          not_consulted: [NO_ACCOUNT_LABEL],
          not_consulted_actions: [{ label: NO_ACCOUNT_LABEL, action: 'analyse_account' }],
        })}
      />,
    )
    await expand()
    expect(screen.getByRole('link', { name: /analyse/i })).toHaveAttribute('href', '/search')
  })

  it('ignore une action inconnue plutôt que de fabriquer un lien mort', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          not_consulted_actions: [{ label: 'LinkedIn non interrogé', action: 'connect_linkedin' }],
        })}
      />,
    )
    await expand()
    const notConsultedList = screen.getByText('CRM HubSpot non connecté').closest('ul')
    expect(within(notConsultedList as HTMLElement).queryByRole('link')).not.toBeInTheDocument()
  })

  it('#1941.14 — propose un lien vers le détail de confidentialité, une fois déplié', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.getByRole('link', { name: /confidentialité/i })).toHaveAttribute('href', '/settings/mes-donnees')
  })

  it('affiche encore une réponse produite avant la fraîcheur et les raccourcis', async () => {
    // Pas de `as_of`, pas de `not_consulted_actions` : l'historique déjà en base.
    // Le lien de confidentialité (#1941.14), lui, reste — il ne dépend d'aucun
    // des deux champs optionnels.
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.getByText('Playbook SNCF')).toBeInTheDocument()
    const notConsultedList = screen.getByText('CRM HubSpot non connecté').closest('ul')
    expect(within(notConsultedList as HTMLElement).queryByRole('link')).not.toBeInTheDocument()
  })

  it('dit sur QUELLE NATURE de source la réponse s’appuie (méthode ≠ document)', async () => {
    // Sans ça, une règle métier Bellum et un document déposé par le commercial
    // s'affichent en pastilles identiques : le copilote « cite la méthode »
    // sans que personne puisse voir que c'en est une.
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [
            { kind: 'knowledge_doc', label: 'Playbook SNCF' },
            { kind: 'method_rule', label: 'Règle métier « score_compte_25 » — méthode Bellum' },
          ],
        })}
      />,
    )
    await expand()
    expect(screen.getByText('Méthode Bellum')).toBeInTheDocument()
    expect(screen.getByText('Ton document')).toBeInTheDocument()
  })

  it('cite le dossier de compte consulté par un outil, avec sa fraîcheur', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [{ kind: 'account_dossier', label: 'TF1', as_of: daysAgo(1) }],
        })}
      />,
    )
    await expand()
    const chip = screen.getByText('TF1').parentElement
    expect(chip).toHaveTextContent('Dossier de compte')
    expect(chip).toHaveTextContent('hier')
  })

  /**
   * #2547.1 — retour CLIENT (Ludovic Marx) : « Laura m'a remonté des éléments
   * sans citer de signaux ». Un compte trouvé par le tour d'horizon
   * (`run_account_search`) doit porter une preuve VÉRIFIABLE à l'écran — sa
   * date réelle, contrairement à `market_observation` qui la masque volontairement.
   */
  it('cite un compte trouvé par le tour d’horizon, avec sa date réelle', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [{ kind: 'market_signal', label: 'Decathlon', as_of: daysAgo(1) }],
        })}
      />,
    )
    await expand()
    const chip = screen.getByText('Decathlon').parentElement
    expect(chip).toHaveTextContent('Signal marché')
    expect(chip).toHaveTextContent('hier')
  })

  /**
   * #1599 — une observation de mémoire marché porte sa PROVENANCE (le libellé
   * « Mémoire marché ») et un avertissement FIXE plutôt qu'une date : la
   * période qu'elle agrège n'est jamais lue comme une fraîcheur.
   */
  it('nomme la mémoire marché et affiche son avertissement plutôt qu’une date', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          sources: [{ kind: 'market_observation', label: 'ESN autour du compte', as_of: '2024-01-01T00:00:00Z' }],
        })}
      />,
    )
    await expand()
    const chip = screen.getByText('ESN autour du compte').parentElement
    expect(chip).toHaveTextContent('Observations du marché')
    expect(chip).toHaveTextContent('Observation structurelle — ne décrit pas nécessairement la situation actuelle.')
    // Jamais la date du corpus, même si elle existe côté données.
    expect(chip).not.toHaveTextContent('2024')
  })

  it('n’étiquette pas une nature de source qu’il ne connaît pas', async () => {
    // Serveur en avance sur le web : on affiche la source, jamais un libellé inventé.
    renderWithRouter(<ContextDisclosure context={makeContext({ sources: [{ kind: 'sonar_interne', label: 'X' }] })} />)
    await expand()
    expect(screen.getByText('X')).toBeInTheDocument()
    expect(screen.queryByText('Méthode Bellum')).not.toBeInTheDocument()
  })
})

/**
 * #1780 bis — #1779 : LE PORTEFEUILLE SE NOMME.
 *
 * Un client a ouvert une conversation « Sans compte » et reçu une réponse qui
 * s'appuyait sur deux comptes de son portefeuille. Le résumé de provenance
 * fondait le dossier OUVERT et le PORTEFEUILLE dans un même « N comptes » : ni
 * la modale ni la réponse ne disaient d'où venait ce qu'il lisait.
 */
/**
 * #1941.4 — « COMPRENDRE LES COMPTES LISIBLES ».
 *
 * Le panneau n'affichait qu'un NOMBRE, et ce nombre venait d'un comptage de
 * LIGNES côté IA (l'en-tête du digest et le bloc de mémoire marché compris).
 * Le serveur nomme désormais les comptes qu'il a réellement servis
 * (`withReadablePortfolio`), et l'écran les LIT — il n'en devine aucun.
 */
describe('#1941.4 — le portefeuille se NOMME, pas seulement se compte', () => {
  function portfolioContext(portfolio: { present: boolean; count: number; names?: string[]; total?: number }) {
    return makeContext({
      active: {
        profile: { present: false, name: null },
        account: { present: false, name: null },
        contacts_count: 0,
        plan: { present: false },
        portfolio,
        memory: { pinned_facts: 0, has_summary: false },
      },
      sources: [],
    })
  }

  it('nomme les comptes servis quand le serveur les a nommés', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={portfolioContext({ present: true, count: 2, names: ['SNCF', 'THALES'], total: 2 })}
      />,
    )
    await expand()
    const text = document.body.textContent ?? ''
    expect(text).toContain('SNCF')
    expect(text).toContain('THALES')
  })

  it('une liste PARTIELLE dit sur combien elle porte — jamais le total tout seul', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={portfolioContext({ present: true, count: 2, names: ['SNCF', 'THALES'], total: 57 })}
      />,
    )
    await expand()
    expect(document.body.textContent ?? '').toContain('2 comptes sur 57')
  })

  it('au-delà de trois noms, le reste se COMPTE au lieu de disparaître', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={portfolioContext({ present: true, count: 5, names: ['A', 'B', 'C', 'D', 'E'], total: 5 })}
      />,
    )
    await expand()
    const text = document.body.textContent ?? ''
    expect(text).toContain('A, B, C')
    expect(text).toContain('2 autres')
  })

  it('sait dire NON : sans noms servis (API d’avant ce champ), le nombre seul reste — rien n’est inventé', async () => {
    renderWithRouter(<ContextDisclosure context={portfolioContext({ present: true, count: 12 })} />)
    expect(await screen.findByText(/ton portefeuille/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').toContain('12')
  })
})

describe('la provenance nomme le PORTEFEUILLE, jamais « N comptes » sans dire lesquels', () => {
  it('dit « ton portefeuille » quand aucun dossier n’est ouvert', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          active: {
            profile: { present: false, name: null },
            account: { present: false, name: null },
            contacts_count: 0,
            plan: { present: false },
            portfolio: { present: true, count: 12 },
            memory: { pinned_facts: 0, has_summary: false },
          },
          sources: [],
        })}
      />,
    )
    expect(await screen.findByText(/ton portefeuille/)).toBeInTheDocument()
    expect(document.body.textContent).toContain('12')
  })

  it('distingue le dossier OUVERT du portefeuille quand les deux ont servi', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          active: {
            profile: { present: false, name: null },
            account: { present: true, name: 'SNCF' },
            contacts_count: 0,
            plan: { present: false },
            portfolio: { present: true, count: 12 },
            memory: { pinned_facts: 0, has_summary: false },
          },
          sources: [],
        })}
      />,
    )
    await screen.findByText(/ton portefeuille/)
    const text = document.body.textContent ?? ''
    // Deux provenances, deux mentions : le dossier ouvert compte pour un, le
    // portefeuille se nomme avec sa taille.
    expect(text).toContain('1 compte')
    expect(text).toContain('12 comptes')
    // Le défaut d'origine : 1 + 12 = « 13 comptes », un nombre que rien à
    // l'écran n'explique.
    expect(text).not.toContain('13 comptes')
  })

  it('ne nomme RIEN quand le portefeuille n’a pas servi — la garde sait dire non', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await screen.findByText(/Cette réponse utilise/)
    expect(document.body.textContent).not.toContain('ton portefeuille')
  })

  // #2448.4 (épopée #2882) — « AUTO n'est pas un mode opaque ».
  it('affiche la raison du mode SANS déplier le panneau, quand le serveur la fournit', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          mode_explanation: {
            reason: 'account_analysis',
            text: "Il s'agit d'analyser un compte, donc j'ai vérifié plutôt que de résumer de mémoire.",
          },
        })}
      />,
    )
    expect(await screen.findByText(/j'ai vérifié plutôt que de résumer de mémoire/)).toBeInTheDocument()
  })

  it('ne rend aucune ligne de raison quand le serveur n’en fournit pas', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await screen.findByText(/Cette réponse utilise/)
    expect(document.body.textContent).not.toContain('vérifié plutôt que de résumer')
  })
})

/**
 * #3163 (retour bêta, 28/09/2026) — `compact` : la même information (résumé,
 * bouton) sur UNE ligne plutôt que deux blocs empilés. N'affecte QUE l'état
 * replié ; un appelant qui ne passe pas ce prop (`ReplyFooter.tsx`) garde le
 * rendu HISTORIQUE — c'est ce que le premier test ci-dessous protège.
 */
describe('ContextDisclosure — compact (#3163)', () => {
  it('un appelant historique (sans `compact`) garde son résumé et son bouton sur deux lignes, texte visible', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    const toggle = await screen.findByRole('button', { name: /Contexte utilisé/ })
    // Le texte du bouton reste VISIBLE — c'est justement ce que `compact` retire.
    expect(toggle).toHaveTextContent('Contexte utilisé')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('`compact` : résumé et bouton sur la MÊME ligne, résumé tronqué avec le texte complet en infobulle', async () => {
    renderWithRouter(<ContextDisclosure compact context={makeContext()} />)
    const summary = await screen.findByText(/Cette réponse utilise/)
    expect(summary.className).toMatch(/truncate/)
    const toggle = screen.getByRole('button', { name: /Contexte utilisé/ })
    // Même conteneur flex qu'un seul parent commun : la preuve la plus simple
    // que les deux sont sur la MÊME ligne, pas deux blocs empilés.
    expect(summary.closest('div')).toBe(toggle.closest('div'))
    await userEvent.hover(summary)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Cette réponse utilise/)
  })

  it('`compact` : le bouton perd son texte visible mais garde le même nom accessible et le même geste', async () => {
    renderWithRouter(<ContextDisclosure compact context={makeContext()} />)
    const toggle = await screen.findByRole('button', { name: /Contexte utilisé/ })
    expect(toggle.textContent).toBe('')
    fireEvent.click(toggle)
    expect(screen.getByText('Profil ESN : Skaizen')).toBeInTheDocument()
  })

  it('`compact` sans rien à résumer : seul le bouton reste, pas de ligne vide', async () => {
    renderWithRouter(
      <ContextDisclosure
        compact
        context={makeContext({
          active: {
            profile: { present: false, name: null },
            account: { present: false, name: null },
            contacts_count: 0,
            plan: { present: false },
            portfolio: { present: false, count: 0 },
            memory: { pinned_facts: 0, has_summary: false },
          },
          sources: [],
        })}
      />,
    )
    await screen.findByRole('button', { name: /Contexte utilisé/ })
    expect(screen.queryByText(/Cette réponse utilise/)).not.toBeInTheDocument()
  })

  it('`alwaysOpen` reste prioritaire sur `compact` — aucune ligne repliée à afficher', async () => {
    renderWithRouter(<ContextDisclosure compact alwaysOpen context={makeContext()} />)
    expect(await screen.findByText('Profil ESN : Skaizen')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Contexte utilisé/ })).not.toBeInTheDocument()
  })
})

/**
 * #3193.2/.3/.4 (épopée #3217) — le reçu de connaissance structuré : les onze
 * couches de l'issue, dans le format « Utilisé pour cette réponse » / « Non
 * utilisé » de son exemple.
 *
 * #3217.1 (recette prod 29/09) — Louis : le panneau ne montrait que DEUX
 * statuts (Utilisé / Non utilisé), jamais les quatre états réels du reçu.
 * Corrigé : quatre sections distinctes (Utilisé, Non demandé, Indisponible,
 * Interdit par le mode), et les champs optionnels réels (`result_count`,
 * `coverage`, `freshness`, `caveat`) rendus quand la couche les porte —
 * jamais devinés (« on n'affiche pas ce qu'on n'a pas »).
 */
describe('ContextDisclosure — reçu de connaissance (#3217)', () => {
  const knowledgeReceipt: NonNullable<ChatResponseContext['knowledge_receipt']> = {
    workspace: { status: 'consulted', result_count: 3 },
    crm: { status: 'unavailable', caveat: 'lecture tentée, non aboutie pour cette réponse' },
    messaging: { status: 'not_requested' },
    agenda: { status: 'not_requested' },
    documents: { status: 'consulted', result_count: 1 },
    account_dossier: { status: 'consulted' },
    dataforge: { status: 'not_requested' },
    market_memory: { status: 'not_requested' },
    current_public_sources: { status: 'forbidden_by_mode' },
    bellum_method: { status: 'not_requested' },
    inference: { status: 'consulted', caveat: 'réponse combinée par raisonnement' },
  }

  it('n’affiche aucune section sans `knowledge_receipt` — réponse d’avant ce champ', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.queryByText('Reçu de connaissance')).not.toBeInTheDocument()
  })

  it('nomme les ONZE couches, même celles jamais consultées — un score n’est jamais nu', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ knowledge_receipt: knowledgeReceipt })} />)
    await expand()
    expect(screen.getByText('Reçu de connaissance')).toBeInTheDocument()
    // Utilisées.
    expect(screen.getByText(/Ton espace/)).toBeInTheDocument()
    expect(screen.getByText(/Tes documents/)).toBeInTheDocument()
    expect(screen.getByText('Dossier de compte')).toBeInTheDocument()
    expect(screen.getByText(/Raisonnement/)).toBeInTheDocument()
    // Non utilisées — nommées quand même, jamais tues.
    expect(screen.getByText('Ton agenda')).toBeInTheDocument()
    expect(screen.getByText('Référentiel sectoriel Bellum')).toBeInTheDocument()
    expect(screen.getByText('Observations du marché')).toBeInTheDocument()
    expect(screen.getByText(/Sources publiques actuelles/)).toBeInTheDocument()
    expect(screen.getByText('Méthode Bellum')).toBeInTheDocument()
    expect(screen.getByText('Ta messagerie')).toBeInTheDocument()
  })

  it('distingue QUATRE statuts — pas deux : Utilisé, Non demandé, Indisponible, Interdit par le mode', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ knowledge_receipt: knowledgeReceipt })} />)
    await expand()
    expect(screen.getByText('Utilisé pour cette réponse :')).toBeInTheDocument()
    expect(screen.getByText('Non demandé :')).toBeInTheDocument()
    expect(screen.getByText('Indisponible :')).toBeInTheDocument()
    expect(screen.getByText('Interdit par le mode :')).toBeInTheDocument()
  })

  it('range chaque couche dans SON état réel, jamais dans un même panier « non utilisé »', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ knowledge_receipt: knowledgeReceipt })} />)
    await expand()
    const notRequestedSection = screen.getByText('Non demandé :').closest('div') as HTMLElement
    expect(within(notRequestedSection).getByText('Ton agenda')).toBeInTheDocument()
    expect(within(notRequestedSection).getByText('Ta messagerie')).toBeInTheDocument()
    const unavailableSection = screen.getByText('Indisponible :').closest('div') as HTMLElement
    expect(within(unavailableSection).getByText(/Ton CRM/)).toBeInTheDocument()
    const forbiddenSection = screen.getByText('Interdit par le mode :').closest('div') as HTMLElement
    expect(within(forbiddenSection).getByText(/Sources publiques actuelles/)).toBeInTheDocument()
  })

  it('montre la RAISON réelle d’une panne CRM (`caveat` du serveur), pas seulement « indisponible »', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ knowledge_receipt: knowledgeReceipt })} />)
    await expand()
    expect(
      screen.getByText(
        /Ton CRM — tenté, indisponible pour cette réponse · lecture tentée, non aboutie pour cette réponse/,
      ),
    ).toBeInTheDocument()
  })

  it('montre le nombre RÉEL de résultats d’une couche utilisée (`result_count`)', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ knowledge_receipt: knowledgeReceipt })} />)
    await expand()
    expect(screen.getByText(/Ton espace/)).toBeInTheDocument()
    expect(screen.getByText(/3 résultats/)).toBeInTheDocument()
    expect(screen.getByText(/1 résultat\b/)).toBeInTheDocument()
  })

  it('ne rend jamais "DataForge" — le nom interne n’atteint jamais l’écran', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ knowledge_receipt: knowledgeReceipt })} />)
    await expand()
    expect(screen.queryByText(/DataForge/i)).not.toBeInTheDocument()
  })

  /**
   * #3708 (recette prod 09/10) — un CRM EXCLU pour ce fil sortait en « Non
   * demandé », EN MÊME TEMPS que la liste « NON CONSULTÉ » le disait
   * « exclu par toi » — la même source sous deux formes contradictoires dans
   * la même réponse. Son propre groupe, jamais mélangé à « Non demandé ».
   */
  it('#3708 — un CRM EXCLU pour ce fil a sa PROPRE section, jamais « Non demandé »', async () => {
    const excludedReceipt = { ...knowledgeReceipt, crm: { status: 'excluded' as const } }
    renderWithRouter(<ContextDisclosure context={makeContext({ knowledge_receipt: excludedReceipt })} />)
    await expand()
    expect(screen.getByText('Exclu par toi pour ce fil :')).toBeInTheDocument()
    const excludedSection = screen.getByText('Exclu par toi pour ce fil :').closest('div') as HTMLElement
    expect(within(excludedSection).getByText(/Ton CRM/)).toBeInTheDocument()
    const notRequestedSection = screen.getByText('Non demandé :').closest('div') as HTMLElement
    expect(within(notRequestedSection).queryByText(/Ton CRM/)).not.toBeInTheDocument()
  })
})

/**
 * #3176.10 (épopée #3216) — recette prod 29/09 : Louis, « aucun plan de
 * sources lisible dans Contexte utilisé ; seul un bloc NON CONSULTÉ
 * apparaît ». Le champ existait déjà côté IA (`data["context"]["source_plan"]`)
 * mais n'était lu par AUCUN appelant côté web.
 */
describe('ContextDisclosure — plan de sources (#3216)', () => {
  const sourcePlan: NonNullable<ChatResponseContext['source_plan']> = {
    source_plan_requested: 'internal_only',
    source_plan_effective: 'internal_only',
    matched_marker: 'seulement en interne',
    layers_called: ['thread_memory', 'profile', 'workspace'],
    layers_unavailable: ['dataforge', 'market_memory'],
    internal_memory_used: true,
    public_search_avoided: true,
    source_plan_override_reason: null,
  }

  it('n’affiche aucune section sans `source_plan` — le cas normal, aucun mode détecté', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.queryByText('Plan de sources')).not.toBeInTheDocument()
  })

  it('nomme la stratégie et les couches RÉELLEMENT appelées', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ source_plan: sourcePlan })} />)
    await expand()
    expect(screen.getByText('Plan de sources')).toBeInTheDocument()
    expect(screen.getByText(/seulement en interne/)).toBeInTheDocument()
    expect(screen.getByText('Couches appelées :')).toBeInTheDocument()
    expect(screen.getByText('Mémoire de cette conversation')).toBeInTheDocument()
    expect(screen.getByText('Ton profil')).toBeInTheDocument()
    expect(screen.getByText('Ton espace')).toBeInTheDocument()
  })

  it('nomme les couches ATTENDUES mais jamais obtenues, distinctement des appelées', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ source_plan: sourcePlan })} />)
    await expand()
    const unavailableSection = screen.getByText('Attendues, non obtenues :').closest('div') as HTMLElement
    expect(within(unavailableSection).getByText('Référentiel sectoriel Bellum')).toBeInTheDocument()
    expect(within(unavailableSection).getByText('Observations du marché')).toBeInTheDocument()
  })

  it('dit que la recherche publique a été évitée quand le plan l’interdisait et qu’elle l’a été', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ source_plan: sourcePlan })} />)
    await expand()
    expect(screen.getByText('Recherche publique évitée, conformément à ta demande.')).toBeInTheDocument()
  })

  it('ne rend jamais "DataForge" — le nom interne n’atteint jamais l’écran', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ source_plan: sourcePlan })} />)
    await expand()
    expect(screen.queryByText(/DataForge/i)).not.toBeInTheDocument()
  })
})

/**
 * #214.1 (réel, épopée #3229) — le SEARCH UNIVERSE d'une demande à population
 * large existait déjà côté IA (`data["context"]["search_universe"]`,
 * `apps/ia/app/routers/chat.py`) mais n'était lu par AUCUN appelant côté web
 * — « du code juste que personne n'appelle ».
 */
const searchUniverseFixture: NonNullable<ChatResponseContext['search_universe']> = {
  population: 'tous les décideurs IT de SNCF',
  entities_covered: [],
  geographies: ['Île-de-France'],
  roles: [],
  periods: [],
  sources: [],
  exclusions: [],
  limits: [],
  pagination: null,
  relevance_criteria: [],
}

describe('ContextDisclosure — périmètre de recherche (#3229)', () => {
  const searchUniverse: NonNullable<ChatResponseContext['search_universe']> = {
    population: 'tous les décideurs IT de SNCF',
    entities_covered: [],
    geographies: ['Île-de-France', 'Grand Est'],
    roles: ['Décideur économique', 'Décideur technique'],
    periods: [],
    sources: [],
    exclusions: ['hors filiales cédées'],
    limits: [],
    pagination: null,
    relevance_criteria: [],
  }

  it('n’affiche aucune section sans `search_universe` — le cas normal, aucun marqueur détecté', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.queryByText('Périmètre de recherche')).not.toBeInTheDocument()
  })

  it('nomme la population visée et les géographies/rôles détectés', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ search_universe: searchUniverse })} />)
    await expand()
    expect(screen.getByText('Périmètre de recherche')).toBeInTheDocument()
    expect(screen.getByText(/tous les décideurs IT de SNCF/)).toBeInTheDocument()
    expect(screen.getByText('Géographies :')).toBeInTheDocument()
    expect(screen.getByText('Île-de-France')).toBeInTheDocument()
    expect(screen.getByText('Rôles :')).toBeInTheDocument()
    expect(screen.getByText('Décideur technique')).toBeInTheDocument()
    expect(screen.getByText('Exclu :')).toBeInTheDocument()
    expect(screen.getByText('hors filiales cédées')).toBeInTheDocument()
  })

  it('ne rend aucune ligne pour un champ vide — une absence ne fait jamais de ligne', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          search_universe: { ...searchUniverse, roles: [], exclusions: [] },
        })}
      />,
    )
    await expand()
    expect(screen.queryByText('Rôles :')).not.toBeInTheDocument()
    expect(screen.queryByText('Exclu :')).not.toBeInTheDocument()
  })
})

describe('ContextDisclosure — couverture construite sur de vrais résultats (#3229)', () => {
  const coverage: NonNullable<ChatResponseContext['coverage_report']> = {
    detected: 214,
    resolved: 81,
    verified: null,
    relevant: 18,
    enriched: 6,
    excluded: 0,
    unresolved: 133,
    sources_unavailable: [],
    estimated_coverage: null,
    coverage_basis: 'contacts de l’espace',
  }

  it('n’affiche aucune couverture sans `coverage_report` — le cas normal', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.queryByText('Périmètre de recherche')).not.toBeInTheDocument()
    expect(screen.queryByText(/détecté/)).not.toBeInTheDocument()
  })

  it('rend un palier par ligne, sans fusion, et OMET le palier non mesuré — jamais « 0 vérifié »', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ coverage_report: coverage })} />)
    await expand()
    expect(screen.getByText('Périmètre de recherche')).toBeInTheDocument()
    expect(screen.getByText('214 détecté(s)')).toBeInTheDocument()
    expect(screen.getByText('81 classé(s)')).toBeInTheDocument()
    expect(screen.getByText('18 correspondent aux rôles recherchés')).toBeInTheDocument()
    expect(screen.getByText('6 disposent d’une coordonnée exploitable')).toBeInTheDocument()
    expect(screen.queryByText(/vérifié/)).not.toBeInTheDocument()
    // Une lecture de l'espace ne se présente jamais comme une lecture du marché (GA-259).
    expect(screen.getByText(/espace, pas du marché/)).toBeInTheDocument()
  })

  it('partage UNE section avec le périmètre de la demande — pas un bloc de plus', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({ coverage_report: coverage, search_universe: searchUniverseFixture })}
      />,
    )
    await expand()
    expect(screen.getAllByText('Périmètre de recherche')).toHaveLength(1)
    expect(screen.getByText('214 détecté(s)')).toBeInTheDocument()
    expect(screen.getByText('Île-de-France')).toBeInTheDocument()
  })
})

/**
 * #3183.11 (recette prod 29-30/09, LAU-FINAL-189) — Louis : « approfondissement
 * progressif non prouvé ». Le NO-GO exact de l'issue (« le bouton ou la
 * demande "approfondis" produit exactement la même réponse avec davantage de
 * texte ») ne pouvait jamais être réfuté depuis l'écran : `turn_observability`
 * existait déjà côté IA (`apps/ia/app/services/chat_turn_plan.py`, #3196.6)
 * mais n'était lu par AUCUN appelant côté web.
 */
describe('ContextDisclosure — preuve d’approfondissement (#3183)', () => {
  const secondPass: NonNullable<ChatResponseContext['turn_observability']> = {
    execution_plan: 'mode_approfondi',
    planned_steps: 3,
    completed_steps: 2,
    skipped_steps: 1,
    parallel_calls: 4,
    budget_exhausted: false,
    degraded_answer: false,
    job_created: false,
  }

  it('n’affiche aucune section sans `turn_observability` — le cas normal', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.queryByText('Approfondissement')).not.toBeInTheDocument()
  })

  it('n’affiche rien non plus sur un seul passage — rien à prouver', async () => {
    renderWithRouter(
      <ContextDisclosure context={makeContext({ turn_observability: { ...secondPass, completed_steps: 1 } })} />,
    )
    await expand()
    expect(screen.queryByText('Approfondissement')).not.toBeInTheDocument()
  })

  it('prouve le second passage avec le compte réel de passages', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ turn_observability: secondPass })} />)
    await expand()
    expect(screen.getByText('Approfondissement')).toBeInTheDocument()
    expect(screen.getByText('2 passages sur 3 utilisés pour cette réponse')).toBeInTheDocument()
  })

  /**
   * #3218 — recette (07/10) : la source nommait « Approfondissement » / « PASS 1…2 »
   * pendant que le texte de Laura disait « dossier existant réutilisé, pas relancé » —
   * perçu comme une contradiction. Ce sont deux mécanismes différents (les passes de
   * RECHERCHE de ce tour de chat, jamais une relance du pipeline d'analyse du compte) :
   * la section le dit explicitement pour que texte et source restent cohérents.
   */
  it('#3218 — précise que les passes concernent cette réponse, jamais une relance de l’analyse du compte', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ turn_observability: secondPass })} />)
    await expand()
    expect(
      screen.getByText(/concernent la recherche de cette réponse, pas une relance de l’analyse du compte/),
    ).toBeInTheDocument()
  })

  it('#3218 — nomme chaque passe annoncée par le moteur (PASS N) au lieu de les perdre avec l’événement transitoire', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          turn_observability: {
            ...secondPass,
            deepening: [
              { kind: 'pass', pass: 1 },
              { kind: 'pass', pass: 2 },
              { kind: 'stop', reason: 'marginal_gain' },
            ],
          },
        })}
      />,
    )
    await expand()
    expect(screen.getByText(/PASS 1 — vérification ciblée/)).toBeInTheDocument()
    expect(screen.getByText(/PASS 2 — recherche thématique/)).toBeInTheDocument()
    expect(screen.getByText(/Arrêt : le dernier passage n’a rien apporté de neuf/)).toBeInTheDocument()
  })

  it('#3218 — un arrêt sans passe annoncée reste visible (un seul passage, critère d’arrêt nommé)', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          turn_observability: {
            ...secondPass,
            completed_steps: 1,
            deepening: [{ kind: 'stop', reason: 'marginal_gain' }],
          },
        })}
      />,
    )
    await expand()
    expect(screen.getByText('Approfondissement')).toBeInTheDocument()
    expect(screen.getByText(/Arrêt : le dernier passage n’a rien apporté de neuf/)).toBeInTheDocument()
  })

  it('dit quand le délai du tour a coupé le plan avant la fin', async () => {
    renderWithRouter(
      <ContextDisclosure context={makeContext({ turn_observability: { ...secondPass, budget_exhausted: true } })} />,
    )
    await expand()
    expect(screen.getByText('Le délai du tour a été atteint avant la fin du plan prévu.')).toBeInTheDocument()
  })

  it('ne dit rien du délai ou du mode dégradé quand ni l’un ni l’autre ne s’est produit', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext({ turn_observability: secondPass })} />)
    await expand()
    expect(screen.queryByText(/délai du tour/)).not.toBeInTheDocument()
    expect(screen.queryByText(/mode dégradé/)).not.toBeInTheDocument()
  })
})

describe('ContextDisclosure — périmètre de groupe du fil (#3227)', () => {
  it('nomme la racine, les filiales incluses et les exclues posées par `note_thread_context`', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({
          thread_scope: { root: 'La Poste', included: ['Docaposte'], excluded: ['Geopost'], unresolved: [] },
        })}
      />,
    )
    await expand()
    expect(screen.getByText('Périmètre de recherche')).toBeInTheDocument()
    expect(screen.getByText('Groupe du fil : La Poste')).toBeInTheDocument()
    expect(screen.getByText('Docaposte')).toBeInTheDocument()
    expect(screen.getByText('Hors périmètre : Geopost')).toBeInTheDocument()
  })

  it('SAIT DIRE NON — sans `thread_scope`, aucune ligne de groupe (une absence ne fait pas de ligne)', async () => {
    renderWithRouter(<ContextDisclosure context={makeContext()} />)
    await expand()
    expect(screen.queryByText(/Groupe du fil/)).not.toBeInTheDocument()
  })

  it('une racine seule ne rend ni filiales ni exclusions vides', async () => {
    renderWithRouter(
      <ContextDisclosure
        context={makeContext({ thread_scope: { root: 'Vinci', included: [], excluded: [], unresolved: [] } })}
      />,
    )
    await expand()
    expect(screen.getByText('Groupe du fil : Vinci')).toBeInTheDocument()
    expect(screen.queryByText(/Hors périmètre/)).not.toBeInTheDocument()
  })
})
