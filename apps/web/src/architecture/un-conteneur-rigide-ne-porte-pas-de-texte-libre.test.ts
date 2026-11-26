import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-333 — UN CONTENEUR QUI NE RÉTRÉCIT PAS NE PORTE PAS DE TEXTE DE LONGUEUR LIBRE.
 *
 * Renumérotée GA-333 à l’intégration R :
 * trois lots parallèles avaient pris GA-332 le même jour — GA-332 : actions facturées
 * (`credited-actions-announce-their-cost.test.ts`), GA-333 : conteneur rigide
 * (`un-conteneur-rigide-ne-porte-pas-de-texte-libre.test.ts`), GA-334 : sections du dossier
 * (`sections-du-dossier-portent-ce-quelles-promettent.test.ts`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MESURE QUI A PAYÉ CETTE GARDE (14/09/2026, production)
 * ─────────────────────────────────────────────────────────────────────────────
 * Sur `/accounts/<id>`, le hero du dossier — L'ÉCRAN PRINCIPAL DU PRODUIT — est
 * une rangée `flex-row nowrap justify-between` de **1 174 px** à deux enfants :
 *
 *   | bloc                        | `flex-shrink` | largeur MESURÉE   |
 *   |-----------------------------|---------------|-------------------|
 *   | identité (porte le `<h1>`)  | `1`           | **0 px**          |
 *   | actions                     | **`0`**       | 1 359 à 1 628 px  |
 *
 * La rangée d'actions portait `shrink-0`. Elle ne descend donc JAMAIS sous sa
 * largeur `max-content` — et cette largeur contenait la **phrase entière de la
 * prochaine action du plan**, un texte que l'analyse écrit et que rien ne borne.
 * Flexbox retire les 454 px manquants au seul frère rétrécissable, la colonne
 * d'identité, à qui `min-w-0` avait retiré son plancher : elle tombe à **0 px**.
 * Le nom du compte, le secteur, le SIREN et le propriétaire s'enroulaient un mot
 * par ligne sur 600 à 720 px de haut, et un bouton recouvrait le `<h1>`.
 *
 * Mesuré sur 5 comptes sur 5 (THALES, DEVOTEAM, Société Générale, SARL ER,
 * ROCHE) et, le hero étant PARTAGÉ, sur les 7 sections du dossier sur 7. Ce
 * n'était pas un cas limite : c'était l'état permanent de l'écran principal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI ELLE TRAVERSE LES FICHIERS — LE DÉFAUT DE LA PREMIÈRE VERSION
 * ─────────────────────────────────────────────────────────────────────────────
 * Écrite d'abord en ne lisant QUE le fichier du conteneur, cette garde était
 * **verte sur le dépôt cassé**. Le `shrink-0` est dans `AccountDetailHero.tsx`,
 * la phrase de prochaine action est dans `AccountDetailHeroPrimaryAction.tsx` :
 * deux fichiers, chacun irréprochable seul. C'est EXACTEMENT le mécanisme du
 * défaut — personne ne voit une rangée rigide et un texte libre sur le même
 * écran, parce qu'ils ne sont jamais sur le même écran de l'éditeur.
 *
 * La garde suit donc la composition : un conteneur rigide qui rend `<X />`, où
 * `X` rend (directement ou à travers ses propres enfants) un texte surveillé,
 * est refusé comme s'il portait le texte lui-même.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE N'EST PAS — ET POURQUOI ELLE NE LIT PAS DES PIXELS
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ Un test jsdom serait BORGNE ici : jsdom ne met rien en page,
 * `getBoundingClientRect` y rend 0 partout, et une classe présente ne prouve
 * aucune mise en page. Ce défaut est justement passé sous 8 000 tests verts pour
 * cette raison. La garde ne mesure donc pas — elle interdit la COMBINAISON qui a
 * produit la mesure.
 *
 * ⚠️ Elle ne double PAS GA-255 (`a-truncation-must-be-able-to-shrink`), qui
 * regarde `shrink-0` + `truncate` sur LE MÊME élément. Ici les deux classes sont
 * sur des éléments — et même des fichiers — DIFFÉRENTS : le texte portait bien
 * `truncate max-w-full`, et c'est l'ANCÊTRE rigide qui annulait la troncature en
 * lui donnant une largeur de conteneur illimitée. GA-255 était verte pendant les
 * 454 px de débordement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE INTERDIT, ET CE QU'ELLE LAISSE PASSER
 * ─────────────────────────────────────────────────────────────────────────────
 * Interdit : un élément dont les classes portent `shrink-0` (ou `flex-none`) et
 * dont le sous-arbre rend l'une des clés de {@link FREE_LENGTH_TEXT} — les
 * libellés dont la valeur interpolée n'a aucune borne de longueur parce qu'elle
 * vient de l'analyse ou de l'utilisateur.
 *
 * Laisse passer, et doit continuer à le faire : tout le reste. `shrink-0` est la
 * bonne réponse sur une icône, un avatar, un badge, un bouton dont le libellé est
 * une constante de traduction — ce sont des centaines d'usages légitimes. Une
 * garde trop gourmande se fait désactiver dans la semaine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ELLE PORTE LA RÈGLE, PAS LE `shrink-0` QUI L'A PAYÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le correctif complet a fini par RETIRER le `shrink-0` de la rangée d'actions
 * du hero : `flex-wrap` sur un conteneur qui refuse de rétrécir est décoratif —
 * la `max-content` d'un conteneur qui enveloppe est la somme de ses éléments sur
 * une seule ligne, donc il ne passe jamais à la ligne, il déborde. L'écran qui a
 * payé cette garde ne porte donc plus aucun conteneur rigide, et c'est NORMAL :
 * la règle vaut pour les ~1 000 fichiers du web, pas pour cet écran-là.
 *
 * Ce qui empêche la garde de devenir muette pour autant, c'est le test « lit un
 * corpus réel » : il compte les conteneurs rigides DE TOUTE L'APP et exige qu'il
 * en reste. Une garde dont le seul sujet disparaît est verte pour toujours ;
 * celle-ci échoue si l'extracteur cesse de trouver quoi que ce soit.
 */

const WEB_SRC = join(__dirname, '..')

/**
 * LES TEXTES DE LONGUEUR LIBRE, ET LA RAISON DE CHACUN.
 *
 * Une clé n'entre ici que si la valeur qu'elle interpole vient de l'extérieur du
 * code — l'analyse, le CRM, l'utilisateur — et n'a donc aucune longueur maximale
 * connue à l'écriture. Un libellé entièrement statique n'y a pas sa place : sa
 * largeur est une constante, et un conteneur rigide autour est un choix valide.
 */
const FREE_LENGTH_TEXT: readonly { key: string; namespace: string; why: string }[] = [
  {
    key: 'hero.primary.nextActionNamed',
    namespace: 'accounts',
    why: "La prochaine action du plan, telle que l'analyse l'a écrite. Aucune borne : c'est elle qui a poussé la rangée d'actions du hero à 1 628 px pour un parent de 1 174 px.",
  },
]

/** Les classes qui retirent à un conteneur le droit de rétrécir. */
const RIGID = /\b(?:shrink-0|flex-none)\b/

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out)
      continue
    }
    if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Le fichier sans ses commentaires.
 *
 * ⚠️ Ce n'est pas de l'hygiène. Le docblock qui RACONTE ce défaut cite forcément
 * `shrink-0` et le nom de la clé fautive : sans ce retrait, la garde signalerait
 * le fichier qui documente sa propre correction, et « réparer » ce faux positif
 * reviendrait à effacer l'explication. C'est exactement le piège qu'a rencontré
 * GA-255 le 06/09/2026.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

