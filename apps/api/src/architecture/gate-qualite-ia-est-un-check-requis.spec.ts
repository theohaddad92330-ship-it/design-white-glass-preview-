import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * GA — la porte de qualité IA est un check REQUIS, pas un job décoratif.
 *
 * #2631.1 — le gate voit CE compte-là, pas la moyenne (doctrine
 * `c77_gate_qualite_ia_bloque_sur_role_cle`, décision Louis 21/09/2026) :
 * « La porte de qualité IA est un GATE CI AUTOMATISÉ et BLOQUANT, pas une
 * lecture manuelle. »
 *
 * MESURÉ LE 21/09/2026, AVANT D'ÉCRIRE CETTE GARDE — et c'est la bonne
 * nouvelle : la CI appelait DÉJÀ `python -m app.eval.gate`, et le job `eval`
 * était DÉJÀ dans les deux listes de `CI Status`, la cible de la protection de
 * branche. Rien n'était à câbler. Ce qui manquait, c'est ce qui EMPÊCHE que ça
 * se décâble : le motif de ce dépôt n'est pas « le code n'existe pas », c'est
 * « du code juste que plus personne n'appelle ».
 *
 * CE QU'ELLE AJOUTE à `ci-status-garde-tous-les-jobs.spec.ts`, qui exige déjà
 * que TOUT job déclaré soit aux deux endroits : celle-ci exige que le job
 * existe ENCORE et qu'il LANCE ENCORE la commande. Supprimer le job, renommer
 * l'étape, remplacer la commande par un `echo`, ou neutraliser sa condition —
 * quatre gestes que la garde générique laisserait passer, parce qu'un job
 * absent n'est jamais « absent de la porte ».
 *
 * ⚠️ ELLE NE LIT PAS LA PROSE. `ci.yml` contient un bloc de commentaires
 * français qui parle de `app/eval/` et du gate juste au-dessus du job. Une
 * garde qui compterait ces lignes resterait verte le jour où la commande
 * disparaît — c'est la garde qui « accuse le bien », vue ici en septembre avec
 * le mot « parallaxe » trouvé dans un commentaire. Les commentaires sont donc
 * RETIRÉS avant toute recherche, et le test le prouve sur un corpus fabriqué.
 */
