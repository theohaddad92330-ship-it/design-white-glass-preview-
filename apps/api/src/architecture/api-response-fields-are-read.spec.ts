import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * UN CHAMP DE RÉPONSE QUE PERSONNE NE LIT — le symétrique de
 * `modules/wired-write-paths.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INCIDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Du code juste que personne n'appelle » est le défaut n°1 de ce dépôt, et il
 * a DEUX sens. Le sens ÉCRITURE — une méthode livrée sans appelant — est gardé
 * depuis des mois par `wired-write-paths.spec.ts`. Le sens LECTURE ne l'était
 * pas, et c'est celui qui vient de coûter le plus cher.
 *
 * L'API calcule les cartes de Laura, les gouverne, les persiste, et les renvoie
 * dans `context.cards` (`modules/ia-proxy/ia-proxy.controller.ts`). AUCUN
 * fichier de `apps/web/src` ne les lit : `ChatResponseContext`, le type miroir
 * écrit à la main côté web, n'a même pas le champ. Zéro carte à l'écran, une
 * fonctionnalité entière invisible — et les deux côtés ont leurs tests, et
 * chacun passe. C'est la signature du défaut : aucun test de comportement ne
 * peut le voir, parce qu'un test lit toujours ce qu'il vérifie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MÉTHODE DE DÉTECTION, ET POURQUOI PAS L'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deux pistes existaient. Elles ont été MESURÉES toutes les deux avant d'être
 * départagées — pas raisonnées.
 *
 * 1. PARTIR DES CONTRATS (`packages/contracts/src/schemas/`) et vérifier que
 *    chaque champ de premier niveau d'un schéma de réponse a un lecteur.
 *    ÉCARTÉE, et pour la raison la plus dure : `cards` n'est déclaré dans AUCUN
 *    contrat de réponse. Le contrat décrit la FORME d'une carte
 *    (`copilotCardViewSchema`), jamais l'enveloppe qui la transporte ; le
 *    contrôleur ajoute le champ à la main, `{ ...context, cards }`. Une garde
 *    bâtie sur les contrats aurait donc été VERTE sur l'incident même qui la
 *    fait exister — la définition d'une garde borgne.
 *
 * 2. PARTIR DES LITTÉRAUX D'OBJET RENVOYÉS PAR LES CONTRÔLEURS. Retenue, mais
 *    RESTREINTE à un sous-ensemble nommé : les champs qu'un contrôleur AJOUTE
 *    à côté d'un `...spread`.
 *
 * Pourquoi cette restriction, et pas « toutes les clés de tous les littéraux » :
 * la version large a été mesurée sur ce dépôt — 355 noms de champs distincts,
 * dont 39 sans le moindre lecteur nulle part. La quasi-totalité de ces 39 est
 * LÉGITIME : des charges utiles de passerelle interne (`copilot-bridge`) que le
 * service IA relaie ENTIÈRES au modèle sans jamais nommer une clé, et des
 * points d'entrée MCP dont le consommateur est un client externe, pas un écran
 * de ce dépôt. Une liste de 39 exceptions ne garde rien : personne ne la relit,
 * et le 40ᵉ champ mort s'y range sans bruit.
 *
 * Le champ AJOUTÉ à côté d'un spread est au contraire une famille NOMMABLE, et
 * c'est exactement celle de l'incident : le spread dit « tout ce qui vient
 * d'en amont », donc personne ne re-regarde la forme, et le type miroir du
 * consommateur reste tel qu'il était. 31 champs surveillés, 3 sans lecteur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RAFFINEMENTS QUI ONT CHANGÉ LE RÉSULTAT (mesurés, pas supposés)
 * ─────────────────────────────────────────────────────────────────────────────
 * · UN CHAMP ÉCRASÉ N'EST PAS UN CHAMP AJOUTÉ. `risk: { ...scores.risk,
 *   evaluated: scores.risk.evaluated.filter(…) }` ne crée pas `evaluated` : il
 *   le FILTRE. Le champ existait en amont, ses lecteurs aussi. Sans ce
 *   raffinement la garde réclamait un lecteur pour `opportunity.evaluated` et
 *   `risk.evaluated` — deux faux positifs sur six.
 * · UN LECTEUR PEUT VIVRE DANS `packages/`. `currentEsnProfileVersion` n'est
 *   nommé nulle part dans `apps/web` : le web appelle `ranWithOlderProfile(data)`
 *   et c'est l'aide partagée, dans `packages/contracts`, qui lit le champ. Sans
 *   ce raffinement, un champ parfaitement branché était compté mort.
 *   ⚠️ Mais dans `packages/`, seul un ACCÈS (`.champ`) compte comme lecture —
 *   jamais une clé de schéma (`champ:`). Un contrat DÉCLARE, il ne LIT pas ;
 *   les compter rendrait la garde verte sur tout champ contractualisé, ce qui
 *   est la leçon exacte de `wired-write-paths` sur les entités et les DTO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE NE VOIT PAS — dit ici plutôt que découvert plus tard
 * ─────────────────────────────────────────────────────────────────────────────
 * Un champ de PREMIER niveau dont le nom entre en collision avec le champ d'une
 * autre fonctionnalité lui échappe. `ia-proxy.controller.ts` renvoie un second
 * `cards` (l'historique d'un fil) ; `cards` a des lecteurs côté web — le
 * tableau des missions, le pipeline — donc la garde le croit lu. C'est
 * précisément pourquoi un champ IMBRIQUÉ est cherché QUALIFIÉ par son parent
 * (`context.cards`) et pas par son nom nu : sur le champ imbriqué, la collision
 * ne peut plus mentir. Pour un champ racine il n'y a pas de parent à nommer, et
 * la garde l'assume au lieu de le cacher.
 *
 * La question posée par la garde est donc, à la lettre : « un consommateur
 * SAIT-IL que ce champ existe ? » — le déclarer dans son type miroir suffit à
 * répondre oui. C'est un plancher, pas une preuve de rendu. Et c'est déjà plus
 * que ce que l'incident avait : `ChatResponseContext` ne connaissait pas
 * `cards` du tout.
 *
 * ⚠️ ET UN TROU DE PORTÉE, NOMMÉ PLUTÔT QUE DÉCOUVERT. Cette garde vit dans la
 * suite `Test (API)`, dont la portée CI est `^apps/(api|mcp)/`. Elle lit
 * pourtant `apps/web`, `apps/dashboard-manager`, `apps/ia` et `packages/`. Le
 * sens qui compte est couvert : AJOUTER un champ à une réponse touche
 * forcément `apps/api`, donc le job tourne. Le sens inverse ne l'est pas — une
 * PR qui ne toucherait QUE `apps/web` en RETIRANT le dernier lecteur d'un champ
 * passerait verte, et `main` deviendrait rouge pour la personne suivante qui
 * touche l'API. C'est exactement l'incident GA-19 du 07/09/2026, transposé :
 * « la portée d'un job doit couvrir la portée des gardes qu'il porte »
 * (`.github/workflows/ci.yml`, bloc `Calculer la portée`). Le corriger revient
 * à faire tourner les quatre shards de l'API sur toute PR web : c'est un
 * arbitrage de coût de CI, pas un détail d'implémentation, et il n'est pas
 * tranché ici.
 */

const REPO = join(__dirname, '..', '..', '..', '..')
const CONTROLLERS = join(REPO, 'apps', 'api', 'src', 'modules')

/** Ce qu'on ne descend jamais : ni les dépendances, ni les sorties de build. */
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.next', '.venv', '.turbo', 'coverage', '.git'])

/**
 * LES CONSOMMATEURS DE L'API — tous, et c'est la moitié du travail.
 *
 * `apps/web` n'est pas le seul à lire l'API. Le back-office
 * (`dashboard-manager`), le serveur MCP et le service IA la lisent aussi. Une
 * garde qui ne regarderait que le web déclarerait mort `measuredAt`, que seul
 * le back-office lit, et `age_days`, que seul le service IA lit — elle
 * attraperait ce qu'elle ne vise pas dès sa première exécution.
 */
const CONSUMER_ROOTS: { dir: string[]; extensions: string[] }[] = [
  { dir: ['apps', 'web', 'src'], extensions: ['.ts', '.tsx'] },
  { dir: ['apps', 'mcp', 'src'], extensions: ['.ts'] },
  { dir: ['apps', 'dashboard-manager', 'src'], extensions: ['.ts', '.tsx'] },
  { dir: ['apps', 'ia', 'app'], extensions: ['.py'] },
]

/** Les aides partagées, où une lecture ne compte que sous forme d'ACCÈS. */
const SHARED_ROOT = ['packages']

type ResponseFieldDebt = {
  /** Le fichier de contrôleur qui renvoie le champ — deux modules peuvent
   *  renvoyer un champ du même nom sans partager le même défaut. */
  controller: string
  /** Le chemin du champ dans le littéral renvoyé, points compris. */
  field: string
  issue: string
  since: string
  why: string
}

/**
 * LE CLIQUET — la dette d'aujourd'hui, NOMMÉE, numérotée et datée.
 *
 * Pourquoi un cliquet et pas un interdit : les trois champs ci-dessous sont en
 * violation AUJOURD'HUI et les corriger est un autre lot (#1998), qui tient les
 * mêmes fichiers qu'une PR déjà ouverte. Une garde rouge ne se merge pas, donc
 * elle ne garde rien. Un cliquet documente la dette ET fait tomber la CI sur
 * toute violation NEUVE — le motif de `no-any-ratchet.spec.ts`.
 *
 * ⚠️ IL NE SE DESSERRE PAS TOUT SEUL. Une entrée qui n'est PLUS en violation
 * fait échouer la garde, pour forcer son retrait le jour de la correction. Sans
 * ça la liste survit à la dette qu'elle décrit et se met à protéger le vide
 * — c'est « la justification périmée », le défaut que ce dépôt a déjà payé.
 */
const NOT_READ_YET: ResponseFieldDebt[] = [
  // #1998 — `data.context.cards` VIVAIT ICI, et c'était l'incident fondateur de
  // cette garde. Il en sort le 14/09/2026 : `ChatResponseContext` déclare le
  // champ, `Chat.tsx` le lit (`context?.cards`) et `CopilotCards` le rend, avec
  // l'état et les gestes servis par l'API. Le cliquet a fait son travail — il a
  // refusé de rester vert sur une dette payée.
  //
  // `ia-proxy.controller.ts:turn_id` l'a suivi le 15/09/2026, par le même
  // chemin et pour la même raison : c'est le tour AUQUEL une carte se rattache,
  // et Action OS L4 en a besoin pour qu'une carte survive au rechargement.
  // `apps/web/src/features/chat/api/laura-turn.ts` le lit désormais
  // (`envelope?.data?.turn_id`). Le cliquet a de nouveau refusé de rester vert
  // sur une dette payée — son entrée sort ici, elle ne se commente pas.
  {
    controller: 'action-os.controller.ts',
    field: 'currentStepKey',
    issue: '#1943',
    since: '13/09/2026',
    why: 'l’étape EN COURS d’un run, dérivée par `currentStepKeyOf` et posée sur chaque ligne de l’Action Center par e19c7849c — aucun consommateur ne la lit : la liste montre un statut, jamais où le run en est. Trouvé par cette garde, pas par un écran',
  },
]

// ── Lecture des sources ─────────────────────────────────────────────────────

function filesUnder(dir: string, extensions: string[]): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (!IGNORED_DIRS.has(entry)) out.push(...filesUnder(full, extensions))
      continue
    }
    if (extensions.some(extension => entry.endsWith(extension))) out.push(full)
  }
  return out
}

/**
 * Retire les commentaires AVANT toute recherche — des DEUX côtés.
 *
 * Côté API, un docblock qui raconte « on ajoute `turn_id` » se lirait comme un
 * champ renvoyé. Côté consommateur, un commentaire qui dit « les cartes
 * arriveront ici » se lirait comme un lecteur, et la garde passerait au vert en
 * lisant le RÉCIT du défaut. C'est la quatrième espèce de garde borgne mesurée
 * dans ce dépôt, et elle est plus discrète que les trois autres.
 */
function stripTsComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function stripPyComments(source: string): string {
  return source.replace(/"""[\s\S]*?"""/g, '').replace(/^\s*#.*$/gm, '')
}

function withoutComments(file: string): string {
  const source = readFileSync(file, 'utf8')
  return file.endsWith('.py') ? stripPyComments(source) : stripTsComments(source)
}

/** Un fichier de test n'est pas un consommateur : il peut nommer un champ que
 *  plus aucun écran ne rend. Les compter ferait passer au vert exactement le
 *  défaut cherché. */
function isTestFile(file: string): boolean {
  const name = file.slice(file.lastIndexOf('/') + 1)
  return name.includes('.test.') || name.includes('.spec.') || name.startsWith('test_') || name.endsWith('.d.ts')
}

// ── Extraction des champs de réponse ────────────────────────────────────────

type ReturnedField = { path: string[]; key: string; overridden: boolean }

/** Les littéraux d'objet d'un `return`, pris ENTIERS (accolades équilibrées).
 *  Une fenêtre de N caractères couperait la moitié des champs, et une garde qui
 *  ne voit qu'une moitié se croit verte sur l'autre. */
function returnedLiterals(source: string): string[] {
  const out: string[] = []
  for (const match of source.matchAll(/\breturn\s*\{/g)) {
    const start = (match.index ?? -1) + match[0].length - 1
    if (start < 0) continue
    let depth = 0
    for (let i = start; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}') {
        depth -= 1
        if (depth === 0) {
          out.push(source.slice(start, i + 1))
          break
        }
      }
    }
  }
  return out
}

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/y

/**
 * Les champs d'un littéral d'objet, avec leur chemin et leur nature.
 *
 * On ne lit un identifiant comme une CLÉ que s'il est en position de clé —
 * juste après `{` ou `,`. Une première version acceptait tout identifiant
 * précédé d'une espace : elle comptait les VALEURS comme des champs
 * (`{ catalogue: RITUAL_CATALOG }` rendait un champ `RITUAL_CATALOG`) et
 * gonflait le corpus de 33 faux champs. Les appels et les tableaux sont sautés
 * en bloc : une clé d'objet passée en ARGUMENT n'est pas un champ de la
 * réponse.
 */
function fieldsOf(literal: string): ReturnedField[] {
  type Record = { path: string[]; key: string; depth: number; spread: boolean | null; value: string }
  const records: Record[] = []
  const parents: (string | null)[] = []
  const spreads: boolean[] = []
  let pending: string | null = null
  let expectKey = false
  let i = 0

  const skipQuoted = (from: number): number => {
    const quote = literal[from]
    let j = from + 1
    while (j < literal.length && literal[j] !== quote) j += literal[j] === '\\' ? 2 : 1
    return j + 1
  }

  const skipBracket = (from: number): number => {
    const open = literal[from] as string
    const close = open === '(' ? ')' : ']'
    let depth = 0
    let j = from
    while (j < literal.length) {
      const char = literal[j] as string
      if (char === open) depth += 1
      else if (char === close) {
        depth -= 1
        if (depth === 0) return j + 1
      } else if (char === '`' || char === "'" || char === '"') {
        j = skipQuoted(j)
        continue
      }
      j += 1
    }
    return j
  }

  while (i < literal.length) {
    const char = literal[i] as string
    if (/\s/.test(char)) {
      i += 1
      continue
    }
    if (char === '{') {
      parents.push(pending)
      spreads.push(false)
      pending = null
      expectKey = true
      i += 1
      continue
    }
    if (char === '}') {
      const hadSpread = spreads.pop() ?? false
      for (const record of records)
        if (record.depth === parents.length && record.spread === null) record.spread = hadSpread
      parents.pop()
      pending = null
      expectKey = false
      i += 1
      continue
    }
    if (char === ',') {
      expectKey = true
      pending = null
      i += 1
      continue
    }
    if (literal.startsWith('...', i)) {
      if (spreads.length > 0) spreads[spreads.length - 1] = true
      expectKey = false
      i += 3
      continue
    }
    if (char === '(' || char === '[') {
      i = skipBracket(i)
      expectKey = false
      continue
    }
    if (char === '`' || char === "'" || char === '"') {
      i = skipQuoted(i)
      expectKey = false
      continue
    }
    IDENTIFIER.lastIndex = i
    const identifier = IDENTIFIER.exec(literal)
    if (!identifier) {
      expectKey = false
      i += 1
      continue
    }
    if (!expectKey) {
      i = IDENTIFIER.lastIndex
      continue
    }
    const key = identifier[0]
    let after = IDENTIFIER.lastIndex
    while (after < literal.length && /\s/.test(literal[after] as string)) after += 1
    const isPair = literal[after] === ':'
    let value = ''
    if (isPair) {
      let depth = 0
      let j = after + 1
      while (j < literal.length) {
        const inner = literal[j] as string
        if (inner === '(' || inner === '[' || inner === '{') depth += 1
        else if (inner === ')' || inner === ']' || inner === '}') {
          if (depth === 0) break
          depth -= 1
        } else if (inner === ',' && depth === 0) break
        else if (inner === '`' || inner === "'" || inner === '"') {
          j = skipQuoted(j)
          continue
        }
        j += 1
      }
      value = literal.slice(after + 1, j)
    }
    records.push({
      path: parents.slice(1).filter((name): name is string => name !== null),
      key,
      depth: parents.length,
      spread: null,
      value,
    })
    pending = isPair ? key : null
    i = isPair ? after + 1 : IDENTIFIER.lastIndex
    expectKey = false
  }

  return records
    .filter(record => record.spread === true)
    .map(record => ({
      path: record.path,
      key: record.key,
      // `evaluated: scores.risk.evaluated.filter(…)` ÉCRASE un champ d'amont, il
      // ne le crée pas. Les `...` sont neutralisés d'abord : le troisième point
      // d'un spread suivi du nom se lisait comme un accès `.nom`, et `context:
      // { ...context, cards }` passait pour un écrasement.
      overridden: new RegExp(`\\.\\s*${record.key}\\b`).test(record.value.replace(/\.\.\./g, ' ')),
    }))
}

