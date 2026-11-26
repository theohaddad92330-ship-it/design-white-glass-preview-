import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionView } from '../api'
import { DEFAULT_MISSION_COLUMNS, MISSION_COLUMN_KEYS, type MissionColumnKey } from '../columns'
const avatarProps: Array<{ name: string; logoUrl?: string | null; website?: string | null }> = []

/**
 * #2408.81 — « Demander à Laura » se dépose désormais sur cette ligne (via
 * `AskLaura`). Sur poste de bureau, l'instance UNIQUE d'un écran devient
 * toujours la « gagnante » du magasin (`laura-intro-store`) et s'efface au
 * profit de la bulle — même mécanisme, même mock que
 * `MissionTrackingPage.test.tsx` : ce fichier ne teste pas la bulle, il teste
 * que la ligne PROPOSE bien le geste.
 */
// #2408.81 — la bulle (« ouvre sur place ») ou son absence (lien vers /chat) : le test pilote les deux.
const { openInPlace } = vi.hoisted(() => ({ openInPlace: { current: null as null | ((question: string) => void) } }))
vi.mock('@/features/laura/bubble/use-open-laura-in-place', () => ({
  useOpenLauraInPlace: () => openInPlace.current,
}))
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))

/**
 * Le routeur, réduit à ce que ces tests mesurent.
 *
 * Le tableau porte désormais deux vraies destinations — la prochaine action
 * (#1354, #1355, #1357) et le « Compléter » de la marge (#1356). Monter un
 * `RouterProvider` pour vérifier un `href` coûterait un arbre entier ; ce qui
 * compte ici est que la cellule DEMANDE la bonne route avec le bon paramètre.
 *
 * ⚠️ Le faux INTERPOLE les paramètres. Un `to` rendu tel quel afficherait
 * « /missions/$id » et le test resterait vert sur un lien mort — précisément
 * le défaut que `next-action-is-a-link.test.ts` interdit.
 */
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    search?: { prompt?: string }
    children: React.ReactNode
  }) => {
    const path = Object.entries(params ?? {}).reduce((acc, [key, value]) => acc.replace('$' + key, value), to)
    return (
      <a href={search?.prompt ? `${path}?prompt=${encodeURIComponent(search.prompt)}` : path} {...rest}>
        {children}
      </a>
    )
  },
}))

// Radix (DropdownMenu, sous les actions de ligne #2408.75-.81) réclame ces
// API de pointeur, absentes de jsdom — même garde que `AccountRefreshMenu.test.tsx`.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
})

vi.mock('@/components/ui/CompanyAvatar', () => ({
  CompanyAvatar: (props: { name: string; logoUrl?: string | null; website?: string | null }) => {
    avatarProps.push({ name: props.name, logoUrl: props.logoUrl ?? null, website: props.website ?? null })
    return null
  },
}))

import { MissionsTable } from './MissionsTable'

function mission(over: Partial<MissionView> = {}): MissionView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspace_id: '22222222-2222-4222-8222-222222222222',
    account_id: '33333333-3333-4333-8333-333333333333',
    opportunity_id: null,
    label: 'Renfort plateforme',
    status: 'active',
    started_on: null,
    ends_on: null,
    daily_rate: null,
    daily_cost: null,
    contract_kind: 'regie',
    role_title: null,
    billing_contact_id: null,
    owner_id: null,
    stage_entered_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    accountName: null,
    renewal: 'unknown',
    risks: [],
    // Ce que le serveur dérive de la fenêtre — jamais recalculé ici (#1357).
    nextAction: 'set_end_date',
    // PRÉSENT et `null` : pas le droit OU pas mesuré (D45).
    marginPercent: null,
    assignees: null,
    ...over,
  }
}

const ALL: MissionColumnKey[] = [
  'mission',
  'account',
  'role',
  'staffing',
  'status',
  'endsOn',
  'contractKind',
  'risks',
  'nextAction',
  'startedOn',
  'stageAge',
  'margin',
]

function show(rows: MissionView[], columns: MissionColumnKey[] = ALL, onOpen = vi.fn(), openOnRowClick?: boolean) {
  render(<MissionsTable missions={rows} columns={columns} onOpen={onOpen} openOnRowClick={openOnRowClick} />)
  return onOpen
}

beforeEach(cleanup)

