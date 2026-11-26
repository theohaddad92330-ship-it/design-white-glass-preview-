import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * GA — tout job de vérification est DANS la porte `CI Status`, aux deux endroits.
 *
 * `CI Status` est la cible de la protection de branche : c'est le seul verdict
 * que GitHub regarde. Un job absent de sa liste tourne, s'affiche rouge dans la
 * PR, et la porte passe quand même au vert. Personne ne le voit, parce que tout
 * le monde lit la porte.
 *
 * TROIS FOIS que ce dépôt paie exactement ça :
 *  · `test-web` — 312 fichiers de test dans `needs:` mais absents de la liste
 *    `results`. Rouges pendant des semaines, sans effet ; l'un d'eux disait
 *    qu'aucun PDF exporté ne portait de plan d'action.
 *  · `test-site` — 359 tests que rien ne lançait jusqu'au 27/08.
 *  · `test-backoffice` — 124 fichiers source sans aucune suite jusqu'au 06/09.
 *
 * Le commentaire dans `ci.yml` dit déjà « l'ajouter aux DEUX endroits ». Un
 * commentaire n'a arrêté aucune des trois fois. Une garde, si.
 *
 * CE QU'ELLE VÉRIFIE, ET POURQUOI CETTE FORME
 * Elle part des jobs RÉELLEMENT déclarés dans `ci.yml` — pas d'une liste écrite
 * à la main, qui ne verrait jamais ce qui n'y est pas (c'est la garde de
 * navigation du produit client, qui comparait à une liste et laissait un écran
 * inatteignable pendant des mois). Tout job sauf la porte elle-même et le job
 * de portée doit apparaître aux DEUX endroits.
 */
