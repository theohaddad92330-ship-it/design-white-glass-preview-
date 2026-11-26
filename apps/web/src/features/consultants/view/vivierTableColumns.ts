/**
 * #2182.25 à .40 — LES COLONNES DU VIVIER, ET LEURS BORNES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE #2182 DEMANDE, ET CE QUI EXISTAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue #2182 décrit le Vivier comme un écran d'ATS : une table dense, où
 * chaque ligne se lit en colonnes comparables. Ce que le produit rendait était
 * une liste de CARTES — les mêmes données, mais empilées dans un pavé de texte
 * par ligne : on ne pouvait ni comparer deux TJM, ni balayer la séniorité d'une
 * page, ni voir d'un coup d'œil qui n'a pas été contacté depuis six mois.
 *
 * ⚠️ AUCUN CHAMP N'A ÉTÉ INVENTÉ POUR CETTE TABLE. Les colonnes ci-dessous
 * lisent toutes un champ que `TalentRow` porte DÉJÀ (contrats, `talent.ts:337`)
 * et que `GET /talents` rend déjà. Les colonnes demandées dont le champ n'existe
 * pas restent au registre, non livrées, avec leur raison :
 *
 *   · #2182.36 / #2182.52 « owner » — `TalentRow` ne porte aucun référent
 *     commercial. `consultants.owner_id` existe dans le métier, l'API n'en rend
 *     ni l'identifiant ni le nom sur la ligne de vivier. Une colonne d'UUID ne
 *     fait décider personne, et un nom inventé serait pire.
 *   · #2182.40 « prochaine action » — rien côté serveur ne calcule la prochaine
 *     action d'un TALENT. Elle existe pour une MISSION (`activeMissionNextAction`)
 *     et #1357 a tranché : « la valeur doit provenir de l'action existante,
 *     jamais être inventée localement ». La refaire ici donnerait une seconde
 *     échelle d'urgence, qui divergerait au premier ajout.
 *   · #2182.38 « matching actuel » — un rapprochement n'existe pas sans un
 *     besoin de référence (`ConsultantMatchPanel`, `NeedsMatchRail`). Une
 *     colonne de score nu sur une liste sans besoin serait exactement le
 *     « score de fit » que la doctrine refuse six fois.
 *
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE DE LARGEUR — #2737 (rouverte par Louis le 25/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce qui tient depuis #2465 (`/contacts`, 16/09/2026 : conteneur 1 195 px,
 * tableau 1 587 px) : `table-fixed`, et des largeurs qui font EXACTEMENT celle
 * du conteneur — le tableau ne déborde jamais.
 *
 * Ce qui est tombé : des PARTS EN POURCENTAGE choisies par palier de VIEWPORT
 * (`md:`/`lg:`/`xl:`). Mesuré sur la capture du 25/09 (fenêtre ~1 000 px,
 * conteneur ~830 px) : treize colonnes se partageaient la place, « Complétude »
 * recevait 3 % et s'écrivait « Co/m/pl/ét/ud/e », « 20/100 » débordait sur la
 * voisine, Statut et Disponibilité se superposaient. Une part ne garantit rien
 * contre la largeur d'un CONTENU, et un palier de viewport ignore la barre
 * latérale et le panneau de correspondance (#2526) qui mangent le conteneur.
 *
 * La règle, désormais :
 *   1. chaque colonne déclare un PLANCHER en pixels (`minPx`) — la largeur où
 *      son en-tête tient sur UNE ligne et sa valeur courante se lit ;
 *   2. le tableau MESURE son conteneur (`ResizeObserver`, `VivierTable.tsx`)
 *      et `vivierColumnsFor` ajoute les colonnes par PRIORITÉ (`rank`) tant
 *      que leurs planchers tiennent — jamais une colonne moins prioritaire
 *      avant une plus prioritaire ;
 *   3. quatre colonnes ne partent JAMAIS (`VIVIER_REQUIRED_COLUMNS`) : le nom
 *      (le titre en 2ᵉ ligne), la disponibilité (le statut en 2ᵉ ligne), les
 *      compétences, les actions ;
 *   4. l'espace restant va aux colonnes qui en profitent (`grow`), et la somme
 *      vaut EXACTEMENT la largeur mesurée ;
 *   5. une colonne masquée se lit sur la fiche, ouverte depuis le nom.
 * Sous 768 px, le vivier se lit en CARTES (`VivierCardList.tsx`), pas en table.
 *
 * ⚠️ UNE COLONNE ÉTROITE NE REMPLIT JAMAIS UNE ABSENCE. TJM absent, dernier
 * contact absent, zone absente : `UnknownValue` les NOMME (en forme discrète
 * dans une cellule — un tiret atténué dont le nom accessible et l'infobulle
 * disent « non mesuré »), jamais « 0 ».
 *
 * Gardé par `architecture/le-tableau-du-vivier-tient-dans-lecran.test.ts`
 * (GA-350) et MESURÉ dans un vrai navigateur par
 * `e2e/tests/web/vivier-table-layout.spec.ts` (jsdom ne met rien en page).
 */

