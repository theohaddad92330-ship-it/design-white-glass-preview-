import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * GA — tout chemin de fichier cité par un workflow ou une action composite existe dans le dépôt (#4830).
 *
 * CE QUE ÇA A COÛTÉ, MESURÉ LE 29/10/2026
 * Le job `dette-formatage` de `ci.yml` est né (#4638, 22/10) avec `node-version-file: .nvmrc` — un
 * fichier que ce dépôt n'a JAMAIS eu. Il mourait à `actions/setup-node`, avant d'avoir lu un seul
 * fichier : le cliquet de formatage n'a pas mesuré la dette une seule fois en sept jours, et il a
 * rougi `main` à chaque run (#4829). Rien de cela ne se voit à la relecture : la clé est valide, la
 * valeur a la forme d'un chemin, seule son ABSENCE sur le disque est fausse.
 *
 * CE QU'ELLE VÉRIFIE — déterministe, sans réseau
 *  · les clés `with:` qui nomment un fichier, relatives à la racine du dépôt :
 *    `node-version-file`, `python-version-file`, `cache-dependency-path`, `config-file`, `env-file` ;
 *  · les actions locales `uses: ./…`, qui doivent porter un `action.yml` ;
 *  · les `working-directory:` ;
 *  · les `--config <f>` / `--ignore-path <f>` d'un `run:`, relatifs au `working-directory` du pas
 *    (ou au `defaults.run.working-directory` du job, ou à la racine).
 * Une valeur qui porte une expression `${{ … }}` ou un joker ne se résout pas sans exécuter : elle
 * est écartée, et COMPTÉE (le contrôle positif exige qu'il reste des chemins réellement vérifiés).
 */

const RACINE = resolve(__dirname, '../../../..')

interface Citation {
  fichier: string
  ligne: number
  chemin: string
  base: string
}

const CLES_FICHIER = ['node-version-file', 'python-version-file', 'cache-dependency-path', 'config-file', 'env-file']

const sansGuillemets = (v: string): string => v.trim().replace(/^['"]|['"]$/g, '')

// Un bloc multiligne (`|`, `>`) n'est pas lu ligne à ligne : il est écarté comme une expression.
const resoluble = (chemin: string): boolean => !chemin.includes('${{') && !/[*?]/.test(chemin) && !/^[|>]/.test(chemin)

/** Les citations de chemin d'un fichier de workflow, chacune avec le dossier contre lequel la résoudre. */
const citationsDe = (fichier: string, source: string): Citation[] => {
  const lignes = source.split('\n')
  const citations: Citation[] = []
  let defautJob = ''
  let debutPas = -1
  let indentPas = -1

  /** Le `working-directory:` déclaré dans le pas courant, s'il y en a un. */
  const repertoireDuPas = (fin: number): string => {
    if (debutPas < 0) return ''
    for (let j = debutPas; j < lignes.length && j <= fin + 40; j++) {
      if (j > debutPas && /^\s*- /.test(lignes[j]) && lignes[j].search(/\S/) <= indentPas) break
      const m = lignes[j].match(/^\s+working-directory:\s*(.+)$/)
      if (m && lignes[j].search(/\S/) > indentPas) return sansGuillemets(m[1])
    }
    return ''
  }

  lignes.forEach((texte, i) => {
    if (/^ {2}[a-z][a-z0-9-]*:\s*$/.test(texte)) {
      defautJob = ''
      debutPas = -1
    }
    if (
      /^\s*- /.test(texte) &&
      /^\s{4,}- (name|uses|run|id|if|with|env|shell|working-directory|timeout-minutes|continue-on-error):/.test(texte)
    ) {
      debutPas = i
      indentPas = texte.search(/\S/)
    }
    if (/^\s*#/.test(texte)) return

    const wd = texte.match(/^(\s+)working-directory:\s*(.+)$/)
    if (wd) {
      const chemin = sansGuillemets(wd[2])
      // Un `working-directory` à 8 espaces sous `defaults.run` vaut pour tout le job.
      if (
        wd[1].length === 8 &&
        /^\s+run:\s*$/.test(lignes[i - 1] ?? '') &&
        /^\s+defaults:\s*$/.test(lignes[i - 2] ?? '')
      )
        defautJob = chemin
      citations.push({ fichier, ligne: i + 1, chemin, base: '' })
      return
    }

    const cle = texte.match(/^\s+([a-z-]+):\s*(\S.*)$/)
    if (cle && CLES_FICHIER.includes(cle[1])) {
      for (const morceau of sansGuillemets(cle[2]).split(/\s+/))
        citations.push({ fichier, ligne: i + 1, chemin: morceau, base: '' })
      return
    }

    const local = texte.match(/^\s+(?:- )?uses:\s*(\.\/\S+)/)
    if (local) {
      citations.push({ fichier, ligne: i + 1, chemin: join(sansGuillemets(local[1]), 'action.yml'), base: '' })
      return
    }

    for (const m of texte.matchAll(/--(?:config|ignore-path)[ =](['"]?)([^\s'"]+)\1/g)) {
      const base = repertoireDuPas(i) || defautJob
      citations.push({ fichier, ligne: i + 1, chemin: m[2], base })
    }
  })
  return citations
}

const absentes = (citations: Citation[], racine: string): Citation[] =>
  citations.filter(c => resoluble(c.chemin) && !existsSync(resolve(racine, c.base, c.chemin)))

describe('GA — tout chemin cité par un workflow existe', () => {
  const WORKFLOWS = join(RACINE, '.github/workflows')
  const ACTIONS = join(RACINE, '.github/actions')
  const fichiers = [
    ...readdirSync(WORKFLOWS)
      .filter(n => /\.ya?ml$/.test(n))
      .map(n => join(WORKFLOWS, n)),
    ...readdirSync(ACTIONS)
      .map(d => join(ACTIONS, d, 'action.yml'))
      .filter(existsSync),
  ]
  const citations = fichiers.flatMap(f => citationsDe(f.slice(RACINE.length + 1), readFileSync(f, 'utf8')))

  it('lit un corpus réel — sinon la garde est borgne', () => {
    expect(fichiers.some(f => f.endsWith('ci.yml'))).toBe(true)
    expect(fichiers.filter(f => f.endsWith('action.yml')).length).toBeGreaterThanOrEqual(2)
    const verifiees = citations.filter(c => resoluble(c.chemin))
    // Mesuré le 30/10/2026 : ~50 citations sur 7 workflows et 2 actions. Chaque famille doit être lue.
    expect(verifiees.length).toBeGreaterThanOrEqual(20)
    expect(verifiees.some(c => c.chemin.endsWith('requirements.txt'))).toBe(true)
    expect(verifiees.some(c => c.chemin.endsWith('store-pnpm/action.yml'))).toBe(true)
    expect(verifiees.some(c => c.chemin === 'apps/ia')).toBe(true)
    // `--config .importlinter` se lit relativement au `working-directory: apps/ia` de son pas.
    expect(verifiees).toContainEqual(expect.objectContaining({ chemin: '.importlinter', base: 'apps/ia' }))
  })

  it('sait dire NON — le `.nvmrc` de #4638 et un `--config` hors de son répertoire sont nommés', () => {
    const corpus = [
      'jobs:',
      '  job:',
      '    steps:',
      '      - uses: actions/setup-node@v7',
      '        with:',
      '          node-version-file: .nvmrc',
      '      - uses: ./.github/actions/store-pnpm',
      '      - name: linter',
      '        working-directory: apps/ia',
      '        run: lint-imports --config .importlinter',
      '      - name: mauvais répertoire',
      '        run: lint-imports --config .importlinter',
      '      - run: x --config ${{ matrix.cfg }}',
      '',
    ].join('\n')
    const fautes = absentes(citationsDe('synthetique.yml', corpus), RACINE).map(c => `${c.ligne}:${c.chemin}`)
    // Ligne 6 : `.nvmrc` n'existe pas. Ligne 12 : `.importlinter` n'existe pas à la RACINE.
    // L'action locale, le `--config` de la ligne 10 (résolu dans apps/ia) et l'expression passent.
    expect(fautes).toEqual(['6:.nvmrc', '12:.importlinter'])
  })

  it('aucun chemin cité n’est absent du dépôt', () => {
    const fautes = absentes(citations, RACINE)
    if (fautes.length > 0) {
      throw new Error(
        [
          'Ces chemins sont cités par un workflow mais n’existent pas : le pas mourra avant d’avoir rien vérifié',
          '(`dette-formatage` et son `.nvmrc`, 22→29/10/2026, #4830).',
          '',
          ...fautes.map(c => `${c.fichier}:${c.ligne} — ${c.base ? `${c.base}/` : ''}${c.chemin}`),
        ].join('\n'),
      )
    }
    expect(fautes).toEqual([])
  })
})
