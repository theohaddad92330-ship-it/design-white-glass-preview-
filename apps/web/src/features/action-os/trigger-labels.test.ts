import { workflowTriggerSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import frActions from '@/i18n/locales/fr/actions.json'
import enActions from '@/i18n/locales/en/actions.json'

/**
 * CHAQUE DÉCLENCHEUR A UN LIBELLÉ — dans les DEUX langues (#1498).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE EXISTE POUR EMPÊCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * La première version de la ligne de traçabilité déclarait quatre libellés —
 * `manual`, `schedule`, `event`, `system`. **Trois n'existent dans aucun
 * déclencheur.** Le contrat en porte six, et le premier run réel vu en
 * production arrivait en `signal_detected` : l'écran écrivait donc
 * « déclenchée automatiquement » là où il pouvait dire « par un signal frais ».
 *
 * Rien ne l'avait signalé, et rien ne pouvait le signaler : `t()` avec un
 * `defaultValue` ne se plaint jamais d'une clé absente — c'est son travail. Le
 * repli sauvait l'écran ET cachait le trou. Seule la recette l'a vu.
 *
 * ⚠️ Cette garde LIT les deux listes : celle du contrat et celle des
 * catalogues. Une garde qui recopierait les six valeurs ici se comparerait à
 * elle-même et resterait verte le jour où un septième déclencheur arrive.
 */
type TriggerCatalogue = { center?: { trace?: { trigger?: Record<string, string> } } }

const CATALOGUES: [string, TriggerCatalogue][] = [
  ['fr', frActions as TriggerCatalogue],
  ['en', enActions as TriggerCatalogue],
]

/** Le repli, quand la base porte un déclencheur que ce build ne connaît pas. */
const FALLBACK_KEY = 'unknown'

describe('les libellés de déclencheur', () => {
  /**
   * ⚠️ LA PREUVE QUE CETTE GARDE LIT QUELQUE CHOSE. Un contrat vide ou un
   * catalogue vide rendraient les tests suivants verts sans rien vérifier.
   */
  it('lit un corpus réel — six déclencheurs au contrat, deux catalogues remplis', () => {
    expect(workflowTriggerSchema.options.length).toBeGreaterThanOrEqual(6)
    for (const [lang, catalogue] of CATALOGUES) {
      expect(Object.keys(catalogue.center?.trace?.trigger ?? {}).length, lang).toBeGreaterThanOrEqual(6)
    }
  })

  it('chaque déclencheur du CONTRAT a son libellé, dans les deux langues', () => {
    const missing: string[] = []
    for (const [lang, catalogue] of CATALOGUES) {
      const labels = catalogue.center?.trace?.trigger ?? {}
      for (const trigger of workflowTriggerSchema.options) {
        if (!labels[trigger]) missing.push(`${lang}:${trigger}`)
      }
      if (!labels[FALLBACK_KEY]) missing.push(`${lang}:${FALLBACK_KEY}`)
    }
    expect(missing, 'déclencheurs sans libellé').toEqual([])
  })

  /**
   * L'autre sens : un libellé qui ne correspond à aucun déclencheur est du code
   * mort qui rassure. C'est exactement ce qu'étaient `schedule` et `event`.
   */
  it('aucun libellé ne vise un déclencheur qui n’existe pas', () => {
    const known = new Set<string>([...workflowTriggerSchema.options, FALLBACK_KEY])
    const orphans: string[] = []
    for (const [lang, catalogue] of CATALOGUES) {
      for (const key of Object.keys(catalogue.center?.trace?.trigger ?? {})) {
        if (!known.has(key)) orphans.push(`${lang}:${key}`)
      }
    }
    expect(orphans, 'libellés sans déclencheur').toEqual([])
  })
})
