import type { ReactNode } from 'react'
import Link from 'next/link'
import { PRODUCT_SCREENS } from '@bellum/contracts'
import { fetchFeedback, type FeedbackItem } from '@/lib/feedback'
import {
  fetchProductAccountSections,
  fetchProductDemand,
  fetchProductFriction,
  fetchProductJourneys,
  fetchProductScreens,
  fetchProductValue,
  type MesureOuAbsence,
  type ProductEventFamily,
  derniereValeurConnue,
  type RapportDemande,
  type RapportEcrans,
  type RapportFriction,
  type RapportParcours,
  type RapportSectionsDossier,
  type RapportValeur,
} from '@/lib/product-analytics'
import { Card, CardHeader, EmptyState, KpiTile, SegmentBar } from '@/ui'
import { SENTINEL_ECRAN_INCONNU } from '../feedback/_components/feedback-ecran-filter.logic'
import { grouperParEcran } from '../feedback/feedback.logic'
import {
  type EtatCellule,
  estInstrumente,
  etatDe,
  formaterDureeMediane,
  formaterTaux,
  libelleEspaces,
  libelleEtat,
  libelleEvenement,
  libelleInstrumentation,
  resumerInstrumentation,
} from './product-instrumentation.logic'
import { compterVerdicts, verdictEcranPresent, verdictsDesEcrans } from './screen-verdict.logic'
import { segmentsDesParcours } from './journey-summary.logic'
import { croisementParEcran } from './usage-demand-crossing.logic'
import {
  CroisementTable,
  DemandeTable,
  EcransTable,
  ErrorsTable,
  InterrompusTable,
  RepetitionsTable,
  RoundTripsTable,
  SectionsDossierTable,
  SortiesTable,
} from './_components/produit-tables'

export const dynamic = 'force-dynamic'

/** Les écrans du produit CLIENT, ceux que #1683-#1688 classent. `public` (hors
 *  session) et `technique` (redirection) ne comptent ni pour un usage ni pour
 *  un verdict — voir le docblock de `product-screens-catalog.ts`. */
const ECRANS_PRODUIT = PRODUCT_SCREENS.filter(screen => screen.nature === 'produit')

/**
 * #1682/#1683-#1688 — L'ÉCRAN QUI DIT CE QUE LE TRACEUR PRODUIT NE MESURE PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CET ÉCRAN FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * La lecture existe côté API depuis le 09/09/2026 (quatre routes internes,
 * `product-analytics-read.service.ts`) et n'avait AUCUNE page qui la consomme.
 * Pire : sept des neuf émetteurs du traceur (`apps/web/src/lib/product-tracker.ts`)
 * n'ont AUCUN appelant de production, et `VITE_PRODUCT_TRACKER_ENABLED` est
 * éteinte, nulle part armée. Un tableau vide qui ne dirait pas pourquoi se
 * lirait « rien à signaler » — c'est l'inverse exact de la vérité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE LOT AJOUTE (#1683.1 / #1684.1-2 / #1688.4 / #1642.2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Les nombres bruts restaient illisibles sans un VERDICT : un écran travaillé,
 * consulté, survolé, jamais ouvert ou trop récent (`screen-verdict.logic.ts`,
 * rendu à côté des chiffres, jamais à leur place). Les sorties par écran
 * disaient combien, jamais VERS OÙ ni quelle part ferme le produit sans
 * naviguer nulle part (`journey-summary.logic.ts`). Trois sources — usage,
 * retours bêta, demande non couverte — restaient listées côte à côte sans
 * jamais se croiser (`usage-demand-crossing.logic.ts`, #1688.4). Et les deux
 * écrans de ce dossier rendaient leurs tableaux et leurs cartes en HTML brut :
 * ils passent maintenant aux douze primitives du back-office (`@/ui`).
 *
 * ⚠️ TROIS ÉTATS, JAMAIS DEUX, PARTOUT SUR CETTE PAGE : mesuré · pas encore
 * instrumenté (l'émetteur n'a pas d'appelant) · sous le seuil des 5 sessions
 * distinctes (mesuré, non publiable). Voir `product-instrumentation.logic.ts`.
 * Le verdict d'écran en ajoute un QUATRIÈME, spécifique aux écrans sans aucune
 * vue mesurée : « non mesuré » quand la date de mise en service n'est pas
 * disponible pour distinguer un écran jamais ouvert d'un écran trop récent
 * (voir le docblock de `screen-verdict.logic.ts`) — jamais un verdict deviné.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE PAGE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne recalcule rien : les quatre rapports viennent tels quels des routes
 * internes, le seuil vient de `@bellum/contracts` via les rapports eux-mêmes,
 * et le regroupement des retours PAR ÉCRAN (`grouperParEcran`/`ecranDe`,
 * `../feedback/feedback.logic.ts`) est celui que `/feedback?vue=ecran`
 * utilise déjà — pas une seconde dérivation de la même question (GA-26).
 * Le croisement #1688.4 ne relit pas non plus le flux comportemental : il lit
 * le VERDICT déjà dérivé et le rapport de demande déjà chargé — jamais un
 * quatrième lecteur. Et aucune de ces dérivations n'associe un chiffre de ce
 * flux à un nom d'espace : l'unité d'analyse reste l'écran, jamais un client
 * (règle 5 de `c64_analytique_produit`, tenue ici par construction — voir
 * `src/architecture/produit-ne-croise-pas-comportement-et-espace.test.ts`).
 */
