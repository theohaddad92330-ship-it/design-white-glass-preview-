import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import accessEn from '@/i18n/locales/en/access.json'
import accessFr from '@/i18n/locales/fr/access.json'
import { TabAccess } from './TabAccess'

// #4116 (recette 13/10) — le bandeau de fraîcheur lit `useIsDemo` (hors démo seulement).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

/**
 * La barrière d'achat, RENDUE — tome 3 §5.1 (bloc 8 du plan) et §8.
 *
 * Le calcul tourne à chaque analyse (`access_scoring.py`), il est stocké, semé
 * en démonstration, testé sur un corpus de calibration — et jusqu'ici aucun
 * écran du dossier n'en montrait rien : le service en tirait deux booléens.
 * On payait le calcul et personne ne le voyait.
 *
 * Ce que ces tests tiennent, et qui n'est pas décoratif :
 *
 * - le score n'apparaît JAMAIS nu : ses six proxies sont là, chacun avec sa
 *   contribution signée et la preuve qui la justifie ;
 * - un proxy non mesuré est NOMMÉ et ne porte AUCUN chiffre — « non mesuré »
 *   n'est pas « 0 », et un « 0,0 » se lirait « cet indicateur ne pèse rien »
 *   au lieu de « on ne l'a pas regardé » ;
 * - « non estimable » se dit, avec ce qui manque. Le taire ferait lire
 *   l'absence comme une classe A, c'est-à-dire l'inverse de la vérité ;
 * - aucune PROBABILITÉ nulle part : pas de pourcentage, pas de « chance ».
 */

const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
  // Collecte POSTÉRIEURE à la capacité `signals` : l'effectif de la barrière fait foi.
  signals_collected_at: '2026-10-02T08:00:00.000Z',
} as Account

type Landscape = Record<string, unknown>

/** Le paysage minimal : tout est vide sauf ce que le test exerce. */
function landscape(barrier: unknown): Landscape {
  return {
    lock: { state: 'inconnu', fact: null },
    modes: [],
    cost: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning: null,
    community: null,
    question: null,
    barrier,
  }
}

