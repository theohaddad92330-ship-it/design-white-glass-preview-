import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-128 — le nom d'une fiche du vivier ne se déduit JAMAIS du fichier déposé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `CvIntakeService.intake` écrivait, mesuré le 30/08/2026 :
 *
 *     full_name: candidateName || input.filename.replace(/\.[a-z0-9]+$/i, '')
 *
 * avec, juste au-dessus, le raisonnement qui l'excusait : « le parsing le
 * corrigera, et une fiche `CV_2024_v3` se repère à l'œil ». Les deux moitiés du
 * raisonnement étaient fausses :
 *
 *  - `candidateName` valait TOUJOURS `''` — l'écran de dépôt n'envoie pas
 *    `fullName`, ni en unitaire ni en lot ;
 *  - le parsing ne corrigeait RIEN — l'étape de relecture écartait
 *    explicitement le bloc `identity` (« rien à écrire aujourd'hui »).
 *
 * Le repli « temporaire » était donc l'état PERMANENT, et **toute** fiche née
 * d'un CV portait le nom de son fichier. C'est une valeur de REMPLISSAGE, ce
 * que le dépôt s'interdit : « un champ illisible vaut `null`, jamais une valeur
 * de remplissage ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE GARDE TIENT — ET CE QU'ELLE NE TIENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit le CHEMIN D'ÉCRITURE : toute expression qui pose `consultants.
 * full_name`, dans le module qui ingère et relit les CV, doit être indépendante
 * du nom de fichier. Elle ne se contente pas de constater qu'une fonction
 * existe — c'est la valeur ÉCRITE qu'elle regarde.
 *
 * ⚠️ Elle est le PENDANT SERVEUR de GA-120
 * (`apps/web/src/architecture/talent-name-is-never-a-filename.test.ts`), qui
 * répare l'AFFICHAGE des fiches déjà nées avec un nom de fichier. Les deux sont
 * nécessaires et aucune ne remplace l'autre : GA-120 empêche de MONTRER un nom
 * de fichier comme un nom, GA-128 empêche d'en ÉCRIRE un. Sans GA-128, l'écran
 * mettrait éternellement un pansement sur une base qui continue de se salir.
 *
 * Ce qu'elle ne peut pas savoir : qu'une variable nommée innocemment porte en
 * réalité un nom de fichier trois appels plus haut. Le filet de sécurité pour
 * ce cas-là est ailleurs et il est exécutable — `readPersonNameFromIdentity`
 * refuse `looks_like_a_file`, et `cv-parse.service.spec.ts` le vérifie sur le
 * vrai chemin de validation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (rejouée le 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Code protégé : remis `full_name: candidateName || input.filename.replace(…)`
 *   dans `cv-intake.service.ts` → ROUGE sur « aucune écriture de `full_name` ne
 *   dépend du fichier déposé », avec le fichier et l'expression fautive.
 * · Corpus : forcé `CONSULTANTS` sur un dossier vide → ROUGE sur « la garde LIT
 *   un corpus non vide », avant toute autre assertion.
 */

const CONSULTANTS = join(__dirname, '..', 'modules', 'consultants')

/** La colonne surveillée, et les deux formes sous lesquelles on l'écrit. */
const NAME_COLUMN = 'full_name'

/**
 * Les marques d'un NOM DE FICHIER dans une expression.
 *
 * `filename` est la seule variable du module qui en porte un ; le retrait
 * d'extension est le geste qui le déguise en nom de personne.
 */
const FILE_MARKS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /\bfilename\b/, label: 'le nom du fichier déposé' },
  { pattern: /\bfileName\b/, label: 'le nom du fichier déposé' },
  { pattern: /\boriginalname\b/i, label: 'le nom du fichier reçu par le transport' },
]

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full))
      continue
    }
    if (!name.endsWith('.ts')) continue
    if (name.endsWith('.spec.ts') || name.endsWith('.test.ts')) continue
    out.push(full)
  }
  return out
}

