import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readBuiltAt } from './build-time'

// #4711.1 / #4711.2 — la date de CONSTRUCTION, posée au build et relue ; jamais l'heure du démarrage.
describe('readBuiltAt', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'built-at-'))

  it('lit la variable BUILD_TIME quand la plateforme la pose', () => {
    expect(readBuiltAt({ BUILD_TIME: '2026-11-01T08:00:00Z' }, dir())).toBe('2026-11-01T08:00:00Z')
  })

  it('lit build-time.txt, posé par la commande de build, quand la variable manque', () => {
    const cwd = dir()
    writeFileSync(join(cwd, 'build-time.txt'), '2026-11-01T09:30:00Z\n')
    expect(readBuiltAt({}, cwd)).toBe('2026-11-01T09:30:00Z')
  })

  it('ni variable ni fichier : null, jamais une date devinée', () => {
    expect(readBuiltAt({}, dir())).toBeNull()
  })

  it('une valeur qui n’est pas une date est refusée (null), jamais rendue telle quelle', () => {
    const cwd = dir()
    writeFileSync(join(cwd, 'build-time.txt'), 'pas une date')
    expect(readBuiltAt({}, cwd)).toBeNull()
    expect(readBuiltAt({ BUILD_TIME: '$(date)' }, dir())).toBeNull()
  })

  it('#4711.2 — relu depuis le dossier du module quand le dossier courant n’a pas le fichier', () => {
    const root = dir()
    writeFileSync(join(root, 'build-time.txt'), '2026-11-02T10:00:00Z\n')
    const nested = join(root, 'dist', 'modules', 'health')
    mkdirSync(nested, { recursive: true })
    expect(readBuiltAt({}, dir(), nested)).toBe('2026-11-02T10:00:00Z')
  })
})
