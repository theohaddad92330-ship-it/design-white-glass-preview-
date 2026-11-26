import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROUTE_MIGRATION_REGISTRY } from './route-migration-registry.js'
import {
  NONREGRESSION_CAPACITIES,
  NONREGRESSION_DIMENSIONS,
  nonRegressionCapacitySchema,
  nonRegressionCoverage,
} from './route-migration-nonregression.js'

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

const CREDIT_WORD = /(?<![\p{L}])cr[ée]dits?(?![\p{L}])/iu

describe('les treize dimensions de #2154.9/#2958.72-.93 (TESTS DE NON-RÉGRESSION) — verbatim, dans l’ordre du texte', () => {
  it('sont exactement les treize, dans l’ordre', () => {
    expect(NONREGRESSION_DIMENSIONS).toEqual([
      'route_accessible',
      'role_correct',
      'donnee_visible',
      'action_reelle',
      'cout',
      'etat_vide',
      'erreur',
      'mobile',
      'lien_partage',
      'retour_navigateur',
      'deep_link',
      'audit',
      'notification',
    ])
  })
})

describe('capacité « Écritures → Centre d’actions » — les treize ENSEMBLE, pas une isolée', () => {
  const capacity = NONREGRESSION_CAPACITIES[0]

  it('respecte le contrat, les treize dimensions présentes une seule fois', () => {
    expect(nonRegressionCapacitySchema.safeParse(capacity).success).toBe(true)
    expect(capacity.checks.map(check => check.dimension).sort()).toEqual([...NONREGRESSION_DIMENSIONS].sort())
  })

  it('pointe vers une clé RÉELLE du registre de migration #2154.3, pas un nom inventé', () => {
    expect(ROUTE_MIGRATION_REGISTRY.some(entry => entry.key === capacity.routeMigrationKey)).toBe(true)
  })

  it('chaque dimension `verified` cite un fichier qui EXISTE VRAIMENT', () => {
    const verified = capacity.checks.filter(check => check.status === 'verified')
    expect(verified.length).toBeGreaterThan(0)
    for (const check of verified) {
      expect(check.file).not.toBeNull()
      expect(existsSync(join(REPO_ROOT, check.file as string))).toBe(true)
    }
  })

  it('chaque dimension `gap` nomme une raison concrète, jamais « à vérifier »', () => {
    const gaps = capacity.checks.filter(check => check.status === 'gap')
    for (const check of gaps) {
      expect(check.file).toBeNull()
      expect(check.evidence.toLowerCase()).not.toMatch(/^à vérifier$/)
      expect(check.evidence.length).toBeGreaterThan(20)
    }
  })

  it('la garde sait dire NON — un fichier inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/features/action-history/view/FichierQuiNexistePas.tsx'))).toBe(
      false,
    )
  })

  it('reconnaît honnêtement que 8 dimensions sur 13 sont prouvées, pas 13 — un registre tout vert mentirait', () => {
    expect(nonRegressionCoverage('ecritures_centre_actions')).toEqual({ verified: 8, total: 13 })
  })

  it('les preuves `route_accessible` et `donnee_visible` citent des fichiers dont le contenu confirme VRAIMENT la capacité', () => {
    const table = readFileSync(
      join(REPO_ROOT, 'apps/web/src/features/action-history/view/ActionHistoryTable.tsx'),
      'utf8',
    )
    expect(table).toMatch(/emptyTitle/)
    expect(table).toMatch(/emptySubtitle/)

    const executeDialog = readFileSync(
      join(REPO_ROOT, 'apps/web/src/features/actions/components/ExecuteActionDialog.tsx'),
      'utf8',
    )
    // #4468 — crédits implicites (Louis 22/10) : le dialogue n'affiche plus aucun coût.
    // On lit le code SANS ses commentaires : un chiffre ou un mot « crédit » réaffiché fait échouer.
    const dialogCode = executeDialog.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(dialogCode).not.toMatch(/creditCostOf/)
    expect(dialogCode).not.toMatch(CREDIT_WORD)

    const detailRoute = readFileSync(join(REPO_ROOT, 'apps/web/src/routes/actions/$id.tsx'), 'utf8')
    expect(detailRoute).toMatch(/ActionHistoryDetailPage/)
  })
})

/**
 * #2958.104 — DEUXIÈME capacité, « Contacts ». La seule EXIGENCE de ce lot
 * (R19) est la dimension `etat_vide` — c'est elle que la condition NO-GO
 * « page vide sans porte de sortie » lit — mais une capacité DEMI-remplie
 * briserait le format comparatif que la capacité de référence a posé : les
 * TREIZE dimensions, chacune `verified` ou `gap`, jamais une dixième case
 * muette.
 */
