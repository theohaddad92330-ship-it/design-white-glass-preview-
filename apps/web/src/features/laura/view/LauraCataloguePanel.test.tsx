import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { LAURA_INTERVENTIONS, type InterventionDefinition } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { LauraCataloguePanel } from './LauraCataloguePanel'

/**
 * Le catalogue de Laura, LU À L'ÉCRAN.
 *
 * La route `/laura/catalogue` porte ce docblock : « Le catalogue, pour l'écran
 * de réglages : il dit ce que Laura sait dire ». Cet écran n'existait pas — le
 * catalogue, ses trente entrées, ses quatre familles et ses cinq formats
 * n'avaient aucun appelant hors test.
 *
 * ⚠️ Le lieu n'est pas libre : le docblock du contrôleur INTERDIT une seconde
 * route pour l'interrupteur, qui vit dans les préférences de notification. Le
 * panneau se pose donc à côté de lui, en LECTURE seule.
 *
 * ⚠️ Et il regroupe ce que la ROUTE a servi, jamais la copie du catalogue
 * empaquetée dans le bundle. Les deux coïncident aujourd'hui — la route rend
 * `LAURA_INTERVENTIONS` verbatim — et c'est précisément pour cela que le défaut
 * passerait inaperçu : le jour où le serveur filtrera (par offre, par espace,
 * par droit), un regroupement qui relit la constante locale montrerait un
 * catalogue que l'utilisateur n'a pas reçu. `useLaura.ts` l'écrit noir sur
 * blanc. Le test « ne montre QUE les familles servies » ci-dessous est celui
 * qui tomberait.
 */

const apiFetchMock = vi.mocked(apiFetch)

function intervention(over: Partial<InterventionDefinition> & Pick<InterventionDefinition, 'key'>) {
  return {
    family: 'onboarding',
    condition: 'Une condition écrite en français, pas en code.',
    action: 'Un geste, jamais un verbe d’écriture.',
    screen: '/dashboard',
    route: '/dashboard',
    format: 'card',
    impact: 8,
    urgency: 5,
    actionability: 7,
    ...over,
  } as InterventionDefinition
}

const CATALOGUE: InterventionDefinition[] = [
  intervention({ key: 'first_login', family: 'onboarding', format: 'panel', condition: 'Le premier compte est prêt.' }),
  intervention({ key: 'no_connector', family: 'onboarding', format: 'card', action: 'Connecter un outil.' }),
  intervention({ key: 'copilot_never_used', family: 'adoption', format: 'bubble', screen: '/chat' }),
  intervention({ key: 'trial_ending', family: 'churn_risk', format: 'card', screen: '/billing' }),
  intervention({ key: 'long_bench', family: 'business_value', format: 'card', screen: '/consultants' }),
]

describe('le panneau « ce que Laura sait faire »', () => {
  beforeEach(() => {
    cleanup()
    apiFetchMock.mockReset()
    apiFetchMock.mockResolvedValue({ interventions: CATALOGUE })
  })

  it('lit le catalogue par la porte unique de l’assistante', async () => {
    render(<LauraCataloguePanel />)
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith({ path: '/laura/catalogue' }))
  })

  it('groupe par FAMILLE, dans l’ordre du catalogue', async () => {
    render(<LauraCataloguePanel />)
    const onboarding = await screen.findByText('Prise en main')
    const adoption = screen.getByText('Adoption')
    const churn = screen.getByText('Risque de décrochage')
    const value = screen.getByText('Valeur métier')
    // Une famille absente du catalogue ne s'affiche pas vide : les quatre sont
    // ici parce que les cinq entrées les couvrent toutes.
    expect(onboarding.compareDocumentPosition(adoption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(adoption.compareDocumentPosition(churn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(churn.compareDocumentPosition(value) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ne montre QUE les familles SERVIES — jamais celles du catalogue empaqueté', async () => {
    // Deux entrées, une seule famille. Le catalogue empaqueté en porte quatre :
    // si le panneau regroupait la copie locale, « Adoption », « Risque de
    // décrochage » et « Valeur métier » seraient là malgré la réponse.
    apiFetchMock.mockReset()
    apiFetchMock.mockResolvedValue({
      interventions: [
        intervention({ key: 'first_login', family: 'onboarding', format: 'panel' }),
        intervention({ key: 'no_connector', family: 'onboarding', format: 'card' }),
      ],
    })
    render(<LauraCataloguePanel />)

    expect(await screen.findByText('Prise en main')).toBeTruthy()
    expect(screen.queryByText('Adoption')).toBeNull()
    expect(screen.queryByText('Risque de décrochage')).toBeNull()
    expect(screen.queryByText('Valeur métier')).toBeNull()
    // Le corpus, pas le verdict : la constante locale porte bien les quatre
    // familles, sinon l'assertion ci-dessus serait vraie par vacuité.
    expect(new Set(LAURA_INTERVENTIONS.map(item => item.family)).size).toBe(4)
  })

  it('groupe par FORMAT à l’intérieur d’une famille', async () => {
    render(<LauraCataloguePanel />)
    // « Prise en main » porte un panneau ET une carte : les deux formats sont
    // nommés, parce que la forme décide de ce qui interrompt.
    //
    // ⚠️ Le libellé dit désormais OÙ la forme se pose (« Un panneau à droite,
    // pleine hauteur »), et ce n'est pas cosmétique : le format était écrit en
    // base et appliqué par personne, si bien que cet écran annonçait une forme
    // que l'utilisateur ne recevait jamais.
    expect(await screen.findByText(/^Un panneau/)).toBeTruthy()
    expect(screen.getAllByText(/^Une carte/).length).toBeGreaterThan(0)
    expect(screen.getByText(/^Une bulle/)).toBeTruthy()
  })

  it('montre ce qu’elle détecte et ce qu’elle propose', async () => {
    render(<LauraCataloguePanel />)
    expect(await screen.findByText('Le premier compte est prêt.')).toBeTruthy()
    expect(screen.getByText('Connecter un outil.')).toBeTruthy()
  })

  it('dit qu’elle n’écrit jamais à la place de l’utilisateur', async () => {
    render(<LauraCataloguePanel />)
    await screen.findByText('Prise en main')
    expect(screen.getByText(/n’écrit jamais/)).toBeTruthy()
  })

  it('n’annonce aucun compte tant que le catalogue n’est pas arrivé', () => {
    apiFetchMock.mockReset()
    apiFetchMock.mockReturnValue(new Promise(() => {}))
    render(<LauraCataloguePanel />)
    // Un « 0 intervention » de chargement se lit comme un vrai zéro : tant
    // qu'on ne sait pas, on dit qu'on ne sait pas encore.
    expect(screen.queryByText(/0 intervention/)).toBeNull()
    expect(screen.getByText(/Je liste ce que Laura sait dire/)).toBeTruthy()
  })

  it('dit franchement quand le catalogue n’a pas pu être lu', async () => {
    apiFetchMock.mockReset()
    apiFetchMock.mockRejectedValue(new Error('réseau'))
    render(<LauraCataloguePanel />)
    expect(await screen.findByText(/n’a pas pu être chargé/)).toBeTruthy()
    expect(screen.queryByText(/0 intervention/)).toBeNull()
  })
})
