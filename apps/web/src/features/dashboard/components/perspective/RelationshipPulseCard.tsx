import type { CockpitRelationshipPulse } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { CockpitSources } from './CockpitSources'

/**
 * La dynamique relationnelle (#1409) — une synthèse, pas une seconde messagerie.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne montre AUCUN message. « Le détail des emails reste dans Messagerie »,
 * dit le retour, et c'est aussi une doctrine du dépôt qui va plus loin que la
 * mise en page : le corps d'un message ne sort jamais vers un humain autre que
 * son propriétaire (D65). Le serveur ne l'envoie donc même pas — ce n'est pas
 * une convention d'affichage, c'est l'absence du champ.
 *
 * ⚠️ « Comptes sans échange depuis 30 jours » est le MÊME nombre que celui du
 * bloc Couverture, parce que c'est le même calcul, fait une seule fois côté
 * serveur. Deux blocs qui affichent la même phrase doivent afficher le même
 * chiffre : c'est le défaut le plus cher du lot 6 (une tuile annonçait 2, son
 * filtre rendait zéro ligne), et il venait de trois requêtes pour une phrase.
 */
export function RelationshipPulseCard({ pulse }: { pulse: CockpitRelationshipPulse }) {
  const { t } = useTranslation('dashboard')
  const silent = pulse.accounts_without_interaction

  return (
    <section
      aria-label={t('perspective.relationship.title')}
      className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <Text element="h2" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('perspective.relationship.title')}
      </Text>

      <dl className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Tally label={t('perspective.relationship.activeThreads')} value={pulse.active_threads} />
        <Tally label={t('perspective.relationship.awaitingReply')} value={pulse.awaiting_reply} />
        <Tally label={t('perspective.relationship.replies')} value={pulse.replies_received} />
        <Tally label={t('perspective.relationship.silent')} value={silent} />
      </dl>

      {/* L'anomalie, dite en une phrase — c'est l'exemple du retour. Elle
          n'apparaît QUE si elle est mesurée ET non nulle : « 0 compte sans
          échange » n'est pas une anomalie, c'est une bonne nouvelle, et
          l'annoncer comme un problème userait le signal. */}
      {silent !== null && silent > 0 ? (
        <Text size="sm" className="mt-4 text-[var(--bellum-text-secondary)]">
          {t('perspective.relationship.headline', { count: silent })}
        </Text>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          to="/mailbox"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline pointer-coarse:min-h-11 pointer-coarse:items-center"
        >
          {t('perspective.relationship.cta')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        {/* La seconde porte du retour — « demander lesquels relancer ». La
            question est RÉDIGÉE pour cet écran et pré-remplie, jamais postée :
            le commercial la relit avant d'envoyer. */}
        <AskLaura label={t('perspective.relationship.askLabel')} question={t('perspective.relationship.askQuestion')} />
      </div>

      <CockpitSources provenance={pulse.provenance} />
    </section>
  )
}

function Tally({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="mt-0.5">
        {value === null ? (
          <UnknownValue />
        ) : (
          <Text size="lg" weight="semibold" className="tabular-nums text-[var(--bellum-text-primary)]">
            {value}
          </Text>
        )}
      </dd>
    </div>
  )
}
