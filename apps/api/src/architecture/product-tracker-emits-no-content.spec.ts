import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-264 — le traceur produit (#1682) n'émet jamais de contenu, sur les
 * ÉMETTEURS, pas seulement sur le type.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue #1681 pose l'interdit en toutes lettres : jamais le contenu d'un
 * champ, jamais la VALEUR d'un filtre (« secteur=banque » désigne une
 * stratégie commerciale), jamais le texte d'une recherche, jamais les
 * coordonnées d'un clic, jamais le mouvement de souris.
 *
 * Une union TypeScript fermée (`BehavioralEvent` dans `product-tracker.ts`)
 * tient déjà la moitié du problème — mais un type ne protège que tant que
 * personne ne l'élargit. La preuve qui compte est sur les ÉMETTEURS : chaque
 * appel qui pousse un événement dans le tampon ne construit QUE l'objet que le
 * contrat #1682 a posé, jamais un champ de plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE FAIT — et pourquoi elle ne fait PAS confiance au fichier qu'elle lit
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne lit AUCUN export de `product-tracker.ts` : une liste de clés
 * autorisées qui vivrait dans ce même fichier pourrait dériver EN MÊME TEMPS
 * que le code qu'elle est censée garder, et la garde resterait verte. La table
 * {@link ALLOWED_KEYS} est donc recopiée ici, depuis le contrat de l'issue
 * #1681, et c'est elle qui fait foi.
 *
 * Deux vérifications, en TEXTE :
 *  1. chaque appel `enqueue('nom_evenement', { ... })` du fichier ne construit
 *     que les clés listées pour CET événement — ni plus, ni moins ;
 *  2. aucun terme générique de contenu (`value`, `query`, `content`,
 *     `clientX`…) n'apparaît nulle part dans le fichier, en dehors des
 *     commentaires — la seconde ligne de défense si la première venait à être
 *     contournée par une forme d'appel que le regex ne reconnaît pas.
 */

const TRACKER_FILE = join(__dirname, '..', '..', '..', '..', 'apps', 'web', 'src', 'lib', 'product-tracker.ts')

/** Le contrat de l'issue #1681/#1682, recopié — jamais importé du fichier
 *  qu'on garde (voir le docblock ci-dessus). */
