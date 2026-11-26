import { readFileSync, readdirSync, statSync } from 'node:fs'
import type { ReactNode } from 'react'
import { join, relative } from 'node:path'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AskLaura } from '@/components/primitives/AskLaura'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'
import { resetLauraIntro, useCurrentLauraIntro } from '@/features/laura/bubble/laura-intro-store'

/**
 * GA-283 — #1847 : UNE SURCOUCHE OUVERTE PREND LA PORTÉE DE L'AMORCE DE LAURA,
 * ET LA REND EN SE FERMANT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION LE 10/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Depuis #1812, `<AskLaura>` ne rend plus de lien sur un poste de bureau : il
 * DÉPOSE sa question dans `laura-intro-store` et c'est la bulle (`LauraDock`)
 * qui l'affiche. Le magasin n'avait alors qu'UN emplacement, et une seule
 * règle — « le dernier monté gagne ».
 *
 * Sur `/watchlist`, la page pose une amorce de LISTE et la modale d'un signal
 * pose la sienne. Relevé sur six signaux consécutifs (BNP Paribas, FREE,
 * FRANCE TELEVISIONS, PREVOIR, SNCF RESEAU, TOTAL) : la modale ne rendait plus
 * que « En faire une action », « Ouvrir le dossier » et « Fermer » — la
 * troisième action que #1423 avait explicitement dessinée s'était effacée.
 *
 * Deux causes, pas une :
 *
 *  1. **La bulle est INERTE sous une modale.** Radix pose `pointer-events:
 *     none` sur le corps du document et `aria-hidden="true"` sur tout ce qui
 *     n'est pas la modale. La ligne agrandie restait peinte (`z-widget` 80 >
 *     `z-overlay` 60) mais son « Envoyer » ne répondait plus. Un composant qui
 *     s'efface au profit d'un contrôle inatteignable s'efface pour RIEN.
 *  2. **La fermeture ne rendait pas la portée.** Le dépôt de la modale
 *     publiait `null` en se démontant, et celui de la PAGE ne se rejoue qu'au
 *     changement de son contenu — donc jamais. Après un seul aller-retour dans
 *     la modale, l'écran n'avait plus AUCUNE amorce jusqu'à un rechargement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE — TROIS CHOSES, TROIS TESTS NOMMÉS
 * ─────────────────────────────────────────────────────────────────────────
 * 1. **Elle sait dire NON** — elle rejoue le cas réel (deux `<AskLaura>`, dont
 *    un monté dans une surcouche) et vérifie que la portée revient à la page
 *    à la fermeture. Casser `laura-intro-scope`, `LauraIntroScope` dans
 *    `BrowsableDialog` / `RecordPanel`, ou la comparaison de portée du
 *    magasin, la fait rougir.
 * 2. **Elle LIT quelque chose** — le balayage statique compte les fichiers
 *    lus et les instances trouvées, et refuse un corpus vide.
 * 3. **Elle n'attrape pas ce qu'elle ne vise pas** — un témoin de cas
 *    légitime voisin : plusieurs `<AskLaura>` sur une même PAGE (`MyDataView`
 *    en pose trois) restent classés « page » et gardent le comportement
 *    d'avant.
 *
 * ⚠️ PIÈGES DE GARDE DÉJÀ PAYÉS DANS CE DÉPÔT, ÉVITÉS ICI
 * - Le balayage passe par `commentMask` : `AskLaura.tsx` et `LauraDock.tsx`
 *   CITENT `<AskLaura>` dans leurs docblocks, et ce fichier-ci en rend un
 *   dans un `role="dialog"` — sans le masque (et sans l'exclusion des
 *   `*.test.*`), trois instances fantômes.
 * - Aucun `RegExp.test()` sur une expression portant le drapeau `g` : il est
 *   STATEFUL et rendrait une ligne sur deux. On n'utilise que `exec`/`match`
 *   avec `lastIndex` remis à zéro, ou des expressions sans `g`.
 * - Un motif de balise ne peut pas exiger un caractère APRÈS le nom : le
 *   dépôt écrit `<WatchlistSignalDetail` seul sur sa ligne, prettier reportant
 *   les props à la ligne suivante. Un `<Nom[\s/>]` rendait alors ZÉRO — c'est
 *   arrivé pendant la construction de cette garde, et ça aurait déclaré le
 *   défaut de #1847 inexistant.
 */