export type VivierColumnId = 'name' | 'skills' | 'availability' | 'location' | 'followUp' | 'actions'

type VivierTableColumn = {
  id: VivierColumnId
  /** Largeur sous laquelle l'en-tête enroule ou la valeur courante ne se lit plus (padding compris). */
  minPx: number
  /** 1 = cède en dernier. Unique, et sa raison juste en dessous. */
  rank: number
  /** Part de l'espace restant qu'elle reçoit une fois tous les planchers servis. */
  grow: number
  reason: string
}

/** `table-fixed` : les largeurs posées sur l'en-tête font foi, le contenu ne les pousse jamais. */
export const VIVIER_TABLE_SHELL = 'w-full table-fixed border-separate border-spacing-x-0 border-spacing-y-1'

/**
 * L'ORDRE D'AFFICHAGE, de gauche à droite. La priorité est `rank`, pas la position.
 *
 * Théo C talents-vivier.R3 — CINQ colonnes (Louis, 22/10/2026) : Personne / expertise · Compétences
 * déclarées · Disponibilité & planning · Localisation · Suivi, plus la colonne du geste « Rapprocher ».
 * Le TJM, la séniorité, le télétravail, le contrat, la complétude et la dernière interaction QUITTENT
 * la liste : ils se lisent sur la fiche, ouverte depuis le nom — le score /100 (avec ses axes, dont la
 * complétude) vit sous le métier.
 */
export const VIVIER_TABLE_COLUMNS: readonly VivierTableColumn[] = [
  /*
   * Refonte Théo (maquette `c/talents-vivier`, 23/10/2026) — LES COLONNES DE LA
   * MAQUETTE, dans SON ordre : Personne / expertise · Compétences déclarées ·
   * Disponibilité & planning · Localisation · Suivi · actions. Le mode de
   * travail descend sous la localisation, le type de contrat sous les
   * compétences, la complétude (en clair) sous le titre.
   * #4500 (Louis 23/10/2026, refonte V22) — « peu de colonnes, rien de tronqué » :
   * le TJM et la séniorité QUITTENT la liste (écart talents-vivier.R3) ; ils
   * restent sur la fiche, dans la modale de filtres (TJM min/max, séniorité)
   * et dans l'export.
   */
  {
    id: 'name',
    minPx: 208,
    rank: 1,
    grow: 3,
    reason:
      "C'est l'objet de la ligne : sans le nom, la ligne ne désigne personne. Le TITRE et la complétude de la fiche, en clair, vivent dessous (maquette) — « Jean Martin » ne dit rien, « Jean Martin, Architecte Cloud » fait décider.",
  },
  {
    id: 'skills',
    minPx: 184,
    rank: 3,
    grow: 3,
    reason:
      "C'est sur quoi on cherche quelqu'un : la compétence EST le critère de sélection d'une ESN. Une ligne de pastilles, « +N », et le type de contrat dessous (salarié, freelance) — la maquette les lit ensemble.",
  },
  {
    id: 'availability',
    minPx: 208,
    rank: 2,
    grow: 1,
    reason:
      "La question du vivier, celle pour laquelle on ouvre l'écran : qui est libre ? La disponibilité DÉCLARÉE gagne (Louis 23/10/2026) et le planning se lit dessous ; d'où un en-tête « Disponibilité & planning », le plus long de la ligne.",
  },
  {
    id: 'location',
    minPx: 136,
    rank: 5,
    grow: 1,
    reason:
      '`zones[]` porte la ville en premier puis les autres zones acceptées, et le mode de travail dessous (sur site, hybride) : ensemble, ils disent si une mission est faisable.',
  },
  {
    id: 'followUp',
    minPx: 136,
    rank: 6,
    grow: 0,
    reason:
      "Le suivi de la personne : ses présentations en cours, ses placements, son dernier échange. Il sépare un vivier vivant d'un fichier mort.",
  },
  {
    id: 'actions',
    minPx: 184,
    rank: 4,
    grow: 0,
    reason:
      '« Rapprocher » (maquette) et un menu « … ». Un bouton libellé plus une cible de 44 px au tactile et leur marge : ce plancher ne se partage jamais, même quand le conteneur est plus étroit que le minimum.',
  },
]

