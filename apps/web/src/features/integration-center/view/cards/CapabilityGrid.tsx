import { Box, Button, Text } from '@bellum/ui'
import { Check, Minus, type LucideIcon } from 'lucide-react'

/**
 * Ce qu'un connecteur SAIT faire, ligne par ligne.
 *
 * Les portées sont accordées au moment du consentement : un compte branché
 * avant qu'une portée soit demandée garde sa concession étroite. Sans cette
 * grille, l'écart ne se voit nulle part — la carte dit « connecté », l'appel
 * échoue plus loin, et l'utilisateur n'a aucune raison de soupçonner qu'une
 * reconnexion suffirait. Mesuré deux fois en production le 16/08 : un CRM qui
 * rendait une erreur interne sur deux écrans, et un espace documentaire qui
 * rendait une liste vide.
 *
 * Une capacité éteinte est affichée, jamais masquée : cacher la ligne
 * reviendrait à laisser croire que la fonction n'existe pas.
 */
export type CapabilityRow<TKey extends string> = { key: TKey; icon: LucideIcon; labelKey: string }

export function CapabilityGrid<TKey extends string>({
  rows,
  capabilities,
  labelOf,
  hint,
  ctaLabel,
  onReconnect,
  reconnecting,
  showReconnect,
  appSideHint,
}: {
  rows: readonly CapabilityRow<TKey>[]
  capabilities: Partial<Record<TKey, boolean>> | undefined
  labelOf: (labelKey: string) => string
  hint: string
  ctaLabel: string
  onReconnect: () => void
  reconnecting: boolean
  /** Le compte est connecté ET au moins une capacité manque. */
  showReconnect: boolean
  /**
   * SCOPES-I.2 — la portée manque JUSTE APRÈS un consentement neuf : c'est l'app qui ne la propose pas.
   * La phrase remplace « reconnecte » et le bouton disparaît — reconnecter ne répare rien, et
   * l'utilisateur bouclerait (HubSpot, 18/10/2026).
   */
  appSideHint?: string | undefined
}) {
  return (
    <Box className="space-y-3">
      <Box display="grid" className="grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map(row => {
          const on = capabilities?.[row.key] ?? false
          const Icon = row.icon
          return (
            <Box key={row.key} display="flex" className="items-center gap-1.5">
              {on ? (
                <Check className="size-3.5 shrink-0 text-[var(--success-soft-text)]" aria-hidden />
              ) : (
                <Minus className="size-3.5 shrink-0 text-[var(--text-ghost)]" aria-hidden />
              )}
              <Icon className="size-3.5 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
              <Text size="xs" color={on ? 'text-[var(--bellum-text-primary)]' : 'text-[var(--text-ghost)]'}>
                {labelOf(row.labelKey)}
              </Text>
            </Box>
          )
        })}
      </Box>

      {showReconnect && appSideHint ? (
        <Text size="xs" color="text-[var(--text-ghost)]">
          {appSideHint}
        </Text>
      ) : null}
      {showReconnect && !appSideHint && (
        <Box display="flex" className="items-center justify-between gap-2">
          <Text size="xs" color="text-[var(--text-ghost)]">
            {hint}
          </Text>
          <Button variant="outline" size="sm" isLoading={reconnecting} onClick={onReconnect}>
            {ctaLabel}
          </Button>
        </Box>
      )}
    </Box>
  )
}

/** Au moins une capacité manque-t-elle sur un compte CONNECTÉ ? */
export function someCapabilityMissing<TKey extends string>(
  connected: boolean | undefined,
  capabilities: Partial<Record<TKey, boolean>> | undefined,
  rows: readonly CapabilityRow<TKey>[],
): boolean {
  if (!connected || !capabilities) return false
  return rows.some(row => !capabilities[row.key])
}