const ALLOWED_KEYS: Readonly<Record<string, readonly string[]>> = {
  screen_viewed: ['route', 'previousViewDurationMs', 'provenance'],
  screen_left: ['route', 'durationMs', 'leaveMode'],
  tab_opened: ['screen', 'tab'],
  action_started: ['action', 'screen'],
  action_completed: ['action', 'durationMs'],
  action_abandoned: ['action', 'atStep'],
  filter_applied: ['screen', 'filterName'],
  search_performed: ['screen', 'resultCount'],
  error_shown: ['screen', 'errorCode'],
  // #1946 (14/09/2026) — l'union s'ÉLARGIT de dix formes sur décision de Louis,
  // prise contre la recommandation et sans que la relecture juridique RGPD soit
  // faite. La règle 2 (« aucun contenu ») ne se lève PAS pour autant, et c'est
  // exactement ce que cette table vérifie : chacune des dix porte un rang, un
  // verdict, une étape, un degré ou un motif de route — jamais un texte.
  //
  // ⚠️ Ce n'est PAS une troisième exception nommée. Il n'y en a que deux
  // (#1946.22, alerte opérateur par espace ; #1949.23, trace anonyme d'une
  // demande non routée), et une troisième fait rougir cette garde et GA-266.
  assistant_first_question_sent: ['screen'],
  suggestion_clicked: ['screen', 'rank'],
  assistant_first_useful_result: ['screen', 'durationMs'],
  assistant_answer_judged: ['screen', 'verdict'],
  assistant_redirect_followed: ['fromScreen', 'toScreen'],
  prepared_action_stage: ['action', 'stage'],
  draft_reused: ['screen', 'extent'],
  intervention_outcome: ['intervention', 'outcome'],
  memory_added: ['screen'],
  // #2085 (15/09/2026) — les frictions du parcours d'onboarding : le verdict
  // sur une suggestion préremplie, et qu'une étape a été reprise en arrière —
  // jamais une valeur devinée, saisie, ou le nom d'une question.
  onboarding_prefill_reviewed: ['screen', 'outcome'],
  onboarding_step_back: ['screen'],
  // #2085 (16/09/2026, lot « mesure-de-l'onboarding ») — six formes de plus,
  // toutes anonymes, par ÉCRAN : jamais une valeur devinée, saisie, un nom de
  // connecteur, ni le contenu d'un import ou d'une invitation.
  onboarding_audit_generated: ['screen'],
  onboarding_audit_validated: ['screen'],
  onboarding_first_value_viewed: ['screen'],
  connector_activated: ['screen'],
  data_imported: ['screen'],
  invitation_sent: ['screen'],
  // #2085.6 (23/09/2026) — le sort d'une contradiction du questionnaire :
  // corrigée ou maintenue telle quelle, jamais le texte des deux réponses en
  // tension.
  onboarding_contradiction_resolved: ['screen', 'outcome'],
  // #2985 (26/09/2026) — le Meeting OS (#2319) : neuf formes de plus, toutes
  // anonymes, par ÉCRAN — sauf `question_used`, qui porte en plus le RANG
  // rendu de la question, jamais son texte.
  // #2985 / #2319.123 (29/09/2026) — le rendez-vous tenu, par ÉCRAN seulement.
  meeting_completed: ['screen'],
  // #2985 / #2319.129/.130 (30/09/2026) — l'écriture CRM confirmée, par ÉCRAN seul.
  crm_writeback_confirmed: ['screen'],
  brief_generated: ['screen'],
  brief_opened: ['screen'],
  question_used: ['screen', 'rank'],
  notes_added: ['screen'],
  summary_generated: ['screen'],
  summary_approved: ['screen'],
  actions_created: ['screen'],
  followup_created: ['screen'],
  false_association_corrected: ['screen'],
  // #2108.49-.53 (29/09/2026) — le geste accepter/reporter/rejeter/corriger
  // sur une carte de priorité : le GENRE de la carte (un enum fermé), jamais
  // son libellé ni le compte visé.
  priority_viewed: ['screen', 'kind'],
  priority_accepted: ['screen', 'kind'],
  priority_snoozed: ['screen', 'kind'],
  priority_rejected: ['screen', 'kind'],
  priority_corrected: ['screen', 'kind'],
  // #2108.54 (30/09/2026) — une tâche cochée : un écran seul, jamais son titre.
  task_completed: ['screen'],
}

/**
 * Les termes qu'un champ de contenu, une valeur de filtre, une requête de
 * recherche ou des coordonnées de clic porteraient — jamais un mot ordinaire
 * du reste du fichier (« route », « screen », « action »… n'y figurent pas :
 * ce sont des noms légitimes du contrat lui-même).
 *
 * ⚠️ `content` n'y figure PAS : le fichier envoie ses lots avec l'en-tête HTTP
 * `Content-Type`, un nom d'infrastructure légitime que `\bcontent\b`
 * (insensible à la casse) attraperait — mesuré en écrivant cette garde. Un mot
 * aussi générique que « contenu » se tient par la revue des clés autorisées
 * ci-dessus, pas par une liste de mots interdits : c'est ce que l'exemple
 * `no-session-replay.spec.ts` (GA-240) appelle « une garde qui interdirait des
 * mots ordinaires finit désactivée ».
 */
const FORBIDDEN_TERMS: readonly string[] = [
  'value',
  'filterValue',
  'searchValue',
  'searchQuery',
  'query',
  'fieldValue',
  'inputValue',
  'clientX',
  'clientY',
  'pageX',
  'pageY',
  'mouseX',
  'mouseY',
  // #1946 — les noms qu'un contenu porterait dans les dix formes ajoutées. Le
  // libellé d'une suggestion de Laura est bâti sur le portefeuille du client :
  // c'est le pipe commercial, sous un mot anodin. Le brouillon commercial et
  // le message envoyé le sont tout autant.
  //
  // ⚠️ `label` seul n'y figure PAS, et c'est délibéré : c'est un mot ordinaire
  // qu'un fichier voisin porterait légitimement, et une garde rouge sur du code
  // juste finit désactivée (la leçon que GA-240 écrit pour « clarity »). Un
  // `label` nu reste refusé par la LISTE BLANCHE ci-dessus, qui n'a pas besoin
  // d'avoir deviné le nom.
  'suggestionText',
  'suggestionLabel',
  'answerText',
  'draftText',
  'sentText',
  'questionText',
  'messageBody',
  'excerpt',
  'snippet',
  'transcript',
]