describe('GA — la porte CI Status garde tous les jobs de la CI', () => {
  const CI = resolve(__dirname, '../../../../.github/workflows/ci.yml')
  const contenu = readFileSync(CI, 'utf8')

  /**
   * Les jobs déclarés, avec leur corps : une clé à deux espaces d'indentation,
   * jusqu'à la clé suivante au même niveau.
   */
  const decouperEnJobs = (source: string): { nom: string; corps: string }[] => {
    const noms = [...source.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)]
    return noms.map((m, i) => ({
      nom: m[1],
      corps: source.slice(m.index ?? 0, noms[i + 1]?.index ?? source.length),
    }))
  }

  const blocs = decouperEnJobs(contenu)
  const jobs = blocs.map(b => b.nom)

  /**
   * Un job marqué `continue-on-error: true` est déclaré CONSULTATIF par son
   * auteur : il rend un avis, il ne bloque pas. L'exiger dans la porte
   * reviendrait à annuler ce choix depuis un test, et une garde ne réécrit pas
   * la règle qu'elle protège — elle la tient.
   *
   * ⚠️ L'exemption est MESURÉE plus bas, pas seulement écrite : une exception
   * qui ne correspond à rien est un saut silencieux, et c'est comme ça qu'une
   * garde devient borgne sans que personne le voie.
   */
  const consultatifsDe = (source: string): string[] =>
    decouperEnJobs(source)
      .filter(b => /^\s+continue-on-error:\s*true\s*$/m.test(b.corps))
      .map(b => b.nom)

  const consultatifs = consultatifsDe(contenu)

  /** Le bloc `needs: [...]` de la porte. */
  const needs = (() => {
    const bloc = contenu.match(/^ {2}ci-status:[\s\S]*?needs:\s*\n?\s*\[([\s\S]*?)\]/m)
    if (!bloc) return []
    return bloc[1]
      .split(',')
      .map(nom => nom.trim())
      .filter(Boolean)
  })()

  /** Les `needs.<job>.result` cités dans le tableau `results` de la porte. */
  const evalues = [...contenu.matchAll(/needs\.([a-z][a-z0-9-]*)\.result/g)].map(m => m[1])

  /**
   * La porte ne s'attend pas elle-même. `suite-complete-rouge` ne tourne JAMAIS sur une PR (elle ouvre
   * l'issue `ci-main-rouge` quand la suite complète est rouge sur main) : la porte `CI Status` non plus
   * hors PR. Que ce job ne tourne pas sur une PR est gardé par `ci-tests-concernes.test.ts` (web).
   */
  // `ci-status` est la porte elle-même ; `suite-complete-rouge` et `dette-formatage` ne tournent
  // JAMAIS sur une pull request (`if: github.event_name != 'pull_request'`), donc les attendre
  // dans `needs` ne rendrait qu'un `skipped` éternel. `dette-formatage` ajouté le 29/10/2026
  // (#4772, moitié 1) : son verdict sur main se lit dans le run, pas dans la porte d'une PR.
  // `warm-cache` (lot B2 ci/1-caches, 31/10/2026) : push sur main seulement (`github.event_name == 'push'`),
  // il écrit les caches que les PR restaurent ; son rouge sonne par `suite-complete-rouge`, pas par la porte.
  const AUTORISES_HORS_PORTE = ['ci-status', 'suite-complete-rouge', 'dette-formatage', 'warm-cache']

  it('lit un corpus réel — sinon la garde est borgne', () => {
    // Contrôle positif. Une regex qui ne matche plus (indentation changée,
    // fichier déplacé) rendrait trois listes vides, donc zéro écart, donc une
    // garde verte qui n'a rien lu. C'est le faux zéro qui ressemble à une réponse.
    // Seuils 10 → 7 le 29/09/2026 : huit petits jobs fondus en `quick`.
    // `needs` 7 → 6 le 05/10/2026 : `check-types` fondu dans `build` (même
    // installation, deux steps distincts) — un job FUSIONNÉ, aucune porte retirée.
    expect(jobs.length).toBeGreaterThanOrEqual(7)
    expect(jobs).toContain('ci-status')
    expect(jobs).toContain('changes')
    expect(needs.length).toBeGreaterThanOrEqual(6)
    expect(evalues.length).toBeGreaterThanOrEqual(6)

    // Et les trois jobs qui ont payé la leçon sont bien vus par la lecture.
    expect(jobs).toContain('test-web')
    // `test-site`, `test-backoffice`, lint, format… sont des ÉTAPES du job
    // `quick` depuis le 29/09/2026 (-7 slots par run) : le job, lui, doit rester
    // dans `needs` ET `results` — les deux assertions plus bas le vérifient.
    expect(jobs).toContain('quick')

    // L'exemption `continue-on-error` doit rester un mécanisme VIVANT : si elle
    // matchait tout, elle n'exigerait plus rien et la garde serait borgne.
    expect(consultatifs.length).toBeLessThan(jobs.length / 2)
  })

  /**
   * ⚠️ Cette assertion valait `expect(consultatifs).toContain('e2e')` — le seul
   * job consultatif du dépôt. Le 14/09/2026, `e2e` a quitté `ci.yml` pour
   * `e2e-nightly.yml` : il vivait ici avec `continue-on-error: true` ET hors des
   * `needs` de la porte, donc il ne pouvait faire échouer aucune fusion, pour
   * 1,8 min de temps de job par exécution et zéro rouge en 45 exécutions.
   *
   * `ci.yml` ne porte donc PLUS aucun job consultatif — c'est un état meilleur,
   * mais il laisse l'exemption sans sujet réel. Or une exemption qu'on ne peut
   * plus observer est indiscernable d'une exemption CASSÉE : le jour où
   * l'indentation change ou où la clé est renommée, elle n'exempterait plus
   * personne et la garde rougirait à tort sur le premier job consultatif écrit.
   *
   * D'où le témoin SYNTHÉTIQUE : on prouve que le détecteur sait encore dire
   * oui ET non, sur un corpus qu'on fabrique, puisque le corpus réel est vide.
   */
  it('le détecteur de job consultatif marche encore, même quand plus aucun job ne l’est', () => {
    // 12/10/2026 (Louis) : « Démo (semis sur vraie base) » était devenu consultatif le temps de le
    // stabiliser sur l'exécuteur persistant ; 15/10 : vert 13/13 depuis le 13/10, il redevient bloquant.
    expect(consultatifs).toEqual([])

    const avecConsultatif = [
      '  bloquant:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: true',
      '  consultatif:',
      '    runs-on: ubuntu-latest',
      '    continue-on-error: true',
      '    steps:',
      '      - run: true',
      '',
    ].join('\n')

    // Il dit OUI sur un job consultatif…
    expect(consultatifsDe(avecConsultatif)).toEqual(['consultatif'])
    // …et NON sur le voisin légitime, y compris `continue-on-error: false`,
    // qui n'exempte rien et ne doit pas être confondu avec l'exemption.
    expect(consultatifsDe(avecConsultatif.replace('continue-on-error: true', 'continue-on-error: false'))).toEqual([])
  })

  it('tout job déclaré est dans les `needs` de la porte', () => {
    const manquants = jobs.filter(
      job => !AUTORISES_HORS_PORTE.includes(job) && !consultatifs.includes(job) && !needs.includes(job),
    )
    if (manquants.length > 0) {
      throw new Error(
        [
          'Ces jobs tournent mais ne sont pas attendus par `CI Status`.',
          'Un job hors de la porte ne garde rien : il rougit et la PR passe.',
          '',
          ...manquants,
        ].join('\n'),
      )
    }
    expect(manquants).toEqual([])
  })

  it('tout job attendu est aussi ÉVALUÉ dans la liste `results`', () => {
    // C'est l'endroit exact où `test-web` est passé à travers : présent dans
    // `needs`, absent du tableau qui décide du verdict.
    const manquants = needs.filter(job => !evalues.includes(job))
    if (manquants.length > 0) {
      throw new Error(
        [
          'Ces jobs sont dans `needs:` mais leur résultat n’est jamais lu.',
          'La porte les attend, puis conclut sans eux — c’est la garde borgne.',
          'Ajouter `"${{ needs.<job>.result }}"` au tableau `results`.',
          '',
          ...manquants,
        ].join('\n'),
      )
    }
    expect(manquants).toEqual([])
  })
})