/** Les colonnes qui ne partent jamais, quelle que soit la largeur (#2737). */
export const VIVIER_REQUIRED_COLUMNS: readonly VivierColumnId[] = ['name', 'availability', 'skills', 'actions']

/** Les colonnes dont le plancher ne se rogne jamais (des cibles tactiles, pas du texte). */
const FIXED_COLUMNS: ReadonlySet<VivierColumnId> = new Set(['actions'])

export type VivierColumnLayout = { id: VivierColumnId; widthPx: number }

/**
 * #2737 — les colonnes rendues pour un conteneur de `containerPx` pixels, dans
 * l'ordre d'affichage, avec leur largeur. Leur somme vaut `containerPx`.
 *
 * `containerPx` nul ou non fini = pas encore mesuré (jsdom, premier rendu
 * serveur) : toutes les colonnes, à leur plancher.
 */
export function vivierColumnsFor(containerPx: number): VivierColumnLayout[] {
  const measured = Number.isFinite(containerPx) && containerPx > 0
  const chosen = new Set<VivierColumnId>(VIVIER_REQUIRED_COLUMNS)
  const floorOf = (ids: Iterable<VivierColumnId>) => [...ids].reduce((sum, id) => sum + (BY_ID.get(id)?.minPx ?? 0), 0)

  if (!measured) {
    return VIVIER_TABLE_COLUMNS.map(column => ({ id: column.id, widthPx: column.minPx }))
  }

  // Priorité STRICTE : la première colonne qui ne tient pas arrête l'ajout —
  // jamais une colonne moins prioritaire à l'écran quand une plus
  // prioritaire n'y est pas.
  for (const column of BY_RANK) {
    if (chosen.has(column.id)) continue
    if (floorOf(chosen) + column.minPx > containerPx) break
    chosen.add(column.id)
  }

  const visible = VIVIER_TABLE_COLUMNS.filter(column => chosen.has(column.id))
  const fixedPx = visible.filter(column => FIXED_COLUMNS.has(column.id)).reduce((sum, c) => sum + c.minPx, 0)
  const flexible = visible.filter(column => !FIXED_COLUMNS.has(column.id))
  const flexibleFloor = flexible.reduce((sum, column) => sum + column.minPx, 0)
  const room = Math.max(0, containerPx - fixedPx)
  const extra = room - flexibleFloor
  const growTotal = flexible.reduce((sum, column) => sum + column.grow, 0)

  return visible.map(column => {
    if (FIXED_COLUMNS.has(column.id)) return { id: column.id, widthPx: column.minPx }
    // Plus étroit que les planchers : tout ce qui n'est pas une cible se
    // resserre au prorata (les cellules tronquent, rien ne déborde).
    if (extra < 0) return { id: column.id, widthPx: (column.minPx * room) / flexibleFloor }
    const share = growTotal > 0 ? column.grow / growTotal : 1 / flexible.length
    return { id: column.id, widthPx: column.minPx + extra * share }
  })
}

const BY_ID = new Map(VIVIER_TABLE_COLUMNS.map(column => [column.id, column]))
const BY_RANK = [...VIVIER_TABLE_COLUMNS].sort((a, b) => a.rank - b.rank)
