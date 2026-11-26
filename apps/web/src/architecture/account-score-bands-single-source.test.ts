/**
 * GA-56 — LES SEUILS DE BANDE D'UN SCORE DE COMPTE VIVENT À UN SEUL ENDROIT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `packages/contracts/src/schemas/account-score.ts` porte la coupure des
 * bandes du `priority_score` /10 — `ACCOUNT_SCORE_GO_MIN` (7) et
 * `ACCOUNT_SCORE_PRUDENT_MIN` (5) — et son en-tête dit depuis la
 * réconciliation POURQUOI elle est là :
 *
 *   « Every label / colour that reads `priority_score` MUST go through here —
 *     else a PRUDENT account shows as "GO" on one screen and "PRUDENT" on
 *     another (the divergence the reconciliation fixed). »
 *
 * SIX endroits retapaient le 7 et le 5 à la main : le filtre par bucket côté
 * serveur, la pilule de la liste de veille, la ligne « compte prioritaire »
 * de la même liste, le seuil du KPI « Prioritaires » (une constante locale
 * `PRIORITY_SCORE = 7`, à trois lignes de la précédente, et dont le
 * commentaire affirmait « une seule définition »), le verdict de repli de
 * l'onglet Évaluation, et celui de l'export PDF. Aucun n'était faux ; c'est ce
 * qui les rendait dangereux — le jour où la bande bouge, cinq écrans la
 * suivent et un ne la suit pas, et le seul symptôme est un compte qui change
 * de couleur d'un onglet à l'autre.
 *
 * ⚠️ Le sixième n'a été vu qu'en CASSANT volontairement le cinquième : la
 * première version du détecteur ne cherchait qu'une COMPARAISON, et une
 * constante rebaptisée n'en est pas une. Une garde qui ne voit qu'une forme du
 * défaut se croit verte.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * D44 (Louis, 28/08/2026) — LA DÉRIVE À 7,5 EST RÉSORBÉE, LE CLIQUET DESCEND
 * ─────────────────────────────────────────────────────────────────────────
 * La version précédente de cette garde disait : « la coupure a DÉJÀ dérivé —
 * le statut commercial coupe à 7,5 là où la bande coupe à 7 ; cette garde ne
 * la corrige pas (reclasser des comptes est une décision, pas un branchement),
 * elle empêche la SIXIÈME copie. Le jour où la décision est prise, ce compte
 * descend à 0 et la borne se resserre ; il ne remonte jamais. »
 *
 * C'est ce jour. Louis a aligné le tri commercial sur 7, parce que la bande
 * est ce que l'utilisateur VOIT. Le compte descend donc à **zéro**, et la
 * garde ne tolère plus AUCUNE coupure de score écrite en dur dans le corpus
 * — ni 7, ni 5, ni 7,5, ni une troisième valeur qu'on n'a pas vue venir.
 * Le tri commercial emprunte désormais `COMMERCIAL_OPPORTUNITY_SCORE_MIN`,
 * qui EST `ACCOUNT_SCORE_GO_MIN` : un seul nombre, un seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ne force personne à rendre trois bandes. Deux de ces écrans collapsent
 * délibérément en GO / NO-GO ; ils gardent leur choix, ils empruntent
 * seulement la coupure. Et elle retire les commentaires avant de lire : sans
 * ça, la phrase qui explique la règle la ferait tomber.
 *
 * Elle ne touche pas non plus aux MIGRATIONS, qui sont des faits datés : une
 * migration fige la valeur de son jour, elle ne l'emprunte pas — sinon changer
 * la constante réécrirait l'histoire de la base. Elles ont leur propre liste,
 * CLOSE : cf. {@link FROZEN_SCORE_MIGRATIONS}.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_SCORE_GO_MIN, ACCOUNT_SCORE_PRUDENT_MIN, COMMERCIAL_OPPORTUNITY_SCORE_MIN } from '@bellum/contracts'

const WEB_SRC = join(__dirname, '..')
const REPO_APPS = join(__dirname, '..', '..', '..')
const REPO_ROOT = join(REPO_APPS, '..')
const MIGRATIONS = join(REPO_APPS, 'api', 'src', 'migrations')

/**
 * Les fichiers qui LISENT un `priority_score` pour en faire une bande ou un
 * rangement. Liste explicite : une garde qui balaie tout le dépôt attrape des
 * `>= 7` qui n'ont rien à voir (une pagination, un compte de caractères) et se
 * fait désarmer au premier faux positif.
 *
 * `account.ts` (contrats) et `AccountContent.tsx` ont rejoint la liste avec
 * D44 : le premier portait le miroir TypeScript de la coupure commerciale, le
 * second comptait les « comptes à fort potentiel » sur un `7.5` recopié à la
 * main. Aucun des deux n'était surveillé — c'est pour ça qu'ils ont dérivé.
 */
