import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-69 — un service qui APPELLE `withSingletonLock` vit dans un module qui
 * IMPORTE `LocksModule`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, ET POURQUOI UNE GARDE TEXTUELLE NE SUFFISAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `CostAlertService` (le passage de 07:05) écrivait
 * `withSingletonLock(this.locks, 'cost-alert', …)` avec un commentaire disant
 * en toutes lettres pourquoi trois répliques ne devaient pas envoyer trois fois
 * la même alerte. `AnalyticsModule` n'importait pas `LocksModule`. L'injection
 * étant `@Optional()`, Nest résolvait `undefined` sans rien lever au démarrage,
 * et `withSingletonLock` dégrade DÉLIBÉRÉMENT en exécution directe quand le
 * service est absent (`singleton-lock.service.ts` : « sans REDIS_URL … le
 * comportement mono-réplique est inchangé »). Résultat : un verrou écrit,
 * testé, commenté — et mort. L'alerte de coût et les quatre alertes
 * d'observabilité qu'elle déclenche partaient une fois par réplique.
 *
 * La garde qui existait (`observability-alerts.spec.ts`) vérifiait que la
 * chaîne `withSingletonLock(` était PRÉSENTE dans le fichier. Elle était verte
 * pendant tout ce temps : elle gardait l'APPEL, jamais le CÂBLAGE. C'est le
 * défaut « une garde protège une règle, elle ne l'invente pas » — le fait à
 * garder (le module déclare sa dépendance) n'avait pas de nom.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle part des APPELANTS, pas d'une liste écrite à la main — une liste
 * recopiée oublie le prochain service. Pour chaque fichier de `src/modules`
 * (hors specs) qui appelle `withSingletonLock(` ou `SingletonLockService`, elle
 * remonte au `*.module.ts` du même dossier de module et exige que
 * `LocksModule` y soit importé.
 *
 * Limite connue et ASSUMÉE : elle raisonne par dossier de module, ce qui est la
 * convention de ce dépôt (`modules/<nom>/<nom>.module.ts`). Un service déplacé
 * hors de son dossier échapperait à la garde — l'assertion de corpus ci-dessous
 * échouerait alors, parce qu'elle exige un nombre plancher d'appelants trouvés.
 */
const MODULES_DIR = join(__dirname, '..')

/** Retire commentaires et chaînes pour ne raisonner que sur du CODE. */
function codeOf(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/**
 * Le contenu du tableau `imports: [ … ]` du décorateur `@Module`, et RIEN
 * d'autre.
 *
 * ⚠️ Première version de cette garde : elle cherchait `LocksModule` dans le
 * FICHIER. Elle est restée verte pendant que je retirais la ligne du tableau —
 * parce que l'`import { LocksModule } from …` en tête suffisait à la
 * satisfaire. Une garde qui confond « le symbole est mentionné » et « le module
 * est déclaré » ne garde rien : c'est le cas le plus courant du câblage mort
 * qu'elle est censée trouver. D'où ce comptage d'accolades, qui saute les
 * tableaux imbriqués (`TypeOrmModule.forFeature([…])`).
 */
function importsArrayOf(code: string): string | null {
  const at = code.indexOf('imports:')
  if (at < 0) return null
  const open = code.indexOf('[', at)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if (code[i] === '[') depth += 1
    else if (code[i] === ']') {
      depth -= 1
      if (depth === 0) return code.slice(open + 1, i)
    }
  }
  return null
}

/** `modules/<nom>/…` → le nom du dossier de module de premier niveau. */
function moduleFolderOf(file: string): string | null {
  const relative = file.slice(MODULES_DIR.length + 1)
  const first = relative.split('/')[0]
  return first && relative.includes('/') ? first : null
}

describe('GA-69 — un appel à withSingletonLock suppose un LocksModule déclaré', () => {
  const files = walk(MODULES_DIR)

  // Les APPELANTS : le fichier appelle l'aide, ou injecte le service lui-même.
  const callers = files.filter(file => {
    if (file.includes(`${'/'}locks${'/'}`)) return false
    const code = codeOf(file)
    return code.includes('withSingletonLock(') || code.includes('SingletonLockService')
  })

  it('lit un corpus NON VIDE — sinon la garde ne garde rien', () => {
    // Un chemin faux, un filtre trop gourmand ou un renommage rendraient une
    // liste vide, et la boucle ci-dessous passerait en ne vérifiant RIEN.
    expect(files.length).toBeGreaterThan(200)
    expect(callers.length).toBeGreaterThanOrEqual(10)
    // Et le corpus doit contenir le cas qui a motivé la garde.
    expect(callers.some(file => file.endsWith('cost-alert.service.ts'))).toBe(true)
    expect(callers.some(file => file.endsWith('privacy-retention.service.ts'))).toBe(true)
  })

  it('l’extracteur lit le TABLEAU imports, pas la ligne d’import', () => {
    // La garde s'est trompée une première fois exactement là. On vérifie donc
    // l'outil lui-même : il doit rendre le contenu du tableau, et ce contenu ne
    // doit pas contenir d'instruction `import … from …`.
    const privacy = codeOf(join(MODULES_DIR, 'privacy', 'privacy.module.ts'))
    const declared = importsArrayOf(privacy)
    expect(declared).not.toBeNull()
    expect(declared).toContain('LocksModule')
    expect(declared).not.toContain('from ')
    // Et sur un module qui NE déclare pas le verrou, l'extracteur doit le dire
    // même si le symbole apparaît ailleurs dans le fichier.
    expect(importsArrayOf('import { LocksModule } from "x"\n@Module({ imports: [Other] })')).toBe('Other')
  })

  it('chaque module qui appelle le verrou importe LocksModule', () => {
    const missing: string[] = []

    for (const caller of callers) {
      const folder = moduleFolderOf(caller)
      if (!folder) continue
      const modulePath = join(MODULES_DIR, folder, `${folder}.module.ts`)
      let moduleCode: string
      try {
        moduleCode = codeOf(modulePath)
      } catch {
        // Pas de module au nom canonique : on ne devine pas, on le SIGNALE.
        missing.push(`${folder} (aucun ${folder}.module.ts lisible)`)
        continue
      }
      const declared = importsArrayOf(moduleCode)
      if (declared === null) {
        // Un module sans tableau `imports:` ne peut pas déclarer le verrou.
        missing.push(`${folder} (aucun tableau imports:)`)
        continue
      }
      if (!declared.includes('LocksModule')) missing.push(folder)
    }

    // Le message porte les modules fautifs : une garde qui dit « non » doit
    // dire OÙ, sinon elle coûte une demi-heure à chaque fois qu'elle rougit.
    expect(missing).toEqual([])
  })
})
