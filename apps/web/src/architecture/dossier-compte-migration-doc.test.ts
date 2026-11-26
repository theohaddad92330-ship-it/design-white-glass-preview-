import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildTabMappingTable,
  resolveLegacyTabNotice,
} from '@/features/accounts/view/account-detail/accountDetailSearch'

/**
 * GA-330 / GA-331 — LA TABLE DE CORRESPONDANCE DU DOSSIER COMPTE NE DIVERGE PAS
 * DE SON DOCUMENT, ET L'AUDIT DE CONSOMMATEURS RESTE VRAI (#2115.30-39,
 * #2130.79, #2130.86-88).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE GA-330 PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `agent_docs/dossier-compte-sections-2026-09-14.md` est une retranscription
 * VERSÉE AU DÉPÔT de `buildTabMappingTable()` — pas une seconde source. Un
 * alias ajouté au code sans que le document suive laisserait la doctrine « un
 * réglage vit à un seul endroit » vraie en apparence et fausse dans les faits :
 * deux endroits, l'un des deux périmé. Cette garde lit LES DEUX et les compare
 * ligne à ligne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE GA-331 PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * §« Consommateurs restants » du même document liste, pour Accès / Couverture /
 * Historique, la route API exacte et le fichier:ligne du contrôleur qui la
 * porte encore. « On archive, on ne supprime pas » — mais un audit qui ment
 * (une route déplacée, retirée, dont la ligne citée ne correspond plus) serait
 * pire qu'aucun audit : il affirmerait une protection qui n'existe plus. Cette
 * garde relit CHAQUE route citée dans le VRAI contrôleur.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DOC_PATH = join(REPO_ROOT, 'agent_docs', 'dossier-compte-sections-2026-09-14.md')
const API_SRC = join(REPO_ROOT, 'apps', 'api', 'src')

function readDoc(): string {
  return readFileSync(DOC_PATH, 'utf8')
}

interface DocMappingRow {
  value: string
  tab: string
  section: string
  anchor: string
  ownerPage: string
  kind: string
}

/** Une ligne du tableau à 6 colonnes — la seule forme de ligne que ce regex
 *  reconnaît est `| \`valeur\` | \`onglet\` | Libellé (\`section\`) | \`ancre\` |
 *  \`page\` | genre |`. L'en-tête et le séparateur markdown (`| --- | ... |`)
 *  n'ont pas de première cellule entourée de backticks : ils ne matchent pas. */
