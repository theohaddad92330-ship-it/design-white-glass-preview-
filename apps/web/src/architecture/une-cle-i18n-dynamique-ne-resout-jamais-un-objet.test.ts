import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-383 — UNE CLÉ i18n DYNAMIQUE NE RÉSOUT JAMAIS UN OBJET.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT DE FAMILLE (#2693, #2695, #2697 — « trois défauts nommés »)
 * ─────────────────────────────────────────────────────────────────────────────
 * `/accounts` → panneau « Convertir en opportunité » → champ « Étape de départ » :
 * deux des cinq options affichaient littéralement
 * `key 'stages.qualified (fr)' returned an object instead of string.` — le
 * message D'i18next LUI-MÊME, à l'écran, à la place du libellé. La ligne
 * fautive lit `t(\`stages.${candidate}\`, { defaultValue: candidate })` :
 * `projects:stages` est le namespace du FUNNEL de pistes
 * (signal/plausible/qualified/confirmed, chacun un objet {tab,label,help}),
 * pas celui du pipe — deux candidats de `PIPELINE_STAGES` y retombaient sur
 * une clé homonyme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES GARDES EXISTANTES NE POUVAIENT PAS LE VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `keys-resolve.test.ts` le dit lui-même : il « ne voit QUE les clés
 * littérales en apostrophes simples » — un `t(\`x.${y}\`)` est hors de sa
 * portée par construction. `enum-keys.test.ts` couvre les clés dynamiques,
 * mais par ENREGISTREMENT MANUEL : un couple {namespace, prefix, values} par
 * appelant, ajouté à la main — et il exempte volontairement tout appel qui
 * passe déjà un `defaultValue`, sur l'hypothèse que `defaultValue` protège
 * toujours. Fausse ici : la clé existe déjà, sous forme d'OBJET, et
 * `defaultValue` ne joue que si la clé est ABSENTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE FAIT DIFFÉREMMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne demande AUCUN enregistrement. Elle lit la FORME du catalogue : un
 * préfixe dont TOUS les enfants existants sont des objets (jamais une seule
 * chaîne) est un namespace de NAVIGATION (`{tab, label, help}` par exemple),
 * jamais un dictionnaire de libellés — y interpoler une clé EN FEUILLE (rien
 * après la `${…}`, jusqu'à la fermeture du template) ne peut que rendre un
 * objet. Une navigation EXPLICITE vers un sous-champ (`stages.${x}.help`,
 * `stages.${x}.label` — ce que `NeedBadges.tsx` fait, légitimement) n'est PAS
 * visée : la garde ne regarde que les templates qui utilisent l'interpolation
 * COMME clé finale.
 *
 * ⚠️ Elle ne sait pas non plus tout voir : un préfixe MIXTE (des chaînes ET un
 * objet, comme `consultants:staffing` qui porte `unknown: 'À confirmer'` À
 * CÔTÉ de `provenance: {...}`) n'est pas signalé, parce que la garde ne
 * connaît pas l'ensemble des valeurs que `${…}` peut prendre à cet endroit —
 * ce serait alors un faux rouge sur du code déjà juste. C'est une limite
 * assumée, pas un trou : le défaut réel était un namespace intégralement fait
 * d'objets, et c'est ce cas-là qu'elle refuse.
 *
 * ⚠️ EXCEPTION CONNUE, DATÉE, SUIVIE (pas un `écarté`, un CHANTIER EN VOL) :
 * le call site de #2693 ci-dessus est DÉJÀ corrigé sur
 * `fix/trois-defauts-nommes-22-09` (commit `2322de565`, lit
 * `DEFAULT_STAGE_LABELS` désormais), fusionné dans `integration-vague-14-22-09`
 * au moment où cette garde est écrite — mais PAS ENCORE dans `main`, dont
 * cette branche part fraîche. Le retirer de l'allowlist DÈS que le correctif
 * atterrit sur `main` est la preuve que la garde est vivante, pas un totem.
 */

const SRC = join(__dirname, '..')
const LOCALES = join(SRC, 'i18n', 'locales')
const LANGUAGES = ['fr', 'en']

/** #2693 — déjà corrigé ailleurs (voir note ci-dessus), retiré ici dès que
 *  `main` porte le correctif : cette allowlist doit tendre vers `[]`. */
const CORRIGES_AILLEURS_EN_ATTENTE_DINTEGRATION = [
  'features/accounts/view/account-detail/tabs/opportunities/QualificationLeadsQueue.tsx → fr:projects:stages',
  'features/accounts/view/account-detail/tabs/opportunities/QualificationLeadsQueue.tsx → en:projects:stages',
]

type Json = Record<string, unknown>

function loadCatalog(lang: string): Json {
  const dir = join(LOCALES, lang)
  const catalog: Json = {}
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue
    catalog[entry.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(dir, entry), 'utf8')) as Json
  }
  return catalog
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/[^\n]*/g, '')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

type Bind = { namespaces: string[]; keyPrefix: string | null }