type JsxTag = {
  name: string
  attrs: string
  start: number
  end: number
  selfClosing: boolean
  closing: boolean
}

/**
 * La balise JSX suivante à partir de `from`, ou `null`.
 *
 * ⚠️ La fin d'une balise ne se trouve PAS au premier `>`. `onClick={() => …}`
 * en contient un, et un extracteur naïf coupe la balise à la flèche — c'est le
 * défaut qui a rendu borgne une garde de ce dépôt. On avance donc en suivant la
 * profondeur des accolades et l'état des chaînes, et on ne s'arrête qu'au `>`
 * de profondeur nulle.
 */
function nextTag(source: string, from: number): JsxTag | null {
  let cursor = from
  while (cursor < source.length) {
    const lt = source.indexOf('<', cursor)
    if (lt === -1) return null
    const head = /^<(\/?)([A-Za-z][A-Za-z0-9_.]*)/.exec(source.slice(lt, lt + 80))
    if (head === null) {
      cursor = lt + 1
      continue
    }
    let index = lt + head[0].length
    let braces = 0
    let quote: string | null = null
    while (index < source.length) {
      const char = source[index]
      if (quote !== null) {
        if (char === '\\') {
          index += 2
          continue
        }
        if (char === quote) quote = null
        index += 1
        continue
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char
        index += 1
        continue
      }
      if (char === '{') {
        braces += 1
        index += 1
        continue
      }
      if (char === '}') {
        braces -= 1
        index += 1
        continue
      }
      if (char === '>' && braces <= 0) break
      index += 1
    }
    if (index >= source.length) return null
    const attrs = source.slice(lt + head[0].length, index)
    return {
      name: head[2],
      attrs,
      start: lt,
      end: index + 1,
      selfClosing: /\/\s*$/.test(attrs),
      closing: head[1] === '/',
    }
  }
  return null
}