describe('MissionsTable — ce que la donnée permet, et rien de plus', () => {
  it('rend une ligne par mission, sous les colonnes choisies', () => {
    show([mission({ label: 'Refonte du SI paiement' })], ['mission', 'status'])
    expect(screen.getByText('Refonte du SI paiement')).toBeInTheDocument()
  })

  it('n’affiche PAS une colonne qui n’est pas choisie', () => {
    show([mission({ role_title: 'Architecte de plateforme' })], ['mission'])
    expect(screen.queryByText('Architecte de plateforme')).not.toBeInTheDocument()
  })

  /**
   * ⚠️ Le cœur du lot. Chaque absence a sa PHRASE, et aucune ne s'écrit « 0 »
   * ni ne se tait. Un blanc dans une cellule se lit « rien à signaler », ce qui
   * est une affirmation qu'on n'a pas le droit de faire.
   */
  describe('une valeur absente se DIT — jamais « 0 », jamais un blanc', () => {
    it('une mission SANS date de fin le dit — c’est elle qui échappe aux fenêtres', () => {
      show([mission({ ends_on: null })], ['mission', 'endsOn'])
      expect(screen.getByText('Date de fin manquante')).toBeInTheDocument()
    })

    it('un compte hors périmètre ne laisse pas une cellule blanche', () => {
      show([mission({ accountName: null })], ['mission', 'account'])
      expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
    })

    it('une mission sans date de début ne s’affiche pas « démarrée aujourd’hui »', () => {
      show([mission({ started_on: null })], ['mission', 'startedOn'])
      expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
    })

    it('une ancienneté de statut inconnue ne vaut pas « 0 jour »', () => {
      show([mission({ stage_entered_at: null })], ['mission', 'stageAge'])
      expect(screen.queryByText(/0 jour/)).not.toBeInTheDocument()
    })

    // #2195.13 — aucun porteur résolu ne laisse pas une cellule blanche, pas
    // plus qu'un compte hors périmètre juste au-dessus.
    it('aucun porteur résolu ne laisse pas une cellule blanche', () => {
      show([mission({ ownerName: null })], ['mission', 'owner'])
      expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
    })

    // #2195.12 — aucun manager résolu ne laisse pas une cellule blanche, et
    // ne se lit jamais « non renseigné » comme un nom deviné.
    it('aucun manager résolu ne laisse pas une cellule blanche', () => {
      show([mission({ managerName: null })], ['mission', 'manager'])
      expect(screen.getByText(/non renseigné/i)).toBeInTheDocument()
    })
  })

  // #2195.13 — la colonne était refusée en UUID nu ; le nom résolu doit
  // maintenant s'afficher tel quel.
  it('nomme le porteur (owner) quand il est résolu', () => {
    show([mission({ ownerName: 'Camille Perrin' })], ['mission', 'owner'])
    expect(screen.getByText('Camille Perrin')).toBeInTheDocument()
  })

  // #2195.12 — la colonne « Manager » du sélecteur mesurée absente en
  // production le 19/09 ; le(s) nom(s) résolu(s) doivent s'afficher tels quels.
  it('nomme le manager (des consultants affectés) quand il est résolu', () => {
    show([mission({ managerName: 'Paul Martin' })], ['mission', 'manager'])
    expect(screen.getByText('Paul Martin')).toBeInTheDocument()
  })

  /**
   * `[]` et `null` disent deux choses, et l'écran doit les rendre différemment
   * — sinon on va corriger une donnée qui n'a rien.
   */
  describe('« personne d’affecté » n’est pas « on ne sait pas »', () => {
    it('NOMME les consultants en poste', () => {
      show(
        [mission({ assignees: [{ id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null }] })],
        ['mission', 'staffing'],
      )
      expect(screen.getByText(/Salomé Dufour/)).toBeInTheDocument()
    })

    it('dit « personne » quand la table a été lue et qu’elle est vide', () => {
      show([mission({ assignees: [] })], ['mission', 'staffing'])
      expect(screen.getByText(/personne/i)).toBeInTheDocument()
    })

    it('#3547 — un forfait encadré sans consultant dit son rôle tenu, jamais « Personne d’affecté »', () => {
      show(
        [
          mission({
            contract_kind: 'forfait',
            delivery_mode: 'supervised',
            supervision_role: 'framing',
            assignees: [],
          }),
        ],
        ['mission', 'staffing'],
      )
      expect(screen.getByText('Forfait encadré · Cadrage')).toBeInTheDocument()
      expect(screen.queryByText('Personne d’affecté')).not.toBeInTheDocument()
    })

    it('#3547 — un forfait encadré sans rôle dit seulement « Forfait encadré » (rien d’inventé)', () => {
      show(
        [mission({ contract_kind: 'forfait', delivery_mode: 'supervised', supervision_role: null, assignees: [] })],
        ['mission', 'staffing'],
      )
      expect(screen.getByText('Forfait encadré')).toBeInTheDocument()
    })

    it('ne dit PAS « personne » quand la lecture a échoué', () => {
      show([mission({ assignees: null })], ['mission', 'staffing'])
      expect(screen.queryByText(/personne/i)).not.toBeInTheDocument()
    })
  })

  /**
   * `risks` est calculé UNIQUEMENT sur une mission `active` ou `onboarding` —
   * `missionRisks` sort tôt pour tout autre statut. Une mission suspendue rend
   * donc `[]`, qui ne veut PAS dire « aucun risque ».
   *
   * « Un verdict ne se conclut pas d'un silence » : afficher « rien à
   * signaler » sur une mission suspendue serait un mensonge calculé.
   */
  describe('un risque vide n’est pas un risque absent', () => {
    it('dit « rien à signaler » sur une mission EN COURS sans risque', () => {
      show([mission({ status: 'active', risks: [] })], ['mission', 'risks'])
      expect(screen.getByText(/rien à signaler/i)).toBeInTheDocument()
    })

    it('ne conclut RIEN sur une mission suspendue — ses risques ne sont pas calculés', () => {
      show([mission({ status: 'paused', risks: [] })], ['mission', 'risks'])
      expect(screen.queryByText(/rien à signaler/i)).not.toBeInTheDocument()
      expect(screen.getByText(/non mesuré|en cours/i)).toBeInTheDocument()
    })

    it('nomme les risques quand il y en a', () => {
      show([mission({ status: 'active', risks: ['no_end_date'] })], ['mission', 'risks'])
      // ⚠️ Le libellé du RISQUE (« Sans date de fin ») n'est pas celui de
      // l'ÉCHÉANCE (« Date de fin manquante », #1364) : la colonne Risques
      // énumère ce qui cloche, la colonne Échéance répond à « quand ».
      expect(screen.getByText('Sans date de fin')).toBeInTheDocument()
    })

    /**
     * #2408.85 — « la couleur ne sert que l'exception ». Ce test-ci prouve la
     * moitié qui SE CODE : la cellule Risques elle-même. `MissionRisks.tsx` ne
     * rend un `<Badge variant="warning">` que quand `risks` n'est pas vide —
     * une mission sans risque reçoit un `<Text>` nu. L'autre moitié — que
     * l'écran ENTIER (statut, nature de contrat, marge…) ne peigne jamais une
     * ligne « normale » — est un jugement visuel qu'aucun grep ne remplace
     * (mémoire : « preuve ÉCRAN ne se remplace pas par un grep ») : elle vit
     * dans `docs/missions-cockpit-recette-humaine.md`, tant qu'une session
     * humaine n'y est pas consignée.
     */
    it('la couleur ne teinte QUE l’exception, jamais une ligne « rien à signaler »', () => {
      const { container: sansRisque } = render(
        <MissionsTable
          missions={[mission({ status: 'active', risks: [] })]}
          columns={['mission', 'risks']}
          onOpen={vi.fn()}
        />,
      )
      expect(sansRisque.querySelector('[class*="warning"]')).toBeNull()
      expect(sansRisque.querySelector('[class*="danger"]')).toBeNull()
      cleanup()

      const { container: avecRisque } = render(
        <MissionsTable
          missions={[mission({ status: 'active', risks: ['no_end_date'] })]}
          columns={['mission', 'risks']}
          onOpen={vi.fn()}
        />,
      )
      expect(avecRisque.querySelector('[class*="warning"]')).not.toBeNull()
    })
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LA COLONNE « MARGE » — décision D43 du 28/08/2026
   * ─────────────────────────────────────────────────────────────────────────
   * Elle était refusée, et le refus était juste : `marginPercent` se calculait
   * sur `missions.daily_cost`, que rien dans l'application n'écrit. La colonne
   * aurait dit « coût chargé non renseigné » sur des missions dont la FICHE
   * affichait une marge — deux écrans en contradiction, un défaut neuf.
   *
   * Ce qui lui manquait était un arbitrage, pas un branchement : quelle table
   * fait foi ? Louis a tranché — les conditions commerciales. La dérivation
   * lit désormais `mission_commercial_terms.loaded_daily_cost_cents`, la seule
   * colonne réellement alimentée, et les deux écrans passent par le MÊME
   * noyau de calcul.
   *
   * TROIS états, jamais deux, et c'est tout l'enjeu de ces tests :
   *  · la clé est ABSENTE  → pas le droit (`finance:read`) ;
   *  · la clé vaut `null`  → le droit, mais aucun coût saisi ;
   *  · un nombre           → la marge.
   * Les replier l'un sur l'autre afficherait « 0 % » là où la vérité est
   * « on ne sait pas » ou « ce n'est pas ton périmètre ».
   */
  describe('la colonne Marge', () => {
    it('affiche la marge quand le coût chargé est renseigné', () => {
      show([mission({ marginPercent: 31.8 })], ['mission', 'margin'])
      expect(screen.getByRole('columnheader', { name: /marge/i })).toBeInTheDocument()
      expect(screen.getByText(/31,8|31\.8/)).toBeInTheDocument()
    })

    it('dit « coût chargé non renseigné » — et JAMAIS « 0 % » — quand le coût manque', () => {
      // Si cette valeur manque, « 0 » est-il VRAI ? Non : une marge nulle fait
      // renégocier, une marge inconnue fait remplir une fiche. Deux gestes
      // opposés derrière le même chiffre.
      show([mission({ marginPercent: null })], ['mission', 'margin'])
      expect(screen.getByText(/coût chargé manquant/i)).toBeInTheDocument()
      expect(screen.queryByText(/^0\s*%$/)).not.toBeInTheDocument()
    })

    it('#2979 — l’état non mesuré tient sur DEUX lignes : « non mesurée » sans retour, la porte dessous (F2 : la cause passe à l’infobulle)', () => {
      // jsdom ne mesure pas : on garde la CLASSE qui interdit le retour à la ligne,
      // faute de quoi la colonne étroite faisait 4 lignes (lignes à 145 px).
      show([mission({ marginPercent: null })], ['mission', 'margin'])
      const title = screen.getByText(/^non mesurée/)
      expect(title.className).not.toMatch(/truncate|text-ellipsis/)
      // #4191 (recette 3, F2) — la cause (« Coût chargé manquant ») n'est plus en toutes lettres dans la
      // cellule : à l'infobulle, et lue par le lecteur d'écran (`sr-only`).
      expect(title).toHaveAttribute('title', expect.stringContaining('Coût chargé manquant'))
      const link = screen.getByRole('link', { name: /compléter/i })
      expect(link.className).toMatch(/whitespace-nowrap/)
    })

    it('distingue « pas le droit » de « pas renseigné » — la clé est ABSENTE sans finance:read', () => {
      // Le service RETIRE `marginPercent` plutôt que de le mettre à `null` :
      // « ce n'est pas ton périmètre » et « personne ne l'a saisi » appellent
      // deux gestes différents, et un seul des deux est à la portée du lecteur.
      const withoutRight = mission()
      delete (withoutRight as { marginPercent?: number | null }).marginPercent
      show([withoutRight], ['mission', 'margin'])
      expect(screen.getByText(/périmètre/i)).toBeInTheDocument()
      expect(screen.queryByText(/coût chargé/i)).not.toBeInTheDocument()
    })

    it('montre une marge NÉGATIVE plutôt que de la cacher', () => {
      // Une mission à perte est exactement l'information qu'on cherche.
      show([mission({ marginPercent: -12.5 })], ['mission', 'margin'])
      expect(screen.getByText(/-12,5|-12\.5/)).toBeInTheDocument()
    })

    it('affiche « 0 % » quand la marge est VRAIMENT nulle', () => {
      // Le pendant du test précédent : la règle est « ne pas écrire 0 pour une
      // absence », pas « ne jamais écrire 0 ». Une marge mesurée à zéro est une
      // information, et une alerte.
      show([mission({ marginPercent: 0 })], ['mission', 'margin'])
      expect(screen.getByText(/0\s*%/)).toBeInTheDocument()
      expect(screen.queryByText(/coût chargé/i)).not.toBeInTheDocument()
    })

    it('#2979 — la colonne garde une largeur FIXE de 112 px (7 rem, #4191 F2 : « non mesurée » court) (jsdom ne mesure pas : la classe, pas le pixel réel)', () => {
      // `max-w-[6rem]` sur un `<td>` en table-layout auto ne borne pas le
      // rendu : le contenu de l'état non mesuré (cause + lien « Compléter »)
      // pousse la colonne jusqu'à 145 px malgré lui. Une largeur FIXE la
      // tient, qu'il y ait un chiffre ou les deux lignes de l'état vide.
      show([mission({ marginPercent: 31.8 })], ['mission', 'margin'])
      const header = screen.getByRole('columnheader', { name: /marge/i })
      const cell = screen.getAllByRole('cell')[1] as HTMLElement
      expect(header.className).toMatch(/(^|\s)w-\[7rem\]/)
      expect(header.className).not.toMatch(/max-w-\[6rem\]/)
      expect(cell.className).toMatch(/(^|\s)w-\[7rem\]/)
      expect(cell.className).not.toMatch(/max-w-\[6rem\]/)
    })

    // #2979 (RBD, recette G5 11/10 : lignes à ~101 px à 1512 px) — les cellules Risques (78-86 px) et
    // Échéance (70-86 px) passaient à la ligne dans des colonnes de 92 px et gonflaient chaque ligne. En
    // tableau elles tiennent sur UNE ligne (ellipse), le texte entier reste au `title` (jsdom ne mesure
    // pas : on garde les CLASSES qui interdisent le retour à la ligne).
    // #4191 (E3) renverse #2979 pour ces cellules : la pastille PASSE À LA LIGNE, jamais d'ellipse.
    it('#4191 E3 — la cellule Risques : la pastille passe à la ligne (whitespace-normal), titre complet conservé', () => {
      show([mission({ status: 'active', risks: ['renewal_not_started', 'margin_at_risk'] })], ['mission', 'risks'])
      const cell = screen.getAllByRole('cell')[1] as HTMLElement
      const badge = screen.getByTitle('Renouvellement non engagé')
      expect(badge.className).toMatch(/whitespace-normal/)
      expect(badge.className).not.toMatch(/whitespace-nowrap/)
      expect(cell.querySelector('.truncate')).toBeNull()
    })

    it('#4191 E3 — la cellule Échéance : pastille + date peuvent passer à la ligne, aucune ellipse', () => {
      const endsOn = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)
      show([mission({ ends_on: endsOn, renewal: 'j45' })], ['mission', 'endsOn'])
      const cell = screen.getAllByRole('cell')[1] as HTMLElement
      expect(cell.querySelector('[class*="flex-wrap"]')).not.toBeNull()
      expect(cell.querySelector('[class*="flex-nowrap"]')).toBeNull()
      expect(cell.querySelector('.truncate')).toBeNull()
    })

    it('#2979 — sans date de fin, la cellule Échéance ne rend QUE la pastille (la conséquence passe au title)', () => {
      show([mission({ ends_on: null })], ['mission', 'endsOn'])
      const cell = screen.getAllByRole('cell')[1] as HTMLElement
      expect(cell.textContent).toMatch(/Date de fin manquante/)
      expect(cell.textContent).not.toMatch(/Sans elle/)
      expect(cell.querySelector('[title^="Sans elle"]')).not.toBeNull()
    })

    // #2979 (recette 11/10 : lignes à ~101 px, cible < 56 px) — jsdom ne MESURE pas : on prouve la hauteur par
    // les CLASSES. Budget d'une ligne = padding vertical de la cellule (py-1 = 8 px en dense) + la plus haute des
    // boîtes qu'elle contient (line-clamp-N = N lignes de 20 px ; size-/h-/min-h- N × 4 px ; max-h- plafonne ;
    // une pile `flex-col` additionne ses enfants et son gap). Le pire cas (libellés longs, 3 consultants, 3 risques)
    // doit tenir sous 56 px, et le geste le plus haut reste la cible tactile de 44 px (GA-35) : 8 + 44 = 52.
    const ROW_BUDGET_PX = 56
    const px = (cls: string, prefix: string): number[] =>
      cls
        .split(/\s+/)
        .filter(token => new RegExp(`^${prefix}-\\d+(\\.\\d+)?$`).test(token))
        .map(token => Number(token.slice(prefix.length + 1)) * 4)
    function boxHeight(el: Element): number {
      const cls = el.getAttribute('class') ?? ''
      const clamp = /(?:^|\s)line-clamp-(\d+)(?:\s|$)/.exec(cls)
      const children = Array.from(el.children)
      const gap = Math.max(0, ...px(cls, 'gap-y'), ...px(cls, 'gap'))
      const stacked = /(?:^|\s)flex-col(?:\s|$)/.test(cls)
      let h = children.length
        ? stacked
          ? children.reduce((sum, child) => sum + boxHeight(child), 0) + gap * (children.length - 1)
          : Math.max(...children.map(boxHeight))
        : el.textContent?.trim()
          ? 20
          : 0
      if (clamp) h = Math.min(h, Number(clamp[1]) * 20)
      h = Math.max(h, ...px(cls, 'size'), ...px(cls, 'h'), ...px(cls, 'min-h'))
      const cap = px(cls, 'max-h')
      if (cap.length) h = Math.min(h, ...cap)
      return h
    }

    it('#2979 — le pire cas tient sous 56 px : padding dense + la plus haute boîte de chaque cellule', () => {
      show([
        mission({
          label: 'Refonte complète du système d’information de paiement et de la plateforme de facturation',
          accountName: 'Dassault Aviation Systèmes Industriels',
          role_title: 'Architecte solution senior spécialisé migration applicative cloud hybride',
          assignees: [
            { id: '44444444-4444-4444-8444-444444444441', fullName: 'Léa Marchand', photoUrl: null },
            { id: '44444444-4444-4444-8444-444444444442', fullName: 'Karim Benali-Dupont', photoUrl: null },
            { id: '44444444-4444-4444-8444-444444444443', fullName: 'Inès Castel', photoUrl: null },
          ],
          risks: ['renewal_not_started', 'margin_at_risk', 'no_end_date'],
          nextAction: 'set_end_date',
        }),
      ])
      const cells = screen.getAllByRole('cell')
      expect(cells.length).toBeGreaterThan(3)
      for (const cell of cells) {
        expect(cell).toHaveClass('py-1')
        const height = 8 + boxHeight(cell)
        expect(height, `cellule « ${cell.textContent?.slice(0, 40)} »`).toBeLessThan(ROW_BUDGET_PX)
      }
    })

    it('#2979 — sait dire NON : sans le mode dense (py-2) la même ligne dépasse la borne de 56 px', () => {
      // Le garde-fou prouve qu'il LIT quelque chose : une cellule « Mission » (bouton min-h-11 = 44 px) à py-2 fait 60 px.
      show([mission({ label: 'Refonte' })], ['mission'])
      const cell = screen.getAllByRole('cell')[0] as HTMLElement
      expect(16 + boxHeight(cell)).toBeGreaterThanOrEqual(ROW_BUDGET_PX)
    })

    // #2979 (RAN, recette ND 10/10 en prod, /missions à 1400 px) — la colonne Compte se rétrécissait à 94 px :
    // « LVM H », « DAS SA… ». Un plancher en `rem` (le réglage « Taille du texte » le suit) garde le nom lisible ;
    // le nom complet reste au `title`, et un mot n'est jamais coupé en deux (retour à la ligne entre les mots).
    it('#2979 — la colonne Compte a une largeur minimale lisible, un title, et ne coupe pas un mot', () => {
      show([mission({ accountName: 'DASSAULT SYSTEMES' })], ['mission', 'account'])
      const header = screen.getByRole('columnheader', { name: /compte/i })
      const name = screen.getByText('DASSAULT SYSTEMES')
      expect(name).toHaveAttribute('title', 'DASSAULT SYSTEMES')
      expect(name.className).not.toMatch(/break-words|break-all/)
      // #2979 (RAT, recette NF 10/10 : 109 px, « DASS/AULT ») — le tableau est en `table-fixed` (R3b) : un
      // `min-width` sur une cellule n'y compte PAS, seule une largeur `w-` borne la colonne ; et le `<td>` porte
      // `break-words` (overflow-wrap) que le nom HÉRITE — l'absence de classe sur le span ne prouvait rien.
      expect(document.querySelector('table')?.className).toMatch(/table-fixed/)
      const cell = name.closest('td') as HTMLElement
      expect(header.className).toMatch(/(^|\s)w-\[(9|10|11|12)rem\]/)
      expect(cell.className).toMatch(/(^|\s)w-\[(9|10|11|12)rem\]/)
      // #2979 (RAX, recette G4 11/10 : « DASSAULT / AVIATION » sur 2 lignes, ligne de 101 px) — UNE ligne
      // avec ellipse (le `title` garde le nom entier) : le nom ne fait plus gonfler la ligne. La table est
      // en `table-fixed` : `truncate` y respecte la largeur déclarée (GA-255 : `min-w-0` sur le span).
      // #4191 (recette 3, F2) renverse #2979 (RAX) : plus d'ellipse, le nom passe à la ligne entre les mots.
      expect(name.className).not.toMatch(/\b(truncate|text-ellipsis)\b/)
      expect(name.className).toMatch(/min-w-0/)
      expect(name.className).not.toMatch(/line-clamp/)
    })

    it('#2979 — le pourcentage s’aligne en chiffres tabulaires', () => {
      show([mission({ marginPercent: 31.8 })], ['mission', 'margin'])
      const value = screen.getByText(/31,8|31\.8/)
      expect(value.className).toMatch(/tabular-nums/)
    })
  })

  /**
   * GA-35 — ce qui se clique se tabule. Le nom de la mission est un vrai
   * `<button>`, pas une ligne cliquable : `getByRole('button')` échouerait sur
   * un `<tr onClick>`, qui n'a ni tabulation ni Entrée ni annonce.
   */
  describe('la fiche s’ouvre au clavier comme à la souris', () => {
    it('ouvre la fiche depuis le nom de la mission', async () => {
      const onOpen = show([mission({ label: 'Renfort data' })], ['mission'])
      await userEvent.click(screen.getByRole('button', { name: 'Renfort data' }))
      expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('s’ouvre à la touche Entrée — donc le nom est bien tabulable', async () => {
      const onOpen = show([mission({ label: 'Renfort data' })], ['mission'])
      await userEvent.tab()
      expect(screen.getByRole('button', { name: 'Renfort data' })).toHaveFocus()
      await userEvent.keyboard('{Enter}')
      expect(onOpen).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * #3559 (recette Y23, 03/10) — « cliquer le titre n'ouvre pas le panneau, seul le chevron ».
   * Le bouton du titre ne couvre que ses mots : un clic dans la cellule, à côté du texte, ne
   * faisait rien. Sur l'écran qui l'active (`openOnRowClick`), TOUTE la ligne ouvre — sans
   * jamais doubler le geste d'un contrôle imbriqué.
   */
  describe('#3559 — toute la ligne ouvre (`openOnRowClick`)', () => {
    it('un clic dans une cellule ordinaire ouvre la mission', async () => {
      const onOpen = show([mission({ label: 'Renfort data' })], ['mission', 'startedOn'], vi.fn(), true)
      const cell = screen.getAllByRole('cell')[1] as HTMLElement
      await userEvent.click(cell)
      expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('un clic sur le titre ouvre UNE fois (pas une fois pour le bouton et une pour la ligne)', async () => {
      const onOpen = show([mission({ label: 'Renfort data' })], ['mission'], vi.fn(), true)
      await userEvent.click(screen.getByRole('button', { name: 'Renfort data' }))
      expect(onOpen).toHaveBeenCalledTimes(1)
    })

    it('SAIT DIRE NON : sans `openOnRowClick`, la cellule ne fait rien (les autres écrans gardent leur geste)', async () => {
      const onOpen = show([mission({ label: 'Renfort data' })], ['mission', 'startedOn'])
      await userEvent.click(screen.getAllByRole('cell')[1] as HTMLElement)
      expect(onOpen).not.toHaveBeenCalled()
    })

    it('le titre est une cible de 44 px au moins', () => {
      show([mission({ label: 'Renfort data' })], ['mission'])
      expect(screen.getByRole('button', { name: 'Renfort data' }).className).toMatch(/min-h-11/)
    })
  })

  /**
   * ⚠️ « n + 1 » depuis #1359, et le +1 est NOMMÉ.
   *
   * La colonne de fin porte la porte de la ligne (« Ouvrir »). Elle ne figure
   * pas dans `MISSION_COLUMN_KEYS` — le sélecteur permettrait sinon de décocher
   * un geste, ce qui n'est pas un réglage d'affichage.
   *
   * Ce que le test garde reste le même : chaque colonne choisie porte SON
   * entête, donc les valeurs ne glissent pas d'une colonne (GA-29). Compter
   * `chosen.length` en dur l'aurait fait rougir sans qu'aucune valeur n'ait
   * glissé.
   */
  it('porte un entête par colonne choisie, et rien de plus — les valeurs ne glissent pas', () => {
    const chosen = ['mission', 'account', 'status'] as const
    show([mission()], [...chosen])
    const headers = screen.getAllByRole('columnheader')
    // #4191 (recette 3, F2) : la colonne « Ouvrir » a disparu, la ligne ouvre.
    expect(headers).toHaveLength(chosen.length)
    expect(within(headers[0] as HTMLElement).getByText(/mission/i)).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /ouvrir/i })).toBeNull()
  })

  /**
   * LA PORTE À DROITE DE CHAQUE LIGNE — #1359.
   *
   * « Ajouter à droite de chaque ligne un chevron discret ou CTA "Voir". Le nom
   * reste cliquable pour l'accessibilité. » Les deux, donc : ce test garde le
   * second geste, celui qui n'existait pas.
   */
  it('ouvre la fiche depuis le titre, bouton tabulable qui porte un NOM (#1359, F2 : plus de chevron)', async () => {
    const onOpen = vi.fn()
    show([mission({ label: 'TMA ACME' })], ['mission'], onOpen)
    await userEvent.click(screen.getByRole('button', { name: 'TMA ACME' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  /**
   * DEUX VISAGES AU PLUS, PUIS UN COMPTE — #1350.
   *
   * ⚠️ Le reste est COMPTÉ et non masqué : une coupe muette ferait croire la
   * liste complète, et c'est la même règle que celle des risques.
   */
  it('montre deux consultants au plus, chacun en lien vers son profil, et compte le reste (#1350, #1363)', () => {
    show(
      [
        mission({
          assignees: [
            { id: 'c-1', fullName: 'Salomé Dufour', photoUrl: null },
            { id: 'c-2', fullName: 'Camille Roussel', photoUrl: null },
            { id: 'c-3', fullName: 'Yanis Berthier', photoUrl: null },
          ],
        }),
      ],
      ['mission', 'staffing'],
    )
    expect(screen.getByRole('link', { name: /salomé dufour/i })).toHaveAttribute('href', '/consultants/c-1')
    expect(screen.getByRole('link', { name: /camille roussel/i })).toHaveAttribute('href', '/consultants/c-2')
    expect(screen.queryByText(/yanis berthier/i)).not.toBeInTheDocument()
    expect(screen.getByText('+1 autre')).toBeInTheDocument()
  })
})

/**
 * LES ACTIONS DE LIGNE — #2408.75, .76, .77, .78, .79, .80, .81.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE GESTE QUI ÉTAIT EMPÊCHÉ
 * ─────────────────────────────────────────────────────────────────────────
 * Le retour #2408 nomme neuf actions attendues sur CETTE ligne : préparer le
 * renouvellement, demander le CRA, préparer la facture, vérifier le paiement,
 * repositionner le consultant, demander un feedback, demander à Laura. Le
 * balayage du 24/09 les a trouvées ENTIÈRES ailleurs dans le dépôt —
 * `RenewalDecisionPanel.tsx` (renouvellement, repositionnement, feedback),
 * `InvoiceReadinessPanel.tsx` (facture, paiement), `useRecordTimesheetReminder`
 * (CRA) — mais AUCUNE n'était atteignable depuis cette table : le lecteur
 * devait déjà savoir que le dossier de mission, `/missions/cra` et
 * `/missions/facturation` existaient, et y retrouver la même mission seul.
 *
 * La tranche livrée ici ne réimplémente aucune de ces capacités (elles
 * fonctionnent déjà, chacune sur son écran, avec son propre mois et son
 * propre contexte — une facture ou une relance de CRA n'a pas de sens sans un
 * mois choisi, que cette ligne ne porte pas). Elle ouvre la PORTE manquante :
 * un menu de ligne, au même endroit que celui déjà livré sur
 * `/missions/suivi` (`MissionTrackingTable.RowMenu`), pour rester cohérente
 * avec un mécanisme déjà accepté plutôt que d'en inventer un second.
 */
describe('MissionsTable — les actions de ligne (#2408.75 à .81)', () => {
  beforeEach(cleanup)

  it('ouvre un menu qui MÈNE vers le renouvellement, le CRA, la facture et le paiement', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    show([mission({ label: 'Refonte SI paiement' })], ['mission'])

    await user.click(screen.getByRole('button', { name: /actions.*refonte si paiement/i }))

    const dossier = '/missions/11111111-1111-4111-8111-111111111111'
    expect(screen.getByRole('menuitem', { name: /préparer le renouvellement/i })).toHaveAttribute('href', dossier)
    expect(screen.getByRole('menuitem', { name: /demander le cra/i })).toHaveAttribute('href', '/missions/cra')
    expect(screen.getByRole('menuitem', { name: /préparer la facture/i })).toHaveAttribute(
      'href',
      '/missions/facturation',
    )
    expect(screen.getByRole('menuitem', { name: /vérifier le paiement/i })).toHaveAttribute(
      'href',
      '/missions/facturation',
    )
    expect(screen.getByRole('menuitem', { name: /repositionner le consultant/i })).toHaveAttribute('href', dossier)
    expect(screen.getByRole('menuitem', { name: /demander un feedback/i })).toHaveAttribute('href', dossier)
  })

  // #2408.81 — REVIENT SUR #4194 (« aucun Demander à Laura par ligne ») : le menu de CHAQUE ligne le porte, avec la
  // question de LA mission (même geste que `MissionTrackingTable`, #4345 : la bulle s'ouvre sur place si montée).
  it('#2408.81 — le menu de ligne porte « Demander à Laura » : ouvre la bulle sur place avec LA mission', async () => {
    const open = vi.fn()
    openInPlace.current = open
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    show([mission({ label: 'Refonte SI paiement' })], ['mission'])
    await user.click(screen.getByRole('button', { name: /actions.*refonte si paiement/i }))
    await user.click(screen.getByRole('menuitem', { name: /demander à laura/i }))
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0]?.[0]).toContain('Refonte SI paiement')
  })

  it('#2408.81 — bulle injoignable (mobile, surcouche) : le même item mène à /chat, question pré-remplie', async () => {
    openInPlace.current = null
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    show([mission({ label: 'Refonte SI paiement' })], ['mission'])
    await user.click(screen.getByRole('button', { name: /actions.*refonte si paiement/i }))
    const item = screen.getByRole('menuitem', { name: /demander à laura/i })
    expect(item.getAttribute('href')).toMatch(/^\/chat\?prompt=.*Refonte%20SI%20paiement/)
  })
})

/**
 * L'ACTION DE LIGNE RESTANTE — #2408.74.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA HUITIÈME ACTION, ET POURQUOI ELLE EST CONDITIONNELLE
 * ─────────────────────────────────────────────────────────────────────────
 * Les sept autres (#2408.75-.81) MÈNENT vers un écran distant. Celle-ci mène
 * vers la fiche de LA MÊME mission (`onOpen`, déjà la porte de #2408.73) :
 * `MissionDetailPanel.tsx` y sait déjà « compléter la fiche » (#2194.32,
 * `MissionDatesSection`/`useUpdateMission`) pour une date de fin absente
 * (`no_end_date`) et un bon de commande manquant (`missing_po`) — deux
 * risques déjà calculés par `missionRisks()` (mission.ts). Réimplémenter un
 * second formulaire ici aurait été la loi 4 du tome 7 une fois de plus.
 *
 * ⚠️ Le geste ne se propose QUE si l'un des deux risques est présent : « on
 * n'affiche pas ce qu'on n'a pas » vaut aussi pour une action — proposer de
 * remplir une fiche déjà complète serait un bouton qui ne fait rien.
 */
describe('MissionsTable — renseigner une donnée (#2408.74)', () => {
  beforeEach(cleanup)

  it('propose « Renseigner une donnée » quand la fin manque, et ouvre la fiche de CETTE mission', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onOpen = vi.fn()
    const target = mission({ label: 'Sans date de fin', risks: ['no_end_date'] })
    show([target], ['mission'], onOpen)

    await user.click(screen.getByRole('button', { name: /actions.*sans date de fin/i }))
    await user.click(screen.getByRole('menuitem', { name: /renseigner une donnée/i }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(target)
  })

  it('propose aussi « Renseigner une donnée » quand le bon de commande manque', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    show([mission({ label: 'PO manquant', risks: ['missing_po'] })], ['mission'])

    await user.click(screen.getByRole('button', { name: /actions.*po manquant/i }))

    expect(screen.getByRole('menuitem', { name: /renseigner une donnée/i })).toBeInTheDocument()
  })

  it('n’affiche PAS « Renseigner une donnée » quand rien ne manque', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    show([mission({ label: 'Fiche complète', risks: ['margin_at_risk'] })], ['mission'])

    await user.click(screen.getByRole('button', { name: /actions.*fiche complète/i }))

    expect(screen.queryByRole('menuitem', { name: /renseigner une donnée/i })).not.toBeInTheDocument()
  })
})

/**
 * LE VOCABULAIRE ET LES DATES — #1351, #1352, #1353.
 *
 * Trois retours sur le même tableau, et la même cause : la cellule montre la
 * donnée TELLE QU'ELLE ARRIVE. « Qui est dessus » est le nom qu'on donne à une
 * colonne quand on se parle entre soi ; « 2026-10-01 » est le format d'un
 * transport, pas d'une lecture.
 *
 * ⚠️ Le temps est FIGÉ ici. `daysUntilEnd` lit l'horloge : sans `setSystemTime`,
 * ce test dirait « J-30 » aujourd'hui et « J-29 » demain, et rougirait un matin
 * sans que personne n'ait touché au code. C'est le piège déjà payé sur un test
 * qui dépendait du fuseau.
 */
describe('MissionsTable — ce que la cellule DIT (#1351, #1352, #1353)', () => {
  beforeEach(() => {
    cleanup()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('nomme la colonne « Consultant », pas « Qui est dessus » (#1351)', () => {
    render(<MissionsTable missions={[mission()]} columns={ALL} onOpen={() => undefined} />)
    expect(screen.getByRole('columnheader', { name: 'Consultant' })).toBeInTheDocument()
    expect(screen.queryByText('Qui est dessus')).not.toBeInTheDocument()
  })

  it('n’affiche JAMAIS une date en ISO brut (#1352)', () => {
    render(
      <MissionsTable
        missions={[mission({ ends_on: '2026-10-01', started_on: '2026-05-08', renewal: 'j30' })]}
        columns={ALL}
        onOpen={() => undefined}
      />,
    )
    expect(screen.queryByText('2026-10-01')).not.toBeInTheDocument()
    expect(screen.queryByText('2026-05-08')).not.toBeInTheDocument()
    // #2979 (RBD) — l'échéance tient sur une ligne : date courte visible, date complète (avec l'année) au title.
    expect(screen.getByText('1 oct.')).toBeInTheDocument()
    expect(document.querySelector('[title$="· 1 oct. 2026"]')).not.toBeNull()
    expect(screen.getByText('8 mai 2026')).toBeInTheDocument()
  })

  it('fait passer le temps RESTANT avant la date — c’est lui qui décide (#1353)', () => {
    render(
      <MissionsTable
        missions={[mission({ ends_on: '2026-10-01', renewal: 'j30' })]}
        columns={ALL}
        onOpen={() => undefined}
      />,
    )
    // 30 jours du 1er septembre au 1er octobre.
    expect(screen.getByText('J-30')).toBeInTheDocument()
  })

  it('sait dire NON : une échéance DÉPASSÉE ne s’écrit pas « J--5 »', () => {
    render(
      <MissionsTable
        missions={[mission({ ends_on: '2026-08-27', renewal: 'overdue' })]}
        columns={ALL}
        onOpen={() => undefined}
      />,
    )
    expect(screen.queryByText(/J--/)).not.toBeInTheDocument()
    expect(screen.getByText(/dépassée/i)).toBeInTheDocument()
  })

  it('sans date de fin, aucun compte à rebours inventé', () => {
    render(<MissionsTable missions={[mission({ ends_on: null })]} columns={ALL} onOpen={() => undefined} />)
    expect(screen.queryByText(/^J-/)).not.toBeInTheDocument()
  })
})

/**
 * LE LOGO DU COMPTE — #1349.
 *
 * Ce test ne vérifie pas que `CompanyAvatar` sait afficher une image : il a le
 * sien. Il vérifie que la colonne le NOURRIT — c'est la moitié qui manquait, et
 * la seule qui ne se voit pas quand on la rate, puisqu'un avatar sans source
 * rend l'initiale, exactement comme avant le correctif.
 *
 * ⚠️ Il vérifie donc les PROPS et pas un `<img>` : Radix ne monte l'image
 * qu'une fois chargée, et jsdom ne charge jamais rien. Chercher un `<img>` ici
 * aurait produit une garde qui échoue sur du code juste — et qu'on aurait
 * « réparée » en la supprimant.
 */
describe('MissionsTable — la colonne Compte NOURRIT son avatar (#1349)', () => {
  beforeEach(() => {
    cleanup()
    avatarProps.length = 0
  })

  it('passe le logo ET le site, pas seulement le nom', () => {
    render(
      <MissionsTable
        missions={[
          mission({ accountName: 'ACME', accountLogoUrl: 'https://cdn/acme.png', accountWebsite: 'acme.com' }),
        ]}
        columns={ALL}
        onOpen={() => undefined}
      />,
    )
    expect(screen.getByText('ACME')).toBeInTheDocument()
    expect(avatarProps).toContainEqual({ name: 'ACME', logoUrl: 'https://cdn/acme.png', website: 'acme.com' })
  })

  it('transmet le SITE seul quand il n’y a pas de logo — c’est le repli favicon', () => {
    // N'envoyer que `logo_url` priverait de repli tous les comptes qui n'ont
    // qu'un site. C'est pour ça que les DEUX champs voyagent.
    render(
      <MissionsTable
        missions={[mission({ accountName: 'ACME', accountLogoUrl: null, accountWebsite: 'acme.com' })]}
        columns={ALL}
        onOpen={() => undefined}
      />,
    )
    expect(avatarProps).toContainEqual({ name: 'ACME', logoUrl: null, website: 'acme.com' })
  })

  it('sait dire NON : sans NOM de compte, aucun avatar du tout', () => {
    render(<MissionsTable missions={[mission({ accountName: null })]} columns={ALL} onOpen={() => undefined} />)
    expect(avatarProps).toHaveLength(0)
  })
})

/**
 * UNE ALERTE SORT QUELQUE PART — #1354, #1355, #1356, #1357.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE GESTE QUI ÉTAIT EMPÊCHÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Quatre retours pointent la MÊME chose sous quatre angles : le tableau
 * affichait « Renouvellement non engagé », « Sans date de fin », « Marge non
 * mesurée » — et on ne pouvait rien en faire. « Aucune alerte sans porte de
 * sortie » (#1355), mot pour mot.
 *
 * Rien de neuf n'a été inventé pour y répondre : la dérivation
 * (`activeMissionNextAction`), la correspondance action → écran
 * (`nextActionLink`), la primitive (`NextAction`) et la route (`/missions/$id`)
 * existaient toutes. Il manquait le champ dans la réponse de
 * `GET /delivery/missions` — le défaut n°1 du dépôt, du code juste que personne
 * ne NOURRIT.
 */
describe('MissionsTable — une alerte porte sa sortie (#1354, #1355, #1356, #1357)', () => {
  beforeEach(cleanup)

  it('rend la prochaine action en LIEN, vers le dossier de LA mission', () => {
    render(
      <MissionsTable
        missions={[mission({ id: 'm-42', renewal: 'j30', nextAction: 'renew_now' })]}
        columns={['mission', 'nextAction']}
        onOpen={() => undefined}
      />,
    )
    const link = screen.getByRole('link', { name: 'Engager le renouvellement' })
    // Le paramètre est RÉSOLU : un `href` contenant « $id » est un lien mort
    // qui a l'air d'un lien.
    expect(link.getAttribute('href')).toBe('/missions/m-42')
  })

  it('« Sans date de fin » mène à l’endroit où la date se pose (#1354)', () => {
    render(
      <MissionsTable
        missions={[mission({ id: 'm-7', ends_on: null, renewal: 'unknown', nextAction: 'set_end_date' })]}
        columns={['mission', 'endsOn', 'nextAction']}
        onOpen={() => undefined}
      />,
    )
    expect(screen.getByRole('link', { name: 'Poser une date de fin' }).getAttribute('href')).toBe('/missions/m-7')
  })

  it('sait dire NON : « rien à engager » reste du TEXTE, jamais un lien', () => {
    // Un lien sur une ligne calme promettrait un geste qui n'existe pas, et
    // ferait douter de tous les autres liens de la page.
    //
    // ⚠️ #2408.81 — la ligne porte désormais TOUJOURS « Demander à Laura »
    // (voir le describe dédié plus bas) : la portée de CE test se resserre
    // sur la cellule « Prochaine action » elle-même, qui reste le seul endroit
    // où un lien promettrait un geste qui n'existe pas.
    render(
      <MissionsTable
        missions={[mission({ renewal: 'far', nextAction: 'none' })]}
        columns={['mission', 'nextAction']}
        onOpen={() => undefined}
      />,
    )
    expect(screen.getByText('Rien à engager maintenant')).toBeInTheDocument()
    const cells = screen.getAllByRole('cell')
    expect(within(cells[1] as HTMLElement).queryByRole('link')).not.toBeInTheDocument()
  })

  it('une API plus ancienne que cet écran dit « non mesuré », jamais « rien à faire »', () => {
    // Le web se déploie une dizaine de minutes avant l'API. Conclure « aucune
    // action » d'un champ absent serait un verdict tiré d'un silence.
    const stale = mission()
    delete (stale as { nextAction?: string }).nextAction
    render(<MissionsTable missions={[stale]} columns={['mission', 'nextAction']} onOpen={() => undefined} />)
    expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
    const cells = screen.getAllByRole('cell')
    expect(within(cells[1] as HTMLElement).queryByRole('link')).not.toBeInTheDocument()
  })

  it('la marge non mesurée porte sa cause ET sa porte (#1356)', () => {
    render(
      <MissionsTable
        missions={[mission({ id: 'm-9', marginPercent: null })]}
        columns={['mission', 'margin']}
        onOpen={() => undefined}
      />,
    )
    expect(screen.getByText(/^non mesurée/)).toBeInTheDocument()
    expect(screen.getByText(/Coût chargé manquant/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Compléter' }).getAttribute('href')).toBe('/missions/m-9')
  })

  it('sait dire NON : sans le DROIT financier, aucun « Compléter » (#1356)', () => {
    // Aller remplir la fiche ne changerait rien : c'est un droit, pas une
    // saisie manquante. Un CTA enverrait chercher une panne qui n'existe pas.
    const withoutRight = mission()
    delete (withoutRight as { marginPercent?: number | null }).marginPercent
    render(<MissionsTable missions={[withoutRight]} columns={['mission', 'margin']} onOpen={() => undefined} />)
    expect(screen.queryByRole('link', { name: 'Compléter' })).not.toBeInTheDocument()
    expect(screen.getByText(/périmètre/i)).toBeInTheDocument()
  })

  it('ne montre qu’UN risque, et COMPTE le reste (#1365, lignes uniformes #2979)', () => {
    render(
      <MissionsTable
        missions={[
          mission({
            status: 'active',
            risks: ['no_end_date', 'timesheet_disputed', 'margin_unknown'],
          }),
        ]}
        columns={['mission', 'risks']}
        onOpen={() => undefined}
      />,
    )
    expect(screen.getByText('Sans date de fin')).toBeInTheDocument()
    // Coupé, jamais tu : sans le compteur, la liste paraîtrait complète.
    expect(screen.queryByText('Relevé contesté')).not.toBeInTheDocument()
    expect(screen.queryByText('Marge non mesurée')).not.toBeInTheDocument()
    expect(screen.getByText('+2 autres')).toBeInTheDocument()
  })
})

/**
 * LA COLONNE « CONSULTANT » PENDANT LA BASCULE DE FORME — trouvé en recette
 * live le 04/09/2026, dix minutes après le déploiement.
 *
 * Le web part une dizaine de minutes avant l'API. Pendant cette fenêtre le
 * champ portait encore des CHAÎNES, la cellule lisait `person.fullName`, et
 * toutes les lignes affichaient « ? » — moins que la veille.
 */
describe('MissionsTable — le consultant survit à une API plus ancienne', () => {
  it('affiche le NOM quand le serveur envoie encore des chaînes', () => {
    show([mission({ assignees: ['Julien Roussel'] })], ['mission', 'staffing'])
    expect(screen.getByText('Julien Roussel')).toBeInTheDocument()
  })

  /**
   * ⚠️ Et PAS de lien : sans identité, on n'ouvre pas la fiche du premier
   * homonyme du vivier. Le nom vaut mieux qu'un « ? » ; un mauvais lien est
   * pire que pas de lien.
   */
  it('sait dire NON : sans identité, aucun lien vers un profil deviné', () => {
    show([mission({ assignees: ['Julien Roussel'] })], ['mission', 'staffing'])
    expect(screen.queryByRole('link', { name: /julien roussel/i })).not.toBeInTheDocument()
  })
})

/**
 * #1804 — « faut que la liste dépasse pas en largeur, quitte à mettre sur
 * deux lignes des titres et tout ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A ÉTÉ MESURÉ, ET POURQUOI CE N'EST PAS `min-width: auto`
 * ─────────────────────────────────────────────────────────────────────────
 * jsdom ne calcule aucune largeur (`scrollWidth`/`clientWidth` valent 0
 * partout) : ce fichier ne peut donc pas rejouer la mesure lui-même. Elle a
 * été faite dans un vrai navigateur (Chrome, la CSS Tailwind RÉELLEMENT
 * compilée du dépôt, une reproduction fidèle du DOM produit par
 * `ResponsiveTable` + les colonnes par défaut de ce fichier, deux missions au
 * nom et au compte réalistes et longs) :
 *
 *   AVANT — aucune colonne ne déclarait de largeur, et le nom de mission
 *   portait `truncate` (donc `white-space: nowrap`) : la zone défilante de
 *   `ResponsiveTable` mesurait 1 538 px de contenu pour 1 213 px visibles —
 *   325 px de défilement horizontal pour huit missions par défaut, sans
 *   qu'aucune colonne optionnelle ne soit cochée.
 *
 *   APRÈS — chaque colonne par défaut porte un `max-w-[…]` en `rem`
 *   (appliqué au `<th>` ET au `<td>` par `ResponsiveTable`, même mécanisme
 *   que GA-118) ET le nom de mission / de compte peuvent passer à la ligne
 *   (`whitespace-normal break-words`, `truncate` retiré) : la même mesure
 *   rend 1 213 px pour 1 213 px — plus aucun défilement.
 *
 * Le mécanisme qui a fait la différence, et qui n'est PAS `min-width: auto` :
 * un `<table>` sans `table-fixed` (le cas de `ResponsiveTable`) calcule la
 * largeur de chaque colonne sur son contenu le plus large ; un `max-width`
 * posé sur un descendant n'entre dans ce calcul QUE si le texte peut passer à
 * la ligne. Une colonne bornée dont le contenu reste `nowrap` continue de
 * pousser le tableau — mesuré avec les deux repros ci-dessus.
 *
 * Ce test ne peut donc pas REJOUER la mesure ; il vérifie que le mécanisme
 * mesuré est bien celui qui a été livré : chaque colonne affichée par défaut
 * porte une borne réelle et NOMBRÉE (pas seulement une classe présente — la
 * valeur est extraite et additionnée), et les deux colonnes à texte libre
 * (mission, compte) acceptent explicitement le retour à la ligne.
 */
describe('MissionsTable — #1804, la liste par défaut tient dans sa largeur', () => {
  beforeEach(cleanup)

  /** `max-w-[15rem]` → 15, `w-[145px]` → 9.0625 (145 / 16). Rend `null` si la
   *  classe est absente ou illisible — jamais `0`, qui se lirait comme une
   *  borne réelle.
   *
   *  #2979 (lot P03, 07/10) — la colonne Marge est passée de `max-w-[6rem]`
   *  (déjà SANS effet depuis le 06/10 : son état non mesuré porte un titre et
   *  un lien `nowrap`, et un `max-width` n'entre dans le calcul de largeur
   *  d'une table sans `table-fixed` QUE si le contenu peut passer à la ligne —
   *  voir le commentaire de ce describe) à `w-[145px]`, la largeur RÉELLEMENT
   *  mesurée. Le motif reconnaît les deux unités : une colonne bornée en `px`
   *  n'est pas moins réelle qu'une colonne bornée en `rem`. */
  function maxWidthRem(className: string | null): number | null {
    const rem = className?.match(/max-w-\[(\d+(?:\.\d+)?)rem\]/)
    if (rem) return Number(rem[1])
    const px = className?.match(/\bw-\[(\d+(?:\.\d+)?)px\]/)
    return px ? Number(px[1]) / 16 : null
  }

  /**
   * Le plancher mesuré : 76 rem de colonnes par défaut ont rempli exactement
   * 1 213 px de zone défilante sans déborder, dans un vrai navigateur, SUR LE
   * DOM d'avant le 06/10/2026. 80 rem laissait une marge de 4 rem (64 px).
   *
   * #2979 (lot P03, 07/10) — la colonne Marge déclare depuis le 06/10 un état
   * non mesuré à contenu `nowrap` (titre + lien « Compléter ») : son `max-w`
   * d'alors (6 rem) n'empêchait déjà plus le rendu réel d'atteindre 145 px
   * (9,0625 rem) — un fait qui n'était pas NOMMÉ dans la somme déclarée ici.
   * Ce lot le nomme : la somme ci-dessous passe de 79 à 82,0625 rem (+3,0625,
   * exactement l'écart entre l'ancien `max-w` et la largeur réelle). Le
   * plafond suit avec la même marge de sécurité qu'avant (+4 rem arrondis sur
   * le nouveau plancher connu) plutôt que de rester fixé sur une mesure dont
   * cette colonne était déjà sortie. ⚠️ La mesure RÉELLE en navigateur
   * (1 213 px, « sans défilement ») n'a pas été refaite depuis — elle reste
   * due, et est nommée comme telle dans l'issue #2979.
   */
  const MEASURED_SAFE_SUM_REM = 84

  it('CHAQUE colonne affichée par défaut porte une borne de largeur réelle, en rem', () => {
    show(
      [mission({ label: 'Renfort Data Engineering — Plateforme Cloud AWS, lot migration Snowflake' })],
      [...DEFAULT_MISSION_COLUMNS],
    )
    const headers = screen.getAllByRole('columnheader')
    // Le dernier entête est la porte de fin de ligne (« Ouvrir »), volontairement
    // hors de `MISSION_COLUMN_KEYS' — elle n'a pas à porter de plancher, sa
    // largeur est celle de son icône (`w-px`).
    const defaultHeaders = headers.slice(0, DEFAULT_MISSION_COLUMNS.length)
    const widths = defaultHeaders.map(header => maxWidthRem(header.getAttribute('class')))

    // Si ce test tombe : une colonne du jeu par défaut n'a plus de plancher
    // numérique — c'est exactement l'état d'AVANT, mesuré à 325 px de
    // défilement horizontal pour huit missions sans aucune colonne optionnelle.
    expect(widths.every(width => typeof width === 'number' && width > 0)).toBe(true)

    const sum = widths.reduce<number>((acc, width) => acc + (width ?? 0), 0)
    // Si ce test tombe : la somme des plancher dépasse la largeur qui a été
    // mesurée SANS défilement dans un vrai navigateur — une colonne a grossi
    // sans que la mesure ait été refaite.
    expect(sum).toBeLessThanOrEqual(MEASURED_SAFE_SUM_REM)
  })

  // #4291.1 (recette prod 20/10) — « noms de mission enveloppés sur 3-4 lignes dans une cellule de 108 px » : 11 rem
  // ne laissait que ~150 px au nom. La colonne réserve 12 rem, le plafond d'E3 (≈ 170 px de texte) : deux lignes pour un
  // intitulé de 45 caractères, jamais une ellipse (le nom n'est pas re-tronqué) — et la somme des bornes reste sous la mesure sûre.
  it('#4291.1 — la colonne Mission réserve 12 rem (plafond E3) : deux lignes pour un intitulé de 45 caractères, sans troncature', () => {
    show([mission({ label: 'Data office — renfort en ingénierie des données' })], ['mission'])
    const header = screen.getAllByRole('columnheader')[0]!
    expect(maxWidthRem(header.getAttribute('class'))).toBe(12)
    expect(header.getAttribute('class')?.split(' ')).toContain('w-[12rem]')
    const title = screen.getByRole('button', {
      name: 'Data office — renfort en ingénierie des données',
    })
    expect(title.className).not.toMatch(/(truncate|line-clamp-\d)\b/)
  })

  it('sait dire NON : une somme au-dessus de la mesure réelle est refusée', () => {
    // Témoin symétrique à GA-118 — la garde doit savoir REFUSER, pas seulement
    // accepter le cas qu'elle protège.
    const tooWide = Array.from({ length: DEFAULT_MISSION_COLUMNS.length }, () => 13)
    const sum = tooWide.reduce((acc, width) => acc + width, 0)
    expect(sum).toBeGreaterThan(MEASURED_SAFE_SUM_REM)
  })

  it('le nom de la mission — le plus long des champs libres — peut passer à la ligne', () => {
    // #1804, mot pour mot : « quitte à mettre sur deux lignes des titres ».
    // `truncate` (donc `white-space: nowrap`) est précisément ce qui, mesuré
    // en navigateur, faisait ignorer le plancher de la colonne par le calcul
    // AUTO du tableau.
    show([mission({ label: 'Renfort Data Engineering — Plateforme Cloud AWS, lot migration Snowflake' })], ['mission'])
    const title = screen.getByRole('button', {
      name: 'Renfort Data Engineering — Plateforme Cloud AWS, lot migration Snowflake',
    })
    expect(title.className).not.toMatch(/\btruncate\b/)
    expect(title.className).toMatch(/whitespace-normal/)
  })

  // #1804 voulait que le nom du compte passe à la ligne ; #2979 (RAX, recette G4 11/10 : ligne de 101 px
  // pour « DASSAULT / AVIATION ») le renverse POUR CETTE COLONNE seule : une ligne, ellipse, `title`.
  // Sûr parce que la table est en `table-fixed` (la largeur `w-` borne la cellule, `truncate` ne la gonfle pas).
  it('#2979 — le nom du compte (colonne cochée) passe à la ligne, sans ellipse ; le nom entier reste au title', () => {
    show([mission({ accountName: 'Société Générale Global Solutions Centre' })], ['mission', 'account'])
    const name = screen.getByText('Société Générale Global Solutions Centre')
    expect(name.className).not.toMatch(/\b(truncate|text-ellipsis)\b/)
    expect(name).toHaveAttribute('title', 'Société Générale Global Solutions Centre')
  })
})

/**
 * #1804 (RÉSIDUEL) — UNE CELLULE NE PEINT PAS HORS D'ELLE-MÊME.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI RESTAIT, MESURÉ EN PRODUCTION LE 09/09/2026 SUR `/missions`
 * ─────────────────────────────────────────────────────────────────────────
 * Le correctif ci-dessus fait tenir la TABLE (1 206px de contenu pour
 * 1 206px visibles). Il restait deux CELLULES dont le contenu — une pastille,
 * un lien — débordait de sa propre cellule : « Risques »
 * (« Renouvellement non engagé », 182px de contenu pour 160px déclarés,
 * `max-w-[10rem]`) et « Prochaine action » (187px pour 176px,
 * `max-w-[11rem]`). `overflow-x: visible` par défaut sur une cellule laissait
 * le texte peindre sur la colonne voisine — « les deux illisibles ».
 *
 * jsdom ne calcule aucune largeur (`scrollWidth`/`clientWidth` valent 0
 * partout) — ce fichier ne peut donc pas REJOUER la mesure, exactement comme
 * le describe #1804 ci-dessus. Il vérifie à la place la STRUCTURE du
 * mécanisme livré (`ClippedBadge`, et `overflow-hidden` passé au `<Link>` de
 * `NextAction`) : `overflow-hidden` sur l'élément qui doit se laisser réduire,
 * un descendant `.truncate` qui porte l'ellipse, et le texte COMPLET qui reste
 * accessible (`title`, et le nœud texte lui-même — jamais retiré du DOM, donc
 * toujours annoncé en entier par un lecteur d'écran malgré la troncature
 * visuelle).
 */
describe('MissionsTable — #1804 (résiduel), une cellule ne peint pas hors d’elle-même', () => {
  beforeEach(cleanup)

  it('la pastille de risque passe à la ligne plutôt que de déborder de sa cellule (E3 : jamais d’ellipse)', () => {
    show([mission({ status: 'active', risks: ['renewal_not_started'] })], ['mission', 'risks'])
    const label = screen.getByText('Renouvellement non engagé')
    // Le texte complet reste dans le DOM — un lecteur d'écran l'annonce en
    // entier même si l'ellipse le coupe à l'écran.
    // #4191 (E3) — renverse #2979 : la pastille passe à la ligne dans sa colonne réservée, jamais d'ellipse ;
    // le texte entier reste au `title`.
    expect(label.className).not.toMatch(/\btruncate\b/)
    const badge = label.parentElement as HTMLElement
    expect(badge.className).toMatch(/whitespace-normal/)
    // Le texte complet reste accessible au pointeur — même geste que
    // `MissionMargin.tsx` (`title={t('table.marginCompleteHint')}`).
    expect(badge.getAttribute('title')).toBe('Renouvellement non engagé')
  })

  it('la colonne « Prochaine action » clippe le lien plutôt que de le laisser déborder', () => {
    show([mission({ id: 'm-42', renewal: 'j30', nextAction: 'renew_now' })], ['mission', 'nextAction'])
    const link = screen.getByRole('link', { name: 'Engager le renouvellement' })
    // #3559 (recette prod 03/10) — l'ellipse « La fin est passée — tr… » rendait la prochaine action
    // illisible : elle passe désormais à la ligne, dans sa cellule, sans jamais la déborder.
    expect(link.className).toMatch(/\bmax-w-full\b/)
    // #4191 (E3) — plus de borne à deux lignes ni de `overflow-hidden` : la largeur est RÉSERVÉE par la
    // colonne, le libellé passe à la ligne en entier.
    expect(link.className).not.toMatch(/\bmax-h-10\b|\boverflow-hidden\b/)
    expect(link.querySelector('span')?.className).not.toMatch(/\bline-clamp-\d\b/)
    expect(link.className).not.toMatch(/\btruncate\b/)
    expect(link.querySelector('.truncate')).toBeNull()
    expect(link.querySelector('.whitespace-normal')).not.toBeNull()
  })

  it('#3559 — « La fin est passée — trancher maintenant » se lit en ENTIER, jamais coupé par une ellipse', () => {
    show([mission({ id: 'm-3', nextAction: 'renew_now' })], ['mission', 'nextAction'])
    const label = screen.getByText('Engager le renouvellement')
    expect(label.className).toMatch(/\bbreak-words\b/)
    expect(label.className).not.toMatch(/\btruncate\b/)
    expect(label.textContent).toBe('Engager le renouvellement')
  })

  // #3546.3 / #2986 — recette prod Y3 (02/10) : « La fin est passée — trancher
  // maintenant » (cellule de 176 px) recouvrait « 38 % ». `overflow-hidden` seul
  // ne borne pas un `inline-flex` dont le min-content reste celui du texte
  // entier : il lui faut aussi `max-w-full`, et un libellé SANS lien (un
  // `<span>` en ligne) doit devenir un bloc pour que l'ellipse s'engage.
  it('la prochaine action ne dépasse jamais sa cellule : lien ET libellé sans destination', () => {
    show([mission({ id: 'm-1', nextAction: 'renew_now' })], ['mission', 'nextAction'])
    const link = screen.getByRole('link', { name: 'Engager le renouvellement' })
    expect(link.className).toMatch(/\bmax-w-full\b/)
    expect(link.getAttribute('title')).toBe('Engager le renouvellement')
    cleanup()
    show([mission({ id: 'm-2', nextAction: 'none' })], ['mission', 'nextAction'])
    const plain = screen.getByText('Rien à engager maintenant')
    // #4191 (E3) — renverse #2979 : pas de borne de lignes ni d'ellipse sur cette colonne.
    expect(plain.className).not.toMatch(/\bline-clamp-\d\b|\bmax-h-10\b|\boverflow-hidden\b/)
    expect(plain.className).toMatch(/\bmax-w-full\b/)
    // #3559 — à la ligne, plus d'ellipse : le libellé sans destination se lit en entier aussi.
    expect(plain.className).toMatch(/\bwhitespace-normal\b/)
    expect(plain.className).not.toMatch(/\btruncate\b/)
    expect(plain.getAttribute('title')).toBe('Rien à engager maintenant')
  })

  // #3546.3 (recette prod 09/10) — colonne « Consultant » (109 px) débordant dans
  // « Statut » sur 9/11 lignes de la vue « En cours » (« Léa Marchand » chevauchait
  // « En cours »). Cause : `truncate` (donc `white-space: nowrap`) sur le nom du
  // consultant empêchait le calcul AUTO du tableau de considérer un point de
  // rupture — même défaut déjà corrigé sur `mission` (#1804) et `account`.
  it('le nom du consultant passe à la ligne (jamais coupé, #4191 D4) plutôt que de déborder dans la colonne voisine', () => {
    show([mission({ assignees: ['Léa Marchand'] })], ['mission', 'staffing'])
    const label = screen.getByText('Léa Marchand')
    expect(label.className).not.toMatch(/\btruncate\b/)
    expect(label.className).not.toMatch(/\bline-clamp-\d\b/)
    expect(label.className).toMatch(/\bbreak-words\b/)
    expect(label.getAttribute('title')).toBe('Léa Marchand')
  })

  it('le statut est du TEXTE, pas une pastille (#2979, pas de mur de pastilles) — borné à deux lignes', () => {
    show([mission({ status: 'onboarding' })], ['mission', 'status'])
    const label = screen.getByText('Démarrage')
    expect(label.className).not.toMatch(/\btruncate\b/)
    expect(label.className).toMatch(/\bline-clamp-2\b/)
    expect(label.className).not.toMatch(/\bwhitespace-nowrap\b/)
  })

  it('la pastille « Nature du contrat » clippe — mesuré : l’anglais « Permanent placement » (20 caractères) dépasse largement le plancher de 7rem', () => {
    show([mission({ contract_kind: 'recrutement' })], ['mission', 'contractKind'])
    const label = screen.getByText('Recrutement')
    expect(label.className).not.toMatch(/\btruncate\b/)
  })

  it('« Date de fin manquante » (rendue par MissionDeadline dans la colonne Échéance) passe à la ligne aussi', () => {
    show([mission({ ends_on: null })], ['mission', 'endsOn'])
    const label = screen.getByText('Date de fin manquante')
    // #4191 (E3) — plus d'ellipse : la pastille passe à la ligne ; le titre complet reste au `title`.
    expect(label.className).not.toMatch(/\btruncate\b/)
  })

  it('« Personne d’affecté » (colonne Consultant) reste dans le même mécanisme défensif', () => {
    show([mission({ assignees: [] })], ['mission', 'staffing'])
    const label = screen.getByText('Personne d’affecté')
    expect(label.className).not.toMatch(/\btruncate\b/)
  })
})

/**
 * #2408.88 — deux des dix scénarios de la recette : une mission seule, deux
 * cents. `MissionsTable` ne pagine ni ne tronque : elle rend le tableau qu'on
 * lui passe. Une coupe silencieuse au-delà d'un certain volume serait
 * exactement la « absence qui ne fait aucune ligne » que la doctrine interdit
 * — sauf qu'ici l'absence serait FAUSSE : la ligne existe, elle a juste
 * disparu du rendu.
 */
describe('MissionsTable — l’échelle ne perd aucune ligne (#2408.88)', () => {
  beforeEach(cleanup)

  it('rend une mission seule', () => {
    show([mission({ label: 'Seule au monde' })], ['mission'])
    expect(screen.getAllByRole('button', { name: 'Seule au monde' })).toHaveLength(1)
  })

  it('rend deux cents missions, aucune de moins', () => {
    const rows = Array.from({ length: 200 }, (_, index) =>
      mission({ id: `mission-${index}`, label: `Mission ${index}` }),
    )
    show(rows, ['mission'])
    expect(screen.getAllByRole('button', { name: /^Mission \d+$/ })).toHaveLength(200)
  })
})

/**
 * #2408.88 — le scénario « données complètes ». Une mission dont CHAQUE champ
 * affiché a été saisi ne doit laisser flotter aucun texte d'ABSENCE : ni « non
 * mesuré », ni « non renseigné », ni « non lu », ni « personne », ni
 * « manquant », ni « sans date ». Ce test ne vérifie pas ce qui s'affiche
 * (chaque champ a déjà son test dédié plus haut) mais ce qui ne DOIT PAS
 * s'afficher — la moitié du contrat qu'un test positif ne peut pas prouver.
 */
describe('MissionsTable — une mission aux données complètes (#2408.88)', () => {
  beforeEach(cleanup)

  it('ne laisse flotter aucun texte d’absence quand tout est saisi', () => {
    const complete = mission({
      status: 'active',
      started_on: '2026-01-15T00:00:00.000Z',
      ends_on: '2027-06-30T00:00:00.000Z',
      contract_kind: 'regie',
      role_title: 'Lead développeur',
      accountName: 'Airbus',
      accountWebsite: 'https://airbus.com',
      ownerName: 'Claire Dupont',
      managerName: 'Sofia Ben Ali',
      assignees: [{ id: 'c-1', fullName: 'Julien Roussel', photoUrl: null }],
      risks: [],
      nextAction: 'none',
      renewal_status: 'renouvele',
      marginPercent: 22.5,
      stage_entered_at: '2026-08-01T00:00:00.000Z',
      // #2408.33 — la colonne satisfaction (L15) : « complète » = un niveau déclaré.
      satisfaction: { client: 'high', consultant: 'medium' },
    })
    show([complete], [...MISSION_COLUMN_KEYS])

    for (const absence of [
      /non mesuré/i,
      /non renseigné/i,
      /non lu/i,
      /hors périmètre/i,
      /personne d.affecté/i,
      /manquant/i,
      /sans date/i,
      /périmètre/i,
    ]) {
      expect(screen.queryByText(absence), `ne devrait pas apparaître : ${absence}`).not.toBeInTheDocument()
    }
  })
})

/**
 * #4191 (recette 15/10, D4) — À 1280-1440 px, « Éché… », « Yanis… », la marge
 * coupée. DÉCISION : un nom de consultant, un libellé de colonne et la cause
 * d'une marge manquante ne sont JAMAIS tronqués (ils passent à la ligne) ; si la
 * largeur manque, ce sont les colonnes secondaires qui s'effacent (défauts
 * compacts de `useMissionColumns`), pas le texte qui se coupe.
 */
describe('MissionsTable — D4, jamais de « … » sur un nom, une échéance ou une marge', () => {
  beforeEach(cleanup)

  it('le nom d’un consultant passe à la ligne au lieu d’être coupé', () => {
    show(
      [mission({ assignees: [{ id: 'c-1', fullName: 'Yanis Bensaïd-Marchand', photoUrl: null }] })],
      ['mission', 'staffing'],
    )
    const name = screen.getByText('Yanis Bensaïd-Marchand')
    expect(name.className).not.toMatch(/line-clamp|truncate/)
    expect(name.className).toMatch(/break-words/)
  })

  it('la colonne Échéance RÉSERVE 9 rem (table-fixed ignore max-w) : « Éché… » ne revient pas', () => {
    show([mission({ ends_on: '2026-12-31' })], ['mission', 'endsOn'])
    const header = screen.getByRole('columnheader', { name: /échéance/i })
    expect(header.className).toMatch(/(^|\s)w-\[9rem\]/)
  })

  it('la cause d’une marge non mesurée n’est pas coupée', () => {
    show([mission({ marginPercent: null })], ['mission', 'margin'])
    // F2 : la cause est portée par l'infobulle et le lecteur d'écran, jamais coupée.
    expect(screen.getByText(/^non mesurée/).className).not.toMatch(/truncate|text-ellipsis/)
  })

  it('les colonnes affichées par défaut tiennent dans la somme mesurée (84 rem), mission comprise', () => {
    show([mission()], [...DEFAULT_MISSION_COLUMNS])
    const widths = screen
      .getAllByRole('columnheader')
      .slice(0, DEFAULT_MISSION_COLUMNS.length)
      .map(h => {
        const cls = h.getAttribute('class') ?? ''
        const rem = cls.match(/max-w-\[(\d+(?:\.\d+)?)rem\]/)
        if (rem) return Number(rem[1])
        const px = cls.match(/\bw-\[(\d+(?:\.\d+)?)px\]/)
        return px ? Number(px[1]) / 16 : 0
      })
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(84)
  })
})

/**
 * #4191 (recette 2, E3) — « Échéance dépassée », « Renouvellement non engagé », « Date de fin manquante »,
 * « Facturation bloquée ce mois-ci » et les dates étaient coupés par une ellipse ; Risques, Prochaine action
 * et Renouvellement étaient figées à 82 px (« Renouvell/ement » coupé au milieu du mot) pendant que
 * Mission faisait 286 px et Marge 160 px.
 *
 * DÉCISION : ces trois colonnes RÉSERVENT une largeur (`w-` : `table-fixed` ignore `max-w`) qui tient leur
 * libellé le plus long sur 2 lignes ; Mission et Marge cèdent la place ; une pastille passe à la ligne, jamais
 * d'ellipse ; l'en-tête ne se coupe jamais au milieu d'un mot ; le texte long de « non mesuré » va à l'infobulle.
 */
describe('MissionsTable — E3, ni ellipse ni mot coupé sur Risques / Prochaine action / Renouvellement', () => {
  beforeEach(cleanup)

  const ELLIPSIS = /\b(truncate|text-ellipsis|line-clamp-\d)\b/
  const remOf = (cls: string | null) => Number(cls?.match(/(?:^|\s)w-\[(\d+(?:\.\d+)?)rem\]/)?.[1] ?? 0)

  it('Risques, Prochaine action et Renouvellement RÉSERVENT une largeur lisible (≥ 9 rem)', () => {
    show([mission()], ['mission', 'risks', 'nextAction', 'renewalStatus'])
    for (const name of [/risques/i, /prochaine action/i, /renouvellement/i]) {
      const header = screen.getByRole('columnheader', { name })
      expect(remOf(header.getAttribute('class')), String(name)).toBeGreaterThanOrEqual(9)
    }
  })

  it('Mission et Marge cèdent la place : plus de 20 % ni de 160 px', () => {
    show([mission()], ['mission', 'margin'])
    const mission_ = screen.getByRole('columnheader', { name: /^mission$/i })
    const margin = screen.getByRole('columnheader', { name: /marge/i })
    expect(mission_.className).not.toMatch(/w-\[20%\]/)
    expect(remOf(mission_.getAttribute('class'))).toBeLessThanOrEqual(12)
    expect(margin.className).not.toMatch(/w-\[160px\]/)
  })

  it('aucun en-tête ne se coupe au milieu d’un mot (ni break-words, ni break-all, ni hyphens)', () => {
    show([mission()], ['mission', 'risks', 'nextAction', 'margin', 'renewalStatus'])
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header.className).not.toMatch(/\bbreak-words\b|\bbreak-all\b|\bhyphens-/)
    }
  })

  it('les cellules Risques / Prochaine action / Échéance / Renouvellement ne portent aucune ellipse', () => {
    show(
      [
        mission({
          ends_on: '2020-01-01',
          renewal: 'overdue',
          risks: ['renewal_not_started'],
          renewal_status: 'non_engage',
        }),
      ],
      ['mission', 'endsOn', 'risks', 'nextAction', 'renewalStatus'],
    )
    const row = screen.getAllByRole('row')[1] as HTMLElement
    const cells = within(row).getAllByRole('cell')
    // cellules 1..4 (la 0 est « Mission » : son nom a ses propres règles, testées plus haut)
    for (const cell of cells.slice(1)) {
      const offenders = [cell, ...Array.from(cell.querySelectorAll<HTMLElement>('*'))].filter(el =>
        ELLIPSIS.test(el.getAttribute('class') ?? ''),
      )
      expect(
        offenders.map(el => el.outerHTML.slice(0, 120)),
        'une ellipse coupe un libellé',
      ).toEqual([])
    }
  })

  it('sait dire NON : la garde repère une ellipse quand il y en a une', () => {
    expect(ELLIPSIS.test('min-w-0 truncate')).toBe(true)
    expect(ELLIPSIS.test('line-clamp-2')).toBe(true)
    expect(ELLIPSIS.test('whitespace-normal')).toBe(false)
  })

  it('une mission hors « en cours » : « non mesuré » court dans la cellule, la raison à l’infobulle', () => {
    show([mission({ status: 'terminated' })], ['mission', 'risks'])
    const row = screen.getAllByRole('row')[1] as HTMLElement
    const cell = within(row).getAllByRole('cell')[1] as HTMLElement
    expect(cell.textContent?.trim()).toBe('non mesuré')
    expect(cell.textContent).not.toMatch(/ne se calculent/)
    expect(cell.querySelector('[title*="ne se calculent"]')).not.toBeNull()
  })
})

/**
 * #4191 (recette 3, F2) — `/missions` En cours tronqué à 1485 px : 11 éléments en `scrollWidth > clientWidth`,
 * 18 en ellipse, un tableau de 1 571 px, la colonne « Ouvrir » (144 px), « Marge non mesurée / Coût chargé
 * manquant » (127 px dans 120).
 *
 * DÉCISION : (a) plus de colonne « Ouvrir » — la ligne ouvre, le titre est le lien tabulable ; (b) le titre
 * passe à la ligne (2 lignes, `title` complet) ; (c) « non mesurée » court + infobulle, jamais « 0 » ;
 * (d) le compte passe sous le titre. jsdom ne mesure pas les pixels : les tests gardent les CLASSES et la
 * structure, la mesure réelle se fait en recette écran.
 */
describe('MissionsTable — F2, le tableau des missions en cours ne se coupe plus', () => {
  beforeEach(cleanup)

  const LONG = 'Renfort Data Engineering — Plateforme Cloud AWS, lot migration Snowflake et gouvernance des données'

  it('REFUSE `truncate` / `text-ellipsis` dans le tableau, colonnes par défaut ET colonne Compte cochée', () => {
    const rows = [
      mission({
        label: LONG,
        accountName: 'DASSAULT AVIATION INTERNATIONAL',
        role_title: 'Architecte de plateforme données senior',
        marginPercent: null,
        assignees: [{ id: 'c-1', fullName: 'Yanis Bensaïd-Marchand', photoUrl: null }],
      }),
    ]
    for (const columns of [[...DEFAULT_MISSION_COLUMNS], [...DEFAULT_MISSION_COLUMNS, 'account', 'role'] as const]) {
      cleanup()
      show(rows, [...columns])
      const table = document.querySelector('table') as HTMLElement
      const offenders = Array.from(table.querySelectorAll<HTMLElement>('*')).filter(el =>
        /\b(truncate|text-ellipsis)\b/.test(el.getAttribute('class') ?? ''),
      )
      expect(offenders.map(el => el.outerHTML.slice(0, 100))).toEqual([])
    }
  })

  it('sait dire NON : la garde repère `truncate` et `text-ellipsis`', () => {
    const guard = /\b(truncate|text-ellipsis)\b/
    expect(guard.test('min-w-0 truncate')).toBe(true)
    expect(guard.test('text-ellipsis')).toBe(true)
    expect(guard.test('line-clamp-2 break-words')).toBe(false)
  })

  it('(a) plus de colonne « Ouvrir » : un entête par colonne choisie, aucun de plus', () => {
    show([mission()], ['mission', 'status'], vi.fn(), true)
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.queryByRole('columnheader', { name: /ouvrir/i })).toBeNull()
  })

  it('(a) toute la ligne ouvre ; le titre est le lien tabulable (un bouton), le menu d’actions reste atteignable', async () => {
    const onOpen = show([mission({ label: 'TMA ACME' })], ['mission', 'status'], vi.fn(), true)
    expect(screen.getByRole('button', { name: 'TMA ACME' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('cell')[1] as HTMLElement)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('(b) #4191 R22 — le titre passe à la ligne, jamais d’ellipse ; le titre COMPLET à `title`', () => {
    show([mission({ label: LONG })], ['mission'])
    const button = screen.getByRole('button', { name: LONG })
    expect(button).toHaveAttribute('title', LONG)
    expect(button.className).toMatch(/whitespace-normal/)
    expect(button.querySelector('[class*="line-clamp"], .truncate')).toBeNull()
    expect(button.className).not.toMatch(/line-clamp|truncate/)
  })

  it('(c) marge non mesurée : « non mesurée » court, la raison à l’infobulle — jamais « 0 »', () => {
    show([mission({ marginPercent: null })], ['mission', 'margin'])
    const short = screen.getByText(/^non mesurée/)
    expect(short.textContent).not.toMatch(/\b0\s*%/)
    expect(short).toHaveAttribute('title', expect.stringContaining('Coût chargé manquant'))
    expect(screen.queryByText('Marge non mesurée')).toBeNull()
  })

  it('(d) le compte passe SOUS le titre quand sa colonne n’est pas cochée — et jamais deux fois', () => {
    show([mission({ accountName: 'DASSAULT AVIATION' })], ['mission'])
    expect(screen.getAllByText('DASSAULT AVIATION')).toHaveLength(1)
    cleanup()
    show([mission({ accountName: 'DASSAULT AVIATION' })], ['mission', 'account'])
    expect(screen.getAllByText('DASSAULT AVIATION')).toHaveLength(1)
    expect(screen.getByRole('columnheader', { name: /compte/i })).toBeInTheDocument()
  })

  it('(d) « Compte » n’est plus une colonne par défaut', () => {
    expect(DEFAULT_MISSION_COLUMNS).not.toContain('account')
  })
})

// #4191.4 (18/10) — l'intitulé de poste d'une mission se lit en entier : il passe à la ligne, jamais d'ellipse.
describe('MissionsTable — #4191.4, l’intitulé de poste n’est pas tronqué', () => {
  beforeEach(cleanup)

  it('la cellule « Poste » ne porte ni line-clamp ni truncate', () => {
    show(
      [mission({ role_title: 'Architecte solution senior spécialisé migration applicative cloud hybride' })],
      ['mission', 'role'],
    )
    const role = screen.getByText('Architecte solution senior spécialisé migration applicative cloud hybride')
    expect(role.className).not.toMatch(/\b(line-clamp-\d|truncate|text-ellipsis)\b/)
    expect(role.getAttribute('title')).toBe(role.textContent)
  })
})

/**
 * #2408.33 — LA COLONNE SATISFACTION : les deux rails, jamais fusionnés ; un
 * rail sans niveau déclaré se dit « non mesuré », jamais « bon » ni « 0 ».
 */
describe('MissionsTable — colonne satisfaction (#2408.33)', () => {
  it('nomme le niveau de chaque rail, séparément', () => {
    show([mission({ satisfaction: { client: 'low', consultant: 'high' } })], ['mission', 'satisfaction'])
    expect(screen.getByRole('columnheader', { name: 'Satisfaction' })).toBeInTheDocument()
    expect(screen.getByText(/Client · Basse/)).toBeInTheDocument()
    expect(screen.getByText(/Consultant · Bonne/)).toBeInTheDocument()
  })

  it('sait dire NON : rien de déclaré se lit « non mesuré », jamais un niveau', () => {
    show([mission({ satisfaction: { client: null, consultant: null } })], ['mission', 'satisfaction'])
    expect(screen.queryByText(/Basse|Moyenne|Bonne/)).not.toBeInTheDocument()
    expect(screen.getByText(/non mesuré/i)).toBeInTheDocument()
  })

  it('la couleur ne porte jamais seule le sens : le niveau est ÉCRIT (#2408.85)', () => {
    show([mission({ satisfaction: { client: 'low', consultant: null } })], ['mission', 'satisfaction'])
    expect(screen.getByText(/Client · Basse/).textContent).toMatch(/Basse/)
  })
})

/** Droits : un rôle sans `finance:read` ne voit pas la colonne Marge. */
describe('MissionsTable — la marge suit le droit finance', () => {
  it('sans finance:read, la colonne Marge n’est pas rendue du tout', () => {
    render(
      <MissionsTable missions={[mission()]} columns={['mission', 'margin']} onOpen={vi.fn()} canReadFinance={false} />,
    )
    expect(screen.queryByRole('columnheader', { name: 'Marge' })).not.toBeInTheDocument()
  })

  it('avec finance:read, elle l’est', () => {
    render(<MissionsTable missions={[mission()]} columns={['mission', 'margin']} onOpen={vi.fn()} canReadFinance />)
    expect(screen.getByRole('columnheader', { name: 'Marge' })).toBeInTheDocument()
  })
})

describe('MissionsTable — #2408.40 aucune colonne ne tombe à 0 px (recette r53)', () => {
  it('chaque colonne réserve une largeur `w-` (table-fixed) : Compte + Satisfaction cochés, Statut garde la sienne', () => {
    show([mission()], ALL)
    const headers = screen.getAllByRole('columnheader')
    expect(headers.length).toBeGreaterThan(5)
    for (const header of headers) {
      // Une colonne sans `w-` reçoit le reste de l'espace en `table-fixed` : 0 px quand les autres débordent.
      expect(header.className, header.textContent ?? '').toMatch(/(^|\s)w-\[\d+(\.\d+)?rem\]/)
    }
  })

  it('le conteneur de la table défile à l’horizontale quand elle dépasse (pas le corps de la page)', () => {
    show([mission()], ALL)
    expect(document.querySelector('table')?.parentElement?.className).toMatch(/overflow-x-auto/)
  })
})
