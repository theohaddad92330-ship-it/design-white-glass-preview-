import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { BellumReadCard } from './BellumReadCard'
import type { BellumReadData } from '../useAccountOverviewData'

vi.mock('@/features/profile/hooks/useEsnProfile', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/profile/hooks/useEsnProfile')>()
  return { ...actual, useHasOfferObjective: vi.fn() }
})

function mockHasOfferObjective(hasObjective: boolean) {
  vi.mocked(useHasOfferObjective).mockReturnValue(hasObjective)
}

const SOURCE = join(process.cwd(), 'src/features/accounts/view/account-detail/tabs/sections/BellumReadCard.tsx')

const LEGACY_DATA: BellumReadData = {
  title: 'Ancienne phrase libre écrite avant #1607.1.',
  description: 'Description du compte.',
  tags: ['Cloud & DevOps'],
  blocks: null,
}

const FOUR_BLOCKS_DATA: BellumReadData = {
  title: null,
  description: 'Description du compte.',
  tags: [],
  blocks: {
    verdictLine: 'SNCF se travaille par entité, pas au niveau groupe.',
    why: ['Trois BU distinctes', 'Budgets IT séparés', 'Aucun DSI groupe identifié'],
    missing: 'Pas de contact confirmé côté DSI Retail.',
    nextAction: 'Vérifier si l’équipe Data travaille avec des externes.',
  },
}

describe('BellumReadCard — jargon de registre (#4994)', () => {
  it('retire NAF et SIREN du verdict affiché, garde le reste', async () => {
    renderWithRouter(
      <BellumReadCard
        data={{ ...LEGACY_DATA, title: 'Cartier · NAF 92.3B, SIREN 341902898', description: null, tags: [] }}
        score={7}
      />,
    )
    expect(await screen.findByText('Cartier')).toBeInTheDocument()
    expect(screen.queryByText(/NAF|SIREN/)).not.toBeInTheDocument()
  })

  it('ne rend rien quand le titre n’était que du jargon', async () => {
    const { container } = renderWithRouter(
      <BellumReadCard
        data={{ title: 'NAF 92.3B, SIREN 341902898', description: null, tags: [], blocks: null }}
        score={null}
      />,
    )
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(container.textContent ?? '').not.toMatch(/NAF|SIREN/)
  })
})

/**
 * #1607.1 — LE BLOC BELLUM READ EN QUATRE BLOCS, ET SA DÉGRADATION.
 *
 * Deux dossiers, jamais mélangés : celui d'AVANT ce lot (`blocks: null`, une
 * seule phrase libre) doit rester byte-identique à l'écran ; celui d'APRÈS
 * porte le verdict en tête + les trois blocs additifs dans la fenêtre de
 * lecture complète. `renderWithRouter` monte un vrai routeur TanStack — le
 * contenu apparaît de façon ASYNCHRONE (comme dans `ReinforcedAnglesCard.test.tsx`),
 * d'où les requêtes `findBy*`.
 */
describe('BellumReadCard — dégradation propre sur un dossier ancien', () => {
  it('affiche la phrase libre historique quand `blocks` est absent', async () => {
    renderWithRouter(<BellumReadCard data={LEGACY_DATA} score={7} />)
    expect(await screen.findByText(LEGACY_DATA.title!)).toBeInTheDocument()
  })

  it('ne rend rien sans titre ET sans blocs — jamais un panneau vide', async () => {
    const { container } = renderWithRouter(
      <BellumReadCard data={{ title: null, description: null, tags: [], blocks: null }} score={null} />,
    )
    // Laisse le routeur se stabiliser avant de constater l'absence.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(container).toBeEmptyDOMElement()
  })
})

