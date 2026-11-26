import { DEMO_ESN_PROFILE } from './demo-dataset'
import { buildEsnProfileBindings, esnProfileColumnType } from './demo-seed.service'

/**
 * #2582 — LA SALLE DE DÉMO ÉTAIT VIDE, ET PERSONNE NE LE VOYAIT.
 *
 * Mesuré en production le 18/09/2026, dans le journal de `belllum-backend-service` :
 *
 *   [ERRO] Demo pool: repair failed — the room is served AS IS rather than refused
 *   column "esn_objectives" is of type jsonb but expression is of type text[]
 *     at DemoSeedService.seedEsnProfile
 *
 * `seedEsnProfile` est la PREMIÈRE écriture du semis. Elle jetait donc avant
 * toutes les autres, `tidy()` avalait l'exception pour ne pas fermer la porte, et
 * le prospect entrait dans une salle à zéro compte, zéro mission, zéro talent,
 * zéro besoin — sans qu'aucun 500 ne le signale. Un semis qui échoue en silence
 * coûte plus cher qu'un semis qui refuse : on le découvre en réunion.
 *
 * Cette garde lit DEUX corpus réels — les colonnes déclarées sur l'entité et les
 * clés réellement semées — et elle sait dire NON : remettre le prédicat de forme
 * (`Array.isArray(value) ? '::text[]' : ''`) fait tomber le troisième cas.
 */
describe('GA — le cast d’une colonne de profil ESN se décide sur SON TYPE', () => {
  const entries = Object.entries(DEMO_ESN_PROFILE) as ReadonlyArray<[string, unknown]>

  it('le corpus n’est pas vide : l’entité déclare des colonnes jsonb, et le semis en remplit', () => {
    const jsonbColumns = entries.map(([column]) => column).filter(column => esnProfileColumnType(column) === 'jsonb')
    // Sans cette borne, un `esnProfileColumnType` qui rendrait toujours `null`
    // ferait passer les deux tests suivants en ne lisant rien du tout.
    expect(`colonnes jsonb semées : ${jsonbColumns.length}`).not.toBe('colonnes jsonb semées : 0')
    expect(jsonbColumns).toContain('esn_objectives')
  })

  it('esn_objectives est un tableau d’OBJETS — c’est ce qui trompait le prédicat de forme', () => {
    const objectives = DEMO_ESN_PROFILE.esn_objectives
    expect(Array.isArray(objectives)).toBe(true)
    expect(objectives.length).toBeGreaterThan(0)
    expect(typeof objectives[0]).toBe('object')
  })

  it('AUCUNE colonne jsonb n’est castée en text[], et sa valeur part en JSON', () => {
    const { placeholders, values } = buildEsnProfileBindings(entries, esnProfileColumnType)

    const fautives = entries
      .map(([column], index) => ({ column, placeholder: placeholders[index], value: values[index] }))
      .filter(({ column }) => esnProfileColumnType(column) === 'jsonb')
      .filter(({ placeholder, value }) => !placeholder.endsWith('::jsonb') || typeof value !== 'string')
      .map(({ column, placeholder }) => `${column} → ${placeholder}`)

    expect(fautives).toEqual([])
  })

  it('un tableau de CHAÎNES dans une colonne text[] garde son cast text[]', () => {
    // La correction ne doit pas emporter le cas légitime avec elle : une garde
    // qui attrape ce qu'elle ne vise pas est aussi fausse qu'une garde aveugle.
    const { placeholders } = buildEsnProfileBindings(entries, esnProfileColumnType)
    const index = entries.findIndex(([column]) => column === 'target_sectors')
    expect(index).toBeGreaterThanOrEqual(0)
    expect(placeholders[index]).toMatch(/::text\[\]$/)
  })
})
