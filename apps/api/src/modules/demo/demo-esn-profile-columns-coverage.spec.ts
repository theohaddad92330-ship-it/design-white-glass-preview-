import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { esnAnswersSchema } from '@bellum/contracts'
import { DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE, DEMO_ESN_PROFILE_SEEDED_COLUMNS } from './demo-coverage'
import { DEMO_ESN_PROFILE } from './demo-dataset'

/**
 * Lot « la parité démo du questionnaire, et la garde qui ne la voyait pas »
 * (15/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER, ET PAS `demo-coverage.spec.ts`
 * ─────────────────────────────────────────────────────────────────────────────
 * `demo-coverage.spec.ts` raisonne au niveau TABLE (`DEMO_SEEDED_TABLES`) :
 * `esn_profiles` y est classée SEEDÉE, et elle l'est — dix colonnes sur cent
 * quatre l'étaient déjà. Une table remplie ne dit rien de la RÉPARTITION de ce
 * qu'elle contient (même motif que la maille des colonnes du kanban des
 * besoins et la fiche contact, juste au-dessus dans `demo-coverage.ts`) :
 * trente-sept colonnes ou plus, ajoutées par les lots L15, L19, #2054 et #2055,
 * restaient vides pendant que la garde de tête de fichier restait VERTE.
 * Conséquence mesurée : `Réglages › Profil` rendait une fiche presque vide en
 * démonstration publique.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE PROUVE (doctrine « une garde protège une règle, elle ne
 * l'invente pas », `CLAUDE.md`)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Qu'elle LIT quelque chose : `esnProfileColumnNames()` lit
 *    `esn-profile.entity.ts` sur le disque, jamais une liste recopiée à la
 *    main (GA-26 — deux listes divergent) ; « le corpus n'est pas vide » est
 *    testé explicitement.
 * 2. Qu'elle sait dire NON : `uncoveredEsnProfileColumns` est une fonction
 *    PURE, testée sur une entrée SYNTHÉTIQUE qui retire une colonne du semis —
 *    le rouge NOMME la colonne manquante, sans toucher au vrai jeu de données.
 * 3. Qu'elle n'attrape pas ce qu'elle ne vise pas : une colonne légitimement
 *    vide à dessein (jamais remplie dans `DEMO_ESN_PROFILE`) ne fait PAS
 *    rougir la garde, parce qu'elle porte sa raison dans
 *    `DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE`.
 */

/** Noms des colonnes de `esn_profiles`, lus sur l'entité — pour qu'une colonne
 *  AJOUTÉE demain ne puisse pas passer sous le radar de la couverture. Même
 *  méthode que `contactColumnNames()` (`demo-contact-profile.spec.ts`). */
function esnProfileColumnNames(): string[] {
  const source = readFileSync(join(__dirname, '..', '..', 'database', 'entities', 'esn-profile.entity.ts'), 'utf8')
  const names: string[] = []
  const decorator = /@(?:Primary(?:Generated)?Column|Column|CreateDateColumn|UpdateDateColumn)\b/
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (!decorator.test(lines[i]!)) continue
    // La propriété suit le décorateur, éventuellement après la suite d'un
    // objet d'options multi-lignes ou un commentaire.
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j += 1) {
      const property = /^ {2}([a-z_][a-z0-9_]*)[?!]?:/.exec(lines[j]!)
      if (property) {
        names.push(property[1]!)
        break
      }
    }
  }
  return names
}

/** `true` quand `DEMO_ESN_PROFILE` porte une valeur RÉELLE pour cette colonne
 *  — une chaîne vide ou un tableau vide ne compte pas : l'écran les lirait
 *  comme une absence (« non mesuré n'est jamais 0 », GA-18/GA-19). */
