/**
 * GA-48 — aucune SÉRIE ni aucune TENDANCE inventée ne s'affiche.
 *
 * ⚠️ Deuxième moitié ajoutée le 28/08/2026 : le §6 en bas de fichier. La garde
 * ne surveillait que les courbes, et pendant ce temps deux tuiles du tableau de
 * bord affichaient « Stable » en permanence sur un `trend: k ? 0 : null` écrit
 * en dur. Une série fabriquée et une tendance fabriquée sont la même faute à
 * deux échelles — la seconde est simplement plus facile à écrire.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ LE 27/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * `features/dashboard/lib/sparklines.ts` exportait deux séries écrites à la
 * main — `SPARKLINE_UP = [{ v: 4 }, { v: 6 }, …]` et `SPARKLINE_FLAT` — que
 * `KpiRow.tsx` passait à trois cartes KPI, À CÔTÉ de chiffres réels servis par
 * l'API. Le fichier l'assumait en commentaire (« décoratif pur »).
 *
 * Un commentaire ne protège personne : à l'écran, une courbe montante posée
 * contre un chiffre vrai SE LIT comme la tendance de ce chiffre. C'est un
 * graphique qui ment, et rien ne permet au lecteur de savoir qu'il est faux.
 * C'est l'interdit le plus dur du dépôt — « JAMAIS de donnée fictive ».
 *
 * Une courbe PLATE n'est pas une porte de sortie : plat est aussi une
 * affirmation. La sortie honnête est l'absence de courbe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN INTERDIT, ET PAS UN CLIQUET
 * ─────────────────────────────────────────────────────────────────────────
 * Un cliquet gèle une dette qu'on résorbe. Ici il n'y a pas de dette à
 * résorber : après le retrait des deux constantes, le compte est ZÉRO. Toute
 * réapparition est une régression, pas un héritage.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE COMPARE DES STRUCTURES, ET PAS DES CHAÎNES
 * ─────────────────────────────────────────────────────────────────────────
 * Une garde qui cherche le MOT « sparkline » trouve les commentaires, les noms
 * de props et la documentation — et rate la même série renommée `TREND_DATA`.
 * Celle-ci ne lit aucun mot : elle reconnaît la FORME d'une série (un tableau
 * d'au moins trois objets dont toutes les valeurs sont des nombres littéraux,
 * ou d'au moins quatre nombres nus), après avoir retiré commentaires et
 * chaînes de caractères, puis suit l'identifiant jusqu'au module qui le
 * déclare — c'est ce chaînage qui manquait : la série vivait dans
 * `sparklines.ts`, la fausse promesse s'affichait dans `KpiRow.tsx`.
 *
 * Les deux preuves exigées d'une garde :
 *  · elle SAIT DIRE NON  → `describe('le détecteur…')` lui soumet des cas
 *    fabriqués et vérifie qu'elle les refuse ;
 *  · elle LIT quelque chose → `describe('le corpus…')` vérifie que le corpus
 *    n'est pas vide ET qu'il contient les fichiers concernés (une garde dont
 *    le corpus se viderait passerait au vert sans rien lire).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

/* ------------------------------------------------------------------ */
/*  1. Retirer ce qui n'est pas du code                                */
/* ------------------------------------------------------------------ */

/**
 * Remplace commentaires, chaînes et littéraux d'expression régulière par des
 * espaces. On préserve la longueur pour que les offsets restent lisibles.
 *
 * Le `/` est ambigu en JavaScript (division ou début d'expression régulière) :
 * on tranche sur le dernier caractère significatif, l'heuristique usuelle.
 * Sans elle, `/https?:\/\//` fait croire à un commentaire de ligne et avale la
 * fin de la ligne — donc potentiellement une vraie série.
 */
