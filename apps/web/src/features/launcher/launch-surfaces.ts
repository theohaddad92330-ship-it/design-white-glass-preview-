import type { ComponentType } from 'react'
import type { LauncherTypeKey } from '@bellum/contracts'
import { AccountLaunchSurface } from './AccountLaunchSurface'

/**
 * Ce qu'un type de lancement montre quand on l'ouvre DEPUIS SA LISTE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DEMANDE
 * ─────────────────────────────────────────────────────────────────────────
 * Louis, 29/08/2026 : « et donc tous les "Lancer :" il faut qu'on puisse les
 * faire dans chaque onglet si on veut, genre la liste de contact, de compte,
 * de besoins, de talents, de territoires, etc ». Les cinq lancements vivaient
 * sous le composer de Laura ; ils doivent vivre sur l'écran qui liste l'objet.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE A DIT, ET POURQUOI CE REGISTRE EST PARTIEL
 * ─────────────────────────────────────────────────────────────────────────
 * Les cinq ne sont PAS la même chose, et le catalogue le disait déjà : le champ
 * qui les sépare est `acceptsUnknown` (voir `packages/contracts/src/schemas/
 * launcher.ts`).
 *
 *  · **`account` — `acceptsUnknown: true`.** Analyser une entreprise qu'on n'a
 *    jamais ouverte est le geste FONDATEUR du produit. Le sujet vient d'un
 *    registre public : on peut donc le taper, le choisir, et partir. C'est le
 *    seul des cinq pour qui « tape un nom et ça part » veut dire quelque chose,
 *    et c'est le seul dont la liste n'avait AUCUN geste d'ajout.
 *
 *  · **`contact`, `need`, `talent` — `acceptsUnknown: false`.** Leur run agit
 *    sur une ligne qui doit DÉJÀ exister : on n'enrichit pas un contact qu'on
 *    n'a pas, on ne matche pas un besoin qui n'est pas saisi. Leur « lancement »
 *    est donc « trouver la ligne, puis agir dessus » — et sur leur propre liste,
 *    trouver la ligne EST le champ de recherche déjà présent, agir dessus EST
 *    l'action de ligne déjà présente. Deux de ces trois écrans portent en outre
 *    déjà une porte d'ajout explicite (« Ajouter un contact » sur `/contacts`,
 *    trois portes sur `/consultants` dont le dépôt de CV). Y ajouter un bouton
 *    « Lancer » doublerait un geste existant — ce que la loi 4 du tome 7
 *    interdit — sans rien rendre de plus atteignable.
 *
 *  · **`territory`** a quitté le catalogue le 23/09/2026 (#2149.27) : voir la
 *    note sous {@link LAUNCH_SURFACES_INTENTIONALLY_ABSENT}.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TYPE SANS SURFACE NE REND RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * `ListLauncher` ne rend AUCUN bouton pour un type absent de ce registre. C'est
 * la règle que le catalogue applique déjà à un run qui ne se cherche pas au
 * clavier : **ne rien montrer qui ne fasse rien**. Un bouton « Lancer » qui
 * ouvrirait un panneau vide, ou qui se contenterait de recopier la recherche de
 * la liste dans la même liste, est pire qu'un bouton absent — la première fois
 * on croit s'être trompé, la deuxième on cesse de regarder.
 *
 * Ajouter un type ici est donc un geste complet : la surface, ses tests, sa
 * parité démo. C'est ce que GA-87 vérifie — un type monté sur une liste doit
 * avoir sa surface, et une surface déclarée doit être réellement montée.
 */
export type LaunchSurfaceProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const LAUNCH_SURFACES: Partial<Record<LauncherTypeKey, ComponentType<LaunchSurfaceProps>>> = {
  account: AccountLaunchSurface,
}

/**
 * Pourquoi les trois autres types n'ont pas (encore) de surface en place.
 * (Un quatrième, `territory`, a longtemps figuré ici puis au catalogue —
 * retiré le 23/09/2026, #2149.27, voir la note sous ce registre.)
 *
 * Écrit, et pas seulement absent : « une garde protège une règle, elle ne
 * l'invente pas », et une absence sans raison redevient un oubli en trois
 * semaines. GA-87 exige qu'un type soit ici OU dans {@link LAUNCH_SURFACES},
 * jamais dans les deux, jamais dans aucun — la même forme que
 * `demo-coverage.ts` applique à la démonstration.
 */
export const LAUNCH_SURFACES_INTENTIONALLY_ABSENT: Readonly<Record<string, string>> = {
  contact:
    "Le run enrichit un contact qui doit DÉJÀ être en base (`acceptsUnknown: false`). Sur /contacts, le trouver est le champ de recherche déjà présent et l'enrichir est l'action de ligne déjà présente, dont le coût est annoncé par EnrichConfirmDialog (GA-49). L'écran porte en outre déjà « Ajouter un contact ». Un bouton de plus doublerait le geste sans rien ouvrir de neuf.",
  need: "Le run matche ou joue un besoin qui doit DÉJÀ être saisi (`acceptsUnknown: false`). ⚠️ Corrigée le 31/08/2026 — cette entrée affirmait jusqu'ici « un besoin ne se crée pas depuis /projects/needs », écrite à 09:35 le 30/08/2026 et rendue PÉRIMÉE le même jour à 17:27 par `CreateNeedDialog.tsx`. L'écran porte désormais sa PROPRE porte d'ajout (« Créer un besoin »), devenue un assistant complet en quatre étapes le 31/08/2026. Le raisonnement rejoint donc celui de `contact`/`talent`, pour la MÊME raison : l'écran porte déjà une porte d'ajout explicite, et son champ de recherche EST déjà le moyen de « trouver la ligne » sur laquelle le run agit. Poser un second bouton « Lancer » à côté doublerait un geste qui existe déjà pleinement — ce que la loi 4 du tome 7 interdit.",
  talent:
    "Le run réécrit le CV d'un consultant qui doit DÉJÀ être au vivier (`acceptsUnknown: false`). /consultants porte déjà TROIS portes d'enregistrement — « Ajouter un consultant », le dépôt de CV simple et multiple, et `?new=1`. Le sujet ne manque donc jamais sur cet écran ; c'est le seul des quatre où l'ajout est un problème résolu.",
}
// #2149.27 — `territory` a été RETIRÉ de ce registre le 23/09/2026, en même
// temps que du catalogue (`launcher.ts`) : sa justification affirmait que
// « /discover/territoire est le lanceur », une route absente du disque depuis
// que le bouton et le panneau Territoire ont quitté Découvrir (#2486, Louis
// 16/09/2026). Une raison écrite qui décrit un écran disparu n'en est plus
// une — GA-87 l'aurait acceptée quand même, parce qu'elle ne relit que la
// PROSE, jamais l'existence du chemin qu'elle nomme. Corrigé plus tôt le même
// jour, le run pointait déjà vers /discover nu — un chip qui n'ouvre plus rien
// de spécifique à lui, exactement ce que la doctrine « ne rien montrer qui ne
// fasse rien » interdit ailleurs dans ce même fichier ; l'entrée n'a donc plus
// de raison à écrire ici, elle a quitté le catalogue entier.
