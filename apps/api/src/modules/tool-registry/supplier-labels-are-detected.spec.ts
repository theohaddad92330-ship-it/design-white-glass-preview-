import { CLIENT_TOOLS, OUR_SUPPLIERS, supplierNamesIn } from '@bellum/contracts'
import { TOOL_CATALOG, type ToolCatalogEntry } from './tool-catalog'

/**
 * GA-340 — le détecteur partagé reconnaît TOUS les libellés sous lesquels nos
 * fournisseurs s'écrivent dans le dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QU'ELLE PROTÈGE — elle ne l'invente pas
 * ─────────────────────────────────────────────────────────────────────────────
 * « NOS fournisseurs ne se nomment JAMAIS » (#1912.11, décision Louis du
 * 13/09/2026). Cinq gardes tiennent cette règle dans cinq langages, et toutes
 * lisent le MÊME détecteur : `supplierNamesIn` dans `@bellum/contracts`
 * (`tool-naming.ts`). GA-44 et la garde i18n côté web, la garde du changelog,
 * le digest de Laura côté API, `test_copilote_prompt_blocks.py` côté IA.
 *
 * Un détecteur aveugle sur UN libellé rend donc les CINQ gardes vertes sur un
 * texte fautif. C'est ce qui s'est passé deux fois :
 *   • #1912 — « Non appliqué par pappers » en minuscules a traversé toutes les
 *     gardes, qui cherchaient « Pappers » avec sa majuscule. 24 cartes de
 *     `/discover` étaient en faute.
 *   • 16/09/2026 — le catalogue d'outils écrit `display_name: 'Hunter'`,
 *     `OUR_SUPPLIERS` ne portait que « Hunter.io » sous ses DEUX champs
 *     (`name` ET `brand`), et `supplierNamesIn('Hunter')` rendait `[]`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET POURQUOI ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le catalogue d'outils (`tool-catalog.ts`) est le seul endroit du dépôt qui
 * ÉCRIT, entrée par entrée, le nom commercial de chaque outil — le nôtre comme
 * celui du client. C'est donc le corpus de libellés réels à croiser avec le
 * détecteur, et ce croisement ne peut vivre qu'ici : `@bellum/contracts` ne
 * dépend pas de l'API, et l'API dépend des contrats.
 *
 * ⚠️ Le champ `owner` NE SÉPARE PAS nos fournisseurs des outils du client : il
 * vaut `workspace` ou `user` et dit la PORTÉE de la connexion. `apollo`,
 * `brave`, `firecrawl` et `pappers` portent `owner: 'workspace'` exactement
 * comme `hubspot` et `gmail` (39 `workspace` pour 8 `user` au 16/09/2026). Un
 * `filter(t => t.owner === 'workspace')` a l'air de trier et ne trie rien. La
 * seule séparation fiable est l'appartenance à `OUR_SUPPLIERS` / `CLIENT_TOOLS`.
 */

/** L'entrée du catalogue → le fournisseur de Bellum qu'elle désigne, s'il y en a un. */
const SUPPLIER_BY_PROVIDER = new Map(
  OUR_SUPPLIERS.filter(supplier => supplier.provider !== null).map(supplier => [supplier.provider as string, supplier]),
)

const CLIENT_PROVIDERS = new Set(CLIENT_TOOLS.map(tool => tool.provider))

/**
 * Les entrées dont le libellé porte une MARQUE qui n'est ni à nous, ni au
 * client — avec la raison pour laquelle elle se nomme quand même.
 *
 * Cette table est volontairement pénible : sans elle, un fournisseur ajouté au
 * catalogue et oublié dans `OUR_SUPPLIERS` tomberait dans un troisième seau
 * silencieux, et la garde ci-dessous ne le regarderait même pas. Une entrée
 * neuve est donc REFUSÉE par défaut ; l'y ajouter demande d'écrire pourquoi.
 */
const NAMED_YET_NEITHER: Readonly<Record<string, string>> = {
  boamp:
    'Registre public (Bulletin officiel des annonces des marchés publics), lu SANS clé — même raison que l’INSEE : une provenance vérifiable, pas une intégration commerciale.',
  insee:
    'Registre public. Le nom EST la garantie : « INSEE Sirene » dit la provenance légale d’une donnée d’entreprise.',
  inpi: 'Registre public (RNE) — même raison que l’INSEE : une provenance vérifiable, pas une intégration.',
  zefix: 'Registre public suisse du commerce — la contrepartie helvétique du RNE.',
  'france-travail':
    'Registre public d’offres d’emploi. Le détecteur le laisse passer explicitement (`supplierNamesIn` a « France Travail » pour témoin).',
  github:
    'Plateforme publique lue sans identifiants (60 requêtes/h sans jeton) : une source citable, au même titre qu’un registre.',
  wttj: 'Site d’offres public. Ce que Bellum en lit est public ; le nom dit d’où vient un signal de recrutement.',
  stripe:
    'Le moyen de paiement que l’utilisateur VOIT lui-même au moment de payer. Le taire ne protégerait rien et rendrait la page de facturation incompréhensible.',
}

/**
 * Le cœur de la garde : les libellés de NOS fournisseurs que le détecteur ne
 * voit pas. Extrait en fonction pour que le témoin fabriqué plus bas passe par
 * EXACTEMENT le même chemin que le catalogue réel.
 */
function labelsTheDetectorMisses(entries: readonly Pick<ToolCatalogEntry, 'provider' | 'display_name'>[]): string[] {
  const missed: string[] = []
  for (const entry of entries) {
    const supplier = SUPPLIER_BY_PROVIDER.get(entry.provider)
    if (supplier === undefined) continue
    if (!supplierNamesIn(entry.display_name).includes(supplier.name)) {
      missed.push(`${entry.provider} → « ${entry.display_name} » (attendu : ${supplier.name})`)
    }
  }
  return missed
}

