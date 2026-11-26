/**
 * #4682.4 — « une garde qui n'inspecte rien est un faux vert » : le balayage des AUTRES gardes d'architecture.
 *
 * GA-05 était verte pendant qu'une route nue passait ; le défaut n'était pas propre à elle. Une garde-plafond
 * (`toBeLessThanOrEqual(GEL)`) qui lit le dépôt SANS jamais exiger d'avoir lu quelque chose reste verte si son
 * balayage ne trouve plus aucun fichier (dossier déplacé, glob faux) : 0 occurrence ≤ plafond. Ici, on COMPTE les
 * gardes qui lisent le dépôt, et chacune dotée d'un plafond doit aussi porter un PLANCHER (`toBeGreaterThan`).
 * Le compte inspecté est rendu ; `0 inspecté` échoue.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = __dirname
const THIS_FILE = 'architecture-guards-inspect-something.spec.ts'

const READS_THE_REPO = /readFileSync|readdirSync|globSync|execSync|execFileSync|spawnSync|readFile\(/
const HAS_CEILING = /toBeLessThanOrEqual\(|toBeLessThan\(/
const HAS_FLOOR = /toBeGreaterThan(OrEqual)?\(|not\.toHaveLength\(0\)/

/** Les gardes-plafond qui lisent le dépôt, sans plancher : le faux vert. */
export function ceilingOnlyGuards(sources: Readonly<Record<string, string>>): string[] {
  return Object.entries(sources)
    .filter(([, source]) => READS_THE_REPO.test(source) && HAS_CEILING.test(source) && !HAS_FLOOR.test(source))
    .map(([file]) => file)
}

const specs = readdirSync(HERE).filter(name => name.endsWith('.spec.ts') && name !== THIS_FILE)
const sources = Object.fromEntries(specs.map(name => [name, readFileSync(join(HERE, name), 'utf8')]))
const readers = Object.keys(sources).filter(name => READS_THE_REPO.test(sources[name] ?? ''))
const ceilings = readers.filter(name => HAS_CEILING.test(sources[name] ?? ''))

describe('#4682.4 — les gardes d’architecture inspectent quelque chose', () => {
  it('le balayage inspecte des gardes (0 inspecté = faux vert), et en rend le compte', () => {
    process.stdout.write(
      `#4682.4 — ${specs.length} gardes lues, ${readers.length} lisent le dépôt, ${ceilings.length} portent un plafond\n`,
    )
    expect(specs.length).toBeGreaterThan(0)
    expect(readers.length).toBeGreaterThan(0)
    expect(ceilings.length).toBeGreaterThan(0)
  })

  it('aucune garde-plafond ne lit le dépôt sans exiger un plancher', () => {
    expect(ceilingOnlyGuards(sources)).toEqual([])
  })

  it('SAIT DIRE NON : un plafond seul est vu, un plafond avec plancher ne l’est pas', () => {
    const vacuous = 'const files = readdirSync(x); expect(files.length).toBeLessThanOrEqual(10)'
    const sound = `${vacuous}; expect(files.length).toBeGreaterThan(0)`
    expect(ceilingOnlyGuards({ 'a.spec.ts': vacuous })).toEqual(['a.spec.ts'])
    expect(ceilingOnlyGuards({ 'b.spec.ts': sound })).toEqual([])
    expect(ceilingOnlyGuards({ 'c.spec.ts': 'expect(1).toBeLessThan(2)' })).toEqual([])
  })
})
