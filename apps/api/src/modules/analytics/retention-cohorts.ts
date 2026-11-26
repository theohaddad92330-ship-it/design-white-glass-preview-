/**
 * #1658.1 — LA RÉTENTION PAR COHORTE MENSUELLE D'ESPACES, en fonctions pures.
 *
 * Lignes = mois d'inscription de l'espace, colonnes = M0 → M11, cellules = part
 * des espaces de la cohorte ENCORE ACTIFS ce mois-là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « ACTIF » = UNE ACTION VALIDÉE DANS LE MOIS. PAS UNE CONNEXION.
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est la phrase de l'issue, et c'est ce qui décide de la SOURCE : `user_actions`,
 * et elle seule. Deux faits la rendent exacte plutôt qu'approchée :
 *
 *  1. Le vocabulaire de `user_actions` (`actionTypeSchema`, @bellum/contracts) ne
 *     contient AUCUN événement de session — pas de `login`, pas de `session_start`.
 *     Chaque ligne y est un geste posé sur le produit : un message envoyé, une
 *     analyse lancée, une action de plan terminée, un export. Une ligne dans le
 *     mois EST donc une action validée dans le mois.
 *  2. La connexion, elle, vit dans une AUTRE table — `user_last_seen`, posée au
 *     sign-in. Ne pas la lire ici n'est pas un oubli : c'est l'interdit de l'issue.
 *
 * ⚠️ ET C'EST PRÉCISÉMENT LÀ QUE CETTE MESURE S'ÉCARTE DE `client-health.ts`.
 * L'axe « Activité » de la santé client (#1652) prend le MAXIMUM de
 * `user_actions.created_at` ET des `user_last_seen.last_seen_at` des membres —
 * « les deux sont partiels ; leur maximum l'est moins », dit son commentaire, et
 * c'est juste pour ce qu'il mesure (« ce client donne-t-il encore signe de
 * vie ? »). Ce n'est pas ce que la rétention mesure : un espace dont trois
 * personnes se connectent chaque lundi sans jamais rien valider n'est PAS retenu,
 * il est en train de partir. Les deux écrans ne se contrediront donc pas sur la
 * même question — ils ne posent pas la même.
 *
 * La moitié partagée, elle, l'est vraiment : `user_actions`, groupée par
 * `workspace_id`, exactement comme `actionRollups()` de `admin-client-health.service`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS CHOSES QUI NE SE CONFONDENT PAS DANS UNE CELLULE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Un mois ÉCOULÉ sans aucun espace actif vaut **0** — c'est un vrai zéro,
 *     mesuré, et c'est même l'information que l'écran cherche.
 *  2. Un mois À VENIR vaut **`null`** : M7 d'une cohorte qui a trois mois n'est
 *     pas « 0 % de rétention », c'est un mois qui n'a pas eu lieu. La question
 *     de la doctrine — *si cette valeur est absente, « 0 » est-il VRAI ?* — s'y
 *     répond NON.
 *  3. Une cohorte VIDE n'existe pas : un mois sans aucune inscription ne produit
 *     aucune ligne, plutôt qu'une ligne à zéro espace.
 *
 * ⚠️ `maintenant` EST UN PARAMÈTRE, jamais `new Date()`. Une dérivation qui lit
 * l'horloge passe à Paris et échoue sur un exécuteur CI en UTC.
 *
 * ⚠️ CE QUI N'EST PAS DÉCIDÉ ICI : le MASQUAGE des petites cohortes. Le seuil
 * (« moins de 3 espaces ») vit à UN seul endroit, `COHORT_MIN_SPACES` dans
 * `apps/dashboard-manager/src/app/_components/charts.logic.ts` (#1643), et c'est
 * la grille qui l'applique. Le recopier ici en ferait deux valeurs le jour où
 * l'une change — et un calcul qui masque à 3 pendant qu'un écran affiche à 2 est
 * pire que pas de masquage du tout (GA-26).
 */

/** Les douze colonnes de la grille, M0 → M11. Le même nombre que `COHORT_MONTHS`
 *  côté écran, et il est ici parce que c'est le calcul qui décide combien de
 *  colonnes il REMPLIT ; la grille décide combien elle en DESSINE. */