describe('GA-340 — chaque libellé de fournisseur du catalogue est vu par le détecteur', () => {
  it('LIT quelque chose — le catalogue et les deux listes ont un contenu réel', () => {
    // Sans ce plancher, un catalogue vidé par une refonte rendrait la garde
    // verte sur zéro entrée lue. Mesuré le 16/09/2026 : 47 entrées, 12 d'entre
    // elles sont à nous, 23 sont au client.
    expect(TOOL_CATALOG.length).toBeGreaterThanOrEqual(40)
    expect(SUPPLIER_BY_PROVIDER.size).toBeGreaterThanOrEqual(10)
    expect(TOOL_CATALOG.filter(entry => SUPPLIER_BY_PROVIDER.has(entry.provider)).length).toBeGreaterThanOrEqual(10)
    expect(TOOL_CATALOG.filter(entry => CLIENT_PROVIDERS.has(entry.provider)).length).toBeGreaterThanOrEqual(15)
  })

  it('aucun libellé de NOS fournisseurs n’échappe à `supplierNamesIn`', () => {
    expect(labelsTheDetectorMisses(TOOL_CATALOG)).toEqual([])
  })

  it('chaque fournisseur déclaré avec un identifiant existe au catalogue — la liste ne prend pas la poussière', () => {
    const catalogProviders = new Set(TOOL_CATALOG.map(entry => entry.provider))
    const orphans = [...SUPPLIER_BY_PROVIDER.keys()].filter(provider => !catalogProviders.has(provider))
    expect(orphans).toEqual([])
  })

  it('sait dire NON — un libellé que le détecteur ignore est nommé, pas avalé', () => {
    // Le témoin passe par `labelsTheDetectorMisses`, la fonction que le test
    // ci-dessus applique au catalogue réel : ce n'est pas une seconde
    // implémentation qui pourrait diverger.
    expect(labelsTheDetectorMisses([{ provider: 'pappers', display_name: 'Ppapers' }])).toEqual([
      'pappers → « Ppapers » (attendu : Pappers)',
    ])
    // ⚠️ CE QUE J'AI CASSÉ POUR LA VOIR ROUGIR, le 16/09/2026 : rien de
    // fabriqué — la garde est née ROUGE sur le catalogue RÉEL. `OUR_SUPPLIERS`
    // portait `{ name: 'Hunter.io', brand: 'Hunter.io' }` : la marque seule
    // n'existait nulle part, donc `supplierNamesIn('Hunter')` rendait `[]`.
    // Re-cassé après coup, en remettant `brand: 'Hunter.io'` sur cette seule
    // ligne du contrat, pour lire ce que la garde DIT :
    //   apps/api  — 92 tests verts, 1 rouge (« aucun libellé de NOS
    //               fournisseurs n'échappe… ») :
    //               `hunter → « Hunter » (attendu : Hunter.io)` ;
    //   contracts — 16 verts, 1 rouge (« voit la marque SEULE… »).
    // Puis restauré, et les deux suites redeviennent vertes.
  })

  it('n’attrape pas ce qu’elle ne vise pas — l’outil que le CLIENT branche se nomme légitimement', () => {
    // C'est la moitié de la règle qu'on oublie : « brouillon déposé dans Gmail »
    // dit à un commercial qui a deux boîtes où regarder. Une garde qui rougirait
    // sur « HubSpot » ferait re-litiger la décision du 13/09.
    const falsePositives = TOOL_CATALOG.filter(entry => CLIENT_PROVIDERS.has(entry.provider))
      .map(entry => [entry.display_name, supplierNamesIn(entry.display_name)] as const)
      .filter(([, detected]) => detected.length > 0)
    expect(falsePositives).toEqual([])
  })

  it('n’attrape pas ce qu’elle ne vise pas — registre public, capacité et moyen de paiement', () => {
    const neither = TOOL_CATALOG.filter(
      entry => !SUPPLIER_BY_PROVIDER.has(entry.provider) && !CLIENT_PROVIDERS.has(entry.provider),
    )
    // LIT : ce troisième seau n'est pas vide, sinon le test suivant ne dirait rien.
    expect(neither.length).toBeGreaterThanOrEqual(10)
    const detected = neither
      .map(entry => [entry.display_name, supplierNamesIn(entry.display_name)] as const)
      .filter(([, hits]) => hits.length > 0)
    expect(detected).toEqual([])
  })

  it('toute entrée du catalogue est CLASSÉE — à nous, au client, une capacité, ou nommée avec sa raison', () => {
    const unclassified = TOOL_CATALOG.filter(
      entry =>
        !SUPPLIER_BY_PROVIDER.has(entry.provider) &&
        !CLIENT_PROVIDERS.has(entry.provider) &&
        entry.genericName !== true &&
        NAMED_YET_NEITHER[entry.provider] === undefined,
    ).map(entry => `${entry.provider} → « ${entry.display_name} »`)
    expect(unclassified).toEqual([])
    // La raison écrite est le prix d'entrée : une ligne vide ne classe rien, et
    // une entrée qui a quitté le catalogue ne doit pas garder son passe-droit.
    const wordless = Object.entries(NAMED_YET_NEITHER).filter(([, why]) => why.length <= 60)
    expect(wordless).toEqual([])
    const stale = Object.keys(NAMED_YET_NEITHER).filter(
      provider => !TOOL_CATALOG.some(entry => entry.provider === provider),
    )
    expect(stale).toEqual([])
  })
})
