import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * AUCUN PRIX NE S'ÉCRIT DANS LE CODE DU SITE, ET `Offer.price` NE VIENT QUE DE
 * LA DÉRIVATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET CE QU'ELLE A COÛTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * La page d'accueil portait `live.entryPriceDigits ?? '119'`. Ce chiffre ne
 * s'affichait nulle part : il ne partait que dans la donnée structurée
 * `Offer.price`, vers Google. Dès que la requête catalogue échouait, le site
 * annonçait donc **119 €** — le prix de `starter`, RETIRÉ DE LA VENTE le 27/08
 * (`selfServe: false`). Le seul palier achetable vaut 199 €. Mesuré : un
 * `next build` avec un catalogue injoignable publiait `"price":"119"` dans les
 * quatre langues.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PREMIÈRE VERSION DE CETTE GARDE ÉTAIT BORGNE — ET C'EST INSTRUCTIF
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne cherchait que deux formes : un montant AVEC devise, et un identifiant
 * `…price…` suivi d'un `??` puis d'un chiffre. Elle gardait donc la FORME EXACTE
 * du défaut qu'on venait de voir, pas la règle annoncée. Une ligne d'une
 * banalité totale la traversait :
 *
 *     const entryPrice = '119' ?? structuredDataEntryPrice(live, cards)
 *
 * `'119'` ne porte pas de devise, et le littéral est à GAUCHE du `??`. Suite
 * verte, 422 tests, défaut intégralement réintroduit. C'est le motif GA-33 :
 * une garde qui vérifie ce qu'elle sait déjà regarder.
 *
 * La réparation ne consiste pas à deviner une troisième forme de littéral —
 * il y en a une infinité (`String(119)`, `'1' + '19'`, une constante importée).
 * Elle consiste à vérifier la PROVENANCE plutôt que la forme : la valeur qui
 * alimente `Offer.price` est le résultat de {@link DERIVATION}, et de rien
 * d'autre. Cette question-là a une réponse finie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GARDES, DEUX PORTÉES
 * ─────────────────────────────────────────────────────────────────────────────
 *   · **La provenance** (`describe` n°2) — étroite et structurelle : sur CHAQUE
 *     nœud `Offer` du site, `price:` doit être un identifiant simple, déclaré
 *     `const`, jamais réaffecté, dont l'initialisateur est EXACTEMENT un appel
 *     à la dérivation — importée du bon module, pour qu'on ne puisse pas la
 *     redéfinir sur place.
 *   · **Le corpus** (`describe` n°1) — large et textuelle : aucun montant écrit
 *     nulle part dans `apps/website/src`. Elle ne peut pas être complète, et
 *     c'est assumé ; elle attrape les rechutes ordinaires, la première attrape
 *     celle qui compte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMMENT CES GARDES ÉVITENT D'ÊTRE BORGNES
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt a produit six gardes vertes sur du vide en deux jours, et celle-ci a
 * bien failli être la septième. Elles doivent donc prouver deux choses :
 *
 *   · **Elles LISENT** — nombre de fichiers scannés, volume de code, chemins
 *     connus, présence d'au moins un nœud `Offer` réel, et vérification que le
 *     retrait des commentaires fait bien disparaître un montant du corpus.
 *   · **Elles savent dire NON** — onze rechutes en test, dont le `= '119' ??`
 *     qui a traversé la première version. Les cassages destructifs sur le vrai
 *     fichier ont par ailleurs été rejoués avant le commit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX RETRAITS DE COMMENTAIRES PLUTÔT QU'UN
 * ─────────────────────────────────────────────────────────────────────────────
 * Les prix d'hier vivent dans les commentaires du dépôt, et c'est très bien :
 * ils y racontent pourquoi la grille a changé. Il faut donc les retirer avant
 * de chercher. Or les deux façons de le faire ont chacune un angle mort :
 *
 *   · par TOKENS (on suit les chaînes) : une apostrophe droite dans du texte
 *     JSX français ouvre une fausse chaîne et peut avaler un montant ;
 *   · par COMMENTAIRES seuls : un `//` à l'intérieur d'une chaîne pourrait
 *     couper une ligne trop tôt.
 *
 * On prend donc l'UNION de ce que les deux voient. Il faudrait tromper les deux
 * à la fois pour glisser un prix, et un faux positif — le seul risque restant —
 * nomme son fichier et sa ligne, donc il se corrige au lieu de se taire.
 */

