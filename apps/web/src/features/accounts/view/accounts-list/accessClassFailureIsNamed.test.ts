/**
 * GA-179 (N21 du 30/08) — une PANNE de lecture de l'accessibilité ne se lit
 * plus comme un compte sans classe.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT D'ORIGINE
 * ─────────────────────────────────────────────────────────────────────────
 * `GET /accounts/access-summary` a répondu 500 en production. Sur l'écran, la
 * colonne « Accessibilité » a affiché « — » pour CHAQUE compte — exactement
 * ce qu'elle affiche quand aucun compte n'a de barrière calculée. Impossible
 * de distinguer une panne d'un vide depuis l'écran ; le défaut n'a été trouvé
 * qu'en interrogeant le réseau à la main.
 *
 * Cause : `AccountContent.tsx` fusionnait avec `Array.isArray(summary)` — sur
 * n'importe quel échec, `data` vaut `undefined`, non-tableau, et CHAQUE
 * compte recevait `accessClass: null` en silence. `useAccessSummary` exposait
 * pourtant déjà `isError` (c'est un `useQuery` ordinaire) ; personne ne le
 * lisait.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE VÉRIFIE, ET POURQUOI CES DEUX CHOSES PRÉCISÉMENT
 * ─────────────────────────────────────────────────────────────────────────
 * Elle lit le SOURCE de `AccountTableRow.tsx` (jamais son rendu — un rendu ne
 * dit pas d'OÙ vient la valeur qui l'a produit) et vérifie deux propriétés,
 * chacune corrigeant une façon RÉELLE de réintroduire le défaut :
 *
 *  1. **La branche d'échec est câblée sur `useAccessSummary().isError`**, pas
 *     sur une constante ni sur une redérivation locale (`!Array.isArray(...)`,
 *     qui est EXACTEMENT le bug d'origine). Un futur refactor qui remplace
 *     `const { isError: accessSummaryFailed } = useAccessSummary()` par
 *     `const accessSummaryFailed = false` — ou qui l'enlève — doit rougir.
 *  2. **La branche d'échec et la branche « non estimée » utilisent des CLÉS
 *     i18n DIFFÉRENTES** (`list.accessClassFailed` vs `list.accessClassUnknown`).
 *     Rien n'empêche techniquement de les fusionner en un seul texte — c'est
 *     précisément ce qui s'est produit à l'origine (les deux cas rendaient le
 *     MÊME tiret) — donc la garde l'interdit explicitement.
 *
 * Les deux preuves exigées d'une garde (CLAUDE.md) :
 *  · elle SAIT DIRE NON → `describe('le détecteur…')`, sur des extraits
 *    synthétiques qui reproduisent chaque façon de réintroduire le défaut ;
 *  · elle LIT quelque chose → `describe('le corpus…')`, sur le VRAI fichier,
 *    avec une assertion de taille pour qu'un fichier vidé ne passe pas au vert.
 */
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROW_FILE = join(__dirname, 'AccountTableRow.tsx')

type Verdict = {
  /** La cellule a-t-elle une branche `accessSummaryFailed ? … : …` ? */
  hasFailureBranch: boolean
  /** Cette branche est-elle dérivée de `useAccessSummary().isError`, et non
   *  d'une constante ou d'une redérivation locale ? */
  failureIsDerivedFromIsError: boolean
  /** Les deux textes « la lecture a échoué » et « non estimée » sont-ils
   *  DEUX clés i18n différentes ? */
  usesDistinctFailureKey: boolean
}

