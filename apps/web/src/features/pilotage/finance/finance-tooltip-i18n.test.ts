import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/pilotage.json'
import en from '@/i18n/locales/en/pilotage.json'

/**
 * LES INFOBULLES DE `FinancePanel` — manque n°1 du lot du 30/08.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE REFUSE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une infobulle qui répète le titre du bloc ne sert à rien » (consigne du
 * lot). Le panneau portait déjà un `hint` par BLOC, toujours visible — six
 * phrases générales du type « quatre chiffres qui disent quatre choses ».
 * Ajouter une infobulle qui redit la même chose derrière une icône ne livre
 * rien de neuf : c'est le piège que cette garde referme, en exigeant que le
 * texte de l'infobulle DIFFÈRE du `hint` du bloc.
 *
 * Et surtout, elle exige la ligne qui a de la valeur : CE QUI EST EXCLU du
 * calcul. Sans elle, « compte les missions signées sur la période » est aussi
 * creux que le titre — un lecteur ne sait toujours pas si ce chiffre inclut le
 * prévisionnel, le facturé, les missions sans TJM… Le mot « exclut » (FR) /
 * « exclude » (EN) est un PROXY imparfait mais vérifiable : une infobulle qui
 * ne le porte pas a de bonnes chances de n'être qu'une paraphrase du titre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE QU'ELLE SAIT DIRE NON
 * ─────────────────────────────────────────────────────────────────────────────
 * Rendre `finance.revenue.tooltip.signed` égal à `finance.revenue.hint`, ou
 * lui retirer son « exclut », fait échouer cette garde — vérifié à la main
 * avant ce commit. Une garde qui ne peut pas casser ne garde rien.
 */

type Locale = { finance: Record<string, unknown> }

const LOCALES: { lang: string; finance: Record<string, unknown>; excludeMarker: string }[] = [
  { lang: 'fr', finance: (fr as Locale).finance, excludeMarker: 'exclu' },
  { lang: 'en', finance: (en as Locale).finance, excludeMarker: 'exclud' },
]

/** Les métriques qui portent une infobulle, groupées par bloc — la même
 *  énumération que celle rendue dans `FinancePanel` (`Row`s de chaque `Block`). */
const TOOLTIPPED_ROWS: Record<string, readonly string[]> = {
  revenue: ['signed', 'produced', 'invoiced', 'collected'],
  // `contractedMargin` depuis le 01/09/2026 : la marge des deux lignes
  // contractualisées, servie à côté des trois montants. Son infobulle a plus à
  // dire que les autres — elle doit nommer ce qu'elle EXCLUT (le pipe, et toute
  // pondération par une chance de signature), ce que la garde vérifie plus bas.
  forecast: ['secured', 'likely', 'hoped', 'contractedMargin'],
  capacity: ['capacityDays', 'committedDays', 'benchRate', 'availableDays'],
  margin: ['aggregate', 'base', 'unmeasuredShare', 'threshold'],
  dso: ['days'],
  channels: ['margin', 'gap'],
}

function block(finance: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = finance[key]
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function tooltipTable(finance: Record<string, unknown>, blockKey: string): Record<string, string> {
  const table = block(block(finance, blockKey), 'tooltip')
  return table as Record<string, string>
}

describe('FinancePanel — les infobulles par métrique (manque n°1)', () => {
  it('lit vraiment quelque chose — six blocs, au moins une ligne chacun', () => {
    // Une garde qui parcourt une liste vide passe au vert sans rien vérifier.
    expect(Object.keys(TOOLTIPPED_ROWS).length).toBe(6)
    for (const [blockKey, rows] of Object.entries(TOOLTIPPED_ROWS)) {
      expect(rows.length, blockKey).toBeGreaterThan(0)
    }
  })

  for (const { lang, finance, excludeMarker } of LOCALES) {
    for (const [blockKey, rows] of Object.entries(TOOLTIPPED_ROWS)) {
      it(`${lang} · finance.${blockKey}.tooltip couvre EXACTEMENT ses métriques`, () => {
        const table = tooltipTable(finance, blockKey)
        expect(Object.keys(table).sort()).toEqual([...rows].sort())
      })

      it(`${lang} · finance.${blockKey}.tooltip n'est jamais vide`, () => {
        const table = tooltipTable(finance, blockKey)
        for (const row of rows) {
          expect(table[row]?.trim().length ?? 0, `${blockKey}.${row}`).toBeGreaterThan(0)
        }
      })

      it(`${lang} · finance.${blockKey}.tooltip ne répète pas le \`hint\` du bloc`, () => {
        const table = tooltipTable(finance, blockKey)
        const hint = String(block(finance, blockKey).hint ?? '')
        for (const row of rows) {
          expect(table[row], `${blockKey}.${row}`).not.toBe(hint)
        }
      })

      it(`${lang} · finance.${blockKey}.tooltip NOMME ce qui est exclu`, () => {
        const table = tooltipTable(finance, blockKey)
        for (const row of rows) {
          expect(table[row]?.toLowerCase() ?? '', `${blockKey}.${row}`).toContain(excludeMarker)
        }
      })
    }
  }
})
