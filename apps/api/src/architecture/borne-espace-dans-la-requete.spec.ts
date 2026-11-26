import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/**
 * GA-380 — un contrôle de portée ne s'écrit pas avec un `&&` qui s'effondre
 * (#2671, finding pentest #2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME REFUSÉE, ET CE QU'ELLE A COÛTÉ
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *     const row = await repo.findOne({ where: { id } })        // lecture NUE
 *     if (!row || (workspaceId && row.workspace_id !== workspaceId)) return null
 *
 * Le second terme n'est évalué que si `workspaceId` est vrai. Quand il vaut
 * `null`, la comparaison SAUTE : l'appelant touche la ligne de n'importe quel
 * espace. C'est le finding pentest #2 (HAUTE, cloisonnement), documenté dans
 * `consultant-scope.ts` — CV Studio laissait fuir le `cv_text` complet d'une
 * fiche sans espace d'une AUTRE ESN.
 *
 * Le motif est revenu TROIS fois pendant l'issue #2671, dans trois modules qui
 * ne se connaissent pas : `SkillAliasService.decide` (trancher un alias pour
 * une autre ESN, et le verser dans la bibliothèque partagée),
 * `ActivitiesService.resolveTargets` (écrire une activité pointant le contact
 * d'une autre ESN), `DeliveryService.moveBoardCard` (déplacer la carte d'une
 * autre ESN). Aucune exploitation n'a été démontrée à chaque fois — la
 * garantie tenait à la discipline de l'appelant, jamais à la fonction. C'est
 * exactement ce qu'une garde existe pour arrêter : la troisième fois.
 *
 * LA RÈGLE : la borne d'espace va DANS la requête
 * (`where: { id, workspace_id: workspaceId }`) et l'absence d'espace fait
 * REFUSER, elle n'ouvre rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne juge que la forme qui S'EFFONDRE (`x && …!== x`). Une comparaison
 * FRANCHE (`row.workspace_id !== workspaceId`) reste permise : elle ne saute
 * jamais, et l'interdire reviendrait à interdire toute vérification en mémoire.
 *
 * Elle LIT LE CODE, pas la prose : les commentaires sont retirés avant l'examen.
 * Sans ça, elle accuserait les trois docblocs qui DÉCRIVENT le défaut corrigé —
 * une garde qui punit l'explication du défaut se fait désactiver dans la
 * semaine. Un test le prouve, et le corpus réel en contient au moins un.
 */

const API_SRC = resolve(__dirname, '..')

type Fichier = { chemin: string; contenu: string }