/**
 * Le routeur et la borne mobile sont doublés, pour la même raison que dans
 * `AskLaura.test.tsx` : `<Link>` hors routeur jette (l'écran entier
 * disparaîtrait, faux négatif qu'on ne veut pas diagnostiquer deux fois), et la
 * borne doit être celle du POSTE DE BUREAU — sous 768 px `AskLaura` rend son
 * lien de toute façon, et la garde ne mesurerait plus rien.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, search, ...rest }: { children: ReactNode; to: string; search: unknown }) => (
    <a href="#" data-to={to} data-search={JSON.stringify(search)} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => false }))

const WEB_SRC = join(__dirname, '..')

/**
 * Ce qui compte comme SURCOUCHE : une modale, un tiroir, un panneau flottant.
 *
 * Le motif attrape les composés (`BrowsableDialog`, `SheetContent`,
 * `NeedsAccountSheet`…) parce que le dépôt en fabrique — un balayage limité
 * aux noms nus de shadcn/ui aurait manqué `BrowsableDialog`, c'est-à-dire
 * exactement le cas de #1847.
 */
const OVERLAY_TAG = String.raw`\w*(?:Dialog|Sheet|Drawer|Popover|Modal)`

type Instance = {
  /** Chemin relatif à `apps/web`, pour un message d'échec lisible. */
  file: string
  line: number
  /** `null` = sur la page ; sinon le nom de la surcouche qui l'enveloppe. */
  overlay: string | null
}

/** Voir GA-280 : l'état OUVERT/FERMÉ d'un bloc suit d'une ligne à l'autre. */
function commentMask(lines: string[]): boolean[] {
  const mask: boolean[] = []
  let inBlock = false
  for (const line of lines) {
    if (inBlock) {
      mask.push(true)
      if (line.includes('*/')) inBlock = false
      continue
    }
    const trimmed = line.trimStart()
    if (trimmed.startsWith('//')) {
      mask.push(true)
      continue
    }
    if (trimmed.startsWith('/*') || trimmed.startsWith('{/*') || trimmed.startsWith('*')) {
      mask.push(true)
      if (!line.includes('*/')) inBlock = true
      continue
    }
    mask.push(false)
  }
  return mask
}

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!entry.endsWith('.tsx')) continue
      if (entry.includes('.test.')) continue
      out.push(full)
    }
  }
  walk(root)
  return out
}

/** Les lignes de CODE du fichier — les commentaires sont blanchis, pas retirés,
 *  pour que les numéros de ligne restent ceux de l'éditeur. */
function codeLines(source: string): string[] {
  const lines = source.split('\n')
  const isComment = commentMask(lines)
  return lines.map((line, index) => (isComment[index] ? '' : line))
}

/** Une surcouche et l'intervalle de lignes qu'elle enveloppe, dans un fichier. */
type OverlayRange = { name: string; start: number; end: number }

/**
 * Les surcouches d'un fichier, avec leur portée en lignes.
 *
 * Une balise auto-fermée (`<ExportRecapDialog … />`) n'enveloppe rien : on ne
 * retient une ouverture que si une fermeture `</Nom>` lui répond plus bas.
 * Sans cette précaution, les trois `<AskLaura>` de `MyDataView` — qui sont sur
 * la page, sous un `<ExportRecapDialog … />` auto-fermé rendu plus haut —
 * seraient déclarés « en surcouche » : un faux positif trouvé en construisant
 * cette garde, et le témoin du dernier describe le rejoue.
 *
 * ⚠️ Calculé UNE fois par fichier. Le refaire à chaque balise
 * transformait un balayage de plusieurs centaines de fichiers en minutes de CI.
 */
function overlayRanges(lines: string[]): OverlayRange[] {
  const open = new RegExp(String.raw`<(${OVERLAY_TAG})\b`, 'g')
  const ranges: OverlayRange[] = []
  lines.forEach((line, index) => {
    for (const hit of line.matchAll(open)) {
      const name = hit[1] as string
      const close = new RegExp(String.raw`</${name}>`)
      const closesAt = lines.findIndex((candidate, i) => i > index && close.test(candidate))
      if (closesAt > index) ranges.push({ name, start: index, end: closesAt })
    }
  })
  return ranges
}

