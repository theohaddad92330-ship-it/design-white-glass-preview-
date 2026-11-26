// eslint-disable-next-line @typescript-eslint/no-require-imports
const WatchdogReporter = require('../scripts/jest-watchdog-reporter.js') as new (
  globalConfig: unknown,
  options: { limitSeconds: number; now: () => number; exit: (code: number) => void; log: (m: string) => void },
) => {
  onTestFileStart(test: { path: string }): void
  onTestFileResult(test: { path: string }): void
  check(): void
}

describe('jest-watchdog-reporter', () => {
  const build = () => {
    let t = 0
    const logs: string[] = []
    const exit = jest.fn()
    const reporter = new WatchdogReporter(
      {},
      {
        limitSeconds: 100,
        now: () => t,
        exit,
        log: m => logs.push(m),
      },
    )
    return { reporter, exit, logs, advance: (s: number) => (t += s * 1000) }
  }

  it('nomme le fichier encore en cours après la limite et sort en échec', () => {
    const { reporter, exit, logs, advance } = build()
    reporter.onTestFileStart({ path: '/repo/src/pend.spec.ts' })
    advance(101)
    reporter.check()
    expect(exit).toHaveBeenCalledWith(1)
    expect(logs.join('\n')).toContain('/repo/src/pend.spec.ts')
  })

  it('ne dit rien tant que la limite n’est pas atteinte', () => {
    const { reporter, exit, advance } = build()
    reporter.onTestFileStart({ path: '/repo/src/lent.spec.ts' })
    advance(99)
    reporter.check()
    expect(exit).not.toHaveBeenCalled()
  })

  it('oublie un fichier terminé', () => {
    const { reporter, exit, advance } = build()
    reporter.onTestFileStart({ path: '/repo/src/ok.spec.ts' })
    reporter.onTestFileResult({ path: '/repo/src/ok.spec.ts' })
    advance(500)
    reporter.check()
    expect(exit).not.toHaveBeenCalled()
  })
})
