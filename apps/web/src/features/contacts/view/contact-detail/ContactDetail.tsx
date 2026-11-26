import type { Contact } from '@bellum/contracts'
import { Box } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ContactFoldKey, resolveContactTab, revealContactAnchorWhenMounted } from './contactDetailTabs'
import { useContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import type { EngagementChannel } from '@/features/accounts/view/account-detail/components/contact-engagement/types'
import { useAccountRawAnalysis } from '@/features/accounts/hooks/useAccountRawAnalysis'
import { useAccountStrategy5P } from '@/features/accounts/hooks/useAccountStrategy5P'
import { ContactActionHistory } from './components/ContactActionHistory'
import { ContactCareerDetail } from './components/ContactCareerDetail'
import { ContactDisclosure } from './components/ContactDisclosure'
import { TaskList } from '@/features/tasks/view/TaskList'
import { ListTodo } from 'lucide-react'
import { SectionCard } from './components/SectionCard'
import { ContactCallTaskCard } from './components/ContactCallTaskCard'
import { ContactMeetingPlanCard } from './components/ContactMeetingPlanCard'
import { ContactCorrectionsCard } from './components/ContactCorrectionsCard'
import { ContactIntroductionRelay } from './components/ContactIntroductionRelay'
import { ContactCorrectionsHistory } from './components/ContactCorrectionsHistory'
import { ContactPermissionBadge } from './components/ContactPermissionBadge'
import { ContactPreflight } from './components/ContactPreflight'
import { ContactRelationalCtaBanner } from './components/ContactRelationalCtaBanner'
import { ContactPlanBlock } from './components/ContactPlanBlock'
import { ContactNetworkJournal } from '@/features/linkedin/view/ContactNetworkJournal'
import { ContactCrmExport } from './components/ContactCrmExport'
import { ContactLemlist } from '@/features/lemlist/view/ContactLemlist'
import { ContactCommercialUtility } from './components/ContactCommercialUtility'
import { DetectedNewEmployer } from './components/DetectedNewEmployer'
import { ContactExclusion } from './components/ContactExclusion'
import { ContactErasureCard } from './components/ContactErasureCard'
import { ContactHeader } from './components/ContactHeader'
import { HistoricalContactStillUseful } from './components/HistoricalContactStillUseful'
import { ContactKeyInfo } from './components/ContactKeyInfo'
import { ContactLifecycleTimeline } from './components/ContactLifecycleTimeline'
import { ContactAssociations } from './components/ContactAssociations'
import { ContactRelationSummary } from './components/ContactRelationSummary'
import { ContactNotesCard } from './components/ContactNotesCard'
import { ContactTimelineCard } from './components/ContactTimelineCard'
import { ContactRecordCard } from './components/ContactRecordCard'
import { NOTES_COMPOSER_ID } from '@/features/crm-core/view/NotesPanel'
import { ContactOutreachCard } from './components/ContactOutreachCard'
import { ContactOutreachMessagesCard } from './components/ContactOutreachMessagesCard'
import { ContactRelations } from './components/ContactRelations'
import { ContactRoleBlock } from './components/ContactRoleBlock'
import { SCORE_BREAKDOWN_ID } from './components/ContactScoreBreakdown'
import { ContactSignals } from './components/ContactSignals'
import { ContactFold } from './components/ContactFold'
import { ContactWorkBar } from './components/ContactWorkBar'
import { ContactWhyKey } from './components/ContactWhyKey'
import { ContactAmbiguousIdentityAlert } from './components/ContactAmbiguousIdentityAlert'
import { ContactSolicitationCollisionAlert } from './components/ContactSolicitationCollisionAlert'
import { ColleagueActivityBanner } from '@/features/team-guardrails/components/ColleagueActivityBanner'
import { ContactScopeNote } from '@/features/team-guardrails/components/ContactScopeNote'
import { DuplicateCandidatesCard } from '@/features/team-guardrails/components/DuplicateCandidatesCard'
import { useReadingPosition } from './useReadingPosition'
import { contactScoreView } from './contactDerive'
import { ContactAlertsBand } from './alerts/ContactAlertsBand'

/** Les ancres rangées DANS un pli : le pli s'ouvre avant qu'on y défile. #4585 — le détail du score n'est plus
 *  dans un pli (bloc « Rôle & périmètre » pleine largeur). */
const ANCHOR_FOLD: Record<string, ContactFoldKey> = {
  // #4596 — « Vérifier l'identité » : la confirmation de la bonne personne vit dans le pli « protections ».
  'contact-fold-protections': 'protections',
}

/**
 * #3687 — la fiche en ZONES, pas en onglets : l'en-tête reste pleine largeur,
 * dessous « informations » (gauche), l'espace de travail (centre, le plus
 * large : notes, historique, relations) et les dossiers associés (droite). Le
 * mobile empile centre → informations → dossiers : le travail d'abord.
 *
 * Les onglets Signaux et Activité sont retirés : les signaux vivent dans la
 * zone centrale, l'historique des gestes et le journal de modifications dans
 * un pli du côté des dossiers. Rien n'est supprimé, tout garde un emplacement.
 * Les plis ne montent leurs enfants qu'ouverts (aucune vue cachée en parallèle).
 *
 * #3720.2 — un ancien `?tab=` (onglets d'avant #3644 ou des cinq de #3644)
 * ouvre le pli ou amène l'ancre qui porte son contenu, jamais l'accueil.
 */
export function ContactDetail({
  contact,
  initialTab,
  onRefresh,
}: {
  contact: Contact
  initialTab?: string
  /** #4596 — « Revérifier » sur les cartes dérivées de la fiche elle-même : relit la fiche (lecture seule). */
  onRefresh?: () => Promise<unknown>
}) {
  const { t } = useTranslation('contacts')
  const [initialSection] = useState(() => resolveContactTab(initialTab))
  const [folds, setFolds] = useState<Record<ContactFoldKey, boolean>>(() => ({
    proofs: initialSection.fold === 'proofs',
    journal: initialSection.fold === 'journal',
    protections: initialSection.fold === 'protections',
  }))
  const [composeSignal, setComposeSignal] = useState(0)
  // #3688.10 — la position de lecture se retrouve au retour sur la fiche ; une ancre demandée (`?tab=`) gagne.
  useReadingPosition(contact.id, !initialSection.anchor)
  const setFold = (key: ContactFoldKey) => (open: boolean) => setFolds(prev => ({ ...prev, [key]: open }))
  const hasRelations = (contact.relations?.length ?? 0) > 0
  const { openEngagement } = useContactEngagement()
  // #3401.8 (recette 30/09) — le rôle MEDDIC encore à couvrir dans LE COMPTE
  // (déjà calculé, `deriveAccountStrategy5P`), réemployé sur la fiche contact
  // plutôt qu'un second calcul « par contact » (voir ContactCommercialUtility.tsx).
  const { data: strategy } = useAccountStrategy5P(contact.account_id ?? undefined)

  // #3637 — le dossier du compte nourrit l'éditeur (objections à anticiper, messages du plan).
  const rawAnalysis = useAccountRawAnalysis(contact.account_id)

  const navigate = useNavigate()
  const openContactEngagement = (channel: EngagementChannel, anchorRect?: DOMRect) => {
    // Théo C6/C7 — l'e-mail, le message LinkedIn et l'appel se préparent sur leur PAGE (`/contacts/<id>/approach/<canal>`) ;
    // les canaux préparés (tâche, recommandation, introduction…) gardent le panneau.
    if (channel === 'email' || channel === 'linkedin' || channel === 'phone') {
      void navigate({
        to: '/contacts/$id/approach/$channel',
        params: { id: contact.id, channel: channel === 'phone' ? 'call' : channel },
      })
      return
    }
    openEngagement([contact], channel, { anchorRect, rawAnalysis })
  }

  // #3720.3 — une ancre dont l'id n'est pas monté ne doit pas être un clic sans
  // effet : on ouvre le pli qui la porte, on réessaie après le rendu, puis on
  // ramène l'utilisateur en haut de la fiche.
  const reveal = useCallback((id: string) => {
    const fold = ANCHOR_FOLD[id]
    if (fold) setFolds(prev => ({ ...prev, [fold]: true }))
    // #4596 — « Corriger la fiche » : le détail natif qui porte la fiche modifiable s'ouvre avant qu'on y défile.
    const target = document.getElementById(id)
    if (target instanceof HTMLDetailsElement) target.open = true
    revealContactAnchorWhenMounted(id, () => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }, [])

  // « Ajouter une note » : l'éditeur est monté en haut de la zone centrale.
  const goToNote = useCallback(() => reveal(NOTES_COMPOSER_ID), [reveal])
  // #1129 : « Comment le scoring est fait ? ». Le détail du score est dans le bloc « Rôle & périmètre » (#4585).
  const goToScore = useCallback(() => reveal(SCORE_BREAKDOWN_ID), [reveal])
  // #4585 — sans détail calculé, la carte du détail ne se monte pas : le lien ne se propose pas (jamais un clic qui
  // finit en haut de la fiche).
  const hasScoreBreakdown = contactScoreView(contact).breakdown !== null
  // #3692 — « voir les signaux » : la zone centrale les porte déjà, on l'amène à l'écran.
  const goToSignals = useCallback(() => reveal('contact-signals'), [reveal])

  // #3720.2 — l'ancre d'un ancien `?tab=` se révèle une fois, au montage.
  useEffect(() => {
    if (initialSection.anchor) reveal(initialSection.anchor)
  }, [initialSection, reveal])

  return (
    // #1846 — la gouttière vient du parent (`CustomerPage`) : ce conteneur ne retape aucun `px-4`.
    <Box className="mx-auto w-full max-w-[1480px] space-y-5">
      {/* Théo B c5-fiche-contact `.entity-hero` — identité, badges, Enrichir · Contacter · Autres actions.
          #3640 — « Notes » d'« Autres actions » mène à l'éditeur de l'historique (#3688). */}
      <ContactHeader contact={contact} onGenerateMessage={openContactEngagement} onOpenNotes={goToNote} />
      {/* #2150.60 — silencieux dès que le rôle peut écrire ; seule l'EXCEPTION se nomme. */}
      <ContactPermissionBadge />

      {/* Théo B c5 `.t-banner.warn` « Avant d'agir sur ce contact » — sur TOUTE la largeur, au-dessus des trois
          colonnes : écarts de sources (#3219), relation historique, nouvel employeur, identité incertaine,
          sollicitation en double, collègue qui l'a travaillé, doublon probable (#4158). #4596 — REPLIÉ par défaut :
          le pli dit ce qu'il cache, une carte neuve l'ouvre, chaque carte s'ignore (réversible) et se revérifie. #4504.3 — « Ne pas contacter »
          a rejoint « Préférence de sollicitation » dans Informations clés.
          Aucun écart = aucune carte ; rien ne bloque, rien ne fusionne. */}
      <ContactAlertsBand key={contact.id} contactId={contact.id}>
        <ContactPreflight contactId={contact.id} onReveal={reveal} />
        <HistoricalContactStillUseful contact={contact} onReveal={reveal} onRecheck={onRefresh} />
        <DetectedNewEmployer contact={contact} onReveal={reveal} onRecheck={onRefresh} />
        <ContactAmbiguousIdentityAlert contact={contact} onReveal={reveal} onRecheck={onRefresh} />
        <ContactSolicitationCollisionAlert contact={contact} onReveal={reveal} />
        <ColleagueActivityBanner contactId={contact.id} onReveal={reveal} />
        <DuplicateCandidatesCard kind="contact" id={contact.id} />
      </ContactAlertsBand>
      {/* #4996 L6 — « Dans la zone de X » : information non bloquante, même patron que le bandeau collègue. */}
      {contact.account_id ? <ContactScopeNote accountId={contact.account_id} entityId={contact.entity_id} /> : null}

      {/* Théo B c5 `.contact-layout` — trois colonnes : propriétés (gauche), travail (centre, le plus large),
          dossiers associés (droite). Tablette : propriétés et dossiers empilés à gauche du travail. Mobile : le
          travail d'abord, puis les propriétés, puis les dossiers — rien n'est caché.
          #4523 — au pixel de C5 : 240 / 1fr / 260, 260 / 1fr / 290 en grand, 225 / 1fr en tablette, gouttière 22 px
          (`ContactDetail.layout.test.ts` lit la maquette). */}
      <Box
        data-testid="contact-layout"
        className="grid grid-cols-1 items-start gap-5 md:grid-cols-[14.0625rem_minmax(0,1fr)] md:gap-[1.375rem] lg:grid-cols-[15rem_minmax(0,1fr)_16.25rem] xl:grid-cols-[16.25rem_minmax(0,1fr)_18.125rem]"
      >
        {/* #4523 (mesure prod 27/10, 1512 px : 2 548 px de page, deux trous de ~210 px sous « Informations clés » et
            « Où en est la relation ») — DEUX FLUX sur grand écran : le flux principal (gauche + centre, puis les
            rangées juste dessous) et, à droite, les dossiers sur toute la hauteur. La colonne de droite ne fixe plus
            la hauteur du haut, et sa hauteur ne s'ajoute plus à celle des rangées. Les colonnes de C5 restent au pixel
            (240 | 1fr | 260, 260 | 1fr | 290) ; sous 1024 px ce conteneur s'efface (`contents`) : tablette et mobile
            gardent leur placement et leur ordre. */}
        <Box
          data-testid="contact-main"
          className="contents min-w-0 lg:col-span-2 lg:col-start-1 lg:row-start-1 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-[1.375rem] xl:grid-cols-[16.25rem_minmax(0,1fr)]"
        >
          <Box
            as="aside"
            aria-label={t('zones.info')}
            className="order-2 min-w-0 space-y-3 md:order-none md:col-start-1 md:row-start-1"
          >
            <ContactKeyInfo contact={contact} />
          </Box>

          <Box
            as="section"
            aria-label={t('zones.work')}
            className="order-1 min-w-0 space-y-5 md:order-none md:col-start-2 md:row-span-2 md:row-start-1 lg:row-span-1"
          >
            {/* #3692 — « Pourquoi préparer cet échange » : la lecture de Laura, la priorité en mots, et le geste
              contextuel (#2160.15-.19, rend `null` sans signal : jamais un bouton vide). */}
            <ContactWhyKey
              contact={contact}
              onExplainScore={hasScoreBreakdown ? goToScore : undefined}
              onOpenSignals={goToSignals}
              action={
                <ContactRelationalCtaBanner
                  contact={contact}
                  onGenerateMessage={openContactEngagement}
                  onReveal={reveal}
                />
              }
            />
            {/* #3691 — dernier échange, prochaine action : un résumé (Théo `.relation-summary`). */}
            <ContactRelationSummary contactId={contact.id} accountId={contact.account_id ?? null} />
          </Box>

          {/* #4523 — le bas de page en RANGÉES pleine largeur (maquette C5), plus dans la colonne étroite du centre :
            prochaines actions, historique & notes, données & protections. Mobile : même ordre qu'avant (order-1,
            juste après le travail). */}
          <Box
            data-testid="contact-rows"
            className="order-1 min-w-0 space-y-5 md:order-none md:col-span-full md:row-start-3 lg:row-start-2 lg:pb-24"
          >
            {/* #4585 — « Rôle & périmètre » : UN bloc pleine largeur (rôle, périmètre, priorité par axes, utilité). */}
            <ContactRoleBlock
              contact={contact}
              accountSector={typeof rawAnalysis?.sector === 'string' ? rawAnalysis.sector : null}
              strategy={strategy ?? null}
            />

            {/* Théo B c5 « Prochaines actions » (C5.A9 / A10) — tâches à venir, appel à passer, rendez-vous, plan. */}
            <Box as="section" aria-labelledby="contact-next-actions" className="space-y-3">
              <h2 id="contact-next-actions" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
                {t('sections.nextActions')}
              </h2>
              {/* #4523 — Tâches · Appel · Rendez-vous côte à côte (maquette C5 : 1.1fr 1.5fr 1fr), plus empilés dans
                une colonne étroite. */}
              <Box className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1.1fr_1.5fr_1fr]">
                {/* #3693 — « Tâches » = action FUTURE (échéance, responsable). */}
                <SectionCard icon={ListTodo} title={t('actionsCard.title')}>
                  <TaskList
                    scope="contact"
                    entityId={contact.id}
                    accountId={contact.account_id ?? undefined}
                    contactId={contact.id}
                    compact
                    screen="/contacts/$id"
                  />
                </SectionCard>
                <ContactCallTaskCard contact={contact} onPrepare={() => openContactEngagement('phone')} />
                <ContactMeetingPlanCard contact={contact} />
              </Box>
              {/* #4416 — « Plan pour <prénom> » : les étapes du plan DU COMPTE qui le visent. */}
              <ContactPlanBlock contact={contact} rawAnalysis={rawAnalysis} />
            </Box>

            {/* Théo B c5 « Historique & notes » — la barre de gestes, puis le fil daté. */}
            <Box as="section" aria-labelledby="contact-history" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="contact-history" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
                  {t('sections.history')}
                </h2>
                <ContactWorkBar
                  contactId={contact.id}
                  accountId={contact.account_id ?? null}
                  onAddNote={goToNote}
                  onLogExchange={() => setComposeSignal(n => n + 1)}
                />
              </div>
              {/* #4523 — notes | fil des échanges (maquette C5 : 1fr 1.4fr). */}
              <Box className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_1.4fr]">
                <ContactNotesCard contact={contact} />
                {/* #2160.17 / #3689 — cible du CTA « Traiter la réponse » : messages envoyés ET reçus. */}
                <div id="contact-timeline" className="min-w-0">
                  <ContactTimelineCard contact={contact} composeSignal={composeSignal} />
                </div>
              </Box>
            </Box>

            {/* Théo B c5 `.t-datablock` « Données & protections » — corriger, preuves, journal, protections. */}
            <Box as="section" aria-labelledby="contact-data" className="space-y-3">
              <h2 id="contact-data" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
                {t('sections.data')}
              </h2>
              {/* #4523 — preuves | protections (maquette C5 : 1fr 1fr). */}
              <Box className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[1fr_1fr]">
                <Box className="min-w-0 space-y-3">
                  {/* #3716 — la fiche modifiable se demande, pour corriger (même composant, même écriture). */}
                  <ContactDisclosure
                    id="contact-correct"
                    title={t('careerDetail.correctTitle')}
                    hint={t('careerDetail.correctHint')}
                  >
                    <ContactRecordCard contact={contact} />
                  </ContactDisclosure>
                  <ContactFold
                    id="contact-fold-proofs"
                    title={t('folds.proofs')}
                    open={folds.proofs}
                    onOpenChange={setFold('proofs')}
                  >
                    {/* #3691 — le cycle de vie validé vit avec les propriétés de la personne. */}
                    <ContactLifecycleTimeline contactId={contact.id} />
                    <ContactCrmExport contact={contact} />
                  </ContactFold>
                  <ContactFold
                    id="contact-fold-journal"
                    title={t('folds.journal')}
                    open={folds.journal}
                    onOpenChange={setFold('journal')}
                  >
                    <ContactActionHistory activity={contact.activity} emptyCta={{ contact, onAddNote: goToNote }} />
                    {/* #2150.60 — un contact à qualifier (#1473) n'a pas de compte : pas de graphe d'organisation. */}
                    {contact.account_id ? (
                      <ContactCorrectionsHistory accountId={contact.account_id} contactId={contact.id} />
                    ) : null}
                  </ContactFold>
                </Box>
                <Box className="min-w-0 space-y-3">
                  {/* #2160.29/.58 — corriger, écarter, effacer : trois gestes DISTINCTS, du moins au plus irréversible. */}
                  <ContactFold
                    id="contact-fold-protections"
                    title={t('folds.protections')}
                    open={folds.protections}
                    onOpenChange={setFold('protections')}
                  >
                    <ContactCorrectionsCard contact={contact} />
                    <ContactExclusion contact={contact} />
                    <ContactErasureCard contact={contact} />
                  </ContactFold>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* #4523.1 (mesure prod 31/10 : top 1432 px à scrollTop 0, jamais épinglé) — enfant DIRECT de la grille
            `items-start`, rangée 1 et `self-start` explicites : jamais étirée, jamais sous un bloc haut. Garde #5037. */}
        {/* #4523.1 — collante sur grand écran : sans elle, la colonne s'arrêtait à ~1 088 px d'une page de 2 632 px et
            laissait ~1 500 px vides. Bornée par `dvh` et défilante (focalisable) : rien n'est hors d'atteinte. */}
        <aside
          aria-label={t('zones.files')}
          className="order-3 min-w-0 space-y-5 md:order-none md:col-start-1 md:row-start-2 lg:col-start-3 lg:row-start-1 lg:self-start lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
          tabIndex={0}
        >
          {/* Théo « Compte associé » + « Affaires liées » — #3712 : compte, projets, besoins, missions liés. */}
          <ContactAssociations contactId={contact.id} />
          {/* Théo « Travail en cours » — #2366.1 messages préparés (le MÊME objet que le centre d'approbation),
              #3700 séquence de relance (hors de tout pli), #4427 campagne de l'outil de séquences branché. */}
          <ContactOutreachMessagesCard contact={contact} />
          <div id="contact-outreach">
            <ContactOutreachCard contact={contact} />
          </div>
          <ContactLemlist contactId={contact.id} />
          {/* Théo « Relations » — #3720.2 cible d'un ancien `?tab=relations` ; #3690 le relais d'introduction. */}
          {hasRelations ? (
            <div id="contact-relations">
              <ContactRelations contact={contact} onAddNote={goToNote} />
            </div>
          ) : null}
          <ContactIntroductionRelay contactId={contact.id} contactName={contact.full_name} />
          {/* Théo « Ce qu'on sait de son parcours » — #3716 parcours et colonnes importées, puis les signaux. */}
          <div id="contact-apollo-profile">
            <ContactCareerDetail contact={contact} />
          </div>
          <div id="contact-signals">
            <ContactSignals signals={contact.signals} />
          </div>
        </aside>
      </Box>
    </Box>
  )
}
