import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ESN_DIRECTORY_DB_GENERATED, ESN_DIRECTORY_UNWRITTEN } from './unwritten-columns'

/**
 * La garde du référentiel ESN : une colonne est ÉCRITE, ou elle est DÉCLARÉE
 * sans écrivain avec sa raison. Jamais entre les deux.
 *
 * Le défaut visé est celui que le dépôt paie le plus souvent : du code juste,
 * calculé, testé, que personne n'appelle. Ici il prend sa forme la plus
 * discrète — une colonne dont le repli est honnête. `risk_flag` vaut `aucun`
 * partout, donc `overflowScore` n'exclut personne, donc l'écran ne dit rien, et
 * trois exigences (S12, PAR-04, le refus de proposer une ESN en procédure
 * collective) se croient tenues.
 *
 * Cette garde échoue dans les DEUX sens, et c'est ce qui l'empêche de devenir
 * une liste d'excuses :
 *  · une colonne sans écrivain et non déclarée la fait tomber ;
 *  · une colonne DÉCLARÉE que quelqu'un s'est mis à écrire la fait tomber
 *    aussi — la liste rétrécit, elle ne s'allonge pas.
 *
 * ⚠️ Sa limite, écrite plutôt que supposée. Elle procède en DEUX temps : elle
 * isole d'abord les fichiers qui écrivent réellement dans `esn_directory` (SQL
 * brut sur la table, ou dépôt de `EsnDirectoryEntity` suivi d'un appel
 * d'écriture), puis elle y cherche la colonne en position d'AFFECTATION
 * (`clé:` d'objet, ou `colonne =` de SQL). Une première version tentait de
 * découper les seuls arguments des appels d'écriture — elle ratait le semis,
 * qui construit son objet dans un `.map()` en amont du `.values()`. Le prix de
 * ce choix est nommé : une clé d'objet portant le nom d'une colonne DANS un
 * fichier écrivain compterait comme une écriture même si elle n'en est pas une
 * (aujourd'hui : zéro cas, les objets voisins de `territory-watch` portent les
 * colonnes de `territory_snapshots`, qui ne recoupent pas celles-ci). Un
 * `where: { … }` de LECTURE, lui, ne peut porter que des colonnes par ailleurs
 * écrites — c'est ce qui rend l'approximation tolérable ici et nulle part
 * automatiquement ailleurs.
 */

const SRC = join(__dirname, '..', '..')
const ENTITY = join(SRC, 'database', 'entities', 'esn-directory.entity.ts')

/** Les colonnes de l'entité, LUES DANS l'entité — jamais recopiées à la main :
 *  une liste recopiée oublie la colonne ajoutée demain, qui est précisément
 *  celle qui risque de rester morte. */
function entityColumns(file: string): { property: string; column: string }[] {
  const out: { property: string; column: string }[] = []
  let decorator = ''
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/@(Column|PrimaryGeneratedColumn|CreateDateColumn|UpdateDateColumn)\(/.test(line)) {
      decorator = line
      continue
    }
    if (!decorator) continue
    const property = /^\s*([a-zA-Z]\w*)!?\??:/.exec(line)
    if (!property) continue
    const named = /name:\s*'([^']+)'/.exec(decorator)
    out.push({ property: property[1] as string, column: named ? (named[1] as string) : (property[1] as string) })
    decorator = ''
  }
  return out
}

/** Retire les commentaires AVANT de chercher une écriture — leçon GA-08. Une
 *  colonne citée dans un docblock (« RIEN ne l'écrit ») se lirait comme un
 *  écrivain, et la garde passerait au vert sur sa propre prose. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/**
 * Le PRODUIT, et lui seul : ni le semis de démonstration — qui remplirait la
 * salle et laisserait tous les clients à vide —, ni les migrations, qui CRÉENT
 * la colonne sans donner le moyen de la renseigner.
 */
const PRODUCT_FILES = sourceFiles(SRC).filter(
  file => !file.includes(`${'src'}/migrations/`) && !file.includes(`${'modules'}/demo/`) && file !== ENTITY,
)

