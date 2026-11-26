import type { InvoiceReadiness } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaymentReminderDue } from './PaymentReminderDue'

/**
 * Les relances d'ENCAISSEMENT — item #87.
 *
 * Ce que ces tests gardent n'est pas le calcul (il est testé dans le contrat)
 * mais ce que l'écran PROMET : le ton, l'échéance, le fait que rien ne part
 * tout seul, et le refus de faire croire à une escalade adressée.
 */
function item(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: 'm1',
    missionLabel: 'Renfort plateforme',
    accountId: null,
    accountName: 'ACME',
    periodMonth: '2026-08-01',
    state: 'invoiced',
    blockers: [],
    days: 20,
    preparedAmountCents: 1_300_000,
    invoicedAt: '2026-09-01T09:00:00.000Z',
    invoiceReference: 'FA-2026-0142',
    invoicedAmountCents: 1_300_000,
    dueOn: '2026-09-30',
    remindersSent: 0,
    // ⚠️ Les trois champs du LITIGE, ajoutés au contrat par un lot parallèle le
    // 27/08. Une fixture qui les oublie ne compile plus — et c'est voulu : un
    // litige omis ferait passer un test sur un cas qui n'existe pas.
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    ...over,
  }
}

describe('PaymentReminderDue', () => {
  it('annonce le rang, le TON et l’échéance de la relance', () => {
    // ⚠️ Cadence de PAIEMENT depuis le 30/08/2026 : 7 jours au premier rang,
    // pas 5 — c'est celle du RELEVÉ, un autre destinataire.
    render(<PaymentReminderDue item={item()} now={new Date('2026-10-07T09:00:00Z')} />)
    expect(screen.getByText(/Relance n°1 due/)).toBeInTheDocument()
    expect(screen.getByText(/Ton neutre/)).toBeInTheDocument()
    expect(screen.getByText(/due depuis le/)).toBeInTheDocument()
    expect(screen.getByText(/7 jours de retard/)).toBeInTheDocument()
  })

  it('le ton MONTE avec le rang', () => {
    // 15 jours (rang 2) puis 30 (rang 3) — la cadence de PAIEMENT.
    const { rerender } = render(
      <PaymentReminderDue item={item({ remindersSent: 1 })} now={new Date('2026-10-15T09:00:00Z')} />,
    )
    expect(screen.getByText(/Ton ferme/)).toBeInTheDocument()

    rerender(<PaymentReminderDue item={item({ remindersSent: 2 })} now={new Date('2026-10-30T09:00:00Z')} />)
    expect(screen.getByText(/Escalade$/)).toBeInTheDocument()
  })

  it('la 3ᵉ relance NOMME ce qui lui manque au lieu de prétendre escalader', () => {
    // La source veut « + chargé d'affaires et sponsor ». Ni l'un ni l'autre
    // n'existe sur une ligne de facturation : le dire vaut mieux que laisser
    // croire que quelqu'un sera mis en copie tout seul.
    render(<PaymentReminderDue item={item({ remindersSent: 2 })} now={new Date('2026-10-30T09:00:00Z')} />)
    expect(screen.getByText(/ni chargé d’affaires ni sponsor/)).toBeInTheDocument()
  })

  it('ne promet AUCUN envoi — et jamais un « brouillon »', () => {
    render(<PaymentReminderDue item={item()} now={new Date('2026-10-07T09:00:00Z')} />)
    expect(screen.getByText(/Rien ne part tout seul/)).toBeInTheDocument()
    expect(screen.queryByText(/brouillon/i)).not.toBeInTheDocument()
  })

  it('une facture SANS échéance dit pourquoi aucune relance n’est programmée', () => {
    render(<PaymentReminderDue item={item({ dueOn: null })} now={new Date('2027-01-01T09:00:00Z')} />)
    expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
    expect(screen.queryByText(/Relance n°/)).not.toBeInTheDocument()
  })

  it('un mois en LITIGE ne montre aucune relance due — et DIT pourquoi', () => {
    // ⚠️ Le défaut que ce test attrape : `reminderDue` refuse déjà de relancer
    // une facture contestée (BEL-MIS-011), et cet écran appelait le calcul
    // SANS lui passer le litige. Les deux champs étaient facultatifs, donc
    // l'omission était silencieuse : la ligne affichait « Relance n°2 due ·
    // Ton ferme » sur une facture que l'utilisateur venait de déclarer
    // contestée — pendant que le toast lui promettait « Les relances
    // s'arrêtent sur ce mois ». C'est exactement le litige qui se lit comme un
    // simple retard, sur le seul chemin qu'un humain regarde.
    render(
      <PaymentReminderDue
        item={item({
          remindersSent: 1,
          disputedAt: '2026-10-08T09:00:00.000Z',
          disputeReason: 'Trois jours contestés',
        })}
        now={new Date('2026-10-12T09:00:00Z')}
      />,
    )
    expect(screen.queryByText(/Relance n°/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ton ferme/)).not.toBeInTheDocument()
    // Le silence ne suffit pas : disparaître se lit « il n'y a rien à faire ».
    // Ce qui SORT de la cadence se nomme à côté de la cadence.
    expect(screen.getByText(/Relances suspendues/)).toBeInTheDocument()
  })

  it('la cadence REPREND quand le litige est levé', () => {
    // Sans cette moitié, un litige déclaré ferait taire le mois pour toujours.
    // Rang 2 de la cadence de PAIEMENT : 15 jours, pas 12.
    render(
      <PaymentReminderDue
        item={item({
          remindersSent: 1,
          disputedAt: '2026-10-08T09:00:00.000Z',
          disputeReason: 'Trois jours contestés',
          disputeResolvedAt: '2026-10-10T09:00:00.000Z',
        })}
        now={new Date('2026-10-15T09:00:00Z')}
      />,
    )
    expect(screen.getByText(/Relance n°2 due/)).toBeInTheDocument()
    expect(screen.queryByText(/Relances suspendues/)).not.toBeInTheDocument()
  })

  it('un litige PRIME sur l’échéance manquante — saisir une date ne relancerait rien', () => {
    // Les deux phrases sont vraies, une seule est ACTIONNABLE : tant que le
    // litige court, renseigner l'échéance ne démarrerait aucune cadence.
    // Envoyer l'utilisateur saisir une date qui ne changerait rien est un
    // chemin sans effet, et c'est pire qu'un silence.
    render(
      <PaymentReminderDue
        item={item({ dueOn: null, disputedAt: '2026-10-08T09:00:00.000Z', disputeReason: 'Prestation contestée' })}
        now={new Date('2027-01-01T09:00:00Z')}
      />,
    )
    expect(screen.getByText(/Relances suspendues/)).toBeInTheDocument()
    expect(screen.queryByText(/Saisis l’échéance/)).not.toBeInTheDocument()
  })

  it('ne relance ni avant l’échéance, ni un client qui a payé, ni un mois non facturé', () => {
    const { rerender, container } = render(<PaymentReminderDue item={item()} now={new Date('2026-09-30T09:00:00Z')} />)
    expect(container).toBeEmptyDOMElement()

    rerender(
      <PaymentReminderDue item={item({ paidAt: '2026-10-02T09:00:00.000Z' })} now={new Date('2026-12-01T09:00:00Z')} />,
    )
    expect(container).toBeEmptyDOMElement()

    rerender(
      <PaymentReminderDue
        item={item({ state: 'blocked', invoicedAt: null, blockers: ['missing_timesheet'] })}
        now={new Date('2026-12-01T09:00:00Z')}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
