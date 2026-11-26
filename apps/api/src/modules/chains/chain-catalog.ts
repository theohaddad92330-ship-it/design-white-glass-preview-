import { reasonRequired, type Chain } from '@bellum/contracts'

/**
 * LES SEPT CHAÎNES (PDF 6 §6.1).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI LES ÉTAPES SONT MOINS NOMBREUSES QUE LE DOCUMENT NE L'ANNONCE
 * ─────────────────────────────────────────────────────────────────────────
 * Le §6.1 donne des compteurs — 15, 30, 18, 16, 18, 23, 22 — et les portes de
 * chaque chaîne. Il ne donne **jamais le contenu des 142 étapes**. Les inventer
 * pour atteindre le compte produirait une carte du processus dont la moitié des
 * cases ne correspondrait à aucun geste possible dans le produit : la version
 * « chaîne » du « livré mais jamais appelé » que ce dépôt traque partout.
 *
 * Chaque étape ci-dessous correspond donc à **un geste que Bellum sait
 * réellement faire aujourd'hui**, et le tracker dit combien il en manque par
 * rapport au compteur annoncé. Une chaîne s'allonge quand une capacité arrive —
 * pas avant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES PORTES
 * ─────────────────────────────────────────────────────────────────────────
 * Elles sont référencées par leur CLÉ du catalogue partagé, jamais par le
 * numéro du document : ses G5 à G8 désignent autre chose que les nôtres, et
 * renommer les nôtres casserait le journal d'audit (décision D46).
 *
 * ⚠️ `reasonRequired` n'est pas une opinion de ce fichier : il est DÉRIVÉ de la
 * règle partagée (`decision-gate.ts`). Écrit à la main, il avait déjà divergé —
 * `proof_sufficiency` et `invoice_readiness` portaient « pas de motif » quand le
 * catalogue des portes en exige un pour tout refus. Le jour où la chaîne s'est
 * mise à journaliser, le journal refusait ce que la chaîne acceptait. Un réglage
 * vit à un seul endroit (GA-26) ; la garde `chain-catalog.spec.ts` le vérifie.
 *
 * ⚠️ Le catalogue vit dans le CODE, comme celui des workflows et des routines.
 * Une chaîne éditable en base serait un chemin que personne ne relit — et un
 * espace ne peut pas créer les siennes en V1 (décision D42).
 */

const step = (
  position: number,
  fr: string,
  en: string,
  actor: Chain['steps'][number]['actor'],
  outFr: string,
  outEn: string,
  capability: string | null = null,
  level: Chain['steps'][number]['automationLevel'] = 'n1_prepare',
): Chain['steps'][number] => ({
  position,
  label: { fr, en },
  actor,
  expectedOutput: { fr: outFr, en: outEn },
  automationLevel: level,
  requiredCapability: capability,
  outsideTool: false,
})

/**
 * Une étape que l'humain fait AILLEURS (décision D48).
 *
 * Badge, VPN, matériel, référencement : aucun connecteur ne les exécute et il
 * n'en existera pas. Les inscrire quand même n'est pas un reniement de la règle
 * « n'y figure que ce qui tourne réellement » — c'est sa moitié manquante : le
 * produit s'interdit de prétendre exécuter, pas de SUIVRE. L'étape est marquée,
 * l'écran le dit, et personne n'attend une automatisation qui ne viendra pas.
 */
const manualStep = (
  position: number,
  fr: string,
  en: string,
  outFr: string,
  outEn: string,
): Chain['steps'][number] => ({
  position,
  label: { fr, en },
  actor: 'user',
  expectedOutput: { fr: outFr, en: outEn },
  automationLevel: 'n0_advice',
  requiredCapability: null,
  outsideTool: true,
})