/** `apps/website/src` — la racine du code du site. */
const SRC = join(__dirname, '..', '..')

/** La SEULE fonction autorisée à produire un prix, et le module d'où elle vient. */
const DERIVATION = 'structuredDataEntryPrice'
const DERIVATION_MODULE = 'structured-data-price'

/**
 * Un montant en euros écrit en clair : des chiffres, puis le signe ou le mot.
 *
 * Les quatre langues du site écrivent le montant différemment (« 199 € »,
 * « €199 », « € 199 », « 199,00 Euro »), donc le rang du signe ne dit rien et
 * la casse non plus — d'où le drapeau `i`.
 */
const MONEY = String.raw`\d[\d\s]*(?:[.,]\d+)?\s*(?:€|EUR\b|euros?\b)`

/**
 * Un prix qui se replie sur un chiffre écrit à la main — le littéral à DROITE.
 *
 * C'est la forme d'origine du défaut : `live.entryPriceDigits ?? '119'`. Elle
 * échappe à {@link MONEY}, qui cherche une devise — un prix nu n'en porte pas.
 */
const PRICE_FALLBACK = String.raw`[Pp]rice[A-Za-z]*\s*(?:\?\?|\|\|)\s*['"\`]?\s*\d`

/**
 * Un chiffre affecté à un prix — le littéral à GAUCHE, ou seul.
 *
 * `const entryPrice = '119'`, `const entryPrice = '119' ?? …`,
 * `monthlyPrice = 119`. C'est le motif qui a traversé la première version de
 * cette garde ; il est ici pour que la rechute la plus banale soit vue deux
 * fois — par le texte ET par la provenance.
 */
const PRICE_LITERAL = String.raw`[Pp]rice[A-Za-z]*\s*=\s*['"\`]?\s*\d`

/** Les trois motifs textuels, appliqués au corpus entier. */
const TEXT_RULES = [MONEY, PRICE_FALLBACK, PRICE_LITERAL]

/**
 * La SEULE exception, nommée : le CAPITAL SOCIAL de la société.
 *
 * « SASU au capital de 1 000,00 euros » figure dans les mentions légales, les
 * CGU, les CGV et la politique de confidentialité, dans les quatre langues.
 * Ce n'est pas un prix : c'est une mention obligatoire, et elle ne peut pas
 * venir d'un catalogue tarifaire.
 *
 * L'exception porte sur le CONTEXTE, pas sur le fichier : une page légale qui
 * se mettrait à citer un tarif serait quand même refusée.
 */
const SHARE_CAPITAL = /capital|kapitaal|kapital/i

/** Tout le code du site, tests exclus — ce sont eux qui citent les prix. */
function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Retrait n°1 — par commentaires seuls, sans suivre les chaînes.
 *
 * Un `//` précédé de `:` n'ouvre pas de commentaire : c'est `https://`. Les
 * retours à la ligne sont préservés pour que les numéros de ligne restent
 * justes dans le message d'échec.
 */
function stripByComment(source: string): string {
  let out = ''
  let i = 0
  let block = false
  while (i < source.length) {
    const char = source[i]
    const next = source[i + 1]
    if (block) {
      if (char === '*' && next === '/') {
        block = false
        i += 2
        continue
      }
      out += char === '\n' ? '\n' : ' '
      i++
      continue
    }
    if (char === '/' && next === '*') {
      block = true
      i += 2
      continue
    }
    if (char === '/' && next === '/' && source[i - 1] !== ':') {
      while (i < source.length && source[i] !== '\n') i++
      continue
    }
    out += char
    i++
  }
  return out
}

/** Retrait n°2 — par tokens : on suit les chaînes, donc un `//` dedans est du texte. */
function stripByToken(source: string): string {
  let out = ''
  let i = 0
  let state: 'code' | 'line' | 'block' | 'string' = 'code'
  let quote = ''
  while (i < source.length) {
    const char = source[i]
    const next = source[i + 1]
    if (state === 'code') {
      if (char === '/' && next === '/') {
        state = 'line'
        i += 2
        continue
      }
      if (char === '/' && next === '*') {
        state = 'block'
        i += 2
        continue
      }
      if (char === "'" || char === '"' || char === '`') {
        state = 'string'
        quote = char
      }
      out += char
      i++
      continue
    }
    if (state === 'line') {
      if (char === '\n') {
        state = 'code'
        out += char
      }
      i++
      continue
    }
    if (state === 'block') {
      if (char === '*' && next === '/') {
        state = 'code'
        i += 2
        continue
      }
      out += char === '\n' ? '\n' : ' '
      i++
      continue
    }
    if (char === '\\') {
      out += '  '
      i += 2
      continue
    }
    if (char === quote) state = 'code'
    out += char
    i++
  }
  return out
}

