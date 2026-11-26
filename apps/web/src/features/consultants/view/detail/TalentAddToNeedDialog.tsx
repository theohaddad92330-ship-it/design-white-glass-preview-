import { matchesFlexibleQuery } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateSubmission } from '@/features/submissions/api'
import { AlreadyProposedNote } from '@/features/team-guardrails/components/AlreadyProposedNote'
import { matchingApi } from '@/features/matching/api'
import { useOpportunitiesForMatch } from '../../hooks'

/**
 * #2185.50 — « Ajouter à un besoin », depuis la FICHE.
 *
 * Le geste existait déjà, mais seulement depuis la ligne du vivier
 * (`ConsultantMatchPanel`, monté sur `ConsultantsPage`) : il fallait quitter
 * la fiche, retrouver la personne dans la liste, puis choisir un besoin.
 * Cette fenêtre réutilise le MÊME picker (`useOpportunitiesForMatch`) et la
 * MÊME écriture (`useCreateSubmission`) — jamais un second chemin qui
 * pousserait un positionnement autrement.
 *
 * Le positionnement naît `shortlisted` (même défaut que le panneau du
 * vivier) : « ajouter à un besoin » retient un profil, ça ne l'ENVOIE pas —
 * le commercial fait ce geste-là ensuite, lui, explicitement.
 *
 * #4346 — elle ABSORBE « Chercher les besoins » (Louis 19/10/2026) : à l'ouverture,
 * le rapprochement inverse (`matchingApi.inverse`, le même que le panneau
 * « Disponibilité & TJM ») tourne, et les besoins ouverts qui correspondent au
 * consultant passent EN PREMIER, marqués — jamais cachés les autres. Le lien
 * besoin → projet est l'`projectId` du besoin (jamais le nom : pas de rapprochement
 * approximatif). Si le calcul échoue, la liste reste utilisable et l'échec est
 * nommé. Une recherche filtre la liste.
 */
export function TalentAddToNeedDialog({
  talentId,
  talentName,
  open,
  onOpenChange,
}: {
  talentId: string
  talentName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('consultants')
  const { data: opportunities } = useOpportunitiesForMatch()
  const create = useCreateSubmission()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  // `null` : pas (encore) de réponse. `failed` : le calcul n'a pas pu tourner.
  const [matching, setMatching] = useState<{ projectIds: Set<string> | null; failed: boolean }>({
    projectIds: null,
    failed: false,
  })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setMatching({ projectIds: null, failed: false })
    matchingApi
      .inverse(talentId, 'all')
      .then(run => {
        if (cancelled) return
        const ids = new Set<string>()
        for (const entry of run.needs) {
          // Un besoin « recommandé » ET relié à un projet (#4346) : rien n'est deviné par le nom.
          if (entry.result.bucket === 'recommended' && entry.need.projectId) ids.add(entry.need.projectId)
        }
        setMatching({ projectIds: ids, failed: false })
      })
      .catch(() => {
        if (!cancelled) setMatching({ projectIds: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [open, talentId])

  const options = useMemo(() => {
    const needle = query.trim()
    const rows = (opportunities ?? []).map(opportunity => ({
      id: opportunity.id,
      label: opportunity.company_name ? `${opportunity.company_name} — ${opportunity.label}` : opportunity.label,
      matches: matching.projectIds?.has(opportunity.id) === true,
    }))
    return rows
      .filter(row => !needle || matchesFlexibleQuery(needle, row.label))
      .sort((a, b) => Number(b.matches) - Number(a.matches))
  }, [opportunities, matching.projectIds, query])

  const submit = () => {
    if (!projectId) return
    create
      .mutateAsync({ projectId, consultantId: talentId, stage: 'shortlisted', proposedRateCents: null })
      .then(() => {
        setProjectId(null)
        setQuery('')
        onOpenChange(false)
      })
      .catch(() => {
        // Le toast d'échec est déjà porté par `useCreateSubmission` — la
        // fenêtre reste ouverte pour que le choix ne se perde pas.
      })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) {
          setProjectId(null)
          setQuery('')
        }
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('detail.addToNeed.title', { name: talentName })}</DialogTitle>
          <DialogDescription>{t('detail.addToNeed.description')}</DialogDescription>
        </DialogHeader>

        {(opportunities ?? []).length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('detail.addToNeed.empty')}
          </Text>
        ) : (
          <Box display="flex" className="flex-col gap-2">
            <Input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('detail.addToNeed.search')}
              aria-label={t('detail.addToNeed.search')}
            />
            {matching.failed ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('detail.addToNeed.matchFailed')}
              </Text>
            ) : matching.projectIds === null ? (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('detail.addToNeed.matchLoading')}
              </Text>
            ) : null}
            <ul
              role="listbox"
              aria-label={t('detail.addToNeed.label')}
              className="flex max-h-64 flex-col gap-1 overflow-y-auto"
            >
              {options.map(option => (
                <li key={option.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={projectId === option.id}
                    onClick={() => setProjectId(option.id)}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                      projectId === option.id ? 'border-primary bg-[var(--bellum-surface-2)]' : 'border-border'
                    }`}
                  >
                    <span className="min-w-0">{option.label}</span>
                    {option.matches ? (
                      <span className="shrink-0 text-xs text-[var(--success-soft-text)]">
                        {t('detail.addToNeed.matches')}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            {options.length === 0 ? (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('detail.addToNeed.noResult')}
              </Text>
            ) : null}
          </Box>
        )}

        {/* #4158.23 — un collègue l'a-t-il déjà présenté à ce client ou ailleurs ? Information, pas un blocage. */}
        <AlreadyProposedNote projectId={projectId} consultantIds={[talentId]} />

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button size="sm" disabled={!projectId || create.isPending} onClick={submit}>
            {t('detail.addToNeed.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