/**
 * Le sous-arbre JSX d'une balise ouvrante, balise comprise.
 *
 * On ne compte que les balises PORTANT LE MÊME NOM : un `<` de comparaison ou un
 * paramètre générique croisé en chemin ne déséquilibre donc jamais le compte.
 */
function subtree(source: string, tag: JsxTag): string {
  if (tag.selfClosing || tag.closing) return source.slice(tag.start, tag.end)
  let depth = 1
  let cursor = tag.end
  while (depth > 0) {
    const next = nextTag(source, cursor)
    // Balise jamais refermée : on rend tout ce qui suit plutôt que rien — une
    // garde qui rend « vide » sur une source qu'elle n'a pas su lire est verte
    // pour de mauvaises raisons.
    if (next === null) return source.slice(tag.start)
    cursor = next.end
    if (next.name !== tag.name) continue
    if (next.closing) depth -= 1
    else if (!next.selfClosing) depth += 1
  }
  return source.slice(tag.start, cursor)
}

/** Les classes littérales d'une balise, `className="…"` ou `className={\`…\`}`. */
function classNameOf(attrs: string): string {
  const match = /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/.exec(attrs)
  if (match === null) return ''
  return match[1] ?? match[2] ?? match[3] ?? ''
}

/** Tout conteneur d'une source qui a le droit de refuser de rétrécir. */
function rigidContainers(clean: string): { name: string; classes: string; body: string }[] {
  const found: { name: string; classes: string; body: string }[] = []
  let cursor = 0
  for (;;) {
    const tag = nextTag(clean, cursor)
    if (tag === null) break
    cursor = tag.end
    if (tag.closing) continue
    const classes = classNameOf(tag.attrs)
    if (!RIGID.test(classes)) continue
    found.push({ name: tag.name, classes, body: subtree(clean, tag) })
  }
  return found
}

/** La clé telle qu'elle s'écrit dans un appel `t(…)`, guillemets compris. */
function quotedKeys(key: string): string[] {
  return [`'${key}'`, `"${key}"`, `\`${key}\``]
}

/** Les composants NOMMÉS qu'un morceau de JSX rend (`<Truc …>`, pas `<div>`). */
function componentsIn(jsx: string): string[] {
  return [...jsx.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)].map(match => match[1])
}

/** Les composants qu'un fichier EXPORTE — la clé du graphe de composition. */
function exportedComponents(clean: string): string[] {
  return [...clean.matchAll(/export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/g)].map(
    match => match[1],
  )
}

/**
 * Les fichiers qui, directement ou par composition, rendent un texte surveillé.
 *
 * Le point fixe est calculé sur tout le corpus d'un coup : un chemin
 * `hero → action principale → phrase` se voit, alors qu'aucun de ses maillons
 * n'est fautif isolément.
 */
function filesRenderingFreeLengthText(corpus: Map<string, string>): Map<string, string> {
  const owner = new Map<string, string>()
  for (const [file, clean] of corpus) {
    for (const name of exportedComponents(clean)) owner.set(name, file)
  }

  const renders = new Map<string, string>()
  for (const [file, clean] of corpus) {
    for (const entry of FREE_LENGTH_TEXT) {
      if (quotedKeys(entry.key).some(quoted => clean.includes(quoted))) {
        renders.set(file, entry.key)
        break
      }
    }
  }

  for (let pass = 0; pass < corpus.size; pass += 1) {
    let grew = false
    for (const [file, clean] of corpus) {
      if (renders.has(file)) continue
      for (const name of componentsIn(clean)) {
        const source = owner.get(name)
        const key = source === undefined ? undefined : renders.get(source)
        if (key !== undefined && source !== file) {
          renders.set(file, key)
          grew = true
          break
        }
      }
    }
    if (!grew) break
  }
  return renders
}

