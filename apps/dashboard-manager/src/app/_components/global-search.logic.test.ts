import { describe, expect, it, vi } from 'vitest'
import {
  groupResults,
  isCompleteEmail,
  looksLikeIdentifier,
  runGlobalSearch,
  SEARCH_MIN_LENGTH,
  searchInvoicesLocal,
  searchPagesLocal,
  type SearchFetchers,
  type SearchHit,
} from './global-search.logic'

/**
 * #1673.6 — LA logique de la recherche globale (⌘K). Ce fichier ne fait AUCUN
 * appel réseau ni DOM : les cinq sources (utilisateurs, espaces, analyses,
 * factures, pages) sont des fonctions INJECTÉES (`SearchFetchers`), ce qui
 * rend la composition testable ici, et prouve une chose par construction :
 * cette fonction ne PEUT recevoir qu'une de ces cinq sources — jamais un accès
 * direct au contenu d'un compte client (RAG, notes, plans d'action…).
 */

function hit(partial: Partial<SearchHit> & Pick<SearchHit, 'category'>): SearchHit {
  return { id: 'id', title: 'title', href: '/x', ...partial }
}

describe('isCompleteEmail — le déclencheur du chemin direct vers la fiche', () => {
  it('reconnaît un email syntaxiquement complet', () => {
    expect(isCompleteEmail('marc.dupont@societe.com')).toBe(true)
  })

  it('refuse un fragment — on ne devine pas un email à moitié tapé', () => {
    expect(isCompleteEmail('marc.dupont')).toBe(false)
    expect(isCompleteEmail('marc.dupont@societe')).toBe(false)
    expect(isCompleteEmail('')).toBe(false)
  })
})

describe('looksLikeIdentifier — un UUID d’analyse tapé en entier', () => {
  it('reconnaît un UUID', () => {
    expect(looksLikeIdentifier('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true)
  })

  it('sait dire NON sur un texte quelconque', () => {
    expect(looksLikeIdentifier('acme')).toBe(false)
  })
})

describe('groupResults — l’ordre est FIXE, et chaque groupe plafonne à 3', () => {
  it('range chaque catégorie dans l’ordre users, workspaces, analyses, invoices, pages', () => {
    const hits = [
      hit({ id: 'p1', category: 'pages' }),
      hit({ id: 'a1', category: 'analyses' }),
      hit({ id: 'u1', category: 'users' }),
    ]
    expect(groupResults(hits).map(g => g.category)).toEqual(['users', 'analyses', 'pages'])
  })

  it('plafonne CHAQUE groupe à 3, jamais plus', () => {
    const cinq = Array.from({ length: 5 }, (_, i) => hit({ id: `u${i}`, category: 'users' }))
    const groups = groupResults(cinq)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.hits).toHaveLength(3)
  })

  it('omet un groupe vide plutôt que de l’afficher sans résultat', () => {
    expect(groupResults([])).toEqual([])
  })
})

describe('searchPagesLocal — Pages : recherche LOCALE, jamais réseau', () => {
  const sections = [
    { id: 'technique', label: 'Technique', items: [{ href: '/queues', label: 'Files (BullMQ)' }] },
    { id: 'administration', label: 'Administration', items: [{ href: '/audit', label: 'Audit' }] },
  ]

  it('matche le libellé, insensible à la casse et aux accents', () => {
    const hits = searchPagesLocal('FICHIERS', sections)
    expect(hits).toEqual([])
    expect(searchPagesLocal('audit', sections)).toEqual([
      { id: '/audit', title: 'Audit', href: '/audit', category: 'pages' },
    ])
  })

  it('inclut les entrées EXTRA (ex. Cockpit, Runbook) hors sections', () => {
    const hits = searchPagesLocal('cockpit', sections, [{ href: '/monitoring?view=cockpit', label: 'Cockpit' }])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.href).toBe('/monitoring?view=cockpit')
  })
})

