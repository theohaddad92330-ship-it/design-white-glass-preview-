/**
 * Règles de texte du convertisseur de briefs (chantier « briefs comptes »,
 * 01/10/2026). Tranchées par Louis / le CEO, jamais re-questionnées :
 *
 *  1. « OneSide » est NEUTRALISÉ (TotalEnergies, Alstom — 113 mentions) : le
 *     brief parle au commercial (« tes métiers »), il ne nomme pas l'éditeur de
 *     la méthode. Chaque tournure a SA réécriture (une substitution aveugle
 *     donnerait « le contrat de OneSide » → « le contrat de »). Toute mention
 *     restante après les règles est une ERREUR, pas un oubli.
 *  2. Aucune donnée de NOTRE propre performance (statut de relation,
 *     tentatives, faux numéros…) : les colonnes sont retirées par le plan de
 *     chaque onglet, et les rares phrases qui les citent sont réécrites ici,
 *     explicitement, par compte (`OWN_PERFORMANCE_REWRITES`).
 */

/** Ordre significatif : du plus spécifique au plus général. */
const ONESIDE_RULES: readonly (readonly [RegExp, string])[] = [
  [/AXE ONESIDE/g, 'AXE MÉTIER'],
  [/MÉTIER ONESIDE/g, 'MÉTIER'],
  [/Aucun statut de OneSide présumé/g, 'Aucun statut présumé'],
  [/Acheteur du contrat OneSide/g, 'Acheteur de ton contrat'],
  [/acheteur habilité à commander le contrat OneSide/g, 'acheteur habilité à commander ton contrat'],
  [/qui engage le contrat OneSide/g, 'qui engage ton contrat'],
  [/Hypothèse de prestation OneSide/g, 'Hypothèse de prestation'],
  [/sur les métiers OneSide/g, 'sur tes métiers'],
  [/— métiers OneSide/g, '— tes métiers'],
  [/liste de courses OneSide/g, 'ta liste de courses'],
  [/le métier OneSide par excellence/g, 'ton métier par excellence'],
  [/exactement OneSide/g, 'exactement ton métier'],
  [/le contrat d['’]assistance OneSide/g, 'ton contrat d’assistance'],
  [/demande de prestation OneSide/g, 'demande de prestation'],
  // Démo clients 04/10/2026 : les ESN prospects (QuickSort, Meedz, Alpineo) sont neutralisées de la même façon.
  [/Le cœur de cible de QuickSort/g, 'Le cœur de ta cible'],
  [/Le cœur de QuickSort/g, 'Ton cœur'],
  [/Hors cœur QuickSort/g, 'Hors de ton cœur'],
  [/la pression tarifaire dont parle Meedz/g, 'la pression tarifaire dont tu parles'],
  [/le durcissement que vit Meedz/g, 'le durcissement que tu vis'],
  [/Cœur de l['’]offre Meedz/g, 'Cœur de ton offre'],
]

/**
 * GARDE UNIQUE des ESN prospects : OneSide (TotalEnergies, Alstom), NGen (démo du 05/10), QuickSort, Meedz, Alpineo,
 * Thélio, Les Pertinents (démos clients du 04/10/2026). Un nom restant après réécriture est une ERREUR, jamais un oubli.
 * Une adresse e-mail est une coordonnée en clair, jamais modifiée : elle sort du contrôle.
 */
const PROSPECT_NAMES = /one\s?side|quick\s?sort|meedz|alpineo|\b(?:n\s?gen|th[ée]lio|les\s+pertinents)\b/i
const EMAIL_ADDRESS = /[\w.+'’-]+@[\w-]+(?:\.[\w-]+)+/g

const assertNoProspectName = (out: string): void => {
  if (PROSPECT_NAMES.test(out.replace(EMAIL_ADDRESS, ''))) {
    throw new Error(
      `Nom d'ESN prospect (NGen, OneSide, QuickSort, Meedz, Alpineo, Thélio, Les Pertinents) non neutralisé, ajouter une règle dans text-rules.ts : ${out.slice(0, 160)}`,
    )
  }
}

/**
 * « NGen » (l'ESN prospect de la démo du 05/10/2026, Nantes) est NEUTRALISÉ comme « OneSide » l'a été : le brief
 * parle au commercial (« ton expertise nucléaire »), il ne nomme pas son ESN (décision Louis 04/10/2026).
 * Chaque tournure a SA réécriture ; toute mention restante est une ERREUR, pas un oubli.
 */
const PROSPECT_ESN_RULES: readonly (readonly [RegExp, string])[] = [
  [/ (?:de |d['’]|chez )N\s?GEN\b/gi, ''],
  // Démo clients 04/10/2026 : Thélio (BPCE Toulouse) — l'en-tête « VERDICT POUR THÉLIO » (onglet POSTES DATA TOULOUSE).
  [/ POUR TH[ÉE]LIO\b/gi, ''],
]

/** Les deux jeux de règles s'appliquent TOUJOURS ensemble avant l'unique garde : le contrôle ne voit qu'un texte réécrit. */
const applyProspectRules = (text: string): string =>
  [...ONESIDE_RULES, ...PROSPECT_ESN_RULES].reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    text,
  )

export const neutralizeOneSide = (text: string): string => {
  const out = applyProspectRules(text)
  assertNoProspectName(out)
  return out
}

export const neutralizeProspectEsn = neutralizeOneSide

/**
 * Dossiers de compte du 15/10/2026 (`account-dossier.ts`) : l'ESN prospect de CHAQUE démo et son interlocuteur. Une
 * phrase qui les nomme n'est jamais affichée (décision Louis 15/10, comme OneSide / Alpineo). Par dossier et non dans la
 * garde globale : Experis est une ESN réellement en poste chez d'autres comptes de la salle (BNP Paribas, Société
 * Générale) — elle ne se neutralise que là où elle est le prospect.
 */
export const DOSSIER_PROSPECT_ESN: Readonly<Record<string, RegExp>> = {
  'credit-agricole': /soluxan|\balan\b|dervoet/i,
  vinci: /\bmk4|technova|\bkhey\b|soo ?it|hamadache/i,
  enedis: /experis|mourao/i,
  safran: /\bjems\b|\bsadji\b|benhamou/i,
}

/** Une réécriture par compte : `find` doit exister (sinon la source a changé et
 *  la règle est périmée — le convertisseur échoue plutôt que de laisser passer). */
export type TextRewrite = { sheet: string; find: string; replace: string; why: string }

/** Statuts de relation, tentatives, nombre de relances : notre performance, pas
 *  un fait sur le compte. Le texte réécrit garde ce que la phrase disait DU COMPTE. */
export const OWN_PERFORMANCE_REWRITES: Record<string, readonly TextRewrite[]> = {
  engie: [
    {
      sheet: 'GARDE-FOUS',
      find: ' 49 statuts de relation, majoritairement des tentatives.',
      replace: '',
      why: 'chiffre de nos tentatives retiré (CEO 01/10/2026)',
    },
    {
      sheet: 'COCKPIT',
      find: ' : les 49 statuts de relation sont majoritairement des tentatives',
      replace: '',
      why: 'chiffre de nos tentatives retiré, la phrase garde « L’organigramme date. » (CEO 01/10/2026)',
    },
    {
      sheet: 'BESOINS ET TENDANCES',
      find: 'Statuts de relation majoritairement en tentative. ',
      replace: '',
      why: 'nos statuts de relation retirés des freins observés (CEO 01/10/2026)',
    },
  ],
  bpce: [],
  'societe-generale': [
    {
      sheet: 'SIGNAUX TERRAIN',
      find: 'nrp, ',
      replace: '',
      why: '« nrp » (ne répond pas) = issue d’un de nos appels ; la suite du verbatim est ce que l’interlocuteur a dit',
    },
    {
      sheet: 'SIGNAUX TERRAIN',
      find: ', RDV le 15/02/2022',
      replace: '',
      why: 'date d’un de nos rendez-vous : le signal (3 AO par an) est du compte, le rendez-vous est le nôtre',
    },
  ],
  totalenergies: [
    // Notes d'appel du CEO collées dans la colonne FONCTION : l'issue de nos appels n'est pas une fonction.
    {
      sheet: 'ORGANISATION METIER',
      find: '-Appel sans rép - à rappeler - mail ?',
      replace: '',
      why: 'issue de notre appel dans la colonne FONCTION',
    },
    {
      sheet: 'ORGANISATION METIER',
      find: 'RDV le 7 sept',
      replace: '',
      why: 'date de notre rendez-vous dans la colonne FONCTION',
    },
    {
      sheet: 'DECIDEURS ET ROLES',
      find: '-Appel sans rép - à rappeler - mail ?',
      replace: '',
      why: 'issue de notre appel dans la colonne FONCTION',
    },
    {
      sheet: 'DECIDEURS ET ROLES',
      find: 'RDV le 7 sept',
      replace: '',
      why: 'date de notre rendez-vous dans la colonne FONCTION',
    },
  ],
  alstom: [],
  // Démo ESN Nantes (04/10/2026) : aucun statut de relation ni tentative dans ces deux classeurs.
  'naval-group': [],
  'chantiers-atlantique': [],
  // Démo clients (04/10/2026) : ABB Suisse — aucun statut de relation ni tentative dans le classeur.
  'abb-suisse': [],
}
