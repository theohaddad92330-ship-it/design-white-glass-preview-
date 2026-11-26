import { detectedPartnersFrom } from '@bellum/contracts'

/**
 * Le producteur écrit ce qu'il produit.
 *
 * `account_partners.source` accepte `'analysis'` depuis la migration du 19/08 :
 * la contrainte CHECK l'autorise, le contrat zod le type, et `TabPartners`
 * affiche déjà un badge « détecté » pour cette valeur. Personne ne l'écrivait.
 *
 * Ce test garde les deux moitiés du pont : que la règle de mapping soit celle
 * de `@bellum/contracts` (et pas une recopie locale), et que la requête
 * d'écriture porte bien les clauses qui protègent le travail de l'utilisateur.
 */
describe('les ESN détectées atteignent la table que l’écran lit', () => {
  it('maps what the pipeline produces onto a partner row', () => {
    const rows = detectedPartnersFrom([
      { name: 'Capgemini', certainty: 'forte', scope: 'TMA SAP', detectedAt: '2026-08-22' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Capgemini', certainty: 'forte', detectedAt: '2026-08-22' })
  })

  it('the write refuses to touch a declared row or a dismissed one', () => {
    // Lu sur la source plutôt que joué contre une base : ce sont les deux
    // clauses qui rendent la correction de l'utilisateur durable, et les perdre
    // au fil d'un refactor ne se verrait sur aucun écran avant des semaines.
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'accounts.service.ts'),
      'utf8',
    ) as string
    const insert = source.slice(source.indexOf('INSERT INTO account_partners'))
    expect(insert).toContain("account_partners.source = 'analysis'")
    expect(insert).toContain('account_partners.dismissed_at IS NULL')
  })

  it('never guesses the rank nor the relationship', () => {
    // « Concurrencer ou solliciter en rang 2 » est la décision de l'ESN
    // utilisatrice. Les deviner choisirait à sa place — et le rang 1 deviné
    // d'un concurrent est exactement l'information qui ferait renoncer à un
    // compte ouvert.
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'accounts.service.ts'),
      'utf8',
    ) as string
    const insert = source.slice(source.indexOf('INSERT INTO account_partners'))
    expect(insert).toContain("'unknown', 'unknown'")
  })
})

/**
 * La reprise des dossiers déjà analysés.
 *
 * Le pont ne s'ouvre qu'à la FIN d'une analyse : les dossiers analysés avant le
 * déploiement portent leur `esnPresence` dans `raw_analysis` et l'onglet reste
 * vide. Un utilisateur ne peut pas savoir que la donnée est là — il conclut que
 * la fonctionnalité ne marche pas.
 */
describe('reprise des dossiers déjà analysés', () => {
  type Row = { id: string; presence: unknown }

  function serviceWith(rows: Row[], calls: Array<{ sql: string; params: unknown[] }>) {
    const accounts = {
      query: (sql: string, params: unknown[]) => {
        calls.push({ sql, params })
        return Promise.resolve(rows)
      },
      findOne: () => Promise.resolve({ id: 'a1', workspace_id: 'w1' }),
    }
    const partners = {
      query: (sql: string, params: unknown[]) => {
        calls.push({ sql, params })
        return Promise.resolve(undefined)
      },
    }
    const { AccountsService } = require('./accounts.service') as typeof import('./accounts.service')
    return new AccountsService(
      accounts as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      partners as never,
      undefined,
    )
  }

  it('skips an account that already carries a detected row — a dismissal is never resurrected', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    await serviceWith([], calls).backfillDetectedPartners()
    expect(calls[0]?.sql).toContain("p.source = 'analysis'")
    expect(calls[0]?.sql).toContain('NOT EXISTS')
  })

  it('is bounded — a large base does not lengthen a boot', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    await serviceWith([], calls).backfillDetectedPartners(25)
    expect(calls[0]?.sql).toContain('LIMIT $1')
    expect(calls[0]?.params).toEqual([25])
  })

  it('writes the partner rows a stored dossier already carries', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    const result = await serviceWith(
      [{ id: 'a1', presence: [{ name: 'Capgemini', certainty: 'forte', detected_at: '2026-08-19' }] }],
      calls,
    ).backfillDetectedPartners()
    expect(result).toEqual({ scanned: 1, seeded: 1 })
    const insert = calls.find(c => c.sql.includes('INSERT INTO account_partners'))
    expect(insert?.params).toContain('Capgemini')
    expect(insert?.params).toContain('2026-08-19')
  })

  it('writes nothing for a dossier whose esnPresence has no usable entry', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = []
    await serviceWith([{ id: 'a1', presence: [{ evidence: 'sans nom' }] }], calls).backfillDetectedPartners()
    expect(calls.some(c => c.sql.includes('INSERT INTO account_partners'))).toBe(false)
  })
})

/**
 * L'échéance d'un marché public (tome 2 §14).
 *
 * Le pipeline n'a qu'UNE conclusion courante sur le verrouillage d'un compte.
 * L'écriture porte `ON CONFLICT (account_id, kind, value)` : quand la valeur
 * CHANGE — « il y a une porte » devient « verrouillé jusqu'en 2029 » — la
 * nouvelle ligne s'ajoute à côté de l'ancienne au lieu de la remplacer, et
 * `bestAccessFact` départage deux faits de même provenance et de même date
 * d'observation dans l'ordre où la base les rend. Autant tirer à pile ou face
 * sur l'état le plus lourd de conséquence de l'écran.
 */
describe('le pipeline ne garde qu’une conclusion de verrouillage', () => {
  it('clears its own previous lock fact before writing the new one', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'accounts.service.ts'),
      'utf8',
    ) as string
    const seed = source.slice(source.indexOf('private async seedAccessFacts'))
    const body = seed.slice(0, seed.indexOf('private async seedDetectedPartners'))
    expect(body).toContain('DELETE FROM access_facts')
    // Une correction humaine n'est JAMAIS balayée par une réanalyse : c'est la
    // promesse du bouton « Ce n'est pas exact ».
    expect(body).toContain("provenance = 'pipeline'")
    expect(body).toContain('value <> ')
  })
})
