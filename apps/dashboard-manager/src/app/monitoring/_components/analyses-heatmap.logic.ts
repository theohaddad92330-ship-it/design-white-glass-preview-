import { computeIntensity, intensityDomain, type Intensity } from '@/ui/Heatmap.logic'
import { LANGUE_CONSOLE } from '@/lib/dates'
import type { AnalysesHeatmapBucket } from '@/lib/monitoring'

/**
 * #1650 — « quand le produit est utilisé » : la dérivation de la grille
 * 7 jours × 12 tranches horaires des analyses LANCÉES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EST DÉCIDÉ ICI, ET CE QUI NE L'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * · La QUANTIFICATION en 5 paliers n'est PAS refaite : `computeIntensity` et
 *   `intensityDomain` (#1642) sont les seuls à la porter. Deux chemins qui
 *   referaient la même dérivation divergeraient, et la garantie « les intensités
 *   sont relatives au maximum de la période » ne tiendrait plus qu'à moitié.
 * · Le FUSEAU n'est pas décidé ici non plus. L'API groupe déjà en heure de
 *   Paris et renvoie le fuseau qu'elle a employé : refaire la conversion à
 *   l'écran, sur l'horloge de la machine qui rend (UTC sur Vercel), produirait
 *   une DEUXIÈME réponse à la même question, et les deux se contrediraient une
 *   nuit sur deux. Ce module ne reçoit que des jours calendaires et des heures
 *   locales déjà résolus.
 * · Par conséquent, `maintenant` est un PARAMÈTRE — il vient de la charge utile,
 *   jamais de `new Date()`. Une dérivation qui lit l'horloge passe à Paris et
 *   échoue sur un exécuteur CI en UTC ; la garde du fichier de test le tient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ABSENCES QUI NE SE CONFONDENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Une tranche PASSÉE sans lancement vaut **0** — c'est un vrai zéro, mesuré,
 *     et c'est même l'information que l'issue cherche (« usage nul le vendredi »).
 *  2. Une tranche À VENIR vaut **`null`** — l'heure n'a pas sonné, « 0 » serait
 *     faux. La primitive #1642 la dessine distinctement du palier 0.
 *  3. Une semaine ILLISIBLE (API en panne) ne passe jamais par ici : l'appelant
 *     rend une erreur, pas une grille vide.
 */

/** Première tranche dessinée (incluse). */
export const HEURE_DEBUT = 8
/** Dernière tranche dessinée (EXCLUE) — 8 → 20 fait douze tranches. */
export const HEURE_FIN = 20

/** Les douze tranches, 8 h … 19 h. */
const TRANCHES: readonly number[] = Array.from({ length: HEURE_FIN - HEURE_DEBUT }, (_, i) => HEURE_DEBUT + i)

type CelluleCommune = {
  jour: string
  heure: number
  intensite: Intensity | null
  /** Les ESPACES concernés. Jamais une personne (#1650, #1681). */
  espaces: readonly string[]
  /** Lancements dont l'espace n'a pas pu être résolu — comptés, pas nommés. */
  sansEspace: number
}

/**
 * Une case de la grille — et c'est une UNION, pas un objet à champ nullable.
 *
 * ⚠️ CE QUE LE TYPE PLAT COÛTAIT (mesuré par GA-19 le 07/09/2026)
 * `valeur: number | null` obligeait chaque lecteur à écrire `cellule.valeur ?? 0`
 * après avoir pourtant déjà écarté le cas « à venir ». Deux occurrences de plus
 * au cliquet, pour un repli sur zéro qui n'arrivait jamais — mais qui, le jour
 * où l'ordre des tests changerait, écrirait « 0 analyse lancée » sur une heure
 * qui n'a pas encore sonné. C'est exactement le mensonge que GA-19 refuse.
 *
 * L'union le rend IMPOSSIBLE : après `if (cellule.aVenir)`, TypeScript sait que
 * `valeur` est un nombre, et aucun `?? 0` n'a plus de raison d'exister. On
 * retire le MOYEN d'écrire le zéro, pas seulement l'occasion.
 */
export type CelluleAnalyses =
  /** Tranche à venir : l'heure n'a pas sonné. `null`, jamais « 0 ». */
  | (CelluleCommune & { aVenir: true; valeur: null })
  /** Tranche écoulée : la valeur est MESURÉE, et zéro y est une vraie mesure. */
  | (CelluleCommune & { aVenir: false; valeur: number })

type LigneAnalyses = { jour: string; libelle: string; cellules: CelluleAnalyses[] }

export type GrilleAnalyses = {
  lignes: LigneAnalyses[]
  tranches: readonly number[]
  /** Analyses lancées sur la fenêtre ENTIÈRE — les 24 heures. C'est ce total
   *  qui répond à « aucune analyse cette semaine », pas celui de la grille. */
  totalFenetre: number
  /** Analyses lancées dans la plage dessinée (8 h – 20 h). */
  totalGrille: number
  /** Analyses de la fenêtre qui tombent HORS de la plage dessinée. Comptées et
   *  annoncées : une grille qui tait ce qu'elle ne montre pas ment par omission
   *  — et « usage à 23 h » est justement une des trois lectures de l'issue. */
  horsPlage: number
  /** La tranche la plus chargée de la grille. `null` seulement si aucune cellule
   *  n'a pu être mesurée. Zéro est une valeur mesurée, pas une absence. */
  maximum: number | null
}

