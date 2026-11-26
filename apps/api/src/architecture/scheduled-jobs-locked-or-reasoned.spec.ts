import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * GA-76 — une tâche planifiée prend un VERROU, ou dit POURQUOI elle n'en prend pas.
 * GA-77 — une tâche planifiée est MONTÉE : son hôte est un provider d'un module
 *         que `AppModule` atteint.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `ScheduleModule.forRoot()` est monté une fois pour tout le processus
 * (`outbox.module.ts`). À N répliques, CHAQUE réplique découvre les mêmes
 * `@Cron` / `@Interval` et les déclenche N fois par tick. Deux défauts distincts
 * en découlent, et une seule garde ne suffisait pas à les tenir tous les deux :
 *
 *  1. **Le verrou mort.** `CostAlertService` appelait bien `withSingletonLock`,
 *     mais `AnalyticsModule` n'importait jamais `LocksModule` : le `@Optional()`
 *     résolvait `undefined`, le helper dégradait en exécution directe, et les
 *     cinq alertes du passage de 07:05 partaient une fois par réplique tous les
 *     matins. L'appel était juste ; c'est le CÂBLAGE qui manquait — le défaut
 *     n°1 du dépôt, « du code juste que personne n'appelle ».
 *  2. **Le verrou absent sans raison.** Six tâches n'en prennent aucun. Pour
 *     cinq d'entre elles c'est le bon choix : elles réservent leur lot en base
 *     (`FOR UPDATE SKIP LOCKED`), ou leur écriture est protégée par un index
 *     unique. Un verrou y ajouterait une dépendance Redis et un mode de panne
 *     pour ne protéger qu'une ligne de journal en double. Ce qui manquait
 *     n'était donc pas le verrou : c'était la RAISON ÉCRITE de ne pas en avoir.
 *
 * D'où la forme de GA-76 : elle exige **l'un OU l'autre**, jamais le verrou
 * partout. Une garde qui aurait exigé un verrou sur les vingt-trois aurait été
 * FAUSSE, et une garde fausse finit désactivée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * - le CORPS de la méthode décorée (pas le fichier) : `notifications.scheduler`
 *   porte quatre `@Cron`, et la présence d'un `withSingletonLock` quelque part
 *   dans le fichier ne dit rien de la méthode d'à côté ;
 * - les TROIS formes de prise de verrou : `withSingletonLock(this.locks, …)`,
 *   `this.locks.withLock(…)` — `StatusMonitorService` utilise la seconde, et une
 *   garde qui n'aurait connu que la première l'aurait déclarée fautive à tort —
 *   et, depuis le 07/09/2026, un verrou reçu par JETON D'INJECTION ;
 *
 *   ⚠️ **La troisième forme est née d'un conflit entre deux gardes.** GA-07
 *   (frontières de modules) est un cliquet AU PLAFOND : un service qui importe
 *   `SingletonLockService` d'un autre module le fait monter. Le passage mensuel
 *   des chiffres (`BusinessMetricsSnapshotService`, #1645) reçoit donc son
 *   verrou par un jeton, fourni dans son `*.module.ts` — la couche que GA-07
 *   exempte précisément parce que c'est là qu'on compose. La garde le voyait
 *   « sans verrou » alors qu'il en prend un : elle protégeait la FORME qu'elle
 *   avait vue, pas la règle. Elle exige donc désormais une CHAÎNE DE PREUVE, et
 *   non un nom : le membre appelé doit être `@Inject(<JETON>)`, et un module du
 *   dépôt doit fournir ce jeton par une fabrique qui appelle `withSingletonLock`.
 *   Un jeton dont la fabrique ne verrouille rien ne compte pas — c'est ce que
 *   vérifie le test « sait dire NON » ci-dessous ;
 * - le tableau `imports:` du module déclarant, **pas la ligne `import`**. La
 *   première version de cette garde (lot du 29/08) est née borgne exactement
 *   là : `AnalyticsModule` aurait suffi à la satisfaire avec un `import` en tête
 *   de fichier que le décorateur `@Module` n'utilise pas ;
 * - la RAISON, dans le docblock de la méthode ou celui de la classe, derrière un
 *   marqueur `SANS VERROU :` — un marqueur se cherche, une phrase libre se
 *   devine.
 *
 * Les commentaires sont MASQUÉS (et non retirés) avant toute lecture de code :
 * masquer préserve les offsets, ce qui permet de retrouver le docblock d'origine
 * à partir de la position du décorateur. Les chaînes le sont aussi — une
 * accolade dans un littéral cassait l'appariement du corps de méthode.
 */

const SRC = join(__dirname, '..')
const MODULES = join(SRC, 'modules')

/** Le marqueur qui rend une raison LISIBLE par une machine. */
const NO_LOCK_MARKER = 'SANS VERROU :'

/** Une raison plus courte que ça n'est pas une raison, c'est un accusé de réception. */
const MIN_REASON_CHARS = 80

/**
 * Masque commentaires et littéraux par des espaces — les offsets sont conservés,
 * donc une position trouvée dans le masque désigne le même caractère dans
 * l'original. C'est ce qui permet de lire le CODE ici et le COMMENTAIRE là.
 */
function mask(source: string): string {
  const blank = (m: string): string => m.replace(/[^\n]/g, ' ')
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/\/\/[^\n]*/g, blank)
    .replace(/`(?:\\.|[^`\\])*`/g, blank)
    .replace(/'(?:\\.|[^'\\\n])*'/g, blank)
    .replace(/"(?:\\.|[^"\\\n])*"/g, blank)
}

function filesIn(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...filesIn(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** Le tableau qui suit `key:` dans un décorateur `@Module`, accolades appariées. */
function arrayAfter(masked: string, key: string): string {
  const at = masked.indexOf(`${key}:`)
  if (at < 0) return ''
  const start = masked.indexOf('[', at)
  if (start < 0) return ''
  let depth = 0
  for (let i = start; i < masked.length; i++) {
    if (masked[i] === '[') depth += 1
    else if (masked[i] === ']') {
      depth -= 1
      if (depth === 0) return masked.slice(start, i + 1)
    }
  }
  return ''
}

/** Les identifiants majuscules d'un tableau — `TypeOrmModule.forFeature([…])` compris. */
function namesIn(block: string): string[] {
  return [...block.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map(m => m[1] as string)
}

/**
 * Les classes qu'un tableau `providers` INSTANCIE vraiment. Un fournisseur objet
 * (`{ provide, inject: [X], useFactory: (x: X) => … }`) ne fournit pas `X` : il le
 * consomme — seul son `useClass` est une instance du module. Lire tout le bloc
 * accusait `ContactsModule` de déclarer `CreditsService` pour un simple `inject`.
 */
function providerNames(block: string): string[] {
  const classes = [...block.matchAll(/useClass:\s*([A-Z][A-Za-z0-9_]*)/g)].map(m => m[1] as string)
  let topLevel = ''
  let depth = 0
  for (const ch of block) {
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
    else if (depth === 0) topLevel += ch
  }
  return [...namesIn(topLevel), ...classes]
}

/** Le corps `{ … }` de la méthode qui suit `from`, accolades appariées. */
function methodBodyAfter(masked: string, from: number): string {
  const open = masked.indexOf('{', masked.indexOf(')', from))
  if (open < 0) return ''
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') depth += 1
    else if (masked[i] === '}') {
      depth -= 1
      if (depth === 0) return masked.slice(open, i + 1)
    }
  }
  return ''
}

/**
 * Le docblock qui PRÉCÈDE immédiatement `at` — décorateurs empilés tolérés entre
 * les deux, rien d'autre. Chaîne vide s'il n'y en a pas.
 */
function docblockBefore(source: string, at: number): string {
  const head = source.slice(0, at)
  const end = head.lastIndexOf('*/')
  if (end < 0) return ''
  const between = head.slice(end + 2)
  // Entre le docblock et le décorateur : uniquement du blanc et d'autres décorateurs.
  if (!/^[\s]*(?:@[A-Za-z0-9_]+\([^\n]*\)[\s]*)*$/.test(between)) return ''
  const start = head.lastIndexOf('/**', end)
  if (start < 0) return ''
  return head.slice(start, end + 2)
}

type ScheduledJob = {
  /** `apps/api/src/…` relatif, pour un message d'échec qu'on peut ouvrir. */
  readonly file: string
  readonly host: string
  readonly decorator: string
  readonly method: string
  /** Verrouillé par une des deux formes DIRECTES, lues dans le corps. */
  readonly directlyLocked: boolean
  /** Le jeton par lequel il reçoit un verrou, s'il en reçoit un. Sa fabrique
   *  reste à vérifier — un nom n'est pas une preuve. */
  readonly lockToken: string | null
  readonly reason: string | null
}

/**
 * `membre → JETON`, pour les paramètres de constructeur décorés `@Inject(...)`.
 *
 * Lu sur le MASQUE : un `@Inject` cité dans un commentaire n'est pas une
 * injection, et c'est exactement le genre de faux positif qui rend une garde
 * complaisante.
 */
function injectedMembers(masked: string): Map<string, string> {
  const out = new Map<string, string>()
  const pattern =
    /@Inject\(\s*([A-Za-z_$][\w$]*)\s*\)\s*(?:private\s+|public\s+|protected\s+)*(?:readonly\s+)?([A-Za-z_$][\w$]*)/g
  for (const match of masked.matchAll(pattern)) out.set(match[2] as string, match[1] as string)
  return out
}

/** Le jeton appelé comme `this.<membre>(` dans ce corps, s'il y en a un. */
function tokenCalledIn(body: string, members: ReadonlyMap<string, string>): string | null {
  for (const match of body.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    const token = members.get(match[1] as string)
    if (token) return token
  }
  return null
}

/**
 * Un jeton VERROUILLE-t-il vraiment ? La preuve : un module du dépôt le fournit
 * (`provide: <JETON>`) par une fabrique qui appelle `withSingletonLock`.
 *
 * Les deux conditions comptent. Sans la première, n'importe quel jeton passerait ;
 * sans la seconde, un jeton fourni par une fabrique qui n'exécute rien de
 * verrouillé passerait aussi — et ce serait pire qu'une garde absente.
 */
function tokenLocks(token: string, moduleSources: readonly string[]): boolean {
  return moduleSources.some(source => source.includes(`provide: ${token}`) && /withSingletonLock\s*\(/.test(source))
}

function collectJobs(): ScheduledJob[] {
  const jobs: ScheduledJob[] = []
  for (const file of filesIn(SRC)) {
    const source = readFileSync(file, 'utf8')
    const masked = mask(source)
    const members = injectedMembers(masked)
    for (const match of masked.matchAll(/^[ \t]*@(Cron|Interval|Timeout)\(/gm)) {
      const at = match.index ?? 0
      const decoratorLine = source.slice(at, source.indexOf('\n', at)).trim()
      const body = methodBodyAfter(masked, at)
      const methodMatch = masked.slice(at).match(/\n\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/)
      const classes = [...masked.slice(0, at).matchAll(/export class (\w+)/g)]
      const classAt = classes.length > 0 ? (classes[classes.length - 1]?.index ?? 0) : 0
      const docblocks = [docblockBefore(source, at), docblockBefore(source, classAt)]
      const reasoned = docblocks.find(block => block.includes(NO_LOCK_MARKER)) ?? null
      jobs.push({
        file: relative(SRC, file),
        host: classes[classes.length - 1]?.[1] ?? '(hors classe)',
        decorator: decoratorLine,
        method: methodMatch?.[1] ?? '(inconnue)',
        directlyLocked: /withSingletonLock\s*\(/.test(body) || /\.withLock\s*\(/.test(body),
        lockToken: tokenCalledIn(body, members),
        reason: reasoned === null ? null : (reasoned.split(NO_LOCK_MARKER)[1] ?? '').trim(),
      })
    }
  }
  return jobs
}

type ModuleFile = {
  readonly file: string
  readonly cls: string
  readonly providers: readonly string[]
  readonly imports: readonly string[]
}

function collectModules(): ModuleFile[] {
  const out: ModuleFile[] = []
  for (const file of filesIn(SRC)) {
    if (!file.endsWith('.module.ts')) continue
    const masked = mask(readFileSync(file, 'utf8'))
    const cls = masked.match(/export class (\w+)/)?.[1]
    if (!cls) continue
    out.push({
      file: relative(SRC, file),
      cls,
      providers: providerNames(arrayAfter(masked, 'providers')),
      imports: namesIn(arrayAfter(masked, 'imports')),
    })
  }
  return out
}

/** Les modules que `AppModule` atteint, directement ou par transitivité. */
function reachableModules(modules: readonly ModuleFile[]): Set<string> {
  const byName = new Map(modules.map(m => [m.cls, m]))
  const seen = new Set<string>()
  const queue = ['AppModule']
  while (queue.length > 0) {
    const name = queue.shift() as string
    if (seen.has(name)) continue
    seen.add(name)
    for (const imported of byName.get(name)?.imports ?? []) {
      if (byName.has(imported) && !seen.has(imported)) queue.push(imported)
    }
  }
  return seen
}

const JOBS = collectJobs()
const MODULE_FILES = collectModules()
const REACHABLE = reachableModules(MODULE_FILES)

/**
 * Le source MASQUÉ de chaque `*.module.ts`. C'est là que se lit la preuve qu'un
 * jeton verrouille vraiment — et le masque est indispensable : un
 * `withSingletonLock` CITÉ dans un docblock d'explication ne verrouille rien.
 */
const MODULE_SOURCES = MODULE_FILES.map(module => mask(readFileSync(join(SRC, module.file), 'utf8')))

/**
 * Verrouillé — par l'une des deux formes directes, ou par un jeton dont la
 * fabrique appelle `withSingletonLock`. Voir le docblock de tête (GA-07).
 */
function isLocked(job: ScheduledJob): boolean {
  return job.directlyLocked || (job.lockToken !== null && tokenLocks(job.lockToken, MODULE_SOURCES))
}

/** Les modules qui DÉCLARENT cet hôte comme provider. */
function declaringModules(host: string): ModuleFile[] {
  return MODULE_FILES.filter(m => m.providers.includes(host))
}

describe('GA-76 / GA-77 — le corpus est LU', () => {
  it('trouve les tâches planifiées du dépôt', () => {
    // Un chiffre plancher, pas exact : la garde ne doit pas tomber parce qu'on
    // ajoute un cron, elle doit tomber si elle cesse d'en voir.
    expect(JOBS.length).toBeGreaterThanOrEqual(20)
  })

  it('trouve les modules et les rattache à AppModule', () => {
    expect(MODULE_FILES.length).toBeGreaterThanOrEqual(40)
    expect(REACHABLE.has('AppModule')).toBe(true)
    expect(REACHABLE.size).toBeGreaterThanOrEqual(40)
  })

  it('voit les DEUX branches — des tâches verrouillées ET des tâches raisonnées', () => {
    // Sans cette assertion, une garde qui ne saurait reconnaître ni l'une ni
    // l'autre resterait verte sur un corpus qu'elle ne comprend pas.
    expect(JOBS.filter(job => isLocked(job)).length).toBeGreaterThanOrEqual(10)
    expect(JOBS.filter(job => !isLocked(job) && job.reason !== null).length).toBeGreaterThanOrEqual(4)
  })

  it('lit le CORPS de chaque méthode et le nom de son hôte', () => {
    expect(JOBS.every(job => job.host !== '(hors classe)')).toBe(true)
    expect(JOBS.every(job => job.method !== '(inconnue)')).toBe(true)
  })

  it('reconnaît les trois formes de prise de verrou', () => {
    // `withSingletonLock(this.locks, …)` — la forme majoritaire.
    expect(JOBS.some(job => isLocked(job) && job.host === 'NotificationsScheduler')).toBe(true)
    // `this.locks.withLock(…)` — la forme de `StatusMonitorService`, qui a
    // besoin d'un TTL sous les 5 minutes de son propre rythme.
    expect(JOBS.some(job => isLocked(job) && job.host === 'StatusMonitorService')).toBe(true)
    // Le verrou reçu par JETON — `BusinessMetricsSnapshotService` (#1645), qui ne
    // peut pas importer `SingletonLockService` sans faire monter GA-07.
    expect(JOBS.some(job => isLocked(job) && job.host === 'BusinessMetricsSnapshotService')).toBe(true)
  })

  it('sait dire NON — un jeton dont la fabrique ne verrouille RIEN ne compte pas', () => {
    const vraiModule = ['{ provide: UN_JETON, useFactory: () => withSingletonLock(locks, n, f) }']
    const fauxModule = ['{ provide: UN_JETON, useFactory: () => (n, f) => f() }']

    expect(tokenLocks('UN_JETON', vraiModule)).toBe(true)
    // Le nom est le même ; la fabrique n'appelle rien. C'est exactement la
    // porte de sortie qu'il ne faut pas laisser ouverte.
    expect(tokenLocks('UN_JETON', fauxModule)).toBe(false)
    // Et un jeton que PERSONNE ne fournit ne verrouille rien non plus.
    expect(tokenLocks('JETON_FANTOME', vraiModule)).toBe(false)
  })

  it('un `inject` de factory ne fait pas de la classe un fournisseur du module — un `useClass`, si', () => {
    const bloc = `[
      ContactsService,
      { provide: DEBIT, inject: [CreditsService], useFactory: (credits: CreditsService) => credits.x },
      { provide: CLOCK, useClass: SystemClock },
    ]`
    const noms = providerNames(bloc)
    expect(noms).toContain('ContactsService')
    expect(noms).toContain('SystemClock')
    expect(noms).not.toContain('CreditsService')
  })

  it('sait lire un membre injecté, et ne confond pas un appel voisin', () => {
    const classe = [
      'constructor(',
      '  private readonly metrics: X,',
      '  @Inject(SINGLETON_LOCK) private readonly underLock: UnderSingletonLock,',
      ') {}',
    ].join('\n')
    const membres = injectedMembers(classe)

    expect(membres.get('underLock')).toBe('SINGLETON_LOCK')
    expect(tokenCalledIn('{ await this.underLock("x", f) }', membres)).toBe('SINGLETON_LOCK')
    // `this.metrics` n'est pas injecté par jeton : il ne prouve aucun verrou.
    expect(tokenCalledIn('{ await this.metrics.take() }', membres)).toBeNull()
  })
})

describe('GA-76 — verrou câblé, ou raison écrite', () => {
  it('une tâche verrouillée vit dans un module qui DÉCLARE LocksModule', () => {
    const broken = JOBS.filter(job => isLocked(job)).flatMap(job => {
      const declaring = declaringModules(job.host)
      return declaring
        .filter(module => !module.imports.includes('LocksModule'))
        .map(module => `${job.file} · ${job.host}.${job.method} → ${module.file} n'importe pas LocksModule`)
    })
    // Un `@Optional()` non résolu ne lève pas : il DÉGRADE en silence. C'est le
    // défaut exact du 29/08 — cinq alertes par réplique, tous les matins.
    expect(broken).toEqual([])
  })

  it('une tâche NON verrouillée porte sa raison, derrière le marqueur', () => {
    const silent = JOBS.filter(job => !isLocked(job) && job.reason === null).map(
      job => `${job.file} · ${job.host}.${job.method} — ni verrou ni « ${NO_LOCK_MARKER} »`,
    )
    expect(silent).toEqual([])
  })

  it('une raison écrite dit quelque chose', () => {
    const thin = JOBS.filter(job => job.reason !== null && job.reason.length < MIN_REASON_CHARS).map(
      job => `${job.file} · ${job.host}.${job.method} — raison de ${job.reason?.length ?? 0} caractères`,
    )
    expect(thin).toEqual([])
  })

  it('une tâche verrouillée ne porte PAS de raison de ne pas l’être', () => {
    // Sinon le marqueur devient une formule qu'on recopie, et la garde ne
    // distingue plus un choix d'un copier-coller.
    const both = JOBS.filter(job => isLocked(job) && job.reason !== null).map(
      job => `${job.file} · ${job.host}.${job.method} — verrouillée ET marquée « ${NO_LOCK_MARKER} »`,
    )
    expect(both).toEqual([])
  })
})