/** Les surcouches de ce fichier qui enveloppent la ligne `at`. */
function enclosing(ranges: OverlayRange[], at: number): string[] {
  return ranges.filter(range => range.start < at && at < range.end).map(range => range.name)
}

/**
 * Toutes les instances de `<AskLaura>` du dépôt web, chacune avec la surcouche
 * qui l'enveloppe — celle du MÊME fichier, ou celle qui rend son composant
 * depuis un AUTRE fichier (`WatchlistSignalDetail` est rendu dans un
 * `BrowsableDialog` par `WatchlistBoard`, monté par « Mes cibles » depuis #2151.60).
 */
function scanInstances(): { instances: Instance[]; filesRead: number } {
  const files = sourceFiles(WEB_SRC)
  const label = (path: string) => relative(join(WEB_SRC, '..'), path)
  const read = files.map(file => {
    const lines = codeLines(readFileSync(file, 'utf8'))
    return { file, lines, ranges: overlayRanges(lines) }
  })

  // 1. Quels composants sont rendus SOUS une surcouche, et laquelle ?
  //    ⚠️ Aucune classe de caractères APRÈS le nom de la balise :
  //    prettier écrit souvent `<Composant` seul sur sa ligne et reporte les
  //    props en dessous. Un motif `<Nom[\s/>]` rendait ZÉRO sur
  //    `<WatchlistSignalDetail` : c'est arrivé en construisant cette garde, et
  //    ça aurait déclaré le défaut de #1847 inexistant.
  const renderedUnder = new Map<string, string[]>()
  const tag = /<([A-Z]\w+)\b/g
  for (const { lines, ranges } of read) {
    if (ranges.length === 0) continue
    lines.forEach((line, index) => {
      const overlays = enclosing(ranges, index)
      if (overlays.length === 0) return
      for (const hit of line.matchAll(tag)) {
        const name = hit[1] as string
        renderedUnder.set(name, [...(renderedUnder.get(name) ?? []), ...overlays])
      }
    })
  }

  // 2. Chaque `<AskLaura>`, avec sa surcouche — directe, ou héritée du
  //    composant qui le contient et qu'une surcouche rend ailleurs.
  const instances: Instance[] = []
  for (const { file, lines, ranges } of read) {
    if (!lines.some(line => line.includes('<AskLaura'))) continue
    const owners = ownersOf(lines)
    lines.forEach((line, index) => {
      if (!line.includes('<AskLaura')) return
      const direct = enclosing(ranges, index)[0] ?? null
      const owner = owners.get(index) ?? null
      const inherited = owner === null ? null : (renderedUnder.get(owner)?.[0] ?? null)
      instances.push({ file: label(file), line: index + 1, overlay: direct ?? inherited })
    })
  }
  return { instances, filesRead: files.length }
}

/** Pour chaque ligne, la fonction-composant qui la contient (la dernière
 *  `function Nom(` déclarée au-dessus d'elle). */
function ownersOf(lines: string[]): Map<number, string | null> {
  const owners = new Map<number, string | null>()
  let current: string | null = null
  lines.forEach((line, index) => {
    const declaration = /^(?:export\s+)?function\s+([A-Z]\w+)/.exec(line)
    if (declaration) current = declaration[1] as string
    owners.set(index, current)
  })
  return owners
}

/**
 * LE REGISTRE DES SURCOUCHES COUVERTES — une entrée par fichier qui rend un
 * `<AskLaura>` sous une surcouche, et le fichier qui pose son `LauraIntroScope`.
 *
 * ⚠️ Une entrée neuve ne se déclare pas pour faire passer le test : elle se
 * déclare APRÈS avoir posé le repère de portée. C'est la seule chose qui
 * empêche un 3ᵉ, 4ᵉ, 5ᵉ écran de reperdre le geste en silence.
 */
