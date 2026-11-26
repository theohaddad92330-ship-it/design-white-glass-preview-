import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2127.30 — LE RAPPROCHEMENT PAR « FAMILLES DE RÔLES » SE FONDE SUR DES
 * MÉTIERS RECRUTÉS, JAMAIS SUR DES PERSONNES.
 *
 * Le piège nommé dans le brief : une famille de rôles se déduit des métiers
 * recrutés (`market_company_signal.role_families`, un comptage `{ family,
 * persons }` par ENTREPRISE), jamais des personnes qui les occupent. Aucun
 * critère protégé (âge, genre, origine, photo, adresse…) ne doit pouvoir
 * peser dans ce rapprochement, et cette garde le vérifie sur la SOURCE — elle
 * ne se contente pas de l'affirmer en commentaire (doctrine : « une garde
 * protège une règle, elle ne l'invente pas »).
 *
 * Distincte de GA-06 (`protected-criteria.spec.ts`) : celle-ci surveille des
 * moteurs qui classent des PERSONNES (consultants, contacts). Le moteur ici
 * classe des ENTREPRISES — un périmètre différent, donc une garde à part
 * plutôt qu'un fichier ajouté à une liste dont le docblock dit l'inverse.
 */

const SRC = join(__dirname, '..')

const FILES_UNDER_TEST = ['modules/accounts/similar-scoring.ts', 'modules/market-memory/market-memory.service.ts']

const PROTECTED_CRITERIA = [
  'birth_date',
  'birthDate',
  'gender',
  'nationality',
  'photo_url',
  'photoUrl',
  'marital_status',
  'maritalStatus',
  'ethnicity',
  'religion',
  'full_name',
  'fullName',
]

function findProtectedCriteria(source: string): string[] {
  return PROTECTED_CRITERIA.filter(field => new RegExp(`\\b${field}\\b`).test(source))
}

describe('#2127.30 — le rapprochement par familles de rôles ne lit aucune personne', () => {
  it.each(FILES_UNDER_TEST)('%s ne porte aucun critère protégé', relative => {
    const source = readFileSync(join(SRC, relative), 'utf8')
    expect(findProtectedCriteria(source)).toEqual([])
  })

  it('similar-scoring.ts ne lit ni contact, ni consultant, ni fiche de personne', () => {
    const source = readFileSync(join(SRC, 'modules/accounts/similar-scoring.ts'), 'utf8')
    expect(source).not.toMatch(/\bContact(Entity)?\b/)
    expect(source).not.toMatch(/consultant/i)
  })

  it('sharedRoleFamilies ne prend que des listes de chaînes de famille — un compte, jamais un contact', () => {
    const source = readFileSync(join(SRC, 'modules/accounts/similar-scoring.ts'), 'utf8')
    expect(source).toMatch(
      /export function sharedRoleFamilies\(\s*reference: readonly string\[\] \| null,\s*candidate: readonly string\[\] \| null,?\s*\): boolean/,
    )
  })

  it('la garde SAIT DIRE NON — elle rougit sur une source qui porterait un critère protégé', () => {
    // Un test qui ne sait pas dire NON est pire que pas de test : cette
    // fixture n'est PAS le fichier réel, elle prouve que le détecteur détecte.
    const fixture = 'const sameRole = candidate.photo_url === reference.photo_url'
    expect(findProtectedCriteria(fixture)).toEqual(['photo_url'])
  })
})
