import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, vi } from 'vitest'
import { chatArtifactId, chatStructuredSectionId } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply, parseStructuredReply } from './StructuredReply'

const success = vi.fn()
const error = vi.fn()
vi.mock('sonner', () => ({
  toast: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => error(...a) },
}))

const VERDICT_BLOCK = {
  type: 'verdict',
  conclusion: 'Commence par le compte Alpha cette semaine.',
  reasons: ["Un appel d'offres est ouvert jusqu'au 30 septembre."],
}
const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

const writeText = vi.fn()
/** ⚠️ `userEvent.setup()` installe SON presse-papiers factice : le nôtre se pose APRÈS. */
function setupWithClipboard() {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return user
}

/**
 * La réponse du copilote arrive en markdown. Quand elle est organisée en sections
 * connues (« Objectif / Angle d'accroche / Cas d'usage »), on l'encadre en blocs
 * distincts (maquette p.15). Sinon, rendu markdown normal — AUCUNE régression, et
 * jamais une section inventée.
 */

describe('parseStructuredReply', () => {
  it('reconnaît les sections Objectif / Angle d’accroche / Cas d’usage (titres gras)', () => {
    const text = [
      'Voici ma recommandation.',
      '',
      '**Objectif :** Décrocher un premier rendez-vous avec le DSI.',
      "**Angle d'accroche :** Leur migration cloud récente.",
      "**Cas d'usage :** Sécuriser la nouvelle infra.",
    ].join('\n')
    const parsed = parseStructuredReply(text)
    expect(parsed).not.toBeNull()
    expect(parsed?.preamble).toBe('Voici ma recommandation.')
    expect(parsed?.sections.map(s => s.title)).toEqual(['Objectif :', "Angle d'accroche :", "Cas d'usage :"])
    // Le contenu inline après le titre gras devient le corps de la section.
    expect(parsed?.sections[0].body).toContain('Décrocher un premier rendez-vous')
  })

  it('reconnaît les titres ATX (## Objectif) et rattache les lignes suivantes', () => {
    const text = ['## Objectif', 'Convertir le compte.', '- point 1', '', '## Cas d’usage', 'Migration ERP.'].join('\n')
    const parsed = parseStructuredReply(text)
    expect(parsed).not.toBeNull()
    expect(parsed?.sections).toHaveLength(2)
    expect(parsed?.sections[0].title).toBe('Objectif')
    expect(parsed?.sections[0].body).toContain('- point 1')
    expect(parsed?.sections[1].title).toBe('Cas d’usage')
  })

  it('reconnaît les intitulés anglais (Objective / Approach angle / Use case)', () => {
    const text = [
      '**Objective:** Win the DSI.',
      '**Approach angle:** Recent cloud move.',
      '**Use case:** Secure infra.',
    ].join('\n')
    const parsed = parseStructuredReply(text)
    expect(parsed?.sections.map(s => s.key)).toEqual(['objective', 'angle', 'usecase'])
  })

  /**
   * #1924.1 — LA STRUCTURE D'UN CONSEIL (décision Louis, 16/09/2026).
   *
   * Le prompt impose désormais « Verdict / Pourquoi / Ce qui manque / Prochaine
   * action » à toute réponse de CONSEIL. Sans ces quatre intitulés dans
   * `RECOGNIZED_TITLES`, `parseStructuredReply` rendrait `null` et le conseil
   * ressortirait en markdown à plat : la décision serait prise côté prompt et
   * annulée côté écran, sans qu'aucun test ne rougisse.
   */
  it('reconnaît les quatre sections d’un CONSEIL (#1924.1)', () => {
    const text = [
      'Voici ce que je recommande.',
      '',
      '**Verdict :** Oui, mais pas en placement immédiat.',
      '**Pourquoi :** Leur plan stratégique 2029, annoncé en mars 2026.',
      '**Ce qui manque :** Je n’ai pas pu regarder leur pile technique.',
      '**Prochaine action :** Qualifier le besoin publié de la filiale.',
    ].join('\n')
    const parsed = parseStructuredReply(text)
    expect(parsed?.sections.map(s => s.key)).toEqual(['verdict', 'why', 'missing', 'nextAction'])
    expect(parsed?.preamble).toBe('Voici ce que je recommande.')
    expect(parsed?.sections[2].body).toContain('pile technique')
  })

  it('reconnaît les intitulés anglais d’un CONSEIL (Verdict / Why / What’s missing / Next step) (#1924.1)', () => {
    const text = [
      '**Verdict:** Yes, but not as an immediate placement.',
      '**Why:** Their 2029 strategic plan.',
      "**What's missing:** I could not look at their stack.",
      '**Next step:** Qualify the published need.',
    ].join('\n')
    expect(parseStructuredReply(text)?.sections.map(s => s.key)).toEqual(['verdict', 'why', 'missing', 'nextAction'])
  })

  /**
   * LE TÉMOIN — ce que la reconnaissance ne doit PAS attraper. « Pourquoi » est
   * un mot courant : un intitulé voisin (« Pourquoi maintenant ») et une
   * question en gras ne sont pas des sections, et les prendre pour telles
   * découperait une réponse ordinaire en fausses cartes.
   */
  it('n’attrape pas un intitulé voisin ni une question en gras (#1924.1)', () => {
    expect(parseStructuredReply('**Pourquoi maintenant :** le calendrier est ferme.')).toBeNull()
    expect(parseStructuredReply('**Pourquoi ?** parce que le calendrier est ferme.')).toBeNull()
  })

  it('retourne null quand aucune section connue n’est présente (rendu markdown normal)', () => {
    expect(parseStructuredReply('Juste un paragraphe sans structure.')).toBeNull()
    // Un titre ATX non reconnu ne déclenche PAS le mode carte.
    expect(parseStructuredReply('## Contexte\nBla bla.')).toBeNull()
  })

  it('n’invente pas de section : une phrase en gras ordinaire n’est pas un titre', () => {
    const text = 'Le point **important** ici est le budget. Rien de structuré.'
    expect(parseStructuredReply(text)).toBeNull()
  })

  /**
   * #3763.5 (reste du lot J19) — LE CAS DE LA CAPTURE : une réponse
   * EXPLICATIVE (une analyse, un constat) qu'aucune carte ni aucun autre
   * gabarit ne couvre. Avant ce lot, ce texte n'avait AUCUNE section connue
   * et retombait entièrement en markdown à plat — ni « Résumé » ni
   * « Réserves » n'existaient, et « Sources » (déjà reconnu comme un DÉTAIL
   * par `detailKindOf`) n'avait donc jamais l'occasion de se plier, puisque
   * la section unique ne déclenche jamais le mode carte à elle seule.
   */
  it('reconnaît Résumé / Pourquoi / Réserves pour une réponse EXPLICATIVE (#3763.5)', () => {
    const text = [
      '**Résumé :** La cartographie est partielle.',
      "**Pourquoi :** Elle couvre les comptes enregistrés dans l'espace sur le département 34.",
      '**Réserves :** Les comptes hors de ce périmètre ne sont pas mesurés.',
    ].join('\n')
    const parsed = parseStructuredReply(text)
    expect(parsed?.sections.map(s => s.key)).toEqual(['summary', 'why', 'caveats'])
  })

  it('reconnaît les intitulés anglais (Summary / Why / Caveats) (#3763.5)', () => {
    const text = ['**Summary:** The map is partial.', '**Why:** It only covers registered accounts.'].join('\n')
    expect(parseStructuredReply(text)?.sections.map(s => s.key)).toEqual(['summary', 'why'])
  })

  it('une section « Sources » se plie dès que le résumé déclenche le mode carte (#3763.5)', () => {
    const text = [
      '**Résumé :** La cartographie est partielle.',
      '**Sources :** Registre public des entreprises, consulté ce jour.',
    ].join('\n')
    const parsed = parseStructuredReply(text)
    expect(parsed?.sections.map(s => s.key)).toEqual(['summary', null])
  })
})