/** Retire les commentaires — leçon GA-08/GA-240 : un docblock qui CITE le mot
 *  « value » en exemple ne doit pas se dénoncer lui-même. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

type EnqueueCall = { eventName: string; keys: string[] }

/**
 * Découpe le contenu d'un objet `{ a, b: expr(x, y), c: 'lit' }` sur ses
 * virgules de PROFONDEUR ZÉRO — une expression comme `elapsedSince(mark)` ne
 * doit pas être coupée sur une virgule qui n'existe même pas ici, mais un
 * futur appel à deux arguments ne doit pas non plus tromper le compte.
 */
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of body) {
    if (char === '(' || char === '{' || char === '[') depth += 1
    if (char === ')' || char === '}' || char === ']') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim().length > 0) parts.push(current)
  return parts
}

/** Les appels `enqueue('nom', { ... })` du texte, avec la liste des clés que
 *  chacun construit. Reconnaît la forme raccourcie (`{ screen, tab }`) et la
 *  forme `clé: expression` (`{ route: currentScreen.route }`). */
function enqueueCalls(source: string): EnqueueCall[] {
  const out: EnqueueCall[] = []
  const pattern = /enqueue\(\s*'([a-z_]+)'\s*,\s*\{([^]*?)\}\s*(?:as\s+[A-Za-z<>[\]]+\s*)?\)/g
  for (const match of source.matchAll(pattern)) {
    const eventName = match[1] as string
    const body = (match[2] as string).trim()
    const keys = splitTopLevel(body)
      .map(part => part.trim())
      .filter(part => part.length > 0)
      .map(part => (part.includes(':') ? part.slice(0, part.indexOf(':')) : part).trim())
    out.push({ eventName, keys })
  }
  return out
}

/** Un terme interdit trouvé comme MOT ENTIER dans le texte (identifiant ou
 *  chaîne), ou `null`. Sans `\b` des deux côtés, `filterName` serait attrapé
 *  par une règle sur `Name` — ici chaque terme est déjà assez spécifique pour
 *  qu'un mot limitrophe légitime (`filterName`, `resultCount`) ne le déclenche
 *  pas : voir le test « n'attrape pas ce qu'elle ne vise pas ». */
function forbiddenTermIn(text: string): string | null {
  for (const term of FORBIDDEN_TERMS) {
    if (new RegExp(`\\b${term}\\b`, 'i').test(text)) return term
  }
  return null
}

