import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  INVOICE_CONNECTOR_WRITE_STATES,
  INVOICE_DOCUMENT_STATES,
  invoiceDocumentStatusFromConnector,
} from '@bellum/contracts'

/**
 * GA-377 — trois états de DOCUMENT, à CÔTÉ des quatre d'encaissement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE — ET QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2418.2, DÉCISION LOUIS 21/09/2026 : oui pour « acceptée », « rejetée »,
 * « avoir émis » — comme états du DOCUMENT dans l'outil du client, à côté des
 * quatre statuts d'encaissement et SANS les mélanger. Ils ne s'écrivent que sur
 * preuve du connecteur, jamais par déduction.
 *
 * ⚠️ Le cinquième statut d'ENCAISSEMENT reste REFUSÉ
 * (`c72_encaissement_reste_du_nomme`, ratifié #2419.4) : pas de
 * `partially_paid`, le reste dû se NOMME sur « en retard » / « en attente ».
 * Trois états neufs sur un AUTRE axe ne sont pas une porte dérobée pour l'y
 * faire entrer, et c'est précisément ce que cette garde vérifie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS AXES, TROIS QUESTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `INVOICE_CONNECTOR_WRITE_STATES` — où en est NOTRE écriture.
 *  2. `INVOICE_DOCUMENT_STATES` — où en est le DOCUMENT chez le client.
 *  3. Les quatre statuts d'ENCAISSEMENT — dérivés à l'écran, jamais stockés.
 * Les confondre reviendrait à dire qu'une facture acceptée est payée, ou qu'un
 * avoir est un litige.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *  - les trois énumérations, dont celle des encaissements EXTRAITE du code web
 *    qui la porte (`collections.ts`) — pas une copie figée dans ce fichier, qui
 *    resterait verte le jour où le web en gagnerait une cinquième ;
 *  - la MIGRATION — la contrainte couvre exactement les trois états, et la
 *    contrainte sœur exige l'état, sa référence et la date du constat ensemble ;
 *  - le SERVICE — la seule écriture des colonnes de document passe par
 *    `invoiceDocumentStatusFromConnector`.
 *
 * ⚠️ Elle ne lit aucun commentaire.
 */

const API_SRC = join(__dirname, '..')
const REPO = join(__dirname, '..', '..', '..', '..')
const MIGRATION = join(API_SRC, 'migrations', '1795997318604-InvoiceDocumentState.ts')
const SERVICE = join(API_SRC, 'modules', 'invoice-connector', 'invoice-connector-write.service.ts')
const COLLECTIONS = join(REPO, 'apps', 'web', 'src', 'features', 'missions', 'collections.ts')

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Les quatre statuts d'encaissement, LUS là où ils vivent (web). */
function collectionStatuses(): string[] {
  const code = stripComments(readFileSync(COLLECTIONS, 'utf8'))
  const union = code.match(/export type CollectionStatus\s*=\s*([^\n]+)/)
  if (!union) throw new Error('GA-377 : `CollectionStatus` est introuvable dans collections.ts — corpus cassé.')
  return [...(union[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1] as string)
}

/** Les colonnes de document ASSIGNÉES dans un source, avec ce qui les alimente. */
function documentColumnWrites(source: string): string[] {
  const code = stripComments(source)
  const found: string[] = []
  for (const hit of code.matchAll(/document_state(?:_reference|_at)?\s*:\s*([^,\n]+)/g)) {
    // La fin de l'objet littéral (`})`) n'est pas de l'expression.
    found.push((hit[1] ?? '').trim().replace(/[\s})]+$/, ''))
  }
  return found
}

function sourcesOf(dir: string): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourcesOf(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue
    out.push({ path: relative(API_SRC, full), source: readFileSync(full, 'utf8') })
  }
  return out
}

describe('GA-377 — les trois axes ne se mêlent jamais', () => {
  it('lit les quatre statuts d’encaissement LÀ OÙ ILS VIVENT, pas une copie', () => {
    expect(collectionStatuses().sort()).toEqual(['disputed', 'overdue', 'paid', 'pending'])
  })

  it('aucun état de document n’est un statut d’encaissement, ni l’inverse', () => {
    const encaissement = new Set(collectionStatuses())
    expect(INVOICE_DOCUMENT_STATES.filter(state => encaissement.has(state))).toEqual([])
  })

  it('aucun état de document n’est un état de NOTRE écriture', () => {
    const ecriture = new Set<string>(INVOICE_CONNECTOR_WRITE_STATES)
    expect(INVOICE_DOCUMENT_STATES.filter(state => ecriture.has(state))).toEqual([])
  })

  it('le cinquième statut d’ENCAISSEMENT reste refusé — sur les TROIS axes', () => {
    const partout = [...collectionStatuses(), ...INVOICE_CONNECTOR_WRITE_STATES, ...INVOICE_DOCUMENT_STATES]
    expect(partout.filter(value => /partial/i.test(value))).toEqual([])
    expect(collectionStatuses()).toHaveLength(4)
    expect([...INVOICE_DOCUMENT_STATES]).toEqual(['accepted', 'rejected', 'credited'])
  })
})