export const RETENTION_MONTHS = 12

/** Un espace inscrit — réduit à ce dont la cohorte a besoin. */
export interface EspaceInscrit {
  workspaceId: string
  /** `workspaces.created_at` — le point zéro de la cohorte. */
  createdAt: Date
}

/**
 * Un mois pendant lequel un espace a validé AU MOINS une action.
 *
 * Une paire (espace, mois), pas un compte : la rétention demande « a-t-il agi ? »,
 * pas « combien de fois ». Compter les lignes ferait entrer le VOLUME dans une
 * mesure binaire, et un espace à mille actions ne serait pas plus retenu qu'un
 * espace à une.
 */
export interface MoisActif {
  workspaceId: string
  /** `YYYY-MM`, calendrier UTC — voir {@link moisDe}. */
  mois: string
}

/**
 * Une cohorte, telle qu'elle voyage jusqu'à l'écran.
 *
 * La forme est celle que `buildCohortGrid` (#1643) attend, à un renommage près
 * qui se fait côté console : c'est la grille livrée qui dessine, ce calcul ne
 * réécrit rien d'elle.
 */
interface CohorteRetention {
  /** `YYYY-MM` — le mois d'INSCRIPTION, jamais un mois d'activité. */
  cohorte: string
  /** Espaces inscrits ce mois-là. Le dénominateur, et lui seul. */
  espaces: number
  /**
   * Décalages de mois DÉJÀ ATTEINTS par cette cohorte, 0 = M0 seul atteint.
   *
   * Calculé ici et pas à l'écran : `maintenant` est connu du serveur, et deux
   * chemins qui referaient la dérivation divergeraient une nuit sur deux — c'est
   * la leçon que `analyses-heatmap.logic.ts` écrit en toutes lettres.
   */
  moisEcoules: number
  /**
   * Part d'espaces actifs à chaque décalage, 0 → 1. Longueur {@link RETENTION_MONTHS}.
   *
   * `null` à l'indice `m` veut dire « ce mois n'a pas eu lieu », JAMAIS « zéro
   * espace actif ». Un mois écoulé sans personne vaut `0`.
   */
  retentionParMois: (number | null)[]
}

export interface RapportRetention {
  /** De la cohorte la plus ANCIENNE à la plus récente — l'ordre de lecture d'une
   *  grille de cohortes, où l'on suit une ligne vers la droite en vieillissant. */
  cohortes: CohorteRetention[]
  /** Le nombre de colonnes REMPLIES. L'écran en dessine autant. */
  mois: number
  /** L'instant de la lecture, tel que le serveur l'a employé. Affiché plutôt que
   *  supposé : c'est lui qui distingue un mois à venir d'un mois vide. */
  calculeA: string
  /** Espaces retenus dans le calcul — le total des dénominateurs. Sans lui,
   *  « aucune cohorte » et « aucun espace » se ressemblent à l'écran. */
  espaces: number
  /** Espaces qui n'ont JAMAIS validé une action, tous mois confondus. Comptés
   *  parce qu'ils sont dans les dénominateurs et invisibles dans les numérateurs :
   *  une grille qui tait ce qu'elle ne montre pas ment par omission. */
  espacesSansAucuneAction: number
}

/**
 * `YYYY-MM` d'un instant, lu en **UTC**.
 *
 * ⚠️ Le fuseau est un choix, pas un défaut. Un mois est un span du calendrier,
 * pas un instant : le lire dans le fuseau de la machine ferait basculer de
 * cohorte tous les espaces créés le 1er du mois à 00h30 à Paris, et la grille
 * changerait selon l'endroit d'où on la regarde. UTC est le seul repère que le
 * serveur, la CI et la base partagent. La même raison, mot pour mot, que
 * `jourSeul()` côté console.
 */
export function moisDe(instant: Date): string {
  const annee = instant.getUTCFullYear()
  const mois = instant.getUTCMonth() + 1
  return `${annee}-${String(mois).padStart(2, '0')}`
}