/**
 * Un jour du CALENDRIER se lit et se rend en UTC, à dessein : `2026-09-07` est
 * un jour, pas un instant, et lui en donner un le fait basculer d'un jour dès
 * que le fuseau change de côté de minuit. Même raison, même geste que
 * `jourSeul()` dans `lib/dates.ts` — la langue, elle, vient de là-bas, parce
 * qu'un réglage vit à un seul endroit.
 */
export function libelleJour(jourIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jourIso)) return jourIso
  const d = new Date(`${jourIso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return jourIso
  return d.toLocaleDateString(LANGUE_CONSOLE, {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
}

/** `9 h – 10 h` : une tranche se nomme par ses DEUX bornes, sinon « 9 h » se lit
 *  comme un instant et non comme l'heure qui commence. */
export function libelleTranche(heure: number): string {
  return `${heure} h – ${heure + 1} h`
}

function cle(jour: string, heure: number): string {
  return `${jour}|${heure}`
}

/**
 * Construit la grille à partir de ce que l'API a mesuré.
 *
 * `maintenant` est le jour + l'heure de la LECTURE, dans le fuseau de la charge
 * utile — il ne sert qu'à distinguer une heure qui n'a pas sonné d'une heure qui
 * a mesuré zéro.
 */
export function construireGrilleAnalyses(entree: {
  jours: readonly string[]
  buckets: readonly AnalysesHeatmapBucket[]
  maintenant: { day: string; hour: number }
}): GrilleAnalyses {
  const { jours, buckets, maintenant } = entree
  const dansLaFenetre = new Set(jours)

  // Seuls les lancements de la FENÊTRE comptent. Un bucket hors fenêtre n'est ni
  // « hors plage horaire » ni « dans la grille » : il est hors sujet, et le
  // compter quelque part ferait mentir l'un des deux totaux.
  const retenus = buckets.filter(b => dansLaFenetre.has(b.day))

  const parTranche = new Map<string, AnalysesHeatmapBucket>()
  for (const b of retenus) {
    const existant = parTranche.get(cle(b.day, b.hour))
    parTranche.set(
      cle(b.day, b.hour),
      existant
        ? {
            ...existant,
            count: existant.count + b.count,
            workspaces: [...existant.workspaces, ...b.workspaces],
            withoutWorkspace: existant.withoutWorkspace + b.withoutWorkspace,
          }
        : b,
    )
  }

  const estAVenir = (jour: string, heure: number): boolean =>
    jour > maintenant.day || (jour === maintenant.day && heure > maintenant.hour)

  // Premier passage : les valeurs, pour connaître le domaine de la PÉRIODE.
  // Les tranches à venir en sont absentes — les faire peser rendrait le maximum
  // dépendant de l'heure à laquelle on regarde l'écran.
  const valeurs: Array<number | null> = []
  for (const jour of jours) {
    for (const heure of TRANCHES) {
      valeurs.push(estAVenir(jour, heure) ? null : (parTranche.get(cle(jour, heure))?.count ?? 0))
    }
  }
  const domaine = intensityDomain(valeurs)

  let index = 0
  const lignes: LigneAnalyses[] = jours.map(jour => ({
    jour,
    libelle: libelleJour(jour),
    cellules: TRANCHES.map(heure => {
      const valeur = valeurs[index++] ?? null
      const bucket = parTranche.get(cle(jour, heure))
      const commun = {
        jour,
        heure,
        intensite: domaine ? computeIntensity(valeur, domaine.min, domaine.max) : null,
        espaces: [...new Set(bucket?.workspaces ?? [])].sort((a, b) => a.localeCompare(b, 'fr')),
        sansEspace: bucket?.withoutWorkspace ?? 0,
      }
      // `valeur === null` ET `aVenir` disent la même chose, et la construction
      // est le seul endroit où les deux se décident ensemble : les lier ici,
      // c'est ce qui permet aux lecteurs de n'avoir plus rien à replier.
      return valeur === null
        ? { ...commun, aVenir: true as const, valeur: null }
        : { ...commun, aVenir: false as const, valeur }
    }),
  }))

  const totalFenetre = retenus.reduce((somme, b) => somme + b.count, 0)
  const totalGrille = retenus
    .filter(b => b.hour >= HEURE_DEBUT && b.hour < HEURE_FIN)
    .reduce((somme, b) => somme + b.count, 0)

  return {
    lignes,
    tranches: TRANCHES,
    totalFenetre,
    totalGrille,
    horsPlage: totalFenetre - totalGrille,
    maximum: domaine ? domaine.max : null,
  }
}