function stripNonCode(src: string): string {
  const out: string[] = []
  let lastSignificant = ''
  let i = 0

  const blank = (text: string): void => {
    for (const char of text) out.push(char === '\n' ? '\n' : ' ')
  }

  while (i < src.length) {
    const char = src[i] as string
    const next = src[i + 1]

    if (char === '/' && next === '/') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      blank(src.slice(i, stop))
      i = stop
      continue
    }

    if (char === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      blank(src.slice(i, stop))
      i = stop
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === char) break
        j += 1
      }
      const stop = Math.min(j + 1, src.length)
      out.push(char)
      blank(src.slice(i + 1, stop - 1))
      if (stop - 1 > i) out.push(char)
      i = stop
      lastSignificant = char
      continue
    }

    if (char === '/' && canStartRegex(lastSignificant)) {
      let j = i + 1
      let inClass = false
      while (j < src.length) {
        const cur = src[j]
        if (cur === '\\') {
          j += 2
          continue
        }
        if (cur === '[') inClass = true
        else if (cur === ']') inClass = false
        else if (cur === '/' && !inClass) break
        else if (cur === '\n') break
        j += 1
      }
      if (src[j] === '/') {
        blank(src.slice(i, j + 1))
        i = j + 1
        lastSignificant = '/'
        continue
      }
    }

    out.push(char)
    if (!/\s/.test(char)) lastSignificant = char
    i += 1
  }

  return out.join('')
}

/** Après ces caractères, un `/` ouvre une expression régulière, pas une division. */
function canStartRegex(previous: string): boolean {
  return previous === '' || '(,=:[!&|?{};+-*%<>~^'.includes(previous)
}

/* ------------------------------------------------------------------ */
/*  2. Reconnaître la FORME d'une série                                */
/* ------------------------------------------------------------------ */

/** `{ v: 4 }` — clé simple ou entre guillemets, valeur numérique littérale. */
const NUMERIC_OBJECT =
  /^\{\s*(?:[A-Za-z_$][\w$]*|'[^']*'|"[^"]*")\s*:\s*-?\d+(?:\.\d+)?\s*(?:,\s*(?:[A-Za-z_$][\w$]*|'[^']*'|"[^"]*")\s*:\s*-?\d+(?:\.\d+)?\s*)*,?\s*\}$/

/** Nombre minimum de points au-delà duquel un tableau littéral raconte une COURBE. */
const MIN_OBJECT_POINTS = 3
/** Un tableau de nombres nus doit être plus long pour ne pas confondre avec une courbe de Bézier. */
const MIN_BARE_NUMBER_POINTS = 4

/** Découpe le contenu d'un tableau au premier niveau (ignore les imbrications). */
function splitTopLevel(inner: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const char of inner) {
    if ('([{'.includes(char)) depth += 1
    if (')]}'.includes(char)) depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  parts.push(current)
  return parts.map(part => part.trim()).filter(part => part.length > 0)
}

/** Le texte est-il, à lui seul, une série littérale ? */
function isLiteralSeries(expression: string): boolean {
  const text = expression.trim()
  if (!text.startsWith('[') || !text.endsWith(']')) return false
  const elements = splitTopLevel(text.slice(1, -1))
  if (elements.every(element => NUMERIC_OBJECT.test(element))) {
    return elements.length >= MIN_OBJECT_POINTS
  }
  if (elements.every(element => /^-?\d+(?:\.\d+)?$/.test(element))) {
    return elements.length >= MIN_BARE_NUMBER_POINTS
  }
  return false
}

/** Toutes les séries littérales présentes n'importe où dans un corps de fichier. */
function findLiteralSeries(body: string): string[] {
  const hits: string[] = []
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '[') continue
    const end = matchBracket(body, i, '[', ']')
    if (end === -1) continue
    const candidate = body.slice(i, end + 1)
    if (isLiteralSeries(candidate)) {
      hits.push(candidate.replace(/\s+/g, ' '))
      i = end
    }
  }
  return hits
}

