/**
 * Reporter jest de CI : un fichier de test qui ne rend pas la main échoue en se NOMMANT.
 *
 * Pourquoi : le job « Test (API) » est resté muet 45 min puis tué par le délai de l'étape, sans une
 * ligne PASS/FAIL (22/10/2026, shard 2/3, intermittent). `testTimeout` ne couvre pas un fichier
 * bloqué hors d'un test (import, boucle synchrone, handle ouvert au chargement) et `forceExit` ne
 * joue qu'à la fin. Ici : on note le départ de chaque fichier, et si l'un tourne au-delà de la limite
 * on imprime son chemin puis on sort en échec — le log dit QUI, au lieu de se taire.
 *
 * Actif seulement si la config jest l'ajoute (CI) ; limite : JEST_FILE_WATCHDOG_SECONDS.
 */
class JestWatchdogReporter {
  constructor(_globalConfig, options = {}) {
    this.limitMs = (options.limitSeconds ?? 600) * 1000
    this.now = options.now ?? Date.now
    this.exit = options.exit ?? (code => process.exit(code))
    this.log = options.log ?? (m => console.error(m))
    this.running = new Map()
    this.timer = null
  }

  onRunStart() {
    if (this.timer) return
    this.timer = setInterval(() => this.check(), 15000)
    this.timer.unref()
  }

  onTestFileStart(test) {
    this.running.set(test.path, this.now())
  }

  onTestFileResult(test) {
    this.running.delete(test.path)
  }

  onRunComplete() {
    if (this.timer) clearInterval(this.timer)
  }

  check() {
    const now = this.now()
    const stuck = [...this.running].filter(([, since]) => now - since > this.limitMs)
    if (stuck.length === 0) return
    this.log(
      `\n[jest-watchdog] ${stuck.length} fichier(s) de test sans résultat après ${this.limitMs / 1000} s :\n` +
        stuck.map(([p, since]) => `  - ${p} (${Math.round((now - since) / 1000)} s)`).join('\n') +
        `\n[jest-watchdog] Le fichier pend (handle ouvert, promesse jamais résolue, boucle synchrone). Arrêt en échec.`,
    )
    this.exit(1)
  }
}

module.exports = JestWatchdogReporter