describe('searchInvoicesLocal — Factures : sur le NUMÉRO déjà chargé, jamais le contenu', () => {
  const clients = [
    {
      workspaceId: 'w1',
      workspaceName: 'Acme SSII',
      invoices: [
        { id: 'inv-1', reference: 'FAC-2026-042' },
        { id: 'inv-2', reference: null },
      ],
    },
  ]

  it('matche une référence partielle', () => {
    const hits = searchInvoicesLocal('2026-042', clients)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ id: 'inv-1', title: 'FAC-2026-042', category: 'invoices' })
  })

  it('ignore une facture sans référence plutôt que de planter', () => {
    expect(searchInvoicesLocal('inv-2', clients)).toEqual([])
  })

  /**
   * #1673.4b — aucune route de détail de facture n'existe dans le manager.
   * Plutôt qu'une route neuve (hors périmètre de ce lot), le résultat mène à
   * la liste des clients PRÉ-FILTRÉE sur l'espace qui a émis la facture — le
   * seul filtre déjà câblé côté `/revenus/clients` (son `?search=` matche le
   * NOM d'espace, `page.tsx:52`). Et il le DIT, dans le sous-titre, avant le
   * clic : cette destination n'est pas la fiche de LA facture, c'est la liste
   * de SON client.
   */
  it('mène à la liste des clients pré-filtrée sur l’espace, jamais à une fiche facture inexistante', () => {
    const hits = searchInvoicesLocal('2026-042', clients)
    expect(hits[0]?.href).toBe('/revenus/clients?search=Acme%20SSII')
    expect(hits[0]?.subtitle).toBe('Acme SSII · pas de fiche facture — ouvre la liste clients filtrée sur cet espace')
  })

  it('encode le nom de l’espace dans l’URL — un « & » ou un accent ne casse pas le lien', () => {
    const clientsAvecCaracteresSpeciaux = [
      {
        workspaceId: 'w2',
        workspaceName: 'Duval & Associés',
        invoices: [{ id: 'inv-3', reference: 'FAC-2026-099' }],
      },
    ]
    const hits = searchInvoicesLocal('2026-099', clientsAvecCaracteresSpeciaux)
    expect(hits[0]?.href).toBe('/revenus/clients?search=Duval%20%26%20Associ%C3%A9s')
  })
})

function fetchers(overrides: Partial<SearchFetchers> = {}): SearchFetchers {
  return {
    searchUsers: vi.fn(async () => []),
    searchWorkspaces: vi.fn(async () => []),
    searchAnalyses: vi.fn(async () => []),
    searchInvoices: vi.fn(async () => []),
    searchPages: vi.fn(async () => []),
    ...overrides,
  }
}