/** Les champs qu'un contrôleur AJOUTE à une charge utile relayée. */
function addedFields(source: string): { path: string[]; key: string }[] {
  return returnedLiterals(stripTsComments(source))
    .flatMap(fieldsOf)
    .filter(field => !field.overridden)
    .map(field => ({ path: field.path, key: field.key }))
}

// ── Les corpus, lus UNE fois ────────────────────────────────────────────────

const controllerFiles = filesUnder(CONTROLLERS, ['.controller.ts']).filter(file => !file.endsWith('.spec.ts'))

const watched: { controller: string; field: string; path: string[]; key: string }[] = []
for (const file of controllerFiles) {
  const controller = file.slice(file.lastIndexOf('/') + 1)
  for (const { path, key } of addedFields(readFileSync(file, 'utf8'))) {
    const field = [...path, key].join('.')
    if (!watched.some(entry => entry.controller === controller && entry.field === field)) {
      watched.push({ controller, field, path, key })
    }
  }
}

const consumerFiles = CONSUMER_ROOTS.flatMap(root => filesUnder(join(REPO, ...root.dir), root.extensions)).filter(
  file => !isTestFile(file),
)
const CONSUMERS = consumerFiles.map(withoutComments).join('\n')

const sharedFiles = filesUnder(join(REPO, ...SHARED_ROOT), ['.ts', '.tsx']).filter(
  file => !isTestFile(file) && !file.includes('/tooling/'),
)
const SHARED = sharedFiles.map(withoutComments).join('\n')