describe('GA-377 — la contrainte SQL est passée AVANT le code (GA-11 / GA-12)', () => {
  it('la migration couvre EXACTEMENT les trois états', () => {
    const up = stripComments(readFileSync(MIGRATION, 'utf8')).split('public async down')[0] ?? ''
    const check = up.match(/document_state IS NULL OR document_state IN \(([^)]*)\)/)
    expect(check).not.toBeNull()
    const values = [...(check?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map(m => m[1])
    expect(values).toEqual([...INVOICE_DOCUMENT_STATES])
  })

  it('un état sans sa preuve est refusé EN BASE, pas seulement en relecture', () => {
    const up = stripComments(readFileSync(MIGRATION, 'utf8')).split('public async down')[0] ?? ''
    expect(up).toContain('invoice_connector_write_requests_document_evidence_check')
    const evidence = up.slice(up.indexOf('invoice_connector_write_requests_document_evidence_check'))
    for (const colonne of ['document_state', 'document_state_reference', 'document_state_at']) {
      expect(evidence).toContain(colonne)
    }
  })
})

describe('GA-377 — un état ne s’écrit que sur preuve du connecteur', () => {
  it('la porte refuse tout ce qui n’est pas une preuve complète', () => {
    const complete = { state: 'accepted', reference: 'INV-2026-114', observedAt: '2026-09-21T10:00:00.000Z' }
    expect(invoiceDocumentStatusFromConnector(complete)).toEqual(complete)

    expect(invoiceDocumentStatusFromConnector({ ...complete, reference: null })).toBeNull()
    expect(invoiceDocumentStatusFromConnector({ ...complete, reference: '   ' })).toBeNull()
    expect(invoiceDocumentStatusFromConnector({ ...complete, observedAt: null })).toBeNull()
    expect(invoiceDocumentStatusFromConnector({ ...complete, observedAt: 'hier' })).toBeNull()
    expect(invoiceDocumentStatusFromConnector({})).toBeNull()
  })

  it('elle ne connaît AUCUN statut d’encaissement — pas même le cinquième', () => {
    const preuve = { reference: 'INV-1', observedAt: '2026-09-21T10:00:00.000Z' }
    for (const intrus of ['paid', 'partially_paid', 'overdue', 'disputed', 'pending', 'invoiced', 'sent']) {
      expect(invoiceDocumentStatusFromConnector({ ...preuve, state: intrus })).toBeNull()
    }
  })

  it('le service n’alimente ces colonnes QUE depuis cette porte', () => {
    const writes = documentColumnWrites(readFileSync(SERVICE, 'utf8'))
    expect(writes.length).toBe(3)
    for (const write of writes) expect(write).toMatch(/^document\b/)
    // Le corpus lit bien la porte : sans cet appel, les trois lignes ci-dessus
    // pourraient venir de n'importe où.
    expect(readFileSync(SERVICE, 'utf8')).toContain('invoiceDocumentStatusFromConnector(')
  })

  it('aucun AUTRE fichier de l’API n’écrit ces colonnes', () => {
    const ailleurs = sourcesOf(API_SRC)
      .filter(({ path }) => !path.startsWith('migrations/') && !path.startsWith('database/entities/'))
      .filter(({ source }) => documentColumnWrites(source).length > 0)
      .map(({ path }) => path)
    expect(ailleurs).toEqual(['modules/invoice-connector/invoice-connector-write.service.ts'])
  })
})

describe('GA-377 — elle sait dire NON', () => {
  it('voit une colonne de document alimentée par un littéral', () => {
    const coupable = `
      await this.requests.update({ id }, { state: 'invoiced', document_state: 'accepted' })
    `
    expect(documentColumnWrites(coupable)).toEqual(["'accepted'"])
    expect(documentColumnWrites(coupable).every(w => /^document\b/.test(w))).toBe(false)
  })

  it('voit une colonne de document DÉDUITE d’un autre axe', () => {
    const coupable = `const columns = { document_state: row.state === 'invoiced' ? 'accepted' : null }`
    expect(documentColumnWrites(coupable)[0]).toContain("row.state === 'invoiced'")
    expect(/^document\b/.test(documentColumnWrites(coupable)[0] ?? '')).toBe(false)
  })

  it('n’attrape PAS ce qu’elle ne vise pas', () => {
    // `state:` tout court est l'axe de NOTRE écriture — légitime, et sur la même
    // ligne que les colonnes de document dans le service réel.
    expect(documentColumnWrites(`{ state: 'invoiced', invoice_reference: outcome.reference }`)).toEqual([])
    // Un commentaire qui cite l'écriture n'accuse personne.
    expect(documentColumnWrites(`// { document_state: 'accepted' } serait une déduction.`)).toEqual([])
  })
})
