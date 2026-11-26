import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-385 — UN TEXTE LIBRE DANS UNE LIGNE DENSE PORTE UNE BORNE DE LIGNES.
 *
 * Réservé après lecture de `origin/main` ET de 47 branches du 22/09/2026 en vol
 * (`git grep -n "describe(" ... -- apps/api/src/architecture apps/web/src/architecture`,
 * suivi de l'extraction `GA-[0-9]+` — le plus haut numéro trouvé était GA-382,
 * cf. `.claude/notes/registre-2026-09-22-file-qualification-dense.md`).
 *
 * ⚠️ RENUMÉROTÉE APRÈS COLLISION : un autre écrivain (`fix/libelles-incoherents-22-09`)
 * a scanné à la même seconde, trouvé le même maximum GA-382 et pris le numéro suivant
 * en premier — pour une PAIRE contiguë de deux gardes chez lui, qui garde donc ses deux
 * numéros. Celle-ci se décale d'un cran à GA-385. Aucun scan, même exhaustif, ne réserve
 * rien contre un agent qui scanne à l'instant même. GA-385 confirmé libre sur
 * `origin/main`, `integration-vague-14-22-09` et les deux branches concernées.
 *

 * ─────────────────────────────────────────────────────────────────────────────
 * LA MESURE QUI A PAYÉ CETTE GARDE — #2708, LA QUATRIÈME TENTATIVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis, dans #2708 : « je t'ai déjà fait très souvent ce retour ce putain de
 * tableau est toujours pas bien en forme ». Trois correctifs avaient déjà été
 * posés et FERMÉS sur des tests verts (dont GA-63, commit 98c1c189b, qui a
 * élargi la ligne de 650 à 1 195 px — un correctif JUSTE, qui reste en place).
 * Mesuré en prod APRÈS GA-63 (compte 8ea17309-dd66-412b-a4d5-fdbdc7612cda,
 * `?tab=projects`, « Pistes à qualifier ») : 18 `<li>`, hauteurs
 * `[64,65,57,85,65,65,145,57,57,57,57,57,57,57,57,65,57,65]` — la ligne à 145 px
 * porte `SPAN.text-sm.font-medium…` à **569 × 120 px**, `maxWidth: none`,
 * `whiteSpace: normal` : le texte INTÉGRAL d'un signal détecté (~400
 * caractères), sans repli de lignes. La table voisine « 12 projets », même
 * page, porte le même motif en pire : `[197,77,77,57]`, 197 px pour le même
 * genre de paragraphe.
 *
 * Le défaut n'est PAS un débordement (largeur, `overflow`) : la sonde de
 * débordement est propre (écrasé 0, déborde 0, recouvre 0). C'est une DENSITÉ —
 * une ligne peut légitimement s'étirer en hauteur pour un texte long, mais une
 * vue qui se revendique « dense » (le docblock de `QualificationLeadsQueue.tsx`
 * l'affirme) ne peut pas laisser un texte SANS BORNE DE LONGUEUR dicter la
 * hauteur de toutes ses lignes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ GA-63 NE REVIENT PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-63 a retiré le `max-w-70ch` que `index.css` posait par erreur sur ce `<li>`
 * (il ne portait ni `flex` ni `justify-between`, la signature de classe ne le
 * voyait pas). C'était le bon correctif pour CE défaut-là — la largeur — et il
 * n'est pas touché : la ligne reste à 1 195 px. Le défaut que cette garde vise
 * est un AUTRE défaut, sur le MÊME écran, découvert seulement parce que le
 * premier a été corrigé : `lead.label` / `row.label` n'ont eux-mêmes aucune
 * borne de longueur, et rien ne les clampait déjà en HAUTEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE CETTE GARDE NE SAIT PAS VOIR — ET POURQUOI ELLE NE LIT PAS DES PIXELS
 * ─────────────────────────────────────────────────────────────────────────────
 * jsdom ne met rien en page : `getBoundingClientRect` y rend 0 partout, et
 * aucun test unitaire ne peut voir une ligne de 145 px. C'est très exactement
 * pourquoi GA-63, verte sur 1 633 tests, n'a pas vu ce second défaut — trois
 * recettes ne l'ont pas vu non plus, parce qu'elles lisaient la page en TEXTE.
 * Cette garde ne mesure donc AUCUN pixel : elle interdit la COMBINAISON qui a
 * produit la mesure (un champ de longueur libre, rendu SANS classe
 * `line-clamp-N`, dans une ligne dense identifiée). La preuve que la hauteur
 * réelle a changé reste une mesure ÉCRAN, jamais cette suite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE INTERDIT, ET CE QUE LE CORRECTIF GARDE ATTEIGNABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Interdit : un site du registre {@link FREE_TEXT_IN_DENSE_ROWS} dont la balise
 * qui rend le champ ne porte pas `line-clamp-<n>`.
 *
 * 🔴 On ne coupe JAMAIS la DONNÉE, seulement l'AFFICHAGE (doctrine — « on
 * n'affiche pas ce qu'on n'a pas » ne dit pas « on efface ce qu'on a »). Chaque
 * site du registre doit donc AUSSI rester atteignable en entier : la garde
 * vérifie qu'un `title={<le même champ>}` accompagne la troncature — le repli
 * le plus simple, toujours disponible, jamais un clic ou un état à câbler.
 */

