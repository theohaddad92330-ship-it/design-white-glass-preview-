import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Une colonne dont le nom est un mot RÉSERVÉ doit être citée dans du SQL écrit
 * à la main.
 *
 * Le défaut que ce test verrouille est passé sous 9 000 tests verts et n'est
 * apparu qu'à la première requête réelle : `consultants.references` existe
 * depuis longtemps, TypeORM cite les identifiants tout seul, et personne
 * n'avait jamais eu à l'écrire à la main. La première requête brute qui l'a
 * fait — celle qui charge le vivier pour le matching — était un échec de
 * SYNTAXE, donc un 500 sur la requête ENTIÈRE, pas une colonne vide.
 *
 * Le motif cherché est sans ambiguïté : un point suivi d'un mot réservé. Les
 * mêmes mots employés comme mots-clés (`ORDER BY`, `LIMIT`, `CASE … END`) ne
 * sont jamais précédés d'un point, et ne déclenchent donc rien.
 */

const SRC = join(__dirname, '..')

/**
 * Les mots réservés Postgres qui sont aussi des noms de colonne PLAUSIBLES.
 *
 * La liste complète en compterait des dizaines ; y mettre `select` ou `from`
 * n'attraperait jamais rien et diluerait l'intention. Ceux-ci ont tous été vus
 * comme noms de colonne dans un schéma réel.
 */
const RESERVED = [
  'references',
  'order',
  'user',
  'check',
  'default',
  'table',
  'column',
  'grant',
  'array',
  'both',
  'case',
  'cast',
  'constraint',
  'primary',
  'unique',
  'using',
  'window',
]

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    // Les fichiers de test contiennent des contre-exemples À DESSEIN — celui-ci
    // le premier. Les scanner ferait échouer la garde sur sa propre preuve.
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts') || entry.includes('.spec.')) continue
    out.push(full)
  }
  return out
}

/** Les littéraux gabarit, UN PAR UN — c'est là que vit le SQL écrit à la main.
 *  Un par un et non concaténés : un fichier qui contient une requête et un
 *  en-tête MIME ne doit pas faire lire le second comme du SQL. */
function templateLiterals(source: string): string[] {
  return [...source.matchAll(/`([^`]*)`/gs)].map(match => match[1] ?? '')
}

/**
 * Ce qu'un `${…}` contient est du JAVASCRIPT, pas du SQL.
 *
 * La première version de cette garde l'ignorait, et elle a rougi sur
 * `${join.column}` et `${probe.table}` — deux accès de propriété d'un objet TS,
 * qui ne deviendront jamais un identifiant SQL nu (leur valeur est validée
 * contre `SQL_IDENTIFIER` juste au-dessus). Deux faux positifs, sur une garde
 * dont tout l'intérêt est qu'on la croie.
 *
 * Ce qui reste attrapé : `\`SELECT ${alias}.column FROM …\`` — le point et le
 * mot y sont DEHORS de l'interpolation, exactement là où Postgres les lira.
 */
function withoutInterpolations(sql: string): string {
  // Remplacé par un espace et non par du vide : coller les deux morceaux
  // pourrait fabriquer un `.mot` qui n'existe dans aucune des deux moitiés.
  return sql.replace(/\$\{[^}]*\}/g, ' ')
}

export function unquotedReservedColumns(sql: string): string[] {
  // Pas d'espace toléré après le point : un nom de colonne qualifié n'en a
  // jamais, et l'autoriser attraperait la fin d'une phrase de commentaire
  // suivie d'un « ORDER BY » à la ligne.
  const pattern = new RegExp(`\\.(${RESERVED.join('|')})\\b`, 'gi')
  return [...withoutInterpolations(sql).matchAll(pattern)].map(match => (match[1] ?? '').toLowerCase())
}

describe('les mots réservés dans le SQL écrit à la main', () => {
  it('aucune colonne réservée n’est employée sans guillemets', () => {
    const offences: string[] = []
    for (const file of sourceFiles(SRC)) {
      for (const sql of templateLiterals(readFileSync(file, 'utf8'))) {
        // On ne regarde que ce qui ressemble VRAIMENT à du SQL : un littéral qui
        // ne contient ni SELECT, ni INSERT, ni UPDATE, ni ALTER est du texte.
        if (!/\b(select|insert into|update |delete from|alter table)\b/i.test(sql)) continue
        for (const word of unquotedReservedColumns(sql)) {
          offences.push(`${file.replace(SRC, '')} → « .${word} »`)
        }
      }
    }
    // Le message porte le mot ET son fichier : « syntax error at or near » en
    // production ne dit ni l'un ni l'autre, et fait chercher au mauvais endroit.
    expect(offences).toEqual([])
  })

  it('attrape la colonne qui a mis le matching en 500', () => {
    // Le garde doit échouer sur ce qu'il est censé attraper — sinon c'est une
    // tautologie, et ce dépôt en a déjà rencontré.
    expect(unquotedReservedColumns('SELECT c.references FROM consultants c')).toEqual(['references'])
  })

  it('laisse passer la même colonne citée', () => {
    expect(unquotedReservedColumns('SELECT c."references" FROM consultants c')).toEqual([])
  })

  it('ne prend pas un accès de propriété TypeScript pour une colonne', () => {
    // Le faux positif MESURÉ le 28/08 : `demo-reset.service.ts` construit ses
    // sondes avec `${probe.table}` et `${join.column}`. Ce sont des propriétés
    // d'objet, validées contre `SQL_IDENTIFIER` avant d'entrer dans la requête.
    expect(unquotedReservedColumns('SELECT 1 FROM ${probe.table} WHERE ${join.column} = $1')).toEqual([])
  })

  it('attrape encore le point qui est DEHORS de l’interpolation', () => {
    // La contre-épreuve du test précédent : sans elle, on aurait pu neutraliser
    // la garde en croyant corriger un faux positif.
    expect(unquotedReservedColumns('SELECT ${alias}.references FROM consultants')).toEqual(['references'])
  })

  it('ne se trompe pas sur les mots-clés employés comme mots-clés', () => {
    // `ORDER BY`, `LIMIT`, `CASE … END` ne sont jamais précédés d'un point.
    expect(unquotedReservedColumns('SELECT 1 FROM t ORDER BY a LIMIT 10')).toEqual([])
    expect(unquotedReservedColumns('SELECT CASE WHEN a THEN 1 ELSE 2 END FROM t')).toEqual([])
  })
})
