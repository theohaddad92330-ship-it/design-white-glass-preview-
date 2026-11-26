import { toast } from 'sonner'
import { downloadCSV } from '@/lib/export-csv'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'
import { invoiceReadinessApi } from '../api'

/**
 * #2198.45 — l'export passe par l'API et son droit financier, jamais par les
 * lignes déjà chargées (même raison que l'export de `/missions/paiements`) :
 * recomposer le CSV côté navigateur produirait un fichier construit sur des
 * montants déjà rédigés pour un lecteur sans `finance:read`, qui le lirait
 * comme un fichier complet. Le serveur, lui, REFUSE.
 *
 * Un crochet partagé par Factures et Encaissements (GA-26 : une sortie, une règle d'espace) :
 * `canExport` est faux quand la règle d'espace réserve l'export, et le bouton n'existe alors pas.
 */
export function useCollectionsExport(t: (key: string) => string): {
  canExport: boolean
  run: (months: readonly string[]) => void
} {
  const dataExit = useDataExit()
  const grant = dataExit.grant
  return {
    canExport: Boolean(grant),
    run: months => {
      if (!grant) return
      void (async () => {
        try {
          const csv = await invoiceReadinessApi.exportCollectionsCsv(months)
          downloadCSV(csv, 'encaissements.csv', grant)
        } catch (error) {
          toast.error(workspaceRuleRefusalText(error) ?? ((error as Error).message || t('collections.exportFailed')))
        }
      })()
    },
  }
}
