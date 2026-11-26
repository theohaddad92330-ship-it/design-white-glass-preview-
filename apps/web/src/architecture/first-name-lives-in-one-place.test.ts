import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * UN RÉGLAGE VIT À UN SEUL ENDROIT — loi 1 du tome 7, appliquée au prénom.
 *
 * Neuf retours du 02/09 demandent le même entête personnalisé, chacun avec un
 * prénom EN DUR dans la chaîne (« Tes favoris, Louis », « Ton pipe commercial,
 * Maëlle »). Deux défauts s'y cachaient :
 *
 * 1. **Le prénom littéral.** Livré tel quel, il salue Louis sur l'écran de
 *    tout le monde.
 * 2. **La règle recopiée.** Le calcul existait DÉJÀ, à l'identique dans trois
 *    fichiers et sous une quatrième forme ailleurs — quatre endroits, deux
 *    règles (`||` acceptait «   », un seul le nettoyait). Brancher neuf écrans
 *    de plus en aurait fait treize.
 *
 * Cette garde tient les deux : le calcul ne se recopie pas, et un prénom ne
 * s'écrit pas en dur dans une traduction.
 */

const racineWeb = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function fichiersSous(dir: string, ext: string[]): string[] {
  const sortie: string[] = []
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === 'dist') continue
    const chemin = join(dir, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersSous(chemin, ext))
    else if (ext.some(e => entree.endsWith(e)) && !entree.includes('.test.')) sortie.push(chemin)
  }
  return sortie
}

describe('le prénom de la personne connectée', () => {
  const sources = fichiersSous(join(racineWeb, 'src'), ['.ts', '.tsx'])

  it('a un corpus à lire — une garde qui ne lit rien ne garde rien', () => {
    expect(sources.length).toBeGreaterThan(500)
  })

  it("ne se recalcule nulle part ailleurs qu'à son seul endroit", () => {
    // Le motif exact qui était recopié : le profil, puis le début de l'e-mail.
    const recopie = /first_name[^\n]*\|\|[^\n]*email[^\n]*split\('@'\)/

    const coupables = sources
      .filter(f => !f.endsWith(join('hooks', 'useFirstName.ts')))
      .filter(f => recopie.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(racineWeb.length + 1))

    expect(coupables).toEqual([])
  })

  it('sait dire NON — la ligne qui était recopiée quatre fois est bien reconnue', () => {
    const ancienne = "const firstName = profile?.first_name || user?.email?.split('@')[0] || t('fallback.userName')"

    expect(/first_name[^\n]*\|\|[^\n]*email[^\n]*split\('@'\)/.test(ancienne)).toBe(true)
  })
})

describe('les entêtes personnalisés', () => {
  const locales = join(racineWeb, 'src', 'i18n', 'locales')

  it("n'écrivent aucun prénom en dur — il vient du profil", () => {
    // Les prénoms que les issues du 02/09 proposaient littéralement.
    const enDur = /\b(Maëlle|Maelle)\b/

    const coupables: string[] = []
    for (const langue of readdirSync(locales)) {
      for (const fichier of readdirSync(join(locales, langue))) {
        const texte = readFileSync(join(locales, langue, fichier), 'utf8')
        if (enDur.test(texte)) coupables.push(`${langue}/${fichier}`)
      }
    }

    expect(coupables).toEqual([])
  })

  it('offrent TOUJOURS une formule sans prénom à côté de la formule avec', () => {
    // Un profil neuf n'a pas de prénom. « Tes favoris, » suivi d'un vide est
    // pire que « Tes favoris » : c'est une phrase cassée.
    const manquantes: string[] = []
    for (const langue of readdirSync(locales)) {
      for (const fichier of readdirSync(join(locales, langue))) {
        const contenu = JSON.parse(readFileSync(join(locales, langue, fichier), 'utf8')) as Record<string, unknown>
        for (const section of Object.values(contenu)) {
          if (typeof section !== 'object' || section === null) continue
          for (const cle of Object.keys(section as Record<string, string>)) {
            if (!/Title$/.test(cle) || !/[Ii]ntro/.test(cle)) continue
            const jumelle = cle.replace(/Title$/, 'TitleWithoutName')
            if (!(jumelle in (section as Record<string, string>))) {
              manquantes.push(`${langue}/${fichier} → ${cle}`)
            }
          }
        }
      }
    }

    expect(manquantes).toEqual([])
  })
})
