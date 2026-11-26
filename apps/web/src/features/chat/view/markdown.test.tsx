import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onReportRequest } from '@/features/feedback/reportLink'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { LIST_FOLD_THRESHOLD, renderMarkdown } from './markdown'
import { ReplyConversation } from './reply-conversation'

// #1946.4 — le clic sur un lien RENDU DANS une réponse de Laura, distinct
// d'une navigation ordinaire. Mocké comme `ReplyFeedback.test.tsx` (D10) :
// `trackAssistantAnswerJudged`, même module, même patron.
const trackAssistantRedirectFollowed = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackAssistantRedirectFollowed: (...args: unknown[]) => trackAssistantRedirectFollowed(...args),
}))

/**
 * #1960.4 — QUAND ÇA NE MARCHE PAS, LAURA OUVRE LE SIGNALEMENT EXISTANT.
 *
 * Elle écrit `[Signaler ce problème](#signaler:<résumé>)` (le prompt le lui
 * demande, `apps/ia/app/prompts/laura_support.py`). Le rendu en fait un BOUTON :
 * ce n'est pas une navigation, c'est l'ouverture du widget pré-rempli — et rien
 * ne part tant que la personne n'a pas relu puis envoyé.
 */
describe('#1960.4 — le lien de signalement écrit par Laura', () => {
  it('rend un bouton qui demande l’ouverture du signalement pré-rempli, sans naviguer', async () => {
    const listener = vi.fn()
    const unsubscribe = onReportRequest(listener)
    renderWithRouter(
      <>
        {renderMarkdown(
          "Je vois, c'est bloquant.\n[Signaler ce problème](#signaler:Le%20connecteur%20CRM%20a%20expiré)",
        )}
      </>,
    )

    const button = await screen.findByRole('button', { name: 'Signaler ce problème' })
    expect(button).toHaveAttribute('type', 'button')
    expect(screen.queryByRole('link')).toBeNull()

    await userEvent.click(button)
    expect(listener).toHaveBeenCalledWith({ message: 'Le connecteur CRM a expiré' })
    unsubscribe()
  })

  it('n’affiche jamais le jeton ni la description encodée', async () => {
    renderWithRouter(<>{renderMarkdown('[**Signaler ce problème**](#signaler:Écran%20vide)')}</>)
    expect(await screen.findByRole('button', { name: 'Signaler ce problème' })).toBeInTheDocument()
    const shown = document.body.textContent ?? ''
    expect(shown).not.toContain('#signaler')
    expect(shown).not.toContain('%20')
    expect(shown).not.toContain('](')
    expect(shown).not.toContain('**')
  })

  // ⚠️ La porte sait dire NON : un jeton voisin n'est pas un signalement, et il
  // ne devient pas non plus un lien — il garde le refus d'avant ce lot.
  it('un jeton voisin reste un libellé : ni bouton, ni lien', async () => {
    renderWithRouter(<>{renderMarkdown('[Signaler](#signalerX) ou [là](#report:bug)')}</>)
    expect(await screen.findByText('Signaler')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

/**
 * #1778 — LAURA PEUT ENFIN MONTRER LE CHEMIN.
 *
 * Le moteur ne connaissait que le gras : un `[Comptes](/accounts)` s'affichait
 * crochets compris. Ne pouvant pas montrer, elle décrit — et #1768 est né de
 * là (« Clique sur Lancer la recherche », un bouton qui n'existe pas).
 *
 * Ce que ces tests tiennent, et qui n'est pas négociable : un lien ne se rend
 * QUE s'il mène quelque part. Une route inventée reste du texte lisible, jamais
 * un lien qui rend un 404.
 */
describe('le rendu markdown d’une réponse du copilote', () => {
  it('rend cliquable un lien vers un écran qui existe', async () => {
    renderWithRouter(<>{renderMarkdown('Regarde [Découvrir](/discover) pour la suite.')}</>)
    const link = await screen.findByRole('link', { name: 'Découvrir' })
    expect(link).toHaveAttribute('href', '/discover')
  })

  it('rend cliquable un lien vers une fiche', async () => {
    renderWithRouter(<>{renderMarkdown('Le compte [SOCOTEC](/accounts/acb96868-d191-40b2-9c70-e2adc42c69ab).')}</>)
    expect(await screen.findByRole('link', { name: 'SOCOTEC' })).toHaveAttribute(
      'href',
      '/accounts/acb96868-d191-40b2-9c70-e2adc42c69ab',
    )
  })

  it('n’affiche JAMAIS la syntaxe markdown à l’utilisateur, même quand le lien est refusé', async () => {
    renderWithRouter(<>{renderMarkdown('Va dans [Découvrir](/decouvrir) maintenant.')}</>)
    // La cible n'existe pas (l'écran est `/discover`) : le libellé reste, la
    // syntaxe disparaît, et aucun lien ne mène au 404.
    expect(await screen.findByText('Découvrir')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Va dans/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('[Découvrir]')
    expect(document.body.textContent).not.toContain('(/decouvrir)')
  })

  // #2721 (suite, 23/09) — la forme `//ailleurs.example` reste refusée : elle
  // ressemble à un chemin interne (commence par `/`) tout en quittant le
  // domaine (`known-routes.ts`, GA-277) — un danger que `web_search` ne
  // produit jamais, contrairement à une adresse `https://` normale (voir
  // « #2721 — les sources citées par web_search sont cliquables » ci-dessous).
  it('refuse une adresse qui IMITE un chemin interne pour quitter le domaine', async () => {
    renderWithRouter(<>{renderMarkdown('Clique [là](//ailleurs.example).')}</>)
    expect(await screen.findByText('là')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body.textContent).not.toContain('ailleurs.example')
  })

  it('rend toujours le gras, et un lien DANS une liste', async () => {
    renderWithRouter(<>{renderMarkdown('- **Comptes** : ouvre [la liste](/accounts)')}</>)
    expect((await screen.findByText('Comptes')).tagName).toBe('STRONG')
    expect(screen.getByRole('link', { name: 'la liste' })).toHaveAttribute('href', '/accounts')
  })

  it('laisse intact un texte sans lien — le chemin d’avant ce lot', async () => {
    renderWithRouter(<>{renderMarkdown('Deux comptes attendent une action (voir plus bas).')}</>)
    expect(await screen.findByText(/Deux comptes attendent une action/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

/**
 * #1861 — « c'est quoi ces ** ? »
 *
 * Le gras et le lien étaient lus l'un APRÈS l'autre : `processInline` découpait
 * d'abord sur le lien, puis cherchait le gras DANS chaque morceau. Une paire
 * `**…**` qui ENCADRE un lien était donc coupée en deux par ce découpage —
 * l'étoile ouvrante finissait un morceau, la fermante commençait le suivant, et
 * aucune des deux moitiés ne ressemblait plus à du gras. Les quatre caractères
 * s'affichaient tels quels, collés au lien. C'est très exactement ce qu'on
 * voyait à l'écran : `**` avant le lien, `**` après.
 *
 * Ces tests tiennent la règle qui vaut pour tout le rendu : **la syntaxe
 * markdown ne s'affiche JAMAIS**, quel que soit l'ordre d'imbrication.
 */
describe('#1861 — le gras et les liens s’imbriquent dans les deux sens', () => {
  it('rend le gras qui ENCADRE un lien, sans montrer les étoiles', async () => {
    renderWithRouter(<>{renderMarkdown('- **[Comptes](/accounts)** : tes comptes suivis')}</>)
    const link = await screen.findByRole('link', { name: 'Comptes' })
    expect(link).toHaveAttribute('href', '/accounts')
    expect(link.closest('strong')).not.toBeNull()
    expect(document.body.textContent).not.toContain('**')
  })

  it('rend le gras à l’INTÉRIEUR du libellé d’un lien', async () => {
    renderWithRouter(<>{renderMarkdown('Va dans [**Comptes**](/accounts) maintenant.')}</>)
    const link = await screen.findByRole('link', { name: 'Comptes' })
    expect(link).toHaveAttribute('href', '/accounts')
    expect(link.querySelector('strong')).not.toBeNull()
    expect(document.body.textContent).not.toContain('**')
  })

  it('rend un lien dans une ligne ENTIÈREMENT en gras', async () => {
    renderWithRouter(<>{renderMarkdown('**Voir [la liste](/accounts)**')}</>)
    expect(await screen.findByRole('link', { name: 'la liste' })).toHaveAttribute('href', '/accounts')
    expect(document.body.textContent).not.toContain('**')
    expect(document.body.textContent).not.toContain('[la liste]')
    expect(document.body.textContent).not.toContain('(/accounts)')
  })

  it('n’affiche AUCUNE syntaxe quand un lien encadré de gras est refusé', async () => {
    renderWithRouter(<>{renderMarkdown('Ouvre **[Découvrir](/decouvrir)** pour la suite.')}</>)
    expect(await screen.findByText('Découvrir')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.body.textContent).not.toContain('**')
    expect(document.body.textContent).not.toContain('[Découvrir]')
    expect(document.body.textContent).not.toContain('(/decouvrir)')
  })

  /**
   * Le défaut ne s'est pas vu en test parce que chaque test tenait UNE forme :
   * le gras seul, le lien seul. Personne n'avait rendu une réponse telle que
   * Laura l'écrit — puces, intitulés en gras ET liens dans la même ligne, ce
   * que le prompt lui demande explicitement. Ce témoin lit la réponse entière
   * et vérifie qu'AUCUNE syntaxe ne survit nulle part.
   */
  it('ne laisse survivre aucune syntaxe dans une réponse entière de Laura', async () => {
    const reply = [
      'Voici par où commencer :',
      '',
      '- **[Comptes](/accounts)** : tes 12 comptes suivis',
      '- **[Découvrir](/discover)** : pour en trouver de nouveaux',
      '- Le compte [**SOCOTEC**](/accounts/acb96868-d191-40b2-9c70-e2adc42c69ab) attend une action',
      '',
      '**Ensuite, passe par [Actions](/actions)**',
    ].join('\n')
    renderWithRouter(<>{renderMarkdown(reply)}</>)
    expect(await screen.findByRole('link', { name: 'Comptes' })).toHaveAttribute('href', '/accounts')
    expect(screen.getByRole('link', { name: 'Découvrir' })).toHaveAttribute('href', '/discover')
    expect(screen.getByRole('link', { name: 'SOCOTEC' })).toHaveAttribute(
      'href',
      '/accounts/acb96868-d191-40b2-9c70-e2adc42c69ab',
    )
    expect(screen.getByRole('link', { name: 'Actions' })).toHaveAttribute('href', '/actions')
    const shown = document.body.textContent ?? ''
    expect(shown).not.toContain('**')
    expect(shown).not.toContain('](')
    expect(shown).not.toContain('](/')
  })

  it('laisse intact le gras seul et le lien seul — le chemin d’avant ce lot', async () => {
    renderWithRouter(<>{renderMarkdown('**Objectif :** ouvre [Comptes](/accounts) puis **agis**.')}</>)
    expect((await screen.findByText('Objectif :')).tagName).toBe('STRONG')
    expect(screen.getByText('agis').tagName).toBe('STRONG')
    expect(screen.getByRole('link', { name: 'Comptes' })).toHaveAttribute('href', '/accounts')
    expect(document.body.textContent).not.toContain('**')
  })

  // #1944.11 — un message long, sur mobile, contient parfois un jeton SANS
  // espace (une URL, un identifiant technique) : sans `break-words`, il déborde
  // du conteneur au lieu de passer à la ligne. `overflow-wrap` étant hérité,
  // le poser UNE fois sur le conteneur racine du moteur markdown partagé
  // (docblock : « un seul rendu markdown dans tout le chat ») couvre le fil
  // simple ET les sections de `StructuredReply`, qui réutilisent ce moteur.
  it('#1944.11 — porte break-words pour qu’un jeton sans espace passe à la ligne', async () => {
    const longToken = 'https://exemple.test/' + 'a'.repeat(120)
    const { container } = renderWithRouter(<>{renderMarkdown(`Voir ${longToken} pour le détail.`)}</>)
    await screen.findByText(/exemple\.test/)
    const root = container.querySelector('.space-y-1')
    expect(root).not.toBeNull()
    expect(root?.className ?? '').toContain('break-words')
  })
})

/**
 * #2721 / #2678 (suite, 23/09) — LES SOURCES CITÉES PAR `web_search` SONT
 * CLIQUABLES.
 *
 * `web_search` (`apps/ia/app/services/web_search_tool.py`) rend `results[].url`
 * depuis toujours, et le prompt nomme désormais la source (FrenchWeb,
 * Maddyness…) en lien markdown — mais `processInline` ne savait rendre QUE les
 * chemins internes (`appRouteTarget`, GA-277) : toute adresse externe tombait
 * dans « cible inconnue », qui n'affiche que le libellé. La source était
 * NOMMÉE, jamais cliquable.
 *
 * `InternalLink` reste le seul chemin pour un écran de CETTE application
 * (GA-277 continue de refuser `//ailleurs.example`, ci-dessus) : une adresse
 * `http(s)://` véritable ouvre désormais dans un NOUVEL onglet, jamais par le
 * routeur — ce n'est pas un écran de Bellum, personne ne doit quitter le fil.
 */
describe('#2721 — les sources citées par web_search sont cliquables', () => {
  it('rend une adresse http(s) en lien externe, nouvel onglet, sans référent', async () => {
    renderWithRouter(<>{renderMarkdown('Source : [FrenchWeb](https://www.frenchweb.fr/une-levee-de-fonds).')}</>)
    const link = await screen.findByRole('link', { name: 'FrenchWeb' })
    expect(link).toHaveAttribute('href', 'https://www.frenchweb.fr/une-levee-de-fonds')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('n’affiche jamais la syntaxe markdown pour une source externe', async () => {
    renderWithRouter(<>{renderMarkdown('Source : [Maddyness](https://www.maddyness.com/exemple).')}</>)
    await screen.findByRole('link', { name: 'Maddyness' })
    const shown = document.body.textContent ?? ''
    expect(shown).not.toContain('](')
    expect(shown).not.toContain('maddyness.com')
  })

  it('refuse un protocole qui n’est ni http ni https — jamais une adresse inventée cliquable', async () => {
    renderWithRouter(<>{renderMarkdown('Clique [ici](javascript:alert(1)).')}</>)
    expect(await screen.findByText('ici')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
})

/**
 * #1903.20 / #1933.8 — DÉFAUT RECETTE PASSAGE 7 (17/09) : le lien « Vivier »
 * d'un fil de Laura ouvrait `/consultants` SANS `from=chat:<id>` — le bouton
 * « Revenir à la conversation » n'apparaissait donc pas sur l'écran d'arrivée.
 * `withReturnToConversation` n'était appelé que par `PendingActions.tsx` ; le
 * lien écrit dans le TEXTE de la réponse (`InternalLink`) est le jumeau qui y
 * échappait.
 */
describe('#1903.20 / #1933.8 — le lien écrit dans le texte porte le fil source', () => {
  it('emporte `from=chat:<id>` quand le fil est connu', async () => {
    renderWithRouter(
      <ReplyConversation conversationId="c1">
        {renderMarkdown('Regarde le [Vivier](/consultants) pour la suite.')}
      </ReplyConversation>,
    )
    const link = await screen.findByRole('link', { name: 'Vivier' })
    expect(link).toHaveAttribute('href', '/consultants?from=chat:c1')
  })

  it('témoin — sans fil connu, le lien reste nu (jamais un `from` deviné)', async () => {
    renderWithRouter(<>{renderMarkdown('Regarde le [Vivier](/consultants) pour la suite.')}</>)
    expect(await screen.findByRole('link', { name: 'Vivier' })).toHaveAttribute('href', '/consultants')
  })
})

/**
 * #1946.4 — « redirection suivie » : un clic sur un lien RENDU DANS une
 * réponse de Laura (ce moteur), distinct d'une navigation ordinaire.
 */
describe('#1946.4 — la redirection suivie', () => {
  beforeEach(() => {
    trackAssistantRedirectFollowed.mockClear()
  })

  it('mesure le motif de départ et le motif de destination, jamais l’URL complète', async () => {
    renderWithRouter(<>{renderMarkdown('Regarde le [Vivier](/consultants) pour la suite.')}</>, '/chat')
    const link = await screen.findByRole('link', { name: 'Vivier' })
    await userEvent.click(link)
    expect(trackAssistantRedirectFollowed).toHaveBeenCalledTimes(1)
    expect(trackAssistantRedirectFollowed).toHaveBeenCalledWith('/chat', '/consultants')
  })

  it('mesure aussi un clic ouvert dans un nouvel onglet — SUIVRE le lien, pas seulement y naviguer sur place', async () => {
    renderWithRouter(<>{renderMarkdown('Regarde le [Vivier](/consultants) pour la suite.')}</>, '/chat')
    const link = await screen.findByRole('link', { name: 'Vivier' })
    fireEvent.click(link, { metaKey: true })
    expect(trackAssistantRedirectFollowed).toHaveBeenCalledWith('/chat', '/consultants')
  })

  it('témoin — un lien refusé (route inconnue) n’est jamais rendu, donc jamais mesuré', async () => {
    renderWithRouter(<>{renderMarkdown('Va dans [Découvrir](/decouvrir) maintenant.')}</>, '/chat')
    await screen.findByText('Découvrir')
    expect(screen.queryByRole('link')).toBeNull()
    expect(trackAssistantRedirectFollowed).not.toHaveBeenCalled()
  })
})

/**
 * #2438.11 — ASSAINIR LE RENDU : un message qui porte `<script>`, `<iframe>`
 * ou un lien `javascript:` reste INERTE.
 *
 * Ce moteur n'a jamais parsé de HTML (pas de `dangerouslySetInnerHTML`, aucune
 * bibliothèque markdown→HTML) : le texte d'un message traverse `String.split`
 * puis des éléments React construits à la main, jamais un moteur qui
 * interpréterait une balise. Un `<script>` dans le texte d'un message reste
 * donc une CHAÎNE affichée telle quelle — React échappe tout enfant texte par
 * construction. Ce test VERROUILLE ce comportement (régression structurelle,
 * pas une nouvelle défense) : preuve = code, pas d'outillage navigateur
 * disponible pour cet agent.
 */
describe('#2438.11 — un message hostile reste inerte', () => {
  it('un `<script>` dans le texte s’affiche comme du texte, jamais exécuté', async () => {
    renderWithRouter(<>{renderMarkdown('Voici <script>alert(1)</script> un texte.')}</>)
    // Le tag reste visible EN TANT QUE TEXTE — jamais un noeud <script> du DOM.
    expect(await screen.findByText(/<script>alert\(1\)<\/script>/)).toBeTruthy()
    expect(document.querySelector('script[src], script:not([type="application/json"])')).toBeNull()
  })

  it('un `<iframe>` dans le texte ne crée jamais de noeud <iframe>', async () => {
    renderWithRouter(<>{renderMarkdown('<iframe src="https://evil.example"></iframe>')}</>)
    await screen.findByText(/<iframe/)
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('un lien `javascript:` n’obtient jamais de `href` — libellé seul, sans ancre', async () => {
    renderWithRouter(<>{renderMarkdown('[Clique ici](javascript:alert(1))')}</>)
    await screen.findByText('Clique ici')
    expect(screen.queryByRole('link')).toBeNull()
  })
})

/**
 * #3273 — « faut retravailler l'UX design texte gros gras, variation de
 * texte, retour à la ligne… faire ressortir les bons éléments » : une bulle
 * de 3 572 px de haut, sans titre, sans liste, sans tableau — un mur de texte
 * découpé en `<p>` identiques. Ce bloc tient le moteur RENDU markdown élargi :
 * titres hiérarchisés, listes numérotées, citations, tableaux, code — en plus
 * du gras et des liens que `#1861`/`#1778` tenaient déjà.
 *
 * Le conteneur racine (`.space-y-1.break-words`, `#1944.11`) reste inchangé :
 * l'espacement « franc » entre sections passe par un conteneur DE BLOCS
 * imbriqué (`.space-y-3`), pas par une marge posée sur chaque enfant — une
 * marge sur un enfant direct de `.space-y-1` serait de toute façon perdue
 * (spécificité du sélecteur `space-y` de Tailwind, plus haute qu'un `mt-*`
 * simple posé sur l'enfant lui-même).
 */
describe('#3273 — titres hiérarchisés : gras, couleur primaire, tailles distinctes', () => {
  it('## est plus grand que ###, les deux en gras et en couleur primaire', async () => {
    renderWithRouter(<>{renderMarkdown('## Grand titre\n### Sous-titre')}</>)
    const h2 = await screen.findByText('Grand titre')
    const h3 = await screen.findByText('Sous-titre')
    expect(h2.className).toContain('text-lg')
    expect(h2.className).toContain('font-bold')
    expect(h2.className).toContain('text-[var(--bellum-text-primary)]')
    expect(h3.className).toContain('text-base')
    expect(h3.className).not.toContain('text-lg')
    expect(h3.className).toContain('text-[var(--bellum-text-primary)]')
  })
})

describe('#3273 — une liste numérotée se rend en <ol>, une liste à puces en <ul>', () => {
  it('rend trois puces numérotées, dans l’ordre du texte', async () => {
    renderWithRouter(<>{renderMarkdown('1. Premier point\n2. Deuxième point\n3. Troisième point')}</>)
    const list = await screen.findByRole('list')
    expect(list.tagName).toBe('OL')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Deuxième point')).toBeInTheDocument()
  })

  it('une liste à puces reste un <ul> — le chemin d’avant ce lot', async () => {
    renderWithRouter(<>{renderMarkdown('- Un\n- Deux')}</>)
    const list = await screen.findByRole('list')
    expect(list.tagName).toBe('UL')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('rend toujours le gras et un lien DANS une puce numérotée', async () => {
    renderWithRouter(<>{renderMarkdown('1. Ouvre [Comptes](/accounts) et relance **Alpha**')}</>)
    expect(await screen.findByRole('link', { name: 'Comptes' })).toHaveAttribute('href', '/accounts')
    expect(screen.getByText('Alpha').tagName).toBe('STRONG')
  })

  // #3939.1 — recette prod 09/10 : une liste de douleurs rendue « 1. 1. 1. » au lieu
  // de « 1. 2. 3. ». Cause : le modèle écrit une liste AÉRÉE (une ligne vide entre
  // deux items numérotés, forme markdown valide — « liste relâchée ») ; le lecteur de
  // bloc s'arrêtait à la première ligne vide et ouvrait une NOUVELLE liste d'un seul
  // item à chaque fois, chacune repartant de 1.
  it('une liste numérotée AÉRÉE (ligne vide entre les items) reste UNE SEULE liste, numérotée 1 2 3', async () => {
    renderWithRouter(<>{renderMarkdown('1. Premier point\n\n2. Deuxième point\n\n3. Troisième point')}</>)
    const list = await screen.findByRole('list')
    expect(list.tagName).toBe('OL')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('1.')
    expect(items[1]).toHaveTextContent('2.')
    expect(items[2]).toHaveTextContent('3.')
  })

  it('une liste à puces AÉRÉE reste aussi une seule liste', async () => {
    renderWithRouter(<>{renderMarkdown('- Un\n\n- Deux\n\n- Trois')}</>)
    const list = await screen.findByRole('list')
    expect(list.tagName).toBe('UL')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('une ligne vide suivie d’un paragraphe ordinaire referme bien la liste', async () => {
    renderWithRouter(<>{renderMarkdown('1. Premier point\n\nUn paragraphe normal, pas un item.')}</>)
    const list = await screen.findByRole('list')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Un paragraphe normal, pas un item.')).toBeInTheDocument()
  })
})

describe('#3273 — une citation se distingue du texte courant', () => {
  it('rend un <blockquote> qui porte le texte cité', async () => {
    renderWithRouter(<>{renderMarkdown('> Une citation importante.')}</>)
    await screen.findByText('Une citation importante.')
    const quote = document.querySelector('blockquote')
    expect(quote).not.toBeNull()
    expect(quote?.textContent).toContain('Une citation importante.')
  })
})

describe('#3273 — un tableau se rend en <table>, en pleine largeur (D81/GA-34)', () => {
  it('rend l’en-tête et les lignes, avec autant de colonnes que le texte en écrit', async () => {
    const text = ['| Compte | Statut |', '| --- | --- |', '| SOCOTEC | Actif |', '| Alpha | En attente |'].join('\n')
    renderWithRouter(<>{renderMarkdown(text)}</>)
    const table = await screen.findByRole('table')
    expect(screen.getAllByRole('columnheader').map(cell => cell.textContent)).toEqual(['Compte', 'Statut'])
    // en-tête + deux lignes de corps
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('SOCOTEC', { selector: 'td' })).toBeInTheDocument()
    // D81 : une liste/un tableau ne se borne pas à 70 caractères — il prend la
    // largeur qu'on lui donne, jamais celle du texte courant.
    expect(table.className).toContain('w-full')
  })
})

describe('#3273 — le code reste du code : bloc et inline, jamais interprété', () => {
  it('rend un bloc de code en police monospace, texte inchangé', async () => {
    const text = ['```', 'const x = 1', '```'].join('\n')
    renderWithRouter(<>{renderMarkdown(text)}</>)
    await screen.findByText('const x = 1')
    const code = document.querySelector('pre code')
    expect(code?.textContent).toBe('const x = 1')
    expect(document.querySelector('pre')?.className).toContain('font-mono')
  })

  it('rend un mot en code inline, jamais recoupé en gras ou en lien', async () => {
    renderWithRouter(<>{renderMarkdown('Lance `pnpm test` pour vérifier, pas **pnpm build**.')}</>)
    await screen.findByText('pnpm build')
    const inline = document.querySelector('code')
    expect(inline?.textContent).toBe('pnpm test')
    expect(screen.getByText('pnpm build').tagName).toBe('STRONG')
  })
})

describe('#3273 — les blocs se lisent par sections : espacement franc, racine inchangée', () => {
  it('garde `.space-y-1.break-words` à la racine (#1944.11, témoin de non-régression)', async () => {
    const { container } = renderWithRouter(<>{renderMarkdown('Un texte simple.')}</>)
    await screen.findByText('Un texte simple.')
    const root = container.querySelector('.space-y-1')
    expect(root).not.toBeNull()
    expect(root?.className ?? '').toContain('break-words')
  })

  it('un titre, un paragraphe et une liste sont trois blocs distincts, espacés', async () => {
    const text = ['## Titre', 'Un paragraphe.', '', '- Un point', '- Un autre'].join('\n')
    const { container } = renderWithRouter(<>{renderMarkdown(text)}</>)
    await screen.findByText('Titre')
    const blocks = container.querySelector('.space-y-3')
    expect(blocks).not.toBeNull()
    expect(blocks?.children.length).toBe(3)
  })
})

describe('#3273 — une réponse riche complète : titres, gras, listes et tableau stylés', () => {
  it('tient tout ensemble, en couleur primaire, sans qu’aucune syntaxe ne survive', async () => {
    const text = [
      '## Ce qui a été trouvé',
      'Le compte **SOCOTEC** a signé un accord-cadre en mars.',
      '',
      '### Prochaines étapes',
      '- Relancer le DSI',
      '- Préparer le rendez-vous',
      '',
      '| Compte | Statut |',
      '| --- | --- |',
      '| SOCOTEC | Actif |',
    ].join('\n')
    renderWithRouter(<>{renderMarkdown(text)}</>)
    const h2 = await screen.findByText('Ce qui a été trouvé')
    expect(h2.className).toContain('text-[var(--bellum-text-primary)]')
    expect(screen.getByText('SOCOTEC', { selector: 'strong' }).className).toContain('text-[var(--bellum-text-primary)]')
    expect(screen.getByRole('list').tagName).toBe('UL')
    expect(screen.getByRole('table')).toBeInTheDocument()
    const shown = document.body.textContent ?? ''
    expect(shown).not.toContain('##')
    expect(shown).not.toContain('**')
    expect(shown).not.toContain('| ---')
  })
})

/**
 * #3489 — l'italique `*…*` est rendu, jamais affiché avec ses astérisques.
 * Recette prod 01/10 : « …dans le document *Société Générale — objection*. ».
 */
describe('#3489 — l’italique markdown n’est jamais affiché brut', () => {
  it('rend *texte* en <em> dans une puce, sans astérisque visible', () => {
    const { container } = render(
      <>{renderMarkdown("- **Point** : C'est le point relevé dans le document *Société Générale — objection*.")}</>,
    )
    const em = container.querySelector('em')
    expect(em?.textContent).toBe('Société Générale — objection')
    expect(container.textContent).not.toContain('*')
  })

  it('rend une puce « * item » comme une puce, pas comme du texte brut', () => {
    const { container } = render(<>{renderMarkdown('* premier\n* second')}</>)
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(container.textContent).not.toContain('*')
  })

  it('sait dire NON : une multiplication « 2 * 3 et 4 * 5 » reste du texte', () => {
    const { container } = render(<>{renderMarkdown('Compte 2 * 3 et 4 * 5')}</>)
    expect(container.querySelector('em')).toBeNull()
    expect(container.textContent).toContain('2 * 3 et 4 * 5')
  })

  it('le gras reste du gras', () => {
    const { container } = render(<>{renderMarkdown('un **gras** et un *italique*')}</>)
    expect(container.querySelector('strong')?.textContent).toBe('gras')
    expect(container.querySelector('em')?.textContent).toBe('italique')
  })
})

describe('#3218 — un appel d’outil recopié en texte ne s’affiche jamais', () => {
  const LEAK = '{{functions.offer_reply_options({"question":"Quel canal ?","options":["E-mail"]})}}'

  it('retire l’appel et garde la phrase', () => {
    const { container } = render(<>{renderMarkdown(`Je prépare le message. ${LEAK}`)}</>)
    expect(container.textContent).toBe('Je prépare le message.')
  })

  it('⚠️ SAIT DIRE NON — un {{prenom}} de modèle de message reste lisible (en trou [prenom], #3440)', () => {
    const { container } = render(<>{renderMarkdown('Bonjour {{prenom}}, voici mon offre.')}</>)
    expect(container.textContent).toContain('Bonjour [prenom], voici mon offre.')
    expect(container.textContent).not.toContain('{{')
  })
})

// #4445.1 — une longue liste à puces d'une réponse de Laura se REPLIE.
describe('#4445.1 — une longue liste se replie au-delà du seuil', () => {
  const bullets = (n: number) => Array.from({ length: n }, (_, i) => `- Compte ${i + 1}`).join('\n')
  const numbered = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. Étape ${i + 1}`).join('\n')

  it('12 puces → 5 visibles + « Voir les 7 autres » ; le clic montre les 12 puis « Replier »', async () => {
    const { container } = render(<>{renderMarkdown(bullets(12))}</>)
    expect(container.querySelectorAll('li')).toHaveLength(LIST_FOLD_THRESHOLD)
    expect(LIST_FOLD_THRESHOLD).toBe(5)
    const more = screen.getByRole('button', { name: 'Voir les 7 autres' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    expect(container.querySelectorAll('li')).toHaveLength(12)
    const less = screen.getByRole('button', { name: 'Replier' })
    expect(less).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(less)
    expect(container.querySelectorAll('li')).toHaveLength(5)
  })

  it('6 puces → « Voir 1 autre » (accord au singulier)', () => {
    render(<>{renderMarkdown(bullets(6))}</>)
    expect(screen.getByRole('button', { name: 'Voir 1 autre' })).toBeInTheDocument()
  })

  it('sait dire NON : 5 puces → aucun bouton, rendu inchangé', () => {
    const { container } = render(<>{renderMarkdown(bullets(5))}</>)
    expect(container.querySelectorAll('li')).toHaveLength(5)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('liste numérotée : la numérotation reste continue après dépliage', async () => {
    const { container } = render(<>{renderMarkdown(numbered(8))}</>)
    expect(container.querySelectorAll('li')).toHaveLength(5)
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 3 autres' }))
    const markers = Array.from(container.querySelectorAll('li > span[aria-hidden]')).map(m => m.textContent)
    expect(markers).toEqual(['1.', '2.', '3.', '4.', '5.', '6.', '7.', '8.'])
  })
})
