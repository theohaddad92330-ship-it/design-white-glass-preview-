import { z } from 'zod'

/**
 * Un ÉCART entre deux fenêtres de temps — la seule forme sous laquelle une
 * tendance a le droit de voyager dans ce dépôt.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI DEUX NOMBRES ET PAS UN SEUL
 * ─────────────────────────────────────────────────────────────────────────
 * Un scalaire (« +255 ») ne dit pas de quoi il est l'écart, et rien n'oblige
 * celui qui le calcule à le sortir de la même population que le total affiché
 * à côté. C'est exactement ce qui s'était produit sur le tableau de bord : le
 * total « Contacts à enrichir » comptait les fiches sans e-mail NI supprimées,
 * pendant que « l'écart » comptait les fiches CRÉÉES en sept jours, celles-là
 * filtrées sur `deleted_at`. Deux requêtes, deux populations, un seul écran —
 * et à l'arrivée « 254 détectés / +255 cette semaine ».
 *
 * `current` et `previous` obligent la dérivation à produire les DEUX fenêtres
 * d'un coup, donc au même endroit, donc sur la même population. C'est ce que
 * fait déjà `ManagerService.monthlyTrend` : une seule requête, une seule table,
 * un seul WHERE, seule la fenêtre du FILTER change.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE À LA CHARGE DE L'AFFICHAGE
 * ─────────────────────────────────────────────────────────────────────────
 * `previous = 0` n'autorise AUCUN pourcentage : « +100 % » ou « +∞ % » sur une
 * base nulle est un chiffre fabriqué. Le rendu a donc trois cas, et un seul
 * endroit les tient (`components/ui/TrendLine.tsx` côté web).
 *
 * ⚠️ Un STOCK n'a pas de `TrendPoint`. « Contacts à enrichir » est un état
 * courant : la fiche enrichie hier n'est plus comptée aujourd'hui et rien ne
 * garde la trace de ce qu'elle valait le mois dernier. Aucune fenêtre ne peut
 * la retrouver — la réponse honnête est l'ABSENCE de tendance, pas une
 * tendance à zéro.
 */
export const trendPointSchema = z.object({
  /** Compté sur la fenêtre en cours. */
  current: z.number().int().min(0),
  /** Compté sur la fenêtre précédente, MÊME population, MÊME dérivation. */
  previous: z.number().int().min(0),
})

export type TrendPoint = z.infer<typeof trendPointSchema>