describe('GA-264 — le traceur produit n’émet jamais de contenu', () => {
  const rawSource = readFileSync(TRACKER_FILE, 'utf8')
  const source = stripComments(rawSource)
  const calls = enqueueCalls(source)

  it('lit un corpus non vide — le fichier existe et porte les 44 émissions', () => {
    expect(rawSource.length).toBeGreaterThan(500)
    expect(calls.length).toBeGreaterThanOrEqual(44)
    expect(new Set(calls.map(call => call.eventName)).size).toBe(44)
  })

  it('les 45 événements du contrat sont TOUS émis — aucun n’est passé sous silence', () => {
    const seen = new Set(calls.map(call => call.eventName))
    expect([...seen].sort()).toEqual(Object.keys(ALLOWED_KEYS).sort())
  })

  it('chaque appel d’émission ne construit QUE les clés autorisées pour SON événement', () => {
    const violations = calls
      .map(call => {
        const allowed = new Set(ALLOWED_KEYS[call.eventName] ?? [])
        const extra = call.keys.filter(key => !allowed.has(key))
        return extra.length > 0 ? `${call.eventName} porte une clé hors contrat : ${extra.join(', ')}` : null
      })
      .filter((entry): entry is string => entry !== null)
    expect(violations).toEqual([])
  })

  it('aucun terme générique de contenu n’apparaît dans le fichier (hors commentaires)', () => {
    const found = FORBIDDEN_TERMS.filter(term => new RegExp(`\\b${term}\\b`, 'i').test(source))
    expect(found).toEqual([])
  })

  it('SAIT DIRE NON — une clé hors contrat glissée dans un appel fabriqué est signalée', () => {
    // Le témoin manuel, consigné au rapport du lot : `filterName` déjà présent
    // ci-dessus n'a rien à faire dire à la garde ; ajouter `value` doit la
    // faire rougir.
    const tampered = "enqueue('filter_applied', { screen, filterName, value })"
    const call = enqueueCalls(tampered)[0]
    expect(call).toBeDefined()
    const allowed = new Set(ALLOWED_KEYS[(call as EnqueueCall).eventName] ?? [])
    const extra = (call as EnqueueCall).keys.filter(key => !allowed.has(key))
    expect(extra).toEqual(['value'])

    expect(forbiddenTermIn('const value = event.target.value')).toBe('value')
    expect(forbiddenTermIn('trackSearchPerformed(screen, query.length)')).toBe('query')

    // #1946 — le même contrôle sur les dix formes ajoutées : le libellé d'une
    // suggestion et le texte d'un brouillon sont les deux endroits où le
    // contenu entrerait le plus naturellement.
    const tamperedSuggestion = "enqueue('suggestion_clicked', { screen, rank, suggestionText })"
    const suggestion = enqueueCalls(tamperedSuggestion)[0] as EnqueueCall
    const allowedSuggestion = new Set(ALLOWED_KEYS[suggestion.eventName] ?? [])
    expect(suggestion.keys.filter(key => !allowedSuggestion.has(key))).toEqual(['suggestionText'])
    expect(forbiddenTermIn('const draftText = editor.getContent()')).toBe('draftText')
    expect(forbiddenTermIn("enqueue('draft_reused', { screen, extent, sentText })")).toBe('sentText')
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — les identifiants légitimes du fichier passent', () => {
    for (const innocent of [
      'filterName',
      'resultCount',
      'previousViewDurationMs',
      'errorCode',
      'atStep',
      'action_completed',
      'currentScreen.route',
      "'Content-Type'", // un en-tête HTTP légitime, pas un champ de contenu
      // #1946 — les identifiants légitimes des dix formes ajoutées. Aucun ne
      // doit être attrapé : ce sont des dimensions produit, pas des contenus.
      'rank',
      'verdict',
      'extent',
      'stage',
      'outcome',
      'intervention',
      'fromScreen',
      'toScreen',
      'firstQuestionMark',
      'firstUsefulResultEmitted',
    ]) {
      expect(forbiddenTermIn(innocent)).toBeNull()
    }
    // Et le fichier RÉEL, une fois les commentaires retirés, ne contient
    // aucun des termes interdits — l'assertion tenue plus haut, revérifiée ici
    // au singulier pour que le message d'échec nomme le fichier en cause.
    expect(forbiddenTermIn(source)).toBeNull()
  })

  it('retire bien les commentaires AVANT de chercher — une citation ne se dénonce pas elle-même', () => {
    // Le mécanisme, prouvé sur une source fabriquée : un commentaire qui CITE
    // un terme interdit en prose ne doit pas faire rougir la garde une fois
    // nettoyé — exactement le piège que `no-session-replay.spec.ts` (GA-240)
    // documente pour son propre fichier.
    const withComment = "// jamais la value d'un champ ni sa query\nenqueue('tab_opened', { screen, tab })"
    expect(forbiddenTermIn(withComment)).toBe('value')
    expect(forbiddenTermIn(stripComments(withComment))).toBeNull()
  })

  it('le découpage top-level ne casse pas sur un appel de fonction à un seul argument', () => {
    const calls2 = enqueueCalls("enqueue('action_completed', { action, durationMs: elapsedSince(mark) })")
    expect(calls2).toEqual([{ eventName: 'action_completed', keys: ['action', 'durationMs'] }])
  })
})

