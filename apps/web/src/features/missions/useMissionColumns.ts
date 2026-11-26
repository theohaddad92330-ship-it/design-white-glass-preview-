import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { mergeAddedColumns } from '@/lib/column-preference'
import {
  COMPACT_MISSION_COLUMNS,
  DEFAULT_MISSION_COLUMNS,
  WIDE_TABLE_MIN_PX,
  MISSION_COLUMNS_ADDED_SINCE,
  MISSION_COLUMN_KEYS,
  PINNED_MISSION_COLUMN,
  isMissionColumnKey,
  type MissionColumnKey,
} from './columns'

/**
 * Le choix des colonnes de la liste des missions — et le SEUL endroit où il vit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN HOOK ET PAS UN ÉTAT DANS L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 * Un réglage vit à un seul endroit (GA-26). Le tableau et son sélecteur lisent
 * tous les deux ce choix ; s'ils le tenaient chacun de leur côté, la première
 * colonne ajoutée les ferait diverger — le sélecteur proposerait une case que
 * le tableau ne sait pas rendre, ou l'inverse. Ici, `columns.ts` déclare les
 * colonnes, ce hook déclare le choix, et personne d'autre ne les recompose.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE STOCKAGE-LÀ
 * ─────────────────────────────────────────────────────────────────────────
 * Le dépôt a DEUX formes sanctionnées : `bellum-<chose>` pour les réglages
 * globaux du provider de préférences, et `bellum:<domaine>:<...>:<userId>`
 * pour un choix propre à un utilisateur sur cette machine — c'est la forme de
 * `bellum:search-country:<userId>`, dont ce fichier reprend la discipline
 * (lecture validée, écriture gardée, jamais d'exception qui remonte).
 *
 * ⚠️ La clé porte l'identifiant de l'utilisateur, et ce n'est pas un détail :
 * la cause racine « premier cookie = mauvaise identité » a déjà mélangé la
 * démonstration et un vrai compte sur la même machine. Deux comptes doivent
 * pouvoir avoir deux tableaux.
 *
 * ⚠️ C'est une PRÉFÉRENCE, pas un cache : elle survit à un déploiement (elle
 * ne porte aucun bustage, GA-42) et elle n'entre pas au registre de purge
 * `clear-client-user-state.ts`, qui n'y range que des caches de données.
 *
 * Suite naturelle, hors de la portée de ce lot : remonter ce choix dans
 * `features/preferences/preferences-provider.tsx`, à côté de `hiddenNavItems`
 * — qui est exactement le même geste (« ce que l'utilisateur a masqué »), sous
 * la clé unique `bellum-preferences`. Tant que ce n'est pas fait, ce hook
 * reste le seul endroit où le réglage circule.
 */
const STORAGE_PREFIX = 'bellum:missions:columns:'

export function missionColumnsStorageKey(userId: string): string {
  return STORAGE_PREFIX + userId
}

/**
 * Remet une sélection dans l'ORDRE canonique et y réinjecte la colonne épinglée.
 *
 * L'ordre vient de `MISSION_COLUMN_KEYS`, jamais de l'ordre des clics : sans
 * cela, cocher « Début » puis « Rôle » donnerait un tableau différent de celui
 * du voisin qui a coché dans l'autre sens, pour le même contenu.
 */
function canonical(keys: readonly MissionColumnKey[]): MissionColumnKey[] {
  const chosen = new Set<MissionColumnKey>(keys)
  chosen.add(PINNED_MISSION_COLUMN)
  return MISSION_COLUMN_KEYS.filter(key => chosen.has(key))
}

/**
 * Ce qui a été retenu, ou `null` si rien de lisible.
 *
 * Une clé inconnue est ÉCARTÉE sans faire tomber le reste : une colonne retirée
 * du produit ne doit pas rendre son tableau illisible à ceux qui l'avaient
 * cochée. Un contenu franchement illisible, lui, retombe sur les défauts.
 */
function readStored(userId: string | null): MissionColumnKey[] | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(missionColumnsStorageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const known = parsed.filter(isMissionColumnKey)
    // Une sélection qui ne garderait QUE l'épinglée n'est pas un choix, c'est
    // une donnée perdue : mieux vaut les défauts qu'une seule colonne.
    if (known.length === 0) return null
    // ⚠️ Une préférence enregistrée AVANT qu'une colonne existe ne la contient
    // pas. La rendre telle quelle masquait la colonne neuve à tous ceux qui
    // avaient déjà ouvert l'écran — mesuré en production le 04/09/2026 sur
    // « Prochaine action ». On réinjecte les colonnes NÉES depuis, et elles
    // seules : une colonne vue puis décochée reste décochée.
    return canonical(mergeAddedColumns(known, MISSION_COLUMNS_ADDED_SINCE, MISSION_COLUMN_KEYS))
  } catch {
    return null
  }
}

