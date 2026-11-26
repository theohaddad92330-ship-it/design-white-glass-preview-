import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-368 — une question du questionnaire de profil affiche son LIBELLÉ,
 * jamais sa clé i18n.
 *
 * Trouvé en recette de production le 20/09/2026, sur `555e8fd82` : la sixième
 * question de la sous-étape « Toi et ton rôle » affichait à l'écran, en toutes
 * lettres, `profileQuestions.items.role_functions_practiced.label`. La question
 * était bien déclarée au contrat, bien consommée (`analysis.ts`,
 * `layered-profile.ts`, `onboarding-question-consumers.ts`), et son « Suivant »
 * était obligatoire — donc un nouvel arrivant restait coincé devant une clé de
 * traduction. Une seconde question, `growth_target_zones`, avait le même défaut.
 *
 * Pourquoi rien ne l'avait vu : les gardes d'i18n de ce dépôt comparent le
 * catalogue FRANÇAIS au catalogue ANGLAIS. Ici les deux étaient également
 * vides, donc la parité était parfaite et le défaut invisible. La seule mesure
 * qui l'attrape part du CONTRAT — la liste des questions réellement posées — et
 * va vers les catalogues, pas l'inverse.
 *
 * Ce que cette garde refuse : une question déclarée dans
 * `profile-questionnaire.ts` sans libellé dans l'un des catalogues.
 */

const RACINE_DEPOT = join(__dirname, '..', '..', '..', '..')
const CONTRAT = join(RACINE_DEPOT, 'packages', 'contracts', 'src', 'schemas', 'profile-questionnaire.ts')
const catalogue = (langue: string) =>
  join(RACINE_DEPOT, 'apps', 'web', 'src', 'i18n', 'locales', langue, 'onboarding.json')

const LANGUES = ['fr', 'en'] as const

/**
 * Les clés des questions réellement posées. Une déclaration de question est un
 * `key:` qui porte un `block:` dans les lignes qui suivent — c'est ce qui la
 * distingue des `key:` d'un autre objet du même fichier.
 */
function questionsDeclarees(): string[] {
  const source = readFileSync(CONTRAT, 'utf8')
  const trouvees = new Set<string>()
  const motif = /key:\s*'([a-z0-9_]+)'/g
  let m: RegExpExecArray | null
  while ((m = motif.exec(source)) !== null) {
    const suite = source.slice(m.index, m.index + 400)
    if (/\bblock:\s*'/.test(suite)) trouvees.add(m[1])
  }
  return [...trouvees].sort()
}

function libelles(langue: string): Record<string, { label?: string }> {
  const json = JSON.parse(readFileSync(catalogue(langue), 'utf8'))
  return json?.profileQuestions?.items ?? {}
}

describe('GA-368 — une question affiche son libellé, pas sa clé', () => {
  it('lit vraiment le contrat, et pas un corpus vide', () => {
    const cles = questionsDeclarees()
    // Une garde qui ne lit rien passe toujours. Celle-ci doit prouver qu'elle
    // a trouvé le questionnaire : 55 questions au 20/09/2026.
    expect(cles.length).toBeGreaterThanOrEqual(50)
    expect(cles).toContain('user_role')
    expect(cles).toContain('role_functions_practiced')
  })

  it.each(LANGUES)('chaque question déclarée a un libellé en %s', langue => {
    const cles = questionsDeclarees()
    const catalogue = libelles(langue)
    const sansLibelle = cles.filter(cle => {
      const entree = catalogue[cle]
      return !entree || typeof entree.label !== 'string' || entree.label.trim() === ''
    })
    expect(sansLibelle).toEqual([])
  })

  it('un libellé ne se contente pas de répéter sa clé', () => {
    const cles = questionsDeclarees()
    for (const langue of LANGUES) {
      const catalogue = libelles(langue)
      for (const cle of cles) {
        const label = catalogue[cle]?.label
        if (typeof label !== 'string') continue
        expect(label).not.toContain('profileQuestions.')
        expect(label).not.toBe(cle)
      }
    }
  })
})
