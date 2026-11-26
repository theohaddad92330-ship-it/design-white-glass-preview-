import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  CHAT_INTENT_INPUT_KINDS,
  CHAT_INTENT_KINDS,
  CHAT_INTENT_OBJECT_KINDS,
  CHAT_INTENT_PIPELINE,
  CHAT_INTENT_RESULT_KINDS,
  CHAT_INTENT_OPTIONAL_MARKERS,
  CHAT_INTENT_ROUTE_FIELDS,
  CHAT_INTENT_ROUTING_TABLE,
  CHAT_INTENT_STEPS_AWAITING_VALIDATION,
} from './chat-intent-router.js'

/**
 * #2321 — LA GARDE DE PARITÉ du routeur d'intention, et sa garde d'EXISTENCE.
 *
 * ## Ce qu'elle protège
 *
 * Le routeur vit en DEUX exemplaires : TypeScript (lu par l'API et le web) et
 * Python (exécuté dans le tour de chat). Deux listes divergent au premier ajout,
 * et c'est toujours le côté qu'on ne teste pas qui perd. Cette garde compare les
 * vocabulaires champ pour champ.
 *
 * ## Et la garde qui compte le plus : les outils EXISTENT
 *
 * Le piège n°1 de ce dépôt est « du code juste, testé, que personne n'appelle ».
 * Son jumeau ici serait pire : une table de routage qui NOMME un outil
 * inexistant. Laura annoncerait une action, et rien ne partirait. Le dernier
 * test lit donc `chat_tools.py` et refuse tout nom d'outil qui ne s'y déclare
 * pas — c'est le seul test de ce fichier qui puisse attraper une faute commise
 * ailleurs que dans le routeur.
 *
 * ⚠️ Une garde doit prouver qu'elle LIT quelque chose : chaque extraction est
 * vérifiée non vide avant de servir. Sans ça, une regex périmée rendrait la
 * parité verte À VIDE, pour toujours.
 */

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..', '..')
const ROUTER_PY = join(repoRoot, 'apps', 'ia', 'app', 'services', 'compilers', 'intent_router.py')
const CHAT_TOOLS_PY = join(repoRoot, 'apps', 'ia', 'app', 'services', 'chat_tools.py')

function readPython(path: string): string {
  expect(existsSync(path), `le fichier Python attendu est absent : ${path}`).toBe(true)
  return readFileSync(path, 'utf8')
}

const routerSource = readPython(ROUTER_PY)

/**
 * Le CODE d'un module Python, sans ses docstrings ni ses commentaires.
 *
 * ⚠️ Une garde qui lit la prose accuse le bien : un module qui CITE la règle
 * qu'il refuse (« Va dans Vivier ») se ferait condamner par sa propre mise en
 * garde. Les gardes de contenu de ce fichier lisent donc le code seul.
 */
