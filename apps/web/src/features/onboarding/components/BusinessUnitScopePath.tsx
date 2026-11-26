import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BusinessUnitView } from '@bellum/contracts'
import { Text } from '@bellum/ui'

type Props = {
  /** Le nom de l'espace (`GET /team` → `workspace.name`). `null` = pas encore lu. */
  companyName: string | null
  /** Les périmètres de l'espace, tels que `GET /business-units` les rend. */
  units: readonly BusinessUnitView[]
  /** Les membres de l'espace — seulement pour nommer le responsable d'un périmètre. */
  members: readonly { userId: string; fullName: string | null }[]
}

/**
 * #2087.12 — la représentation simple « Accenture → Agence Toulouse → Équipe
 * d'Hervé », et #2087.13 — la phrase qui la suit.
 *
 * ⚠️ AUCUNE hiérarchie inventée : `business_units` n'a pas de parent, donc la
 * chaîne est celle qu'on SAIT — l'espace, chaque périmètre porté par le membre
 * (`viewerIsMember`, déjà borné à l'espace par l'API), puis l'équipe de son
 * responsable (`leadUserId` → nom du membre). Une absence ne fait aucune
 * ligne : pas de responsable, pas de nom → pas de « Équipe de … ». Aucun
 * périmètre porté → le composant se tait (« toute l'entreprise » n'a rien à
 * représenter).
 */
export function BusinessUnitScopePath({ companyName, units, members }: Props) {
  const { t } = useTranslation('onboarding')
  const carried = units.filter(unit => unit.status === 'active' && unit.viewerIsMember)
  if (carried.length === 0) return null

  const leadName = (unit: BusinessUnitView): string | null => {
    if (!unit.leadUserId) return null
    const name = members.find(member => member.userId === unit.leadUserId)?.fullName?.trim()
    return name || null
  }

  const nodes: { key: string; label: string; detail: string | null; depth: number }[] = []
  if (companyName?.trim()) nodes.push({ key: 'company', label: companyName.trim(), detail: null, depth: 0 })
  for (const unit of carried) {
    nodes.push({ key: unit.id, label: unit.name, detail: t(`businessUnitScope.kinds.${unit.kind}`), depth: 1 })
    const lead = leadName(unit)
    if (lead)
      nodes.push({
        key: `${unit.id}-team`,
        label: t('businessUnitScope.pathTeam', { name: lead }),
        detail: null,
        depth: 2,
      })
  }

  return (
    <div
      className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-4"
      data-testid="business-unit-scope-path"
    >
      <ol aria-label={t('businessUnitScope.pathAria')} className="space-y-1">
        {nodes.map((node, index) => (
          <li
            key={node.key}
            className="flex items-center gap-2"
            // Le retrait visuel dit le niveau ; la liste ordonnée le dit au lecteur d'écran.
            style={{ paddingInlineStart: `${node.depth * 1.25}rem` }}
          >
            {index > 0 && <ChevronRight className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />}
            <Text element="span" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {node.label}
            </Text>
            {node.detail && (
              <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                {node.detail}
              </Text>
            )}
          </li>
        ))}
      </ol>
      {/* #2087.13 — la promesse du cloisonnement, dite une fois le périmètre posé. */}
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('businessUnitScope.pathPromise')}
      </Text>
    </div>
  )
}
