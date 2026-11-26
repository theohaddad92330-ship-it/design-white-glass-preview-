import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/**
 * #2564.4 — L'OUTIL DE GESTION BRANCHÉ PAR LE CLIENT, sur `/pilotage/finance`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Doctrine (`tool-naming.ts`, décision Louis 13/09/2026, batch 11) : l'outil
 * que l'espace a LUI-MÊME connecté se nomme, par INJECTION depuis
 * `connectedClientTools` — jamais écrit en dur. Un outil NON connecté ne se
 * nomme pas : on nomme la CAPACITÉ.
 *
 * ⚠️ **Recherché avant d'écrire une ligne de lecture financière** : aucun
 * chemin du dépôt ne fait aujourd'hui remonter un CHIFFRE financier depuis
 * l'ERP de l'ESN (`family: 'ats'`, BoondManager) — `ats-parse.ts` lit un TJM
 * pour le vivier de disponibilité, jamais rattaché à une mission ni à un
 * contrat, et rien côté `zero-layer` ne touche à la facturation. Bâtir cette
 * lecture serait un chantier d'intégration à part (nouveaux appels à l'API
 * BoondManager, mise en cache, mapping vers `mission_commercial_terms` ou
 * `invoice_readiness`), hors du périmètre borné de ce lot.
 *
 * Ce bloc livre donc honnêtement la moitié qui EXISTE : il dit si l'espace a
 * connecté son outil de gestion, le NOMME si oui (doctrine), et dit
 * clairement que Bellum n'en lit pas encore les chiffres — plutôt que
 * d'inventer une lecture qui n'existe pas. « Vide à dessein, avec sa raison »
 * (craft rule n°9), appliqué au produit lui-même et pas seulement à la démo.
 */
export function FinanceManagementTool({
  connectedName,
  loading,
}: {
  /** Le nom de l'outil de gestion connecté (injection, jamais en dur) —
   *  `null` quand rien n'est connecté. */
  connectedName: string | null
  loading: boolean
}) {
  const { t } = useTranslation('pilotage')

  if (loading) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('loading')}
      </Text>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
        {connectedName
          ? t('finance.managementTool.connected', { name: connectedName })
          : t('finance.managementTool.notConnected')}
      </Text>
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {t('finance.managementTool.noReadYet')}
      </Text>
      {!connectedName ? (
        <Link
          to="/integrations"
          className="w-fit rounded-md text-xs text-[var(--bellum-text-accent)] underline underline-offset-4 hover:no-underline"
        >
          {t('finance.managementTool.connect')}
        </Link>
      ) : null}
    </div>
  )
}
