import { resolveBrand, type Brand } from '@bellum/contracts'
import { createContext, useContext } from 'react'

/**
 * LE CONTEXTE DE MARQUE, SÉPARÉ DE SON FOURNISSEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST À PART
 * ─────────────────────────────────────────────────────────────────────────
 * `BrandProvider` importe react-query, le client d'API et le module i18n —
 * il en a besoin, il va chercher la marque. `useBrand`, lui, ne fait qu'un
 * `useContext`.
 *
 * Tant que les deux vivaient dans le même module, **tout** consommateur du
 * hook tirait le graphe du fournisseur : `PageHeader` est rendu par presque
 * chaque écran, donc presque chaque test de composant se mettait à charger
 * react-query et le client d'API pour lire une chaîne de caractères. Mesuré
 * le 01/09/2026 : deux tests de `Test (Web)` shard 2/3 sont passés au-dessus
 * du délai de 20 s en CI — verts en local, où la machine absorbe la
 * différence.
 *
 * Le repli est la marque du produit et non `undefined` : un composant rendu
 * hors du fournisseur — un test unitaire, une page d'erreur montée avant
 * l'arbre — doit afficher un nom, pas planter.
 */
export const BrandContext = createContext<Brand>(resolveBrand(null))

/**
 * La marque courante — TOUJOURS complète.
 *
 * ⚠️ N'écris jamais `useBrand().name ?? 'Bellum'` : le repli est déjà fait, et
 * un second repli est un endroit de plus à changer le jour où le produit
 * change de nom.
 */
export function useBrand(): Brand {
  return useContext(BrandContext)
}
