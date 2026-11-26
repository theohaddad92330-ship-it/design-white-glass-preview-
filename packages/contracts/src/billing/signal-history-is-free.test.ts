import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS } from './credit-weights.js'

/**
 * H-DECISIONS #4307 — DÉCISION LOUIS 20/10/2026 : l'historique des signaux est GRATUIT.
 *
 * Il coûtait 1 crédit (déblocage par espace, lot DECOUVRIR-UX). Ouvrir l'historique ne
 * débite plus rien, et aucun écran n'en annonce le prix. Un seul endroit pour un prix
 * (GA-26) : la grille `CREDIT_WEIGHTS` — donc elle ne porte AUCUNE entrée pour ce geste,
 * et aucun module ne reconstruit un « déblocage d'historique de signaux » à côté.
 *
 * La garde SAIT DIRE NON (le détecteur refuse un faux module payant), LIT quelque chose
 * (elle balaie des centaines de fichiers) et n'attrape pas ce qu'elle ne vise pas (un
 * historique d'analyses, une grille voisine).
 */

const ROOT = join(__dirname, '..', '..', '..', '..')
const SCANNED = ['apps/api/src', 'apps/web/src', 'packages/contracts/src']

/** Un déblocage / débit propre à l'historique des signaux, sous toutes ses écritures. */
export const PAID_SIGNAL_HISTORY =
  /signal[_-]?history[_-]?(unlock|credit|cost|price)|SignalHistory(Unlock|Credit|Cost)|unlockSignalHistory/i

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) files(path, out)
    else if (/\.(ts|tsx|json)$/.test(name)) out.push(path)
  }
  return out
}

describe('l’historique des signaux est gratuit (#4307)', () => {
  it('la grille des crédits ne porte aucune entrée pour l’historique des signaux', () => {
    const offending = Object.keys(CREDIT_WEIGHTS).filter(key => /signal|history|historique/i.test(key))
    expect(offending).toEqual([])
  })

  it('aucun module du dépôt ne rebâtit un déblocage payant de l’historique des signaux', () => {
    const scanned = SCANNED.flatMap(dir => files(join(ROOT, dir)))
    // Elle LIT quelque chose : un balayage vide serait une garde qui passe toujours.
    expect(scanned.length).toBeGreaterThan(500)
    const offenders = scanned
      .filter(path => !path.endsWith('signal-history-is-free.test.ts'))
      .filter(path => PAID_SIGNAL_HISTORY.test(readFileSync(path, 'utf8')))
      .map(path => path.replace(ROOT, ''))
    expect(offenders).toEqual([])
    // ⚠️ DÉLAI EXPLICITE (29/10/2026). Ce test parcourt les TROIS arbres de sources au `readdirSync` et lit
    // chaque fichier : 626 ms en local, mais le job `Contrôles rapides` tourne pendant que six shards API et
    // quatre shards web se partagent le runner, et il a dépassé les 5 000 ms par défaut de vitest
    // (run 40836135727, `Error: Test timed out in 5000ms`) — un rouge qui ne dit RIEN de la règle gardée.
    // Un balayage de dépôt n'a pas à tenir dans le délai d'un test unitaire : 30 s, soit quarante-huit fois
    // la mesure locale. Si ce délai est un jour atteint, c'est le balayage qu'il faut regarder, pas le chiffre.
  }, 30_000)

  it('SAIT DIRE NON — le détecteur refuse les écritures du déblocage payant', () => {
    for (const text of [
      'export const discoverSignalHistoryUnlock = pgTable(',
      "reason: 'discover_signal_history_unlock'",
      'class SignalHistoryUnlockService',
      'signal-history-cost',
      'unlockSignalHistory(targetId)',
    ]) {
      expect(PAID_SIGNAL_HISTORY.test(text)).toBe(true)
    }
  })

  it('n’attrape pas ce qu’elle ne vise pas', () => {
    for (const text of ['cv-parse-history.controller', 'rate_history', 'signalHistoryCount', 'history_recurring_one']) {
      expect(PAID_SIGNAL_HISTORY.test(text)).toBe(false)
    }
  })
})
