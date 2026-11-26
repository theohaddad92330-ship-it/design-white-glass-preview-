import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ROUTE_MIGRATION_KEYS,
  ROUTE_MIGRATION_REGISTRY,
  redirectedRoutes,
  removedRoutes,
  routeMigrationEntrySchema,
  routeMigrationGaps,
  routesWithDeepLink,
} from './route-migration-registry.js'

/**
 * #2154.3 — le registre de migration ne peut pas devenir une brochure.
 *
 * Même défense que GA-38 (`doctrine-registry.test.ts`) et le registre des
 * flux (`flow-registry.test.ts`), poussée un cran plus loin : ces deux-là
 * vérifient qu'un fichier cité EXISTE ; celui-ci relit le CONTENU réel du
 * fichier de redirection et le compare au champ déclaré. Une entrée qui dit
 * `redirected` vers `/mes-cibles` alors que le code redirige ailleurs doit
 * faire échouer la CI, pas seulement une relecture humaine.
 */
const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

/** #4359 — la table qui remplace les fichiers de route de redirection (`apps/web/src/lib/legacy-addresses.ts`). */
const LEGACY_TABLE = 'apps/web/src/lib/legacy-addresses.ts'
const legacyTableSource = () => readFileSync(join(REPO_ROOT, LEGACY_TABLE), 'utf8')
const isTableEntry = (entry: { holderFile: string | null }) => entry.holderFile === LEGACY_TABLE
/** Une ligne de la table : `'/watchlist': '/mes-cibles',`. */
const tableLine = (entry: { currentRoute: string; newDestination: string | null }) =>
  `'${entry.currentRoute}': '${entry.newDestination}'`
/** Le fichier de route que l'adresse avait avant #4359 (`x.tsx` ou `x/index.tsx`) : aucun ne doit exister. */
const routeFilesOf = (currentRoute: string) => [
  `apps/web/src/routes${currentRoute}.tsx`,
  `apps/web/src/routes${currentRoute}/index.tsx`,
]

/** Vrai quand un `search: { … }` littéral porte au moins une valeur qui n'est pas une chaîne fixe. */
function buildsSearchFromInput(source: string): boolean {
  const literals = source.match(/search:\s*\{[^}]*\}/g) ?? []
  return literals.some(literal => {
    const body = literal.replace(/^search:\s*\{/, '').replace(/\}$/, '')
    return body
      .split(',')
      .map(pair => pair.trim())
      .filter(Boolean)
      .some(pair => !/^[A-Za-z_]+:\s*'[^']*'$/.test(pair))
  })
}

describe('registre de migration de routes — complétude', () => {
  it('décrit les VINGT-ET-UNE routes nommées par #2154.4/.5 + #2208.10-.31, sans doublon', () => {
    expect(ROUTE_MIGRATION_REGISTRY).toHaveLength(ROUTE_MIGRATION_KEYS.length)
    expect(new Set(ROUTE_MIGRATION_REGISTRY.map(entry => entry.key)).size).toBe(ROUTE_MIGRATION_KEYS.length)
  })

  it('chaque entrée respecte le contrat', () => {
    for (const entry of ROUTE_MIGRATION_REGISTRY) {
      expect(routeMigrationEntrySchema.safeParse(entry).success).toBe(true)
    }
  })

  it('aucune entrée n’a de date de suppression — on archive, on ne supprime pas', () => {
    expect(ROUTE_MIGRATION_REGISTRY.every(entry => entry.deletionDate === null)).toBe(true)
  })

  it('toute entrée non `redirected` NOMME son écart, jamais une case vide', () => {
    const unexplained = ROUTE_MIGRATION_REGISTRY.filter(
      entry => entry.targetStatus !== 'redirected' && !entry.gap.trim(),
    )
    expect(unexplained.map(entry => entry.key)).toEqual([])
  })

  it('reconnaît que les routes ne sont PAS toutes prouvées migrées — un registre tout vert serait faux ici', () => {
    // Sept routes ont une redirection vérifiée dans le code (Veille, Favoris,
    // Mémoire collective, Besoins, Réactivation, Écritures, Intégrations —
    // #2958, 28/09 ; Positionnements n'en fait plus partie depuis #4197) ; les quatorze autres n'ont soit jamais
    // changé de route, soit ne sont pas vérifiables dans ce clone superficiel.
    // Un registre qui déclarerait les vingt-et-une `redirected` mentirait.
    // #4197 (L6) — Positionnements a quitté `redirected` (il rend de nouveau son écran) : 7 et 14.
    // #2958 (16/10) — Chaînes devient la HUITIÈME redirection : `/actions/chaines` → `/pilotage/pipe#parcours`.
    // #4341 / #4349 / #4357 (Louis 19/10/2026) — Appels d'offres, Positionnements et Automatisations
    // redirigent : 11 et 10. #4359 (Louis 20/10/2026) — cinq anciennes adresses perdent leur fichier de
    // route ET leur ligne de table (`removed` : Favoris, Appels d'offres, Positionnements, Chaînes,
    // Écritures) : 6 redirigées (cinq par la table, une par son fichier) et 5 retirées. Toujours PAS
    // tout vert : la garde dit NON aux deux.
    // c130 (Louis 22/10/2026) : Automatisations rend un vrai écran, elle quitte `redirected` : 5 et 16.
    expect(redirectedRoutes()).toHaveLength(5)
    expect(removedRoutes()).toHaveLength(5)
    expect(routeMigrationGaps().length).toBe(16)
    expect(routeMigrationGaps().length).toBeGreaterThan(0)
  })
})

