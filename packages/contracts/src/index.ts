export * from './schemas/auth.js'
export * from './schemas/beta-feedback-limits.js'
export * from './schemas/beta-feedback-status.js'
export * from './schemas/brand.js'
export * from './schemas/professional-email.js'
export * from './schemas/demo-lead.js'
export * from './schemas/demo-persona.js'
export * from './schemas/account.js'
export * from './schemas/account-relation-status.js'
export * from './schemas/account-refresh-triggers.js'
export * from './schemas/account-timeline.js'
export * from './schemas/reference-archive.js'
export * from './schemas/reference-dossier.js'
export * from './schemas/analysis-identity.js'
export * from './schemas/analysis/convergence.js'
export * from './schemas/signal-date.js'
export * from './schemas/signal-source-link.js'
export * from './schemas/internship-posting.js'
export * from './schemas/partial-without-defaults.js'
export * from './schemas/recent-signals-reader.js'
export * from './schemas/signal-layers-reader.js'
export * from './schemas/discover-blocks.js'
export * from './schemas/signal-freshness-line.js'
export * from './schemas/contact.js'
export * from './schemas/contact-ranking.js'
export * from './schemas/dormant-reactivation-score.js'
export * from './schemas/contact-cadence.js'
export * from './schemas/contact-relation-summary.js'
export * from './schemas/contact-relation-badge.js'
export * from './schemas/contact-interlocutor.js'
export * from './schemas/contact-associations.js'
export * from './schemas/contact-crm-exports.js'
// #4185 — l'adaptateur CRM commun : fournisseurs, opérations, capacités (un seul endroit).
export * from './schemas/crm-adapter.js'
export * from './schemas/salesforce-domain.js'
// SYNC-A (19/10/2026) — le miroir des objets du CRM branché (affaires, activités, propriétaires, pipelines).
export * from './schemas/crm-mirror.js'
export * from './schemas/crm-first-import.js'
export * from './schemas/crm-import-coverage.js'
// #4188 — envoyer un compte et ses contacts vers mon CRM, unitaire et en lot.
export * from './schemas/crm-push.js'
export * from './schemas/crm-account-provenance.js'
export * from './schemas/engagement-draft.js'
export * from './schemas/contact-sendability.js'
export * from './schemas/contact-send-state.js'
// #2325.35 — mêmes contacts sollicités par plusieurs séquences d'outreach actives à la fois.
export * from './schemas/contact-solicitation-collision.js'
// #2325.33 — doublons d'affaires : deux opportunités actives, même compte, même titre.
export * from './schemas/opportunity-duplicate.js'
// #2325.32 — une affaire portée par plusieurs personnes à la fois (propriétaire + tâches ouvertes).
export * from './schemas/opportunity-multi-owner.js'
// #2325.36 — une affaire à l'issue CONNUE (gagnée/perdue) qui porte encore une tâche ouverte.
export * from './schemas/opportunity-contradictory-action.js'
export * from './schemas/background-job.js'
export * from './schemas/chat-thread-title.js'
// #2430 — l'objet conversation : propriétaire, branche, rattachement, conservation légale, versions.
export * from './schemas/chat-conversation.js'
export * from './schemas/chat-presence.js'
// #1953.11 / #1953.22 — la nature d'une branche de conversation (réessai, autre angle, demande modifiée).
export * from './schemas/chat-branch.js'
// #1914.14 — ce qu'on garde du contexte d'une réponse pour la RE-RENDRE, et les
// trois champs qu'on ne garde jamais (D65, droits du lecteur, cartes déjà persistées).
export * from './schemas/chat-message-context.js'
// #1957.5 / #1957.8 — le plafond quotidien de Laura, dit en données (refus 429 + état).
export * from './schemas/chat-quota.js'
export * from './schemas/laura-unrouted-intent.js'
export * from './schemas/contact-enrichment.js'
export * from './schemas/enrichment-coordinates.js'
export * from './schemas/contact-availability.js'
export * from './schemas/contact-photo.js'
// #2297.51/.52/.54 — les règles de conformité de l'enrichissement (catalogue, rétention).
export * from './schemas/enrichment-compliance.js'
export * from './schemas/person-erasure.js'
export * from './schemas/pagination.js'
export * from './schemas/analysis.js'
export * from './schemas/group-perimeter.js'
export * from './schemas/geo-perimeter.js'
export * from './schemas/zone-tiers.js'
export * from './schemas/discover-origin-geo-scope.js'
export * from './schemas/analysis-cadrage.js'
// #3260.8/.9 (BEL-SC-231) — le garde-fou de périmètre avant un lancement à
// l'aveugle, juste après `analysis.js` dont il consomme `AnalysisScopeMode`.
export * from './schemas/analysis-scope-guardrail.js'
// #2125 — ce qu'« Actualiser l'analyse » va faire AVANT, et ce qu'il a changé
// APRÈS. Juste après `analysis.js` : il en dérive les axes et leur grille de prix.
export * from './schemas/refresh-explained.js'
// #2452 — approfondir une réponse de /chat : le devis du delta (réutilise le refresh par axe).
export * from './schemas/chat-deepen.js'
export * from './schemas/chat-reply-actions.js'
export * from './schemas/workspace-next-step.js'
// #AF (18/09/2026) — le ciblage du rattrapage par segment. Juste après : même
// famille que le refresh de dimension, dont il réutilise `RefreshDimension`.
export * from './schemas/segment-catchup.js'
export * from './schemas/homonym-decision.js'
export * from './schemas/access-stale-headcount.js'
// #2637.1 (21/09/2026) — le rattrapage automatique des rôles manquants,
// famille VOISINE de `segment-catchup.js` mais payante (voir son docblock) —
// jamais un septième `SegmentCatchupDimension`.
export * from './schemas/contact-reachability-catchup.js'
export * from './schemas/contact-coordinates.js'
export * from './schemas/missing-roles-catchup.js'
export * from './schemas/refresh-refund.js'
// #2318.5 — les neuf identifiants de version d'un run, assemblés sans en
// fabriquer aucun (type `RunProfileProvenance` importé de `run-profile.js`).
export * from './schemas/analysis-versioning.js'
export * from './schemas/committee-entry-level.js'
export * from './schemas/action-plan.js'
export * from './schemas/action-plan-items.js'
// #2395 — l'objet Action canonique, projection commune des modèles d'action.
export * from './schemas/action.js'
// #2871 — le plan GÉNÉRÉ du compte, lu à un seul endroit (fiche web + projection API).
export * from './schemas/generated-plan.js'
export * from './schemas/plan-mail-context.js'
export * from './schemas/credits.js'
export * from './schemas/plan-features.js'
export * from './schemas/launcher.js'
export * from './schemas/actions.js'
export * from './schemas/action-router.js'
export * from './schemas/action-os.js'
export * from './schemas/canonical-trigger.js'
// #2449 — les quatre niveaux d'action du copilote : la VALEUR que la porte lit.
export * from './schemas/copilot-action-level.js'
export * from './schemas/copilot-card.js'
export * from './schemas/copilot-plan.js'
// #2276 — le job composite de Laura : une demande complexe, une fiche, des étapes.
export * from './schemas/laura-job.js'
export * from './schemas/outreach-sequence.js'
export * from './schemas/outreach-multichannel.js'
export * from './schemas/outreach-playbooks.js'
// #5029 — proposer un consultant en intercontrat à UN compte (profil anonymisé).
export * from './schemas/bench-push.js'
export * from './schemas/automation-rules.js'
export * from './schemas/outreach-message-quality.js'
export * from './schemas/sequence-template.js'
export * from './schemas/outreach-delegation.js'
export * from './schemas/outreach-canonical.js'
export * from './schemas/outreach-quality-flag.js'
export * from './schemas/outreach-message-variable.js'
export * from './schemas/message-style.js'
export * from './schemas/message-learning-rule-scope.js'
export * from './schemas/message-learning-rule-snapshot-decision.js'
export * from './schemas/message-learning-summary.js'
export * from './schemas/message-style-rule-proposal.js'
export * from './schemas/message-style-import.js'
// #2147.9/.10 (épopée #2785) — l'enveloppe de contexte transportable entre Laura et les surfaces.
export * from './schemas/laura-context-envelope.js'
export * from './schemas/outreach-sequence-events.js'
// #2378.9 — la frontière : ce qui SORT attend, ce qui est INTERNE part. Le
// vocabulaire vit à UN endroit (GA-26) ; `action-os.js` et `outreach-sequence.js`
// déclarent leurs natures contre lui.
export * from './schemas/effect-reach.js'
export * from './schemas/profile.js'
export * from './schemas/onboarding.js'
// #3252 (BEL-SC-223) — la restitution de fin d'onboarding : ASSEMBLE
// `frontsBudget` et `coachingInsights`, ne recalcule rien (GA-26).
export * from './schemas/onboarding-restitution.js'
// #2033.9 / #2033.10 (D3, 18/09/2026) — le périmètre d'autorité déclaré cadre
// ce que Laura PROPOSE, jamais ce que l'API autorise (GA-26).
export * from './schemas/authority-scope.js'
export * from './schemas/expertise-free-text-normalization.js'
export * from './schemas/onboarding-answer-contract.js'
export * from './schemas/onboarding-question-consumers.js'
// #2035.8 — la fraîcheur d'une réponse d'effectif, construite sur Provenance.
export * from './schemas/onboarding-effectif-freshness.js'
// #2045.15 — même primitive pour le réseau personnel déclaré, seuil distinct.
export * from './schemas/onboarding-reseau-freshness.js'
// #2027 — les quatre états d'incertitude, distincts d'une absence de réponse.
export * from './schemas/onboarding-unknown-answers.js'
export * from './schemas/onboarding-v23-catalog.js'
export * from './schemas/framing.js'
// #2029 — le questionnaire nomme ses contradictions ; pendant écran du bloc
// contradictions déjà écrit côté prompt (`apps/ia/app/prompts/bellum_profiler.py`).
export * from './schemas/onboarding-contradictions.js'
export * from './schemas/consulting-domains.js'
export * from './schemas/signal-domain.js'
export * from './schemas/title-taxonomy.js'
export * from './schemas/outreach-scenarios.js'
// #3417 (retour bêta 30/09) — la bibliothèque versionnée des scripts et messages approuvés.
export * from './schemas/approved-message-templates.js'
export * from './schemas/company-display-name.js'
export * from './schemas/message-matrix.js'
export * from './schemas/pre-send-check.js'
// #2947/#2204.73 — le contrôle DE MASSE (plusieurs messages entre eux),
// distinct de `pre-send-check.js` (un seul message contre sa checklist).
export * from './schemas/outreach-batch-check.js'
export * from './schemas/meeting-questions.js'
// #3427 — bibliothèque versionnée des exemples commerciaux (modèles approuvés
// verbatim + exemples de comportement) ; comble le trou documenté dans
// `outreach-scenarios.ts` et `message-matrix.ts` : aucun gabarit n'y est stocké.
export * from './schemas/message-library.js'
export * from './schemas/workflow-intents.js'
export * from './schemas/workflow-outcomes.js'
export * from './fixtures/golden-cases.js'
export * from './knowledge/method-delta.js'
export * from './knowledge/ingestion-guard.js'
export * from './knowledge/salesconnect-corpus.js'
export * from './schemas/method-corpus.js'
export * from './schemas/method-contradictions.js'
// #3289 (#3264.31/.32/.33) — le timing appris : créneaux mesurés sur les gestes faits, jamais un taux.
export * from './schemas/send-timing.js'
// #3289 (#3264.41) — l'ensemble des règles méthode contredites par un espace, calculé sur ses issues déclarées.
export * from './schemas/method-rule-outcomes.js'
// #3441/#3442/#3444/#3445 (lot C20 du 30/09/2026) — la bibliothèque de
// contenu approuvé (emails, scripts d'appel, objections, pitchs).
export * from './knowledge/content-library.js'
export * from './schemas/lost-deal-rex.js'
export * from './schemas/lost-deal-rule-proposal.js'
export * from './schemas/pii-masking.js'
export * from './schemas/reset-link-ttl.js'
export * from './schemas/application-sector-naf.js'
export * from './schemas/application-sectors.js'
export * from './schemas/proof-sector-group.js'
export * from './schemas/discover-origin.js'
export * from './schemas/offer-portfolio.js'
export * from './schemas/workspace-lexicon.js'
export * from './schemas/feedback-reuse.js'
export * from './schemas/site-fit.js'
export * from './schemas/account-board.js'
export * from './schemas/active-analysis-run.js'
export * from './schemas/feedback-correction.js'
export * from './schemas/corrected-fact-guard.js'
export * from './schemas/contact-views.js'
export * from './schemas/admin-docs.js'
export * from './schemas/crm-inbound.js'
export * from './schemas/crm-confrontation.js'
export * from './schemas/meeting-notes.js'
export * from './schemas/linkedin.js'
export * from './schemas/crm-pipeline.js'
export * from './schemas/telephony.js'
export * from './schemas/lemlist.js'
export * from './schemas/account-briefing.js'
export * from './schemas/org-views.js'
export * from './schemas/plan-horizons.js'
export * from './schemas/run-profile.js'
export * from './billing/credit-weights.js'
// Ce qu'un crédit COÛTE, par famille d'action — la mesure de l'écart entre le
// poids facturé et le coût réel. Sortie du paquet parce que l'alerte de coûts
// (API) la consomme : un calcul juste que personne n'appelle est le défaut n°1
// de ce dépôt.
export * from './billing/credit-cost.js'
// #1639 — ce qui est INCLUS parce que c'est déjà en base, et ce qui coûte parce
// que ça va vérifier aujourd'hui. Sorti du paquet parce que les trois côtés le
// lisent : la garde d'architecture (API), l'émission des compteurs (API) et
// l'étiquette « incluse » (web). Une classification que seul son fichier
// connaît ne tient rien.
export * from './billing/market-memory-credit-policy.js'
// Les devises de facturation. Oubliée ici, la tarification multi-devises
// existait dans le paquet sans en sortir : le web importait `priceInCurrency`
// depuis `@bellum/contracts` et recevait `undefined`, donc l'écran des offres
// tombait à la construction des cartes. Le type compilait — l'import résolvait
// bien le fichier source — et seule l'exécution le voyait.
export * from './billing/currencies.js'
export * from './schemas/profile-questionnaire.js'
export * from './schemas/env.js'
export * from './schemas/ia.js'
export * from './schemas/agent-envelope.js'
export * from './schemas/agent-error-adapters.js'
export * from './schemas/api-error.js'
export * from './schemas/analysis-context.js'
export * from './schemas/search-deep-link.js'
export * from './schemas/analysis-payloads.js'
export * from './schemas/companies.js'
export * from './schemas/discover.js'
export * from './schemas/discover-source-axes.js'
export * from './schemas/discover-card-facts.js'
export * from './schemas/discover-hiring-scope.js'
export * from './schemas/flexible-search.js'
export * from './schemas/discover-skill-evidence.js'
export * from './schemas/discover-funnel.js'
export * from './schemas/criteria-referential.js'
export * from './schemas/surface-widening.js'
export * from './schemas/discover-result-type.js'
// #2545 / #3819 — la source unique des personnes et signaux connus d'une recherche Découvrir.
export * from './schemas/discover-call-list.js'
export * from './schemas/notifications.js'
export * from './schemas/notification-sms.js'
export * from './schemas/watchlist-rules.js'
export * from './schemas/memory-item.js'
export * from './schemas/memory-redaction.js'
// #1927 — l'état structuré d'un fil de Laura (objets cités, recherche, actions, questions).
export * from './schemas/conversation-thread-state.js'
// Le registre de mémoire — ce que Laura garde, en clair, ligne à ligne (T6 §12.1).
export * from './schemas/memory-ledger.js'
// #1916 — les sections de l'écran, dérivées de la ligne (une seule dérivation, GA-26).
export * from './schemas/memory-ledger-sections.js'
// #1916.18 / #1916.24 — les éléments de mémoire envoyés à Laura, réponse par réponse.
export * from './schemas/memory-reply-uses.js'
// #1955.30 / #1955.31 — lire et corriger le résumé roulant du fil ouvert, dans `/chat`.
export * from './schemas/conversation-summary.js'
export * from './schemas/share.js'
export type { Database } from './database.types.js'
// L'écart entre deux fenêtres de temps — `current`/`previous`, jamais un
// scalaire : deux nombres obligent la dérivation à sortir de la MÊME
// population, ce qu'un « +255 » isolé ne garantit pas.
export * from './schemas/trend.js'
export * from './schemas/dashboard.js'
// #2080 — la restitution après un import. Elle réutilise la provenance du
// cockpit ci-dessus : une seule forme de « d'où vient ce nombre, et de quand ».
export * from './schemas/restitution.js'
export * from './schemas/profile-context.js'
export * from './schemas/profiler-events.js'
export * from './schemas/classified-data.js'
export * from './schemas/contacts-data.js'
export * from './schemas/contact-discovery.js'
export * from './schemas/welcome-redesign.js'
export * from './schemas/graph-events.js'
export * from './schemas/account-score.js'
export * from './schemas/account-strategy-5p.js'
export * from './schemas/committee-seat-titles.js'
export * from './schemas/weakest-link-diagnosis.js'
export * from './schemas/account-interest-penetrability.js'
export * from './schemas/account-variation-signals.js'
export * from './schemas/workspace.js'
export * from './schemas/workspace-activity.js'
// #2035.10 / #2035.11 — les réglages d'espace « marché inversé + capacité de
// réponse » et « charge commerciale + priorisation des besoins ».
export * from './schemas/workspace-capacity.js'
// La sortie d'un utilisateur (tome 8 §33, angle mort n°2) : son portefeuille se
// reprend, sa messagerie ne se transmet pas.
export * from './schemas/workspace-handover.js'
export * from './schemas/shared-content.js'
// Les entités juridiques d'un même espace (décision D9) : quelle société de
// l'ESN porte une mission et facturera le mois.
export * from './schemas/legal-entity.js'
// Le contrat de route unifié : palier, permission, capacité — trois
// empêchements, trois gestes différents (BEL-ARCH-002).
export * from './schemas/route-access.js'
// Les DIX états d'ÉCRAN (PDF 1 §2) — l'état de la DONNÉE une fois entré. À ne
// pas confondre avec les cinq états d'ACCÈS ci-dessus, qui disent le droit
// d'entrer : deux axes, deux contrats.
export * from './schemas/ui-state.js'
// La réversibilité affichée (PDF 7 §9.2) : ce qu'on emporte, et — DÉRIVÉ du
// registre de portée — ce qu'on n'emporte pas, avec sa raison.
export * from './schemas/data-portability.js'
// #2439.15 / #2439.7 — « Mes exports » : ce que journalise `PrivacyExportAuditLogEntity`, enfin lu.
export * from './schemas/privacy-export-history.js'
// La distance au premier euro (PDF 2 §7.4) : huit étapes, pondérées par le
// délai médian OBSERVÉ — et `null` tant que l'espace n'a pas dix missions
// closes. Ce n'est PAS une probabilité : c'est la longueur du chemin.
export * from './schemas/first-euro.js'
// Le SLA d'étape du pipe (PDF 3 §3.5) : 7/14/7/21 jours par défaut, réglables
// par espace — et un deal sans date d'entrée n'est pas « à 0 jour ».
export * from './schemas/deal-stage-sla.js'
// Le cloisonnement de portefeuille, réglable par espace (décision D5).
export * from './schemas/portfolio-visibility.js'
// La couche BU / agence — le périmètre de travail d'un espace, et son niveau
// d'accès intermédiaire (#2005.3, arbitrage « dimension complète » du 15/09/2026).
export * from './schemas/business-unit.js'
// #2081.14 — les règles d'espace, posées par l'administrateur, qui priment sur
// les réglages individuels (DÉCISION Louis 19/09/2026).
export * from './schemas/workspace-rules.js'
// #2016 — rejoindre un espace existant : la demande d'accès d'un NON-membre.
export * from './schemas/workspace-join-request.js'
// #2018.7 — signaler une information d'entreprise fausse, sans l'écraser.
export * from './schemas/esn-profile-correction-request.js'
// Le profil à trois couches (entreprise · BU · personne) comme UN objet dérivé,
// et la version de chaque couche portée par chaque run (#2005.4-.6, #2005.11).
export * from './schemas/layered-profile.js'
export * from './schemas/commercial-audit-version.js'
export * from './schemas/library.js'
export * from './schemas/outreach-asset.js'
export * from './schemas/manager.js'
export * from './schemas/team-review.js'
export * from './schemas/member-objective.js'
export * from './schemas/manager-member.js'
export * from './schemas/target-list.js'
export * from './schemas/analysis-batch.js'
export * from './schemas/analysis-history.js'
export * from './schemas/team-comment.js'
export * from './schemas/team-research.js'
export * from './schemas/team-guardrails.js'
export * from './schemas/contact-perimeter.js'
export * from './schemas/contact-distribution.js'
export * from './schemas/coverage.js'
// #2308 (LAU-FINAL-049) — la carte de couverture du CHAT (périmètre × famille
// de rôle × étape commerciale), un axe DIFFÉRENT de `coverage.ts` ci-dessus.
export * from './schemas/chat-coverage-map.js'
export * from './schemas/cta-contract.js'
export * from './schemas/declared-signal.js'
export * from './schemas/buyer-role-families.js'
export * from './schemas/contact-level.js'
export * from './schemas/org-graph.js'
export * from './schemas/org-freshness.js'
export * from './schemas/org-graph-merge.js'
export * from './schemas/org-graph-refresh-diff.js'
export * from './schemas/org-focus-weights.js'
export * from './schemas/org-graph-correction.js'
export * from './schemas/org-reporting-hypothesis.js'
export * from './schemas/email-estimate.js'
export * from './schemas/seniority-estimate.js'
export * from './schemas/org-title-reporting.js'
export * from './schemas/org-enrichment-planner.js'
export * from './schemas/command-library.js'
// #1914 — les formes d'une réponse de Laura (verdict, classement, comparaison…),
// portées DANS le texte de la réponse entre deux clôtures `bellum-block`.
export * from './schemas/reply-blocks.js'
export * from './schemas/outside-person-reveal.js'
export * from './schemas/reply-family.js'
export * from './schemas/reply-substance.js'
export * from './schemas/reply-plain-text.js'
export * from './schemas/reply-export.js'
// #2429.2 / #2429.4 / #2429.9 — l'enveloppe de réponse, vue additive des briques ci-dessus.
export * from './schemas/chat-reply-envelope.js'
export * from './schemas/reply-badges.js'
export * from './schemas/chat-artifact-versions.js'
export * from './schemas/chat-image-citation.js'
export * from './schemas/measurability.js'
export * from './schemas/recette.js'
export * from './schemas/connector-error.js'
// #2078.22 — les deux niveaux d'accès d'une connexion OAuth (lecture ; lecture + écriture).
export * from './schemas/oauth-access-level.js'
export * from './schemas/import.js'
export * from './schemas/import-engine.js'
export * from './schemas/universal-import.js'
export * from './schemas/context-pack-import.js'
export * from './schemas/tags.js'
export * from './schemas/timesheet-exception.js'
export * from './schemas/import-resume.js'
export * from './schemas/tool-registry.js'
// #3904.3 — la lecture unique des quatre sources commerciales (CRM, téléphonie, agenda, mail).
export * from './schemas/sales-source-connections.js'
export * from './schemas/integration-sync.js'
export * from './schemas/connector-capability-level.js'
// #1912.11 — à qui appartient l'outil : nos fournisseurs (jamais nommés), les
// outils du client (nommés s'il les a branchés), et la seule dérivation.
export * from './schemas/support-reference.js'
export * from './schemas/tool-naming.js'
export * from './schemas/trace-redaction.js'
// Journal des envois sortants, traduit pour l'application : ce que le canal a
// reçu et ce que l'utilisateur peut y faire — jamais le code HTTP ni l'URL.
export * from './schemas/account-feedback.js'
export * from './schemas/reply-feedback.js'
export * from './schemas/banner.js'
export * from './schemas/sales-context.js'
export * from './schemas/consultant.js'
export * from './schemas/consultant-linkedin-lookup.js'
export * from './schemas/project.js'
export * from './schemas/pipe.js'
export * from './schemas/opportunity-ontology.js'
export * from './schemas/opportunity-readiness.js'
export * from './schemas/opportunity-pipeline-health.js'
export * from './schemas/pipeline-capacity.js'
export * from './schemas/qualification-lead.js'
export * from './schemas/rfp.js'
export * from './schemas/proposal.js'
export * from './schemas/mission.js'
export * from './schemas/mission-billing-alert.js'
export * from './schemas/mission-amendment.js'
export * from './schemas/mission-start-readiness.js'
// #2413.49 à .57 (épopée #2965) — le dual track de renouvellement : deux
// rails de décision, client et consultant, jamais un seul statut.
export * from './schemas/mission-renewal-rail.js'
export * from './schemas/mission-renewal-engine.js'
// #2414.34 à .48 (épopée #2986) — le déclencheur de repositionnement : quand
// le moteur doit commencer, jamais un cinquième calcul de préavis.
export * from './schemas/mission-business-unit-transfer.js'
export * from './schemas/mission-reposition-trigger.js'
export * from './schemas/mission-end.js'
export * from './schemas/mission-lifecycle.js'
export * from './schemas/mission-delivery-milestones.js'
export * from './schemas/mission-delivery-mode.js'
export * from './schemas/mission-primary-action.js'
export * from './schemas/focus-plan.js'
// Les six agrégats de propagation du back-office (PDF 2 §4) : ce qu'une donnée
// de mission ajoute sur une fiche compte, contact ou consultant. Chaque bloc
// porte un LIEN vers l'écran où il se calcule et ne s'édite jamais sur place
// (§4.4) — sans quoi le même chiffre serait corrigible à deux endroits.
export * from './schemas/propagation.js'
// L'onglet Missions du dossier de compte (PDF 4 §3.3) — le quatorzième onglet,
// que la source elle-même marquait « À FAIRE ». Cinq blocs, tous propagés : ils
// se lisent ici et se corrigent dans les missions.
export * from './schemas/account-missions.js'
// Le board Missions à douze colonnes — une VUE de projection au-dessus des
// Projets et des Missions, qui ne possède aucun état (décision D2).
export * from './schemas/mission-board.js'
// Le tiroir de validation d'un relevé d'activité (PDF-22 §05, PDF-06 §4.4) :
// ce qui a été vérifié, ce qui n'a PAS pu l'être et pourquoi, et l'action qui
// s'en DÉRIVE — jamais une phrase vague quand rien n'est lisible.
export * from './schemas/mission-timesheet-review.js'
// Le seuil d'anticipation d'un bon de commande (PDF-06 §1.3) — un réglage, donc
// un seul endroit où il vit.
export * from './schemas/mission-po-alert.js'
export * from './schemas/board-move.js'
export * from './schemas/data-hygiene.js'
export * from './schemas/dispatch-failure.js'
export * from './schemas/kpi-targets.js'
// Ce qu'un run d'analyse est DEVENU — la dérivation « Sans suite » de
// l'historique et l'alerte « no-outcome » de l'observabilité posent la même
// question à la même table : elle vit à un seul endroit.
export * from './schemas/run-outcome.js'
export * from './schemas/manager-kpi.js'
export { KPI_MEASURED_TREND_METRIC } from './schemas/manager-kpi-reading.js'
export * from './schemas/pilotage-role-focus.js'
// #3386 — le tableau rôle × stade (28 combinaisons, 8 dimensions), décision Louis 11/10.
export * from './schemas/role-stage-playbook.js'
export * from './schemas/pilotage-chain-guidance.js'
export * from './schemas/ritual.js'
export * from './schemas/pilotage.js'
export * from './schemas/pilotage-staffing.js'
// « Calculé sur … » — la complétude d'un agrégat (tome 7, loi 2, élément n°6).
// Elle vit ici et non dans `apps/web` parce que c'est une DÉRIVATION, pas un
// rendu : l'API qui produit un agrégat doit pouvoir en poser le dénominateur
// avec les mêmes règles de bord que l'écran qui l'affiche.
export * from './schemas/completeness.js'
// #2061 — `CommercialAuditContext` : un livrable daté et versionné, distinct
// du `ProfileContext` qu'il dérive aujourd'hui (voir le docblock du fichier).
export * from './schemas/commercial-audit-context.js'
export * from './schemas/commercial-audit-signals.js'
// #2068.24/.26/.27 — ce que l'espace doit CONFIGURER, dérivé de ses propres
// réglages. Ici et non dans `apps/web` pour que la garde de couverture de
// démonstration (`demo-audit-product-configuration-coverage.spec.ts`) EXÉCUTE
// la vraie règle au lieu d'en recopier une deuxième (GA-26).
export * from './schemas/commercial-audit-product-configuration.js'
// #2067.2 / .4 / .5 / .6 — l'arbitrage de la charge active, dérivé des mêmes
// réponses et du budget de fronts du module juste au-dessus.
export * from './schemas/commercial-audit-active-load.js'
// #2074.10-.15 / #2090.7 — les PREMIERS MOUVEMENTS de fin d'audit, dérivés des
// ruptures de `commercial-audit-context.js`. Juste après lui : il en est la
// seule source.
export * from './schemas/commercial-audit-moves.js'
// #2010.10 — les HYPOTHÈSES à relire, dérivées de la MÊME source que les
// premiers mouvements (`possibleExplanation`, `commercial-audit-context.js`).
export * from './schemas/commercial-audit-hypotheses.js'
// « Recalculé à 06:12 » — l'horodatage de calcul d'un agrégat (tome 7, loi 2,
// élément n°10), JUMEAU de la complétude : l'une répond à « sur quoi », l'autre
// à « quand ». Même raison de vivre ici : c'est une dérivation, et son refus
// central — un horodatage indiscernable de la requête n'apprend rien — doit
// valoir pour le serveur qui le sert comme pour l'écran qui l'affiche.
export * from './schemas/computed-at.js'
export * from './schemas/local-day.js'
// La photo mensuelle des indicateurs de STOCK (D2 / D49 du 26/08). Elle vit à
// côté de la chaîne et de l'hygiène parce qu'elle ne calcule RIEN : elle
// photographie ce que ces deux-là dérivent.
export * from './schemas/stock-snapshot.js'
// CRM + ATS natifs (chantier du 16/08/2026, `agent_docs/crm-ats-plan.md`). La
// provenance par champ vient EN PREMIER : c'est elle qui protège la saisie
// humaine du prochain run d'analyse.
export * from './schemas/provenance.js'
export * from './schemas/field-conflict.js'
// #4016.L13 — un fait confirmé à la main reste affiché ; la source qui le contredit se nomme à côté.
export * from './schemas/field-contradiction.js'
// #4158.57 — rapatrier l'espace personnel dans l'espace ESN rejoint : aperçu figé, double validation, archivage.
export * from './schemas/workspace-merge.js'
// #4267 — le suivi d'un compte est un geste explicite, par utilisateur, 5 comptes au plus (3 jusqu’au 22/10).
export * from './schemas/account-follows.js'
export * from './schemas/signal-library.js'
// #4016.L4 — quand une valeur affichée est une estimation, et sous quelle forme (badge « estimé »).
export * from './schemas/intelligence-estimate.js'
// #4016.L4 — le coût d'accès estimé sur ce que l'espace a déclaré ailleurs (jamais entre espaces).
export * from './schemas/access-cost-estimate.js'
export * from './schemas/dataforge-account-access.js'
export * from './schemas/contact-preflight.js'
export * from './schemas/mission-drift.js'
export * from './schemas/missing-expertise.js'
export * from './schemas/number-explanation.js'
export * from './schemas/note.js'
export * from './schemas/discover-candidate-note.js'
export * from './schemas/discover-candidate-feedback.js'
export * from './schemas/activity.js'
export * from './schemas/task.js'
// #2392 — la clôture de fin de journée (compilateur pur + forme de fil).
export * from './schemas/day-closure.js'
export * from './schemas/talent.js'
export * from './schemas/talent-vivier-view.js'
export * from './schemas/talent-duplicates.js'
export * from './schemas/talent-identity.js'
export * from './schemas/cv-batch-import.js'
export * from './schemas/long-running-jobs.js'
export * from './schemas/consultant-csv-import.js'
export * from './schemas/consultant-availability-import.js'
export * from './schemas/esn-target-personas.js'
export * from './schemas/consultant-ats-export.js'
export * from './schemas/rag-zip-ingest.js'
export * from './schemas/rag-upload-formats.js'
export * from './schemas/rag-document-source.js'
export * from './schemas/document-classification.js'
export * from './schemas/file-name.js'
export * from './schemas/cv-parsing.js'
// #3935.2b — les expériences lues dans un CV, structurées et arbitrées par champ.
export * from './schemas/cv-experience.js'
export * from './schemas/cv-anonymisation.js'
export * from './schemas/cv-version.js'
export * from './schemas/client-history-flag.js'
export * from './schemas/talent-preferences.js'
export * from './schemas/talent-pool-segments.js'
export * from './schemas/talent-consent.js'
// #4034 — le CV original conservé, servi par URL signée.
export * from './schemas/talent-document-file.js'
export * from './schemas/talent-prepared-message.js'
export * from './schemas/talent-interview-assessment.js'
export * from './schemas/consultant-field-report.js'
export * from './schemas/consultant-sector-knowledge.js'
export * from './schemas/language.js'
export * from './schemas/match.js'
export * from './schemas/shortlist.js'
export * from './schemas/submission.js'
export * from './schemas/commercial-transition.js'
export * from './schemas/commercial-state-machine.js'
export * from './schemas/campaign-audience-builder.js'
// G16 (16/09/2026) — les deux notions que cinq issues employaient sans qu'elles
// aient de définition dans le produit. Elles vivent à UN endroit chacune.
export * from './schemas/staffing-collision.js'
export * from './schemas/need-vagueness.js'
export * from './schemas/staffing.js'
// #2420 — le moteur de marge de mission (LAU-FINAL-134).
export * from './schemas/mission-cost-source.js'
export * from './schemas/mission-margin-engine.js'
// Les frais de mission (30/08/2026) : la ligne que la marge ignorait. La
// provenance qu'elle porte vient de `provenance.js`, importé au-dessus.
export * from './schemas/mission-expense.js'
// #2412 — le double pouls de satisfaction (client/consultant), deux rails
// jamais fusionnés en un score.
export * from './schemas/mission-feedback.js'
// La facture ENTRANTE d'un sous-traitant (30/08/2026) — distincte de
// `invoice-readiness.js`, qui est la facturation CLIENT.
export * from './schemas/supplier-invoice.js'
export * from './schemas/invoice-readiness.js'
// #2417.3/.4/.5 — jalon, retainer au prorata, garantie de placement : DÉCLARATIFS (decisions §8).
export * from './schemas/billing-declarations.js'
// #2422.4 (épopée #2869, LAU-FINAL-136) — le contrat typé, première tranche.
export * from './schemas/contract.js'
// #2422.6 (épopée #2869, lot R24 07/10/2026) — le lien signé à portée limitée,
// pour qu'un contact externe dépose une pièce sans compte BellumAI.
export * from './schemas/legal-contract-upload-link.js'
// Épopée #2880 (lot V33) — le croisement relationnel expertise ↔ fondement/preuve.
export * from './schemas/expertise-grounding.js'
// #2407.5/.6 — les state machines de la mission et de l'affectation (decisions §9).
export * from './schemas/status-transitions.js'
// #2565 — CRÉER la facture PRÉPARÉE dans l'outil de gestion branché par le
// client, APRÈS `invoice-readiness.js` : « préparée » ≠ « créée » ≠ « envoyée »,
// « facturé » n'est écrit que sur preuve du connecteur.
export * from './schemas/invoice-connector-write.js'
// #2566/#2563 — préparer la facture du mois d'une mission longue (reconduite + contrôle du BC).
export * from './schemas/invoice-month-preparation.js'
export * from './schemas/sync.js'
export * from './schemas/governance.js'
export * from './schemas/pipeline-detection.js'
// L'envoi des alertes de Découvrir : canal sortant, consentement daté, cadence due.
export * from './schemas/discover-alert-dispatch.js'
// Ce qu'une alerte SURVEILLE (#2151.14) : les sept genres d'événement, la
// nature de leur source, la surface UNIQUE par laquelle chacun arrive (#2151.25).
export * from './schemas/discover-alert-events.js'
export * from './schemas/playbook.js'
// #2402.9/.1 — le schéma canonique et le catalogue unique des déclencheurs.
export * from './schemas/trigger-event.js'
// #3918 — les seuils et types des signaux CRM dérivés de `crm_deal_facts`.
export * from './schemas/crm-deal-signals.js'
// #3923 — pertinence explicable d'un signal contre le profil déclaré de l'espace.
export * from './schemas/signal-relevance.js'
export * from './schemas/recent-hires.js'
// Louis 30/10/2026 — offres d'un compte par métier saisi, 5 par 5 jusqu'à 50.
export * from './schemas/account-job-offers.js'
export * from './schemas/account-signal-lines.js'
export * from './schemas/signal-search.js'
// Métiers placés DÉDUITS du contexte de l'espace (décision Louis 11/10/2026).
export * from './schemas/placed-roles-inference.js'
// Les huit portes de décision : les gestes que le produit ne franchit jamais
// seul, et surtout ce qui manquait au moment où quelqu'un les a franchies.
export * from './schemas/decision-gate.js'
// Le registre des neuf flux inter-modules : ce qui les déclenche, ce qu'ils
// écrivent, leur clé d'idempotence — et ce qui manque, nommément.
export * from './schemas/flow-registry.js'
// Le registre de migration de routes (#2154.3) : les quatorze routes nommées
// par #2154.4/.5, leur statut vérifié dans le code, et ce qu'un clone
// superficiel ne permet pas de prouver.
export * from './schemas/route-migration-registry.js'
// Les conditions NO-GO/GO de la migration de routes (#2154.31/.32) : onze
// blocages et huit conditions de livraison, dont trois recettes humaines
// qu'aucune garde ne peut signer à leur place.
export * from './schemas/route-migration-go-no-go.js'
// Le rollback de déploiement (#2154.7) : l'étape RÉELLEMENT atteinte par
// chacune des quatorze routes, et l'action concrète pour défaire chacune —
// jamais un moteur de feature flags vivant, l'outillage qui en tiendrait la
// preuve.
export * from './schemas/route-migration-rollback.js'
// La coexistence ancienne/nouvelle projection (#2154.8) : les deux routes qui
// partagent réellement une page (Positionnements/Réactivation), les cinq dont
// l'ancienne projection est retirée (rien ne coexiste), les sept non
// vérifiables.
export * from './schemas/route-migration-coexistence.js'
// Les treize dimensions de non-régression de #2154.9/#2958.72-.93, ENSEMBLE,
// pour une capacité réelle (Écritures → Centre d'actions) — huit prouvées,
// cinq gaps nommés plutôt que cochés en silence.
export * from './schemas/route-migration-nonregression.js'
// #2958.104 (lot M12, 09/10) — l'état vide des 21 routes migrées : chaque
// écran nomme sa branche vide ET sa porte de sortie, relues par une garde web.
export * from './schemas/route-migration-empty-states.js'
// Les conditions NO-GO/GO PROPRES À #2208 (#2958.94-.112) : neuf blocages et
// sept conditions de livraison au vocabulaire distinct de #2154.31/.32,
// jamais fusionnées avec elles. Une seule (`route_cassee`, #2958.103) est
// calculée contre le registre réel ; les autres nomment honnêtement ce
// qu'aucun mécanisme de ce dépôt ne mesure encore.
export * from './schemas/route-migration-2208-conditions.js'
// Les neuf métriques analytics de la migration de routes (#2958.72-.93) — une
// par émetteur du traceur produit, agrégées par route/écran, jamais par
// personne. Quatre prouvées sur une destination réelle, cinq gaps nommés.
export * from './schemas/route-migration-metrics.js'
// Les vingt-cinq contradictions déjà arbitrées et les onze invariants de
// l'itération 3 : ce qui ne se rejoue pas d'un paquet à l'autre, et le fichier
// qui tient chaque règle — vérifié sur le disque par GA-38.
export * from './schemas/doctrine-registry.js'
export * from './schemas/route-registry.js'
// #4295.1 — le vocabulaire d'état du travail asynchrone (analyse, imports) : un seul, lu par le web, l'API et Laura.
export * from './schemas/operation-status.js'
// L'analytique produit (doctrine `c64_analytique_produit`, issue #1681) : les
// DEUX nombres de la règle — seuil d'agrégation minimale et rotation du hash de
// session — à un seul endroit, parce que l'API décide ce qu'elle CALCULE et le
// back-office ce qu'il DIT à la place. GA-26.
export * from './schemas/product-analytics-privacy.js'
// #1683 — le catalogue des écrans du produit : une route, un nom, en FR et EN.
// Il fait DEUX choses, et la seconde compte plus que la première : nommer un
// écran, et REPLIER un chemin réel (`/accounts/3f1c…`) vers son motif — sans
// quoi un identifiant de compte client se retrouverait dans une lecture du
// back-office. Complétude tenue par GA-265 contre `apps/web/src/routes/`.
export * from './schemas/product-screens-catalog.js'
// Le panneau d'effet, réduit à ses règles (Tome 7 §47) — dont la seule qui soit
// une règle de sécurité : aucune case déclenchant un envoi externe n'est
// pré-cochée, et `initialSelection` le REFUSE même si le catalogue le demande.
export * from './schemas/effect-panel.js'
// Les numéros de décision : uniques DANS leur chantier, jamais globalement —
// vingt-cinq en désignent déjà deux. GA-40 empêche le compte de remonter.
export * from './schemas/decision-registry.js'
// Les trente règles d'interaction déjà arbitrées par le tome 7 (§7, §25, §28) —
// douze lois, neuf conflits de placement, neuf règles de rendu. GA-41 vérifie
// que chaque porteur cité existe, et qu'un registre tout vert échoue.
export * from './schemas/interaction-laws.js'
// Les sept formes d'un objet métier et la matrice 17 × 7 du tome 7 (§5) — 119
// cellules déjà arbitrées, plus ce que `apps/web` en rend vraiment. GA-74
// vérifie les comptes de la recopie, ouvre chaque porteur, et refuse qu'une
// forme se déclare livrée sans écran qui la rende.
export * from './schemas/object-forms.js'
export * from './schemas/crm-record.js'
export * from './schemas/declared-subsidiaries.js'
export * from './schemas/crm-write-request.js'
// #2200/#2201 ACT2 — l'objet visé (compte, contact, propriétaire, canal,
// risque NOMMÉ), commun aux quatre files de validation.
export * from './schemas/write-request-target.js'
// Socle exécutif des méta-analyses besoins (03/08/2026) : la messagerie et
// l'agenda de l'utilisateur, décrits comme des CAPACITÉS et non comme des
// éditeurs — un seul contrat pour Google et Microsoft.
export * from './schemas/mailbox.js'
export * from './schemas/agenda.js'
export * from './schemas/daily-briefing.js'
// #2111 — le contrat d'état commun des trois pages du jour. APRÈS
// `daily-briefing` : il DÉRIVE de son état de fil plutôt que d'en écrire un
// second (GA-26), et il ne compile pas sans lui.
export * from './schemas/briefing-surface-state.js'
// #2397.7 — le retour utilisateur comme axe de classement. APRÈS
// `daily-briefing` : il scope son contrat sur `BRIEFING_ACTION_KINDS`.
export * from './schemas/briefing-role-fit.js'
// Les quatre lignes TYPÉES de « ce qui a bougé depuis ta dernière visite ».
// Après `daily-briefing` : elles réutilisent son vocabulaire d'états de bloc.
export * from './schemas/since-last-visit.js'
// #2556 — un compte déjà connu propose ≥1 fait neuf daté/sourcé, ou le dit
// honnêtement. Après `since-last-visit` : réutilise SA ligne telle quelle.
export * from './schemas/account-known-movements.js'
export * from './schemas/routines.js'
export * from './schemas/ats.js'
export * from './schemas/mail-batch.js'
export * from './schemas/beeper.js'
// Changelog produit : ids + libellés FR/EN. Ici plutôt que dans `apps/web`
// parce que l'API en a besoin pour la Newsletter Changelog — un seul catalogue,
// deux consommateurs (voir `changelog/entries.ts`).
export * from './changelog/index.js'
// Grille tarifaire EMBARQUÉE (prix, crédits, sièges). Ici parce que l'API, l'app
// et le site en affichaient chacun leur copie — voir `billing/shipped-plan-grid.ts`.
export * from './billing/shipped-plan-grid.js'
// Facturation multi-devises : prix DÉCLARÉS par devise, jamais convertis.
export * from './billing/currencies.js'
// Le retour de la page de paiement, nommé une seule fois : le serveur pose les
// URLs, le front les lit, et un seul module sait ce que chacune veut dire.
export * from './billing/checkout-return.js'
export * from './schemas/account-entity.js'
// #2284 — Entity Resolver P0 : taxonomie commune des entités résolues.
export * from './schemas/entity-resolution.js'
export * from './schemas/entity-resolution-correction.js'
export * from './schemas/contact-resolution-correction.js'
// #2284.20 — le domaine comme clé de résolution (saisie libre → domaine racine).
export * from './schemas/company-domain-key.js'
export * from './schemas/need-status.js'
export * from './schemas/need-theo-status.js'
export * from './schemas/need-matcher-gate.js'
export * from './schemas/need-auto-match.js'
export * from './schemas/need-presenter-gate.js'
export * from './schemas/need-quality-summary.js'
export * from './schemas/need-qualification-questions.js'
export * from './schemas/need-contradictions.js'
export * from './schemas/need-qualification-response.js'
export * from './schemas/need-submission-gate.js'
export * from './schemas/workspace-profile.js'
export * from './schemas/need-next-action.js'
export * from './schemas/open-needs.js'
export * from './schemas/need-export.js'
export * from './schemas/registry-contract.js'
export * from './schemas/reverse-need-prospects.js'
export * from './schemas/external-sourcing.js'
export * from './schemas/need-filters.js'
export * from './schemas/priority-gate.js'
export * from './schemas/staffable-gate.js'
export * from './schemas/chain.js'
export * from './schemas/proactivity.js'
export * from './schemas/interruption-budget.js'
export * from './schemas/laura-analytics.js'
export * from './schemas/workspace-health.js'
export * from './schemas/model-routing-eval.js'
export * from './schemas/workspace-budget.js'
export * from './schemas/tool-daily-cap.js'
export * from './schemas/laura-interventions.js'
export * from './schemas/laura-context.js'
export * from './schemas/laura-chat-scope.js'
export * from './schemas/laura-context-mode.js'
export * from './schemas/chat-research-mode.js'
export * from './schemas/reply-preferences.js'
export * from './schemas/message-approach-preference.js'
export * from './schemas/message-grounding.js'
// #4016.L8b — « ne plus me demander » le coût d'un enrichissement (préférence personnelle).
export * from './schemas/enrichment-cost-preference.js'
export * from './schemas/protected-time.js'
export * from './schemas/team-policy.js'
export * from './schemas/agenda-preferences.js'
export * from './schemas/agenda-slot-proposal.js'
export * from './schemas/briefing-card-disposition.js'
export * from './schemas/request-intent-contract.js'
// #2321 — le ROUTEUR d'intention : le producteur qui manquait à quatre des
// dix-huit champs du contrat ci-dessus. Miroir Python dans
// `apps/ia/app/services/compilers/intent_router.py`.
export * from './schemas/chat-intent-router.js'
export * from './schemas/commercial-intent.js'
export * from './schemas/laura-account-context.js'
// #3939.3 — la douleur sourcée et datée du dossier ouvert (détecteur + âge affiché).
export * from './schemas/laura-account-pain.js'
export * from './schemas/channel-performance.js'
export * from './schemas/outcome-recommendation.js'
export * from './schemas/role-performance.js'
export * from './schemas/angle-performance.js'
export * from './schemas/reminder-channel.js'
export * from './schemas/mission-scores.js'
export * from './schemas/forecast-horizons.js'
export * from './schemas/deal-probability.js'
export * from './schemas/finance-scope.js'
export * from './schemas/crm-counters.js'
export * from './schemas/revenue.js'
export * from './schemas/stage-move.js'
export * from './schemas/catalogue.js'
export * from './schemas/proof.js'
export * from './schemas/case-dimensions.js'
export * from './schemas/relation-stage-read.js'
export * from './schemas/access.js'
export * from './schemas/access-entities.js'
export * from './schemas/community-facts.js'
export * from './schemas/shared-anonymous-base.js'
export * from './schemas/shared-company-facts.js'
export * from './schemas/market-pattern.js'
export * from './schemas/loss-reason-codes.js'
export * from './schemas/import-limits.js'
export * from './schemas/shared-public-facts.js'
export * from './schemas/workspace-private-tables.js'
export * from './schemas/generic-recommendation-judge.js'
export * from './schemas/market-expertise-match.js'
export * from './schemas/market-memory.js'
export * from './schemas/market-memory-cohort-index.js'
export * from './schemas/market-memory-cohort-index-axes.js'
export * from './schemas/market-memory-scoring.js'
export * from './schemas/market-heat.js'
// #2288.2 — la nature d'une date de signal (propre / partagée / aucune). La
// SEULE fonction qui tranche, partagée serveur ↔ écran.
export * from './schemas/market-signal-date.js'
// #2288.2/.3/.4 — le flux présélection → vérification → conservation, et le
// coût annoncé AVANT le geste payant. Partagé serveur ↔ écran.
export * from './schemas/market-verification.js'
// #2288.4 (c66) — BOAMP/DECP annoncés là où la gate de collecte les
// interrogera : le seul morceau de `collection_focus.py` décidable avant le run.
export * from './schemas/public-tenders-gate.js'
// #1622 — l'outillage de vérité terrain (labels fermés, seuil de jugements,
// résolution des six métriques). #1639.3 (télémétrie de préfiltre payant) n'a
// PAS de contrat ici : aucun chemin de production ne décide aujourd'hui « je
// n'appelle pas un fournisseur payant parce que la mémoire marché a répondu »
// — voir le rapport du lot pour le détail des quatre compteurs demandés.
export * from './schemas/market-memory-ground-truth.js'
export * from './schemas/market-techno-affinity.js'
export * from './schemas/market-techno-prevalence.js'
export * from './schemas/table-scopes.js'
export * from './schemas/esn-directory.js'
export * from './schemas/territory-watch.js'
export * from './schemas/rag.js'
export * from './schemas/overflow-score.js'
export * from './schemas/territory.js'
export * from './schemas/partner-governance.js'
export * from './schemas/partner-cv-push.js'
export * from './schemas/partner-pipeline.js'
export * from './schemas/first-move.js'
export * from './schemas/sprint.js'
export * from './schemas/contribution.js'
export * from './schemas/review-signals.js'
export * from './schemas/focus-review-signal.js'
export * from './schemas/ecosystem-relation.js'
export * from './schemas/link-kind.js'
export * from './schemas/introduction-authorization.js'
export * from './schemas/message-draft-version.js'
export * from './schemas/scheduled-message-send.js'
export * from './schemas/mcp-access-intent.js'
export * from './schemas/talent-recruitment.js'
export * from './schemas/personal-access-path.js'
export * from './schemas/commercial-trajectory.js'
export * from './schemas/partner.js'
export * from './schemas/relative-deadline.js'
export * from './schemas/favorites.js'
export * from './schemas/account-billing-readiness.js'
// La CESSION de créance / affacturage (31/08/2026). Distincte de
// `invoice-readiness.js`, qui s'arrête à « prêt à facturer » : ici la facture
// est émise, et c'est le FINANCEMENT de la créance qui se pilote.
export * from './schemas/factoring.js'
export * from './schemas/metric-snapshot.js'
export * from './schemas/expense-report.js'
export * from './schemas/outgoing-payment.js'
export * from './schemas/need-document.js'
export * from './schemas/project-document.js'
export * from './schemas/mission-document.js'
export * from './schemas/project-synthesis.js'
export * from './schemas/need-step.js'
export * from './schemas/project-step.js'
export * from './schemas/adv.js'
// L'objectif mensuel de marge (D7 du 26/08, LEVÉ par Louis le 31/08/2026) et la
// dérivation du taux de réalisation. Il vit à côté de `metric-snapshot.js` parce
// qu'il répond à la même famille de questions — « par rapport à quoi ? » — et
// qu'il tient la même discipline : une branche non mesurée ne porte pas de
// chiffre.
export * from './schemas/finance-target.js'
// Le STOCKAGE DE FICHIERS (31/08/2026) — dépôt, lecture par URL signée à durée
// courte, suppression, conservation datée. Les bornes vivent ici parce que les
// DEUX côtés les appliquent : un écran qui refuserait à 8 Mo pendant que le
// serveur refuse à 10 laisserait partir un envoi de deux minutes pour rien.
export * from './schemas/storage.js'
// #1939 — le message vocal de Laura : bornes, lecture du conteneur, capacité.
export * from './schemas/chat-voice.js'
export * from './schemas/chat-eval-sampling.js'
// Le chatbot public du site (rapport « Laura, chatbot commercial du site »,
// 17/08/2026). Ces quatre modules ont DEUX lecteurs — le navigateur qui émet la
// mesure et le back-office qui la lit — d'où leur place ici plutôt que dans le
// site seul : une énumération recopiée des deux côtés diverge en trois semaines,
// et un tableau de bord qui compte des événements que plus personne n'émet ne le
// dit jamais.
//
// La DISPONIBILITÉ humaine, elle, n'a qu'un lecteur (le site, pour ne promettre
// que ce que quelqu'un tiendra) : elle vit donc dans le site, et pas ici.
export * from './schemas/chatbot-funnel.js'
export * from './schemas/chatbot-experiments.js'
export * from './schemas/chatbot-objections.js'
export * from './schemas/chatbot-prefill.js'
// Le brief d'AVANT rendez-vous (01/09/2026) — sept blocs, et chacun dit d'où il
// vient. Distinct de `meeting-notes.js`, qui est le compte rendu d'APRÈS : un
// brief se lit avant, un compte rendu s'écrit après.
export * from './schemas/meeting-brief.js'
// #2319 — quand le brief se propose, ses limites, ce qui reste à vérifier.
export * from './schemas/meeting-brief-content.js'
export * from './schemas/meeting-r1-r2.js'
// Le verdict « go / no-go » d'un besoin — six axes, trois issues, AUCUN nombre
// agrégé. Ce n'est ni la porte G3 (`staffable-gate.js`, qui TRANCHE et que ce
// verdict ne remplace pas) ni le rapprochement (`match.js`, qui classe des
// PERSONNES) : c'est ce qui répond à « faut-il y aller ? ».
export * from './schemas/need-verdict.js'
export * from './schemas/match-in-clear.js'
// #3390 — le moteur de choix de méthode commerciale, commun à Laura et aux
// pages produit : lit un verdict déjà calculé, ne recalcule rien.
export * from './schemas/commercial-method-engine.js'
// #3390.10/.11 — la méthode retenue, dite à Laura (même objet que l'écran).
export * from './schemas/laura-commercial-method-context.js'
export * from './schemas/plan-entry-route.js'
// La MÉMOIRE COLLECTIVE (01/09/2026) — « le pont, pas le dossier ».
// Le type d'un croisement, écrit pour qu'un corps de message, une note ou un
// montant n'aient nulle part où aller : aucun texte libre, une seule porte
// (`objectLabel`) marquée et bornée, tout objet `.strict()`.
export * from './schemas/memory-crossing.js'
// LA PROCHAINE ACTION EST UN LIEN (01/09/2026) — la dérivation UNIQUE qui, pour
// une action donnée, rend son libellé ET sa destination. Elle LIT les tables qui
// existent déjà (`BLOCKER_ACTIONS`, le `z.enum` d'une mission active) ; sept
// écrans qui refont chacun la leur divergent au premier ajout (GA-26).
export * from './schemas/next-action.js'
// ORION V12 (31/08/2026) — successeur de DATAFORGE V10, même espace de clés
// DF-XXXX. Les listes fermées vivent ici pour que GA-12
// (check-constraints-cover-enums.spec.ts) les voie ; apps/api les réexporte.
export * from './schemas/dataforge-orion.js'
export * from './schemas/dataforge-needs.js'
export * from './schemas/technology-radar.js'
export * from './schemas/impersonation.js'
export * from './schemas/backoffice-access.js'
export * from './schemas/backoffice-audit.js'
// #1618 — LA façade `AccountIntelligenceContext` : la hiérarchie de confiance
// codée (correction humaine > donnée courante > DataForge > mémoire marché >
// inférence) et la forme de ce qu'elle rend, avec provenance.
export * from './schemas/account-intelligence-context.js'
// #2212/#2213/#2214 — le socle du guide : les trois niveaux d'aide, les trois
// modes, ce qu'est une cible ancrée, et le catalogue FERMÉ des raisons pour
// lesquelles une cible est absente (une absence se nomme, elle ne s'invente pas).
export * from './schemas/guide.js'
// #2630.1 — LA PASSE RAPIDE sur vingt comptes (décision Louis 20/09/2026, QCM).
// Un verdict GO / PRUDENCE / NON par compte, ses axes pesés NOMMÉS et ceux qu'on
// n'a pas pu peser nommés aussi (GA-18 / GA-19). Aucun pourcentage, aucune
// probabilité — le schéma le REFUSE, il ne se contente pas de l'écrire.
export * from './schemas/discover-quick-pass.js'
// #2630.2 — CE QUI EST DÉJÀ TROUVÉ pendant qu'une analyse tourne. La matière
// était sur le fil depuis toujours (`emitPhaseComplete(…, payload)`) et le
// navigateur la jetait. Ce contrat la BORNE — des décomptes et au plus trois
// libellés — et refuse par construction la ligne « 0 contact trouvé ».
export * from './schemas/analysis-partial.js'

