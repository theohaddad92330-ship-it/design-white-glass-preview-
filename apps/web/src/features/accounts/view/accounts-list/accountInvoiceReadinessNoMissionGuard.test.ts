/**
 * GA-183 — un compte SANS mission n'est jamais « bloqué », jamais rouge,
 * jamais compté (point 3 du lot « prêt à facturer »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE EMPÊCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * `buildAccountInvoiceReadinessIndex` reçoit DEUX sources — c'était trois
 * avant le §9 du 30/08, qui a fait disparaître `GET /delivery/missions`
 * (plafonné à 200 lignes) de ce fichier : le digest de propagation (fiable,
 * non plafonné — « ce compte a-t-il une mission ? ») et `GET /delivery/
 * invoice-readiness` (mensuel, `accountId` compris). Un raccourci facile à
 * écrire par erreur — dériver la liste des comptes à indexer depuis
 * `readinessItems` plutôt que depuis `accountIdsWithMission` — ferait
 * apparaître un compte SANS mission comme « bloqué » dès qu'une ligne de
 * facturation orpheline (mauvaise jointure, donnée de test, incohérence
 * transitoire) porterait son identifiant : exactement le défaut que le
 * point 3 du lot interdit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX PREUVES EXIGÉES D'UNE GARDE (CLAUDE.md)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · elle SAIT DIRE NON → `describe('la fonction protégée…')` exécute la VRAIE
 *    fonction sur des données adversariales (jamais un mock) : le test rougit
 *    si `buildAccountInvoiceReadinessIndex` cesse un jour de filtrer par
 *    `accountIdsWithMission` ;
 *  · elle LIT quelque chose → `describe('le corpus…')` vérifie que le module
 *    protégé n'est ni vide ni un stub — un fichier vidé ferait rougir cette
 *    assertion, jamais passer la garde au vert.
 *
 * Une seconde moitié protège le RENDU : `AccountInvoiceReadinessCell.tsx` ne
 * doit JAMAIS peindre `none`/`unmeasured` avec la variante `warning` du badge
 * — la vérification porte sur le SOURCE, comme `accessClassFailureIsNamed.test.ts`
 * (GA-179), parce qu'un rendu ne dit pas d'où vient la couleur qui l'a produit.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { accountInvoiceReadinessOf, buildAccountInvoiceReadinessIndex } from './accountInvoiceReadiness'

const LOGIC_FILE = join(__dirname, 'accountInvoiceReadiness.ts')
const CELL_FILE = join(__dirname, 'AccountInvoiceReadinessCell.tsx')

describe('GA-183 — la fonction protégée sait dire NON', () => {
  it('un compte absent de `accountIdsWithMission` reste « none » MÊME quand ses lignes bloquées existent bel et bien', () => {
    // Données adversariales : tout, à part l'appartenance à
    // `accountIdsWithMission`, dit que ce compte devrait être « bloqué ».
    const index = buildAccountInvoiceReadinessIndex(
      new Set(), // le digest de propagation ne connaît PAS ce compte
      [
        { accountId: 'acc-orphan', state: 'blocked', blockers: ['missing_timesheet', 'missing_po'] },
        { accountId: 'acc-orphan', state: 'blocked', blockers: ['missing_rate'] },
      ],
    )
    expect(accountInvoiceReadinessOf(index, 'acc-orphan')).toEqual({ kind: 'none' })
  })

  it('symétrique : un compte présent dans `accountIdsWithMission` mais sans ligne cette fois est « unmeasured », pas « none » — les deux causes d’absence ne se confondent pas', () => {
    const index = buildAccountInvoiceReadinessIndex(new Set(['acc-real']), [])
    expect(accountInvoiceReadinessOf(index, 'acc-real')).toEqual({ kind: 'unmeasured' })
    expect(accountInvoiceReadinessOf(index, 'acc-real')).not.toEqual({ kind: 'none' })
  })
})

describe('GA-183 — le corpus lu par la garde', () => {
  it('lit réellement `accountInvoiceReadiness.ts` — un fichier vidé ferait rougir cette assertion, pas passer la garde au vert', () => {
    expect(statSync(LOGIC_FILE).size).toBeGreaterThan(2_000)
  })

  it('lit réellement `AccountInvoiceReadinessCell.tsx`', () => {
    expect(statSync(CELL_FILE).size).toBeGreaterThan(1_000)
  })
})

/** Le verdict de la garde sur un extrait de source (le vrai fichier, ou un cas synthétique). */
function inspectCellSource(source: string): { noneNeverBadge: boolean; unmeasuredNeverBadge: boolean } {
  // Découpe grossière sur les deux branches `if (badge.kind === '…') return …`
  // qui doivent renvoyer `UnknownCell`, jamais `<Badge`.
  const noneBranch = source.match(/if \(badge\.kind === 'none'\)[^\n]*/)?.[0] ?? ''
  const unmeasuredBranch = source.match(/if \(badge\.kind === 'unmeasured'\)[^\n]*/)?.[0] ?? ''
  return {
    noneNeverBadge: noneBranch.includes('UnknownCell') && !noneBranch.includes('<Badge'),
    unmeasuredNeverBadge: unmeasuredBranch.includes('UnknownCell') && !unmeasuredBranch.includes('<Badge'),
  }
}

describe('GA-183 — le rendu sait dire NON', () => {
  it('accepte le câblage attendu (les deux branches neutres rendent `UnknownCell`)', () => {
    const good = `
      if (badge.kind === 'none') return <UnknownCell reason={t('list.invoiceReadiness.none')} />
      if (badge.kind === 'unmeasured') return <UnknownCell reason={t('list.invoiceReadiness.unmeasured')} />
    `
    expect(inspectCellSource(good)).toEqual({ noneNeverBadge: true, unmeasuredNeverBadge: true })
  })

  it('refuse le défaut : peindre `none` avec un badge coloré', () => {
    const bad = `if (badge.kind === 'none') return <Badge variant="warning">{t('list.invoiceReadiness.none')}</Badge>`
    expect(inspectCellSource(bad).noneNeverBadge).toBe(false)
  })

  it('refuse le défaut : peindre `unmeasured` avec un badge coloré', () => {
    const bad = `if (badge.kind === 'unmeasured') return <Badge variant="warning">{t('list.invoiceReadiness.unmeasured')}</Badge>`
    expect(inspectCellSource(bad).unmeasuredNeverBadge).toBe(false)
  })

  it('le fichier réel passe les deux vérifications', () => {
    const source = readFileSync(CELL_FILE, 'utf8')
    expect(inspectCellSource(source)).toEqual({ noneNeverBadge: true, unmeasuredNeverBadge: true })
  })
})
