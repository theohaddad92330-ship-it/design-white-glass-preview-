import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1417.1 / #1417.7 — ON REPLIE DE L'ADMINISTRATIF, JAMAIS UNE QUALIFICATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE PIÈGE QUE CETTE GARDE EXISTE POUR TENIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour demande de la PLACE : « réduire les textes administratifs », « les
 * informations secondaires passent en tooltip/drawer ». Il ne demande pas de
 * dé-qualifier des chiffres — et c'est pourtant la façon la plus simple de
 * gagner de la place. Le dépôt tient depuis des mois que « non mesuré » n'est
 * jamais « 0 » et qu'un chiffre nu se lit comme une vérité entière : un écran
 * qui retire la qualification annule tout ce travail d'un coup de ciseaux.
 *
 * La question à poser devant chaque texte qu'on veut sortir du flux est
 * TOUJOURS la même : **si je l'enlève, le chiffre à côté reste-t-il VRAI ?**
 *
 *   · le libellé NAF entier ....... ne qualifie aucun chiffre → se replie
 *   · la tranche d'effectif ....... ne qualifie aucun chiffre → se replie
 *   · l'étape du pipe ............. ne qualifie aucun chiffre → se replie
 *   · la DATE de dernière analyse . dit si le score et le signal peuvent être
 *                                   périmés → RESTE dans le flux
 *   · « À rafraîchir » ............ même chose, en plus lisible → RESTE
 *   · le score et ses axes ........ la mesure elle-même → RESTE
 *   · la classe d'accessibilité ... et ses TROIS états (dont la panne) → RESTE
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE GARDE DE SOURCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que la règle porte sur l'ENDROIT où une chose est rendue — dans le flux
 * de la ligne, ou derrière un geste — et que jsdom ne met rien en page : rien
 * dans un rendu ne distingue « visible » de « replié » autrement que par le
 * geste qui l'ouvre. Ce que la CI peut lire honnêtement, c'est QUI rend quoi.
 *
 * ⚠️ Les commentaires sont RETIRÉS avant toute lecture. C'est la leçon de
 * GA-255, payée deux fois : une garde qui lit le récit du défaut dans un
 * docblock reste verte pendant que la cible a disparu, et celle d'à côté
 * (`accountRowSecondLineIsFull`) comptait 4 prétendants là où il y en avait 2
 * parce que sa propre justification contenait les mots qu'elle cherchait.
 */

const ROW = join(__dirname, 'AccountTableRow.tsx')
const FOLD = join(__dirname, 'AccountRowFacts.tsx')

/** Le code SEUL : les commentaires de bloc du JSX, ceux de TypeScript et les
 *  lignes en double barre sont retirés AVANT toute lecture. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('la garde lit un corpus réel — sinon elle est borgne', () => {
  it('les deux fichiers existent et portent du code une fois les commentaires retirés', () => {
    expect(code(ROW).length).toBeGreaterThan(3_000)
    expect(code(FOLD).length).toBeGreaterThan(800)
  })

  it('elle voit bien le repli depuis la ligne, et le déclencheur depuis le repli', () => {
    expect(code(ROW)).toContain('<AccountRowFacts')
    expect(code(FOLD)).toContain('data-testid="account-facts-trigger"')
  })
})

describe('ce qui QUALIFIE un chiffre reste dans le flux de la ligne', () => {
  it('la date de dernière analyse est rendue par la LIGNE, pas par le repli', () => {
    // C'est la `Provenance` du score et du signal : « information de mars 2026,
    // à revérifier » n'existe pas sans elle.
    expect(code(ROW)).toContain('formatShortDate(new Date(analyzedOn))')
    expect(code(FOLD)).not.toContain('formatShortDate')
  })

  it('« À rafraîchir » est rendu par la LIGNE — un score périmé le DIT sur la ligne', () => {
    expect(code(ROW)).toContain('data-testid="account-stale-badge"')
    expect(code(FOLD)).not.toContain('stale')
  })

  it('la décision d’équipe, le verdict et la classe d’accessibilité gardent leur colonne', () => {
    const ligne = code(ROW)
    expect(ligne).toContain('<AccountDecisionCell')
    expect(ligne).toContain('row.accessClass')
    // Les TROIS états de l'accessibilité (GA-179) — une panne de lecture ne se
    // raconte pas comme une absence de barrière.
    expect(ligne).toContain('accessSummaryFailed')
    const repli = code(FOLD)
    expect(repli).not.toContain('ScoreCircle')
    expect(repli).not.toContain('AccountListScore')
    expect(repli).not.toContain('accessClass')
    expect(repli).not.toContain('priority_score')
  })

  it('le signal dominant et sa fraîcheur restent sur la ligne', () => {
    expect(code(ROW)).toContain('<SignalPreview')
    expect(code(FOLD)).not.toContain('primary_signal')
    expect(code(FOLD)).not.toContain('signal')
  })
})

describe('ce qui se replie est ADMINISTRATIF, et il se replie VRAIMENT', () => {
  it('le repli porte les trois faits, chacun nommé par son intitulé', () => {
    const repli = code(FOLD)
    expect(repli).toContain("t('table.sector')")
    expect(repli).toContain("t('table.employees')")
    expect(repli).toContain("t('table.commercialStatus')")
  })

  it('la ligne ne les rend plus elle-même — sinon ils seraient à deux endroits', () => {
    const ligne = code(ROW)
    expect(ligne).not.toContain('data-testid="account-employees"')
    expect(ligne).not.toContain('data-testid="account-sector"')
    expect(ligne).not.toContain('commercialStatus.${')
  })

  it('le repli n’invente jamais une valeur absente — aucun repli sur « 0 »', () => {
    const repli = code(FOLD)
    expect(repli).not.toMatch(/\?\?\s*0\b/)
    expect(repli).not.toMatch(/\|\|\s*0\b/)
    expect(repli).not.toMatch(/'—'|"—"/)
  })

  it('le déclencheur se tabule et ne range rien dans un `title=` (GA-35)', () => {
    const repli = code(FOLD)
    expect(repli).toContain('type="button"')
    // « la donnée rangée dans un attribut title » : un `title` n'existe ni au
    // clavier ni au doigt. Le repli est une porte, pas une infobulle native.
    expect(repli).not.toMatch(/\btitle=\{/)
    // Et le nom accessible CONTIENT le texte visible (patron #1866) : un
    // `aria-label` l'aurait remplacé.
    expect(repli).not.toMatch(/aria-label=/)
    expect(repli).toContain('sr-only')
  })
})