describe('StructuredReply', () => {
  it('encadre chaque section reconnue dans un bloc distinct', () => {
    const text = [
      '**Objectif :** Décrocher un RDV.',
      "**Angle d'accroche :** Migration cloud.",
      "**Cas d'usage :** Sécuriser l'infra.",
    ].join('\n')
    render(<StructuredReply text={text} />)
    // Les trois titres sont rendus.
    expect(screen.getByText(/Objectif/)).toBeInTheDocument()
    expect(screen.getByText(/Angle d'accroche/)).toBeInTheDocument()
    expect(screen.getByText(/Cas d'usage/)).toBeInTheDocument()
    // Rendu en région structurée (accessibilité + trois blocs encadrés).
    const region = screen.getByRole('group', { name: /Réponse structurée/ })
    expect(region.querySelectorAll('[data-structured-section]')).toHaveLength(3)
  })

  it('retombe sur le markdown à plat quand la réponse n’a pas de sections connues', () => {
    render(<StructuredReply text={'Juste un paragraphe.'} />)
    expect(screen.queryByRole('group', { name: /Réponse structurée/ })).not.toBeInTheDocument()
    expect(screen.getByText('Juste un paragraphe.')).toBeInTheDocument()
  })

  it('affiche le préambule au-dessus des blocs, sans le perdre', () => {
    const text = ['Contexte rapide.', '', '**Objectif :** Gagner le compte.'].join('\n')
    render(<StructuredReply text={text} />)
    expect(screen.getByText('Contexte rapide.')).toBeInTheDocument()
    expect(screen.getByText(/Objectif/)).toBeInTheDocument()
  })
})

/**
 * #2429.4 — CHAQUE bloc d'UN message est ADRESSABLE (`message_id:rang`), le
 * MÊME calcul que `buildChatReplyEnvelope` côté API (GA-26). Sans
 * `messageId` (l'amorce de Laura, jamais persistée) : ni adresse, ni bouton.
 */
describe('StructuredReply — artefact adressable (#2429.4)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sans messageId : aucune adresse, aucun bouton « copier le lien »', async () => {
    renderWithRouter(<StructuredReply text={fence(VERDICT_BLOCK)} />)
    await screen.findByRole('group', { name: 'Verdict' })
    expect(document.querySelector('[data-artifact-id]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copier le lien de cette carte' })).not.toBeInTheDocument()
  })

  it('avec messageId : chaque bloc reçoit son adresse, dans l’ordre du texte', async () => {
    const text = `Avant.\n\n${fence(VERDICT_BLOCK)}\n\nEntre deux.\n\n${fence(VERDICT_BLOCK)}`
    renderWithRouter(<StructuredReply text={text} messageId="msg-1" />)
    await screen.findAllByRole('group', { name: 'Verdict' })
    const addressed = document.querySelectorAll('[data-artifact-id]')
    expect(Array.from(addressed).map(node => node.getAttribute('data-artifact-id'))).toEqual([
      chatArtifactId('msg-1', 0),
      chatArtifactId('msg-1', 1),
    ])
  })

  it('copie un lien qui pointe l’adresse EXACTE du bloc, jamais un texte inventé', async () => {
    writeText.mockResolvedValue(undefined)
    const user = setupWithClipboard()
    renderWithRouter(<StructuredReply text={fence(VERDICT_BLOCK)} messageId="msg-1" />)

    await user.click(await screen.findByRole('button', { name: 'Copier le lien de cette carte' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    const [copiedUrl] = writeText.mock.calls[0] as [string]
    expect(new URL(copiedUrl).hash).toBe(`#artifact=${encodeURIComponent(chatArtifactId('msg-1', 0))}`)
    expect(success).toHaveBeenCalledTimes(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('un presse-papiers refusé se DIT — jamais un « copié » qui n’a pas eu lieu', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    const user = setupWithClipboard()
    renderWithRouter(<StructuredReply text={fence(VERDICT_BLOCK)} messageId="msg-1" />)

    await user.click(await screen.findByRole('button', { name: 'Copier le lien de cette carte' }))

    expect(error).toHaveBeenCalledTimes(1)
    expect(success).not.toHaveBeenCalled()
  })
})

/**
 * #2429.1 (StructuredReply.tsx:229) — une section Markdown reconnue (Verdict /
 * Pourquoi / Objectif…) est adressable EXACTEMENT comme un bloc `bellum-block` :
 * même `data-artifact-id`, même bouton « copier le lien ». Espace de
 * numérotation SÉPARÉ (`chatStructuredSectionId`, préfixe `s`) — un bloc déjà
 * adressé ne change jamais de rang le jour où une section en gagne un.
 */
describe('StructuredReply — sections Markdown adressables (#2429.1)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sans messageId : aucune adresse, aucun bouton sur une section reconnue', () => {
    const text = ['**Objectif :** Décrocher un RDV.', "**Angle d'accroche :** Migration cloud."].join('\n')
    render(<StructuredReply text={text} />)
    expect(document.querySelector('[data-artifact-id]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copier le lien de cette carte' })).not.toBeInTheDocument()
  })

  it('avec messageId : chaque section reconnue reçoit une adresse `s`, dans l’ordre du texte', () => {
    const text = [
      '**Objectif :** Décrocher un RDV.',
      "**Angle d'accroche :** Migration cloud.",
      "**Cas d'usage :** Sécuriser l'infra.",
    ].join('\n')
    render(<StructuredReply text={text} messageId="msg-1" />)
    const addressed = screen.getByRole('group', { name: /Réponse structurée/ }).querySelectorAll('[data-artifact-id]')
    expect(Array.from(addressed).map(node => node.getAttribute('data-artifact-id'))).toEqual([
      chatStructuredSectionId('msg-1', 0),
      chatStructuredSectionId('msg-1', 1),
      chatStructuredSectionId('msg-1', 2),
    ])
  })

  it('l’adresse d’une section ne collisionne jamais avec celle d’un bloc dans le même message', async () => {
    const text = ['**Objectif :** Décrocher un RDV.', '', '```bellum-block', JSON.stringify(VERDICT_BLOCK), '```'].join(
      '\n',
    )
    renderWithRouter(<StructuredReply text={text} messageId="msg-1" />)
    await screen.findByRole('group', { name: 'Verdict' })
    const ids = Array.from(document.querySelectorAll('[data-artifact-id]')).map(node =>
      node.getAttribute('data-artifact-id'),
    )
    expect(ids).toEqual([chatStructuredSectionId('msg-1', 0), chatArtifactId('msg-1', 0)])
  })

  it('copie un lien qui pointe l’adresse EXACTE de la section', async () => {
    writeText.mockResolvedValue(undefined)
    const user = setupWithClipboard()
    render(<StructuredReply text={'**Objectif :** Décrocher un RDV.'} messageId="msg-1" />)

    await user.click(screen.getByRole('button', { name: 'Copier le lien de cette carte' }))

    const [copiedUrl] = writeText.mock.calls[0] as [string]
    expect(new URL(copiedUrl).hash).toBe(`#artifact=${encodeURIComponent(chatStructuredSectionId('msg-1', 0))}`)
  })

  it('une section voisine non reconnue (titre ATX non catalogué) ne reçoit aucune adresse', () => {
    const text = [
      '**Objectif :** Décrocher un RDV.',
      '## Cartographie Montpellier',
      'Un paragraphe non catalogué.',
    ].join('\n')
    render(<StructuredReply text={text} messageId="msg-1" />)
    const region = screen.getByRole('group', { name: /Réponse structurée/ })
    // Deux sections rendues (Objectif reconnu + Cartographie non cataloguée), une seule adresse.
    expect(region.querySelectorAll('[data-structured-section]')).toHaveLength(2)
    expect(region.querySelectorAll('[data-artifact-id]')).toHaveLength(1)
  })
})

describe('#3769 — une carte actualisée plus bas est remplacée par un renvoi', () => {
  const card = (title: string) =>
    fence({
      type: 'account_ranking',
      title,
      card_id: 'portfolio_priorities',
      axes: ['Niveau'],
      items: [{ name: 'Alpha', why: ['Signal daté.'] }],
    })

  it('la carte remplacée ne montre que le renvoi ; la dernière garde ses lignes', async () => {
    const superseded = new Set(['m1:portfolio_priorities'])
    const first = renderWithRouter(
      <StructuredReply text={card('Priorités du portefeuille')} messageId="m1" supersededCards={superseded} />,
    )
    expect(await screen.findByText(/actualisée plus bas/)).toBeInTheDocument()
    expect(screen.queryByText('Alpha')).toBeNull()
    first.unmount()
    const last = renderWithRouter(
      <StructuredReply
        text={card('Priorités du portefeuille · Zone : Occitanie')}
        messageId="m3"
        supersededCards={superseded}
      />,
    )
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText(/actualisée plus bas/)).toBeNull()
  })
})