const WEB_SRC = join(__dirname, '..')

/**
 * LES SITES SURVEILLÉS, ET LA RAISON DE CHACUN.
 *
 * `marker` est le texte EXACT du enfant JSX qui rend le champ (ex. `{lead.label}`).
 * On cherche sa DERNIÈRE occurrence dans le fichier : la première, plus haut
 * dans la balise, est l'attribut `title={lead.label}` que le correctif pose
 * juste à côté — chercher la dernière revient à chercher l'enfant, jamais
 * l'attribut qui le précède.
 */
type DenseRowSite = { file: string; marker: string; field: string; why: string }

const FREE_TEXT_IN_DENSE_ROWS: readonly DenseRowSite[] = [
  {
    file: 'features/accounts/view/account-detail/tabs/opportunities/QualificationLeadsQueue.tsx',
    marker: '{lead.label}',
    field: 'lead.label',
    why: "#2708/#2692 — le libellé d'une piste à qualifier porte le texte intégral d'un signal détecté par l'analyse (jusqu'à ~400 caractères, aucune borne de longueur) ; mesuré à 145 px pour une ligne quand les lignes courtes tiennent à 57-65 px.",
  },
  {
    file: 'features/accounts/view/account-detail/tabs/TabProjects.tsx',
    marker: '{row.label}',
    field: 'row.label',
    why: "#2708.2 — le même libellé, dans le tableau « projets » de la même page, mesuré à 197 px pour la pire ligne : le jumeau du défaut ci-dessus, dans un `<TableCell>` plutôt qu'un `<li>`.",
  },
  {
    file: 'features/accounts/view/account-detail/tabs/sections/LinkedObjectsSummary.tsx',
    marker: '{row.label}',
    field: 'row.label',
    why: "#2708.2 — RÉFUTÉ en prod le 23/09 : le correctif posé sur TabProjects.tsx (site ci-dessus) ne protégeait PAS l'écran réel. « Projets plausibles » est rendu par CE composant (`LinkedObjectsSummary` → `SummaryRow`), monté par TabProjects ET TabMissions — mesuré 0/12 lignes avec line-clamp, 100 px pour un libellé de 469 caractères.",
  },
]

/**
 * La balise JSX qui précède immédiatement `marker`, du `<` d'ouverture jusqu'au
 * début du marqueur (comprend donc tous les attributs, y compris `title=`).
 *
 * ⚠️ Suppose que le champ surveillé est le SEUL enfant direct de sa balise —
 * vrai des deux sites réels, et la raison pour laquelle cette garde reste une
 * recherche de texte et non un arbre JSX complet (voir GA-333 pour la version
 * générale, plus coûteuse, quand cette hypothèse ne tient pas).
 */
function tagBefore(source: string, marker: string): string | null {
  const idx = source.lastIndexOf(marker)
  if (idx === -1) return null
  const openStart = source.lastIndexOf('<', idx)
  if (openStart === -1) return null
  return source.slice(openStart, idx)
}

/** Les sites du registre dont la balise ne porte pas `line-clamp-<n>`, nommés. */
function unclamped(sources: ReadonlyMap<string, string>, sites: readonly DenseRowSite[]): string[] {
  const found: string[] = []
  for (const site of sites) {
    const source = sources.get(site.file)
    if (source === undefined) continue
    const tag = tagBefore(source, site.marker)
    if (tag === null || !/\bline-clamp-\d+\b/.test(tag)) found.push(site.file)
  }
  return found
}

/** Les sites du registre dont la balise ne garde pas le texte complet ATTEIGNABLE. */
function unreachable(sources: ReadonlyMap<string, string>, sites: readonly DenseRowSite[]): string[] {
  const found: string[] = []
  for (const site of sites) {
    const source = sources.get(site.file)
    if (source === undefined) continue
    const tag = tagBefore(source, site.marker)
    if (tag === null || !tag.includes(`title={${site.field}}`)) found.push(site.file)
  }
  return found
}