describe('runGlobalSearch — la porte : cinq sources, et rien d’autre', () => {
  it('sous le seuil minimal, ne fait AUCUN appel — pas de bruit réseau à chaque frappe', async () => {
    const f = fetchers()
    const result = await runGlobalSearch('a', f)
    expect(result).toEqual({ groups: [], directEmailUserId: null })
    expect(f.searchUsers).not.toHaveBeenCalled()
    expect(f.searchWorkspaces).not.toHaveBeenCalled()
  })

  it(`accepte exactement le seuil (${SEARCH_MIN_LENGTH} caractères)`, async () => {
    const f = fetchers()
    await runGlobalSearch('ac', f)
    expect(f.searchUsers).toHaveBeenCalledWith('ac')
  })

  it('un email COMPLET va DIRECTEMENT à la fiche — jamais affiché dans une liste', async () => {
    const f = fetchers({ resolveEmailUser: vi.fn(async () => 'user-42') })
    const result = await runGlobalSearch('marc.dupont@societe.com', f)
    expect(result).toEqual({ groups: [], directEmailUserId: 'user-42' })
    // La preuve qui compte : la recherche générale n'a JAMAIS tourné, donc cet
    // email ne peut apparaître dans aucune liste de résultats (masquée ou non).
    expect(f.searchUsers).not.toHaveBeenCalled()
    expect(f.searchWorkspaces).not.toHaveBeenCalled()
    expect(f.searchAnalyses).not.toHaveBeenCalled()
  })

  it('email complet mais SANS utilisateur : on ne refuse pas, on cherche normalement', async () => {
    const f = fetchers({
      resolveEmailUser: vi.fn(async () => null),
      searchUsers: vi.fn(async () => [hit({ id: 'u1', category: 'users' })]),
    })
    const result = await runGlobalSearch('personne@nulle-part.com', f)
    expect(result.directEmailUserId).toBeNull()
    expect(f.searchUsers).toHaveBeenCalledWith('personne@nulle-part.com')
    expect(result.groups[0]?.hits[0]?.id).toBe('u1')
  })

  it('une requête normale interroge les CINQ sources avec la même chaîne, et fusionne', async () => {
    const f = fetchers({
      searchUsers: vi.fn(async () => [hit({ id: 'u1', category: 'users' })]),
      searchWorkspaces: vi.fn(async () => [hit({ id: 'w1', category: 'workspaces' })]),
    })
    const result = await runGlobalSearch('  acme  ', f)
    expect(f.searchUsers).toHaveBeenCalledWith('acme')
    expect(f.searchWorkspaces).toHaveBeenCalledWith('acme')
    expect(f.searchAnalyses).toHaveBeenCalledWith('acme')
    expect(f.searchInvoices).toHaveBeenCalledWith('acme')
    expect(f.searchPages).toHaveBeenCalledWith('acme')
    expect(result.groups.map(g => g.category)).toEqual(['users', 'workspaces'])
  })

  /**
   * ⚠️ LE TEST DE L'ISSUE — « chercher un mot présent dans un compte client
   * rend 0 résultat. »
   *
   * On simule ici le comportement RÉEL des cinq sources : chacune ne matche
   * QUE son champ d'administration (email/nom, nom d'espace, entreprise/SIREN,
   * numéro de facture, libellé de page). Le mot choisi n'existe QUE dans le
   * CONTENU d'un compte client (une réponse de profil ESN, une note de
   * compte) — un champ qu'AUCUNE des cinq fonctions n'expose, parce que le
   * typage de `SearchFetchers` ne donne à cette fonction aucun autre canal
   * pour l'atteindre. Zéro résultat n'est donc pas un hasard de fixture : il
   * découle de la forme même de la porte.
   */
  it('un mot présent dans le CONTENU d’un compte client (jamais dans un champ d’administration) rend 0 résultat', async () => {
    const MOT_DE_CONTENU = 'recourt-a-des-prestataires-exclusifs'
    const f = fetchers({
      // Fidèle au service réel : ILIKE sur company_name / email / siren —
      // jamais sur les réponses du questionnaire ESN.
      searchAnalyses: vi.fn(async (q: string) =>
        'acme entreprise'.includes(q) || 'contact@acme.fr'.includes(q) || '552100554'.includes(q)
          ? [hit({ id: 'a1', category: 'analyses' })]
          : [],
      ),
      searchWorkspaces: vi.fn(async (q: string) =>
        'acme ssii'.includes(q) ? [hit({ id: 'w1', category: 'workspaces' })] : [],
      ),
      searchUsers: vi.fn(async (q: string) =>
        'marc dupont marc@acme.fr'.includes(q) ? [hit({ id: 'u1', category: 'users' })] : [],
      ),
      searchInvoices: vi.fn(async (q: string) =>
        'fac-2026-042'.includes(q) ? [hit({ id: 'i1', category: 'invoices' })] : [],
      ),
      searchPages: vi.fn(async (q: string) =>
        'audit utilisateurs'.includes(q) ? [hit({ id: '/audit', category: 'pages' })] : [],
      ),
    })
    const result = await runGlobalSearch(MOT_DE_CONTENU, f)
    expect(result.groups).toEqual([])
    expect(result.directEmailUserId).toBeNull()
  })
})
