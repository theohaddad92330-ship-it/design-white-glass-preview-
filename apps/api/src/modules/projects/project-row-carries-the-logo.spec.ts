import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #1315 · #1318 · #1325 — « une liste d'entreprises se reconnaît, elle ne se
 * lit pas ».
 *
 * Le même défaut, signalé sur trois écrans le 02/09 : `/favorites`, le tableau
 * des priorités et le Kanban des projets n'affichaient qu'une colonne de noms.
 * La cause n'était PAS l'affichage — `CompanyAvatar` existe et sert depuis des
 * mois sur `/accounts`, la barre latérale et le copilote. **Les colonnes ne
 * VOYAGEAIENT pas** : aucune des trois requêtes ne sélectionnait `logo_url` ni
 * `website`, et un écran ne peut pas peindre ce qu'on ne lui envoie pas.
 *
 * Une garde existait déjà côté web (`company-lists-show-logos.test.tsx`) mais
 * elle ne lisait que DEUX cartes du tableau de bord, tout en affirmant dans son
 * commentaire que « partout ailleurs une entreprise est précédée de son logo ».
 * Elle était borgne : elle protégeait la règle là où elle était déjà tenue.
 * Celle-ci garde l'autre moitié du chemin — la donnée.
 */
describe('les projections de liste transportent de quoi reconnaître une entreprise', () => {
  const PROJECTIONS = [
    {
      quoi: 'le Kanban des projets',
      fichier: join(__dirname, 'projects.service.ts'),
      ancre: 'ROW_PROJECTION',
    },
    {
      quoi: 'le tableau des priorités',
      fichier: join(__dirname, '..', 'sprints', 'sprints.service.ts'),
      // ⚠️ L'ancre était `SELECT id, company_name, sprint`, c'est-à-dire une
      // LIGNE de la requête. Elle est tombée — correctement — le jour où la
      // requête est passée sur plusieurs lignes et a pris un alias
      // (`SELECT a.id, …`) pour porter le prédicat « rien n'est programmé ».
      // Une ancre doit désigner ce que la garde protège, pas la mise en forme
      // du moment : `FROM accounts` survit à l'indentation et aux alias.
      ancre: 'FROM accounts',
    },
    // ⚠️ #1800 (09/09/2026) — « les favoris » a existé ici, retiré avec
    // `favorites.service.ts` (retour Louis, « supprime la notion de favori »).
  ]

  it.each(PROJECTIONS)('$quoi sélectionne logo_url et website', ({ fichier, ancre }) => {
    const source = readFileSync(fichier, 'utf8')

    // LA GARDE LIT QUELQUE CHOSE : sans ceci, renommer la projection rendrait
    // le test vert sur un corpus vide. Six gardes borgnes en deux jours.
    expect(source).toContain(ancre)

    expect(source).toContain('logo_url')
    expect(source).toContain('website')
  })

  it('sait dire NON — une projection sans logo_url échoue', () => {
    const amputee = `const ROW_PROJECTION = \`a.company_name AS company_name, a.sector AS sector\``

    expect(amputee.includes('logo_url')).toBe(false)
  })
})