describe('BellumReadCard — les quatre blocs (#1607.1)', () => {
  it('affiche le VERDICT en tête, à la place de la phrase libre', async () => {
    renderWithRouter(<BellumReadCard data={FOUR_BLOCKS_DATA} score={12} />)
    expect(await screen.findByText(FOUR_BLOCKS_DATA.blocks!.verdictLine)).toBeInTheDocument()
  })

  it('la fenêtre de lecture complète porte les trois blocs additifs', async () => {
    // `isTitleClamped` se mesure via scrollHeight/clientHeight, toujours à 0 en
    // jsdom (aucune mise en page réelle) : on force la mesure pour révéler le
    // bouton « voir plus », seul chemin d'ouverture de la fenêtre.
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400)
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    try {
      renderWithRouter(<BellumReadCard data={FOUR_BLOCKS_DATA} score={12} />)
      const seeMore = await screen.findByRole('button', { name: /voir plus|see more/i })
      fireEvent.click(seeMore)

      const dialog = await screen.findByRole('dialog')
      for (const reason of FOUR_BLOCKS_DATA.blocks!.why) {
        expect(within(dialog).getByText(reason)).toBeInTheDocument()
      }
      expect(within(dialog).getByText(FOUR_BLOCKS_DATA.blocks!.missing!)).toBeInTheDocument()
      expect(within(dialog).getByText(FOUR_BLOCKS_DATA.blocks!.nextAction!)).toBeInTheDocument()
      // #2164.34 — la prochaine action se dit à la première personne de Laura.
      expect(within(dialog).getByText('Ce que je ferais maintenant')).toBeInTheDocument()
    } finally {
      scrollHeight.mockRestore()
      clientHeight.mockRestore()
    }
  })
})

