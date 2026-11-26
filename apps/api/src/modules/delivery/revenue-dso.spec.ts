import { RevenueService } from './revenue.service'

/**
 * Le délai de paiement, et la facture qu'on n'aurait jamais dû y compter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BEL-MIS-011 — « le litige n'est pas un retard »
 * ─────────────────────────────────────────────────────────────────────────────
 * Le DSO écarte déjà les impayées (« elles ont un retard, pas un délai ») et les
 * mal datées. Il lui manquait le troisième cas, celui qui abîme le plus le
 * chiffre : une facture **CONTESTÉE**. Le temps qu'elle met à être payée ne
 * mesure pas la ponctualité d'un client, il mesure la durée d'une négociation —
 * et il entre dans l'indicateur qu'on montre à un dirigeant pour décider s'il
 * faut relancer, affacturer ou changer ses conditions de règlement.
 *
 * ⚠️ Le mock N'ÉCARTE la ligne QUE si la requête le lui demande. C'est
 * délibéré : un test qui filtrerait de son côté passerait au vert sur un SQL
 * qui ne filtre rien — et le second cas ci-dessous prouve que la mesure sait
 * bouger, sans quoi elle ne mesurerait rien.
 */

type PaidRow = {
  invoiced_at: string
  paid_at: string
  disputed_at: string | null
  dispute_resolved_at?: string | null
}

function iso(day: number): string {
  return new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10)
}

/** Dix factures payées en 25 à 34 jours — le portefeuille normal. */
const HEALTHY: PaidRow[] = Array.from({ length: 10 }, (_, index) => ({
  invoiced_at: iso(1),
  paid_at: iso(1 + 25 + index),
  disputed_at: null,
}))

/** Dix factures contestées, réglées après 250 jours de discussion. */
const DISPUTED: PaidRow[] = Array.from({ length: 10 }, () => ({
  invoiced_at: iso(1),
  paid_at: new Date(Date.UTC(2026, 0, 1) + 250 * 86_400_000).toISOString().slice(0, 10),
  disputed_at: '2026-02-01T09:00:00.000Z',
}))

/**
 * Le mock joue le rôle de Postgres, et il en joue DEUX requêtes.
 *
 * ⚠️ Il n'applique un filtre que si la requête le porte — un mock qui filtrerait
 * de son côté passerait au vert sur un SQL qui ne filtre rien. Et il distingue
 * la requête de COMPTAGE de celle des lignes : c'est cette séparation qui permet
 * de faire échouer l'une sans l'autre, plus bas.
 *
 * `failCount` / `failRows` cassent une requête à la demande, pour prouver que le
 * compte des contestées vaut `null` (« on n'a pas su compter ») et jamais `0`
 * (« aucune contestée »), qui est une mesure vraie et un tout autre message.
 */
function serviceOver(
  rows: PaidRow[],
  options: { failCount?: boolean; failRows?: boolean } = {},
): { service: RevenueService; sql: () => string; countSql: () => string } {
  let seen = ''
  let seenCount = ''
  const manager = {
    query: async (text: string) => {
      // La requête de comptage se reconnaît à son agrégat — c'est la SEULE des
      // deux qui ramène les contestées, puisque l'autre les a écartées.
      if (text.includes('count(*)')) {
        seenCount = text
        if (options.failCount) throw new Error('compte illisible')
        const disputed = text.includes('disputed_at IS NOT NULL')
          ? rows.filter(row => row.disputed_at !== null).length
          : rows.length
        return [{ disputed }]
      }
      seen = text
      if (options.failRows) throw new Error('lecture illisible')
      const kept = text.includes('disputed_at IS NULL') ? rows.filter(row => row.disputed_at === null) : rows
      return kept.map(row => ({ invoiced_at: row.invoiced_at, paid_at: row.paid_at }))
    },
  }
  return { service: new RevenueService({ manager } as never), sql: () => seen, countSql: () => seenCount }
}

describe('le délai de paiement écarte les factures CONTESTÉES', () => {
  it('une facture en litige ne déplace plus la médiane', async () => {
    const { service } = serviceOver([...HEALTHY, ...DISPUTED])
    const result = await service.dso('w1')
    // Les dix délais retenus vont de 25 à 34 jours : la médiane est 30.
    expect(result.days).toBe(30)
    expect(result.measurability.measurable).toBe(true)
  })

  it('…et la mesure SAIT bouger : sans le filtre, ces mêmes lignes la font tripler', async () => {
    // Une évaluation qui ne peut pas faire bouger ce qu'elle mesure ne mesure
    // rien. Le contrôle prouve que la fixture discrimine réellement.
    const { service } = serviceOver([...HEALTHY, ...DISPUTED].map(row => ({ ...row, disputed_at: null })))
    const result = await service.dso('w1')
    expect(result.days).toBe(142)
  })

  it('la requête NOMME le refus — c’est là qu’il s’applique, pas dans un filtre TypeScript', async () => {
    const { service, sql } = serviceOver(HEALTHY)
    await service.dso('w1')
    expect(sql()).toContain('ir.paid_at IS NOT NULL')
    expect(sql()).toContain('ir.disputed_at IS NULL')
  })

  it('un litige LEVÉ reste dehors — lever ne réécrit pas le temps perdu', async () => {
    // Le prédicat porte sur `disputed_at`, jamais sur la levée : une facture qui
    // a été contestée le reste, et son délai continue de mesurer le litige. Le
    // mock ne connaît d'ailleurs que ce filtre-là — si la requête se mettait à
    // regarder la levée, ces dix lignes reviendraient et la médiane bougerait.
    const settled = DISPUTED.map(row => ({ ...row, dispute_resolved_at: '2026-06-01T09:00:00.000Z' }))
    const { service } = serviceOver([...HEALTHY, ...settled])
    const result = await service.dso('w1')
    expect(result.days).toBe(30)
  })
})