describe('capacité « Contacts » — deuxième capacité (2/21 routes), 5/13 dimensions prouvées', () => {
  const capacity = NONREGRESSION_CAPACITIES.find(entry => entry.key === 'contacts_liste')

  it('existe, pointe vers la clé RÉELLE `contacts` du registre #2154.3', () => {
    expect(capacity).toBeDefined()
    expect(ROUTE_MIGRATION_REGISTRY.some(entry => entry.key === capacity?.routeMigrationKey)).toBe(true)
    expect(capacity?.routeMigrationKey).toBe('contacts')
  })

  it('respecte le contrat, les treize dimensions présentes une seule fois', () => {
    expect(nonRegressionCapacitySchema.safeParse(capacity).success).toBe(true)
    expect(capacity?.checks.map(check => check.dimension).sort()).toEqual([...NONREGRESSION_DIMENSIONS].sort())
  })

  it('chaque dimension `verified` cite un fichier qui EXISTE VRAIMENT', () => {
    const verified = capacity?.checks.filter(check => check.status === 'verified') ?? []
    expect(verified.length).toBeGreaterThan(0)
    for (const check of verified) {
      expect(check.file).not.toBeNull()
      expect(existsSync(join(REPO_ROOT, check.file as string))).toBe(true)
    }
  })

  it('chaque dimension `gap` nomme une raison concrète, jamais « à vérifier »', () => {
    const gaps = capacity?.checks.filter(check => check.status === 'gap') ?? []
    for (const check of gaps) {
      expect(check.file).toBeNull()
      expect(check.evidence.toLowerCase()).not.toMatch(/^à vérifier$/)
      expect(check.evidence.length).toBeGreaterThan(20)
    }
  })

  it('`etat_vide` — la dimension que lit #2958.104 — est VRAIMENT `verified` : un vide filtré ET un vide initial, chacun sa phrase, le second avec une porte de sortie réelle', () => {
    const etatVide = capacity?.checks.find(check => check.dimension === 'etat_vide')
    expect(etatVide?.status).toBe('verified')
    const source = readFileSync(join(REPO_ROOT, etatVide?.file as string), 'utf8')
    expect(source).toMatch(/isFilterActive/)
    // Refonte Théo (c1-repertoire, 23/10) : le vide filtré est rendu par `ContactsStateBox`, plus `SearchEmptyState`.
    expect(source).toMatch(/isFilterActive \? \(\s*<ContactsStateBox/)
    expect(source).toMatch(/ContactsEmpty/)
    const emptyState = readFileSync(
      join(REPO_ROOT, 'apps/web/src/features/contacts/view/contacts-list/ContactsEmpty.tsx'),
      'utf8',
    )
    // La porte de sortie : une action, jamais un vide qui ne mène nulle part.
    expect(emptyState).toMatch(/actions?=/)
  })

  it('`erreur` est VRAIMENT `verified` : une 1ʳᵉ page en échec n’emprunte pas les mots du vide', () => {
    const erreur = capacity?.checks.find(check => check.dimension === 'erreur')
    expect(erreur?.status).toBe('verified')
    const source = readFileSync(join(REPO_ROOT, erreur?.file as string), 'utf8')
    expect(source).toMatch(/role="alert"/)
  })

  it('reconnaît honnêtement que CINQ dimensions sur treize sont prouvées, pas treize', () => {
    expect(nonRegressionCoverage('contacts_liste')).toEqual({ verified: 5, total: 13 })
  })

  it('la garde sait dire NON — un fichier inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/features/contacts/view/FichierQuiNexistePas.tsx'))).toBe(false)
  })
})

describe('#2958.104 (lot J04) — « Projets — pipe », troisième capacité : QUATRE branches d’un vide, chacune lue au code', () => {
  const capacity = NONREGRESSION_CAPACITIES.find(entry => entry.key === 'projets_pipe')

  it('existe, respecte le contrat et pointe une clé RÉELLE du registre', () => {
    expect(capacity).toBeDefined()
    expect(nonRegressionCapacitySchema.safeParse(capacity).success).toBe(true)
    expect(ROUTE_MIGRATION_REGISTRY.some(entry => entry.key === capacity?.routeMigrationKey)).toBe(true)
  })

  it('chaque dimension `verified` cite un fichier qui EXISTE VRAIMENT, chaque `gap` une raison concrète', () => {
    for (const check of capacity?.checks ?? []) {
      if (check.status === 'verified') {
        expect(existsSync(join(REPO_ROOT, check.file as string))).toBe(true)
      } else {
        expect(check.file).toBeNull()
        expect(check.evidence.length).toBeGreaterThan(20)
      }
    }
  })

  it('`etat_vide` est `verified` ET le code porte vraiment les branches nommées : erreur sans porte, pipe vide avec actions, filtre d’étape qui se retire, filtres qui s’effacent', () => {
    const etatVide = capacity?.checks.find(check => check.dimension === 'etat_vide')
    expect(etatVide?.status).toBe('verified')
    const source = readFileSync(join(REPO_ROOT, etatVide?.file as string), 'utf8')
    // #4197 (L6) — `emptyState.errorTitle` est parti avec les Pistes (`PortfolioLens`) ; le pipe garde le sien.
    expect(source).toMatch(/emptyState\.pipelineErrorTitle/)
    expect(source).toMatch(/emptyState\.noProjectTitle/)
    expect(source).toMatch(/CreateProjectAction/)
    expect(source).toMatch(/stageFilter\.emptyCta/)
    expect(source).toMatch(/ClearFiltersAction/)
  })

  it('`erreur` est distincte du vide : l’échec de chargement a ses propres mots', () => {
    const erreur = capacity?.checks.find(check => check.dimension === 'erreur')
    expect(erreur?.status).toBe('verified')
    const source = readFileSync(join(REPO_ROOT, erreur?.file as string), 'utf8')
    expect(source).toMatch(/emptyState\.errorDescription/)
  })

  it('ne coche que ce qui est prouvé (6 sur 13), pas plus', () => {
    expect(nonRegressionCoverage('projets_pipe')).toEqual({ verified: 6, total: 13 })
  })
})