const WATCHED = [
  join(REPO_APPS, 'api', 'src', 'modules', 'accounts', 'accounts.service.ts'),
  join(WEB_SRC, 'features', 'watchlist', 'view', 'WatchlistTable.tsx'),
  join(WEB_SRC, 'features', 'watchlist', 'model', 'watchlist.ts'),
  join(WEB_SRC, 'features', 'accounts', 'view', 'account-detail', 'tabs', 'evaluation', 'evaluationViewData.ts'),
  join(WEB_SRC, 'features', 'accounts', 'view', 'AccountContent.tsx'),
  join(WEB_SRC, 'lib', 'account-pdf', 'normalize.ts'),
  join(REPO_ROOT, 'packages', 'contracts', 'src', 'schemas', 'account.ts'),
]

/**
 * Les migrations autorisées à écrire une coupure de score en dur, et POURQUOI.
 *
 * Une migration est un fait daté : elle décrit ce qu'on a fait à la base ce
 * jour-là, avec la valeur de ce jour-là. Lui faire importer la constante
 * rendrait son sens dépendant du présent — dans six mois, relire la migration
 * ne dirait plus ce qui s'est réellement passé.
 *
 * La liste est donc CLOSE, et vérifiée dans les deux sens : une migration qui
 * écrit une coupure sans y figurer fait rougir la CI ; une entrée qui n'écrit
 * plus rien la fait rougir aussi (une liste périmée est une porte de sortie).
 */
const FROZEN_SCORE_MIGRATIONS = new Map<string, string>([
  [
    '1784900100000-CommercialStatus.ts',
    'le backfill d’origine du tri commercial — il a rangé selon la coupure de SON jour (7,5).',
  ],
  [
    '1790300000002-CommercialStatusCutoffSeven.ts',
    'le reclassement D44 — il doit nommer les DEUX bornes (7 et 7,5) pour dire d’où à où il déplace.',
  ],
])

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Une coupure de bande écrite en dur : un `score` (ou `priority_score`)
 * comparé au 7 ou au 5 littéral. On exige le mot `score` sur la même
 * comparaison — c'est ce qui sépare la bande d'un `>= 7` de pagination.
 *
 * ⚠️ Pas de drapeau `g` : `RegExp.test()` avec `g` est STATEFUL et rend un
 * résultat sur deux (défaut payé six fois dans ce dépôt).
 */
export function bandCutoffsWrittenByHand(source: string): string[] {
  const code = withoutComments(source)
  const cutoffs = [ACCOUNT_SCORE_GO_MIN, ACCOUNT_SCORE_PRUDENT_MIN]
  return cutoffs
    .filter(
      cutoff =>
        // Deux formes, et la seconde est celle qui a survécu à la première passe :
        // une comparaison directe (`score >= 7`), ET une constante locale baptisée
        // « …SCORE » à qui l'on donne la valeur (`const PRIORITY_SCORE = 7`). La
        // seconde se disait « une seule définition » — dans son fichier seulement.
        // ⚠️ Pas de `\b` devant `score` dans la seconde : dans `PRIORITY_SCORE`,
        // le `score` est précédé d'un `_`, qui EST un caractère de mot — la
        // limite n'existe pas, et c'est exactement la forme qu'on cherche.
        new RegExp(`score\\s*(?:>=|<)\\s*${cutoff}(?!\\d|\\.)`, 'i').test(code) ||
        new RegExp(`score\\w*\\s*(?::\\s*number)?\\s*=\\s*${cutoff}(?!\\d|\\.)`, 'i').test(code),
    )
    .map(cutoff => `coupure ${cutoff} écrite en dur`)
}