/** Le seul chemin de décision de cette garde — corpus réel et témoins passent par lui. */
function offenders(corpus: Map<string, string>): string[] {
  const renders = filesRenderingFreeLengthText(corpus)
  const owner = new Map<string, string>()
  for (const [file, clean] of corpus) {
    for (const name of exportedComponents(clean)) owner.set(name, file)
  }

  const found: string[] = []
  for (const [file, clean] of corpus) {
    for (const container of rigidContainers(clean)) {
      const direct = FREE_LENGTH_TEXT.find(entry =>
        quotedKeys(entry.key).some(quoted => container.body.includes(quoted)),
      )
      const viaChild = componentsIn(container.body)
        .map(name => {
          const source = owner.get(name)
          return source === undefined || source === file ? undefined : renders.get(source)
        })
        .find(key => key !== undefined)
      const key = direct?.key ?? viaChild
      if (key === undefined) continue
      found.push(`${file} — <${container.name} className="${container.classes}"> porte ${key}`)
    }
  }
  return found
}

function realCorpus(): Map<string, string> {
  const corpus = new Map<string, string>()
  for (const file of sourceFiles(WEB_SRC)) {
    corpus.set(file.replace(`${WEB_SRC}/`, ''), withoutComments(readFileSync(file, 'utf8')))
  }
  return corpus
}

function witness(files: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(files).map(([file, source]) => [file, withoutComments(source)]))
}

function localeValue(language: string, namespace: string, key: string): unknown {
  const catalogue: unknown = JSON.parse(
    readFileSync(join(WEB_SRC, 'i18n', 'locales', language, `${namespace}.json`), 'utf8'),
  )
  return key.split('.').reduce<unknown>((node, segment) => {
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[segment]
  }, catalogue)
}

const CORPUS = realCorpus()

