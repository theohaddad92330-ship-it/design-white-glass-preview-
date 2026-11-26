import { OUTREACH_PERSONA_PROFILES } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PreSendChecklist } from './PreSendChecklist'

/**
 * Le contrôle avant envoi, vu depuis l'écran.
 *
 * Ce que ces tests gardent n'est pas le calcul (il est testé au contrat) mais
 * le CÂBLAGE : le contrôle tournait déjà, aveugle — `step: 1` en dur, aucun
 * persona, aucune date. Un contrôle juste qu'on nourrit mal rend un verdict
 * faux avec l'aplomb d'un verdict vérifié.
 */

/** Un corps qui échoue sur un point — la liste s'ouvre alors toute seule, ce qui
 *  est exactement la condition dans laquelle un commercial la lit. */
const FAILING_BODY = 'Bonjour, notre méthodologie éprouvée pourrait vous intéresser. Un avis ?'

describe('PreSendChecklist — le persona vient du palier hiérarchique', () => {
  it('un palier de décideur affiche le levier attendu, pas le nom du persona', () => {
    render(<PreSendChecklist body={FAILING_BODY} hierarchyLevel="c_level" />)

    expect(screen.getByText(new RegExp(OUTREACH_PERSONA_PROFILES.decideur.lever, 'i'))).toBeInTheDocument()
  })

  it('un palier de management donne le levier du manager — pas celui d’à côté', () => {
    render(<PreSendChecklist body={FAILING_BODY} hierarchyLevel="management" />)

    expect(screen.getByText(new RegExp(OUTREACH_PERSONA_PROFILES.manager.lever, 'i'))).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(OUTREACH_PERSONA_PROFILES.decideur.lever, 'i'))).not.toBeInTheDocument()
  })

  it('un palier inconnu n’invente AUCUN persona — il dit qu’il ne sait pas', () => {
    render(<PreSendChecklist body={FAILING_BODY} hierarchyLevel="unknown" />)

    expect(screen.getByText(/n’est pas établi/)).toBeInTheDocument()
    for (const profile of Object.values(OUTREACH_PERSONA_PROFILES)) {
      expect(screen.queryByText(new RegExp(profile.lever, 'i'))).not.toBeInTheDocument()
    }
  })

  it('sans palier fourni, il ne se rabat pas sur « opérationnel »', () => {
    render(<PreSendChecklist body={FAILING_BODY} />)

    expect(screen.getByText(/n’est pas établi/)).toBeInTheDocument()
  })
})

describe('PreSendChecklist — l’étape est celle du message, plus 1 en dur', () => {
  it('au premier message, la règle « ne pas se présenter » s’applique', () => {
    render(<PreSendChecklist body="Bonjour, je suis chez Acme Conseil." sellerCompany="Acme Conseil" step={1} />)

    expect(screen.getByText(/« Acme Conseil » apparaît dans le premier message/)).toBeInTheDocument()
  })

  it('à la relance, elle ne s’applique plus — le contrôle cesse de crier au loup', () => {
    render(<PreSendChecklist body="Bonjour, je suis chez Acme Conseil." sellerCompany="Acme Conseil" step={2} />)

    expect(screen.queryByText(/apparaît dans le premier message/)).not.toBeInTheDocument()
    expect(screen.getByText(/Ne s’applique qu’au premier message/)).toBeInTheDocument()
  })
})

describe('PreSendChecklist — le délai depuis le message précédent', () => {
  it('quand la date est connue, elle est dite en jours', () => {
    render(<PreSendChecklist body={FAILING_BODY} step={2} daysSincePrevious={4} />)

    expect(screen.getByText(/4 jours depuis le message précédent/)).toBeInTheDocument()
  })

  it('sans message précédent, il n’affiche JAMAIS « 0 jour »', () => {
    render(<PreSendChecklist body={FAILING_BODY} step={2} daysSincePrevious={null} />)

    expect(screen.getByText(/date du message précédent n’est pas connue/)).toBeInTheDocument()
    expect(screen.queryByText(/0 jour/)).not.toBeInTheDocument()
  })
})

describe('PreSendChecklist — #2123.74 le premier message nomme un contexte réel', () => {
  it('les éléments réels du brouillon arrivent au contrôle : absents du texte ⇒ il le dit', () => {
    render(
      <PreSendChecklist
        body="Bonjour Marie, comment gérez-vous vos projets en ce moment ?"
        realContext={['migration Kubernetes']}
      />,
    )

    expect(screen.getByText(/Aucun élément réel du dossier n’est cité/)).toBeInTheDocument()
    expect(screen.getByText(/migration Kubernetes/)).toBeInTheDocument()
  })

  it('sans élément réel fourni, il ne conclut rien', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    render(
      <PreSendChecklist body="Bonjour Marie, vu votre migration annoncée en juin. Comment gérez-vous la montée en charge ?" />,
    )

    await u.click(screen.getByRole('button'))
    expect(screen.getByText(/Aucun élément réel du dossier n’est connu ici/)).toBeInTheDocument()
  })
})

describe('PreSendChecklist — les erreurs qui tuent, avant l’envoi', () => {
  it('un gabarit parti tel quel nomme l’erreur, pas seulement le symptôme', async () => {
    render(<PreSendChecklist body="Bonjour {{Prénom}}, un avis ?" />)

    // Le symptôme…
    expect(screen.getByText(/\{\{Prénom\}\}/)).toBeInTheDocument()
    // …et l'erreur dont il est une occurrence, en toutes lettres.
    expect(screen.getByText(/Envoyer le même message à tout le monde/)).toBeInTheDocument()
  })

  it('le rendez-vous au premier message est nommé comme l’erreur qu’il est', () => {
    render(<PreSendChecklist body="Bonjour, auriez-vous quinze minutes cette semaine ?" />)

    expect(screen.getByText(/Demander un rendez-vous dès le premier message/)).toBeInTheDocument()
  })

  it('un message propre n’accuse personne — et la liste reste repliée', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 })
    render(
      <PreSendChecklist
        body="Bonjour Marie, vu votre migration annoncée en juin. Comment gérez-vous la montée en charge ?"
        hierarchyLevel="c_level"
      />,
    )

    expect(screen.getByText(/rien à signaler/i)).toBeInTheDocument()
    expect(screen.queryByText(/Envoyer le même message/)).not.toBeInTheDocument()

    // Dépliée à la demande, elle montre ses huit points — dont les non
    // vérifiables — et toujours aucune erreur.
    await u.click(screen.getByRole('button'))
    expect(screen.getByText(new RegExp(OUTREACH_PERSONA_PROFILES.decideur.lever, 'i'))).toBeInTheDocument()
    expect(screen.queryByText(/Erreur qui tue/)).not.toBeInTheDocument()
  })
})