// #2322 — LE COMPILATEUR DE BESOIN : ce qu’une source dit, ce qu’elle ne dit
// pas, et d’où vient chaque champ. EN FIN de fichier, comme tous les
// précédents — un ajout au milieu ne fait que des conflits.
export * from './schemas/need-compilation.js'

// #2455 — contextes de travail enregistrés (LAU-FINAL-168), en fin de fichier.
export * from './schemas/work-context.js'

// #2454 — contrat de contexte des surfaces hors conversation (LAU-FINAL-167), en fin de fichier.
export * from './schemas/surface-context-contract.js'

// #2931 (reprend #2167.1/.3-.14) — le contrat de page transverse et son audit, en fin de fichier.
export * from './schemas/page-contract.js'

export * from './schemas/commercial-outcome.js'

// #2317.10 (#2923) — les six verbes de l'Action OS et leur audit, en fin de fichier.
export * from './schemas/action-os-verbs.js'

// #2924 (#2143) — l'audit des points de doctrine d'architecture, en fin de fichier.
export * from './schemas/architecture-doctrine-audit.js'

// #2929 (#2292) — l'audit des points sans appelant réel, en fin de fichier.
export * from './schemas/known-account-analysis-audit.js'

// #2985 (revue manager, section G de #2319) — en fin de fichier, comme tous les précédents.
export * from './schemas/account-manager-review.js'

