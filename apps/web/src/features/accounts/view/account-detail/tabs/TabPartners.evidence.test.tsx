import type { Account } from '@bellum/contracts'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

// #5107.5 — la grille de cartes (EcosystemGrid) a sa suite, `TabPartners.grid.test.tsx` ; ici on lit la lecture détaillée,
// qui garde la liste d'avant telle quelle (sans la grille, un nom ou une origine ne se lirait pas deux fois dans le DOM).
vi.mock('./ecosystem/EcosystemGrid', () => ({ EcosystemGrid: () => null }))

/**
 * #1818.1 — la convergence des preuves et les CTA ont déménagé dans la
 * modale de détail (la carte garde le nom, le logo et l'état). Un clic sur
 * la carte, PARTOUT où ce fichier lit désormais ce contenu.
 */
async function openDetail(name: string | RegExp) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name }))
  return user
}

let landscape: Record<string, unknown> = {}

vi.mock('@/lib/api', () => ({ apiFetch: () => Promise.resolve(landscape) }))

/**
 * ⚠️ Un identifiant DIFFÉRENT par test, et ce n'est pas un détail :
 * `renderWithRouter` partage un `QueryClient` de niveau module (son docbloc
 * annonce le contraire). Avec le même `a-1` partout, le second test lit le
 * paysage du PREMIER dans le cache — « 9 parcours observés » survivait au test
 * qui vérifie justement qu'aucun compte ne s'affiche.
 */
let seq = 0
const nextAccount = () => ({ id: `a-${++seq}`, company_name: 'SNCF' }) as Account
const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'ALTEN',
  rank: 'rank1',
  relationship: 'partner',
  note: null,
  source: 'declared',
  placements: 0,
  certainty: null,
  scope: null,
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  ...over,
})

beforeEach(() => {
  // ⚠️ Sans démontage explicite, le rendu du test PRÉCÉDENT reste dans le
  // document : « 9 parcours observés » d'un cas voisin faisait échouer le cas
  // qui vérifie justement qu'aucun compte ne s'affiche.
  cleanup()
  landscape = { partners: [], recommendations: [], observed: [] }
})

/**
 * #1605 — UNE LIGNE PAR ESN, TOUTES SES PREUVES CONSERVÉES.
 *
 * Ce que ces tests tiennent : « ALTEN » sort UNE fois, en portant simultanément
 * ses origines. L'ancienne forme (#1579) affichait deux blocs et laissait
 * déduire la concordance.
 */
describe('TabPartners — les origines de preuve (#1605)', () => {
  it('affiche les TROIS origines sur une seule ligne', async () => {
    landscape = {
      partners: [
        partner({
          evidence_origins: ['workspace_declared', 'market_observation', 'current_inference'],
          market_observation_count: 9,
        }),
      ],
      recommendations: [],
      observed: [],
    }
    const compte = nextAccount()
    renderWithRouter(<TabPartners account={compte} />)

    expect(await screen.findByText('Déclarée par ton équipe')).toBeInTheDocument()
    // #3667 / #3672 (recette prod 06/10) : l'observation du corpus se lit
    // « Historique observé » — « Observation Bellum » sur une ESN d'historique
    // se lisait comme une lecture actuelle.
    expect(screen.getByText('Historique observé')).toBeInTheDocument()
    expect(screen.queryByText(/^Observation /)).toBeNull()
    expect(screen.getByText('Source actuelle')).toBeInTheDocument()
    expect(screen.getByText('9 parcours observés')).toBeInTheDocument()
    // Une seule fois : c'est le doublon que le retour vise.
    expect(screen.getAllByText('ALTEN')).toHaveLength(1)
  })

  it('n’écrit PAS de compte de parcours quand le corpus n’observe pas la société', async () => {
    landscape = {
      partners: [partner({ evidence_origins: ['workspace_declared'], market_observation_count: null })],
      recommendations: [],
      observed: [],
    }
    const compte = nextAccount()
    renderWithRouter(<TabPartners account={compte} />)

    expect(await screen.findByText('Déclarée par ton équipe')).toBeInTheDocument()
    // Jamais « 0 parcours observés » : non observé n'est pas observé à zéro.
    expect(screen.queryByText(/parcours observé/)).not.toBeInTheDocument()
  })

  it('les origines REMPLACENT la pastille « détectée » — jamais les deux', async () => {
    landscape = {
      partners: [
        partner({ source: 'analysis', evidence_origins: ['current_inference'], market_observation_count: null }),
      ],
      recommendations: [],
      observed: [],
    }
    const compte = nextAccount()
    renderWithRouter(<TabPartners account={compte} />)

    expect(await screen.findByText('Source actuelle')).toBeInTheDocument()
    expect(screen.queryByText('Détectée')).not.toBeInTheDocument()
  })

  it('garde le rendu d’AVANT sur une réponse d’API antérieure au champ', async () => {
    landscape = { partners: [partner({ source: 'analysis' })], recommendations: [], observed: [] }
    const compte = nextAccount()
    renderWithRouter(<TabPartners account={compte} />)

    // Sans `evidence_origins`, la ligne retombe sur sa pastille d'origine.
    expect(await screen.findByText('ALTEN')).toBeInTheDocument()
    expect(screen.queryByText('Déclarée par ton équipe')).not.toBeInTheDocument()
  })

  it('le bloc « observées » ne garde que ce que l’espace ne connaît PAS', async () => {
    landscape = {
      partners: [
        partner({ evidence_origins: ['workspace_declared', 'market_observation'], market_observation_count: 9 }),
      ],
      recommendations: [],
      observed: [{ esnName: 'CAPGEMINI', persons: 3, certainty: 'moyenne', alsoKnown: false }],
    }
    const compte = nextAccount()
    renderWithRouter(<TabPartners account={compte} />)

    expect(await screen.findByText('CAPGEMINI')).toBeInTheDocument()
    expect(screen.getAllByText('ALTEN')).toHaveLength(1)
    // La mise en garde ne se masque jamais.
    expect(screen.getByText(/elle ne prouve pas une intervention actuelle/)).toBeInTheDocument()
  })
})

