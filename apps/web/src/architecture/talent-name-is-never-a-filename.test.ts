/**
 * GA-120 — le vivier n'affiche JAMAIS un identifiant technique à la place d'un
 * nom de personne.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Recette live du 30/08, écran Vivier, en PRODUCTION : une fiche portait
 *
 *     cv_anonyme_louis_ai-engineer-node_gw   ·   AI Engineer   ·   Full remote
 *
 * à la place du nom d'une personne. C'est le nom du FICHIER déposé, rendu tel
 * quel là où l'écran attend une identité.
 *
 * La cause est en amont et elle est mesurée : `cv-intake.service.ts` écrit
 * `full_name: candidateName || input.filename.replace(/\.[a-z0-9]+$/i, '')`,
 * le dépôt de CV du web n'envoie jamais `fullName`, et l'étape de relecture
 * (`/parse/commit`) écarte explicitement la détection `identity`. Aucun chemin
 * n'écrit donc jamais un nom EXTRAIT : toute fiche née d'un CV porte le nom de
 * son fichier. C'est une valeur de remplissage, ce que le dépôt s'interdit.
 *
 * ⚠️ Cette garde ne répare pas l'écriture (autre lot, côté API). Elle tient la
 * moitié qui revient à l'écran, et elle la tient là où elle se perd : **d'OÙ
 * VIENT le texte affiché**. Une garde qui vérifierait « la fiche affiche un
 * texte » serait borgne — c'est exactement ce que faisait l'écran fautif.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE INTERDIT
 * ─────────────────────────────────────────────────────────────────────────
 *  1. rendre `.fullName` / `.full_name` DIRECTEMENT dans du JSX ;
 *  2. le passer à une prop ou à une interpolation qui PORTE un nom
 *     (`name:`, `talentName=`, `consultantName=`, `pageTitle=`, `full_name:`).
 *
 * Le seul chemin autorisé est `readTalentName` / `talentNameText`, qui décident
 * — au même endroit pour tout l'écran — si la valeur stockée est un nom ou le
 * nom d'un fichier.
 *
 * ⚠️ Elle retire les commentaires avant de lire : un docblock qui CITE la forme
 * fautive (celui-ci, par exemple) la ferait tomber, et la seule façon de
 * documenter la règle deviendrait de ne pas la documenter — défaut déjà payé
 * sur GA-08, GA-19 et GA-25.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readTalentName, talentNameText } from '@/features/consultants/lib/talentName'

const WEB_SRC = join(__dirname, '..')
const VIEW_DIR = join(WEB_SRC, 'features', 'consultants', 'view')
const NAME_MODULE = join(WEB_SRC, 'features', 'consultants', 'lib', 'talentName.ts')
const FR = join(WEB_SRC, 'i18n', 'locales', 'fr', 'consultants.json')
const EN = join(WEB_SRC, 'i18n', 'locales', 'en', 'consultants.json')

/** Les props et clés d'interpolation qui PORTENT un nom de personne. */
const NAME_CARRIERS = ['name', 'talentName', 'consultantName', 'pageTitle', 'full_name']

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Tous les `.tsx` de l'écran Vivier, les tests exceptés. */
function viewFiles(dir: string = VIEW_DIR): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...viewFiles(path))
    else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) found.push(path)
  }
  return found
}

/**
 * Un nom rendu BRUT dans du JSX : `{row.fullName}`.
 *
 * ⚠️ Le `(^|[^=])` écarte les positions d'ATTRIBUT (`value={form.full_name}`,
 * la saisie du formulaire, qui est le seul endroit où la valeur stockée doit
 * apparaître telle quelle) — celles-là sont jugées par `rawNameCarriers`, qui
 * regarde le NOM de la prop.
 */