// #2265.14 (épopée #2851) — le badge « intermédiaire », étendu hors /discover
// (fiche compte, listes), en fin de fichier.
export * from './schemas/intermediary-actor.js'

// #2075.12 / #2075.13 (épopée #2774) — commenter une conclusion, refuser une
// recommandation de l'audit commercial, en fin de fichier.
export * from './schemas/commercial-audit-feedback.js'

// #2386.9 — la télémétrie de la session de prospection, PAR PARCOURS.
export * from './schemas/prospecting-session-telemetry.js'

// #3010 (point 9) — les quinze hard failures d'#2386, sourcées ou nommées « à
// sourcer » (décision Louis 28/09/2026), en fin de fichier.
export * from './schemas/prospecting-hard-failures.js'

// #3424 lot G03 (30/09) — garde-fous MCP non négociables, source unique pour
// apps/mcp (instructions du serveur) et apps/web (/settings/mcp).
export * from './schemas/mcp-guardrails.js'

// Chantier « briefs comptes » (01/10/2026) — le contrat du brief commercial
// (démo + pipeline IA + écran) et ses contrôles métier, en fin de fichier.
export * from './schemas/commercial-brief.js'
export * from './commercial-brief/controls.js'

// Capacité « Marchés locaux » (04/10/2026, lot L0) — le contrat du brief d'un
// marché (zone France ou Suisse) et ses contrôles métier.
// #3755 — la grille de qualification propre à l'espace (éliminatoires + pondérés).
export * from './schemas/qualification-grid.js'
export * from './schemas/market-brief.js'
export * from './market-brief/controls.js'
export * from './schemas/reply-parity.js'
export * from './schemas/reply-transform.js'
export * from './schemas/cv-text-quality.js'
export * from './schemas/account-changes.js'
export * from './schemas/account-facts.js'
export * from './schemas/account-facts-weight.js'
export * from './schemas/account-facts-screens.js'
export * from './schemas/account-facts-export.js'
export * from './schemas/week-delta.js'
export * from './schemas/record-links.js'
export * from './schemas/offers-cascade.js'
export * from './schemas/work-progress.js'
// #4629.2 — le verrou d'essai énuméré : ce qui est fermé, ce qui reste ouvert, jamais un chiffre de crédits.
export * from './schemas/trial-lock.js'
export * from './schemas/shared-person-fields.js'
// #4792 — le lecteur commun de notre base : contrat partagé par Découvrir, Laura, l'analyse et Signaux.
export * from './schemas/base-reader.js'