/** Un prix trouvé là où il ne devrait pas être. */
type Finding = { where: string; match: string }

/** Les prix écrits en clair dans UN texte de code déjà débarrassé de ses commentaires. */
function pricesIn(code: string, where: string): Finding[] {
  const found: Finding[] = []
  for (const pattern of TEXT_RULES) {
    // Un `RegExp` neuf à chaque passe : `lastIndex` d'un littéral partagé avec
    // le drapeau `g` est STATEFUL, et c'est déjà ce qui a rendu une garde
    // borgne dans ce dépôt.
    for (const hit of code.matchAll(new RegExp(pattern, 'gi'))) {
      const index = hit.index ?? 0
      if (SHARE_CAPITAL.test(code.slice(Math.max(0, index - 120), index))) continue
      const line = code.slice(0, index).split('\n').length
      found.push({ where: `${where}:${line}`, match: hit[0].replace(/\s+/g, ' ').trim() })
    }
  }
  return found
}

/** Les prix écrits en clair dans un fichier source, vus par les DEUX retraits. */
function pricesInSource(source: string, where: string): Finding[] {
  const byComment = pricesIn(stripByComment(source), where)
  const byToken = pricesIn(stripByToken(source), where)
  const seen = new Set(byComment.map(finding => `${finding.where}|${finding.match}`))
  return [...byComment, ...byToken.filter(finding => !seen.has(`${finding.where}|${finding.match}`))]
}

/* ────────────────────────────────────────────────────────────────────────────
 * LA PROVENANCE DE `Offer.price`
 * ──────────────────────────────────────────────────────────────────────────── */

/** Un nœud de donnée structurée qui annonce une offre commerciale. */
const OFFER_NODE = /['"]@type['"]\s*:\s*['"]Offer['"]/g

/** La clé `price:` d'un objet — jamais `priceCurrency:`, qui n'est pas suivi de `:`. */
const PRICE_KEY = /(?<![A-Za-z0-9_$])price\s*:\s*([^,}\n]+)/

/** Un identifiant simple, et rien d'autre : ni appel, ni concaténation, ni littéral. */
const BARE_IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/**
 * L'objet littéral qui contient l'index donné.
 *
 * On remonte à l'accolade ouvrante la plus proche, puis on redescend jusqu'à
 * son accolade fermante. Une accolade à l'intérieur d'une chaîne fausserait le
 * compte ; le cas ne se présente pas dans un nœud JSON-LD, et il ferait échouer
 * la garde bruyamment plutôt que silencieusement.
 */
function enclosingObject(code: string, index: number): string {
  let start = index
  while (start > 0 && code[start] !== '{') start--
  let depth = 0
  for (let i = start; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1)
  }
  return code.slice(start)
}

/** La déclaration d'un identifiant : son mot-clé et son initialisateur, texte brut. */
function declarationOf(code: string, name: string): { keyword: string; initializer: string } | null {
  const declaration = new RegExp(String.raw`\b(const|let|var)\s+${name}\s*=\s*`).exec(code)
  if (!declaration) return null

  // On démarre au premier caractère significatif : prettier coupe volontiers la
  // ligne juste après le `=` quand l'appel est long, et s'arrêter au retour à
  // la ligne rendrait un initialisateur vide — donc un faux refus.
  let i = declaration.index + declaration[0].length
  while (i < code.length && /\s/.test(code[i] ?? '')) i++
  const start = i

  let depth = 0
  for (; i < code.length; i++) {
    const char = code[i] as string
    if ('([{'.includes(char)) depth++
    else if (')]}'.includes(char)) {
      if (depth === 0) break
      depth--
    } else if (depth === 0 && (char === ';' || char === '\n')) break
  }
  return { keyword: declaration[1] as string, initializer: code.slice(start, i).trim() }
}

/**
 * L'initialisateur est-il EXACTEMENT un appel à la dérivation ?
 *
 * « Exactement » veut dire que la parenthèse ouvrante de l'appel se referme sur
 * le DERNIER caractère : `derivation(x) ?? '119'` est donc refusé, et c'est le
 * point de la vérification. Une parenthèse déséquilibrée par une chaîne fait
 * refuser, jamais accepter.
 */
