import { fetchManualClients, type ManualClient } from '@/lib/admin'
import { BillingHealthBadge, alertSentence } from './billing-health-badge'
import { InvoiceLedger } from './invoice-ledger'
import { jourSeul } from '@/lib/dates'
import { EmailEnClair } from '@/app/_components/email-en-clair'

// Clients facturés sur facture (hors Stripe) — ce qui a été vendu, ce qui a été
// facturé DEPUIS, et ce qui est en retard. L'application n'émet toujours AUCUNE
// facture et ne relance personne : les références pointent vers les documents
// réellement émis dans l'outil comptable.
//
// Ce que l'écran sait dire depuis le 02/09/2026, et qu'il ne savait pas :
// « l'engagement de trois mois est échu depuis dix jours et rien n'a été
// facturé après ». Cette phrase vivait dans le champ « Notes », où aucun code
// ne pouvait la relire — et où personne ne la relisait non plus.

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency || 'EUR' }).format(cents / 100)

const PERIOD_LABELS: Record<ManualClient['period'], string> = {
  monthly: 'mensuel',
  quarterly: 'trimestriel',
  yearly: 'annuel',
  one_off: 'ponctuel',
}

/** Rough annualised value, so a mixed list of cycles can be summed honestly. */
const annualised = (c: ManualClient): number =>
  c.period === 'monthly'
    ? c.amountCents * 12
    : c.period === 'quarterly'
      ? c.amountCents * 4
      : c.period === 'yearly'
        ? c.amountCents
        : 0

export async function ManualClientsPanel() {
  let clients: ManualClient[]
  try {
    clients = await fetchManualClients()
  } catch (err) {
    return (
      <div className="error">
        Impossible de joindre l&apos;endpoint admin de l&apos;API.
        <br />
        {err instanceof Error ? err.message : String(err)}
        <br />
        Vérifie <code>API_BASE_URL</code> + <code>INTERNAL_API_SECRET</code> et que l&apos;API tourne.
      </div>
    )
  }

  // Le retard se lit sur les FACTURES, plus sur le contrat : une période jamais
  // facturée n'a pas de paiement à déclarer, et c'est justement le cas qu'on
  // veut voir.
  const unpaidInvoices = clients.flatMap(c => c.invoices.filter(i => i.paymentStatus === 'unpaid'))
  const unpaidTotal = unpaidInvoices.reduce((sum, i) => sum + i.amountCents, 0)
  const arr = clients.reduce((sum, c) => sum + annualised(c), 0)
  const toHandle = clients.filter(c => c.health.severity !== 'ok')
  const critical = clients.filter(c => c.health.severity === 'danger')

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ marginBottom: 4 }}>Clients sur facture</h2>
      {/* #1655 — VRAIE MAIS INCOMPLÈTE, ET C'EST CE QUI COÛTE.
          « Bellum n'envoie aucune relance » est exact — la règle du chantier
          est justement « préparer, jamais envoyer ». Mais l'opérateur qui
          cherche la fonction lisait « elle n'existe pas » et n'allait pas plus
          loin, alors que le texte de relance J+3 / J+15 / J+30 est préparé
          sous le calendrier (`billing-reminder-panel.tsx`). Même défaut que
          celui trouvé sur /securite le 08/09 : une phrase qui dit ce qu'on ne
          fait pas et tait ce qu'on fait. */}
      <p className="subtitle" style={{ marginTop: 0 }}>
        Contrats négociés à la main, facturés hors application (virement). Bellum n&apos;émet pas la facture et
        n&apos;envoie jamais de relance à votre place — mais il en <strong>prépare le texte</strong> (J+3 / J+15 / J+30)
        sous le calendrier&nbsp;: vous copiez, vous envoyez depuis votre messagerie, puis vous consignez l&apos;envoi.
        Un litige ouvert bloque la relance.
      </p>

      {critical.length > 0 ? (
        <div
          role="status"
          style={{
            border: '1px solid var(--red)',
            borderRadius: 8,
            padding: '10px 14px',
            margin: '12px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <strong style={{ color: 'var(--red)' }}>{critical.length} contrat(s) à traiter aujourd&apos;hui</strong>
          {critical.map(c => (
            <span key={c.workspaceId} style={{ fontSize: 13 }}>
              {c.workspaceName} —{' '}
              {c.health.alerts
                .filter(a => a.severity === 'danger')
                .map(alertSentence)
                .join(' · ')}
            </span>
          ))}
          {/* Ce que le bandeau ne fait PAS, et qu'il ne faut pas croire qu'il
              fait : rien n'est suspendu, aucune relance ne part. */}
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            Aucun accès n&apos;est coupé automatiquement — la suspension reste une décision à prendre.
          </span>
        </div>
      ) : null}

      <section className="kpi-grid">
        <div className="card">
          <div className="label">Clients sur facture</div>
          <div className="value">{clients.length}</div>
        </div>
        <div className="card">
          <div className="label">À traiter</div>
          <div className="value" style={{ color: toHandle.length > 0 ? 'var(--red)' : undefined }}>
            {toHandle.length}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            {critical.length} urgent(s) · engagement échu ou facture manquante
          </div>
        </div>
        <div className="card">
          <div className="label">Factures non encaissées</div>
          <div className="value" style={{ color: unpaidInvoices.length > 0 ? 'var(--red)' : undefined }}>
            {unpaidInvoices.length}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{money(unpaidTotal, 'EUR')}</div>
        </div>
        <div className="card">
          <div className="label">Valeur annualisée</div>
          <div className="value">{money(arr, 'EUR')}</div>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>hors contrats ponctuels</div>
        </div>
      </section>

      {clients.length === 0 ? (
        <p className="empty">
          Aucun client sur facture. Créez-en un depuis l&apos;écran{' '}
          <a className="link" href="/clients">
            Clients
          </a>
          .
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ESN</th>
              <th>Propriétaire</th>
              <th>Plan</th>
              <th className="num">Montant</th>
              <th>Périodicité</th>
              <th>Début</th>
              <th>Engagement · état</th>
              <th>Factures émises</th>
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.workspaceId}>
                <td>{c.workspaceName}</td>
                {/* Pas de <a> autour : l’adresse porte son propre `mailto:`. La colonne « Espace » porte l’identité de la ligne. */}
                <td className="mono">
                  <EmailEnClair email={c.ownerEmail} />
                </td>
                <td>
                  <span className="pill">{c.plan ?? '—'}</span>
                </td>
                <td className="num">{money(c.amountCents, c.currency)}</td>
                <td>{PERIOD_LABELS[c.period]}</td>
                <td>
                  {jourSeul(c.startDate)}
                  {c.billedToName ? (
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                      facturé à {c.billedToName}
                      {c.billedToKind === 'person' ? ' (particulier)' : ''}
                    </div>
                  ) : null}
                </td>
                <td>
                  <BillingHealthBadge health={c.health} />
                </td>
                <td>
                  <InvoiceLedger workspaceId={c.workspaceId} invoices={c.invoices} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