export default async function ProduitPage() {
  const [screensResult, journeysResult, frictionResult, demandResult, valeurResult, sectionsResult] =
    await Promise.allSettled([
      fetchProductScreens(),
      fetchProductJourneys(),
      fetchProductFriction(),
      fetchProductDemand(),
      fetchProductValue(),
      fetchProductAccountSections(),
    ])

  const ecrans = screensResult.status === 'fulfilled' ? screensResult.value : null
  const parcours = journeysResult.status === 'fulfilled' ? journeysResult.value : null
  const friction = frictionResult.status === 'fulfilled' ? frictionResult.value : null
  const demande = demandResult.status === 'fulfilled' ? demandResult.value : null
  const valeur = valeurResult.status === 'fulfilled' ? valeurResult.value : null
  const sectionsDossier = sectionsResult.status === 'fulfilled' ? sectionsResult.value : null

  // Les six rapports portent le MÊME `families` (chacun le calcule pour son
  // propre compte, mais sur la même table) : le premier disponible suffit à
  // annoncer l'état d'instrumentation, même si les cinq autres routes échouent.
  const families: ProductEventFamily[] | null =
    ecrans?.families ??
    parcours?.families ??
    friction?.families ??
    demande?.families ??
    valeur?.families ??
    sectionsDossier?.families ??
    null

  let feedback: FeedbackItem[] = []
  let erreurFeedback: string | null = null
  try {
    const data = await fetchFeedback(200)
    feedback = data.items
  } catch (e) {
    erreurFeedback = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  return (
    <main className="wrap">
      <h1>Produit — instrumentation et usage</h1>
      <p className="subtitle">
        Ce que le traceur produit mesure vraiment, écran par écran, et ce qu’il ne mesure pas encore faute d’émetteur
        câblé — jamais confondus avec « zéro cas ». L’unité d’analyse reste l’écran, jamais quelqu’un.
      </p>

      {/* ─────────────────────────────────────────────────────────────────
          1. L'ÉTAT DE L'INSTRUMENTATION — la toute première chose qu'on lit.
         ───────────────────────────────────────────────────────────────── */}
      {families ? (
        <InstrumentationBanner families={families} />
      ) : (
        <p className="error">
          Impossible de lire l’état de l’instrumentation : les cinq routes internes ont échoué (
          {[screensResult, journeysResult, frictionResult, demandResult, valeurResult]
            .map(r => (r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : 'erreur') : null))
            .filter(Boolean)
            .join(' · ')}
          ).
        </p>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          2. UTILISATION PAR ÉCRAN, verdict inclus (#1683.1)
         ───────────────────────────────────────────────────────────────── */}
      <SectionEcrans rapport={ecrans} erreur={screensResult.status === 'rejected' ? screensResult.reason : null} />

      {/* ─────────────────────────────────────────────────────────────────
          2bis. SECTIONS DU DOSSIER COMPTE, par fréquence (#2130.71) —
                `tab_opened` porte déjà {screen, tab} (#2130.54), personne ne
                l'agrégeait avant ce lot (constat du corps de #3000).
         ───────────────────────────────────────────────────────────────── */}
      <SectionSectionsDossier
        rapport={sectionsDossier}
        erreur={sectionsResult.status === 'rejected' ? sectionsResult.reason : null}
      />

      {/* ─────────────────────────────────────────────────────────────────
          3. PARCOURS — sorties (destination + fermeture pure, #1684.1),
             séquences fréquentes (SegmentBar + résidu nommé, #1684.2),
             parcours interrompus.
         ───────────────────────────────────────────────────────────────── */}
      <SectionParcours
        rapport={parcours}
        erreur={journeysResult.status === 'rejected' ? journeysResult.reason : null}
      />

      {/* ─────────────────────────────────────────────────────────────────
          4. FRICTION — répétition, aller-retour, erreur vue.
         ───────────────────────────────────────────────────────────────── */}
      <SectionFriction
        rapport={friction}
        erreur={frictionResult.status === 'rejected' ? frictionResult.reason : null}
      />

      {/* ─────────────────────────────────────────────────────────────────
          5. DEMANDE NON COUVERTE — recherches sans résultat, jamais le texte cherché.
         ───────────────────────────────────────────────────────────────── */}
      <SectionDemande rapport={demande} erreur={demandResult.status === 'rejected' ? demandResult.reason : null} />

      {/* ─────────────────────────────────────────────────────────────────
          5bis. LE CROISEMENT USAGE × DEMANDE (#1688.4) — la seule chose que
                les sections 2 et 5 ne disaient pas encore : ce qu'on a et que
                personne n'utilise, ce qu'on n'a pas et que tout le monde
                cherche. Ne relit rien : verdict de la section 2, rapport de
                la section 5.
         ───────────────────────────────────────────────────────────────── */}
      <SectionCroisement ecrans={ecrans} demande={demande} />

      {/* ─────────────────────────────────────────────────────────────────
          5ter. VALEUR (#2130.73/#1946) — amorce, réponses jugées, brouillons
                repris, chaîne d'action, suites. La lecture existait côté API
                depuis #1946 ; AUCUN appelant front ne l'atteignait avant ce
                lot — du code juste, jamais appelé.
         ───────────────────────────────────────────────────────────────── */}
      <SectionValeur rapport={valeur} erreur={valeurResult.status === 'rejected' ? valeurResult.reason : null} />

      {/* ─────────────────────────────────────────────────────────────────
          6. RETOURS UTILISATEURS PAR ÉCRAN — corrélation avec le feedback bêta.
             Réutilise `grouperParEcran`/`ecranDe`, déjà branchés sur
             `/feedback?vue=ecran` : pas une seconde dérivation de la même
             question, juste un second lecteur de la même réponse.
         ───────────────────────────────────────────────────────────────── */}
      <SectionRetoursParEcran items={feedback} erreur={erreurFeedback} />
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Bannière d'instrumentation
// ─────────────────────────────────────────────────────────────────────────────

function InstrumentationBanner({ families }: { families: ProductEventFamily[] }) {
  const resume = resumerInstrumentation(families)
  return (
    <div style={{ marginBottom: 24 }}>
      <Card>
        <CardHeader title="État de l’instrumentation" />
        <div style={{ fontSize: 20, fontWeight: 700 }}>{libelleInstrumentation(resume)}</div>
        {resume.nonInstrumentees.length > 0 ? (
          <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 10 }}>
            Pas encore instrumentées : {resume.nonInstrumentees.map(libelleEvenement).join(' · ')}. Un émetteur sans
            appelant de production ne peut produire aucune mesure sur les agrégats qui en dépendent plus bas sur cette
            page — ce n’est pas « zéro cas », c’est « rien ne le mesure ». Attendre ne rendra jamais ce zéro vrai.
          </p>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--green)', marginTop: 10 }}>
            Les neuf natures ont déjà été écrites au moins une fois — les tableaux plus bas peuvent publier une vraie
            mesure, sous réserve du seuil de sessions distinctes.
          </p>
        )}
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Un bloc « mesure ou absence » générique — la même distinction en trois
// états, appliquée à chaque agrégat qui peut être non instrumenté, sous le
// seuil, ou mesuré (y compris à un ZÉRO VRAI, un tableau mesuré et vide).
// ─────────────────────────────────────────────────────────────────────────────

function BlocMesure<T>({
  titre,
  mesure,
  videLibelle,
  render,
}: {
  titre: string
  mesure: MesureOuAbsence<T[]>
  /** Le nom de ce qui est compté, pour la phrase du zéro VRAI (« aucune répétition », « aucun parcours interrompu »…). */
  videLibelle: string
  render: (valeur: T[]) => ReactNode
}) {
  const etat = etatDe(mesure)
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, margin: '0 0 6px', color: 'var(--muted)' }}>{titre}</h3>
      {etat.etat !== 'mesure' ? (
        <EtatNonMesure etat={etat} />
      ) : etat.valeur.length === 0 ? (
        <EmptyState
          icon="◇"
          message={`${videLibelle} — mesuré sur ${etat.sessions} session${etat.sessions > 1 ? 's' : ''} distinctes, aucun cas trouvé sur cette fenêtre.`}
        />
      ) : (
        render(etat.valeur)
      )}
    </div>
  )
}

