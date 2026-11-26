import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conversationThreadStateSchema } from '@bellum/contracts'

/**
 * #1927 — ce que le service IA ÉMET est exactement ce que l'API GARDE.
 *
 * L'état du fil traverse deux langages : émis en Python
 * (`apps/ia/app/services/chat_thread_state.py`), validé en zod ici avant d'être
 * écrit, relu en Python au tour suivant. Chaque côté a sa suite, et aucune des
 * deux ne voit l'autre : un champ renommé d'un seul côté serait retiré en
 * silence par zod (liste blanche) ou ignoré par Python — « envoyé, jamais lu ».
 *
 * La fixture est ÉMISE par le service IA : `test_chat_thread_state.py::
 * test_the_cross_language_fixture_is_what_the_collector_emits` échoue si le
 * collecteur ne la produit plus à l'identique. Ici, le schéma doit la garder
 * ENTIÈRE — rien de retiré, rien de refusé.
 */
const FIXTURE_PATH = join(__dirname, '..', '..', '..', '..', 'ia', 'tests', 'fixtures', 'thread_state_wire.json')

function fixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Record<string, unknown>
}

describe("l'état du fil — le contrat entre le service IA et l'API (#1927)", () => {
  it('lit un corpus non vide : chaque rubrique de la fixture porte au moins une entrée', () => {
    const state = fixture()
    for (const key of ['objects', 'focus', 'searches', 'proposals', 'questions']) {
      expect(Array.isArray(state[key]) && (state[key] as unknown[]).length > 0).toBe(true)
    }
    expect(state['last_list']).not.toBeNull()
  })

  it("garde ENTIÈRE la forme émise par le service IA — rien n'est retiré, rien n'est refusé", () => {
    const state = fixture()
    expect(conversationThreadStateSchema.parse(state)).toEqual(state)
  })

  it("retire une clé hors liste blanche — le CORPS d'un brouillon n'entre jamais dans l'état (D65)", () => {
    const state = fixture()
    const proposals = state['proposals'] as Array<Record<string, unknown>>
    const withBody = {
      ...state,
      proposals: [{ ...proposals[0], body: 'Bonjour, suite à notre échange confidentiel…', to: 'dsi@acme.fr' }],
    }
    const parsed = conversationThreadStateSchema.parse(withBody)
    expect(JSON.stringify(parsed)).not.toContain('confidentiel')
    expect(JSON.stringify(parsed)).not.toContain('dsi@acme.fr')
  })

  it('refuse un état hors bornes ou d’une nature inconnue (la garde sait dire NON)', () => {
    const state = fixture()
    const objects = state['objects'] as Array<Record<string, unknown>>
    expect(
      conversationThreadStateSchema.safeParse({ ...state, objects: [{ ...objects[0], label: 'x'.repeat(81) }] })
        .success,
    ).toBe(false)
    expect(
      conversationThreadStateSchema.safeParse({ ...state, objects: [{ ...objects[0], kind: 'licorne' }] }).success,
    ).toBe(false)
    expect(conversationThreadStateSchema.safeParse({ ...state, version: 2 }).success).toBe(false)
  })

  it("n'attrape pas un état légitime voisin : un fil sans liste ni recherche reste valide", () => {
    const minimal = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [{ question: 'Quel compte ?', options: [] }],
    }
    expect(conversationThreadStateSchema.safeParse(minimal).success).toBe(true)
  })

  it('#1927.3 / #1927.4 — un état émis par l’IA d’AVANT ces champs garde toute sa mémoire', () => {
    // Les deux services ne déploient pas ensemble. Sans défaut, l'état entier
    // serait refusé pendant la bascule et `parseThreadState` rendrait `null` :
    // le fil perdrait ses objets, ses recherches et ses actions préparées pour
    // deux champs qui n'existaient pas encore.
    const ancien = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [],
    }
    const parsed = conversationThreadStateSchema.safeParse(ancien)

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.ruled_out).toEqual([])
    expect(parsed.success && parsed.data.assumptions).toEqual([])
    // #2268.1 / #2268.5 / #2268.10 — même bascule, trois champs de plus.
    expect(parsed.success && parsed.data.goal).toEqual(null)
    expect(parsed.success && parsed.data.excluded).toEqual([])
    expect(parsed.success && parsed.data.decisions).toEqual([])
    // #2268.12 / #2268.13 / #2268.15 — même bascule, trois champs de plus.
    expect(parsed.success && parsed.data.current_job).toEqual(null)
    expect(parsed.success && parsed.data.current_step).toEqual(null)
    expect(parsed.success && parsed.data.next_step).toEqual(null)
    // #2268.7 — même bascule, un champ de plus.
    expect(parsed.success && parsed.data.accepted).toEqual([])
  })

  it('#2268.7 — un résultat explicitement RETENU, distinct de la dernière liste rendue', () => {
    const base = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [],
    }

    const parsed = conversationThreadStateSchema.safeParse({
      ...base,
      accepted: ['Latecoere retenu comme cible prioritaire'],
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.accepted).toEqual(['Latecoere retenu comme cible prioritaire'])
    // Une chaîne vide n'est pas un résultat retenu.
    expect(conversationThreadStateSchema.safeParse({ ...base, accepted: [''] }).success).toBe(false)
  })

  it('#2268.12 / #2268.13 / #2268.15 — le job en cours, son étape, le prochain geste, tels que Laura les a nommés', () => {
    const base = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [],
    }

    const parsed = conversationThreadStateSchema.safeParse({
      ...base,
      current_job: 'Préparer 3 messages pour la shortlist ACME',
      current_step: "Vérification des critères d'accès avant l'envoi",
      next_step: 'Proposer les brouillons une fois la vérification terminée',
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.current_job).toEqual('Préparer 3 messages pour la shortlist ACME')
    // Une chaîne vide n'est pas une information : le service IA l'omet plutôt
    // que de l'envoyer, et un texte vide explicite est refusé comme un champ
    // qui prétendrait avoir quelque chose à dire sans rien dire.
    expect(conversationThreadStateSchema.safeParse({ ...base, current_step: '' }).success).toBe(false)
  })

  it('#1927.3 — une piste écartée SANS raison reste valide, une piste sans objet ne l’est pas', () => {
    const base = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [],
      assumptions: ['Toulouse'],
    }

    expect(
      conversationThreadStateSchema.safeParse({ ...base, ruled_out: [{ option: 'Lille', reason: null }] }).success,
    ).toBe(true)
    // « J'ai écarté » sans dire QUOI n'est pas une information.
    expect(
      conversationThreadStateSchema.safeParse({ ...base, ruled_out: [{ option: '', reason: 'trop loin' }] }).success,
    ).toBe(false)
  })

  it('#2268.5 — un critère exclu SANS raison reste valide, un critère vide ne l’est pas', () => {
    const base = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [],
      decisions: ['Ne pas relancer avant le comité du 30/09'],
    }

    expect(
      conversationThreadStateSchema.safeParse({ ...base, excluded: [{ criterion: 'grands groupes', reason: null }] })
        .success,
    ).toBe(true)
    // « J'exclus » sans dire QUOI n'est pas une information.
    expect(
      conversationThreadStateSchema.safeParse({ ...base, excluded: [{ criterion: '', reason: 'trop gros' }] }).success,
    ).toBe(false)
  })

  it('#194.2 (reste, épopée #3233) — la correction NOMME les outils affinables dont le plan est invalide', () => {
    const base = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [],
    }

    const parsed = conversationThreadStateSchema.safeParse({
      ...base,
      correction: {
        correction_type: 'wrong_scope',
        summary: "J'ai utilisé la mauvaise couche",
        invalidates: ['find_accounts', 'search_talents'],
      },
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.correction?.invalidates).toEqual(['find_accounts', 'search_talents'])
  })

  it('#194.2 — un état émis par l’IA d’AVANT `invalidates` garde sa correction, la liste vide par défaut', () => {
    const base = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [],
    }

    const parsed = conversationThreadStateSchema.safeParse({
      ...base,
      correction: { correction_type: 'wrong_scope', summary: "J'ai utilisé la mauvaise couche" },
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.correction?.invalidates).toEqual([])
  })

  it('#194.2 — un outil hors catalogue affinable dans `invalidates` n’est pas deviné : l’état est refusé', () => {
    const base = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [],
      proposals: [],
      questions: [],
    }

    expect(
      conversationThreadStateSchema.safeParse({
        ...base,
        correction: {
          correction_type: 'wrong_scope',
          summary: "J'ai utilisé la mauvaise couche",
          invalidates: ['search_rfps'],
        },
      }).success,
    ).toBe(false)
  })
})