describe('GA — le gate de qualité IA reste un check requis de CI Status', () => {
  const CI = resolve(__dirname, '../../../../.github/workflows/ci.yml')
  const contenu = readFileSync(CI, 'utf8')

  /**
   * La commande que le job doit lancer — la porte elle-même. `python"?` : le job lance
   * `"$IA_VENV/bin/python" -m …` depuis le venv hermétique (lot CI C) ; la règle reste « un job la lance ».
   */
  const COMMANDE = /python"? -m app\.eval\.gate\b/

  /**
   * #2899/#2443.7 — la porte JUMELLE, dédiée au CHAT (`app.eval.chat_gate`,
   * surface et baseline propres, distincte de `app.eval.gate` ci-dessus).
   * Câblée par ce même lot : avant elle, `chat_gate.py` existait, testé,
   * documenté — et sans appelant en CI, exactement le défaut que cette garde
   * existe pour empêcher (§ commentaire de tête).
   */
  const COMMANDE_CHAT = /python"? -m app\.eval\.chat_gate\b/

  /** Le job fondu qui porte les étapes de gate (ex-job `eval`). */
  const JOB_QUI_PORTE_LES_GATES = 'quick'

  /**
   * Le fichier sans ses lignes de commentaire. On ne retire QUE les lignes
   * entièrement commentées : c'est la forme que prennent les blocs d'explication
   * de `ci.yml`, et un dépouillement plus agressif (couper à n'importe quel `#`)
   * mutilerait les expressions `${{ }}` et les chaînes shell.
   */
  const sansCommentaires = (source: string): string =>
    source
      .split('\n')
      .filter(ligne => !/^\s*#/.test(ligne))
      .join('\n')

  /** Les jobs déclarés, avec leur corps — même découpage que la garde sœur. */
  const decouperEnJobs = (source: string): { nom: string; corps: string }[] => {
    const noms = [...source.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)]
    return noms.map((m, i) => ({
      nom: m[1],
      corps: source.slice(m.index ?? 0, noms[i + 1]?.index ?? source.length),
    }))
  }

  /** Les jobs qui LANCENT réellement la commande donnée (hors commentaires). */
  const jobsQuiLancent = (commande: RegExp, source: string): string[] =>
    decouperEnJobs(sansCommentaires(source))
      .filter(b => commande.test(b.corps))
      .map(b => b.nom)

  const jobsQuiLancentLeGate = (source: string): string[] => jobsQuiLancent(COMMANDE, source)
  const jobsQuiLancentLeGateChat = (source: string): string[] => jobsQuiLancent(COMMANDE_CHAT, source)

  const contenuNu = sansCommentaires(contenu)
  const blocs = decouperEnJobs(contenuNu)
  const lanceurs = jobsQuiLancentLeGate(contenu)
  const lanceursChat = jobsQuiLancentLeGateChat(contenu)

  const porte = blocs.find(b => b.nom === 'ci-status')?.corps ?? ''
  const needs = (() => {
    const bloc = porte.match(/needs:\s*\n?\s*\[([\s\S]*?)\]/)
    if (!bloc) return []
    return bloc[1]
      .split(',')
      .map(nom => nom.trim())
      .filter(Boolean)
  })()
  const evalues = [...porte.matchAll(/needs\.([a-z][a-z0-9-]*)\.result/g)].map(m => m[1])

  it('lit un corpus réel — sinon la garde est borgne', () => {
    // Contrôle positif : une regex qui ne matche plus rendrait toutes les
    // listes vides, donc zéro écart, donc un vert qui n'a rien lu. C'est
    // exactement le faux zéro qui ressemble à une réponse.
    expect(contenu.length).toBeGreaterThan(10_000)
    // #3358 — `eval` fondu dans `quick` : CI Status agrège 8 jobs (décision Louis 30/09) ; plancher 7 comme le spec frère.
    expect(blocs.length).toBeGreaterThanOrEqual(7)
    // 7 → 6 le 05/10/2026 : `check-types` fondu dans `build` ; plancher 6 comme le spec frère.
    expect(needs.length).toBeGreaterThanOrEqual(6)
    expect(evalues.length).toBeGreaterThanOrEqual(6)
    // Et le dépouillement a bien retiré quelque chose, sans tout retirer.
    expect(contenuNu.length).toBeLessThan(contenu.length)
    expect(contenuNu.length).toBeGreaterThan(contenu.length / 4)
  })

  it('le dépouillement sait dire NON à une commande qui ne vit que dans un commentaire', () => {
    // Le témoin synthétique : même corpus, deux fois — une fois la commande
    // RÉELLEMENT lancée, une fois seulement racontée. La garde doit distinguer.
    const lance = ['  qualite:', '    steps:', '      - run: python -m app.eval.gate --base origin/main', ''].join('\n')
    const racontee = [
      '  qualite:',
      '    # Ce job lançait `python -m app.eval.gate` — il ne le fait plus.',
      '    steps:',
      '      - run: echo "rien"',
      '',
    ].join('\n')

    expect(jobsQuiLancentLeGate(lance)).toEqual(['qualite'])
    expect(jobsQuiLancentLeGate(racontee)).toEqual([])
  })

  it('un job lance la porte de qualité IA', () => {
    if (lanceurs.length === 0) {
      throw new Error(
        [
          'Aucun job de `ci.yml` ne lance `python -m app.eval.gate`.',
          'La porte de qualité IA est un GATE BLOQUANT (doctrine c77) : sans appelant, le banc,',
          'la baseline et le plancher de rôles #2631.1 sont du code juste que personne ne lance.',
        ].join('\n'),
      )
    }
    // Le job `eval` est fondu dans `quick` (29/09/2026) : le gate y est une ÉTAPE.
    expect(lanceurs).toContain(JOB_QUI_PORTE_LES_GATES)
  })

  it('le job qui la lance est dans les `needs` ET dans la liste `results` de CI Status', () => {
    // Les deux endroits, parce qu'un job présent dans `needs` mais absent du
    // tableau qui décide du verdict rougit sans rien bloquer — `test-web` a
    // vécu des semaines comme ça.
    for (const job of lanceurs) {
      expect(needs).toContain(job)
      expect(evalues).toContain(job)
    }
  })

  it('la condition du job ne peut pas être neutralisée en silence', () => {
    // Le job est légitimement SAUTÉ quand rien ne change dans `apps/ia` — un
    // `skipped` passe la porte, et c'est juste. Ce qui ne doit pas passer, c'est
    // une condition qui l'éteint pour de bon : `if: false`, ou une condition qui
    // ne dépend plus du job de portée.
    //
    // Depuis la fusion en `quick`, la condition vit sur l'ÉTAPE qui lance la
    // commande, pas sur le job (qui tourne toujours et sert d'autres étapes).
    const corps = blocs.find(b => b.nom === JOB_QUI_PORTE_LES_GATES)?.corps ?? ''
    expect(corps).not.toEqual('')
    for (const commande of [COMMANDE, COMMANDE_CHAT]) {
      const etape = corps.split(/^ {6}- /m).find(e => commande.test(e)) ?? ''
      expect(etape).not.toEqual('')
      const condition = etape.match(/^\s{8}if:\s*(.+)$/m)?.[1]?.trim()
      expect(condition).toBeDefined()
      expect(condition).not.toMatch(/^false$/)
      expect(condition).toMatch(/needs\.changes\.outputs\./)
    }
  })

  it('un job lance la porte de qualité IA du CHAT (#2899/#2443.7)', () => {
    if (lanceursChat.length === 0) {
      throw new Error(
        [
          'Aucun job de `ci.yml` ne lance `python -m app.eval.chat_gate`.',
          '`chat_gate.py` existe, testé, documenté (#2899/#2443.7) — sans appelant en CI,',
          "c'est le défaut n°1 nommé par CLAUDE.md : du code juste que personne n'appelle.",
        ].join('\n'),
      )
    }
    expect(lanceursChat).toContain(JOB_QUI_PORTE_LES_GATES)
  })

  it('le job qui lance la porte chat est dans les `needs` ET dans la liste `results` de CI Status', () => {
    for (const job of lanceursChat) {
      expect(needs).toContain(job)
      expect(evalues).toContain(job)
    }
  })
})