/** Index du délimiteur fermant correspondant à `body[start]`, ou -1. */
function matchBracket(body: string, start: number, open: string, close: string): number {
  let depth = 0
  for (let i = start; i < body.length; i += 1) {
    const char = body[i]
    if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/* ------------------------------------------------------------------ */
/*  3. Suivre l'identifiant jusqu'au module qui le déclare             */
/* ------------------------------------------------------------------ */

/** Props par lesquelles une valeur devient une COURBE à l'écran. */
const CHART_DATA_ATTRIBUTES = ['data', 'chartData', 'sparklineData', 'series'] as const

type AttributeUse = { attribute: string; expression: string }

/** Chaque `attr={…}` d'intérêt d'un fichier, avec son expression complète. */
function chartAttributeUses(body: string): AttributeUse[] {
  const uses: AttributeUse[] = []
  for (const attribute of CHART_DATA_ATTRIBUTES) {
    const opener = new RegExp(`(?:^|[\\s{])${attribute}=\\{`, 'g')
    let match = opener.exec(body)
    while (match !== null) {
      const braceIndex = body.indexOf('{', match.index + match[0].length - 1)
      const end = matchBracket(body, braceIndex, '{', '}')
      if (end !== -1) uses.push({ attribute, expression: body.slice(braceIndex + 1, end).trim() })
      match = opener.exec(body)
    }
  }
  return uses
}

/** La déclaration `const NAME = …` d'un fichier, si son initialiseur est une série. */
function declaredSeries(body: string, name: string): string | null {
  const declaration = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]*)?=\\s*`)
  const match = declaration.exec(body)
  if (!match) return null
  const start = body.indexOf('[', match.index + match[0].length)
  if (start === -1) return null
  const end = matchBracket(body, start, '[', ']')
  if (end === -1) return null
  const candidate = body.slice(start, end + 1)
  return isLiteralSeries(candidate) ? candidate.replace(/\s+/g, ' ') : null
}

/** Le fichier d'où `name` est importé, résolu sur le disque. */
function importSource(body: string, name: string, fromFile: string): string | null {
  const imports = body.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+([^\n]*)/g)
  for (const found of imports) {
    const names = (found[1] as string).split(',').map(part =>
      part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim(),
    )
    if (!names.includes(name)) continue
    // Les chaînes ont été blanchies : le spécificateur se relit dans la source brute.
    const raw = readFileSync(fromFile, 'utf8')
    const specifier = new RegExp(
      `import\\s+(?:type\\s+)?\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+['"]([^'"]+)['"]`,
    ).exec(raw)?.[1]
    if (!specifier) continue
    return resolveModule(specifier, fromFile)
  }
  return null
}

function resolveModule(specifier: string, fromFile: string): string | null {
  let base: string
  if (specifier.startsWith('.')) base = resolve(dirname(fromFile), specifier)
  else if (specifier.startsWith('@/')) base = join(SRC, specifier.slice(2))
  else return null
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/* ------------------------------------------------------------------ */
/*  4. Le corpus                                                       */
/* ------------------------------------------------------------------ */

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (entry.includes('.test.') || entry.includes('.spec.')) continue
    out.push(full)
  }
  return out
}

const files = sourceFiles(SRC)
const bodies = new Map(files.map(file => [file, stripNonCode(readFileSync(file, 'utf8'))]))
const relative = (file: string): string => file.slice(SRC.length + 1)

/** Chaque série littérale qui atteint une prop de graphe, et par quel chemin. */
function fabricatedSeriesFeedingCharts(): string[] {
  const offenders: string[] = []
  for (const file of files) {
    const body = bodies.get(file) as string
    for (const use of chartAttributeUses(body)) {
      if (isLiteralSeries(use.expression)) {
        offenders.push(`${relative(file)} — ${use.attribute}={${use.expression.replace(/\s+/g, ' ')}}`)
        continue
      }
      if (!/^[A-Za-z_$][\w$]*$/.test(use.expression)) continue

      const local = declaredSeries(body, use.expression)
      if (local) {
        offenders.push(`${relative(file)} — ${use.attribute}={${use.expression}} → ${local}`)
        continue
      }
      const source = importSource(body, use.expression, file)
      if (!source) continue
      const imported = declaredSeries(bodies.get(source) ?? stripNonCode(readFileSync(source, 'utf8')), use.expression)
      if (imported) {
        offenders.push(`${relative(file)} — ${use.attribute}={${use.expression}} → ${relative(source)} : ${imported}`)
      }
    }
  }
  return offenders
}

/* ------------------------------------------------------------------ */
/*  5. Les gardes                                                      */
/* ------------------------------------------------------------------ */

describe('GA-48 — le corpus lu par la garde', () => {
  it('contient les fichiers du dashboard et la carte KPI', () => {
    // Une garde dont le corpus se vide passe au vert sans rien lire. On ancre
    // donc sur des fichiers dont la disparition doit CASSER la garde, pas la
    // rendre silencieuse.
    expect(files.length).toBeGreaterThan(200)
    // ⚠️ L'ancre était `features/dashboard/components/KpiRow.tsx` jusqu'au
    // 04/09/2026 (#1457). Ce fichier n'a pas été renommé : il a DISPARU avec
    // l'onglet « Équipe » de `/dashboard`, seul écran qui le rendait encore.
    // L'ancre suit donc la bande d'indicateurs qui, elle, s'affiche toujours.
    expect(files.map(relative)).toContain(join('features', 'dashboard', 'components', 'personal', 'PersonalKpiRow.tsx'))
    expect(files.map(relative)).toContain(join('components', 'ui', 'KpiCard.tsx'))
  })

  /**
   * Les fichiers qui dessinent réellement un graphe, DÉCLARÉS.
   *
   * ⚠️ La liste est VIDE depuis le 28/08/2026, et c'est une déclaration, pas un
   * oubli : le seul composant qui importait une bibliothèque de graphes
   * (`components/ui/KpiCard.tsx`) la portait pour une courbe alimentée par des
   * valeurs écrites à la main. La courbe retirée, l'import n'avait plus d'objet.
   *
   * Un corpus vide rendrait l'interdit ci-dessus vrai pour une MAUVAISE raison —
   * une garde qui ne lit rien passe au vert. On l'ancre donc par une égalité :
   * le jour où quelqu'un rebranche un graphe, ce test rougit et l'oblige à
   * l'inscrire ici, ce qui le soumet du même coup à l'interdit de série
   * fabriquée. C'est le cliquet, pas la vigilance, qui tient la règle.
   */
  const CHARTING_FILES_DECLARED: readonly string[] = []

  it('la liste des fichiers qui dessinent un graphe est celle qui est DÉCLARÉE', () => {
    const charting = files
      .filter(file => /from 'recharts'/.test(readFileSync(file, 'utf8')))
      .map(file => file.replace(/^.*apps\/web\/src\//, ''))
      .sort()
    expect(charting).toEqual([...CHARTING_FILES_DECLARED].sort())
  })
})

describe('GA-48 — le détecteur sait dire NON', () => {
  it('reconnaît une série littérale, quel que soit le nom de sa constante', () => {
    expect(isLiteralSeries('[{ v: 4 }, { v: 6 }, { v: 5 }]')).toBe(true)
    expect(isLiteralSeries("[{ 'x': 1, y: 2 }, { 'x': 2, y: 3 }, { 'x': 3, y: 4 }]")).toBe(true)
    expect(isLiteralSeries('[4, 6, 5, 7, 8]')).toBe(true)
  })

  it("ne confond pas une série avec ce qui n'en est pas une", () => {
    expect(isLiteralSeries('[{ v: 4 }, { v: 6 }]')).toBe(false) // deux points ne font pas une courbe
    expect(isLiteralSeries('[0.32, 0.72, 0]')).toBe(false) // une courbe de Bézier
    expect(isLiteralSeries('[{ id, label }, { id, label }, { id, label }]')).toBe(false) // pas des nombres
    expect(isLiteralSeries('points')).toBe(false)
  })

  it('ne se laisse pas berner par un commentaire ni par une chaîne', () => {
    const commented = stripNonCode('// data={[{ v: 1 }, { v: 2 }, { v: 3 }]}\nconst x = 1')
    expect(findLiteralSeries(commented)).toEqual([])

    const documented = stripNonCode('/* [{ v: 1 }, { v: 2 }, { v: 3 }] */ const x = 1')
    expect(findLiteralSeries(documented)).toEqual([])

    const quoted = stripNonCode('const example = "[{ v: 1 }, { v: 2 }, { v: 3 }]"')
    expect(findLiteralSeries(quoted)).toEqual([])
  })

  it("n'avale pas une ligne à cause d'une expression régulière", () => {
    // `/\/\//` n'est pas un commentaire. La version naïve mangeait la fin de la
    // ligne — et avec elle toute série qui s'y trouvait.
    const source = stripNonCode('const re = /https?:\\/\\// ; const s = [{ v: 1 }, { v: 2 }, { v: 3 }]')
    expect(findLiteralSeries(source)).toHaveLength(1)
  })

  it('suit une constante importée jusqu au module qui la déclare', () => {
    const declaring = 'export const TREND = [{ v: 1 }, { v: 2 }, { v: 3 }]\n'
    expect(declaredSeries(declaring, 'TREND')).not.toBeNull()
    expect(declaredSeries(declaring, 'AUTRE')).toBeNull()
  })

  it('repère la prop de graphe et son expression complète', () => {
    const jsx = '<KpiCard sparklineData={SPARKLINE_UP} data={[{ v: 1 }, { v: 2 }, { v: 3 }]} />'
    const uses = chartAttributeUses(jsx)
    expect(uses.map(use => use.attribute).sort()).toEqual(['data', 'sparklineData'])
    expect(uses.find(use => use.attribute === 'sparklineData')?.expression).toBe('SPARKLINE_UP')
  })
})

