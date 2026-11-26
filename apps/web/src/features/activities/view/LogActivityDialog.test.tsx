import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LogActivityDialog } from './LogActivityDialog'

function renderDialog(onSubmit = vi.fn()) {
  render(<LogActivityDialog open onOpenChange={() => {}} onSubmit={onSubmit} isPending={false} />)
  return { onSubmit }
}

describe('LogActivityDialog — l’issue d’un appel', () => {
  it('propose le sélecteur d’issue quand la nature « Appel » est déjà sélectionnée par défaut', () => {
    renderDialog()
    expect(screen.getByText("Issue de l'appel")).toBeInTheDocument()
  })

  it('cache le sélecteur d’issue pour toute autre nature', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Rendez-vous' }))
    expect(screen.queryByText("Issue de l'appel")).not.toBeInTheDocument()
  })

  it('inclut l’issue choisie dans la saisie envoyée, seulement sur un appel', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    // #2377.9 — « Messagerie » n'est pas un des 6 boutons rapides : il faut
    // d'abord ouvrir la liste complète.
    await user.click(screen.getByRole('button', { name: 'Toutes les issues' }))
    await user.click(screen.getByRole('button', { name: 'Messagerie' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'call', outcome: 'voicemail' }))
  })

  it('n’envoie AUCUNE issue quand rien n’a été choisi — « non renseignée » plutôt qu’un défaut', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'call', outcome: undefined }))
  })

  it('efface l’issue choisie en changeant de nature, pour ne pas la faire resurgir sans l’avoir revalidée', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Toutes les issues' }))
    await user.click(screen.getByRole('button', { name: 'Messagerie' }))
    await user.click(screen.getByRole('button', { name: 'E-mail' }))
    await user.click(screen.getByRole('button', { name: 'Appel' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'call', outcome: undefined }))
  })
})

describe('LogActivityDialog — #2377.9 réponse rapide, puis un détail', () => {
  it('propose 6 boutons de réponse rapide, avant toute liste complète', () => {
    renderDialog()
    for (const label of [
      'Pas de réponse',
      'Mauvais interlocuteur',
      'Rappel programmé',
      'Intérêt exprimé',
      'Besoin détecté',
      'Refus',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // La liste complète (« Messagerie », etc.) reste fermée par défaut.
    expect(screen.queryByRole('button', { name: 'Messagerie' })).not.toBeInTheDocument()
  })

  it('cache le détail tant qu’aucune issue n’a été choisie, sur un appel', () => {
    renderDialog()
    expect(screen.queryByLabelText('Objet')).not.toBeInTheDocument()
  })

  it('ouvre le détail dès qu’un bouton rapide est cliqué', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    expect(screen.getByLabelText('Objet')).toBeInTheDocument()
  })

  it('sur une autre nature que « Appel », le détail reste visible sans rien avoir à choisir', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Rendez-vous' }))
    expect(screen.getByLabelText('Objet')).toBeInTheDocument()
  })
})

describe('LogActivityDialog — #2377.2 note libre, dictée ou transcript', () => {
  it('propose les trois modes de saisie une fois le détail ouvert', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Pas de réponse' }))
    expect(screen.getByRole('button', { name: 'Note libre' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dictée' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transcript' })).toBeInTheDocument()
  })

  it('le mode Transcript accepte un texte long collé, tel quel — jamais tronqué à la saisie', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Pas de réponse' }))
    await user.click(screen.getByRole('button', { name: 'Transcript' }))
    // #2742 — un texte COLLÉ (Ctrl+V), pas tapé caractère par caractère :
    // `user.paste` colle en un seul geste, comme un vrai copier-coller, et
    // évite les 1050 frappes simulées d'un `user.type` qui rendaient ce test
    // lent et sensible à la contention CI sans rien vérifier de plus.
    const long = 'Le client a dit ceci.'.repeat(50)
    await user.click(screen.getByLabelText("Ce qui s'est dit"))
    await user.paste(long)
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ body: long }))
  })
})

describe('LogActivityDialog — #2377.4 debrief structuré, en champs séparés', () => {
  it('propose quatre champs distincts — fait, besoin, objection, engagement', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    expect(screen.getByLabelText('Fait marquant')).toBeInTheDocument()
    expect(screen.getByLabelText('Besoin')).toBeInTheDocument()
    expect(screen.getByLabelText('Objection')).toBeInTheDocument()
    expect(screen.getByLabelText('Engagement pris')).toBeInTheDocument()
  })

  it('envoie les champs remplis séparément, jamais fondus dans le corps', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    await user.type(screen.getByLabelText('Fait marquant'), 'Marie ne porte pas le sujet')
    await user.type(screen.getByLabelText('Besoin'), 'Reprise en janvier')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        callDebrief: { fact: 'Marie ne porte pas le sujet', need: 'Reprise en janvier' },
      }),
    )
  })

  it('sans aucun champ debrief rempli, n’envoie PAS de debrief', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ callDebrief: undefined }))
  })
})

