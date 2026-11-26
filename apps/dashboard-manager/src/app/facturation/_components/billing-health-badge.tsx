import type { BillingAlert, BillingHealth } from '@/lib/admin'
import { jourSeul } from '@/lib/dates'

// La traduction de l'état d'un contrat en une phrase que l'opérateur peut LIRE
// sans ouvrir la fiche. Elle ne CALCULE rien : la dérivation vit dans l'API
// (`billingHealth`), et deux calculs du même fait finiraient par se contredire.
//
// ⚠️ Un engagement absent s'écrit « non renseigné », jamais « 0 mois » : la
// différence est celle entre « ce client n'a pas d'engagement » et « personne
// ne l'a saisi », et seule la seconde est vraie de nos dix-sept lignes reprises.

// Une DATE SEULE n'a pas de fuseau : `jourSeul` la lit et la rend en UTC.
// L'ancien `T00:00:00` la parsait à minuit LOCAL, ce qui tenait par accident.
const DAY = (iso: string) => jourSeul(iso)

const COLOR: Record<BillingHealth['severity'], string> = {
  ok: 'var(--green)',
  info: 'var(--muted)',
  warning: 'var(--amber, #d97706)',
  danger: 'var(--red)',
}

export function alertSentence(alert: BillingAlert): string {
  switch (alert.kind) {
    case 'commitment_ended_unrenewed':
      return `Engagement échu depuis ${alert.days} j — aucune facture posterieure`
    case 'commitment_ending_soon':
      return alert.days === 0 ? "Engagement à échéance aujourd'hui" : `Engagement à échéance dans ${alert.days} j`
    case 'invoice_missing':
      return alert.window
        ? `Aucune facture pour la période du ${DAY(alert.window.start)} (${alert.days} j)`
        : `Facture manquante (${alert.days} j)`
    case 'invoice_unpaid':
      return `${alert.reference ?? 'Facture'} non encaissée depuis ${alert.days} j`
  }
}

/** La pastille de la colonne « État » — la pire alerte, ou « à jour ». */
export function BillingHealthBadge({ health }: { health: BillingHealth }) {
  const worst = health.alerts.find(a => a.severity === health.severity) ?? null

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: COLOR[health.severity], fontWeight: 600 }}>{worst ? alertSentence(worst) : 'À jour'}</span>
      {health.alerts.length > 1 ? (
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {health.alerts
            .filter(a => a !== worst)
            .map(alertSentence)
            .join(' · ')}
        </span>
      ) : null}
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>
        {health.commitmentEnd ? `Engagement jusqu'au ${DAY(health.commitmentEnd)}` : 'Engagement non renseigné'}
        {' · '}
        {/* Le dénominateur EXCLUT les périodes encore dans leur délai de grâce :
            une période facturable ce matin n'est pas une période en retard. */}
        {health.windowsInvoiced}/{health.windowsDue} période(s) facturée(s)
      </span>
    </span>
  )
}
