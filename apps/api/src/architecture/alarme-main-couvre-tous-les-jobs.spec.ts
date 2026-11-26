import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * GA — tout job de `ci.yml` qui tourne sur `main` est couvert par l'alarme `ci-main-rouge` (#4830).
 *
 * Hors pull request, `CI Status` ne tourne pas : le seul verdict qui sonne sur `main` est le job
 * `suite-complete-rouge`, qui ouvre l'issue `ci-main-rouge`. Il ne tire que si `failure()` est vrai,
 * c'est-à-dire si l'un de ses `needs` — ou un ANCÊTRE de ses `needs` — a échoué. Un job qui tourne
 * sur `main` sans être dans cette chaîne peut rougir indéfiniment : aucune PR ne le voit, l'alarme
 * reste `skipped`.
 *
 * CE QUE ÇA A COÛTÉ, MESURÉ LE 29/10/2026
 * `dette-formatage` lisait un `.nvmrc` inexistant et rougissait `main` à CHAQUE run, de sa naissance
 * (#4638, 22/10) à son correctif (#4829, 29/10). Neuf runs `CI` de `main` rouges le seul 29/10, et
 * `Suite complète rouge sur main` `skipped` sur chacun : ses `needs` étaient `[test, test-web]`.
 * Sept jours de rouge sans une alarme — trouvé par une session qui lisait `main` à la main.
 *
 * CE QU'ELLE VÉRIFIE
 * Elle part des jobs RÉELLEMENT déclarés, pas d'une liste : est « sur main » tout job dont le `if:`
 * ne le réserve pas aux pull requests. Chacun doit être l'alarme elle-même, ou appartenir à la
 * fermeture de ses `needs` (un ancêtre qui échoue fait tirer `failure()`).
 */

interface Job {
  nom: string
  corps: string
}

const decouperEnJobs = (source: string): Job[] => {
  const debut = source.search(/^jobs:\s*$/m)
  const zone = debut >= 0 ? source.slice(debut) : source
  const noms = [...zone.matchAll(/^ {2}([a-z][a-z0-9-]*):\s*$/gm)]
  return noms.map((m, i) => ({
    nom: m[1],
    corps: zone.slice(m.index ?? 0, noms[i + 1]?.index ?? zone.length),
  }))
}

/** `needs: [a, b]` ou `needs: a` — au niveau du job (quatre espaces). */
const needsDe = (job: Job): string[] => {
  const liste = job.corps.match(/^ {4}needs:\s*\[([^\]]*)\]/m)
  if (liste)
    return liste[1]
      .split(',')
      .map(n => n.trim())
      .filter(Boolean)
  const seul = job.corps.match(/^ {4}needs:\s*([a-z][a-z0-9-]*)\s*$/m)
  return seul ? [seul[1]] : []
}

/** Un job dont le `if:` exige une pull request ne tourne jamais sur `main`. */
const reserveAuxPr = (job: Job): boolean => {
  const si = job.corps.match(/^ {4}if:\s*(.+)$/m)
  return si !== null && /github\.event_name\s*==\s*'pull_request'/.test(si[1])
}

const ALARME = 'suite-complete-rouge'

/** Les jobs qui tournent sur `main` sans qu'un échec fasse tirer l'alarme. */
const nonCouverts = (source: string): string[] => {
  const jobs = decouperEnJobs(source)
  const parNom = new Map(jobs.map(j => [j.nom, j]))
  const alarme = parNom.get(ALARME)
  if (!alarme) throw new Error(`le job \`${ALARME}\` est introuvable dans le corpus`)

  const couverts = new Set<string>()
  const aVisiter = [...needsDe(alarme)]
  while (aVisiter.length > 0) {
    const nom = aVisiter.pop() as string
    if (couverts.has(nom)) continue
    couverts.add(nom)
    const job = parNom.get(nom)
    if (job) aVisiter.push(...needsDe(job))
  }

  return jobs.filter(j => j.nom !== ALARME && !reserveAuxPr(j) && !couverts.has(j.nom)).map(j => j.nom)
}

describe('GA — l’alarme ci-main-rouge couvre tous les jobs qui tournent sur main', () => {
  const CI = resolve(__dirname, '../../../../.github/workflows/ci.yml')
  const contenu = readFileSync(CI, 'utf8')
  const jobs = decouperEnJobs(contenu)

  it('lit un corpus réel — sinon la garde est borgne', () => {
    const noms = jobs.map(j => j.nom)
    expect(noms.length).toBeGreaterThanOrEqual(7)
    expect(noms).toContain(ALARME)
    expect(noms).toContain('test')
    expect(noms).toContain('dette-formatage')
    // Les deux classes existent : des jobs réservés aux PR ET des jobs qui tournent sur main.
    // Si l'une est vide, la lecture du `if:` est cassée et la garde ne compare plus rien.
    expect(jobs.filter(reserveAuxPr).length).toBeGreaterThanOrEqual(3)
    expect(jobs.filter(j => !reserveAuxPr(j)).length).toBeGreaterThanOrEqual(3)
    // L'alarme tire bien sur un échec, et sur main seulement.
    const alarme = jobs.find(j => j.nom === ALARME)?.corps ?? ''
    expect(alarme).toMatch(/^ {4}if:\s*failure\(\)/m)
    expect(alarme).toContain("github.ref == 'refs/heads/main'")
  })

  it('sait dire NON — un job sur main hors de la chaîne de l’alarme est nommé', () => {
    const corpus = [
      'jobs:',
      '  changes:',
      '    runs-on: x',
      '  test:',
      '    needs: [changes]',
      '    runs-on: x',
      '  lint-pr:',
      "    if: github.event_name == 'pull_request'",
      '    runs-on: x',
      '  orphelin:',
      "    if: github.event_name != 'pull_request'",
      '    runs-on: x',
      `  ${ALARME}:`,
      '    needs: test',
      "    if: failure() && github.event_name != 'pull_request'",
      '    runs-on: x',
      '',
    ].join('\n')
    // `changes` est couvert comme ANCÊTRE de `test` ; `lint-pr` ne tourne pas sur main.
    expect(nonCouverts(corpus)).toEqual(['orphelin'])
    expect(nonCouverts(corpus.replace('    needs: test', '    needs: [test, orphelin]'))).toEqual([])
  })

  it('aucun job qui tourne sur main n’échappe à l’alarme', () => {
    const manquants = nonCouverts(contenu)
    if (manquants.length > 0) {
      throw new Error(
        [
          `Ces jobs tournent sur main mais leur échec ne fait pas tirer \`${ALARME}\` :`,
          'ils peuvent rougir main indéfiniment sans issue `ci-main-rouge` (dette-formatage, 22→29/10/2026).',
          `Ajouter le job aux \`needs\` de \`${ALARME}\`.`,
          '',
          ...manquants,
        ].join('\n'),
      )
    }
    expect(manquants).toEqual([])
  })
})
