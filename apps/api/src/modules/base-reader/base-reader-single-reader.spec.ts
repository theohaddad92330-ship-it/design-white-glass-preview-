import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #4792 — GA-26 : LE LECTEUR DE LA BASE EST UNIQUE, ET UNE SECONDE FAÇON DE RAPPROCHER UN LIEU SE VOIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, EXACTEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre surfaces posent la même question à notre base. Ce qui peut diverger entre elles n'est pas
 * « lire `project_needs` » — plusieurs écrans le font légitimement — c'est la DÉRIVATION :
 * **rapprocher un métier et un lieu écrits en texte libre**. Si « Lille » se rapproche de trois façons,
 * trois surfaces rendront trois nombres de lignes et personne ne saura lequel est juste.
 *
 * Cette dérivation vit dans `base-reader.sql.ts` (`placePatterns`, `termPatterns`). La garde fait donc
 * deux choses :
 *  1. elle LIT ce fichier et refuse qu'il perde ses builders (une garde qui ne lit rien passe toujours) ;
 *  2. elle compte les AUTRES endroits qui rapprochent un lieu en `ILIKE`, et FIGE le niveau mesuré.
 *     La liste ci-dessous ne doit que RÉTRÉCIR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE N'EXIGE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle n'exige pas ZÉRO autre rapprochement de lieu : il en existe quatre au 29/10/2026, chacun pour
 * une question qui n'est PAS celle du lecteur commun, et chacun nommé ci-dessous avec sa raison. Une
 * garde qui aurait exigé zéro serait tombée le premier jour, et une garde désactivée ne protège rien.
 */

const MODULES = join(__dirname, '..')
const SQL_FILE = join(__dirname, 'base-reader.sql.ts')

/**
 * Les colonnes de LIEU de notre base — celles qui portent un lieu en texte libre. C'est leur
 * rapprochement, et lui seul, que cette garde surveille.
 */
const PLACE_COLUMNS = /\b(location|headquarters|mobility_zones|zones)\b/

/**
 * LES AUTRES RAPPROCHEMENTS DE LIEU, AU 29/10/2026 — chacun avec la question à laquelle il répond,
 * et qui n'est pas celle du lecteur commun. Cette liste ne doit que RÉTRÉCIR.
 *
 * - `projects/open-needs.service.ts` — l'écran BESOINS OUVERTS (`/projects/needs`). Bornée aux statuts
 *   OUVERTS (`NEED_OPEN_STATUSES`), elle porte en plus les positionnements, la prochaine action et la
 *   porte `staffable` : c'est une liste de TRAVAIL, pas une lecture de ce que la base contient. Le
 *   lecteur commun, lui, lit tous les statuts, trois familles, et date chaque ligne. Les deux
 *   coexistent ; les fondre ferait porter au lecteur la logique d'un écran, ou à l'écran un lecteur
 *   qui ne connaît pas ses statuts.
 * - `contacts/contacts.service.ts` et `copilot-bridge/copilot-contacts-search.controller.ts` (+ son
 *   DTO) — le territoire d'une PERSONNE (`contacts.location`), filtre de l'écran Contacts relayé tel
 *   quel à Laura. Ni compte, ni besoin, ni consultant : une autre famille, hors de ce lecteur.
 * - `market-memory/market-memory.service.ts` — le pliage des accents d'une colonne texte, pas un lieu.
 */
const KNOWN_PLACE_MATCHERS: readonly string[] = [
  'contacts/contacts.service.ts',
  'copilot-bridge/copilot-contacts-search.controller.ts',
  'copilot-bridge/dto/copilot-contacts-search.dto.ts',
  'market-memory/market-memory.service.ts',
  'projects/open-needs.service.ts',
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts') || entry.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

/**
 * Un rapprochement de lieu : un `ILIKE` (SQL brut) ou un `ILike` (TypeORM) à portée de vue d'une
 * colonne de lieu. La fenêtre est volontairement courte (200 caractères de part et d'autre) : un
 * fichier qui NOMME une colonne de lieu trois cents lignes plus bas ne la rapproche pas.
 *
 * Exportée pour que la garde puisse se PROUVER sur un cas fabriqué (« sait-elle dire NON ? »).
 */
export function matchesPlaceInSource(source: string): boolean {
  for (const match of source.matchAll(/ILIKE|ILike/g)) {
    const window = source.slice(Math.max(0, match.index - 200), match.index + 200)
    if (PLACE_COLUMNS.test(window)) return true
  }
  return false
}

describe('#4792 — GA-26 : un seul lecteur de la base', () => {
  it('la dérivation partagée est bien LÀ — une garde qui ne lit rien passe toujours', () => {
    const sql = readFileSync(SQL_FILE, 'utf8')
    expect(sql).toContain('export function placePatterns')
    expect(sql).toContain('export function termPatterns')
    // Le lecteur ne construit pas ses motifs à la main : il appelle ces deux fonctions.
    const service = readFileSync(join(__dirname, 'base-reader.service.ts'), 'utf8')
    expect(service).toContain('placePatterns(criteria)')
    expect(service).toContain('termPatterns(criteria)')
  })

  it('aucun rapprochement de lieu NOUVEAU n’apparaît ailleurs dans les modules', () => {
    const found = sourceFiles(MODULES)
      .filter(file => !file.includes(`${join('modules', 'base-reader')}`))
      .filter(file => matchesPlaceInSource(readFileSync(file, 'utf8')))
      .map(file =>
        file
          .slice(file.indexOf(`${'modules'}/`) + 'modules/'.length)
          .split('\\')
          .join('/'),
      )
      .sort()
    // Si ce test tombe : tu viens d'écrire une SECONDE façon de rapprocher un lieu. Passe par
    // `BaseReaderService` (ou par `placePatterns`), ou ajoute ton fichier ci-dessus AVEC la question
    // à laquelle il répond, et qui n'est pas celle du lecteur commun.
    expect(found).toEqual([...KNOWN_PLACE_MATCHERS].sort())
  })

  it('elle sait dire NON : un second rapprochement fabriqué est vu', () => {
    expect(matchesPlaceInSource(`qb.andWhere("need.location ILIKE :place")`)).toBe(true)
    expect(matchesPlaceInSource(`WHERE a.headquarters ILIKE ANY($2)`)).toBe(true)
  })

  it('…et elle n’attrape pas ce qu’elle ne vise pas', () => {
    // Un `ILIKE` qui ne rapproche aucun lieu.
    expect(matchesPlaceInSource(`qb.andWhere("account.company_name ILIKE :q")`)).toBe(false)
    // Une colonne de lieu LUE, sans rapprochement.
    expect(matchesPlaceInSource(`'need.location AS location'`)).toBe(false)
  })
})
