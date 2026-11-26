import { useWeakestLinkDiagnosis } from './useWeakestLinkDiagnosis'
import { WeakestLinkDiagnosisCard } from './WeakestLinkDiagnosisCard'

/**
 * BEL-SC-224 (#3253, P0) — L'APPELANT de `GET /weakest-link-diagnosis`.
 *
 * Même motif que `AccountStrategy5PSection` : le hook réseau vit ici, jamais
 * dans l'écran qui monte cette section, pour que celui-ci reste testable sans
 * provider réseau. La carte reste PURE (elle reçoit `diagnosis`).
 */
export function WeakestLinkDiagnosisSection() {
  const { data, isLoading, isError } = useWeakestLinkDiagnosis()
  return <WeakestLinkDiagnosisCard diagnosis={data} isLoading={isLoading} isError={isError} />
}