/**
 * #3704 (lot RAT, recette NF 10/10, prod b5c1ee1480) — « 5 entreprises finance IDF » puis « donne-moi
 * aussi des besoins » : « Classé selon » perdait Région : Île-de-France. Cause réelle : la liste blanche
 * zod ci-dessus ne connaissait NI `region` NI `city` NI `exclude_sectors` pour `run_account_search` —
 * l'API les RETIRAIT en écrivant l'état, le tour suivant relisait une recherche sans zone. Les correctifs
 * RT/RAI/RAN construisaient l'état EN MÉMOIRE côté Python, jamais à travers ce schéma.
 *
 * Garde de parité, lue sur la SOURCE Python : chaque critère affinable de `REFINABLE_SEARCH_CRITERIA`
 * doit survivre à l'écriture de l'API.
 */
const REFINABLE_SOURCE = join(__dirname, '..', '..', '..', '..', 'ia', 'app', 'services', 'chat_thread_state.py')

function refinableCriteriaFromPython(): Record<string, string[]> {
  const source = readFileSync(REFINABLE_SOURCE, 'utf-8')
  const start = source.indexOf('REFINABLE_SEARCH_CRITERIA: dict')
  const end = source.indexOf('\n}\n', start)
  const block = source
    .slice(start, end)
    .split('\n')
    .map(line => line.replace(/#.*$/, ''))
    .join('\n')
  const out: Record<string, string[]> = {}
  for (const match of block.matchAll(/"([a-z_]+)":\s*\(([^)]*)\)/g)) {
    out[match[1]] = [...match[2].matchAll(/"([a-z_]+)"/g)].map(item => item[1])
  }
  return out
}

describe('#3704 (RAT) — chaque critère affinable du service IA survit à l’écriture de l’état par l’API', () => {
  const criteria = refinableCriteriaFromPython()

  it('lit la source Python : les quatre outils affinables et la région du tour d’horizon', () => {
    expect(Object.keys(criteria).sort()).toEqual(
      ['find_accounts', 'run_account_search', 'search_market_memory', 'search_talents'].sort(),
    )
    expect(criteria['run_account_search']).toContain('region')
  })

  it.each(Object.entries(refinableCriteriaFromPython()))('%s : aucun critère retiré', (tool, keys) => {
    const search = { tool, criteria: Object.fromEntries(keys.map(key => [key, ['11']])) }
    const state = {
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [search],
      proposals: [],
      questions: [],
    }
    const parsed = conversationThreadStateSchema.parse(state) as { searches: { criteria: object }[] }
    expect(Object.keys(parsed.searches[0].criteria).sort()).toEqual([...keys].sort())
  })

  it('sait dire NON : un critère inconnu reste retiré', () => {
    const parsed = conversationThreadStateSchema.parse({
      version: 1,
      objects: [],
      focus: [],
      last_list: null,
      searches: [{ tool: 'run_account_search', criteria: { region: ['11'], secret_body: 'x' } }],
      proposals: [],
      questions: [],
    }) as { searches: { criteria: object }[] }
    expect(parsed.searches[0].criteria).toEqual({ region: ['11'] })
  })
})