const MEASURED_BARRIER = {
  score: 6.1,
  accessibility: 3.9,
  access_class: 'C',
  label: 'Semi-ouvert',
  measurable: true,
  missing: ['cotation'],
  proxies: [
    {
      key: 'statut',
      contribution: 4.05,
      evidence: 'organisme public ou parapublic — code de la commande publique, seuils, publicité',
      measurable: true,
    },
    { key: 'effectif', contribution: 0.525, evidence: 'effectif 480 salariés', measurable: true },
    { key: 'cotation', contribution: 0, evidence: 'cotation inconnue', measurable: false },
    { key: 'commande_publique', contribution: 1.5, evidence: 'achète en commande publique', measurable: true },
    { key: 'decentralisation', contribution: -0.8, evidence: '14 établissement(s)', measurable: true },
    { key: 'anciennete', contribution: 0, evidence: 'créée il y a 22 an(s)', measurable: true },
  ],
  corrections: [
    {
      key: 'echeance_proche',
      delta: -1.5,
      label: 'Le marché en place arrive à échéance',
      evidence: 'marché public en cours jusqu’au 2026-11-30',
    },
  ],
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('l’onglet Accès montre la barrière d’achat', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  it('rend le score AVEC sa classe et ses six proxies — jamais un chiffre nu', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    mount()

    expect(await screen.findByText('Semi-ouvert · barrière 6,1/10')).toBeInTheDocument()

    // Les six indicateurs, NOMMÉS. Sous trois mesurés, le moteur ne produit
    // aucune classe : les montrer est ce qui rend le score auditable.
    expect(screen.getByText('Statut de l’entreprise')).toBeInTheDocument()
    expect(screen.getByText('Effectif')).toBeInTheDocument()
    expect(screen.getByText('Cotation en bourse')).toBeInTheDocument()
    expect(screen.getByText('Exposition à la commande publique')).toBeInTheDocument()
    expect(screen.getByText('Nombre d’établissements')).toBeInTheDocument()
    expect(screen.getByText('Ancienneté')).toBeInTheDocument()

    // La contribution SIGNÉE, et la preuve en français qui la justifie.
    expect(screen.getByText('+4,05')).toBeInTheDocument()
    expect(screen.getByText('-0,8')).toBeInTheDocument()
    expect(screen.getByText('effectif 480 salariés')).toBeInTheDocument()
  })

  it('n’écrit AUCUN chiffre sur un proxy non mesuré — « non mesuré » n’est pas « 0 »', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    mount()

    await screen.findByText('Semi-ouvert · barrière 6,1/10')
    // La cotation vaut `contribution: 0` en base — parce qu'elle n'a pas été
    // regardée, pas parce qu'elle ne pèse rien. Sa LIGNE ENTIÈRE doit donc être
    // exempte de chiffre : « 0 » se lirait « cet indicateur ne compte pas »,
    // alors que la vérité est « aucune source publique ne le lie à ce SIREN ».
    const row = screen.getByText('Cotation en bourse').parentElement?.parentElement
    expect(row?.textContent).toContain('non mesuré')
    expect(row?.textContent).not.toMatch(/\d/)
  })

  it('affiche en revanche un zéro MESURÉ — « pas de décentralisation » est un fait vrai', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    mount()

    await screen.findByText('Semi-ouvert · barrière 6,1/10')
    // L'ancienneté est MESURÉE et ne pèse rien : elle s'écrit « 0 », sans signe
    // — « +0 » suggérerait une contribution positive minuscule qui n'existe pas.
    const row = screen.getByText('Ancienneté').parentElement?.parentElement
    expect(row?.textContent).toContain('0')
    expect(row?.textContent).not.toContain('non mesuré')
  })

  it('date l’estimation et nomme sa source — une information d’accès ne s’affiche pas nue', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    mount()

    // ⚠️ Le format s'écrit EN CLAIR, jamais recalculé par `toLocaleDateString()` :
    //    l'attendu suivrait alors le RUNTIME (fr_FR en local, en-US en CI) et
    //    bougerait avec l'écran au lieu de le contrôler. La suite tourne en
    //    français, l'écran affiche donc le jour en premier.
    const expected = '20/08/2026'
    expect(await screen.findByText(`Registre public · estimée le ${expected}`)).toBeInTheDocument()
  })

  it('montre la correction datée qui a fait bouger la barrière', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    mount()

    expect(await screen.findByText(/Le marché en place arrive à échéance/)).toBeInTheDocument()
  })

  it('dit « non estimable » et CE QUI MANQUE, sans jamais montrer de score', async () => {
    const unmeasurable = {
      ...MEASURED_BARRIER,
      score: null,
      accessibility: null,
      access_class: null,
      label: null,
      measurable: false,
      missing: ['statut', 'cotation', 'commande_publique'],
      corrections: [],
    }
    apiFetchMock.mockResolvedValue(landscape(unmeasurable))
    mount()

    expect(
      await screen.findByText(
        /Barrière non estimable. Il manque : Statut de l’entreprise, Cotation en bourse, Exposition à la commande publique./,
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/barrière .*\/10/)).not.toBeInTheDocument()
  })

  it('dit que la barrière n’a pas été estimée — plutôt que de faire disparaître la carte', async () => {
    // Cassé et non mesurable se ressemblent : une carte absente laisserait
    // croire que la capacité n'existe pas. Un « 0/10 », lui, dirait « ouvert
    // probable » — la lecture exactement inverse.
    apiFetchMock.mockResolvedValue(landscape(null))
    mount()

    expect(await screen.findByText('Barrière non estimée sur ce compte.')).toBeInTheDocument()
    expect(screen.queryByText(/\/10/)).not.toBeInTheDocument()
  })

  it('a les mêmes clés en français et en anglais — la parité, pas la bonne volonté', () => {
    // Le repli i18next rend le FRANÇAIS quand une clé anglaise manque : un
    // écran anglais afficherait « Semi-ouvert » sans qu'aucun test ne rougisse.
    // La seule façon de le voir est de comparer les DEUX arbres.
    const paths = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object'
        ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
            paths(value, prefix ? `${prefix}.${key}` : key),
          )
        : [prefix]

    const fr = paths(accessFr.barrier).sort()
    const en = paths(accessEn.barrier).sort()
    // Le corpus, prouvé non vide : une garde qui ne lit rien passe au vert.
    expect(fr.length).toBeGreaterThanOrEqual(16)
    expect(en).toEqual(fr)
  })

  it('n’affiche aucune PROBABILITÉ — refusée six fois dans ce produit', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    const { container } = mount()

    await screen.findByText('Semi-ouvert · barrière 6,1/10')
    await waitFor(() => {
      const text = container.textContent ?? ''
      expect(text.length).toBeGreaterThan(50)
      expect(text).not.toMatch(/%/)
      expect(text).not.toMatch(/chance|probabilit/i)
      // « ouvert PROBABLE », jamais « ouvert » tout court, jamais « facile ».
      expect(text).not.toMatch(/facile/i)
    })
  })

  it('#3504 — un compte collecté AVANT la correction de l’effectif le DIT sur la barrière ; un compte d’après, non', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const old = { ...ACCOUNT, signals_collected_at: '2026-09-29T08:00:00.000Z' } as Account
    const view = render(
      <QueryClientProvider client={client}>
        <TabAccess account={old} />
      </QueryClientProvider>,
    )
    expect(
      await screen.findByText(/correction de la lecture de l’effectif|correction de la lecture de l'effectif/),
    ).toBeInTheDocument()
    view.unmount()

    const fresh = { ...ACCOUNT, signals_collected_at: '2026-10-02T08:00:00.000Z' } as Account
    render(
      <QueryClientProvider client={client}>
        <TabAccess account={fresh} />
      </QueryClientProvider>,
    )
    await screen.findByText('Semi-ouvert · barrière 6,1/10')
    expect(
      screen.queryByText(/correction de la lecture de l’effectif|correction de la lecture de l'effectif/),
    ).toBeNull()
  })
  it('#3504 — l’effectif d’une collecte antérieure à la correction n’est pas redit : une seule source (l’en-tête), « à revérifier » ici', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const old = { ...ACCOUNT, signals_collected_at: '2026-09-29T08:00:00.000Z' } as Account
    const view = render(
      <QueryClientProvider client={client}>
        <TabAccess account={old} />
      </QueryClientProvider>,
    )
    await screen.findByText('Semi-ouvert · barrière 6,1/10')
    expect(screen.queryByText('effectif 480 salariés')).toBeNull()
    expect(screen.getByText(/effectif à revérifier/i)).toBeInTheDocument()
    view.unmount()

    const fresh = { ...ACCOUNT, signals_collected_at: '2026-10-02T08:00:00.000Z' } as Account
    render(
      <QueryClientProvider client={client}>
        <TabAccess account={fresh} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('effectif 480 salariés')).toBeInTheDocument()
    expect(screen.queryByText(/effectif à revérifier/i)).toBeNull()
  })
  // #3504 (recette 02/10) — collecte DATÉE d'après la bascule, mais preuve encore fausse : on compare les chiffres.
  it('#3504 — « effectif 480 » contre un en-tête « Plus de 10 000 salariés » : à revérifier, même avec une date fraîche', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_BARRIER))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const account = { ...ACCOUNT, employees: 'Plus de 10 000 salariés' } as Account
    render(
      <QueryClientProvider client={client}>
        <TabAccess account={account} />
      </QueryClientProvider>,
    )
    await screen.findByText('Semi-ouvert · barrière 6,1/10')
    expect(screen.queryByText('effectif 480 salariés')).toBeNull()
    expect(screen.getByText(/effectif à revérifier/i)).toBeInTheDocument()
  })

  // #3504 (recette 02/10) — le serveur a SORTI l'effectif périmé du calcul : l'écran ne le peint plus
  // comme une contribution, il dit « à revérifier » et « non mesuré ».
  it('#3504 — un effectif sorti du calcul par le serveur n’écrit AUCUNE contribution et se dit à revérifier', async () => {
    const neutralized = {
      ...MEASURED_BARRIER,
      proxies: MEASURED_BARRIER.proxies.map(proxy =>
        proxy.key === 'effectif'
          ? { ...proxy, contribution: 0, measurable: false, evidence: 'effectif à revérifier' }
          : proxy,
      ),
    }
    apiFetchMock.mockResolvedValue({ ...landscape(neutralized), headcountToRecheck: true })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <TabAccess account={ACCOUNT} />
      </QueryClientProvider>,
    )
    await screen.findByText('Semi-ouvert · barrière 6,1/10')
    expect(screen.getByText(/effectif à revérifier/i)).toBeInTheDocument()
    expect(screen.queryByText(/\+0,5/)).toBeNull()
  })
})
