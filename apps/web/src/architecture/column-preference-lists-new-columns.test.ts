import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Un tableau qui PERSISTE le choix de ses colonnes réinjecte celles qui sont nées depuis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET COMMENT LE DÉFAUT A ÉTÉ TROUVÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 04/09/2026, `/missions` a reçu une colonne « Prochaine action », inscrite
 * dans les colonnes par défaut sous un commentaire disant : « une colonne
 * d'action livrée MASQUÉE est exactement le défaut qu'on répare ».
 *
 * Elle était invisible en production. Le choix de colonnes est une PRÉFÉRENCE
 * PERSISTÉE, et une préférence enregistrée avant que la colonne existe ne la
 * contient pas : le lecteur rendait la liste stockée telle quelle. La colonne
 * n'atteignait donc **personne ayant déjà ouvert l'écran** — c'est-à-dire tous
 * les bêta-testeurs, précisément ceux qui l'avaient demandée.
 *
 * Mesuré à la recette : 11 colonnes au sélecteur, aucune « Prochaine action »,
 * 8 cellules de risque sans un seul élément cliquable. Les 7 216 tests étaient
 * verts — aucun ne part d'un stockage ANCIEN, et c'est la seule condition qui
 * produit le défaut.
 *
 * ⚠️ Le défaut n'est pas propre aux missions : trois écrans persistent un choix
 * de colonnes, de la même façon. Cette garde les tient tous les trois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Que chaque hook de préférence de colonnes passe sa liste stockée par
 * `mergeAddedColumns`, et que le fichier de colonnes correspondant déclare une
 * liste d'AJOUTS — même vide, parce qu'une liste vide déclarée est une décision
 * (« rien n'a été ajouté depuis »), là où une liste absente est un oubli.
 *
 * ⚠️ Ce qu'elle NE peut PAS vérifier : qu'on ait pensé à INSCRIRE la colonne
 * dans la liste le jour où on l'ajoute. Aucun test sans historique ne le peut —
 * il faudrait comparer à une version antérieure du fichier. La garde rend le
 * geste visible et nommé ; elle ne le rend pas automatique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (rejouée à l'écriture)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Retiré `mergeAddedColumns` de `useMissionColumns.ts` → ROUGE, en nommant le
 *   hook.
 * · Retiré `MISSION_COLUMNS_ADDED_SINCE` de `columns.ts` → ROUGE sur la
 *   déclaration.
 * · Pointé `SCREENS` sur un fichier inexistant → ROUGE sur « la garde LIT ses
 *   sources », avant toute autre assertion.
 */

const WEB = join(__dirname, '..')

type Screen = {
  /** Ce que l'utilisateur perd si la réinjection saute. */
  what: string
  hook: string
  columns: string
  addedList: string
}

const SCREENS: Screen[] = [
  {
    what: 'la liste des missions — une colonne d’action neuve n’atteindrait aucun bêta-testeur',
    hook: join(WEB, 'features', 'missions', 'useMissionColumns.ts'),
    columns: join(WEB, 'features', 'missions', 'columns.ts'),
    addedList: 'MISSION_COLUMNS_ADDED_SINCE',
  },
  {
    what: 'le suivi des missions — même forme, même stockage, même défaut en attente',
    hook: join(WEB, 'features', 'mission-tracking', 'useMissionTrackingColumns.ts'),
    columns: join(WEB, 'features', 'mission-tracking', 'columns.ts'),
    addedList: 'MISSION_TRACKING_COLUMNS_ADDED_SINCE',
  },
  {
    what: 'les paiements — même forme, même stockage, même défaut en attente',
    hook: join(WEB, 'features', 'payments', 'usePaymentColumns.ts'),
    columns: join(WEB, 'features', 'payments', 'columns.ts'),
    addedList: 'PAYMENT_COLUMNS_ADDED_SINCE',
  },
]

describe('un choix de colonnes persisté réinjecte les colonnes nées depuis', () => {
  const sources = SCREENS.map(screen => ({
    screen,
    hook: readFileSync(screen.hook, 'utf8'),
    columns: readFileSync(screen.columns, 'utf8'),
  }))

  // Une garde qui ne lit rien est verte sur du vide. Ce test-ci passe AVANT.
  it('LIT ses trois écrans, et chacun persiste bien un choix', () => {
    expect(sources).toHaveLength(3)
    for (const { hook, columns } of sources) {
      expect(hook.length).toBeGreaterThan(500)
      expect(columns.length).toBeGreaterThan(300)
      // Sans stockage, il n'y a pas de préférence ancienne, donc pas de défaut.
      expect(hook).toContain('localStorage')
    }
  })

  it.each(sources.map(s => [s.screen.what, s] as const))(
    '%s — le lecteur passe par mergeAddedColumns',
    (_what, entry) => {
      expect(entry.hook).toContain('mergeAddedColumns(')
      expect(entry.hook).toContain(entry.screen.addedList)
    },
  )

  it.each(sources.map(s => [s.screen.what, s] as const))(
    '%s — la liste d’ajouts est DÉCLARÉE, même vide',
    (_what, entry) => {
      // Une liste vide déclarée est une décision (« rien n'a été ajouté
      // depuis ») ; une liste absente est un oubli.
      expect(entry.columns).toContain(`export const ${entry.screen.addedList}`)
    },
  )

  // La preuve qu'elle sait dire NON, jouée sur une version MUTÉE du vrai source.
  it.each(sources.map(s => [s.screen.what, s] as const))(
    '%s — sait dire NON : le lecteur privé de la réinjection est refusé',
    (_what, entry) => {
      const mutated = entry.hook.split('mergeAddedColumns(').join('canonicalOnly(')
      expect(mutated).not.toContain('mergeAddedColumns(')
    },
  )
})