function isPureDerivation(initializer: string): boolean {
  const prefix = `${DERIVATION}(`
  if (!initializer.startsWith(prefix)) return false
  let depth = 0
  for (let i = prefix.length - 1; i < initializer.length; i++) {
    const char = initializer[i]
    if (char === '(') depth++
    else if (char === ')' && --depth === 0) return i === initializer.length - 1
  }
  return false
}

/**
 * Ce qui cloche dans la provenance des prix annoncés par UN fichier.
 *
 * Rend une liste de phrases : vide veut dire que chaque `Offer.price` du
 * fichier vient de la dérivation, et de rien d'autre.
 */
function offerPriceViolations(source: string, where: string): string[] {
  const code = stripByComment(source)
  const problems: string[] = []

  for (const node of code.matchAll(OFFER_NODE)) {
    const line = code.slice(0, node.index ?? 0).split('\n').length
    const at = `${where}:${line}`

    const price = PRICE_KEY.exec(enclosingObject(code, node.index ?? 0))?.[1]?.trim()
    if (!price) {
      problems.push(`${at} → un nœud Offer sans clé price`)
      continue
    }
    if (!BARE_IDENTIFIER.test(price)) {
      problems.push(`${at} → price n'est pas un identifiant simple mais \`${price}\``)
      continue
    }

    const imported = new RegExp(
      String.raw`import\s*\{[^}]*\b${DERIVATION}\b[^}]*\}\s*from\s*['"][^'"]*${DERIVATION_MODULE}['"]`,
    )
    if (!imported.test(code)) {
      problems.push(`${at} → ${DERIVATION} n'est pas importé de ${DERIVATION_MODULE}`)
      continue
    }

    const declaration = declarationOf(code, price)
    if (!declaration) {
      problems.push(`${at} → \`${price}\` n'est déclaré nulle part dans ce fichier`)
      continue
    }
    if (declaration.keyword !== 'const') {
      problems.push(`${at} → \`${price}\` est déclaré \`${declaration.keyword}\`, donc réaffectable`)
      continue
    }
    if (!isPureDerivation(declaration.initializer)) {
      problems.push(`${at} → \`${price}\` vient de \`${declaration.initializer}\`, pas de ${DERIVATION}(…)`)
      continue
    }

    // Une déclaration juste ne suffit pas si la valeur est écrasée trois lignes
    // plus bas. On compte les affectations : il doit y en avoir exactement une,
    // celle de la déclaration.
    const assignments = [...code.matchAll(new RegExp(String.raw`\b${price}\s*=(?![=>])`, 'g'))]
    if (assignments.length !== 1) {
      problems.push(`${at} → \`${price}\` est affecté ${assignments.length} fois`)
    }
  }

  return problems
}

const FILES = sourceFiles()

