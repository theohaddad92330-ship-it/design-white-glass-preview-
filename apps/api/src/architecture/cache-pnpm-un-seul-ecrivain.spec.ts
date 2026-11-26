import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * GA — le store pnpm se RESTAURE partout, et ne s'écrit qu'à un seul endroit
 * par workflow.
 *
 * CE QUE ÇA A COÛTÉ, MESURÉ LE 14/09/2026 SUR 168 JOBS / 12 EXÉCUTIONS
 * Les treize jobs de `ci.yml` appelaient `actions/setup-node` avec
 * `cache: pnpm`. Ce réglage restaure au démarrage (15 s de médiane) ET sauvegarde
 * dans le pas `Post` (p50 0 s, p75 46 s, max 58 s). Treize jobs qui écrivent la
 * MÊME clé se marchent dessus : le premier arrivé gagne, les douze autres paient
 * la compression et la montée pour se faire refuser.
 *
 *   · sauvegardes                3,26 min de temps de job / exécution  (17,5 %)
 *   · restaurations              2,69 min / exécution                  (14,5 %)
 *   · TOTAL                      35,3 % de tout le temps de job
 *   · ce que ça achetait         `pnpm install --frozen-lockfile` à 2 s de médiane
 *
 * POURQUOI UNE GARDE ET PAS UN COMMENTAIRE
 * Remettre `cache: pnpm` est le geste NATUREL : c'est la ligne que tout exemple
 * de la documentation montre, et elle a l'air gratuite. Elle réintroduirait les
 * douze écritures sans qu'aucun test ne tombe et sans que rien ne casse — juste
 * une CI qui redevient lente, ce que personne n'attribue jamais à une ligne de
 * configuration ajoutée trois semaines plus tôt.
 *
 * ⚠️ L'écriture reste NÉCESSAIRE : sans elle le cache ne naît jamais. Ce qui est
 * interdit, c'est qu'elle se produise treize fois.
 *
 * ⚠️⚠️ CE QUE CETTE GARDE COMPTE A CHANGÉ LE 16/09/2026, ET POURQUOI
 * Elle comptait les PAS `actions/cache/save@` — au plus un par workflow. C'était
 * un raccourci qui tenait tant qu'il n'existait qu'un seul cache. Le jour où
 * `ci.yml` a gagné un cache TURBO (une clé différente, un contenu différent),
 * elle est passée au rouge alors que rien de ce qu'elle protège n'était en
 * cause : trois pas, mais trois clés DISTINCTES, donc toujours un seul écrivain
 * par cache.
 *
 * C'est le défaut que le dépôt nomme « une garde trop gourmande » : elle
 * attrapait ce qu'elle ne visait pas. Le défaut mesuré n'a jamais été « plusieurs
 * pas qui écrivent », c'est « plusieurs jobs qui écrivent LA MÊME CLÉ » — le
 * premier arrivé gagne, les autres paient la compression et la montée pour se
 * faire refuser. Elle compte donc désormais les écrivains PAR CLÉ.
 *
 * Et elle gagne une dent au passage, que l'ancienne version n'avait pas : un pas
 * de sauvegarde dans un job à MATRICE doit porter la variable de matrice dans sa
 * clé. Sans elle, un seul pas écrit produit N jobs sur la même clé — exactement
 * le défaut d'origine, sous une forme que « au plus un pas » ne voyait pas.
 */
