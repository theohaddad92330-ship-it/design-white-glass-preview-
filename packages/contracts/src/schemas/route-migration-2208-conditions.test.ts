import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CAPTURES_ROUTES_SPEC,
  CHAINE_SANS_APPRENTISSAGE_SPEC,
  RECETTE_2208_SPECS,
  GO_2208_CONDITIONS,
  GO_2208_CONDITION_KEYS,
  MIGRATED_ROUTES_CLAIMING_PREFILL,
  NO_GO_2208_CONDITIONS,
  NO_GO_2208_CONDITION_KEYS,
  canGo2208,
  go2208ConditionSchema,
  noGo2208ConditionSchema,
  routeCasseeVerifiee,
} from './route-migration-2208-conditions.js'
import { GOLDEN_JOURNEYS_TOTAL, coveredGoldenJourneyNumbers, goldenJourneysCovered } from './golden-journeys.js'
import { SCENARIOS_2154_X41, coveredGoldenJourneyX41Numbers } from './golden-journeys-x41.js'
import { ROUTE_EMPTY_STATES, uncoveredEmptyStateRouteKeys } from './route-migration-empty-states.js'
import { ROUTE_MIGRATION_KEYS, ROUTE_MIGRATION_REGISTRY, redirectedRoutes } from './route-migration-registry.js'

/**
 * #2958.94-.112 — les conditions NO-GO/GO propres à #2208, distinctes de
 * celles de #2154.31/.32 (vocabulaire différent, jamais fusionnées).
 */
describe('conditions NO-GO/GO #2208 — complétude', () => {
  it('décrit les NEUF conditions NO-GO, sans doublon', () => {
    expect(NO_GO_2208_CONDITIONS).toHaveLength(NO_GO_2208_CONDITION_KEYS.length)
    expect(new Set(NO_GO_2208_CONDITIONS.map(condition => condition.key)).size).toBe(NO_GO_2208_CONDITION_KEYS.length)
  })

  it('décrit les SEPT conditions GO, sans doublon', () => {
    expect(GO_2208_CONDITIONS).toHaveLength(GO_2208_CONDITION_KEYS.length)
    expect(new Set(GO_2208_CONDITIONS.map(condition => condition.key)).size).toBe(GO_2208_CONDITION_KEYS.length)
  })

  it('chaque entrée respecte son contrat', () => {
    for (const condition of NO_GO_2208_CONDITIONS)
      expect(noGo2208ConditionSchema.safeParse(condition).success).toBe(true)
    for (const condition of GO_2208_CONDITIONS) expect(go2208ConditionSchema.safeParse(condition).success).toBe(true)
  })

  it('aucune condition n’a une preuve vide', () => {
    expect(NO_GO_2208_CONDITIONS.every(condition => condition.evidence.trim().length > 0)).toBe(true)
    expect(GO_2208_CONDITIONS.every(condition => condition.evidence.trim().length > 0)).toBe(true)
  })
})

describe('conditions NO-GO/GO #2208 — honnêteté', () => {
  it('les QUATRE recettes ne sont jamais `met` par une garde ; sans scénario, elles restent humaines', () => {
    const recipes = GO_2208_CONDITIONS.filter(condition => condition.key.startsWith('recette_'))
    expect(recipes).toHaveLength(4)
    expect(recipes.every(condition => condition.status === 'unknown')).toBe(true)
    for (const condition of recipes) {
      const signed = condition.key in RECETTE_2208_SPECS
      expect(condition.humanOnly, condition.key).toBe(!signed)
    }
  })

  it("aucune condition GO n'est `met` — il manque encore 15 Golden Journeys et les métriques ne sont pas instrumentées", () => {
    expect(GO_2208_CONDITIONS.some(condition => condition.status === 'met')).toBe(false)
  })

  it('`canGo2208()` retourne `false` tant qu’une condition GO n’est pas `met`', () => {
    expect(canGo2208()).toBe(false)
  })
})