/** Même patron que `keys-resolve.test.ts` — un alias par `useTranslation(...)`. */
function bindsOf(source: string): Map<string, Bind[]> {
  const binds = new Map<string, Bind[]>()
  const pattern =
    /const\s*\{\s*t(?::\s*(\w+))?[^}]*\}\s*=\s*useTranslation\(\s*(\[[^\]]*\]|'[^']*')?\s*(?:,\s*\{[^}]*?keyPrefix:\s*'([^']+)'[^}]*\})?\s*\)/g
  for (const match of source.matchAll(pattern)) {
    const alias = match[1] ?? 't'
    const rawNs = match[2]
    const namespaces = rawNs ? [...rawNs.matchAll(/'([^']+)'/g)].map(m => m[1]) : ['common']
    const list = binds.get(alias) ?? []
    list.push({ namespaces, keyPrefix: match[3] ?? null })
    binds.set(alias, list)
  }
  return binds
}

function walk(tree: unknown, path: string): unknown {
  let cursor: unknown = tree
  for (const part of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(part in (cursor as Json))) return undefined
    cursor = (cursor as Json)[part]
  }
  return cursor
}

function isObjectValue(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

/** Vrai si TOUS les enfants existants sont eux-mêmes des objets — un
 *  namespace de navigation, jamais un dictionnaire de libellés. */
function isPureObjectNamespace(node: unknown): boolean {
  if (!isObjectValue(node) || Array.isArray(node)) return false
  const values = Object.values(node as Json)
  return values.length > 0 && values.every(isObjectValue)
}

/** Les templates `t(\`préfixe.${x}\`)` où l'interpolation est LA CLÉ FINALE —
 *  rien entre `}` et la fermeture du template. Exportée pour la preuve. */
export function unsafeDynamicKeys(rawSource: string, catalogs: Record<string, Json>): string[] {
  const source = stripComments(rawSource)
  const binds = bindsOf(source)
  const offenders: string[] = []
  for (const [alias, pairs] of binds) {
    const call = new RegExp(`\\b${alias}\\(\\s*\`([a-zA-Z0-9_.]+)\\.\\$\\{[^}\`]+\\}\``, 'g')
    for (const match of source.matchAll(call)) {
      const prefix = match[1]
      for (const bind of pairs) {
        const full = bind.keyPrefix ? `${bind.keyPrefix}.${prefix}` : prefix
        for (const ns of bind.namespaces) {
          for (const lang of LANGUAGES) {
            const node = walk(catalogs[lang]?.[ns], full)
            if (isPureObjectNamespace(node)) offenders.push(`${lang}:${ns}:${full}`)
          }
        }
      }
    }
  }
  return offenders
}

describe('une clé i18n dynamique ne résout jamais un objet (GA-383)', () => {
  const files = sourceFiles(SRC)
  const catalogs = Object.fromEntries(LANGUAGES.map(lang => [lang, loadCatalog(lang)]))

  it('lit un corpus non vide', () => {
    expect(files.length).toBeGreaterThan(400)
    const calls = files.reduce(
      (total, file) => total + (readFileSync(file, 'utf8').match(/\bt\w*\(\s*`[^`]+\$\{/g) ?? []).length,
      0,
    )
    // Le motif existe réellement dans le dépôt (NeedBadges, PartnerPipeline,
    // TalentFilters…) — un plancher bas confirme que la garde LIT quelque
    // chose, pas qu'elle tourne à vide.
    expect(calls).toBeGreaterThan(10)
  })

  it('sait dire NON — le namespace du funnel de pistes est refusé, nommé', () => {
    const coupable =
      "const { t } = useTranslation('projects')\nconst x = t(`stages.${candidate}`, { defaultValue: candidate })"
    expect(unsafeDynamicKeys(coupable, catalogs)).toEqual(['fr:projects:stages', 'en:projects:stages'])
  })

  it('ne signale pas une navigation EXPLICITE vers un sous-champ', () => {
    const explicite = "const { t } = useTranslation('projects')\nconst x = t(`stages.${stage}.help`)"
    expect(unsafeDynamicKeys(explicite, catalogs)).toEqual([])
  })

  it('ne signale pas un préfixe déjà correct (stage.states, un dictionnaire plat)', () => {
    const correct =
      "const { t } = useTranslation('projects')\nconst x = t(`stage.states.${candidate}`, { defaultValue: candidate })"
    expect(unsafeDynamicKeys(correct, catalogs)).toEqual([])
  })

  it('aucune clé dynamique du dépôt ne vise un namespace intégralement fait d’objets — hors correctif déjà en vol ailleurs (#2693)', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const offense of unsafeDynamicKeys(readFileSync(file, 'utf8'), catalogs)) {
        offenders.push(`${file.slice(SRC.length + 1)} → ${offense}`)
      }
    }
    const nouveaux = offenders.filter(offense => !CORRIGES_AILLEURS_EN_ATTENTE_DINTEGRATION.includes(offense))
    expect(nouveaux).toEqual([])
  })
})