function writeStored(userId: string | null, keys: readonly MissionColumnKey[]): void {
  // Déconnecté, on n'écrit RIEN : une clé anonyme serait ensuite servie au
  // premier utilisateur qui se connecte sur cette machine.
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(missionColumnsStorageKey(userId), JSON.stringify(keys))
  } catch {
    // Un stockage plein ou refusé (navigation privée) ne casse pas l'écran :
    // le choix vit alors le temps de la session, ce qui est dégradé mais juste.
  }
}

/**
 * `locked` — LES COLONNES QU'UN ÉCRAN DÉCLARE COMME SON SUJET (#2195.20).
 *
 * Même mécanisme que {@link PINNED_MISSION_COLUMN}, et pour la même raison : une
 * colonne dont l'écran entier dépend ne se décoche pas. La différence est QUI la
 * décide — l'épinglée vaut partout (on ne lit pas une ligne de tableau sans
 * savoir de quelle mission il s'agit), celles-ci valent sur UN écran.
 *
 * L'écran de décision de renouvellement existe pour montrer ce qui attend une
 * décision : sans la colonne « Reconduction », rien n'y dit lesquelles en ont
 * déjà eu une. Elle n'est pas dans les défauts pour une raison MESURÉE (la
 * largeur, voir `columns.ts`) ; la verrouiller ici la rend présente là où elle
 * compte, sans toucher au tableau de `/missions`.
 *
 * ⚠️ Le verrou est tenu ICI et pas dans le rendu d'une case à cocher : une règle
 * qui vit dans un bouton disparaît au premier autre appelant.
 */
/**
 * #4191 (D4) — l'écran est-il assez large pour les défauts COMPLETS ?
 * Là où `matchMedia` n'existe pas (jsdom) : oui, c'est le rendu historique.
 */
function useIsWideTable(): boolean {
  const read = () =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia(`(min-width: ${WIDE_TABLE_MIN_PX}px)`).matches
  const [wide, setWide] = useState(read)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(`(min-width: ${WIDE_TABLE_MIN_PX}px)`)
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches)
    query.addEventListener('change', onChange)
    setWide(query.matches)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

export function useMissionColumns(
  locked: readonly MissionColumnKey[] = [],
  defaultsOverride?: readonly MissionColumnKey[],
): {
  visible: MissionColumnKey[]
  isVisible: (key: MissionColumnKey) => boolean
  toggle: (key: MissionColumnKey, visible: boolean) => void
  reset: () => void
} {
  const userId = useCurrentUserStore(state => state.currentUser?.id ?? null)
  const wide = useIsWideTable()
  // Sans surcharge de l'appelant : défauts complets si l'écran est large, compacts sinon (D4).
  const defaults = defaultsOverride ?? (wide ? DEFAULT_MISSION_COLUMNS : COMPACT_MISSION_COLUMNS)
  // `chosen` = ce que l'utilisateur a choisi (ou `null` : il n'a rien choisi, les défauts
  // du moment s'appliquent — ils suivent la largeur de l'écran, un choix enregistré, jamais).
  const [chosen, setChosen] = useState<MissionColumnKey[] | null>(() => readStored(userId))
  const visible = useMemo(() => chosen ?? canonical(defaults), [chosen, defaults])
  // ⚠️ Les verrouillées s'ajoutent à l'AFFICHAGE et jamais au STOCKAGE : un
  // passage sur l'écran de décision ne doit pas cocher la colonne pour toujours
  // sur `/missions`. Ce qui est enregistré reste ce que l'utilisateur a choisi.
  const shown = useMemo(() => canonical([...visible, ...locked]), [visible, locked])

  const toggle = useCallback(
    (key: MissionColumnKey, show: boolean) => {
      // L'épinglée ne se décoche pas — la case est désactivée dans le
      // sélecteur, mais la règle est TENUE ici : une garde qui vit dans le
      // rendu d'un bouton disparaît au premier autre appelant.
      if (key === PINNED_MISSION_COLUMN && !show) return
      // #2195.20 — une colonne verrouillée par l'écran ne se décoche pas non
      // plus : la case est désactivée dans le sélecteur, mais la règle est
      // TENUE ici.
      if (locked.includes(key) && !show) return
      // On part des colonnes AFFICHÉES (choix ou défauts du moment), jamais d'un état vide.
      const current = visible
      const next = show ? [...current, key] : current.filter(entry => entry !== key)
      const ordered = canonical(next)
      setChosen(ordered)
      writeStored(userId, ordered)
    },
    [userId, locked, visible],
  )

  // Rétablir = ne plus avoir de choix : les défauts du moment (selon la largeur) reprennent la main.
  const reset = useCallback(() => {
    setChosen(null)
    if (!userId || typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(missionColumnsStorageKey(userId))
    } catch {
      // Stockage refusé : le choix retombe quand même sur les défauts pour la session.
    }
  }, [userId])
  const isVisible = useCallback((key: MissionColumnKey) => shown.includes(key), [shown])

  return { visible: shown, isVisible, toggle, reset }
}