describe('LogActivityDialog — #2377.1/.5 aperçu avant écriture', () => {
  it('récapitule ce qui a été saisi, avant l’enregistrement', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    await user.type(screen.getByLabelText('Fait marquant'), 'Marie ne porte pas le sujet')
    expect(screen.getByText('Voici ce que je retiens')).toBeInTheDocument()
    expect(screen.getByText(/Marie ne porte pas le sujet/)).toBeInTheDocument()
  })

  it('rien à récapituler tant que le détail est fermé', () => {
    renderDialog()
    expect(screen.queryByText('Voici ce que je retiens')).not.toBeInTheDocument()
  })
})

describe('LogActivityDialog — #2377.6 prochaine action : owner, date et condition ou rien', () => {
  async function openNextAction(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    await user.click(screen.getByRole('button', { name: 'Ajouter une prochaine action' }))
  }

  it('ouvre owner, date et condition au clic', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await openNextAction(user)
    expect(screen.getByLabelText('Qui')).toBeInTheDocument()
    expect(screen.getByLabelText('Quand')).toBeInTheDocument()
    expect(screen.getByLabelText('Condition')).toBeInTheDocument()
  })

  it('REFUSE d’enregistrer tant que owner, date ou condition manque — « Rappeler » seul est insuffisant', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await openNextAction(user)
    await user.type(screen.getByLabelText('Qui'), 'Camille')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText('Owner, date et condition sont nécessaires pour créer une prochaine action.'),
    ).toBeInTheDocument()
  })

  it('envoie la prochaine action complète', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await openNextAction(user)
    await user.type(screen.getByLabelText('Qui'), 'Camille')
    await user.type(screen.getByLabelText('Quand'), '2026-01-08')
    await user.type(screen.getByLabelText('Condition'), 'si Marie ne rappelle pas')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        nextAction: { owner: 'Camille', dueDate: '2026-01-08', condition: 'si Marie ne rappelle pas' },
      }),
    )
  })
})

// #2984 — la case est DÉCLARATIVE : jamais bloquante, contrairement à
// `recordingConsent` sur la transcription audio (#2319.57).
describe('LogActivityDialog — #2984 consentement à l’enregistrement, déclaratif', () => {
  it('propose la case seulement sur un appel, une fois le détail ouvert', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    expect(screen.getByLabelText('Le contact a été informé que cet échange est noté')).toBeInTheDocument()
  })

  it('envoie recordingConsent à true quand la case est cochée', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    await user.click(screen.getByLabelText('Le contact a été informé que cet échange est noté'))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recordingConsent: true }))
  })

  it('n’empêche PAS l’enregistrement quand la case reste décochée — déclaratif, jamais un blocage', async () => {
    const user = userEvent.setup({ delay: null })
    const { onSubmit } = renderDialog()
    await user.click(screen.getByRole('button', { name: 'Intérêt exprimé' }))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ recordingConsent: false }))
  })
})

// #3697 (recette prod 08/10) — « Consigner le résultat » depuis le support
// montrait Nature=Appel ET Sens=Envoyé (outbound) déjà sélectionnés, alors que
// personne n'avait cliqué. Nature reste « Appel » par défaut (seule valeur
// plausible dans ce formulaire d'appel) ; le SENS, lui, n'a AUCUNE valeur
// unique possible (entrant/sortant/interne sont trois réalités distinctes) et
// ne doit donc plus rien présélectionner — exactement ce que le docblock du
// composant promettait déjà (« le sens est demandé explicitement »).
describe('LogActivityDialog — #3697 aucun Sens présélectionné', () => {
  it('aucun bouton « Envoyé / Reçu / Interne » n’est marqué sélectionné avant un clic', () => {
    renderDialog()
    for (const label of ['Envoyé', 'Reçu', 'Interne']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('cliquer un sens le marque sélectionné, et lui seul', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    await user.click(screen.getByRole('button', { name: 'Reçu' }))
    expect(screen.getByRole('button', { name: 'Reçu' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Envoyé' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Interne' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('la nature « Appel », elle, reste présélectionnée — seule valeur plausible ici', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Appel' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('LogActivityDialog — saisie non enregistrée protégée (#3688.9)', () => {
  function renderClosable() {
    const onOpenChange = vi.fn()
    render(<LogActivityDialog open onOpenChange={onOpenChange} onSubmit={vi.fn()} isPending={false} />)
    return { onOpenChange }
  }

  it('sans saisie, « Annuler » ferme tout de suite', async () => {
    const user = userEvent.setup({ delay: null })
    const { onOpenChange } = renderClosable()
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('avec une saisie, « Annuler » DEMANDE avant de jeter — et « Continuer la saisie » la garde', async () => {
    const user = userEvent.setup({ delay: null })
    const { onOpenChange } = renderClosable()
    await user.click(screen.getByRole('button', { name: 'Rendez-vous' }))
    await user.type(screen.getByLabelText('Objet'), 'Budget validé')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText('Abandonner cette saisie ?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continuer la saisie' }))
    expect(screen.queryByText('Abandonner cette saisie ?')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Objet')).toHaveValue('Budget validé')
  })

  it('« Abandonner » ferme, après confirmation seulement', async () => {
    const user = userEvent.setup({ delay: null })
    const { onOpenChange } = renderClosable()
    await user.click(screen.getByRole('button', { name: 'Rendez-vous' }))
    await user.type(screen.getByLabelText('Objet'), 'Budget validé')
    await user.click(screen.getByRole('button', { name: 'Annuler' }))
    await user.click(screen.getByRole('button', { name: 'Abandonner' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
