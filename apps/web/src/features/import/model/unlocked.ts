/**
 * LES TROIS FAMILLES DE REPRISE (#1449).
 *
 * Les treize sources arrivaient à plat, toutes de même poids : l'utilisateur
 * devait deviner lui-même laquelle correspond à sa situation. Le retour propose
 * de les ranger par INTENTION — « je récupère un ancien outil », « je récupère
 * mon business », « je récupère mes consultants » — et c'est la bonne question,
 * parce que c'est celle qu'on se pose en arrivant.
 *
 * ⚠️ Le regroupement vit ICI et non au serveur : le catalogue des sources est
 * une capacité (quel format se lit, ce qu'il importe), la famille est une aide
 * à la LECTURE. Une source inconnue de cette table n'est jamais perdue — elle
 * tombe dans la dernière famille, qui sert aussi de fourre-tout nommé. C'est ce
 * qui permet d'ajouter une source côté serveur sans la faire disparaître ici.
 */
export const SOURCE_FAMILIES: { key: string; sources: string[] }[] = [
  {
    key: 'legacyTool',
    sources: [
      'hubspot_export',
      'crm_generic_export',
      'boondmanager_export',
      'ats_export',
      'salesconnect_legacy_export',
    ],
  },
  { key: 'talent', sources: ['talent_pool', 'cv_bulk'] },
  {
    key: 'business',
    sources: ['accounts_only', 'contacts_only', 'projects', 'missions', 'notes', 'activity_history'],
  },
]
/**
 * La famille d'une source — la MÊME table que le regroupement des cartes.
 *
 * ⚠️ Une source inconnue retombe sur la dernière famille, exactement comme
 * `groupSourcesByFamily` : deux réponses différentes à « à quelle famille
 * appartient cette source » feraient qu'une carte serait rangée ici et promise
 * là.
 */
export function familyOfSource(sourceKey: string): string {
  const family = SOURCE_FAMILIES.find(candidate => candidate.sources.includes(sourceKey))
  return family?.key ?? SOURCE_FAMILIES[SOURCE_FAMILIES.length - 1].key
}

/**
 * CE QUE CES DONNÉES VONT DÉBLOQUER — #1452.
 *
 * *« L'utilisateur doit importer pour un bénéfice métier, pas pour "mettre des
 * données dans Bellum". »*
 *
 * ⚠️ La contrainte que le retour pose lui-même : *« Ne promettre que les usages
 * réellement branchés dans le produit. »* Chaque ligne porte donc une
 * DESTINATION — l'écran où l'usage se constate. Une promesse sans écran
 * n'aurait rien pour la démentir, et c'est exactement comme ça qu'un produit se
 * met à mentir poliment.
 */
export const UNLOCKED_BY_FAMILY: Record<string, { key: string; to: string }[]> = {
  legacyTool: [
    { key: 'portfolio', to: '/accounts' },
    { key: 'noRediscovery', to: '/contacts' },
    { key: 'history', to: '/actions' },
  ],
  business: [
    { key: 'portfolio', to: '/accounts' },
    { key: 'noRediscovery', to: '/contacts' },
    { key: 'history', to: '/actions' },
  ],
  talent: [
    { key: 'matching', to: '/projects' },
    { key: 'availability', to: '/consultants' },
    { key: 'submissions', to: '/consultants' },
  ],
}