/**
 * GA-264 (suite) — #1949.23 : L'EXCEPTION NOMMÉE ET UNIQUE À « AUCUN CONTENU ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LOUIS A LEVÉ, ET CE QUI TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision Louis 13/09 batch 12, prise CONTRE la recommandation : la règle 2 de
 * `c64_analytique_produit` (« aucun contenu ») est levée pour UNE trace — la
 * demande que Laura n'a pas su router, dans `laura_unrouted_intents`, masquée
 * et tronquée, sans identité. Relecture juridique RGPD toujours due.
 *
 * Une exception non gardée devient une permission générale au deuxième usage.
 * Cette section tient donc, en TEXTE, sur les migrations et le code :
 *  1. parmi les tables d'ANALYTIQUE (nommées `*_events`, `*_intents`,
 *     `*_traces`), UNE seule porte une colonne de texte saisi — la nommée ;
 *  2. elle n'a aucune colonne d'identité (`user_id`, `workspace_id`) ;
 *  3. un seul fichier l'écrit, et il n'écrit QUE les clés de la décision.
 *
 * ⚠️ CE QU'ELLE NE VOIT PAS : un texte saisi rangé dans une table qui ne porte
 * pas un nom d'analytique, ou sous un nom de colonne neutre (`payload`). La
 * convention de nommage est la frontière lisible ; la liste blanche côté
 * serveur (`sanitizeBehavioralProperties`) reste la défense du flux produit.
 */
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations')
const API_SRC = join(__dirname, '..')

/** L'exception, recopiée depuis la décision — jamais importée du code gardé. */
const CONTENT_EXCEPTIONS: Readonly<Record<string, string>> = {
  laura_unrouted_intents: '#1949.23 — décision Louis 13/09 batch 12, contre la recommandation',
}

/** Les clés que l'écrivain de l'exception a le droit d'écrire, et aucune autre. */
const EXCEPTION_WRITE_KEYS = [
  'category',
  'language',
  'occurred_on',
  'surface',
  'text_masked',
  'text_normalized',
  'workspace_day_hash',
]

/** Une table d'ANALYTIQUE, à son nom. */
const ANALYTICS_TABLE = /_(events|intents|traces)$/

/** Une colonne qui porte un TEXTE saisi, à son nom. */
const FREE_TEXT_COLUMN = /(^|_)(text|message|question|query|content|prompt|body)($|_)/

function withoutSqlComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*(\/\/|--).*$/gm, ' ')
}

/** Les colonnes de texte saisi déclarées sur des tables d'analytique, dans un `up()`. */
function contentColumnsIn(migrationSource: string): { table: string; column: string }[] {
  const up = withoutSqlComments(migrationSource).split(/public\s+async\s+down/)[0] ?? ''
  const found: { table: string; column: string }[] = []
  for (const match of up.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s*\(([\s\S]*?)\n\s*\)/gi,
  )) {
    const table = (match[1] as string).toLowerCase()
    if (!ANALYTICS_TABLE.test(table)) continue
    for (const line of (match[2] as string).split('\n')) {
      const column = line.match(/^\s*"?([a-z_][a-z0-9_]*)"?\s+[a-z]/i)?.[1]?.toLowerCase()
      if (column && FREE_TEXT_COLUMN.test(column)) found.push({ table, column })
    }
  }
  for (const match of up.matchAll(
    /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z_][a-z0-9_]*)"?/gi,
  )) {
    const table = (match[1] as string).toLowerCase()
    const column = (match[2] as string).toLowerCase()
    if (ANALYTICS_TABLE.test(table) && FREE_TEXT_COLUMN.test(column)) found.push({ table, column })
  }
  return found
}

function productionSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'migrations' || entry === '__tests__') continue
      productionSources(full, out)
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full)
    }
  }
  return out
}

/** Les clés d'un appel `.insert({ ... })` — la même lecture que `enqueueCalls`. */
function insertKeysIn(source: string): string[][] {
  return [...stripComments(source).matchAll(/\.insert\(\{([^]*?)\}\)/g)].map(match =>
    splitTopLevel(match[1] as string)
      .map(part => part.trim())
      .filter(part => part.length > 0)
      .map(part => (part.includes(':') ? part.slice(0, part.indexOf(':')) : part).trim()),
  )
}