/**
 * TOUTE coupure de score écrite en dur — le cliquet de D44, celui qui voit une
 * TROISIÈME valeur arriver (`>= 8`, `< 6.9`, `= 7.5`), pas seulement les deux
 * qu'on connaît.
 *
 * Deux formes, et deux exclusions qui sont des décisions, pas des trous :
 *
 * - **`0` n'est pas une coupure**, c'est un test de PRÉSENCE : `score > 0` est
 *   précisément ce qu'on écrit quand on refuse de traiter l'absence comme un
 *   zéro. Deux fichiers du corpus l'écrivent, à raison.
 * - **une constante ne compte que si sa valeur peut être une coupure du /10**,
 *   c'est-à-dire dans l'intervalle OUVERT ]0 ; 10[. `SCORE_25_MAX = 25` (le
 *   dénominateur de la grille /25) et un `= 10` (le maximum du /10) ne sont pas
 *   des coupures ; `= 8` en serait une, et il est vu.
 */
export function scoreCutoffsWrittenByHand(source: string): string[] {
  const code = withoutComments(source)
  const found: string[] = []

  // Forme 1 — la comparaison. `matchAll` et non `.test()` : le drapeau `g` est
  // sûr ici, il ne l'est pas sur `.test()`.
  for (const match of code.matchAll(/\w*score\w*\s*(?:>=|<=|>|<)\s*(\d+(?:\.\d+)?)/gi)) {
    if (Number.parseFloat(match[1]) !== 0) found.push(match[0].trim())
  }

  // Forme 2 — la constante locale qui REBAPTISE la coupure au lieu de l'emprunter.
  for (const match of code.matchAll(/(\w*score\w*)\s*(?::\s*number)?\s*=\s*(\d+(?:\.\d+)?)(?!\d|\.)/gi)) {
    const value = Number.parseFloat(match[2])
    if (value > 0 && value < 10) found.push(match[0].trim())
  }

  return found
}

/** Les migrations qui écrivent une coupure de score, par nom de fichier. */
function migrationsWritingAScoreCutoff(): string[] {
  return readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .filter(name => scoreCutoffsWrittenByHand(readFileSync(join(MIGRATIONS, name), 'utf8')).length > 0)
}

describe('GA-56 — la garde LIT vraiment ses fichiers', () => {
  it('les fichiers surveillés existent et parlent bien de score', () => {
    expect(WATCHED.length).toBeGreaterThanOrEqual(7)
    for (const file of WATCHED) {
      expect(existsSync(file), `fichier surveillé introuvable : ${file}`).toBe(true)
      const source = readFileSync(file, 'utf8')
      expect(source.length).toBeGreaterThan(500)
      expect(source.toLowerCase()).toContain('score')
    }
  })

  it('le dossier des migrations est bien lu — et il n’est pas vide', () => {
    const all = readdirSync(MIGRATIONS).filter(name => name.endsWith('.ts'))
    expect(all.length).toBeGreaterThan(200)
    // Le corpus des migrations à coupure n'est pas vide non plus : sans ça, le
    // test « la liste close est respectée » passerait au vert sur du néant.
    expect(migrationsWritingAScoreCutoff().length).toBeGreaterThan(0)
  })

  it('les seuils lus viennent du contrat, pas de la garde', () => {
    expect(ACCOUNT_SCORE_GO_MIN).toBe(7)
    expect(ACCOUNT_SCORE_PRUDENT_MIN).toBe(5)
  })
})