/**
 * Les fichiers qui écrivent RÉELLEMENT dans `esn_directory`.
 *
 * La restriction est le cœur de la garde : `territory.controller.ts` porte un
 * `riskFlag:` — c'est une LECTURE qu'il passe au score de débordement. Le
 * compter ferait passer pour écrite la colonne même dont l'absence d'écrivain
 * désarme trois exigences.
 */
function writerFiles(files: string[]): string[] {
  return files.filter(file => {
    const source = stripComments(readFileSync(file, 'utf8'))
    if (/(INSERT INTO|UPDATE)\s+esn_directory\b/i.test(source)) return true
    return /EsnDirectoryEntity/.test(source) && /\.(update|values|insert|save|upsert)\(/.test(source)
  })
}

const COLUMNS = entityColumns(ENTITY)
const WRITER_FILES = writerFiles(PRODUCT_FILES)
const WRITES = WRITER_FILES.map(file => stripComments(readFileSync(file, 'utf8'))).join('\n')

/** La colonne en position d'AFFECTATION : clé d'objet, ou colonne d'un `SET`.
 *  Un `select: ['normalizedName']` ou un `row.hiring90d` ne comptent pas. */
const isWritten = (entry: { property: string; column: string }, corpus: string): boolean =>
  new RegExp(`\\b(${entry.property}|${entry.column})\\b\\s*[:=]`).test(corpus)

describe('le référentiel ESN : une colonne est écrite, ou son absence d’écrivain est DÉCLARÉE', () => {
  it('LIT un corpus non vide — l’entité, les fichiers du produit, les sites d’écriture', () => {
    // Sans ces assertions, une expression régulière cassée par un changement de
    // formatage ferait passer la garde au vert sur zéro colonne et zéro
    // écriture — le motif exact des six gardes borgnes de la semaine dernière.
    expect(COLUMNS.length).toBeGreaterThanOrEqual(30)
    expect(PRODUCT_FILES.length).toBeGreaterThan(100)
    expect(WRITES.length).toBeGreaterThan(200)
  })

  it('voit les TROIS écrivains réels, et EUX SEULS', () => {
    // Trois fichiers écrivent dans cette table : la résolution au registre, la
    // veille territoire et — depuis #3916.b (lot M03, 09/10/2026) — la veille
    // des registres publics, qui pose le risque d'une ESN en procédure
    // collective. Si ce compte change sans que la garde change, c'est qu'un
    // quatrième chemin est apparu — et il faut le lire.
    expect(WRITER_FILES.map(file => file.split('/').pop())).toEqual([
      'esn-directory.service.ts',
      'territory-watch.service.ts',
      'public-registry-watch.ts',
    ])
    // La résolution et le semis (`seed` / `resolvePending` / `applyHierarchy`),
    // en objets TypeORM…
    for (const property of ['resolutionStatus', 'resolutionReason', 'parentName', 'inputName', 'seedSource']) {
      expect(isWritten({ property, column: property }, WRITES)).toBe(true)
    }
    // …et la veille (`refreshBaselines`), en SQL brut et en snake_case.
    for (const column of ['hiring_90d', 'hiring_baseline', 'hiring_refreshed_at']) {
      expect(isWritten({ property: column, column }, WRITES)).toBe(true)
    }
  })

  it('chaque colonne est écrite, posée par la base, ou déclarée sans écrivain', () => {
    const declared = new Set([...ESN_DIRECTORY_DB_GENERATED, ...ESN_DIRECTORY_UNWRITTEN.map(entry => entry.property)])
    const undeclaredAndDead = COLUMNS.filter(entry => !declared.has(entry.property) && !isWritten(entry, WRITES)).map(
      entry => entry.property,
    )
    expect(undeclaredAndDead).toEqual([])
  })

  it('une colonne DÉCLARÉE sans écrivain n’en a toujours pas — sinon la déclaration a péri', () => {
    // Le jour où quelqu'un branche une source (BODACC pour `riskFlag`, la
    // commande publique pour `publicAwards`), ce test tombe et lui demande de
    // RETIRER l'entrée. C'est la seule façon d'empêcher la liste de devenir un
    // registre d'excuses qu'on ne relit plus.
    const revived = ESN_DIRECTORY_UNWRITTEN.filter(entry => {
      const column = COLUMNS.find(item => item.property === entry.property)
      return column && isWritten(column, WRITES)
    }).map(entry => entry.property)
    expect(revived).toEqual([])
  })

  it('chaque déclaration porte un nom de colonne RÉEL et une raison substantielle', () => {
    const properties = new Set(COLUMNS.map(entry => entry.property))
    for (const entry of [...ESN_DIRECTORY_UNWRITTEN.map(item => item.property), ...ESN_DIRECTORY_DB_GENERATED]) {
      // Une exemption sur une colonne qui n'existe plus ment sur ce qui est
      // gardé — c'est la justification périmée, en plus discret.
      expect(properties.has(entry)).toBe(true)
    }
    for (const entry of ESN_DIRECTORY_UNWRITTEN) {
      // « à voir » ne dit pas s'il faut attendre une collecte ou brancher un
      // câble. Une raison courte est une raison qu'on ne pourra pas relire.
      expect(entry.why.length).toBeGreaterThan(80)
    }
  })

  it('#3916.b — le drapeau de risque est SORTI de la liste : le refus PAR-04 / S12 est armé', () => {
    // Il y était tant qu'aucune source BODACC n'était branchée. La veille des
    // registres publics l'écrit désormais (`public-registry-watch.ts`,
    // `syncEsnRisk`) — et SEULEMENT sur preuve : l'absence de procédure n'écrit
    // rien. Le remettre dans la liste ferait mentir la garde d'à côté.
    for (const property of ['riskFlag', 'riskEvidence', 'riskCheckedAt']) {
      expect(ESN_DIRECTORY_UNWRITTEN.find(entry => entry.property === property)).toBeUndefined()
    }
  })

  it('SAIT DIRE NON — une colonne retirée de l’écriture est signalée', () => {
    // La preuve que la garde mord, faite sur un corpus FABRIQUÉ : casser le
    // vrai service pour vérifier, puis le remettre, laisse le dépôt à la merci
    // d'une interruption. Le mécanisme testé est exactement le même.
    const corpus = "UPDATE esn_directory SET resolution_status = 'resolving', risk_flag = 'aucun'"
    const columns = [
      { property: 'resolutionStatus', column: 'resolution_status' },
      { property: 'riskFlag', column: 'risk_flag' },
      { property: 'publicAwards', column: 'public_awards' },
    ]
    expect(columns.filter(entry => !isWritten(entry, corpus)).map(entry => entry.property)).toEqual(['publicAwards'])
    // Et la LECTURE ne compte pas pour une écriture — c'est la distinction que
    // la première version de cette garde avait ratée.
    const readOnly = 'const known = facts.get(name); overflowScore({ offers90d: item.offers }); row.publicAwards'
    expect(isWritten({ property: 'publicAwards', column: 'public_awards' }, readOnly)).toBe(false)
  })
})

describe('#3916.b — esnRisk() a UN appelant, et il n’écrit que sur preuve', () => {
  /**
   * Ce test figeait un fait déplaisant : la fonction qui produit `risk_flag`
   * existait, testée au contrat, et rien ne l'appelait. Elle est branchée par
   * la veille des registres publics (#3916.b) — et le piège que ce bloc nommait
   * reste gardé : l'appeler avec ses trois entrées absentes poserait « vérifié,
   * aucun risque » sur des ESN que personne n'a regardées. L'appelant ne la
   * nourrit donc QUE d'une procédure collective lue au BODACC.
   */
  it('un seul fichier du produit l’appelle, avec une procédure collective', () => {
    expect(PRODUCT_FILES.length).toBeGreaterThan(100)
    const callers = PRODUCT_FILES.filter(file => {
      // `unwritten-columns.ts` NOMME la fonction dans une chaîne ; la compter
      // reviendrait à confondre le constat et le câble.
      if (file.endsWith('unwritten-columns.ts')) return false
      return /\besnRisk\s*\(/.test(stripComments(readFileSync(file, 'utf8')))
    })
    expect(callers.map(file => file.split('/').pop())).toEqual(['public-registry-watch.ts'])
    const source = stripComments(readFileSync(callers[0] as string, 'utf8'))
    expect(source).toMatch(/esnRisk\(\{\s*collectiveProceeding:/)
  })
})
