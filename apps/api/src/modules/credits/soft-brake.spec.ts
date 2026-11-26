import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { SOFT_BRAKE_MESSAGE } from './soft-brake'

// #4464 — crédits implicites : le refus garde son CODE, son texte ne dit ni « crédit », ni nombre, ni pourcentage.
describe('SOFT_BRAKE_MESSAGE (#4464)', () => {
  it('est humain, tutoyé, sans « crédit », sans chiffre, sans pourcentage', () => {
    expect(SOFT_BRAKE_MESSAGE).not.toMatch(/cr[ée]dit/i)
    expect(SOFT_BRAKE_MESSAGE).not.toMatch(/\d|%/)
    expect(SOFT_BRAKE_MESSAGE).toMatch(/\bTu\b/)
  })

  it("aucun texte « crédits épuisés / insuffisants » ne reste dans les sources de l'API", () => {
    const root = join(__dirname, '..', '..')
    const out = (() => {
      try {
        return execFileSync(
          'grep',
          [
            '-rniE',
            "cr[ée]dits? (d'enrichissement )?(épuisés?|insuffisants?)",
            '--include=*.ts',
            '--exclude=*.spec.ts',
            root,
          ],
          { encoding: 'utf8' },
        )
      } catch {
        return ''
      }
    })()
    // Le back-office (alertes opérateur) garde ses chiffres : la règle vise ce qui part vers un client.
    const leaks = out
      .split('\n')
      .filter(Boolean)
      .filter(line => !/\/modules\/(admin|backoffice-alerts|analytics)\//.test(line))
      .filter(line => !/^\S+:\d+:\s*(\/\/|\*|\/\*)/.test(line))
    expect(leaks).toEqual([])
  })
})