describe('aucun prix écrit en dur dans apps/website/src', () => {
  it('lit un corpus réel — sans quoi la garde serait verte sur du vide', () => {
    // Un dossier vide, un mauvais chemin, un filtre trop large : trois façons
    // de rendre cette garde inutile sans qu'elle ne rougisse jamais.
    expect(FILES.length).toBeGreaterThan(120)

    const volume = FILES.reduce((total, file) => total + readFileSync(file, 'utf8').length, 0)
    expect(volume).toBeGreaterThan(200_000)

    const paths = FILES.map(file => relative(SRC, file))
    expect(paths).toContain(join('app', '[locale]', 'page.tsx'))
    expect(paths).toContain(join('features', 'landing', 'Pricing.tsx'))
    expect(paths).toContain(join('features', 'pricing', 'live-prices.ts'))
    // Les tests, eux, citent les prix d'hier : ils doivent rester hors corpus.
    expect(paths.some(path => path.endsWith('.test.ts'))).toBe(false)
  })

  it('retire vraiment les commentaires du corpus — pas seulement en théorie', () => {
    // Les prix d'hier vivent dans les commentaires du dépôt. Si le retrait ne
    // faisait rien, la garde crierait partout ; s'il retirait tout, elle serait
    // aveugle. On exige donc qu'il y ait AU MOINS un fichier où un montant
    // existe dans le texte brut et disparaît une fois les commentaires retirés.
    const commented = FILES.filter(file => {
      const raw = readFileSync(file, 'utf8')
      return (
        new RegExp(MONEY, 'i').test(raw) &&
        pricesIn(stripByComment(raw), 'x').length === 0 &&
        pricesIn(stripByToken(raw), 'x').length === 0
      )
    })
    expect(commented.length).toBeGreaterThan(0)
  })

  it('n’écrit aucun montant, aucun repli chiffré', () => {
    const findings = FILES.flatMap(file => pricesInSource(readFileSync(file, 'utf8'), relative(SRC, file)))
    // Le message porte le chemin ET la ligne : la règle se corrige, elle ne se
    // devine pas. Un prix se lit du catalogue live, du catalogue de messages,
    // ou ne se publie pas — voir `structured-data-price.ts`.
    expect(findings.map(finding => `${finding.where} → ${finding.match}`)).toEqual([])
  })

  it('l’exception « capital social » est vivante, et bornée aux pages légales', () => {
    // Une exception morte est une exception à retirer ; une exception qui
    // déborde est un trou. On vérifie les deux d'un coup : la mention existe
    // bien quelque part, et elle n'existe QUE dans les pages légales.
    const exempted = FILES.flatMap(file => {
      const code = stripByComment(readFileSync(file, 'utf8'))
      return [...code.matchAll(new RegExp(MONEY, 'gi'))]
        .filter(hit => SHARE_CAPITAL.test(code.slice(Math.max(0, (hit.index ?? 0) - 120), hit.index)))
        .map(() => relative(SRC, file))
    })
    expect(exempted.length).toBeGreaterThan(0)
    expect([...new Set(exempted)].sort()).toEqual(
      [
        join('app', '[locale]', 'cgu', 'page.tsx'),
        join('app', '[locale]', 'cgv', 'page.tsx'),
        join('app', '[locale]', 'legal', 'page.tsx'),
        join('app', '[locale]', 'privacy', 'page.tsx'),
      ].sort(),
    )
  })
})

describe('Offer.price ne vient que de la dérivation', () => {
  const OFFERS = FILES.filter(file => new RegExp(OFFER_NODE.source).test(readFileSync(file, 'utf8')))

  it('trouve un vrai nœud Offer — sans quoi la garde n’aurait rien à garder', () => {
    // C'est LA preuve de lecture de cette garde-ci : si le site n'annonçait
    // plus aucune offre, ou si le motif ne la reconnaissait plus, elle
    // passerait au vert sur zéro fichier. Elle refuse.
    expect(OFFERS.map(file => relative(SRC, file))).toEqual([join('app', '[locale]', 'page.tsx')])
  })

  it('chaque prix annoncé est le résultat de la dérivation, et de rien d’autre', () => {
    const problems = OFFERS.flatMap(file => offerPriceViolations(readFileSync(file, 'utf8'), relative(SRC, file)))
    expect(problems).toEqual([])
  })
})