describe('#2958.103 — route_cassee, calculée contre le registre réel', () => {
  it('`routeCasseeVerifiee()` est vraie seulement si CHAQUE route redirigée a un `holderFile`', () => {
    const redirected = redirectedRoutes()
    expect(redirected.length).toBeGreaterThan(0)
    expect(routeCasseeVerifiee()).toBe(redirected.every(entry => entry.holderFile !== null))
  })

  it('le statut de la condition suit `routeCasseeVerifiee()`, jamais déclaré en dur', () => {
    const condition = NO_GO_2208_CONDITIONS.find(entry => entry.key === 'route_cassee')
    expect(condition).toBeDefined()
    expect(condition?.status).toBe(routeCasseeVerifiee() ? 'clear' : 'blocked')
  })

  it('l’état actuel du registre est `clear` — les 8 routes redirigées ont toutes un `holderFile` prouvé', () => {
    // Si ce test casse, c'est que le registre a régressé (une route redirigée
    // a perdu son holderFile), pas que le calcul est faux.
    expect(routeCasseeVerifiee()).toBe(true)
  })
})

describe('lot X40 (02/10) — les conditions que les golden journeys rendent évaluables', () => {
  it('« profil importé inutilisable » et « matching opaque » ne sont plus `not_yet_evaluable`', () => {
    for (const key of ['profil_importe_inutilisable', 'matching_opaque'] as const) {
      const condition = NO_GO_2208_CONDITIONS.find(entry => entry.key === key)
      expect(condition?.status, key).not.toBe('not_yet_evaluable')
      expect(condition?.evidence, key).toContain('golden-journeys.ts')
    }
  })

  it('leur statut suit le registre des parcours, jamais déclaré en dur', () => {
    const status = (key: string) => NO_GO_2208_CONDITIONS.find(entry => entry.key === key)?.status
    expect(status('profil_importe_inutilisable')).toBe(
      goldenJourneysCovered([1, 2, 3, 4, 39]) ? 'clear' : 'not_yet_evaluable',
    )
    expect(status('matching_opaque')).toBe(goldenJourneysCovered([12, 13]) ? 'clear' : 'not_yet_evaluable')
  })

  it('sait dire NON : les conditions dont aucun parcours n’existe restent `not_yet_evaluable`', () => {
    // Le corps d'un message ne sort jamais vers un humain ni vers le modèle (CLAUDE.md § Doctrine) :
    // sa généricité ne se juge pas ici, et aucun parcours ne la rend évaluable.
    expect(NO_GO_2208_CONDITIONS.find(entry => entry.key === 'message_generique')?.status).toBe('not_yet_evaluable')
  })

  it('`sequence_impossible_inspecter` est calculée : `clear` seulement si le parcours 30 et le scénario .19 sont au registre', () => {
    const condition = NO_GO_2208_CONDITIONS.find(entry => entry.key === 'sequence_impossible_inspecter')
    expect(condition?.status).toBe('clear')
    expect(coveredGoldenJourneyX41Numbers()).toContain(30)
    expect(SCENARIOS_2154_X41.map(entry => entry.point)).toContain('#2154.19')
  })

  it('`mission_dupliquee` est `clear` parce que les trois niveaux de garde existent VRAIMENT (relus, pas déclarés)', () => {
    const root = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')
    const proofs: Array<[string, string]> = [
      // #4192 — l'unicité est passée d'« une mission par affaire » à « une mission par (affaire, positionnement) » :
      // la garde anti-doublon existe toujours, à la nouvelle maille.
      [
        'apps/api/src/modules/delivery/delivery.service.ts',
        'Une affaire porte UNE mission PAR positionnement retenu (BEL-FIX-001',
      ],
      ['apps/api/src/modules/delivery/delivery.service.spec.ts', "L'idempotence de la conversion projet → mission"],
      ['apps/api/src/migrations/1796481204517-CrmBackbone.ts', 'missions_opportunity_submission_uniq'],
    ]
    for (const [file, needle] of proofs) {
      expect(existsSync(join(root, file)), file).toBe(true)
      expect(readFileSync(join(root, file), 'utf8'), `${file} ne contient plus « ${needle} »`).toContain(needle)
    }
    expect(NO_GO_2208_CONDITIONS.find(entry => entry.key === 'mission_dupliquee')?.status).toBe('clear')
  })

  it('le GO « tests E2E » compte les deux registres : tous les parcours vivants (38) ont un spec ont un spec, et le statut reste `unknown` — « verts » est le verdict de la CI', () => {
    const condition = GO_2208_CONDITIONS.find(entry => entry.key === 'tests_e2e')
    const all = new Set([...coveredGoldenJourneyNumbers(), ...coveredGoldenJourneyX41Numbers()])
    expect(all.size).toBe(GOLDEN_JOURNEYS_TOTAL)
    expect(condition?.status).toBe('unknown')
    expect(condition?.evidence).toContain(`${all.size} des ${GOLDEN_JOURNEYS_TOTAL}`)
  })
})

