import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROUTE_EMPTY_STATES,
  ROUTE_MIGRATION_KEYS,
  emptyStateViolations,
  uncoveredEmptyStateRouteKeys,
} from '@bellum/contracts'

/**
 * #2958.104 (lot M12, 09/10) — NO-GO « une page migrée est vide sans porte de
 * sortie », sur LES VINGT ET UNE routes du registre #2154.3/#2208.
 *
 * Trois routes étaient vérifiées (Écritures, Contacts, Projets). Ce fichier
 * couvre les vingt et une : chaque écran de destination est RELU, et chacun
 * doit porter, littéralement, sa branche vide ET le geste qui en sort
 * (`route-migration-empty-states.ts`). Une porte retirée, une route ajoutée
 * au registre sans entrée ici, ou une liste apparue dans un écran classé
 * « sans liste » : la CI échoue.
 *
 * La garde sait dire NON — prouvé plus bas sur une source réelle dont on a
 * retiré la porte, et sur un registre amputé d'une route.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const read = (file: string): string => readFileSync(join(repoRoot, file), 'utf8')

describe('#2958.104 — chaque route migrée a un état vide avec une porte de sortie', () => {
  it('couvre les 21 routes du registre, une entrée chacune', () => {
    expect(uncoveredEmptyStateRouteKeys()).toEqual([])
    const keys = ROUTE_EMPTY_STATES.map(entry => entry.routeMigrationKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toHaveLength(ROUTE_MIGRATION_KEYS.length)
  })

  it.each(ROUTE_EMPTY_STATES.map(entry => [entry.routeMigrationKey, entry] as const))(
    '%s — l’écran porte vraiment sa branche vide et sa porte',
    (_key, entry) => {
      for (const proof of entry.proofs) expect(existsSync(join(repoRoot, proof.file)), proof.file).toBe(true)
      expect(emptyStateViolations(entry, read)).toEqual([])
    },
  )
})

describe('#2958.104 — la garde sait dire NON', () => {
  it('voit une porte retirée d’un écran réel', () => {
    const chains = ROUTE_EMPTY_STATES.find(entry => entry.routeMigrationKey === 'chaines')
    const door = chains?.proofs[0]?.markers.find(marker => marker.includes('<Link'))
    expect(door).toBeDefined()
    const withoutDoor = (file: string) => read(file).split(door!).join('')
    expect(emptyStateViolations(chains!, withoutDoor)).toEqual([`${chains!.proofs[0]!.file} : manque ${door}`])
  })

  it('voit une route du registre sans entrée', () => {
    const amputated = ROUTE_EMPTY_STATES.filter(entry => entry.routeMigrationKey !== 'vivier')
    expect(uncoveredEmptyStateRouteKeys(amputated)).toEqual(['vivier'])
  })

  it('voit une liste apparue dans un écran classé « sans liste »', () => {
    const settings = ROUTE_EMPTY_STATES.find(entry => entry.status === 'not_a_list')
    expect(settings).toBeDefined()
    expect(emptyStateViolations(settings!, read)).toEqual([])
    const grown = (file: string) => `${read(file)}\nconst empty = rows.length === 0\n`
    expect(emptyStateViolations(settings!, grown)).toHaveLength(1)
  })
})
