import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import type { Account } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountDetail, hasReadableDossierWhileAnalyzing, resolveArrivalTab } from './AccountDetail'
import { accountDetailSearchSchema } from './account-detail/accountDetailSearch'
import bpceBrief from '../../../../../../packages/contracts/src/commercial-brief/bpce.fixture.json'

const stubAccount: Account = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  company_name: 'ACME',
  siren: null,
  sector: null,
  employees: null,
  revenue: null,
  headquarters: null,
  website: null,
  subsidiaries: [],
  it_challenges: [],
  recent_signals: [],
  priority_score: null,
  priority_justification: null,
  raw_analysis: null,
  status: 'completed',
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('AccountDetail', () => {
  // `renderWithRouter` mounts a TanStack `RouterProvider`, which resolves its
  // first route match in a microtask: the container is still empty when
  // `render()` returns. The assertion is unchanged — it just has to wait for the
  // mount instead of racing it.
  it('mounts the body with a stub account', async () => {
    const { container } = renderWithRouter(<AccountDetail account={stubAccount} contacts={[]} />, '/accounts/test-id')
    await waitFor(() => expect(container.firstChild).toBeTruthy())
  })

  // #1816 — le rythme vertical entre le Hero, la bande de contexte et la
  // barre d'onglets se resserre d'un cran sur l'échelle Tailwind. Structurel,
  // pas visuel : jsdom ne mesure aucun pixel, on prouve juste que l'ancienne
  // valeur a disparu et que la nouvelle est bien celle posée dans le code.
  //
  // ⚠️ Lu depuis le FICHIER SOURCE, pas depuis un rendu complet de
  // `AccountDetail` : `AccountDetailTabContent` appelle `useSearch()`, que le
  // routeur minimal de `renderWithRouter` (une seule route `/$` catch-all) ne
  // satisfait pas — l'arbre entier tombe dans un error boundary AVANT même
  // d'atteindre ce conteneur, silencieusement (le seul autre test de ce
  // fichier passe quand même, puisqu'il ne vérifie que `firstChild`, que ce
  // soit le vrai arbre ou le message de secours). Défaut PRÉ-EXISTANT,
  // indépendant de ce lot — voir le rapport de la tâche.
  // Refonte Théo (23/10) — le rythme suit la maquette appliquée (`gap-4 pb-3` sous la barre) ; ce que
  // #1816 gardait (plus jamais l'ancien `gap-5 py-4`) reste vérifié.
  it('resserre le rythme du conteneur (maquette Théo gap-4/pb-3), plus gap-5/py-4', () => {
    const source = readFileSync(join(__dirname, 'AccountDetail.tsx'), 'utf8')
    expect(source).not.toMatch(/\bgap-5 py-4\b/)
    expect(source).toContain('gap-4 pb-3')
  })
})

/**
 * #1817 — l'organigramme devient l'onglet d'ARRIVÉE quand le compte porte un
 * graphe, sinon la vue d'ensemble reste le défaut.
 *
 * ⚠️⚠️ Ce que cette suite garde surtout : SANS graphe, l'onglet d'arrivée
 * n'ouvre JAMAIS l'organigramme — c'est précisément l'état vide qui réclame un
 * crédit (`OrgMapEmptyState`). La condition doit être VRAIE avant de basculer,
 * jamais « on essaie et on voit ».
 *
 * `resolveArrivalTab` est une fonction PURE, testée directement plutôt qu'au
 * travers d'un rendu complet : la décision ne dépend que de `raw_analysis` et
 * d'un onglet explicitement demandé, elle n'a besoin d'aucun réseau ni routeur
 * pour être prouvée.
 */
