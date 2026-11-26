import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTERVENTION_FORMATS, LAURA_INTERVENTIONS, type InterventionDefinition } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'
import { LauraCard } from './LauraCard'
import { setLauraChatSlot } from './chat-slot'
import { presentationFor } from './presentation'
import type { BenchCostDetail } from './useLaura'

/**
 * LA FORME DEMANDÉE EST LA FORME RENDUE — §5.5 du PDF 10.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CES TESTS AURAIENT ATTRAPÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `format` était écrit en base (`laura.service.ts`), couvert par la contrainte
 * SQL, annoncé à l'utilisateur dans les réglages — et lu par AUCUN rendu. Les
 * trente-cinq interventions sortaient dans la même carte de coin. Trois se
 * déclarent `panel`, dont un appel d'offres à trois jours d'échéance à priorité
 * 90 : la plus urgente du catalogue arrivait dans la forme la plus discrète.
 *
 * Le test qui compte est le dernier : **deux formats ne peuvent pas rendre la
 * même chose**. Sans lui, on pourrait « lire » `format` en le passant à une
 * table dont toutes les valeurs seraient identiques, et le levier n'existerait
 * toujours pas.
 */

const route = vi.hoisted(() => ({ pathname: '/dashboard' }))
vi.mock('@tanstack/react-router', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, useLocation: () => ({ pathname: route.pathname }) }
})

const apiFetchMock = vi.mocked(apiFetch)

function served(format: string): void {
  const intervention: InterventionDefinition = {
    key: 'rfp_deadline_gaps',
    family: 'business_value',
    condition: 'Un appel d’offres arrive à échéance sous trois jours.',
    action: 'Ouvrir le dossier',
    screen: '/dashboard',
    route: '/projects',
    format: format as InterventionDefinition['format'],
    impact: 9,
    urgency: 10,
    actionability: 10,
  }
  apiFetchMock.mockResolvedValue({ speaks: true, intervention, priority: 90, traceId: 'trace-1' })
}

async function rendered(format: string): Promise<HTMLElement> {
  served(format)
  render(<LauraCard />)
  return waitFor(() => screen.getByRole('status'))
}

beforeEach(() => {
  apiFetchMock.mockReset()
  route.pathname = '/dashboard'
})

afterEach(() => {
  cleanup()
})