describe('la garde sait dire NON', () => {
  /** Le squelette réel de la page d'accueil, réduit à ce que la garde regarde. */
  const page = (assignment: string, extra = '') => `
import { structuredDataEntryPrice } from '@/features/pricing/structured-data-price'

export default async function HomePage() {
  ${assignment}
  ${extra}
  const softwareJsonLd = {
    '@type': 'SoftwareApplication',
    offers: { '@type': 'Offer', price: entryPrice, priceCurrency: 'EUR' },
  }
  return softwareJsonLd
}
`

  /** La forme juste : l'appel, seul, rien avant, rien après. */
  const GOOD = "const entryPrice = structuredDataEntryPrice(live, t.raw('pricing.plans'))"

  it('laisse passer la forme juste — sans quoi elle serait désactivée en une semaine', () => {
    expect(offerPriceViolations(page(GOOD), 'page.tsx')).toEqual([])
  })

  /**
   * Les rechutes de PROVENANCE. La première est celle qui a traversé la version
   * borgne de cette garde ; les suivantes sont les variantes qu'on écrirait en
   * cherchant à contourner un motif textuel.
   */
  const PROVENANCE: readonly (readonly [string, string])[] = [
    ['le littéral à GAUCHE du ??, qui a traversé la v1', `const entryPrice = '119' ?? ${DERIVATION}(live, cards)`],
    ['le littéral à DROITE du ??', `const entryPrice = ${DERIVATION}(live, cards) ?? '119'`],
    ['le littéral seul', "const entryPrice = '119'"],
    ['un littéral sans guillemets', 'const entryPrice = 119'],
    ['un chiffre déguisé en calcul', 'const entryPrice = String(100 + 19)'],
    ['le repli d’origine', "const entryPrice = live.entryPriceDigits ?? '119'"],
    ['une valeur réaffectée plus bas', `const entryPrice = ${DERIVATION}(live, cards)\n  entryPrice = '119'`],
  ]

  it.each(PROVENANCE)('refuse %s', (_name, assignment) => {
    expect(offerPriceViolations(page(assignment), 'page.tsx').length).toBeGreaterThan(0)
  })

  it('refuse un prix écrit directement dans le nœud Offer', () => {
    const source = `
import { structuredDataEntryPrice } from '@/features/pricing/structured-data-price'
const json = { '@type': 'Offer', price: '119', priceCurrency: 'EUR' }
`
    expect(offerPriceViolations(source, 'page.tsx').length).toBeGreaterThan(0)
  })

  it('refuse une dérivation redéfinie sur place plutôt qu’importée', () => {
    // Sans cette vérification, il suffirait d'écrire une fonction du même nom
    // au-dessus du nœud pour satisfaire la garde en mentant.
    const source = `
const ${DERIVATION} = () => '119'
const entryPrice = ${DERIVATION}(live, cards)
const json = { '@type': 'Offer', price: entryPrice, priceCurrency: 'EUR' }
`
    expect(offerPriceViolations(source, 'page.tsx').length).toBeGreaterThan(0)
  })

  it('refuse un identifiant déclaré `let`, donc réaffectable', () => {
    expect(
      offerPriceViolations(page(`let entryPrice = ${DERIVATION}(live, cards)`), 'page.tsx').length,
    ).toBeGreaterThan(0)
  })

  /** Les rechutes TEXTUELLES, vues par les motifs du corpus. */
  const RELAPSES: readonly (readonly [string, string])[] = [
    ['le repli exact retiré de la page d’accueil', "const entryPrice = live.entryPriceDigits ?? '119'"],
    ['le littéral à gauche du ??', "const entryPrice = '119' ?? derive(live, cards)"],
    ['un montant écrit dans du JSX', 'export const Card = () => <p>199 € HT / mois</p>'],
    ['un montant écrit dans une chaîne', "const label = '249 EUR par mois'"],
    ['un montant en toutes lettres', 'const label = "119 euros par mois"'],
    ['un repli numérique, sans devise', 'const monthlyPrice = live.price || 119'],
  ]

  it.each(RELAPSES)('refuse %s', (_name, code) => {
    expect(pricesInSource(code, 'rechute.tsx').length).toBeGreaterThan(0)
  })

  /** Et ce que les motifs textuels doivent laisser passer. */
  const INNOCENT: readonly (readonly [string, string])[] = [
    ['un prix cité dans un commentaire de bloc', '/**\n * « Free » affichait 119 €.\n */\nexport const X = 1'],
    ['un prix cité dans un commentaire de ligne', '// Starter valait 119 € avant le 27/08\nexport const X = 1'],
    ['le capital social dans les mentions légales', '<p>BELLUM, SASU au capital de 1 000,00 euros</p>'],
    ['le formateur, qui n’écrit aucun nombre', 'const f = (amount: number) => `${amount} €`'],
    ['une expression qui DÉTECTE un montant', 'const NO_AMOUNT = /\\d[\\d\\s.,]*\\s?€/'],
  ]

  it.each(INNOCENT)('laisse passer %s', (_name, code) => {
    expect(pricesInSource(code, 'innocent.tsx')).toEqual([])
  })

  it('ne se laisse pas aveugler par un // qui n’en est pas un', () => {
    // Le seul angle mort du retrait par commentaires : une URL. Le prix qui
    // suit sur la MÊME ligne doit rester visible.
    const code = "const u = 'https://bellum-ai.com'; const p = '199 €'"
    expect(pricesInSource(code, 'url.ts').length).toBeGreaterThan(0)
  })

  it('ne se laisse pas aveugler par une apostrophe droite dans du JSX', () => {
    // L'angle mort de l'autre retrait : `l'offre` ouvre une fausse chaîne qui
    // avalerait tout jusqu'à l'apostrophe suivante. L'union des deux le voit.
    const code = "export const C = () => <p>l'offre d'entrée est à 199 € HT</p>"
    expect(pricesInSource(code, 'jsx.tsx').length).toBeGreaterThan(0)
  })
})