describe('resolveArrivalTab — #1817', () => {
  function withOrgGraph(people: unknown[], entities: unknown[] = []): Record<string, unknown> {
    return { org: { orgGraph: { people, entities } } }
  }

  const aPerson = { id: 'p1', fullName: 'Jane Doe', identityStatus: 'seed', confidence: 50 }

  it('ouvre la VUE D’ENSEMBLE quand le dossier n’a pas de `raw_analysis`', () => {
    expect(resolveArrivalTab(null, undefined)).toBe('overview')
  })

  it('ouvre la VUE D’ENSEMBLE quand le dossier n’a pas encore d’`orgGraph`', () => {
    expect(resolveArrivalTab({}, undefined)).toBe('overview')
  })

  // #3674.1 — renversement du 05/10/2026 : stratégie d'abord PARTOUT, l'organigramme est à un clic.
  it('#3674.1 — un graphe avec personnes N’ouvre PLUS l’organigramme par défaut : la stratégie (vue d’ensemble)', () => {
    expect(resolveArrivalTab(withOrgGraph([aPerson]), undefined)).toBe('overview')
  })

  it('#3674.1 — un graphe avec entités seules ouvre la stratégie aussi', () => {
    const anEntity = { id: 'e1', name: 'ACME Group', type: 'groupe', confidence: 50 }
    expect(resolveArrivalTab(withOrgGraph([], [anEntity]), undefined)).toBe('overview')
  })

  it('#3674.2 — un lien explicite `?tab=organigramme` (ou contacts) reste respecté', () => {
    expect(resolveArrivalTab(withOrgGraph([aPerson]), 'organigramme')).toBe('organigramme')
    expect(resolveArrivalTab(null, 'contacts')).toBe('contacts')
  })

  it('⚠️⚠️ un `orgGraph` aux DEUX vides retombe sur la vue d’ensemble — jamais l’état vide payant', () => {
    expect(resolveArrivalTab(withOrgGraph([], []), undefined)).toBe('overview')
  })

  it('un graphe qui ne respecte pas le contrat retombe sur la vue d’ensemble, sans planter', () => {
    expect(resolveArrivalTab({ org: { orgGraph: { people: 'not-an-array' } } }, undefined)).toBe('overview')
  })

  it('un onglet DEMANDÉ (lien profond, retour d’un autre onglet) gagne toujours — même avec un graphe', () => {
    expect(resolveArrivalTab(withOrgGraph([aPerson]), 'coverage')).toBe('coverage')
    expect(resolveArrivalTab(null, 'plan')).toBe('plan')
  })

  it('sait dire NON : un graphe non vide n’ouvre PAS l’organigramme à l’arrivée ordinaire', () => {
    expect(resolveArrivalTab(withOrgGraph([aPerson]), undefined)).not.toBe('organigramme')
  })
})

/**
 * #2164.16 — LAISSER CONSULTER LE DOSSIER PENDANT QU'UNE ANALYSE TOURNE.
 *
 * Fonction pure, testée comme `resolveArrivalTab` juste au-dessus : la
 * décision ne dépend que de `raw_analysis`, aucun montage complet nécessaire
 * (voir la note du fichier sur `AccountDetailTabContent` / `useSearch()`).
 */
describe('hasReadableDossierWhileAnalyzing — #2164.16', () => {
  it('rend `false` sur un compte jamais analysé (`raw_analysis` null) — plein écran gardé', () => {
    expect(hasReadableDossierWhileAnalyzing(null)).toBe(false)
  })

  it('rend `false` sur un `raw_analysis` sans lecture structurée (dossier d’avant ce lot)', () => {
    expect(hasReadableDossierWhileAnalyzing({ evaluation: {} })).toBe(false)
  })

  it('rend `true` dès que la lecture Synthèse a quelque chose à montrer', () => {
    expect(
      hasReadableDossierWhileAnalyzing({
        evaluation: { dossier_read: { why_for_your_esn: 'Trois domaines répondent au programme publié.' } },
      }),
    ).toBe(true)
  })

  it('sait dire NON : un `raw_analysis` sans le champ attendu ne rend pas `true` par erreur', () => {
    expect(hasReadableDossierWhileAnalyzing({ evaluation: { dossier_read: {} } })).not.toBe(true)
  })
})

/**
 * #2130.39 / #2130.41 — recette des scénarios « première analyse » et
 * « compte historique ».
 *
 * Les deux dérivations ci-dessus PILOTENT déjà cette distinction en
 * production : un compte jamais analysé garde le plein écran pendant son
 * PREMIER run (rien à montrer derrière), un compte déjà passé par au moins
 * une analyse reste consultable pendant un refresh ultérieur. Ce bloc les
 * nomme explicitement sur les deux FORMES de compte que la grille golden
 * distingue (#2130.1 grande_distribution / #2130.14 missions_passees),
 * plutôt que de les revérifier en général.
 */
describe('#2130.39 — première analyse : rien à montrer derrière tant qu’aucune analyse n’a jamais abouti', () => {
  it('un compte tout juste ajouté (jamais analysé) n’a aucun dossier lisible', () => {
    expect(hasReadableDossierWhileAnalyzing(null)).toBe(false)
  })

  it('arrive sur la vue d’ensemble par défaut, faute de tout autre signal (aucun graphe, aucun onglet demandé)', () => {
    expect(resolveArrivalTab(null, undefined)).toBe('overview')
  })
})

describe('#2130.41 — compte historique : le dossier existant reste lisible pendant un nouveau run', () => {
  it('un compte déjà analysé au moins une fois garde un dossier lisible pendant un refresh', () => {
    expect(
      hasReadableDossierWhileAnalyzing({
        evaluation: { dossier_read: { why_for_your_esn: 'Trois missions déjà livrées chez ce compte.' } },
      }),
    ).toBe(true)
  })

  it('sait dire NON — la distinction tient sur la PRÉSENCE d’une lecture passée, pas sur une autre donnée', () => {
    // Un compte sans lecture structurée n'est PAS « historique » même s'il
    // porte un `raw_analysis` non vide (dossier d'avant #2164.16, ou run
    // interrompu avant la moindre synthèse) — la même garde que ci-dessus,
    // rejouée avec l'intitulé du scénario.
    expect(hasReadableDossierWhileAnalyzing({ evaluation: {} })).toBe(false)
  })
})

