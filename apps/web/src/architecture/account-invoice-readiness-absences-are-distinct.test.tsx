import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { AccountInvoiceReadinessColumn } from '@/features/accounts/view/accounts-list/useAccountInvoiceReadiness'

/**
 * GA-206 — LES ABSENCES DE LA COLONNE « PRÊT À FACTURER » NE SE RENDENT PLUS
 * PAR UN TIRET IDENTIQUE (mesuré à l'œil en production le 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT — ET LE RECOMPTE (ce ticket n'a QUE trois absences, pas quatre)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le rapport initial citait quatre phrases lues au survol dans le DOM, mais
 * deux d'entre elles (« Aucun mois facturé sur ce compte », « Des mois sont
 * facturés, aucun ne porte de montant saisi ») appartiennent à la colonne CA
 * VOISINE (`AccountRevenueCell.tsx`, clés `propagation.cellNoInvoice` /
 * `propagation.cellAmountUnknown`) — pas à « Prêt à facturer ». Une troisième
 * (« Facturé ailleurs ») est un état MESURÉ (`readiness.states.invoiced`) qui
 * s'affiche déjà en badge coloré, jamais en tiret — c'est le rendu juste que
 * la consigne demande de ne pas toucher.
 *
 * `AccountInvoiceReadinessCell.tsx` porte réellement TROIS chemins qui, avant
 * ce correctif, rendaient tous le même « – » muet, distingué SEULEMENT par
 * `title`/`aria-label` (invisible à l'œil, et un `title` seul ne s'ouvre pas
 * au clavier) :
 *   · `column.failed`      — la lecture a ÉCHOUÉ (panne réseau/serveur)
 *   · `badge.kind==='none'`      — SANS OBJET : aucune mission, rien à attendre
 *   · `badge.kind==='unmeasured'` — NON MESURÉ : une mission existe, aucune
 *     ligne de facturation ne couvre le mois
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX PREUVES EXIGÉES D'UNE GARDE (CLAUDE.md)
 * ─────────────────────────────────────────────────────────────────────────────
 *  · elle SAIT DIRE NON → `allDistinct` appliqué au triplet ['–','–','–'] (la
 *    forme EXACTE du défaut mesuré en prod) rend `false` : si la cellule
 *    régressait vers un tiret unique, cette même assertion rougirait ;
 *  · elle LIT quelque chose → le corpus vérifie que le fichier protégé existe,
 *    n'est pas vidé, et porte bien les trois branches attendues ; les rendus
 *    testés plus bas viennent du VRAI composant, jamais d'une réplique.
 */

const CELL_FILE = join(
  __dirname,
  '..',
  'features',
  'accounts',
  'view',
  'accounts-list',
  'AccountInvoiceReadinessCell.tsx',
)

const { AccountInvoiceReadinessCell } =
  await import('@/features/accounts/view/accounts-list/AccountInvoiceReadinessCell')

const ACCOUNT = '11111111-1111-4111-8111-111111111111'

function column(over: Partial<AccountInvoiceReadinessColumn> = {}): AccountInvoiceReadinessColumn {
  return { failed: false, get: () => ({ kind: 'none' }), ...over }
}

/** Ce qu'un utilisateur VOYANT lit — jamais `title`/`aria-label`, qui ne sont
 *  pas du contenu de nœud et n'apparaissent donc pas dans `textContent`. */
function visibleGlyph(container: HTMLElement): string {
  return container.textContent?.trim() ?? ''
}

/** Sait dire NON sur la forme exacte du défaut, et OUI sur trois rendus réels
 *  distincts. Aucune entrée vide (un glyphe absent n'est pas une distinction). */
function allDistinct(glyphs: readonly string[]): boolean {
  if (glyphs.some(glyph => glyph.length === 0)) return false
  return new Set(glyphs).size === glyphs.length
}

afterEach(cleanup)

describe('GA-206 — la garde lit bien quelque chose', () => {
  it('le fichier protégé existe et n’est pas vidé', () => {
    expect(statSync(CELL_FILE).size, 'corpus vide : AccountInvoiceReadinessCell.tsx').toBeGreaterThan(1_000)
  })

  it('porte bien les trois branches d’absence attendues', () => {
    const source = readFileSync(CELL_FILE, 'utf8')
    expect(source).toContain('column.failed')
    expect(source).toContain("badge.kind === 'none'")
    expect(source).toContain("badge.kind === 'unmeasured'")
  })
})

describe('GA-206 — la garde sait dire NON', () => {
  it('repère la forme EXACTE du défaut mesuré en prod — trois tirets identiques', () => {
    expect(allDistinct(['–', '–', '–'])).toBe(false)
  })

  it('repère un glyphe manquant (chaîne vide) comme une non-distinction', () => {
    expect(allDistinct(['–', '', 'Non chargé'])).toBe(false)
  })

  it('laisse passer trois glyphes réellement distincts', () => {
    expect(allDistinct(['–', 'Non mesuré', 'Non chargé'])).toBe(true)
  })
})

describe('GA-206 — les trois absences se rendent différemment à l’œil, sur le VRAI composant', () => {
  it('« sans objet » (none) et « non mesuré » (unmeasured) se distinguent SÉPARÉMENT — le point qui décide de la qualité', () => {
    const none = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'none' }) })} />,
    )
    const unmeasured = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'unmeasured' }) })} />,
    )
    expect(allDistinct([visibleGlyph(none.container), visibleGlyph(unmeasured.container)])).toBe(true)
  })

  it('les trois absences (échec, sans objet, non mesuré) sont pairwise distinctes', () => {
    const failed = render(<AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ failed: true })} />)
    const none = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'none' }) })} />,
    )
    const unmeasured = render(
      <AccountInvoiceReadinessCell accountId={ACCOUNT} column={column({ get: () => ({ kind: 'unmeasured' }) })} />,
    )
    const glyphs = [visibleGlyph(failed.container), visibleGlyph(none.container), visibleGlyph(unmeasured.container)]
    expect(allDistinct(glyphs)).toBe(true)
  })

  it('chaque absence porte un déclencheur d’infobulle atteignable au clavier (tabindex)', () => {
    for (const over of [
      { failed: true },
      { get: () => ({ kind: 'none' as const }) },
      { get: () => ({ kind: 'unmeasured' as const }) },
    ]) {
      const { container } = render(<AccountInvoiceReadinessCell accountId={ACCOUNT} column={column(over)} />)
      expect(container.querySelector('[tabindex="0"]')).toBeTruthy()
      cleanup()
    }
  })
})