/** Le verdict de la garde sur un extrait de source (le vrai fichier, ou un cas synthétique). */
function inspectAccessClassCell(source: string): Verdict {
  return {
    hasFailureBranch: /accessSummaryFailed\s*\?/.test(source),
    failureIsDerivedFromIsError: /const\s*\{\s*isError:\s*accessSummaryFailed\s*\}\s*=\s*useAccessSummary\(\)/.test(
      source,
    ),
    usesDistinctFailureKey:
      /t\(\s*'list\.accessClassFailed'/.test(source) && /t\(\s*'list\.accessClassUnknown'/.test(source),
  }
}

const OK: Verdict = { hasFailureBranch: true, failureIsDerivedFromIsError: true, usesDistinctFailureKey: true }

describe('GA-179 — le détecteur sait dire NON', () => {
  it('accepte le câblage attendu', () => {
    const good = `
      const { isError: accessSummaryFailed } = useAccessSummary()
      // …
      {accessSummaryFailed ? (
        <Text title={t('list.accessClassFailed')}>{t('list.accessClassFailedShort')}</Text>
      ) : row.accessClass ? (
        <Badge>{t(\`list.accessClass.\${row.accessClass}\`, row.accessClass)}</Badge>
      ) : (
        <Text title={t('list.accessClassUnknown')}>-</Text>
      )}
    `
    expect(inspectAccessClassCell(good)).toEqual(OK)
  })

  it('refuse le défaut d’origine : DEUX états au lieu de trois (aucune branche d’échec)', () => {
    const twoStatesOnly = `
      {row.accessClass ? (
        <Badge>{t(\`list.accessClass.\${row.accessClass}\`, row.accessClass)}</Badge>
      ) : (
        <Text title={t('list.accessClassUnknown')}>-</Text>
      )}
    `
    expect(inspectAccessClassCell(twoStatesOnly).hasFailureBranch).toBe(false)
  })

  it('refuse une branche d’échec qui redérive la panne au lieu de lire `isError`', () => {
    // Exactement le bug d'origine, déplacé dans la cellule : re-décider
    // localement plutôt que de lire l'état de la requête.
    const redderived = `
      const accessSummaryFailed = !Array.isArray(accessSummary.data)
      {accessSummaryFailed ? (
        <Text title={t('list.accessClassFailed')}>{t('list.accessClassFailedShort')}</Text>
      ) : row.accessClass ? (
        <Badge>{t(\`list.accessClass.\${row.accessClass}\`, row.accessClass)}</Badge>
      ) : (
        <Text title={t('list.accessClassUnknown')}>-</Text>
      )}
    `
    expect(inspectAccessClassCell(redderived).failureIsDerivedFromIsError).toBe(false)
  })

  it('refuse une branche d’échec câblée sur une constante', () => {
    const hardcoded = `
      const accessSummaryFailed = false
      {accessSummaryFailed ? (
        <Text title={t('list.accessClassFailed')}>{t('list.accessClassFailedShort')}</Text>
      ) : row.accessClass ? (
        <Badge>{t(\`list.accessClass.\${row.accessClass}\`, row.accessClass)}</Badge>
      ) : (
        <Text title={t('list.accessClassUnknown')}>-</Text>
      )}
    `
    expect(inspectAccessClassCell(hardcoded).failureIsDerivedFromIsError).toBe(false)
  })

  it('refuse la fusion des deux textes sous une seule clé — le défaut d’origine, exactement', () => {
    // La panne ET le vide rendent le MÊME texte : sur l'écran, plus aucune
    // différence — c'est très exactement ce que la production a montré.
    const mergedKey = `
      const { isError: accessSummaryFailed } = useAccessSummary()
      {accessSummaryFailed ? (
        <Text title={t('list.accessClassUnknown')}>-</Text>
      ) : row.accessClass ? (
        <Badge>{t(\`list.accessClass.\${row.accessClass}\`, row.accessClass)}</Badge>
      ) : (
        <Text title={t('list.accessClassUnknown')}>-</Text>
      )}
    `
    expect(inspectAccessClassCell(mergedKey).usesDistinctFailureKey).toBe(false)
  })
})

describe('GA-179 — le corpus lu par la garde', () => {
  it('lit réellement AccountTableRow.tsx — un fichier vidé ferait rougir cette assertion, pas passer la garde au vert', () => {
    const size = statSync(ROW_FILE).size
    // Le fichier entier fait plusieurs dizaines de Ko : un corpus qui se
    // viderait (fichier renommé, cellule retirée) tomberait largement en
    // dessous. Ancrage volontairement large plutôt qu'exact, pour ne pas
    // casser sur chaque édition sans rapport avec cette cellule.
    expect(size).toBeGreaterThan(5_000)
  })
})

describe('GA-179 — AccountTableRow.tsx nomme réellement la panne', () => {
  it('le fichier réel passe les trois vérifications', () => {
    const source = readFileSync(ROW_FILE, 'utf8')
    expect(inspectAccessClassCell(source)).toEqual(OK)
  })
})