describe('GA-48 — aucune série inventée ne nourrit un graphe', () => {
  it('aucune prop de graphe ne reçoit une série écrite à la main', () => {
    // Le nombre attendu est ZÉRO, pas un cliquet : il n'y a rien à résorber.
    expect(fabricatedSeriesFeedingCharts()).toEqual([])
  })

  it('aucun fichier qui dessine un graphe ne porte une série littérale', () => {
    const offenders = files
      .filter(file => /from 'recharts'/.test(readFileSync(file, 'utf8')))
      .flatMap(file => findLiteralSeries(bodies.get(file) as string).map(hit => `${relative(file)} — ${hit}`))
    expect(offenders).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  6. Une TENDANCE écrite à la main                                   */
/* ------------------------------------------------------------------ */

/**
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ LE 28/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * `useDashboardCockpit.ts` construisait deux des quatre tuiles du bandeau avec
 * `trend: k ? 0 : null`. Sous « Nouveaux signaux » et « Actions à lancer »,
 * l'écran affichait donc « Stable » en permanence — pas parce que ces
 * compteurs ne bougeaient pas, mais parce que RIEN ne mesurait leur évolution.
 * Le zéro n'était pas une mesure : c'était une affirmation sans rien derrière,
 * exactement comme la courbe plate que le §5 refuse déjà.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ICI ET PAS DANS UNE GARDE À PART
 * ─────────────────────────────────────────────────────────────────────────
 * Une courbe fabriquée et un écart fabriqué disent la même chose au lecteur —
 * « voici comment ce chiffre a évolué » — et sont faux pour la même raison.
 * Les séparer aurait donné deux gardes qui se recouvrent à moitié, dont une
 * seule serait lue le jour où quelqu'un ajoute une tuile.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LE DÉTECTEUR REFUSE, ET CE QU'IL LAISSE PASSER
 * ─────────────────────────────────────────────────────────────────────────
 * Il regarde les endroits où une valeur devient la TENDANCE de quelque chose :
 * une propriété d'objet ou un attribut JSX dont le nom se termine par
 * « trend » / « Trend » / « _trend ». Il refuse une valeur écrite à la main —
 * un nombre littéral, un objet dont tous les champs sont des nombres
 * littéraux, ou un ternaire dont toutes les branches sont l'un ou l'autre
 * (`k ? 0 : null`). Il laisse passer tout ce qui vient d'AILLEURS : un
 * identifiant, un appel, un accès de champ, une annotation de type — aucun de
 * ceux-là ne peut être écrit à la main dans le fichier qui l'affiche.
 *
 * Un `0` reste légitime : il l'est quand il a été COMPTÉ. C'est pour cela que
 * la forme qui voyage est `{ current, previous }` (contrat `trendPointSchema`)
 * et non un scalaire — deux fenêtres comptées ensemble ne s'écrivent pas à la
 * main sans que ça se voie.
 */

/** Un nom de propriété qui désigne la tendance de quelque chose. */
function isTrendName(name: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(name) && /trend$/i.test(name)
}

/** Une valeur écrite à la main : nombre, objet de nombres, `null`, `undefined`. */
function isHandWrittenValue(text: string): boolean {
  const value = text.trim()
  return /^-?\d+(?:\.\d+)?$/.test(value) || NUMERIC_OBJECT.test(value) || value === 'null' || value === 'undefined'
}

/** Un nombre (ou un objet de nombres) — la partie qui AFFIRME quelque chose. */
function isHandWrittenMeasure(text: string): boolean {
  const value = text.trim()
  return /^-?\d+(?:\.\d+)?$/.test(value) || NUMERIC_OBJECT.test(value)
}

/**
 * Découpe un ternaire au premier niveau : `cond ? a : b` → `['a', 'b']`, et
 * `null` si l'expression n'en est pas un. Le `?` d'un `a?.b`, d'un `a ?? b` ou
 * d'un champ optionnel ne doit pas la découper — sinon `k?.accounts_trend`
 * passerait pour une valeur écrite à la main.
 */
function ternaryBranches(expression: string): string[] | null {
  let depth = 0
  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i] as string
    if ('([{'.includes(char)) depth += 1
    else if (')]}'.includes(char)) depth -= 1
    else if (char === '?' && depth === 0) {
      if (expression[i + 1] === '.' || expression[i + 1] === '?') continue
      const rest = expression.slice(i + 1)
      let innerDepth = 0
      for (let j = 0; j < rest.length; j += 1) {
        const inner = rest[j] as string
        if ('([{'.includes(inner)) innerDepth += 1
        else if (')]}'.includes(inner)) innerDepth -= 1
        else if (inner === ':' && innerDepth === 0) return [rest.slice(0, j), rest.slice(j + 1)]
      }
      return null
    }
  }
  return null
}

/** Cette expression AFFIRME-t-elle une évolution que rien n'a mesurée ? */
function isFabricatedTrend(expression: string): boolean {
  const value = expression.trim()
  if (value.length === 0) return false
  if (isHandWrittenMeasure(value)) return true

  const branches = ternaryBranches(value)
  if (!branches) return false
  // Toutes les branches écrites à la main, et au moins une qui affirme un
  // chiffre : `k ? 0 : null` ment, `k ? point : null` non.
  return branches.every(isHandWrittenValue) && branches.some(isHandWrittenMeasure)
}

/**
 * L'expression qui suit une position, jusqu'au `,` de premier niveau ou à la
 * fermeture du bloc qui la contient. On ne s'arrête PAS au retour à la ligne :
 * un ternaire mis en forme sur trois lignes serait tronqué, donc jugé sur sa
 * première moitié — et une garde qui lit un tiers de l'expression est une
 * garde borgne.
 */
function readExpression(body: string, start: number): string {
  let depth = 0
  for (let i = start; i < body.length; i += 1) {
    const char = body[i] as string
    if ('([{'.includes(char)) depth += 1
    else if (')]}'.includes(char)) {
      if (depth === 0) return body.slice(start, i)
      depth -= 1
    } else if ((char === ',' || char === ';') && depth === 0) return body.slice(start, i)
  }
  return body.slice(start)
}

type TrendBinding = { name: string; expression: string }

/** Chaque endroit d'un corps de fichier où une valeur devient une tendance. */
function trendBindings(body: string): TrendBinding[] {
  const found: TrendBinding[] = []

  // Propriété d'objet : `trend: <expression>`.
  const property = /(?:^|[\s{,(])([A-Za-z_$][\w$]*)\s*:\s*/g
  let match = property.exec(body)
  while (match !== null) {
    const name = match[1] as string
    if (isTrendName(name)) found.push({ name, expression: readExpression(body, match.index + match[0].length) })
    match = property.exec(body)
  }

  // Attribut JSX : `trend={<expression>}`.
  const attribute = /(?:^|\s)([A-Za-z_$][\w$]*)=\{/g
  let attr = attribute.exec(body)
  while (attr !== null) {
    const name = attr[1] as string
    if (isTrendName(name)) {
      const brace = body.indexOf('{', attr.index + attr[0].length - 1)
      const end = matchBracket(body, brace, '{', '}')
      if (end !== -1) found.push({ name, expression: body.slice(brace + 1, end) })
    }
    attr = attribute.exec(body)
  }

  return found
}

/** Chaque tendance écrite à la main du corpus, nommée par son fichier. */
function fabricatedTrends(): string[] {
  const offenders: string[] = []
  for (const file of files) {
    for (const binding of trendBindings(bodies.get(file) as string)) {
      if (isFabricatedTrend(binding.expression)) {
        offenders.push(`${relative(file)} — ${binding.name}: ${binding.expression.trim().replace(/\s+/g, ' ')}`)
      }
    }
  }
  return offenders
}

/** Les tendances fabriquées d'un extrait, pour les tests du détecteur. */
function fabricatedTrendsIn(source: string): string[] {
  return trendBindings(stripNonCode(source))
    .filter(binding => isFabricatedTrend(binding.expression))
    .map(binding => binding.name)
}

describe('GA-48 — le détecteur de tendance sait dire NON', () => {
  it('refuse un écart écrit à la main, sous toutes ses formes', () => {
    expect(isFabricatedTrend('0')).toBe(true) // le défaut d'origine
    expect(isFabricatedTrend('12')).toBe(true)
    expect(isFabricatedTrend('-3')).toBe(true)
    expect(isFabricatedTrend('k ? 0 : null')).toBe(true) // littéralement le code retiré
    expect(isFabricatedTrend('{ current: 6, previous: 4 }')).toBe(true)
    expect(isFabricatedTrend('cockpit ? { current: 0, previous: 0 } : null')).toBe(true)
  })

  it("laisse passer ce qui vient d'ailleurs", () => {
    expect(isFabricatedTrend('kpi.trend')).toBe(false)
    expect(isFabricatedTrend('k?.accounts_trend ?? null')).toBe(false)
    expect(isFabricatedTrend("k ? { state: 'measured', point: k.accounts_trend } : { state: 'silent' }")).toBe(false)
    expect(isFabricatedTrend('computeTrend(accounts, now)')).toBe(false)
    expect(isFabricatedTrend('number | null')).toBe(false) // une annotation de type
    expect(isFabricatedTrend('TrendDisplay')).toBe(false)
  })

  it('ne prend pas un chaînage optionnel pour un ternaire', () => {
    expect(ternaryBranches('k?.accounts_trend')).toBeNull()
    expect(ternaryBranches('k ?? 0')).toBeNull()
    expect(ternaryBranches('k ? 0 : null')).toEqual([' 0 ', ' null'])
  })

  it('lit un ternaire mis en forme sur plusieurs lignes jusqu au bout', () => {
    const source = 'const kpi = {\n  trend: k\n    ? 0\n    : null,\n  value: 3,\n}'
    const bindings = trendBindings(stripNonCode(source))
    expect(bindings).toHaveLength(1)
    expect(isFabricatedTrend(bindings[0]?.expression ?? '')).toBe(true)
  })

  it("repère la tendance qu'elle soit propriété d'objet ou attribut JSX", () => {
    expect(trendBindings(stripNonCode('const kpi = { trend: 0 }')).map(b => b.name)).toEqual(['trend'])
    expect(trendBindings(stripNonCode('<KpiCard trend={0} />')).map(b => b.name)).toEqual(['trend'])
    expect(trendBindings(stripNonCode('const kpi = { accounts_trend: 0 }')).map(b => b.name)).toEqual([
      'accounts_trend',
    ])
    expect(trendBindings(stripNonCode('const kpi = { contactsTrend: 0 }')).map(b => b.name)).toEqual(['contactsTrend'])
    // Un nom qui n'est pas une tendance ne l'intéresse pas.
    expect(trendBindings(stripNonCode('const kpi = { value: 0 }'))).toEqual([])
  })

  it('ne se laisse pas berner par un commentaire ni par une chaîne', () => {
    expect(fabricatedTrendsIn('// trend: 0\nconst x = 1')).toEqual([])
    expect(fabricatedTrendsIn('const example = "trend: 0"')).toEqual([])
  })
})

describe('GA-48 — le corpus des tendances', () => {
  it('trouve réellement des branchements de tendance dans le dépôt', () => {
    // Une garde qui ne trouve AUCUN point de branchement passerait au vert en
    // ne lisant rien — le défaut « garde borgne ». On ancre donc sur le fait
    // qu'elle en voit, ET sur les deux fichiers qui en portent.
    const bindings = files.flatMap(file => trendBindings(bodies.get(file) as string))
    expect(bindings.length).toBeGreaterThan(0)

    const carriers = files.filter(file => trendBindings(bodies.get(file) as string).length > 0).map(relative)
    // ⚠️ Les deux ancres étaient `features/dashboard/hooks/useDashboardCockpit.ts`
    // et `features/dashboard/components/cockpit/KpiStrip.tsx` jusqu'au
    // 04/09/2026 (#1457) : les deux ont DISPARU avec l'onglet « Équipe » de
    // `/dashboard` — le second cockpit d'équipe du produit, doublon non gardé de
    // `/team`. Les tuiles qui portent une tendance vivent maintenant sur le
    // cockpit d'équipe SURVIVANT et sur Pilotage, et ce sont eux qu'on ancre.
    //
    // ⚠️ L'ancre Pilotage est passée de `PilotagePage.tsx` à `LevelDetail.tsx`
    // le 04/09/2026 (#1433) : la mosaïque de huit cartes est devenue une chaîne
    // de six, et la ligne d'indicateur — celle qui porte `<TrendLine>` — a été
    // extraite avec elle. La garde ne s'est PAS mise à voir moins : elle
    // pointait un fichier qui ne portait plus le branchement. C'est ce qu'un
    // ancrage par nom de fichier coûte, et pourquoi il vaut mieux qu'il rougisse
    // que qu'il se taise.
    expect(carriers).toContain(join('features', 'manager', 'view', 'ManagerDashboardPage.tsx'))
    expect(carriers).toContain(join('features', 'pilotage', 'view', 'LevelDetail.tsx'))
  })
})

describe('GA-48 — aucune tendance inventée ne s affiche', () => {
  it('aucun point de branchement ne reçoit une évolution écrite à la main', () => {
    // Le nombre attendu est ZÉRO, pas un cliquet : `trend: k ? 0 : null` a été
    // retiré, il n'y a rien à résorber.
    expect(fabricatedTrends()).toEqual([])
  })
})
