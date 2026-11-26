import { z } from 'zod'

/**
 * Les QUINZE hard failures de #2386 — sourcées, jamais devinées.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * D'OÙ VIENT LA LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2386 (« END-TO-END PROSPECTING ORCHESTRATION ET RELEASE GATE ») porte, dans
 * son propre corps d'issue, une section « HARD FAILURES » de quinze lignes —
 * distincte des douze parcours « NO-GO RELEASE » (déjà gardés,
 * `e2e/tests/web/prospecting-no-go-release-gate.spec.ts`, #2386.11).
 * L'épopée #3010 (son propre point 9, « liste source des 15 hard failures »)
 * l'a classée « reste — texte à fournir, non devinable » à plusieurs reprises
 * consécutives sans jamais rouvrir le corps de #2386 lui-même — #3010 ne fait
 * que le RÉFÉRENCER, elle ne le recopie pas. Le texte n'a donc jamais manqué :
 * il n'avait simplement pas été relu à la source. Rien n'est inventé ici — les
 * quinze libellés ci-dessous sont ceux d'#2386, mot pour mot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE REGISTRE FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Décision Louis, 28/09/2026 : « chaque échec bloquant cite la règle qui le
 * déclenche (fichier ou libellé de doctrine) ; un élément sans source est
 * nommé « à sourcer », jamais inventé ni compté. » Ce fichier applique la
 * règle à la lettre :
 *
 *  · `coverage: 'full'` — une garde EXISTANTE empêche ou nomme explicitement
 *    CETTE défaillance précise. `citation` pointe le fichier (et la ligne,
 *    quand un seul test porte la garde).
 *  · `coverage: 'partial'` — une garde existe, mais sur un PÉRIMÈTRE plus
 *    étroit que le libellé de #2386 (un seul appelant vérifié, une seule
 *    moitié d'un libellé composé). `note` dit exactement ce qui manque —
 *    jamais une couverture large déguisée en garde générale (le défaut que
 *    GA-38 punit déjà sur le registre de doctrine).
 *  · `coverage: 'a_sourcer'` — aucune garde trouvée par une recherche ciblée
 *    (`git grep` sur le libellé et ses synonymes). `citation` reste `null` :
 *    un texte inventé ici serait exactement la donnée fictive que la doctrine
 *    interdit. `sourcedHardFailureCount()` EXCLUT ces entrées de son compte —
 *    « à sourcer » ne se compte jamais comme couvert.
 *
 * Ce registre ne prétend PAS que ces gardes empêchent structurellement la
 * défaillance nommée (seule une relecture humaine peut l'affirmer) : il
 * prétend seulement que le fichier cité EXISTE et QU'IL PARLE du sujet — la
 * même limite, assumée, que `doctrine-registry.ts` (GA-38) pose sur lui-même.
 */

export const HARD_FAILURE_COVERAGE = ['full', 'partial', 'a_sourcer'] as const
export type HardFailureCoverage = (typeof HARD_FAILURE_COVERAGE)[number]

export const prospectingHardFailureSchema = z
  .object({
    key: z.string().min(1),
    /** Libellé D'ORIGINE, verbatim depuis #2386 — jamais reformulé. */
    label: z.string().min(1),
    coverage: z.enum(HARD_FAILURE_COVERAGE),
    /** `chemin[:ligne]` — jamais un libellé de fichier qui n'existe pas (voir le test). */
    citation: z.string().min(1).nullable(),
    /** Explique la citation, ou dit pourquoi rien n'a été trouvé. Jamais vide. */
    note: z.string().min(20),
  })
  .strict()
  .refine(entry => (entry.coverage === 'a_sourcer') === (entry.citation === null), {
    message: '« à sourcer » ⇔ aucune citation ; toute autre couverture DOIT citer une source',
  })

export type ProspectingHardFailure = z.infer<typeof prospectingHardFailureSchema>

/**
 * Les clés, dans l'ORDRE d'#2386 — un ajout futur va en fin de liste (même
 * règle que GA-08 sur le registre de doctrine), jamais au milieu.
 */