/**
 * …ET IL DIT COMBIEN IL EN A SORTIES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'EXCLUSION SEULE NE SUFFIT PAS À FAIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Écarter les factures contestées est juste, et c'est livré. Mais une médiane
 * qui ne dit pas sur quoi elle porte ment dans les DEUX sens : les garder ferait
 * gonfler le délai alors que le client n'a rien à payer tant que le litige dure,
 * et les sortir EN SILENCE cache de l'argent qui ne rentre pas.
 *
 * « Ce qui SORT d'un indicateur se NOMME à côté de l'indicateur » : les mal
 * datées étaient déjà comptées (`undatable`), les contestées ne l'étaient pas.
 *
 * ⚠️ Le compte se prend par une requête SÉPARÉE, et c'est délibéré. Le tirer de
 * la requête des lignes supposerait qu'il reste au moins une ligne après le
 * filtre — or le cas où TOUT est contesté est justement celui où le compte
 * compte le plus, et c'est là qu'il aurait disparu.
 */
describe('le délai de paiement DIT ce qu’il a écarté', () => {
  it('compte les factures contestées qu’il vient d’exclure', async () => {
    const { service } = serviceOver([...HEALTHY, ...DISPUTED])
    const result = await service.dso('w1')
    expect(result.disputed).toBe(10)
    // Compter n'est pas réintégrer : le chiffre lui-même ne bouge pas.
    expect(result.days).toBe(30)
  })

  it('compte encore quand TOUTES les factures sont contestées', async () => {
    // Le cas qui aurait disparu d'une requête unique : le filtre ne laisse
    // aucune ligne, et c'est précisément là qu'il faut dire pourquoi.
    const { service } = serviceOver(DISPUTED)
    const result = await service.dso('w1')
    expect(result.disputed).toBe(10)
    expect(result.days).toBeNull()
    expect(result.measurability.observed).toBe(0)
  })

  it('« aucune contestée » est une MESURE — 0, et non « on ne sait pas »', async () => {
    const { service } = serviceOver(HEALTHY)
    const result = await service.dso('w1')
    expect(result.disputed).toBe(0)
  })

  it('un comptage ILLISIBLE rend null, jamais 0 — les deux appellent des gestes opposés', async () => {
    // `0` dirait « rien à signaler » sur une lecture ratée. C'est exactement ce
    // que « non mesuré n'est pas mesuré à zéro » interdit (GA-18/GA-19).
    const { service } = serviceOver([...HEALTHY, ...DISPUTED], { failCount: true })
    const result = await service.dso('w1')
    expect(result.disputed).toBeNull()
    // …et l'échec du COMPTE n'emporte pas le chiffre, qui reste calculable.
    expect(result.days).toBe(30)
  })

  it('le compte SURVIT à l’échec de la lecture des lignes', async () => {
    // Les deux lectures sont indépendantes : savoir que 10 factures sont
    // contestées reste vrai même si la médiane n'a pas pu se calculer.
    const { service } = serviceOver([...HEALTHY, ...DISPUTED], { failRows: true })
    const result = await service.dso('w1')
    expect(result.days).toBeNull()
    expect(result.disputed).toBe(10)
  })

  it('la requête de comptage NOMME la population qu’elle compte', async () => {
    const { service, countSql } = serviceOver(HEALTHY)
    await service.dso('w1')
    // Les mêmes bornes que le calcul — sinon les deux chiffres parleraient de
    // deux portefeuilles différents.
    expect(countSql()).toContain('invoice_readiness')
    expect(countSql()).toContain('ir.workspace_id = $1')
    expect(countSql()).toContain('ir.paid_at IS NOT NULL')
    // …et le complément EXACT du refus, jamais une autre condition.
    expect(countSql()).toContain('ir.disputed_at IS NOT NULL')
  })

  it('la mesure SAIT bouger : sans le prédicat, le compte cesserait de discriminer', async () => {
    // Contrôle négatif — une évaluation qui ne peut pas faire bouger ce qu'elle
    // mesure ne mesure rien. Le mock rend TOUTES les lignes si la requête oublie
    // `disputed_at IS NOT NULL` : le compte vaudrait 20 au lieu de 10.
    const { service } = serviceOver([...HEALTHY, ...DISPUTED])
    const result = await service.dso('w1')
    expect(result.disputed).toBe(10)
    expect(result.disputed).not.toBe(20)
  })
})
