import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDirectIdentifierColumn } from '../modules/market-memory/market-memory-identifiers'

/**
 * GA-352 — #2298.5 (LAU-039) — la mémoire marché (les « network paths ») ne porte AUCUN IDENTIFIANT DIRECT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RENVERSEMENT PARTIEL, DATÉ — Louis 02/11/2026 (lot 775)
 * ─────────────────────────────────────────────────────────────────────────────
 * Jusqu'au 02/11/2026 cette garde disait « aucune colonne désignant un individu » (person, contact, email, phone,
 * name…) : la mémoire n'était que des comptages. Louis a tranché : « tout mettre comme donnée sauf le nom et prénom
 * et genre, num et adresse mail ; pour le reste tu peux te servir de toutes les données ». Les PARCOURS individuels
 * (poste, dates, statut, compétences, TJM) entrent donc, sous un pseudonyme (`person_key`, HMAC salé).
 *
 * La garde dit désormais : « aucune colonne d'IDENTIFIANT DIRECT » — la liste fermée vit dans UN module
 * (`market-memory-identifiers.ts` : nom, prénom, nom complet, genre/civilité, téléphone, e-mail, URL de profil,
 * photo, adresse postale, date de naissance/âge). Elle n'a pas été supprimée : elle a changé d'objet. Le refus
 * d'importer le fichier d'identités reste entier (en-tête de `market-memory-import.ts`).
 *
 * La seconde moitié (seuil `MARKET_MEMORY_MIN_PATHS` = 3) ne vaut que pour les AGRÉGATS (GA-285) : une ligne
 * individuelle s'affiche même seule, puisqu'elle ne porte aucune identité (décision Louis).
 */

const ENTITIES_DIR = join(__dirname, '..', 'database', 'entities')

/** Les quatre tables partagées derrière `MarketMemoryService` (GA-258) qui
 *  portent des comptages de personnes — les seules où une colonne d'identité
 *  pourrait se glisser. */
const MARKET_MEMORY_ENTITY_FILES = [
  'market-esn-client.entity.ts',
  'market-ex-esn-at-client.entity.ts',
  'market-company-signal.entity.ts',
  'market-company-stack.entity.ts',
  'market-person-path.entity.ts',
] as const

/** Le seul pseudonyme autorisé : un hash salé, jamais une identité. */
const ALLOWED_COLUMNS = new Set(['person_key'])

/** Les colonnes déclarées par `@Column({ ..., name: '<col>' ... })` d'un fichier
 *  d'entité — la même technique de lecture-source que `community-aggregation-kinds.spec.ts`. */
function declaredColumnNames(source: string): string[] {
  const names: string[] = []
  const re = /@Column\(\{[^}]*name:\s*'([^']+)'/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source))) names.push(match[1] as string)
  return names
}

function offendingColumns(columns: readonly string[]): string[] {
  return columns.filter(column => !ALLOWED_COLUMNS.has(column) && isDirectIdentifierColumn(column))
}

describe('GA-352 (#2298.5) — la mémoire marché ne porte aucun identifiant direct', () => {
  it('LIT quelque chose — les quatre entités déclarent réellement des colonnes', () => {
    // Sans ce test, la garde serait verte si un renommage de fichier ou une
    // extraction TypeORM différente faisait manquer les entités : elle ne
    // trouverait plus rien et ne dirait rien.
    for (const file of MARKET_MEMORY_ENTITY_FILES) {
      const source = readFileSync(join(ENTITIES_DIR, file), 'utf8')
      expect(declaredColumnNames(source).length).toBeGreaterThan(3)
    }
  })

  it.each(MARKET_MEMORY_ENTITY_FILES)('%s ne déclare aucun identifiant direct', file => {
    const source = readFileSync(join(ENTITIES_DIR, file), 'utf8')
    const columns = declaredColumnNames(source)
    expect(offendingColumns(columns)).toEqual([])
  })

  it('sait dire NON — une colonne fabriquée `email`, `last_name` ou `linkedin_url` est détectée', () => {
    // On rejoue la règle sur une entité FABRIQUÉE plutôt que de casser la vraie
    // (qui ferait circuler, même le temps d'un test, la promesse que la garde
    // protège).
    const fixture = `
      @Column({ name: 'company_key', type: 'text' })
      companyKey!: string

      @Column({ name: 'email', type: 'text', nullable: true })
      email!: string | null

      @Column({ name: 'last_name', type: 'text', nullable: true })
      lastName!: string | null

      @Column({ name: 'linkedin_url', type: 'text', nullable: true })
      linkedinUrl!: string | null
    `
    const columns = declaredColumnNames(fixture)
    expect(columns).toEqual(['company_key', 'email', 'last_name', 'linkedin_url'])
    expect(offendingColumns(columns)).toEqual(['email', 'last_name', 'linkedin_url'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — un nom d’ESN ou de client reste autorisé', () => {
    const fixture = `
      @Column({ name: 'esn_name', type: 'text' })
      esnName!: string

      @Column({ name: 'client_name', type: 'text' })
      clientName!: string

      @Column({ name: 'person_key', type: 'text' })
      personKey!: string
    `
    expect(offendingColumns(declaredColumnNames(fixture))).toEqual([])
  })
})