/** Le texte d'un état NON mesuré (« pas encore instrumenté » ou « sous le
 *  seuil ») — jamais un tableau vide muet, jamais un 0. */
function EtatNonMesure({ etat }: { etat: EtatCellule<unknown> }) {
  const couleur = etat.etat === 'non_instrumente' ? 'var(--amber)' : 'var(--muted)'
  return (
    <p style={{ fontSize: 13, color: couleur, margin: 0 }}>
      {libelleEtat(etat)}
      {etat.etat === 'non_instrumente'
        ? ' — aucun émetteur de production n’écrit encore cette nature d’événement.'
        : null}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Utilisation par écran (#1683.1 — le verdict, à côté du chiffre)
// ─────────────────────────────────────────────────────────────────────────────

function SectionEcrans({ rapport, erreur }: { rapport: RapportEcrans | null; erreur: unknown }) {
  // ⚠️ `screens.length` à `0` ne veut RIEN dire tant que « Écran vu » n'a
  // jamais été écrit : ce serait « 0 écran a de la vue » affiché à la place de
  // « rien ne mesure d'écran » — la confusion exacte que cette page existe
  // pour lever. Le compte n'est un ZÉRO VRAI que si l'émetteur est instrumenté.
  const vuesInstrumentees = rapport ? estInstrumente(rapport.families, 'screen_viewed') : false

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Utilisation par écran</h2>
      {!rapport ? (
        <ErreurOuChargement erreur={erreur} />
      ) : (
        <>
          <section
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 16 }}
          >
            <KpiTile
              label="Fenêtre couverte"
              value={`${rapport.coverage.windowDays} j${rapport.coverage.complete ? '' : ' (tronquée)'}`}
            />
            <KpiTile
              label="Écrans avec au moins une vue"
              value={vuesInstrumentees ? rapport.screens.length : 'pas encore instrumenté'}
            />
            {/* ⚠️ JAMAIS un compte ni un nom d’espace : `trackBehavioral()` écrit
                `workspace_id` à `null` inconditionnellement (règles 4 et 5 de
                c64_analytique_produit). La colonne « espaces » n’est pas
                dérivable de ce flux, elle le DIT plutôt que de rendre 0. */}
            <KpiTile label="Espaces distincts" value={libelleEspaces(rapport.distinctWorkspaces)} />
          </section>

          {!vuesInstrumentees ? (
            <p style={{ fontSize: 13, color: 'var(--amber)' }}>
              pas encore instrumenté — aucun émetteur de production n’écrit encore « {libelleEvenement('screen_viewed')}
              ».
            </p>
          ) : (
            <>
              {/* #1683.1 — le verdict, en aggrégat sur TOUT le catalogue des
                  écrans produit (pas seulement ceux qui ont une vue sur cette
                  fenêtre) : un écran absent du rapport reçoit son verdict
                  d'absence (jamais ouvert / trop récent / non mesuré) plutôt
                  que de disparaître de ce qu'on sait du produit. */}
              <VerdictResume ecransProduit={ECRANS_PRODUIT} ecransMesures={rapport.screens} />

              {rapport.screens.length === 0 ? (
                <EmptyState
                  icon="◇"
                  message={`Aucun écran n’a produit de vue mesurable sur cette fenêtre — mesuré sur ${rapport.coverage.eventsScanned} événement${rapport.coverage.eventsScanned > 1 ? 's' : ''} balayé${rapport.coverage.eventsScanned > 1 ? 's' : ''}.`}
                />
              ) : (
                <EcransTable
                  lignes={rapport.screens.map(screen => ({ ...screen, verdict: verdictEcranPresent(screen) }))}
                />
              )}
            </>
          )}
          {rapport.unresolvedPaths > 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {rapport.unresolvedPaths} vue{rapport.unresolvedPaths > 1 ? 's' : ''} sur un chemin qu’aucun motif du
              catalogue ne reconnaît — comptée{rapport.unresolvedPaths > 1 ? 's' : ''} à part, jamais rattachée à
              l’écran le plus ressemblant.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}

/**
 * #1683.1 — le résumé du verdict sur TOUT le catalogue produit, en une
 * phrase : la preuve visible que les sept états s'additionnent jusqu'au
 * nombre d'écrans (`compterVerdicts`, testé pour cette propriété).
 *
 * ⚠️ Aucune date de mise en service n'est disponible aujourd'hui dans ce que
 * ce back-office peut lire (voir `screen-verdict.logic.ts`) : tous les écrans
 * sans vue mesurée rendent donc « non mesuré », jamais « jamais ouvert »
 * deviné. C'est dit ici, explicitement, plutôt que laissé à déduire d'un
 * chiffre qui pourrait sinon se lire comme une certitude.
 */
function VerdictResume({
  ecransProduit,
  ecransMesures,
}: {
  ecransProduit: readonly { route: string; label: { fr: string; en: string } }[]
  ecransMesures: RapportEcrans['screens']
}) {
  const lignes = verdictsDesEcrans(ecransProduit, ecransMesures)
  const compte = compterVerdicts(lignes)
  return (
    <p className="muted" style={{ fontSize: 12, margin: '0 0 14px' }}>
      Verdict sur les {ecransProduit.length} écrans du produit : {compte.travaille} travaillé
      {compte.travaille > 1 ? 's' : ''} · {compte.consulte} consulté{compte.consulte > 1 ? 's' : ''} · {compte.survole}{' '}
      survolé{compte.survole > 1 ? 's' : ''} · {compte.jamais_ouvert} jamais ouvert
      {compte.jamais_ouvert > 1 ? 's' : ''} · {compte.trop_recent} trop récent{compte.trop_recent > 1 ? 's' : ''} ·{' '}
      {compte.observations_insuffisantes} sous le seuil de sessions · {compte.non_mesure} non mesuré
      {compte.non_mesure > 1 ? 's' : ''} (date de mise en service indisponible pour les écrans sans vue sur cette
      fenêtre — jamais un « jamais ouvert » deviné).
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2bis. Sections du dossier compte, par fréquence (#2130.71)
// ─────────────────────────────────────────────────────────────────────────────

function SectionSectionsDossier({ rapport, erreur }: { rapport: RapportSectionsDossier | null; erreur: unknown }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Sections du dossier compte</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
        Quelles sections du dossier compte (Synthèse, Contacts, Partenaires…) sont ouvertes, et à quelle fréquence —
        filtré sur ce SEUL écran : une autre fiche à onglets (talent, mission…) n’entre jamais dans ce classement.
      </p>
      {!rapport ? (
        <ErreurOuChargement erreur={erreur} />
      ) : (
        <>
          <BlocMesure
            titre="Sections ouvertes, la plus fréquente d’abord"
            mesure={rapport.sections}
            videLibelle="Aucune section ouverte"
            render={sections => <SectionsDossierTable lignes={sections} />}
          />
          {/* #2130.69 — le numéro vit en commentaire : dans le texte, la garde des couleurs le lit comme un hexadécimal. */}
          <BlocValeurScalaire
            titre="Ouverture → compréhension (délai jusqu’à la première section ouverte)"
            mesure={rapport.comprehension}
            render={v => <KpiTile label="Délai médian" value={formaterDureeMediane(v.medianTimeToComprehension)} />}
          />
          {/* #2130.74 — le numéro vit en commentaire, même raison que ci-dessus. */}
          <BlocValeurScalaire
            titre="Synthèse → action (parmi les vues entrées par la Synthèse)"
            mesure={rapport.synthesisToAction}
            render={v => <KpiTile label="Taux de passage" value={formaterTaux(v.conversionRate)} />}
          />
          {/* #2130.72 — le numéro vit en commentaire, même raison que ci-dessus. */}
          <BlocValeurScalaire
            titre="Corrections soumises (résolution d’identité)"
            mesure={rapport.corrections}
            render={v => <KpiTile label="Total soumis" value={v.submitted} />}
          />
          {/* #2130.75 — le numéro vit en commentaire, même raison que ci-dessus. */}
          <BlocValeurScalaire
            titre="Contacts recommandés engagés (part des sessions du dossier)"
            mesure={rapport.engagedContacts}
            render={v => <KpiTile label="Sessions engagées" value={formaterTaux(v.engagedRate)} />}
          />
        </>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Parcours (#1684.1 — destination + fermeture pure ; #1684.2 — SegmentBar)
// ─────────────────────────────────────────────────────────────────────────────

function SectionParcours({ rapport, erreur }: { rapport: RapportParcours | null; erreur: unknown }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Parcours</h2>
      {!rapport ? (
        <ErreurOuChargement erreur={erreur} />
      ) : (
        <>
          <BlocMesure
            titre="Sorties par écran — destination principale et part de fermeture pure"
            mesure={rapport.exits}
            videLibelle="Aucune sortie"
            render={sorties => <SortiesTable lignes={sorties} />}
          />
          <BlocMesure
            titre="Parcours les plus fréquents (3 écrans)"
            mesure={rapport.sequences}
            videLibelle="Aucun parcours"
            render={sequences => <SectionParcoursSegments sequences={sequences} />}
          />
          <BlocMesure
            titre="Parcours interrompus (action démarrée, jamais terminée ni abandonnée)"
            mesure={rapport.interrupted}
            videLibelle="Aucun parcours interrompu"
            render={interrompus => <InterrompusTable lignes={interrompus} />}
          />
        </>
      )}
    </section>
  )
}

/**
 * #1684.2 — la barre segmentée des dix parcours principaux, résidu en
 * dernier. `SegmentBar` n'a pas besoin de frontière client (pas de fonction
 * dans ses props) : elle se rend directement depuis ce Server Component.
 */
function SectionParcoursSegments({ sequences }: { sequences: Parameters<typeof segmentsDesParcours>[0] }) {
  const { slices, masques } = segmentsDesParcours(sequences)
  return (
    <>
      <SegmentBar segments={slices} format={v => `${v} session${v > 1 ? 's' : ''}`} />
      {masques > 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
          Les parcours ci-dessus sont les {slices.length - 1} plus fréquents parmi les {sequences.length} que l’API a
          renvoyés (déjà bornée à un top 20) — le résidu « autres parcours » ne représente donc pas tout ce qui existe
          au-delà, seulement ce qui restait de cette liste déjà tronquée.
        </p>
      ) : null}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Friction
// ─────────────────────────────────────────────────────────────────────────────

function SectionFriction({ rapport, erreur }: { rapport: RapportFriction | null; erreur: unknown }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Friction</h2>
      {!rapport ? (
        <ErreurOuChargement erreur={erreur} />
      ) : (
        <>
          <BlocMesure
            titre="Répétition — la même action au moins 3 fois en moins de 30 s"
            mesure={rapport.repetitions}
            videLibelle="Aucune répétition"
            render={repetitions => <RepetitionsTable lignes={repetitions} />}
          />
          <BlocMesure
            titre="Aller-retour entre deux écrans"
            mesure={rapport.roundTrips}
            videLibelle="Aucun aller-retour"
            render={trips => <RoundTripsTable lignes={trips} />}
          />
          <BlocMesure
            titre="Erreur vue, par écran"
            mesure={rapport.errors}
            videLibelle="Aucune erreur vue"
            render={erreurs => <ErrorsTable lignes={erreurs} />}
          />
        </>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Demande non couverte
// ─────────────────────────────────────────────────────────────────────────────

function SectionDemande({ rapport, erreur }: { rapport: RapportDemande | null; erreur: unknown }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Demande non couverte</h2>
      {!rapport ? (
        <ErreurOuChargement erreur={erreur} />
      ) : (
        <BlocMesure
          titre="Recherches sans résultat, par écran — jamais le texte cherché"
          mesure={rapport.emptySearches}
          videLibelle="Aucune recherche sans résultat"
          render={recherches => <DemandeTable lignes={recherches} />}
        />
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5bis. Le croisement usage × demande (#1688.4)
// ─────────────────────────────────────────────────────────────────────────────

function SectionCroisement({ ecrans, demande }: { ecrans: RapportEcrans | null; demande: RapportDemande | null }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Usage × demande</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
        Ce que les deux sections précédentes ne disent pas ensemble : ce qu’on a et que personne n’utilise
        (sous-utilisé), et ce qu’on n’a pas et que tout le monde cherche (attendu mais absent). Une case dont l’une des
        deux sources ne permet pas de trancher est « non mesuré », jamais un zéro.
      </p>
      {!ecrans || !demande ? (
        <ErreurOuChargement erreur={null} />
      ) : (
        <CroisementTable
          lignes={croisementParEcran(
            ECRANS_PRODUIT,
            new Map(verdictsDesEcrans(ECRANS_PRODUIT, ecrans.screens).map(ligne => [ligne.route, ligne.verdict])),
            demande,
          )}
        />
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 5ter. VALEUR (#2130.73/#1946) — amorce, réponses jugées, brouillons repris,
// chaîne d'action, suites. Analytique = PRODUIT agrégé par écran/geste,
// jamais la personne (gardes GA-240/241/264) — cette section ne dérive
// rien : elle rend `RapportValeur` tel que l'API le calcule déjà.
// ─────────────────────────────────────────────────────────────────────────────

/** Le même bloc « mesure ou absence » que `BlocMesure`, pour un agrégat
 *  SCALAIRE (un objet, jamais un tableau) — `amorce`/`reponses`/`brouillons`/
 *  `suites` n'ont pas de longueur à tester pour un « zéro vrai », un objet
 *  mesuré se rend toujours par `render`. */
function BlocValeurScalaire<T>({
  titre,
  mesure,
  render,
}: {
  titre: string
  mesure: MesureOuAbsence<T>
  render: (valeur: T) => ReactNode
}) {
  const etat = etatDe(mesure)
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 13, margin: '0 0 6px', color: 'var(--muted)' }}>{titre}</h3>
      {etat.etat !== 'mesure' ? <EtatNonMesure etat={etat} /> : render(etat.valeur)}
    </div>
  )
}

function SectionValeur({ rapport, erreur }: { rapport: RapportValeur | null; erreur: unknown }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Valeur</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
        Ce qu’une réponse a produit : la première question jusqu’au premier résultat utile, ce que les personnes jugent
        des réponses, ce qu’un brouillon devient, la chaîne d’une action préparée, et ce qui suit une proposition. Le
        résultat métier n’est jamais dérivable de ce flux — nommé absent, jamais un zéro.
      </p>
      {!rapport ? (
        <ErreurOuChargement erreur={erreur} />
      ) : (
        <>
          <BlocValeurScalaire
            titre="Amorce — première question, premier résultat jugé utile"
            mesure={rapport.amorce}
            render={v => (
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                <KpiTile label="Premières questions" value={v.firstQuestionSessions} />
                <KpiTile label="Utile" value={formaterTaux(v.usefulRate)} />
                <KpiTile label="Délai médian jusqu’à l’utile" value={formaterDureeMediane(v.medianTimeToUseful)} />
              </section>
            )}
          />
          <BlocValeurScalaire
            titre="Réponses jugées — les six verdicts (D10, aucune case forcée)"
            mesure={rapport.reponses}
            render={v => (
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                <KpiTile label="Jugées" value={v.judged} />
                <KpiTile label="Utile" value={formaterTaux(v.utileRate)} />
                <KpiTile label="Pas pertinent" value={formaterTaux(v.generiqueRate)} />
                <KpiTile label="Donnée fausse" value={formaterTaux(v.inexacteRate)} />
                <KpiTile label="Déjà fait" value={formaterTaux(v.dejaFaitRate)} />
                <KpiTile label="Pas maintenant" value={formaterTaux(v.pasMaintenantRate)} />
                <KpiTile label="Mauvaise priorité" value={formaterTaux(v.mauvaisePrioriteRate)} />
              </section>
            )}
          />
          <BlocValeurScalaire
            titre="Brouillons — repris tel quel, retouchés, réécrits"
            mesure={rapport.brouillons}
            render={v => (
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                <KpiTile label="Brouillons repris" value={v.reused} />
                <KpiTile label="Tel quel" value={formaterTaux(v.telQuelRate)} />
                <KpiTile label="Retouché" value={formaterTaux(v.retoucheRate)} />
                <KpiTile label="Réécrit" value={formaterTaux(v.reecritRate)} />
              </section>
            )}
          />
          <BlocValeurScalaire
            titre="Priorités du jour — vues, traitées, reportées, refusées, corrigées"
            mesure={rapport.priorites}
            render={v => (
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                <KpiTile label="Priorités vues" value={v.viewed} />
                <KpiTile label="Traitées" value={formaterTaux(v.treatedRate)} />
                <KpiTile label="Refusées" value={formaterTaux(v.refusalRate)} />
                <KpiTile label="Reportées" value={v.snoozed} />
                <KpiTile label="Corrigées (donnée fausse)" value={v.corrected} />
              </section>
            )}
          />
          <BlocValeurScalaire
            titre="Chaîne d’une action préparée — préparée, exécutée, corrigée, par geste"
            mesure={rapport.actions}
            render={chaines =>
              chaines.length === 0 ? (
                <EmptyState icon="◇" message="Aucune action préparée — mesuré, aucun cas trouvé sur cette fenêtre." />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Action</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>Préparée</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>Exécutée</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>Corrigée</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>Taux d’exécution</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px' }}>Taux de correction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chaines.map(ligne => (
                      <tr key={ligne.action}>
                        <td style={{ padding: '4px 8px' }}>{ligne.action}</td>
                        <td style={{ textAlign: 'right', padding: '4px 8px' }}>{ligne.prepared}</td>
                        <td style={{ textAlign: 'right', padding: '4px 8px' }}>{ligne.executed}</td>
                        <td style={{ textAlign: 'right', padding: '4px 8px' }}>{ligne.corrected}</td>
                        <td style={{ textAlign: 'right', padding: '4px 8px' }}>{formaterTaux(ligne.executionRate)}</td>
                        <td style={{ textAlign: 'right', padding: '4px 8px' }}>{formaterTaux(ligne.correctionRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          />
          <BlocValeurScalaire
            titre="Suites — suggestion cliquée, redirection suivie, mémoire ajoutée, connecteur activé"
            mesure={rapport.suites}
            render={v => (
              <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
                <KpiTile label="Suggestions cliquées" value={v.suggestionClicks} />
                <KpiTile label="Redirections suivies" value={v.redirectsFollowed} />
                <KpiTile label="Interventions ignorées" value={formaterTaux(v.interventionIgnoredRate)} />
                <KpiTile label="Mémoires ajoutées" value={v.memoriesAdded} />
                {/* #4595 — mesure arrêtée (#4513) : nommée telle, dernière valeur connue ou « — », jamais 0. */}
                <KpiTile
                  label="Connecteurs activés après recommandation"
                  value={derniereValeurConnue(v.connectorsEnabledAfterHint)}
                  period="mesure arrêtée le 25/10/2026"
                />
              </section>
            )}
          />
          {/* #1946.26 — nommé, jamais chiffré à zéro (règle 5, GA-266) : un
              résultat métier appartient à un espace nommé, que ce flux
              n'écrit pas (`workspace_id` toujours `null`). */}
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Résultat métier : non dérivable de ce flux — un résultat métier appartient à un espace nommé, que le traceur
            comportemental n’écrit jamais.
          </p>
        </>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Retours utilisateurs par écran — corrélation, jamais une seconde dérivation
// ─────────────────────────────────────────────────────────────────────────────

function SectionRetoursParEcran({ items, erreur }: { items: FeedbackItem[]; erreur: string | null }) {
  const groupes = grouperParEcran(items).slice(0, 10)
  return (
    <section>
      <h2 style={{ fontSize: 16, margin: '0 0 10px' }}>Retours utilisateurs par écran</h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
        Le signal qualitatif à côté du signal automatique ci-dessus : ce que des personnes ont remonté, groupé par
        écran, en attendant que le traceur produit soit câblé sur les émetteurs qui manquent encore.
      </p>
      {erreur ? (
        <p className="error">Impossible de lire les retours : {erreur}</p>
      ) : groupes.length === 0 ? (
        <EmptyState icon="◇" message="Aucun retour enregistré." />
      ) : (
        <ul>
          {groupes.map(groupe => (
            <li key={groupe.libelle}>
              <Link
                className="link"
                href={`/feedback?vue=ecran&ecran=${encodeURIComponent(groupe.ecran ?? SENTINEL_ECRAN_INCONNU)}`}
              >
                {groupe.libelle}
              </Link>{' '}
              <span style={{ color: 'var(--muted)' }}>
                · {groupe.items.length} retour{groupe.items.length > 1 ? 's' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p style={{ fontSize: 12, marginTop: 10 }}>
        <Link className="link" href="/feedback?vue=ecran">
          Voir tous les retours, groupés par écran →
        </Link>
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Repli commun à chaque section quand SA route a échoué.
// ─────────────────────────────────────────────────────────────────────────────

function ErreurOuChargement({ erreur }: { erreur: unknown }) {
  const message = erreur instanceof Error ? erreur.message : 'route interne indisponible'
  return <p className="error">Impossible de lire cette section : {message}</p>
}
