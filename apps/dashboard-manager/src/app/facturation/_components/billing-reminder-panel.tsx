'use client'

import { useCallback, useEffect, useState } from 'react'
import type { BillingReminderView, LoggedReminder, ReminderTone } from '@/lib/billing-calendar'
import { jourSeul } from '@/lib/dates'
import { EmailEnClair } from '@/app/_components/email-en-clair'

/**
 * LA RELANCE D'UNE PÉRIODE EN RETARD — #1655.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE PANNEAU NE SAIT PAS ENVOYER, ET CE N'EST PAS UNE CONVENTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'y a ici ni bouton « Envoyer », ni `mailto:`, ni chemin vers un
 * fournisseur de messagerie. Le seul geste de sortie est « Copier » : le texte
 * part dans le presse-papiers, l'opérateur l'envoie depuis SA messagerie, puis
 * revient dire qu'il l'a fait. « On prépare, l'humain envoie » est la doctrine
 * du dépôt, et elle se tient ici de la même façon qu'ailleurs — par l'absence de
 * code, mesurée par `manual-billing-reminder-no-send.spec.ts`.
 *
 * ⚠️ Pas de `mailto:` non plus, et pour DEUX raisons. La première est
 * ci-dessus. La seconde est que l'adresse voyagerait dans le `href` : masquer le
 * libellé pendant que le lien porte l'adresse en clair ne masque rien — c'est
 * l'arbitrage déjà posé dans #1670 sur `analysis/[id]`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL DIT QUAND IL N'Y A RIEN À PRÉPARER
 * ─────────────────────────────────────────────────────────────────────────────
 * Il le DIT. Un panneau qui disparaît se lit « il n'y a rien à faire », alors
 * que la cadence a été SUSPENDUE par un litige, ou qu'il manque une donnée que
 * l'opérateur saisit en dix secondes. C'est exactement la leçon payée le
 * 28/08/2026 côté produit client : l'écran annonçait « Relance n°2 due · Ton
 * ferme » sur une facture contestée, et le seul endroit qu'un humain regarde ne
 * savait pas.
 */

const TONS: ReadonlyArray<{ valeur: ReminderTone; libelle: string; aide: string }> = [
  { valeur: 'neutral', libelle: 'Courtois', aide: 'Rappel : la référence, le montant, l’échéance.' },
  { valeur: 'firm', libelle: 'Ferme', aide: 'Récapitulatif chiffré et demande d’une date de règlement.' },
  { valeur: 'escalate', libelle: 'Escalade', aide: 'Mention des pénalités légales, citées des CGV.' },
]

const TON_LIBELLE: Readonly<Record<ReminderTone, string>> = {
  neutral: 'courtois',
  firm: 'ferme',
  escalate: 'escalade',
}

/**
 * Ce que chaque refus veut dire, en une phrase que l'opérateur peut ACTIONNER.
 *
 * `incomplete` n'est pas ici : sa phrase NOMME les champs manquants, qui
 * viennent de l'API — la composer ici en dupliquerait la liste.
 */
const REFUS: Readonly<Record<string, string>> = {
  no_invoice:
    'Aucune facture n’est enregistrée pour cette période. On ne réclame pas le paiement d’un document qui n’existe pas : enregistrez d’abord la facture émise dans la comptabilité, depuis l’onglet « Sur facture ».',
  already_paid: 'Cette facture est encaissée. On ne relance pas un client qui a payé.',
  dispute_open:
    'Un litige est OUVERT sur cette facture : la cadence de relance est suspendue tant qu’il court. Le client sait qu’il n’a pas payé — il conteste. Relancer maintenant ne ferait que durcir la discussion.',
  cadence_exhausted:
    'Trois relances ont déjà été consignées. Au-delà, ce n’est plus une cadence : le sujet remonte à un humain.',
  not_overdue_yet: 'Aucune relance n’est due : l’échéance de règlement n’est pas dépassée d’assez de jours.',
}

