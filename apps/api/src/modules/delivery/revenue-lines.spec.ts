import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RevenueService } from './revenue.service'

/**
 * Les quatre chiffres d'affaires, et le zéro qui n'en était pas un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre requêtes écrivaient `COALESCE(SUM(...), 0)`. En SQL, `SUM()` sur
 * un ensemble VIDE rend `NULL` — le `COALESCE` transformait donc « aucune ligne
 * n'existe » en **0 €**, et l'écran l'affichait comme un montant mesuré.
 *
 * Le cas le plus net est l'ENCAISSÉ : `invoice_readiness.paid_at` est LU ici et
 * par le calcul du délai de paiement, et **écrit par rien dans tout le dépôt**.
 * Tous les espaces lisaient donc « chiffre d'affaires encaissé : 0 € », ce qui
 * se lit « nos clients n'ont rien payé » alors que la vérité est « personne n'a
 * jamais enregistré un paiement ici ». Les deux ne mènent pas à la même
 * décision : la première fait appeler la comptabilité, la seconde fait remplir
 * une fiche.
 *
 * Le contrat, lui, était déjà juste — `amountCents: null` y est documenté
 * « pas de source pour ce chiffre, jamais 0 ». C'est le SQL qui le contredisait.
 */

type Row = { cents: string | null; without_amount: string | null; source_rows: string | null }

function serviceReturning(rows: Row[]): RevenueService {
  const manager = { query: async () => rows }
  return new RevenueService({ manager } as never)
}

/** Le raccourci vers la ligne privée, sans passer par les quatre requêtes. */
async function line(rows: Row[]) {
  const service = serviceReturning(rows)
  const sum = (service as unknown as { sum: (k: string, sql: string, p: unknown[]) => Promise<unknown> }).sum
  return (await sum.call(service, 'collected', 'SELECT 1', [])) as {
    amountCents: number | null
    withoutAmount: number
    unavailableReason: string | null
  }
}

describe('les quatre chiffres d’affaires — une absence n’est pas un zéro', () => {
  it('AUCUNE source : le montant est `null` et la raison le DIT', async () => {
    const result = await line([{ cents: null, without_amount: '0', source_rows: '0' }])
    expect(result.amountCents).toBeNull()
    expect(result.unavailableReason).toBe('no_source')
  })

  it('des lignes, mais aucune chiffrée : `null` aussi, et une AUTRE raison', async () => {
    // « Trois factures enregistrées, aucune avec son montant » et « aucune
    // facture » ne se réparent pas de la même façon.
    const result = await line([{ cents: null, without_amount: '3', source_rows: '3' }])
    expect(result.amountCents).toBeNull()
    expect(result.unavailableReason).toBe('no_amount')
    expect(result.withoutAmount).toBe(3)
  })

  it('un vrai zéro RESTE zéro — il existe, et il se distingue de l’absence', async () => {
    // Une mission signée à 0 € est une anomalie de saisie, pas une absence de
    // donnée : la masquer empêcherait de la voir.
    const result = await line([{ cents: '0', without_amount: '0', source_rows: '2' }])
    expect(result.amountCents).toBe(0)
    expect(result.unavailableReason).toBeNull()
  })

  it('un montant réel passe intact', async () => {
    const result = await line([{ cents: '125000', without_amount: '1', source_rows: '4' }])
    expect(result.amountCents).toBe(125_000)
    expect(result.withoutAmount).toBe(1)
    expect(result.unavailableReason).toBeNull()
  })

  it('une lecture en ÉCHEC reste distincte des deux — c’est une panne, pas une absence', async () => {
    const service = new RevenueService({
      manager: {
        query: async () => {
          throw new Error('boom')
        },
      },
    } as never)
    const sum = (service as unknown as { sum: (k: string, sql: string, p: unknown[]) => Promise<unknown> }).sum
    const result = (await sum.call(service, 'collected', 'SELECT 1', [])) as { unavailableReason: string | null }
    expect(result.unavailableReason).toBe('unavailable')
  })
})