export const PROSPECTING_HARD_FAILURE_KEYS = [
  'faux_fait_dans_message',
  'mauvais_contact',
  'message_envoye_apres_opt_out',
  'envoi_sans_validation',
  'sequence_active_sans_canal',
  'reponse_non_detectee',
  'doublon',
  'mauvaise_preuve',
  'crm_declare_sans_writeback',
  'data_inter_tenant',
  'message_generique',
  'contact_parti',
  'mauvais_prenom_ou_mauvaise_entreprise',
  'consentement_talent_absent',
  'absence_de_stop',
] as const

export const PROSPECTING_HARD_FAILURES: readonly ProspectingHardFailure[] = [
  {
    key: 'faux_fait_dans_message',
    label: 'faux fait dans un message',
    coverage: 'partial',
    citation:
      'apps/web/src/features/accounts/view/account-detail/components/contact-engagement/PreSendChecklist.test.tsx:81',
    note:
      '#2123.74 : PreSendChecklist nomme chaque élément RÉEL du dossier absent du texte (« Aucun élément réel du dossier ' +
      "n'est cité »). Ça garde l'OMISSION d'un fait réel, pas encore l'INVENTION d'un fait qui n'est dans aucune source " +
      '— la moitié qui manque pour passer en `full`.',
  },
  {
    key: 'mauvais_contact',
    label: 'mauvais contact',
    coverage: 'partial',
    citation: 'apps/web/src/features/agenda/meeting-brief-inputs.test.ts:60',
    note:
      '`matchAttendeeContact` (« ne rattache rien plutôt que le mauvais contact ») refuse un rattachement ambigu — ' +
      "mais seulement sur le rattachement d'un PARTICIPANT de réunion, pas sur le choix du destinataire d'un message " +
      "de prospection. Une garde équivalente sur les chemins d'envoi reste à écrire.",
  },
  {
    key: 'message_envoye_apres_opt_out',
    label: 'message envoyé après opt-out',
    coverage: 'full',
    citation: 'apps/api/src/architecture/send-paths-consult-the-stop.spec.ts',
    note:
      'GA-122 — le registre qui liste TOUS les chemins d’envoi connus et exige que chacun consulte `ContactStopService` ' +
      'avant d’écrire. Un nouveau chemin d’envoi qui oublierait la porte fait échouer ce test, pas seulement le sien.',
  },
  {
    key: 'envoi_sans_validation',
    label: 'envoi sans validation',
    coverage: 'full',
    citation: 'apps/web/src/features/outreach/view/OutreachApprovalCenter.test.tsx:129',
    note:
      '#2382.7 (« pas de bouton de validation sans le droit ») + #2382.9 (« valider tout » envoie la version AFFICHÉE) ' +
      "— l'envoi passe structurellement par le geste de validation du centre d'approbation, jamais en direct.",
  },
  {
    key: 'sequence_active_sans_canal',
    label: 'séquence active sans canal',
    coverage: 'a_sourcer',
    citation: null,
    note:
      'Recherche ciblée (`git grep` sur « canal », « channel » dans apps/api/src/modules/outreach et ' +
      'apps/web/src/features/outreach) : rien qui refuse ou signale explicitement une séquence ARMÉE dont aucun canal ' +
      "n'est utilisable. `SequencesPage.test.tsx` (#1511) garde l'AFFICHAGE des canaux du moteur, pas l'état d'une " +
      'séquence active sans canal exploitable — distinct, pas trouvé.',
  },
  {
    key: 'reponse_non_detectee',
    label: 'réponse non détectée',
    coverage: 'full',
    citation: 'apps/api/src/modules/mailbox/mailbox.service.spec.ts:545',
    note: '#2381 — « MailboxService — réconciliation réponse/séquence » : une réponse entrante rattachée stoppe la séquence.',
  },
  {
    key: 'doublon',
    label: 'doublon',
    coverage: 'full',
    citation: 'apps/api/src/modules/contacts/contact-identity.spec.ts',
    note:
      '#2380.43/.45 — dédup par `contact_id` canonique ET par téléphone normalisé (`normalizePhone`), même moteur pour ' +
      '`bulkInsert` et `bulkImportManual` (GA-26, un seul réglage).',
  },
  {
    key: 'mauvaise_preuve',
    label: 'mauvaise preuve',
    coverage: 'full',
    citation: 'apps/web/src/features/outreach/no-email-confirmation.test.ts',
    note: 'c73 — « Fait ne porte jamais preuve d’envoi » (#1935.20) : aucun badge « envoyé » sans confirmation du connecteur.',
  },
  {
    key: 'crm_declare_sans_writeback',
    label: 'CRM déclaré mis à jour sans writeback',
    coverage: 'full',
    citation: 'apps/api/src/modules/outreach/outreach-send.sweeper.spec.ts',
    note:
      '`OutreachSendSweeper.writebackCrmSentNote` écrit la note CRM APRÈS `markSent`, jamais avant — un envoi qui échoue ' +
      'entre les deux lignes ne peut jamais se voir déclaré à tort.',
  },
  {
    key: 'data_inter_tenant',
    label: 'data inter-tenant',
    coverage: 'full',
    citation: 'apps/api/src/architecture/un-controleur-nappelle-jamais-une-lecture-cross-tenant.spec.ts',
    note: 'Garde d’architecture générale (+ `workspace-isolation.spec.ts`) : aucun contrôleur ne lit une entité d’un autre espace.',
  },
  {
    key: 'message_generique',
    label: 'message générique',
    coverage: 'full',
    citation:
      'apps/web/src/features/accounts/view/account-detail/components/contact-engagement/PreSendChecklist.test.tsx:105',
    note:
      '« un gabarit parti tel quel nomme l’erreur » — un `{{Prénom}}` non résolu affiche explicitement ' +
      '« Envoyer le même message à tout le monde », pas seulement le symptôme.',
  },
  {
    key: 'contact_parti',
    label: 'contact parti',
    coverage: 'full',
    citation: 'apps/api/src/modules/outreach/outreach.service.spec.ts',
    note: '#2296.45 — « jamais garder un parti dans une séquence active » : `assertNotStaleContact` refuse sans `acknowledge_risk`.',
  },
  {
    key: 'mauvais_prenom_ou_mauvaise_entreprise',
    label: 'mauvais prénom ou mauvaise entreprise',
    coverage: 'partial',
    citation: 'apps/web/src/features/outreach/view/SequencesPage.test.tsx:150',
    note:
      "#1509 — « personnalise l'entête avec le prénom DU PROFIL, jamais une chaîne en dur » garde la moitié PRÉNOM. " +
      "Aucune garde équivalente trouvée pour l'ENTREPRISE — la moitié manquante pour passer en `full`.",
  },
  {
    key: 'consentement_talent_absent',
    label: 'consentement Talent absent',
    coverage: 'full',
    citation: 'apps/api/src/modules/consultants/matching/submission-preflight.spec.ts',
    note: 'c45_consentement_positionnement (registre de doctrine, GA-38) : un consentement EXPIRÉ refuse — seul refus dur.',
  },
  {
    key: 'absence_de_stop',
    label: 'absence de stop',
    coverage: 'full',
    citation: 'apps/api/src/architecture/send-paths-consult-the-stop.spec.ts',
    note: 'GA-122 — la forme générale du même registre que « message envoyé après opt-out » : CHAQUE chemin d’envoi consulte la porte.',
  },
]

/** Jamais « à sourcer » compté comme couvert — c'est la règle du 28/09/2026. */
export function sourcedHardFailureCount(): number {
  return PROSPECTING_HARD_FAILURES.filter(entry => entry.coverage !== 'a_sourcer').length
}

export function hardFailuresToSource(): readonly ProspectingHardFailure[] {
  return PROSPECTING_HARD_FAILURES.filter(entry => entry.coverage === 'a_sourcer')
}