describe('GA-264 (suite) — #1949.23 : une seule trace d’analytique porte un texte saisi, et elle est nommée', () => {
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.ts'))
    .map(file => ({ file, source: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }))
  const found = migrations.flatMap(entry => contentColumnsIn(entry.source))

  it('LIT quelque chose — les migrations, dont la table d’exception elle-même', () => {
    expect(migrations.length).toBeGreaterThan(100)
    expect(migrations.some(entry => /CREATE TABLE IF NOT EXISTS laura_unrouted_intents/.test(entry.source))).toBe(true)
    expect(found.length).toBeGreaterThan(0)
  })

  it('les SEULES colonnes de texte saisi d’une table d’analytique sont celles de l’exception nommée', () => {
    const tables = [...new Set(found.map(entry => entry.table))].sort()
    expect(tables).toEqual(Object.keys(CONTENT_EXCEPTIONS).sort())
  })

  it('l’exception n’a AUCUNE colonne d’identité', () => {
    const creation = migrations.find(entry => /CREATE TABLE IF NOT EXISTS laura_unrouted_intents/.test(entry.source))
    const body =
      withoutSqlComments(creation?.source ?? '').match(/laura_unrouted_intents\s*\(([\s\S]*?)\n\s*\)/)?.[1] ?? ''
    expect(body).toContain('text_masked')
    expect(body).not.toMatch(/\buser_id\b/)
    expect(body).not.toMatch(/\bworkspace_id\b/)
  })

  it('un seul fichier l’écrit, et il n’écrit QUE les clés de la décision', () => {
    const writers = productionSources(API_SRC)
      .map(file => ({ file, source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => {
        const code = stripComments(source)
        return (
          /INSERT\s+INTO\s+laura_unrouted_intents/i.test(code) ||
          (code.includes('LauraUnroutedIntentEntity') && /\.insert\(/.test(code))
        )
      })
    expect(writers.map(({ file }) => file.replace(`${API_SRC}/`, ''))).toEqual([
      'modules/laura-unrouted-intents/laura-unrouted-intents.service.ts',
    ])
    const keys = insertKeysIn(writers[0]?.source ?? '')
    expect(keys).toHaveLength(1)
    expect([...(keys[0] ?? [])].sort()).toEqual(EXCEPTION_WRITE_KEYS)
  })

  it('sait dire NON — une TROISIÈME trace d’analytique qui garderait le texte cherché est reprochée', () => {
    const fautive = `export class X { public async up(q) { await q.query(\`
      CREATE TABLE IF NOT EXISTS laura_search_traces (
        id uuid PRIMARY KEY,
        search_query text NOT NULL,
        occurred_on date NOT NULL
      )
    \`) } }`
    expect(contentColumnsIn(fautive)).toEqual([{ table: 'laura_search_traces', column: 'search_query' }])
  })

  it('sait dire NON — une colonne de texte AJOUTÉE au flux produit est reprochée', () => {
    const fautive =
      'export class X { public async up(q) { await q.query(`ALTER TABLE product_events ADD COLUMN IF NOT EXISTS search_text text`) } }'
    expect(contentColumnsIn(fautive)).toEqual([{ table: 'product_events', column: 'search_text' }])
  })

  it('sait dire NON — une clé d’identité glissée dans l’écriture de l’exception est reprochée', () => {
    const keys = insertKeysIn('await this.intents.insert({ occurred_on: day, text_masked: t, user_id: userId })')
    expect(keys[0]?.filter(key => !EXCEPTION_WRITE_KEYS.includes(key))).toEqual(['user_id'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un fil de conversation et le flux produit restent permis', () => {
    const voisins = `export class X { public async up(q) { await q.query(\`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id uuid PRIMARY KEY,
        content text NOT NULL
      )
    \`); await q.query(\`
      CREATE TABLE IF NOT EXISTS product_events (
        id uuid PRIMARY KEY,
        event_name text NOT NULL,
        properties jsonb NOT NULL DEFAULT '{}'::jsonb
      )
    \`) } }`
    expect(contentColumnsIn(voisins)).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — le `down()` d’une migration ne compte pas', () => {
    const source = `export class X {
      public async up(q) { await q.query('SELECT 1') }
      public async down(q) { await q.query(\`CREATE TABLE IF NOT EXISTS old_traces (
        message text
      )\`) }
    }`
    expect(contentColumnsIn(source)).toEqual([])
  })
})
