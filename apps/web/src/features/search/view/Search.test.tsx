import { fireEvent, screen, within } from '@testing-library/react'
import type { Account } from '@bellum/contracts'
import { strToU8, zipSync } from 'fflate'
import { createElement, type ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { Search } from './Search'

// Spy the analysis launcher so we can assert it fires ONLY after confirmation.
// `searchParams` / `sourceAccount` sont mutables : c'est ce qui permet de rendre
// l'écran en RELANCE (`/search?accountId=…`) sans un second fichier de test.
const h = vi.hoisted(() => ({
  startAnalysis: vi.fn(),
  searchParams: {} as Record<string, unknown>,
  sourceAccount: null as Account | null,
  navigate: vi.fn(),
  ingest: vi.fn(),
  updateScope: vi.fn(),
  accountId: null as string | null,
}))
// #3623 — le dépôt des documents joints passe par la route d'ingestion réelle ; jamais le réseau ici.
vi.mock('@/features/rag/api', () => ({
  ragApi: { ingest: h.ingest, ingestZip: vi.fn(), updateScope: h.updateScope },
}))
vi.mock('@/features/accounts/hooks/useAccount', () => ({
  useAccount: () => ({ account: h.sourceAccount, contacts: [], loading: false, error: null }),
}))
vi.mock('@/features/search/hooks/useAnalysis', () => ({
  useAnalysis: () => ({
    status: 'idle',
    phase: null,
    percent: null,
    accountId: h.accountId,
    error: null,
    startAnalysis: h.startAnalysis,
    reset: vi.fn(),
  }),
}))
// No network autocomplete in the unit test.
vi.mock('@/features/search/hooks/useCompanySearch', () => ({
  useCompanySearch: () => ({ suggestions: [], loading: false, search: vi.fn(), clearSuggestions: vi.fn() }),
  // #1688.2 — `Search.tsx` importe cette constante (jamais recopiée en dur,
  // GA-26) pour distinguer une frappe trop courte d'une recherche RÉELLEMENT
  // tentée ; un mock qui l'omet fait planter le module au chargement.
  MIN_QUERY_LENGTH: 2,
}))

/**
 * ⚠️ Le Proxy MÉMORISE ses composants.
 *
 * Sans ce cache, chaque accès à `motion.div` rend une closure NEUVE : React voit
 * un type différent d'un rendu à l'autre, démonte tout le sous-arbre et le
 * remonte — l'état local des enfants part avec, et le test devient aveugle à
 * toute interaction qui change un état. Mesuré le 03/09 : un clic passait, le
 * `setState` était bien appelé, et l'écran entier disparaissait du DOM.
 */
const motionComponents = new Map<string, unknown>()

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) => {
        if (typeof prop === 'string') {
          const cached = motionComponents.get(prop)
          if (cached) return cached
          const Rendered = ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
            createElement(prop, props, children)
          motionComponents.set(prop, Rendered)
          return Rendered
        }
      },
    },
  ),
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
  useInView: () => true,
  useReducedMotion: () => true,
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

vi.mock('@tanstack/react-router', async importActual => {
  const actual = await importActual<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => h.navigate,
    useSearch: () => h.searchParams,
  }
})

beforeAll(() => {
  window.scrollTo = vi.fn()
})

beforeEach(() => {
  h.searchParams = {}
  h.sourceAccount = null
  h.navigate.mockReset()
  h.accountId = null
})