describe('GA-56 — le détecteur sait dire NON', () => {
  it('voit une coupure retapée à la main', () => {
    expect(bandCutoffsWrittenByHand(`const v = score >= 7 ? 'GO' : 'NO-GO'`)).toEqual(['coupure 7 écrite en dur'])
    expect(bandCutoffsWrittenByHand(`qb.andWhere('account.priority_score < 5')`)).toEqual(['coupure 5 écrite en dur'])
  })

  it('ne prend pas un commentaire pour du code', () => {
    expect(bandCutoffsWrittenByHand(`/* la bande coupe à score >= 7 */\nconst x = 1`)).toEqual([])
    expect(bandCutoffsWrittenByHand(`// score >= 5 était écrit ici\nconst x = 1`)).toEqual([])
    expect(scoreCutoffsWrittenByHand(`/* le tri coupait à score >= 7.5 */\nconst x = 1`)).toEqual([])
  })

  it('ne confond pas une pagination avec une bande', () => {
    expect(bandCutoffsWrittenByHand(`if (page >= 7) return []`)).toEqual([])
    expect(scoreCutoffsWrittenByHand(`if (page >= 7) return []`)).toEqual([])
  })

  it('accepte la forme branchée', () => {
    expect(bandCutoffsWrittenByHand(`const v = score >= ACCOUNT_SCORE_GO_MIN ? 'GO' : 'NO-GO'`)).toEqual([])
    expect(scoreCutoffsWrittenByHand(`const v = score >= ACCOUNT_SCORE_GO_MIN ? 'GO' : 'NO-GO'`)).toEqual([])
    expect(scoreCutoffsWrittenByHand(`const PRIORITY_SCORE = ACCOUNT_SCORE_GO_MIN`)).toEqual([])
    expect(scoreCutoffsWrittenByHand(`WHEN priority_score >= $2 THEN 'opportunity'`)).toEqual([])
  })

  it('voit une constante locale qui REBAPTISE la coupure', () => {
    // La forme qui avait échappé à la première version de la garde.
    expect(bandCutoffsWrittenByHand(`const PRIORITY_SCORE = 7`)).toEqual(['coupure 7 écrite en dur'])
    expect(scoreCutoffsWrittenByHand(`const PRIORITY_SCORE = 7`)).toEqual(['PRIORITY_SCORE = 7'])
    // …sans confondre avec un compteur qui se trouve valoir 7.
    expect(bandCutoffsWrittenByHand(`const retries = 7`)).toEqual([])
    expect(scoreCutoffsWrittenByHand(`const retries = 7`)).toEqual([])
  })

  /**
   * Le cœur du cliquet D44 : le détecteur voit la valeur qu'on n'attend pas.
   * Une garde qui ne connaît que 7 et 5 laisse passer la SUIVANTE — et la
   * suivante est exactement ce qui s'est produit avec 7,5.
   */
  it('voit une TROISIÈME valeur, pas seulement les deux connues', () => {
    expect(scoreCutoffsWrittenByHand(`WHEN priority_score >= 7.5 THEN 'opportunity'`)).toEqual([
      'priority_score >= 7.5',
    ])
    expect(scoreCutoffsWrittenByHand(`if (score >= 8) return 'chaud'`)).toEqual(['score >= 8'])
    expect(scoreCutoffsWrittenByHand(`if (score < 6.9) return null`)).toEqual(['score < 6.9'])
    expect(scoreCutoffsWrittenByHand(`const OPPORTUNITY_SCORE_MIN = 8`)).toEqual(['OPPORTUNITY_SCORE_MIN = 8'])
  })

  it('ne prend pas un test de PRÉSENCE ni un dénominateur pour une coupure', () => {
    // `> 0` = « il y a un score », la forme même du refus de compter l'absence
    // comme un zéro. Deux fichiers du corpus l'écrivent.
    expect(scoreCutoffsWrittenByHand(`if (score > 0) render()`)).toEqual([])
    // 25 est le dénominateur de la grille /25, pas une coupure du /10.
    expect(scoreCutoffsWrittenByHand(`const SCORE_25_MAX = 25`)).toEqual([])
  })
})