describe('GA-77 — une tâche planifiée est montée', () => {
  it('chaque hôte est déclaré comme provider', () => {
    const orphans = JOBS.filter(job => declaringModules(job.host).length === 0).map(
      job => `${job.file} · ${job.host}.${job.method} — aucun module ne le déclare en provider`,
    )
    // Un `@Cron` sur une classe que personne ne déclare n'est jamais découvert :
    // le code est juste, testé, et ne tourne pas.
    expect(orphans).toEqual([])
  })

  it('chaque module déclarant est atteint par AppModule', () => {
    const unreachable = JOBS.flatMap(job =>
      declaringModules(job.host)
        .filter(module => !REACHABLE.has(module.cls))
        .map(module => `${job.file} · ${job.host}.${job.method} → ${module.cls} hors du graphe d'AppModule`),
    )
    expect(unreachable).toEqual([])
  })

  it('l’ordonnanceur lui-même est monté', () => {
    // `ScheduleModule.forRoot()` vit à UN endroit (outbox.module) et arme tout
    // le processus. Sans lui, les vingt-trois décorateurs sont décoratifs.
    //
    // ⚠️ `mask()` et non le fichier brut : `watchlist-refresh.module.ts` CITE
    // `ScheduleModule.forRoot()` dans son docblock pour expliquer d'où lui vient
    // l'ordonnanceur. La première version de cette assertion comptait donc deux
    // hôtes là où il n'y en a qu'un — un corpus qui garde ses commentaires ment.
    const hosts = MODULE_FILES.filter(module =>
      mask(readFileSync(join(SRC, module.file), 'utf8')).includes('ScheduleModule.forRoot()'),
    )
    expect(hosts.map(module => module.cls)).toEqual(['OutboxModule'])
    expect(REACHABLE.has('OutboxModule')).toBe(true)
  })
})