/**
 * #1624 — CE QUE LA MÉMOIRE MARCHÉ A LE DROIT D'AFFIRMER.
 *
 * La ligne directrice de l'issue tient en une phrase : « Market Memory ne dit
 * pas "ESN en place". Elle dit "Relation d'écosystème observée". » Tout le reste
 * en découle — le libellé de rang, la phrase de convergence, les deux sorties.
 */
describe('TabPartners — une observation PURE se qualifie depuis son bloc (#1624)', () => {
  /**
   * ⚠️ LE DÉFAUT QUE CES TESTS EMPÊCHENT, MESURÉ EN PRODUCTION LE 11/09/2026.
   *
   * Les deux sorties de #1624 existaient, testées, et vivaient UNIQUEMENT sur
   * les lignes déjà entrées dans la liste canonique (`isObservedOnly`). Le bloc
   * « Relation d'écosystème observée » — celui qui porte les sociétés que
   * l'espace ne connaît PAS encore, donc exactement celles qu'il y a à
   * qualifier — n'en portait aucune, et sa ligne n'était même pas cliquable.
   *
   * Mesuré sur un compte réel : « 4 parcours observés relient Devoteam à cet
   * environnement », et aucun geste possible. C'est « du code juste que
   * personne n'atteint » : la capacité était livrée et inaccessible là où elle
   * sert.
   */
  it('porte « Qualifier cette relation » sur une société SEULEMENT observée', async () => {
    landscape = {
      partners: [],
      recommendations: [],
      observed: [{ esnName: 'Devoteam', persons: 4, certainty: 'moyenne', alsoKnown: false }],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    expect(await screen.findByRole('button', { name: /Qualifier.*Devoteam/i })).toBeInTheDocument()
  })

  it('porte « Vérifier aujourd’hui », qui ouvre l’écran d’analyse', async () => {
    landscape = {
      partners: [],
      recommendations: [],
      observed: [{ esnName: 'Devoteam', persons: 4, certainty: 'moyenne', alsoKnown: false }],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    // ⚠️ Le libellé accessible met le NOM au milieu (« Vérifier Devoteam
    // aujourd'hui — … ») : un motif qui suppose l'ordre inverse ne trouve rien.
    const lien = await screen.findByRole('link', { name: /Vérifier Devoteam/i })
    expect(lien.tagName).toBe('A')
    expect(lien.getAttribute('href') ?? '').toContain('Devoteam')
  })

  it('⚠️ les deux gestes sont des ÉLÉMENTS TABULABLES, jamais un div cliquable', async () => {
    // GA-35 : ce qui se clique se tabule. Un `<div onClick>` n'a ni tabulation,
    // ni Entrée, ni annonce — et c'est précisément ce que la ligne observée
    // était avant ce lot : un div inerte.
    landscape = {
      partners: [],
      recommendations: [],
      observed: [{ esnName: 'Devoteam', persons: 4, certainty: 'moyenne', alsoKnown: false }],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    const bouton = await screen.findByRole('button', { name: /Qualifier.*Devoteam/i })
    expect(bouton.tagName).toBe('BUTTON')
    expect(bouton).toHaveAttribute('type', 'button')
  })

  it('n’invente aucun geste quand il n’y a RIEN à qualifier', async () => {
    // Le témoin qui empêche la garde d'attraper ce qu'elle ne vise pas : sans
    // observation, aucun bouton ne doit apparaître.
    landscape = { partners: [], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await screen.findByText(/aucune ESN en place/i)
    expect(screen.queryByRole('button', { name: /Qualifier/i })).not.toBeInTheDocument()
  })
})

describe('TabPartners — la relation observée (#1624)', () => {
  it('.6 — une relation SEULEMENT observée n’affiche jamais « Rang 2 »', async () => {
    // #1624 (16/09/2026) — LA FIXTURE ÉTAIT INVENTÉE, et c'est ce qui rendait
    // ce test vert sur du code mort : `mergePartnerEvidence` ne produit JAMAIS
    // `['market_observation']` seule, elle pousse toujours `workspace_declared`
    // ou `current_inference` à côté. La forme ci-dessous est celle du pipeline
    // — détectée ET observée, rang/relation à « inconnu » puisque
    // `seedDetectedPartners` écrit littéralement ces deux valeurs.
    landscape = {
      partners: [
        partner({
          source: 'analysis',
          rank: 'unknown',
          relationship: 'unknown',
          evidence_origins: ['market_observation', 'current_inference'],
          market_observation_count: 9,
        }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    expect(await screen.findByText('Route partenaire potentielle')).toBeInTheDocument()
    expect(screen.queryByText('Rang 2')).not.toBeInTheDocument()
    // L'interdit LITTÉRAL de l'issue, vérifié tel qu'elle l'écrit.
    expect(screen.queryByText(/Rang 2 disponible/)).not.toBeInTheDocument()
  })

  it('.6 — un rang DÉCLARÉ garde son nom : ce sont deux preuves différentes', async () => {
    landscape = {
      partners: [partner({ rank: 'rank2', evidence_origins: ['workspace_declared'] })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    expect(await screen.findByText('Rang 2')).toBeInTheDocument()
    expect(screen.queryByText('Route partenaire potentielle')).not.toBeInTheDocument()
  })

  it('.4 — quand une source actuelle CONFIRME, la convergence se dit en toutes lettres', async () => {
    landscape = {
      partners: [
        partner({ evidence_origins: ['market_observation', 'current_inference'], market_observation_count: 9 }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(/Voir le détail de ALTEN/i)

    expect(await screen.findByText(/va également dans ce sens/)).toBeInTheDocument()
  })

  it('.4 — sans source actuelle, aucune phrase de convergence n’est inventée', async () => {
    landscape = {
      partners: [partner({ evidence_origins: ['market_observation'], market_observation_count: 9 })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    // La ligne est bien rendue (rang 1 déclaré au jeu d'essai) — c'est la
    // PHRASE qui ne doit pas apparaître, pas la ligne.
    expect(await screen.findByText('ALTEN')).toBeInTheDocument()
    expect(screen.queryByText(/va également dans ce sens/)).not.toBeInTheDocument()
  })

  it('.4 — deux certitudes ÉGALES (source actuelle et mémoire marché) convergent, en toutes lettres', async () => {
    // 9 parcours ⇒ `observedCertainty(9)` = 'forte' (seuil ≥ 5). La détection
    // porte elle-même 'forte' : les deux valeurs mesurées sont IDENTIQUES.
    landscape = {
      partners: [
        partner({
          certainty: 'forte',
          evidence_origins: ['market_observation', 'current_inference'],
          market_observation_count: 9,
        }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(/Voir le détail de ALTEN/i)

    expect(await screen.findByText(/va également dans ce sens/)).toBeInTheDocument()
    expect(screen.queryByText(/dit autre chose/)).not.toBeInTheDocument()
  })

  it('.4 — deux certitudes qui DIVERGENT présentent les DEUX valeurs, sans en choisir une', async () => {
    // 9 parcours ⇒ `observedCertainty(9)` = 'forte'. La détection, elle, ne
    // porte que 'faible' : les deux mesures ne s'accordent pas.
    landscape = {
      partners: [
        partner({
          certainty: 'faible',
          evidence_origins: ['market_observation', 'current_inference'],
          market_observation_count: 9,
        }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(/Voir le détail de ALTEN/i)

    // La phrase de désaccord de l'issue, mot pour mot.
    expect(await screen.findByText(/dit autre chose/)).toBeInTheDocument()
    // Jamais la phrase de convergence en même temps — l'une ou l'autre.
    expect(screen.queryByText(/va également dans ce sens/)).not.toBeInTheDocument()
    // Les DEUX valeurs sont affichées, côte à côte — ni l'une ni l'autre
    // n'est écrasée par le désaccord.
    expect(screen.getByText(/Source actuelle : à vérifier/)).toBeInTheDocument()
    expect(screen.getByText(/Observations du marché : indices solides/)).toBeInTheDocument()
  })

  it('.4 — sans certitude de détection connue, on ne peut pas juger d’un désaccord : ça reste une convergence', async () => {
    // `certainty: null` — une ligne DÉCLARÉE n'a jamais de certitude de
    // détection. Sans les DEUX valeurs, la divergence ne peut pas se mesurer :
    // le comportement d'AVANT #1624.4 reste, et la ligne ne dit pas un
    // désaccord qu'elle n'a pas les moyens de constater.
    landscape = {
      partners: [
        partner({
          certainty: null,
          evidence_origins: ['market_observation', 'current_inference'],
          market_observation_count: 9,
        }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(/Voir le détail de ALTEN/i)

    expect(await screen.findByText(/va également dans ce sens/)).toBeInTheDocument()
    expect(screen.queryByText(/dit autre chose/)).not.toBeInTheDocument()
  })

  it('.5 — deux sorties positives, et chacune MÈNE quelque part (antériorité #1429)', async () => {
    // #1624 (16/09/2026) — la forme RÉELLE d'une ligne que le pipeline a posée
    // et que le corpus observe (voir le docbloc de `.6` juste au-dessus).
    landscape = {
      partners: [
        partner({
          source: 'analysis',
          rank: 'unknown',
          relationship: 'unknown',
          evidence_origins: ['market_observation', 'current_inference'],
          market_observation_count: 9,
        }),
      ],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await openDetail(/Voir le détail de ALTEN/i)

    expect(await screen.findByRole('button', { name: /Qualifier la relation avec ALTEN/ })).toBeInTheDocument()
    // « Vérifier aujourd'hui » est un LIEN vers l'écran d'analyse, qui annonce
    // le coût avant de débiter — le chemin que #1429 a déjà livré ailleurs.
    const verifier = await screen.findByRole('link', { name: /Vérifier ALTEN aujourd’hui/ })
    expect(verifier).toHaveAttribute('href', expect.stringContaining('/search'))
    expect(verifier.getAttribute('href')).toContain('ALTEN')
  })

  it('.5 — les CTA ne s’affichent PAS sur une relation déjà déclarée', async () => {
    // Rien à qualifier : elle l'est. Un bouton qui refait ce qui est fait est du
    // bruit, et #1429 avait justement refusé les CTA sans destination.
    landscape = {
      partners: [partner({ evidence_origins: ['workspace_declared'] })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    // #1818.1 — le CTA vit désormais DANS la modale : ouvrir avant de
    // vérifier son absence, sinon le test prouverait seulement que la carte
    // (qui ne l'a jamais porté) ne le porte pas — pas l'invariant réel.
    await openDetail(/Voir le détail de ALTEN/i)
    await screen.findByRole('dialog')

    expect(screen.queryByRole('button', { name: /Qualifier la relation/ })).not.toBeInTheDocument()
  })

  it('.2 / .3 — le bloc observé nomme la RELATION, et le compte devient une phrase', async () => {
    landscape = {
      partners: [],
      recommendations: [],
      observed: [{ esnName: 'ALTEN', persons: 9, certainty: 'forte', alsoKnown: false }],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)

    expect(await screen.findByText('Relation d’écosystème observée')).toBeInTheDocument()
    expect(screen.getByText('9 parcours observés relient ALTEN à cet environnement.')).toBeInTheDocument()
    // Le titre d'avant affirmait une présence ; il ne doit plus être là.
    expect(screen.queryByText(/Sociétés de services observées/)).not.toBeInTheDocument()
  })
})
