/**
 * GA-31 — le texte a une échelle, et un plancher.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ LE 23/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Quinze tailles de texte arbitraires dans `apps/web`, treize de plus dans
 * `packages/ui` et le site : 8, 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 14, 15,
 * 16, 17, 22, 26, 36. Trois barreaux (petit, normal, titre) écrits de seize
 * façons — c'est ce qui faisait qu'un écran ne ressemblait pas tout à fait au
 * précédent sans qu'on puisse dire pourquoi.
 *
 * Deux règles en sortent, et elles ne disent pas la même chose.
 *
 * **Le plancher** (décision D80 de Louis, 23/08) : rien en dessous de 12 px.
 * En dessous, un texte se devine plus qu'il ne se lit, et au pouce c'est pire.
 * 388 occurrences étaient sous ce seuil, dont 114 à 10 px et deux à 9.
 *
 * **L'échelle** : celle de Tailwind — 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 —
 * parce que c'est déjà celle du dépôt (`text-xs` 559 fois, `text-sm` 136).
 * Ce qui tombait entre deux barreaux a rejoint le plus proche.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN INTERDIT ICI, ET NON UN CLIQUET
 * ─────────────────────────────────────────────────────────────────────────
 * Les cliquets (GA-18, GA-19, GA-25) figent une dette qu'on ne peut pas
 * résorber d'un coup sans risque. Ici, la conversion est mécanique et elle est
 * FAITE : il ne reste que les deux chiffres d'affichage de la page publique,
 * qui sont de la décoration et non du texte. Un interdit avec une liste
 * d'exceptions nommées se relit ; un cliquet à deux se lirait comme une dette
 * dont personne ne saurait de quoi elle est faite.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOTS = [join(__dirname, '..'), join(__dirname, '../../../../packages/ui/src')]

/**
 * Les seules tailles arbitraires tolérées : les deux chiffres décoratifs de la
 * page de partage public (un « 404 » et un filigrane). Ce ne sont pas des
 * textes — aucune échelle typographique ne les concerne.
 */
const ALLOWED = new Set(['text-[8rem]', 'text-[10rem]'])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.(tsx?|css)$/.test(entry)) continue
    if (entry.includes('.test.')) continue
    out.push(full)
  }
  return out
}

const files = ROOTS.flatMap(sourceFiles)

/** Les commentaires sont retirés avant lecture — ce fichier-ci CITE les
 *  tailles qu'il interdit, et une garde qui s'accuse elle-même se désactive.
 *  Quatrième fois de la journée : GA-25 avec « bounce », GA-28 avec `100vh`,
 *  GA-20 avec les virgules dans les listes commentées. */
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const ARBITRARY = /text-\[(\d+(?:\.\d+)?)(px|rem)\]/g

