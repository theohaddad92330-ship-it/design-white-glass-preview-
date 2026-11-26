import { crossFieldTokensClause, foldSearchTerm, nameTokensClause, searchTokens } from './contact-name-search'

describe('contact-name-search (#3489)', () => {
  it('plie accents et casse', () => {
    expect(foldSearchTerm('ARMÈLE Soussin')).toBe('armele soussin')
  })

  // #3710 — « Directeur des systèmes d’information groupe » (apostrophe typographique ’)
  // reste introuvable quand l’utilisateur tape l’apostrophe droite ' de son clavier.
  it('plie les apostrophes typographiques sur l’apostrophe droite du clavier', () => {
    expect(foldSearchTerm('Directeur des systèmes d’information groupe')).toBe(
      foldSearchTerm("Directeur des systemes d'information groupe"),
    )
  })

  it('un nom à apostrophe typographique se trouve avec l’apostrophe droite du clavier', () => {
    const clause = nameTokensClause('contact.full_name', "directeur d'information")
    expect(clause?.params).toEqual({ qn0: '%directeur%', qn1: "%d'information%" })
  })

  it('découpe en mots, espaces multiples compris', () => {
    expect(searchTokens('  Armelle   Soussin ')).toEqual(['armelle', 'soussin'])
  })

  it('un nom en deux mots devient deux conditions ET — l’ordre n’importe pas', () => {
    const clause = nameTokensClause('contact.full_name', 'Soussin Armelle')
    expect(clause?.sql).toContain('LIKE :qn0 AND')
    expect(clause?.sql).toContain('LIKE :qn1')
    expect(clause?.params).toEqual({ qn0: '%soussin%', qn1: '%armelle%' })
  })

  it('une requête vide ne produit aucune clause', () => {
    expect(nameTokensClause('contact.full_name', '   ')).toBeNull()
  })
})

// #4386.2 (recette prod 23/10) — « Haddad » trouvait « THÉO Haddad — BELLUM », « theo haddad bellum » rien :
// prénom + nom + entreprise tapés ensemble, chaque mot doit tomber dans le nom OU l'entreprise.
describe('crossFieldTokensClause (#4386.2)', () => {
  const columns = ['contact.full_name', 'account.company_name']

  it('« theo haddad bellum » : un groupe ET par mot, chaque mot cherché dans le nom OU l’entreprise, plié', () => {
    const clause = crossFieldTokensClause(columns, 'theo haddad bellum')
    expect(clause?.params).toEqual({ qx0: '%theo%', qx1: '%haddad%', qx2: '%bellum%' })
    expect(clause?.sql.match(/ AND /g)).toHaveLength(2)
    for (const index of [0, 1, 2]) {
      expect(clause?.sql).toContain(`translate(lower(contact.full_name), `)
      expect(clause?.sql).toContain(`translate(lower(account.company_name), `)
      expect(clause?.sql).toMatch(
        new RegExp(`LIKE :qx${index} OR translate\\(lower\\(account\\.company_name\\).*LIKE :qx${index}\\)`),
      )
    }
    // Requête paramétrée : aucun mot tapé n'entre dans le SQL.
    expect(clause?.sql).not.toMatch(/haddad|bellum|theo/)
  })

  it('« Haddad Théo BELLUM SAS » : l’ordre, la casse, l’accent et le suffixe de société n’empêchent pas de trouver', () => {
    const clause = crossFieldTokensClause(columns, 'Haddad Théo BELLUM SAS')
    expect(clause?.params).toEqual({ qx0: '%haddad%', qx1: '%theo%', qx2: '%bellum%' })
  })

  it.each(['SA', 'SARL', 'Group', 'Groupe', 'S.A.S.'])(
    'le suffixe « %s » ne devient pas un mot obligatoire',
    suffix => {
      const clause = crossFieldTokensClause(columns, `Thales ${suffix}`)
      expect(clause?.params).toEqual({ qx0: '%thales%' })
    },
  )

  it('une requête faite UNIQUEMENT d’un suffixe garde ce mot (jamais une requête vide qui accepterait tout)', () => {
    expect(crossFieldTokensClause(columns, 'Group')?.params).toEqual({ qx0: '%group%' })
  })

  it('une requête vide ne produit aucune clause', () => {
    expect(crossFieldTokensClause(columns, '   ')).toBeNull()
  })
})