/**
 * Neutralise commentaires et chaînes AVANT toute analyse, SANS DÉCALER.
 *
 * Sans cette passe, la garde lirait ses propres docblocks : ce fichier-ci
 * CITE l'expression fautive pour l'expliquer, et une garde qui se déclenche sur
 * la description du défaut qu'elle corrige est une garde qu'on désamorce le
 * jour même. Les longueurs et les sauts de ligne sont conservés pour que les
 * positions restent justes.
 */
function stripLiteralsAndComments(source: string): string {
  let out = ''
  let i = 0
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ')
  while (i < source.length) {
    const two = source.slice(i, i + 2)
    if (two === '//') {
      const end = source.indexOf('\n', i)
      const stop = end === -1 ? source.length : end
      out += blank(source.slice(i, stop))
      i = stop
      continue
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      out += blank(source.slice(i, stop))
      i = stop
      continue
    }
    const quote = source[i] as string
    if (quote === "'" || quote === '"' || quote === '`') {
      let j = i + 1
      let closed = false
      while (j < source.length) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === quote) {
          closed = true
          break
        }
        // JavaScript interdit le saut de ligne dans `'…'` et `"…"` : s'arrêter
        // là borne le dégât à une ligne au lieu de laisser une apostrophe
        // ouvrir une chaîne qui court jusqu'à la fin du fichier.
        if (quote !== '`' && source[j] === '\n') break
        j += 1
      }
      const end = Math.min(j, source.length)
      out += quote + blank(source.slice(i + 1, end)) + (closed ? quote : '')
      i = closed ? end + 1 : end
      continue
    }
    out += quote
    i += 1
  }
  return out
}

/**
 * Toutes les expressions qui posent une VALEUR sur `full_name`.
 *
 * Les deux formes, parce que le dépôt utilise les deux : la clé d'un littéral
 * (`full_name: <expr>`) et l'affectation sur un patch ou une ligne chargée
 * (`patch.full_name = <expr>`). Ne lire que la première rendrait la garde
 * borgne sur `cv-parse.service.ts`, qui écrit par la seconde.
 *
 * L'expression s'arrête à la première virgule, au premier point-virgule ou au
 * premier saut de ligne rencontré À PROFONDEUR NULLE — un `replace(/…/, '')`
 * contient une virgule qui ne termine rien, et couper dessus ferait perdre la
 * moitié du code à examiner.
 */
function nameWriteExpressions(code: string): string[] {
  const found: string[] = []
  const write = new RegExp(`\\b${NAME_COLUMN}\\s*(?::|=(?!=))`, 'g')
  let match: RegExpExecArray | null
  while ((match = write.exec(code)) !== null) {
    let i = match.index + match[0].length
    let depth = 0
    const start = i
    while (i < code.length) {
      const ch = code[i] as string
      if (ch === '(' || ch === '[' || ch === '{') depth += 1
      else if (ch === ')' || ch === ']' || ch === '}') {
        if (depth === 0) break
        depth -= 1
      } else if (depth === 0 && (ch === ',' || ch === ';' || ch === '\n')) break
      i += 1
    }
    const expression = code.slice(start, i).trim()
    if (expression) found.push(expression)
  }
  return found
}

/** Les écritures de `full_name` qui dépendent du fichier déposé. */
function offenders(source: string): { expression: string; mark: string }[] {
  const out: { expression: string; mark: string }[] = []
  for (const expression of nameWriteExpressions(stripLiteralsAndComments(source))) {
    for (const { pattern, label } of FILE_MARKS) {
      // ⚠️ Aucun drapeau `g` sur ces motifs : `RegExp.test` avec `g` est
      // STATEFUL (`lastIndex` survit d'un appel à l'autre) et rendrait la garde
      // aveugle un appel sur deux.
      if (pattern.test(expression)) {
        out.push({ expression, mark: label })
        break
      }
    }
  }
  return out
}