const COMMENTAIRE_BLOC = /\/\*[\s\S]*?\*\//g
const COMMENTAIRE_LIGNE = /(^|[^:'"`])\/\/.*$/gm

/**
 * Le code SEUL. Les commentaires deviennent des espaces (jamais supprimés) pour
 * que les numéros de ligne restent vrais dans le message d'erreur.
 */
function sansCommentaires(source: string): string {
  return source
    .replace(COMMENTAIRE_BLOC, bloc => bloc.replace(/[^\n]/g, ' '))
    .replace(COMMENTAIRE_LIGNE, (tout, avant: string) => avant + ' '.repeat(tout.length - avant.length))
}

/** `<var> && <qqch>.<colonne de portée> !== <le MÊME var>` */
const PREDICAT_QUI_S_EFFONDRE =
  /\b(\w*(?:workspaceId|userId|ownerId|workspace_id|user_id))\b\s*&&\s*[\w.?[\]']{1,40}\.(workspace_id|user_id|owner_id)\s*!==?\s*\1\b/g

function predicatsQuiSEffondrent(fichiers: Fichier[]): string[] {
  const violations: string[] = []
  for (const fichier of fichiers) {
    const code = sansCommentaires(fichier.contenu)
    for (const trouve of code.matchAll(PREDICAT_QUI_S_EFFONDRE)) {
      const ligne = code.slice(0, trouve.index).split('\n').length
      violations.push(
        `${fichier.chemin}:${ligne} — \`${trouve[0].trim()}\` : ce contrôle de portée SAUTE quand ` +
          `\`${trouve[1]}\` est absent, et la ligne d'un autre espace passe. Mets la borne DANS la requête ` +
          `(\`where: { id, workspace_id: workspaceId }\`) et refuse sans espace (#2671, finding pentest #2).`,
      )
    }
  }
  return violations
}

/** Tous les `.ts` de `apps/api/src`, tests exclus — chemins relatifs à `src`. */
function corpusApi(): Fichier[] {
  const fichiers: Fichier[] = []
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const complet = join(dossier, entree.name)
      if (entree.isDirectory()) {
        if (entree.name === 'node_modules' || entree.name === 'dist' || entree.name === 'migrations') continue
        parcourir(complet)
        continue
      }
      if (!entree.name.endsWith('.ts')) continue
      if (/\.(spec|test)\.ts$/.test(entree.name)) continue
      fichiers.push({ chemin: relative(API_SRC, complet), contenu: readFileSync(complet, 'utf8') })
    }
  }
  parcourir(API_SRC)
  return fichiers
}

describe('GA-380 — la borne d’espace va dans la requête, pas dans un `&&` qui s’effondre', () => {
  const faux = (chemin: string, contenu: string): Fichier => ({ chemin, contenu })

  it('sait dire NON — le prédicat exact des trois défauts de #2671', () => {
    const violations = predicatsQuiSEffondrent([
      faux(
        'modules/x/x.service.ts',
        'const row = await repo.findOne({ where: { id } })\n' +
          'if (!row || (workspaceId && row.workspace_id !== workspaceId)) return null\n',
      ),
    ])
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('x.service.ts:2')
    expect(violations[0]).toContain('workspace_id')
  })

  it('attrape la même forme sur `user_id`, et sur une comparaison faible', () => {
    expect(
      predicatsQuiSEffondrent([faux('a.ts', 'if (userId && activity.user_id !== userId) throw new Error()')]),
    ).toHaveLength(1)
    expect(
      predicatsQuiSEffondrent([faux('b.ts', 'if (workspaceId && mission.workspace_id != workspaceId) return null')]),
    ).toHaveLength(1)
  })

  it('n’attrape PAS une comparaison franche — elle ne saute jamais', () => {
    // Vérifier en mémoire reste permis : ce qui est refusé, c'est le `&&` qui
    // fait disparaître la vérification.
    expect(predicatsQuiSEffondrent([faux('c.ts', 'if (mission.workspace_id !== workspaceId) return null')])).toEqual([])
  })

  it('LIT LE CODE, pas la prose — le même prédicat en commentaire n’accuse personne', () => {
    // Les trois correctifs de #2671 DÉCRIVENT le défaut dans leur commentaire.
    // Une garde qui les accuserait se ferait désactiver dans la semaine.
    const enCommentaire = faux(
      'd.ts',
      '// l’ancienne forme `workspaceId && row.workspace_id !== workspaceId` s’effondrait\nreturn 1\n',
    )
    expect(predicatsQuiSEffondrent([enCommentaire])).toEqual([])

    const enBloc = faux('e.ts', '/**\n * `workspaceId && row.workspace_id !== workspaceId`\n */\nreturn 1\n')
    expect(predicatsQuiSEffondrent([enBloc])).toEqual([])
  })

  it('la garde lit un corpus RÉEL, qui contient au moins une de ces phrases en commentaire', () => {
    // Le contrôle qui rend le vert final crédible : sans corpus, ou sans
    // retrait des commentaires, ce test tombe.
    const corpus = corpusApi()
    expect(corpus.length).toBeGreaterThan(500)

    const avecLaPhrase = corpus.filter(fichier => PREDICAT_QUI_S_EFFONDRE.test(fichier.contenu))
    PREDICAT_QUI_S_EFFONDRE.lastIndex = 0
    expect(avecLaPhrase.length).toBeGreaterThan(0)
    for (const fichier of avecLaPhrase) {
      expect(predicatsQuiSEffondrent([fichier])).toEqual([])
    }
  })

  it('aucun contrôle de portée qui s’effondre dans `apps/api/src`', () => {
    const violations = predicatsQuiSEffondrent(corpusApi())
    if (violations.length > 0) {
      throw new Error(['Cloisonnement des espaces — #2671 :', ...violations.map(ligne => `  · ${ligne}`)].join('\n'))
    }
    expect(violations).toEqual([])
  })
})

/**
 * #2671.5 — la même règle, sur sa forme la plus nue : une lecture PAR ID SEUL.
 *
 * Le module contacts lisait le compte d'un contact par `where: { id }` à cinq
 * endroits (score, classement, démo, cadence). Aucun ne prenait l'id du client
 * directement — c'est toujours l'`account_id` d'un contact lu sous sa borne —
 * mais la garantie tenait, là encore, à la discipline de l'appelant. Dans
 * `modules/contacts/`, toute lecture `findOne({ where: { id } })` /
 * `findOneBy({ id })` porte désormais sa borne DANS la requête.
 *
 * Portée volontairement étroite : le module contacts, où chaque ligne est de la
 * donnée d'espace. Ailleurs (backoffice, pipeline d'analyse qui relit SON
 * compte pour en connaître l'espace), une lecture par id seul peut être juste ;
 * une garde qui l'accuserait se ferait désactiver.
 */
const MODULE_CLOISONNE = 'modules/contacts/'

/** `findOne({ where: { id } })`, `findOne({ where: { id: x.y } })`, `findOneBy({ id })` — rien d'autre dans le WHERE. */
const LECTURE_PAR_ID_SEUL =
  /\bfindOne(?:OrFail)?\(\s*\{\s*where:\s*\{\s*id(?:\s*:\s*[\w.?]+)?\s*,?\s*\}|\bfindOneBy(?:OrFail)?\(\s*\{\s*id(?:\s*:\s*[\w.?]+)?\s*,?\s*\}/g

/**
 * Les exceptions, chacune avec sa raison. Un marqueur = un fragment de code qui
 * précède la lecture sur sa ligne ; il nomme ce qu'on lit, pas où.
 */
const LECTURES_PAR_ID_DECLAREES: { fichier: string; marqueur: string; raison: string }[] = [
  {
    fichier: 'modules/contacts/person-erasure.service.ts',
    marqueur: 'getRepository(WorkspaceEntity)',
    raison: 'lit l’ESPACE lui-même par l’id de l’espace actif résolu — la borne, c’est la ligne',
  },
]

function lecturesParIdSeul(fichiers: Fichier[], declarees = LECTURES_PAR_ID_DECLAREES): string[] {
  const violations: string[] = []
  for (const fichier of fichiers) {
    if (!fichier.chemin.startsWith(MODULE_CLOISONNE)) continue
    const code = sansCommentaires(fichier.contenu)
    const lignes = code.split('\n')
    for (const trouve of code.matchAll(LECTURE_PAR_ID_SEUL)) {
      const ligne = code.slice(0, trouve.index).split('\n').length
      const texteLigne = lignes[ligne - 1] ?? ''
      const excuse = declarees.some(d => d.fichier === fichier.chemin && texteLigne.includes(d.marqueur))
      if (excuse) continue
      violations.push(
        `${fichier.chemin}:${ligne} — \`${trouve[0].replace(/\s+/g, ' ').trim()}\` lit PAR ID SEUL : ` +
          `ajoute la borne d'espace dans la requête (\`workspace_id: …\`), ou déclare la lecture avec sa raison (#2671.5).`,
      )
    }
  }
  return violations
}

describe('GA-380 (#2671.5) — le module contacts ne lit jamais une ligne par id seul', () => {
  const faux = (chemin: string, contenu: string): Fichier => ({ chemin, contenu })

  it('sait dire NON — la lecture exacte corrigée par #2671.5', () => {
    const violations = lecturesParIdSeul([
      faux(
        'modules/contacts/contacts.service.ts',
        'const x = 1\nconst account = await this.accounts.findOne({ where: { id: contact.account_id } })\n',
      ),
      faux('modules/contacts/cadence.service.ts', 'await this.accounts.findOne({\n  where: { id },\n  select: [] })'),
      faux('modules/contacts/z.service.ts', 'await repo.findOneBy({ id: accountId })'),
    ])
    expect(violations).toHaveLength(3)
    expect(violations[0]).toContain('contacts.service.ts:2')
    expect(violations[1]).toContain('cadence.service.ts:1')
  })

  it('n’attrape PAS une lecture bornée, ni hors du module, ni la prose', () => {
    expect(
      lecturesParIdSeul([
        faux('modules/contacts/a.ts', 'findOne({ where: { id, workspace_id: workspaceId } })'),
        faux('modules/contacts/b.ts', 'findOne({ where: { id: c.account_id, ...workspaceScopeWhere(ws) } })'),
        faux('modules/contacts/c.ts', 'findOne({ where: { id, user_id: userId, deleted_at: IsNull() } })'),
        faux('modules/admin/d.ts', 'findOne({ where: { id } })'),
        faux('modules/contacts/e.ts', '// ancienne forme : findOne({ where: { id } })\nreturn 1'),
      ]),
    ).toEqual([])
  })

  it('une exception DÉCLARÉE passe ; la même lecture sans son marqueur rougit', () => {
    const declaree = faux(
      'modules/contacts/person-erasure.service.ts',
      'const w = await ds.getRepository(WorkspaceEntity).findOne({ where: { id: workspaceId } })',
    )
    expect(lecturesParIdSeul([declaree])).toEqual([])
    const autre = faux(
      'modules/contacts/person-erasure.service.ts',
      'const c = await ds.getRepository(ContactEntity).findOne({ where: { id: contactId } })',
    )
    expect(lecturesParIdSeul([autre])).toHaveLength(1)
  })

  it('lit un corpus RÉEL : le module contacts y est, et l’exception déclarée y existe encore', () => {
    const contacts = corpusApi().filter(fichier => fichier.chemin.startsWith(MODULE_CLOISONNE))
    expect(contacts.length).toBeGreaterThan(20)
    // Sans exceptions, la garde doit voir au moins la lecture déclarée — preuve
    // qu'elle attrape le motif sur le vrai code, pas seulement sur des faux.
    expect(lecturesParIdSeul(contacts, []).length).toBeGreaterThanOrEqual(LECTURES_PAR_ID_DECLAREES.length)
  })

  it('aucune lecture par id seul dans `modules/contacts/`', () => {
    const violations = lecturesParIdSeul(corpusApi())
    if (violations.length > 0) {
      throw new Error(['Cloisonnement des espaces — #2671.5 :', ...violations.map(ligne => `  · ${ligne}`)].join('\n'))
    }
    expect(violations).toEqual([])
  })
})
