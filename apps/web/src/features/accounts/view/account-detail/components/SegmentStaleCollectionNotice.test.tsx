import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { SegmentStaleCollectionNotice } from './SegmentStaleCollectionNotice'

/**
 * #2543.7 (18/09/2026) — L'AVEU DE FRAÎCHEUR, étendu aux trois segments qui
 * rejoignent contacts (#AF.3).
 *
 * `SEGMENT_CAPABILITY_EPOCH` ne date AUCUN des trois segments ci-dessous en
 * production — seul `contacts` (#2543) en a une (voir son docblock). Le
 * premier bloc constate cet état RÉEL : le composant ne rend rien pour aucun
 * des trois, aujourd'hui. Le second bloc mute temporairement le module (comme
 * les tests voisins de `SegmentCatchupService` perturbent `process.env`) pour
 * prouver que le MÉCANISME — pas la capacité — est correctement câblé pour
 * chaque segment : témoin positif, témoin négatif, « non mesuré », et le bon
 * couple de clés i18n par segment (le vocabulaire décline `reason`, pas
 * `titleDated`/`titleUnknown`).
 *
 * ⚠️ #2291.2 (lot R, 19/09/2026) — LE FIL À RETORDRE A MORDU. `signals` sort
 * de « aucun des trois » : le modèle de contrat OBSERVÉ a daté
 * `SEGMENT_CAPABILITY_EPOCH.signals` pour de vrai (voir son propre docblock).
 * `signals` rejoint donc `dossier_read`/`access_relation` ci-dessous — sa
 * propre section, capacité réellement datée, sans mutation. `entities` et
 * `strategy` restent seuls dans le premier bloc.
 *
 * ⚠️ #2755 (24/09/2026) — `entities` SORT à son tour de « aucune capacité
 * datée » : le repli snake_case IA (`51f284697`) a daté
 * `SEGMENT_CAPABILITY_EPOCH.entities` pour de vrai (voir le docblock du
 * composant). `entities` rejoint `dossier_read`/`signals`/`access_relation`
 * plus bas — sa propre section, capacité réellement datée, sans mutation.
 * `strategy` reste seul dans le premier bloc.
 */
const demo = vi.hoisted(() => ({ current: false }))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => demo.current }))

