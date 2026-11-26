import { useState } from 'react'
import { Box, Button, Input, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { Consultant, PersonNameSearchHit } from '@bellum/contracts'
import { Mail, Phone } from 'lucide-react'
import { Provenance } from '@/components/primitives/Provenance'
import { ApiError } from '@/lib/api-error'
import { useEnrichTalent, useSearchTalentByName } from '../../hooks'

/**
 * #2570 — « voir les consultants comme des contacts concernant
 * l'enrichissement » (retour bêta François Thomas, call du 17/09/2026).
 *
 * Un GESTE, jamais un chargement automatique — même règle que la réécriture
 * de CV et le matching inverse : ça coûte un crédit, ça journalise. Le
 * résultat se lit avec `Provenance` (source + date), le même composant que le
 * reste du dépôt utilise pour « un fait périmé redevient inconnu avec sa
 * date » — jamais une coordonnée simplement affichée sans dire d'où elle vient
 * ni depuis quand.
 */
export function TalentEnrichAction({ talent }: { talent: Consultant }) {
  const { t } = useTranslation('consultants')
  const mutation = useEnrichTalent(talent.id)
  const search = useSearchTalentByName()
  const [searchOpen, setSearchOpen] = useState(false)
  const [fullName, setFullName] = useState(talent.full_name ?? '')
  const [organizationName, setOrganizationName] = useState('')

  const lastResult = mutation.data ?? null
  const title = lastResult?.consultant.title ?? talent.title
  const lastEnrichedAt = lastResult?.consultant.last_enrichment_at ?? talent.last_enrichment_at ?? null
  const hasBeenTried = lastEnrichedAt !== null
  const hasProfile = Boolean(lastResult?.consultant.public_profile_url ?? talent.public_profile_url)

  /**
   * #3831.1 — retour bêta 07/10/2026 : « il faudrait pouvoir enrichir sans
   * forcément avoir le linkedin […] et si ça colle on met ». La doctrine
   * interdit un rapprochement sur le seul nom (homonymes) ; `code` DISTINGUE
   * ce refus précis (`no_match_key`, fiche SANS clé forte) de `no_identity`
   * (fiche sans nom, où chercher n'aurait aucun sens) — jamais deviné sur le
   * texte français du message.
   */
  const blockedByMissingKey =
    mutation.isError && mutation.error instanceof ApiError && mutation.error.code === 'no_match_key'

  const results = search.data
  const hits = results?.status === 'ok' ? results.hits : []
  const showEmpty = Boolean(results) && hits.length === 0 && (results?.status === 'ok' || results?.status === 'empty')
  const showUnavailable = Boolean(results) && hits.length === 0 && !showEmpty

  const chooseHit = (hit: PersonNameSearchHit) => mutation.mutate({ apolloId: hit.id })

  return (
    <Box className="flex flex-col gap-1.5 sm:col-span-2">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('detail.profile.enrich.noResultTitle')}
        </Text>
        <Button size="sm" variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? t('detail.profile.enrich.working') : t('detail.profile.enrich.action')}
        </Button>
      </Box>

      {/* SIMON-FIX S.4 — pas de poste connu : aucune ligne « Non renseigné ». */}
      {title ? (
        <Text size="sm" className="break-words">
          {title}
        </Text>
      ) : null}

      {hasBeenTried ? (
        <Provenance source="pipeline" observedAt={lastEnrichedAt} />
      ) : (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('detail.profile.enrich.notFetched')}
        </Text>
      )}

      {/* #2570 — la recherche exige un profil LinkedIn : le dire AVANT de
          dépenser un crédit (le serveur le refuse sinon). `contact_visible`
          faux = la valeur est masquée par la politique, pas absente. */}
      {!hasProfile && talent.contact_visible !== false && !mutation.isError ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('detail.profile.enrich.noMatchKey')}
        </Text>
      ) : null}

      {/* #2570 — ce qui a été RETROUVÉ est nommé : l'écran ne montrait que le
          poste, alors que l'e-mail et le téléphone sont écrits sur la fiche. */}
      {mutation.isSuccess && lastResult && lastResult.written.length > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('detail.profile.enrich.found', {
            fields: lastResult.written.map(entry => t(`detail.profile.enrich.fields.${entry.field}`)).join(', '),
          })}
        </Text>
      ) : null}

      {mutation.isSuccess && lastResult && lastResult.written.length === 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('detail.profile.enrich.nothingChanged')}
        </Text>
      ) : null}

      {mutation.isError ? (
        // Même patron que le reste du module (`ConsultantsPage`,
        // `ReverseMarketPage`, `CvStudioPanel`) : le message du serveur EST le
        // message affiché — pas de re-traduction fragile sur un texte
        // français. `detail.profile.enrich.failed` ne sert que de repli quand
        // le serveur n'a rien dit (panne réseau, par ex.).
        <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
          {mutation.error.message || t('detail.profile.enrich.failed')}
        </Text>
      ) : null}

      {blockedByMissingKey && !searchOpen ? (
        <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)}>
          {t('detail.profile.enrich.searchByName')}
        </Button>
      ) : null}

      {blockedByMissingKey && searchOpen ? (
        <Box className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-2">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('detail.profile.enrich.searchHint')}
          </Text>
          <Box className="flex flex-wrap items-end gap-2">
            <Input
              aria-label={t('detail.profile.enrich.searchFullNameLabel')}
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Input
              aria-label={t('detail.profile.enrich.searchOrganizationLabel')}
              placeholder={t('detail.profile.enrich.searchOrganizationPlaceholder')}
              value={organizationName}
              onChange={e => setOrganizationName(e.target.value)}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={fullName.trim().length === 0 || search.isPending}
              isLoading={search.isPending}
              onClick={() =>
                search.mutate({ fullName: fullName.trim(), organizationName: organizationName.trim() || undefined })
              }
            >
              {t('detail.profile.enrich.searchSubmit')}
            </Button>
          </Box>

          {search.isError ? (
            <Text size="xs" role="alert" className="text-[var(--danger-soft-text)]">
              {t('detail.profile.enrich.searchError')}
            </Text>
          ) : null}

          {showEmpty ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('detail.profile.enrich.searchEmpty')}
            </Text>
          ) : null}

          {showUnavailable ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('detail.profile.enrich.searchUnavailable')}
            </Text>
          ) : null}

          {hits.map(hit => (
            <Box
              key={hit.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--bellum-border)] px-2 py-1.5"
            >
              <Box className="flex flex-col gap-0.5">
                <Text size="sm" weight="medium">{`${hit.firstName} ${hit.lastNameObfuscated}`}</Text>
                {/* #3831 — une valeur absente ne fait AUCUNE ligne (GA-18/GA-19) :
                    ni poste vide, ni ville/pays réduit à un séparateur orphelin. */}
                {hit.title ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {hit.title}
                  </Text>
                ) : null}
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {hit.organizationName}
                </Text>
                {hit.city || hit.country ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {[hit.city, hit.country].filter(Boolean).join(', ')}
                  </Text>
                ) : null}
                {/* Disponibilité du canal, jamais sa valeur (même discipline que
                    PersonNameSearchPanel / ContactResultRow) — un homonyme
                    n'affiche jamais de coordonnée avant le reveal payant. */}
                <Box className="flex items-center gap-3 text-xs text-[var(--bellum-text-muted)]">
                  {hit.hasEmail ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-[10px] w-[10px]" aria-hidden />
                      {t('detail.profile.enrich.channelEmail')}
                    </span>
                  ) : null}
                  {hit.hasPhone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-[10px] w-[10px]" aria-hidden />
                      {t('detail.profile.enrich.channelPhone')}
                    </span>
                  ) : null}
                </Box>
              </Box>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => chooseHit(hit)}
              >
                {t('detail.profile.enrich.searchChoose')}
              </Button>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
