import type { BetProfileRow } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useBetProfiles } from '@/features/accounts/hooks/useBetProfile'
import { BetProfileDialog } from '@/features/accounts/view/account-detail/components/BetProfileDialog'
import { SETTINGS_ROW_CLASS, SettingsBlock, SettingsRows } from '../components/SettingsBlocks'

/**
 * #3245 (recette prod 02/10) — DÉCLARER LE PROFIL DE PARI, DEPUIS LES RÉGLAGES.
 *
 * « Aucune UI de déclaration du profil de pari (API seule) » : le dialogue
 * existait dans le menu « Plus d'actions » d'un dossier, introuvable pour qui
 * cherche un réglage. Il rejoint ici l'écran « Charge commerciale » — le budget
 * d'effort (heures, dossiers suivis) y vit déjà (GA-26 : un réglage, un endroit)
 * — et c'est le MÊME dialogue (`BetProfileDialog`), jamais un second formulaire.
 *
 * Une ligne par dossier, ce qui est DÉCLARÉ en clair ; un champ non déclaré ne
 * fait aucune ligne (« on n'affiche pas ce qu'on n'a pas »), et un dossier sans
 * rien de déclaré le dit : « Non déclaré », jamais « pari court » par défaut.
 */
export function BetProfilesSection() {
  const { t } = useTranslation('commercialLoadSettings')
  const profiles = useBetProfiles()
  const [editing, setEditing] = useState<BetProfileRow | null>(null)

  return (
    <SettingsBlock title={t('betProfiles.title')} description={t('betProfiles.subtitle')} testId="bet-profiles-block">
      {profiles.isLoading ? (
        <ScreenState state="loading" message={t('betProfiles.loading')} />
      ) : profiles.isError || !Array.isArray(profiles.data) ? (
        <ScreenState state="error" message={t('betProfiles.error')} />
      ) : profiles.data.length === 0 ? (
        <ScreenState
          state="empty_never"
          message={t('betProfiles.empty')}
          action={{ label: t('betProfiles.emptyAction'), to: '/accounts' }}
        />
      ) : (
        <BetProfilesList rows={profiles.data} onEdit={setEditing} />
      )}

      {editing ? (
        <BetProfileDialog accountId={editing.id} companyName={editing.name} open onClose={() => setEditing(null)} />
      ) : null}
    </SettingsBlock>
  )
}

/** Une page de dossiers : au-delà, « Voir N de plus » (recette prod 03/10 : 68 lignes sans repli). */
const PAGE_SIZE = 8

/**
 * #3245 (recette 03/10) — « 68 lignes Non déclaré sur 4461 px » : doctrine « dans
 * une liste, une absence ne fait AUCUNE ligne ». Les dossiers DÉCLARÉS font des
 * lignes (paginées) ; ceux qui n'ont rien se COMPTENT dans une phrase, et se
 * déplient à la demande (« Déclarer un dossier »), eux aussi par pages.
 */
function BetProfilesList({ rows, onEdit }: { rows: BetProfileRow[]; onEdit: (row: BetProfileRow) => void }) {
  const { t } = useTranslation('commercialLoadSettings')
  const declared = rows.filter(isDeclared)
  const undeclared = rows.filter(row => !isDeclared(row))
  const [declaredShown, setDeclaredShown] = useState(PAGE_SIZE)
  const [undeclaredOpen, setUndeclaredOpen] = useState(false)
  const [undeclaredShown, setUndeclaredShown] = useState(PAGE_SIZE)

  return (
    <Box className="space-y-3">
      {declared.length > 0 ? (
        <SettingsRows label={t('betProfiles.groupLabel')} showLabel>
          {declared.slice(0, declaredShown).map(row => (
            <BetRow key={row.id} row={row} onEdit={() => onEdit(row)} />
          ))}
          <MoreButton
            remaining={declared.length - declaredShown}
            onMore={() => setDeclaredShown(shown => shown + PAGE_SIZE)}
          />
        </SettingsRows>
      ) : null}

      {undeclared.length > 0 ? (
        <Box className="space-y-2">
          <Box
            display="flex"
            className={`flex-wrap items-center gap-3 ${undeclaredOpen ? 'justify-end' : 'justify-between'}`}
          >
            {/* Une seule occurrence de la phrase : dépliée, c'est le libellé du groupe qui la porte. */}
            {undeclaredOpen ? null : (
              <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('betProfiles.undeclared', { count: undeclared.length })}
              </Text>
            )}
            <Button
              size="sm"
              variant="outline"
              className="pointer-coarse:min-h-11"
              aria-expanded={undeclaredOpen}
              onClick={() => setUndeclaredOpen(open => !open)}
            >
              {undeclaredOpen ? t('betProfiles.hideUndeclared') : t('betProfiles.declareOne')}
            </Button>
          </Box>
          {undeclaredOpen ? (
            <SettingsRows label={t('betProfiles.undeclared', { count: undeclared.length })} showLabel>
              {undeclared.slice(0, undeclaredShown).map(row => (
                <BetRow key={row.id} row={row} onEdit={() => onEdit(row)} />
              ))}
              <MoreButton
                remaining={undeclared.length - undeclaredShown}
                onMore={() => setUndeclaredShown(shown => shown + PAGE_SIZE)}
              />
            </SettingsRows>
          ) : null}
        </Box>
      ) : null}
    </Box>
  )
}

function isDeclared(row: BetProfileRow): boolean {
  return Boolean(row.horizon || row.size || row.access || row.resource)
}

function MoreButton({ remaining, onMore }: { remaining: number; onMore: () => void }) {
  const { t } = useTranslation('commercialLoadSettings')
  if (remaining <= 0) return null
  const count = Math.min(PAGE_SIZE, remaining)
  return (
    <Box className="border-t border-[var(--bellum-border)] pt-2">
      <Button size="sm" variant="ghost" className="pointer-coarse:min-h-11" onClick={onMore}>
        {t('betProfiles.showMore', { count })}
      </Button>
    </Box>
  )
}

function BetRow({ row, onEdit }: { row: BetProfileRow; onEdit: () => void }) {
  const { t } = useTranslation('commercialLoadSettings')
  const { t: tAccounts } = useTranslation('accounts')
  // Seul ce qui est déclaré se lit : un champ `null` ne fait pas de ligne.
  const declared = [
    row.horizon ? tAccounts(`betProfile.horizon.${row.horizon}`) : null,
    row.size ? tAccounts(`betProfile.size.${row.size}`) : null,
    row.access ? tAccounts(`betProfile.access.${row.access}`) : null,
    row.resource ? t('betProfiles.resource', { resource: row.resource }) : null,
  ].filter((part): part is string => part !== null)

  return (
    <Box data-bet-row display="flex" className={SETTINGS_ROW_CLASS}>
      <Box className="min-w-0">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
          {row.name}
        </Text>
        {declared.length > 0 ? (
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="break-words">
            {declared.join(' · ')}
          </Text>
        ) : null}
      </Box>
      <Button size="sm" variant="outline" className="shrink-0 pointer-coarse:min-h-11" onClick={onEdit}>
        {declared.length > 0 ? t('betProfiles.edit') : t('betProfiles.declare')}
      </Button>
    </Box>
  )
}
