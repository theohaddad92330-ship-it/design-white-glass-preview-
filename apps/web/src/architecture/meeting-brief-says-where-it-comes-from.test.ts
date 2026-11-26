import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MEETING_BRIEF_BLOCKS,
  MEETING_BRIEF_DERIVED_FROM,
  MEETING_BRIEF_LIMITS,
  MEETING_TYPES,
  MEETING_BRIEF_PROBABLES,
  MEETING_BRIEF_SOURCES,
  MEETING_OUTCOMES,
  MEETING_STANCES,
  decisionRoleSchema,
} from '@bellum/contracts'
import fr from '@/i18n/locales/fr/briefing.json'
import en from '@/i18n/locales/en/briefing.json'

/**
 * GA-146 — un bloc du brief d'avant rendez-vous DIT d'où il vient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le brief se lit à voix haute, en réunion, quelques minutes avant d'entrer.
 * « 17 postes Data ouverts » énoncé sans sa source ni sa date engage celui qui
 * le dit ; suivi de « les offres publiées · relevé du 20/08 », il engage la
 * source. Toute la valeur du brief tient à cette ligne-là.
 *
 * Le type `MeetingBriefGround` la rend obligatoire dans les DONNÉES — un bloc
 * n'existe pas sans origine. Mais un type ne garantit pas qu'il existe une
 * PHRASE pour l'afficher : ajouter une source au contrat et oublier son libellé
 * ferait apparaître à l'écran la clé brute `agenda.brief.source.registry`,
 * c'est-à-dire exactement le « détecté par Bellum » que la règle interdit — en
 * plus laid. C'est déjà arrivé (`menu.title` affiché tel quel en production
 * après le déménagement du catalogue changelog).
 *
 * Cette garde vérifie donc DEUX choses, et elles se complètent :
 *
 *  1. **Chaque valeur fermée du brief a son libellé, en français ET en anglais.**
 *     Une clé manquante d'un seul côté est une régression invisible en local.
 *  2. **Le tri des blocs passe par `buildMeetingBrief`.** C'est lui — et lui
 *     seul — qui retire les blocs incapables de dire d'où ils viennent. Un écran
 *     qui assemblerait ses blocs sans lui les afficherait quand même.
 *
 * ⚠️ Elle ne remplace pas les tests d'unité du contrat, qui vérifient que le
 * verdict est JUSTE (« une source sans date n'est pas une source »). Elle
 * vérifie que ce verdict a un chemin jusqu'à l'écran.
 */

const WEB_SRC = join(__dirname, '..')

/** Le catalogue d'un côté, aplati en chemins pointés (`source.crm`). */
function flatten(node: unknown, prefix = ''): Set<string> {
  const out = new Set<string>()
  if (typeof node !== 'object' || node === null) return out
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') out.add(path)
    else for (const nested of flatten(value, path)) out.add(nested)
  }
  return out
}

const frKeys = flatten((fr as { agenda: { brief: unknown } }).agenda.brief)
const enKeys = flatten((en as { agenda: { brief: unknown } }).agenda.brief)