describe('GA-128 — le nom d’une fiche ne vient jamais du nom du fichier', () => {
  const files = tsFiles(CONSULTANTS)
  const sources = new Map(files.map(file => [file.slice(CONSULTANTS.length + 1), readFileSync(file, 'utf8')]))

  /* --- 0. La garde LIT quelque chose --- */

  it('LIT un corpus non vide — et ce sont bien les fichiers qu’on croit lire', () => {
    // Une garde qui ne lit rien est verte pour toujours. Trois vérifications et
    // pas une : des fichiers, LE fichier du défaut fondateur, et des écritures
    // de `full_name` réellement extraites. La première seule passerait avec un
    // extracteur cassé.
    expect(files.length).toBeGreaterThan(20)
    expect([...sources.keys()]).toContain('cv-intake.service.ts')
    expect([...sources.keys()]).toContain('cv-parse.service.ts')

    const written = [...sources.values()].flatMap(source => nameWriteExpressions(stripLiteralsAndComments(source)))
    // L'ingestion en pose une, la relecture une autre, la mise à jour une
    // troisième. Si ce compte tombe à zéro, c'est l'extracteur qui est cassé,
    // pas le dépôt qui est devenu propre.
    expect(written.length).toBeGreaterThanOrEqual(3)
  })

  /* --- 1. La garde sait dire NON --- */

  it('sait voir le défaut fondateur, dans sa forme EXACTE', () => {
    const fautif = `
      this.consultants.create({
        workspace_id: workspaceId,
        full_name: candidateName || input.filename.replace(/\\.[a-z0-9]+$/i, ''),
        kind: input.kind,
      })
    `
    expect(offenders(fautif)).toEqual([
      { expression: "candidateName || input.filename.replace(/\\.[a-z0-9]+$/i, '')", mark: 'le nom du fichier déposé' },
    ])
  })

  it('sait voir la MUTATION d’une ligne, pas seulement un littéral', () => {
    // L'angle mort classique de ce dépôt : un writer qui mute l'entité au lieu
    // de passer un patch était invisible de `no-blind-record-writes` pendant
    // qu'il écrasait des corrections.
    expect(offenders('talent.full_name = document.filename').map(o => o.mark)).toEqual(['le nom du fichier déposé'])
    expect(offenders('patch.full_name = deriveFrom(fileName)').map(o => o.mark)).toEqual(['le nom du fichier déposé'])
  })

  it('ne coupe PAS l’expression sur une virgule interne', () => {
    // Un extracteur qui s'arrête au premier `,` ne verrait que
    // `candidateName || input.filename.replace(/…/` et raterait la moitié des
    // formes. C'est exactement le défaut « extracteur coupé à la flèche ».
    const [expression] = nameWriteExpressions("full_name: pick(a, b) || other.replace(/x/, ''),")
    expect(expression).toBe("pick(a, b) || other.replace(/x/, '')")
  })

  it('ne se déclenche PAS sur un commentaire ni sur une chaîne', () => {
    // Ce fichier-ci CITE le défaut pour l'expliquer. Une garde qui se
    // déclenche sur sa propre documentation se fait désamorcer le jour même.
    expect(offenders("// full_name: input.filename.replace(/x/, '')")).toEqual([])
    expect(offenders("const message = 'full_name: filename'")).toEqual([])
  })

  it('laisse passer une écriture qui ne doit RIEN au fichier', () => {
    expect(offenders('full_name: candidateName || null')).toEqual([])
    expect(offenders('patch.full_name = read.name')).toEqual([])
  })

  /* --- 2. La règle, sur le vrai dépôt --- */

  it('aucune écriture de `full_name` ne dépend du fichier déposé', () => {
    // Si ce test tombe : le nom d'une personne vient d'être déduit d'un nom de
    // fichier. La réponse n'est jamais un autre repli — ni `''`, ni « Inconnu »,
    // ni le fichier amputé de son extension — mais `null`, et l'écran le dit
    // (« Nom non renseigné », GA-120).
    const faults = [...sources.entries()].flatMap(([file, source]) =>
      offenders(source).map(o => `${file} : ${NAME_COLUMN} ← ${o.mark} (${o.expression})`),
    )
    expect(faults).toEqual([])
  })
})