/**
 * Ce nom de champ désigne-t-il PLUSIEURS champs distincts dans les contrôleurs ?
 *
 * ⚠️ Mesuré sur le corpus, jamais listé à la main : une liste de noms ambigus
 * écrite en dur se périme au premier contrôleur qui ajoute un homonyme, et
 * personne ne la relit. `cards` en est un — la conversation de Laura et le
 * tableau des missions en renvoient chacun un, et ce sont deux choses.
 */
const occurrencesParNom = new Map<string, Set<string>>()
for (const entry of watched) {
  const vus = occurrencesParNom.get(entry.key) ?? new Set<string>()
  vus.add(`${entry.controller}:${entry.field}`)
  occurrencesParNom.set(entry.key, vus)
}
const isAmbiguous = (key: string): boolean => (occurrencesParNom.get(key)?.size ?? 0) > 1

/**
 * Un consommateur SAIT-IL que ce champ existe ?
 *
 * Un champ imbriqué dont le nom est AMBIGU est cherché qualifié par son
 * parent : c'est ce qui permet de distinguer le `cards` de la conversation, que
 * personne ne lisait, du `cards` du tableau des missions, que le web lit — deux
 * champs, un seul nom. Sans cette qualification la garde serait borgne sur
 * l'incident même qui l'a fait naître.
 *
 * ⚠️ Mais un nom UNIQUE ne se qualifie pas, et c'est le défaut corrigé ici : le
 * parent est le nom que le champ porte dans la réponse, pas un nom que le
 * consommateur devrait conserver. `{ message: { …, memory_uses } }` se lit côté
 * web `saved.memory_uses` — déstructurer et renommer est l'usage normal, et
 * l'exiger comptait mort un champ parfaitement lu. `main` en est devenue rouge
 * le 14/09/2026 : le champ arrivait par #1999, la garde par #2000, et NI L'UNE
 * NI L'AUTRE ne pouvait le voir seule. `packages/` appliquait déjà la bonne
 * règle (un accès nu suffit) — l'asymétrie entre les deux corpus ÉTAIT le bug.
 */