describe('Search', () => {
  // #3618 retire les deux titres « Qu'est-ce que tu veux vérifier ? » et son
  // sous-titre (`SearchLaunchHeader`), délibérément (Louis 05/10) — ce test
  // affirmait #2162.1, il dit désormais NON.
  it('renders without crash — sans le titre ni le sous-titre retirés par #3618', async () => {
    renderWithRouter(<Search />)
    expect(await screen.findByPlaceholderText(/Recherche une entreprise/)).toBeInTheDocument()
    expect(screen.queryByText("Qu'est-ce que tu veux vérifier ?")).not.toBeInTheDocument()
    expect(screen.queryByText(/Pars d'une entreprise, d'un contact ou d'un besoin précis/)).not.toBeInTheDocument()
  })

  // #4140 — une arrivée fraîche sur /search (aucun preset dans l'URL, aucun
  // compte source) allumait « Autre » par défaut (`INITIAL_FREE_CONTEXT`,
  // preset `free`) : aucun des 8 boutons de l'IntentPicker n'était visiblement
  // le choix par défaut demandé. « Ouvrir ce compte » (preset `strategic`,
  // #2162.20) est le premier des 7 intents et le geste le plus fréquent du
  // produit (PRD) : c'est lui qui est coché par défaut, jamais « Autre ».
  it('#4140 — « Ouvrir ce compte » est coché par défaut sur une arrivée fraîche', async () => {
    renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    expect(screen.getByRole('button', { name: 'Ouvrir ce compte' })).toHaveAttribute('aria-pressed', 'true')
    // #4512 — l'assertion lisait la puce « Autre » des postes (rendue dans « Affiner », même replié) ; elle n'est plus
    // dans le DOM tant que « Personnalisation » est repliée. Ce qui compte : un seul objectif coché, « Ouvrir ce compte ».
    const intents = screen.getByRole('group', { name: 'Ce que tu veux obtenir' })
    expect(
      within(intents)
        .getAllByRole('button', { pressed: true })
        .map(button => button.textContent),
    ).toEqual(['Ouvrir ce compte'])
  })

  // Coque Théo : le titre, la phrase et les liens de l'écran sont DÉCLARÉS à la route et dessinés par la
  // coque. L'écran ne dessine pas un second h1 (GA-347) ; les onglets « Une entreprise / Un contact /
  // Un besoin » ouvrent le formulaire.
  it('dessine l’en-tête de la maquette : UN h1 (la question), sa phrase, « Chercher des comptes » et « Mes analyses »', async () => {
    renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    const titles = screen.getAllByRole('heading', { level: 1 })
    expect(titles).toHaveLength(1)
    expect(titles[0]).toHaveTextContent('Quel compte veux-tu comprendre ?')
    expect(screen.getByText('Écris son nom, puis précise ce que tu veux obtenir.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chercher des comptes' })).toHaveAttribute('href', '/discover')
    expect(screen.getByRole('link', { name: 'Mes analyses' })).toHaveAttribute('href', '/search?vue=historique')
    expect(screen.getByRole('tab', { name: 'Une entreprise' })).toHaveAttribute('aria-selected', 'true')
  })

  it('l’ordre de la maquette R1 : en-tête, onglets, UNE carte (entreprise, objectif | cadrage, pied), puis « Récemment »', async () => {
    const { container } = renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    const order = [...container.querySelectorAll('[data-analyze-section]')].map(el =>
      el.getAttribute('data-analyze-section'),
    )
    expect(order).toEqual(['header', 'modes', 'work', 'company', 'purpose', 'cadrage', 'footer', 'recent'])
    const work = container.querySelector('[data-analyze-section="work"]')!
    // Les quatre blocs vivent DANS la carte de travail, jamais à côté.
    for (const part of ['company', 'purpose', 'cadrage', 'footer']) {
      expect(work.querySelector(`[data-analyze-section="${part}"]`)).not.toBeNull()
    }
    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      '1Commence par une entreprise',
      '2Ce que tu veux obtenir',
      '3Ton cadrage',
    ])
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Une entreprise',
      'Un contact',
      'Un besoin',
    ])
    // Les quatre objectifs fréquents sont des tuiles pressables, le premier retenu par défaut.
    const intents = within(screen.getByRole('group', { name: 'Ce que tu veux obtenir' })).getAllByRole('button')
    expect(intents.map(b => b.textContent)).toEqual([
      'Ouvrir ce compte',
      'Préparer un rendez-vous',
      'Trouver les décideurs',
      'Comprendre le groupe',
    ])
    expect(intents[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('« Un contact » : une carte à part, étape 1, la question et le bouton vers Contacts', async () => {
    const { container } = renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.click(screen.getByRole('tab', { name: 'Un contact' }))
    expect(container.querySelector('[data-analyze-section="work"]')).toBeNull()
    expect(container.querySelector('[data-analyze-section="handoff"]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Quel contact veux-tu vérifier ?')
  })

  // #3623 (Louis 05/10) — « dans une analyse je veux pouvoir insérer des CSV, des ZIP… une base
  // documentaire ». Le trombone ENVOIE le contenu (avant le débit), il ne nomme plus la requête.
  describe('#3623 — documents joints à l’analyse', () => {
    // #3623.1a — `new Uint8Array(…)` : sous jsdom, `TextEncoder` rend un tableau d'un AUTRE royaume,
    // que fflate (`instanceof Uint8Array`) prendrait pour un dossier — un navigateur n'a qu'un royaume.
    // Le `.buffer` de `zipSync` se type `ArrayBufferLike` (TS 5.7) : un `File` veut un `ArrayBuffer` concret.
    const validZip = (name: string) =>
      new File([zipSync({ 'a.csv': new Uint8Array(strToU8('x,y\n1,2')) }).buffer as ArrayBuffer], name)
    const attach = async (...files: File[]) => {
      await screen.findByPlaceholderText(/Recherche une entreprise/)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, { target: { files } })
    }
    const launch = async () => {
      fireEvent.change(screen.getByPlaceholderText(/Recherche une entreprise/), { target: { value: 'TF1' } })
      fireEvent.click(screen.getByRole('button', { name: /Préparer l'analyse/ }))
      fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))
    }

    beforeEach(() => {
      h.startAnalysis.mockClear()
      h.ingest.mockReset()
    })

    it('liste les pièces jointes, sans rien envoyer avant le lancement', async () => {
      renderWithRouter(<Search />)
      await attach(new File(['a,b'], 'recherches.csv'), validZip('pack.zip'))
      expect(await screen.findByText('recherches.csv')).toBeInTheDocument()
      expect(screen.getByText('pack.zip')).toBeInTheDocument()
      expect(screen.getAllByText('Prêt — envoyé au lancement')).toHaveLength(2)
      expect(h.ingest).not.toHaveBeenCalled()
      // Le trombone ne remplit plus la requête avec le nom du fichier.
      expect((screen.getByPlaceholderText(/Recherche une entreprise/) as HTMLInputElement).value).toBe('')
    })

    // #3623.1a — un .zip accepté sur sa seule extension puis illisible au lancement : le bug recette
    // du 08/10 (« mon zip factice de 22 octets → Non envoyé — envoi impossible »). Refusé ICI, à
    // l'ajout, nommé — jamais après coup.
    it('#3623.1a — un .zip illisible est refusé NOMMÉ à l’ajout, jamais listé « Prêt »', async () => {
      renderWithRouter(<Search />)
      await attach(new File(['PK\x03\x04'], 'factice.zip'))
      expect(await screen.findByText(/factice\.zip : archive illisible ou vide/)).toBeInTheDocument()
      expect(screen.queryByText('factice.zip')).not.toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Documents joints à cette analyse' })).not.toBeInTheDocument()
    })

    it('envoie le CONTENU au lancement, puis lance l’analyse', async () => {
      h.ingest.mockResolvedValue({ id: 'doc-1', partial: false, duplicate: false })
      renderWithRouter(<Search />)
      await attach(new File(['a,b\n1,2'], 'recherches.csv'))
      await launch()
      await vi.waitFor(() => expect(h.startAnalysis).toHaveBeenCalledTimes(1))
      expect(h.ingest).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'recherches.csv', content: 'a,b\n1,2', scope: 'personal' }),
      )
      expect(h.ingest.mock.invocationCallOrder[0]!).toBeLessThan(h.startAnalysis.mock.invocationCallOrder[0]!)
    })

    // #3623.1b — recette 08/10 : une pièce en échec NE bloque plus le lancement. Elle part sans
    // elle, et sa ligne nomme ce qui n'a pas pu être lu.
    it('une pièce qui ne s’envoie pas N’EMPÊCHE PAS le lancement — elle part sans elle, nommée', async () => {
      h.ingest.mockRejectedValue(new Error('boom'))
      renderWithRouter(<Search />)
      await attach(new File(['a,b'], 'recherches.csv'))
      await launch()
      await vi.waitFor(() => expect(h.startAnalysis).toHaveBeenCalledTimes(1))
      expect(await screen.findByText(/Non envoyé — envoi impossible, réessaie/)).toBeInTheDocument()
      // Aucun document rattachable au compte : le lancement part sans elle.
      expect(h.startAnalysis.mock.calls[0]![9]).toEqual([])
    })

    // #3623 / R19 (15/10) — « Lancer l’analyse » ne lançait RIEN : l'envoi d'une pièce restait
    // « en cours » sans fin et le lancement, enchaîné derrière, n'arrivait jamais. Une pièce qui
    // traîne ne retient plus l'analyse au-delà d'un délai borné.
    it('une pièce dont l’envoi ne répond jamais n’empêche pas le lancement (délai borné)', async () => {
      h.ingest.mockImplementation(() => new Promise(() => {}))
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        renderWithRouter(<Search />)
        await attach(new File(['a,b'], 'recherches.csv'))
        await launch()
        expect(h.startAnalysis).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(31_000)
        expect(h.startAnalysis).toHaveBeenCalledTimes(1)
        expect(h.startAnalysis.mock.calls[0]![9]).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })

    // #3623.9 — le POST de lancement part même quand une pièce traîne (R19), et la pièce qui finit
    // APRÈS le lancement est tout de même rattachée au compte : le filet web ne s'arrête plus à
    // la première pièce rattachée.
    it('#3623.9 — une pièce qui finit après le lancement est rattachée au compte quand même', async () => {
      let finishSlow: (v: unknown) => void = () => {}
      h.ingest.mockImplementation((input: { title: string }) =>
        input.title === 'lente.csv'
          ? new Promise(resolve => {
              finishSlow = resolve
            })
          : Promise.resolve({ id: 'doc-rapide', partial: false, duplicate: false }),
      )
      h.updateScope.mockResolvedValue(undefined)
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        renderWithRouter(<Search />)
        await attach(new File(['a'], 'rapide.csv'), new File(['b'], 'lente.csv'))
        await launch()
        await vi.advanceTimersByTimeAsync(31_000)
        expect(h.startAnalysis).toHaveBeenCalledTimes(1)
        expect(h.startAnalysis.mock.calls[0]![9]).toEqual(['doc-rapide'])
        h.accountId = 'acc-1'
        // Un re-rendu de l'écran (ici une frappe) : le compte est connu, la pièce rapide se rattache.
        fireEvent.change(screen.getByPlaceholderText(/Recherche une entreprise/), { target: { value: 'TF1 ' } })
        await vi.waitFor(() =>
          expect(h.updateScope).toHaveBeenCalledWith('doc-rapide', 'account', { accountId: 'acc-1' }),
        )
        finishSlow({ id: 'doc-lent', partial: false, duplicate: false })
        await vi.waitFor(() =>
          expect(h.updateScope).toHaveBeenCalledWith('doc-lent', 'account', { accountId: 'acc-1' }),
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('refuse un format illisible avec sa raison, sans l’ajouter', async () => {
      renderWithRouter(<Search />)
      await attach(new File(['MZ'], 'prog.exe'))
      expect(await screen.findByText(/prog\.exe : format non lu par l’analyse/)).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Documents joints à cette analyse' })).not.toBeInTheDocument()
    })

    it('retire une pièce avant le lancement', async () => {
      renderWithRouter(<Search />)
      await attach(new File(['a,b'], 'recherches.csv'))
      fireEvent.click(await screen.findByRole('button', { name: 'Retirer recherches.csv' }))
      expect(screen.queryByText('recherches.csv')).not.toBeInTheDocument()
    })
  })

  it('renders search input', async () => {
    renderWithRouter(<Search />)
    expect(await screen.findByPlaceholderText(/Recherche une entreprise/)).toBeInTheDocument()
  })

  // #3618 (renforcé 07/10) — « supprime ces deux titres » : la question de
  // l'état vide et son sous-titre ne sont plus rendus, le composeur est la
  // première chose lue (mesuré en prod : titre y=157, composeur y=397).
  it('#3618 — aucun titre ni sous-titre au-dessus du composeur', async () => {
    renderWithRouter(<Search />)
    expect(await screen.findByPlaceholderText(/Recherche une entreprise/)).toBeInTheDocument()
    expect(screen.queryByText(/Quel compte veux-tu travailler/)).not.toBeInTheDocument()
    expect(screen.queryByText(/construire un dossier commercial exploitable/)).not.toBeInTheDocument()
  })

  // P0-02 — submit opens the scope recap; the credit is spent only on confirm.
  it('confirms the scope before launching — submit shows the recap, not the analysis', async () => {
    h.startAnalysis.mockClear()
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'TF1' } })

    fireEvent.click(screen.getByRole('button', { name: /Préparer l'analyse/ }))

    // The recap is shown and NOTHING has launched yet.
    expect(await screen.findByText(/Le bon périmètre, dès le départ/)).toBeInTheDocument()
    expect(h.startAnalysis).not.toHaveBeenCalled()

    // Explicit confirmation launches the analysis with the typed company.
    fireEvent.click(screen.getByRole('button', { name: /Lancer l'analyse/ }))
    expect(h.startAnalysis).toHaveBeenCalledTimes(1)
    expect(h.startAnalysis.mock.calls[0][0]).toBe('TF1')
  })

  /**
   * #1133 — le récap doit SAVOIR qu'il s'agit d'une relance.
   *
   * Le panneau sait le dire depuis son propre test ; ce qui reste à garder, c'est
   * qu'on le lui DISE. Un booléen déclaré et jamais passé rendrait l'écran
   * exactement comme avant, tests du panneau au vert compris.
   */
  it('annonce une RELANCE quand on arrive depuis un dossier existant', async () => {
    h.searchParams = { accountId: 'acc-1', company: 'TF1' }
    h.sourceAccount = { id: 'acc-1', company_name: 'TF1', status: 'completed' } as Account

    renderWithRouter(<Search />)
    fireEvent.click(await screen.findByRole('button', { name: /Préparer l'analyse/ }))

    expect(await screen.findByText('Tu relances un dossier existant')).toBeInTheDocument()
    // Le même booléen part au serveur : ce qui est annoncé est ce qui est demandé.
    fireEvent.click(screen.getByRole('button', { name: /Lancer l'analyse/ }))
    expect(h.startAnalysis.mock.calls.at(-1)?.[6]).toBe(true)
  })

  /**
   * GA-96 — le dossier de Louis a changé d'entreprise, mesuré le 30/08/2026.
   *
   * Le compte ROCHE portait `552012031` (le laboratoire pharmaceutique).
   * « Actualiser l'analyse » ouvrait `/search?accountId=…&company=ROCHE`, et le
   * lancement repartait avec `siren: undefined` : l'écran de confirmation
   * annonçait « Résolution par nom », le registre a rendu ROCHE BOBOIS
   * (`493229280`, distributeur de meubles), et le dossier a changé de société —
   * en gardant les contacts et les angles du laboratoire.
   *
   * L'identité du dossier était pourtant LÀ, chargée par `useAccount`. Elle
   * n'était simplement jamais lue : le SIREN du lancement ne venait que de
   * `scopedEntity`, l'entité choisie dans l'autocomplétion, qui est nulle sur
   * une relance.
   */
  it('(GA-96) une relance part ANCRÉE sur le SIREN du dossier, jamais sur son seul nom', async () => {
    h.searchParams = { accountId: 'acc-roche', company: 'ROCHE' }
    h.sourceAccount = {
      id: 'acc-roche',
      company_name: 'ROCHE',
      status: 'completed',
      siren: '552012031',
    } as Account

    renderWithRouter(<Search />)
    fireEvent.click(await screen.findByRole('button', { name: /Préparer l'analyse/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Lancer l'analyse/ }))

    // 3ᵉ argument de `startAnalysis` = l'ancre d'identité de la collecte.
    expect(h.startAnalysis.mock.calls.at(-1)?.[2]).toBe('552012031')
  })

  it("(GA-96) le récap NOMME l'identité relancée au lieu d'annoncer « Résolution par nom »", async () => {
    // C'est l'écran qui a menti à Louis : il annonçait une résolution par nom
    // sur un dossier dont l'identité était déjà acquise. La phrase se lit juste
    // au-dessus du bouton qui débite — c'est le dernier moment où la question
    // « est-ce bien CETTE société ? » peut encore se poser.
    h.searchParams = { accountId: 'acc-roche', company: 'ROCHE' }
    h.sourceAccount = { id: 'acc-roche', company_name: 'ROCHE', status: 'completed', siren: '552012031' } as Account

    renderWithRouter(<Search />)
    fireEvent.click(await screen.findByRole('button', { name: /Préparer l'analyse/ }))

    expect(await screen.findByText('SIREN 552012031')).toBeInTheDocument()
    expect(screen.queryByText('Résolution par nom')).not.toBeInTheDocument()
  })

  it('(GA-96) un dossier SANS identité reste résolu par nom — et le récap le DIT', async () => {
    // Le cas légitime : un compte créé à la main, une société étrangère. La
    // résolution par nom y est la seule possible ; elle reste donc autorisée,
    // mais elle passe par le même écran de confirmation qu'au premier
    // lancement — elle ne tranche pas seule.
    h.searchParams = { accountId: 'acc-manuel', company: 'Atelier Dupont' }
    h.sourceAccount = {
      id: 'acc-manuel',
      company_name: 'Atelier Dupont',
      status: 'completed',
      siren: null,
    } as unknown as Account

    renderWithRouter(<Search />)
    fireEvent.click(await screen.findByRole('button', { name: /Préparer l'analyse/ }))

    expect(await screen.findByText('Résolution par nom')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Lancer l'analyse/ }))
    // Rien n'est INVENTÉ : aucune identité n'est jointe au lancement.
    expect(h.startAnalysis.mock.calls.at(-1)?.[2]).toBeUndefined()
  })

  it('n’annonce aucune relance sur une première analyse', async () => {
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'TF1' } })
    fireEvent.click(screen.getByRole('button', { name: /Préparer l'analyse/ }))

    expect(await screen.findByText(/Le bon périmètre, dès le départ/)).toBeInTheDocument()
    expect(screen.queryByText('Tu relances un dossier existant')).not.toBeInTheDocument()
  })
})

/**
 * Cadrage analyse (retour Louis 15/10) — « que ce qu'on sélectionne avant
 * analyse entre VRAIMENT en compte ». Le maillon web de la preuve de bout en
 * bout : écran 1 = entreprise + objectif ; ce qu'on répond à l'écran « Cadrer »
 * part TEL QUEL dans le lancement (le reste du chemin — API `graphScopeSelection`,
 * IA `run_cadrage`/`scope_filter` — a ses propres tests).
 */
describe('Search — cadrage en quatre questions (15/10)', () => {
  async function openCadrage() {
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'Siemens' } })
    fireEvent.click(screen.getByRole('button', { name: /Préparer l'analyse/ }))
    await screen.findByText(/Le bon périmètre, dès le départ/)
  }

  it('l’écran 1 n’a plus de rangée « Périmètre »', async () => {
    renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    for (const label of ['Groupe entier', 'Filiales', 'IT & Digital', 'Startups', 'Business unit', 'Personnalisé']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })

  it('défaut France : le lancement part avec la zone France et le mode qui en DÉCOULE', async () => {
    h.startAnalysis.mockClear()
    await openCadrage()
    fireEvent.click(screen.getByRole('button', { name: /Lancer l'analyse/ }))
    const call = h.startAnalysis.mock.calls.at(-1)!
    expect(call[3]).toBe('france')
    expect(call[7]).toEqual(expect.objectContaining({ geo_perimeter: 'france' }))
  })

  it('chaque réponse part dans le payload : Monde, postes à placer, niveau de contact', async () => {
    h.startAnalysis.mockClear()
    renderWithRouter(<Search />)
    const input = await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.change(input, { target: { value: 'Siemens' } })
    // #4512 — « Personnalisation » (repli) range qui viser et les postes à placer ; la zone se règle à la vérification.
    fireEvent.click(screen.getByRole('button', { name: /^Personnalisation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cyber' }))
    fireEvent.click(screen.getByRole('button', { name: /Manager/ }))
    fireEvent.click(screen.getByRole('button', { name: /Préparer l'analyse/ }))
    await screen.findByText(/Le bon périmètre, dès le départ/)
    fireEvent.click(screen.getByRole('button', { name: 'Monde' }))
    fireEvent.click(screen.getByRole('button', { name: /Lancer l'analyse/ }))
    const call = h.startAnalysis.mock.calls.at(-1)!
    expect(call[3]).toBe('groupe')
    expect(call[7]).toEqual(
      expect.objectContaining({ geo_perimeter: 'world', business_families: ['Cyber'], hierarchy_levels: ['n2'] }),
    )
    expect(call[7]).not.toHaveProperty('headcount_min')
  })

  it('un ancien lien `scope=groupe` se migre vers « Monde » sans casser', async () => {
    h.searchParams = { scope: 'groupe' }
    await openCadrage()
    expect(screen.getByRole('button', { name: 'Monde' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'France' })).toHaveAttribute('aria-pressed', 'false')
  })
})

// #4432.2 — Découvrir (zone Occitanie) → /search : la boîte de périmètre de la vérification reprend la zone transmise.
describe('Search — la zone de Découvrir arrive dans la vérification (#4432.2)', () => {
  async function openFromDiscover(search: Record<string, unknown>) {
    h.searchParams = search
    renderWithRouter(<Search />)
    await screen.findByPlaceholderText(/Recherche une entreprise/)
    fireEvent.click(await screen.findByRole('button', { name: /Préparer l'analyse/ }))
    await screen.findByText(/Le bon périmètre, dès le départ/)
  }

  it('suggestionCriteria {zone, zone_regions} → Région allumée, Occitanie nommée', async () => {
    await openFromDiscover({
      company: 'Safran',
      suggestionId: 'discover:552',
      suggestionReason: 'Recrute',
      suggestionCriteria: { zone: 'Occitanie', zone_regions: ['Occitanie'] },
    })
    expect(screen.getByRole('button', { name: 'Région' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Occitanie')).toBeInTheDocument()
  })

  it('#4432.3 — « Élargir à la France » retire la zone sans re-saisie', async () => {
    await openFromDiscover({
      company: 'Safran',
      suggestionId: 'discover:552',
      suggestionCriteria: { zone_regions: ['Occitanie'] },
    })
    fireEvent.click(screen.getByRole('button', { name: /Élargir à la France/ }))
    expect(screen.getByRole('button', { name: 'France' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Occitanie')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Élargir à la France/ })).not.toBeInTheDocument()
  })

  it('#4432.5 — zone_regions d’un lien direct : les deux régions s’affichent', async () => {
    await openFromDiscover({ company: 'Safran', zone_regions: ['Nouvelle-Aquitaine', 'Occitanie'] })
    expect(screen.getByText('Nouvelle-Aquitaine')).toBeInTheDocument()
    expect(screen.getByText('Occitanie')).toBeInTheDocument()
  })

  it('#4432.5 — /search?q=Safran préremplit le champ', async () => {
    h.searchParams = { q: 'Safran' }
    renderWithRouter(<Search />)
    expect(await screen.findByDisplayValue('Safran')).toBeInTheDocument()
  })
})