const SURCOUCHES_COUVERTES: ReadonlyArray<{ file: string; scopeProvider: string; why: string }> = [
  {
    file: 'src/features/briefing/view/PriorityCard.tsx',
    scopeProvider: 'src/features/briefing/view/TodayStartCallout.tsx',
    why: "Théo A today-jour.N5 — « Pourquoi celle-ci ? » ouvre le tiroir de l'action de « Commencer ici » : la carte de priorité entière (et son `<AskLaura>`, #2095.57) est rendue DANS un `<Dialog>`. Le repère est posé par `TodayStartCallout` (Louis 23/10 : ramené de `StartHereCard`, vue jour PR11 supprimée), qui sait qu'elle est la surcouche — la carte reste la même partout ailleurs.",
  },
  {
    file: 'src/features/watchlist/view/WatchlistSignalDetail.tsx',
    scopeProvider: 'src/components/overlay/BrowsableDialog.tsx',
    why: "Le détail d'un signal est rendu DANS `BrowsableDialog` par `WatchlistBoard` (#1797 ; la page `WatchlistPage` a disparu avec #2151.60). Le repère est posé dans la modale elle-même, pas chez l'appelant : c'est elle qui sait qu'elle est une surcouche, et le prochain écran de liste l'héritera sans rien lire.",
  },
  {
    file: 'src/features/consultants/view/CvImportNextSteps.tsx',
    scopeProvider: 'src/features/consultants/view/CvImportNextSteps.tsx',
    why: "Les CTA de fin d'import de CV (#2183.52-.55) sont rendus DANS les dialogues d'import CSV et ZIP. Le repère est posé dans le composant qui rend `<AskLaura>`, pas dans chacun des deux dialogues : un troisième canal d'import l'héritera sans rien lire.",
  },
  {
    file: 'src/features/records/RecordPanel.tsx',
    scopeProvider: 'src/features/records/RecordPanel.tsx',
    why: "#4194 (L3, déménagement) — `ProjectDetailSheet.tsx` et `MissionDetailSheet.tsx` ont cessé d'être des tiroirs : le panneau latéral UNIQUE `RecordPanel` porte lui-même son `<Sheet>` pour les cinq types de fiche (opportunité, besoin, positionnement, mission, consultant) et y rend l'UNIQUE `<AskLaura>` (#2170.29, #2192.31/.36 en un seul bouton). La bulle est masquée tant qu'un tiroir est ouvert (GA-205) : le repère `LauraIntroScope` est donc posé ici, pas chez l'appelant (`ProjectsPage`, `MissionsPage`).",
  },
  {
    file: 'src/features/discover/view/CandidateRowDetails.tsx',
    scopeProvider: 'src/features/discover/view/CandidateRow.tsx',
    why: "Théo decouvrir.R6 — le détail d'un compte de Découvrir s'ouvre en tiroir « Aperçu du compte » (`<Sheet>` de `CandidateRow`) et y rend son `<AskLaura>`. Le repère est posé dans le tiroir lui-même, à côté de `CandidateRowDetails`, pas chez l'appelant : chaque ligne de la liste l'hérite sans rien lire, et l'amorce de la bulle ne se dispute pas avec celle de la page.",
  },
  {
    file: 'src/features/routines/view/RoutineFunctioningDialog.tsx',
    scopeProvider: 'src/features/routines/view/RoutineFunctioningDialog.tsx',
    why: "Théo C automations-bibliotheque.R3 — « Adapter avec Laura » est rendu DANS la fenêtre « Voir le fonctionnement » d'une routine. Le repère est posé dans la fenêtre elle-même : la bibliothèque porte déjà « Décrire mon besoin » derrière elle, et les deux ne doivent pas se disputer l'amorce de la bulle.",
  },
  {
    file: 'src/features/projects/view/ProjectLauraDialog.tsx',
    scopeProvider: 'src/features/projects/view/ProjectLauraDialog.tsx',
    why: "Théo C projects-fiche.R8 — « Avec Laura » ouvre un dialogue qui rend l'`<AskLaura>` de l'affaire (la question cadrée sur le compte) et la synthèse en sept questions. La bulle est masquée tant qu'un dialogue est ouvert : le repère `LauraIntroScope` est posé dans le dialogue lui-même, pas chez l'appelant (`ProjectDossierPage`).",
  },
]

const SCAN = scanInstances()