/**
 * #2958.72-.84 — la non-régression ne s'arrête plus aux trois capacités de référence :
 * chacune des QUATORZE routes nommées par #2154.4/.5 a sa capacité, les treize
 * dimensions ENSEMBLE, chacune `verified` (fichier lu) ou `gap` (raison concrète).
 */
describe('#2958.72-.84 — une capacité par route nommée par #2154.4/.5', () => {
  const NAMED_BY_2154 = [
    'contacts',
    'decouvrir',
    'veille',
    'favoris',
    'partenaires',
    'memoire_collective',
    'besoins',
    'appels_offres',
    'positionnements',
    'reactivation',
    'chaines',
    'ecritures',
    'missions_anciennes_sous_pages',
    'pilotage_anciennes_pages',
  ]

  it('chaque route nommée a au moins une capacité qui la lit dans le registre', () => {
    const covered = new Set(NONREGRESSION_CAPACITIES.map(capacity => capacity.routeMigrationKey))
    expect(NAMED_BY_2154.filter(key => !covered.has(key as never))).toEqual([])
  })

  it('les clés de capacité sont uniques et chaque capacité respecte le contrat à treize dimensions', () => {
    expect(new Set(NONREGRESSION_CAPACITIES.map(capacity => capacity.key)).size).toBe(NONREGRESSION_CAPACITIES.length)
    for (const capacity of NONREGRESSION_CAPACITIES) {
      expect(nonRegressionCapacitySchema.safeParse(capacity).success, capacity.key).toBe(true)
      expect(
        capacity.checks.map(check => check.dimension),
        capacity.key,
      ).toEqual([...NONREGRESSION_DIMENSIONS])
    }
  })

  it('chaque `verified` cite un fichier qui EXISTE, chaque `gap` une raison concrète sans fichier', () => {
    for (const capacity of NONREGRESSION_CAPACITIES) {
      for (const check of capacity.checks) {
        if (check.status === 'verified') {
          expect(existsSync(join(REPO_ROOT, check.file as string)), `${capacity.key}/${check.dimension}`).toBe(true)
        } else {
          expect(check.file, `${capacity.key}/${check.dimension}`).toBeNull()
          expect(check.evidence.length, `${capacity.key}/${check.dimension}`).toBeGreaterThan(20)
        }
      }
    }
  })

  it('aucune capacité n’est toute verte — un registre sans gap mentirait', () => {
    for (const capacity of NONREGRESSION_CAPACITIES) {
      const { verified, total } = nonRegressionCoverage(capacity.key)
      expect(verified, capacity.key).toBeLessThan(total)
      expect(verified, capacity.key).toBeGreaterThan(0)
    }
  })

  it('une preuve `verified` est LUE dans le fichier cité : l’erreur lit `isError`, le coût lit la garde `CREDIT_WORD`, le vide dit son état', () => {
    const markers: Record<string, RegExp> = {
      erreur: /isError|role="alert"/,
      // #4468 — crédits implicites (Louis 22/10) : la preuve « coût » cite la garde qui REFUSE l'affichage.
      cout: /CREDIT_WORD/,
      etat_vide: /EmptyState|emptyTitle|emptyState|empty/i,
      mobile: /useIsMobile/,
    }
    const wrong: string[] = []
    for (const capacity of NONREGRESSION_CAPACITIES) {
      for (const check of capacity.checks) {
        const marker = markers[check.dimension]
        if (check.status !== 'verified' || !marker) continue
        const source = readFileSync(join(REPO_ROOT, check.file as string), 'utf8')
        if (!marker.test(source)) wrong.push(`${capacity.key}/${check.dimension}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('une preuve `deep_link` verified désigne un fichier de route à `$id`, et `route_accessible` un fichier de route', () => {
    for (const capacity of NONREGRESSION_CAPACITIES) {
      const deepLink = capacity.checks.find(check => check.dimension === 'deep_link')
      if (deepLink?.status === 'verified') expect(deepLink.file, capacity.key).toMatch(/\$id\.tsx$/)
      const route = capacity.checks.find(check => check.dimension === 'route_accessible')
      expect(route?.status, capacity.key).toBe('verified')
      expect(route?.file, capacity.key).toMatch(/^apps\/web\/src\/routes\//)
    }
  })
})
