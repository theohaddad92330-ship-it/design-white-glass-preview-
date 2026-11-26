import { Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { EsnAnswers } from '@bellum/contracts'
import { ProfileQuestionnaireDialog } from '@/features/onboarding/components/ProfileQuestionnaireDialog'
import { downloadBlob } from '@/lib/pdf-download'
import { buildFramingExport, framingAnswerCount } from '../lib/framing'

/**
 * L'en-tête du profil commercial (maquette `settings-espace`, Théo V22 — Louis 22/10/2026) : « Ton profil de
 * travail », le nombre de réponses renseignées, et les trois gestes du cadrage — voir l'audit (« Ce que Laura a
 * compris »), exporter le cadrage, continuer le questionnaire.
 *
 * Théo D settings-espace.N2 — « Exporter mon cadrage » : le JSON des réponses RENSEIGNÉES, par thème, généré dans le
 * navigateur à partir de ce que l'écran a déjà lu (aucune route neuve, rien ne quitte l'appareil que la personne n'ait
 * demandé). Une question sans réponse n'apparaît pas dans le fichier.
 */
// Théo D settings-espace.R1 — Profil : un seul cadrage (compteur de réponses) ; l'audit devient « Voir mon audit »,
// « Exporter mon cadrage » (N2), « Continuer le questionnaire ».
export function ProfileFramingHeader({
  answers,
  status,
  aside,
}: {
  answers: EsnAnswers
  status?: ReactNode
  /** La seconde carte de l'aperçu (maquette : `.ob20-profile-overview`, colonnes 1,3 / 1) — la maturité. */
  aside?: ReactNode
}) {
  const { t } = useTranslation('profile')
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false)
  const count = framingAnswerCount(answers)

  const exportFraming = () => {
    const now = new Date()
    const payload = buildFramingExport(answers, now.toISOString())
    const day = now.toISOString().slice(0, 10)
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `cadrage-${day}.json`)
  }

  return (
    <div className="space-y-6">
      {/* `.ob20-heading` : l'eyebrow, le titre de niveau 1 (le seul de l'écran), la phrase. */}
      <header>
        <SettingsEyebrowText>{t('framing.eyebrow')}</SettingsEyebrowText>
        <Text element="h1" size="3xl" weight="semibold" className="tracking-tight">
          {t('framing.title')}
        </Text>
        <Text element="p" size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
          {t('framing.subtitle')}
        </Text>
      </header>
      {/* `.ob20-profile-overview` : la carte du cadrage (état, avancement, gestes), puis la maturité à côté. Une seule
          colonne sous 768 px. */}
      <div className={aside ? 'grid gap-5 lg:grid-cols-[1.3fr_1fr]' : undefined} data-profile-overview="">
        <section
          aria-labelledby="profile-framing-title"
          className="space-y-3 rounded-card border border-[var(--bellum-border)] bg-card p-6"
        >
          {/* Théo D settings-espace.N1 — « Cadrage à valider » : l'état de validation du contexte (D9), avec son geste. */}
          {status}
          <Text element="h2" size="xl" weight="semibold" id="profile-framing-title" className="tracking-tight">
            {count === 0 ? t('framing.noAnswer') : t('framing.answerCount', { count })}
          </Text>
          <Box className="flex flex-wrap items-center gap-2 pt-1">
            <Button asChild size="sm" className="pointer-coarse:min-h-11">
              <Link to="/settings/profile/audit">{t('framing.seeAudit')}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:min-h-11"
              disabled={count === 0}
              onClick={exportFraming}
            >
              {t('framing.export')}
            </Button>
            {/* #4818.1 — la RELECTURE du cadrage par thème : le chemin qui amène à `ThemeQuestionCard` quand l'onboarding est terminé. */}
            <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
              <Link to="/onboarding/themes">{t('framing.reread')}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-coarse:min-h-11"
              onClick={() => setQuestionnaireOpen(true)}
            >
              {t('framing.continue')}
            </Button>
          </Box>
        </section>
        {aside}
      </div>
      {questionnaireOpen ? <ProfileQuestionnaireDialog open onOpenChange={setQuestionnaireOpen} /> : null}
    </div>
  )
}

/** L'eyebrow du profil (`.ob20-eyebrow`) : petites capitales discrètes au-dessus du titre. */
function SettingsEyebrowText({ children }: { children: ReactNode }) {
  return (
    <Text
      element="p"
      size="xs"
      weight="semibold"
      className="mb-2 uppercase tracking-widest text-[var(--bellum-text-muted)]"
    >
      {children}
    </Text>
  )
}