describe('GA-283 — elle LIT quelque chose : le corpus n’est pas vide', () => {
  it('balaye des fichiers, et y trouve des `<AskLaura>`', () => {
    expect(SCAN.filesRead).toBeGreaterThan(100)
    // Le relevé du 10/09/2026 en comptait 30, dans 26 composants — dont DEUX
    // rendues à l'intérieur d'une surcouche.
    expect(SCAN.instances.length).toBeGreaterThan(20)
  })

  it('trouve les instances rendues DANS une surcouche, et chacune a son repère de portée', () => {
    const enSurcouche = SCAN.instances.filter(instance => instance.overlay !== null)
    // Sans ce plancher, la garde resterait verte le jour où le balayage
    // cesserait de voir la composition qu'elle protège — le défaut exact que
    // GA-33 avait eu, vert pendant que 149 endroits échouaient.
    expect(enSurcouche.length).toBeGreaterThan(0)

    const declares = new Set(SURCOUCHES_COUVERTES.map(entry => entry.file))
    const inconnues = enSurcouche.filter(instance => !declares.has(instance.file))
    expect(
      inconnues.map(instance => `${instance.file}:${instance.line} (dans <${instance.overlay}>)`),
      "Un `<AskLaura>` neuf est rendu dans une surcouche sans repère de portée : enveloppe le contenu de cette surcouche d'un `<LauraIntroScope>` (voir `laura-intro-scope.tsx`), puis déclare-le dans SURCOUCHES_COUVERTES avec sa raison.",
    ).toEqual([])

    // Et chaque fichier déclaré est bien couvert par le balayage : une entrée
    // du registre qui ne désigne plus rien est une garde qui épingle un état
    // mort, pas une règle.
    for (const entry of SURCOUCHES_COUVERTES) {
      expect(
        enSurcouche.some(instance => instance.file === entry.file),
        `${entry.file} est déclaré « en surcouche » mais le balayage n'y voit plus d'\`<AskLaura>\` sous une surcouche.`,
      ).toBe(true)
    }
  })

  it('chaque repère de portée déclaré existe VRAIMENT dans le fichier annoncé', () => {
    for (const entry of SURCOUCHES_COUVERTES) {
      const source = readFileSync(join(WEB_SRC, '..', entry.scopeProvider), 'utf8')
      const code = codeLines(source).join('\n')
      expect(code, `${entry.scopeProvider} doit importer \`LauraIntroScope\`. ${entry.why}`).toContain(
        'laura-intro-scope',
      )
      expect(code, `${entry.scopeProvider} doit RENDRE \`<LauraIntroScope>\`. ${entry.why}`).toMatch(
        /<LauraIntroScope[\s>]/,
      )
    }
  })
})

/** Ce que la bulle porterait — la preuve par le magasin, pas par une classe. */
function Bubble() {
  const intro = useCurrentLauraIntro()
  return <span data-testid="bulle">{intro ? `${intro.question}#${intro.scopeDepth}` : 'rien'}</span>
}

afterEach(() => {
  cleanup()
  resetLauraIntro()
})

/**
 * L'écran rejoué : `/watchlist` (une amorce de LISTE) et sa modale de signal
 * (l'amorce du SIGNAL), avec le `role="dialog"` réel autour du contenu.
 */
function Watchlist({ modaleOuverte }: { modaleOuverte: boolean }) {
  return (
    <>
      <AskLaura question="Quels signaux méritent une action aujourd’hui ?" label="Demander à Laura" />
      {modaleOuverte ? (
        <div role="dialog" aria-label="STUDIO TF1">
          <LauraIntroScope>
            <AskLaura
              variant="prominent"
              question="Que se passe-t-il chez STUDIO TF1 après « levée de fonds » ?"
              label="Demander quoi faire"
              accountId="acc-tf1"
            />
          </LauraIntroScope>
        </div>
      ) : null}
    </>
  )
}