function rawNameRenders(source: string): string[] {
  return [...stripComments(source).matchAll(/(^|[^=])\{\s*[A-Za-z_$][\w$.]*\.(?:fullName|full_name)\s*\}/gm)].map(
    // Le caractère qui précède sert à écarter les positions d'attribut ; il ne
    // fait pas partie du rendu qu'on montre à qui lit l'échec.
    match => match[0].trim().replace(/^[^{]*/, ''),
  )
}

/** Un nom passé à une prop ou une clé qui porte une identité. */
function rawNameCarriers(source: string): string[] {
  const pattern = new RegExp(
    `\\b(?:${NAME_CARRIERS.join('|')})\\s*[:=]\\s*\\{?\\s*[A-Za-z_$][\\w$.]*\\.(?:fullName|full_name)\\b`,
    'g',
  )
  return [...stripComments(source).matchAll(pattern)].map(match => match[0].trim())
}

describe('GA-120 — la garde lit bien quelque chose', () => {
  it('le corpus existe : l’écran, la décision, les deux dictionnaires', () => {
    // Un chemin devenu faux rendrait « 0 rendu brut » et passerait au vert pour
    // toujours — le faux zéro silencieux, pas une preuve.
    for (const file of [NAME_MODULE, FR, EN]) {
      expect(existsSync(file), `corpus introuvable : ${file}`).toBe(true)
    }
    expect(viewFiles().length).toBeGreaterThanOrEqual(8)
  })

  it('les fichiers gardés parlent bien de noms de talents', () => {
    // Sans cette borne, un extracteur cassé ou un dossier vidé se lirait
    // « rien à garder ».
    const sources = viewFiles().map(file => readFileSync(file, 'utf8'))
    const mentions = sources.filter(source => /\.(fullName|full_name)\b/.test(source)).length
    expect(mentions, 'aucun fichier du vivier ne lit un nom de talent').toBeGreaterThanOrEqual(4)
    const decided = sources.filter(source => /\b(readTalentName|talentNameText)\(/.test(source)).length
    expect(decided, 'plus personne ne passe par la décision').toBeGreaterThanOrEqual(4)
  })
})

describe('GA-120 — la garde sait dire NON', () => {
  it('repère la forme EXACTE qui posait le défaut', () => {
    expect(rawNameRenders('<Text>{row.fullName}</Text>')).toEqual(['{row.fullName}'])
    expect(rawNameRenders('  {talent.full_name}\n')).toEqual(['{talent.full_name}'])
    expect(rawNameCarriers("t('delete.title', { name: deleting.fullName })")).toEqual(['name: deleting.fullName'])
    expect(rawNameCarriers('<CustomerPage pageTitle={talent.full_name} />')).toEqual(['pageTitle={talent.full_name'])
  })

  it('laisse passer le chemin autorisé, et lui seul', () => {
    expect(rawNameRenders('<Text>{talentNameText(row.fullName, t("name.unnamed"))}</Text>')).toEqual([])
    expect(rawNameRenders("{displayed.kind === 'named' ? displayed.name : t('name.unnamed')}")).toEqual([])
    expect(rawNameCarriers("t('x', { name: talentNameText(match.fullName, unnamed) })")).toEqual([])
    // La SAISIE du formulaire est la seule position où la valeur stockée doit
    // apparaître telle quelle : c'est ce qu'on corrige, pas ce qu'on affiche.
    expect(rawNameRenders('<Input value={form.full_name} />')).toEqual([])
    // Un commentaire qui cite la forme fautive n'est pas un rendu.
    expect(rawNameRenders('/* avant : {row.fullName} */')).toEqual([])
    expect(rawNameCarriers('// avant : name: row.fullName')).toEqual([])
    // `fullName:` n'est pas la clé `name:` — le mot est inclus dedans.
    expect(rawNameCarriers('fullName: row.fullName')).toEqual([])
  })
})

describe('GA-120 — aucun identifiant technique ne tient lieu de nom', () => {
  it('aucun écran du vivier ne rend un nom stocké sans passer par la décision', () => {
    // Si ce test tombe : ton écran affiche `full_name` tel qu'il est en base, et
    // la base y met le nom du FICHIER déposé quand personne n'a saisi de nom.
    // La réponse est `readTalentName` / `talentNameText`, jamais un rendu direct.
    const offenders = viewFiles().flatMap(file => {
      const source = readFileSync(file, 'utf8')
      return [...rawNameRenders(source), ...rawNameCarriers(source)].map(hit => `${file} → ${hit}`)
    })
    expect(offenders, `noms rendus bruts :\n${offenders.join('\n')}`).toEqual([])
  })

  it('la décision refuse un nom de fichier et ne le déguise pas', () => {
    // La règle elle-même, exécutée : ce qui vient d'un fichier ne devient pas
    // un nom, et le fichier reste comme REPÈRE annoncé comme tel.
    expect(readTalentName('cv_anonyme_louis_ai-engineer-node_gw')).toEqual({
      kind: 'unnamed',
      deposited: 'cv_anonyme_louis_ai-engineer-node_gw',
    })
    expect(talentNameText('cv_anonyme_louis_ai-engineer-node_gw', 'Nom non renseigné')).toBe('Nom non renseigné')
    // …et elle n'efface personne : un vrai nom reste un vrai nom.
    expect(talentNameText('Yanis Berthier', 'Nom non renseigné')).toBe('Yanis Berthier')
  })
})

describe('GA-120 — les mots de l’absence existent dans les deux langues', () => {
  it.each(['fr', 'en'])('%s dit l’absence de nom, et nomme le fichier comme un fichier', lang => {
    const dict = JSON.parse(readFileSync(lang === 'fr' ? FR : EN, 'utf8')) as {
      name?: { unnamed?: string; fromFile?: string }
    }
    expect(dict.name?.unnamed?.trim().length ?? 0, `name.unnamed manquant en ${lang}`).toBeGreaterThan(0)
    expect(dict.name?.fromFile ?? '', `name.fromFile manquant en ${lang}`).toContain('{{file}}')
    // Le repère est annoncé comme un FICHIER : sans ce mot, on aurait remplacé
    // un identifiant déguisé en nom par un identifiant déguisé en autre chose.
    expect(dict.name?.fromFile ?? '').toMatch(lang === 'fr' ? /[Ff]ichier/ : /[Ff]ile/)
  })
})
