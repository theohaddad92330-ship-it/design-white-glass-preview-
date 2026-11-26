import { Box, Text } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { MissionCreateForm } from './MissionCreateForm'

/**
 * « NOUVELLE MISSION » — `/missions/nouvelle` (#4196, épopée #4191, lot L5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ RENVERSEMENT ASSUMÉ DU 14/10/2026 — CETTE PAGE CRÉE UNE MISSION
 * ─────────────────────────────────────────────────────────────────────────────
 * Du 31/08 au 14/10/2026, cet écran montait l'assistant de BESOIN en quatre
 * étapes : le titre disait « mission », l'objet écrit était un `project_need`
 * (la nuance « mission à la porte, besoin en base » était documentée ici). La
 * recette l'a tranché : un commercial qui clique « Nouvelle mission » attend une
 * mission, et repartait avec un besoin. Le besoin garde sa porte à lui
 * (`/projects/needs`, `CreateNeedDialog`) ; cette page-ci écrit la vraie mission
 * (`POST /delivery/missions`) et ouvre son dossier.
 *
 * Venant d'une opportunité signée (`?project_id=`, lot X41), le compte et
 * l'affaire sont imposés au formulaire.
 */
export function CreateMissionPage({ fixedProjectId }: { fixedProjectId?: string } = {}) {
  const { t } = useTranslation('missions')
  const navigate = useNavigate()

  const leave = () => void navigate({ to: '/missions' })

  // Refonte Théo PR12 — la grammaire de `c/missions-dossier` : le retour en tête (`.m5-back`), le
  // surtitre et le titre (`.m5-record-hero`), puis le formulaire en blocs.
  return (
    <CustomerPage titleInScreen pageTitle={t('createMission.title')}>
      <Box data-screen="nouvelle-mission" className="min-w-0 space-y-5">
        <button
          type="button"
          onClick={leave}
          className="inline-flex min-h-11 items-center gap-2 text-xs text-[var(--bellum-text-secondary)] transition-colors duration-immediate ease-bellum-out hover:text-[var(--bellum-text-primary)] md:min-h-8"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('createMission.back')}
        </button>
        <header data-theo-block="hero" className="max-w-3xl">
          <Text
            element="p"
            size="xs"
            weight="semibold"
            color="var(--bellum-text-muted)"
            className="uppercase tracking-widest"
          >
            {t('createMission.eyebrow')}
          </Text>
          <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-[var(--bellum-text-primary)] md:text-3xl">
            {t('createMission.title')}
          </h1>
          <Text element="p" size="sm" color="var(--bellum-text-secondary)" className="mt-2">
            {t('createMission.description')}
          </Text>
        </header>
        <MissionCreateForm
          projectId={fixedProjectId}
          onCancel={leave}
          onCreated={mission => void navigate({ to: '/missions/$id', params: { id: mission.id } })}
        />
      </Box>
    </CustomerPage>
  )
}