describe('registre de migration de routes — les redirections déclarées sont VRAIES', () => {
  it('chaque route `redirected` porte un fichier lisible depuis la racine du dépôt', () => {
    const redirected = redirectedRoutes()
    expect(redirected.length).toBeGreaterThan(0)
    const missing = redirected.filter(entry => !entry.holderFile || !existsSync(join(REPO_ROOT, entry.holderFile)))
    expect(missing.map(entry => entry.key)).toEqual([])
  })

  it('la garde sait dire NON — un fichier inventé serait vu', () => {
    expect(existsSync(join(REPO_ROOT, LEGACY_TABLE))).toBe(true)
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/lib/fichier-qui-nexiste-pas.ts'))).toBe(false)
  })

  it('chaque route `redirected` redirige VRAIMENT vers la destination déclarée', () => {
    const wrong: string[] = []
    for (const entry of redirectedRoutes()) {
      const source = readFileSync(join(REPO_ROOT, entry.holderFile as string), 'utf8')
      if (isTableEntry(entry)) {
        // #4359 — la redirection est UNE ligne de la table, pas un `throw redirect(` de fichier de route.
        if (!source.includes(tableLine(entry))) wrong.push(entry.key)
        continue
      }
      const hasRedirectCall = /throw redirect\(/.test(source)
      const targetsDestination = source.includes(`to: '${entry.newDestination}'`)
      if (!hasRedirectCall || !targetsDestination) wrong.push(entry.key)
    }
    expect(wrong).toEqual([])
  })

  it('une route dont `preservedParams` est vide ne transmet AUCUN `search` littéral construit à la main', () => {
    // Une entrée qui dirait « rien n'est conservé » alors que le code
    // construit un `search: { … }` mentirait dans l'autre sens — exactement
    // le défaut relevé sur le registre des flux le 26/08.
    const lying = redirectedRoutes()
      .filter(entry => entry.preservedParams.length === 0 && !isTableEntry(entry))
      .filter(entry => {
        const source = readFileSync(join(REPO_ROOT, entry.holderFile as string), 'utf8')
        return buildsSearchFromInput(source)
      })
    expect(lying.map(entry => entry.key)).toEqual([])
  })

  // #4341 — `/rfp` pose `search: { lens: 'rfp' }` : une valeur LITTÉRALE choisit la vue d'arrivée,
  // elle ne transmet rien de l'ancien lien. La garde vise ce qui est RECOPIÉ, pas ce qui est fixé.
  it('la garde distingue une vue d’arrivée fixée d’un `search` recopié — elle sait dire NON', () => {
    expect(buildsSearchFromInput("throw redirect({ to: '/projects', search: { lens: 'rfp' }, replace: true })")).toBe(
      false,
    )
    expect(buildsSearchFromInput("throw redirect({ to: '/projects', search: { lens: search.lens } })")).toBe(true)
    expect(buildsSearchFromInput("throw redirect({ to: '/projects', search: { ...search } })")).toBe(true)
  })

  it('#4359 — Positionnements et Réactivation : plus de fichier de route ; la table mène Réactivation au Vivier', () => {
    const positionnements = ROUTE_MIGRATION_REGISTRY.find(entry => entry.key === 'positionnements')
    // #3962 — réactivation ne transmet plus `view` : la vue est retirée, l'URL est réécrite vers la vue par défaut.
    const reactivation = ROUTE_MIGRATION_REGISTRY.find(entry => entry.key === 'reactivation')
    expect(positionnements?.targetStatus).toBe('removed')
    expect(reactivation?.targetStatus).toBe('redirected')
    expect(reactivation?.preservedParams).toEqual([])
    for (const file of [...routeFilesOf('/consultants/submissions'), ...routeFilesOf('/consultants/pool')]) {
      expect(existsSync(join(REPO_ROOT, file)), file).toBe(false)
    }
    expect(legacyTableSource()).toContain(tableLine(reactivation as { currentRoute: string; newDestination: string }))
    expect(legacyTableSource()).not.toContain("'/consultants/submissions'")
    // Le Vivier garde sa redirection conditionnelle `?view=submissions`, vers la section.
    const indexSource = readFileSync(join(REPO_ROOT, 'apps/web/src/routes/consultants/index.tsx'), 'utf8')
    expect(indexSource).not.toContain("to: '/consultants/submissions'")
  })

  it('veille, mémoire collective et besoins (X41, #2958) transmettent `search` ET ancre — la table les réécrit sans les toucher', () => {
    const table = legacyTableSource()
    for (const key of ['veille', 'memoire_collective', 'besoins']) {
      const entry = ROUTE_MIGRATION_REGISTRY.find(candidate => candidate.key === key)
      expect(entry?.preservedParams, key).toEqual(['*'])
      expect(table, key).toContain(tableLine(entry as { currentRoute: string; newDestination: string }))
    }
    // `rewriteLegacyAddress` ne remplace que `pathname` : `search` et `hash` voyagent dans l'URL copiée.
    expect(table).toContain('next.pathname = target')
    expect(table).not.toMatch(/next\.(search|hash)\s*=/)
  })

  it('favoris et écritures (#4359) : plus de fichier de route, plus de ligne de table — « introuvable »', () => {
    for (const key of ['favoris', 'ecritures']) {
      const entry = ROUTE_MIGRATION_REGISTRY.find(candidate => candidate.key === key)
      expect(entry?.targetStatus, key).toBe('removed')
      expect(entry?.holderFile, key).toBeNull()
      expect(legacyTableSource(), key).not.toContain(`'${entry?.currentRoute}'`)
      for (const file of routeFilesOf(entry?.currentRoute as string)) {
        expect(existsSync(join(REPO_ROOT, file)), file).toBe(false)
      }
    }
  })

  it('intégrations (#2208.30) : la table réécrit `/settings/integrations` → `/integrations` en gardant le `search` COMPLET — retours OAuth en vol', () => {
    const integrations = ROUTE_MIGRATION_REGISTRY.find(entry => entry.key === 'integrations')
    expect(integrations?.preservedParams).toEqual(['*'])
    expect(legacyTableSource()).toContain(tableLine(integrations as { currentRoute: string; newDestination: string }))
  })
})

describe('registre de migration de routes — les routes NON migrées ne redirigent pas non plus', () => {
  it('les routes `never_renamed` / `unverifiable_shallow_clone` sans `holderFile` ne sont pas des redirections cachées', () => {
    const canonicalRouteFiles: Record<string, string> = {
      contacts: 'apps/web/src/routes/contacts/index.tsx',
      decouvrir: 'apps/web/src/routes/discover/index.tsx',
      // Théo D (22/10/2026) : `/pilotage/pipe` redirige vers `/pilotage#pipe` ; Parcours se rend dans la page.
      chaines: 'apps/web/src/routes/pilotage/index.tsx',
      missions_anciennes_sous_pages: 'apps/web/src/routes/missions/index.tsx',
      pilotage_anciennes_pages: 'apps/web/src/routes/pilotage/index.tsx',
      projets: 'apps/web/src/routes/projects/index.tsx',
      vivier: 'apps/web/src/routes/consultants/index.tsx',
      actions: 'apps/web/src/routes/actions/index.tsx',
      sequences: 'apps/web/src/routes/actions/sequences.tsx',
      parametres: 'apps/web/src/routes/settings/index.tsx',
    }
    // #4197 (L6) — `/projects` et `/consultants` portent une redirection CONDITIONNELLE
    // (`?lens=portfolio`, `?view=submissions`) dans un `beforeLoad` ET rendent leur écran :
    // ce n'est pas une redirection cachée. Une route « cachée » est celle qui redirige et
    // ne rend plus rien — pas de `component`.
    const stillRedirecting = Object.entries(canonicalRouteFiles).filter(([, path]) => {
      const source = readFileSync(join(REPO_ROOT, path), 'utf8')
      return /throw redirect\(/.test(source) && !/component\s*:/.test(source)
    })
    expect(stillRedirecting).toEqual([])
  })

  it('`partenaires` reste sans `holderFile` — /accounts/partners n’est pas une redirection', () => {
    const source = readFileSync(join(REPO_ROOT, 'apps/web/src/routes/accounts/partners.tsx'), 'utf8')
    expect(/throw redirect\(/.test(source)).toBe(false)
  })
})

describe('#2958.5 — deepLinkTarget (deep link vers un sous-objet, distinct de `anchor`)', () => {
  it('chaque `deepLinkTarget` non nul pointe vers un fichier de route à segment d’identifiant qui EXISTE', () => {
    const withDeepLink = routesWithDeepLink()
    expect(withDeepLink.length).toBeGreaterThan(0)
    for (const entry of withDeepLink) {
      // '/contacts/$id' -> apps/web/src/routes/contacts/$id.tsx
      const relativePath = `apps/web/src/routes${entry.deepLinkTarget}.tsx`.replace('/$id', '/$id')
      expect(existsSync(join(REPO_ROOT, relativePath))).toBe(true)
    }
  })

  it('#4359 — chaînes (Parcours) : `/actions/chaines` n’a plus de route, Parcours se lit sur `/pilotage/pipe#parcours`', () => {
    const chaines = ROUTE_MIGRATION_REGISTRY.find(candidate => candidate.key === 'chaines')
    expect(chaines?.targetStatus).toBe('removed')
    expect(chaines?.currentRoute).toBe('/actions/chaines')
    expect(chaines?.newDestination).toBe('/pilotage/pipe')
    expect(chaines?.anchor).toBe('parcours')
    for (const file of [...routeFilesOf('/actions/chaines'), ...routeFilesOf('/pilotage/parcours')]) {
      expect(existsSync(join(REPO_ROOT, file)), file).toBe(false)
    }
  })

  // #4357 (Louis 19/10/2026) faisait rediriger `/actions/automatisations` ; c130 (Louis 22/10/2026) le renverse :
  // Actions a trois onglets et « Tes automatisations » est un VRAI écran — route active, pas une redirection.
  it('c130 — Automatisations est une route active (plus une redirection), l’ancien `/settings/routines` reste atteignable', () => {
    const entry = ROUTE_MIGRATION_REGISTRY.find(candidate => candidate.key === 'automatisations')
    expect(entry?.currentRoute).toBe('/actions/automatisations')
    expect(entry?.targetStatus).toBe('never_renamed')
    expect(entry?.newDestination).toBe('/actions/automatisations')
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/routes/actions/automatisations.tsx'))).toBe(true)
    expect(existsSync(join(REPO_ROOT, 'apps/web/src/routes/settings/routines.tsx'))).toBe(true)
    expect(entry?.gap).toContain('/settings/routines')
  })

  it('`anchor` et `deepLinkTarget` restent deux notions : un id de page, jamais un chemin `$id` (#2958.5 pose les deux)', () => {
    // Depuis #2958.5 (17/10) chaque route a une ancre ET certaines ont un deep link sous-objet :
    // le garde-fou n'est plus « jamais les deux », mais « jamais l'un déguisé en l'autre ».
    for (const entry of ROUTE_MIGRATION_REGISTRY) {
      if (entry.anchor !== null) expect(entry.anchor, entry.key).toMatch(/^[a-z][a-z-]*$/)
      if (entry.deepLinkTarget !== null) expect(entry.deepLinkTarget, entry.key).toMatch(/^\/.+\/\$id$/)
    }
  })

  it('les seize routes sans deep link prouvé restent `null`, jamais une supposition', () => {
    const withoutDeepLink = ROUTE_MIGRATION_REGISTRY.filter(entry => entry.deepLinkTarget === null)
    expect(withoutDeepLink).toHaveLength(ROUTE_MIGRATION_REGISTRY.length - routesWithDeepLink().length)
  })
})

// #2958.5 — l'ancre (deep link intra-page) de CHAQUE route, prouvée en ouvrant la cible.
describe('#2958.5 — anchor : chaque route pose une ancre que sa page destination porte VRAIMENT', () => {
  // Le fichier qui rend la destination et pose `anchorId="…"` (ou `id="…"` pour Pilotage).
  const ANCHOR_HOLDERS: Record<string, string> = {
    contacts: 'apps/web/src/features/contacts/view/ContactsPage.tsx',
    decouvrir: 'apps/web/src/routes/discover/index.tsx',
    veille: 'apps/web/src/features/signals-library/view/SignalsLibraryPage.tsx',
    favoris: 'apps/web/src/features/accounts/view/AccountsPage.tsx',
    partenaires: 'apps/web/src/routes/accounts/partners.tsx',
    memoire_collective: 'apps/web/src/routes/settings/knowledge.tsx',
    besoins: 'apps/web/src/features/projects/view/ProjectsPage.tsx',
    appels_offres: 'apps/web/src/features/rfp/view/RfpWorkspace.tsx', // #4341 — monté par le pipe
    positionnements: 'apps/web/src/features/submissions/view/PresentationsPage.tsx', // #4528 — Affaires › Présentations
    reactivation: 'apps/web/src/features/consultants/view/ConsultantsPage.tsx',
    chaines: 'apps/web/src/features/chains/view/ChainsPage.tsx',
    ecritures: 'apps/web/src/routes/actions/index.tsx',
    missions_anciennes_sous_pages: 'apps/web/src/features/missions/view/MissionsPage.tsx',
    // Louis 23/10 — le Cockpit de Théo : la file de décisions (et son ancre) vit dans `cockpit/CockpitDecisions.tsx`.
    pilotage_anciennes_pages: 'apps/web/src/features/pilotage/view/cockpit/CockpitDecisions.tsx',
    projets: 'apps/web/src/features/projects/view/ProjectsPage.tsx',
    vivier: 'apps/web/src/features/consultants/view/ConsultantsPage.tsx',
    actions: 'apps/web/src/routes/actions/index.tsx',
    sequences: 'apps/web/src/features/outreach/view/SequencesPage.tsx',
    automatisations: 'apps/web/src/features/automations/view/SignalSequencesSection.tsx', // #4357 — section de Séquences
    integrations: 'apps/web/src/routes/integrations/index.tsx',
    parametres: 'apps/web/src/routes/settings/index.tsx',
  }

  it('aucune des vingt-et-une routes n’a une ancre nulle', () => {
    expect(ROUTE_MIGRATION_REGISTRY.filter(entry => entry.anchor === null).map(entry => entry.key)).toEqual([])
  })

  it('chaque ancre est un id posé dans le fichier de la page destination (`anchorId="…"` ou `id="…"`)', () => {
    const missing: string[] = []
    for (const entry of ROUTE_MIGRATION_REGISTRY) {
      const holder = ANCHOR_HOLDERS[entry.key]
      expect(holder, entry.key).toBeDefined()
      const source = readFileSync(join(REPO_ROOT, holder as string), 'utf8')
      const declared = source.includes(`anchorId="${entry.anchor}"`) || source.includes(`id="${entry.anchor}"`)
      if (!declared) missing.push(`${entry.key}→${entry.anchor}`)
    }
    expect(missing).toEqual([])
  })

  it('la garde sait dire NON — une ancre inventée n’est dans aucune page', () => {
    const source = readFileSync(join(REPO_ROOT, ANCHOR_HOLDERS.contacts as string), 'utf8')
    expect(source.includes('anchorId="ancre-qui-nexiste-pas"')).toBe(false)
  })

  it('une ancre ne se confond pas avec un deep link sous-objet (`/…/$id`)', () => {
    expect(
      ROUTE_MIGRATION_REGISTRY.filter(entry => entry.anchor?.includes('/') || entry.anchor?.startsWith('#')),
    ).toEqual([])
  })
})
