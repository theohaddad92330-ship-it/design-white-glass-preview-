/**
 * #4072.7 (recette R46) — l'organigramme DÉPOSÉ dans les documents de l'espace de démonstration.
 *
 * Le bouton « Lire les organigrammes de tes documents » finissait en toast « HTTP request failed » en démo :
 * l'API passait par le service IA, que l'espace de démonstration ne doit jamais payer ni attendre, et la
 * moindre panne de ce chemin se voyait en réunion. En démo, l'API répond donc depuis CE fichier, sans réseau :
 * la même PROPOSITION datée que celle que l'IA rendrait en lisant le document semé (`DEMO_RAG_DOCUMENTS`,
 * même contenu — la spec le prouve en relisant les lignes du texte).
 *
 * Deux des personnes sont déjà des contacts du dossier (et, pour les deux premières, déjà au CRM fictif) :
 * l'écran peut montrer « Déjà connu » ET « à ajouter » dans la même lecture. Les trois autres sont FICTIVES,
 * comme tout ce que contient la salle.
 */
export const DEMO_ORG_DOCUMENT = {
  /** Le seul compte semé qui porte un organigramme déposé. */
  company: 'Société Générale',
  title: 'Organigramme DSI Société Générale — mars 2026 (démo)',
  category: 'Organigramme',
  /** Écrite dans le texte du document (« au 12/03/2026 »), pas celle de l'import. */
  documentDate: '2026-03-12',
  rows: [
    { fullName: 'Lorenzo Bini Smaghi', title: 'Président du conseil d’administration', entityName: 'Gouvernance' },
    { fullName: 'Pierre Palmieri', title: 'Directeur général délégué', entityName: 'Direction générale' },
    {
      fullName: 'Hélène Marchetti',
      title: 'Directrice des systèmes d’information — Banque de détail',
      entityName: 'DSI Banque de détail',
    },
    {
      fullName: 'Nicolas Vasseur',
      title: 'Responsable architecture et urbanisme SI',
      entityName: 'DSI Banque de détail',
      managerName: 'Hélène Marchetti',
    },
    {
      fullName: 'Sophie Lemaire',
      title: 'Directrice de la sécurité des systèmes d’information',
      entityName: 'Sécurité',
    },
  ],
} as const

/** Le texte du document semé : un tableau tabulé, le format que l'extraction lit (colonnes Nom · Fonction · Direction · Manager). */
export function demoOrgDocumentContent(): string {
  return [
    'Organigramme DSI — état au 12/03/2026',
    ['Nom', 'Fonction', 'Direction', 'Manager'].join('\t'),
    ...DEMO_ORG_DOCUMENT.rows.map(row =>
      [row.fullName, row.title, row.entityName, 'managerName' in row ? row.managerName : ''].join('\t'),
    ),
  ].join('\n')
}

type DemoOrgDocumentPeople = {
  people: Array<{
    fullName: string
    title: string
    entityName: string
    managerName?: string
    documentDate: string
  }>
  documentsRead: number
  truncated: false
}

/**
 * Ce que la lecture des documents rend en espace de démonstration : la proposition du document semé pour son
 * compte, « aucun organigramme (0 lu) » pour tout autre compte — jamais une personne inventée pour remplir.
 */
export function demoOrgDocumentPeople(companyName: string | null | undefined): DemoOrgDocumentPeople {
  if ((companyName ?? '').trim().toLowerCase() !== DEMO_ORG_DOCUMENT.company.toLowerCase()) {
    return { people: [], documentsRead: 0, truncated: false }
  }
  return {
    people: DEMO_ORG_DOCUMENT.rows.map(row => ({
      fullName: row.fullName,
      title: row.title,
      entityName: row.entityName,
      ...('managerName' in row ? { managerName: row.managerName } : {}),
      documentDate: DEMO_ORG_DOCUMENT.documentDate,
    })),
    documentsRead: 1,
    truncated: false,
  }
}
