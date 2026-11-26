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
 * L'ADRESSABILITÉ (cinq axes, tome 1 §6) — RENDUE, sur la fiche de compte.
 *
 * Le calcul existe (`_addressability()` côté IA) et atteint déjà un écran : la
 * carte d'un candidat Découvrir. Il n'atteignait pas la fiche de compte : les
 * deux moitiés du même chantier avaient avancé séparément.
 *
 * Ce que ces tests tiennent :
 *
 * - le score n'apparaît JAMAIS nu : ses facteurs sont là, chacun avec l'axe
 *   qu'il porte et la preuve qui le justifie ;
 * - un axe non mesurable est NOMMÉ **avec sa raison** (#1631), jamais fondu
 *   dans un score à zéro — et les raisons diffèrent : le chemin attend un
 *   ingrédient, le coût d'accès est un refus assumé (D60) ;
 * - un axe qui DEVIENT mesurable apparaît de lui-même : la carte n'a aucune
 *   liste d'axes en dur, elle rend ce que le producteur lui sert (#1631.5,
 *   l'axe RELATION) ;
 * - `null` (ce compte n'a pas été analysé depuis que l'adressabilité est
 *   calculée — PR #1689, 06/09/2026) se dit honnêtement, jamais comme un score
 *   à 0/20 : cassé et non mesurable se ressemblent, et il ne faut pas les
 *   confondre ;
 * - aucune PROBABILITÉ nulle part.
 */

const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

type Landscape = Record<string, unknown>

/** Le paysage minimal : tout est vide sauf ce que le test exerce. */
function landscape(addressability: unknown): Landscape {
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
    barrier: null,
    addressability,
  }
}

const MEASURED_ADDRESSABILITY = {
  score: 9,
  max: 11,
  unmeasured: ['path', 'relation', 'access_cost'],
  factors: [
    {
      label: 'Consultation ouverte — la porte l’est aussi',
      points: 6,
      evidence: 'appel d’offres publié : Refonte SI (2026-05-01)',
      axis: 'lock',
    },
    {
      label: 'Proportion — < 250 pour une ESN de 10-30',
      points: 3,
      evidence: 'effectif < 250 face à une ESN de 10-30',
      axis: 'proportion',
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

describe('l’onglet Accès montre l’adressabilité (cinq axes)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })
  afterEach(cleanup)

  it('rend le score AVEC ses facteurs — jamais un chiffre nu', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_ADDRESSABILITY))
    mount()

    expect(await screen.findByText('9/11')).toBeInTheDocument()
    expect(screen.getByText(/Consultation ouverte — la porte l’est aussi/)).toBeInTheDocument()
    expect(screen.getByText(/Proportion — < 250 pour une ESN de 10-30/)).toBeInTheDocument()
    // #3504 — le nom de l'axe n'est pas redit quand le libellé le porte déjà ; les autres axes le gardent.
    expect(screen.queryByText(/Proportion — Proportion/)).toBeNull()
    expect(screen.getByText(/^Verrou — Consultation ouverte/)).toBeInTheDocument()
    expect(screen.getByText('appel d’offres publié : Refonte SI (2026-05-01)')).toBeInTheDocument()
  })

  it('NOMME les axes non mesurables ET dit POURQUOI, sans jamais leur donner de chiffre', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_ADDRESSABILITY))
    mount()

    await screen.findByText('9/11')
    // Sortis du dénominateur (max = 11, pas 20), les axes non mesurés sont
    // NOMMÉS — et depuis #1631, chacun porte SA raison, parce qu'elles ne sont
    // pas les mêmes : le chemin attend un ingrédient, le coût d'accès est un
    // REFUS (il se déclare, il ne s'estime jamais). Les nommer sans le dire
    // faisait lire trois trous là où il y a une décision.
    //
    // Match EXACT sur chaque ligne : une regex matcherait aussi les ancêtres
    // qui partagent le même texte concaténé, et se dirait « plusieurs éléments
    // trouvés » pour la mauvaise raison.
    expect(
      screen.getByText('Ce qu’on n’a pas pu regarder — ces axes sortent du dénominateur, ils ne valent pas zéro :'),
    ).toBeInTheDocument()
    expect(screen.getByText('Chemin — aucune route d’accès agrégée n’alimente encore cet axe.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Relation — aucun rapprochement possible : ton CRM n’est pas connecté, ou il n’a rien retrouvé sur ce compte.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Coût d’accès — le coût d’accès se déclare, il ne s’estime jamais — il se renseigne plus bas sur cet onglet.',
      ),
    ).toBeInTheDocument()
  })

  it('rend l’axe RELATION dès qu’un producteur le mesure — la carte ne connaît pas de liste d’axes en dur', async () => {
    // #1631.5 — le seul axe qui a bougé : mesuré côté IA quand le CRM connecté
    // de l'ESN a retrouvé le compte. L'écran n'a RIEN à savoir de plus : il
    // rend les facteurs qu'on lui sert. Ce test est le témoin qu'un axe qui
    // devient mesurable APPARAÎT, au lieu de rester dans la liste des absents.
    apiFetchMock.mockResolvedValue(
      landscape({
        score: 12,
        max: 14,
        unmeasured: ['path', 'access_cost'],
        factors: [
          ...MEASURED_ADDRESSABILITY.factors,
          {
            label: 'Une relation existe déjà — l’entrée n’est pas froide',
            points: 3,
            evidence: 'ton CRM connecté a retrouvé ce compte : au moins un contact ou un deal ouvert y est enregistré',
            axis: 'relation',
          },
        ],
      }),
    )
    mount()

    expect(await screen.findByText('12/14')).toBeInTheDocument()
    expect(screen.getByText(/Relation — Une relation existe déjà/)).toBeInTheDocument()
    // Et il a QUITTÉ la liste des axes non regardés.
    expect(screen.queryByText(/^Relation — aucun rapprochement possible/)).not.toBeInTheDocument()
  })

  it('dit que l’adressabilité n’est pas disponible — plutôt que de faire disparaître la carte ou d’écrire 0', async () => {
    // Cassé et non mesurable se ressemblent : une carte absente laisserait
    // croire que la capacité n'existe pas. Un « 0/20 » dirait « hors de
    // portée » — la lecture exactement inverse de « on n'a pas encore calculé ».
    apiFetchMock.mockResolvedValue(landscape(null))
    mount()

    expect(await screen.findByText(/Adressabilité non disponible pour ce compte/)).toBeInTheDocument()
    expect(screen.queryByText(/\/20/)).not.toBeInTheDocument()
  })

  it('recette 10/09 — un score plein sur PEU d’axes le dit à côté du chiffre, jamais muet', async () => {
    // BNP Paribas mesuré ce soir : la carte affichait « 9/9 », qui se lit
    // « accessibilité maximale », alors que seuls Verrou (6) et Relation (3)
    // ont pu être mesurés — Proportion, Chemin et Coût d'accès sont NOMMÉS
    // hors dénominateur, honnêtement (c'est la doctrine, et le calcul la suit
    // déjà : `max` est la somme des seuls axes mesurés). Ce n'est pas le
    // calcul qui ment, c'est l'affichage qui ne dit pas sur COMBIEN d'axes il
    // est établi.
    apiFetchMock.mockResolvedValue(
      landscape({
        score: 9,
        max: 9,
        unmeasured: ['proportion', 'path', 'access_cost'],
        factors: [
          {
            label: 'Consultation ouverte — la porte l’est aussi',
            points: 6,
            evidence: 'appel d’offres publié : Refonte SI (2026-05-01)',
            axis: 'lock',
          },
          {
            label: 'Une relation existe déjà — l’entrée n’est pas froide',
            points: 3,
            evidence: 'ton CRM connecté a retrouvé ce compte',
            axis: 'relation',
          },
        ],
      }),
    )
    mount()

    expect(await screen.findByText('9/9')).toBeInTheDocument()
    // Le compte d'axes est un TEXTE affiché, à côté du chiffre — pas un
    // attribut `title=`, pas un repli qu'on ne voit qu'au survol.
    expect(screen.getByText('établi sur 2 axes sur 5')).toBeInTheDocument()
  })

  it('a les mêmes clés en français et en anglais — la parité, pas la bonne volonté', () => {
    const paths = (node: unknown, prefix = ''): string[] =>
      node && typeof node === 'object'
        ? Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
            paths(value, prefix ? `${prefix}.${key}` : key),
          )
        : [prefix]

    const fr = paths(accessFr.addressability).sort()
    const en = paths(accessEn.addressability).sort()
    // Le corpus, prouvé non vide : une garde qui ne lit rien passe au vert.
    expect(fr.length).toBeGreaterThanOrEqual(10)
    expect(en).toEqual(fr)
  })

  it('n’affiche aucune PROBABILITÉ — refusée six fois dans ce produit', async () => {
    apiFetchMock.mockResolvedValue(landscape(MEASURED_ADDRESSABILITY))
    const { container } = mount()

    await screen.findByText('9/11')
    await waitFor(() => {
      const text = container.textContent ?? ''
      expect(text.length).toBeGreaterThan(50)
      expect(text).not.toMatch(/%/)
      expect(text).not.toMatch(/chance|probabilit/i)
    })
  })
})