// Brief « Ce que je sais » (01/10/2026) — la page d'entrée du compte QUAND il existe.
describe('resolveArrivalTab — brief « Ce que je sais »', () => {
  const withBrief = { commercial_brief: structuredClone(bpceBrief) } as Record<string, unknown>

  it('Louis 12/10/2026 (renverse #3674.1) — l’arrivée ordinaire ouvre « Ce que je sais » QUAND un brief valide existe ; sans brief, la vue d’ensemble', () => {
    expect(resolveArrivalTab(withBrief, undefined)).toBe('brief')
    expect(resolveArrivalTab({}, undefined)).toBe('overview')
    expect(resolveArrivalTab({ commercial_brief: { account_name: 'X' } }, undefined)).toBe('overview')
    expect(resolveArrivalTab(withBrief, 'brief')).toBe('brief')
  })

  it('un onglet explicitement demandé gagne toujours', () => {
    expect(resolveArrivalTab(withBrief, 'plan')).toBe('plan')
  })

  // K.1 (lot COMPTE-SAIS) — Louis 19/10/2026 : « Vue d'ensemble » est FUSIONNÉE dans « Ce que je sais ».
  it('K.1 — `?tab=overview` avec un brief valide redirige vers « Ce que je sais » (aucun lien orphelin) ; sans brief, la vue d’ensemble reste', () => {
    expect(resolveArrivalTab(withBrief, 'overview')).toBe('brief')
    expect(resolveArrivalTab({}, 'overview')).toBe('overview')
    expect(resolveArrivalTab({ commercial_brief: { account_name: 'X' } }, 'overview')).toBe('overview')
  })

  it('un lien `?tab=brief` sans brief valide retombe sur la vue d’ensemble (aucun onglet vide)', () => {
    expect(resolveArrivalTab({}, 'brief')).toBe('overview')
    expect(resolveArrivalTab({ commercial_brief: { account_name: 'X' } }, 'brief')).toBe('overview')
  })
})

// 01/10/2026 (recette ENGIE) — la liste posait `?tab=overview` : l'arrivée « choisie » écrasait le brief.
describe('arrivée depuis la liste des comptes — brief', () => {
  const withBrief = { commercial_brief: structuredClone(bpceBrief) } as Record<string, unknown>

  it('le lien de la liste ne porte aucun onglet : l’URL parsée donne `undefined`, donc « Ce que je sais » quand le brief existe (12/10/2026)', () => {
    const search = accountDetailSearchSchema.parse({})
    expect(search.tab).toBeUndefined()
    expect(resolveArrivalTab(withBrief, search.tab)).toBe('brief')
  })

  it('un lien explicite `?tab=veille` reste respecté', () => {
    const search = accountDetailSearchSchema.parse({ tab: 'veille' })
    expect(resolveArrivalTab(withBrief, search.tab)).toBe('veille')
  })
})

/**
 * Kineis / FNAC (recette prod 31/10) — `?tab=overview` demandé explicitement ne doit PAS être réécrit en `brief`
 * quand l'aperçu a quelque chose à montrer que « Ce que je sais » n'a pas : une filiale (« Filiale de X ») ou une
 * résolution d'entité ambiguë (EntityResolutionPanel, TabOverview).
 */
describe('resolveArrivalTab — ?tab=overview explicite avec un brief (Kineis)', () => {
  const brief = { commercial_brief: structuredClone(bpceBrief) } as Record<string, unknown>
  const base = {
    state: 'resolved',
    kind: 'subsidiary',
    canonical_id: 'siren:552100554',
    commercial_name: 'Kineis',
    legal_name: 'KINEIS',
    country: 'FR',
    identifiers: { siren: '552100554' },
    domain: null,
    naf_code: null,
    naf_label: null,
    location: null,
    parent_names: ['CLS'],
    children_count: null,
    sources: ['legal_identifier'],
    confidence: 80,
    reasons: [],
    question: null,
    resolved_at: '2026-10-30T10:00:00.000Z',
  }

  it('une filiale (un seul détenteur) garde l’aperçu demandé', () => {
    expect(resolveArrivalTab({ ...brief, entity_resolution: base }, 'overview')).toBe('overview')
  })

  it('une résolution ambiguë garde l’aperçu demandé', () => {
    const ambiguous = {
      ...base,
      state: 'ambiguous',
      kind: null,
      canonical_id: null,
      parent_names: [],
      question: { candidates: [{ name: 'KINEIS A' }, { name: 'KINEIS B' }] },
    }
    expect(resolveArrivalTab({ ...brief, entity_resolution: ambiguous }, 'overview')).toBe('overview')
  })

  it('sait dire NON : sans filiale ni ambiguïté, l’aperçu fusionné redirige encore vers le brief (K.1)', () => {
    expect(
      resolveArrivalTab(
        { ...brief, entity_resolution: { ...base, kind: 'legal_entity', parent_names: [] } },
        'overview',
      ),
    ).toBe('brief')
    expect(resolveArrivalTab(brief, 'overview')).toBe('brief')
  })
})
