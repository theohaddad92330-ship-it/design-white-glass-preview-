import type { ChainBlocker } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { blockerSentence, chainBlockerSubjectHref } from '@/features/chains/api'

/**
 * LES BLOCAGES DE PARCOURS, LE MATIN (#1506 §1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SEULEMENT CE QUI BLOQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour le demande explicitement : « ne pas afficher le parcours complet
 * dans Ma matinée ». Ce bloc dit « 3 dossiers attendent un retour client depuis
 * plus de 7 jours » et emmène au bon endroit ; le parcours complet a son écran.
 *
 * ⚠️ Une liste vide se lit « rien ne bloque », et c'est vrai dans les deux cas
 * où elle survient — aucun blocage, ou aucun parcours lisible. Ce qui serait
 * FAUX est d'annoncer « aucun blocage » quand la lecture a échoué : le service
 * ne rend une liste vide qu'après avoir regardé, et un échec de lecture y est
 * journalisé côté serveur plutôt que déguisé en bonne nouvelle.
 *
 * ⚠️ Rien n'est envoyé, rien n'est créé. « Ne jamais envoyer une action
 * automatiquement parce qu'une étape est bloquée » (#1507 §6) : le bloc ouvre le
 * dossier, le commercial décide.
 */
export function ChainBlockersBlock({ blockers }: { blockers: readonly ChainBlocker[] | undefined }) {
  const { t, i18n } = useTranslation('chains')
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'

  if (!blockers || blockers.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('blockers.empty')}
      </Text>
    )
  }

  return (
    <Box className="flex flex-col gap-2">
      {blockers.map(blocker => (
        <Box
          key={`${blocker.chainKey}-${blocker.position}-${blocker.gate ?? ''}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
        >
          <Box className="flex min-w-0 flex-col gap-0.5">
            <Text element="span" size="sm">
              {blockerSentence(blocker, locale)}
            </Text>
            {/* Les trois premiers NOMS : « 3 dossiers » ne se reconnaît pas,
                « SNCF, Orange, Enedis » se reconnaît. Chacun ouvre SON objet
                (#2107.20-.25) — plus la page générique des parcours. */}
            <Text element="span" size="xs" color="text-muted-foreground" className="truncate">
              {blocker.sample.map((entry, index) => (
                <span key={entry.subjectId}>
                  {index > 0 ? ' · ' : ''}
                  <Link to={chainBlockerSubjectHref(blocker.subjectType, entry.subjectId)} className="underline">
                    {entry.label ?? t('panel.unknownSubject')}
                  </Link>
                </span>
              ))}
            </Text>
          </Box>
          <Box display="flex" className="shrink-0 items-center gap-2">
            {blocker.gate ? <Badge variant="warning">{t('blockers.decision')}</Badge> : null}
            {/* Le CTA emmène au parcours concerné : c'est là que la liste
                complète et les preuves vivent. */}
            <Link to="/pilotage/pipe" hash="parcours" className="underline">
              <Text element="span" size="sm">
                {t('blockers.open')}
              </Text>
            </Link>
          </Box>
        </Box>
      ))}
    </Box>
  )
}
