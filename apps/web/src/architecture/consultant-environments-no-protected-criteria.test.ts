import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1625 — GA-06 (`protected-criteria.spec.ts`, API) côté WEB : ici on classe
 * des ENTREPRISES à partir d'un CONSULTANT. Rien de la personne, hors
 * compétences et zone, ne doit voyager jusqu'à la requête envoyée au serveur
 * ni jusqu'au calcul de fit — un champ n'a pas besoin d'être multiplié par un
 * poids pour peser dans un classement, il suffit qu'il soit dans la charge
 * utile qui note (`photoUrl` voyageait ainsi jusqu'à un prompt de notation
 * sans qu'aucune ligne ne le « lise »).
 *
 * Cette garde complète, elle ne remplace pas, le test COMPORTEMENTAL de
 * `compatibleEnvironments.test.ts` (qui construit un `Consultant` complet et
 * vérifie que la requête produite ne porte que zone/compétence) : celle-ci
 * lit le SOURCE, comme `protected-criteria.spec.ts` le fait côté API.
 */

const COMPATIBLE_ENVIRONMENTS_LIB = join(__dirname, '..', 'features', 'consultants', 'lib', 'compatibleEnvironments.ts')
const REVERSE_MARKET_PAGE = join(
  __dirname,
  '..',
  'features',
  'consultants',
  'view',
  'reverse-market',
  'ReverseMarketPage.tsx',
)

/**
 * `ReverseMarketPage.tsx` porte AUSSI le nom du consultant dans son titre de
 * page (`talentNameText(talent?.full_name, …)`, hérité de #1625-avant, une
 * capacité DISPLAY légitime, distincte du classement) : scanner le FICHIER
 * ENTIER attraperait ce voisin légitime, exactement ce qu'une garde ne doit
 * pas faire. On extrait donc UNIQUEMENT le code que ce lot a ajouté — les
 * deux fonctions du bloc « Environnements compatibles », du marqueur de leur
 * première ligne à la fin du fichier (elles sont les DERNIÈRES du fichier).
 */
function compatibleEnvironmentsBlock(source: string): string {
  const marker = 'function CompatibleEnvironmentsSection'
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`marqueur "${marker}" introuvable — le bloc a-t-il été renommé ou déplacé ?`)
  return source.slice(start)
}

const FILES: readonly { path: string; extract: (source: string) => string }[] = [
  { path: COMPATIBLE_ENVIRONMENTS_LIB, extract: source => source },
  { path: REVERSE_MARKET_PAGE, extract: compatibleEnvironmentsBlock },
]

const PROTECTED_CRITERIA = [
  'full_name',
  'fullName',
  'photo_url',
  'photoUrl',
  'birth_date',
  'birthDate',
  'gender',
  'nationality',
  'marital_status',
  'maritalStatus',
  'ethnicity',
  'religion',
  'email',
  'phone',
  'address',
]

describe('#1625 — aucun critère protégé ne traverse le classement d’environnements', () => {
  it.each(FILES)('$path ne lit aucun critère protégé', ({ path, extract }) => {
    const scanned = extract(readFileSync(path, 'utf8'))
    const found = PROTECTED_CRITERIA.filter(field => new RegExp(`\\b${field}\\b`).test(scanned))
    // Si ce test tombe : ce champ ne doit pas peser dans le classement d'une
    // entreprise. Retire-le du calcul plutôt que d'élargir cette liste.
    expect(found).toEqual([])
  })

  it('les fichiers surveillés existent tous, et le bloc surveillé n’est pas vide', () => {
    for (const { path, extract } of FILES) {
      const scanned = extract(readFileSync(path, 'utf8'))
      expect(scanned.length).toBeGreaterThan(0)
    }
  })

  it('sait dire NON — la même expression attrape un critère protégé glissé dans un extrait fictif', () => {
    const compromised = 'const payload = { technology: talent.stack[0], photoUrl: talent.photoUrl }'
    const found = PROTECTED_CRITERIA.filter(field => new RegExp(`\\b${field}\\b`).test(compromised))
    expect(found).toEqual(['photoUrl'])
  })

  it('n’attrape pas ce qu’elle ne vise pas — « stack » et « zones » restent lisibles', () => {
    // Témoin de cas légitime voisin : les deux seuls champs personnels que ce
    // bloc a le droit de lire ne doivent JAMAIS apparaître dans la liste
    // interdite, sans quoi la garde se retournerait contre la fonctionnalité
    // qu'elle est censée protéger.
    expect(PROTECTED_CRITERIA).not.toContain('stack')
    expect(PROTECTED_CRITERIA).not.toContain('zones')
    expect(PROTECTED_CRITERIA).not.toContain('title')
  })
})
