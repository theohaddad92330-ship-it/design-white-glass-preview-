'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { jourSeul, jourEtHeureCourte } from '@/lib/dates'

// « Créer un client » — sales-led provisioning from the backoffice: an ESN
// workspace, its owner, its team, a negotiated plan/quota, and the offline
// commercial terms. No Stripe at any point; no password is ever set for anyone
// (the owner receives a password-definition link, prepared here and sent by the
// operator).
//
// ─────────────────────────────────────────────────────────────────────────────
// DEUX TEMPS, ET C'EST LE SUJET DE L'ÉCRAN (#1665, règle 3)
// ─────────────────────────────────────────────────────────────────────────────
// « Un aperçu récapitule les 6 étapes avant validation. » Le formulaire ne crée
// donc plus au premier clic : il PRÉVISUALISE, montre ce qui sera écrit — y
// compris qu'un compte existant sera RÉUTILISÉ, ce qui est le geste le plus
// dangereux de cet écran — puis attend une confirmation.
//
// ⚠️ ET L'APERÇU SE PÉRIME. Modifier un champ après avoir prévisualisé rendrait
// le récapitulatif faux : on compare la saisie à celle qui a été prévisualisée,
// et la confirmation redevient une prévisualisation dès qu'elles diffèrent. Un
// aperçu qu'on peut confirmer après l'avoir contredit ne vaut rien.
//
// The result panel is deliberate: provisioning can PARTIALLY succeed (the client
// exists but a teammate's invitation email bounced). Showing a flat "OK" there
// would hand the operator a client who never heard from us — discovered later,
// by phone. So the panel keys off `fullyNotified` and lists each invitation's
// real delivery outcome.

const PLAN_OPTIONS = [
  { value: 'starter', label: 'Starter (retiré de la vente)' },
  { value: 'team', label: 'Entreprise (sur devis)' },
  { value: 'growth', label: 'Growth' },
  { value: 'beta', label: 'Beta' },
] as const

const ROLE_OPTIONS = [
  { value: 'member', label: 'Membre' },
  { value: 'sales', label: 'Commercial' },
  { value: 'sales_ops', label: 'Sales Ops' },
  { value: 'admin', label: 'Admin' },
  { value: 'tech_admin', label: 'Admin technique' },
  { value: 'viewer', label: 'Lecteur' },
] as const

/**
 * Les durées d'engagement qu'on vend. « Sans engagement » vaut `''` et se
 * traduit par l'ABSENCE du champ — jamais par `0`, qui se lirait « contrat clos
 * le jour de sa signature » et ferait alerter l'écran dès le lendemain.
 */
const COMMITMENT_OPTIONS = [
  { value: '', label: 'Sans engagement' },
  { value: '3', label: '3 mois' },
  { value: '6', label: '6 mois' },
  { value: '12', label: '12 mois' },
  { value: '24', label: '24 mois' },
] as const

const PERIOD_OPTIONS = [
  { value: 'yearly', label: 'Annuel' },
  { value: 'quarterly', label: 'Trimestriel' },
  { value: 'monthly', label: 'Mensuel' },
  { value: 'one_off', label: 'Ponctuel' },
] as const

type TeamRow = { email: string; role: (typeof ROLE_OPTIONS)[number]['value'] }

type ProvisionedInvitation = {
  email: string
  role: string
  created: boolean
  emailSent: boolean
  error: string | null
}

/** Un e-mail préparé par l'API — jamais assemblé ici, sinon deux rédactions. */
type PreparedEmail = {
  to: string
  subject: string
  body: string
  /** `false` quand le corps porte un emplacement au lieu du lien (aperçu). */
  carriesLink: boolean
}

/** Ce que l'action fera à l'existant. `reuse` / `rename` sont les cas à voir. */
type StepAction = 'create' | 'reuse' | 'rename' | 'update' | 'none'

type PreviewStep = {
  key: string
  rank: number
  title: string
  action: StepAction
  detail: string[]
  transactional: boolean
}

type ProvisionPreview = {
  esnName: string
  ownerEmail: string
  steps: PreviewStep[]
  blockers: string[]
  compensations: string[]
  ownerInvitation: PreparedEmail | null
  teamInvitations: Array<{ email: string; role: string }>
  commitmentEnd: string | null
  firstInvoiceWindow: { start: string; end: string } | null
}