// #2197.41 — LE TEST QUI COMPTE : le FACTURÉ (`RevenueLine` `kind: 'invoiced'`)
// est un agrégat financier public — le patron y lit ce qui est sorti vers
// l'outil comptable. Il filtrait `r.invoiced_at IS NOT NULL`, une colonne posée
// par le SEUL chemin d'écriture existant (`markInvoiced`, une DÉCLARATION sans
// aucune preuve de connecteur) : ce total comptait donc, depuis l'origine,
// une déclaration humaine comme si elle avait été prouvée.
describe('#2197.41 — le FACTURÉ ne compte que le PROUVÉ, jamais le DÉCLARÉ', () => {
  it("la requête « invoiced » filtre sur `r.state = 'invoiced'`, pas seulement `invoiced_at IS NOT NULL`", async () => {
    const queries: string[] = []
    const service = new RevenueService({
      manager: {
        query: async (sql: string) => {
          queries.push(sql)
          return [{ cents: null, without_amount: '0', source_rows: '0' }]
        },
      },
    } as never)
    await service.breakdown({ kind: 'workspace', workspaceId: 'w1' }, '2026-08')
    // La requête FACTURÉ est celle qui lit `invoiced_amount_cents` — distincte
    // de la requête ENCAISSÉ, qui lit `paid_amount_cents` sur la même table.
    const invoicedQuery = queries.find(sql => sql.includes('r.invoiced_amount_cents'))
    expect(invoicedQuery).toBeDefined()
    expect(invoicedQuery).toContain("r.state = 'invoiced'")
    expect(invoicedQuery).not.toContain('r.invoiced_at IS NOT NULL')
  })
})

// #2407.10 / #2417.7 — LE NO-GO : un TJM qui change ne doit jamais réécrire le
// CA « produit » d'un mois déjà clos. `produced()` recalcule en direct depuis
// `missions.daily_rate` à chaque lecture — sans une source de tarif PASSÉ, un
// changement de TJM aujourd'hui change silencieusement le produit de tous les
// mois d'hier. Ce test casse le jour où quelqu'un revient à `m.daily_rate` nu.
describe('#2407.10 / #2417.7 — le CA produit lit le TJM EN VIGUEUR au mois, pas le TJM courant', () => {
  it('la requête « produced » choisit le tarif via `mission_rate_history` avant de retomber sur le tarif courant', async () => {
    const queries: string[] = []
    const service = new RevenueService({
      manager: {
        query: async (sql: string) => {
          queries.push(sql)
          return [{ cents: null, without_amount: '0', source_rows: '0' }]
        },
      },
    } as never)
    await service.breakdown({ kind: 'workspace', workspaceId: 'w1' }, '2026-08')
    const producedQuery = queries.find(sql => sql.includes('FROM mission_timesheets'))
    expect(producedQuery).toBeDefined()
    // La fenêtre historique est consultée EN PREMIER (LATERAL), et seule son
    // absence retombe sur `m.daily_rate` — jamais l'inverse.
    expect(producedQuery).toContain('mission_rate_history')
    expect(producedQuery).toContain('COALESCE(h.daily_rate, m.daily_rate)')
    expect(producedQuery).toContain('ts.period_month >= mrh.effective_from')
    expect(producedQuery).toContain('ts.period_month < mrh.effective_to')
  })
})

describe('les requêtes ne rattrapent plus le vide en zéro', () => {
  it('aucune requête ne COALESCE sa somme à 0', () => {
    // Garde de FORME : c'est le `COALESCE(SUM(...), 0)` qui produisait le faux
    // zéro, et il se réintroduit d'un copier-coller. Le compter est plus sûr
    // que de rejouer les requêtes SQL contre une base.
    // ⚠️ Les COMMENTAIRES sont retirés d'abord : la première version de cette
    // garde s'est déclenchée sur sa propre explication, qui cite le motif
    // fautif. Même leçon que GA-08, où une apostrophe française se lisait comme
    // une chaîne — une garde doit lire le CODE, pas la prose qui l'entoure.
    const raw = readFileSync(join(__dirname, 'revenue.service.ts'), 'utf8')
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(source).not.toMatch(/COALESCE\(SUM\(/)
    // Et chacune ramène de quoi distinguer « vide » de « zéro ». Cinq
    // désormais : les QUATRE lignes de `breakdown()` (signed/produced/
    // invoiced/collected, doctrine inchangée) + `confirmedRevenue` (#2900),
    // une dérivation séparée qui n'en fait pas un cinquième chiffre d'affaires.
    expect((source.match(/AS source_rows/g) ?? []).length).toBe(5)
  })
})