describe('#1895 — le cadre prend moins de hauteur, sans rien perdre de ce qui se lit', () => {
  /**
   * ⚠️ CE QUE CE FICHIER NE PEUT PAS FAIRE, ET IL FAUT LE DIRE.
   *
   * jsdom ne met rien en page : il ne rendra jamais les 241 px mesurés en
   * production, ni les ~185 attendus après ce lot. Une garde qui prétendrait
   * mesurer une hauteur ici serait un faux vert — le défaut #1882 du même jour
   * l'a payé, sur la cascade des couches CSS.
   *
   * Ce qui SE garde ici est donc ce qui se lit dans l'arbre : les trois sources
   * de hauteur retirées, et surtout ce qui ne devait PAS l'être.
   */
  it('l’anneau n’occupe plus la taille « large »', () => {
    const source = readFileSync(SOURCE, 'utf8')
    expect(source).toContain('size="medium"')
    expect(source).not.toContain('size="large"')
  })

  it('la gouttière du cadre est verticale, pas uniforme', () => {
    // `p-4` posait 16 px en haut ET en bas. `py-3` en pose 12, et `px-4` garde
    // la respiration horizontale — la largeur n'était pas le sujet du retour.
    const source = readFileSync(SOURCE, 'utf8')
    expect(source).toContain('px-4 py-3')
    expect(source).not.toMatch(/className="flex h-full flex-col p-4/)
  })

  it('⚠️ le libellé du score RESTE — un score n’est jamais nu', async () => {
    // Le témoin du lot : gagner seize pixels de plus coûterait la seule chose
    // qui rend le chiffre lisible. « 64 » sans son libellé est exactement ce
    // que ce dépôt refuse partout ailleurs.
    renderWithRouter(<BellumReadCard data={FOUR_BLOCKS_DATA} score={12} />)
    expect(await screen.findByText(FOUR_BLOCKS_DATA.blocks!.verdictLine)).toBeInTheDocument()
    expect(screen.getByText(/score/i)).toBeInTheDocument()
  })
})

/**
 * #2118.48 — DOSSIER ANCIEN : LE SCORE SE LIT, SANS SES AXES — MAIS JAMAIS NU.
 *
 * Vu en recette le 18/09/2026 sur QONTO et LATECOERE (analyses antérieures au
 * format sept axes) : `DossierWorthCard` ne se rend pas du tout (`dossierRead`
 * est `null`), et l'explication « pourquoi pas d'axes » n'existait qu'en
 * `title` — une info-bulle au survol, jamais visible au clic, au toucher, ni
 * lue par un lecteur d'écran. Un « /10 » suivi d'un marqueur, sans un mot
 * lisible sur ce qui manque, EST un score nu au sens de la doctrine.
 *
 * Réponse retenue (l'autre — recalculer ou deviner les axes — est interdite,
 * « JAMAIS de donnée fictive ») : l'écran DIT pourquoi, en texte lu. Il ne
 * relance rien tout seul — le rafraîchissement reste un geste, ailleurs.
 */
describe('#2118.48 — un dossier au format ancien ne rend jamais un score seul', () => {
  it('la note sans décomposition est accompagnée d’une explication LUE, pas d’un survol', async () => {
    renderWithRouter(<BellumReadCard data={FOUR_BLOCKS_DATA} score={7} hasAxisBreakdown={false} />)

    await screen.findByText(FOUR_BLOCKS_DATA.blocks!.verdictLine)
    // #3499 — plus de titre générique : seule la phrase qui dit POURQUOI reste.
    expect(screen.queryByText('Axes non détaillés pour cette analyse')).not.toBeInTheDocument()
    // La phrase qui DIT pourquoi est un texte du DOM, pas un attribut `title`
    // (invisible sans souris) : `getByText` la trouve sans hover simulé.
    expect(
      screen.getByText(/Cette analyse est antérieure à la lecture en sept axes.*Rafraîchis l’analyse pour l’obtenir\./),
    ).toBeInTheDocument()
  })

  it('un dossier qui PORTE la décomposition ne montre pas cette explication', async () => {
    renderWithRouter(<BellumReadCard data={FOUR_BLOCKS_DATA} score={7} hasAxisBreakdown={true} />)

    await screen.findByText(FOUR_BLOCKS_DATA.blocks!.verdictLine)
    expect(screen.queryByText('Axes non détaillés pour cette analyse')).not.toBeInTheDocument()
  })
})

describe('BellumReadCard — fiabilité du dossier NON ÉVALUABLE (#2307.19)', () => {
  it('affiche "Non évaluable" plutôt qu\'un "0/100" quand aucune source n\'a répondu', async () => {
    renderWithRouter(
      <BellumReadCard data={FOUR_BLOCKS_DATA} score={7} dossierReliability={0} confidenceTier="non_evaluable" />,
    )

    await screen.findByText(FOUR_BLOCKS_DATA.blocks!.verdictLine)
    expect(screen.getByText('Non évaluable')).toBeInTheDocument()
    expect(screen.queryByText('/100')).not.toBeInTheDocument()
  })
})

describe('BellumReadCard — sans objectif renseigné (#3818)', () => {
  it('un STOP sans déclencheur, sans objectif renseigné, ne dit jamais ÉCARTER POUR CET OBJECTIF', async () => {
    mockHasOfferObjective(false)
    renderWithRouter(<BellumReadCard data={FOUR_BLOCKS_DATA} score={3} storedVerdict="STOP" />)
    expect(await screen.findByText('ÉVALUATION PERSONNALISÉE INDISPONIBLE — ZÉRO MESURÉ')).toBeInTheDocument()
    expect(screen.queryByText('ÉCARTER POUR CET OBJECTIF')).not.toBeInTheDocument()
  })

  it('objectif renseigné : un STOP sans déclencheur garde ÉCARTER POUR CET OBJECTIF', async () => {
    mockHasOfferObjective(true)
    renderWithRouter(<BellumReadCard data={FOUR_BLOCKS_DATA} score={3} storedVerdict="STOP" />)
    expect(await screen.findByText('ÉCARTER POUR CET OBJECTIF')).toBeInTheDocument()
  })
})

describe('BellumReadCard — le score est un repère expliqué (#3675)', () => {
  it('#3675 — « Score commercial » est relié à une explication accessible, sans prédiction d’issue', async () => {
    renderWithRouter(<BellumReadCard data={FOUR_BLOCKS_DATA} score={12} />)
    const label = await screen.findByText('Score commercial')
    const describedBy = label.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const explanation = document.getElementById(describedBy!)
    expect(explanation?.textContent ?? '').toMatch(/ne prédit pas/i)
  })
})