describe('la forme que l’intervention demande', () => {
  it('rend un PANNEAU quand l’intervention en demande un — tiroir droit, pleine hauteur, nommé', async () => {
    const surface = await rendered('panel')

    expect(surface).toHaveAttribute('data-laura-format', 'panel')
    // Le tiroir du §1 : collé à droite, du haut au bas de la fenêtre — et
    // `inset-y-0` plutôt qu'une hauteur en `vh`, qui mesure faux dès que la
    // barre d'URL d'un navigateur mobile se replie.
    expect(surface.className).toContain('inset-y-0')
    expect(surface.className).toContain('right-0')
    expect(surface.className).not.toContain('vh]')
    // Il passe devant la navigation, par un nom de l'échelle d'empilement.
    expect(surface.className).toContain('z-overlay')
    // Un tiroir pleine hauteur qui s'ouvre sans se nommer se lit comme un bout
    // d'écran qui a déraillé.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Laura')
    // Non modal : pas de voile, pas de piège au clavier, on travaille derrière.
    expect(surface).not.toHaveAttribute('aria-modal')
  })

  it('rend une CARTE en bas à droite quand l’intervention en demande une', async () => {
    const surface = await rendered('card')

    expect(surface).toHaveAttribute('data-laura-format', 'card')
    expect(surface.className).toContain('right-6')
    expect(surface.className).toContain('24rem')
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('rend une BULLE plus étroite quand l’intervention en demande une', async () => {
    const surface = await rendered('bubble')

    expect(surface).toHaveAttribute('data-laura-format', 'bubble')
    expect(surface.className).toContain('20rem')
  })

  it('retombe sur la carte devant un format inconnu — une intervention invisible est perdue', async () => {
    // Le catalogue vient du SERVEUR, qui peut être en avance sur le navigateur
    // d'un onglet resté ouvert une semaine.
    const surface = await rendered('hologramme')

    expect(surface).toBeInTheDocument()
    expect(surface.className).toBe(presentationFor('card').container)
  })

  it('retombe sur la carte devant une CLÉ DE PROTOTYPE, pas seulement devant un mot inconnu', () => {
    // `'constructor' in PRESENTATIONS` est VRAI — la chaîne de prototypes. Un
    // serveur qui enverrait ce mot aurait rendu une intervention sans
    // conteneur, donc invisible : le pire des rendus, puisqu'il ne se voit pas.
    for (const key of ['constructor', 'toString', '__proto__']) {
      expect(presentationFor(key).container, key).toBe(presentationFor('card').container)
    }
  })

  it('garde le geste de refus et celui de fermeture dans TOUTES les formes (§5.3)', async () => {
    for (const format of INTERVENTION_FORMATS) {
      const surface = await rendered(format)
      expect(surface, format).toHaveAttribute('data-laura-format', format)
      // « Pas maintenant » est un refus de PROPOSITION (trente jours) ; la croix
      // est une fermeture sans lecture (retrait sept jours). Les deux existent
      // partout, sinon la seule façon de faire taire Laura serait de la couper.
      expect(screen.getByText('Pas maintenant'), format).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fermer' }), format).toBeInTheDocument()
      cleanup()
      apiFetchMock.mockReset()
    }
  })

  it('donne à CHAQUE format du contrat une forme, et deux formats ne rendent jamais la même', () => {
    // ⚠️ La garde LIT quelque chose : sans cette borne, une énumération vide la
    // rendrait verte pour toujours.
    expect(INTERVENTION_FORMATS.length).toBeGreaterThanOrEqual(3)

    const containers = INTERVENTION_FORMATS.map(format => presentationFor(format).container)
    for (const container of containers) expect(container.length).toBeGreaterThan(20)
    // C'est CE test qui dit que le levier existe : une table dont toutes les
    // valeurs seraient identiques « lirait » `format` sans rien en faire.
    expect(new Set(containers).size).toBe(INTERVENTION_FORMATS.length)
  })

  it('ne laisse aucune intervention du catalogue sans forme', () => {
    expect(LAURA_INTERVENTIONS.length).toBeGreaterThan(30)
    for (const intervention of LAURA_INTERVENTIONS) {
      expect(INTERVENTION_FORMATS, intervention.key).toContain(intervention.format)
    }
  })
})

/**
 * LE COÛT DE L'INTERCONTRAT, DANS LA CARTE — ce que `benchCost` ajoute au
 * message statique de `long_bench` (voir `laura.service.ts:70-95`,
 * `apps/api/src/modules/consultants/bench-cost.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CES TESTS AURAIENT ATTRAPÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * L'API composait autrefois une PHRASE, en français, sur `plan.detail` —
 * `LauraCard` l'affichait telle quelle. Un utilisateur en anglais voyait donc
 * du français sur la seule ligne qui chiffre le coût de l'intercontrat.
 * `benchCost` rend le RÉSULTAT (centimes, ou raison NOMMÉE) ; c'est ce
 * composant qui compose la phrase, dans la langue active — donc ces tests
 * couvrent les DEUX langues, pas seulement le rendu par défaut.
 */
// Recette prod 03/10 (#3551, Y21) : « le défaut a changé de place » — poussée en haut à
// droite, la carte (384×205) recouvrait six contrôles de l'en-tête. Placer ailleurs en
// surimpression ne règle rien : sur /chat la carte est dans le FLUX, jamais `fixed`.
describe('/chat — la carte proactive ne recouvre AUCUN contrôle', () => {
  function mountSlot(): HTMLElement {
    const slot = document.createElement('div')
    document.body.appendChild(slot)
    act(() => setLauraChatSlot(slot))
    return slot
  }

  afterEach(() => {
    act(() => setLauraChatSlot(null))
  })

  it.each(['card', 'bubble', 'panel'])(
    'format %s : rendue DANS l’emplacement du fil, sans aucune classe de surimpression',
    async format => {
      route.pathname = '/chat'
      const slot = mountSlot()
      const card = await rendered(format)
      expect(slot.contains(card)).toBe(true)
      for (const overlay of ['fixed', 'absolute', 'top-20', 'bottom-20', 'inset-y-0', 'z-30', 'z-overlay']) {
        expect(card.className.split(/\s+/)).not.toContain(overlay)
      }
      expect(card.className).toContain('relative')
      // #3192.3 — borne de hauteur dure et aucun `sticky` : la carte ne peut ni suivre le défilement ni
      // s'allonger sur le fil, quel que soit le texte de l'intervention.
      expect(card.className.split(/\s+/)).not.toContain('sticky')
      expect(card.className.split(/\s+/)).toContain('max-h-44')
      expect(card.className.split(/\s+/)).toContain('overflow-y-auto')
    },
  )

  it('sans emplacement de fil monté, elle ne se rend PAS (jamais en surimpression par défaut)', async () => {
    route.pathname = '/chat'
    served('card')
    render(<LauraCard />)
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('⚠️ SAIT DIRE NON — ailleurs que sur /chat, le placement bas-droite est INCHANGÉ', async () => {
    mountSlot()
    const card = await rendered('card')
    expect(card.className).toContain('fixed')
    expect(card.className).toContain('md:bottom-20')
    expect(card.className).not.toContain('md:top-20')
  })
})

describe('le coût de l’intercontrat — `benchCost` de `long_bench`, composé à l’écran', () => {
  const initialLanguage = i18n.language

  afterEach(async () => {
    await i18n.changeLanguage(initialLanguage)
  })

  function servedWithBenchCost(benchCost?: BenchCostDetail): void {
    const intervention: InterventionDefinition = {
      key: 'long_bench',
      family: 'business_value',
      condition: 'Un consultant est en intercontrat depuis plus de 30 jours.',
      action: 'Chercher des besoins compatibles.',
      screen: '/consultants',
      route: '/projects/needs',
      format: 'card',
      impact: 10,
      urgency: 8,
      actionability: 9,
    }
    apiFetchMock.mockResolvedValue({
      speaks: true,
      intervention,
      priority: 90,
      traceId: 'trace-1',
      ...(benchCost !== undefined ? { benchCost } : {}),
    })
  }

  it('affiche le montant, en FRANÇAIS, quand le coût est MESURABLE', async () => {
    await i18n.changeLanguage('fr')
    servedWithBenchCost({ measurable: true, amountCents: 1_350_000 })
    render(<LauraCard />)
    await waitFor(() => screen.getByRole('status'))

    // Espace fine insécable (U+202F) ou classique selon la version d'ICU.
    const text = (await screen.findByText(/Coût de l'intercontrat/)).textContent ?? ''
    expect(text.replace(/[\u202F\u00A0\s]/g, ' ')).toBe("Coût de l'intercontrat : 13 500 €.")
  })

  it('affiche le montant, en ANGLAIS, quand la langue de l’app est l’anglais', async () => {
    await i18n.changeLanguage('en')
    servedWithBenchCost({ measurable: true, amountCents: 1_350_000 })
    render(<LauraCard />)
    await waitFor(() => screen.getByRole('status'))

    const text = (await screen.findByText(/Cost of the bench time/)).textContent ?? ''
    expect(text.replace(/[\u202F\u00A0\s]/g, ' ')).toBe('Cost of the bench time: €13,500.')
  })

  it('dit « non mesurable », AVEC LE GESTE, quand le TJM manque — jamais 0 € ni 0', async () => {
    await i18n.changeLanguage('fr')
    servedWithBenchCost({ measurable: false, reason: 'tjm_missing' })
    render(<LauraCard />)
    await waitFor(() => screen.getByRole('status'))

    expect(
      screen.getByText(
        "Coût de l'intercontrat non mesurable : aucun TJM saisi — saisir le TJM du consultant pour le calculer.",
      ),
    ).toBeInTheDocument()
    // Le zéro qui ment : un TJM absent n'est pas un coût de 0 €.
    expect(screen.queryByText(/0\s*€/)).toBeNull()
  })

  it('dit « non mesurable », en ANGLAIS, quand le TJM manque', async () => {
    await i18n.changeLanguage('en')
    servedWithBenchCost({ measurable: false, reason: 'tjm_missing' })
    render(<LauraCard />)
    await waitFor(() => screen.getByRole('status'))

    expect(
      screen.getByText(
        "Bench cost not measurable: no day rate on file — enter the consultant's day rate to calculate it.",
      ),
    ).toBeInTheDocument()
  })

  it('dit « non mesurable » quand la durée est inconnue', async () => {
    await i18n.changeLanguage('fr')
    servedWithBenchCost({ measurable: false, reason: 'duration_unknown' })
    render(<LauraCard />)
    await waitFor(() => screen.getByRole('status'))

    expect(
      screen.getByText("Coût de l'intercontrat non mesurable : durée d'intercontrat inconnue."),
    ).toBeInTheDocument()
  })

  it('ne rend rien de plus quand l’intervention n’a pas de `benchCost`', async () => {
    await i18n.changeLanguage('fr')
    servedWithBenchCost(undefined)
    render(<LauraCard />)
    const surface = await waitFor(() => screen.getByRole('status'))

    // Le message statique du catalogue contient déjà « intercontrat » — c'est
    // « Coût de l'intercontrat », la phrase que seul `benchCost` ajoute, qui doit
    // être absente.
    expect(surface.textContent).not.toMatch(/Coût de l['’]intercontrat/i)
  })
})

/**
 * #2409.8 — Laura NOMME d'elle-même ce qui manque avant un démarrage. Tranché
 * sans Louis (décision §12) : la carte existante de Laura, les manques servis
 * en CLÉS et composés ici dans la langue active ; le geste ouvre LA mission.
 */
describe('#2409.8 — les manques du démarrage, nommés sur la carte', () => {
  const initialLanguage = i18n.language

  afterEach(async () => {
    await i18n.changeLanguage(initialLanguage)
  })

  function servedWithMissionStart(missionStart?: unknown): void {
    const intervention = LAURA_INTERVENTIONS.find(entry => entry.key === 'mission_start_not_ready')
    apiFetchMock.mockResolvedValue({
      speaks: true,
      intervention,
      priority: 80,
      traceId: 'trace-1',
      ...(missionStart !== undefined ? { missionStart } : {}),
    })
  }

  const START = {
    missionId: 'm-1',
    label: 'Renfort sécurité',
    startsOn: '2026-10-05',
    verdict: 'blocked',
    missing: ['consultant_agreement'],
    reserves: ['site_access'],
  }

  it('nomme la mission, ce qui manque et la réserve, en FRANÇAIS', async () => {
    await i18n.changeLanguage('fr')
    servedWithMissionStart(START)
    render(<LauraCard />)
    await waitFor(() => screen.getByRole('status'))
    expect(screen.getByText('« Renfort sécurité » — il manque : Accord du consultant.')).toBeInTheDocument()
    expect(screen.getByText('Réserve : Lieu et accès du premier jour.')).toBeInTheDocument()
  })

  it('les compose en ANGLAIS quand la langue de l’app est l’anglais', async () => {
    await i18n.changeLanguage('en')
    servedWithMissionStart(START)
    render(<LauraCard />)
    await waitFor(() => screen.getByRole('status'))
    expect(screen.getByText(/“Renfort sécurité” — missing:/)).toBeInTheDocument()
  })

  it('une absence ne fait AUCUNE ligne : pas de réserve, pas de ligne « Réserve »', async () => {
    await i18n.changeLanguage('fr')
    servedWithMissionStart({ ...START, reserves: [] })
    render(<LauraCard />)
    const surface = await waitFor(() => screen.getByRole('status'))
    expect(surface.textContent).not.toMatch(/Réserve/)
  })

  it('le geste ouvre LA mission, pas le tableau', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true })
    await i18n.changeLanguage('fr')
    servedWithMissionStart(START)
    render(<LauraCard />)
    await waitFor(() => screen.getByRole('status'))
    screen.getByRole('button', { name: 'Voir ce qui manque' }).click()
    expect(assign).toHaveBeenCalledWith('/missions/m-1')
  })
})