function stripPythonProse(source: string): string {
  return (
    source
      .replace(/"""[\s\S]*?"""/g, '')
      .replace(/'''[\s\S]*?'''/g, '')
      .replace(/^[ \t]*#.*$/gm, '')
      // Python concatène implicitement deux littéraux adjacents. Une phrase
      // coupée en bout de ligne (« …le nom d'un » + « écran… ») n'existe donc
      // nulle part telle quelle dans le fichier : on recolle avant de chercher,
      // sinon la garde accuse une phrase qui EST là.
      .replace(/"[ \t]*\n[ \t]*"/g, '')
  )
}

/** Les chaînes d'un tuple Python nommé — `NOM: tuple[...] = ( "a", "b", )`. */
function pythonTuple(source: string, name: string): string[] {
  const block = new RegExp(`^${name}(?:\\s*:[^=]+)?\\s*=\\s*\\(([\\s\\S]*?)^\\)`, 'm').exec(source)
  expect(block, `tuple Python introuvable : ${name}`).not.toBeNull()
  return [...block![1]!.matchAll(/"([^"]*)"/g)].map(match => match[1]!)
}

describe('parité du routeur d’intention TS ↔ Python (#2321)', () => {
  it('lit vraiment le module Python — sinon toutes les paritées ci-dessous seraient vraies à vide', () => {
    expect(routerSource.length).toBeGreaterThan(2000)
    expect(routerSource).toContain('def route_chat_intent')
    expect(routerSource).toContain('CHAT_INTENT_ROUTING_TABLE')
  })

  it.each([
    ['CHAT_INTENT_KINDS', CHAT_INTENT_KINDS],
    ['CHAT_INTENT_OBJECT_KINDS', CHAT_INTENT_OBJECT_KINDS],
    ['CHAT_INTENT_RESULT_KINDS', CHAT_INTENT_RESULT_KINDS],
    ['CHAT_INTENT_PIPELINE', CHAT_INTENT_PIPELINE],
    ['CHAT_INTENT_STEPS_AWAITING_VALIDATION', CHAT_INTENT_STEPS_AWAITING_VALIDATION],
    ['CHAT_INTENT_INPUT_KINDS', CHAT_INTENT_INPUT_KINDS],
    ['CHAT_INTENT_ROUTE_FIELDS', CHAT_INTENT_ROUTE_FIELDS],
    ['CHAT_INTENT_OPTIONAL_MARKERS', CHAT_INTENT_OPTIONAL_MARKERS],
  ])('%s est identique des deux côtés, dans le même ordre', (name, expected) => {
    const fromPython = pythonTuple(routerSource, name)
    expect(fromPython.length).toBeGreaterThan(0)
    expect(fromPython).toEqual([...expected])
  })

  it('le défaut qui ATTEND porte le même nom des deux côtés', () => {
    expect(routerSource).toContain('UNDECLARED_CHAT_INTENT = "non_declaree"')
  })

  it('chaque intention déclare la MÊME cible des deux côtés (objet, résultat, outils, manque)', () => {
    for (const kind of CHAT_INTENT_KINDS) {
      const entry = CHAT_INTENT_ROUTING_TABLE[kind]
      const block = new RegExp(`"${kind}": ChatIntentRoutingEntry\\(([\\s\\S]*?)\\n    \\),`, 'm').exec(routerSource)
      expect(block, `entrée Python introuvable pour l’intention ${kind}`).not.toBeNull()
      const body = block![1]!

      expect(body, `objet canonique divergent pour ${kind}`).toContain(
        `canonical_object=${entry.canonical_object === null ? 'None' : `"${entry.canonical_object}"`}`,
      )
      expect(body, `résultat attendu divergent pour ${kind}`).toContain(`expected_result="${entry.expected_result}"`)
      expect(body, `manque de capacité divergent pour ${kind}`).toContain(
        `capability_gap=${entry.capability_gap === null ? 'None' : `"${entry.capability_gap}"`}`,
      )

      const pythonTools = [...(/tools=\(([^)]*)\)/.exec(body)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(m => m[1]!)
      expect(pythonTools, `outils divergents pour ${kind}`).toEqual([...entry.tools])
    }
  })

  // ── La garde qui compte : les outils nommés EXISTENT vraiment ─────────────

  it('sait dire NON : tout outil nommé par la table est un outil RÉELLEMENT déclaré dans chat_tools.py', () => {
    const toolsSource = readPython(CHAT_TOOLS_PY)
    const declared = new Set([...toolsSource.matchAll(/^\s*"name": "([a-z0-9_]+)",/gm)].map(match => match[1]!))
    // La garde prouve qu'elle lit : `chat_tools.py` déclare des dizaines
    // d'outils. Zéro extraction = regex périmée, pas un dépôt sans outils.
    expect(declared.size).toBeGreaterThan(30)

    const named = new Set<string>()
    for (const kind of CHAT_INTENT_KINDS) for (const tool of CHAT_INTENT_ROUTING_TABLE[kind].tools) named.add(tool)
    // #2321.22 — l'outil du marché inverse est nommé par la règle de NO-GO, pas
    // par la table : il doit exister lui aussi.
    named.add('propose_guided_action')

    expect(named.size).toBeGreaterThan(0)
    for (const tool of named) {
      expect(declared.has(tool), `la table de routage nomme un outil inexistant : ${tool}`).toBe(true)
    }
  })

  it('sait dire NON pour de vrai : un outil inventé serait refusé par la même lecture', () => {
    const toolsSource = readPython(CHAT_TOOLS_PY)
    const declared = new Set([...toolsSource.matchAll(/^\s*"name": "([a-z0-9_]+)",/gm)].map(match => match[1]!))
    // Le témoin. Sans lui, un test toujours vert prouverait seulement que la
    // liste des outils nommés est vide.
    expect(declared.has('outil_qui_nexiste_pas')).toBe(false)
  })

  // ── L'APPELANT — le piège n°1 de ce dépôt ────────────────────────────────

  it('sait dire NON à un routeur ORPHELIN : le tour de chat l’APPELLE vraiment', () => {
    // Le motif qui revient dans tous les chantiers livrés de ce dépôt : « du
    // code juste, calculé, testé, que personne n'appelle ». Un routeur
    // d'intention que le tour n'appelle pas ne route rien du tout. Cette garde
    // lit le routeur HTTP du chat et refuse que l'appel disparaisse.
    const chatRouter = readPython(join(repoRoot, 'apps', 'ia', 'app', 'routers', 'chat.py'))
    expect(chatRouter.length).toBeGreaterThan(2000)
    expect(chatRouter).toContain('from app.services.compilers.intent_router import')
    expect(chatRouter).toContain('route_chat_intent(')
    // La route doit ALIMENTER le contrat de demande (#2257), pas rester dans
    // une variable morte.
    expect(chatRouter).toContain('resultat_attendu=intent_route.expected_result')
  })

  // ── Le bloc de prompt : bilingue, et tenu par les NO-GO ──────────────────

  describe('le bloc « ce que le serveur a compris » (apps/ia/app/prompts/intent_route.py)', () => {
    const blockSource = readPython(join(repoRoot, 'apps', 'ia', 'app', 'prompts', 'intent_route.py'))

    it('lit vraiment le bloc, et le tour de chat l’ajoute au prompt', () => {
      expect(blockSource.length).toBeGreaterThan(1000)
      const chatRouter = readPython(join(repoRoot, 'apps', 'ia', 'app', 'routers', 'chat.py'))
      // L'import peut être sur une ligne (`import intent_route_block`) ou
      // groupé sur plusieurs (`import (\n    a,\n    intent_route_block,\n)`)
      // — plusieurs lots ajoutent leur propre nom au même groupe (#3175/#3176).
      // Les deux formes prouvent la même chose : le nom est importé RÉELLEMENT
      // depuis ce module, jamais un import qui aurait disparu en se regroupant.
      const importStatement = /from app\.prompts\.intent_route import (?:\(([\s\S]*?)\)|(.+))/.exec(chatRouter)
      expect(importStatement, 'aucun import depuis app.prompts.intent_route').not.toBeNull()
      const importedNames = importStatement![1] ?? importStatement![2] ?? ''
      expect(importedNames).toMatch(/\bintent_route_block\b/)
      expect(chatRouter).toContain('intent_route_block(intent_route')
    })

    it('est BILINGUE : aucun dictionnaire du bloc n’a une langue sans l’autre', () => {
      // Une garde monolingue est aveugle à l'autre langue : un dictionnaire
      // livré avec `"fr"` seul ferait lire du français à une interface anglaise.
      const frCount = (blockSource.match(/^\s*"fr":/gm) ?? []).length
      const enCount = (blockSource.match(/^\s*"en":/gm) ?? []).length
      expect(frCount).toBeGreaterThan(4)
      expect(frCount).toBe(enCount)
    })

    it('#2321.17 — sait dire NON : le bloc n’envoie jamais la personne vers un NOM DE PAGE', () => {
      // Le NO-GO littéral du ticket : « Va dans Vivier ». Le bloc nomme des
      // OUTILS ; il n'oriente jamais vers un écran que la personne devrait
      // trouver seule.
      //
      // ⚠️ Sur le CODE seulement. Une garde qui lit la PROSE accuse le bien :
      // l'en-tête du module CITE « Va dans Vivier » pour dire qu'il le refuse,
      // et une recherche naïve condamnait le fichier pour sa propre mise en
      // garde. On retire donc docstrings et commentaires avant de chercher.
      const code = stripPythonProse(blockSource)
      expect(code.length).toBeGreaterThan(500)
      for (const page of ['Vivier', 'Découvrir', 'va dans ', 'go to the ']) {
        expect(code, `le bloc oriente vers une page : ${page}`).not.toContain(page)
      }
      // Témoin : la prose, elle, contient bien le mot — sinon ce test serait
      // vert parce qu'il ne lit plus rien du tout.
      expect(blockSource).toContain('Vivier')
      // Et il porte la consigne inverse, explicitement, dans les deux langues.
      expect(code).toContain("jamais le nom d'un écran")
      expect(code).toContain('never the name of a screen')
    })

    it('le copilote PRÉPARE : le bloc dit dans les deux langues qu’il n’envoie jamais', () => {
      const code = stripPythonProse(blockSource)
      expect(code).toContain("tu ne l'envoies jamais")
      expect(code).toContain('you never send it')
    })

    it('une capacité absente est SIGNALÉE par l’outil existant, jamais promise', () => {
      const code = stripPythonProse(blockSource)
      expect(code).toContain('note_unrouted_request')
      expect(code).toContain('capacite_absente')
    })
  })

  it('réutilise le vocabulaire EXISTANT des demandes non routées — jamais une quatrième catégorie', () => {
    expect(routerSource).toContain('from app.services.unrouted_intent import UNROUTED_INTENT_CATEGORIES')
    for (const category of ['hors_perimetre', 'capacite_absente', 'intention_incomprise']) {
      expect(routerSource).toContain(category)
    }
  })
})