describe('GA — le cache du store pnpm a un seul écrivain par workflow', () => {
  const DIR = resolve(__dirname, '../../../../.github/workflows')
  const ACTION = resolve(__dirname, '../../../../.github/actions/store-pnpm/action.yml')

  const fichiers = readdirSync(DIR).filter(nom => nom.endsWith('.yml') || nom.endsWith('.yaml'))
  const contenus = new Map(fichiers.map(nom => [nom, readFileSync(resolve(DIR, nom), 'utf8')]))

  /** Les workflows qui installent des dépendances pnpm — les seuls concernés. */
  const avecPnpm = [...contenus].filter(([, texte]) => texte.includes('pnpm install --frozen-lockfile'))

  it('lit un corpus réel — sinon la garde est borgne', () => {
    expect(fichiers.length).toBeGreaterThanOrEqual(3)
    expect(fichiers).toContain('ci.yml')
    expect(avecPnpm.length).toBeGreaterThanOrEqual(2)

    // L'action composite existe et fait bien de la restauration SEULE : si elle
    // portait `actions/cache/save`, toute la règle serait contournée par le
    // mécanisme même qui est censé la porter.
    const action = readFileSync(ACTION, 'utf8')
    expect(action).toContain('actions/cache/restore@')
    expect(action).not.toContain('actions/cache/save@')

    // Et les jobs l'appellent vraiment — sinon on garderait une règle que
    // personne n'applique.
    const appels = (contenus.get('ci.yml') ?? '').match(/uses: \.\/\.github\/actions\/store-pnpm/g) ?? []
    // #3358 — lint, format et les tests légers fondus dans `quick` : 5 jobs installent, tous par le cache.
    // 5 → 4 le 05/10/2026 : `check-types` fondu dans `build` (une installation de moins, aucune porte retirée).
    expect(appels.length).toBeGreaterThanOrEqual(4)
  })

  it.each(avecPnpm.map(([nom]) => nom))('%s — aucun `cache: pnpm` sur setup-node', nom => {
    // `cache: pnpm` sauvegarde dans le pas `Post` de CHAQUE job qui le porte.
    // C'est le retour en arrière qu'on ne veut pas voir revenir par réflexe.
    const lignes = (contenus.get(nom) ?? '').split('\n').filter(ligne => /^\s*cache:\s*pnpm\s*$/.test(ligne))
    expect(lignes).toEqual([])
  })

  /**
   * Les pas `actions/cache/save@` d'un workflow, chacun avec la clé qu'il écrit
   * et le job qui le porte. Analyse par INDENTATION plutôt que par un parseur :
   * le dépôt n'embarque pas de bibliothèque YAML, et la forme des workflows est
   * assez régulière pour que ce soit honnête — à condition de vérifier que le
   * corpus lu n'est pas vide, ce que fait le test suivant.
   */
  function ecrituresDeCache(texte: string): { job: string; cle: string; matriciel: boolean }[] {
    const lignes = texte.split('\n')
    const trouvees: { job: string; cle: string; matriciel: boolean }[] = []

    // Bornes des jobs : une clé à deux espaces d'indentation sous `jobs:`.
    const debutsDeJob: { nom: string; ligne: number }[] = []
    let dansJobs = false
    lignes.forEach((ligne, i) => {
      if (/^jobs:\s*$/.test(ligne)) dansJobs = true
      else if (/^\S/.test(ligne)) dansJobs = false
      else if (dansJobs && /^ {2}[A-Za-z0-9_-]+:\s*$/.test(ligne)) {
        debutsDeJob.push({ nom: ligne.trim().replace(':', ''), ligne: i })
      }
    })

    const jobDe = (i: number): { nom: string; debut: number; fin: number } => {
      const idx = debutsDeJob.findLastIndex(j => j.ligne < i)
      const courant = debutsDeJob[idx]
      const suivant = debutsDeJob[idx + 1]
      return { nom: courant?.nom ?? '(hors job)', debut: courant?.ligne ?? 0, fin: suivant?.ligne ?? lignes.length }
    }

    lignes.forEach((ligne, i) => {
      if (!/uses:\s*actions\/cache\/save@/.test(ligne)) return
      const { nom, debut, fin } = jobDe(i)
      // La clé du pas : le premier `key:` rencontré dans les lignes qui suivent,
      // avant le prochain `- name:`/`- uses:` qui ouvrirait un autre pas.
      let cle = ''
      for (let j = i + 1; j < Math.min(i + 12, lignes.length); j++) {
        if (/^\s*-\s+(name|uses):/.test(lignes[j])) break
        const m = lignes[j].match(/^\s*key:\s*(.+?)\s*$/)
        if (m) {
          cle = m[1]
          break
        }
      }
      const corpsDuJob = lignes.slice(debut, fin).join('\n')
      trouvees.push({ job: nom, cle, matriciel: /^\s+matrix:\s*$/m.test(corpsDuJob) })
    })
    return trouvees
  }

  it.each(avecPnpm.map(([nom]) => nom))('%s — chaque pas de sauvegarde porte une clé lisible', nom => {
    // Le corpus de CETTE analyse : sans lui, les deux tests suivants passeraient
    // sur une liste vide et ne garderaient rien.
    const ecritures = ecrituresDeCache(contenus.get(nom) ?? '')
    expect(ecritures.length).toBeGreaterThanOrEqual(1)
    for (const e of ecritures) expect(e.cle).not.toEqual('')
  })

  it.each(avecPnpm.map(([nom]) => nom))('%s — au plus UN écrivain par CLÉ', nom => {
    // Le défaut mesuré : plusieurs jobs sur la même clé. Ce n'est pas le nombre
    // de pas qui coûte, c'est le nombre de jobs qui visent la même entrée.
    const cles = ecrituresDeCache(contenus.get(nom) ?? '').map(e => e.cle)
    const doublons = cles.filter((c, i) => cles.indexOf(c) !== i)
    expect(doublons).toEqual([])
  })

  it.each(avecPnpm.map(([nom]) => nom))('%s — dans un job à matrice, la clé porte la matrice', nom => {
    // UN pas dans un job à matrice produit N écritures. Si la clé ne distingue
    // pas les branches, c'est le défaut d'origine — invisible pour qui compte
    // les pas plutôt que les jobs.
    const fautifs = ecrituresDeCache(contenus.get(nom) ?? '')
      .filter(e => e.matriciel && !e.cle.includes('matrix.'))
      .map(e => `${e.job} → ${e.cle}`)
    expect(fautifs).toEqual([])
  })

  it('au moins un workflow écrit le cache — sinon il ne naîtrait jamais', () => {
    // Le repli de cette règle est d'en faire PLUS, pas moins : sans écrivain, le
    // cache reste vide et chaque conteneur frais réinstalle depuis le réseau.
    // Plus lent, jamais faux — mais ce n'est pas ce qu'on a voulu, et ça se
    // verrait seulement sur la facture.
    const ecrivains = avecPnpm.filter(([, texte]) => texte.includes('uses: actions/cache/save@')).map(([nom]) => nom)
    expect(ecrivains).toContain('ci.yml')
    expect(ecrivains).toContain('e2e-nightly.yml')
  })
})