function realCorpus(): Map<string, string> {
  const corpus = new Map<string, string>()
  for (const site of FREE_TEXT_IN_DENSE_ROWS) {
    corpus.set(site.file, readFileSync(join(WEB_SRC, site.file), 'utf8'))
  }
  return corpus
}

describe('GA-385 — un texte libre dans une ligne dense porte une borne de lignes', () => {
  /**
   * LA PREUVE QUE LE REGISTRE DÉSIGNE QUELQUE CHOSE DE VIVANT.
   *
   * Un marqueur qui a disparu du fichier (refactor, renommage du champ) rend
   * cette garde verte pour toujours sur un site qu'elle ne regarde plus.
   */
  it('chaque site surveillé existe encore dans son fichier', () => {
    const corpus = realCorpus()
    for (const site of FREE_TEXT_IN_DENSE_ROWS) {
      const source = corpus.get(site.file)
      expect(source, `${site.file} est introuvable`).toBeDefined()
      expect(source?.includes(site.marker), `${site.marker} n'est plus rendu dans ${site.file}`).toBe(true)
    }
  })

  /**
   * LA PREUVE QUE LA GARDE SAIT DIRE NON — LE COUPABLE FACTICE, NOMMÉ.
   *
   * Un fichier synthétique, jamais écrit sur le disque : le champ libre est
   * rendu tel qu'il l'était avant le correctif de #2708 (`full` + `break-words`,
   * sans `line-clamp-`). La garde doit le refuser en le NOMMANT, pas en listant
   * un compte.
   */
  it('refuse un champ libre rendu sans line-clamp dans une ligne dense', () => {
    const fautif = new Map([
      [
        FREE_TEXT_IN_DENSE_ROWS[0]!.file,
        `<Text element="span" size="sm" weight="medium" full className="min-w-0 flex-1 break-words">
          {lead.label}
        </Text>`,
      ],
    ])
    const offenders = unclamped(fautif, FREE_TEXT_IN_DENSE_ROWS.slice(0, 1))
    expect(offenders).toEqual([FREE_TEXT_IN_DENSE_ROWS[0]!.file])
  })

  /** LA PREUVE QUE LA GARDE LAISSE PASSER LE CORRECTIF QU'ELLE ATTEND. */
  it('laisse passer un champ libre borné en lignes, avec son repli', () => {
    const corrige = new Map([
      [
        FREE_TEXT_IN_DENSE_ROWS[0]!.file,
        `<Text
          element="span"
          size="sm"
          weight="medium"
          full
          className="min-w-0 flex-1 line-clamp-2 break-words"
          title={lead.label}
        >
          {lead.label}
        </Text>`,
      ],
    ])
    expect(unclamped(corrige, FREE_TEXT_IN_DENSE_ROWS.slice(0, 1))).toEqual([])
    expect(unreachable(corrige, FREE_TEXT_IN_DENSE_ROWS.slice(0, 1))).toEqual([])
  })

  /**
   * LA PREUVE QU'UN `line-clamp-` SEUL NE SUFFIT PAS — LA DONNÉE DOIT RESTER
   * ATTEIGNABLE. Un correctif qui bornerait la hauteur en effaçant l'accès au
   * texte complet romprait la doctrine (« on n'efface pas ce qu'on a »).
   */
  it('refuse un line-clamp posé SANS repli vers le texte complet', () => {
    const borgne = new Map([
      [
        FREE_TEXT_IN_DENSE_ROWS[0]!.file,
        `<Text element="span" size="sm" weight="medium" full className="min-w-0 flex-1 line-clamp-2 break-words">
          {lead.label}
        </Text>`,
      ],
    ])
    expect(unclamped(borgne, FREE_TEXT_IN_DENSE_ROWS.slice(0, 1))).toEqual([])
    expect(unreachable(borgne, FREE_TEXT_IN_DENSE_ROWS.slice(0, 1))).toEqual([FREE_TEXT_IN_DENSE_ROWS[0]!.file])
  })

  /** LA PREUVE SUR LE CORPUS RÉEL — LES DEUX SITES DE #2708. */
  it('aucun site réel du registre ne rend un champ libre sans borne ni sans repli', () => {
    const corpus = realCorpus()
    expect(unclamped(corpus, FREE_TEXT_IN_DENSE_ROWS), 'sans line-clamp').toEqual([])
    expect(unreachable(corpus, FREE_TEXT_IN_DENSE_ROWS), 'sans repli title').toEqual([])
  })
})