export function BillingReminderPanel({ workspaceId, periodStart }: { workspaceId: string; periodStart: string }) {
  const [tonForce, setTonForce] = useState<ReminderTone | null>(null)
  const [vue, setVue] = useState<BillingReminderView | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [chargement, setChargement] = useState(true)
  const [occupe, setOccupe] = useState(false)
  const [copie, setCopie] = useState(false)
  const [motif, setMotif] = useState('')
  const [formulaireLitige, setFormulaireLitige] = useState(false)

  const charger = useCallback(async () => {
    setChargement(true)
    setErreur(null)
    try {
      const params = new URLSearchParams({ workspaceId, periodStart })
      if (tonForce) params.set('tone', tonForce)
      const res = await fetch(`/api/admin/clients/manual-reminder?${params.toString()}`, { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as BillingReminderView & { error?: string; message?: string }
      if (!res.ok) {
        // Le message de l'API nomme le vrai blocage — le recopier vaut mieux
        // qu'un « échec » qui n'apprend rien.
        setErreur(data.message ?? data.error ?? `Échec (HTTP ${res.status}).`)
        setVue(null)
        return
      }
      setVue(data)
    } catch (err) {
      setErreur(`Requête impossible. ${err instanceof Error ? err.message : String(err)}`)
      setVue(null)
    } finally {
      setChargement(false)
    }
  }, [workspaceId, periodStart, tonForce])

  useEffect(() => {
    void charger()
  }, [charger])

  async function appeler(chemin: string, methode: 'POST' | 'PATCH', corps: unknown) {
    setOccupe(true)
    setErreur(null)
    try {
      const res = await fetch(chemin, {
        method: methode,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corps),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      if (!res.ok) {
        setErreur(data.message ?? data.error ?? `Échec (HTTP ${res.status}).`)
        return
      }
      await charger()
    } catch (err) {
      setErreur(`Requête impossible. ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setOccupe(false)
    }
  }

  if (chargement && !vue) {
    return (
      <p role="status" style={{ color: 'var(--muted)', fontSize: 13, marginTop: 16 }}>
        Préparation de la relance…
      </p>
    )
  }

  const relance = vue?.reminder ?? null

  return (
    <section style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>Relance</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>
        Le message est <strong>préparé</strong>, jamais envoyé d’ici : copiez-le, envoyez-le depuis votre messagerie,
        puis consignez-le pour que la cadence avance et que la trace existe.
      </p>

      {erreur ? <div className="error">{erreur}</div> : null}

      {relance && relance.prepared ? (
        <>
          <ChoixDuTon
            actif={relance.tone}
            suggere={relance.toneSuggested}
            force={relance.toneOverridden}
            occupe={occupe || chargement}
            onChoisir={setTonForce}
          />

          <div className="kv" style={{ marginTop: 12 }}>
            <span className="k">Rang</span>
            <span>
              Relance n°{relance.index} · ton {TON_LIBELLE[relance.tone]}
            </span>

            <span className="k">Destinataire</span>
            <span>
              <EmailEnClair email={relance.recipientEmail} sansLien />
            </span>

            <span className="k">Échéance</span>
            <span>
              le {jourSeul(relance.dueOn)} · {relance.overdueDays} jours de retard
            </span>

            <span className="k">Due depuis</span>
            <span>le {jourSeul(relance.dueSince)}</span>

            <span className="k">Objet</span>
            <span>{relance.subject}</span>
          </div>

          {/* Ce qui déborde défile dans SON conteneur, jamais le corps de la
              page : un message long ne pousse pas la grille du calendrier. */}
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 13,
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              overflowX: 'auto',
              maxWidth: '100%',
              maxHeight: 320,
              overflowY: 'auto',
            }}
          >
            {relance.body}
          </pre>

          {relance.legalNotice ? (
            <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
              La mention des pénalités est <strong>citée</strong> des conditions générales de vente de BellumAI
              (articles L. 441-10 et D. 441-5 du Code de commerce). Aucun montant de pénalité n’est calculé : le taux
              légal change deux fois par an et n’est écrit nulle part dans le produit.
            </p>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="btn-sm"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(`${relance.subject}\n\n${relance.body}`)
                  .then(() => setCopie(true))
                  .catch(() => setErreur('Le presse-papiers a refusé la copie — sélectionnez le texte ci-dessus.'))
              }}
            >
              Copier le message
            </button>
            <button
              type="button"
              className="btn-sm"
              disabled={occupe}
              onClick={() =>
                void appeler(
                  `/api/admin/clients/manual-invoices/${encodeURIComponent(relance.invoiceId)}/reminder`,
                  'POST',
                  { tone: relance.tone },
                )
              }
            >
              J’ai envoyé cette relance
            </button>
            <button type="button" className="btn-sm" onClick={() => setFormulaireLitige(v => !v)}>
              Déclarer un litige
            </button>
          </div>

          {copie ? (
            <p role="status" style={{ color: 'var(--green)', fontSize: 13, marginTop: 8 }}>
              Copié. Rien n’est parti : l’envoi se fait depuis votre messagerie.
            </p>
          ) : null}

          {formulaireLitige ? (
            <FormulaireLitige
              motif={motif}
              onMotif={setMotif}
              occupe={occupe}
              onDeclarer={() =>
                void appeler(
                  `/api/admin/clients/manual-invoices/${encodeURIComponent(relance.invoiceId)}/dispute`,
                  'PATCH',
                  { reason: motif },
                )
              }
            />
          ) : null}

          <Historique entrees={relance.history} />
        </>
      ) : null}

      {relance && !relance.prepared ? (
        <Refus
          relance={relance}
          occupe={occupe}
          onLever={
            relance.reason === 'dispute_open' && relance.invoiceId
              ? () =>
                  void appeler(
                    `/api/admin/clients/manual-invoices/${encodeURIComponent(relance.invoiceId as string)}/dispute`,
                    'PATCH',
                    { resolve: true },
                  )
              : null
          }
        />
      ) : null}
    </section>
  )
}

function ChoixDuTon({
  actif,
  suggere,
  force,
  occupe,
  onChoisir,
}: {
  actif: ReminderTone
  suggere: ReminderTone
  force: boolean
  occupe: boolean
  onChoisir: (ton: ReminderTone | null) => void
}) {
  return (
    <div>
      {/* Des BOUTONS, pas un menu : trois valeurs se montrent. Ce qui se clique
          se tabule et s'annonce. */}
      <div role="group" aria-label="Ton de la relance" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {TONS.map(ton => (
          <button
            key={ton.valeur}
            type="button"
            className="btn-sm"
            disabled={occupe}
            aria-pressed={actif === ton.valeur}
            title={ton.aide}
            style={
              actif === ton.valeur ? { borderColor: 'var(--accent)', color: 'var(--text)' } : { color: 'var(--muted)' }
            }
            onClick={() => onChoisir(ton.valeur)}
          >
            {ton.libelle}
          </button>
        ))}
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 12, margin: '6px 0 0' }}>
        {force ? (
          <>
            Ton forcé. La cadence proposait <strong>{TON_LIBELLE[suggere]}</strong> à ce rang.{' '}
            <button
              type="button"
              className="link"
              style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
              onClick={() => onChoisir(null)}
            >
              revenir au ton de la cadence
            </button>
          </>
        ) : (
          <>Ton proposé par la cadence à ce rang. Vous pouvez en choisir un autre.</>
        )}
      </p>
    </div>
  )
}

function FormulaireLitige({
  motif,
  onMotif,
  occupe,
  onDeclarer,
}: {
  motif: string
  onMotif: (valeur: string) => void
  occupe: boolean
  onDeclarer: () => void
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <label htmlFor="motif-litige" style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
        Ce que le client reproche — dans ses mots, jamais une catégorie
      </label>
      <textarea
        id="motif-litige"
        className="report-input"
        rows={3}
        maxLength={500}
        value={motif}
        onChange={event => onMotif(event.target.value)}
        style={{ width: '100%', maxWidth: '70ch' }}
      />
      <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 8px' }}>
        Déclarer un litige SUSPEND les relances sur cette facture. La ligne reste, la période reste due : un litige
        n’est pas un paiement.
      </p>
      <button type="button" className="btn-sm" disabled={occupe || motif.trim().length === 0} onClick={onDeclarer}>
        Déclarer le litige
      </button>
    </div>
  )
}

function Refus({
  relance,
  occupe,
  onLever,
}: {
  relance: Extract<BillingReminderView['reminder'], { prepared: false }>
  occupe: boolean
  onLever: (() => void) | null
}) {
  const phrase =
    relance.reason === 'incomplete'
      ? `La relance ne se prépare pas avec un blanc. Il manque : ${relance.missing.join(', ')}.`
      : REFUS[relance.reason]

  return (
    <div style={{ marginTop: 4 }}>
      <p role="status" style={{ fontSize: 13, margin: 0 }}>
        {phrase}
      </p>
      {relance.disputeReason ? (
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 0' }}>
          Motif consigné : « {relance.disputeReason} »
        </p>
      ) : null}
      {relance.dueOn ? (
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: '6px 0 0' }}>
          Échéance de règlement : le {jourSeul(relance.dueOn)}.
        </p>
      ) : null}
      {onLever ? (
        <button type="button" className="btn-sm" disabled={occupe} style={{ marginTop: 8 }} onClick={onLever}>
          Lever le litige
        </button>
      ) : null}
    </div>
  )
}

/**
 * Les relances CONSIGNÉES — règle 4 de #1655, « chaque relance est journalisée
 * avec sa date et son auteur ».
 *
 * Aucune relance consignée ne s'affiche pas « 0 » : la phrase le dit, parce que
 * « personne n'a encore relancé » et « on ne sait pas » ne sont pas la même
 * chose, et seule la première est vraie ici.
 */
function Historique({ entrees }: { entrees: LoggedReminder[] }) {
  if (entrees.length === 0) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 12 }}>Aucune relance consignée sur cette facture.</p>
    )
  }
  return (
    <div style={{ marginTop: 12 }}>
      <div className="label">Relances consignées</div>
      <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, fontSize: 13 }}>
        {entrees.map(entree => (
          <li key={`${entree.index}-${entree.at}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span>
              n°{entree.index} · le {jourSeul(entree.at.slice(0, 10))} · ton {TON_LIBELLE[entree.tone]} · par
            </span>
            <EmailEnClair email={entree.by} />
          </li>
        ))}
      </ul>
    </div>
  )
}
