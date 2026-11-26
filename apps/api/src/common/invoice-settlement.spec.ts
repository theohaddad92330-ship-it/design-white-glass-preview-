import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isSettled } from '@bellum/contracts'
import { unsettledInvoiceSql } from './invoice-settlement'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * #2419.4 — UN PAIEMENT PARTIEL NE SORT PAS DE LA FILE, EN SQL AUSSI
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois requêtes bornaient leur population sur `paid_at IS NULL` : la file
 * d'intervention, la sonde d'impayé de Laura et le compteur de risque d'une
 * mission. Un règlement de 5 000 € sur 10 000 € les éteignait toutes les trois
 * — et la plus traître est la SQL, qui décide avant que la règle pure n'ait
 * son mot à dire.
 *
 * ⚠️ Cette garde LIT les fichiers, et elle sait dire NON : un contrôle positif
 * lui soumet une source fautive, et elle doit la refuser. Une garde qui ne
 * prouve pas qu'elle lit quelque chose est une opinion.
 */

/**
 * Les requêtes qui décident « cette facture est-elle encore due ? » et qui
 * APPELLENT le fragment partagé.
 *
 * ⚠️ La sonde de Laura n'en est pas : ses requêtes doivent rester LITTÉRALES
 * pour que `laura-probe-alias-resolution.spec.ts` résolve leurs alias sur le
 * schéma réel — un SQL assemblé à l'exécution n'est pas vérifiable, et cette
 * garde-là est plus ancienne et plus large que celle-ci. Elle est donc tenue
 * autrement, juste en dessous : on compare son TEXTE au fragment.
 */
const SOURCES = ['modules/playbooks/interventions.sweeper.ts', 'modules/delivery/mission-scores.service.ts'] as const

/** Tous les fichiers qui portent le prédicat, appelé ou recopié. */
const ALL_SOURCES = [...SOURCES, 'modules/laura/laura-probe.service.ts'] as const

/** Les espaces d'un SQL n'ont pas de sens ; son texte, si. */
function squash(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function read(relative: string): string {
  return readFileSync(join(__dirname, '..', relative), 'utf8')
}

/**
 * Le prédicat fautif, HORS COMMENTAIRE.
 *
 * ⚠️ Retirer les commentaires n'est pas une coquetterie : les trois fichiers
 * EXPLIQUENT le défaut en citant `paid_at IS NULL` dans leur docblock. Une
 * garde qui lit la prose accuserait le texte qui documente la réparation.
 */
function offendingPredicates(source: string): string[] {
  const code = squash(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, ''))
  // ⚠️ Le fragment LÉGITIME commence lui-même par `paid_at IS NULL` — c'est sa
  // première branche. Une garde qui chercherait ce motif brut accuserait donc
  // la réparation elle-même. On retire d'abord le fragment complet, sous tous
  // les alias employés ici ; ce qui reste est un prédicat nu.
  const bare = ['r', 'ir'].reduce((acc, alias) => acc.split(squash(unsettledInvoiceSql(alias))).join(' '), code)
  return bare.match(/\w+\.paid_at IS NULL/g) ?? []
}

describe('#2419.4 — le SOLDE, jamais la date, dans les requêtes d’impayé', () => {
  it('le fragment nomme les TROIS colonnes du solde', () => {
    const sql = unsettledInvoiceSql('r')
    expect(sql).toContain('r.paid_at IS NULL')
    expect(sql).toContain('r.paid_amount_cents')
    expect(sql).toContain('r.invoiced_amount_cents')
    // Un trop-perçu solde : la comparaison est STRICTE.
    expect(sql).toContain('r.paid_amount_cents < r.invoiced_amount_cents')
  })

  it('suit l’alias qu’on lui donne — `ir` n’est pas `r`', () => {
    expect(unsettledInvoiceSql('ir')).toContain('ir.invoiced_amount_cents')
    // ⚠️ `toContain('r.paid_at')` serait vert sur `ir.paid_at` — un test qui
    // mesure le mauvais élément. La frontière de mot est ce qui distingue.
    expect(unsettledInvoiceSql('ir')).not.toMatch(/\br\.paid_at\b/)
  })

  it.each(SOURCES)('%s borne sa population par le fragment PARTAGÉ', relative => {
    const source = read(relative)
    expect(source).toContain('unsettledInvoiceSql(')
  })

  it.each(ALL_SOURCES)('%s ne décide plus d’un `paid_at IS NULL` écrit à la main', relative => {
    expect(offendingPredicates(read(relative))).toEqual([])
  })

  /**
   * LA SONDE DE LAURA — recopiée, donc COMPARÉE.
   *
   * Ses requêtes ne peuvent pas être interpolées (voir `SOURCES` ci-dessus),
   * donc le prédicat y est écrit en toutes lettres. Ce qui l'empêche de
   * diverger n'est pas une promesse en commentaire : c'est ce test, qui exige
   * que son texte soit celui du fragment partagé, à l'espace près.
   */
  it('la sonde de Laura porte EXACTEMENT le fragment, mot pour mot', () => {
    const probe = squash(read('modules/laura/laura-probe.service.ts'))
    expect(probe).toContain(squash(unsettledInvoiceSql('r')))
  })

  it('REFUSE une copie de la sonde qui aurait dérivé d’un mot', () => {
    // Contrôle positif : `<=` au lieu de `<` compte un solde comme un impayé.
    const drifted = squash(unsettledInvoiceSql('r')).replace('paid_amount_cents < ', 'paid_amount_cents <= ')
    expect(drifted).not.toContain(squash(unsettledInvoiceSql('r')))
  })

  /** LE CONTRÔLE POSITIF — la garde doit savoir dire NON. */
  it('REFUSE une source qui rebâtit le prédicat fautif à la main', () => {
    const bad = `const q = \`SELECT 1 FROM invoice_readiness r WHERE r.paid_at IS NULL\``
    expect(offendingPredicates(bad)).toHaveLength(1)
  })

  /** Et elle ne doit PAS accuser la prose qui explique le défaut réparé. */
  it('n’accuse pas un COMMENTAIRE qui cite le prédicat fautif', () => {
    const documented = `// avant #2419.4 : r.paid_at IS NULL\n/* r.paid_at IS NULL */\nconst q = 'ok'`
    expect(offendingPredicates(documented)).toEqual([])
  })

  /**
   * Le fragment est le MIROIR de `isSettled` : les deux doivent refuser les
   * mêmes lignes. On ne peut pas exécuter du SQL ici, mais on peut clouer la
   * table de vérité que le fragment prétend encoder.
   */
  it.each([
    ['rien de constaté', { paidAt: null, paidAmountCents: null, invoicedAmountCents: 10_000_00 }, false],
    ['réglée à moitié', { paidAt: 'x', paidAmountCents: 5_000_00, invoicedAmountCents: 10_000_00 }, false],
    ['soldée', { paidAt: 'x', paidAmountCents: 10_000_00, invoicedAmountCents: 10_000_00 }, true],
    ['trop-perçu', { paidAt: 'x', paidAmountCents: 11_000_00, invoicedAmountCents: 10_000_00 }, true],
    ['encaissé inconnu', { paidAt: 'x', paidAmountCents: null, invoicedAmountCents: 10_000_00 }, true],
    ['facturé inconnu', { paidAt: 'x', paidAmountCents: 5_000_00, invoicedAmountCents: null }, true],
  ])('%s ⇒ soldée = %s', (_label, row, settled) => {
    expect(isSettled(row)).toBe(settled)
  })
})