function parseMappingRows(markdown: string): DocMappingRow[] {
  const re =
    /^\|\s*`([a-z0-9-]+)`\s*\|\s*`([a-zA-Z]+)`\s*\|[^(]*\(`([a-zA-Z]+)`\)\s*\|\s*`(dossier-[a-z]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|$/
  const rows: DocMappingRow[] = []
  for (const line of markdown.split('\n')) {
    const m = re.exec(line)
    if (m) rows.push({ value: m[1], tab: m[2], section: m[3], anchor: m[4], ownerPage: m[5], kind: m[6] })
  }
  return rows
}

interface DocAuditedRoute {
  method: string
  path: string
  controllerFile: string
  controllerLine: number
}

/** Une ligne des tableaux « Consommateurs restants » : `| \`GET /chemin\` |
 *  \`fichier.controller.ts:42\` | appelant... |`. */
function parseAuditedRoutes(markdown: string): DocAuditedRoute[] {
  const re = /^\|\s*`([A-Z]+) ([^`]+)`\s*\|\s*`([a-zA-Z.-]+\.controller\.ts):(\d+)`\s*\|/
  const routes: DocAuditedRoute[] = []
  for (const line of markdown.split('\n')) {
    const m = re.exec(line)
    if (m) routes.push({ method: m[1], path: m[2], controllerFile: m[3], controllerLine: Number(m[4]) })
  }
  return routes
}

function findFile(dir: string, basename: string): string | undefined {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      const found = findFile(full, basename)
      if (found) return found
      continue
    }
    if (entry === basename) return full
  }
  return undefined
}

function controllerBasePath(source: string): string {
  return source.match(/@Controller\('([^']*)'\)/)?.[1] ?? ''
}

const HTTP_DECORATOR: Record<string, string> = {
  GET: 'Get',
  POST: 'Post',
  DELETE: 'Delete',
  PATCH: 'Patch',
  PUT: 'Put',
}

describe('GA-330 — la garde LIT quelque chose', () => {
  it('trouve le document et sa table, et elle n’est pas vide', () => {
    const fromCode = buildTabMappingTable()
    const fromDoc = parseMappingRows(readDoc())
    expect(fromCode.length).toBeGreaterThanOrEqual(44)
    expect(fromDoc.length).toBe(fromCode.length)
  })
})

describe('GA-330 — la table du document EST buildTabMappingTable(), rien de plus, rien de moins', () => {
  it('chaque ligne (valeur, onglet, section, ancre, page) est identique, dans le même ordre', () => {
    const fromCode = buildTabMappingTable()
    const fromDoc = parseMappingRows(readDoc())
    const codeShape = fromCode.map(r => ({
      value: r.value,
      tab: r.tab,
      section: r.section,
      anchor: r.anchor,
      ownerPage: r.ownerPage,
    }))
    const docShape = fromDoc.map(({ kind: _kind, ...rest }) => rest)
    expect(docShape).toEqual(codeShape)
  })

  it('#2115.33 — la colonne « Notice de migration » suit `resolveLegacyTabNotice`, pas une opinion écrite à la main', () => {
    for (const row of parseMappingRows(readDoc())) {
      const notice = resolveLegacyTabNotice(row.value)
      if (row.kind === 'ancien (notice)') {
        expect(notice, `${row.value} est marqué « ancien » mais ne déclenche aucune notice`).toBeDefined()
      } else {
        expect(notice, `${row.value} est marqué « ${row.kind} » mais déclenche une notice`).toBeUndefined()
      }
    }
  })
})

describe('GA-330 — le témoin : elle n’attrape pas ce qu’elle ne vise pas', () => {
  it('ne dit rien de la mise en forme des libellés (Synthèse, Périmètres…) — seulement des clés machine', () => {
    // Renommer un LIBELLÉ (texte affiché) sans toucher aux clés ne doit pas
    // faire rougir cette garde : elle protège la CORRESPONDANCE, pas la prose.
    const withRenamedLabel = readDoc().replace('Synthèse (`synthesis`)', 'SYNTHÈSE — vue d’ensemble (`synthesis`)')
    expect(parseMappingRows(withRenamedLabel).find(r => r.value === 'overview')?.section).toBe('synthesis')
  })

  it('sait dire NON : une ligne retirée du document fait diverger les deux tables', () => {
    const amputé = readDoc()
      .split('\n')
      .filter(line => !/^\|\s*`score`\s*\|/.test(line))
      .join('\n')
    const fromCode = buildTabMappingTable().map(r => r.value)
    const fromDoc = parseMappingRows(amputé).map(r => r.value)
    expect(fromDoc.length).toBe(fromCode.length - 1)
    expect(fromCode).not.toEqual(fromDoc)
  })
})

describe('GA-331 — l’audit des consommateurs reste vrai', () => {
  const routes = parseAuditedRoutes(readDoc())

  it('la garde LIT quelque chose : au moins les quatre routes Accès + une Couverture + quatre Historique', () => {
    expect(routes.length).toBeGreaterThanOrEqual(9)
  })

  it.each(routes)(
    '$method $path existe encore dans $controllerFile:$controllerLine',
    ({ method, path, controllerFile, controllerLine }) => {
      const file = findFile(API_SRC, controllerFile)
      expect(file, `${controllerFile} introuvable sous apps/api/src — a-t-il été déplacé ou supprimé ?`).toBeDefined()
      const source = readFileSync(file as string, 'utf8')
      const base = controllerBasePath(source)
      const lineText = source.split('\n')[controllerLine - 1] ?? ''
      const decorator = HTTP_DECORATOR[method]
      const match = new RegExp(`@${decorator}\\((?:'([^']*)')?\\)`).exec(lineText)
      expect(
        match,
        `${controllerFile}:${controllerLine} n'est plus un @${decorator}(...) — la route a bougé, le document ment`,
      ).not.toBeNull()
      const subPath = match?.[1] ?? ''
      const fullPath = subPath ? `/${base}/${subPath}` : `/${base}`
      expect(fullPath, `route recalculée depuis ${controllerFile}:${controllerLine}`).toBe(path)
    },
  )

  it('sait dire NON : une route qui n’existe plus au numéro de ligne cité fait rougir la garde', () => {
    // #2130.87 — le témoin prend son numéro de ligne DANS LE DOCUMENT, jamais en dur.
    // Écrit en dur (`29`), il rougissait à chaque fois qu'un décorateur ajouté plus
    // haut dans le contrôleur décalait la route — mesuré le 16/09/2026, la vague 11
    // a poussé `@Get(':id/coverage-gaps')` de la ligne 30 à la 42 en ajoutant une
    // dépendance au constructeur, et la garde a accusé le document d'un mensonge
    // qu'elle venait de fabriquer elle-même. Un témoin qui se périme tout seul
    // n'apprend rien : il apprend seulement à être remis à jour.
    const cite = routes.find(r => r.controllerFile === 'coverage.controller.ts')
    expect(cite, 'le document ne cite plus coverage.controller.ts — ce témoin n’a plus de sujet').toBeDefined()
    const index = (cite as DocAuditedRoute).controllerLine - 1
    const file = findFile(API_SRC, 'coverage.controller.ts') as string
    const source = readFileSync(file, 'utf8')
    const tamperedLines = source.split('\n')
    const target = tamperedLines[index]
    expect(
      target,
      `la ligne ${index + 1} de coverage.controller.ts ne porte pas la route citée par le document`,
    ).toContain("@Get(':id/coverage-gaps')")
    tamperedLines[index] = target.replace("@Get(':id/coverage-gaps')", "@Get(':id/coverage-gaps-renamed')")
    const tampered = tamperedLines.join('\n')
    const base = controllerBasePath(tampered)
    const lineText = tampered.split('\n')[index]
    const match = /@Get\((?:'([^']*)')?\)/.exec(lineText)
    const fullPath = match?.[1] ? `/${base}/${match[1]}` : `/${base}`
    expect(fullPath).not.toBe('/accounts/:id/coverage-gaps')
  })
})
