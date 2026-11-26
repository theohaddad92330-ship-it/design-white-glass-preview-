import { readReferenceArchive, readReferenceDossier, type Account } from '@bellum/contracts'
import { usePersistAccountPlan } from '@/features/accounts/hooks/usePersistAccountPlan'
import { ReferenceDossierView } from './ReferenceDossierView'

/**
 * Théo A comptes-fiche-reference.R1 — les sections propres à un dossier de référence, sous « Ce que
 * je sais ». « Préparer un angle » et « Ajouter une vérification » écrivent une ACTION du plan (partagée
 * avec Actions et Ma journée), jamais le dossier : l'archive reste lecture seule.
 */
export function AccountReferenceDossier({ account }: { account: Account }) {
  const { addAction } = usePersistAccountPlan(account.id)
  const dossier = readReferenceDossier(account.raw_analysis)
  if (!dossier) return null
  const scopeNote = readReferenceArchive(account.raw_analysis)?.scope_note ?? ''
  return (
    <ReferenceDossierView
      dossier={dossier}
      scopeNote={scopeNote}
      onAddAction={input => void addAction(input).catch(() => undefined)}
    />
  )
}