function hasReader(field: { path: string[]; key: string }): boolean {
  const parent = field.path.length > 0 ? field.path[field.path.length - 1] : null
  const acces = new RegExp(`\\.\\s*${field.key}\\b`)
  const inConsumers =
    parent && isAmbiguous(field.key)
      ? new RegExp(`${parent}\\s*[?!]?\\s*\\.\\s*${field.key}\\b`).test(CONSUMERS)
      : parent
        ? acces.test(CONSUMERS)
        : new RegExp(`\\b${field.key}\\b`).test(CONSUMERS)
  // Dans `packages/`, seul un ACCÈS compte : une clé de schéma DÉCLARE le champ.
  return inConsumers || acces.test(SHARED)
}

const unread = watched.filter(entry => !hasReader(entry))
const keyOf = (entry: { controller: string; field: string }): string => `${entry.controller}:${entry.field}`

describe('un champ de réponse d’API a un lecteur — le corpus', () => {
  // Sans ces assertions, un chemin qui glisse ou une expression régulière cassée
  // par un changement de formatage rendrait « 0 champ mort » sur zéro fichier,
  // avec un `exit 0`. Une garde au corpus vide est verte pour toujours.
  it('lit des contrôleurs', () => {
    expect(controllerFiles.length).toBeGreaterThan(100)
  })

  it('lit des champs AJOUTÉS à une charge utile relayée', () => {
    expect(watched.length).toBeGreaterThanOrEqual(25)
  })

  it('lit les QUATRE consommateurs de l’API, pas seulement le web', () => {
    expect(consumerFiles.length).toBeGreaterThan(1000)
    for (const root of CONSUMER_ROOTS) {
      const prefix = join(REPO, ...root.dir)
      expect(`${root.dir.join('/')} → ${consumerFiles.filter(f => f.startsWith(prefix)).length > 0}`).toBe(
        `${root.dir.join('/')} → true`,
      )
    }
  })

  it('lit les aides partagées de `packages/`', () => {
    expect(sharedFiles.length).toBeGreaterThan(100)
    expect(SHARED.length).toBeGreaterThan(100_000)
  })

  it('un nom de champ UNIQUE se reconnaît même si le consommateur renomme le parent', () => {
    // ⚠️ Le défaut qui a rendu `main` rouge le 14/09/2026, et que NI #1999 NI
    // #2000 ne pouvait voir seule : le champ arrive par l'une, la garde par
    // l'autre. `memory_uses` est produit sous la clé `message` et lu côté web
    // sur `saved.memory_uses` — un consommateur qui déstructure RENOMME, c'est
    // l'usage normal. Exiger le nom de variable du SERVEUR comptait mort un
    // champ vivant. Le nom du parent n'est une preuve que s'il départage.
    expect(hasReader({ path: ['message'], key: 'memory_uses' })).toBe(true)
  })

  it('un nom AMBIGU reste qualifié par son parent — sinon la garde devient borgne', () => {
    // Le témoin de l'incident fondateur : `cards` existe DEUX fois dans les
    // contrôleurs (la conversation de Laura, le tableau des missions). Le web
    // lit `data?.cards` des missions. Sans qualification, ce seul accès
    // déclarerait lues les cartes de la conversation, que personne ne rendait —
    // la garde resterait verte sur le défaut qui l'a fait naître.
    expect(isAmbiguous('cards')).toBe(true)
    expect(isAmbiguous('memory_uses')).toBe(false)
  })

  it('surveille bien le champ de l’incident', () => {
    // Une garde dont le cas d'origine a disparu du corpus ne garde plus rien :
    // on le dit à la lettre plutôt que de le supposer.
    expect(watched.map(keyOf)).toContain('ia-proxy.controller.ts:data.context.cards')
  })
})

