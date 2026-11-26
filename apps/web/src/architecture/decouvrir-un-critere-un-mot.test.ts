import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { supplierNamesIn } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * #3879.2 — Découvrir : un même critère porte le même mot sur les cinq vues
 * (Comptes, Contacts, Besoins et signaux, Partenaires, Liste d'appels), et aucun
 * libellé ne parle la langue de la machine ni ne nomme un fournisseur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE FAIT MESURÉ (audit du 09/10/2026, lot M13)
 * ─────────────────────────────────────────────────────────────────────────────
 *   • Le niveau de décision — UN référentiel (`resolveContactLevel`, mêmes clés
 *     `c_level`/`n1`/`n2`, `discover-filters.ts` le dit « le MÊME vocabulaire »)
 *     — s'appelait « Niveau de décision : C-level / Direction / Manager » dans le
 *     rail des Comptes et « Niveau : C-Level (sponsor) / N-1 (décideur) / N-2
 *     (relais) » sur Contacts et Liste d'appels. Deux jeux de mots pour un seul
 *     critère : le commercial ne peut pas savoir que « Direction » = « N-1 ».
 *   • Le filtre texte sur l'entreprise s'appelait « Entité » sur Contacts et
 *     « Entreprise » sur Besoins et Liste d'appels.
 *   • Des aides parlaient de la machine : « le rail », « filtre serveur »,
 *     « filtre côté écran », « code d'activité résolu », « le corpus ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES TENUES ICI
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Dans les vues, un champ de filtre lié au même critère (`value={filters.X}`
 *      ou `value={X}`) porte la MÊME clé de libellé partout ; les noms de champ
 *      qui désignent le même critère sont déclarés dans `SAME_CRITERION`. Les
 *      valeurs d'un référentiel de niveaux se traduisent par UN seul préfixe.
 *   2. Dans `discover.json`, un jeu de valeurs (mêmes clés) n'existe qu'UNE fois,
 *      sauf exception NOMMÉE ci-dessous (une aide n'est pas un second libellé).
 *   3. Aucune valeur de `discover.json` (FR et EN) ne contient un mot de la
 *      machine (`MACHINE_WORDS`) ni un nom de nos fournisseurs
 *      (`supplierNamesIn`, même liste que GA-44 — redite volontaire : la demande
 *      #3879.2 la nomme, et cette garde reste vraie si GA-44 change de portée).
 *
 * Ce qu'elle ne fait PAS : elle ne juge pas « registre » (le registre public des
 * entreprises est une source que le commercial connaît, pas un fournisseur) ni
 * les noms des colonnes de l'export CSV (`SIREN`, `Code NAF` : un tableur les
 * attend tels quels).
 */

const WEB_SRC = join(__dirname, '..')
const VIEW_DIR = join(WEB_SRC, 'features/discover/view')

/** Les fichiers qui rendent les filtres des cinq vues. #4634 — ceux de Contacts, Besoins et Liste d'appels ont quitté
 *  `ProjectionResults.tsx` / `CallListResults.tsx` pour le volet de recherche (`ProjectionSearchFields.tsx`) : la
 *  garde les lit LÀ, elle ne relit pas des fichiers qui n'en rendent plus. */
const VIEW_FILES = ['FilterRail.tsx', 'ResultsToolbar.tsx', 'ProjectionSearchFields.tsx']

/** Noms de champ différents, MÊME critère. */
const SAME_CRITERION: Record<string, string> = {
  entity: 'company',
  nature: 'signalNature',
  decisionLevels: 'level',
}

/** Paires « même clés » qui ne sont PAS un second libellé du même critère. */
const NAMED_EXCEPTIONS: Record<string, string> = {
  // G-FIX #4319 — la pastille « taille du profil appliquée » : un message d'état jumeau de `profileZone`, pas un libellé.
  profileSize: 'message d’état d’un critère du profil appliqué, pas le nom du critère',
  'resultType.hint': 'la phrase d’aide de chaque onglet, pas son nom',
  // F2-FIX #4301 (intégration PR n°2) — l'aide de vue au prénom, avec ou sans prénom : une aide, pas un second nom.
  'resultType.help': 'l’aide de chaque vue au prénom, pas son nom',
  'resultType.helpWithoutName': 'l’aide de chaque vue sans prénom, pas son nom',
  'needs.evidenceLevelHint': 'l’explication de chaque niveau de preuve, pas son nom',
  'card.barrierStrategy': 'la stratégie conseillée par classe, pas le nom de la classe',
  'barrier.class': 'le même nom préfixé de sa lettre (vérifié ci-dessous)',
  'family.help': 'l’explication de chaque famille, pas son nom',
  // #4361.1 / #4362.1 (décision n°7, 19/10/2026) — l'info-bulle des bornes PME/ETI/GE.
  'rail.sizeBandBounds': 'les bornes de chaque taille (info-bulle), pas son nom',
}

/** Clés purement structurelles : deux objets {label, hint} ne sont pas un critère. `placeholder_industrial` est la
 *  variante de vocabulaire (LUDB.3, pack non-IT) de `placeholder`, pas un second libellé. */
const STRUCTURAL_KEYS = new Set([
  'label',
  'hint',
  'help',
  'title',
  'body',
  'placeholder',
  'placeholder_industrial',
  'labelWithReason',
])

const MACHINE_WORDS =
  /\brail\b|filtre serveur|côté serveur|côté écran|server[- ]side|screen[- ]side|client[- ]side|\brésolue?s?\b|\bresolved\b|\bunresolved\b|\bcorpus\b|\bbackend\b|\bpayload\b|\bfallback\b|\bAPI\b/i

type Locale = Record<string, unknown>

function readLocale(lang: 'fr' | 'en'): Locale {
  return JSON.parse(readFileSync(join(WEB_SRC, `i18n/locales/${lang}/discover.json`), 'utf8')) as Locale
}

function leaves(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'string') return [[path, node]]
  if (!node || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
}

function stringObjects(node: unknown, path = ''): Array<{ path: string; value: Record<string, string> }> {
  if (!node || typeof node !== 'object') return []
  const entries = Object.entries(node)
  const own =
    entries.length >= 2 && entries.every(([, v]) => typeof v === 'string')
      ? [{ path, value: node as Record<string, string> }]
      : []
  return [...own, ...entries.flatMap(([k, v]) => stringObjects(v, path ? `${path}.${k}` : k))]
}

/** Règle 2 — les jeux de valeurs présents plus d'une fois, hors exceptions nommées. */
function duplicatedValueSets(locale: Locale): string[][] {
  const byKeys = new Map<string, string[]>()
  for (const { path, value } of stringObjects(locale)) {
    const keys = Object.keys(value).sort()
    if (keys.every(k => STRUCTURAL_KEYS.has(k))) continue
    if (path in NAMED_EXCEPTIONS) continue
    const id = keys.join(',')
    byKeys.set(id, [...(byKeys.get(id) ?? []), path])
  }
  return [...byKeys.values()].filter(paths => paths.length > 1)
}

/** Règle 3 — les valeurs qui parlent la machine ou nomment un fournisseur. */
function machineOrSupplierWords(locale: Locale): string[] {
  return leaves(locale).flatMap(([path, value]) => {
    const machine = MACHINE_WORDS.exec(value)?.[0]
    const suppliers = supplierNamesIn(value)
    return machine || suppliers.length > 0 ? [`${path} — « ${machine ?? suppliers.join(', ')} »`] : []
  })
}

type FieldLabel = { file: string; criterion: string; key: string }

/** Règle 1 — chaque champ de filtre rendu, rattaché à son critère et à sa clé de libellé. */
function fieldLabels(file: string, source: string): FieldLabel[] {
  const out: FieldLabel[] = []
  for (const element of source.matchAll(/<(?:TextInput|SelectInput|SelectField)\b([\s\S]*?)\/>/g)) {
    const body = element[1] ?? ''
    const field = /\bvalue=\{(?:filters\.)?(\w+)/.exec(body)?.[1]
    const key = /\bariaLabel=\{t\('([^']+)'\)\}/.exec(body)?.[1]
    if (field && key) out.push({ file, criterion: SAME_CRITERION[field] ?? field, key })
  }
  // F2-FIX #4302 (intégration PR n°2) — le rail porte désormais le libellé sur le `<Field label=…>` qui ENVELOPPE le
  // champ (inclus/exclu), plus sur son `ariaLabel` : la garde lit aussi cette forme, sinon elle ne lit plus le rail.
  for (const element of source.matchAll(
    /<Field\b[^>]*?\blabel=\{t\('([^']+)'\)\}[^>]*>\s*<(?:TextInput|SelectInput|SelectField)\b([\s\S]*?)\/>/g,
  )) {
    const field = /\bvalue=\{(?:filters\.)?(\w+)/.exec(element[2] ?? '')?.[1]
    if (field && element[1]) out.push({ file, criterion: SAME_CRITERION[field] ?? field, key: element[1] })
  }
  // Le rail rend le niveau de décision en puces sous un `<Field label=…>`.
  for (const m of source.matchAll(
    /<Field\b[^>]*?\blabel=\{t\('([^']+)'\)\}[^>]*>\s*<div[^>]*>\s*\{(DECISION_LEVEL_FILTERS)\.map/g,
  )) {
    out.push({ file, criterion: 'level', key: m[1] ?? '' })
  }
  return out
}

/** Règle 1 bis — le préfixe de traduction des valeurs d'un référentiel de niveaux. */
function levelValuePrefixes(source: string): string[] {
  return [...source.matchAll(/(?:CONTACT_LEVELS|DECISION_LEVEL_FILTERS)\.map\([\s\S]{0,400}?t\(`([\w.]+)\.\$\{/g)].map(
    m => m[1] ?? '',
  )
}

function inconsistentCriteria(labels: FieldLabel[]): string[] {
  const byCriterion = new Map<string, Set<string>>()
  for (const { criterion, key } of labels) {
    byCriterion.set(criterion, (byCriterion.get(criterion) ?? new Set()).add(key))
  }
  return [...byCriterion.entries()]
    .filter(([, keys]) => keys.size > 1)
    .map(([c, keys]) => `${c}: ${[...keys].join(' ≠ ')}`)
}

const sources = VIEW_FILES.map(file => ({ file, source: readFileSync(join(VIEW_DIR, file), 'utf8') }))
const labels = sources.flatMap(({ file, source }) => fieldLabels(file, source))

describe('#3879.2 — Découvrir : un critère, un mot, sur les cinq vues', () => {
  it('LIT quelque chose — les champs des vues et les deux langues ne sont pas vides', () => {
    expect(labels.length).toBeGreaterThanOrEqual(15)
    expect(new Set(labels.map(l => l.file)).size).toBe(VIEW_FILES.length)
    expect(labels.some(l => l.criterion === 'level' && l.file === 'FilterRail.tsx')).toBe(true)
    expect(leaves(readLocale('fr')).length).toBeGreaterThan(500)
    expect(leaves(readLocale('en')).length).toBeGreaterThan(500)
  })

  it('un même critère porte la même clé de libellé dans toutes les vues', () => {
    expect(inconsistentCriteria(labels)).toEqual([])
  })

  it('les niveaux de décision se traduisent par un seul préfixe, partout', () => {
    const prefixes = sources.flatMap(({ source }) => levelValuePrefixes(source))
    expect(prefixes.length).toBeGreaterThanOrEqual(3)
    expect(new Set(prefixes)).toEqual(new Set(['filters.decisionLevelValue']))
  })

  it.each(['fr', 'en'] as const)('%s — un jeu de valeurs n’existe qu’une fois dans discover.json', lang => {
    expect(duplicatedValueSets(readLocale(lang))).toEqual([])
  })

  it.each(['fr', 'en'] as const)('%s — « barrier.class » n’est que le nom de la classe préfixé de sa lettre', lang => {
    const locale = readLocale(lang) as {
      card: { barrierClass: Record<string, string> }
      barrier: { class: Record<string, string> }
    }
    for (const [letter, name] of Object.entries(locale.card.barrierClass)) {
      expect(locale.barrier.class[letter]).toBe(`${letter} — ${name}`)
    }
  })

  it.each(['fr', 'en'] as const)('%s — aucun mot de la machine ni nom de fournisseur', lang => {
    expect(machineOrSupplierWords(readLocale(lang))).toEqual([])
  })

  describe('sait dire NON', () => {
    it('deux clés pour le même critère, sous deux noms de champ', () => {
      const a = fieldLabels('A.tsx', `<TextInput value={filters.entity} ariaLabel={t('x.entity')} />`)
      const b = fieldLabels('B.tsx', `<TextInput value={company} ariaLabel={t('y.company')} />`)
      expect(inconsistentCriteria([...a, ...b])).toEqual(['company: x.entity ≠ y.company'])
    })

    it('le rail et une vue nomment le niveau de décision différemment', () => {
      const rail = fieldLabels(
        'Rail.tsx',
        `<Field label={t('rail.decisionLevelLabel')} hint={t('h')}>
           <div className="flex">
             {DECISION_LEVEL_FILTERS.map(level => (<ToggleChip>{t(\`rail.decisionLevel.\${level}\`)}</ToggleChip>))}`,
      )
      const view = fieldLabels(
        'V.tsx',
        `<SelectInput value={filters.level} ariaLabel={t('contactsResult.filters.level')} />`,
      )
      expect(inconsistentCriteria([...rail, ...view])).toHaveLength(1)
      expect(levelValuePrefixes(`DECISION_LEVEL_FILTERS.map(level => t(\`rail.decisionLevel.\${level}\`))`)).toEqual([
        'rail.decisionLevel',
      ])
    })

    it('un second jeu de valeurs pour les mêmes clés', () => {
      const locale = {
        rail: { lvl: { c_level: 'C-level', n1: 'Direction' } },
        view: { lvl: { c_level: 'Sponsor', n1: 'N-1' } },
      }
      expect(duplicatedValueSets(locale)).toEqual([['rail.lvl', 'view.lvl']])
    })

    it('un mot de la machine, puis un fournisseur', () => {
      expect(machineOrSupplierWords({ a: 'Coche une source dans le rail.' })).toEqual(['a — « rail »'])
      expect(machineOrSupplierWords({ a: 'Filtre serveur sur la mémoire marché' })).toHaveLength(1)
      expect(machineOrSupplierWords({ a: 'Contacts trouvés via Apollo' })).toHaveLength(1)
      // …et n'attrape pas ce qu'elle ne vise pas.
      expect(machineOrSupplierWords({ a: 'Interrogation du registre…', b: 'Ville exacte' })).toEqual([])
    })
  })
})
