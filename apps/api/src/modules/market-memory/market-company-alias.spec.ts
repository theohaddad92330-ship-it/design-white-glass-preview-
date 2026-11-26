import { aliasTargetKeys, marketAliasKey } from './market-company-alias'
import { marketMatchKey } from './market-company-key'

/**
 * #1756 — LES DEUX CÔTÉS DE LA TABLE D'ALIAS DOIVENT POUVOIR SE RENCONTRER.
 *
 * `market-company-key.ts` le dit déjà, et c'est ce qui rend ces tests
 * nécessaires plutôt que décoratifs : « deux normalisations différentes ne se
 * rencontrent jamais, et croire qu'elles se rencontrent produit un silence
 * total qu'aucun test ne montre ». Si `marketAliasKey` dérivait un jour de
 * `marketMatchKey`, la table d'alias deviendrait un stock de lignes que rien ne
 * lit — sans qu'aucune requête n'échoue.
 */
describe('marketAliasKey — LA même normalisation que la clé de nom du corpus', () => {
  /** Les cas de #1756, plus ceux que la normalisation traite déjà. */
  const NOMS: readonly string[] = [
    'SG SOCIETE GENERALE',
    'SOCIETE GENERALE',
    'SOCIETE NATIONALE SNCF',
    'SNCF',
    'Société Générale',
    'Groupe Thales',
    'THALES GROUP',
    'BNP Paribas',
    'ORANGE CYBERDEFENSE FRANCE',
  ]

  it('LIT quelque chose — le corpus de noms n’est pas vide', () => {
    expect(NOMS.length).toBeGreaterThan(5)
  })

  it.each(NOMS)('« %s » se range sous la MÊME clé des deux côtés', nom => {
    expect(marketAliasKey(nom)).toBe(marketMatchKey(nom))
  })

  /**
   * ⚠️ LE CAS DE #1756, ÉCRIT COMME UNE MESURE ET NON COMME UN ESPOIR.
   *
   * Ces deux clés DIFFÈRENT, et c'est tout le défaut : la normalisation ne les
   * rapproche pas, et il n'est pas question qu'elle les rapproche (ce serait
   * l'heuristique que l'issue refuse). Ce que la table d'alias apporte, c'est un
   * rapprochement ENREGISTRÉ entre ces deux clés-là.
   */
  it('ne rapproche PAS « SG SOCIETE GENERALE » de « SOCIETE GENERALE » — c’est le défaut, pas la solution', () => {
    expect(marketAliasKey('SG SOCIETE GENERALE')).toBe('sg societe generale')
    expect(marketAliasKey('SOCIETE GENERALE')).toBe('societe generale')
    expect(marketAliasKey('SG SOCIETE GENERALE')).not.toBe(marketAliasKey('SOCIETE GENERALE'))
  })

  it('rend une clé vide sur un nom vide — et une clé vide ne cherche rien', () => {
    expect(marketAliasKey('   ')).toBe('')
  })
})

describe('aliasTargetKeys — deux graphies d’une même entreprise ne font pas deux candidats', () => {
  it('dédoublonne les clés visées, en gardant l’ordre de première apparition', () => {
    expect(
      aliasTargetKeys([
        { companyKey: 'societe generale' },
        { companyKey: 'societe generale' },
        { companyKey: 'thales' },
      ]),
    ).toEqual(['societe generale', 'thales'])
  })

  it('garde DEUX clés quand deux entreprises différentes sont visées — l’ambiguïté n’est pas effacée', () => {
    // Le dédoublonnage ne doit jamais devenir un arbitrage : deux entreprises
    // distinctes sous le même alias sont une ambiguïté qui doit REMONTER.
    expect(aliasTargetKeys([{ companyKey: 'orange telecom' }, { companyKey: 'orange bank' }])).toEqual([
      'orange telecom',
      'orange bank',
    ])
  })

  it('rend une liste vide sans ligne', () => {
    expect(aliasTargetKeys([])).toEqual([])
  })
})