describe('GA-283 — elle sait dire NON : la surcouche PREND la portée, et la REND', () => {
  it('la modale prend la portée à l’ouverture — et son geste reste ATTEIGNABLE dans la modale', () => {
    const view = render(
      <>
        <Watchlist modaleOuverte={false} />
        <Bubble />
      </>,
    )
    expect(screen.getByTestId('bulle')).toHaveTextContent('Quels signaux méritent une action aujourd’hui ?#0')

    view.rerender(
      <>
        <Watchlist modaleOuverte />
        <Bubble />
      </>,
    )

    // La portée est passée à la modale : profondeur 1, sa question à elle.
    expect(screen.getByTestId('bulle')).toHaveTextContent(
      'Que se passe-t-il chez STUDIO TF1 après « levée de fonds » ?#1',
    )
    // Et le geste n'a pas disparu de la modale : sous une modale, la bulle est
    // inerte (`pointer-events: none` posé par Radix sur le corps du document),
    // donc c'est la surcouche qui porte le contrôle visible. C'est la moitié
    // du défaut que six signaux consécutifs ont montrée en production.
    const dialogue = screen.getByRole('dialog')
    expect(dialogue.querySelector('a')).not.toBeNull()
    expect(dialogue.textContent).toContain('Demander quoi faire')
  })

  it('la modale REND la portée en se fermant — la bulle retrouve l’amorce de la page, sans rechargement', () => {
    const view = render(
      <>
        <Watchlist modaleOuverte />
        <Bubble />
      </>,
    )
    view.rerender(
      <>
        <Watchlist modaleOuverte={false} />
        <Bubble />
      </>,
    )

    // ⚠️ AVANT #1847, cette ligne rendait « rien » : la modale remettait le
    // magasin à `null` en partant, et le dépôt de la page ne se rejoue jamais.
    expect(screen.getByTestId('bulle')).toHaveTextContent('Quels signaux méritent une action aujourd’hui ?#0')
  })

  it('une republication de la PAGE ne reprend pas la portée à une surcouche ouverte', () => {
    // Le cas des listes qui déposent une amorce PAR LIGNE
    // (`MissionTrackingTable`) : leur contenu change, donc elles republient.
    // « Le dernier monté gagne » les faisait alors passer devant une modale
    // ouverte, sans que rien ne bouge à l'écran.
    function Page({ suffixe, modaleOuverte }: { suffixe: string; modaleOuverte: boolean }) {
      return (
        <>
          <AskLaura question={`Priorise ma file ${suffixe}`} label="Demander à Laura" />
          {modaleOuverte ? (
            <div role="dialog">
              <LauraIntroScope>
                <AskLaura question="Que se passe-t-il chez STUDIO TF1 ?" label="Demander quoi faire" />
              </LauraIntroScope>
            </div>
          ) : null}
        </>
      )
    }

    const view = render(
      <>
        <Page suffixe="A" modaleOuverte />
        <Bubble />
      </>,
    )
    view.rerender(
      <>
        <Page suffixe="B" modaleOuverte />
        <Bubble />
      </>,
    )

    expect(screen.getByTestId('bulle')).toHaveTextContent('Que se passe-t-il chez STUDIO TF1 ?#1')
  })
})

describe('GA-283 — elle n’attrape pas ce qu’elle ne vise pas : plusieurs `<AskLaura>` sur une même PAGE', () => {
  it('les trois `<AskLaura>` de `MyDataView` restent classés « page », pas « surcouche »', () => {
    const myData = SCAN.instances.filter(instance => instance.file.endsWith('view/MyDataView.tsx'))
    // Le fichier rend aussi un `<ExportRecapDialog … />` auto-fermé plus haut :
    // un balayage qui ne vérifie pas la fermeture les aurait déclarés « en
    // surcouche » et aurait exigé un repère de portée sur une page ordinaire.
    expect(myData.length).toBe(3)
    expect(myData.map(instance => instance.overlay)).toEqual([null, null, null])
  })

  it('sur une page, le comportement d’avant #1847 est intact — un seul passe le relais, les autres gardent leur lien', () => {
    render(
      <>
        <AskLaura question="Prépare une reprise avec ACME." label="Demander à Laura (ACME)" />
        <AskLaura question="Prépare une reprise avec Globex." label="Demander à Laura (Globex)" />
        <Bubble />
      </>,
    )

    // Le dernier enregistré passe le relais à la bulle…
    expect(screen.getByTestId('bulle')).toHaveTextContent('Prépare une reprise avec Globex.#0')
    expect(screen.queryByText('Demander à Laura (Globex)')).not.toBeInTheDocument()
    // …et celui qui perd la course garde son lien : rien ne disparaît.
    expect(screen.getByText('Demander à Laura (ACME)')).toBeInTheDocument()
  })
})