/** Toutes les valeurs fermées que l'écran doit savoir nommer. */
const REQUIRED: readonly string[] = [
  ...MEETING_BRIEF_BLOCKS.map(key => `block.${key}`),
  ...MEETING_BRIEF_SOURCES.map(key => `source.${key}`),
  ...MEETING_BRIEF_PROBABLES.map(key => `probable.${key}`),
  ...MEETING_BRIEF_DERIVED_FROM.map(key => `derivedFrom.${key}`),
  ...MEETING_STANCES.map(key => `stance.${key}`),
  ...MEETING_OUTCOMES.map(key => `outcome.${key}`),
  // Le chemin d'accès nomme un rôle par personne : la taxonomie MEDDIC du
  // dépôt, valeurs héritées comprises — des lignes anciennes les portent.
  ...decisionRoleSchema.options.map(role => `role.${role}`),
  // Les quatre états de `MeetingBriefGround` qui s'affichent. `unattributed`
  // n'en fait PAS partie : il a déjà fait disparaître le bloc.
  'ground.sourced',
  'ground.mixed',
  'ground.inferred',
  'ground.derived',
  // Les raisons d'un objectif ABSENT. Elles n'appellent pas le même geste.
  'noObjective.internal',
  // #2319.18 — une réunion PERSONNELLE, distincte d'un point interne.
  'noObjective.personal',
  'noObjective.ambiguous',
  'noObjective.unknownRelationship',
  // #2319.31 — une limite sans libellé afficherait sa clé brute, c'est-à-dire
  // un trou de lecture maquillé en jargon.
  ...MEETING_BRIEF_LIMITS.map(key => `limit.${key}`),
  // #2319.43 / .48 / .51 — chaque type se CHOISIT dans le brief : il se nomme.
  ...MEETING_TYPES.map(key => `meetingType.${key}`),
  // #2319.38 — les trois formes de « ce qui reste à vérifier ».
  'check.probable_role',
  'check.inferred_block',
  'check.meeting_type',
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** Retire les commentaires AVANT lecture : le docblock de ce fichier cite les
 *  noms qu'il surveille, et se dénoncerait lui-même. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Les fichiers qui APPELLENT l'assembleur de données — pas celui qui le
 * déclare. Sans cette distinction, le module qui porte
 * `export function buildMeetingBriefInputs` se dénoncerait lui-même : il
 * contient bien le nom suivi d'une parenthèse, et il n'appelle évidemment pas
 * l'assembleur final.
 */
function callerFiles(): { file: string; source: string }[] {
  return sourceFiles(WEB_SRC)
    .map(file => ({ file, source: stripComments(readFileSync(file, 'utf8')) }))
    .filter(
      ({ source }) =>
        source.includes('buildMeetingBriefInputs(') && !source.includes('export function buildMeetingBriefInputs'),
    )
}

describe('GA-146 — un bloc du brief dit d’où il vient', () => {
  it('lit un corpus non vide des deux côtés', () => {
    // Preuve qu'elle LIT : sans cette assertion, un catalogue vidé rendrait les
    // deux suivantes vertes pour toujours.
    expect(REQUIRED.length).toBeGreaterThan(30)
    expect(frKeys.size).toBeGreaterThan(30)
    expect(enKeys.size).toBeGreaterThan(30)
  })

  it('chaque valeur fermée du brief a son libellé en français', () => {
    expect(REQUIRED.filter(key => !frKeys.has(key))).toEqual([])
  })

  it('chaque valeur fermée du brief a son libellé en anglais', () => {
    expect(REQUIRED.filter(key => !enKeys.has(key))).toEqual([])
  })

  it('la garde sait dire NON — une clé absente est bien vue comme absente', () => {
    // Si la recherche ne lisait rien, `has` rendrait `false` partout et les deux
    // assertions ci-dessus seraient rouges ; si elle rendait `true` partout,
    // celle-ci le serait. Les trois ensemble prouvent qu'elle regarde.
    expect(frKeys.has('source.crm')).toBe(true)
    expect(frKeys.has('source.une_source_qui_nexiste_pas')).toBe(false)
  })

  it('les deux catalogues portent exactement les mêmes clés', () => {
    const onlyFr = [...frKeys].filter(key => !enKeys.has(key)).sort()
    const onlyEn = [...enKeys].filter(key => !frKeys.has(key)).sort()
    expect({ onlyFr, onlyEn }).toEqual({ onlyFr: [], onlyEn: [] })
  })

  it('le tri des blocs passe par `buildMeetingBrief`, jamais à côté', () => {
    // `buildMeetingBriefInputs` rend des blocs BRUTS, dont certains sont
    // incapables de dire d'où ils viennent. Les afficher sans passer par
    // l'assembleur mettrait ces blocs-là à l'écran comme des faits.
    const offenders = callerFiles()
      .filter(({ source }) => !source.includes('buildMeetingBrief('))
      .map(({ file }) => file.slice(file.indexOf('src/')))
    expect(offenders.sort()).toEqual([])
  })

  it('la garde sait dire NON — l’assembleur est bien appelé quelque part', () => {
    // Preuve que le motif ci-dessus n'est pas vert sur du vide : si plus
    // personne n'assemblait de brief, l'assertion précédente le resterait.
    expect(callerFiles().length).toBeGreaterThan(0)
  })
})