describe('GA-333 — un conteneur rigide ne porte pas de texte de longueur libre', () => {
  /**
   * LA PREUVE QUE LA GARDE LIT QUELQUE CHOSE.
   *
   * Quatre corpus doivent être non vides, et chacun casse pour une raison
   * différente : l'arborescence, l'extracteur de balises (c'est ce compte-là qui
   * attraperait un extracteur coupé à la flèche de `onClick`), le graphe de
   * composition (plus aucun composant exporté reconnu) et le registre.
   */
  it('lit un corpus réel', () => {
    expect(CORPUS.size).toBeGreaterThan(500)
    expect([...CORPUS.values()].flatMap(rigidContainers).length).toBeGreaterThan(50)
    expect([...CORPUS.values()].flatMap(exportedComponents).length).toBeGreaterThan(500)
    expect(FREE_LENGTH_TEXT.length).toBeGreaterThan(0)
  })

  /**
   * LA PREUVE QUE LE REGISTRE DÉSIGNE QUELQUE CHOSE DE VIVANT.
   *
   * Une clé qui n'est plus traduite, ou qui n'est plus rendue nulle part, fait
   * de cette garde une surveillance de fantôme — verte pour toujours, protégeant
   * un écran qui n'existe plus. Les deux langues, parce qu'une entrée de
   * registre traduite d'un seul côté est un défaut à part entière.
   */
  it('chaque texte surveillé est traduit dans les deux langues ET rendu quelque part', () => {
    for (const entry of FREE_LENGTH_TEXT) {
      for (const language of ['fr', 'en']) {
        expect(
          typeof localeValue(language, entry.namespace, entry.key),
          `${language}/${entry.namespace}.json ne porte pas ${entry.key}`,
        ).toBe('string')
      }
      const rendered = [...CORPUS.values()].filter(clean =>
        quotedKeys(entry.key).some(quoted => clean.includes(quoted)),
      )
      expect(rendered.length, `${entry.key} n'est rendu par aucun écran`).toBeGreaterThan(0)
    }
  })

  /**
   * LA PREUVE QUE LA GARDE SAIT DIRE NON — LE CAS EN UN SEUL FICHIER.
   *
   * Noter le `onClick={() => setPreviewOpen(true)}` : ce témoin prouve aussi que
   * l'extracteur ne coupe pas la balise à la flèche.
   */
  it('refuse un texte libre écrit DANS le conteneur rigide', () => {
    const fautif = witness({
      'Hero.tsx': `
        export function Hero() {
          return (
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              <DossierCtaButton cta="dossier.pdf.preview" onClick={() => setPreviewOpen(true)} icon={Eye} />
              <Text element="p" size="xs" className="max-w-full truncate">
                {t('hero.primary.nextActionNamed', { action: choice.nextActionLabel })}
              </Text>
            </div>
          )
        }`,
    })
    expect(offenders(fautif)).toHaveLength(1)
  })

  /**
   * LA PREUVE QUE LA GARDE SAIT DIRE NON — LE CAS QUI A CASSÉ LA PRODUCTION.
   *
   * Deux fichiers, chacun irréprochable seul : le `shrink-0` d'un côté, la
   * phrase de l'autre. La première version de cette garde était VERTE ici, et
   * c'est sur cette forme exacte que le hero rendait 0 px de large.
   */
  it('refuse un texte libre atteint À TRAVERS un composant enfant', () => {
    const fautif = witness({
      'Hero.tsx': `
        export function Hero() {
          return (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <AccountGateControl accountId={account.id} />
              <HeroPrimaryAction account={account} />
            </div>
          )
        }`,
      'HeroPrimaryAction.tsx': `
        export function HeroPrimaryAction({ account }) {
          return <Text element="p">{t('hero.primary.nextActionNamed', { action })}</Text>
        }`,
    })
    expect(offenders(fautif)).toHaveLength(1)
    expect(offenders(fautif)[0]).toContain('Hero.tsx')
  })

  /**
   * LA PREUVE QUE LA GARDE N'ATTRAPE PAS CE QU'ELLE NE VISE PAS.
   *
   * Quatre formes légitimes, chacune vivante dans le dépôt :
   *  - `shrink-0` sur une icône, qui n'a pas de texte du tout ;
   *  - `shrink-0` sur un bouton dont le libellé est une CONSTANTE de traduction,
   *    donc de largeur connue ;
   *  - le même composant enfant, mais sous un conteneur qui PEUT rétrécir ;
   *  - le texte libre rendu en frère du conteneur rigide — la forme que le
   *    correctif a posée, et celle qu'on ne doit pas refuser demain.
   */
  it('laisse passer un conteneur rigide sans texte libre', () => {
    const legitimes = witness({
      'Icone.tsx': 'export function Icone() { return <ArrowRight className="size-4 shrink-0" /> }',
      'Bouton.tsx': `export function Bouton() {
        return <div className="flex shrink-0 items-center gap-2"><Button>{t('hero.refreshAnalysis')}</Button></div>
      }`,
      'Souple.tsx': `export function Souple() {
        return <div className="flex min-w-0 flex-1 gap-2"><HeroPrimaryAction /></div>
      }`,
      'Corrige.tsx': `export function Corrige() {
        return (
          <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
            <div className="flex min-w-0 flex-auto items-center gap-4"><Identite /></div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <AccountGateControl />
              <HeroPrimaryAction account={account} />
              <ArrowRight className="size-4 shrink-0" />
            </div>
            <HeroNextAction account={account} />
          </div>
        )
      }`,
      'HeroPrimaryAction.tsx': `export function HeroPrimaryAction() {
        return <Text>{t('hero.primary.nextActionNamed', { action })}</Text>
      }`,
      'HeroNextAction.tsx': `export function HeroNextAction() {
        return <Text className="truncate">{t('hero.primary.nextActionNamed', { action })}</Text>
      }`,
    })
    expect(offenders(legitimes)).toEqual([])
  })

  /**
   * LA PREUVE QUE LA GARDE NE SE LIT PAS ELLE-MÊME.
   *
   * Le récit du défaut, en commentaire à l'endroit du comportement, cite la
   * structure fautive. Elle ne doit pas être comptée comme du code.
   */
  it('ne voit pas une structure citée dans un commentaire', () => {
    const documente = witness({
      'Hero.tsx': `export function Hero() {
        {/* Avant : <div className="shrink-0">{t('hero.primary.nextActionNamed')}</div> */}
        return <div className="flex min-w-0 flex-1" />
      }`,
    })
    expect(offenders(documente)).toEqual([])
  })

  it('aucun texte de longueur libre ne vit dans un conteneur qui ne rétrécit pas', () => {
    const found = offenders(CORPUS)
    expect(found, found.join('\n')).toEqual([])
  })
})