/**
 * Combien de mois séparent deux étiquettes `YYYY-MM`. Négatif si `fin` précède
 * `debut` — l'appelant décide ce qu'il en fait plutôt que de recevoir un zéro
 * qui aurait effacé l'anomalie.
 */
export function ecartEnMois(debut: string, fin: string): number {
  const [anneeDebut, moisDebut] = decouper(debut)
  const [anneeFin, moisFin] = decouper(fin)
  return (anneeFin - anneeDebut) * 12 + (moisFin - moisDebut)
}

function decouper(etiquette: string): [number, number] {
  const [annee, mois] = etiquette.split('-')
  return [Number(annee), Number(mois)]
}

/**
 * La grille, à partir de ce que la base a mesuré.
 *
 * `espaces` porte le dénominateur de chaque cohorte ; `moisActifs` porte les
 * numérateurs. Les deux se lisent de la MÊME table pour les seconds
 * (`user_actions`) — un espace absent de `moisActifs` n'est pas « non
 * instrumenté », il est inactif : toute écriture du produit passe par cette
 * table, et un espace qui n'y figure jamais n'a rien validé.
 */
export function construireCohortes(entree: {
  espaces: readonly EspaceInscrit[]
  moisActifs: readonly MoisActif[]
  maintenant: Date
}): RapportRetention {
  const { espaces, moisActifs, maintenant } = entree
  const moisCourant = moisDe(maintenant)

  // Les mois d'activité, par espace. Un `Set` parce que la question est binaire :
  // deux actions le même mois ne rendent pas l'espace deux fois actif.
  const actifsParEspace = new Map<string, Set<string>>()
  for (const ligne of moisActifs) {
    const dejaVu = actifsParEspace.get(ligne.workspaceId) ?? new Set<string>()
    dejaVu.add(ligne.mois)
    actifsParEspace.set(ligne.workspaceId, dejaVu)
  }

  // Les espaces, par mois d'inscription.
  const parCohorte = new Map<string, EspaceInscrit[]>()
  for (const espace of espaces) {
    const cohorte = moisDe(espace.createdAt)
    // Un espace créé « dans le futur » (horloge décalée, semis daté) n'a aucune
    // colonne à remplir : le retenir produirait une cohorte à `moisEcoules`
    // négatif, c'est-à-dire une ligne entièrement à venir qui ne dirait rien.
    if (ecartEnMois(cohorte, moisCourant) < 0) continue
    const liste = parCohorte.get(cohorte) ?? []
    liste.push(espace)
    parCohorte.set(cohorte, liste)
  }

  const cohortes: CohorteRetention[] = [...parCohorte.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohorte, membres]) => {
      const moisEcoules = Math.min(ecartEnMois(cohorte, moisCourant), RETENTION_MONTHS - 1)
      const retentionParMois: (number | null)[] = []

      for (let decalage = 0; decalage < RETENTION_MONTHS; decalage++) {
        if (decalage > moisEcoules) {
          // Le mois n'a pas eu lieu. `null`, et surtout pas `0`.
          retentionParMois.push(null)
          continue
        }
        const mois = moisApres(cohorte, decalage)
        const actifs = membres.filter(membre => actifsParEspace.get(membre.workspaceId)?.has(mois)).length
        retentionParMois.push(actifs / membres.length)
      }

      return { cohorte, espaces: membres.length, moisEcoules, retentionParMois }
    })

  const retenus = [...parCohorte.values()].flat()
  return {
    cohortes,
    mois: RETENTION_MONTHS,
    calculeA: maintenant.toISOString(),
    espaces: retenus.length,
    espacesSansAucuneAction: retenus.filter(espace => !actifsParEspace.has(espace.workspaceId)).length,
  }
}

/** `2026-03` + 4 → `2026-07`. Sur les étiquettes, pas sur des `Date` : ajouter
 *  des mois à un instant fait déborder le 31 sur le mois suivant. */
export function moisApres(etiquette: string, decalage: number): string {
  const [annee, mois] = decouper(etiquette)
  const total = annee * 12 + (mois - 1) + decalage
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
