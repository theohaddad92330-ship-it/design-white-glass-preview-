import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-20 — un repository injecté est un repository DÉCLARÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `@InjectRepository(Foo)` dans un service, sans `TypeOrmModule.forFeature([Foo])`
 * dans son module : Nest ne peut pas résoudre la dépendance, l'application ne
 * DÉMARRE pas, et le déploiement échoue au healthcheck.
 *
 * Ce qui rend le défaut si coûteux, c'est qu'**aucun test ne tombe** : les
 * tests unitaires construisent le service à la main (`new Service(repo as never)`),
 * donc ils ne passent jamais par l'injection. Les 5 767 tests de l'API étaient
 * verts, le typecheck aussi, le build aussi — et la production refusait de
 * démarrer.
 *
 * C'est arrivé DEUX fois : le 22/08/2026 (« l'API ne démarrait plus — un
 * repository injecté sans être déclaré ») et le 23/08 avec la veille
 * territoriale. La deuxième occurrence est ce qui justifie une garde plutôt
 * qu'un rappel.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────
 * Un module peut recevoir un repository d'un module IMPORTÉ qui ré-exporte
 * `TypeOrmModule`. La garde suit les imports de modules locaux ; ce qu'elle ne
 * résout pas est listé dans `KNOWN_INDIRECT`, avec le module d'où vient le
 * repository. Une liste explicite vaut mieux qu'une heuristique qui laisserait
 * passer le cas qu'on veut attraper.
 */

const MODULES = join(__dirname, '..', 'modules')

/**
 * Les paires (module, entité) dont le repository vient d'ailleurs.
 *
 * Chaque ligne est un constat vérifié à la main. Elle ne doit s'allonger que
 * quand on a lu le module d'origine et confirmé qu'il ré-exporte bien
 * `TypeOrmModule` — sinon on ajoute au vert un cas qui casse en production.
 */
const KNOWN_INDIRECT = new Set<string>()

function moduleDirs(): string[] {
  return readdirSync(MODULES).filter(entry => statSync(join(MODULES, entry)).isDirectory())
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

/**
 * Les entités passées à `forFeature([...])`, y compris sur plusieurs lignes.
 *
 * ⚠️ Les commentaires sont retirés AVANT toute lecture — même leçon que GA-08.
 * Les listes de ce dépôt sont commentées ligne par ligne, et un commentaire qui
 * contient une virgule ou un crochet fermant faisait manquer l'entité qui le
 * suit : la garde annonçait alors sept modules fautifs qui ne l'étaient pas,
 * c'est-à-dire exactement ce qui fait désactiver une garde.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function declaredIn(source: string): Set<string> {
  const declared = new Set<string>()
  for (const match of withoutComments(source).matchAll(/forFeature\(\s*\[([\s\S]*?)\]/g)) {
    for (const name of (match[1] ?? '').split(',')) {
      const trimmed = name.trim()
      if (/^[A-Z][A-Za-z0-9_]*$/.test(trimmed)) declared.add(trimmed)
    }
  }
  return declared
}

/** Les modules LOCAUX importés par un module, pour suivre les ré-exports. */
function importedLocalModules(source: string): string[] {
  return [...withoutComments(source).matchAll(/from '\.\.\/([a-z0-9-]+)\/[a-zA-Z0-9.-]*module'/g)].map(
    match => match[1] as string,
  )
}

describe('GA-20 — un repository injecté est déclaré dans son module', () => {
  const dirs = moduleDirs()

  const declaredByModule = new Map<string, Set<string>>()
  for (const dir of dirs) {
    const moduleFiles = filesIn(join(MODULES, dir)).filter(file => file.endsWith('.module.ts'))
    const declared = new Set<string>()
    for (const file of moduleFiles) for (const name of declaredIn(readFileSync(file, 'utf8'))) declared.add(name)
    declaredByModule.set(dir, declared)
  }

  const missing: string[] = []
  for (const dir of dirs) {
    const moduleFiles = filesIn(join(MODULES, dir)).filter(file => file.endsWith('.module.ts'))
    if (moduleFiles.length === 0) continue

    // Ce que ce module voit : ses propres déclarations, plus celles des modules
    // locaux qu'il importe (un module qui ré-exporte `TypeOrmModule` passe ses
    // repositories à qui l'importe).
    const visible = new Set(declaredByModule.get(dir) ?? [])
    for (const file of moduleFiles) {
      for (const imported of importedLocalModules(readFileSync(file, 'utf8'))) {
        for (const name of declaredByModule.get(imported) ?? []) visible.add(name)
      }
    }

    for (const file of filesIn(join(MODULES, dir))) {
      if (file.endsWith('.module.ts')) continue
      const source = readFileSync(file, 'utf8')
      for (const match of withoutComments(source).matchAll(/@InjectRepository\(\s*([A-Z][A-Za-z0-9_]*)\s*\)/g)) {
        const entity = match[1] as string
        if (visible.has(entity)) continue
        if (KNOWN_INDIRECT.has(`${dir}:${entity}`)) continue
        missing.push(`${dir} injecte ${entity} sans le déclarer`)
      }
    }
  }

  it('aucun service n’injecte un repository que son module ne déclare pas', () => {
    // Si ce test tombe : ajoute l'entité au `forFeature([...])` de ton module.
    // L'application ne démarrerait PAS en production, et aucun test unitaire ne
    // le verrait — ils construisent le service à la main.
    expect(missing).toEqual([])
  })

  it('la garde lit bien des injections — sinon elle serait verte pour toujours', () => {
    const injections = dirs
      .flatMap(dir => filesIn(join(MODULES, dir)))
      .reduce((acc, file) => acc + (readFileSync(file, 'utf8').match(/@InjectRepository\(/g)?.length ?? 0), 0)
    expect(injections).toBeGreaterThan(50)
  })
})