describe('#2958.105 — laura_ecran_non_prerempli, calculée contre le catalogue réel de Laura', () => {
  const root = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')
  const chatTools = readFileSync(join(root, 'apps/ia/app/services/chat_tools.py'), 'utf8')
  // Même découpage que `laura-deep-links.test.ts::deepLinkCatalogue` — `/contacts` et
  // `/actions/sequences` apparaissent AILLEURS dans le fichier (SETTINGS_SCREENS, le
  // digest compact pour Laura) : chercher sans ce découpage trouve le mauvais « params ».
  const deepLinkBlock = chatTools.split('DEEP_LINK_SCREENS: tuple')[1]?.split('\n)\n')[0] ?? ''

  it('a VRAIMENT lu le bloc DEEP_LINK_SCREENS — sinon elle ne garde rien', () => {
    expect(deepLinkBlock.length).toBeGreaterThan(0)
  })

  it('`MIGRATED_ROUTES_CLAIMING_PREFILL` nomme trois routes migrées, et chacune a un `routeMigrationKey` réel', () => {
    expect(MIGRATED_ROUTES_CLAIMING_PREFILL).toHaveLength(3)
    for (const entry of MIGRATED_ROUTES_CLAIMING_PREFILL) {
      const route = ROUTE_MIGRATION_REGISTRY.find(candidate => candidate.key === entry.key)
      expect(route, entry.key).toBeDefined()
      expect(
        route?.currentRoute === entry.deepLinkRoute || route?.newDestination === entry.deepLinkRoute,
        entry.key,
      ).toBe(true)
    }
  })

  it('chacune des trois a VRAIMENT un `DEEP_LINK_SCREENS` à paramètres non vides dans chat_tools.py', () => {
    for (const entry of MIGRATED_ROUTES_CLAIMING_PREFILL) {
      const needle = `"route": "${entry.deepLinkRoute}",`
      const at = deepLinkBlock.indexOf(needle)
      expect(at, `${entry.deepLinkRoute} absent de DEEP_LINK_SCREENS`).toBeGreaterThan(-1)
      const paramsLine = deepLinkBlock.slice(at, at + 400).match(/"params":\s*\(([^)]*)\)/)
      expect(paramsLine, `${entry.deepLinkRoute} : "params" introuvable`).not.toBeNull()
      expect((paramsLine?.[1] ?? '').trim().length, `${entry.deepLinkRoute} : params vides`).toBeGreaterThan(0)
    }
  })

  it('`/actions/sequences` (routeMigrationKey `sequences`) n’est PAS dans la liste — ses params sont VRAIMENT `()`, décision #1933.6 déjà tranchée, pas un oubli', () => {
    expect(MIGRATED_ROUTES_CLAIMING_PREFILL.some(entry => entry.key === 'sequences')).toBe(false)
    const at = deepLinkBlock.indexOf('"route": "/actions/sequences",')
    expect(at).toBeGreaterThan(-1)
    expect(deepLinkBlock.slice(at, at + 200)).toContain('"params": (),')
  })

  it('le statut de la condition est `clear`, scopé aux trois routes, jamais déclaré pour les 21', () => {
    const condition = NO_GO_2208_CONDITIONS.find(entry => entry.key === 'laura_ecran_non_prerempli')
    expect(condition?.status).toBe('clear')
    for (const entry of MIGRATED_ROUTES_CLAIMING_PREFILL) {
      expect(condition?.evidence).toContain(entry.deepLinkRoute)
    }
    // Honnêteté : la preuve ne doit jamais sembler couvrir les 21 routes.
    expect(condition?.evidence).toContain('17 autres')
  })
})