function filledInDemoProfile(column: string): boolean {
  const value = (DEMO_ESN_PROFILE as Record<string, unknown>)[column]
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

/**
 * La fonction de couverture — PURE, prenant `isFilled` en paramètre plutôt que
 * de lire `DEMO_ESN_PROFILE` directement : c'est ce qui la rend testable sur
 * une entrée synthétique (« sait dire NON », plus bas) sans dépendre du
 * contenu réel du jeu de données.
 */
function uncoveredEsnProfileColumns(
  columns: readonly string[],
  isFilled: (column: string) => boolean,
  notApplicable: Readonly<Record<string, string>>,
): string[] {
  return columns.filter(column => !isFilled(column) && !(column in notApplicable))
}

describe('couverture des colonnes de `esn_profiles` en démonstration', () => {
  it('le corpus de colonnes n’est pas vide — la garde LIT vraiment l’entité', () => {
    // Cent quatre colonnes mesurées le 15/09/2026 (dix de cadrage historique +
    // quatre-vingt-quatorze ajoutées depuis). Un seuil, pas une égalité stricte :
    // une colonne ajoutée demain ne doit pas casser CE test-ci, seulement celui
    // qui classe chaque colonne, plus bas.
    expect(esnProfileColumnNames().length).toBeGreaterThan(100)
  })

  it('classe CHAQUE colonne de `esn_profiles` : seedée, ou vide à dessein avec sa raison', () => {
    const gaps = uncoveredEsnProfileColumns(
      esnProfileColumnNames(),
      filledInDemoProfile,
      DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE,
    )

    // Si ce test échoue, une colonne de `esn_profiles` est apparue sans qu'on
    // ait dit ce que la démonstration en fait. Deux issues, jamais une
    // troisième : la seeder dans `DEMO_ESN_PROFILE`, ou la déclarer vide à
    // dessein dans `DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE` avec sa raison —
    // jamais en y déplaçant une colonne seulement pour faire passer ce test
    // (craft rule n°9, `CLAUDE.md`).
    expect(gaps).toEqual([])
  })

  it('sait dire NON — une colonne retirée du semis est NOMMÉE dans le rouge', () => {
    // Entrée SYNTHÉTIQUE : `esn_name` est réellement seedé (voir le test
    // ci-dessus, vert), mais cette fonction locale prétend le contraire. La
    // garde doit le NOMMER, sans qu'on ait touché à `DEMO_ESN_PROFILE`.
    expect(filledInDemoProfile('esn_name')).toBe(true)
    const withEsnNameMissing = (column: string): boolean => column !== 'esn_name' && filledInDemoProfile(column)

    const gaps = uncoveredEsnProfileColumns(
      esnProfileColumnNames(),
      withEsnNameMissing,
      DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE,
    )

    expect(gaps).toContain('esn_name')
  })

  it('n’attrape pas ce qu’elle ne vise pas — une colonne légitimement vide à dessein ne la fait pas rougir', () => {
    // Témoin : `known_competitors` n'est JAMAIS rempli dans `DEMO_ESN_PROFILE`
    // (colonne sans aucun lecteur produit) — c'est un vrai cas vide, pas une
    // fixture inventée pour le test.
    expect(filledInDemoProfile('known_competitors')).toBe(false)
    expect(DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE).toHaveProperty('known_competitors')

    const gaps = uncoveredEsnProfileColumns(
      esnProfileColumnNames(),
      filledInDemoProfile,
      DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE,
    )

    // La colonne est bien vide, et pourtant la garde ne la nomme pas : elle
    // n'attrape que ce qu'elle vise (une colonne SANS raison écrite).
    expect(gaps).not.toContain('known_competitors')
  })

  it('ne garde pas de classement périmé — une colonne supprimée de l’entité mentirait sur la couverture', () => {
    const columns = new Set(esnProfileColumnNames())
    const stale = [...DEMO_ESN_PROFILE_SEEDED_COLUMNS, ...Object.keys(DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE)].filter(
      column => !columns.has(column),
    )
    expect(stale).toEqual([])
  })

  it('ne classe jamais une colonne deux fois', () => {
    const seeded = new Set<string>(DEMO_ESN_PROFILE_SEEDED_COLUMNS)
    const notApplicable = Object.keys(DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE)
    expect(notApplicable.filter(column => seeded.has(column))).toEqual([])
  })

  it('exige une raison NON VIDE pour chaque colonne déclarée vide à dessein', () => {
    for (const reason of Object.values(DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE)) {
      // Un mot (« inutile ») ne se relit pas six mois plus tard.
      expect(reason.length).toBeGreaterThan(30)
    }
  })

  it('ne justifie pas une absence qui n’en est plus une — une colonne « vide à dessein » réellement remplie mentirait', () => {
    const contradictory = Object.keys(DEMO_ESN_PROFILE_COLUMNS_NOT_APPLICABLE).filter(filledInDemoProfile)
    expect(contradictory).toEqual([])
  })

  it('DEMO_ESN_PROFILE est un sous-ensemble VALIDE du contrat `esnAnswersSchema`', () => {
    // Sanity check de forme : chaque valeur seedée doit être du type que le
    // contrat attend réellement (une chaîne où le contrat attend une chaîne,
    // un tableau où il attend un tableau) — une valeur plausible mais mal
    // formée rendrait l'écran « non établi » en silence, vert ici, vide devant
    // un prospect.
    const parsed = esnAnswersSchema.partial().safeParse(DEMO_ESN_PROFILE)
    expect(parsed.success).toBe(true)
  })
})