type ProvisionResult = {
  workspaceId: string
  workspaceName: string
  owner: { userId: string; email: string; created: boolean }
  plan: string
  accountsLimit: number
  enrichmentCredits: number
  seatsTotal: number
  terms: {
    commitmentMonths: number | null
    /** Dérivée par l'API, jamais recalculée ici. `null` = sans engagement. */
    commitmentEnd: string | null
  }
  firstInvoice: { reference: string; periodStart: string; periodEnd: string; paid: boolean } | null
  invitations: ProvisionedInvitation[]
  fullyNotified: boolean
  ownerNeedsCredentials: boolean
  /** L'e-mail du propriétaire avec SON lien, prêt à copier. */
  ownerInvitation: { email: PreparedEmail; link: string | null; expiresAt: string | null; error: string | null } | null
  /** Ce qui a été journalisé — l'auteur et l'heure, tels que l'API les a écrits. */
  audit: { actor: { email: string; role: string } | null; at: string }
}

const ACTION_LABELS: Record<StepAction, string> = {
  create: 'création',
  reuse: 'réutilisé',
  rename: 'renommé',
  update: 'mise à jour',
  none: 'rien à faire',
}

const todayIso = () => new Date().toISOString().slice(0, 10)

export function CreateClientForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProvisionResult | null>(null)
  const [preview, setPreview] = useState<ProvisionPreview | null>(null)
  /** La saisie EXACTE qui a produit l'aperçu ci-dessus. */
  const [previewedPayload, setPreviewedPayload] = useState<string | null>(null)

  const [esnName, setEsnName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerFirstName, setOwnerFirstName] = useState('')
  const [ownerLastName, setOwnerLastName] = useState('')
  const [plan, setPlan] = useState<string>('team')
  const [extraSeats, setExtraSeats] = useState('0')
  const [accountsLimit, setAccountsLimit] = useState('')
  const [enrichmentCredits, setEnrichmentCredits] = useState('')
  const [amountEuros, setAmountEuros] = useState('')
  const [period, setPeriod] = useState<string>('yearly')
  const [commitmentMonths, setCommitmentMonths] = useState<string>('')
  const [billedToName, setBilledToName] = useState('')
  const [billedToKind, setBilledToKind] = useState<'' | 'person' | 'company'>('')
  const [billingEmail, setBillingEmail] = useState('')
  const [billingPhone, setBillingPhone] = useState('')
  const [startDate, setStartDate] = useState(todayIso())
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [team, setTeam] = useState<TeamRow[]>([])

  function reset() {
    setEsnName('')
    setOwnerEmail('')
    setOwnerFirstName('')
    setOwnerLastName('')
    setPlan('team')
    setExtraSeats('0')
    setAccountsLimit('')
    setEnrichmentCredits('')
    setAmountEuros('')
    setPeriod('yearly')
    setCommitmentMonths('')
    setBilledToName('')
    setBilledToKind('')
    setBillingEmail('')
    setBillingPhone('')
    setStartDate(todayIso())
    setPaymentStatus('unpaid')
    setReference('')
    setNotes('')
    setTeam([])
    setError(null)
    setPreview(null)
    setPreviewedPayload(null)
  }

  /**
   * LA charge utile, construite une seule fois pour les deux appels.
   *
   * L'aperçu et l'écriture DOIVENT décrire la même chose : deux assemblages
   * divergeraient au premier champ ajouté, et l'opérateur confirmerait alors un
   * récapitulatif qui ne correspond plus à ce qui part.
   */
  function buildPayload() {
    // Euros in the form, cents on the wire — same convention as the plans editor.
    const amountCents = Math.round(Number(amountEuros || '0') * 100)

    return {
      esnName: esnName.trim(),
      owner: {
        email: ownerEmail.trim(),
        ...(ownerFirstName.trim() ? { firstName: ownerFirstName.trim() } : {}),
        ...(ownerLastName.trim() ? { lastName: ownerLastName.trim() } : {}),
      },
      plan,
      extraSeats: Number(extraSeats || '0'),
      ...(accountsLimit.trim() ? { accountsLimit: Number(accountsLimit) } : {}),
      ...(enrichmentCredits.trim() ? { enrichmentCredits: Number(enrichmentCredits) } : {}),
      billing: {
        amountCents,
        currency: 'EUR',
        period,
        startDate,
        // Champ ABSENT quand aucun engagement n'est vendu. Envoyer `0` ferait
        // écrire en base une durée que personne n'a négociée.
        ...(commitmentMonths ? { commitmentMonths: Number(commitmentMonths) } : {}),
        ...(billedToName.trim() ? { billedToName: billedToName.trim() } : {}),
        ...(billedToKind ? { billedToKind } : {}),
        ...(billingEmail.trim() ? { billingEmail: billingEmail.trim() } : {}),
        ...(billingPhone.trim() ? { billingPhone: billingPhone.trim() } : {}),
        paymentStatus,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      team: team.filter(t => t.email.trim()).map(t => ({ email: t.email.trim(), role: t.role })),
    }
  }

  /** Le message d'erreur de l'API, qui nomme le vrai blocage. */
  function messageDe(data: Record<string, unknown>, status: number): string {
    if (typeof data.message === 'string') return data.message
    if (typeof data.error === 'string') return data.error
    return `Échec (HTTP ${status}).`
  }

  const payload = buildPayload()
  const signature = JSON.stringify(payload)
  const apercuAJour = preview !== null && previewedPayload === signature
  const bloque = preview !== null && preview.blockers.length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Tant que l'aperçu ne décrit pas la saisie EN COURS, ce bouton prévisualise.
    if (!apercuAJour) return runPreview()
    return runProvision()
  }

  async function runPreview() {
    setPreviewing(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/clients/provision/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: signature,
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & Partial<ProvisionPreview>
      if (!res.ok) {
        setError(messageDe(data, res.status))
        return
      }
      setPreview(data as ProvisionPreview)
      setPreviewedPayload(signature)
    } catch (err) {
      setError(`Requête impossible. ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPreviewing(false)
    }
  }

  async function runProvision() {
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/clients/provision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: signature,
      })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & Partial<ProvisionResult>
      if (!res.ok) {
        // Surface the API's own message — it names the actual blocker, y compris
        // « tout a été annulé » ou « un compte peut subsister ».
        setError(messageDe(data, res.status))
        return
      }
      setResult(data as ProvisionResult)
      reset()
      router.refresh()
    } catch (err) {
      setError(`Requête impossible. ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <div style={{ margin: '0 0 20px' }}>
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          + Créer un client
        </button>
        {result ? <ResultPanel result={result} /> : null}
      </div>
    )
  }

  return (
    <section className="card" style={{ margin: '0 0 20px', padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong style={{ fontSize: 16 }}>Créer un client (facturation manuelle)</strong>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Fermer
        </button>
      </div>
      <p className="subtitle" style={{ marginTop: 0 }}>
        Provisionne l&apos;ESN, son propriétaire, son équipe et son quota — sans passer par Stripe. Le client est
        facturé sur facture, hors application. Aucun mot de passe n&apos;est créé : l&apos;e-mail de bienvenue du
        propriétaire, avec son lien de définition de mot de passe, vous est remis ici pour que vous l&apos;envoyiez.
      </p>

      <form onSubmit={submit}>
        <Fieldset title="ESN">
          <Field label="Nom de l'ESN" required>
            <input value={esnName} onChange={e => setEsnName(e.target.value)} required maxLength={120} />
          </Field>
        </Fieldset>

        <Fieldset title="Propriétaire">
          <Field label="Email" required>
            <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} required />
          </Field>
          <Field label="Prénom">
            <input value={ownerFirstName} onChange={e => setOwnerFirstName(e.target.value)} maxLength={80} />
          </Field>
          <Field label="Nom">
            <input value={ownerLastName} onChange={e => setOwnerLastName(e.target.value)} maxLength={80} />
          </Field>
        </Fieldset>

        <Fieldset title="Plan & quota">
          <Field label="Plan" required>
            <select value={plan} onChange={e => setPlan(e.target.value)}>
              {PLAN_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sièges supplémentaires" hint="au-delà des sièges inclus dans le plan">
            <input type="number" min={0} max={47} value={extraSeats} onChange={e => setExtraSeats(e.target.value)} />
          </Field>
          <Field label="Crédits / mois" hint="vide = valeur du plan · une analyse en coûte 8">
            <input type="number" min={0} value={accountsLimit} onChange={e => setAccountsLimit(e.target.value)} />
          </Field>
          <Field label="Crédits d'enrichissement" hint="vide = valeur du plan">
            <input
              type="number"
              min={0}
              value={enrichmentCredits}
              onChange={e => setEnrichmentCredits(e.target.value)}
            />
          </Field>
        </Fieldset>

        <Fieldset title="Conditions commerciales">
          <Field label="Montant (€)" required>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amountEuros}
              onChange={e => setAmountEuros(e.target.value)}
              required
            />
          </Field>
          <Field label="Périodicité">
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              {PERIOD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date de début" required>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </Field>
          <Field label="Engagement" hint="l'échéance est SIGNALÉE, jamais appliquée — aucun accès n'est coupé">
            <select value={commitmentMonths} onChange={e => setCommitmentMonths(e.target.value)}>
              {COMMITMENT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paiement">
            <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value as 'unpaid' | 'paid')}>
              <option value="unpaid">Non payé</option>
              <option value="paid">Payé</option>
            </select>
          </Field>
          <Field label="Référence facture" hint="numéro émis dans l'outil comptable">
            <input value={reference} onChange={e => setReference(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Notes">
            <input value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
          </Field>
        </Fieldset>

        <Fieldset title="Destinataire de la facture">
          <Field label="Facturé à" hint="vide = l'ESN elle-même">
            <input value={billedToName} onChange={e => setBilledToName(e.target.value)} maxLength={160} />
          </Field>
          <Field label="Qualité">
            <select value={billedToKind} onChange={e => setBilledToKind(e.target.value as typeof billedToKind)}>
              <option value="">Non précisé</option>
              <option value="company">Société</option>
              <option value="person">Particulier</option>
            </select>
          </Field>
          <Field label="Email de facturation">
            <input type="email" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} maxLength={320} />
          </Field>
          <Field label="Téléphone">
            <input value={billingPhone} onChange={e => setBillingPhone(e.target.value)} maxLength={40} />
          </Field>
        </Fieldset>

        <Fieldset title="Équipe à inviter">
          {team.length === 0 ? (
            <p className="empty" style={{ margin: '4px 0' }}>
              Aucun collaborateur — vous pourrez les inviter plus tard depuis l&apos;application.
            </p>
          ) : null}
          {team.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                type="email"
                placeholder="email@esn.fr"
                value={row.email}
                onChange={e => setTeam(team.map((t, j) => (i === j ? { ...t, email: e.target.value } : t)))}
                style={{ flex: 1 }}
              />
              <select
                value={row.role}
                onChange={e =>
                  setTeam(team.map((t, j) => (i === j ? { ...t, role: e.target.value as TeamRow['role'] } : t)))
                }
              >
                {ROLE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" className="btn ghost" onClick={() => setTeam(team.filter((_, j) => j !== i))}>
                Retirer
              </button>
            </div>
          ))}
          <button type="button" className="btn ghost" onClick={() => setTeam([...team, { email: '', role: 'member' }])}>
            + Ajouter un collaborateur
          </button>
        </Fieldset>

        {error ? (
          <div className="error" style={{ margin: '12px 0' }}>
            {error}
          </div>
        ) : null}

        {preview ? <PreviewPanel preview={preview} perime={!apercuAJour} /> : null}

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="submit" className="btn" disabled={saving || previewing || (apercuAJour && bloque)}>
            {previewing
              ? 'Lecture…'
              : saving
                ? 'Provisionnement…'
                : apercuAJour
                  ? 'Confirmer et créer le client'
                  : 'Prévisualiser les 6 étapes'}
          </button>
          <button type="button" className="btn ghost" onClick={reset} disabled={saving || previewing}>
            Réinitialiser
          </button>
          {apercuAJour && !bloque ? (
            <span className="subtitle" style={{ margin: 0 }}>
              Rien n&apos;a encore été écrit. Relisez le récapitulatif ci-dessus avant de confirmer.
            </span>
          ) : null}
        </div>
      </form>

      {result ? <ResultPanel result={result} /> : null}
    </section>
  )
}

/**
 * Le récapitulatif des six étapes, AVANT toute écriture.
 *
 * Il n'invente rien : chaque ligne vient de l'API, qui la dérive de la même
 * lecture que l'écriture fera. Recalculer ici « ce qui va se passer » aurait
 * produit un second récit, et c'est celui-là qui aurait fini par mentir.
 */
function PreviewPanel({ preview, perime }: { preview: ProvisionPreview; perime: boolean }) {
  return (
    <section
      className="card"
      style={{
        marginTop: 16,
        padding: 16,
        borderLeft: `3px solid ${preview.blockers.length > 0 ? 'var(--red)' : 'var(--muted)'}`,
      }}
    >
      <strong>Ce qui sera fait — {preview.esnName || 'ESN sans nom'}</strong>

      {perime ? (
        <div className="error" style={{ margin: '10px 0' }}>
          La saisie a changé depuis ce récapitulatif : il ne décrit plus ce qui serait écrit. Prévisualisez à nouveau.
        </div>
      ) : null}

      {preview.blockers.length > 0 ? (
        <div className="error" style={{ margin: '10px 0' }}>
          <strong>Le provisionnement est impossible en l&apos;état :</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {preview.blockers.map(b => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol style={{ margin: '12px 0 0', paddingLeft: 20 }}>
        {preview.steps.map(step => (
          <li key={step.key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>{step.title}</strong>
              <span className="pill">{ACTION_LABELS[step.action]}</span>
              {step.transactional ? null : <span className="pill">hors transaction</span>}
            </div>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--muted)' }}>
              {step.detail.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {preview.ownerInvitation ? (
        <div style={{ marginTop: 12 }}>
          <div className="label" style={{ marginBottom: 6 }}>
            L&apos;e-mail que recevra le propriétaire
          </div>
          <EmailPreview email={preview.ownerInvitation} />
        </div>
      ) : null}

      <div style={{ marginTop: 14 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          Si quelque chose échoue
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
          {preview.compensations.map(line => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/**
 * Un e-mail préparé, tel quel.
 *
 * ⚠️ `<pre>` avec SON propre défilement : un corps d'e-mail contient des lignes
 * longues (un lien signé en fait deux cents caractères), et sans conteneur
 * défilant c'est la page entière qui déborderait horizontalement.
 */
function EmailPreview({ email }: { email: PreparedEmail }) {
  const [copie, setCopie] = useState(false)

  async function copier() {
    try {
      await navigator.clipboard.writeText(`Objet : ${email.subject}\n\n${email.body}`)
      setCopie(true)
    } catch {
      // Le presse-papier peut être refusé (contexte non sécurisé, permission) :
      // le corps reste sélectionnable à la main juste au-dessus.
      setCopie(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>À : {email.to}</div>
          <div>
            <strong>{email.subject}</strong>
          </div>
        </div>
        <button type="button" className="btn ghost" onClick={copier} disabled={!email.carriesLink}>
          {copie ? 'Copié' : 'Copier l’e-mail'}
        </button>
      </div>
      <pre
        style={{
          margin: '10px 0 0',
          padding: 10,
          background: 'var(--bg)',
          borderRadius: 4,
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 12,
        }}
      >
        {email.body}
      </pre>
      {email.carriesLink ? null : (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          Le lien de définition de mot de passe n&apos;est engendré qu&apos;à la validation : il ne vaut qu&apos;une
          fois, et un aperçu se relit plusieurs fois.
        </p>
      )}
    </div>
  )
}

/**
 * Honest outcome. A workspace always exists once we get here — but "provisioned"
 * and "the client knows" are different facts, so an invitation that never left
 * is shown as a warning with its real error, not folded into a green tick.
 */
function ResultPanel({ result }: { result: ProvisionResult }) {
  const failed = result.invitations.filter(i => !i.created || !i.emailSent)

  return (
    <section
      className="card"
      style={{
        marginTop: 16,
        padding: 16,
        borderLeft: `3px solid ${result.fullyNotified ? 'var(--green)' : 'var(--red)'}`,
      }}
    >
      <strong>
        {result.fullyNotified
          ? `✓ Client créé : ${result.workspaceName}`
          : `⚠ Client créé (${result.workspaceName}) — mais tout le monde n'a pas été prévenu`}
      </strong>

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <span className="pill">plan · {result.plan}</span>
        <span className="pill">{result.accountsLimit} crédits/mois</span>
        <span className="pill">{result.enrichmentCredits} enrichissements</span>
        <span className="pill">{result.seatsTotal} sièges</span>
        <span className="pill">facturation manuelle</span>
        {/* L'engagement est une pastille comme les autres : il est ENREGISTRÉ,
            donc l'écran Facturation saura le signaler à son échéance. Absent,
            il s'écrit « sans engagement » — jamais « 0 mois ». */}
        <span className="pill">
          {result.terms.commitmentEnd
            ? `engagement ${result.terms.commitmentMonths} mois → ${jourSeul(result.terms.commitmentEnd)}`
            : 'sans engagement'}
        </span>
        {result.firstInvoice ? (
          <span className="pill">
            {result.firstInvoice.reference} · {result.firstInvoice.paid ? 'encaissée' : 'non encaissée'}
          </span>
        ) : null}
      </div>

      {/* Qui a fait ça, et quand — tel que l'API l'a JOURNALISÉ, jamais redérivé
          ici. Sans identité d'opérateur configurée, on l'écrit plutôt que de
          laisser croire à une trace nominative. */}
      <p style={{ marginTop: 10, marginBottom: 0, fontSize: 12, color: 'var(--muted)' }}>
        Journalisé le {jourEtHeureCourte(result.audit.at)} —{' '}
        {result.audit.actor
          ? `par ${result.audit.actor.email} (${result.audit.actor.role})`
          : 'opérateur non identifié'}
      </p>

      {result.terms.commitmentEnd ? (
        <p style={{ marginTop: 12, marginBottom: 0, color: 'var(--muted)' }}>
          À l&apos;échéance, l&apos;écran <strong>Facturation › Sur facture</strong> le signalera si rien n&apos;a été
          facturé après — <strong>aucun accès n&apos;est coupé automatiquement</strong>, la suspension reste une
          décision à prendre.
        </p>
      ) : null}
      {result.firstInvoice === null ? (
        <p style={{ marginTop: 12, marginBottom: 0, color: 'var(--muted)' }}>
          Aucune facture n&apos;a été enregistrée (pas de référence saisie) : la première période apparaîtra « facture
          manquante » tant qu&apos;on n&apos;en aura pas ajouté une.
        </p>
      ) : null}

      {result.ownerInvitation ? (
        <div style={{ marginTop: 14 }}>
          <div className="label" style={{ marginBottom: 6 }}>
            Étape 6 — l&apos;e-mail à envoyer au propriétaire
          </div>
          {result.ownerInvitation.error ? (
            <div className="error" style={{ marginBottom: 8 }}>
              Le lien de définition de mot de passe n&apos;a pas pu être engendré ({result.ownerInvitation.error}).
              L&apos;espace existe : émettez le lien depuis la fiche utilisateur.
            </div>
          ) : null}
          <EmailPreview email={result.ownerInvitation.email} />
          {result.ownerInvitation.expiresAt ? (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Le lien expire le {jourEtHeureCourte(result.ownerInvitation.expiresAt)}. Rien n&apos;a été envoyé :
              c&apos;est vous qui l&apos;envoyez.
            </p>
          ) : null}
        </div>
      ) : (
        <p style={{ marginTop: 12, marginBottom: 0, color: 'var(--muted)' }}>
          Compte existant réutilisé (<span className="mono">{result.owner.email}</span>) — aucun doublon créé, et aucun
          lien de mot de passe nécessaire.
        </p>
      )}

      {result.invitations.length > 0 ? (
        <table style={{ marginTop: 14 }}>
          <thead>
            <tr>
              <th>Collaborateur</th>
              <th>Rôle</th>
              <th>Invitation</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {result.invitations.map(inv => (
              <tr key={inv.email}>
                <td className="mono">{inv.email}</td>
                <td>{inv.role}</td>
                <td>
                  <span className={`badge ${inv.created ? 'completed' : 'error'}`}>
                    {inv.created ? 'créée' : 'échec'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${inv.emailSent ? 'completed' : 'error'}`}>
                    {inv.emailSent ? 'envoyé' : 'NON ENVOYÉ'}
                  </span>
                  {inv.error ? (
                    <div style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{inv.error}</div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {failed.length > 0 ? (
        <p style={{ marginTop: 12, marginBottom: 0, color: 'var(--red)' }}>
          {failed.length} collaborateur(s) n&apos;ont pas reçu leur invitation. Prévenez-les autrement, ou renvoyez
          l&apos;invitation depuis l&apos;écran Équipe de l&apos;application.
        </p>
      ) : null}
    </section>
  )
}

function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div className="label" style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>{children}</div>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200, flex: '1 1 200px' }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
      {hint ? <span style={{ fontSize: 11, color: 'var(--muted)' }}>{hint}</span> : null}
    </label>
  )
}