describe('SegmentStaleCollectionNotice (#2543.7)', () => {
  afterEach(() => {
    demo.current = false
  })

  // Louis 13/10 — ce bandeau vit HORS démo seulement (même règle que Contacts).
  it('ne rend rien en mode démo, même sur une collecte antérieure à la capacité', async () => {
    demo.current = true
    const { container } = renderWithRouter(
      <SegmentStaleCollectionNotice dimension="dossier_read" collectedAt="2026-09-01T00:00:00.000Z" />,
    )
    await waitFor(() => expect(container).toBeInTheDocument())
    expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
    expect(container.textContent).toBe('')
  })

  describe('état réel : aucune capacité datée pour strategy', () => {
    it.each(['strategy'] as const)(
      'ne rend rien pour %s, même sur une collecte très ancienne — aucune capacité datée en face',
      async dimension => {
        const { container } = renderWithRouter(
          <SegmentStaleCollectionNotice dimension={dimension} collectedAt="2020-01-01T00:00:00.000Z" />,
        )
        await waitFor(() => expect(container).toBeInTheDocument())
        expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
      },
    )
  })

  describe('le mécanisme, capacité mutée le temps du test', () => {
    const MUTABLE_EPOCH = SEGMENT_CAPABILITY_EPOCH as Record<string, string | undefined>
    const CAPABILITY_AT = '2026-09-18T00:00:00.000Z'

    // ⚠️ Ne JAMAIS ajouter `delete MUTABLE_EPOCH.entities` ici : depuis #2755,
    // `entities` porte une capacité RÉELLE posée par le module (pas par ce
    // test) — la supprimer romprait silencieusement toute assertion sur
    // `entities` dans les describe suivants de ce même fichier (module
    // partagé, non ré-importé entre describes). Seul `strategy` est encore
    // muté ici, donc seul `strategy` se nettoie.
    afterEach(() => {
      delete MUTABLE_EPOCH.strategy
    })

    it('strategy : ne montre rien quand la collecte est POSTÉRIEURE à la capacité (témoin négatif)', async () => {
      MUTABLE_EPOCH.strategy = CAPABILITY_AT
      const { container } = renderWithRouter(
        <SegmentStaleCollectionNotice dimension="strategy" collectedAt="2026-09-18T12:00:00.000Z" />,
      )
      await waitFor(() => expect(container).toBeInTheDocument())
      expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
    })

    it('strategy : dit la date et nomme SA raison (« Changer de stratégie »), pas celle des autres segments', async () => {
      MUTABLE_EPOCH.strategy = CAPABILITY_AT
      renderWithRouter(<SegmentStaleCollectionNotice dimension="strategy" collectedAt="2026-09-01T00:00:00.000Z" />)
      await waitFor(() => expect(screen.getByText(/à revérifier/i)).toBeInTheDocument())
      expect(screen.getByText(/Changer de stratégie/)).toBeInTheDocument()
    })

    it('muter `strategy` ne déplace pas la capacité de `entities` — chaque dimension lit SA propre clé', async () => {
      MUTABLE_EPOCH.strategy = CAPABILITY_AT // 2026-09-18, ANTÉRIEUR à la vraie capacité entities (#2755, 23/09).
      // Une collecte du 20/09 est ANTÉRIEURE à la vraie capacité `entities`
      // (23/09) : elle doit rester périmée. Si la lecture fuitait vers la clé
      // mutée `strategy` (18/09), cette collecte du 20/09 serait vue comme
      // POSTÉRIEURE et le bandeau resterait muet à tort.
      renderWithRouter(<SegmentStaleCollectionNotice dimension="entities" collectedAt="2026-09-20T00:00:00.000Z" />)
      await waitFor(() => expect(screen.getByText(/à revérifier/i)).toBeInTheDocument())
      expect(screen.getByText(/Enrichir la carte/)).toBeInTheDocument()
    })
  })

  /**
   * #2118.51 (18/09/2026) — LE CINQUIÈME SEGMENT, capacité RÉELLEMENT datée
   * (`SEGMENT_CAPABILITY_EPOCH.dossier_read`) — contrairement aux trois
   * segments ci-dessus, ces tests ne mutent RIEN : c'est la première capacité
   * de ce composant générique qui s'allume en production. Mesuré le 18/09 :
   * avant ce lot, `SegmentStaleCollectionNotice` ne rendait rien sur AUCUN
   * onglet hors Contacts (`ContactsStaleCollectionNotice`, un composant
   * séparé) — cette entrée l'allume pour de vrai sur l'onglet Synthèse.
   */
  describe('dossier_read — capacité réellement datée en production (#2118.51)', () => {
    it('ne montre rien quand la collecte est POSTÉRIEURE à la capacité (témoin négatif)', async () => {
      const { container } = renderWithRouter(
        <SegmentStaleCollectionNotice dimension="dossier_read" collectedAt="2026-09-18T12:00:00.000Z" />,
      )
      await waitFor(() => expect(container).toBeInTheDocument())
      expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
    })

    it('dit la date quand la collecte est ANTÉRIEURE à la capacité #2118 (témoin positif), avec SA raison', async () => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension="dossier_read" collectedAt="2026-09-01T00:00:00.000Z" />)
      await waitFor(() => expect(screen.getByText(/à revérifier/i)).toBeInTheDocument())
      expect(screen.getByText(/1 septembre 2026/)).toBeInTheDocument()
      expect(screen.getByText(/Changer de stratégie/)).toBeInTheDocument()
    })

    it('« non mesuré » (jamais daté, tout dossier antérieur à ce lot) est signalé périmé, jamais présumé à jour', async () => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension="dossier_read" collectedAt={null} />)
      await waitFor(() => expect(screen.getByText(/non mesurée/i)).toBeInTheDocument())
    })
  })

  /**
   * #2291.2 (lot R, 19/09/2026) — `signals`, capacité RÉELLEMENT datée
   * (`SEGMENT_CAPABILITY_EPOCH.signals`), même mécanique que `dossier_read` :
   * aucune mutation nécessaire. Le modèle de contrat OBSERVÉ est devenu un
   * émetteur RÉEL au commit qui a daté cette capacité — `signals` sort du
   * bloc « état réel : aucune capacité datée » ci-dessus et rejoint
   * `dossier_read`/`access_relation` ici.
   */
  describe('signals — capacité réellement datée en production (#2291.2, lot R)', () => {
    // ⚠️ #2284.17/.33/.26 (#2978, lot SRC2 28/09/2026) ont ajouté trois
    // capacités `signals` plus RÉCENTES que #2291.2 (`segment-catchup.ts`) :
    // `SEGMENT_CAPABILITY_EPOCH.signals` (la PLUS RÉCENTE des capacités) est
    // passée du 19/09 11:20 au 28/09 18:39. Le témoin négatif doit donc
    // dater sa collecte APRÈS cette nouvelle capacité, pas seulement après
    // #2291.2 — sinon il ne prouve plus « postérieure à la capacité », il
    // prouve une capacité déjà périmée.
    // #3922.3 (K01, 09/10/2026) — le lien source a de nouveau avancé l'epoch, au
    // 10/10 : le témoin négatif date donc sa collecte du 11/10.
    // #4031 (INT-H, 11/10) — les offres de groupe l'ont avancé au 11/10 18:41 : la collecte du témoin passe au 12/10.
    // #4327 (19/10) — les filiales nommées par le web l'ont avancé au 19/10 19:10 : la collecte du témoin passe au 20/10.
    // #4398.2 (K1, 21/10) — le nom légal l'a avancé au 21/10 09:12 : la collecte du témoin passe au 22/10.
    // #4437.5 (23/10) — le rattachement des offres l'a avancé au 23/10 14:40 : la collecte du témoin passe au 24/10.
    // #4754 (28/10) — la collecte des offres au-delà de douze mois l'a avancé au 28/10 20:03 : la collecte du témoin passe au 29/10.
    // #4762 (31/10) — la collecte sans borne d'âge l'a avancé au 31/10 09:55 : la collecte du témoin passe au 01/11.
    it('ne montre rien quand la collecte est POSTÉRIEURE à la capacité (témoin négatif)', async () => {
      const { container } = renderWithRouter(
        <SegmentStaleCollectionNotice dimension="signals" collectedAt="2026-11-01T00:00:00.000Z" />,
      )
      await waitFor(() => expect(container).toBeInTheDocument())
      expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
    })

    // Intégration AG+AH+AI (09/10/2026) — un bandeau qui annonce UNE capacité (la
    // barrière et l'effectif, #3504) se date sur ELLE : une collecte du 02/10 a vu
    // #3504 (01/10) même si l'epoch du segment est au 10/10 (#3922.3).
    it('capabilityIssue : se date sur SA capacité, pas sur l’epoch du segment', async () => {
      const { container } = renderWithRouter(
        <SegmentStaleCollectionNotice
          dimension="signals"
          capabilityIssue="#3504"
          collectedAt="2026-10-02T00:00:00.000Z"
        />,
      )
      await waitFor(() => expect(container).toBeInTheDocument())
      expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
    })

    it('capabilityIssue : sait dire OUI — une collecte antérieure à #3504 le dit', async () => {
      renderWithRouter(
        <SegmentStaleCollectionNotice
          dimension="signals"
          capabilityIssue="#3504"
          collectedAt="2026-09-29T00:00:00.000Z"
        />,
      )
      await waitFor(() => expect(screen.getByText(/à revérifier/i)).toBeInTheDocument())
    })

    it('dit la date quand la collecte est ANTÉRIEURE à la capacité #2291.2 (témoin positif), avec SA raison', async () => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension="signals" collectedAt="2026-09-15T00:00:00.000Z" />)
      await waitFor(() => expect(screen.getByText(/à revérifier/i)).toBeInTheDocument())
      expect(screen.getByText(/15 septembre 2026/)).toBeInTheDocument()
      expect(screen.getByText(/Actualiser/)).toBeInTheDocument()
    })

    it('« non mesuré » (jamais daté) est signalé périmé, jamais présumé à jour', async () => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension="signals" collectedAt={null} />)
      await waitFor(() => expect(screen.getByText(/non mesurée/i)).toBeInTheDocument())
      expect(screen.getByText(/Actualiser/)).toBeInTheDocument()
    })
  })

  /**
   * #2298.4 (réfuté en production le 19/09/2026) — LE SIXIÈME SEGMENT, même
   * mécanique que `dossier_read` : capacité RÉELLEMENT datée
   * (`SEGMENT_CAPABILITY_EPOCH.access_relation`), aucune mutation nécessaire.
   * ACTIA (analysé avant la capacité) affichait « CRM non connecté » et LVMH
   * (analysé après) « CRM connecté » — deux comptes du même espace se
   * contredisant sur l'état d'un connecteur. Ce bandeau dit honnêtement
   * lequel des deux calculs est antérieur.
   */
  describe('access_relation — capacité réellement datée en production (#2298.4)', () => {
    it('ne montre rien quand la collecte est POSTÉRIEURE à la capacité (témoin négatif)', async () => {
      const { container } = renderWithRouter(
        <SegmentStaleCollectionNotice dimension="access_relation" collectedAt="2026-09-19T12:00:00.000Z" />,
      )
      await waitFor(() => expect(container).toBeInTheDocument())
      expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
    })

    it('dit la date quand la collecte est ANTÉRIEURE à la capacité #2298.4 (témoin positif), avec SA raison', async () => {
      renderWithRouter(
        <SegmentStaleCollectionNotice dimension="access_relation" collectedAt="2026-09-10T08:00:00.000Z" />,
      )
      await waitFor(() => expect(screen.getByText(/à revérifier/i)).toBeInTheDocument())
      expect(screen.getByText(/10 septembre 2026/)).toBeInTheDocument()
    })

    it('« non mesuré » (jamais daté) est signalé périmé, jamais présumé à jour', async () => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension="access_relation" collectedAt={null} />)
      await waitFor(() => expect(screen.getByText(/non mesurée/i)).toBeInTheDocument())
    })
  })

  /**
   * #2755 (24/09/2026) — LE SEPTIÈME SEGMENT (le dernier des trois d'origine),
   * capacité RÉELLEMENT datée (`SEGMENT_CAPABILITY_EPOCH.entities`) — même
   * mécanique que `dossier_read`/`signals`/`access_relation` : ces tests ne
   * mutent RIEN. Louis (beta, 23/09) — « il doit toujours y avoir un
   * organigramme » — sur un compte analysé avant le repli snake_case IA
   * (`51f284697`), l'assembleur ne pouvait construire aucune entité. Avant ce
   * lot, `entities` restait dans le bloc « aucune capacité datée » ci-dessus
   * — cette entrée l'allume pour de vrai sur l'onglet Organigramme.
   */
  describe('entities — capacité réellement datée en production (#2755)', () => {
    it('ne montre rien quand la collecte est POSTÉRIEURE à la capacité (témoin négatif)', async () => {
      const { container } = renderWithRouter(
        <SegmentStaleCollectionNotice dimension="entities" collectedAt="2026-09-24T00:00:00.000Z" />,
      )
      await waitFor(() => expect(container).toBeInTheDocument())
      expect(screen.queryByText(/à revérifier/i)).not.toBeInTheDocument()
    })

    it('dit la date quand la collecte est ANTÉRIEURE à la capacité #2755 (témoin positif), avec SA raison', async () => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension="entities" collectedAt="2026-09-10T08:00:00.000Z" />)
      await waitFor(() => expect(screen.getByText(/à revérifier/i)).toBeInTheDocument())
      expect(screen.getByText(/10 septembre 2026/)).toBeInTheDocument()
      expect(screen.getByText(/Enrichir la carte/)).toBeInTheDocument()
    })

    it('« non mesuré » (jamais daté) est signalé périmé, jamais présumé à jour', async () => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension="entities" collectedAt={null} />)
      await waitFor(() => expect(screen.getByText(/non mesurée/i)).toBeInTheDocument())
    })
  })

  /**
   * #2298.4 (19/09/2026, lot I3) — « Recalculer la relation (gratuit) ». Le
   * SEUL des six segments avec un rejeu GRATUIT (les cinq autres n'ont que la
   * `reason` statique, jamais de bouton) : `action` est un prop OPTIONNEL,
   * jamais rendu par défaut — les cinq autres dimensions restent
   * byte-identiques.
   */
  describe('action optionnelle — le bouton « Recalculer la relation (gratuit) » (#2298.4)', () => {
    it("rend le bouton d'action quand `action` est fourni, et le déclenche au clic", async () => {
      const onClick = vi.fn()
      renderWithRouter(
        <SegmentStaleCollectionNotice
          dimension="access_relation"
          collectedAt="2026-09-10T08:00:00.000Z"
          action={{ label: 'Recalculer la relation (gratuit)', onClick }}
        />,
      )
      const button = await screen.findByRole('button', { name: 'Recalculer la relation (gratuit)' })
      fireEvent.click(button)
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('ne rend AUCUN bouton sans `action` — les cinq autres segments restent inchangés', async () => {
      renderWithRouter(
        <SegmentStaleCollectionNotice dimension="access_relation" collectedAt="2026-09-10T08:00:00.000Z" />,
      )
      await waitFor(() => expect(screen.getByText(/à revérifier/i)).toBeInTheDocument())
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('un bouton `pending` se dit désactivé, jamais un second clic pendant le premier', async () => {
      const onClick = vi.fn()
      renderWithRouter(
        <SegmentStaleCollectionNotice
          dimension="access_relation"
          collectedAt="2026-09-10T08:00:00.000Z"
          action={{ label: 'Recalculer la relation (gratuit)', onClick, pending: true }}
        />,
      )
      const button = await screen.findByRole('button', { name: 'Recalculer la relation (gratuit)' })
      expect(button).toBeDisabled()
      fireEvent.click(button)
      expect(onClick).not.toHaveBeenCalled()
    })
  })

  describe('#3499 — `hideWhenUndated` : une date inconnue ne fait AUCUNE ligne', () => {
    it('ne rend rien quand la date de collecte est inconnue', () => {
      const { container } = renderWithRouter(
        <SegmentStaleCollectionNotice dimension="dossier_read" collectedAt={null} hideWhenUndated />,
      )
      expect(container.textContent).toBe('')
    })

    it('témoin : sans le prop, « Date de collecte non mesurée » reste dit ailleurs', async () => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension="dossier_read" collectedAt={null} />)
      expect(await screen.findByText(/Date de collecte non mesurée/)).toBeInTheDocument()
    })

    it('témoin : une date connue ET antérieure à la capacité reste affichée', async () => {
      renderWithRouter(
        <SegmentStaleCollectionNotice
          dimension="dossier_read"
          collectedAt="2026-01-10T08:00:00.000Z"
          hideWhenUndated
        />,
      )
      expect(await screen.findByText(/janvier 2026/)).toBeInTheDocument()
    })
  })

  // Louis 23/10 (recette prod, fiche Decathlon) — « Information du 18 octobre… à revérifier » alors que l'analyse
  // date du 16/10 : la date est celle du SEGMENT (ici une actualisation des signaux), pas celle de l'analyse. La
  // phrase NOMME ce que la date date, pour rester vraie à côté de la date de l'analyse.
  describe('la date nomme le segment qu’elle date', () => {
    it.each([
      ['signals', /Signaux collectés le/],
      ['entities', /Organigramme collecté le/],
      ['access_relation', /Relation calculée le/],
    ] as const)('%s : « %s » plutôt qu’une « information » sans objet', async (dimension, expected) => {
      renderWithRouter(<SegmentStaleCollectionNotice dimension={dimension} collectedAt="2026-09-01T00:00:00.000Z" />)
      await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument())
      expect(screen.queryByText(/^Information du/)).not.toBeInTheDocument()
    })
  })
})
