import type { ProjectNeed } from '@bellum/contracts'
import { Badge, Box, Button, Input, Text } from '@bellum/ui'
import { Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useSubmissions } from '@/features/submissions/api'
import { NeedShortlistPreview } from '../open-needs/view/NeedShortlistPreview'
import { needMatcherCanLaunch, needMatcherLaunchTooltip } from '../open-needs/model/need-matcher-gate-label'
import {
  useAddProjectNeed,
  useProjectNeeds,
  useRemoveProjectNeed,
  useUpdateProjectNeed,
} from '../hooks/useProjectNeeds'

/**
 * Les rôles recherchés d'un projet — le « besoin » comme SOUS-LIGNE.
 *
 * C'est ici que se voit le bénéfice du pivot : un projet « refonte du SI
 * paiement » peut chercher deux architectes et un chef de projet sans devenir
 * trois affaires. Le pipe compte UN projet ; l'ATS, lui, travaille sur trois
 * lignes.
 *
 * Le TJM s'affiche seulement s'il a été saisi. Un « 0 € » à sa place ferait
 * croire à une mission gratuite, et un tiret sans explication à un bug.
 */
export function ProjectNeedsPanel({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation('projects')
  const { t: tMatching } = useTranslation('matching')
  const navigate = useNavigate()
  const { data: needs, isLoading, isError } = useProjectNeeds(projectId)
  // #4344.4 — une seule lecture pour tous les rôles ; chaque aperçu filtre sur son besoin.
  const { data: submissions } = useSubmissions({ projectId })
  const add = useAddProjectNeed(projectId)
  const remove = useRemoveProjectNeed(projectId)
  const [title, setTitle] = useState('')

  const money = (cents: number): string =>
    new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(cents / 100)

  const submit = () => {
    const clean = title.trim()
    if (!clean) return
    add.mutate({ title: clean }, { onSuccess: () => setTitle('') })
  }

  return (
    <Box className="space-y-3">
      <Box display="flex" className="items-center gap-2">
        <Users className="size-4 text-muted-foreground" aria-hidden />
        <Text element="h4" size="sm" weight="medium">
          {t('needs.title')}
        </Text>
      </Box>

      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('common:states.loading')}
        </Text>
      ) : isError ? (
        // Un échec de lecture ne se lit jamais « aucun rôle » : les rôles
        // existent toujours, c'est la lecture qui a échoué.
        <Box className="rounded-md border border-dashed border-destructive/40 p-3">
          <Text size="sm" color="text-muted-foreground">
            {t('needs.loadError')}
          </Text>
        </Box>
      ) : (needs?.length ?? 0) === 0 ? (
        <Box className="rounded-md border border-dashed border-border p-3">
          <Text size="sm" color="text-muted-foreground">
            {t('needs.empty')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-2">
          {needs?.map(need => (
            <Box
              key={need.id}
              display="flex"
              className="items-start justify-between gap-3 rounded-md border border-border bg-card p-2"
            >
              <Box className="min-w-0 space-y-1">
                {/* #4344.2 — le titre OUVRE la fiche du besoin, shortlist ou non (l'aperçu ne se rend pas sans candidat). */}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto max-w-full justify-start truncate p-0 font-medium pointer-coarse:min-h-11"
                  onClick={() =>
                    void navigate({
                      to: '/projects/needs/$needId',
                      params: { needId: need.id },
                      search: { tab: 'profiles' },
                    })
                  }
                >
                  {need.title}
                </Button>
                <Box display="flex" className="flex-wrap items-center gap-1.5">
                  <Badge variant="default">{t('needs.headcount', { count: need.headcount })}</Badge>
                  <Badge variant="default">
                    {t(`needs.contract.${need.contract_kind}`, { defaultValue: need.contract_kind })}
                  </Badge>
                  {need.target_tjm_cents !== null ? (
                    <Badge variant="default">{t('needs.tjm', { amount: money(need.target_tjm_cents) })}</Badge>
                  ) : null}
                  {need.skills.map(skill => (
                    <Badge key={skill.term} variant={skill.required ? 'primary' : 'default'}>
                      {skill.term}
                    </Badge>
                  ))}
                </Box>
                <NeedSkillsEditor need={need} projectId={projectId} />
                {/* #4344.4 — la shortlist du besoin : nombre + 3 premiers + lien ; rien s'il n'y a personne. */}
                <NeedShortlistPreview
                  needId={need.id}
                  items={submissions?.items ?? []}
                  onOpen={() =>
                    void navigate({
                      to: '/projects/needs/$needId',
                      params: { needId: need.id },
                      search: { tab: 'profiles' },
                    })
                  }
                />
              </Box>
              <Box display="flex" className="shrink-0 items-center gap-1">
                {/* Point d'entrée n°2 (§5) : le MÊME panneau que depuis la liste
                    des besoins ouverts — deux écrans, un seul classement. */}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!needMatcherCanLaunch(need)}
                  title={needMatcherLaunchTooltip(need, tMatching)}
                  onClick={() => void navigate({ to: '/projects/needs', search: { match: need.id } })}
                >
                  {tMatching('launch.action')}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('needs.remove')}
                  title={t('needs.remove')}
                  onClick={() => remove.mutate({ needId: need.id })}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Box display="flex" className="items-center gap-2">
        <Input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder={t('needs.placeholder')}
          aria-label={t('needs.placeholder')}
          onKeyDown={event => {
            if (event.key === 'Enter') submit()
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={title.trim().length === 0}
          isLoading={add.isPending}
          onClick={submit}
        >
          <Plus className="mr-1 size-3.5" aria-hidden />
          {t('needs.add')}
        </Button>
      </Box>
    </Box>
  )
}

/**
 * Les compétences d'un rôle, saisies là où le rôle vit.
 *
 * Trouvé en recette : `PATCH /projects/needs/:id` existait, `useUpdateProjectNeed`
 * existait, et AUCUN écran ne les appelait. Conséquence — un besoin ne pouvait
 * recevoir aucune compétence, donc le bouton « Lancer le matching » restait
 * éteint pour toujours et le point d'entrée n°1 du module était inatteignable.
 * Un chemin d'écriture sans appelant, comme les trois de la recette précédente.
 *
 * Deux champs et non un : le caractère ÉLIMINATOIRE d'une compétence est ce qui
 * décide de l'exclusion d'un profil. Le noyer dans une seule liste obligerait à
 * inventer une convention de saisie (un préfixe, une étoile) que personne ne
 * retiendrait, et une compétence rangée du mauvais côté écarte des gens à tort.
 */
function NeedSkillsEditor({ need, projectId }: { need: ProjectNeed; projectId: string }) {
  const { t } = useTranslation('projects')
  const update = useUpdateProjectNeed(projectId)
  const [open, setOpen] = useState(false)
  const [required, setRequired] = useState(() =>
    need.skills
      .filter(skill => skill.required)
      .map(skill => skill.term)
      .join(', '),
  )
  const [nice, setNice] = useState(() =>
    need.skills
      .filter(skill => !skill.required)
      .map(skill => skill.term)
      .join(', '),
  )

  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => setOpen(true)}>
        {need.skills.length === 0 ? t('needs.skills.add') : t('needs.skills.edit')}
      </Button>
    )
  }

  const toTerms = (raw: string, isRequired: boolean) =>
    raw
      .split(',')
      .map(term => term.trim())
      .filter(Boolean)
      .map(term => ({ term, required: isRequired, level: null }))

  return (
    <Box className="space-y-1 pt-1">
      <Input
        value={required}
        onChange={event => setRequired(event.target.value)}
        placeholder={t('needs.skills.requiredPlaceholder')}
        className="h-7 text-xs"
      />
      <Input
        value={nice}
        onChange={event => setNice(event.target.value)}
        placeholder={t('needs.skills.nicePlaceholder')}
        className="h-7 text-xs"
      />
      <Box display="flex" className="gap-1">
        <Button
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={update.isPending}
          onClick={() => {
            update.mutate(
              { needId: need.id, patch: { skills: [...toTerms(required, true), ...toTerms(nice, false)] } },
              { onSuccess: () => setOpen(false) },
            )
          }}
        >
          {t('needs.skills.save')}
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setOpen(false)}>
          {t('needs.skills.cancel')}
        </Button>
      </Box>
    </Box>
  )
}
