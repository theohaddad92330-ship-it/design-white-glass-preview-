import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * LE MAILLON FAIBLE NE VIT QUE DANS LE COCKPIT (/pilotage).
 *
 * // décision Louis 19/10 — maillon faible : Cockpit seul
 *
 * Profil, Bienvenue et la restitution d'onboarding le montaient aussi : trois
 * copies d'une même lecture (GA-26, un endroit). Cette garde refuse tout
 * montage de `WeakestLinkDiagnosis*` ou de `useWeakestLinkDiagnosis` hors du
 * dossier du diagnostic et de la page Pilotage.
 */

const WEB_SRC = join(__dirname, '..')
const ALLOWED = [join('features', 'weakest-link-diagnosis') + '/', join('features', 'pilotage') + '/']
const MOUNT = /\bWeakestLinkDiagnosis(Summary|Section|Card)\b|\buseWeakestLinkDiagnosis\b|weakest-link-diagnosis\//

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === 'node_modules' || name === 'architecture' ? [] : sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name) ? [full] : []
  })
}

function mountsWeakestLink(code: string): boolean {
  return MOUNT.test(code)
}

describe('le maillon faible ne vit que dans le Cockpit', () => {
  it('sait dire NON — et n’attrape pas une page sans maillon', () => {
    expect(mountsWeakestLink('<WeakestLinkDiagnosisSummary framed />')).toBe(true)
    expect(mountsWeakestLink("import { useWeakestLinkDiagnosis } from '@/x'")).toBe(true)
    expect(mountsWeakestLink('<ProfileContextSection />')).toBe(false)
  })

  it('lit un corpus non vide, y compris le Cockpit', () => {
    const files = sourceFiles(WEB_SRC)
    expect(files.length).toBeGreaterThan(100)
    expect(
      files.some(
        f =>
          relative(WEB_SRC, f).startsWith(join('features', 'pilotage')) && mountsWeakestLink(readFileSync(f, 'utf8')),
      ),
    ).toBe(true)
  })

  it('aucun montage hors du dossier du diagnostic et de Pilotage', () => {
    const offenders = sourceFiles(WEB_SRC)
      .map(f => relative(WEB_SRC, f))
      .filter(rel => !ALLOWED.some(a => rel.startsWith(a)))
      .filter(rel => mountsWeakestLink(readFileSync(join(WEB_SRC, rel), 'utf8')))
    expect(offenders).toEqual([])
  })
})
