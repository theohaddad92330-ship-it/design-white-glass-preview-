import { useTranslation } from 'react-i18next'
import { AlertTriangle, BadgeCheck, Ban } from 'lucide-react'
import type { DiscoverQualification } from '../lib/discover-types'

/**
 * Le verdict de qualification, rendu à côté du candidat (addendum final p35, p40).
 *
 * Le registre produisait des résultats juridiquement vrais et commercialement
 * absurdes — des personnes physiques, des indivisions, des coquilles à zéro
 * salarié présentées comme des comptes à conquérir. Le back les qualifie
 * désormais ; ce composant est ce qui rend la décision LISIBLE.
 *
 * Deux règles d'affichage :
 *
 *  - un « recommandé » n'affiche RIEN. Une pastille verte sur la majorité des
 *    lignes est du bruit : ce qui mérite d'être signalé, c'est l'écart ;
 *  - un « exclu » ou un « à vérifier » affiche toujours SA RAISON, jamais un
 *    verdict nu. « Écarté » sans motif est invérifiable, et le rapport demande
 *    précisément que le produit explique pourquoi un compte est rejeté.
 */
export function QualificationBadge({ qualification }: { qualification: DiscoverQualification | undefined }) {
  const { t } = useTranslation('discover')
  if (!qualification) return null
  // #4358.4 — un compte recommandé n'affiche rien, SAUF son rattachement au secteur par l'activité ou le site.
  if (qualification.verdict === 'recommended') {
    if (!qualification.sectorAttachment) return null
    return (
      <p className="mb-2 text-xs leading-snug text-muted-foreground">
        {t(`qualification.sectorAttachment.${qualification.sectorAttachment.via}`)}
      </p>
    )
  }

  const excluded = qualification.verdict === 'excluded'
  const Icon = excluded ? Ban : AlertTriangle
  // Le code est traduit quand on le connaît ; sinon on affiche la raison
  // serveur telle quelle — jamais un identifiant machine brut.
  const reason = qualification.code
    ? t(`qualification.reason.${qualification.code}`, { defaultValue: qualification.reason })
    : qualification.reason

  return (
    <div
      className="mb-2 flex items-start gap-1.5 rounded-md px-2 py-1.5"
      style={{
        background: excluded ? 'var(--danger-soft-bg)' : 'var(--warning-soft-bg)',
        border: `1px solid ${excluded ? 'var(--danger-soft-border)' : 'var(--warning-soft-border)'}`,
      }}
    >
      <Icon
        className="mt-px h-3 w-3 shrink-0"
        style={{ color: excluded ? 'var(--danger-soft-text)' : 'var(--warning-soft-text)' }}
      />
      <span
        className="text-xs leading-snug"
        style={{ color: excluded ? 'var(--danger-soft-text)' : 'var(--warning-soft-text)' }}
      >
        <span className="font-medium">{t(`qualification.verdict.${qualification.verdict}`)}</span>
        {' — '}
        {reason}
      </span>
    </div>
  )
}

/** Icône seule, pour les vues en ligne où la place manque. */
export function QualificationMark({ qualification }: { qualification: DiscoverQualification | undefined }) {
  const { t } = useTranslation('discover')
  if (!qualification || qualification.verdict === 'recommended') return null
  const excluded = qualification.verdict === 'excluded'
  const Icon = excluded ? Ban : AlertTriangle
  return (
    <Icon
      className="h-3 w-3 shrink-0"
      style={{ color: excluded ? 'var(--danger-soft-text)' : 'var(--warning-soft-text)' }}
      aria-label={t(`qualification.verdict.${qualification.verdict}`)}
    />
  )
}

/** Le verdict « recommandé » existe aussi — utile pour un test ou un compteur. */
export { BadgeCheck as RecommendedIcon }
