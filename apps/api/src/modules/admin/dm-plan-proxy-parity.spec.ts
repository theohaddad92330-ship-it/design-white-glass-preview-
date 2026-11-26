import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { updatePlanSchema } from './dto/update-plan.dto'

/**
 * Parity guard between the API's `updatePlanSchema` and the dashboard-manager's
 * server-side proxy for `PATCH /api/admin/plans/:key`.
 *
 * The proxy copies a hardcoded list of fields into the patch it forwards. A
 * field the DTO accepts but the list omits is dropped IN SILENCE: the request
 * still contains the other fields, so the API answers 200 and the editor shows
 * a success tick, while the value never changed. `extra_seat_price` shipped in
 * that state — added to the editor and the DTO by #588, never added to the
 * proxy — so for its whole lifetime no operator could change the per-seat
 * price, and none of them was told.
 *
 * The dashboard-manager has no test runner of its own, so the guard lives here,
 * next to the schema that defines the contract. It reads the proxy as text on
 * purpose: importing it would pull in the Next.js runtime, and the failure mode
 * we are guarding against is a literal list drifting out of sync, which is
 * exactly what text can prove.
 */
describe('dashboard-manager plan proxy ↔ updatePlanSchema parity', () => {
  const PROXY = join(__dirname, '../../../../dashboard-manager/src/app/api/admin/plans/[key]/route.ts')
  const source = readFileSync(PROXY, 'utf8')

  /** The field names the proxy actually forwards (`label` + NUMERIC_FIELDS +
   *  ARRAY_FIELDS). Chaque famille a sa boucle de validation dans le proxy ; en
   *  oublier une ici rendrait le garde aveugle au champ qu'il doit protéger. */
  function forwardedFields(): string[] {
    const numeric = /const NUMERIC_FIELDS = \[([^\]]*)\]/.exec(source)
    if (!numeric) throw new Error(`NUMERIC_FIELDS not found in ${PROXY} — did the proxy change shape?`)
    const arrays = /const ARRAY_FIELDS = \[([^\]]*)\]/.exec(source)
    if (!arrays) throw new Error(`ARRAY_FIELDS not found in ${PROXY} — did the proxy change shape?`)
    const fields = [...numeric[1].matchAll(/'([^']+)'/g), ...arrays[1].matchAll(/'([^']+)'/g)].map(m => m[1])
    // `label` is handled by its own branch rather than the numeric loop.
    if (/patch\.label = /.test(source)) fields.push('label')
    return fields
  }

  it('forwards EVERY field the API accepts (a missing one is dropped in silence)', () => {
    const accepted = Object.keys(updatePlanSchema.shape)
    const forwarded = forwardedFields()

    const dropped = accepted.filter(field => !forwarded.includes(field))
    expect(dropped).toEqual([])
  })

  it('forwards nothing the API would reject (a stray field would 400 the whole edit)', () => {
    const accepted = Object.keys(updatePlanSchema.shape)
    const unknown = forwardedFields().filter(field => !accepted.includes(field))
    expect(unknown).toEqual([])
  })

  it('rejects unknown fields instead of dropping them (no future silent drop)', () => {
    // The proxy must refuse a body it does not fully understand rather than
    // forward a subset and report success — the generalisation of the bug.
    expect(source).toMatch(/KNOWN_FIELDS/)
    expect(source).toMatch(/status: 400/)
  })

  it('still covers the field that shipped broken (extra_seat_price)', () => {
    expect(forwardedFields()).toContain('extra_seat_price')
  })

  it('couvre la grille de features (une liste, pas un nombre)', () => {
    // `features` ne passe pas par la boucle numérique : sans sa propre boucle
    // dans le proxy, il serait jeté exactement comme `extra_seat_price` l'a été.
    expect(forwardedFields()).toContain('features')
  })
})