describe('le cliquet — aucune violation NEUVE, et il ne se desserre pas', () => {
  it('aucun champ de réponse sans lecteur hors de la liste', () => {
    // Si ce test tombe : le champ que tu viens d'ajouter à une réponse n'est lu
    // par AUCUN consommateur. Soit tu le branches côté web / MCP / back-office /
    // IA, soit tu le retires. L'inscrire ici demande un numéro d'issue.
    const surprises = unread.map(keyOf).filter(name => !NOT_READ_YET.some(debt => keyOf(debt) === name))
    expect(surprises).toEqual([])
  })

  it('chaque entrée de la liste est ENCORE en violation', () => {
    // Le jour où #1998 est corrigé, cette assertion tombe et force le retrait de
    // l'entrée. Une exemption qui survit à sa dette protège le vide.
    const fixed = NOT_READ_YET.map(keyOf).filter(name => !unread.map(keyOf).includes(name))
    expect(fixed).toEqual([])
  })

  it('chaque entrée est encore RENVOYÉE par son contrôleur', () => {
    // Une entrée dont le champ a disparu du code ment sur ce qui est gardé —
    // c'est la justification périmée, en plus discret.
    const gone = NOT_READ_YET.map(keyOf).filter(name => !watched.map(keyOf).includes(name))
    expect(gone).toEqual([])
  })

  it('aucune entrée sans numéro d’issue ni date', () => {
    for (const debt of NOT_READ_YET) {
      expect(`${debt.field} → ${debt.issue}`).toMatch(/→ #\d+$/)
      expect(`${debt.field} → ${debt.since}`).toMatch(/→ \d{2}\/\d{2}\/\d{4}$/)
      expect(debt.why.length).toBeGreaterThan(30)
    }
  })
})

describe('la garde SAIT DIRE NON', () => {
  /** La preuve se fait sur une source FABRIQUÉE, passée dans les mêmes
   *  fonctions que le vrai corpus : casser un vrai contrôleur laisserait le
   *  dépôt à la merci d'une interruption, et le mécanisme testé est le même. */
  const FABRICATED = `
    class FakeController {
      get() {
        return { ...upstream, zzzChampJamaisLuParPersonne: compute() }
      }
    }
  `

  it('un champ de réponse que personne ne lit est SIGNALÉ', () => {
    const fields = addedFields(FABRICATED)
    expect(fields.map(field => field.key)).toContain('zzzChampJamaisLuParPersonne')
    expect(fields.filter(field => !hasReader(field)).map(field => field.key)).toEqual(['zzzChampJamaisLuParPersonne'])
  })

  it('retirer un lecteur rend un champ vivant SIGNALÉ', () => {
    // Le mécanisme de lecture, éprouvé sur un corpus réduit : `alerts` est lu
    // par le web et le back-office ; sur un corpus qui ne le contient pas, la
    // garde le déclare mort. C'est le NON de `hasReader`, pas celui de
    // l'extracteur.
    const withoutAnyReader = (key: string): boolean => new RegExp(`\\b${key}\\b`).test('const rien = 1')
    expect(withoutAnyReader('alerts')).toBe(false)
    expect(hasReader({ path: [], key: 'alerts' })).toBe(true)
  })
})

describe('la garde n’attrape pas ce qu’elle ne vise pas', () => {
  it('un champ lu par le SEUL back-office reste vert', () => {
    // `measuredAt` (audit-journal) n'est nommé nulle part dans `apps/web` : une
    // garde qui ne regarderait que le web le déclarerait mort.
    expect(watched.map(keyOf)).toContain('audit-journal.controller.ts:measuredAt')
    expect(unread.map(keyOf)).not.toContain('audit-journal.controller.ts:measuredAt')
  })

  it('un champ lu par le SEUL service IA reste vert', () => {
    expect(unread.map(keyOf)).not.toContain('accounts.controller.ts:age_days')
    expect(hasReader({ path: [], key: 'age_days' })).toBe(true)
  })

  it('un champ lu par une AIDE PARTAGÉE reste vert', () => {
    // Le web appelle `ranWithOlderProfile(data)` et c'est `packages/contracts`
    // (`run-profile.ts`) qui ACCÈDE au champ — aucun fichier de `apps/web` ne
    // fait `.currentEsnProfileVersion` lui-même. Sans la lecture des aides
    // partagées, faux positif.
    // ⚠️ Mesuré le 24/09/2026 (vague 36, #2306.24) : le MOT NU
    // `currentEsnProfileVersion` apparaît désormais aussi dans
    // `apps/web/src/features/accounts/api.ts` (`ImpactedAccountsResponse`) —
    // un DEUXIÈME champ racine, sans rapport, qui réutilise le même nom sans
    // jamais être accédé. C'est le trou de portée que le docstring de ce
    // fichier nomme déjà (« un champ de PREMIER niveau dont le nom entre en
    // collision... lui échappe ») : un bareword suffirait à masquer les DEUX
    // cas. L'assertion vérifie donc l'ACCÈS, seule preuve de lecture pour une
    // aide partagée (même règle que `SHARED` plus haut), pas la seule présence
    // du mot.
    expect(new RegExp('\\.\\s*currentEsnProfileVersion\\b').test(CONSUMERS)).toBe(false)
    expect(hasReader({ path: [], key: 'currentEsnProfileVersion' })).toBe(true)
  })

  it('un champ ÉCRASÉ n’est pas réclamé comme un champ ajouté', () => {
    // `risk: { ...scores.risk, evaluated: scores.risk.evaluated.filter(…) }` ne
    // crée pas `evaluated`, il le filtre. Deux faux positifs sur six sans ça.
    const REDACTION = `
      function redact() {
        return {
          risk: { ...scores.risk, evaluated: scores.risk.evaluated.filter(entry => entry.axis !== 'margin') },
        }
      }
    `
    expect(addedFields(REDACTION).map(field => field.key)).not.toContain('evaluated')
    expect(watched.map(keyOf)).not.toContain('finance.controller.ts:risk.evaluated')
  })

  it('un champ INTERNE, jamais renvoyé, n’entre pas dans le corpus', () => {
    const INTERNAL = `
      function work() {
        const cache = { ...previous, zzzCompteurInterne: 0 }
        this.store(cache)
        return { ...previous, publie: 1 }
      }
    `
    expect(addedFields(INTERNAL).map(field => field.key)).toEqual(['publie'])
  })

  it('un champ SANS spread autour de lui n’entre pas dans le corpus', () => {
    // La famille gardée est nommée : ce qu'on AJOUTE à une charge relayée. Un
    // littéral construit de bout en bout a une forme que son consommateur a
    // forcément lue en entier — et 39 exceptions ne gardent rien.
    expect(addedFields('function f() { return { totalementNeuf: 1 } }')).toEqual([])
  })
})

describe('la garde lit le CODE, pas le récit du défaut', () => {
  it('un champ nommé dans un DOCBLOCK de contrôleur n’est pas un champ renvoyé', () => {
    const DOCUMENTED = `
      /** On y AJOUTE zzzSeulementRaconte, le tour auquel la carte se rattache. */
      function f() {
        return { ...amont, reel: 1 }
      }
    `
    expect(addedFields(DOCUMENTED).map(field => field.key)).toEqual(['reel'])
  })

  it('un champ nommé dans un COMMENTAIRE de consommateur n’est pas un lecteur', () => {
    // La quatrième espèce de garde borgne : verte parce qu'elle lit la prose qui
    // décrit le trou. Les commentaires sont retirés des DEUX corpus.
    expect(stripTsComments('// les cartes arriveront dans zzzPromis\nconst x = 1').includes('zzzPromis')).toBe(false)
    expect(stripPyComments('# le champ zzzPromis arrivera\nx = 1').includes('zzzPromis')).toBe(false)
  })

  it('les commentaires sont bien retirés du corpus consommateur RÉEL', () => {
    // Preuve que le stripper tourne sur les 2 300 fichiers, pas seulement sur
    // les deux chaînes ci-dessus : aucune ouverture de docblock ne survit.
    expect(CONSUMERS.includes('/**')).toBe(false)
  })
})
