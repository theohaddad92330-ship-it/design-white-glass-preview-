import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Aucun workflow ne cloue son exécuteur à `ubuntu-latest`.
 *
 * Les runners hébergés par GitHub sont coupés sur ce dépôt : l'enveloppe de
 * minutes est dépassée, et un job qui les demande échoue AVANT sa première
 * étape — sans log, sans message, avec un simple « failure » dans la liste.
 *
 * `ci.yml` est passé à `vars.CI_RUNS_ON` le 24/08/2026. `uptime.yml` et
 * `upstream-contracts.yml` ne l'ont pas suivi, et personne ne l'a vu : ils sont
 * hors de la porte `CI Status`, donc aucune PR n'a jamais été bloquée par eux.
 * Résultat mesuré le 27/08 — la sonde de disponibilité échouait toutes les dix
 * minutes depuis TROIS JOURS, et le contrôle quotidien des contrats fournisseurs
 * depuis autant. La production pouvait tomber sans que personne soit prévenu :
 * c'est précisément le travail que ces deux fichiers étaient censés faire.
 *
 * La forme attendue laisse le repli intact — variable vide ⇒ retour chez GitHub,
 * sans toucher au fichier. C'est ce qui rend l'interrupteur utilisable le jour
 * où les runners auto-hébergés tombent.
 */
describe("GA — un workflow ne cloue pas son exécuteur (l'interrupteur reste un réglage)", () => {
  const DIR = resolve(__dirname, '../../../../.github/workflows')
  const FORME_ATTENDUE = "runs-on: ${{ vars.CI_RUNS_ON || 'ubuntu-latest' }}"
  // Seule autre forme admise (05/10/2026) : le routage Web vers les runners rapides.
  // Elle passe par une variable ET garde le repli — variable vide ⇒ flotte entière
  // (`CI_RUNS_ON`), puis GitHub. Un `runs-on` en dur ne passe toujours pas.
  const FORME_WEB =
    "runs-on: ${{ vars.CI_RUNS_ON_WEB && fromJSON(vars.CI_RUNS_ON_WEB) || vars.CI_RUNS_ON || 'ubuntu-latest' }}"
  // Routage API (31/10/2026) : `CI_RUNS_ON_API`, puis le routage Web, puis `CI_RUNS_ON`. Même règle :
  // une variable ET le repli jusqu'à GitHub — jamais un `runs-on` en dur.
  const FORME_API =
    "runs-on: ${{ vars.CI_RUNS_ON_API && fromJSON(vars.CI_RUNS_ON_API) || vars.CI_RUNS_ON_WEB && fromJSON(vars.CI_RUNS_ON_WEB) || vars.CI_RUNS_ON || 'ubuntu-latest' }}"

  /**
   * Exceptions NOMMÉES (aucune aujourd'hui). La seule qui a existé,
   * le workflow de mise à l'échelle (qui remontait l'ancienne flotte Railway),
   * a été supprimée le 05/10/2026. Une exception se NOMME ici plutôt qu'elle
   * ne se déduit ; les tests ci-dessous vérifient qu'elle désigne un fichier
   * qui existe, et exigent la forme clouée `runs-on: ubuntu-latest`.
   */
  const HORS_FLOTTE = new Map<string, string>()

  const files = readdirSync(DIR).filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))

  it('lit un corpus réel — sinon la garde est borgne', () => {
    // Une garde qui balaie un dossier vide passe au vert sans rien vérifier.
    expect(files.length).toBeGreaterThanOrEqual(3)
    expect(files).toContain('ci.yml')
    expect(files).toContain('uptime.yml')
    expect(files).toContain('upstream-contracts.yml')

    // Et le corpus contient bien des déclarations d'exécuteur à vérifier.
    const total = files.reduce(
      (n, name) => n + (readFileSync(resolve(DIR, name), 'utf8').match(/^\s*runs-on:/gm)?.length ?? 0),
      0,
    )
    expect(total).toBeGreaterThanOrEqual(10)
  })

  it('chaque exemption DÉSIGNE un fichier qui existe', () => {
    // Une exemption qui nomme un fichier disparu (renommé, supprimé) n'exempte
    // plus rien mais reste écrite : le prochain lecteur croit la règle trouée
    // là où elle ne l'est pas, et surtout personne ne remarque qu'une exception
    // a survécu à sa raison.
    for (const name of HORS_FLOTTE.keys()) {
      expect(files).toContain(name)
    }
    // Et elle reste une EXCEPTION : si elle couvrait la moitié du dossier, la
    // règle ne garderait plus rien.
    expect(HORS_FLOTTE.size).toBeLessThan(files.length / 2)
  })

  it.each(files)('%s — chaque `runs-on` passe par `vars.CI_RUNS_ON`', name => {
    const lines = readFileSync(resolve(DIR, name), 'utf8')
      .split('\n')
      .filter(line => /^\s*runs-on:/.test(line))
      .map(line => line.trim())

    if (HORS_FLOTTE.has(name)) {
      // L'exception ne se contente pas de sauter le fichier : elle exige la
      // forme clouée. Sinon le jour où quelqu'un y remettrait `vars.CI_RUNS_ON`
      // — ce qui est le geste NATUREL, puisque c'est la règle partout ailleurs —
      // l'interblocage reviendrait sans qu'aucun test ne le dise.
      expect(lines).toEqual(['runs-on: ubuntu-latest'])
      return
    }

    const cloues = lines.filter(line => line !== FORME_ATTENDUE && line !== FORME_WEB && line !== FORME_API)
    expect(cloues).toEqual([])
  })
})