/**
 * CLIQUET D44 — plus AUCUNE coupure de score écrite en dur dans le corpus.
 *
 * L'ancienne borne tolérait « au plus une » coupure fractionnaire dans le
 * service des comptes : la dérive à 7,5 était connue et parquée. Elle est
 * résorbée, la borne est à zéro, et elle ne remonte jamais.
 */
describe('GA-56 — aucune coupure de score n’est écrite en dur', () => {
  it.each(WATCHED)('%s emprunte sa coupure au contrat', file => {
    const found = scoreCutoffsWrittenByHand(readFileSync(file, 'utf8'))
    if (found.length > 0) {
      throw new Error(
        [
          `${file} écrit une coupure de score en dur :`,
          ...found.map(item => `  · ${item}`),
          '',
          'Elle vit dans `packages/contracts/src/schemas/account-score.ts`',
          '(`ACCOUNT_SCORE_GO_MIN` / `ACCOUNT_SCORE_PRUDENT_MIN`, et',
          '`COMMERCIAL_OPPORTUNITY_SCORE_MIN` qui EST le premier), dont l’en-tête',
          'dit que TOUT libellé ou couleur lisant `priority_score` doit passer',
          'par là — sinon un compte PRUDENT s’affiche « GO » sur un écran et',
          '« PRUDENT » sur un autre, et un compte noté 7 se range « À suivre »',
          'pendant qu’il s’affiche « GO » (D44).',
          '',
          'Importe la constante ; garde ton propre nombre de bandes si tu en as',
          'besoin de deux. Une coupure DIFFÉRENTE se décide et se nomme dans le',
          'contrat — elle ne se recopie pas dans un écran.',
        ].join('\n'),
      )
    }
    expect(found).toEqual([])
  })

  it('la coupure du tri commercial EST celle de la bande', () => {
    expect(COMMERCIAL_OPPORTUNITY_SCORE_MIN).toBe(ACCOUNT_SCORE_GO_MIN)
  })
})

/**
 * Les migrations gardent leurs littéraux — mais la liste est CLOSE.
 *
 * C'est la porte par laquelle une troisième valeur pourrait rentrer sans être
 * vue : une migration n'est surveillée par aucun des tests ci-dessus. Elle est
 * donc surveillée ici, dans les deux sens.
 */
describe('GA-56 — une migration fige sa coupure, et elle est nommée', () => {
  it('aucune migration hors liste n’écrit de coupure de score', () => {
    const unexpected = migrationsWritingAScoreCutoff().filter(name => !FROZEN_SCORE_MIGRATIONS.has(name))
    expect(
      unexpected,
      [
        'Ces migrations écrivent une coupure de score sans figurer dans la liste close :',
        ...unexpected.map(name => `  · ${name}`),
        '',
        'Une migration a le droit de figer sa valeur — c’est un fait daté. Mais',
        'elle doit être NOMMÉE ici avec sa raison, sinon une troisième coupure',
        'rentre par la porte que personne ne regarde (c’est ainsi que 7,5 est',
        'né et a vécu).',
      ].join('\n'),
    ).toEqual([])
  })

  it('aucune entrée de la liste n’est périmée', () => {
    const writing = new Set(migrationsWritingAScoreCutoff())
    for (const [name, reason] of FROZEN_SCORE_MIGRATIONS) {
      expect(existsSync(join(MIGRATIONS, name)), `migration listée introuvable : ${name}`).toBe(true)
      expect(writing.has(name), `${name} n’écrit plus de coupure : retire-la de la liste (${reason})`).toBe(true)
    }
  })
})
