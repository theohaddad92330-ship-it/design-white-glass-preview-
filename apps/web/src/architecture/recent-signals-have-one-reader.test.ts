/**
 * #3928.a — `recent_signals` A UN SEUL LECTEUR, pour les cinq écrans qui le montrent.
 *
 * Deux projections du même blob vivaient côte à côte : la veille d'un compte
 * (`buildAccountWatchData`, qui lisait `signal`) et le flux du portefeuille
 * (`toAccountSignalItems`, qui lisait `title` d'abord) — Mes cibles et Laura.
 * Le même signal pouvait porter deux libellés, et l'historique (`signal_history`,
 * indexé sur `signal`) ratait la jointure avec Mes cibles. Toutes les surfaces
 * passent désormais par `readRecentSignals` (`@bellum/contracts`).
 *
 * La garde lit le fichier de CHAQUE appelant : il doit appeler le lecteur, et
 * ne plus porter sa propre liste de clés de libellé.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

/** Surface → le fichier qui lit `recent_signals` pour elle. */
const SURFACE_READERS = {
  // Veille d'un compte (`TabSignal.tsx` → `buildAccountWatchData`).
  veille: 'apps/web/src/features/accounts/model/watchData.ts',
  // Mes cibles (`GET /accounts/signals`) ET Laura (`copilot-bridge` → `listAccountSignals`).
  mes_cibles_et_laura: 'apps/api/src/modules/accounts/accounts.service.ts',
  // Cloche (`notifyBuySignalForAccount`).
  cloche: 'apps/api/src/modules/notifications/notifications.service.ts',
  // Découvrir (`POST /contacts/call-list` lit `signal_history`, matérialisé par cette projection).
  decouvrir: 'apps/api/src/modules/signal-history/signal-history.projection.ts',
} as const

/** Vrai quand le source appelle le lecteur unique ET ne relit pas le blob à la main. */
function readsThroughTheSingleReader(source: string): boolean {
  const callsReader = /\breadRecentSignals\(/.test(source)
  // Une liste locale des clés de libellé = une seconde lecture qui peut diverger.
  const ownLabelKeys =
    /\[\s*'signal'\s*,\s*'title'/.test(source) || /record\['title'\],\s*record\['label'\]/.test(source)
  return callsReader && !ownLabelKeys
}

describe('#3928.a — recent_signals a un seul lecteur', () => {
  it('la garde sait dire NON : une seconde lecture locale est refusée', () => {
    expect(readsThroughTheSingleReader("const LABEL_FIELDS = ['signal', 'title', 'label']")).toBe(false)
    expect(readsThroughTheSingleReader("const fields = [record['title'], record['label'], record['signal']]")).toBe(
      false,
    )
    expect(readsThroughTheSingleReader('function toItems(row) { return row.recent_signals.map(x => x.title) }')).toBe(
      false,
    )
    expect(readsThroughTheSingleReader('readRecentSignals(row.recent_signals)')).toBe(true)
  })

  it.each(Object.entries(SURFACE_READERS))('%s lit recent_signals par readRecentSignals (%s)', (_surface, file) => {
    const source = readFileSync(join(REPO_ROOT, file), 'utf8')
    expect(readsThroughTheSingleReader(source)).toBe(true)
  })

  it('Laura relaie le flux de Mes cibles, jamais un second moteur', () => {
    const bridge = readFileSync(
      join(REPO_ROOT, 'apps/api/src/modules/copilot-bridge/copilot-bridge.controller.ts'),
      'utf8',
    )
    expect(bridge).toMatch(/this\.accounts\.listAccountSignals\(/)
  })

  it('Découvrir lit l’historique matérialisé par la projection ci-dessus', () => {
    const contacts = readFileSync(join(REPO_ROOT, 'apps/api/src/modules/contacts/contacts.service.ts'), 'utf8')
    expect(contacts).toMatch(/FROM signal_history sh/)
  })
})