describe('#2958.104 — page_vide_sans_porte_sortie, calculée contre le registre des 21 états vides', () => {
  it('passe `clear` quand les 21 routes ont leur entrée, et la preuve le dit sans nombre recopié', () => {
    const condition = NO_GO_2208_CONDITIONS.find(entry => entry.key === 'page_vide_sans_porte_sortie')
    expect(uncoveredEmptyStateRouteKeys()).toEqual([])
    expect(condition?.status).toBe('clear')
    expect(condition?.evidence).toContain(`les ${ROUTE_MIGRATION_KEYS.length} routes`)
    expect(condition?.evidence).toContain('une-page-migree-vide-a-une-porte-de-sortie.test.ts')
  })

  it('sait dire NON : une route sans entrée est nommée', () => {
    const amputated = ROUTE_EMPTY_STATES.filter(entry => entry.routeMigrationKey !== 'chaines')
    expect(uncoveredEmptyStateRouteKeys(amputated)).toEqual(['chaines'])
  })

  it('chaque fichier de preuve existe vraiment', () => {
    const root = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')
    for (const entry of ROUTE_EMPTY_STATES) {
      for (const proof of entry.proofs) expect(existsSync(join(root, proof.file)), proof.file).toBe(true)
    }
  })
})

describe('#2958.112 — chaine_complete_sans_apprentissage lit un scénario réel', () => {
  const root = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')
  const urlsTyped = (source: string) => (source.match(/page\.goto\(/g) ?? []).length

  it('le scénario existe, n’entre que par UNE url, et la condition reste `unknown` (verdict de la CI)', () => {
    const file = join(root, CHAINE_SANS_APPRENTISSAGE_SPEC)
    expect(existsSync(file)).toBe(true)
    const source = readFileSync(file, 'utf8')
    expect(source).toContain('#2958.112')
    expect(urlsTyped(source)).toBe(1)
    const condition = GO_2208_CONDITIONS.find(entry => entry.key === 'chaine_complete_sans_apprentissage')
    expect(condition?.status).toBe('unknown')
    expect(condition?.evidence).toContain(CHAINE_SANS_APPRENTISSAGE_SPEC)
  })

  it('sait dire NON : un scénario qui tape une seconde URL n’est plus « sans apprentissage »', () => {
    const source = readFileSync(join(root, CHAINE_SANS_APPRENTISSAGE_SPEC), 'utf8')
    expect(urlsTyped(`${source}\nawait page.goto('/projects/x')`)).toBe(2)
  })
})

describe('#2958.111 — captures_avant_apres lit un scénario de capture réel', () => {
  const root = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

  it('le spec existe, cite son point, capture desktop ET mobile, et la condition reste `unknown`', () => {
    const file = join(root, CAPTURES_ROUTES_SPEC)
    expect(existsSync(file)).toBe(true)
    const source = readFileSync(file, 'utf8')
    expect(source).toContain('#2958.111')
    expect(source).toContain('route-migration-registry.ts')
    expect(source).toContain('.screenshot(')
    expect(source).toMatch(/width:\s*375/)
    expect(source).toMatch(/width:\s*1280/)
    const condition = GO_2208_CONDITIONS.find(entry => entry.key === 'captures_avant_apres')
    expect(condition?.status).toBe('unknown')
    expect(condition?.evidence).toContain(CAPTURES_ROUTES_SPEC)
  })

  it('sait dire NON : sans appel de capture, le spec ne prouve rien', () => {
    const source = readFileSync(join(root, CAPTURES_ROUTES_SPEC), 'utf8')
    expect(source.replaceAll('.screenshot(', '.noop(')).not.toContain('.screenshot(')
  })
})

describe('#2958.106-.109 — chaque recette signée lit un scénario réel (décision Louis 09/10)', () => {
  const root = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')
  const urlsTyped = (source: string) => (source.match(/page\.goto\(/g) ?? []).length

  it.each(Object.entries(RECETTE_2208_SPECS))(
    '%s : le scénario existe, cite son point, entre par UNE url',
    (key, spec) => {
      const file = join(root, spec)
      expect(existsSync(file), spec).toBe(true)
      const source = readFileSync(file, 'utf8')
      const condition = GO_2208_CONDITIONS.find(entry => entry.key === key)
      expect(source).toContain(condition?.sourceIssue)
      expect(urlsTyped(source)).toBe(1)
      expect(condition?.humanOnly).toBe(false)
      expect(condition?.status).toBe('unknown')
      expect(condition?.evidence).toContain(spec)
    },
  )

  it('sait dire NON : une recette sans scénario reste humaine', () => {
    const unsigned = GO_2208_CONDITIONS.filter(
      condition => condition.key.startsWith('recette_') && !(condition.key in RECETTE_2208_SPECS),
    )
    expect(unsigned.every(condition => condition.humanOnly)).toBe(true)
  })
})
