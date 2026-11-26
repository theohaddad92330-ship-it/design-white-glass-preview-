/**
 * #4805 — une vue ne disparaît PAS en silence.
 *
 * #4749 : un compte à 1 658 contacts affichait RIEN dans son organigramme — la vue rendait `null`
 * (`if (!view) return null`) et aucune des huit gardes d'état vide ne l'a vu : elles raisonnent en
 * ÉCRANS DÉCLARÉS, un composant imbriqué qui rend `null` dans un onglet n'en est pas un.
 *
 * PÉRIMÈTRE (mesuré, volontairement restreint — l'élargissement brut à tous les `return null` est
 * INTENABLE : ~1 016 lignes dans 669 fichiers) : les fichiers `*View|*Section|*Panel|*Card|*Table.tsx`
 * dont une ligne `if (<absence de données>) return null` rend rien. Une prop optionnelle, un garde-fou de
 * typage, un `open`/`role`/permission ne sont pas visés. Ce périmètre reste un SURENSEMBLE heuristique.
 *
 * CLIQUET, PAS MUR : les sites connus et tolérés vivent dans `une-vue-ne-disparait-pas-en-silence.baseline.txt`.
 * Un site NOUVEAU fait échouer ; un site DEVENU propre doit être RETIRÉ de la liste. Le compte ne peut que baisser.
 *
 * LES TROIS PREUVES : elle sait dire NON (un composant fabriqué qui rend `null` sur une absence est nommé),
 * elle LIT (le balayage voit des dizaines de sites), et elle n'attrape pas ce qu'elle ne vise pas
 * (prop optionnelle, absence NOMMÉE). Le plafond se lit avec `^[0-9]+`, jamais sur le fichier entier.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const BASELINE = join(__dirname, 'une-vue-ne-disparait-pas-en-silence.baseline.txt')

const VIEW_FILE = /(View|Section|Panel|Card|Table)\.tsx$/
const SILENT_NULL = /^\s*if \((.+)\) return null\s*$/
/** Une absence de données (longueur nulle, valeur absente) — pas une prop de présentation. */
const DATA_ABSENCE =
  /(\.length === 0|!\w+(\?\.|\.)length\b|^!(data|view|result|items|rows|list|graph|analysis|signals|summary)\b|=== undefined \|\| .*length)/

/** Les sites `fichier :: condition` d'une source, un par occurrence. */
function silentSitesOf(file: string, source: string): string[] {
  if (!VIEW_FILE.test(file) || /\.(test|stories)\./.test(file)) return []
  const sites: string[] = []
  for (const line of source.split('\n')) {
    const condition = SILENT_NULL.exec(line)?.[1]
    if (condition && DATA_ABSENCE.test(condition)) sites.push(`${file} :: ${condition}`)
  }
  return sites
}

/** Le plafond : le PREMIER entier en début de ligne. Les commentaires chiffrés ne comptent pas. */
function readCeiling(text: string): number {
  const match = /^[0-9]+/m.exec(text)
  if (!match) throw new Error('baseline sans plafond chiffré')
  return Number(match[0])
}

/** Les entrées tolérées : toute ligne qui n'est ni un commentaire, ni vide, ni le plafond. */
function toleratedOf(text: string): string[] {
  return text.split('\n').filter(line => !line.startsWith('#') && line.includes(' :: '))
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.tsx')) out.push(path)
  }
  return out
}

function scanSrc(): string[] {
  return walk(SRC)
    .flatMap(path => silentSitesOf(relative(SRC, path).split('\\').join('/'), readFileSync(path, 'utf8')))
    .sort()
}

describe('#4805 — une vue ne disparaît pas en silence', () => {
  it('LIT quelque chose : le balayage voit des dizaines de sites dans des dizaines de fichiers', () => {
    const sites = scanSrc()
    expect(sites.length).toBeGreaterThan(40)
    expect(new Set(sites.map(site => site.split(' :: ')[0])).size).toBeGreaterThan(20)
  })

  it('sait dire NON : un composant qui rend `null` sur une absence de données déjà chargées est nommé', () => {
    const planted = [
      'export function FakeOrgView({ data }: { data: string[] | undefined }) {',
      '  const view = data ?? []',
      '  if (view.length === 0) return null',
      '  return <ul />',
      '}',
    ].join('\n')
    expect(silentSitesOf('features/x/FakeOrgView.tsx', planted)).toEqual([
      'features/x/FakeOrgView.tsx :: view.length === 0',
    ])
    const absent = 'export function FakeCard({ data }) {\n  if (!data) return null\n  return <p />\n}'
    expect(silentSitesOf('features/x/FakeCard.tsx', absent)).toEqual(['features/x/FakeCard.tsx :: !data'])
  })

  it('n’attrape pas ce qu’elle ne vise pas : prop optionnelle, absence NOMMÉE, fichier hors périmètre', () => {
    const optionalProp = 'export function FakePanel({ onClose }) {\n  if (!onClose) return null\n  return <p />\n}'
    expect(silentSitesOf('features/x/FakePanel.tsx', optionalProp)).toEqual([])
    const named =
      'export function FakeCard({ rows }) {\n  if (rows.length === 0) return <NamedAbsence what="x" />\n  return <p />\n}'
    expect(silentSitesOf('features/x/FakeCard.tsx', named)).toEqual([])
    const notAView = 'export function useThing() {\n  if (rows.length === 0) return null\n}'
    expect(silentSitesOf('features/x/useThing.tsx', notAView)).toEqual([])
    const inTest = 'if (view.length === 0) return null'
    expect(silentSitesOf('features/x/FakeView.test.tsx', inTest)).toEqual([])
  })

  it('le plafond se lit sur le premier entier de ligne : un commentaire chiffré ne le gonfle pas', () => {
    const withNumericComments = [
      '# 1658 contacts, 4749 — un commentaire chiffré',
      '# 20260929 ligne de motif',
      '7',
      'a.tsx :: x.length === 0',
    ].join('\n')
    expect(readCeiling(withNumericComments)).toBe(7)
    expect(() => readCeiling('# rien de chiffré en début de ligne')).toThrow()
  })

  it('CLIQUET : aucun site neuf, aucun site retiré non nettoyé, le plafond égale la liste', () => {
    const baseline = readFileSync(BASELINE, 'utf8')
    const tolerated = toleratedOf(baseline)
    const found = scanSrc()
    expect(readCeiling(baseline), 'plafond ≠ nombre d’entrées de la liste').toBe(tolerated.length)

    const remaining = [...tolerated]
    const fresh: string[] = []
    for (const site of found) {
      const at = remaining.indexOf(site)
      if (at === -1) fresh.push(site)
      else remaining.splice(at, 1)
    }
    expect(fresh, 'NOUVEAU site muet : nomme l’absence (NamedAbsence) au lieu de `return null`').toEqual([])
    expect(remaining, 'site DEVENU propre : retire-le de la baseline (le compte ne fait que baisser)').toEqual([])
  })
})