export const CHAIN_CATALOG: readonly Chain[] = [
  {
    key: 'ouverture_compte',
    label: { fr: 'Ouverture de compte', en: 'Account opening' },
    purpose: {
      fr: 'Du premier signal à une première action commerciale structurée.',
      en: 'From the first signal to a first structured sales action.',
    },
    domain: 'acquisition',
    subjectType: 'account',
    steps: [
      step(1, 'Compte détecté', 'Account detected', 'agent', 'Un dossier existe', 'A file exists'),
      step(2, 'Analyse lancée', 'Analysis run', 'user', 'Un dossier complet', 'A complete file'),
      step(3, 'Signaux relevés', 'Signals collected', 'agent', 'Des signaux datés', 'Dated signals'),
      step(4, 'Score et verdict', 'Score and verdict', 'agent', 'Un score motivé', 'A justified score'),
      step(5, 'Entités cartographiées', 'Entities mapped', 'agent', 'Le périmètre retenu', 'The retained scope'),
      step(6, 'Décideurs identifiés', 'Decision-makers identified', 'agent', 'Un organigramme', 'An org chart'),
      step(7, 'Contacts enrichis', 'Contacts enriched', 'user', 'Des coordonnées réelles', 'Real contact details'),
      step(8, 'Plan de compte', 'Account plan', 'agent', 'Un plan d’attaque', 'An attack plan'),
      step(9, 'Angles retenus', 'Angles chosen', 'user', 'Les angles à jouer', 'The angles to play'),
      step(10, 'Compte au portefeuille', 'Account in portfolio', 'user', 'Un compte suivi', 'A tracked account'),
      // Les gestes qui ouvrent VRAIMENT un compte et qu'aucun outil n'exécute.
      manualStep(
        11,
        'Introduction obtenue',
        'Introduction obtained',
        'Un nom qui ouvre la porte',
        'A name that opens the door',
      ),
      manualStep(12, 'Premier échange tenu', 'First conversation held', 'Un compte rendu', 'Meeting notes'),
      manualStep(
        13,
        'Besoin confirmé de vive voix',
        'Need confirmed verbally',
        'Un besoin dit, pas déduit',
        'A stated need, not inferred',
      ),
      manualStep(
        14,
        'Interlocuteur achats identifié',
        'Procurement contact identified',
        'Un nom et un rôle',
        'A name and a role',
      ),
      manualStep(
        15,
        'Conditions d’entrée connues',
        'Entry conditions known',
        'Référencement, tarifs, délais',
        'Listing, rates, lead times',
      ),
    ],
    gates: [
      {
        afterPosition: 9,
        gate: 'account_priority',
        question: {
          fr: 'Ce compte entre-t-il dans le portefeuille ?',
          en: 'Does this account enter the portfolio?',
        },
        yesTargetPosition: 10,
        // Un refus renvoie à l'analyse, pas à la fin : un compte écarté
        // aujourd'hui se retravaille, et son motif reste attaché au dossier.
        noTargetPosition: 4,
        reasonRequired: reasonRequired('account_priority', 'refuse'),
      },
    ],
    returnLoop: {
      fr: 'Un signal nouveau ramène le dossier à l’analyse pour rafraîchir le plan.',
      en: 'A new signal sends the file back to analysis to refresh the plan.',
    },
  },
  {
    key: 'acquisition',
    label: { fr: 'Acquisition', en: 'Acquisition' },
    purpose: {
      fr: "D'un compte au portefeuille à un premier besoin exprimé.",
      en: 'From an account in the portfolio to a first expressed need.',
    },
    domain: 'acquisition',
    subjectType: 'account',
    steps: [
      step(1, 'Contact qualifié', 'Contact qualified', 'user', 'Un interlocuteur retenu', 'A retained contact'),
      step(2, 'Angle choisi', 'Angle chosen', 'user', 'Un angle daté', 'A dated angle'),
      step(3, 'Message préparé', 'Message prepared', 'agent', 'Un brouillon', 'A draft', 'mailbox'),
      step(
        4,
        'Message envoyé',
        'Message sent',
        'user',
        'Un envoi tracé',
        'A traced send',
        'mailbox',
        'n2_user_approval',
      ),
      step(
        5,
        'Relance préparée',
        'Follow-up prepared',
        'agent',
        'Un brouillon de relance',
        'A follow-up draft',
        'mailbox',
      ),
      step(6, 'Réponse reçue', 'Reply received', 'connector', 'Une réponse datée', 'A dated reply', 'mailbox'),
      step(7, 'Rendez-vous posé', 'Meeting booked', 'user', 'Un créneau confirmé', 'A confirmed slot', 'calendar'),
      step(8, 'Besoin exprimé', 'Need expressed', 'user', 'Un besoin qualifié', 'A qualified need'),
      // Ce qui se joue APRÈS le premier rendez-vous, et qu'aucun connecteur ne
      // voit : c'est là qu'une prise de contact devient une affaire.
      manualStep(9, 'Rendez-vous tenu', 'Meeting held', 'Un compte rendu', 'Meeting notes'),
      manualStep(
        10,
        'Budget et échéance confirmés',
        'Budget and timing confirmed',
        'Un ordre de grandeur et une date',
        'A ballpark and a date',
      ),
      manualStep(11, 'Décideur rencontré', 'Decision-maker met', 'Un nom qui signe', 'A name that signs'),
    ],
    // Aucune porte : le §6.1 n'en déclare pas pour cette chaîne, et en inventer
    // une ferait franchir une décision que personne n'a demandée.
    gates: [],
    returnLoop: {
      fr: 'Une réponse arrête la séquence — définitivement, comme le veut le garde-fou N5 n°1.',
      en: 'A reply stops the sequence — for good, as N5 guardrail #1 requires.',
    },
  },
  {
    key: 'prospection_inversee',
    label: { fr: 'Prospection inversée', en: 'Reverse prospecting' },
    purpose: {
      fr: "D'un profil disponible à un client qui accepte de le recevoir.",
      en: 'From an available profile to a client willing to meet them.',
    },
    domain: 'acquisition',
    /**
     * Le sujet est le CONSULTANT, pas le compte (#1503).
     *
     * Toutes les étapes parlent de lui — « Consultant disponible »,
     * « Compétences retenues », « Comptes cibles ». Déclaré sur un compte,
     * l'étape 1 n'avait aucun fait qui la porte ; sur un consultant,
     * `consultants.availability` la porte exactement. Une position écrite à la
     * main pouvait masquer ce décalage indéfiniment ; une position DÉRIVÉE ne
     * le peut pas — c'est ce que la dérivation a fait apparaître en premier.
     */
    subjectType: 'consultant',
    steps: [
      step(
        1,
        'Consultant disponible',
        'Consultant available',
        'agent',
        'Une disponibilité datée',
        'A dated availability',
      ),
      step(2, 'Compétences retenues', 'Skills selected', 'user', 'Une stack prouvée', 'A proven stack'),
      step(3, 'Comptes cibles', 'Target accounts', 'agent', 'Une liste motivée', 'A justified list'),
      step(4, 'Insight par compte', 'Per-account insight', 'agent', 'Un angle par compte', 'One angle per account'),
      step(5, 'Message préparé', 'Message prepared', 'agent', 'Un brouillon', 'A draft', 'mailbox'),
      step(6, 'Retour client', 'Client feedback', 'connector', 'Une réponse datée', 'A dated reply', 'mailbox'),
      step(7, 'Besoin détecté', 'Need detected', 'user', 'Un besoin créé', 'A created need'),
      manualStep(8, 'Rendez-vous obtenu', 'Meeting obtained', 'Une date dans l’agenda', 'A date in the calendar'),
      manualStep(
        9,
        'Besoin cadré avec le client',
        'Need framed with the client',
        'Un périmètre écrit',
        'A written scope',
      ),
    ],
    gates: [],
    returnLoop: {
      fr: 'Un insight qui ne prend pas ramène au choix des comptes cibles.',
      en: 'An insight that does not land sends the file back to target selection.',
    },
  },
  {
    key: 'sourcing_matching',
    label: { fr: 'Sourcing et matching', en: 'Sourcing and matching' },
    purpose: {
      fr: 'Du besoin client à la décision finale : transformer un besoin qualifié en profil accepté.',
      en: 'From the client need to the final decision: turning a qualified need into an accepted profile.',
    },
    domain: 'sourcing',
    subjectType: 'need',
    steps: [
      step(1, 'Besoin ouvert', 'Need opened', 'user', 'Un besoin avec ses compétences', 'A need with its skills'),
      step(2, 'Critères posés', 'Criteria set', 'user', 'Des critères typés', 'Typed criteria'),
      step(3, 'Matching lancé', 'Matching run', 'agent', 'Un classement en treize axes', 'A thirteen-axis ranking'),
      step(4, 'Profils retenus', 'Profiles retained', 'user', 'Une présélection', 'A candidate set'),
      step(5, 'Shortlist figée', 'Shortlist frozen', 'user', 'Cinq profils au maximum', 'Five profiles at most'),
      step(6, 'Dossiers générés', 'Dossiers generated', 'agent', 'Un dossier par profil', 'One dossier per profile'),
      step(7, 'Profil positionné', 'Profile submitted', 'user', 'Un positionnement tracé', 'A traced submission'),
      /*
       * Ces quatre-là étaient marquées « hors outil » — et elles ne le sont
       * pas (#1503).
       *
       * Le retour du client vit dans `submissions.first_feedback_at`,
       * l'entretien dans `interviews`, la décision dans `submissions.closed_at`
       * avec son motif, les conditions dans `mission_commercial_terms`. Les
       * quatre tables existaient déjà quand le catalogue a été écrit ; c'est le
       * classement qui était faux, et il retirait à la chaîne la moitié de ce
       * qu'elle sait dire. Une étape est « hors outil » quand AUCUNE table ne la
       * porte — pas quand personne n'y a encore pensé.
       */
      step(
        8,
        'Dossier relu par le client',
        'Dossier reviewed by the client',
        'connector',
        'Un retour, même bref',
        'Feedback, however brief',
      ),
      step(
        9,
        'Entretien technique tenu',
        'Technical interview held',
        'user',
        'Un compte rendu du consultant',
        'A debrief from the consultant',
      ),
      step(
        10,
        'Décision client obtenue',
        'Client decision obtained',
        'user',
        'Un oui, un non, ou une date',
        'A yes, a no, or a date',
      ),
      step(11, 'Conditions négociées', 'Terms negotiated', 'user', 'TJM et date de démarrage', 'Rate and start date'),
    ],
    gates: [
      {
        afterPosition: 2,
        gate: 'need_staffable',
        question: { fr: 'Ce besoin est-il staffable ?', en: 'Is this need staffable?' },
        yesTargetPosition: 3,
        noTargetPosition: 1,
        reasonRequired: reasonRequired('need_staffable', 'refuse'),
      },
      {
        afterPosition: 6,
        gate: 'submission_send',
        question: { fr: 'Ce profil part-il chez le client ?', en: 'Does this profile go to the client?' },
        yesTargetPosition: 7,
        // Un refus renvoie au matching : c'est la boucle du §6.1.
        noTargetPosition: 3,
        reasonRequired: reasonRequired('submission_send', 'refuse'),
      },
    ],
    returnLoop: {
      fr: 'Un refus client ramène au matching, avec le motif attaché au besoin.',
      en: 'A client rejection sends the file back to matching, with the reason attached to the need.',
    },
  },
  {
    key: 'push_ao_conversion',
    label: { fr: 'Appel d’offres et conversion', en: 'Tender and conversion' },
    purpose: {
      fr: "De l'opportunité détectée à la proposition, puis à la décision du client.",
      en: "From the detected opportunity to the proposal, then the client's decision.",
    },
    domain: 'acquisition',
    subjectType: 'project',
    steps: [
      step(
        1,
        'Appel d’offres reçu',
        'Tender received',
        'connector',
        'Un document analysable',
        'An analysable document',
      ),
      step(2, 'Résumé structuré', 'Structured summary', 'agent', 'Les exigences extraites', 'Extracted requirements'),
      step(3, 'Décision de répondre', 'Bid decision', 'user', 'Un go ou un no-go motivé', 'A justified go or no-go'),
      step(4, 'Profils identifiés', 'Profiles identified', 'agent', 'Des candidats classés', 'Ranked candidates'),
      step(5, 'Preuves rassemblées', 'Proofs gathered', 'agent', 'Des références valides', 'Valid references'),
      step(6, 'Réponse préparée', 'Response prepared', 'user', 'Un dossier de réponse', 'A response file'),
      step(7, 'Entretien tenu', 'Interview held', 'user', 'Un compte rendu', 'A debrief'),
      step(8, 'Résultat enregistré', 'Outcome recorded', 'user', 'Un motif, gagné ou perdu', 'A reason, won or lost'),
      manualStep(
        9,
        'Réponse déposée sur la plateforme',
        'Response filed on the platform',
        'Un accusé de dépôt',
        'A filing receipt',
      ),
      manualStep(10, 'Questions-réponses traitées', 'Clarifications answered', 'Les réponses envoyées', 'Answers sent'),
      manualStep(11, 'Soutenance tenue', 'Oral defence held', 'Un compte rendu', 'Meeting notes'),
      manualStep(
        12,
        'Notification du résultat reçue',
        'Outcome notification received',
        'Le classement obtenu',
        'The ranking obtained',
      ),
    ],
    gates: [
      {
        afterPosition: 6,
        gate: 'interview_go',
        question: { fr: 'Le client accorde-t-il l’entretien ?', en: 'Does the client grant the interview?' },
        yesTargetPosition: 7,
        noTargetPosition: 4,
        reasonRequired: reasonRequired('interview_go', 'refuse'),
      },
    ],
    returnLoop: {
      fr: 'Sans retour du client, le dossier revient à la préparation pour une relance.',
      en: 'With no client feedback, the file returns to preparation for a follow-up.',
    },
  },
  {
    key: 'rang2_rang1',
    label: { fr: 'Passage rang 2 → rang 1', en: 'Tier 2 → tier 1' },
    purpose: {
      fr: "D'un accès par intermédiaire à une relation directe avec le client final.",
      en: 'From access through an intermediary to a direct relationship with the end client.',
    },
    domain: 'capitalisation',
    subjectType: 'account',
    steps: [
      step(
        1,
        'Position actuelle constatée',
        'Current position noted',
        'user',
        'Un rang assumé',
        'An acknowledged tier',
      ),
      step(2, 'Missions réalisées listées', 'Delivered assignments listed', 'agent', 'Un historique', 'A track record'),
      step(3, 'REX collectés', 'Retrospectives collected', 'user', 'Des retours datés', 'Dated feedback'),
      step(4, 'Preuves qualifiées', 'Proofs qualified', 'user', 'Des preuves avec accord', 'Proofs with consent'),
      step(5, 'Dossier de référencement', 'Reference file', 'user', 'Un dossier complet', 'A complete file'),
      step(6, 'Demande déposée', 'Application submitted', 'user', 'Une demande tracée', 'A traced application'),
      // Le référencement grand compte est un parcours administratif : aucun
      // connecteur ne le pilote, et il n'en existera pas.
      manualStep(7, 'Audit fournisseur passé', 'Supplier audit passed', 'Un avis écrit', 'A written opinion'),
      manualStep(
        8,
        'Conditions contractuelles négociées',
        'Contract terms negotiated',
        'Un contrat-cadre',
        'A framework agreement',
      ),
      manualStep(9, 'Référencement obtenu', 'Listing obtained', 'Un numéro de fournisseur', 'A supplier number'),
      manualStep(
        10,
        'Premier appel d’offres reçu en direct',
        'First tender received directly',
        'Une consultation nominative',
        'A named consultation',
      ),
    ],
    gates: [
      {
        afterPosition: 4,
        gate: 'proof_sufficiency',
        question: { fr: 'Les preuves suffisent-elles ?', en: 'Are the proofs sufficient?' },
        yesTargetPosition: 5,
        noTargetPosition: 3,
        reasonRequired: reasonRequired('proof_sufficiency', 'refuse'),
      },
    ],
    returnLoop: {
      fr: 'Un manque de preuve ramène à la collecte de retours d’expérience.',
      en: 'A missing proof sends the file back to retrospective collection.',
    },
  },
  {
    key: 'onboarding_delivery',
    label: { fr: 'Onboarding et delivery', en: 'Onboarding and delivery' },
    purpose: {
      fr: "Du démarrage d'une mission à son renouvellement, sans trou dans le suivi.",
      en: 'From the start of an assignment to its renewal, with no gap in follow-up.',
    },
    domain: 'delivery',
    subjectType: 'mission',
    steps: [
      step(1, 'Mission créée', 'Assignment created', 'user', 'Une mission rattachée', 'A linked assignment'),
      step(2, 'Conditions posées', 'Terms set', 'user', 'TJM, dates, contact', 'Rate, dates, contact'),
      step(3, 'Consultant affecté', 'Consultant assigned', 'user', 'Une affectation datée', 'A dated assignment'),
      step(4, 'Onboarding préparé', 'Onboarding prepared', 'user', 'Une checklist', 'A checklist'),
      step(5, 'Mission démarrée', 'Assignment started', 'user', 'Un démarrage constaté', 'A confirmed start'),
      step(6, 'Relevés suivis', 'Timesheets tracked', 'agent', 'Un relevé par mois', 'One timesheet per month'),
      step(7, 'Facturation préparée', 'Invoicing prepared', 'agent', 'Des bloqueurs nommés', 'Named blockers'),
      step(8, 'Renouvellement ouvert', 'Renewal opened', 'user', 'Une décision datée', 'A dated decision'),
      // Les quatorze étapes que le PDF 5 appelle « l'OS de référence » et que le
      // chantier avait écartées faute de connecteur. Elles sont marquées « hors
      // outil » : le produit les SUIT, il ne prétend pas les exécuter.
      manualStep(9, 'Contrat de prestation signé', 'Service contract signed', 'Un contrat signé', 'A signed contract'),
      manualStep(10, 'Bon de commande reçu', 'Purchase order received', 'Un numéro de commande', 'An order number'),
      manualStep(11, 'Badge d’accès obtenu', 'Access badge issued', 'Un badge remis', 'A badge handed over'),
      manualStep(12, 'Accès VPN ouvert', 'VPN access opened', 'Un accès testé', 'A tested access'),
      manualStep(13, 'Matériel livré', 'Equipment delivered', 'Un poste opérationnel', 'A working setup'),
      manualStep(
        14,
        'Comptes applicatifs créés',
        'Application accounts created',
        'Les accès métier',
        'Business accesses',
      ),
      manualStep(15, 'Réunion de lancement tenue', 'Kick-off held', 'Un compte rendu', 'Meeting notes'),
      manualStep(
        16,
        'Interlocuteur client identifié',
        'Client counterpart named',
        'Un nom et un rôle',
        'A name and a role',
      ),
      manualStep(17, 'Rituels d’équipe calés', 'Team rituals set', 'Un rythme convenu', 'An agreed rhythm'),
      manualStep(18, 'Point à J+30 fait', 'Day-30 review done', 'Un retour du client', 'Client feedback'),
      manualStep(19, 'Évaluation à mi-parcours', 'Mid-term review', 'Une évaluation écrite', 'A written review'),
      manualStep(
        20,
        'Retour d’expérience collecté',
        'Feedback collected',
        'Un REX exploitable',
        'A usable lessons-learned',
      ),
      manualStep(21, 'Sortie de mission préparée', 'Off-boarding prepared', 'Une passation', 'A handover'),
      manualStep(
        22,
        'Accès restitués',
        'Accesses returned',
        'Badge et matériel rendus',
        'Badge and equipment returned',
      ),
    ],
    gates: [
      {
        afterPosition: 5,
        gate: 'delivery_risk',
        question: { fr: 'Cette mission porte-t-elle un risque ?', en: 'Does this assignment carry a risk?' },
        // Ici, c'est le OUI qui demande du travail : il fait continuer le suivi.
        // Le NON renvoie à l'onboarding poser un plan de mitigation — la porte
        // ne demande pas « continue-t-on », elle demande « est-ce sous
        // contrôle ».
        yesTargetPosition: 6,
        noTargetPosition: 4,
        reasonRequired: reasonRequired('delivery_risk', 'refuse'),
      },
      {
        afterPosition: 7,
        gate: 'invoice_readiness',
        question: { fr: 'Ce mois est-il prêt à facturer ?', en: 'Is this month ready to invoice?' },
        yesTargetPosition: 8,
        noTargetPosition: 6,
        reasonRequired: reasonRequired('invoice_readiness', 'refuse'),
      },
    ],
    returnLoop: {
      fr: 'Un risque constaté ramène à l’onboarding pour poser un plan de mitigation.',
      en: 'A confirmed risk sends the file back to onboarding to set a mitigation plan.',
    },
  },
]

export function findChain(key: string): Chain | undefined {
  return CHAIN_CATALOG.find(chain => chain.key === key)
}
