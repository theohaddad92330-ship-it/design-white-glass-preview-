import { useCallback, useState } from 'react'
import { mergeAddedColumns } from '@/lib/column-preference'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import {
  DEFAULT_PAYMENT_COLUMNS,
  PAYMENT_COLUMN_KEYS,
  PAYMENT_COLUMNS_ADDED_SINCE,
  PINNED_PAYMENT_COLUMN,
  isPaymentColumnKey,
  type PaymentColumnKey,
} from './columns'

/**
 * Le choix des colonnes de l'écran des paiements — et le SEUL endroit où il vit.
 *
 * Même discipline que `useMissionColumns`, et la copie est assumée : un
 * sélecteur GÉNÉRIQUE se justifierait au troisième appelant, pas au second.
 *
 * ⚠️ La clé porte l'identifiant de l'utilisateur — la cause racine « premier
 * cookie = mauvaise identité » a déjà mélangé la démonstration et un vrai
 * compte sur la même machine. Deux comptes doivent pouvoir avoir deux tableaux.
 *
 * ⚠️ C'est une PRÉFÉRENCE, pas un cache : elle survit à un déploiement (aucun
 * bustage, GA-42) et n'entre pas au registre de purge `clear-client-user-state`,
 * qui n'y range que des caches de données.
 */
const STORAGE_PREFIX = 'bellum:payments:columns:'

export function paymentColumnsStorageKey(userId: string): string {
  return STORAGE_PREFIX + userId
}

/**
 * Remet une sélection dans l'ORDRE canonique et y réinjecte la colonne épinglée.
 *
 * L'ordre vient de `PAYMENT_COLUMN_KEYS`, jamais de l'ordre des clics : sans
 * cela, cocher « Retard » puis « Statut » donnerait un tableau différent de
 * celui du voisin qui a coché dans l'autre sens, pour le même contenu.
 */
function canonical(keys: readonly PaymentColumnKey[]): PaymentColumnKey[] {
  const chosen = new Set<PaymentColumnKey>(keys)
  chosen.add(PINNED_PAYMENT_COLUMN)
  return PAYMENT_COLUMN_KEYS.filter(key => chosen.has(key))
}

/**
 * Ce qui a été retenu, ou `null` si rien de lisible.
 *
 * Une clé inconnue est ÉCARTÉE sans faire tomber le reste : une colonne retirée
 * du produit ne doit pas rendre son tableau illisible à ceux qui l'avaient
 * cochée.
 */
function readStored(userId: string | null): PaymentColumnKey[] | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(paymentColumnsStorageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const known = parsed.filter(isPaymentColumnKey)
    // Une sélection qui ne garderait QUE l'épinglée n'est pas un choix, c'est
    // une donnée perdue : mieux vaut les défauts qu'une seule colonne.
    if (known.length === 0) return null
    // ⚠️ Une préférence enregistrée AVANT qu'une colonne existe ne la contient
    // pas — la rendre telle quelle masquerait la colonne neuve à tous ceux qui
    // ont déjà ouvert l'écran (défaut mesuré le 04/09/2026 sur `/missions`).
    return canonical(mergeAddedColumns(known, PAYMENT_COLUMNS_ADDED_SINCE, PAYMENT_COLUMN_KEYS))
  } catch {
    return null
  }
}

function writeStored(userId: string | null, keys: readonly PaymentColumnKey[]): void {
  // Déconnecté, on n'écrit RIEN : une clé anonyme serait ensuite servie au
  // premier utilisateur qui se connecte sur cette machine.
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(paymentColumnsStorageKey(userId), JSON.stringify(keys))
  } catch {
    // Un stockage plein ou refusé (navigation privée) ne casse pas l'écran :
    // le choix vit alors le temps de la session, ce qui est dégradé mais juste.
  }
}

export function usePaymentColumns(): {
  visible: PaymentColumnKey[]
  isVisible: (key: PaymentColumnKey) => boolean
  toggle: (key: PaymentColumnKey, visible: boolean) => void
  reset: () => void
} {
  const userId = useCurrentUserStore(state => state.currentUser?.id ?? null)
  const [visible, setVisible] = useState<PaymentColumnKey[]>(
    () => readStored(userId) ?? canonical(DEFAULT_PAYMENT_COLUMNS),
  )

  const apply = useCallback(
    (next: PaymentColumnKey[]) => {
      const ordered = canonical(next)
      setVisible(ordered)
      writeStored(userId, ordered)
    },
    [userId],
  )

  const toggle = useCallback(
    (key: PaymentColumnKey, show: boolean) => {
      // L'épinglée ne se décoche pas — la case est désactivée dans le
      // sélecteur, mais la règle est TENUE ici : une garde qui vit dans le
      // rendu d'un bouton disparaît au premier autre appelant.
      if (key === PINNED_PAYMENT_COLUMN && !show) return
      setVisible(current => {
        const next = show ? [...current, key] : current.filter(entry => entry !== key)
        const ordered = canonical(next)
        writeStored(userId, ordered)
        return ordered
      })
    },
    [userId],
  )

  const reset = useCallback(() => apply([...DEFAULT_PAYMENT_COLUMNS]), [apply])
  const isVisible = useCallback((key: PaymentColumnKey) => visible.includes(key), [visible])

  return { visible, isVisible, toggle, reset }
}