describe("GA-31 — l'échelle typographique", () => {
  it('aucune taille de texte arbitraire hors des deux chiffres décoratifs', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const match of strip(readFileSync(file, 'utf8')).matchAll(ARBITRARY)) {
        if (ALLOWED.has(match[0])) continue
        offenders.push(`${file.replace(/.*\/(apps|packages)\//, '$1/')} → ${match[0]}`)
      }
    }
    // Si ce test tombe : prends le barreau le plus proche de l'échelle
    // Tailwind (text-xs 12 · text-sm 14 · text-base 16 · text-lg 18 ·
    // text-xl 20 · text-2xl 24 · text-3xl 30 · text-4xl 36), jamais une
    // seizième valeur.
    expect(offenders).toEqual([])
  })

  it('rien ne descend sous 12 px, y compris par une variable CSS', () => {
    const offenders: string[] = []
    for (const file of files) {
      const body = strip(readFileSync(file, 'utf8'))
      for (const match of body.matchAll(/font-size:\s*(\d+(?:\.\d+)?)(px|rem)/g)) {
        const px = match[2] === 'rem' ? Number(match[1]) * 16 : Number(match[1])
        if (px < 12) offenders.push(`${file} → ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('aucune taille de police écrite en style inline, en pixels', () => {
    // ⚠️ CE QUE LA PREMIÈRE VERSION DE CETTE GARDE NE VOYAIT PAS.
    //
    // Elle ne lisait que les classes Tailwind `text-[Npx]`. Or tout le tableau
    // de bord écrit ses tailles en STYLE INLINE — `style={{ fontSize: 10 }}` —
    // et passait donc à travers : 37 valeurs, dont trois à 10 px, sous le
    // plancher que la garde déclarait tenir.
    //
    // Deux défauts pour le prix d'un. Le second est plus grave que le
    // premier : une taille en PIXELS ignore le réglage « Taille du texte » des
    // préférences, qui agit sur la police RACINE. Un utilisateur qui choisit
    // « Grand » ne voyait rien changer sur le tableau de bord, et n'avait
    // aucun moyen de savoir pourquoi. D'où l'exigence du `rem`, et pas
    // seulement celle du plancher.
    const offenders: string[] = []
    for (const file of files) {
      // Les feuilles de style @react-pdf comptent en points d'impression, pas
      // en texte d'écran : aucune échelle typographique ne les concerne.
      if (file.includes('account-pdf')) continue
      for (const match of strip(readFileSync(file, 'utf8')).matchAll(/fontSize:\s*(\d[\d.]*)(?![\d.])/g)) {
        offenders.push(`${file.replace(/.*\/src\//, 'src/')} → fontSize: ${match[1]}`)
      }
    }
    // Si ce test tombe : écris la taille en `rem` — '0.75rem' (12) ·
    // '0.875rem' (14) · '1rem' (16) · '1.125rem' (18) · '1.5rem' (24) —
    // ou mieux, passe par une classe Tailwind.
    expect(offenders).toEqual([])
  })

  it('la garde lit bien des écrans — sinon elle serait verte pour toujours', () => {
    // Elle a été prouvée en réintroduisant `text-[10px]` dans un écran : elle
    // l'a nommé. Ce test-ci garde la preuve que le corpus n'est pas vide.
    const withText = files.filter(file => readFileSync(file, 'utf8').includes('text-xs')).length
    expect(withText).toBeGreaterThan(100)
  })
})

/**
 * GA-34 — la largeur de lecture ne se contourne pas par habitude.
 *
 * D81 borne le composant `Text` à 70 caractères par ligne. La borne porte une
 * échappatoire, `full`, pour les textes courts par nature qui doivent occuper
 * leur conteneur. Une échappatoire non comptée devient le défaut : celle-ci
 * est à ZÉRO aujourd'hui, et la première personne qui en a besoin monte le
 * chiffre en écrivant pourquoi — exactement comme GA-07.
 *
 * ⚠️ Ne PAS monter ce chiffre pour faire passer un écran qui « rend mieux en
 * large ». Un paragraphe de 180 caractères rend toujours « mieux » à qui l'a
 * écrit ; il ne se lit pas.
 *
 * #2619.1 (20/09/2026) — première montée, à 1. Le libellé d'une piste
 * (`QualificationLeadsQueue.tsx:275`) est un texte COURT par nature — un
 * intitulé, pas une phrase — posé dans une ligne à deux groupes
 * (`min-w-0 flex-1`) : il doit occuper la cellule qu'on lui donne, pas se
 * couper à 70 caractères au milieu d'un mot. Borné à 70ch, il tronquait
 * exactement ce que `break-words` existe pour éviter. C'est le cas que
 * l'échappatoire nomme (un texte court qui doit remplir son conteneur), pas
 * celui que la garde refuse ci-dessus (un paragraphe qui « rendrait mieux en
 * large ») : il n'y a ici ni paragraphe ni choix de confort, seulement un
 * intitulé qui n'a nulle part où aller sauf sa cellule.
 */
const READING_WIDTH_ESCAPES_AT_FREEZE = 1

describe('GA-34 — la largeur de lecture', () => {
  // Les ÉCRANS seulement : le composant `Text` de `packages/ui` est celui qui
  // DÉFINIT la borne, l'y interdire reviendrait à interdire la règle.
  const tsx = files.filter(file => file.endsWith('.tsx') && !file.includes('packages/ui'))

  it("le nombre d'échappatoires `full` ne remonte pas", () => {
    const count = tsx.reduce(
      (acc, file) => acc + (strip(readFileSync(file, 'utf8')).match(/<Text\b[^>]*\sfull\b/g)?.length ?? 0),
      0,
    )
    expect(count).toBeLessThanOrEqual(READING_WIDTH_ESCAPES_AT_FREEZE)
  })

  it('la borne vit dans le composant partagé, et nulle part ailleurs', () => {
    // Si quelqu'un recopie `max-w-[70ch]` dans un écran, c'est le signe que la
    // borne du composant ne s'applique pas là — et la bonne réponse est de
    // comprendre pourquoi, pas de la redéclarer à côté.
    const offenders = tsx.filter(file => /max-w-\[70ch\]/.test(strip(readFileSync(file, 'utf8'))))
    expect(offenders).toEqual([])
  })
})

/**
 * GA-63 — la largeur de lecture ne s'applique pas à une LIGNE DE TABLEAU.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ EN PRODUCTION LE 29/08/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Sur `/pilotage/qualite`, dans une fenêtre de 1 512 px :
 *
 *   carte .............................. 1 184 px  (`max-width: none`)
 *   ligne `<li>` ......................    649,74 px  ← `max-width: 70ch`
 *   colonne des libellés ..............    109 px
 *   « Consultants à disponibilité inconnue » ...... QUATRE lignes,
 *                                                  un mot par ligne.
 *
 * Le repli de D81 (`index.css`, `:where(p, li, dd, blockquote)`) existe pour
 * les `<p>` écrits à la main. Il attrape aussi `li` — ce qui est JUSTE pour
 * une puce de prose, et FAUX pour une ligne de tableau, qui n'est pas un
 * texte mais une mise en page à deux groupes opposés. D81 le dit dans l'autre
 * sens : « listes, tableaux et tableaux de bord en pleine largeur — ils ont
 * besoin de leurs colonnes ».
 *
 * Douze `<li>` du dépôt étaient dans ce cas, et AUCUN ne portait
 * l'échappatoire que la règle nomme pourtant (`w-full`). Corriger les douze
 * un par un aurait garanti d'oublier le treizième : la règle CSS exempte donc
 * la signature qui distingue une ligne de tableau d'un paragraphe — deux
 * groupes poussés aux extrémités, `justify-between`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE LIT, ET COMMENT ELLE SAIT DIRE NON
 * ─────────────────────────────────────────────────────────────────────────
 * Elle n'attrape PAS une sous-chaîne dans le CSS. Elle extrait le sélecteur
 * RÉEL du fichier, reconstruit chaque ligne de tableau du dépôt avec sa
 * VRAIE chaîne de classes, et demande au moteur de sélecteurs si la règle
 * s'applique. Retirer le `:not(...)` d'`index.css` la fait tomber en nommant
 * les fichiers concernés.
 *
 * ⚠️ Ce qu'elle NE prouve PAS : aucune largeur. Une largeur se mesure dans un
 * navigateur qui fait une mise en page ; jsdom n'en fait pas. Elle prouve que
 * la règle ne DÉSIGNE pas ces éléments — le reste est de la recette.
 */
describe('GA-63 — une ligne de tableau n’est pas un paragraphe', () => {
  /**
   * Le sélecteur du repli de largeur de lecture, extrait d'`index.css`.
   *
   * ⚠️ Les commentaires sont retirés AVANT extraction : le bloc qui explique
   * la règle contient des accolades et des `*`, et une première version de
   * cette garde a extrait `='w-full'])` au lieu du sélecteur. Elle est tombée
   * — c'est ce qu'on lui demande — mais sur la mauvaise raison.
   */
  const readingWidthSelector = (() => {
    const css = readFileSync(join(__dirname, '../index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = css.match(/([^{}]+)\{[^{}]*max-width:\s*70ch[^{}]*\}/)
    if (!rule) throw new Error("le repli `max-width: 70ch` a disparu d'index.css")
    return rule[1].trim().replace(/\s+/g, ' ')
  })()

  /**
   * Les lignes de tableau du dépôt : un `<li>` qui est une boîte de mise en
   * page (`flex`/`grid`) ET qui pousse deux groupes aux extrémités.
   *
   * La définition est volontairement INDÉPENDANTE de l'échappatoire : si elle
   * se lisait « les `li` déjà exemptés », la garde serait circulaire et
   * resterait verte quoi qu'il arrive.
   */
  const rows = (() => {
    const found: { file: string; className: string }[] = []
    for (const file of files.filter(f => f.endsWith('.tsx'))) {
      const body = strip(readFileSync(file, 'utf8'))
      for (const tag of body.matchAll(/<li\b([^>]*)>/g)) {
        const className = tag[1].match(/className=\{?["'`]([^"'`]*)/)?.[1] ?? ''
        if (!/\b(flex|grid)\b/.test(className)) continue
        if (!/justify-between/.test(className)) continue
        found.push({ file: file.replace(/.*\/(apps|packages)\//, '$1/'), className })
      }
    }
    return found
  })()

  it('la garde LIT bien un corpus — sinon elle serait verte pour toujours', () => {
    // Douze lignes mesurées le 29/08. Le plancher est bas exprès : il tombe si
    // l'extraction casse (une regex trop gourmande, un `<li>` écrit sur
    // plusieurs lignes), pas à la première suppression d'un écran.
    expect(rows.length).toBeGreaterThanOrEqual(10)
    // Et elle lit bien LA règle : celle qui borne, entre autres, les `li`.
    expect(readingWidthSelector).toContain('li')
  })

  /**
   * #2708 (troisième dépôt de #2692) — LA LIGNE D'ACTION.
   *
   * La signature `justify-between` ci-dessus ne voit que les `<li>` qui portent
   * eux-mêmes la mise en page. `QualificationLeadsQueue.tsx` écrit
   * `<li className="min-w-0">` et délègue la rangée à un composant : le `li`
   * n'a ni `flex` ni `justify-between`, donc il retombait sous les 70ch.
   *
   * Mesuré en production le 22/09/2026, compte Decathlon, onglet Opportunités :
   *
   *   <ul> ..........................  1 195 px de large, 11 189 px de HAUT
   *   <li> ..........................    649,74 px  ← `max-width: 70ch`
   *   colonne du libellé ............     44 px, soit un mot coupé par ligne
   *   hauteur d'une ligne ...........    524 px
   *
   *   après exemption : li 1 195 px · libellé 589 px · ligne 64 px · ul 1 189 px
   *
   * La signature retenue est `:has(button)` : une puce de prose ne contient
   * jamais de bouton, une ligne d'action en contient toujours au moins un.
   * Elle attrape les rangées qui délèguent leur mise en page, ce que la
   * signature de classe ne peut pas voir — c'est pourquoi les deux coexistent.
   */
  it('le repli ne DÉSIGNE pas une ligne qui porte un bouton (#2708)', () => {
    const shell = document.createElement('div')
    shell.id = 'app-shell'
    document.body.append(shell)
    try {
      const li = document.createElement('li')
      li.className = 'min-w-0'
      li.append(document.createElement('button'))
      shell.append(li)
      // Contrôle : la garde sait dire OUI. Sans bouton, la même ligne EST bornée
      // — sinon ce test serait vert sur un sélecteur qui ne borne plus rien.
      const prose = document.createElement('li')
      prose.className = 'min-w-0'
      shell.append(prose)
      expect(prose.matches(readingWidthSelector)).toBe(true)
      expect(li.matches(readingWidthSelector)).toBe(false)
    } finally {
      shell.remove()
    }
  })

  it('le repli de largeur de lecture ne DÉSIGNE aucune ligne de tableau', () => {
    const shell = document.createElement('div')
    shell.id = 'app-shell'
    document.body.append(shell)
    try {
      const clamped = rows.filter(({ className }) => {
        const li = document.createElement('li')
        li.className = className
        shell.append(li)
        const hit = li.matches(readingWidthSelector)
        li.remove()
        return hit
      })
      // Si ce test tombe : la ligne visée est bornée à 70 caractères alors
      // qu'elle a besoin de ses colonnes (D81). Soit `index.css` a perdu son
      // exemption, soit la ligne porte une signature que l'exemption ne
      // reconnaît pas — dans ce cas, c'est l'exemption qu'on élargit, pas un
      // `w-full` recopié dans un écran de plus.
      expect(clamped.map(row => `${row.file} → ${row.className}`)).toEqual([])
    } finally {
      shell.remove()
    }
  })
})
