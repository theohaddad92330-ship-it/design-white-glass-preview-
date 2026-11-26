import { z } from 'zod'

/**
 * Le registre de doctrine — les arbitrages qui ne se rejouent pas.
 *
 * Le paquet `00_GOUVERNANCE_SOURCE_OF_TRUTH` du 24/08/2026 porte vingt-cinq
 * contradictions DÉJÀ tranchées et onze invariants non négociables. Tant qu'ils
 * vivent dans un PDF, chacun des neuf paquets suivants les re-arbitre — dans
 * deux sens, à trois semaines d'intervalle, et personne ne se souvient pourquoi.
 *
 * Ce registre est du CODE, versionné, et il ne fait qu'une chose : DÉCRIRE. Il
 * n'exécute rien. C'est ce qui lui permet de dire la vérité, y compris quand
 * elle est déplaisante — au 28/08/2026, dix-neuf doctrines sur cinquante-sept
 * ne sont tenues par AUCUN test, et quatre (dont `c33_promesse_chiffree`) ne
 * sont tenues par rien du tout.
 *
 * Il ne décrit plus seulement les vingt-cinq contradictions du 24/08 : trois
 * arbitrages sont venus des chantiers suivants (c26 à c28), quinze du dossier
 * du 26 août — celui-là ne portait aucune contradiction entre deux paquets, il
 * portait quinze REFUS déjà tranchés que personne n'avait écrits, chacun tenu
 * par un commentaire au-dessus de la fonction concernée —, cinq de la mesure
 * du 28/08 sur le CRM et l'ATS (c45 à c49), dont un tenu par une simple
 * OMISSION, et huit du recomptage de clôture du PDF-02 (c50 à c57). Un refus
 * qui vit dans un commentaire se re-propose au premier changement de main ; un
 * refus qui ne vit nulle part se re-propose plus vite encore.
 *
 * ⚠️ Les six derniers (c52 à c57) ne sont pas de la même espèce que les autres :
 * ce ne sont pas des refus tirés d'une source, ce sont des CONTRADICTIONS
 * ASSUMÉES avec elle — le code fait délibérément autre chose que ce que PDF-02
 * demande. Chacun porte donc les DEUX formulations, et dit laquelle gagne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX AXES, JAMAIS FONDUS
 * ─────────────────────────────────────────────────────────────────────────────
 * `codeState` dit si la règle est APPLIQUÉE. `enforcement` dit si elle est
 * TENUE — c'est-à-dire si quelque chose tomberait le jour où quelqu'un la
 * casse. Les fondre reproduirait exactement l'erreur que C15 dénonce : « une
 * intégration connectée n'est pas une intégration dont la lecture est vérifiée ».
 * Une règle appliquée et non gardée est une règle qui a trois semaines à vivre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `holders` EST VÉRIFIÉ SUR LE DISQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 24/08, `provenance.ts` affirmait « c'est exactement ce que le test de garde
 * `no-blind-record-writes.spec.ts` interdit » — et ce fichier n'existait nulle
 * part. Une garde AFFIRMÉE mais absente est pire qu'une garde absente : elle
 * fait croire que le sujet est tenu. `doctrine-registry.test.ts` ouvre donc
 * chaque chemin déclaré ici. Un porteur renommé, déplacé ou supprimé fait
 * échouer la CI, et c'est le seul moment où l'on peut encore réagir.
 */

export const DOCTRINE_KEYS = [
  'c01_navigation',
  'c02_laura_copilote',
  'c03_laura_site',
  'c04_objet_metier',
  'c05_secteur',
  'c06_multi_domaines',
  'c07_discover_scoring',
  'c08_dataforge',
  'c09_procurement',
  'c10_compte_site',
  'c11_contacts',
  'c12_organigramme',
  'c13_plan_de_compte',
  'c14_automatisation',
  'c15_integrations',
  'c16_crm_overlay',
  'c17_facturation',
  'c18_manager',
  'c19_vocabulaire',
  'c20_matching',
  'c21_donnees',
  'c22_demo',
  'c23_pricing',
  'c24_linkedin',
  'c25_observabilite',
  // GA-08 : les ajouts vont en FIN de liste, jamais au milieu.
  'c26_probabilite',
  'c27_phase_de_travail',
  'c28_seniorite',
  // ───────────────────────────────────────────────────────────────────────────
  // Les REFUS du dossier du 26 août, écrits le 28/08.
  //
  // Une quinzaine de propositions ont été tranchées dans ce dossier sans être
  // écrites nulle part : ni au registre, ni dans un tracker, parfois seulement
  // dans un commentaire au-dessus de la fonction qui les tient. Un refus qui ne
  // vit que dans un commentaire se re-propose dès que le fichier change de
  // main — et il se re-propose de bonne foi, ce qui coûte deux fois : la
  // conversation, puis la relecture du code pour prouver que non.
  //
  // Chacune a été RE-MESURÉE contre le dépôt avant d'être écrite ici, et trois
  // l'ont été autrement que le dossier ne l'annonçait (voir leurs `gap`).
  // ───────────────────────────────────────────────────────────────────────────
  'c29_affacturage',
  'c30_libelle_facturation',
  'c31_relance_encaissement',
  'c32_deux_notes',
  'c33_promesse_chiffree',
  'c34_denominateur',
  'c35_registres_etrangers',
  'c36_recrutement_preuve',
  'c37_fusion_doublons',
  'c38_couleur_alerte',
  'c39_metadonnees_trace',
  'c40_secteur_pivot',
  'c41_maillon_chaine',
  'c42_saisie_creation',
  'c43_actions_de_masse',
  // Le seul arbitrage du registre qui LÈVE un refus. Écrit le 28/08 — GA-08 :
  // en FIN de liste, jamais au milieu.
  'c44_reponse_favorable',
  // ───────────────────────────────────────────────────────────────────────────
  // Les refus du CRM et de l'ATS que le code tenait sans que rien ne les écrive,
  // inscrits le 28/08/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Une mesure a montré que cinq refus tenus par le dépôt n'apparaissaient dans
  // AUCUN registre. Trois d'entre eux étaient tenus par des choses qui ne se
  // relisent pas : un commentaire au-dessus d'une fonction, un numéro de
  // décision (« D60 ») qui ne renvoyait nulle part, et — pour le rang d'entrée
  // d'une entité — une simple OMISSION, personne n'ayant jamais écrit
  // `{entity.score}` dans le JSX.
  //
  // ⚠️ Chacun a été RE-MESURÉ avant d'être écrit, et deux l'ont été autrement
  // que la mesure ne l'annonçait : la marge par client n'est pas « tenue par
  // absence » (les agrégats existent, ils sont au back-office), et le refus de
  // remplacer l'outil de delivery n'est pas absent du registre — il est déjà
  // `c16_crm_overlay`, dont le `gap` cite désormais la formulation du PDF-02.
  // ───────────────────────────────────────────────────────────────────────────
  'c45_consentement_positionnement',
  'c46_marge_par_client',
  'c47_cout_acces',
  'c48_score_entite',
  'c49_interet_et_adressabilite',
  // ───────────────────────────────────────────────────────────────────────────
  // Les deux derniers refus de périmètre du §6 du PDF-02, écrits le 28/08/2026
  // — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Le §6 en pose six. Quatre étaient déjà ici : le remplacement de l'outil de
  // delivery (`c16_crm_overlay`), la saisie obligatoire (`c42_saisie_creation`),
  // la marge par client côté application (`c46_marge_par_client`) et l'émission
  // d'une facture (`c17_facturation`). Les deux qui suivent ne l'étaient pas, et
  // chacun était tenu par une chose qui ne se relit pas : une phrase de
  // CHANGELOG pour le premier, une simple habitude de navigation pour le second.
  //
  // ⚠️ Chacun a été RE-MESURÉ avant d'être écrit, et le premier l'a été
  // autrement que la mesure ne l'annonçait : le board Missions n'est PAS « une
  // projection en lecture seule ». Ses cartes se déplacent depuis le 21/08, et
  // le déplacement écrit sur l'objet d'origine. Ce que le refus interdit est un
  // TROISIÈME jeu d'états, pas le geste — écrire « lecture seule » au registre
  // aurait fait retirer une fonctionnalité livrée au nom d'une doctrine.
  // ───────────────────────────────────────────────────────────────────────────
  'c50_second_pipe',
  'c51_tableau_recruteur',
  // ───────────────────────────────────────────────────────────────────────────
  // Les six refus du COCKPIT et du VIVIER, écrits le 28/08/2026 — GA-08 : en
  // FIN de liste, jamais au milieu.
  //
  // Le recomptage de clôture du PDF-02 a laissé neuf points non clos sur 128, et
  // SIX d'entre eux n'étaient pas du code manquant : c'étaient des arbitrages
  // déjà pris, déjà appliqués, dont la raison ne vivait que dans un COMMENTAIRE
  // au-dessus de la route ou de la section de JSX concernée.
  //
  // ⚠️ Ce lot-ci diffère de tous les précédents sur un point : ce ne sont pas
  // des refus TIRÉS de la source, ce sont des CONTRADICTIONS ASSUMÉES avec
  // elle. Le code fait délibérément autre chose que ce que PDF-02 demande, et
  // chaque entrée doit donc porter les DEUX formulations — celle de la source
  // et celle du code — puis dire laquelle gagne et pourquoi. Une entrée qui ne
  // citerait que la seconde ferait passer la première pour un oubli, et la
  // mesure suivante la recompterait `ABSENT`.
  //
  // ⚠️ Chacun a été RE-MESURÉ sur le code avant d'être écrit, et deux l'ont été
  // autrement que le recomptage ne l'annonçait : « les trois tarifs » de la
  // source (coût chargé · tarif cible · tarif vendu) ne sont pas « les trois
  // montants » du code (plancher · coût chargé · prix d'achat), et le tarif
  // VENDU n'habite pas `mission_commercial_terms` — il est `missions.daily_rate`
  // (voir les `supersedes` de `c54` et `c57`).
  // ───────────────────────────────────────────────────────────────────────────
  'c52_capacite_equipe',
  'c53_montant_du_pipe',
  'c54_tarif_cible',
  'c55_cockpit_pas_en_tete',
  'c56_etapes_du_pipe',
  'c57_tarif_vendu_sur_la_fiche',
  // ───────────────────────────────────────────────────────────────────────────
  // Écrit le 29/08/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Le seul interdit de l'annexe III de l'EU AI Act qui vivait dans une garde
  // sans vivre au registre. Il y entre parce qu'une mesure a montré que la
  // garde ne couvrait qu'une moitié du problème : elle relit du CODE, et un
  // critère protégé peut peser dans un classement sans qu'aucune ligne ne le
  // lise — il suffit qu'il soit dans le PROMPT qui note.
  // ───────────────────────────────────────────────────────────────────────────
  'c58_criteres_proteges',
  // ───────────────────────────────────────────────────────────────────────────
  // Écrit le 30/08/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Ce que le plafond du copilote COMPTE. L'arbitrage est de Louis, et la
  // proposition qu'il ferme est PRÉCISE : « on reconnaît une réponse à une
  // question au point d'interrogation du message précédent ». Elle se
  // re-proposera, parce qu'elle est la première qui vient à l'esprit et qu'elle
  // ne demande aucune plomberie — et parce que le lot qui a livré « Laura
  // demande avant de répondre » rend le sujet visible. Elle exonérerait à peu
  // près tous les messages.
  // ───────────────────────────────────────────────────────────────────────────
  'c59_plafond_copilote',
  // ───────────────────────────────────────────────────────────────────────────
  // Écrit le 30/08/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Le croisement du 30/08 sur le paquet OrgGraph du 27/08 (§18, « les
  // POURQUOI à ne pas reperdre ») a mesuré : la règle est APPLIQUÉE — la carte
  // ne montre jamais les huit rôles bruts du contrat — mais sa RAISON n'était
  // écrite nulle part. Quelqu'un qui lit `orgDecisionRoleSchema`, y voit huit
  // valeurs, puis compte quatre badges à l'écran, conclut à un bug plutôt qu'à
  // un choix.
  // ───────────────────────────────────────────────────────────────────────────
  'c60_organigramme_badges',
  // ───────────────────────────────────────────────────────────────────────────
  // Écrit le 30/08/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Même croisement du 30/08. La fonctionnalité ET sa raison sont ABSENTES du
  // dépôt (`orgHierarchyRelationSchema` a cinq valeurs, aucun `validFrom` /
  // `validTo` / `reportingKind`) — le manque le plus net des douze POURQUOI du
  // §18. Louis tranche le 30/08 : on écrit la raison, on ne livre pas le
  // schéma.
  // ───────────────────────────────────────────────────────────────────────────
  'c61_organigramme_temporalite_matriciel',
  // ───────────────────────────────────────────────────────────────────────────
  // Écrit le 30/08/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Même croisement du 30/08 (item #264, tableau du bas de la vue focale). Le
  // porteur réel (`FocalOrgView.tsx`) vit dans `apps/web`, hors du périmètre
  // d'écriture de ce lot — un commentaire local n'était donc pas une option :
  // cette entrée EST le local qu'un commentaire aurait porté.
  // ───────────────────────────────────────────────────────────────────────────
  'c62_organigramme_tableau_contacts',
  // ───────────────────────────────────────────────────────────────────────────
  // Écrit le 30/08/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Même croisement du 30/08 (item #266, le verdict de la vue focale). Même
  // remarque que `c62` : le porteur (`focalOrgData.ts`) vit dans `apps/web`,
  // hors périmètre d'écriture de ce lot.
  // ───────────────────────────────────────────────────────────────────────────
  'c63_organigramme_verdict',
  // ───────────────────────────────────────────────────────────────────────────
  // Écrit le 07/09/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // La doctrine de l'analytique produit (issue #1681). Elle entre au registre
  // AVANT le code qu'elle contraint, ce qu'aucune autre entrée n'avait fait :
  // sept écrans (#1682 à #1688) vont se construire dessus, et un cadre qui vit
  // dans un fil d'issue se re-litigie au troisième écran — au moment précis où
  // le revenir en arrière coûte le plus cher.
  //
  // ⚠️ Son auteur écrit lui-même en pied d'issue : « À faire relire. Je pose le
  // cadre technique, pas l'avis juridique. » L'entrée respecte cette limite :
  // elle inscrit la contrainte D'INGÉNIERIE et NOMME la relecture juridique
  // comme non faite, plutôt que d'inventer un avis qui ferait passer une case
  // vide pour une case cochée.
  // ───────────────────────────────────────────────────────────────────────────
  'c64_analytique_produit',
  // ───────────────────────────────────────────────────────────────────────────
  // #1633.2 / #1635.3 (08/09/2026) — un TAUX DE COUVERTURE mesure ce que NOUS
  // savons, jamais ce que le marché FAIT. Les deux issues qui demandent le bloc
  // portent le même garde-fou chacune de son côté, ce qui n'est pas un hasard :
  // c'est la lecture que tout le monde fait spontanément d'un pourcentage.
  // ───────────────────────────────────────────────────────────────────────────
  'c65_couverture_nest_pas_un_fait_de_marche',
  // ───────────────────────────────────────────────────────────────────────────
  // #2291.3 (18/09/2026) — DÉCISION LOUIS sur « génération de candidats
  // combinant 9 sources nommées » (Découvrir) : un COMPROMIS explicite sur
  // « nos fournisseurs ne se nomment jamais », pas une exception discrète —
  // sans quoi l'un ou l'autre extrême se re-propose dans trois semaines.
  //
  // #2288.4 (18/09/2026) — le devis de vérification à la demande exerce le
  // volet POSITIF de la même décision : un registre ou une autorité PUBLIQUE
  // (BOAMP, DECP, France Travail) n'est pas un fournisseur qu'on tait.
  // ───────────────────────────────────────────────────────────────────────────
  'c66_sources_publiques_se_nomment',
  // ───────────────────────────────────────────────────────────────────────────
  // #2151.18 — DÉCISION LOUIS 15/09/2026, confirmée le 19/09/2026 : un poste
  // se dit « vu le <date>, source <la source> », jamais « vérifié ». Écrite
  // AVANT le code, comme `c61_organigramme_temporalite_matriciel` : aucune
  // surface n'affiche un poste aujourd'hui (aucune source de changement
  // d'emploi n'est branchée — le scraping LinkedIn reste interdit, `c24_linkedin`),
  // donc rien à garder. La règle s'applique dès qu'une surface existera.
  // ───────────────────────────────────────────────────────────────────────────
  'c67_poste_vu_le_jamais_verifie',
  // ───────────────────────────────────────────────────────────────────────────
  // #2291.9 (19/09/2026) — DÉCISION LOUIS (QCM du matin) : la grille qui
  // adapte le volume de comptes PROPOSÉS à la capacité commerciale déclarée.
  // Un réglage qui ne vit qu'à UN endroit (GA-26) : la constante, jamais un
  // second calcul dans l'écran ou côté backend.
  // ───────────────────────────────────────────────────────────────────────────
  'c68_capacite_adapte_le_volume_propose',
  // ───────────────────────────────────────────────────────────────────────────
  // #2297 (19/09/2026) — DÉCISION LOUIS (QCM) : l'effacement d'une personne
  // prospectée à sa demande (RGPD art. 17) est la SEULE exception à « on
  // archive, on ne supprime pas ». Écrite au registre parce que les deux
  // extrêmes se re-proposeront : « anonymiser comme la suppression de compte »
  // (la fiche resterait, et la personne reviendrait à la prochaine analyse), et
  // « supprimer aussi ailleurs » (toute suppression deviendrait défendable).
  //
  // ⚠️ Renumérotée c67 → c69 à l'intégration (19/09/2026) : c67 et c68 étaient
  // déjà pris (poste_vu_le_jamais_verifie, capacite_adapte_le_volume_propose)
  // par un autre lot fusionné le même jour. Un numéro de décision est unique
  // DANS SON CHANTIER (GA-40) — ici, dans CE registre.
  // ───────────────────────────────────────────────────────────────────────────
  'c69_effacement_dune_personne',
  // ───────────────────────────────────────────────────────────────────────────
  // #2430.9 (20/09/2026) — DÉCISION LOUIS (QCM) : « supprimer » une conversation
  // avec Laura ARCHIVE ses messages désormais, elle ne les efface plus — le
  // DELETE SQL sur `chat_messages` était l'exception NON écrite au registre que
  // les deux extrêmes se re-proposent (« c'était un choix assumé, » « il faut
  // tout supprimer partout »). Le geste réutilise `setThreadArchived` (#1120),
  // le mécanisme d'archivage EXISTANT (GA-26).
  // ───────────────────────────────────────────────────────────────────────────
  'c70_conversation_archivee_pas_supprimee',
  // ───────────────────────────────────────────────────────────────────────────
  // DÉCISION LOUIS (QCM), 21/09/2026 — mesurée lors d'un lot qui a failli poser
  // un cloisonnement par espace sur `enrichment_duration_samples`, arrêté au
  // dépôt. Une durée d'enrichissement est une latence PRODUIT, pas un coût
  // d'accès : GA-43 vise ce qu'un espace PAIE pour atteindre une donnée
  // (`access_facts`, nature `cost`), jamais le temps que le produit met à la
  // traiter — `c64_analytique_produit` continue de s'appliquer telle quelle.
  // ───────────────────────────────────────────────────────────────────────────
  'c71_latence_produit_pas_cout_dacces',
  // ───────────────────────────────────────────────────────────────────────────
  // Quatre décisions de Louis, 21/09/2026 — GA-08 : en FIN de liste, jamais au
  // milieu. Le détail de chacune : agent_docs/doctrine.md. ⚠️ Numérotées
  // c72-c75 (pas c71-c74) : la vague d'intégration qui a précédé celle-ci a
  // déjà pris c71 sur ce même fichier (`c71_latence_produit_pas_cout_dacces`,
  // vague 2 du 21/09) — GA-40, un numéro de décision est unique DANS SON
  // CHANTIER, jamais globalement.
  // ───────────────────────────────────────────────────────────────────────────
  'c72_encaissement_reste_du_nomme',
  'c73_fait_ne_porte_pas_preuve_denvoi',
  'c74_campagne_etiquette_mono_contact',
  'c75_plan_duplication_edition_generique',
  // ───────────────────────────────────────────────────────────────────────────
  // Quatre décisions de Louis, 21/09/2026 à midi — GA-08 : en FIN de liste,
  // jamais au milieu. ⚠️ Numérotées c76-c79 pour la même raison que ci-dessus.
  // ───────────────────────────────────────────────────────────────────────────
  'c76_role_reordonne_jamais_ne_filtre',
  'c77_gate_qualite_ia_bloque_sur_role_cle',
  'c78_remboursement_credits_nocturne',
  'c79_collecte_large_mais_propre',
  // ───────────────────────────────────────────────────────────────────────────
  // DÉCISION LOUIS 21/09/2026 (après-midi) — #2197.41, en FIN de liste (GA-08).
  // ⚠️ Renumérotée c79 → c80 à l'intégration (vague 6, 21/09/2026) : c79 était
  // déjà pris par `c79_collecte_large_mais_propre` (vague à midi, fusionnée
  // avant celle-ci) — GA-40, un numéro de décision est unique DANS SON
  // CHANTIER, jamais globalement.
  // ───────────────────────────────────────────────────────────────────────────
  'c80_facture_se_nomme_sa_source',
  // ───────────────────────────────────────────────────────────────────────────
  // DÉCISION LOUIS 21/09/2026 (soir) — #2378.9, en FIN de liste (GA-08). La
  // plus NEUVE des quatre décisions du jour : les trois autres précisent une
  // règle déjà écrite (c26 la probabilité, c19 l'envoi, c72/c80 la facture),
  // celle-ci en pose une qui n'existait nulle part sous forme de règle — elle
  // n'existait que comme table, pour UNE des deux familles d'effets.
  // ───────────────────────────────────────────────────────────────────────────
  'c81_etape_sortante_attend_interne_part',
  // ───────────────────────────────────────────────────────────────────────────
  // DÉCISION LOUIS 21/09/2026 (soir) — #2375.10, en FIN de liste (GA-08).
  // ⚠️ La règle est ANCIENNE (« le copilote n'envoie jamais d'e-mail : il
  // prépare, le commercial envoie ») et elle n'avait pourtant AUCUNE entrée de
  // registre : elle ne vivait que dans une ligne de `CLAUDE.md`, citée en appui
  // par `c73_fait_ne_porte_pas_preuve_denvoi` sans être portée par personne.
  // Mesuré le 21/09/2026 : aucune clé `c*` du fichier ne la porte. C'est
  // exactement l'espèce de refus que le registre a été écrit pour attraper —
  // et ce que le 21/09 y ajoute est sa CLÔTURE : ni liste blanche, ni
  // exception, ni réglage.
  // ───────────────────────────────────────────────────────────────────────────
  'c82_copilote_prepare_le_commercial_envoie',
  // DÉCISION LOUIS 18/09/2026 — #2302 (LAU-FINAL-043, résolveur de territoire).
  // Le cadrage croisait « territoire » sur plusieurs specs `chat-*` : un
  // NIVEAU DE COMPTE d'un côté (#2302), un NŒUD DE GRAPHE D'ORGANISATION de
  // l'autre (#2310). Ce ne sont pas deux formulations d'une même idée : deux
  // axes réellement différents, désormais nommés séparément pour qu'aucun
  // agent ne les refonde.
  'c83_territoire_niveau_compte_vs_noeud_de_graphe',
  // DÉCISION LOUIS 22/09/2026 — #2723, RENVERSEMENT ASSUMÉ de D1 (décision
  // Louis 14/09/2026, `chat_tools.py:1377`/`:4520`/`:7105` — proposer une
  // analyse = une carte à valider, le clic est la décision). D1 ne disparaît
  // pas : elle est réécrite EN PLACE, renversée et datée — un arbitrage
  // effacé se re-propose, un arbitrage renversé se lit.
  'c84_analyse_recherche_enrichissement_partent_sans_carte',
  // ÉPOPÉE #3015 (25/09/2026) — la recherche globale multi-entités nommait
  // elle-même son blocage avant tout code : « collision ⌘K→Laura à trancher
  // avant tout code ». Tranché sans Louis (doctrine issues sans questions).
  'c85_recherche_globale_ne_vole_pas_laura',
  // ÉPOPÉE #2775 (#2012.9, LOT j1 26/09/2026) — deux passes précédentes
  // (25/09) mesuraient déjà l'écart sans le trancher : « aucune décision de
  // doctrine nommée + datée n'a acté ce regroupement comme définitif ».
  // Tranché sans Louis (doctrine issues sans questions).
  'c86_onboarding_market_offer_plan_un_seul_signal',
  // DÉCISION LOUIS 04/10/2026 (lot E20) — renversement ASSUMÉ et daté de
  // #1670.4 (« masquage par défaut des e-mails, révélés au clic »).
  'c87_coordonnees_pro_toujours_en_clair',
  // DÉCISION LOUIS 04/10/2026 — import ZIP de 688 CV en production, 688 fiches
  // sans nom : D366 est LEVÉE pour la lecture automatique par le modèle.
  'c88_lecture_auto_cv_import',
  // DÉCISION LOUIS 05/10/2026 — #3702, en FIN de liste (GA-08). RENVERSE PARTIELLEMENT c81 sans l'effacer.
  'c89_delegation_denvoi_explicite_bornee',
  // DÉCISION LOUIS 08/10/2026 (#3847, lot Y01) — RENVERSEMENT ASSUMÉ et daté de
  // #2001 (14/09/2026) et de D81, pour la seule surface /chat.
  'c90_chat_pleine_largeur',
  // DÉCISION LOUIS 08/10/2026 — #2021, QCM, en FIN de liste (GA-08). RENVERSE #2572 pour CE SEUL cas.
  'c91_reconfiguration_deja_onboarde_bandeau_pas_redirection',
  // DÉCISION LOUIS 09/10/2026 (QCM, lot P05, #3246) — en FIN de liste (GA-08).
  // RENVERSE GA-43 (« le coût d'accès ne s'agrège jamais entre espaces ») et
  // « rien n'est agrégé entre espaces » (M11) sans les effacer.
  'c92_base_anonyme_commune',
  // DÉCISION LOUIS 11/10/2026 (épopée #4016, lot L4) — en FIN de liste (GA-08).
  // RENVERSE en partie « JAMAIS de donnée fictive » et c12 (relation) sans les effacer.
  'c95_estimation_badgee',
  // ÉPOPÉE #4016 (L12, 11/10/2026) — « casser les verrous » : sorties et connecteurs.
  // Renversement ASSUMÉ et daté de GA-399 (« enregistrement avec consentement
  // seulement ») pour l'analyse d'appels, ouverture des alertes Découvrir en SMS
  // vers BE/CH/LU. Écrit pour être lu, pas effacé.
  'c95_sorties_connecteurs_appels_consentis',
  // DÉCISION LOUIS 11/10/2026 (épopée #4016, L2) — en FIN de liste (GA-08).
  // RENVERSE PARTIELLEMENT c24_linkedin sans l'effacer.
  'c95_linkedin_fournisseur_sous_contrat',
  // DÉCISION LOUIS 11/10/2026 (épopée #4016, L3) — RENVERSE EN PARTIE D58/D65/c39, en FIN de liste (GA-08).
  'c96_corps_mails_boite_du_commercial',
  'c96_memoire_marche_concurrent_des_un_parcours',
  // DÉCISION LOUIS 11/10/2026 (nuit, lot W1, #3764 / #3861) — en FIN de liste (GA-08).
  // RENVERSE sa propre décision du 10/10 (QCM, #3861.3) : #3764 gagne.
  'c93_ligne_completude_jamais_affichee',
  // DÉCISION LOUIS 11/10/2026 (#2899, lot W5) — en FIN de liste (GA-08). RENVERSE la décision
  // d'opérateur du 27/09 (« réglage éteint par variable d'environnement, pipeline absent »).
  'c93_echantillonnage_conversations_opt_in_espace',
  // DÉCISION LOUIS 11/10/2026 (#2916, #2399.2) — renversement daté, voir l'entrée.
  'c93_matching_auto_besoin_entrant',
  // DÉCISION LOUIS 11/10/2026 (#3989 + #2877, QCM) — en FIN de liste (GA-08).
  // ÉLARGIT c92 (« agrégats >= 3 espaces, sans nom ») sans l'effacer.
  'c94_base_commune_capitalise_tout',
  // DÉCISION LOUIS 11/10/2026 (#3243.1) — en FIN de liste (GA-08).
  'c95_consultant_toujours_poussable',
  // DÉCISION LOUIS 12/10/2026 (#3935, #3947, QCM) — en FIN de liste (GA-08).
  // RENVERSE c88 sur UN point : la fiche d'un CV lu n'est plus « toujours à revoir ».
  'c97_cv_lu_fiche_qualifiee',
  // RETOUR BÊTA 14/10/2026 (#4173) — en FIN de liste (GA-08).
  // RENVERSE c93 sur UN point : l'échantillonnage de conversations pour les évals n'est plus éteint par défaut.
  'c98_echantillonnage_eval_allume_par_defaut',
  // DÉCISION LOUIS 15/10/2026 — en FIN de liste (GA-08). RENVERSE en partie la PR #4226 (cache par espace).
  'c99_cache_fournisseurs_commun',
  // DÉCISIONS LOUIS 13-15/10/2026 — en FIN de liste (GA-08). c99 est pris par integ/data-15-10.
  'c100_pilotage_quatre_onglets',
  'c101_parcours_dans_pilotage_droits_par_sous_onglet',
  'c102_maillon_faible_hors_briefing',
  'c103_mode_equipe_dans_la_barre_laterale',
  'c104_crm_ats_affaires_talents_missions',
  'c105_actions_aujourdhui_sequences_automatisations',
  'c106_offres_emploi_ordre_des_sources',
  'c107_esn_de_placement_toute_offre_reste_une_piste',
  'c108_tendance_volume_d_offres_dans_le_temps',
  'c109_reanalyse_rafraichit_un_bloc_sauf_correction_humaine',
  'c110_promptfoo_bloquant_apres_un_premier_run_reel',
  'c111_non_mesure_n_est_jamais_zero_sur_tous_les_ecrans',
  'c112_decouvrir_cinq_signaux_forts_dix_de_contexte',
  // DÉCISIONS LOUIS 17/10/2026 (lot V10-C) — en FIN de liste (GA-08).
  'c113_non_mesure_sous_un_score_ou_un_axe_seulement',
  'c114_role_ne_donne_pas_de_type_de_bloc',
  'c115_pas_d_adoption_par_commercial',
  'c116_pas_de_note_composite',
  'c117_pas_de_role_anonyme_en_noeud_d_organigramme',
  'c118_pas_de_detecteur_de_contradiction',
  'c119_seniorite_saisie_jamais_deduite',
  'c120_pas_de_consequence_equipe_owner',
  'c121_affaires_pipe_seul_talents_vivier_seul',
  // DÉCISION LOUIS 19/10/2026 (#4357, QCM du call refonte UX) — en FIN de liste (GA-08).
  // RENVERSE c105 sur UN point : l'onglet Automatisations disparaît, fondu dans le parcours Séquences.
  'c122_sequences_et_automatisations_un_seul_parcours',
  // DÉCISION LOUIS 19/10/2026 (DEC-4036 Q5, #2958.98) — en FIN de liste (GA-08).
  // EXCEPTION NOMMÉE à D65 / c39 / c96 (« le corps ne sort jamais ») pour le seul rejeu d'éval.
  'c123_rejeu_eval_corps_compte_louis',
  // DÉCISION LOUIS 21/10/2026 (#4421, QCM) — en FIN de liste (GA-08).
  // RENVERSE #3865.2 (« n'y bascule jamais seul ») : rien en interne, Laura bascule SEULE en externe.
  'c124_laura_ne_s_arrete_jamais_bascule_externe',
  // DÉCISION LOUIS 21/10/2026 (#4430, après le call Cédric) — en FIN de liste (GA-08).
  // RENVERSE EN PARTIE la PR #4230 (« Découvrir sans appel payant ») et « Mantiks jamais dans Découvrir » (14/10).
  'c125_offres_fraiches_laura_decouvrir',
  // DÉCISION LOUIS 21/10/2026 (#4438, audit des conversations réelles) — en FIN de liste (GA-08).
  // RENVERSE #2269.16 (« la suite se PROPOSE, elle ne part jamais toute seule ») : Laura va au bout.
  'c126_laura_agit_va_au_bout_parle_peu',
  // DÉCISION LOUIS 22/10/2026 (#4286.15, suite de #4268.1) — en FIN de liste (GA-08).
  // ÉLARGIT c92/c94 : des TENDANCES de marché entre espaces, en agrégats sur jetons fermés, k >= 3.
  'c127_market_pattern_tendances_entre_espaces',
  // DÉCISION LOUIS 22/10/2026 (Théo M2) — en FIN de liste (GA-08). PRÉCISE c82, ne la renverse pas.
  'c128_envoi_programme_geste_du_commercial',
  // DÉCISION LOUIS 22/10/2026 (maquettes Théo V22, QCM C/D) — en FIN de liste (GA-08).
  // RENVERSE c122 côté NAVIGATION : trois onglets (À traiter · Séquences · Automatisations), moteur commun gardé.
  'c129_actions_trois_onglets_theo',
  // DÉCISION LOUIS 22/10/2026 (QCM C/D, Théo C) — en FIN de liste (GA-08).
  // RENVERSE c122 côté NAVIGATION : Actions a de nouveau TROIS onglets.
  'c130_actions_trois_onglets_automatisations_theo',
  // DÉCISION LOUIS 22/10/2026 (QCM C/D, Théo C) — en FIN de liste (GA-08).
  // RENVERSE c74 : une séquence a une VRAIE audience multi-contacts.
  'c131_sequence_audience_multi_contacts',
  // DÉCISION LOUIS 22/10/2026 (Théo C) — en FIN de liste (GA-08).
  'c140_recrutement_personne_independant_des_presentations',
  // DÉCISION LOUIS 22/10/2026 (Théo C) — en FIN de liste (GA-08). RENVERSE EN PARTIE #4335.2 (libellé « Signé »).
  'c141_pipe_cinq_colonnes_de_theo_correspondance_ecrite',
  // RÈGLE ÉCRITE 23/10/2026 (#4433.5, recette prod) — en FIN de liste (GA-08). PRÉCISE #4433 (paliers), ne renverse rien.
  'c133_paliers_d_elargissement_exact_d_abord',
  // DÉCISION LOUIS 22/10/2026 (épopée #4468) — en FIN de liste (GA-08).
  // RENVERSE l'affichage des coûts en crédits, la modale à 80 % et la recharge.
  'c132_credits_implicites',
  // DÉCISION LOUIS 26/10/2026 (#4603) — en FIN de liste (GA-08).
  // RENVERSE c37 pour UN cas : la paire compte-CRM ↔ compte-analyse (même société) se fusionne SANS DEMANDER.
  'c142_fusion_auto_compte_crm_compte_analyse',
  // DÉCISION LOUIS 27/10/2026 (#4433, règle FINALE de la zone) — en FIN de liste (GA-08).
  // RENVERSE l'arrêt à la région de #4640 (27/10 matin) et #4429 (25/10), donc #4419 et les 25 km de #4515.
  'c143_zone_100km_puis_paliers_jusqu_a_la_france',
  // DÉCISION LOUIS 27/10/2026 AU SOIR (#4640, ratifié) — en FIN de liste (GA-08). RENVERSE c143, livrée le matin même.
  'c144_zone_automatique_s_arrete_a_la_region',
  // DÉCISION LOUIS 28/10/2026 (#4761, épopée #4762) — en FIN de liste (GA-08). RENVERSE #4307 (19/10/2026).
  'c145_historique_stocke_se_lit_sans_credit',
  // RÈGLE ÉCRITE 29/10/2026 (Louis, six lots mesurés en une matinée) — en FIN de liste (GA-08). Ne renverse rien :
  // elle NOMME ce que « fini » veut dire, dit partout comme un reproche et jamais écrit comme une règle.
  'c146_un_lot_n_est_fini_que_quand_son_appelant_existe',
  // DÉCISION LOUIS 31/10/2026 (#4714) — en FIN de liste (GA-08). Ne renverse rien : NOMME l'exception que le code
  // tenait déjà (`crm-sync.service.ts`) à « une écriture CRM/ERP passe par une porte » (#4186).
  'c147_synchro_crm_remplit_un_champ_vide_jamais_n_ecrase',
  // DÉCISION LOUIS 02/11/2026 (lot 775) — en FIN de liste (GA-08). RENVERSE EN PARTIE GA-352 et le refus écrit en tête
  // de `market-memory-import.ts` : les parcours individuels entrent, sans identifiant direct.
  'c148_marche_toute_la_donnee_sauf_l_identite_directe',
] as const
export const doctrineKeySchema = z.enum(DOCTRINE_KEYS)
export type DoctrineKey = (typeof DOCTRINE_KEYS)[number]

/** L'état de la RÈGLE dans le code. Repris de `flow-registry.ts` : même échelle,
 *  elle ne doit pas diverger. `partial` désigne une règle qui tourne et produit
 *  quelque chose, mais pas ce que l'arbitrage décrit. */
export const DOCTRINE_CODE_STATES = ['implemented', 'partial', 'absent'] as const
export const doctrineCodeStateSchema = z.enum(DOCTRINE_CODE_STATES)
export type DoctrineCodeState = (typeof DOCTRINE_CODE_STATES)[number]

/**
 * Ce qui TIENT la règle.
 *
 *  - `guarded` — un test tomberait si on la cassait. C'est le seul niveau qui
 *    survit à un développeur pressé.
 *  - `held` — la règle est appliquée en un seul endroit du code, et rien ne la
 *    vérifie. Elle tient tant que personne ne touche à cet endroit.
 *  - `unenforced` — rien ne la tient. L'écart doit alors être NOMMÉ ; c'est le
 *    seul état dont l'absence d'explication est refusée.
 */
export const DOCTRINE_ENFORCEMENTS = ['guarded', 'held', 'unenforced'] as const
export const doctrineEnforcementSchema = z.enum(DOCTRINE_ENFORCEMENTS)
export type DoctrineEnforcement = (typeof DOCTRINE_ENFORCEMENTS)[number]

/** Les dix archives de l'itération 3. `null` quand la doctrine est close et que
 *  plus aucun paquet n'a à y revenir. */
export const ITERATION_PACKS = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09'] as const
export const iterationPackSchema = z.enum(ITERATION_PACKS)

export const doctrineEntrySchema = z.object({
  key: doctrineKeySchema,
  /** Le thème, tel que le registre du 24/08 le nomme. Sert à retrouver
   *  l'arbitrage d'origine, jamais à raisonner. */
  theme: z.string().min(1),
  /** La règle canonique. Une phrase, à la forme affirmative, telle qu'on la
   *  citerait à quelqu'un qui propose le contraire. */
  canonical: z.string().min(1),
  /** L'ancienne formulation, désormais morte. Conservée pour l'audit : sans
   *  elle, on ne sait pas ce que l'arbitrage a écarté, et le débat rouvre. */
  supersedes: z.string().min(1),
  codeState: doctrineCodeStateSchema,
  enforcement: doctrineEnforcementSchema,
  /** Les fichiers qui PORTENT la règle, en chemins relatifs à la racine du
   *  dépôt. Vérifiés à l'exécution du test : un chemin qui n'existe pas fait
   *  échouer la CI. Vide pour une règle ABSENTE — déclarer un porteur pour du
   *  code qui n'existe pas est la pire ligne possible. */
  holders: z.array(z.string().min(1)),
  /** L'écart entre l'arbitrage et le code. `null` seulement quand il n'y en a
   *  pas — jamais une phrase de remplissage. */
  gap: z.string().min(1).nullable(),
  /** L'archive de l'itération 3 qui porte le reste. `null` = rien ne reste. */
  nextPack: iterationPackSchema.nullable(),
})
export type DoctrineEntry = z.infer<typeof doctrineEntrySchema>

export const DOCTRINE_REGISTRY: readonly DoctrineEntry[] = [
  {
    key: 'c01_navigation',
    theme: 'Navigation',
    canonical:
      'Neuf domaines racine, et pas dix. Une fonction historique redevient une sous-page ou une capacité, jamais une entrée racine de plus.',
    supersedes:
      'Les entrées racine Besoins, Veille, Découvrir et Équipe, héritées des itérations où chaque fonctionnalité réclamait sa place dans la barre latérale.',
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: ['apps/web/src/components/navigation/sections.ts', 'apps/web/src/components/navigation/sections.test.ts'],
    gap: 'Le registre du 24/08 appelle le 7ᵉ domaine « Copilote » ; le libellé affiché est « Laura » depuis D82. Seule la CLÉ interne est restée `copilot` — la renommer casserait les préférences de démarrage enregistrées.',
    nextPack: null,
  },
  {
    key: 'c02_laura_copilote',
    theme: 'Laura / Copilote',
    canonical:
      "Laura et le Copilote sont deux SURFACES d'un même moteur. Laura ne crée jamais une seconde vérité agentique, et la route conversationnelle ne disparaît pas.",
    supersedes: 'Les itérations où Laura remplaçait le Copilote, ou devenait une page autonome avec sa propre mémoire.',
    codeState: 'partial',
    enforcement: 'held',
    holders: ['apps/web/src/features/laura/LauraCard.tsx', 'apps/api/src/modules/laura/laura-detector.spec.ts'],
    gap: 'Laura Produit est une carte PROACTIVE — un `POST /laura/plan` par écran, rien de rendu quand elle se tait — et non un tiroir conversationnel omniprésent. Huit détecteurs sur trente ; les vingt-deux autres supposent des mesures que le dépôt ne fait pas.',
    nextPack: '03',
  },
  {
    key: 'c03_laura_site',
    theme: 'Laura Site',
    canonical:
      'Aucune adresse interne ne sort de Laura Site, ni dans le texte, ni dans un champ structuré. Toute régression sur ce point est P0.',
    supersedes: "Le widget passif sans avatar, dont le message d'échec de transmission révélait l'adresse de l'équipe.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/website/src/features/chatbot/lib/guardrails.ts',
      'apps/website/src/features/chatbot/lib/guardrails.test.ts',
      'apps/website/src/features/chatbot/lib/golden-conversations.test.ts',
    ],
    gap: "Le jeu de conversations de référence tourne HORS LIGNE. Le rejeu live (`CHATBOT_GOLDEN_LIVE=1`) reste opt-in : une clé de production dans les actions, vingt appels par poussée, et une garde qui rougit parce qu'un modèle a tourné sa phrase autrement finit désactivée.",
    nextPack: null,
  },
  {
    key: 'c04_objet_metier',
    theme: 'Objet métier',
    canonical:
      "`Project` est le pivot CRM→ATS→Mission. `opportunities` reste son stockage pour compatibilité, et aucune fonctionnalité ne crée un quatrième objet d'opportunité.",
    supersedes: 'Besoins, opportunités et projets employés comme trois objets concurrents, chacun avec sa narration.',
    codeState: 'implemented',
    enforcement: 'held',
    holders: ['packages/contracts/src/schemas/project.ts', 'packages/contracts/src/schemas/opportunity-ontology.ts'],
    gap: "Rien n'empêche MÉCANIQUEMENT un quatrième objet : la règle tient par relecture. Une garde la vérifierait mal — reconnaître « un objet d'opportunité » dans une migration demanderait de deviner l'intention.",
    nextPack: null,
  },
  {
    key: 'c05_secteur',
    theme: 'Secteur',
    canonical:
      "Le secteur d'application appartient au Projet et à la Mission. Le secteur du COMPTE reste une caractéristique corporate ; il sert de repli, et ce repli est DIT.",
    supersedes:
      'Le secteur porté uniquement par le compte, qui obligeait un grand groupe à avoir un secteur unique alors que ses projets en couvrent plusieurs.',
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/database/entities/project.entity.ts',
      'apps/api/src/database/entities/mission.entity.ts',
      'apps/api/src/modules/consultants/matching/axes.ts',
      'apps/api/src/modules/consultants/matching/sector-axis.spec.ts',
    ],
    gap: "Le repli sur le secteur du compte reste ce qui s'affiche tant qu'aucun secteur n'a été saisi sur le projet. Il est NOMMÉ dans le détail de l'axe (« secteur du compte, la demande n'en précise aucun ») plutôt que tu : un repli silencieux ferait croire à une correspondance sectorielle qui n'a pas été vérifiée.",
    nextPack: null,
  },
  {
    key: 'c06_multi_domaines',
    theme: 'Multi-domaines',
    canonical:
      "Soixante-six domaines, aucune présélection IT silencieuse. Le portefeuille du vendeur voyage jusqu'aux prompts par UN point — l'append au `domain_brief` — et jamais recopié dans huit prompts divergents.",
    supersedes:
      '`esn_it` par défaut, sept domaines, et des prompts qui présumaient un acheteur informatique quel que soit le métier du vendeur.',
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/offer-portfolio.ts',
      'packages/contracts/src/schemas/offer-portfolio.test.ts',
      'apps/ia/app/services/domain_focus.py',
      'apps/ia/app/services/portfolio_context.py',
      'apps/ia/tests/test_domain_focus_user_prompts.py',
    ],
    gap: "Aucun service DÉTERMINISTE ne lit le portefeuille : le scoring, les entités et la priorisation ne voient que le booléen dérivé `offerDomain == industrial_engineering`. Le web n'a aucun équivalent de `domain_focus` — « Enjeux IT » est une chaîne i18n statique dans cinq fichiers. Quatre des huit packs d'offre sont des ÉCHAFAUDAGES vides (`supply_chain`, `product_design`, `pmo`, `rh`), et les clés de contrat `itChallenges` / `itAutonomy` / `it_implications_for_esn` traversent l'API et le front sous leur nom IT.",
    nextPack: '06',
  },
  {
    key: 'c07_discover_scoring',
    theme: 'Discover scoring',
    canonical:
      "Le bloc de vingt points « surface » est piloté par le portefeuille du vendeur. Et l'ordre compte : on dé-silote les SOURCES avant de personnaliser le barème.",
    supersedes:
      'Un bloc fixe « Surface informatique » de vingt points, identique pour une société de conseil en ingénierie et pour une ESN.',
    codeState: 'absent',
    enforcement: 'unenforced',
    holders: [],
    gap: "`_MAX_IT_SURFACE = 20` est intact, ainsi que ses quatre points fixes et ses deux seuils d'effectif. Seuls les LIBELLÉS basculent, via `is_industrial_seller`, qui ne lit qu'un booléen dérivé. Aucun point, aucun seuil, aucun plafond ne dépend du vendeur. Renommer le bloc sans dé-siloter les sources ROME/CPV produirait un barème qui ment.",
    nextPack: '06',
  },
  {
    key: 'c08_dataforge',
    theme: 'DATAFORGE',
    canonical:
      "V10 est un PRIOR, jamais un oracle. Un Tier D reste interne, et aucun prior n'atteint l'écran d'un commercial, où il se lirait comme un fait.",
    supersedes:
      "V9 et ses trente-deux marchés, dont le score d'opportunité se lisait trop facilement comme une vérité sur le compte.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/architecture/dataforge-priors-stay-internal.spec.ts',
      'apps/api/src/modules/dataforge/dataforge.service.ts',
    ],
    gap: "`priorsForSiren` n'a AUCUN consommateur de production, et c'est délibéré : GA-37 tient la règle par une garde d'architecture plutôt que par un guard d'exécution que rien n'appellerait. Le « Tier D interne uniquement » de la règle d'ingestion est tenu par la MÊME garde : elle refuse qu'un contrôleur UTILISATEUR injecte le service, et n'excuse que ceux qui portent `InternalSecretGuard`.",
    nextPack: '06',
  },
  {
    key: 'c09_procurement',
    theme: "Route d'achat",
    canonical:
      "La route d'achat V10 est un SEED de recherche au niveau du compte. Elle n'est jamais une preuve qu'un domaine précis passe par cette route.",
    supersedes:
      "Une route achats héritée du compte ou du groupe et présentée comme vérifiée, alors qu'elle est identique sur les soixante-six domaines de chacun des 1 195 comptes.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/architecture/dataforge-priors-stay-internal.spec.ts',
      'apps/api/src/database/entities/dataforge-account.entity.ts',
    ],
    gap: "L'evidence compte × domaine que l'arbitrage appelle de ses vœux n'existe dans AUCUNE table. `dataforge_account_domains` porte bien `evidence_tier`, mais c'est le pack lui-même — du staging non vérifié, à 97,5 % en Tier D.",
    nextPack: '06',
  },
  {
    key: 'c10_compte_site',
    theme: 'Compte / site',
    canonical:
      "La taille du compte reste, mais c'est le SITE qui décide : son type, son effectif, et la CONFIANCE qu'on accorde à cet effectif. Un petit site d'un grand groupe peut être hors sujet.",
    supersedes: "La taille du groupe — ou l'effectif France — comme critère principal de pertinence.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/site-fit.ts',
      'packages/contracts/src/schemas/site-fit.test.ts',
      'apps/api/src/database/entities/site.entity.ts',
      'apps/api/src/modules/account-entities/account-entities.service.ts',
    ],
    gap: "La table `sites` n'a AUCUN appelant web : l'onglet Sites lit `raw_analysis.sitesFrance`, pas la table. Les colonnes sont donc écrivables par l'API et par rien d'autre.",
    nextPack: '01',
  },
  {
    key: 'c11_contacts',
    theme: 'Contacts',
    canonical:
      "Les personas d'achat dépendent du domaine. En ingénierie, le bureau d'études, la direction technique, les méthodes et la qualité passent AVANT les ressources humaines et les achats.",
    supersedes: 'Une grille unique DSI / Data / RH / Achats / C-level, appliquée quel que soit le métier vendu.',
    codeState: 'partial',
    enforcement: 'unenforced',
    holders: ['apps/ia/app/services/decision_role.py', 'apps/ia/app/services/contact_priority_score.py'],
    gap: "`decision_role.py` porte une chaîne de décision industrielle depuis l'addendum Stelya, mais `_IT_DECIDER_PATTERNS` et les familles de rôles de `bellum_contacts` restent écrites en dur, hors lentille. Aucun registre de familles de rôles pour les soixante-six domaines, et AUCUN jeu de référence non-IT — c'est la seule preuve qui dirait qu'un vendeur industriel obtient d'autres personnes.",
    nextPack: '06',
  },
  {
    key: 'c12_organigramme',
    theme: 'Organigramme',
    // ⚠️ PÉRIMÉE puis réécrite le 30/08/2026. L'ancien `canonical` (« trois
    // objets distincts ») datait d'avant le chantier OrgGraph FINAL du
    // 27/08/2026 et ne recouvrait AUCUN des huit refus, trois alternatives
    // écartées ou douze POURQUOI que ce chantier a posés — alors que `holders`
    // citait déjà les mêmes fichiers. Trouvé par
    // `agent_docs/recomptages/ORGGRAPH-croisement-08-items-177-184-257-272.md`
    // (« Les défauts trouvés en chemin »), qui note que le registre existait,
    // simplement pas mis à jour pour ce chantier-ci. Ce qui a changé : le
    // `canonical` porte désormais le PRINCIPE du FINAL (« qui dépend de qui »,
    // quatre vues, hauteur ≠ rôle) au lieu de la formulation « trois objets »
    // d'avant, le `supersedes` nomme la synthèse à deux sources qui a produit
    // ce FINAL, et le `gap` cite le point de vigilance RÉEL et daté (D275) au
    // lieu d'une affirmation sur le ciblage par domaine qui n'a pas été
    // reverifiée pour ce chantier — mieux vaut l'omettre que la répéter sans
    // preuve fraîche.
    canonical:
      "Un organigramme montre d'abord QUI DÉPEND DE QUI (OrgGraph FINAL, 27/08/2026) : la hauteur d'une carte vient du niveau hiérarchique (L0-L4), jamais du rôle commercial, qui vit à part dans un badge posé sur la carte. Quatre vues INDÉPENDANTES portent le graphe — organigramme vérifié (`hierarchyEdges` prouvés), carte d'influence, comité d'achat, chemin recommandé — et l'écran quotidien n'en montre qu'une, focalisée sur UNE direction, jamais le Groupe entier ni une vue système en home. Une preuve d'IDENTITÉ ne prouve jamais une RELATION : la seule source d'un `reports_to` est une preuve de relation, disjointe de la preuve d'appartenance à une entité.",
    supersedes:
      "Deux formulations mortes. (1) La version antérieure au 27/08 : « trois objets distincts — l'organigramme vérifié, le comité d'achat, le graphe d'accès ». (2) Le FINAL du 27/08 lui-même n'est PAS la victoire d'une spec sur l'autre : c'est la synthèse arbitrée de deux itérations concurrentes — celle de Théo, meilleure sur l'UX (la vue focale, le tableau du bas, le verdict en une phrase), et celle de ChatGPT, meilleure sur l'architecture (le grounding cross-entity, le versionnage optimiste, les axes de temporalité). Aucune des deux n'a gagné seule ; le FINAL retient l'UX de l'une et l'architecture de l'autre, point par point (`agent_docs/orggraph-final-2026-08-29.md:11`).",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/org-graph.ts',
      'apps/ia/app/services/org_graph_assembler.py',
      'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/focalOrgData.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/FocalOrgView.tsx',
      'apps/api/src/modules/org-graph/org-graph-verify.ts',
      'apps/api/src/modules/org-graph/org-graph-golden.spec.ts',
      'apps/ia/tests/test_org_claim_gate.py',
    ],
    gap: "Un point de vigilance TRACKÉ, pas fermé — déjà nommé D275 (`agent_docs/orggraph-final-2026-08-29.md` §4 ter) : `OrgStructureSection` affiche encore `organigramme` / `decisionChain` / `stakeholderMap` (`_LEGACY_KEYS`, `apps/ia/app/services/org_graph_build.py:28`), recopiés VERBATIM du modèle, sans resolver, sans grounding et sans claim — un second AFFICHAGE non sourcé qui coexiste avec le nouveau graphe typé. Ce n'est PAS un second MOTEUR de calcul (un seul assembleur, `org_graph_assembler.py`, calcule la structure — le refus « deux moteurs parallèles » tient), mais c'est exactement la zone que ce refus vise à faire disparaître une fois la migration finie, et elle ne l'est pas encore : retirer l'ancien rendu sans lui donner sa propre logique de grounding est ce qui referme ce point.",
    nextPack: null,
  },
  {
    key: 'c13_plan_de_compte',
    theme: 'Plan de compte',
    canonical:
      "Bellum PRÉPARE le plan — entité, barrière, premier mouvement, contacts, séquence — depuis les preuves et le graphe d'accès. L'utilisateur valide ; il ne remplit pas une page vide.",
    supersedes: 'Une page de plan de compte manuelle, que le commercial devait renseigner lui-même champ par champ.',
    codeState: 'partial',
    enforcement: 'held',
    holders: ['packages/contracts/src/schemas/first-move.ts', 'packages/contracts/src/schemas/access.ts'],
    gap: "Le plan LITE existe (classement d'entités, premier mouvement, effort, actions). Le plan complet, conscient du domaine et de la mission, n'existe pas.",
    nextPack: '05',
  },
  {
    key: 'c14_automatisation',
    theme: 'Automatisation',
    canonical:
      "Planifier → simuler → approuver → exécuter → VÉRIFIER, et un délai dépassé n'est jamais un succès : la seule question est de savoir si la requête a pu PARTIR. ⚠️⚠️ RENVERSEMENT DATÉ DU 11/10/2026 (décision Louis, épopée #4016, lot L6) de « aucune autonomie globale » : (1) Action OS N4/N5 AUTONOME — un espace qui choisit N4 (borné) ou N5 (étendu) voit ses actions INTERNES partir sans clic, dépense de crédits comprise ; les seuils de volume et de dépense se règlent par l'admin jusqu'à « sans plafond » ; (2) PIPE « DÉTECTÉ, À REVOIR » — Bellum écrit seul, dans le pipe, le passage qu'un signal fort rend probable (intérêt → affaire, shortlist → positionnement, entretien → mission) ; le confirmer reste un clic, et une mission ne naît jamais d'un clic de confirmation (#2320.21). CE QUI NE BOUGE PAS : une écriture dans l'outil du CLIENT (CRM, boîte) garde un go explicite de l'utilisateur à TOUTE posture (`writesIntoClientTool`, plancher N2), un envoi vers l'extérieur aussi (`reachesOutsideProduct`).",
    supersedes:
      "« Aucune autonomie globale » (règle tenue jusqu'au 10/10/2026 : toute action payante demandait un clic, les seuils plafonnaient à 1 000 cibles et 10 000 crédits, et aucune transition commerciale ne se déduisait d'un signal — #2320.22, #2377.8, #2320.3). Et avant elle, les deux extrêmes symétriques — « Bellum n'agit jamais » et « Bellum doit tout automatiser » — dont aucun ne définissait ce qui se passe en cas d'échec.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/dispatch-failure.ts',
      'packages/contracts/src/schemas/workflow-outcomes.ts',
      'apps/api/src/modules/wired-write-paths.spec.ts',
      // #4016 L6 — l'autonomie N4/N5, le plancher CRM, le pipe « détecté ».
      'apps/api/src/modules/action-os/approval-policy.spec.ts',
      'apps/api/src/modules/pipeline-detections/pipeline-detections.service.spec.ts',
      'apps/api/src/architecture/project-creation-is-a-human-gesture.spec.ts',
    ],
    gap: "La capacité RÉELLE de chaque connecteur reste à recetter un par un : le catalogue dit ce qu'une automatisation ferait, pas ce que le jeton accordé permet aujourd'hui.",
    nextPack: '04',
  },
  {
    key: 'c15_integrations',
    theme: 'Intégrations',
    canonical:
      "« Connecté » n'est pas « lecture vérifiée ». L'interface et le copilote ne promettent que la capacité PROUVÉE par une lecture réelle et datée.",
    supersedes:
      'Le badge « connecté » traité comme une preuve de fonctionnement — un agenda affiché « opérationnel » alors que son API était éteinte depuis des semaines.',
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/tool-registry.ts',
      'packages/contracts/src/schemas/connector-error.ts',
      'apps/api/src/architecture/qualified-empty-lists.spec.ts',
    ],
    gap: "Deux écarts, et le second est le coûteux. (1) Le registre du 24/08 nomme six états (`connected`, `read_verified`, `repair_required`…) que le dépôt n'a pas : il en a DIX, dont `untested`, qui modélise l'inverse de `read_verified`, et où la réparation est une ACTION et non un état — on ne renomme rien, la table de correspondance vit dans le tracker. (2) L'arbitrage demande une RECETTE lecture/écriture connecteur par connecteur, pas une nomenclature : le modèle SAIT dire `untested`, et personne n'a encore prouvé le contraire connecteur par connecteur.",
    nextPack: '04',
  },
  {
    key: 'c16_crm_overlay',
    theme: 'CRM / ATS tiers',
    canonical:
      "Coexistence d'abord : import, correspondance, écriture gouvernée et migration réversible. On ne vend pas « remplace Boond » tant que la profondeur n'est pas prouvée en production.",
    supersedes:
      "L'ambition de remplacement rapide du CRM et de l'ERP du client, portée par la largeur des écrans livrés plutôt que par leur maturité.",
    codeState: 'implemented',
    enforcement: 'held',
    holders: ['apps/api/src/modules/crm/outbound-write.service.ts', 'apps/api/src/modules/ats/ats-write.service.ts'],
    gap: "C'est d'abord un positionnement commercial, qu'aucun test ne peut attraper. Ce qui l'incarne techniquement est la LECTURE SEULE de l'ERP et l'écriture CRM gouvernée — les deux fichiers ci-dessus. ⚠️ Une mesure du 28/08 a conclu que « on coexiste avec l'outil de delivery, on ne le remplace pas » n'était écrit NULLE PART : c'est faux, cette entrée le porte, et la mesure cherchait le mot « coexiste » plutôt que la règle. La formulation de la source, à citer telle quelle quand la question revient : « Un remplacement de l'outil de delivery en place : il est moins cher et couvre plus. On coexiste » (PDF-02:400-402, §6 des refus). L'argument est ÉCONOMIQUE, et c'est celui qui manquait ici — l'outil en place coûte moins et fait plus ; vendre son remplacement se retourne à la première comparaison de factures.",
    nextPack: null,
  },
  {
    key: 'c17_facturation',
    theme: 'Facturation',
    canonical:
      "Bellum s'arrête à la PRÉPARATION de la facturation et à son export. Aucune facture légale, aucune comptabilité, aucune paie.",
    supersedes:
      'Les récits où Bellum émettait la facture, ce qui aurait engagé sa responsabilité comptable et fiscale chez le client.',
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/invoice-readiness.ts',
      'packages/contracts/src/schemas/invoice-readiness.test.ts',
      'apps/api/src/modules/delivery/readiness-export.ts',
      'apps/api/src/modules/delivery/readiness-export.spec.ts',
    ],
    // ⚠️ Une DATE, ajoutée le 25/08 en lisant la source du PDF 5 (`pdf5.md:687`,
    // décision D26). Elle ne renverse pas le refus — elle l'encadre, et sans
    // elle le refus se relirait dans six mois comme un oubli.
    gap: "La source du PDF 5 date l'obligation française de RÉCEPTION de la facture électronique au **01/09/2026**, soit sept jours après cet arbitrage. Elle ne s'impose pas à Bellum, qui n'émet rien : elle s'impose aux ESN clientes, qui passeront par une plateforme agréée. Le refus tient donc — mais quiconque le relit doit voir que la date était CONNUE et pesée, pas ignorée. Ce qui reste à surveiller : si un client demande que l'export « prêt à facturer » alimente sa plateforme agréée, c'est un connecteur, pas une émission de facture, et ça ne renverse toujours pas c17.",
    nextPack: null,
  },
  {
    key: 'c18_manager',
    theme: 'Pilotage',
    canonical:
      'Chaque chiffre montré à un responsable doit déboucher sur une INTERVENTION. Aucun retour sur investissement inventé, et un indicateur sans dénominateur vaut `null`.',
    supersedes:
      'Un tableau de bord de KPI et de ROI, avec partage horizontal entre commerciaux, qui se regarde et ne se décide pas.',
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/manager-kpi.ts',
      'packages/contracts/src/schemas/manager-kpi.test.ts',
      'packages/contracts/src/schemas/measurability.ts',
    ],
    // ⚠️ Le compte est écrit en CHIFFRES et non en lettres, contrairement au
    // reste de la prose de ce registre, et c'est délibéré : c'est la seule
    // affirmation de tout le fichier qu'une machine puisse vérifier, et
    // « huit » ne se vérifie pas sans inventer un lecteur de numéraux français.
    // `doctrine-registry.test.ts` recompte sur `MANAGER_KPIS` et tombe si le
    // catalogue bouge sans que cette ligne bouge.
    gap: "13 des 64 indicateurs du dictionnaire restent `measurable: false` avec leur raison écrite — c'est voulu, mais cela veut dire qu'un cinquième du cockpit ne se calcule pas encore. ⚠️ Cette ligne annonçait QUATORZE, soit « le quart du cockpit », jusqu'au recomptage du 29/08/2026 : six de trop, dans un registre qu'on lit pour ne PAS rouvrir un débat. Le compte n'est plus laissé à la mémoire de qui l'écrit. Il est remonté à 11 sur 62 le même jour, et pas parce que le produit a régressé : DEUX indicateurs se déclaraient mesurables sans qu'aucun code ne les calcule (« CRA reçus à temps » — rien n'horodate le dépôt d'un relevé ; « durée d'intercontrat » — aucune médiane n'existe), et DEUX indicateurs du PDF 5 §13.3 manquaient au dictionnaire, dont le taux de renouvellement. Le 28/09/2026 (BEL-SC-242, #3271.2) : 12 sur 63 — un indicateur NEUF, « concentration sur le premier compte », déclaré `pending()` plutôt que deviné, le CA produit n'étant agrégé qu'au niveau de l'espace, pas encore par compte. Le 30/09/2026 (beta-feedback #3415.1, lot C14) : 13 sur 64 — un second NEUF, « croissance du CA produit », même raison : aucune photo mensuelle par espace n'existe encore pour comparer deux périodes. Un catalogue qui promet plus qu'il ne tient est pire qu'un catalogue court.",
    nextPack: null,
  },
  {
    key: 'c19_vocabulaire',
    theme: 'Vocabulaire',
    canonical:
      "Le lexique suit le portefeuille du vendeur. Pour les outils, l'axe est À QUI APPARTIENT L'OUTIL (D354, étendu à l'application par la décision de Louis du 13/09/2026, batch 11) : l'outil que l'espace a LUI-MÊME branché se nomme et se montre là où c'est utile — son nom arrive par injection depuis les connexions de l'espace, jamais écrit en dur ; un outil non connecté ne se nomme pas, on nomme la CAPACITÉ ; NOTRE fournisseur ne se nomme nulle part, ni à l'écran, ni dans un prompt, ni sur le site ; un registre public se nomme sur le site, parce que c'est une provenance et non une intégration.",
    supersedes:
      "Le jargon ESN unique — « régie », « vendre des consultants », « besoins » — et l'affichage des fournisseurs techniques dans l'interface. Puis, du 02/08 au 13/09/2026 : « aucun nom d'éditeur côté application, seule exception Réglages › Intégrations », qui taisait aussi l'outil du client et obligeait à écrire « brouillon déposé dans ta messagerie » à qui en a deux.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/i18n/lexicon.test.ts',
      'apps/ia/tests/test_copilote_prompt_blocks.py',
      // La moitié « interface », livrée par D17 le 28/08 — déclarée ici pour
      // que GA-38 l'ouvre : le jour où l'écran disparaît, le registre le voit
      // au lieu de continuer à promettre.
      'apps/web/src/routes/settings/lexicon.tsx',
      'apps/web/src/i18n/workspace-lexicon.ts',
      'apps/web/src/i18n/workspace-lexicon.test.ts',
      // La frontière du SITE (D354), gardée par GA-124 / GA-125.
      'apps/website/src/published-third-party-names.test.ts',
      // #1912.11 — la même frontière dans l'APP (décision 13/09/2026, batch 11) :
      // les deux listes à un seul endroit, la dérivation, et les gardes qui la lisent.
      'packages/contracts/src/schemas/tool-naming.ts',
      'packages/contracts/src/schemas/tool-naming.test.ts',
      'apps/web/src/architecture/no-vendor-names-in-app.test.ts',
      'apps/api/src/modules/tool-registry/tool-capability-digest.spec.ts',
      // GA-339 — le troisième chemin, celui qu'aucune des deux gardes ci-dessus
      // ne voit : le nom qui arrive par le RÉSEAU. `GET /api/tool-registry` rend
      // les 47 outils avec leur `display_name`, dont les douze qui sont NOS
      // fournisseurs ; un `.map(t => t.display_name)` écrit un jour suffirait.
      // Le champ ne se lit nulle part hors Réglages › Intégrations.
      'apps/web/src/architecture/un-ecran-ne-lit-pas-le-libelle-du-registre.test.ts',
      // GA-340 (16/09/2026) — la garde du DÉTECTEUR lui-même. Les cinq gardes
      // ci-dessus lisent toutes `supplierNamesIn` : aveugle sur un libellé, il
      // les rend toutes les cinq vertes sur un texte fautif. Mesuré ce jour-là
      // sur « Hunter », le libellé réel du catalogue d'outils, que le contrat
      // ne portait que sous la forme « Hunter.io ».
      'apps/api/src/modules/tool-registry/supplier-labels-are-detected.spec.ts',
      // GA-341 (16/09/2026) — le back-office OPÉRATEUR est l'exception voulue
      // (ce n'est pas l'app, ni le site) : il nomme les sept fournisseurs de la
      // cascade d'enrichissement, mais un seul registre est autorisé à le
      // faire (`PROVIDER_LABEL`), ses clés sont liées au contrat, et un second
      // registre ailleurs se voit — trouvé en l'écrivant, sur `cockpit-panel.tsx`.
      'apps/dashboard-manager/src/architecture/fournisseur-nomme-au-registre-autorise.test.ts',
    ],
    gap: "La moitié « pas de nom d'éditeur » est gardée. ⚠️ Cette ligne affirmait, jusqu'au 29/08/2026, que la moitié « lexique » N'EXISTAIT PAS et que « les libellés du web sont des chaînes i18n statiques » : c'est FAUX depuis D17 (28/08). `/settings/lexicon` laisse un espace nommer chaque objet du produit, `applyWorkspaceLexicon` réécrit le magasin i18next par `addResourceBundle`, et `WorkspaceLexiconGate` est monté dans `App.tsx` — les libellés d'objet suivent les mots de l'équipe, sans rechargement. Ce qui reste ouvert est plus étroit, et c'est le mot « vertical » : le lexique est DÉCLARÉ par l'espace, jamais DÉRIVÉ de son portefeuille d'offre — `preferred_terms` / `forbidden_terms` descendent toujours dans le prompt seul (`seller_context.py`), et rien ne propose à une ESN les mots de son secteur. Borne assumée par ailleurs : le lexique remplace un libellé dont la valeur ENTIÈRE est le nom de l'objet, jamais un mot DANS une phrase — sinon « Aucun Affaire ne correspond ».",
    nextPack: '06',
  },
  {
    key: 'c20_matching',
    theme: 'Matching',
    canonical:
      'Douze axes déterministes, deux scores jamais fondus, et un axe non évaluable SORT du dénominateur au lieu de valoir zéro. Le contexte du projet et de la mission entre dans le calcul.',
    supersedes:
      'Un score unique dérivé du secteur du compte et des compétences déclarées, sans distinguer « ce profil colle » de « ce profil peut partir chez ce client ».',
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/consultants/matching/axes.ts',
      'apps/api/src/modules/consultants/matching/engine.spec.ts',
      'apps/api/src/modules/consultants/matching/sector-axis.spec.ts',
    ],
    gap: "Le contexte du SITE n'entre dans aucun axe : `siteFit` existe et vit à côté du moteur, sans lui être branché.",
    nextPack: '06',
  },
  {
    // ⚠️⚠️ #2613 (20/09/2026) — RENVERSEMENT PARTIEL, tranché par Louis, mot
    // pour mot : « la règle c'est on affiche pas ce qu'on a pas, on va pas
    // mettre non mesuré et tout ça, ça envoie juste un signal negatif à l'user
    // qui est pas utile ». Portée tranchée dans la foulée : partout dans les
    // LISTES, mais un SCORE garde ses axes.
    //
    // Ce qui bascule est l'AFFICHAGE d'une absence dans une liste, pas la
    // règle de donnée : `unknown` reste natif, aucune inférence de zéro, la
    // provenance reste par champ, une correction humaine gagne toujours. Un
    // registre qui n'enregistrerait pas ce renversement ferait exactement ce
    // que son docblock dénonce — décrire un produit qui n'existe plus.
    key: 'c21_donnees',
    theme: 'Données',
    canonical:
      "`unknown` est natif. Aucune inférence de zéro, provenance par champ, et une correction humaine n'est jamais écrasée par une réanalyse. " +
      "⚠️ RESTRICTION D'AFFICHAGE, 20/09/2026 (#2613, décision de Louis) : dans une LISTE, une carte, un bandeau ou un tableau, une valeur absente ne produit AUCUNE ligne — ni « non mesuré », ni « non su », ni « non renseigné ». On affiche ce qu'on sait. Ce qui n'est PAS touché : (a) une absence ne devient jamais « 0 », ni à l'écran ni dans un calcul — elle disparaît, elle ne se chiffre pas ; (b) un axe non évaluable sort toujours du dénominateur ; (c) sous un SCORE, l'énoncé des axes non évaluables RESTE, parce qu'un 45/70 dont on ignore ce qui a pu être pesé se lit comme un 45/70 complet — là, le silence ment.",
    supersedes:
      "La valeur absente assimilée à « faible » ou à zéro, et l'écrasement silencieux d'une correction par le passage suivant du pipeline. " +
      "Et, depuis le 20/09/2026, la seconde moitié de GA-18/GA-19 telle qu'elle valait pour TOUT le produit — « ce qui n'a pas pu être évalué est NOMMÉ » — qui ne vaut plus que sous un score.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/provenance.ts',
      'apps/web/src/architecture/display-primitives.test.ts',
      'apps/api/src/architecture/no-blind-record-writes.spec.ts',
      // #2613 — les deux moitiés du renversement, chacune tenue par sa garde :
      // l'absence qui disparaît dans une liste, et le score qui garde ses axes.
      'apps/web/src/architecture/une-absence-ne-fait-pas-une-ligne.test.ts',
      'apps/web/src/architecture/un-score-dit-ses-axes-non-evaluables.test.tsx',
    ],
    gap: "GA-18 et GA-19 sont des CLIQUETS, pas des interdits : trente-deux notes nues et quatre-vingt-sept `?? 0` subsistent dans les écrans. Ils ne peuvent que décroître. L'arbitrage demande d'étendre la règle aux nouveaux champs domaine/site/mission : côté SITE c'est fait (type, confiance, source et date d'observation de l'effectif), côté PROJET le secteur n'a pas de colonne de provenance — et n'en a pas besoin, son unique chemin d'écriture étant une saisie humaine. ⚠️ #2613 (20/09/2026) : la garde de LISTE tient le corpus sur lequel la décision a été prise — `features/discover/view` en entier, plus les fichiers `*Row`/`*Card`/`*Notice`/`*Table`/`*Band`/`*Banner` de `features/`. Les FICHES d'objet (dossier de compte, fiche consultant) sont HORS corpus, délibérément : là, un champ attendu resté muet laisse un libellé orphelin, et l'élargir est un arbitrage produit à demander, pas un élargissement de garde à décider seul. La garde ne peut pas non plus reconnaître un énoncé d'absence NEUF qu'aucune de ses clés ne nomme — elle interdit le retour de ceux qui ont été retirés, et le test de rendu de chaque écran tient le reste.",
    nextPack: null,
  },
  {
    key: 'c22_demo',
    theme: 'Démonstration',
    canonical:
      "La démonstration publique est SIMULÉE et étiquetée comme telle. Ce n'est pas une offre gratuite, et elle ne porte aucune fausse donnée sur un tiers réel.",
    supersedes:
      "L'essai gratuit sur comptes réels, où un prospect pouvait voir des informations fabriquées au nom d'une entreprise existante.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: ['apps/api/src/modules/demo/demo-coverage.ts', 'apps/api/src/modules/demo/demo-coverage.spec.ts'],
    gap: null,
    nextPack: null,
  },
  {
    key: 'c23_pricing',
    theme: 'Tarifs et crédits',
    canonical:
      'La grille embarquée dans le dépôt fait foi, et un crédit correspond à une action explicitement tarifée. On ne code jamais un tarif depuis un ancien PDF.',
    supersedes:
      'Trois grilles contradictoires (59/159/289, 119/259/599…) et le raccourci « un crédit = une recherche complète », qui ne correspondait à aucun débit réel.',
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/billing/shipped-plan-grid.ts',
      'packages/contracts/src/billing/shipped-plan-grid.test.ts',
    ],
    gap: null,
    nextPack: '07',
  },
  {
    key: 'c24_linkedin',
    theme: 'Réseau professionnel',
    canonical:
      "Aucun scraping, aucune automatisation non autorisée. Le commercial DÉCLARE ce qu'il a fait ; Bellum s'en souvient et calcule les relances.",
    supersedes:
      "Les demandes de connexion, d'enrichissement et de prospection automatisés sur le réseau — dont le compte banni aurait été celui de l'utilisateur.",
    codeState: 'implemented',
    enforcement: 'held',
    holders: [
      'apps/api/src/modules/linkedin/linkedin.service.ts',
      'apps/api/src/modules/linkedin/linkedin-follow-ups.ts',
    ],
    gap: "Aucune garde ne l'attrape, et c'est assumé : la règle tient parce qu'aucun client HTTP vers le réseau n'existe. Une garde posée aujourd'hui serait verte sur du vide, donc décorative.",
    nextPack: null,
  },
  {
    key: 'c25_observabilite',
    theme: 'Observabilité',
    canonical:
      'Langfuse complète Sentry et les journaux ; elle ne devient jamais une fonctionnalité client. Par défaut, aucun contenu de prompt ni de réponse ne sort.',
    supersedes:
      'Le débogage des agents par des journaux dispersés, où trois erreurs 500 du copilote successives ne laissaient aucune trace.',
    codeState: 'implemented',
    enforcement: 'held',
    holders: ['apps/ia/app/services/langfuse_client.py'],
    gap: "Quatre choses restent dues, et la deuxième est une question de données personnelles : tags normalisés, MASQUAGE des données personnelles, séparation dev/staging/prod, jeux d'évaluation. L'instrumentation couvre les appels au modèle, pas encore chaque fonctionnalité ni chaque agent.",
    nextPack: '03',
  },
  {
    // Ajoutée le 25/08 en croisant l'archive 02 : le refus le plus répété du
    // produit — six fois dans `CLAUDE.md` — n'avait aucune entrée ici, alors
    // que la source du PDF 2 le REDEMANDE nommément (`pdf2.md:436`, §7.7
    // « Le score de chance de closing », et D14 : « visible du commercial,
    // avec ses axes »). Un registre de contradictions qui omet la
    // contradiction la plus vive n'est pas un registre, c'est un florilège.
    // ⚠️ Élargie le 29/08 en croisant `passe-b-iteration-3/ARCHIVE-02.md`
    // (item 7). L'entrée du 25/08 ne parlait que du score AFFICHÉ, alors que la
    // source demande aussi un SCHÉMA : `pdf2.md:373` liste `closing_chance` +
    // `closing_chance_axes` comme colonnes d'un besoin, « 0-100 + jsonb,
    // calculé ». « Ne pas afficher » et « ne pas stocker » sont deux décisions ;
    // une seule était écrite, et c'est la seconde qui serait revenue par une
    // migration — sans contredire une seule ligne du registre.
    key: 'c26_probabilite',
    theme: 'Scoring',
    // ⚠️⚠️ RENVERSEMENT DATÉ — 11/10/2026, DÉCISION LOUIS (épopée #4016, lot L1).
    // La règle d'origine reste écrite APRÈS la nouvelle : un arbitrage effacé se
    // re-propose, un arbitrage renversé se lit.
    canonical:
      "⚠️ RENVERSEMENT DATÉ — 11/10/2026, DÉCISION LOUIS (épopée #4016, lot L1) : la PROBABILITÉ S'AFFICHE — CALIBRÉE et sous-tendue par ses axes, jamais NUE. Une probabilité de signature par affaire et le « CA probable du trimestre » (montant × probabilité, par devise, avec son intervalle) sont rendus sur `/projects` (`GET /projects/probable-quarter`). Cinq conditions, rendues structurelles par l'enveloppe `calibratedProbabilitySchema` (`packages/contracts/src/schemas/deal-probability.ts`) : (1) méthode NOMMÉE — `beta_binomial_stage_v1`, calibrée sur les issues RÉELLES des affaires closes de l'espace ayant atteint le stade, a priori Beta(1, 1) plus la base anonyme commune (≥ 3 espaces) bornée à 10 pseudo-observations ; (2) INTERVALLE crédible à 80 % affiché ; (3) AXES affichés avec leurs comptes, et les axes NON ÉVALUABLES nommés et sortis du dénominateur ; (4) « non mesuré » n'est jamais 0 — sous cinq observations, `null` et sa raison ; (5) aucun critère protégé (c58). La probabilité n'est toujours ni PERSISTÉE (calculée à la lecture — tranché sans Louis) ni EXPOSÉE nue : un champ qui la nomme n'est permis que porté par l'enveloppe. " +
      "RÈGLE D'ORIGINE, RENVERSÉE CI-DESSUS ET GARDÉE POUR ÊTRE LUE — " +
      "Aucun nombre rendu par le produit n'est une PROBABILITÉ PRÉDITE — et aucun champ PERSISTÉ ni EXPOSÉ ne porte ce nom. Un score dit ce qui a été évalué et sur quoi — une note sur un total, avec ses axes, et ce qui n'a pas pu l'être NOMMÉ. Ce qui n'est pas mesurable vaut `null`, jamais un pourcentage. Ni chance de signature, ni prévisionnel pondéré : un montant multiplié par une probabilité produit un chiffre qui n'existera jamais. " +
      "⚠️ PRÉCISION DATÉE — 21/09/2026, DÉCISION LOUIS (#2375.5), qui n'entame RIEN de ce qui précède et lève une ambiguïté que le refus, prononcé six fois, n'avait jamais tranchée : ce refus porte sur ce qui est AFFICHÉ et sur ce qui est PERSISTÉ, pas sur ce qui ORDONNE. Un calcul qui estime la chance d'obtenir une information a le droit de TRIER une liste de contacts ; aucun pourcentage, aucune jauge, aucune formule « x % de chances » ne paraît à l'écran, et ce qui s'affiche est la RAISON du rang (« a répondu deux fois », « poste exposé »), jamais le chiffre. " +
      "La frontière existait déjà dans le code, sans nom et sans garde : `rankAccountContacts` calcule quatre signaux qui ordonnent et ne voyagent pas — `rolePoints`, `reachPoints`, `measured`, `legacyPriority` —, déstructurés hors de la réponse juste avant qu'elle ne soit rendue. `reachPoints` EST cette estimation (adresse vérifiée 15, e-mail ou téléphone 11, profil 5, cherché sans rien trouver 0, jamais cherché `null`) : elle DÉPARTAGE (#2297.57) et elle ne note pas. GA-376 compare désormais les clés RENDUES à celles du contrat — supprimer cette ligne fait rougir la CI. " +
      "⚠️ Le second volet de la décision du 21/09 n'est pas ici mais dans `c58_criteres_proteges`, et il tenait déjà : aucun critère protégé ne pèse dans ce rang. Vérifié le 21/09/2026 — `contact-ranking.ts` est le noyau tenu le plus strictement du dépôt par GA-06 (identité, photo, adresse, localisation ET fuseau refusés), et le tri ne consomme que titre, entité, rôle de décision, coordonnées, source, statut, dates d'échange et d'enrichissement. " +
      "⚠️ EXCEPTION NOMMÉE ET DATÉE — 31/08/2026, arbitrage de Louis, portant UNIQUEMENT sur la carte « Laura vous recommande » de la fiche besoin (`/projects/needs/$needId`, image 02 du dossier du 26/08) : elle affiche un « taux de réussite estimé ». Ce n'est PAS une levée du refus — c'est le SEUL nombre du produit qui échappe à la règle ci-dessus, et il y échappe parce qu'il n'EST pas une probabilité prédite : c'est `submissionFunnel().acceptanceRate` (`packages/contracts/src/schemas/submission.ts`), un taux MESURÉ sur des positionnements déjà CLOS (`accepted`/(`accepted`+`rejected`), jamais de silence compté comme un refus, `null` sans dénominateur) — la fonction qui sert déjà l'entonnoir des positionnements, appelée telle quelle depuis `apps/web/src/features/projects/open-needs/model/need-recommendation.ts`, jamais recalculée. Aucun modèle prédictif n'a été ajouté ; aucune migration, entité ou clé de contrat n'a été créée pour ce nombre. Partout ailleurs dans le produit, le refus reste entier. " +
      "⚠️ EXCEPTION RETIRÉE — 01/10/2026 (#3486, Louis) : la carte affichait « 100 % » à côté d'« aucun profil au-dessus du seuil » ; le taux est ôté de l'écran, `need-recommendation.ts` supprimé. Plus AUCUN nombre du produit n'échappe à la règle.",
    supersedes:
      "⚠️ #2613 (20/09/2026) CONFIRME cette entrée au lieu de l'entamer : la décision de Louis « on affiche pas ce qu'on a pas » retire les énoncés d'absence des LISTES et s'arrête explicitement avant les scores — « un SCORE garde ses axes ». " +
      "Le « score de chance de closing » du PDF 2 §7.7 et sa décision D14, ses colonnes `closing_chance` + `closing_chance_axes` (`pdf2.md:373`, « 0-100 + jsonb, calculé ») et leur reprise au tableau de `pdf1.md:596`, le score de fit sur 5 du tome 5, le prévisionnel pondéré par une probabilité du PDF 5, et le score d'accessibilité présenté comme une chance d'entrer. Refusés six à neuf fois selon les comptes entre le 16/08 et le 23/08 — dont, la SEPTIÈME fois, le « Taux de réussite estimé : 72 % » de l'image 02 elle-même, jeté par la fiche de lecture du 26/08 (`PDF-22_Annexe_les-17-ecrans-cibles.txt`, écran 02 : « c'est une probabilité, refusée six fois »). C'est CE refus précis que Louis lève le 31/08/2026, nommément et seulement pour cette carte — voir `canonical`.",
    codeState: 'implemented',
    // GARDÉE depuis le 29/08 — sur le NOM, qui est décidable. L'écart ci-dessous
    // dit ce qui reste hors de portée d'une garde, et pourquoi — et, depuis le
    // 31/08, pourquoi l'exception ci-dessus ne l'affaiblit pas.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/architecture/no-persisted-probability.spec.ts',
      'apps/web/src/architecture/placement-laws.test.ts',
      // #2613 (20/09/2026) — le renversement « on affiche pas ce qu'on a pas »
      // s'arrête AVANT les scores, et cette garde tient l'arrêt : elle exige
      // qu'un score NOMME ses axes non évaluables (pas qu'il les compte), qu'un
      // score absent ne jette pas ses axes, et elle casse deux coupables
      // factices — un score nu, et un score qui se contente de compter.
      'apps/web/src/architecture/un-score-dit-ses-axes-non-evaluables.test.tsx',
      'packages/contracts/src/schemas/mission-scores.test.ts',
      'apps/api/src/modules/crm/lead-score.spec.ts',
      'apps/api/src/modules/consultants/matching/pushable.ts',
      'packages/contracts/src/schemas/account-score.ts',
      // L'exception du 31/08 : là où le taux mesuré est CALCULÉ, et où le
      // refus général reste écrit en tête de fichier pour qui viendrait
      // dupliquer ce calcul ailleurs.
      'apps/web/src/features/projects/open-needs/view/NeedDetailRecommendation.test.tsx',
      // La PRÉCISION du 21/09/2026 (#2375.5) : là où un signal d'ordre s'arrête,
      // et la garde qui compare les clés rendues à celles du contrat.
      'apps/api/src/modules/contacts/contact-ranking.ts',
      'apps/api/src/architecture/la-probabilite-trie-elle-ne-saffiche-pas.spec.ts',
      'apps/api/src/architecture/protected-criteria.spec.ts',
      // #4016 L1 (11/10/2026) — le renversement : l'enveloppe calibrée, son
      // calcul, sa route et la seule vue qui l'affiche.
      'packages/contracts/src/schemas/deal-probability.ts',
      'packages/contracts/src/schemas/deal-probability.test.ts',
      'apps/api/src/modules/projects/deal-probability.service.spec.ts',
      'apps/web/src/features/projects/probability/CalibratedProbabilityView.tsx',
      'apps/web/src/features/projects/probability/CalibratedProbabilityView.test.tsx',
    ],
    gap:
      "⚠️ 11/10/2026 (#4016 L1) — ce qui reste hors de portée après le renversement : le calibrage n'est pas encore MESURÉ a posteriori (aucun score de Brier ni courbe de fiabilité sur les affaires closes depuis l'affichage) ; la base commune ne porte pas le stade (son a priori est le taux global du segment, pas celui du stade) et INCLUT l'espace qui demande (bornée pour cette raison) ; une perdue dont le parcours n'a pas été journalisé ne compte qu'au premier stade. Les gardes tiennent la FORME (enveloppe, axes, intervalle, méthode), pas la JUSTESSE du chiffre. " +
      "Ce qui est gardé est le NOM, pas le SENS. GA-64 refuse tout champ de migration, colonne d'entité ou clé de contrat qui croise un mot de chance avec un mot d'affaire (`closing_chance`, `win_probability`, `chance_de_signature`) ou une pondération avec un montant (`weighted_forecast`) ; GA-26 refuse le libellé à l'écran. Aucune garde ne peut en revanche refuser une probabilité DÉGUISÉE : il faudrait reconnaître une sémantique dans un nombre, et « 0,72 » ne dit pas de lui-même s'il est une part ou une chance — un `fit_score` de 0 à 100 présenté comme une chance de signer passerait. Ce qui est tenu au-delà du nom est la forme : un score porte ses axes, un axe non évaluable sort du dénominateur, et l'absence rend `null` (GA-18, GA-19). ⚠️ L'exception du 31/08 ne touche AUCUN corpus que GA-64 lit — aucune migration, entité ou clé de contrat nommée d'un mot de chance n'a été ajoutée pour elle ; `acceptanceRate` est déjà le nom que le docblock de GA-64 cite en exemple LÉGITIME (« win_rate… un fait historique n'est pas une prédiction »). GA-64 reste donc pleinement protecteur partout ailleurs, et n'avait — et n'a toujours — RIEN à modifier pour cette carte.",
    nextPack: null,
  },
  {
    // Ajoutée le 26/08 en croisant le dossier du 26 août contre ses propres
    // sources du 21. La contradiction n'est pas entre deux paquets : elle est
    // DANS UN SEUL DOCUMENT. `PDF-14 §10` refuse « dériver une phase de travail
    // sur les besoins — créerait la seconde vérité de pipe qu'on interdit », et
    // `PDF-14 §4bis` liste cette même dérivation parmi les quatorze fonctions
    // pures à extraire. Deux ordres opposés, à huit sections d'écart, dans le
    // document que la série désigne comme « à lire avant d'ouvrir un ticket ».
    key: 'c27_phase_de_travail',
    theme: 'Besoins',
    canonical:
      "L'état d'un besoin est EN BASE, jamais dérivé. Un recruteur MET un besoin en veille, il ne le déduit pas — et une phase calculée à côté des onze états créerait deux vérités sur la même affaire, ce que le produit refuse depuis le board Missions (D2).",
    supersedes:
      "`PDF-14 §4bis` du 26/08, qui demande d'extraire une fonction pure « dérivation de la phase de travail — où en est un dossier », et la recommandation du PDF 9 du 19/08 de dériver les onze états au lieu de les stocker. Les deux sont refusés, et par la même raison.",
    codeState: 'implemented',
    // TENUE par le fait qu'elle n'a jamais été violée : `deriveWorkPhase`,
    // `derive_work_phase` et `workPhase` sont introuvables dans le dépôt
    // (mesuré le 26/08). Aucune garde n'est posée — la consigne de Louis est
    // de ne pas garder un terrain sans violation mesurée, et une garde qui
    // interdirait un symbole inexistant serait verte pour toujours.
    enforcement: 'held',
    holders: [
      'packages/contracts/src/schemas/project.ts',
      'packages/contracts/src/schemas/need-status.test.ts',
      'apps/api/src/migrations/1789534912778-NeedWorkStatuses.ts',
      'apps/api/src/database/entities/project-need.entity.ts',
    ],
    gap: "Rien ne l'attrape si quelqu'un l'écrit demain : il faudrait interdire un NOM de fonction, ce qui se contourne en le renommant. Ce qui protège réellement, c'est que les onze états sont contraints en SQL et couverts par GA-12 — une phase dérivée qui voudrait s'écrire en base serait refusée par la contrainte, et une phase dérivée qui ne s'écrit pas n'est pas une seconde vérité, c'est un affichage.",
    nextPack: null,
  },
  {
    // Le seul arbitrage du registre où le CODE a tranché contre la SOURCE, et
    // où l'écart n'était écrit nulle part — découvert le 27/08 en re-confrontant
    // la passe B au code. Deux documents vivants promettaient encore l'inverse.
    key: 'c28_seniorite',
    theme: 'ATS / Talent',
    canonical:
      "La séniorité d'un consultant est CALCULÉE sur des dates réelles, jamais déduite d'un intitulé, et vaut `null` quand les dates manquent. Elle n'est pas pour autant imposée : chaque champ cite le passage du CV qui le porte, chaque champ porte sa confiance, la revue se fait champ par champ, et « Tout accepter » est INTERDIT en confiance faible. C'est cet encadrement qui rend le calcul acceptable — sans lui, la déduction serait fausse sur tous les CV sans dates, ce que la source craignait à juste titre.",
    supersedes:
      "La formulation « la séniorité n'est jamais déduite, elle est SAISIE » (annexe ATS, reprise dans `agent_docs/chantiers-livres.md` et `agent_docs/pdf3-ats-talent-vivier-2026-08-20.md` D4). Elle est refusée sur son MOYEN, pas sur son intention : saisir à la main une valeur que les dates du CV portent déjà produit une seconde vérité et fait porter au recruteur un travail que la machine fait mieux. L'intention — ne jamais inventer une séniorité — est tenue, par `null` et par la revue humaine.",
    // ⚠️ `implemented` jusqu'au 29/08/2026, et c'était FAUX : D62 (28/08) avait
    // jugé la formulation, la ligne n'avait pas bougé. Le contrat DÉCLARE la
    // séniorité calculée et le prompt la calcule, mais rien ne l'ÉCRIT — voir
    // le `gap`. Corriger d'abord `codeState` : une entrée qui se déclare
    // implémentée sans l'être ferme un débat qui aurait dû rester ouvert.
    codeState: 'partial',
    // GARDÉE sur l'ENCADREMENT, qui est la moitié livrée, et par le maillon qui
    // compte : `canAutoAccept` interdit « Tout accepter » en confiance faible,
    // il est calculé SERVEUR (`cv-parse.service.ts`) et pas seulement affiché,
    // et il est couvert. Sans lui, le calcul deviendrait une saisie automatique
    // non revue — le jour où il s'écrira.
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/cv-parsing.ts',
      'apps/ia/app/prompts/bellum_cv_parse.py',
      'apps/api/src/modules/consultants/cv-parse.service.ts',
      'apps/web/src/features/consultants/view/parse/CvReviewPanel.tsx',
      'packages/contracts/src/schemas/cv-parsing.test.ts',
    ],
    gap: "DEUX trous, et le premier a été masqué par un `codeState: 'implemented'` jusqu'au 29/08/2026. (1) **Rien n'ÉCRIT la séniorité calculée.** Le contrat la déclare (`cv-parsing.ts:26`, « années totales — CALCULÉES sur des dates réelles ») et le prompt la produit, mais `cv-parse.service.ts:218-222` laisse `seniority` dans son `default:` — « rien à écrire aujourd'hui […] la séniorité en particulier reste SAISIE ». La valeur que porte une fiche vient de `consultants.service.ts` (`input.seniority`), donc d'une saisie humaine. D62 (28/08) tranche que c'est le REGISTRE qu'on corrige et non le code : la règle canonique reste la bonne, et un chemin d'écriture non branché est le défaut le plus fréquent de ce dépôt. (2) **Rien ne garde l'ÉNONCÉ.** Le prompt `bellum_cv_parse.py` porte la règle en toutes lettres (« “Lead” ne vaut pas huit ans »), mais un prompt se réécrit sans qu'un test tombe : une prochaine génération pourrait rendre une séniorité déduite d'un titre, et seule la confiance basse la signalerait. Une éval sur un CV sans dates, qui exige `null`, fermerait ce second trou.",
    nextPack: null,
  },

  /* ═══════════════════════════════════════════════════════════════════════════
   * LES REFUS DU DOSSIER DU 26 AOÛT — écrits le 28/08/2026.
   *
   * Ils partagent une propriété : le code les tient DÉJÀ, et personne ne les
   * avait écrits. Ce ne sont pas des chantiers, ce sont des réponses — celles
   * qu'on redonne de mémoire, moins bien, trois mois plus tard.
   * ═══════════════════════════════════════════════════════════════════════════ */

  {
    // ═══════════════════════════════════════════════════════════════════════
    // ⚠️ REVIREMENT DATÉ — 31/08/2026, par Louis, après relecture du refus.
    // ═══════════════════════════════════════════════════════════════════════
    // C'est le SECOND arbitrage du registre qui LÈVE un refus (après
    // `c44_reponse_favorable`), et il se lit dans le même sens : l'entrée n'est
    // pas supprimée, elle est RÉÉCRITE. Une décision qui change garde sa trace,
    // sinon elle se re-litigie une troisième fois — et celle-ci avait déjà été
    // posée deux fois (PDF-06 §9 le 21/08, dossier du 26/08 puis ce registre le
    // 28/08).
    //
    // CE QUI ÉTAIT REFUSÉ, mot pour mot : « Bellum ne touche jamais au
    // FINANCEMENT d'une créance. Ni affacturage, ni cession, ni escompte, ni
    // avance de trésorerie : la frontière du produit est "prêt à facturer", et
    // un financement se situe deux pas APRÈS une facture que Bellum n'émet
    // pas. » L'annexe des écrans cibles allait plus loin et demandait de JETER
    // la colonne « Cession » des maquettes (deux écrans, une exigence).
    //
    // LA RAISON D'ORIGINE, et elle reste juste sur son propre terrain : c17
    // refuse d'ÉMETTRE une facture, et ce refus-ci en était le prolongement —
    // « on ne finance pas ce qu'on n'émet pas ». Le raisonnement supposait que
    // financer exige d'émettre. Il ne l'exige pas : la facture est émise dans
    // l'outil comptable, et Bellum en consigne déjà la référence, le montant et
    // l'échéance depuis `markInvoiced`.
    //
    // CE QUE LOUIS A DEMANDÉ, mot pour mot, le 31/08/2026 : « Objet cession,
    // contrat factor, taux de commission, encours cédé, réconciliation des
    // règlements du factor. » Le fait qui a emporté la décision : les maquettes
    // du 26/08 font de la cession le premier poste de la répartition des
    // paiements (144 lignes sur ~190), c'est-à-dire le goulot n°1 de la
    // trésorerie d'une ESN qui affacture.
    key: 'c29_affacturage',
    theme: 'Facturation',
    canonical:
      "Bellum PILOTE la cession de créance (affacturage) — contrat factor, taux de commission, encours cédé, réconciliation des règlements — sans jamais la FAIRE. Trois refus voisins tiennent toujours et bornent le domaine : Bellum n'émet aucune facture (c17, c30), ne stocke AUCUNE coordonnée bancaire, et n'envoie rien au factor : « préparer la cession » prépare, un humain transmet, le produit consigne.",
    supersedes:
      "Le refus du 28/08/2026 — « Bellum ne touche jamais au FINANCEMENT d'une créance : ni affacturage, ni cession, ni escompte, ni avance de trésorerie » — et l'exigence de l'annexe des écrans cibles de JETER la colonne « Cession » des maquettes. LEVÉ le 31/08/2026 par Louis, qui a relu ce refus et l'a écarté explicitement. Son raisonnement supposait que financer une créance exige de l'émettre : c'est faux, la facture est émise dans l'outil comptable et Bellum en consigne déjà référence, montant et échéance. Ce qui reste refusé est nommé dans la règle canonique, et n'a pas bougé d'un mot.",
    codeState: 'implemented',
    // TENUE, et l'écart ci-dessous dit par quoi. Ce qui a changé le 31/08 :
    // avant, la règle était tenue par l'ABSENCE de tout code d'affacturage ;
    // maintenant elle est tenue par la FORME du code qui existe — un contrat
    // factor sans aucune colonne bancaire, et aucun chemin d'envoi.
    enforcement: 'held',
    holders: [
      'packages/contracts/src/schemas/factoring.ts',
      'packages/contracts/src/schemas/factoring.test.ts',
      'apps/api/src/modules/factoring/factoring.service.ts',
      'apps/api/src/modules/factoring/factoring.service.spec.ts',
      'apps/api/src/migrations/1790971000001-Factoring.ts',
      'packages/contracts/src/schemas/invoice-readiness.ts',
    ],
    gap: "Le refus SURVIVANT — aucune coordonnée bancaire — est tenu par l'absence de colonne, exactement comme l'était le refus entier avant le 31/08, et il porte donc la même fragilité : aucune garde ne refuse un `iban` qui n'existe pas encore. Le jour où une colonne bancaire apparaîtrait dans une migration, ce sont GA-11/GA-12 qui la verraient passer, pas ce registre. Restent dues, et nommées : le rapprochement d'un avis de règlement PDF (aucun OCR n'atteint ce domaine, les règlements se saisissent), et le lien entre l'encours cédé et le plafond du contrat, qui est affiché mais ne déclenche aucune alerte.",
    nextPack: null,
  },
  {
    key: 'c30_libelle_facturation',
    theme: 'Facturation',
    canonical:
      "Le geste s'appelle « préparer les éléments de facturation », et l'écran s'arrête là. Aucun bouton principal ne dit « Envoyer la facture » ni « Facturer une période » — un libellé qui promet l'émission engage une numérotation continue et une obligation de conservation que le produit n'assume pas.",
    supersedes:
      "Les maquettes du 26/08 qui posent « Facturer ce mois » en action principale de la vue Finance. Le mot fait la promesse, pas le code derrière : un commercial qui clique « Facturer » et voit un état changer croit qu'une facture est partie.",
    codeState: 'implemented',
    // TENUE, et l'écart dit exactement ce que le test couvre. Le libellé livré
    // est « Prêt à facturer » (`missions.json`, clé `readiness`), et le seul
    // bouton d'état est « marquer comme facturé AILLEURS » — une consignation,
    // pas une émission.
    enforcement: 'held',
    holders: [
      'apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx',
      'apps/web/src/features/missions/view/InvoiceReadinessPanel.test.tsx',
      'apps/web/src/i18n/locales/fr/missions.json',
    ],
    gap: "Le test du panneau vérifie que le MONTANT est annoncé comme préparatoire (« pas une facture ») ; il ne refuse pas un bouton d'émission qu'on ajouterait demain. Une garde utile porterait sur les LIBELLÉS i18n de la vue — refuser « envoyer la facture » / « facturer » en tête d'action —, mais elle devrait épargner les libellés descriptifs, qui sont légitimes : `labels.fr.ts` écrit « personne à qui envoyer la facture » pour NOMMER un bloqueur, ce qui est l'inverse d'une promesse.",
    nextPack: null,
  },
  {
    key: 'c31_relance_encaissement',
    theme: 'Facturation',
    canonical:
      "⚠️ 11/10/2026 — RENVERSEMENT DATÉ (décision Louis, épopée #4016, lot L5) : la relance d'impayé PEUT partir, mais SEULEMENT sous un MANDAT SIGNÉ de la portée `payment_reminder` (`outreach-delegation.ts`), borné et révocable, par le dispatcher outreach qui relit à chaque envoi la réponse, l'opposition, l'exclusion et l'effacement. Sans mandat actif, la règle ci-dessous vaut ENTIÈRE. L'ancienne règle reste lisible : " +
      "La relance d'encaissement se CALCULE et s'affiche — rang, ton, retard —, elle ne part jamais. L'écran ne promet pas davantage un brouillon : tant qu'aucune capacité de messagerie ne l'atteint, annoncer « brouillon créé » serait annoncer un objet qui n'existe pas.",
    supersedes:
      "La cadence de relance « graduée » du PDF 6 §6.4 lue comme un ENVOI automatique au 1ᵉʳ, 8ᵉ et 15ᵉ jour de retard, avec mise en copie du chargé d'affaires et du sponsor au troisième rang.",
    codeState: 'implemented',
    // GARDÉE, et par un test qui sait dire NON dans les DEUX sens :
    // `PaymentReminderDue.test.tsx` exige la phrase « Rien ne part tout seul »
    // ET refuse que le mot « brouillon » apparaisse.
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/missions/view/PaymentReminderDue.tsx',
      'apps/web/src/features/missions/view/PaymentReminderDue.test.tsx',
      'apps/api/src/modules/delivery/invoice-readiness.controller.ts',
    ],
    gap: "⚠️ Nuance que le dossier du 26/08 énonce à l'envers : le brouillon n'est PAS le repli acceptable ici, il est refusé au même titre que l'envoi. `resolveChannel` sait dire « Créer les brouillons », mais aucune capacité (`mailboxDraft`, `teamChat`, `crmTask`) ne voyage jusqu'à ce composant — promettre un brouillon serait promettre un canal qu'on n'a pas vérifié, ce que c15 interdit. Le jour où la capacité atteint l'écran, le brouillon devient légitime et ce refus se rétrécit à l'ENVOI seul.",
    nextPack: null,
  },
  {
    key: 'c32_deux_notes',
    theme: 'Matching',
    canonical:
      "Sur une fiche besoin, deux notes s'affichent et ne fusionnent JAMAIS : la correspondance (« ce profil colle-t-il ? ») et le poussable (« ce profil peut-il partir chez ce client ? »). Un chiffre unique détruit la seule information dont le recruteur se sert — et c'est celui qu'il regarderait.",
    supersedes:
      "Le « 92 % de correspondance » unique en tête de fiche besoin. L'exemple qui a tranché est dans `pushable.ts` : « 92 / 31 » veut dire « profil parfait, indisponible jusqu'en novembre », « 68 / 84 » veut dire « profil moyen, libre demain, TJM confortable » — les fondre donne 61 dans les deux cas.",
    codeState: 'implemented',
    // GARDÉE : `pushable.spec.ts` déroule les vingt cas de la spécification,
    // dont les cas 3 et 4 qui EXIGENT la divergence des deux notes, et le cas
    // 15 (« tous les termes optionnels inconnus → le poussable vaut la
    // correspondance ») qui est le seul point où elles coïncident légitimement.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/consultants/matching/pushable.ts',
      'apps/api/src/modules/consultants/matching/pushable.spec.ts',
      'packages/contracts/src/schemas/mission-scores.ts',
      'packages/contracts/src/schemas/mission-scores.test.ts',
    ],
    gap: "Les tests tiennent le CALCUL, pas l'AFFICHAGE : rien n'empêche un écran de moyenner les deux notes avant de les rendre. La règle voisine qui protège ce flanc est GA-18 (un score nu à l'écran), et c'est un cliquet, pas un interdit. C'est aussi la moitié « forme » de c26 : deux notes qui ne fusionnent pas restent deux notes décomposées, jamais une chance.",
    nextPack: null,
  },
  {
    key: 'c33_promesse_chiffree',
    theme: 'Données',
    canonical:
      "Le produit n'affiche jamais un gain qu'il n'a pas mesuré. « +35 % de précision », « paiements effectués : 0,4 % » : un chiffre de performance ne s'écrit que s'il se recalcule depuis une source, et sous le seuil de mesurabilité il vaut « non mesuré » — jamais `0`, qui se lit comme un résultat.",
    supersedes:
      "Les promesses chiffrées des maquettes du 26/08, reprises telles quelles d'un argumentaire. Elles ne viennent d'aucun calcul du dépôt : ce sont des données fictives affichées avec l'autorité d'une mesure, ce que la règle n°1 du dépôt interdit.",
    codeState: 'implemented',
    // RIEN ne la tient, et il faut le dire : mesuré le 28/08, aucun « +35 % »
    // ni « 0,4 % » n'existe dans `apps/` ni `packages/`. C'est un état de fait,
    // pas une garde.
    enforcement: 'unenforced',
    holders: [
      'packages/contracts/src/schemas/measurability.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/evaluation/provisionalScore.ts',
      'apps/web/src/architecture/display-primitives.test.ts',
    ],
    gap: "Aucune garde ne distingue un pourcentage CALCULÉ d'un pourcentage ÉCRIT À LA MAIN dans du JSX — il faudrait remonter la provenance d'un littéral, ce qu'aucun scanner de source ne sait faire. GA-18/GA-19 attrapent la faute voisine (une note nue, un `?? 0`), pas celle-ci. Ce qui existe et qu'il faut réemployer : `provisionalScore.ts` refuse déjà d'afficher une précision que le dossier ne soutient pas, et `measurability` sait dire « 3 sur les 10 nécessaires » plutôt que de se taire.",
    nextPack: null,
  },
  {
    key: 'c34_denominateur',
    theme: 'Pilotage',
    canonical:
      "Un dénominateur ne s'invente pas pour rendre un ratio affichable. Il est DÉCLARÉ, à un seul endroit, et tant qu'il n'est pas atteint l'indicateur dit combien il manque : « non mesurable — 3 factures sur les 10 nécessaires ».",
    supersedes:
      "Le retournement de l'invariant « jamais un chiffre sans dénominateur » : puisqu'un chiffre exige un dénominateur, on lui en donne un — le nombre de lignes qu'on a sous la main. Un DSO sur trois factures devient alors « le DSO », et il fait décider sur du bruit.",
    codeState: 'implemented',
    // GARDÉE : `measurability.test.ts` vérifie le seuil AU seuil (pas
    // au-dessus), le manque jamais négatif, et le `null` sous le seuil — « trois
    // factures ne font pas un DSO ».
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/measurability.ts',
      'packages/contracts/src/schemas/measurability.test.ts',
      'packages/contracts/src/schemas/manager-kpi.ts',
    ],
    gap: "Les seuils sont VOLONTAIREMENT bas (dix factures, cinq missions) : ils écartent le bruit des premiers jours, ils ne prétendent pas à une significativité statistique. Les relire comme une garantie statistique serait l'erreur symétrique de celle qu'ils corrigent. Et ils ne couvrent que les indicateurs de `MEASURABILITY_THRESHOLDS` — un nouveau ratio ajouté ailleurs n'hérite de rien.",
    nextPack: null,
  },
  {
    key: 'c35_registres_etrangers',
    theme: 'Collecte',
    canonical:
      "⚠️ RENVERSEMENT PARTIEL ET DATÉ — DÉCISION LOUIS 11/10/2026 (#4016 L13a). Un registre étranger s'active aussi sur son contrat DOCUMENTÉ (`contract: 'documented'`, public, sans clé — le pack LU passe par l'API publique GLEIF) : ce n'est pas un contrat deviné. Mais tant qu'il n'est pas VÉRIFIÉ sur une instance de production réelle, l'écran le dit (badge) et RIEN de facturé ne repose dessus (`contractDebitsCredits`, aucun débit). Ancien texte, conservé : « Un registre étranger s'ouvre quand une source OFFICIELLE offre un contrat vérifiable — et pas autrement. Sans endpoint libre et vérifié, le pack reste `beta` et fait ZÉRO appel réseau : il n'invente aucune société, et il ne passe pas par la façade JavaScript du registre, ce qui reviendrait à se faire passer pour un navigateur humain. » (La façade JavaScript reste interdite : c79.)",
    supersedes:
      "⚠️ La formulation « on n'élargit pas la collecte à des registres étrangers », qui décrit un dépôt d'AVANT. Mesuré le 28/08 : CINQ packs pays existent et quatre sont `live` — CH (Zefix), BE (KBO), US (SEC EDGAR), CA (CBR-MRAS) —, chacun avec sa base RGPD écrite dans `COMPLIANCE.md`. Ce qui est refusé n'est pas le pays, c'est la source non vérifiable.",
    codeState: 'implemented',
    // GARDÉE : `test_pack_contracts_match_the_contracts_package_table` compare le
    // `contract` de CHAQUE pack à `REGISTRY_CONTRACT_BY_COUNTRY` (c'est ce qui
    // allume le badge et coupe le débit), et `registry-contract.test.ts` prouve
    // qu'un contrat documenté ou inconnu ne débite rien. Avant le 11/10/2026 la
    // garde était `test_lu_lookup_is_degraded_no_network` (LU `beta`, zéro réseau).
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/country_packs/__init__.py',
      'apps/ia/app/services/country_packs/lu.py',
      'apps/ia/app/services/country_packs/COMPLIANCE.md',
      'apps/ia/tests/test_country_packs.py',
      'packages/contracts/src/schemas/registry-contract.ts',
      'packages/contracts/src/schemas/registry-contract.test.ts',
    ],
    gap: "Ce que le pack LU rend malgré tout — vocabulaire, ontologie d'entités, mises en garde RCS/RBE — part dans les PROMPTS, pas dans une résolution : un dossier luxembourgeois se lit dans les bons termes sans qu'aucune société ne soit affirmée. Le brancher pour de bon suppose l'API payante du LBR (~5 000 €/an annoncés depuis janvier 2026, à confirmer sur la grille officielle), donc une décision de coût, pas une décision technique.",
    nextPack: null,
  },
  {
    key: 'c36_recrutement_preuve',
    theme: 'Collecte',
    canonical:
      "Une page de recrutement n'est pas une preuve d'achat. Elle est un signal à VÉRIFIER — et elle porte souvent le contre-signal : une entreprise qui recrute en permanence sur un sujet le fait en interne, donc n'achètera pas. Un signal isolé reste `à_vérifier` ; trois signaux convergents font une hypothèse confirmée.",
    supersedes:
      "La lecture « ils recrutent douze data engineers, donc ils vont externaliser », qui transforme une offre d'emploi en intention d'achat. C'est l'interdit d'interprétation qui accompagne l'élargissement des sources : collecter plus d'offres sans cette règle produit plus de faux positifs, pas plus d'affaires.",
    codeState: 'implemented',
    // TENUE en trois endroits qui disent la même chose : `evidence_tier` = C
    // (« activité ou relation, PAS une preuve d'achat ») sur la ligne DATAFORGE,
    // la règle de convergence et le champ `counterEvidence` du prompt signaux,
    // et `intermediation.py` pour le cas voisin (« une offre publiée par un
    // cabinet de recrutement n'est pas son besoin à lui »).
    enforcement: 'held',
    holders: [
      'apps/api/src/database/entities/dataforge-account-domain.entity.ts',
      'apps/ia/app/prompts/bellum_signals.py',
      'apps/ia/app/services/intermediation.py',
    ],
    gap: "⚠️ RENVERSEMENT PARTIEL DATÉ du 13/10/2026 (décision Louis 11/10, épopée #4016 L10.c : « un signal isolé suffit pour chaud ») : pour le CLASSEMENT du cockpit, UN signal — récent, ou la présence du compte dans la mémoire marché — suffit à rendre un compte « chaud » (`marketHeatRank`, `market-heat.ts` ; GA-262 réécrite). INCHANGÉ ici : une offre d'emploi seule reste une hypothèse `à_vérifier`, jamais une intention d'achat confirmée, et une observation marché n'est jamais comptée comme un « nouveau signal ». L'essentiel de la règle vit dans un PROMPT, et un prompt se réécrit sans qu'un test tombe — même trou que c28. `counterEvidence` est déclaré « [] si aucun trouvé, jamais omis », mais rien ne vérifie qu'une génération le remplit quand un recrutement permanent est présent dans les sources. Un jeu de référence — un compte qui recrute en interne, dont l'hypothèse attendue est un contre-signal — fermerait ce trou.",
    nextPack: null,
  },
  {
    key: 'c37_fusion_doublons',
    theme: 'CRM / ATS',
    canonical:
      "⚠️⚠️ RENVERSEMENT DATÉ DU 11/10/2026 (décision Louis, épopée #4016, lot L6) : une paire CERTAINE — confiance ≥ 0,99, c'est-à-dire même adresse ET même nom normalisé, sociétés qui ne se contredisent pas — est FUSIONNÉE par le balayeur, DANS BELLUM SEULEMENT (jamais dans le CRM du client), JOURNALISÉE (`duplicate_pairs.decision = 'auto_merged'`, `absorbed_id`) et RÉVERSIBLE (« Annuler la fusion » remet la fiche absorbée ; `undone_at` / `undone_by` gardent la trace). En dessous de 0,99, on PROPOSE toujours et un humain tranche. Une correction humaine gagne toujours : une paire déjà tranchée ne se refusionne pas. Deux homonymes chez deux sociétés différentes ne sont JAMAIS rapprochés. Interrupteur : `DUPLICATES_AUTO_MERGE_DISABLED` rend les paires certaines à la proposition. ⚠️ RENVERSEMENT PARTIEL DATÉ DU 15/10/2026 (décision Louis, #4016 L6) : deux COMPTES du même espace au SIREN IDENTIQUE (et seulement lui — jamais un nom) sont aussi fusionnés seuls : le compte absorbé est ARCHIVÉ (jamais supprimé), la paire journalisée `auto_merged`, une paire déjà tranchée par un humain jamais refusionnée. Sans SIREN identique, on propose et l'utilisateur valide. ⚠️ RENVERSEMENT DATÉ DU 26/10/2026 (décision Louis, #4603) — UNE exception de plus, voir `c142_fusion_auto_compte_crm_compte_analyse` : la paire compte venu du CRM ↔ compte créé par l'analyse, même société (SIREN d'abord, puis `marketMatchKey`), est fusionnée sans demander. Deux homonymes d'origines quelconques restent proposés.",
    supersedes:
      "« On PROPOSE un rapprochement, on ne fusionne JAMAIS. Une paire porte sa clé et sa confiance, et c'est un humain qui tranche — parce qu'une fusion est irréversible côté CRM et qu'un faux positif écrase l'historique d'un vrai client » (règle tenue jusqu'au 10/10/2026, écrite pour être lue). Ce qui la rendait juste — l'IRRÉVERSIBILITÉ côté CRM — ne s'applique pas à une fusion faite dans Bellum, mise de côté et annulable : c'est ce que le renversement retient. Et avant elle, la fusion implicite au-dessus de 0,95 (« autant fusionner tout seul ») reste refusée : 0,95 n'est pas une certitude.",
    codeState: 'implemented',
    // GARDÉE : `duplicates.sweeper.spec.ts` exige que deux HOMONYMES chez deux
    // sociétés différentes ne soient JAMAIS rapprochés, qu'une paire à 0,95
    // reste une PROPOSITION et que l'interrupteur rende la paire certaine à la
    // proposition ; `governance.service.spec.ts` tient l'annulation.
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/talent-duplicates.ts',
      'packages/contracts/src/schemas/talent-duplicates.test.ts',
      'packages/contracts/src/schemas/governance.ts',
      'apps/api/src/modules/crm-core/duplicates.sweeper.ts',
      'apps/api/src/modules/crm-core/duplicates.sweeper.spec.ts',
      'apps/api/src/modules/crm-core/governance.service.ts',
      'apps/api/src/modules/crm-core/governance.service.spec.ts',
    ],
    gap: "La date de naissance est ABSENTE des clés de rapprochement alors que la source du PDF 3 §3.4 la propose : c'est un critère protégé (GA-06), et s'en servir pour dédupliquer obligerait à le stocker sur chaque fiche du vivier. La déduplication est donc un peu moins précise, délibérément — et c'est la seule des cinq clés du §3.4 qui manque. Depuis le 11/10/2026 : seuls les CONTACTS se fusionnent seuls ; depuis le 15/10/2026 les COMPTES de même SIREN aussi (`autoMergeAccounts`) ; les comptes de même nom restent une proposition (`absorbAccount` est un geste humain). Écart nommé : la fusion de comptes par SIREN n'a pas de bouton « Annuler » dédié (le détachement existant remet le compte) et ne déplace pas les contacts.",
    nextPack: null,
  },
  {
    key: 'c38_couleur_alerte',
    theme: 'Design',
    canonical:
      "⚠️ RÉOUVERT ET TRANCHÉ PAR LOUIS LE 31/08/2026. La règle d'origine — « une couleur d'alerte suppose un objectif, et l'objectif n'est pas tranché » — tenait entièrement à l'absence d'objectif ; son propre `gap` disait qu'elle tomberait le jour où une cible serait tranchée. Elle l'est : l'objectif mensuel de marge devient un RÉGLAGE saisi par l'espace (`finance_margin_targets`, une ligne par mois), et une couleur se dérive alors de la cible SAISIE — jamais d'un seuil deviné. Ce qui NE change pas, et qui est le cœur du refus d'origine : sans objectif saisi, l'anneau dit « objectif non défini » et n'affiche AUCUN pourcentage (jamais 0 %, jamais un objectif par défaut) ; sous le seuil de mesurabilité de la marge, il se tait ; et il n'y a toujours PAS d'orange — deux états seulement, atteint ou pas encore. La bande d'alertes, elle, reste sans couleur : elle rend un ORDRE DE GRAVITÉ. Et une couleur sémantique ne porte jamais de texte — `--bellum-warning` fait 9,47:1 en sombre et 1,84:1 en clair ; le texte passe par `*-soft-text`.",
    supersedes:
      "Le cercle orange de la variante 4 des maquettes du 26/08, autour du montant encaissé du mois. « L'orange dit “c'est mauvais”. Mauvais par rapport à quoi ? » — aucune cible d'encaissement n'existait alors dans le produit, donc l'orange comparait à un objectif imaginaire. Ce refus reste VALIDE pour tout indicateur sans cible saisie : il n'est levé que là où l'ESN a elle-même posé le chiffre auquel on la compare. Et il ne réhabilite PAS l'orange : le revirement autorise une couleur DÉRIVÉE d'une cible, pas la teinte que la maquette employait pour dire « c'est mauvais ».",
    codeState: 'implemented',
    // TENUE par la FORME, des deux côtés :
    //  · la bande d'alertes — `FinanceAlert` ne porte aucun champ de couleur, et
    //    `financeAlerts` classe par gravité (`INVOICE_BLOCKERS` porte l'ordre) ;
    //  · l'anneau — `marginAttainment` rend une branche `measured: false` qui NE
    //    PORTE NI `percent` NI `reached` : l'écran ne peut pas afficher un
    //    pourcentage ni choisir une couleur quand il n'y a pas d'objectif. Ce
    //    n'est pas une consigne, c'est le typage.
    // GA-33 garde l'autre moitié — pas de couleur sémantique brute en texte.
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/pilotage/finance/finance-alerts.ts',
      'apps/web/src/features/pilotage/finance/finance-alerts.test.ts',
      'apps/web/src/architecture/theme-parity.test.ts',
      'packages/contracts/src/schemas/finance-target.ts',
      'packages/contracts/src/schemas/finance-target.test.ts',
      'apps/web/src/features/pilotage/finance/FinanceTargetRing.tsx',
      'apps/web/src/features/pilotage/finance/FinanceScreen.test.tsx',
    ],
    gap: "Aucun test ne refuse qu'une couleur réapparaisse sur la bande d'ALERTES : `finance-alerts.test.ts` garde le tri, les montants et le refus de « 0 € », pas l'absence de teinte. Sur l'anneau, en revanche, le refus est désormais gardé par le typage ET par `finance-target.test.ts` (la branche non mesurée ne porte pas de `percent`) et par `FinanceScreen.test.tsx` (sans objectif, aucun anneau n'est rendu). Ce qui reste non gardé : rien n'empêche un futur écran de peindre en orange une valeur SANS cible — la règle vaut, la preuve manque.",
    nextPack: null,
  },
  {
    key: 'c39_metadonnees_trace',
    theme: 'Observabilité',
    canonical:
      "Une trace d'observabilité porte des métadonnées TECHNIQUES — modèle, jetons, coût, latence, nom de prompt, corrélation. Élargir à dix-sept champs par trace ferait sortir du contenu métier, et ce n'est faisable qu'avec un masquage des données personnelles qui n'est PAS spécifié. Sans spécification, pas de lot.",
    supersedes:
      "La proposition d'attacher dix-sept métadonnées par trace pour « tout retrouver depuis Langfuse », qui suppose d'y verser des extraits de prompts et de réponses — donc de la donnée de comptes clients chez un sous-traitant, sans base écrite.",
    codeState: 'implemented',
    // GARDÉE sur le point qui compte :
    // `test_le_contenu_des_prompts_ne_sort_pas_par_defaut` vérifie qu'aucun
    // contenu ne part sans `LANGFUSE_CAPTURE_CONTENT`, et
    // `test_l_opt_in_de_contenu_capture_et_borne` que l'opt-in est BORNÉ.
    enforcement: 'guarded',
    holders: ['apps/ia/app/services/langfuse_client.py', 'apps/ia/tests/test_langfuse_client.py'],
    gap: "⚠️ Le motif « le CORPS des messages ne sort jamais de la messagerie » ne s'applique PAS tel quel ici : depuis l'arbitrage de Louis du 16/08, le corps EST stocké intégralement dans `activities` (revirement assumé — sans lui, « une relance dans le ton du dernier échange » est impossible). Ce qui n'a pas changé, et qui est la vraie raison : le copilote ne remonte jamais de corps, et Langfuse n'en reçoit aucun par défaut. Le masquage reste dû, et c25 le porte déjà — ce refus-ci ne fait que dire pourquoi on n'a pas élargi en attendant.",
    nextPack: '03',
  },
  {
    key: 'c40_secteur_pivot',
    theme: 'Secteur',
    canonical:
      "Le secteur d'application appartient au PROJET, qui est le pivot. La mission en reçoit une COPIE datée (`inherited_from_project_at`) et le matching lit celui du projet — une mission créée à la main n'hérite de rien plutôt que de recevoir le secteur du compte.",
    supersedes:
      "« Le secteur appartient à la mission », proposé dans le dossier du 26/08. La mission porte bien `application_sector_codes`, mais comme copie d'un projet, pas comme source : faire de la mission le pivot rendrait le secteur illisible avant qu'une mission existe — c'est-à-dire pendant toute la phase où l'on en a besoin pour prospecter.",
    codeState: 'implemented',
    // GARDÉE par `sector-axis.spec.ts`, qui vérifie que l'axe lit les secteurs
    // du PROJET et NOMME le repli sur le compte au lieu de le taire.
    // ⚠️ Écrire l'arbitrage ne change PAS le code : `project_is_the_pivot` et
    // c05 restent tels quels, cette entrée les rend seulement citables face à
    // la proposition inverse.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/consultants/matching/axes.ts',
      'apps/api/src/modules/consultants/matching/sector-axis.spec.ts',
      'apps/api/src/database/entities/mission.entity.ts',
      'apps/api/src/database/entities/project.entity.ts',
    ],
    gap: "La copie vers la mission est ponctuelle : un secteur corrigé sur le projet APRÈS la création de la mission ne redescend pas. C'est cohérent avec « une correction humaine gagne toujours » — écraser la mission effacerait une saisie —, mais cela veut dire que deux valeurs peuvent diverger, et que seule la date d'héritage permet de savoir laquelle est la plus ancienne.",
    nextPack: null,
  },
  {
    key: 'c41_maillon_chaine',
    theme: 'Automatisation',
    canonical:
      "Un maillon n'est pas une action datée. Dans une chaîne, c'est une POSITION avec un acteur et un résultat attendu ; dans le pilotage, c'est un NIVEAU de mesure avec son seuil. Ni l'un ni l'autre ne porte de date, et `nextPosition` est pure — aucune horloge n'entre dans le calcul.",
    supersedes:
      "« Un maillon de chaîne est une action datée », qui ferait d'une chaîne un troisième moteur d'exécution — après le runner d'Action OS et les routines. Une chaîne ne fait qu'une chose : dire où en est un dossier et ce qu'on attend de lui. Elle n'appelle aucun connecteur, n'envoie rien, ne débite rien.",
    codeState: 'implemented',
    // TENUE par la FORME : `chainStepSchema` n'a aucun champ de date, et seul le
    // PARCOURS (`chain_runs`) porte `started_at` / `ended_at`. Côté pilotage, un
    // `PilotageLevelReport` porte un statut et des indicateurs, jamais une date.
    enforcement: 'held',
    holders: [
      'packages/contracts/src/schemas/chain.ts',
      'packages/contracts/src/schemas/chain.test.ts',
      'packages/contracts/src/schemas/pilotage.ts',
    ],
    gap: "Aucun test ne refuse qu'on ajoute une date à une étape : `chain.test.ts` couvre `nextPosition` et `chainProblems`, `chain-catalog.spec.ts` couvre le plafond N2 (« une chaîne DIT où l'on en est, elle n'envoie rien »). ⚠️ Piège de vocabulaire à connaître avant d'en parler : « maillon » désigne DEUX objets différents dans ce dépôt — l'étape d'une `Chain` et le niveau d'un `PilotageLevelReport` —, et `chain-alerts.ts` (côté pilotage) parle du second.",
    nextPack: null,
  },
  {
    key: 'c42_saisie_creation',
    theme: 'Objet métier',
    canonical:
      "Créer un objet demande le strict nécessaire — un besoin ne demande que son titre — et aucun champ non renseigné ne reçoit de DÉFAUT. Une urgence absente n'est pas « normale », un besoin sans propriétaire n'appartient pas à celui qui l'a créé : `null` reste `null`, et c'est ce vide-là que le cockpit cherche à repérer.",
    supersedes:
      "La saisie obligatoire à la création — urgence, propriétaire, date de clôture espérée exigés avant d'enregistrer. Elle produit deux choses : des formulaires qu'on abandonne, et des valeurs saisies au hasard pour passer l'écran, indiscernables ensuite d'une vraie décision.",
    codeState: 'implemented',
    // GARDÉE : `project.need-write.test.ts` exige qu'un besoin créé SANS urgence
    // ne porte pas la propriété du tout (`not.toHaveProperty('urgency')`), et
    // que le schéma `.strict()` refuse une clé inconnue.
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/project.ts',
      'packages/contracts/src/schemas/project.need-write.test.ts',
      'apps/api/src/modules/projects/dto/project.dto.ts',
    ],
    gap: "La règle est écrite besoin par besoin, pas globalement : chaque nouveau schéma d'écriture peut poser un `.default()` sans qu'aucune garde ne bronche. Les deux exemples à citer quand la question revient sont dans `project.dto.ts` : le porteur `null` est « un état légitime — plus honnête que d'en désigner un au hasard », et la clôture espérée n'est « jamais déduite d'un cycle moyen ».",
    nextPack: null,
  },
  {
    key: 'c43_actions_de_masse',
    theme: 'Besoins',
    canonical:
      "⚠️ RENVERSEMENT PARTIEL ET DATÉ — DÉCISION LOUIS 11/10/2026 (#4016 L11). La sélection du tableau « Besoins ouverts » s'exporte désormais en FICHIER (CSV ou JSON), à une condition qui ne bouge pas : la sortie est gouvernée par `@DataExit()` — la règle d'espace « qui peut exporter » — côté API (`POST /projects/needs/export`) comme côté écran. Un FICHIER téléchargé, jamais une POUSSÉE : le versement au CRM reste la route unitaire `POST /projects/:id/export-crm`, et rien ici n'écrit chez un tiers. Les sept autres gestes de masse écrivent toujours à l'intérieur.",
    supersedes:
      "Ancien texte, conservé : « Aucune action de masse sur les besoins ne SORT de l'entreprise [...] L'export est refusé nommément, parce que la seule route d'export côté besoins POUSSE vers un CRM tiers. » Refusé, avant le 11/10/2026 : l'ajout d'un « Exporter la sélection » à la barre d'actions, lu comme un simple téléchargement. `POST /projects/:id/export-crm` n'est pas un fichier : c'est une sortie. Un export de masse déclenché depuis une case à cocher ferait sortir en un clic ce qu'un chantier entier a servi à garder dedans.",
    codeState: 'implemented',
    // GARDÉE, et la garde prouve les DEUX choses exigées : elle lit un corpus
    // non vide, et elle sait dire NON — ajouter `'export'` au catalogue, ou
    // coller un `path: '…export…'` dans un fichier de cet écran, la fait
    // échouer. Le refus lui-même porte sa raison, en code
    // (`NEED_BULK_ACTIONS_REFUSED`), et un test vérifie que la raison est là.
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/projects/open-needs/model/need-actions.ts',
      'apps/web/src/features/projects/open-needs/model/need-actions.test.ts',
      'apps/api/src/modules/projects/need-export.ts',
      'apps/api/src/modules/projects/need-export.spec.ts',
      'apps/api/src/architecture/data-exit-routes.spec.ts',
    ],
    gap: "⚠️ La règle est SCOPÉE aux besoins, et il ne faut pas la citer plus large qu'elle ne l'est : l'envoi groupé de courriels existe côté CONTACTS (`BulkSendEmailDialog`, plafonné à cinquante), et il sort par construction. Les deux ne se contredisent pas — un envoi est un geste d'utilisateur adressé, borné et consigné, alors qu'un export pousse un JEU DE DONNÉES entier vers un tiers —, mais aucune garde ne tient cette distinction ailleurs que sur l'écran des besoins.",
    nextPack: null,
  },
  {
    /* ═══════════════════════════════════════════════════════════════════════
     * D29 du dossier du 26 août, tranchée le 28/08/2026.
     *
     * ⚠️ LA SEULE ENTRÉE DU REGISTRE QUI LÈVE UN REFUS au lieu d'en poser un.
     *
     * La passe B a trouvé une contradiction ouverte : la source du dossier
     * REFUSE « détecter une réponse positive » (PDF-11:532-533), et le dépôt
     * LIVRE la routine `positive_replies` (`routine-catalog.ts:134`) depuis le
     * 03/08. Deux issues seulement — retirer la routine, ou écrire que le refus
     * est périmé. Louis a tranché le second : détecter pour SIGNALER n'est pas
     * répondre, et le produit ne répond jamais seul.
     *
     * Sans cette entrée, la contradiction se re-tranche de mémoire — et elle se
     * re-tranche dans le mauvais sens : une relecture qui trouve un refus écrit
     * dans une source et une routine dans le code retire la routine.
     * ═══════════════════════════════════════════════════════════════════════ */
    key: 'c44_reponse_favorable',
    theme: 'Automatisation',
    canonical:
      "Détecter une réponse favorable pour la SIGNALER est AUTORISÉ. Ce qui reste refusé, c'est d'y RÉPONDRE. La routine classe des métadonnées — objet, expéditeur, aperçu rendu par le fournisseur —, elle notifie, et elle s'arrête là : le produit prépare, le commercial envoie.",
    supersedes:
      "« Détecter automatiquement une réponse positive ou un rendez-vous obtenu — suppose de classer une intention dans le CORPS d'un message, que le produit ne lit pas » (source du dossier du 26/08, PDF-11:532-533). Le refus est périmé sur ses DEUX moitiés. Sur le MOYEN : `mailMessageSchema` ne porte aucun champ de corps, donc la classification ne peut pas lire ce que le refus lui prête. Sur l'INTENTION : signaler n'est pas répondre, et « le copilote n'envoie jamais d'e-mail » reste entier. Le document se contredisait d'ailleurs lui-même — son `B02` liste « réponse positive détectée » parmi les automatisations attendues, huit sections plus loin.",
    codeState: 'implemented',
    // TENUE par la FORME, comme c41 : `positiveReplies` ne rend qu'une
    // `RoutineOutcome` — un titre, un corps, un lien vers `/mailbox` —, et la
    // routine se déclare `n1_prepare`, le niveau qui PRÉPARE sans agir.
    enforcement: 'held',
    holders: [
      'apps/api/src/modules/routines/routine-catalog.ts',
      'apps/api/src/modules/routines/routine-executors.ts',
      'apps/api/src/modules/mailbox/no-reply.ts',
      'apps/api/src/modules/mailbox/no-reply.spec.ts',
      'packages/contracts/src/schemas/mailbox.ts',
    ],
    gap: "⚠️ Deux nuances à ne pas citer plus large qu'elles ne le sont. (1) « Jamais le corps », tel que le catalogue l'écrit, est une SIMPLIFICATION : `selectPositiveReplies` lit l'objet ET le `snippet`, c'est-à-dire l'aperçu que le fournisseur rend de lui-même (`snippet` chez Google, `preview` chez Microsoft). Ce qui est exactement vrai — et qui est la vraie garantie — c'est que `mailMessageSchema` n'a AUCUN champ de corps : il n'y a rien à faire fuir, faute d'exister. (2) Rien n'attrape mécaniquement l'inverse : `routine-catalog.spec.ts` garde le NIVEAU déclaré (« aucune routine au-delà de N4 »), pas ce que l'exécuteur fait, et un exécuteur qui acquerrait un chemin d'envoi ne ferait tomber ce test-là. Ce qui le verrait passer est la porte d'écriture et `wired-write-paths.spec.ts`, pas ce registre.",
    nextPack: null,
  },

  /* ═══════════════════════════════════════════════════════════════════════════
   * LES REFUS DU CRM ET DE L'ATS — écrits le 28/08/2026.
   *
   * Cinq refus que le dépôt tenait déjà et que personne n'avait écrits. Ils se
   * distinguent des quinze précédents par ce qui les tenait : non pas un
   * commentaire, mais des choses encore moins durables — un numéro de décision
   * qui ne renvoyait nulle part (« D60 »), et, pour l'un d'eux, RIEN du tout :
   * l'absence d'une ligne que personne n'avait eu l'idée d'écrire.
   * ═══════════════════════════════════════════════════════════════════════════ */

  {
    /* ═══════════════════════════════════════════════════════════════════════
     * DÉCISION DE LOUIS DU 28/08/2026 — sur une contradiction ENTRE DEUX
     * DOCUMENTS DE LA SOURCE, pas entre la source et le code.
     *
     * C'est ce qui rend cette entrée différente des autres : le dépôt applique
     * déjà l'une des deux formulations, et rien ne dit laquelle est la bonne.
     * Une relecture qui tomberait sur PDF-02 seul « corrigerait » le code en
     * transformant l'avertissement en blocage — de bonne foi, en trois lignes,
     * et le produit deviendrait inutilisable le jour d'un import de vivier, où
     * AUCUN consentement n'a encore été recueilli.
     * ═══════════════════════════════════════════════════════════════════════ */
    key: 'c45_consentement_positionnement',
    theme: 'ATS / Talent',
    canonical:
      "Un consentement EXPIRÉ refuse un positionnement, et c'est le SEUL refus dur du produit : proposer quelqu'un dont on n'a plus le droit de détenir les données n'est pas un arbitrage commercial. Un consentement jamais recueilli AVERTIT et laisse passer — l'avertissement est visible, et la décision est journalisée avec ce qui manquait. Même règle pour un refus antérieur chez ce client : il s'affiche, il se journalise, il n'empêche rien.",
    supersedes:
      "« Consentement absent → bandeau : “sans consentement, ce profil ne peut pas être positionné” » (PDF-02:246-248), qui fait du consentement JAMAIS RECUEILLI un blocage. La source se contredit à un document d'écart : « Un consentement expiré REFUSE un positionnement. C'est le seul refus dur. » (PDF-05:302-303, répété en 365), complété par « Un refus antérieur chez ce client n'empêche rien : il s'affiche et se journalise » (PDF-05:303). Louis a tranché le 28/08/2026 pour la seconde formulation — celle que le code appliquait déjà.",
    codeState: 'implemented',
    // GARDÉE, et sur les DEUX moitiés : `submission-preflight.spec.ts` porte
    // « REFUSE un consentement expiré — ce n'est pas un avertissement de plus »
    // ET « distingue “aucun consentement recueilli” de “consentement expiré” ».
    // La seconde est celle qui compte : sans elle, fusionner les deux états
    // passerait au vert.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/consultants/matching/submission-preflight.ts',
      'apps/api/src/modules/consultants/matching/submission-preflight.spec.ts',
      'apps/api/src/modules/consultants/matching/matching.controller.ts',
      'packages/contracts/src/schemas/talent-consent.ts',
      'packages/contracts/src/schemas/talent-consent.test.ts',
    ],
    gap: "Deux limites à connaître avant de citer cette entrée. (1) `consentState` voyage en `string` NU jusqu'à la préflight — `match.ts:375` et le paramètre de `submissionPreflight` — alors que `CONSENT_STATES` en nomme quatre (`none`, `valid`, `expiring`, `expired`). Une cinquième valeur, ou une faute de frappe, tombe dans la branche finale et s'affiche « son consentement est valide » : un verdict conclu d'un silence. Rien ne l'attrape, parce que rien ne contraint le type. (2) `expiring` n'est pas distingué par la préflight : elle rend « valide jusqu'au … » avec la DATE, ce qui est exact, mais le bandeau des 30 jours (`CONSENT_WARNING_DAYS`) vit ailleurs — deux endroits parlent de la même échéance.",
    nextPack: null,
  },
  {
    key: 'c46_marge_par_client',
    theme: 'Back-office',
    canonical:
      "Le coût fournisseur agrégé — par fournisseur, par fonction, par espace, par compte — et la marge par client sont des chiffres d'ÉDITEUR : ils vivent au back-office et ne sortent jamais côté application. Ce que l'application annonce est un CRÉDIT, jamais un euro de coût.",
    supersedes:
      "« La marge par client côté application », refusée au §6 du PDF-02 (PDF-02:400-410) et redite au PDF-13:256-264 (« ce qui vit au back-office et nulle part ailleurs »). Et sa version déjà survenue : l'en-tête de fiche compte affichait « Coût : 0,25 € » — le coût fournisseur brut, lisible par un client pendant une démonstration (restitution TF1 p9).",
    codeState: 'implemented',
    // GARDÉE par la PORTE, qui est ce qui tient réellement la règle :
    // `internal-team-kpis.controller.spec.ts` vérifie que le contrôleur qui sert
    // les agrégats porte `InternalSecretGuard` au niveau de la CLASSE, et
    // `AccountCostChip.test.tsx` que l'en-tête de compte annonce un crédit et
    // jamais un coût fournisseur.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/analytics/internal-team-kpis.controller.ts',
      'apps/api/src/modules/analytics/internal-team-kpis.controller.spec.ts',
      'apps/api/src/modules/analytics/cost-alert.service.ts',
      'apps/dashboard-manager/src/lib/costs.ts',
      'apps/web/src/features/accounts/view/account-detail/components/AccountCostChip.test.tsx',
    ],
    gap: "⚠️ Ce refus n'est PAS « tenu par absence », et le croire mènerait à la mauvaise conclusion. Les agrégats EXISTENT et sont calculés : `CostOverview` porte `byProvider`, `byFeature`, `byWorkspace` et `topAccounts`, et le panneau du back-office titre littéralement « Par espace de travail — Les 20 premiers — la marge par client ». Ce qui tient la règle est leur PLACEMENT : derrière `InternalSecretGuard`, consommés par le back-office éditeur seul. Ce qu'aucune garde n'attrape : une route côté application qui recalculerait le même agrégat depuis `provider_costs`. ⚠️ Second piège de lecture : la marge d'une MISSION est un autre chiffre — celui de l'ESN sur son client, gouverné par le droit financier et tenu par `finance-redaction-single-path.spec.ts`. Citer cette entrée pour la refuser serait un contresens.",
    nextPack: null,
  },
  {
    key: 'c47_cout_acces',
    theme: 'Accès',
    canonical:
      "Le coût d'accès à un compte est DÉCLARÉ par quelqu'un — jamais estimé, jamais moyenné. Au stade registre il n'est pas connaissable : l'axe SORT du dénominateur et il est NOMMÉ, plutôt que tu. Et il ne s'agrège jamais entre espaces : les espaces sont des ESN, donc des concurrents, et un coût mutualisé serait un échange d'informations tarifaires.",
    supersedes:
      "« Un coût d'accès estimé » (PDF-04:328) — « c'est sur ce chiffre qu'on négocie ». Une moyenne de marché appliquée à un cas particulier est un chiffre inventé, et celui-là se paie à la table.",
    codeState: 'implemented',
    // GARDÉE deux fois, sur les deux flancs :
    //  · `test_the_three_axes_that_registry_stage_cannot_know_are_named` exige
    //    que `access_cost` figure parmi les axes NON MESURÉS au stade registre ;
    //  · GA-43 (`community-aggregation-kinds.spec.ts`) refusait son agrégation
    //    entre espaces JUSQU'AU 09/10/2026 — elle garde désormais la base
    //    anonyme commune (`c92_base_anonyme_commune`), voir `gap`.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/account-access/account-access.service.ts',
      'apps/ia/app/services/discover_scoring.py',
      'apps/ia/tests/test_discover_scoring.py',
      'apps/api/src/architecture/community-aggregation-kinds.spec.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx',
    ],
    gap: "⚠️ Trois commentaires du dépôt citent « D60 » pour cette règle (`account-access.service.ts:33`, `discover_scoring.py:876`, `TabAccess.tsx:285`) et le numéro seul ne suffit pas à la retrouver : D60 est SCOPÉ (GA-40). Celui-ci est le D60 du **tome 1** (`agent_docs/tome1-pivot-accessibilite-2026-08-20.md:381`, « coût d'accès — déclaratif uniquement — retenu ») ; il existe un AUTRE D60, celui du PDF 7 (`agent_docs/pdf7-integrations-connecteurs-2026-08-21.md:270`, Airtable et CVthèques). Ce que les gardes ne couvrent pas : le RENDU. Elles tiennent le calcul au stade registre ; rien n'empêcherait un écran d'afficher une moyenne calculée ailleurs. ⚠️ 09/10/2026 — « il ne s'agrège jamais entre espaces » est REMPLACÉ par `c92_base_anonyme_commune` (décision Louis) : GA-43 ne refuse plus la nature `cost`, elle garde le seuil de trois espaces et l'anonymat. Le coût d'accès n'entre dans AUCUNE des briques livrées par P05 ; `COMMUNITY_FORBIDDEN_KINDS.cost` reste dans `community-facts.ts` et l'agrégation communautaire de `access_facts` ne le lit toujours pas. L'ouvrir demande ce que seul Louis peut fournir : la relecture juridique de l'échange d'informations tarifaires entre concurrents (tome 8, D70 et §54). La partie « déclaré, jamais estimé » de cette entrée ne bouge pas. ⚠️ 17/10/2026 (#4016.L4, décision Louis 11/10, `c95_estimation_badgee`) — « jamais estimé » est RENVERSÉ EN PARTIE : sans coût déclaré sur un compte, l'onglet Accès montre UNE déclaration de l'ESPACE LUI-MÊME sur un autre de ses comptes au même verrou, badgée « estimé », nommée et datée (`estimateAccessCost`, `access-cost-estimate.ts`). Ce qui ne bouge pas : jamais moyenné, jamais à la place d'une déclaration, et jamais lu hors de l'espace (art. 101 TFUE — non négociable de l'épopée #4016).",
    nextPack: null,
  },
  {
    key: 'c48_score_entite',
    theme: 'Accès',
    canonical:
      "⚠️ PRÉCISION DATÉE du 13/10/2026 (Louis, QCM, épopée #4016 L9.a) : un score de compte — score du dossier en sept axes ET score d'une filiale / BU — s'affiche dès DEUX axes évaluables (`ACCOUNT_SCORE_MIN_EVALUATED_AXES`, `account-score.ts` ; c'était trois pour le dossier, un seul fait pour l'entité) et dit TOUJOURS son nombre d'axes (« 2 axes sur 7 évalués », « 2 axes sur 4 évalués ») ; sous deux axes, pas de score, les axes connus restent visibles. GA-58 et `un-score-dit-ses-axes-non-evaluables` DISENT NON à un score à un axe et à un score sans nombre d'axes. " +
      "⚠️ RENVERSEMENT DATÉ du 11/10/2026 (Louis, épopée #4016 lot L9 : « score des filiales et BU affiché avec ses axes »). Le nombre s'affiche désormais, MAIS décomposé : `entityScoreLine` pose avec le total les points de chaque axe qui a un fait et NOMME les axes non évaluables (jamais un « 0 »), et se tait quand aucun axe n'a de fait. Ce qui reste : `TabAccess.tsx` ne lit jamais `.score` lui-même (GA-58 réécrite). Texte d'avant le renversement : " +
      "Le rang d'entrée d'une entité ORDONNE la liste, il ne s'affiche pas. Ce qui se montre est sa RAISON — « vous avez trois contacts chez elle » —, jamais son nombre : un second score d'entité posé à côté de celui du compte divergerait au premier ajustement de barème, et personne ne saurait lequel croire.",
    supersedes:
      "« Un second score d'entité concurrent — deux nombres qui divergeraient au premier ajustement » (PDF-04:331-333). Et la lecture INVERSE qu'en fait le tracker de la passe B (item I-112), qui compte le barème d'entité 25/25/20/15/10/5 comme un manque `ABSENT` : ce n'est pas un manque, c'est l'application du refus — le barème existe (`rankAccessEntities`), il classe, il ne s'affiche pas.",
    codeState: 'implemented',
    // GARDÉE depuis le 28/08 par GA-58, et elle ne l'était PAS avant : le refus
    // tenait par OMISSION — personne n'avait écrit `{entity.score}`. La garde
    // prouve les deux choses que ce dépôt exige : elle lit un corpus non vide
    // (l'écran existe, le champ y est déclaré, le calcul rend bien un nombre)
    // et elle sait dire NON (un `{entity.score}` posé dans le JSX la fait
    // échouer, vérifié en cassant volontairement le fichier).
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/access-entities.ts',
      'packages/contracts/src/schemas/access-entities.test.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx',
      'apps/web/src/architecture/entity-rank-score-stays-internal.test.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/entityScoreLine.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/entityScoreLine.test.ts',
      'packages/contracts/src/schemas/account-score.ts',
      'packages/contracts/src/schemas/account-score.min-axes.test.ts',
      'apps/web/src/architecture/un-score-dit-ses-axes-non-evaluables.test.tsx',
    ],
    gap: "Le champ VOYAGE toujours jusqu'au client : `score` est dans la réponse de `GET /accounts/:id/access` et dans le type `Landscape` de `TabAccess.tsx:24`. Le retirer serait plus fort qu'une garde — c'est un chantier d'API, pas une ligne de registre —, et tant qu'il voyage, GA-58 ne refuse que le RENDU sur cet écran-là. Un second consommateur du même endpoint n'hériterait de rien.",
    nextPack: null,
  },
  {
    key: 'c49_interet_et_adressabilite',
    theme: 'Découvrir',
    canonical:
      "L'intérêt et l'adressabilité sont DEUX nombres qui ne se fondent jamais. « Intérêt 68/80 · adressabilité 4/20 » dit « parfait, et hors de portée » ; leur somme dit 61, et c'est ce compte-là qui sortirait en tête de liste. Le tri « équilibré » les combine par un PRODUIT — jamais une moyenne, qui rattrape un compte verrouillé par sa moitié forte — et vaut `null` dès qu'un des deux manque.",
    supersedes:
      "« Fondre l'intérêt et l'accessibilité en un seul nombre » (PDF-04:326). L'argument qui a tranché est arithmétique et se vérifie : la moyenne de 68/80 et de 4/20 vaut la moyenne de 40/80 et de 12/20, et les deux comptes n'ont rien à voir.",
    codeState: 'implemented',
    // GARDÉE côté IA, là où la fusion se produirait :
    // `test_addressability_is_a_separate_number_never_folded_into_the_score`
    // vérifie qu'AUCUN facteur d'adressabilité n'entre dans la somme d'intérêt,
    // et que le total d'intérêt reste borné à `DISCOVER_SCORE_MAX - 20`.
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/discover_scoring.py',
      'apps/ia/tests/test_discover_scoring.py',
      'packages/contracts/src/schemas/discover.ts',
      'apps/web/src/features/discover/lib/discover-ranking.ts',
    ],
    gap: "Le PRODUIT n'est couvert par AUCUN test : `balancedRatio` (`discover-ranking.ts:151`) n'apparaît pas dans `discover-ranking.test.ts`, ni le tri `balanced`. Ce qui est gardé est la SÉPARATION — aucun facteur d'adressabilité dans la somme d'intérêt —, pas la formule qui les recombine pour trier ; une moyenne écrite à la place du produit passerait au vert. ⚠️ À ne pas confondre avec `c32_deux_notes`, qui porte les deux notes d'un BESOIN (correspondance et poussabilité d'un profil) : même forme d'arbitrage, autre objet, autres porteurs.",
    nextPack: null,
  },
  {
    key: 'c50_second_pipe',
    theme: 'Board Missions',
    canonical:
      "Le board Missions à douze colonnes est une PROJECTION : il ne possède AUCUN état. Chaque carte reste possédée par son objet d'origine — un projet garde son étape, une mission garde son statut — et déplacer une carte écrit sur cet objet-là, jamais sur la carte. Ce qui est refusé est un TROISIÈME jeu d'états, pas le geste.",
    supersedes:
      "« Un second pipe » — un board qui porterait ses propres colonnes comme états, refusé au §6 des refus de périmètre du PDF-02 et posé en décision D2 du PDF 5 §2. ⚠️ Et sa formulation INTERMÉDIAIRE, qui est la vraie raison d'écrire cette entrée : le changelog du 19/08 dit « C'est une VUE, pas un second pipe » puis, deux lignes plus bas, « On n’y déplace donc pas les cartes » (`packages/contracts/src/changelog/labels.fr.ts`, entrée `2026-08-19-board-missions`). Elle confondait le refus d'un jeu d'états avec le refus du GESTE. Le déplacement est livré depuis le 21/08 — le changelog de ce jour-là le dit correctement : « Déplacer une carte n'invente aucun état : l'écriture retombe sur l'objet d'origine » — et l'exécuteur date du 26/08. Citer « lecture seule » pour refuser quelque chose serait citer une phrase morte.",
    codeState: 'implemented',
    // GARDÉE par GA-61 (`mission-board-owns-no-state.spec.ts`), qui tient la
    // règle par ce qui la rendrait fausse :
    //  · chaque `changes` des douze transitions ne nomme que des colonnes de
    //    `missions.*` ou `projects.*` — un `mission_board.*` la fait échouer ;
    //  · aucune migration ni entité ne PERSISTE une colonne de board ;
    //  · `columnForMission` et `columnForProject` restent totales sur les états
    //    d'origine, donc la colonne reste DÉRIVÉE.
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/mission-board.ts',
      'packages/contracts/src/schemas/board-move.ts',
      'apps/api/src/architecture/mission-board-owns-no-state.spec.ts',
      'apps/api/src/modules/delivery/mission-board.service.ts',
      'apps/api/src/modules/delivery/board-move-executor.spec.ts',
    ],
    gap: "Trois écarts, tous mesurés le 28/08 en écrivant GA-61 — et les deux premiers ont été TROUVÉS par elle. (1) `shortlist_prete` est une colonne que RIEN ne produit : ni `columnForProject`, ni `columnForMission`, ni le service. Elle est toujours vide, et c'est exactement la forme qu'un second pipe prendrait — une colonne qui n'a de sens que si quelqu'un l'écrit à la main. GA-61 la NOMME plutôt que de la tolérer en silence, et tombera le jour où une TROISIÈME colonne rejoindra cette liste. (2) Les cinq colonnes AMONT annoncent `project_needs.status` (et `submissions.submitted_at`) alors que la colonne d'une carte de projet se DÉRIVE de `projects.stage` — deux champs différents —, et que `moveBoardCard` REFUSE ces colonnes (`statusForColumn` rend `null`, le service rend `not_found`). Le geste amont se fait sur l'écran des Projets, comme le dit `mission-board.ts` ; ce que le panneau annonce n'est donc pas ce que ce chemin-là exécute. À vérifier côté écran avant d'y toucher : ce n'est PAS un second pipe, c'est un affichage à recouper. (3) Le commentaire d'en-tête de `mission-board.ts:22-24` porte encore la phrase du 19/08 (« on ne déplace pas une carte dans ce board ») alors que `board-move.ts:17-21` la corrige (« Ce que D2 interdit est un troisième jeu d'états, pas le geste »). Aucune garde ne peut attraper deux commentaires qui se contredisent ; cette entrée est ce qui tranche entre eux.",
    nextPack: null,
  },
  {
    key: 'c51_tableau_recruteur',
    theme: 'Navigation',
    canonical:
      "Recruteur et commercial travaillent sur les MÊMES écrans : les besoins ouverts (`/projects/needs`, onglet de la section Projets) et le vivier (`/consultants`). Ce qui les sépare est une PERMISSION, jamais un écran — la navigation garde sur un droit, jamais sur un rôle littéral, et un rôle n'ouvre aucune dixième entrée de premier niveau.",
    supersedes:
      "« Un tableau de bord recruteur séparé », refusé au §6 des refus de périmètre du PDF-02 (PDF-02:400-410). Deux écrans pour le même stock de besoins produisent deux vérités sur ce qui presse, et le jour où l'un des deux gagne une colonne l'autre ne l'a pas. C'est aussi la raison qui a fait de `/projects/needs` un ONGLET et non une entrée de nav : au-delà de dix entrées, on n'utilise plus que les trois qu'on connaît.",
    codeState: 'implemented',
    // GARDÉE des deux côtés, et c'est la conjonction qui tient la règle :
    //  · `nav-gates-on-permission.test.ts` refuse toute comparaison de rôle
    //    littérale dans la navigation — `recruiter` y est nommé ;
    //  · `sections.test.ts` refuse une dixième section et une route déclarée
    //    deux fois ;
    //  · GA-62 (`no-separate-recruiter-dashboard.test.ts`) ferme le troisième
    //    flanc : aucune section de nav n'est réservée à un métier, les deux
    //    écrans partagés ne se branchent sur aucun rôle, et `/projects/needs`
    //    porte le MÊME palier que le pipe.
    enforcement: 'guarded',
    holders: [
      'apps/web/src/components/navigation/sections.ts',
      'apps/web/src/components/navigation/sections.test.ts',
      'apps/web/src/test/nav-gates-on-permission.test.ts',
      'apps/web/src/architecture/no-separate-recruiter-dashboard.test.ts',
      'apps/web/src/routes/projects/needs.tsx',
    ],
    gap: "Ce qu'aucune garde ne voit : un écran PARTAGÉ dont le contenu se réduirait à un métier — un composant de `open-needs/` qui masquerait la moitié commerciale sur un test de permission trop étroit resterait vert. GA-62 lit les deux répertoires d'écran et refuse qu'ils comparent un rôle, ce qui attrape la forme la plus probable de la faute ; elle ne sait pas juger un contenu. ⚠️ À ne pas confondre avec `managerOnly`, qui existe et reste légitime : « Pilotage » est réservé au responsable parce que son ENDPOINT l'est. Ce qui est refusé est un écran réservé à un MÉTIER dont l'API est ouverte à tous — le déplacement de `/pilotage/rex` sous Missions le 28/08 est précisément la correction de cette faute-là.",
    nextPack: null,
  },

  /* ═══════════════════════════════════════════════════════════════════════════
   * LES SIX REFUS DU COCKPIT ET DU VIVIER — 28/08/2026.
   *
   * Sur les 128 exigences du PDF-02, neuf restaient non closes au recomptage de
   * clôture. Six n'étaient pas du code manquant : c'étaient des arbitrages
   * appliqués depuis des semaines, dont la raison ne vivait que dans un
   * commentaire — et un commentaire est invisible à la mesure suivante, qui le
   * recompte `ABSENT` et fait re-coder ce qui avait été refusé. Deux démentis de
   * ce chantier viennent exactement de là (« le refus X n'est écrit nulle
   * part » — il l'était, sous un autre mot).
   *
   * ⚠️ Ils ont tous la même forme, et elle est plus rare que celle des lots
   * précédents : ce sont des CONTRADICTIONS ASSUMÉES avec la source. Le code ne
   * fait pas ce que PDF-02 demande, et c'est le code qui gagne. Chaque entrée
   * porte donc les deux formulations et dit pourquoi.
   * ═══════════════════════════════════════════════════════════════════════════ */

  {
    key: 'c52_capacite_equipe',
    theme: 'Cockpit',
    canonical:
      "⚠️ RENVERSEMENT DATÉ du 11/10/2026 (Louis, épopée #4016 lot L8 : « le commercial voit la capacité d'équipe ») : la route s'ouvre à `finance:read:own` — un siège `sales` reçoit désormais la capacité, TOUJOURS celle de l'équipe (aucun `?scope=own`, jamais « ma capacité »). Les rôles sans aucun droit financier restent refusés (403), et le bloc disparaît pour eux. Texte d'avant le renversement : " +
      "« Ce qu'il reste à vendre » décrit l'ÉQUIPE, jamais un portefeuille : la route reste sous `finance:read` SEUL et n'accepte AUCUN `?scope=own`. Un consultant n'a pas de propriétaire commercial, et lui en inventer un pour les besoins d'un filtre produirait une capacité fausse. Conséquence assumée : un siège `sales` — qui porte `finance:read:own` et non `finance:read` — reçoit un 403, et le bloc 4 du cockpit DISPARAÎT pour lui plutôt que d'afficher les jours d'une équipe présentés comme les siens.",
    supersedes:
      "« Bloc 4 “Ma capacité” : jours à vendre sur mes consultants, sur 90 jours. Valeur nulle plutôt que zéro » (PDF-02:154-157), qui place le bloc dans le cockpit du commercial (périmètre §3.1, PDF-02:93). C'est le CODE qui gagne, et sur le mot qui compte : « MES consultants » n'existe pas. Aucune colonne ne rattache un consultant à un commercial ; la seule capacité calculable est celle de l'espace, et l'afficher sous un « ma » en ferait le cinquième « mon pipe » identique de la même ESN — la faute que `c53` corrige de l'autre côté.",
    codeState: 'implemented',
    // GARDÉE sur les deux flancs, et c'est la conjonction qui tient la règle :
    //  · `finance-scope-is-asked.spec.ts` lit le contrôleur et exige que
    //    `@Get('capacity')` porte `@RequirePermission('finance:read')` — la
    //    chaîne cherchée inclut la parenthèse fermante, donc la variante à deux
    //    droits ne passerait pas —, ET que la RAISON reste écrite en toutes
    //    lettres à côté (« elle décrit l'ÉQUIPE » figure dans ses
    //    `WRITTEN_REFUSALS`) ;
    //  · `MyActivityBlock.test.tsx` vérifie qu'un refus fait DISPARAÎTRE le bloc
    //    et qu'il ne compte pas comme une panne — « 3 blocs sur 6 » dirait au
    //    commercial que le produit est cassé, alors qu'il lui manque un droit.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/delivery/finance.controller.ts',
      'apps/api/src/architecture/finance-scope-is-asked.spec.ts',
      'packages/contracts/src/schemas/workspace.ts',
      'apps/web/src/features/briefing/view/MyActivityBlock.tsx',
      'apps/web/src/features/briefing/view/MyActivityBlock.test.tsx',
    ],
    gap: "⚠️ 11/10/2026 (#4016 L8) : le point (2) ci-dessous est RENVERSÉ — un commercial voit désormais la capacité d'équipe (route ouverte à `finance:read:own`, `finance-scope-is-asked.spec.ts` réécrite). Restent du lot L8, NON faits : le CA potentiel des besoins pour `sales` (c53, couche kanban `NeedsKanban`) et le dernier TJM vendu sur la fiche (c57). Anciennes limites : Deux limites à connaître avant de citer cette entrée. (1) L'horizon n'est pas celui de la source : `CAPACITY_HORIZON_MONTHS = 3` (`apps/web/src/features/briefing/cockpit.ts:248`), soit trois mois pleins, là où PDF-02 dit « sur 90 jours ». Proche, pas identique — un mois de 31 jours écarte les deux, et personne ne l'a tranché. (2) Ce qui n'est tenu NULLE PART est la conséquence produit : qu'un commercial n'ait aucun chiffre de capacité est une décision, et elle ne se lit que par déduction (`sales` n'a pas le droit → 403 → bloc absent). Aucun test ne dit « et c'est voulu » ; cette entrée est ce qui le dit.",
    nextPack: null,
  },
  {
    key: 'c53_montant_du_pipe',
    theme: 'Cockpit',
    // ⚠️ DEUX PIPES, DEUX DROITS — depuis le revirement du 31/08/2026, cette
    // entrée n'a plus une seule réponse. Ne pas la citer sans dire LEQUEL.
    canonical:
      "(1) LE PIPE DES PROJETS (`ProjectsController.pipelineSummary`, `GET /projects/pipeline`) — INCHANGÉ : le montant n'est PAS sous droit financier. Ce que `finance:read` protège est la MARGE et le coût CHARGÉ — qui relève de la paie —, jamais le montant VENDU : `GET /delivery/missions` rend le tarif vendu de chaque mission à tout membre et ne vide que `marginPercent` (D45), et `missionSchema.daily_rate` dit en toutes lettres qu'il n'est délibérément pas derrière ce droit. `sales` ne porte pas `finance:read` — garder cette route derrière lui fermerait `/projects` au commercial dont c'est le pipe. (2) LE PIPE DES BESOINS — le cumul par colonne et le total « CA potentiel » du kanban `/projects/needs` (`NeedsKanban.tsx`, `OpenNeedsPage.tsx`) — REVIREMENT du 31/08/2026, Louis, EN CONNAISSANCE des deux raisons ci-dessus (il les a lues, il choisit quand même l'inverse pour CE cumul précis). Ce montant-là passe DÉSORMAIS derrière le droit financier : `useFinanceAccess()` (`GET /propagation/finance` → `canReadFinance` / `!denied`) décide, et sans ce droit le chiffre est RETIRÉ de l'écran — jamais mis à 0, un 0 se lisant comme une vraie mesure de pipe vide, ce qui serait un mensonge d'affichage pire que son absence. ⚠️ Le TJM affiché sur CHAQUE carte individuelle du même kanban (« 2 postes à 650 €/j ») N'EST PAS concerné par ce revirement : il reste public, exactement comme `c54_tarif_cible` le dit pour son équivalent côté vivier — voir cette entrée pour la raison de la distinction entre un montant AGRÉGÉ et un montant PORTÉ PAR UNE LIGNE.",
    supersedes:
      "« Sans le droit financier : les blocs 1, 2 et 4 disparaissent, les blocs 3, 5 et 6 restent » (PDF-02:188-190). Les blocs 2 (chiffre d'affaires) et 4 (capacité, `c52`) disparaissent bien ; le bloc 1 — le pipe DES PROJETS — ne disparaît toujours pas : la source trace la ligne du droit financier au mauvais endroit, elle range un montant vendu avec la marge, alors que le dépôt l'a tracée entre le VENDU et le CHARGÉ partout ailleurs. ⚠️ Une SECONDE couche, propre au kanban des BESOINS et distincte de la source ci-dessus : le 30/08/2026 (commit `d38fcc154`), ce même raisonnement avait été étendu au cumul de `NeedsKanban.tsx`, tenu par une garde qui savait dire NON (« ajouter `canReadFinance` la fait rougir », `NeedsKanban.test.tsx:106-135` d'alors). C'est CETTE extension du 30/08 — et elle seule, pas le raisonnement sur le pipe des projets — que le revirement du 31/08 annule : `NeedsKanban.test.tsx` a été réécrit pour tenir la règle INVERSE sur ce cumul précis, la même garde sachant désormais dire NON dans l'autre sens (retirer le filtre `canReadFinance` la fait rougir).",
    codeState: 'implemented',
    // GARDÉE par DEUX gardes, pour DEUX pipes :
    //  · le pipe des PROJETS reste tenu par `cockpit-scope-is-owned.spec.ts`,
    //    qui relit `ROLE_PERMISSIONS` (« `sales` n'a pas `finance:read` »,
    //    « la route ne porte AUCUNE permission financière ») ;
    //  · le pipe des BESOINS est tenu, depuis le 31/08/2026, par
    //    `NeedsKanban.test.tsx`, qui sait dire NON dans le sens INVERSE de
    //    l'ancienne garde : RETIRER le filtre `canReadFinance` la fait rougir.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/projects/projects.controller.ts',
      'apps/api/src/architecture/cockpit-scope-is-owned.spec.ts',
      'packages/contracts/src/schemas/mission.ts',
      'apps/web/src/features/briefing/view/MyActivityBlock.test.tsx',
      'apps/web/src/features/projects/open-needs/view/NeedsKanban.tsx',
      'apps/web/src/features/projects/open-needs/view/NeedsKanban.test.tsx',
      'apps/web/src/features/projects/open-needs/view/OpenNeedsPage.tsx',
      'apps/web/src/features/propagation/api.ts',
      'apps/web/src/features/projects/view/ProjectAmountControl.tsx',
      'apps/web/src/architecture/project-amount-stays-public.test.ts',
    ],
    gap: "⚠️ 15/10/2026 (#4016.8e, décision Louis 11/10) : le cumul du kanban des besoins et le « CA potentiel » s'ouvrent au commercial — ils se lisent désormais dès que la lecture financière répond (200 : `finance:read` OU `finance:read:own`, `canReadPipeAmounts`), et restent retirés — jamais à 0 — sans réponse ni droit. La marge d'équipe (`canReadFinance`) n'est PAS concernée. `NeedsKanban.test.tsx` tient les deux sens. Ancienne limite : Piège de lecture à connaître avant de citer un test comme preuve, sur le PIPE DES PROJETS uniquement : `MyActivityBlock.test.tsx` porte bien un cas « les blocs 1, 2 et 4 disparaissent ; 3 et 5 restent », et il passe — mais il MOQUE un 403 sur `/projects/pipeline`, un refus que la route ne peut pas rendre puisqu'elle ne porte aucune permission. L'ÉCRAN sait masquer le bloc 1 ; la production ne le lui demande jamais. Le test décrit donc une capacité de l'écran, pas le comportement livré. ⚠️ Second point, toujours sur le pipe des projets : le « bloc 6 » de la source (« ce qui a bougé depuis ma dernière visite ») existe sous un autre nom (`SinceLastVisitBlock`) et vit hors du cockpit. Sur le PIPE DES BESOINS en revanche, le gap est nul : la route qui alimente `NeedsKanban` (`GET /projects/needs`) ne porte aucun calcul serveur du cumul — le montant est dérivé côté écran à partir de `target_tjm_cents` déjà lu —, donc le retrait s'applique au SEUL endroit où le nombre existe.",
    nextPack: null,
  },
  {
    key: 'c54_tarif_cible',
    theme: 'Vivier',
    // ⚠️ Cette entrée N'A PAS été reversée le 31/08/2026 — voir `c53` pour ce
    // qui l'a été. Elle est réécrite ici pour TRACER la frontière entre les
    // deux, parce que `NeedsKanban.test.tsx` citait déjà les deux entrées
    // côte à côte avant le revirement et continue de le faire après.
    canonical:
      "Le tarif CIBLE d'un consultant (`consultantSchema.tjm`) est PUBLIC : il se saisit et se lit sans `finance:read`. Ce que le droit financier garde sont les ENTRÉES DE LA MARGE — le plancher (`min_tjm_cents`), le coût chargé (`cost_rate`) et le prix d'achat (`purchase_tjm_cents`). Un recruteur qui positionne un profil a besoin du prix de vente pour négocier ; ranger le tarif cible avec les trois autres masquerait un champ que la liste rend déjà à tout le monde (`talent.service.ts:478`, hors du bloc conditionné). ⚠️ INCHANGÉ par le revirement du 31/08/2026 (Louis) sur `c53_montant_du_pipe` : ce jour-là, seul le cumul AGRÉGÉ du kanban des besoins (le total par colonne, le « CA potentiel ») est passé derrière le droit financier — pas le tarif PORTÉ PAR UNE LIGNE. Le TJM cible affiché sur chaque carte du kanban des besoins (`NeedsKanban.tsx`, « 2 postes à 650 €/j ») reste donc public, exactement comme le tarif cible d'un consultant sur le vivier : c'est la MÊME famille de montant — un prix de vente espéré, pas la marge — et c'est pour ça que les deux entrées se citaient déjà l'une l'autre avant même ce revirement. Un agrégat qui somme des besoins qu'un lecteur donné n'a pas tous ouverts n'est pas la même divulgation qu'une ligne qu'il regarde déjà.",
    supersedes:
      "« Bloc 3 : les trois tarifs — coût chargé, tarif cible, tarif vendu — sous le droit financier » (PDF-02:227-228). ⚠️ La source et le code parlent tous deux de TROIS montants, et ce ne sont pas les mêmes trois : la source dit coût chargé · tarif cible · tarif vendu, le code garde plancher · coût chargé · prix d'achat. Deux écarts, donc — le tarif cible SORT du droit financier (ici), et le tarif vendu n'a pas de champ sur la fiche (`c57`). C'est la même ligne que `missionSchema.daily_rate`, signalée deux fois comme une fuite le 28/08/2026 et mesurée FAUSSE les deux fois.",
    codeState: 'implemented',
    // GARDÉE en ÉCRITURE par `consultant-finance-write.spec.ts`, qui tient les
    // deux moitiés : un rôle sans `finance:read` n'écrit pas les trois montants
    // (et ils sont RETIRÉS, pas mis à `null` — sinon la mise à jour EFFACE), et
    // « laisse passer le TJM cible et le reste de la fiche » est le NON de la
    // garde : emporter `tjm` dans la rédaction la ferait échouer. Côté BESOINS,
    // `NeedsKanban.test.tsx` tient la même frontière à la LECTURE : le TJM par
    // carte reste affiché quel que soit `canReadFinance`, pendant que le cumul
    // de colonne (c53) disparaît sans lui — un même fichier de test qui sait
    // dire non dans les DEUX sens à la fois.
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/consultants/view/ConsultantFormDialog.tsx',
      'apps/api/src/modules/consultants/consultant-finance-write.spec.ts',
      'apps/api/src/modules/consultants/talent.service.ts',
      'packages/contracts/src/schemas/consultant.ts',
      'packages/contracts/src/schemas/mission.ts',
      'apps/web/src/features/projects/open-needs/view/NeedsKanban.test.tsx',
    ],
    gap: "La garde porte sur l'ÉCRITURE côté consultant. La LECTURE de la liste rédige à la main dans `talent.service.ts:478-495` — un `...(visibility.finance ? … : …)` — hors de `redactFinance`, dont `REDACTED_FINANCE_FIELDS` ne connaît que `margin`, `marginPercent`, `loadedDailyCostCents` et `terms`. Rien ne tomberait si quelqu'un déplaçait `tjm: row.tjm` À L'INTÉRIEUR du bloc conditionné : la colonne tarif du vivier disparaîtrait pour un recruteur, et aucun test ne le dirait. ⚠️ Et l'unité diverge d'un champ à l'autre — `tjm` en EUROS, les trois autres en CENTIMES —, ce qui est écrit et voulu (`consultant.ts:153-162`) mais fait de toute comparaison entre eux un piège.",
    nextPack: null,
  },
  {
    key: 'c55_cockpit_pas_en_tete',
    theme: 'Briefing',
    canonical:
      "Le cockpit « Mon activité » vient APRÈS les actions proposées, ce qui a bougé et les tâches, et AVANT l'agenda — jamais en tête de `/briefing`. Un commercial ouvre cet écran pour savoir quoi faire ; où il en est vient juste après, et pas en premier : un tableau de bord en haut d'un briefing quotidien se lit une fois, puis se saute. L'ordre est un arbitrage, pas une mise en page.",
    supersedes:
      "« Route : /briefing, en tête, au-dessus de la journée » (PDF-02:115), qui fait du placement une exigence explicite. Le dépôt place le cockpit en quatrième position et l'assume ; la raison est écrite au-dessus de la section qui le porte (`BriefingPage.tsx:151-159`) depuis sa livraison, et c'est la seule chose qui l'a protégé jusqu'ici.",
    codeState: 'implemented',
    // `held` et non `guarded` : la règle est appliquée à UN endroit — l'ordre
    // des `<Section>` dans `BriefingPage.tsx` — et rien ne la vérifie.
    enforcement: 'held',
    holders: ['apps/web/src/features/briefing/view/BriefingPage.tsx'],
    gap: "Aucune garde, et c'est délibéré : une garde sur l'ordre des sections figerait une mise en page plutôt qu'une règle, et rougirait le jour où le briefing gagne une section pour une raison qui n'a rien à voir. Ce qui manquait n'était donc pas un test mais une TRACE opposable — la prochaine relecture de PDF-02 lisait « en tête » et ne trouvait aucune raison écrite ailleurs que dans un commentaire de JSX. Conséquence à connaître : si quelqu'un remonte le cockpit demain, rien ne tombera ; c'est cette entrée qu'il faudra citer, pas une CI rouge.",
    nextPack: null,
  },
  {
    key: 'c56_etapes_du_pipe',
    theme: 'Cockpit',
    canonical:
      "Le bloc 1 ventile sur les CINQ étapes du pipe (`PIPELINE_STAGES` : qualifié · confirmé · profils proposés · négociation · gagné). « Détecté » et « potentiel » sont des états d'ENTRÉE, comptés à part dans l'entonnoir (`intake`) et affichés pour ce qu'ils sont — un compte, SANS montant : un projet détecté par une analyse n'est pas encore un projet qu'un humain a repris, et en faire une étape du pipe présenterait comme du travail en cours ce que personne n'a regardé. Les SIGNAUX sortent à leur tour de l'entonnoir, et sont comptés à part encore : un fait daté qui annonce peut-être un projet n'est pas un projet en attente.",
    supersedes:
      "« Bloc 1 : 6 barres — détecté · potentiel · qualifié · proposition · négociation · gagné » (PDF-02:124-126). Les deux premières ne sont pas des barres. L'argument s'est vérifié en production le 17/08 : l'entonnoir affichait 439 quand la lentille Portefeuille en annonçait 211, et deux chiffres pour la même chose sur le même écran ne se croient ni l'un ni l'autre.",
    codeState: 'implemented',
    // GARDÉE côté contrat, là où la fusion se produirait :
    // `project.pipeline.test.ts` exige que `detected` / `potential` sortent des
    // colonnes et tombent dans `intake`, que le montant posé sur un projet non
    // encore regardé n'entre PAS au total, que les signaux soient comptés à
    // part, et que les cinq colonnes s'affichent MÊME VIDES — une colonne
    // absente se lirait « il manque une étape ». `PIPELINE_STAGES` est par
    // ailleurs figé par `enum-baseline.ts` (GA-08) : la liste ne peut ni perdre
    // une valeur ni en insérer une au milieu.
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/project.ts',
      'packages/contracts/src/schemas/project.pipeline.test.ts',
      'packages/contracts/src/schemas/enum-baseline.ts',
      'apps/web/src/features/briefing/view/MyActivityBlock.tsx',
      'apps/web/src/features/briefing/view/MyActivityBlock.test.tsx',
    ],
    gap: "Deux choses que cette entrée ne règle pas. (1) Les LIBELLÉS divergent de la source sans que ce soit tranché : PDF-02 dit « proposition », le dépôt dit `profiles_submitted` (« profils proposés »), et chaque barre porte en outre le libellé RENOMMABLE de l'espace (`column.label`) — le recopier en dur ferait diverger le cockpit du kanban, donc la source ne peut pas être appliquée à la lettre de toute façon. (2) L'entonnoir ne FILTRE pas : chaque barre du pipe mène à sa liste filtrée (PDF-02:127, livré), mais `detected` n'est pas une colonne du tableau et le bloc refuse de prétendre le contraire — un lien qui n'aboutirait à rien serait pire que pas de lien.",
    nextPack: null,
  },
  {
    key: 'c57_tarif_vendu_sur_la_fiche',
    theme: 'Vivier',
    canonical:
      "Le tarif VENDU n'a pas de champ sur la fiche d'un consultant : il appartient à la MISSION (`missions.daily_rate`), parce qu'un prix vendu est négocié pour UN client, à UNE date, sur UN périmètre. Une fiche porte ce qui est vrai du consultant — son tarif cible, son plancher, son coût, son prix d'achat —, jamais un prix qui n'a de sens qu'en face de quelqu'un. Le recopier sur la fiche en ferait une dérivation à DEUX endroits, et les deux divergeraient à la mission suivante.",
    supersedes:
      "« Bloc 3 : les trois tarifs — coût chargé, tarif cible, tarif vendu — sous le droit financier » (PDF-02:227-228), dont le troisième n'a jamais eu de champ sur une fiche : le formulaire porte `tjm`, `min_tjm`, `cost_rate` et `purchase_tjm`, et rien d'autre. ⚠️ Et la formulation INTERMÉDIAIRE de la mesure du 28/08, qui plaçait le tarif vendu dans `mission_commercial_terms` : c'est FAUX, et le croire mènerait à le chercher derrière `finance:read`. Cette table porte les ENTRÉES DE LA MARGE (coût chargé, canal, commission d'intermédiaire, conditions de facturation) ; le tarif vendu est `missions.daily_rate`, il est rendu à tout membre, et son exposition sans droit financier est délibérée (`mission.ts:100-109`).",
    codeState: 'implemented',
    // `unenforced`, et c'est exact : le refus tient par une OMISSION — aucun
    // champ, donc rien à casser, donc rien à garder. C'est le motif de
    // `c48_score_entite` AVANT GA-58, et la même leçon : une omission n'est pas
    // une règle. La différence est qu'ici il n'y a même pas de champ qui voyage,
    // donc une garde n'aurait rien à lire — elle serait verte sur du vide.
    enforcement: 'unenforced',
    holders: [
      'packages/contracts/src/schemas/consultant.ts',
      'packages/contracts/src/schemas/mission.ts',
      'apps/web/src/features/consultants/view/ConsultantFormDialog.tsx',
    ],
    gap: "⚠️ 15/10/2026 (#4016.8e, décision Louis 11/10) : le « dernier TJM vendu » est PROPAGÉ en lecture seule vers la ligne du vivier (`lastMission.dailyRate`, `last-mission-view.ts`), exactement l'alternative décrite ci-dessous — jamais un champ saisi sur la fiche ; `null` (non saisi, nul ou négatif) = aucune ligne, jamais 0 €/j. Ancienne limite : DÉCISION PRODUIT NON CONFIRMÉE au 28/08/2026 — la seule entrée du registre dans ce cas, et elle le dit plutôt que de se faire passer pour un arbitrage tenu. Ce qui est établi : le champ n'existe pas, et PDF-02:227 le demande (seul `ABSENT` restant du recomptage de clôture). Ce qui ne l'est pas : lequel des deux a raison. L'ALTERNATIVE, si l'arbitrage tombe dans l'autre sens, n'est PAS un champ saisissable — ce serait un « dernier tarif vendu » PROPAGÉ en lecture seule depuis la mission la plus récente, non éditable sur la fiche, conforme à la règle « un bloc propagé ne s'édite jamais sur place » (§4.4). Ce serait alors une propagation, pas un tarif de plus, et c'est cette distinction qui décide — pas le besoin d'afficher le chiffre. Tant que la question n'est pas tranchée, cette entrée dit ce que le code fait et pourquoi, sans fermer le débat.",
    nextPack: null,
  },
  {
    key: 'c58_criteres_proteges',
    theme: 'Conformité',
    canonical:
      "L'âge, le genre, l'origine, la nationalité, la photo, la situation familiale et l'adresse d'une personne ne pèsent JAMAIS dans son rang — ni dans le code qui calcule, ni dans le PROMPT qui note. L'interdit porte sur l'usage CLASSANT, pas sur l'existence du champ : une photo s'affiche sur une fiche, elle n'ordonne pas des gens. Deux exceptions NOMMÉES dans la charge utile d'un prompt : l'identité, parce que le livrable désigne la personne et que la réponse du modèle se recolle à sa graine par le nom, et la ville / le pays, plus grossiers que le code postal que la source autorise.",
    supersedes:
      "« Un test statique sur les sources suffit » — la formulation du PDF 9 §6.2 (PR1), tenue depuis par `protected-criteria.spec.ts`. Elle est juste et incomplète : une garde qui ne relit que du code est verte pendant qu'un champ protégé voyage dans un prompt de notation, puisque aucune ligne ne le « lit ». Mesuré le 29/08 : la graine de la phase 2 portait `photoUrl` et partait telle quelle dans `bellum_contacts` (priorité 1-5, rôle, niveau d'influence par personne) et `bellum_organigramme` (chaîne de décision).",
    codeState: 'implemented',
    // GARDÉE des deux côtés, et par deux moyens différents — c'est ce qui rend
    // la règle tenable. Côté API : `protected-criteria.spec.ts` (GA-06) relit
    // les sources des moteurs de sélection, avec deux périmètres. Côté IA :
    // `test_protected_criteria_scoring.py` relit les sources du calcul de rang
    // ET exécute la vraie phase 3 avec une graine empoisonnée pour lire le
    // texte réellement envoyé au modèle. Le parsing de CV a sa propre garde
    // (`test_cv_parse.py`).
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/protected_criteria.py',
      'apps/ia/tests/test_protected_criteria_scoring.py',
      'apps/api/src/architecture/protected-criteria.spec.ts',
      'apps/ia/app/prompts/bellum_cv_parse.py',
      'apps/ia/tests/test_cv_parse.py',
    ],
    gap: "Rien n'interdit de DÉDUIRE un critère protégé plutôt que de le lire : un modèle à qui l'on donne un prénom et une photo de profil peut inférer un genre, et aucune garde ne l'attrape — l'interdit porte sur les CHAMPS, jamais sur l'inférence. Le retrait de la photo réduit la surface sans la fermer. Par ailleurs le périmètre surveillé est une LISTE écrite à la main : un prompt de notation créé demain n'y entre pas tout seul, et c'est le prix d'une garde qui ne crie pas au loup.",
    nextPack: null,
  },
  {
    key: 'c59_plafond_copilote',
    theme: 'Plafond du copilote',
    canonical:
      'Le plafond quotidien du copilote borne les DEMANDES, pas les allers-retours que Laura provoque elle-même : répondre à une question de précision ne consomme rien. Et ce qui ouvre ce passage est le marquage que Laura pose ELLE-MÊME en appelant `ask_clarification` — jamais une relecture de son texte.',
    supersedes:
      "« Tout message de rôle `user` compte », la règle du 31/07 — juste tant que Laura ne posait pas de questions. Depuis le lot « demander avant de chercher » (29/08), sur une question toutes les trois demandes, 50 messages ne valent plus que ≈ 37 demandes utiles : celui à qui elle ne demande jamais rien est avantagé, celui qu'elle interroge est puni.",
    codeState: 'implemented',
    // La règle est tenue par DEUX gardes, parce qu'elle a deux façons de casser
    // et qu'elles ne se ressemblent pas. GA-90 tient la SOURCE du marquage (une
    // exonération qui déborde ne casse rien : elle fait disparaître le plafond
    // en silence). GA-91 tient les BORNES (sans elles, un fil qui tourne en
    // rond ne consomme rien).
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/ia-proxy/chat-quota.ts',
      'apps/api/src/modules/ia-proxy/chat-messages.service.ts',
      'apps/api/src/architecture/chat-quota-exemption-is-source-marked.spec.ts',
      'apps/api/src/architecture/chat-quota-hop-is-bounded.spec.ts',
      'apps/api/src/migrations/1790860000001-ChatQuotaPrecisionHop.ts',
    ],
    gap: "La question de précision posée dans le TEXTE de la réponse — celle du bloc `_BLOCK_ASK_FIRST`, qui est la plus fréquente — n'est PAS exonérée : rien ne la distingue, sans deviner, d'une proposition de fin de réponse. Seule la carte `ask_clarification` l'est, et le modèle n'en pose qu'une par conversation : l'exonération est donc plus étroite que la décision. La rendre plus large demanderait que le modèle se déclare lui-même, ce qui est la porte que ce mécanisme existe pour tenir fermée — arbitrage à reprendre en connaissance de cause, pas à ouvrir en passant.",
    nextPack: null,
  },
  {
    key: 'c60_organigramme_badges',
    theme: 'Organigramme — badges de décision',
    canonical:
      "La carte d'une personne montre son rôle commercial en QUATRE badges — Sponsor / Influenceur / Opérationnel / Bloqueur — jamais les huit rôles bruts du contrat (`economic_buyer`, `technical_buyer`, `user_buyer`, `champion`, `procurement`, `blocker`, `influencer`, `unknown`). Le compte « trois » que porte la source (ANALYSE-CRITIQUE §2.2) désigne les trois badges de GUIDANCE positive ; le Bloqueur est un quatrième badge, mais négatif — exclu du chemin recommandé, renvoyé au tableau du bas (item #182 du croisement OrgGraph). Raison : un commercial qui prépare un rendez-vous n'a pas besoin de distinguer `technical_buyer` de `user_buyer` — il a besoin de savoir qui décide, qui pèse, qui exécute. Trois messages clairs battent huit nuances (ANALYSE-CRITIQUE l.203-205).",
    supersedes:
      "Les huit rôles bruts affichés en badges directement sur la carte, comme le proposait l'alternative GPT (item #258 du croisement OrgGraph, `alternative-GPT_02_vue-entite-hierarchie.png`) — la précision structurelle du contrat rendue telle quelle à l'écran, au prix de la lisibilité qu'un commercial en préparation de rendez-vous n'a pas le temps de déchiffrer.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/org-graph.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/focalOrgData.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/focalOrgData.test.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/corrections/OrgCorrectionDrawer.tsx',
    ],
    gap: "Les huit rôles bruts restent accessibles — mais seulement dans le FORMULAIRE de correction (`OrgCorrectionDrawer.tsx`, cases à cocher), jamais en lecture sur une carte. La source les décrit aussi comme « disponibles au survol » (ANALYSE-CRITIQUE l.200-201) ; vérifié ici que `FocalOrgView.tsx` ne référence `decisionRoles` dans aucun `title=`/tooltip de carte — l'écran n'expose donc les rôles bruts nulle part au survol. Si cette nuance-là est un manque ou un renoncement assumé n'est pas tranché par cette entrée.",
    nextPack: null,
  },
  {
    key: 'c61_organigramme_temporalite_matriciel',
    theme: 'Organigramme — temporalité et reporting matriciel',
    canonical:
      "Un lien `reports_to` est aujourd'hui un instantané éternel : il ne porte ni la date à laquelle il devient vrai, ni celle où il cesse de l'être, ni la trace qu'une correction l'a redaté — alors que la doctrine du produit (CLAUDE.md § Doctrine, « on archive, on ne supprime pas, un fait périmé redevient inconnu AVEC SA DATE ») demande déjà ce traitement pour tout fait périmé ailleurs dans le produit. Et un `reports_to` UNIQUE cache le reporting matriciel des grands comptes : une personne qui a un manager hiérarchique (carrière, RH) ET un manager fonctionnel (projet, programme) n'a qu'une case pour en écrire deux — le graphe DOIT en taire un des deux. Les deux manques répondent mal à la question que l'organigramme existe pour trancher, « qui dépend de qui » (`c12_organigramme`) : il ment aujourd'hui par omission dès qu'une personne change d'entreprise, qu'un reporting expire, ou qu'un grand compte a une structure matricielle.",
    supersedes:
      "Ajouter `validFrom` / `validTo` / `lastVerifiedAt` à `orgHierarchyEdgeSchema` et un `reportingKind: 'direct' | 'functional'` à `orgHierarchyRelationSchema` MAINTENANT, parce que l'alternative GPT les propose (ANALYSE-CRITIQUE §1.3/§1.4, items #257-260 du croisement OrgGraph) et qu'ils règlent des scénarios réels sur le papier — une personne qui change d'entreprise, un reporting qui expire, une correction datée, un groupe matriciel.",
    codeState: 'absent',
    enforcement: 'unenforced',
    holders: [],
    gap: "`packages/contracts/src/schemas/org-graph.ts` ne porte aucun de ces champs — 0 occurrence de `validFrom` / `validTo` / `lastVerifiedAt`, `orgHierarchyRelationSchema` toujours à cinq valeurs — absence confirmée indépendamment par `ORGGRAPH-croisement-08-items-177-184-257-272.md` et `ORGGRAPH-croisement-01-items-1-23.md` #23. Ce n'est pas un oubli : `orgHierarchyRelationSchema` est un ENUM, et GA-08 interdit d'en retirer une valeur ou d'en insérer une au milieu une fois livré. L'élargir aujourd'hui — sur la seule base d'un scénario de confrontation entre deux specs, sans qu'un compte réel n'ait encore forcé la question (une fenêtre de validité unique suffit-elle, ou faut-il un historique complet des managers ? le matriciel s'exprime-t-il par arête ou par personne ?) — figerait une forme devinée pour toujours. Arbitrage de Louis le 30/08/2026 : on écrit la raison, on ne livre pas le schéma — cette entrée EST la raison, à opposer à qui reproposerait ces champs sans besoin réel nommé.",
    nextPack: null,
  },
  {
    key: 'c62_organigramme_tableau_contacts',
    theme: 'Organigramme — le tableau de contacts',
    canonical:
      "Le tableau du bas de la vue focale existe parce que le commercial ne veut pas seulement COMPRENDRE l'organigramme, il veut JOINDRE les gens. L'arbre répond à « qui dépend de qui » (`c12_organigramme`) ; le tableau — email, téléphone, statut d'accès, une ligne par personne — est le PONT entre cette lecture et l'action (ANALYSE-CRITIQUE §2.4). Sans lui, l'écran resterait un diagramme à interpréter, jamais un outil de prise de contact.",
    supersedes:
      "Aucun tableau de contacts actionnable — les maquettes GPT (item #258 du croisement OrgGraph) montrent les personnes DANS l'organigramme, sans vue liste email + téléphone + statut à côté.",
    codeState: 'implemented',
    enforcement: 'held',
    holders: ['apps/web/src/features/accounts/view/account-detail/tabs/organigramme/FocalOrgView.tsx'],
    gap: "Rien ne GARDE cette règle : aucun test ne vérifie que le tableau reste sous l'arbre plutôt que de disparaître au prochain refactor visuel — elle tient tant que personne n'y touche, ce que `held` veut dire ici. Le porteur réel de cette raison est `apps/web`, hors du périmètre d'écriture du lot qui a écrit cette entrée (30/08/2026) : elle vit ici, au registre, faute de pouvoir vivre en commentaire à l'endroit du code.",
    nextPack: null,
  },
  {
    key: 'c63_organigramme_verdict',
    theme: 'Organigramme — le verdict',
    canonical:
      "L'écran porte un verdict — « par qui commencer, et ce que ça débloque » — en plus de l'arbre et du tableau, parce qu'un organigramme même complet ne dit pas PAR QUI commencer. « Le verdict […] est la trace du raisonnement en UNE PHRASE. Sans lui, l'écran est descriptif, pas conclusif. » (ANALYSE-CRITIQUE §2.6). Cette raison-là (pourquoi avoir un verdict DU TOUT) est distincte de celle déjà écrite dans le code — `FocalVerdict` est « entièrement composé de champs du graphe : aucune phrase n'est fabriquée », ce qui explique pourquoi le verdict n'INVENTE rien, pas pourquoi il EXISTE. Les deux raisons sont nécessaires ; une seule vivait dans le dépôt avant le 30/08/2026.",
    supersedes:
      "Un écran purement descriptif — arbre + tableau, sans conclusion assumée — comme les maquettes GPT (item #258 du croisement OrgGraph), qui n'ont NI verdict NI bloc d'appel à l'enrichissement en pied de page.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/focalOrgData.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/organigramme/focalOrgData.test.ts',
    ],
    gap: "Le test garde l'ABSENCE de verdict quand rien ne la justifie (« sans chemin, il n'y a pas de verdict — pas de phrase de remplissage ») ; aucun test ne garde en revanche que le TEXTE du verdict reste une trace de raisonnement et non une probabilité déguisée — la limite entre « trace du raisonnement » et « chance de closing habillée en phrase » (`c26_probabilite`) tient par relecture, pas par une garde automatique.",
    nextPack: null,
  },
  {
    key: 'c64_analytique_produit',
    theme: 'Analytique produit',
    canonical:
      "L'analytique produit mesure le PRODUIT, jamais la personne. La frontière n'est pas « anonyme contre nominatif » : c'est l'UNITÉ D'ANALYSE. On agrège par ÉCRAN, par FONCTION, par PARCOURS — jamais par personne, même identifiée par un hash. « Cet écran est abandonné » se dit ; « Sarah abandonne les écrans » ne se dit pas. " +
      "Cinq règles en découlent, et c'est la phrase ci-dessus qui tranche les cas qu'elles ne nomment pas. (1) AGRÉGATION MINIMALE — aucune métrique comportementale n'est publiée sous 5 sessions distinctes : sous ce seuil, une « moyenne » désigne quelqu'un. (2) AUCUN CONTENU — on enregistre QU'UN champ a été rempli, jamais ce qu'il contenait, côté navigateur comme côté serveur. (3) AUCUN ENREGISTREMENT DE SESSION — ni rejeu vidéo, ni carte de chaleur reconstituée, ni bibliothèque de capture du DOM ; ni Hotjar, ni FullStory, et le nom du prochain se lira dans GA-240 : le produit contient les données commerciales de nos clients, et rejouer un écran, c'est exfiltrer leur pipe chez un tiers. (4) L'IDENTIFIANT EST UN HASH DE SESSION, pas d'utilisateur, tourné toutes les 24 h — on suit un parcours dans une journée, jamais une personne dans le temps. (5) AUCUNE MÉTRIQUE COMPORTEMENTALE PAR ESPACE CLIENT NOMMÉ dans le back-office opérateur — « l'écran X est abandonné à 62 % » se lit ; « chez [ce client], l'écran X est abandonné » ne se lit pas, parce que c'est exactement là que ça dérape : ça se transforme en argument commercial, puis en reproche. Le score de santé d'espace (#1652) suffit au suivi client, et il mesure des actions VALIDÉES, pas des comportements. " +
      'Les deux nombres de cette règle — le seuil de 5 sessions distinctes et la rotation à 24 h — vivent à UN SEUL endroit, `packages/contracts/src/schemas/product-analytics-privacy.ts` (GA-26), et se lisent depuis les écrans plutôt que de se recopier. ' +
      "⚠️ CE QUE CETTE ENTRÉE NE DIT PAS : elle est la contrainte d'INGÉNIERIE, pas l'avis juridique. L'intérêt légitime, le registre des traitements et la phrase de la politique de confidentialité sont une RELECTURE JURIDIQUE EN ATTENTE, à la charge de Louis — l'auteur du cadre l'écrit lui-même (« À faire relire. Je pose le cadre technique, pas l'avis juridique. ») et une case cochée à sa place vaudrait moins qu'une case vide. " +
      '⚠️ TROIS EXCEPTIONS NOMMÉES, ET AUCUNE AUTRE — les deux premières : décision Louis 13/09/2026, batch 12, prise CONTRE la recommandation, relecture juridique toujours due ; la troisième : décision Louis 11/10/2026 (lot W9, #2879 / #2442.10). ' +
      "(a) #1946.22 lève la règle 5 et le refus du 10/09/2026 (« aucune alerte sur signal d'usage ») pour UNE alerte OPÉRATEUR, `espace_a_risque` : le score de santé MESURÉ d'un espace (#1652) passé sous le seuil existant prévient l'équipe Bellum, jamais le client ; une fois par 7 jours au plus, jamais « résolue », jamais sur un score non mesuré (trop récent, moins de trois axes), jamais pour une salle de démonstration ; le nom de l'espace, le score et ses axes nommés, aucune donnée de personne. " +
      "(b) #1949.23 lève la règle 2 pour UNE trace, `laura_unrouted_intents` : la demande que Laura n'a pas su router, masquée côté moteur (e-mails, téléphones, secrets, IBAN) et tronquée à 300 caractères ; aucun `user_id`, aucun `workspace_id` — au plus un hash d'(espace, jour) tourné toutes les 24 h ; purge à 90 jours ; rien depuis une salle de démonstration ; lecture back-office agrégée par texte normalisé, sous le plancher des 5 occurrences distinctes appliqué à la LECTURE. " +
      "(c) #2442.10 (décision Louis 11/10/2026) autorise UN agrégat de back-office : les CONTESTATIONS et CORRECTIONS que les utilisateurs portent sur les réponses de Laura (`chat_reply_feedback`), comptées PAR FONCTION (le type d'action de la réponse) — JAMAIS par personne, JAMAIS par espace nommé. Il ne lit que des COMPTES (verdict, motif, catégorie, présence d'une correction), jamais la note libre ni la valeur corrigée ; il ne sélectionne ni ne regroupe sur `user_id`, `workspace_id` ni `account_id` ; aucune fonction n'est publiée sous le plancher des 5 occurrences distinctes de CE fichier (même nombre, GA-26) ; rien depuis une salle de démonstration. « Cette fonction est contestée dans 40 % des réponses » se lit ; « Sarah conteste Laura » ne se lit pas. Il ne lève aucune des cinq règles : il en précise l'unité d'analyse pour un flux qui, lui, porte un auteur en base. " +
      'Une quatrième exception est refusée par GA-264 (contenu), GA-266 (usage par espace nommé) et GA-412 (aucun agrégat par personne).',
    supersedes:
      "L'analytique produit telle qu'elle se pratique par défaut : un traceur tiers posé sur toutes les pages, un identifiant d'UTILISATEUR persistant qui suit la personne d'un mois à l'autre, un rejeu de session pour « voir ce qui bloque », et un tableau par client nommé dans la console opérateur. Chacune de ces quatre habitudes est individuellement défendable et toutes ensemble transforment un outil de mesure en surveillance des utilisateurs de nos clients — dont les écrans contiennent, eux, le pipe commercial de leurs propres clients. Formulée et refusée le 06/09/2026 (issue #1681), reprise comme contrainte du lot d'analytique produit (#1682 à #1688) le 07/09/2026.",
    // PARTIELLE, et le `gap` mesure laquelle des cinq règles tient. La règle 3
    // est la seule entièrement TENUE — c'est aussi la seule des cinq qui soit
    // décidable par une machine, parce qu'elle porte sur des NOMS (un paquet,
    // un hôte) et non sur une intention.
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/product-analytics-privacy.ts',
      'packages/contracts/src/schemas/product-analytics-privacy.test.ts',
      'apps/api/src/architecture/no-session-replay.spec.ts',
      'apps/api/src/modules/analytics/product-analytics.service.ts',
      'apps/web/src/lib/analytics.ts',
      'apps/web/src/architecture/analytics-behind-consent.test.ts',
      // #1681.1/.5 (09/09/2026) — la LECTURE du flux comportemental et les deux
      // gardes qui la tiennent. Sans elles, les règles 1 et 5 étaient énoncées
      // et portées par personne : la constante des cinq sessions existait sans
      // appelant, et rien n'empêchait la route par espace de cesser de
      // respecter la frontière.
      'apps/api/src/modules/analytics/product-analytics-read.service.ts',
      'apps/api/src/architecture/behavioral-reads-respect-session-floor.spec.ts',
      'apps/api/src/architecture/team-detail-never-reads-behavioral.spec.ts',
      // #1683 — le catalogue des écrans du produit, et la garde qui l'oblige à
      // couvrir les routes RÉELLES. C'est lui qui replie `/accounts/<uuid>`
      // vers son motif : sans catalogue, la règle 5 n'a pas de moyen d'exister.
      'packages/contracts/src/schemas/product-screens-catalog.ts',
      'apps/api/src/architecture/product-screens-catalog-covers-routes.spec.ts',
      // #1681/#1683 (09/09/2026) — le repli se fait À L'ÉCRITURE : un
      // identifiant de compte client n'entre jamais en base. Retirer le MOYEN,
      // pas la permission.
      'apps/web/src/router.tsx',
      'apps/web/src/architecture/le-traceur-ne-transporte-aucun-identifiant.test.ts',
      // #1946.22 / #1949.23 (13/09/2026) — les DEUX exceptions nommées de la
      // décision Louis batch 12, et les gardes qui les empêchent de devenir
      // une permission générale.
      'apps/api/src/modules/backoffice-alerts/workspace-risk-alert.ts',
      'apps/api/src/modules/laura-unrouted-intents/unrouted-intent.ts',
      'apps/ia/app/services/unrouted_intent.py',
      'apps/api/src/architecture/product-tracker-emits-no-content.spec.ts',
    ],
    gap:
      "⚠️ 15/10/2026 — RENVERSEMENT DATÉ (décision Louis 11/10, épopée #4016, L8, #4016.8d) : le TRACEUR PRODUIT est ALLUMÉ par défaut dans un build de production (`product-tracker.ts`, `isEnabled()`) ; `VITE_PRODUCT_TRACKER_ENABLED=false` l'arrête. Inchangé : les cinq règles (5 sessions, aucun contenu, relecture de session toujours interdite, hash 24 h, rien par espace nommé). Ancien texte : défaut à l'ARRÊT, poser la variable = décision opérateur. " +
      "⚠️ 11/10/2026 — RENVERSEMENT DATÉ (décision Louis, épopée #4016, lot L14) : la RELECTURE JURIDIQUE n'est plus un préalable à l'allumage. Les trois pièces dues sont rédigées par Claude et marquées « non relu par un juriste » — base juridique et entrée au registre (`agent_docs/legal/registre-des-traitements.md`, § A7), paragraphe de la politique de confidentialité (`apps/website/src/app/[locale]/privacy/page.tsx`, section `traitements-specifiques`, quatre langues). La dette juridique reste NOMMÉE, elle ne bloque plus. Ce qui reste ouvert et que le renversement ne ferme pas : aucune routine ne purge `product_events` (13 mois publiés dans `PrivacyRetentionService`, non appliqués — la durée n'est donc pas écrite sur `/privacy`). " +
      "⚠️ 13/09/2026 — DEUX EXCEPTIONS LEVÉES PAR LOUIS (batch 12, contre la recommandation), et ce qu'elles laissent en clair. #1946.22 (règle 5) : le risque résiduel est que l'alerte NOMME un client à partir de signaux d'usage — exactement le dérapage que la règle 5 décrit (« argument commercial, puis reproche ») ; il est borné, pas supprimé : une alerte opérateur, une par semaine, sur un score DÉCOMPOSÉ en axes, jamais sur du « non mesuré ». #1949.23 (règle 2) : le masque ne reconnaît ni un NOM de personne ni un nom de société écrit dans la demande, et `chat_messages` garde de toute façon le texte brut avec son auteur — la trace n'ajoute AUCUNE capacité de ré-identification à qui tient la base, mais elle n'est anonyme qu'au sens du stockage ; c'est le plancher de 5 occurrences distinctes À LA LECTURE qui empêche un nom d'atteindre un écran. GA-264 (suite) refuse une seconde table d'analytique à texte saisi, GA-266 (suite) une seconde alerte d'usage par espace nommé, GA-267 (suite) exécute la lecture de la trace sous le plancher. La RELECTURE JURIDIQUE couvre désormais aussi ces deux traitements. " +
      "Mesuré le 07/09/2026, règle par règle, AVANT les sept écrans qu'elle contraint. Règle 3 (aucun enregistrement de session) : TENUE — zéro dépendance et zéro hôte de rejeu dans le dépôt, et GA-240 (`no-session-replay.spec.ts`) le maintient sur les `package.json` des vingt espaces de travail, les spécificateurs de module et les hôtes écrits en clair. Règle 2 (aucun contenu) : ⚠️ LA RÉPONSE DÉPEND DU FLUX, et la version de ce texte écrite le 07/09/2026 ne le disait pas — elle décrivait la protection FAIBLE comme si elle valait pour tout le traceur produit, corrigé le 09/09/2026 (#1681.2). Les deux flux de `product_events` n'ont pas la même défense. FLUX BEHAVIORAL (les neuf événements de `product-tracker.ts`, le SEUL que lisent #1683-#1688) : TENUE, et structurellement — une union TypeScript FERMÉE côté navigateur (`apps/web/src/lib/product-tracker.ts`, aucune signature d'émission n'a de paramètre où glisser une valeur) plus une LISTE BLANCHE côté serveur (`sanitizeBehavioralProperties`, `BEHAVIORAL_EVENT_PROPERTY_KEYS`) : une clé absente de la table est perdue quel que soit son nom, donc `filterValue`, `q`, `search` n'ont pas à être devinées et interdites une par une. GA-264 (`product-tracker-emits-no-content.spec.ts`) le prouve sur les ÉMETTEURS, en lisant le fichier en TEXTE. FLUX AUDIT (`track()`, `member_removed`, `analysis_completed`…) : À MOITIÉ, et c'est CE flux-là que décrivait l'ancien texte — `sanitizeProperties` retire dix fragments de clé sensibles, borne à 40 clés et tronque à 500 caractères CÔTÉ SERVEUR ; côté navigateur, `apps/web/src/lib/analytics.ts` transmet ses `props` À L'IDENTIQUE, sans aucun nettoyage — et le filtre serveur porte sur le NOM de la clé, jamais sur la valeur, donc une saisie utilisateur rangée sous une clé anodine passe. C'est ce reste-là qui maintient l'entrée à `partial`.Règle 1 (5 sessions distinctes) : TENUE depuis le 09/09/2026 (#1681.1) — elle était ABSENTE de tout calcul jusque-là, la constante existant sans appelant sur les deux écrans historiques. Trois branchements l'ont refermée. (a) `product-analytics-read.service.ts` applique le seuil À LA SOURCE, aux sept endroits où il agrège (usage par écran, sorties, parcours, parcours interrompus, trois blocs de friction, recherches vides) : les quatre écrans consommateurs n'ont à y penser nulle part — une règle appliquée dans quatre écrans est une règle appliquée dans trois. (b) `analytics-overview.service.ts` retient `activation.activationRate` et (c) `team-kpis.service.ts` retient l'`activationRate` par équipe, tous deux via `withheldBelowThreshold`, une seule dérivation. Ce qui décide n'est pas la table mais le DÉNOMINATEUR : ces deux taux comptent des PERSONNES, alors que `avgPerWorkspace` compte des ESPACES (unité d'analyse que la doctrine désigne elle-même, avec son propre masquage à 3 espaces, #1658/#1686) et `conversionSnapshotRate` des comptes clients — ce n'est pas une règle appliquée à moitié, c'est la règle appliquée à ce qu'elle vise. ⚠️ Retenu n'est JAMAIS 0 : le champ porte le compte de sujets observés et le seuil, pour que l'écran dise « pas encore de quoi en tirer une mesure » et non « personne ne s'en sert ». Garde GA-267 (`behavioral-reads-respect-session-floor.spec.ts`), qui EXÉCUTE le service sous le seuil et vérifie qu'aucune clé de mesure dérivée ne sort.Règle 4 (hash de session tourné à 24 h) : TENUE depuis le 09/09/2026 (#1681.4/#1682) — `hashBehavioralSession` est le premier appelant de `SESSION_HASH_ROTATION_HOURS`, la rotation est calculée CÔTÉ SERVEUR (jamais laissée à la discipline du navigateur), et `trackBehavioral()` écrit `user_id` et `workspace_id` à `null` INCONDITIONNELLEMENT. ⚠️ Ce qui a rendu la règle tenable n'est pas un correctif mais une SÉPARATION : la MÊME table servait aussi le journal d'activité d'espace (`workspace-activity.service.ts`, `member_removed`, `portfolio_handed_over`…), qui DOIT nommer son acteur — c'est une trace d'audit. Les deux flux cohabitent désormais dans `product_events` sans se mélanger : `track()` refuse toujours d'écrire sans `userId`, `trackBehavioral()` refuse d'écrire sans hash de session. Un flux qui n'a jamais eu accès à une identité ne peut pas la faire fuiter par erreur de branchement. Règle 5 (rien par espace nommé) : TENUE, et GARDÉE depuis le 09/09/2026 (#1681.5) — `GET internal/analytics/teams/:workspaceId` rend bien un détail par espace nommé, mais ce qu'il compte sont des actions VALIDÉES (analyses, enrichissements, messages, crédits), pas des comportements. La ligne que #1682-#1688 ne doivent pas franchir passe donc à l'INTÉRIEUR d'une route qui existe déjà, et rien ne l'empêchait de cesser d'être respectée. GA-266 (`team-detail-never-reads-behavioral.spec.ts`) la tient : le calcul par espace et son contrôleur ne nomment aucun des neuf événements comportementaux ni la colonne `session_id`. ⚠️ Elle NE porte PAS sur `product_events` : les deux flux cohabitent dans cette table et cette route DOIT continuer à y lire `onboarding_completed` / `analysis_started` / `contact_enriched` — ce qui les sépare est le nom d'événement et `session_id`, pas la table. Une garde qui aurait interdit la table aurait été rouge dès son écriture. Du côté du flux comportemental lui-même, la règle est tenue plus bas encore : la colonne d'espace n'y existe pas, donc « chez ce client, l'écran X est abandonné » n'est pas interdit, il est IMPOSSIBLE — et la conséquence est assumée dans `product-analytics-read.service.ts`, qui déclare la colonne « espaces » de #1683 NON DÉRIVABLE plutôt que de rendre un zéro.⚠️ CE QUE LA MESURE DU 09/09/2026 A TROUVÉ EN PLUS, et qui ne concerne pas la doctrine mais ce qu'elle mesure : SEPT des neuf émetteurs du traceur n'ont AUCUN appelant de production. Seuls `screen_viewed` et `screen_left` sont câblés (`apps/web/src/router.tsx`) ; `trackTabOpened`, `trackActionStarted`, `trackActionCompleted`, `trackActionAbandoned`, `trackFilterApplied`, `trackSearchPerformed` et `trackErrorShown` ne sont appelés que par `product-tracker.test.ts`. La conséquence est portée par le code plutôt que par un commentaire : `ProductAnalyticsReadService` distingue « pas instrumenté » de « zéro » (une nature jamais écrite sort `not_instrumented`), sans quoi un tableau de friction vide se lirait « aucune friction » alors que la vérité est « rien ne la mesure ». ⚠️ Le GEL de #1682 a été levé par Louis le 08/09/2026 au soir, en connaissance du motif : le traceur est CODÉ, et son interrupteur `VITE_PRODUCT_TRACKER_ENABLED` est ÉTEINT par défaut. Lever le gel n'a PAS fait disparaître la relecture — la RELECTURE JURIDIQUE reste à faire, et brancher la lecture ne la rapproche en rien : aucune ligne de cette entrée ne se prononce sur l'intérêt légitime, le registre des traitements ni la politique de confidentialité, et l'issue #1681 reste OUVERTE pour cette raison.",
    nextPack: null,
  },
  {
    key: 'c65_couverture_nest_pas_un_fait_de_marche',
    theme: 'Mémoire marché',
    canonical:
      "Un TAUX DE COUVERTURE mesure ce que NOUS savons des comptes, jamais ce qu'ils font. " +
      '« 72 % de couverture » veut dire : sur 72 % des comptes, la mémoire marché a assez de parcours observés pour en dire quelque chose. ' +
      "Ça ne veut PAS dire « 72 % externalisent », et le complément ne veut pas dire « 28 % n'externalisent pas » — ces 28 % sont hors de ce que NOUS savons, pas hors du marché. " +
      "C'est la faute de « non mesuré rendu zéro » d'un cran au-dessus : au lieu d'un chiffre faux sur une ligne, une phrase fausse sur tout un portefeuille — et plus dangereuse, parce qu'un commercial peut la répéter en rendez-vous. " +
      "TROIS conséquences tenues : (1) le vocabulaire du recours à des prestataires n'entre pas dans le bloc de couverture ni dans son espace de noms, la NÉGATION comprise — un libellé se lit hors de son contexte (infobulle, lecteur d'écran, export), la négation s'y perd et le mot reste ; " +
      '(2) le bloc DIT positivement ce que le taux mesure, et cette phrase est rendue, pas seulement traduite ; ' +
      "(3) les quatre seaux du portefeuille — couvert, observations insuffisantes, ambigu, non résolu — s'ADDITIONNENT jusqu'au dénominateur, vérifié par le contrat lui-même : un « 24 restants » qui ne se déduirait de rien serait un nombre déduit qui a l'air juste.",
    supersedes:
      "La lecture spontanée d'un taux de couverture comme un fait de marché — « 72 % de couverture » entendu « 72 % externalisent ». Formulée par les deux retours qui demandent le bloc (#1633 le 06/09/2026, #1635 le même jour), chacun l'interdisant de son côté sans savoir que l'autre le faisait aussi.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/market-memory.ts',
      'packages/contracts/src/schemas/market-memory.test.ts',
      'apps/api/src/modules/market-memory/market-memory.service.ts',
      'apps/web/src/features/market-memory/view/MarketMemoryCoverageCard.tsx',
      'apps/web/src/i18n/locales/fr/marketMemory.json',
      'apps/web/src/i18n/locales/en/marketMemory.json',
      'apps/web/src/architecture/market-coverage-is-not-outsourcing.test.ts',
    ],
    gap: "GA-259 porte sur le BLOC de couverture et sur SON espace de noms — les catalogues `marketMemory` (FR et EN) et les composants de `apps/web/src/features/market-memory/`. Elle ne lit PAS les écrans qui montent le bloc : une phrase fautive écrite dans `DataQuality.tsx` ou `MarketWatch.tsx` à côté du bloc lui échapperait. Le périmètre est délibéré — élargir aux deux écrans entiers attraperait du vocabulaire légitime sans rapport — mais la limite est réelle et se lève le jour où un troisième écran monte le bloc, en déplaçant le libellé fautif possible dans le namespace gardé plutôt qu'en élargissant la garde.",
    nextPack: null,
  },
  {
    // ⚠️⚠️ RENVERSEMENT DATÉ — DÉCISION LOUIS 12/10/2026 (#4068, mis en œuvre par
    // #4074). Réécrite EN PLACE, la règle du 18/09 est citée dans `supersedes` :
    // un arbitrage effacé se re-propose, un arbitrage renversé se lit. La clé
    // garde son ancien nom — c'est un identifiant de code, pas un texte affiché.
    key: 'c66_sources_publiques_se_nomment',
    theme: 'Nommage des sources',
    canonical:
      'Aucune source ne se nomme, publique ou payante — DÉCISION LOUIS 12/10/2026 (#4068, #4074), qui RENVERSE #2291.3 (18/09/2026). ' +
      "Un fait se dit par sa NATURE et sa date (« besoin observé sur le marché », « recours externe observé », « technologies observées », « annonce légale », « offre d'emploi publique ») — jamais par le nom de la source qui l'a rapporté, ni « Mémoire marché », retirée de tous les textes visibles FR et EN et des prompts de Laura. " +
      "Le lien de preuve reste, sous un libellé générique (« Voir l'annonce », « Voir la source »). " +
      "Seule exception : l'outil que l'espace a lui-même BRANCHÉ (« Votre CRM », D354) et l'écran Réglages › Intégrations, où « Connecter » doit dire ce qu'il connecte. " +
      'Inchangé : NOS fournisseurs payants ne se nomment jamais (`OUR_SUPPLIERS`, `tool-naming.ts`).',
    supersedes:
      "#2291.3 (18/09/2026) — « les sources PUBLIQUES se nomment (BOAMP, DECP, France Travail…), les fournisseurs PAYANTS restent génériques » : nommer une source publique ne révélait rien qu'un client ne puisse vérifier, et rendait le résultat auditable. Renversée le 12/10/2026 : l'audit passe par la date et le lien de preuve, pas par un nom de portail ; et toute la donnée accumulée est un intrant du traitement, dont la provenance se dit par sa nature. La lecture « les sources publiques se nomment » est désormais le FAUX JUMEAU à ne pas re-proposer.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/tool-naming.ts',
      'apps/web/src/architecture/no-vendor-names-in-app.test.ts',
      // #4074.3 (12/10/2026) — la garde du renversement : aucune valeur i18n ne nomme une source.
      'apps/web/src/architecture/aucune-source-ne-se-nomme-dans-les-textes.test.ts',
      // #2288.4 (18/09/2026) — le devis de vérification à la demande nomme les
      // sources publiques prévues : premier écran qui exerce le volet POSITIF.
      'packages/contracts/src/schemas/market-verification.ts',
      'packages/contracts/src/schemas/market-verification.test.ts',
      'apps/web/src/features/consultants/view/reverse-market/VerificationPlanDialog.tsx',
      'apps/web/src/features/consultants/view/reverse-market/VerificationPlanDialog.test.tsx',
      'apps/web/src/lib/data-source-label.ts',
      'apps/web/src/i18n/locales/fr/consultants.json',
      'apps/web/src/i18n/locales/en/consultants.json',
      // #2288.4 — BOAMP/DECP annoncés par le lanceur, là où la gate les gardera.
      'packages/contracts/src/schemas/public-tenders-gate.ts',
      'packages/contracts/src/schemas/public-tenders-gate.test.ts',
      'packages/contracts/src/schemas/public-tenders-gate.constants.json',
      'apps/ia/tests/test_collection_focus.py',
      'apps/api/src/modules/analysis/analysis.service.ts',
      'apps/web/src/features/consultants/lib/marketVerificationPublicSources.ts',
    ],
    gap: "⚠️ 12/10/2026 (#4074) — les paragraphes ci-dessous décrivent l'état d'AVANT le renversement : le volet POSITIF (nommer une source publique) n'existe plus. `aucune-source-ne-se-nomme-dans-les-textes.test.ts` lit les catalogues i18n FR/EN (hors Réglages › Intégrations et hors `discover.json`, lot voisin #4068 qui retire ses propres noms) ; elle ne lit ni les textes écrits en dur dans le TSX, ni les libellés des devis de vérification à la demande (`market-verification.ts`, `marketVerificationPublicSources.ts`, nommés HORS LOT dans #4074). ANCIEN ÉTAT — Le volet NÉGATIF (nos fournisseurs payants ne se nomment jamais) est tenu par `OUR_SUPPLIERS` et gardé par `no-vendor-names-in-app.test.ts` — BOAMP/DECP/France Travail n'y figurent pas, et cette entrée ne leur ajoute aucune obligation. Le volet POSITIF (les nommer réellement à l'écran) n'est exercé QUE sur le devis de vérification de `/consultants` (#2288.4, ci-dessous) : `apps/web/src/i18n/locales/fr/discover.json` (`signalTypes.*`) reste générique au 18/09/2026 (« Appel d'offres ouvert », « Marché attribué », « Recrutement »), et #2291.3 (registre `registre-2026-09-17-lau-032-2291.md`) reste `retenu` pour le reste de son périmètre (sources DataForge/graphes groupe-filiales/partenaires non branchées). ⚠️ DEVIS DE VÉRIFICATION (#2288.4, 18/09/2026) — France Travail, sans gate, est nommée par le plan (`planMarketVerification`). BOAMP et DECP le sont désormais par le LANCEUR, entreprise par entreprise : `GET /analysis/launch-plan` (`AnalysisService.planLaunch`, que le devis lit déjà pour le coût exact) rend `publicTenderSources` d'après `forecastPublicTenderSources` (`public-tenders-gate.ts`) — pays que `start()` enverrait (même fonction, une lecture en échec n'annonce rien) ET code NAF déjà persisté de l'entité dont la division FIXE l'archétype (règle NAF-first de `classify_account_archetype`). Ni réseau ni cycle : `AnalysisService` injecte déjà `AccountsService` et `WorkspaceMarketService`. La table et la gate voyagent en JSON (`public-tenders-gate.constants.json`), gardées des deux côtés (`public-tenders-gate.test.ts`, `test_collection_focus.py`, qui vérifie aussi le COMPORTEMENT de `plan_collection`). Ce qui reste NON annoncé, à dessein : (1) une entreprise jamais analysée — l'archétype préliminaire se calcule AU RUN sur le gagnant du registre, et la gate la garde le plus souvent, mais le devis ne peut pas le savoir ; (2) une entité connue dont la division NAF ne fixe pas l'archétype (62, 70…) — c'est le libellé du registre qui trancherait ; (3) la démonstration, qui ne lance aucune collecte (`DEMO_VERIFICATION_PUBLIC_TENDERS_COVERAGE`). Hypothèse assumée : la vérification relance par NOM (pas de SIREN envoyé) ; on suppose que ce nom résout la même entité que le run précédent. Si le registre ne tranche plus, l'archétype reste `inconnu` et la gate GARDE BOAMP/DECP — l'annonce reste vraie ; seul un AUTRE gagnant net dont le libellé d'activité officiel dirait « startup » la rendrait fausse. Écart RESTANT, hors de ce lot : France Travail est nommée même quand aucun candidat ne sera réellement lancé (tous rouverts) — le plan ne voit pas les réponses du lanceur.",
    nextPack: null,
  },
  {
    key: 'c67_poste_vu_le_jamais_verifie',
    theme: 'Postes — changement d’emploi',
    canonical:
      'Un poste se dit « vu le <date>, source <la source> », jamais « vérifié » — DÉCISION LOUIS 15/09/2026, confirmée le 19/09/2026 (#2151.18). ' +
      "Ce qui n'est pas confirmé est NOMMÉ non confirmé : une source qui rapporte un changement de poste donne un FAIT OBSERVÉ à une date, par une source nommée — jamais une vérité acquise. « Vérifié » impliquerait un contrôle actif (l'entreprise, la personne, un registre officiel) que le produit ne fait pas ; « vu le <date> » dit exactement ce qui a été mesuré, et rien de plus.",
    supersedes:
      "La lecture qui confondrait « une source l'a rapporté » avec « c'est vérifié » — le réflexe qui affiche un changement de poste détecté comme un fait acquis dès la première mention, sans distinguer l'observation de la confirmation.",
    codeState: 'absent',
    enforcement: 'unenforced',
    holders: [],
    gap: "Aucune surface du produit n'affiche aujourd'hui un poste ou un changement de poste : aucune source de changement d'emploi n'est branchée — le scraping LinkedIn reste interdit (`c24_linkedin`, aucune automatisation non autorisée sur le réseau), et ni `contact.entity.ts` ni `org-graph.ts` ne portent de champ de ce type. Une garde qui lirait un libellé « vérifié » aujourd'hui n'aurait AUCUNE ligne à lire — un corpus vide n'est pas une preuve, ce serait un vert de façade (voir la fiche mémoire « sonde sans corpus »). Cette entrée EST la raison, écrite AVANT le code, comme `c61_organigramme_temporalite_matriciel` : le jour où une source de changement de poste se branche, le libellé qu'elle produit doit lire cette entrée avant d'écrire « vérifié ».",
    nextPack: null,
  },
  {
    // ⚠️⚠️ RENVERSEMENT DATÉ — DÉCISION LOUIS 11/10/2026 (épopée #4016, lot L7,
    // « machine de guerre »). Réécrite EN PLACE, l'ancienne règle est citée dans
    // `supersedes` : un arbitrage effacé se re-propose, un arbitrage renversé se lit.
    key: 'c68_capacite_adapte_le_volume_propose',
    theme: 'Découvrir — volume proposé (premier lot, sans palier) et quotas',
    canonical:
      "RENVERSEMENT DATÉ — DÉCISION LOUIS 11/10/2026 (#4016 L7) : Découvrir SANS PALIER. Le volume de la capacité commerciale (1 à 3 personnes → 10 ; 4 à 8 → 25 ; 9 et plus → 50, `PROPOSED_ACCOUNT_VOLUME_BY_BAND`, écrite UNE fois) n'est plus un plafond : c'est le PREMIER LOT. « Voir 10 de plus » (`discover-list-window.ts`) relance la recherche au-delà, jusqu'à une borne TECHNIQUE de 200 (`DISCOVER_MAX_LIMIT` = `MAX_REGISTRY_LIMIT`, budget de temps d'une requête), et la recherche lit de VRAIES pages du registre (`MAX_REGISTRY_PAGES`, partagées entre secteurs croisés, arrêt sur une page non pleine ou au budget — dit dans `degraded`). Aucun débit de crédit, et la phrase du volume le dit (`capacity.firstBatch`). " +
      "Taille non déclarée ou non reconnue ⇒ le volume par défaut, jamais un palier deviné ; le volume s'affiche toujours avec sa règle (`ProposedVolumeNotice`). " +
      "MÊME DÉCISION, MÊME LOT — les quotas ne brident plus le produit : (1) le plafond de Laura suit le PLAN (`SHIPPED_PLAN_GRID.chatDailyMessageLimit`) ; `CHAT_DAILY_MESSAGE_LIMIT` n'a plus de défaut et n'est qu'un plafond de sécurité opérateur optionnel (absent + plan illisible = le plus bas de la grille, jamais l'illimité — GA-91 « le plan fait foi ») ; (2) la veille relit TOUT le portefeuille suivi chaque jour (`WATCHLIST_REFRESH_MAX_PER_WORKSPACE` = plafond opérateur optionnel, global ou par plan ; étalement jamais sous 30 s), alertes 10 → 50 / jour.",
    supersedes:
      "~~19/09/2026 (#2291.9) — Le volume de comptes PROPOSÉS par Découvrir s'adapte à la capacité commerciale déclarée au profil (`sales_team_size`) — DÉCISION LOUIS 19/09/2026 (QCM du matin, #2291.9). La grille : équipe commerciale 1 à 3 personnes → 10 comptes proposés ; 4 à 8 → 25 ; 9 et plus → 50. Écrite UNE fois (`PROPOSED_ACCOUNT_VOLUME_BY_BAND`, `discover-capacity.ts`) : ni l'écran ni le backend (`apps/ia/app/routers/discover.py`) ne la recalculent — le backend reçoit un `limit` déjà résolu et l'honore tel quel (GA-26). Taille non déclarée, ou réponse que la grille ne reconnaît PAS ⇒ le volume par défaut ACTUEL, inchangé — jamais un palier deviné (doctrine : jamais de donnée inventée). Le volume s'affiche TOUJOURS avec la règle qui l'a produit (`ProposedVolumeNotice`), jamais un nombre nu.~~ — en tant que PLAFOND. ~~« `CHAT_DAILY_MESSAGE_LIMIT` (défaut 50) borne tous les plans ; le plafond effectif est le MINIMUM avec le plan » (13/09 et 15/09/2026)~~ — Growth (100) restait bridé à 50. ~~« la veille re-analyse 10 comptes par jour et par espace » (C4)~~. " +
      "Avant le 19/09 : L'absence pure et simple, mesurée deux fois avant cette décision : le registre du 17/09 (`registre-2026-09-17-lau-032-2291.md`, #2291.9) constatait 0 occurrence de « capacité commerciale »/« volume proposé » dans le module, puis relevait que la DONNÉE existait (`layered-profile.ts`, `size.salesTeam`) sans qu'aucun SEUIL ne soit écrit nulle part — construire un seuil sans décision produit aurait violé « aucune donnée inventée ». La grille de ce jour ferme cette question.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/discover/lib/discover-capacity.ts',
      'apps/web/src/features/discover/lib/discover-capacity.test.ts',
      'apps/web/src/features/discover/lib/discover-query.ts',
      'apps/web/src/features/discover/lib/discover-filters.ts',
      'apps/web/src/features/discover/view/Discover.tsx',
      'apps/web/src/features/discover/view/ProposedVolumeNotice.tsx',
      'apps/web/src/features/discover/view/ProposedVolumeNotice.test.tsx',
      'apps/web/src/i18n/locales/fr/discover.json',
      'apps/web/src/i18n/locales/en/discover.json',
      // #4016 L7 (11/10/2026) — le premier lot, le « Voir plus » et les quotas.
      'apps/web/src/features/discover/lib/discover-list-window.ts',
      'apps/web/src/features/discover/lib/discover-list-window.test.ts',
      'packages/contracts/src/schemas/discover-see-more.test.ts',
      'apps/ia/app/routers/discover.py',
      'apps/ia/tests/test_discover_registry_deep_pages.py',
      'apps/api/src/modules/ia-proxy/chat-quota.ts',
      'apps/api/src/architecture/chat-quota-hop-is-bounded.spec.ts',
      'apps/api/src/modules/watchlist-refresh/watchlist-refresh.queue.ts',
      'apps/api/src/modules/watchlist-refresh/watchlist-refresh.scheduler.spec.ts',
    ],
    gap: "Les valeurs généreuses des paliers « à fixer par Louis » (Essai/Starter/Découverte 100, Team/Bêta 300) sont PROPOSÉES, pas confirmées. La re-analyse quotidienne de tout le portefeuille est payée par le système : aucun plafond par plan n'est posé par défaut — à poser sur l'hébergeur si la facture le demande. Le mode Signaux suit la même borne (200) sans lire de pages supplémentaires.",
    nextPack: null,
  },
  {
    key: 'c69_effacement_dune_personne',
    theme: 'Effacement d’une personne (RGPD art. 17)',
    canonical:
      "Une personne prospectée qui demande l'effacement de ses données est SUPPRIMÉE, pas archivée — DÉCISION LOUIS 19/09/2026 (#2297), la SEULE exception à « on archive, on ne supprime pas ». " +
      "Sa fiche (enrichissement et archive compris), ses doublons, ses activités nominatives, son journal réseau, ses tâches, son historique de fusion et la mémoire de Laura qui la cite partent pour de bon ; les objets d'affaire qui ne sont PAS à elle perdent seulement le lien. " +
      "Reste UNE trace sans donnée personnelle — qui a effacé, quand, et des empreintes non réversibles — vérifiée à l'ENTRÉE de la collecte et de l'enrichissement, pour qu'elle ne soit jamais recollectée. " +
      "Le geste appartient à un administrateur de l'espace ou au porteur de la fiche, après confirmation explicite ; il ne s'exerce pas en démonstration.",
    supersedes:
      "« Seule la suppression de COMPTE existe » (avant le 19/09/2026) : une personne prospectée n'avait aucun geste en face de sa demande, et l'anonymisation de `PrivacyDeletionService` laisse une ligne que la prochaine analyse remplit à nouveau. Écartées aussi : l'archive (un fait archivé reste une donnée conservée) et la suppression SANS trace (la personne reviendrait par le registre ou le fournisseur).",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/person-erasure.ts',
      'packages/contracts/src/schemas/person-erasure.test.ts',
      'apps/api/src/modules/contacts/person-erasure.service.ts',
      'apps/api/src/modules/contacts/person-erasure.service.spec.ts',
      'apps/api/src/modules/contacts/person-erasure-fingerprint.ts',
      'apps/api/src/modules/contacts/person-erasure-fingerprint.spec.ts',
      'apps/api/src/common/person-erasure-hmac.ts',
      'apps/api/src/common/person-erasure-hmac.spec.ts',
      'apps/api/src/modules/contacts/person-erasure-analysis-purge.ts',
      'apps/api/src/modules/contacts/person-erasure-analysis-purge.spec.ts',
      'apps/api/src/modules/mailer/suppression.service.spec.ts',
      'apps/api/src/migrations/1789816622437-EmailSuppressionErasedFingerprint.ts',
      'apps/api/src/modules/contacts/contacts.service.spec.ts',
      'apps/api/src/migrations/1789811614640-PersonErasures.ts',
      'apps/api/src/migrations/__tests__/1789811614640-PersonErasures.spec.ts',
      'apps/web/src/features/contacts/view/contact-detail/components/ContactErasureCard.tsx',
      'apps/web/src/features/contacts/view/contact-detail/components/ContactErasureCard.test.tsx',
      'apps/api/src/modules/contacts/person-erasure-corrections-purge.ts',
      'apps/api/src/modules/contacts/person-erasure-corrections-purge.spec.ts',
    ],
    gap: "Deux écarts NOMMÉS. (1) La recollecte est bloquée à l'entrée d'une ANALYSE et d'un ENRICHISSEMENT, comme décidé — pas à l'import CSV, à la synchronisation CRM ni à la saisie manuelle, qui sont des gestes humains. (2) Les fils de discussion avec Laura (`chat_messages`, contenu partagé de l'espace) ne sont pas relus. LEVÉS le 19/09/2026 (#2297.51) : « organigramme jusqu'au rejeu » — l'organigramme et tout le dossier des comptes où elle a une fiche (`raw_analysis`, `previous_raw_analysis`, `org_declared_people`, `org_rejected_items`) sont purgés dans la transaction de l'effacement (`person-erasure-analysis-purge.ts`), un prénom seul n'étant jamais cherché ; « empreintes sans secret » — HMAC-SHA-256 sous `PERSON_ERASURE_HMAC_KEY`, 503 sans clé, jamais de repli. La liste de suppression d'adresses (`email_suppressions`) est conservée à dessein, c'est elle qui empêche un envoi — mais l'adresse d'une personne effacée n'y reste qu'en empreinte (`erased_at`, contrainte `email_suppressions_erased_form_check`), et le contrôle d'envoi lit les deux formes ; depuis le 19/09/2026 (#2297.51, « Oui, en créer une »), l'opposition est TOUJOURS posée — même si elle ne s'était jamais désabonnée — sauf aucune adresse connue. LEVÉ aussi le 19/09/2026 (#2297.51) : « `org_graph_corrections` non purgée » — une correction humaine du ledger d'organigramme dont l'identifiant de graphe (`object_id`, ou un bout d'un lien `from|type|to`) ou une valeur (`old_value` / `new_value`) désigne la personne effacée est SUPPRIMÉE (DELETE, pas une pierre tombale `reverted_at`) dans la même transaction (`person-erasure-corrections-purge.ts`) — la SEULE exception écrite à la fois à « on archive, on ne supprime pas » et à « une correction humaine gagne toujours ».",
    nextPack: null,
  },
  {
    key: 'c70_conversation_archivee_pas_supprimee',
    theme: 'Une conversation avec Laura s’archive, elle ne disparaît pas',
    canonical:
      'Depuis #2430.9 (DÉCISION LOUIS 20/09/2026, QCM), « supprimer » une conversation avec Laura ARCHIVE ses messages : ils restent en base, `archived_at` posé, retrouvables via « Voir les conversations rangées ». ' +
      "Le geste réutilise `ChatMessagesService.setThreadArchived` (#1120), le mécanisme d'archivage EXISTANT — jamais un second DELETE (GA-26). " +
      "Côté écran, le bouton ne promet plus une suppression qu'il ne fait pas : le libellé passe de « Supprimer » à « Retirer »/« Remove », et la phrase de confirmation dit ce qui survit (les messages) et ce qui part pour de bon (le titre, les documents joints).",
    supersedes:
      "Le DELETE SQL sur `chat_messages` (`ChatMessagesService.deleteThread`, jusqu'au 20/09/2026) : les messages disparaissaient pour de bon, sans trace, contre « on archive, on ne supprime pas ». L'ancienne justification (« ce sont les mots de quelqu'un, pouvoir les retirer est un droit ») tenait pour le RETRAIT de la vue, pas pour leur DESTRUCTION — elle ne tient plus le débat : le mécanisme d'archivage existait déjà pour le même besoin, sous le même bouton (« Ranger »).",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/ia-proxy/chat-messages.service.ts',
      'apps/api/src/modules/ia-proxy/chat-messages.thread-archived.spec.ts',
      'apps/api/src/modules/ia-proxy/ia-proxy.controller.ts',
      'apps/web/src/features/chat/view/ConversationsPanel.tsx',
      'apps/web/src/features/chat/view/ConversationsPanel.thread-actions.test.tsx',
      'apps/web/src/features/chat/api/agentChatApi.ts',
    ],
    gap: "Le titre stocké (#1911.1), les documents « fil seul » joints (#1954) et la mémoire roulante de Laura sur le fil (#1927.10) continuent, eux, de partir pour de bon au même geste : ce sont des artefacts DÉRIVÉS du fil, pas son contenu, et convertir ces trois décisions séparées n'était pas dans le périmètre de celle du 20/09. Un fil ressorti après ce geste retrouve ses messages, pas son titre personnalisé ni les documents qu'il portait — connu, pas corrigé ce tour.",
    nextPack: null,
  },
  {
    key: 'c71_latence_produit_pas_cout_dacces',
    theme: 'Latence produit',
    canonical:
      "Une durée d'ENRICHISSEMENT est une latence PRODUIT, jamais un coût d'accès. `enrichment_duration_samples` reste anonyme PAR CONSTRUCTION — ni `workspace_id` ni `user_id` (migration `1789816319703-EnrichmentDurationSamples`) — et la médiane que `GET /contacts/enrichment-duration-estimate` sert à CHAQUE espace agrège donc les mesures de TOUS les espaces : c'est CONFORME et VOULU, pas un oubli de cloisonnement. Rien de commercial ne fuit d'une durée technique. " +
      "DEUX RÈGLES EN TENSION, ET LAQUELLE S'APPLIQUE À QUOI : GA-43 (« le coût d'accès ne s'agrège JAMAIS entre espaces — ce sont des concurrents ») vise ce qu'un espace PAIE pour atteindre une donnée — `access_facts`, nature `cost`, le mécanisme communautaire du tome 8 (§26, §54) — pas le temps que le produit met à traiter une action ; cette table n'entre jamais dans son périmètre. `c64_analytique_produit` (« l'analytique produit mesure le PRODUIT, jamais la personne ») continue de s'appliquer telle quelle : c'est elle, pas GA-43, qui gouverne cette table, et la migration d'origine la citait déjà.",
    supersedes:
      "Un cloisonnement par espace posé sur `enrichment_duration_samples` — proposé lors d'un lot du 21/09/2026, arrêté au dépôt avant intégration. Un `workspace_id` ajouté ici aurait été un COMMENCEMENT de fuite commerciale (une ESN verrait la latence d'enrichissement mesurée chez une autre), pas une correction : la table n'a jamais été un registre d'accès.",
    codeState: 'implemented',
    enforcement: 'held',
    holders: [
      'apps/api/src/migrations/1789816319703-EnrichmentDurationSamples.ts',
      'packages/contracts/src/schemas/table-scopes.ts',
      'apps/api/src/architecture/endpoint-guards.spec.ts',
      'apps/api/src/architecture/community-aggregation-kinds.spec.ts',
      'apps/api/src/database/entities/enrichment-duration-sample.entity.ts',
    ],
    gap: "Rien ne garde STRUCTURELLEMENT qu'une migration future ne réintroduise pas `workspace_id`/`user_id` sur cette table : GA-43 (`community-aggregation-kinds.spec.ts`) ne scanne que les requêtes croisant `access_facts`, et `endpoint-guards.spec.ts` fige le contrôleur (`BARE_ROUTES_AT_FREEZE`), pas le schéma. La règle tient par LECTURE — la migration d'origine et `table-scopes.ts` la citaient déjà toutes les deux — et c'est cette entrée qui la rend trouvable avant qu'un troisième lot ne repose la question.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 — ratifie ce que le code fait déjà (#2419.4,
    // commit `f6da94757`) : aucun cinquième statut d'encaissement.
    key: 'c72_encaissement_reste_du_nomme',
    theme: 'Encaissement — statuts',
    canonical:
      "Le cycle de règlement d'une facture reste EXACTEMENT quatre statuts — `paid` | `disputed` | `overdue` | `pending` — et n'en gagne jamais un cinquième. " +
      "Un règlement PARTIEL ne sort pas de sa file : la ligne reste `overdue` ou `pending` selon son échéance, et c'est le MONTANT qui porte l'information neuve — le reste dû (`outstandingAmountCents`) se NOMME, sur la ligne comme dans le total, jamais un statut « partiellement réglée ». " +
      "⚠️ PRÉCISION DATÉE — 22/10/2026, DÉCISION LOUIS (QCM C/D, maquettes Théo V22, écran Factures) : renverse c72 côté LIBELLÉ SEULEMENT. L'écran écrit « Partielle · en retard » sur un règlement partiel dont le solde est échu — libellé DÉRIVÉ (`invoiceDocumentState`, `apps/web/src/features/missions/invoice-documents.ts`) d'un règlement partiel ET d'un retard. Le STATUT reste l'un des QUATRE (`collectionStatus`), jamais stocké, jamais un cinquième : la lecture la moins destructrice, la file de relance et le reste dû nommé sont inchangés. " +
      "DÉCISION LOUIS 21/09/2026 : ratifie ce que #2419.4 avait déjà tranché et codé (`f6da94757`, 20/09/2026) — cohérent avec « un score n'est jamais nu » (le statut garde son montant nommé à côté) et avec « BellumAI SUIT le financier, il ne COMPTABILISE pas » (#2564) : un cinquième statut serait un pas vers une comptabilité d'encaissement que le produit ne tient pas. " +
      "⚠️ PRÉCISION DATÉE — 21/09/2026 (soir), DÉCISION LOUIS (#2418.2), qui n'entame RIEN de ce qui précède et répond à la question que ce refus laissait ouverte : « et les autres états du cycle, alors ? ». OUI pour « acceptée » (`accepted`), « rejetée » (`rejected`) et « avoir émis » (`credited`) — mais comme états du DOCUMENT dans l'outil du client, sur un TROISIÈME axe, à CÔTÉ des quatre d'encaissement et SANS s'y mêler. " +
      "Trois axes, trois questions : où en est NOTRE écriture (`INVOICE_CONNECTOR_WRITE_STATES` — `created`/`sent`/`invoiced`/`failed`/`unknown`), où en est le DOCUMENT chez le client (`INVOICE_DOCUMENT_STATES`, les trois neufs), et où en est l'ENCAISSEMENT (les quatre ci-dessus, DÉRIVÉS à l'écran et jamais stockés). Les confondre reviendrait à dire qu'une facture acceptée est payée, ou qu'un avoir est un litige. " +
      "Le refus du cinquième statut d'encaissement est INCHANGÉ, et ces trois états ne sont pas une porte dérobée pour l'y faire entrer : GA-377 vérifie que `partially_paid` n'existe sur aucun des trois axes, et que les trois vocabulaires sont deux à deux disjoints. " +
      "Ils ne s'écrivent QUE sur preuve du connecteur, jamais par déduction (même discipline que `c80_facture_se_nomme_sa_source`) : `invoiceDocumentStatusFromConnector` est la seule porte, et la contrainte SQL `invoice_connector_write_requests_document_evidence_check` exige l'état, sa référence chez l'outil et la date du constat tous les trois ou aucun — un `UPDATE` qui poserait « acceptée » sans preuve est refusé par PostgreSQL, pas seulement par une relecture.",
    supersedes:
      "Un statut `partially_paid` (ou équivalent) qui sortirait la ligne des seaux « en retard » et « en attente ». Mesuré au #2419.4 : le défaut d'origine était `if (item.paidAt) return 'paid'`, qui faisait déjà cet effet en pire — la ligne quittait TOUTE file de relance dès le premier centime réglé. Un cinquième statut reproduirait le même défaut en plus doux, une file de plus que personne ne regarde, pour le même geste de relance à faire.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/missions/collections.ts',
      'apps/web/src/features/missions/collections.test.ts',
      'apps/web/src/features/missions/view/CollectionsPage.tsx',
      'apps/web/src/features/missions/view/CollectionsPage.test.tsx',
      'apps/web/src/features/missions/view/PaymentDialog.tsx',
      // La PRÉCISION du 21/09/2026 (#2418.2) : le TROISIÈME axe, sa contrainte
      // SQL posée avant le code qui l'écrit, et la garde qui tient la séparation.
      'packages/contracts/src/schemas/invoice-connector-write.ts',
      'apps/api/src/migrations/1795997318604-InvoiceDocumentState.ts',
      'apps/api/src/architecture/trois-etats-de-document-jamais-quatre.spec.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 — ratifie ce que le code fait déjà : #2123.37
    // (« Préparée », 16/09) et `message-send-provenance.ts` (vérifié/déclaré).
    key: 'c73_fait_ne_porte_pas_preuve_denvoi',
    theme: 'Actions — « Fait » est déclaratif',
    canonical:
      "Marquer une action du plan « Fait » (`execution_status: 'done'`) est un geste DÉCLARATIF du commercial : Bellum n'affirme jamais avoir VU l'envoi, encore moins livré le message. " +
      "DÉCISION LOUIS 21/09/2026 : « Fait » ne porte et ne portera jamais de preuve d'envoi — même logique que « le copilote n'envoie jamais d'e-mail, il prépare » et que « facturé ne s'écrit que sur preuve du connecteur ». " +
      "Le produit distingue déjà les deux natures qu'un total ne doit jamais fondre l'une dans l'autre : **vérifié** (Bellum a réellement expédié — `message_sent`, `via='bellum'`, la seule preuve de livraison détenue) et **déclaré** (le commercial affirme avoir envoyé lui-même — LinkedIn, aucune API de messagerie n'existe). « Fait » reste un troisième geste, plus large encore : il couvre aussi un appel, une préparation de brouillon jamais envoyée, un rappel honoré — rien de tout cela n'est une preuve de livraison.",
    supersedes:
      "Toute proposition d'ajouter, avant de cocher « Fait », une vérification ou une preuve que l'envoi a réellement eu lieu (lecture de la boîte du commercial, accusé de réception). Refusée : elle suppose un accès que le produit n'a pas et n'aura pas côté LinkedIn (`c24_linkedin`), et elle romprait la promesse — déjà écrite pour la frise de séquence (`SequenceDetailSheet.tsx`) — que Bellum ne dit jamais « envoyé » là où seul « fait » peut être établi.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/action-plan-items.ts',
      'apps/web/src/features/actions/components/ActionExecuteMenu.tsx',
      'apps/web/src/features/actions/components/ActionExecuteMenu.test.tsx',
      'apps/web/src/features/actions/components/ActionExecuteMenu.prepared.test.tsx',
      'apps/web/src/features/actions/hooks/useCompleteRelance.ts',
      'apps/api/src/modules/actions/message-send-provenance.ts',
      'apps/api/src/modules/actions/message-send-provenance.spec.ts',
      'apps/web/src/features/outreach/view/SequenceDetailSheet.tsx',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // ⚠️⚠️ RENVERSEMENT ASSUMÉ, DÉCISION LOUIS 21/09/2026 — de la décision du
    // 16/09/2026 (soir), écrite au registre `registre-2026-09-16-actions.md`
    // (#2203.32 et suivants). La décision du 16/09 NE DISPARAÎT PAS : elle est
    // citée telle quelle dans `supersedes`, datée et renversée — un arbitrage
    // effacé se re-propose, un arbitrage renversé se lit.
    key: 'c74_campagne_etiquette_mono_contact',
    theme: 'Séquences — campagne',
    canonical:
      'Le lancement groupé de séquences reste STRICTEMENT mono-contact : le moteur crée UNE séquence PAR contact (#1515), et la seule sortie ajoutée est une ÉTIQUETTE légère qui les regroupe pour la LECTURE — `campaign_label`, dérivée dans `campaign-label.ts` et nulle part ailleurs, affichée par `CampaignBanner` sur `SequencesPage.tsx`. ' +
      "DÉCISION LOUIS 21/09/2026 : referme le chantier de l'audience multi-contacts. L'étiquette légère répond au besoin réel — « où en est ma campagne ? » — sans le modèle plus lourd d'une séquence à audience partagée. " +
      "Écarte #2203.32 à .38, #2203.59, #2203.68 et #2201.24 : le tableau d'audience PAR CONTACT, le retrait d'un contact d'une séquence commune et le résumé de lot qu'ils décrivaient ne se construiront pas — `campaign_label` + `CampaignBanner` les remplacent par une lecture groupée, pas par un objet. " +
      "⚠️ c74 assoupli le 10/10/2026 par Louis (#3894.3, « je veux du multi contact aussi si je le demande ») : multi-contacts sur demande explicite. Par défaut, « lance la prospection » prépare UN contact (inchangé). Sur demande EXPLICITE de plusieurs personnes, Laura prépare une audience — une séquence mono-contact par personne (même moteur, mêmes gardes), regroupées sous le MÊME `campaign_label`, rien n'est envoyé (`POST outreach/from-template/:id/audience`, `applySequenceTemplateAudienceRequestSchema` : ≥ 2 contacts distincts ET `explicit_multi_contact: true`, sinon refus). Ce n'est toujours PAS un objet « audience » ni une table « campagne ».",
    supersedes:
      "⚠️ RENVERSE la décision de Louis du 16/09/2026 (soir), telle qu'écrite au registre (#2203.32) : « une séquence porte PLUSIEURS contacts. Le modèle mono-contact de `CreateSequenceDialog.tsx:70-79` est abandonné : une séquence a une audience, chaque contact y porte son état, et peut en sortir seul sans annuler la séquence entière. Chantier : contrat, migration SQL élargie AVANT le code (GA-11/GA-12), puis écran. » " +
      "Cette formulation du 16/09 reste l'ancien arbitrage — datée et renversée ici, pas effacée : quelqu'un qui la retrouverait ailleurs (issue, registre, mémoire) doit savoir qu'elle a été tranchée dans l'autre sens le 21/09.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/outreach/campaign-label.ts',
      'apps/web/src/features/outreach/campaign-label.test.ts',
      'apps/web/src/features/outreach/campaign-audience.ts',
      'apps/web/src/features/outreach/campaign-audience.test.ts',
      'apps/web/src/features/outreach/hooks/useCampaignAudience.ts',
      'apps/web/src/features/outreach/hooks/useCampaignAudience.test.tsx',
      'apps/web/src/features/outreach/view/SequencesPage.tsx',
      'apps/web/src/features/outreach/view/SequencesPage.campaign.test.tsx',
      'apps/web/src/features/outreach/view/CreateSequenceDialog.campaignLabel.test.tsx',
      'apps/api/src/modules/outreach/outreach.controller.spec.ts',
    ],
    gap: "Écart assumé, nommé le 16/09 et non levé par le renversement : pas de table « campagne », pas de cadence commune, pas d'ajout de contact après coup — l'objet plus lourd ne se crée QUE si la cadence commune est réclamée après usage. #2203.59 (retirer un contact) et #2203.68 (erreur contact par contact) restent sans équivalent PAR CONTACT après lancement : le seul geste reste « Annuler » la séquence entière de ce contact. #2201.24 (résumé de lot) n'est couvert que pour les séquences — pas pour la file d'actions/validations générale.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 — écrite AVANT le code, comme
    // `c67_poste_vu_le_jamais_verifie` : tranche #1950.15 (« pas de décision
    // produit sur les champs éditables par TYPE d'action », registre du
    // 12/09/2026), et referme #1950.5 / #1950.8 dans le même mouvement.
    key: 'c75_plan_duplication_edition_generique',
    theme: "Plan de Laura — édition d'étape",
    canonical:
      "Une étape du plan de Laura (`PlanRecap`, `/chat`) pourra être DUPLIQUÉE, et son édition passera par UN formulaire GÉNÉRIQUE — commun aux treize types d'action de `PendingChatAction['action']` (`copilot-plan.ts:98-113`), jamais par un formulaire dédié PAR TYPE. " +
      'Raison : treize formulaires dédiés sont treize endroits où une règle peut diverger, donc treize dérives à venir — un commercial qui corrige un champ sur le formulaire « message » et pas sur le formulaire « rappel » se retrouve avec deux comportements pour la même notion de champ.',
    supersedes:
      "L'absence de décision du 12/09/2026 (#1950.15 : « pas de décision produit sur les champs éditables par TYPE d'action ; hors budget de ce lot »), qui laissait ouvertes deux pistes concurrentes non écrites — un formulaire par type d'action, ou aucune édition possible après proposition.",
    codeState: 'absent',
    enforcement: 'unenforced',
    holders: [],
    gap: "Rien n'est écrit : ni la duplication d'étape, ni le formulaire générique, ni le champ qui distinguerait une étape dupliquée d'une étape proposée par Laura. Cette entrée EST la raison, écrite AVANT le code : le jour où ce chantier s'ouvre, il part de `PendingChatAction['action']` (`copilot-plan.ts:98-113`) et du rendu de `PlanRecap.tsx` / `PendingActions.tsx` — pas de treize formulaires dédiés. Referme aussi #1950.5 (nommer chaque étape) et #1950.8 (nommer les outils nécessaires) : les deux se liront depuis la même représentation générique par étape, pas par un second calcul par type.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 (midi) — maintient l'arbitrage du 16/09/2026
    // (`briefing-role-order.ts:9-13`, #1936.11) contre huit points du registre
    // du 16/09 qui redemandaient des blocs NOMMÉS ET FILTRÉS par rôle.
    key: 'c76_role_reordonne_jamais_ne_filtre',
    theme: 'Briefing — le rôle réordonne, jamais ne filtre',
    canonical:
      "Le rôle d'un commercial change l'ORDRE des cartes de « Aujourd'hui » (`BriefingPage.tsx`, route `/briefing`) et de l'accueil de Laura, jamais leur CONTENU — DÉCISION LOUIS 21/09/2026 : maintient l'arbitrage du 16/09/2026 (`briefing-role-order.ts:9-13`, #1936.11) déjà écrit pour le brief, et l'étend explicitement à la demande de blocs NOMMÉS ET FILTRÉS par rôle (« Commercial : Mes comptes », « Recruteur : Besoins »…) posée au registre du 16/09 (#2108.6, .9, .10, .11, .12, .13, .14, .15). " +
      "Chaque lecture porte les mêmes genres de carte, exactement une fois ; le rôle ne retire ni ne renomme rien, il choisit par quel genre l'écran s'ouvre. Raison : personne ne doit perdre une carte parce qu'un rôle est mal renseigné.",
    supersedes:
      "Huit blocs d'« Aujourd'hui » NOMMÉS ET FILTRÉS par rôle (#2108.6 « Commercial : Mes comptes », #2108.9 « Mes besoins », #2108.10 « Mes consultants », #2108.11 « Recruteur : Besoins », #2108.12 « Profils », #2108.13 « Disponibilités », #2108.14 « Entretiens », #2108.15 « Feedbacks ») — écartés au registre `registre-2026-09-16-dashboard.md` le 21/09/2026 : ces objets vivent déjà ailleurs (`/accounts`, `/projects`, `/talent`, `/projects/needs`), les y dupliquer sous un bloc filtré par rôle romprait la règle du 16/09.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/briefing/briefing-role-order.ts',
      'apps/api/src/modules/briefing/briefing-role-order.spec.ts',
      'apps/web/src/features/chat/view/laura-home-role-order.ts',
      'apps/web/src/features/chat/view/laura-home-role-order.test.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 (midi) — #2631.1.
    //
    // ⚠️ ÉTAT MIS À JOUR LE 21/09/2026 (soir), par le lot qui a écrit le
    // plancher. Ce qui a changé, et ce qui ne l'a pas :
    //
    //  · Le plancher PAR COMPTE ET PAR RÔLE existe (`app/eval/role_floor.py`),
    //    il est déclaré dans `expect.committeeRoles` de chaque golden, et il
    //    tourne dans `app.eval.run`, donc dans `app.eval.gate`, donc en CI.
    //  · Le « câblage en check requis » que cette entrée réclamait était DÉJÀ
    //    FAIT et n'avait été mesuré par personne : `ci.yml` lançait déjà
    //    `python -m app.eval.gate`, et le job `eval` était déjà dans `needs:`
    //    ET dans la liste `results` de `CI Status`, la cible de la protection
    //    de branche. Il manquait la garde qui l'y MAINTIENT — elle existe
    //    maintenant (`gate-qualite-ia-est-un-check-requis.spec.ts`).
    //
    // Le ROUGE a été mesuré, pas supposé : en échangeant le siège « Acheteur »
    // d'Accor contre un « Décideur budget » dans la fixture committée,
    // `--check-baseline` affiche « ✓ pas de régression », Δaggregate +0.000 et
    // `buying_committee` 0.40 inchangé — et le plancher sort en 1 avec
    // « Accor : le rôle « Acheteur » (procurement) a disparu du comité d'achat ».
    key: 'c77_gate_qualite_ia_bloque_sur_role_cle',
    theme: 'Qualité IA — gate CI par rôle clé',
    canonical:
      "La porte de qualité IA est un GATE CI AUTOMATISÉ et BLOQUANT, pas une lecture manuelle : le jeu de référence nommé (Decathlon, Accor, Carrefour, AXA, CACIB — `app/eval/golden/*.json`) fait échouer la CI dès qu'un RÔLE CLÉ du comité d'achat disparaît sur un de ces comptes, MÊME SI la moyenne du bench progresse. " +
      "DÉCISION LOUIS 21/09/2026 (#2631.1) : une moyenne qui monte peut cacher la perte d'un rôle sur un seul compte nommé — le gate doit voir CE compte-là, pas seulement l'ensemble.",
    supersedes:
      "Le gate actuel (`app/eval/gate.py`, Théo p.15 / roadmap §17, C8) ne bloque que sur une RÉGRESSION AGRÉGÉE face à `baseline.json`, quand la surface de prompt a changé : une moyenne en hausse le laisse passer même si un rôle clé d'un compte de référence a disparu — c'est exactement l'angle mort que #2631.1 ferme.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/eval/role_floor.py',
      'apps/ia/tests/test_eval_role_floor.py',
      'apps/ia/app/eval/run.py',
      'apps/ia/app/eval/gate.py',
      'apps/ia/app/eval/metrics.py',
      'apps/ia/app/eval/golden/decathlon.json',
      'apps/ia/app/eval/golden/accor.json',
      'apps/ia/app/eval/golden/carrefour.json',
      'apps/ia/app/eval/golden/axa.json',
      'apps/ia/app/eval/golden/cacib.json',
      '.github/workflows/ci.yml',
      'apps/api/src/architecture/gate-qualite-ia-est-un-check-requis.spec.ts',
    ],
    gap: "Ce qui RESTE, et qui n'est pas un détail : le plancher ne garde que les sièges que le jeu de référence TIENT réellement — relevé du 21/09/2026 sur les neuf goldens, `technical_buyer` et `procurement`. `economic_buyer`, `user_buyer` et `champion` ne sont couverts par AUCUN dossier de référence : les déclarer aujourd'hui obligerait à inventer un contact pour faire passer le compte, et c'est ainsi qu'un jeu de référence se met à mentir. Les élargir demande d'abord d'élargir les collectes de référence. Second écart, assumé : le banc est HERMÉTIQUE — il rejoue des fixtures committées, donc le plancher prouve que la chaîne de mesure ne perd pas un siège, jamais qu'une analyse LIVE le trouve.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 (midi) — #2650.2, mesuré au code le 21/09. Le
    // cron lui-même est écrit par un autre lot ; cette entrée tranche la
    // décision et nomme l'état actuel (une seule porte, manuelle).
    key: 'c78_remboursement_credits_nocturne',
    theme: 'Crédits — remboursement automatique nocturne',
    canonical:
      'Le remboursement des crédits débités à tort tourne CHAQUE NUIT, sans geste humain — DÉCISION LOUIS 21/09/2026 (#2650.2). Un CRON appelle la même porte que le back-office manuel (`RefreshRefundService.run`), `dryRun: false`, sur une cadence quotidienne ; le geste manuel reste disponible, en secours.',
    supersedes:
      "L'état mesuré au 21/09/2026 : une SEULE porte, l'appel back-office manuel du contrôleur (`refresh-refund.controller.ts`), `dryRun` VRAI par défaut, et RIEN ne l'appelle — un remboursement dû ne part que si quelqu'un se souvient de le déclencher à la main.",
    codeState: 'partial',
    enforcement: 'unenforced',
    holders: [
      'apps/api/src/modules/credits/refresh-refund.controller.ts',
      'apps/api/src/modules/credits/refresh-refund.service.ts',
      'apps/api/src/modules/credits/refresh-refund.service.spec.ts',
      'apps/api/src/modules/credits/refresh-refund.controller.e2e.spec.ts',
      'apps/api/src/modules/credits/credits.module.ts',
    ],
    gap: "Le service et son mode `dryRun` existent et sont testés ; le CRON qui l'appelle chaque nuit n'est pas écrit — un autre lot le fait. Tant qu'il ne tourne pas, un remboursement dû ne part que par appel manuel.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 (midi) — #2634.1. Élargissement ASSUMÉ de « pas
    // de scraping » (CLAUDE.md, agent_docs/doctrine.md) : la ligne ne disparaît
    // pas, elle se précise dans les deux sens.
    key: 'c79_collecte_large_mais_propre',
    theme: 'Collecte — large, tant que propre',
    canonical:
      'On collecte LARGEMENT — DÉCISION LOUIS 21/09/2026 (#2634.1), élargissement de « pas de scraping », pas une suppression. ' +
      "AUTORISÉ : les API officielles sous contrat ; les données que le client branche lui-même (son CRM, son ERP, ses fichiers) ; les registres publics ; les pages publiquement accessibles, lues telles qu'elles se présentent ; dans le respect des conditions d'usage et des limites de débit du service. " +
      "TOUJOURS INTERDIT : se faire passer pour quelqu'un d'autre ; contourner une protection technique (authentification, captcha, anti-robot) ; passer outre un refus explicite du site ; marteler un service au point de le gêner ; et, inchangé, tout ce que la doctrine RGPD protège déjà. " +
      "PRÉCISION — LinkedIn, DÉCISION DU COORDINATEUR 24/09/2026 (tranché sans Louis, §12 de decisions-louis-22-09-soir.md) : admis UNIQUEMENT par ce que l'utilisateur apporte LUI-MÊME — une URL, ou le texte d'une annonce/d'un post collé ou importé. Le serveur ne contacte JAMAIS LinkedIn : c'est « les données que le client branche lui-même », appliqué à LinkedIn. La voie API officielle sous contrat (#2634, toujours ouverte) reste une question commerciale/juridique séparée. Le signal porte sa source : « LinkedIn (apporté par toi) ».",
    supersedes:
      "L'ancienne formulation (CLAUDE.md, `agent_docs/doctrine.md`) : « Pas de scraping. Le principe qui tranche 100 % des cas ambigus : si la collecte suppose de se faire passer pour quelqu'un d'autre — un navigateur humain, un utilisateur connecté, un partenaire autorisé — on ne le fait pas. Exclut LinkedIn et les faux user-agents ; autorise le crawl d'un site public qui accepte les robots. » Elle ne disparaît pas : elle est précisée, dans les deux sens, par les deux listes ci-dessus. La précision LinkedIn du 24/09 n'entame rien des décisions du 21/09 (soir) et du 22/09 qui gardaient l'issue #2634 OUVERTE sans code : elle répond à une question distincte, jamais posée jusqu'ici (l'apport par l'utilisateur, pas l'automatisation).",
    codeState: 'implemented',
    enforcement: 'held',
    holders: [
      'apps/ia/app/services/firecrawl.py',
      'apps/ia/app/services/research/pappers.py',
      'apps/ia/app/services/data_sources/brave_news.py',
      'apps/api/src/modules/accounts/declared-signals.ts',
      'apps/api/src/modules/accounts/dto/declare-signals.dto.ts',
      'packages/contracts/src/schemas/declared-signal.ts',
    ],
    gap: "Les connecteurs existants (API officielles Pappers/Apollo/Brave, Firecrawl throttlé) respectent déjà la frontière ; rien ne la GARDE par un test — un futur connecteur qui spoofrait un user-agent ou contournerait un anti-robot ne ferait rougir aucune CI. Côté LinkedIn « apporté par l'utilisateur », `POST /accounts/:id/signals/declare` existe (24/09) ; le formulaire écran reste à livrer.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 (après-midi) — #2197.41. AFFINE la doctrine
    // #2564 (« BellumAI SUIT le financier, il ne COMPTABILISE pas », décision
    // Louis 18/09/2026, CLAUDE.md § « Ce qui n'écrit pas tout seul »).
    // ⚠️ #2564 elle-même n'a JAMAIS reçu d'entrée `c` dans ce registre — vérifié
    // par recherche exhaustive (`git log -S`, ce fichier, l'historique complet,
    // les deux branches d'intégration en vol au 21/09/2026) : seule la ligne
    // CLAUDE.md la porte, restaurée par `ab8a85515` / PR #2672 (21/09/2026)
    // sans jamais recevoir de clé ici. Cette entrée-ci n'invente donc PAS un
    // identifiant "c74" qui n'existe pas pour #2564 — elle cite #2564 par son
    // numéro d'issue, pas par une clé de registre absente. Ne pas confondre
    // avec `c72_encaissement_reste_du_nomme`, qui CITE #2564 en appui sans la
    // porter.
    // ⚠️ Renumérotée c79 → c80 à l'intégration (vague 6, 21/09/2026) : c79 était
    // déjà pris par `c79_collecte_large_mais_propre` (vague à midi, fusionnée
    // avant celle-ci) — GA-40.
    key: 'c80_facture_se_nomme_sa_source',
    theme: 'Facturation — la saisie manuelle reste, la valeur porte sa source',
    canonical:
      "DÉCISION LOUIS 21/09/2026 (#2197.41) : la saisie manuelle de « facturé » (`MarkInvoicedDialog`) RESTE, et la valeur porte désormais sa SOURCE. « facturé » (prouvé par le connecteur de l'outil branché par le client) et « déclaré facturé par <personne> le <date>, non confirmé » (saisie humaine, sans preuve de connecteur) deviennent deux états DISTINCTS, distinguables PARTOUT où la valeur voyage — pas seulement dans le dialogue de saisie : les listes, les totaux, les exports, ce que Laura en dit.",
    supersedes:
      "Affine #2564 (DÉCISION LOUIS 18/09/2026, « BellumAI SUIT le financier, il ne COMPTABILISE pas ») — ce n'est PAS un revirement : « facturé » ne s'écrit toujours que sur preuve du connecteur, exactement comme #2564 le pose déjà. Ce qui change : on cesse de CONFONDRE une déclaration humaine avec cette preuve — on la NOMME au lieu de l'interdire. Ne touche pas le reste de #2564 (encaissements/marge/CA par mission suivis ; plan comptable, écritures et journal comptable toujours refusés). L'état antérieur, sans nom : `MarkInvoicedDialog` (`apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx:665-710`) écrit « facturé » sur une saisie manuelle, sans distinction visible avec une preuve de connecteur — ce que #2564 interdisait déjà sans que rien ne le tienne.",
    // #2197.41 / c80 — état relevé le 31/10/2026 : la distinction EXISTE pour la
    // saisie (`markInvoiced` écrit `invoiced_declared`, jamais `invoiced`) et pour
    // la chaîne mission→encaissement ; `absent` n'était plus vrai.
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/delivery/invoice-readiness.service.ts',
      'apps/api/src/modules/delivery/invoice-readiness.controller.ts',
      'apps/api/src/modules/delivery/invoice-readiness.service.spec.ts',
      'apps/web/src/features/missions/chain/missionChain.ts',
      'apps/web/src/features/missions/view/InvoiceReadinessPanel.tsx',
    ],
    gap: "Posé : `markInvoiced` (`invoice-readiness.service.ts:596-620`, route `invoice-readiness.controller.ts:236`) écrit l'état `invoiced_declared` avec `invoiced_by` et la date, jamais `invoiced` ; la chaîne le NOMME (`missionChain.ts:663`) ; gardé par `invoice-readiness.service.spec.ts:687-718` (upsert « déclaré », nom du déclarant). Reste : aucune garde ne tient la frontière sur TOUTES les surfaces où la valeur voyage (totaux, exports, discours de Laura) — `partial` tant que ce relevé n'est pas fait.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 — #2378.9. Écrite parce que la règle n'existait
    // nulle part SOUS FORME DE RÈGLE : elle existait comme une table
    // (`INTENT_REACH`, #1931) pour UNE des deux familles d'effets du produit,
    // et pas du tout pour l'autre (les natures d'étape du constructeur de
    // séquences). Une règle qui ne vit que dans une table se re-litigie dès
    // qu'une deuxième table lui est nécessaire — c'est exactement ce qui
    // arrivait ici.
    key: 'c81_etape_sortante_attend_interne_part',
    theme: 'Séquences et automatisations — la frontière sortant/interne',
    canonical:
      "⚠️ 11/10/2026 — RENVERSEMENT DATÉ (décision Louis, épopée #4016, lot L5) : au-delà de la campagne (c89, 05/10), un MANDAT SIGNÉ peut désormais couvrir la délégation PAR DÉFAUT des étapes e-mail des séquences de l'espace (portée `workspace_sequences`), l'envoi de Laura, la relance d'impayé et le suivi de rendez-vous — une portée par usage, chacune signée explicitement. Sans mandat actif couvrant la portée, rien ne part : « inconnu ⇒ attend » reste la règle, et un niveau d'automatisation n'est jamais un mandat. L'ancienne règle reste lisible : " +
      "Une étape PROGRAMMÉE (J+4, J+10) s'exécute selon CE QU'ELLE ATTEINT, jamais selon qui l'a programmée ni selon le niveau d'automatisation de l'espace. " +
      "Elle atteint quelqu'un d'EXTÉRIEUR (e-mail, message, invitation) ⇒ elle ATTEND une validation explicite, même programmée, même lancée. Elle est purement INTERNE (créer une tâche, poser un rappel, rafraîchir une donnée) ⇒ elle s'exécute à l'heure dite, sans clic. " +
      "DÉCISION LOUIS 21/09/2026 (#2378.9). Ce qui est tranché n'est donc PAS « pas d'auto-exécution » — c'est la FRONTIÈRE : le produit a le droit d'agir seul, il n'a pas le droit de PARLER À QUELQU'UN seul. " +
      "Deux obligations la rendent tenable dans six mois, et elles ne se remplacent pas : chaque nature d'effet DÉCLARE son côté dans le contrat (`Record<K, EffectReach>` — une nature ajoutée sans être déclarée ne compile pas), et une nature INCONNUE à l'exécution tombe du côté qui ATTEND (`reachFromTable` — la valeur venue d'une colonne élargie ou d'un JSON importé, que le compilateur ne voit pas). Le sens du défaut n'est pas symétrique : se tromper du côté « attend » coûte un clic, se tromper du côté « part » écrit à un client au nom du commercial.",
    supersedes:
      "Deux formulations, opposées, qui se re-proposent l'une après l'autre. (1) « Pas d'auto-exécution d'une étape programmée » — la lecture qu'en faisait le registre de séquences avant l'arbitrage (`.claude/notes/registre-2026-09-20-chat-lot6.md`, ligne #2378.9 : « doctrine CLAUDE.md : un ENVOI vers un humain reste toujours approuvé avant départ — pas d'auto-exécution d'envoi »), généralisée à tort en « rien ne part seul » : elle réclamerait un clic pour poser un rappel, ce que le produit fait déjà tout seul et doit continuer de faire. (2) « Une séquence lancée s'exécute, c'est le sens du mot séquence » — l'envoi automatique à J+4 que le mot « séquence » laisse attendre de n'importe quel outil d'outreach. Les deux sont refusées par le MÊME arbitrage : ni l'un ni l'autre ne regarde CE QUE L'ÉTAPE ATTEINT. " +
      "Ne touche ni `c14_automatisation` (« aucune autonomie globale : planifier → simuler → approuver → exécuter → vérifier ») ni `c82_copilote_prepare_le_commercial_envoie` : cette entrée donne la RAISON générale dont l'e-mail est le cas le plus cher, et #2375.10 (21/09/2026) a confirmé ce cas-là sans exception, sans liste blanche et sans réglage.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/effect-reach.ts',
      'packages/contracts/src/schemas/effect-reach.test.ts',
      'packages/contracts/src/schemas/outreach-sequence.ts',
      'packages/contracts/src/schemas/action-os.ts',
      'apps/api/src/modules/outreach/sequence-frontier.ts',
      'apps/api/src/modules/outreach/outreach.service.ts',
      'apps/api/src/architecture/une-etape-qui-sort-attend.spec.ts',
      'apps/api/src/architecture/external-steps-need-a-human.spec.ts',
      'apps/api/src/modules/action-os/approval-policy.ts',
    ],
    gap: "Le côté INTERNE de la frontière n'a pas encore d'ORDONNANCEUR : aucun cron, aucun worker n'exécute une étape de séquence à son échéance. Ce qui part tout seul aujourd'hui est posé à la CRÉATION de la séquence (`OutreachService.create` dispatche `schedule_reminder` pour chaque étape, y compris email — le rappel y dit « à envoyer »). L'écran dit donc « en attente de validation » pour TOUTE étape échue, interne comprise (`deriveOutreachDisplayStatus`), ce qui est honnête tant que rien ne s'exécute : dire « part à l'heure dite » d'une étape que personne n'exécute serait la promesse inverse. La moitié « ce qui SORT attend » est, elle, pleinement tenue — GA-374 sur le constructeur de séquences, GA-239 sur les pas d'Action OS. Ce que la frontière garantit d'avance, c'est que l'ordonnanceur du jour où il existera ne pourra pas faire partir un effet externe sans que quelqu'un supprime une ligne visible.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/09/2026 — #2375.10. Écrite parce que la règle n'avait
    // AUCUNE entrée : elle ne vivait que dans une ligne de `CLAUDE.md`, et
    // `c73_fait_ne_porte_pas_preuve_denvoi` la citait en appui sans la porter.
    key: 'c82_copilote_prepare_le_commercial_envoie',
    theme: 'Envoi — le copilote prépare, le commercial envoie',
    canonical:
      "⚠️ 11/10/2026 — RENVERSEMENT DATÉ (décision Louis, épopée #4016, lot L5 : « tout ok mais faut un go vérifié avant ») : Laura PEUT envoyer, mais SEULEMENT sous un MANDAT SIGNÉ explicitement par le commercial pour la portée `laura_send` (`DELEGATION_SCOPES`, `outreach-delegation.ts`) — mandat borné (durée, volume, fenêtre, bornes du plan), révocable, renouvelable par re-signature, arrêté sur réponse ; Laura ne signe jamais rien elle-même, et le message part par le dispatcher outreach (`gateAwaitingMandate`), jamais par une carte confirmée à sa place. Oppositions, exclusions, effacement (c69) et consentement expiré (c45) sont relus à CHAQUE envoi. Sans mandat actif de cette portée, la règle ci-dessous vaut ENTIÈRE. L'ancienne règle reste lisible : " +
      "Le copilote n'envoie JAMAIS un e-mail de prospection de lui-même : il PRÉPARE tout — destinataire, objet, corps, pièce jointe — et attend le clic. " +
      "DÉCISION LOUIS 21/09/2026 (#2375.10) : **ni liste blanche, ni exception, ni réglage.** La question revenait sous trois formes, et les trois sont refusées : « juste pour les contacts qu'on connaît déjà » (liste blanche), « juste quand la personne a déjà répondu » (exception), « juste si l'espace se règle ainsi » (réglage). " +
      "C'est cette CLÔTURE qui est neuve, et elle est ce qui rend la règle tenable par un test : un refus sans exception se garde, un refus « sauf quand » se re-négocie à chaque cas particulier. Un envoi reste donc classé « sort du produit » (`reachesOutsideProduct`), et aucun des six niveaux d'automatisation ni aucun seuil de volume ou de dépense ne le fait descendre sous l'approbation d'un humain (`levelForStep`).",
    supersedes:
      "Les trois assouplissements ci-dessus, et l'automatisme que le mot « séquence » laisse attendre de n'importe quel outil d'outreach — un envoi qui part à J+4 parce que la séquence a été lancée. Refusé de nouveau le 21/09/2026 dans le même souffle que #2378.9, qui en donne la raison GÉNÉRALE (`c81_etape_sortante_attend_interne_part` : ce qui SORT attend, ce qui est INTERNE part) ; l'e-mail en est le cas le plus cher, parce qu'il est irréversible et qu'il engage le commercial auprès de son client. " +
      "N'entame pas ce qui est DÉJÀ autorisé et doit le rester : préparer un brouillon, le déposer dans la boîte personnelle du commercial (`create_mail_draft`, D58), poser un rappel « à envoyer », signaler une réponse favorable. Préparer n'est pas envoyer, et la règle n'a jamais interdit de préparer.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/architecture/aucun-envoi-sans-clic.spec.ts',
      'apps/api/src/architecture/external-steps-need-a-human.spec.ts',
      // #4016 L5 — le mandat `laura_send` et la porte du dispatcher qui le relit à chaque envoi.
      'packages/contracts/src/schemas/outreach-delegation.ts',
      'apps/api/src/modules/outreach/outreach-delegation.service.ts',
      'apps/api/src/modules/outreach/outreach-send.sweeper.ts',
      'apps/api/src/modules/contacts/contacts.controller.ts',
      'apps/api/src/modules/action-router/action-router.service.ts',
      'apps/api/src/modules/action-os/approval-policy.ts',
      'packages/contracts/src/schemas/action-os.ts',
    ],
    gap: "UNE porte d'envoi n'est pas un bouton d'écran, et il faut qu'elle se voie : `POST contacts/:id/send-email` de la surface MCP (`apps/api/src/modules/mcp-api/mcp-api.controller.ts`), scope EXPLICITE `mcp:act`, jeton émis par le commercial lui-même, propriété re-résolue côté serveur. Ce n'est pas le copilote qui partirait seul — c'est le commercial agissant par un autre clavier — mais c'est le seul chemin d'envoi que la phrase « l'écran prépare et attend le clic » ne décrit pas mot pour mot. Elle a été TROUVÉE par la garde GA-375 le 21/09/2026 (le relevé attendait deux appelants, il en a rendu trois) et elle est NOMMÉE dans sa liste gelée plutôt que tolérée en silence : ajouter un quatrième appelant demande d'éditer cette liste, ce qui se voit en relecture.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 18/09/2026 — #2302 (LAU-FINAL-043, chantier « les
    // compilateurs de /chat »). Le mot « territoire » avait deux définitions
    // concurrentes dans le cadrage : un NIVEAU DE COMPTE (#2302 — quel
    // périmètre adresser dans un compte : groupe/filiale/BU/site) et un NŒUD
    // DE GRAPHE D'ORGANISATION (#2310 — un nœud typé du graphe, `programme`/
    // `site` compris). Les deux se lisaient comme synonymes sur plusieurs
    // specs `chat-*` alors qu'ils répondent à deux questions différentes.
    key: 'c83_territoire_niveau_compte_vs_noeud_de_graphe',
    theme: 'Territoire — niveau de compte, jamais un nœud de graphe',
    canonical:
      "« Territoire » (`territoryLevelSchema`, `packages/contracts/src/schemas/analysis/primitives.ts`) désigne UNIQUEMENT un NIVEAU DE COMPTE — le périmètre qu'une approche commerciale doit adresser (groupe / maison mère / filiale / sous-filiale / BU / direction / entité juridique / marque / établissement / région / pays). " +
      "Le NŒUD DE GRAPHE D'ORGANISATION (`orgEntityTypeSchema`, `packages/contracts/src/schemas/org-graph.ts` — groupe/filiale/bu/departement/programme/site/spv/factory/data_office/lab) est un AXE SÉPARÉ, qui répond à une autre question (« qui est rattaché à qui dans l'organigramme »). " +
      "`'programme'` et `'projet'` N'APPARAISSENT JAMAIS dans `territoryLevelSchema` : ce sont des nœuds/overlays du graphe d'organisation, pas un niveau de territoire — un point qui les demanderait comme niveau renvoie vers `orgEntityTypeSchema` plutôt que de dupliquer la valeur sous un autre nom (GA-26).",
    supersedes:
      "Le cadrage du 18/09/2026 utilisait « territoire » indifféremment pour les deux notions sur les registres `chat-territory-resolver` (#2302) et `chat-orggraph-influence` (#2310), au point qu'un des deux devait renommer le point « site » de l'autre (voir la réconciliation du 21/09/2026 sur #2310.5, qui renvoie explicitement vers #2302.9 comme « le mauvais axe »). Le mot n'est pas retiré : il est réparti, une fois, entre les deux schémas qui existaient déjà.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/analysis/primitives.ts',
      'packages/contracts/src/schemas/analysis/primitives.test.ts',
      'packages/contracts/src/schemas/org-graph.ts',
      'apps/ia/app/services/compilers/territory_resolver.py',
      'apps/ia/tests/test_territory_resolver.py',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 22/09/2026 — #2723 (call bêta, Loïc Inacio, 22/09/2026).
    // RENVERSEMENT ASSUMÉ, ÉCRIT COMME TEL dans le corps de l'issue : « Laura
    // ne demande plus si on doit consommer des crédits […] Si un utilisateur
    // demande quelque chose, Laura le fait, point. » Cas vécu : une analyse du
    // compte OGF a demandé des informations complémentaires avant de partir,
    // et il a fallu repartir d'une conversation neuve pour l'obtenir.
    key: 'c84_analyse_recherche_enrichissement_partent_sans_carte',
    theme: 'Copilote — une demande interne part sans carte à valider',
    canonical:
      "Une analyse, une recherche ou un enrichissement demandés en langage naturel PARTENT DIRECTEMENT — aucune carte à valider, aucun clic de confirmation de coût. `plan_account_analysis` reste la préparation (dossier existant, coût, questions) mais ne rend plus `status: pending_confirmation` ; le modèle enchaîne lui-même avec `start_account_analysis` dans le même tour, sauf question dont la réponse changerait réellement l'analyse. " +
      "Le filet n'est plus en AMONT (un clic) mais en AVAL : `c78_remboursement_credits_nocturne` (remboursement nocturne, sans geste humain) absorbe le risque nommé et ACCEPTÉ dans #2723 — #981 (fermée, « 8 crédits facturés pour aucun résultat »), plus probable sans la porte, prix assumé de l'arbitrage. " +
      "La frontière que `c81_etape_sortante_attend_interne_part` pose ailleurs NE BOUGE PAS ici : analyse/recherche/enrichissement sont INTERNES (partent seuls) ; un e-mail, un message, une invitation ATTEIGNENT quelqu'un et attendent toujours une validation explicite, sans exception (`c82_copilote_prepare_le_commercial_envoie`).",
    supersedes:
      "D1 — décision Louis 14/09/2026, écrite dans `apps/ia/app/services/chat_tools.py` (aux trois endroits qui la citaient : la description de l'outil `plan_account_analysis`, le docblock au-dessus de `_analysis_card`, et le commentaire dans `execute_chat_tool`) : « proposer une analyse = une carte à valider, le clic est la décision ». D1 n'est PAS effacée — chacun des trois commentaires porte désormais la mention RENVERSÉE, datée du 22/09/2026, avec le texte D1 original conservé en dessous : un arbitrage effacé se re-propose, un arbitrage renversé se lit.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/chat_tools.py',
      'apps/ia/tests/test_chat_analysis_tools.py',
      'apps/ia/tests/test_copilote_security_eval.py',
      'apps/ia/tests/test_copilote_scope_eval.py',
      // #3859 (recette prod 09/10, lot F03) — `laura_data_unknown.py` disait l'inverse
      // (« seule une recherche qui dépense des crédits se propose, sans jamais partir
      // sans accord ») sans la nuance « demandée en langage naturel » que ce doctrine
      // pose déjà : Laura s'appuyait sur CETTE phrase pour proposer plutôt que lancer.
      'apps/ia/app/prompts/laura_data_unknown.py',
      'apps/ia/tests/test_copilote_data_unknown_eval.py',
    ],
    gap: "Le web (`apps/web/src/features/chat/view/PendingActions.tsx`) portait le rendu de la carte pour l'action `start_account_analysis` : il devient INACCESSIBLE (le service IA n'émet plus jamais `pending_confirmation` pour cette action) mais n'a pas été retiré — code mort, sans risque fonctionnel, laissé pour un lot dédié plutôt que touché à la hâte dans celui-ci. Aucune évaluation golden/LLM n'a été ajoutée pour mesurer, sur des cas réels, la fréquence à laquelle le modèle enchaîne vraiment sans poser de question superflue — seul le CONTRAT serveur (jeton, ordre des deux outils, absence de `pending_confirmation`) est gardé par les tests.",
    nextPack: null,
  },
  {
    // Épopée #3015 (25/09/2026) — la recherche globale multi-entités (accès
    // clavier, PDF/tome hors périmètre — chantier hors-PDF né du registre
    // `.claude/notes/registre-2026-09-16-ecrans-secondaires.md`). L'épopée
    // nommait elle-même le blocage avant tout code : « `⌘K` mène DÉJÀ à Laura
    // […] donc le premier chantier avant tout code est de trancher la
    // collision de raccourci. » Tranché sans Louis, comme le registre source
    // le prévoyait déjà (« doctrine issues sans questions »).
    key: 'c85_recherche_globale_ne_vole_pas_laura',
    theme: 'Recherche globale — la combinaison ne vole pas Laura',
    canonical:
      'La recherche globale multi-entités répond à `⌘⇧K` (MOD+SHIFT+K), jamais à `⌘K` seul — qui reste, sans exception, la porte de Laura. `matchesChord` compare `shiftKey` STRICTEMENT dans les deux sens : `⌘⇧K` ne déclenche jamais Laura, et `⌘K` seul ne déclenche jamais la recherche. ' +
      "Aucun raccourci de ce lot ne répond pendant la saisie (`firesWhileTyping` reste réservé à `⌘K`, la seule exception assumée et documentée) : ouvrir la recherche PAR-DESSUS une saisie en cours ailleurs (un formulaire, une note) n'est pas le geste réflexe que `⌘K` est devenu.",
    supersedes:
      "Aucun arbitrage antérieur ne portait sur cette combinaison précise — c'est la première recherche globale du produit. Ce qui est supplanté est une TENTATION, pas une décision écrite : reprendre `⌘K` pour la recherche (le geste le plus commun ailleurs) aurait fallu déplacer ou retirer la porte de Laura, un renversement de `global.launcher` (`shortcuts.ts`) qu'aucune mesure ni aucun retour utilisateur ne demandait — la epic elle-même ne demandait que de RÉSOUDRE la collision, pas de trancher pour Laura.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/shortcuts/shortcuts.ts',
      'apps/web/src/features/shortcuts/shortcuts.test.ts',
      'apps/web/src/features/shortcuts/ShortcutsProvider.tsx',
      'apps/web/src/features/shortcuts/shortcut-format.ts',
      'apps/web/src/architecture/shortcuts-are-shown.test.tsx',
      'apps/web/src/architecture/sidebar-carries-no-shortcut-caps.test.tsx',
    ],
    gap: "Le bouton `GlobalSearchTrigger` (barre latérale) rend la recherche atteignable au clic partout où `AppSidebar` se monte, mais sa portée sur la coque MOBILE (tiroir `Sheet` sous 768 px) n'a pas été vérifiée à l'écran — seul le comportement clavier, par nature un concept de bureau, est gardé par des tests. L'épopée #3015 elle-même ne nommait que « accès clavier » : la parité tactile, si elle est due, reste à mesurer dans un lot dédié.",
    nextPack: null,
  },
  {
    // Épopée #2775 (#2012.9, LOT j1 26/09/2026) — deux passes d'écrivain
    // (25/09, commentaires #2775) mesuraient déjà l'écart sans le trancher :
    // « aucune décision de doctrine nommée + datée n'a acté ce regroupement
    // comme définitif (rien dans CLAUDE.md ni agent_docs/doctrine.md sur ce
    // point) ». Les deux issues fermées #2012/#2089 avaient déjà livré le
    // reste (récap, écran dédié, événements produit start/complete/failed) ;
    // seul restait ce point nommé, non fermé faute d'arbitrage écrit.
    key: 'c86_onboarding_market_offer_plan_un_seul_signal',
    theme: 'Onboarding — market/offer/plan restent UN seul signal',
    canonical:
      "Les six phases affichées à l'écran de génération (`verify | buildProfile | market | offer | plan | persist`, `onboarding-generation-phases.ts:21`) restent dérivées de DEUX signaux RÉELS seulement (`verify`, `buildProfile`) : `market`/`offer`/`plan`/`persist` PARTAGENT le second, `buildProfile`. " +
      "`ProfilerAgent._generate` (`apps/ia/app/agents/profiler.py:197`) fait UN SEUL appel `call_claude_sync` qui produit tout le `ProfileContext` d'un coup (marché, offre, plan compris) : il n'existe aucun travail réel distinct à trois instants pour ancrer trois événements sans donnée fictive (doctrine « jamais de donnée fictive », #2012 : « chaque phase commence et se termine sur un événement réel »). " +
      "Découper cet appel en trois générations Claude distinctes ajouterait coût ET latence pour la seule granularité d'affichage — moins coûteux de GARDER le regroupement et de le NOMMER que de le construire. Ce que #2012.9 demandait EST tenu pour `verify` et pour le début/fin globaux de `buildProfile` (`onboarding_generation_started`/`completed`/`failed`, `profile-context.service.ts`) : ce qui reste groupé l'est PAR CHOIX écrit ici, pas par oubli.",
    supersedes:
      "Aucun arbitrage antérieur ne portait sur ce point précis — seule une LIMITE ASSUMÉE mais NON doctrinée vivait dans le commentaire de `onboarding-generation-phases.ts:1-18` (« limite assumée, écrite ici pour ne pas se relire comme un oubli ») et deux commentaires d'écrivain (25/09) qui la RE-MESURAIENT sans trancher : « fermer l'épopée demande soit de découper l'appel _generate en 3 appels distincts […], soit d'écrire une doctrine assumée qui accepte des signaux groupés — ni l'un ni l'autre n'est fait ». C'est cette indécision, pas une règle écrite, que ce doctrine ferme.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/onboarding/lib/onboarding-generation-phases.ts',
      'apps/web/src/features/onboarding/lib/onboarding-generation-phases.test.ts',
      'apps/ia/app/agents/profiler.py',
    ],
    gap: "Si `ProfilerAgent._generate` est un jour redécoupé pour une AUTRE raison (coût, reprise partielle), les trois phases pourront alors porter un événement propre — cette doctrine ne l'interdit pas, elle dit seulement que ça ne se fait pas SANS un tel redécoupage. Aucune mesure de latence/coût n'accompagne ce choix : l'arbitrage est qualitatif (une granularité d'affichage ne justifie pas un triplement d'appel modèle), pas chiffré.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 04/10/2026, définitive (lot E20). Renversement ASSUMÉ :
    // l'ancienne règle (#1670.4) est barrée dans `supersedes`, avec sa raison,
    // pour qu'on lise POURQUOI elle est tombée au lieu de la re-proposer.
    key: 'c87_coordonnees_pro_toujours_en_clair',
    theme: 'Affichage — coordonnées et identité professionnelles',
    canonical:
      "DÉCISION LOUIS 04/10/2026 — coordonnées pro toujours en clair. Les données de contact et d'identité PROFESSIONNELLES s'affichent TOUJOURS EN CLAIR, dans le produit, en salle de démonstration et dans le dashboard-manager interne : e-mail, téléphone, nom et prénom, LinkedIn, poste, société, adresse pro, et l'opérateur dans un journal d'audit. Une donnée DÉJÀ EN BASE s'affiche en entier, sans clic « Révéler ». Ce sont des coordonnées pro, l'outil n'est pas public, et c'est la force du produit. " +
      "INCHANGÉ : secrets, jetons, mots de passe et clés ne sont jamais loggés ni affichés ; le CORPS des messages suit sa propre doctrine ; un appel PAYANT à un fournisseur pour obtenir une coordonnée qu'on n'a pas garde son débit de crédits ; l'effacement RGPD d'une personne à sa demande (c67) reste ; le cloisonnement entre espaces (GA-16, GA-43) reste ; le masquage des JOURNAUX d'observabilité (Langfuse, Sentry, `pii-masking.ts`) n'est pas un affichage et reste. " +
      "Un nom de famille que le fournisseur publie lui-même masqué (`lastNameObfuscated`, « Mo***y ») n'est PAS une donnée en base : on ne l'a pas en entier, on ne l'invente pas — le compléter est l'enrichissement payant.",
    supersedes:
      '~~#1670.4 — « MASQUAGE PAR DÉFAUT des e-mails dans les listes : m****@societe.com, révélé au clic, et le clic est journalisé »~~ (dashboard-manager, `<MaskedEmail>`, `/api/admin/email-reveal`, garde `emails-masques-dans-les-listes.test.ts`). ' +
      "Raison de la chute (Louis 04/10/2026) : la règle réduisait une exposition PASSIVE (capture d'écran, écran partagé) d'une donnée qui n'est ni secrète ni personnelle au sens privé — ce sont des coordonnées PROFESSIONNELLES, dans un outil interne non public — au prix d'un clic de plus sur chaque geste de support, et elle masquait jusqu'à l'opérateur d'un journal d'audit, dont la seule raison d'être est de dire QUI. ⚠️ « Personne ne dira m****@ » ne rouvre pas le débat : c'est tranché.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/architecture/GA-411-coordonnees-pro-toujours-en-clair.test.ts',
      'apps/web/src/features/contacts/lib/contactDisplayIdentity.ts',
      'apps/web/src/features/contacts/lib/contactDisplayIdentity.test.ts',
      'apps/api/src/modules/ia-proxy/contact-identity-label.ts',
      'apps/api/src/modules/ia-proxy/contact-identity-label.spec.ts',
    ],
    gap: "Livré : produit web et contexte de Laura (04/10/2026) ; dashboard-manager (05/10/2026, #3596) — `<EmailEnClair>` (`mailto:`, sans lien dans la relance de facture) remplace `<MaskedEmail>` sur les 17 écrans et la recherche globale, `masked-email.tsx`, `mask-email.ts`, la garde `emails-masques-dans-les-listes` et la carte du runbook sont retirés, et GA-411 couvre `apps/dashboard-manager/src`. RESTE un seul geste humain : la route `/api/admin/email-reveal` et la capacité `email.reveal` ne sont PLUS appelées mais sont GARDÉES — les retirer supprime un écrivain du journal d'audit (la protection de la session l'a classé « effacement de traces d'audit » le 04/10). À décider explicitement par Louis ; l'enum `email_revele` reste en base pour les lignes historiques. Ensuite : `codeState: implemented`.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 04/10/2026 — import d'un ZIP de 666 Mo / 688 CV en
    // production : chaque fiche naissait sans nom, sans intitulé, sans
    // compétences (D366, lecture déterministe seulement), et la lecture par le
    // modèle n'existait que fiche par fiche, derrière un clic de revue.
    key: 'c88_lecture_auto_cv_import',
    theme: 'Vivier — un CV importé est lu par le modèle, la fiche reste à revoir',
    canonical:
      "À l'import (ZIP en ligne, ZIP volumineux, dépôt automatique, pièce jointe), chaque fiche créée est LUE par le modèle en tâche de fond (file `cv-auto-parse`) et ce qu'il lit s'ÉCRIT sur la fiche — nom, e-mail, téléphone, ville, intitulé, compétences, mobilité, disponibilité — en provenance `model`, SANS qualifier : la fiche reste `needs_review`, seul le geste humain de la revue la qualifie. " +
      "L'écriture passe par l'arbitre commun (`decideFieldWrite`) : `model` n'écrase ni une correction humaine ni une valeur en place sans provenance, et une fiche qualifiée n'est pas relue. Aucun crédit, aucune valeur sans extrait source, échec du modèle = fiche lisible + erreur journalisée. Le rattrapage de l'existant est un GESTE ciblé (« Lire les CV non lus »), jamais un passage au déploiement, et il ignore toute fiche corrigée à la main.",
    supersedes:
      "D366 — « jamais de nom déduit » à l'import automatique : la fiche naissait `full_name: null` et seul un humain, fiche par fiche, pouvait déclencher la lecture (`POST /:id/parse`) puis la valider. LEVÉE pour la lecture par le MODÈLE uniquement : la lecture DÉTERMINISTE de `intakeAutomatic` (e-mail, téléphone) ne déduit toujours aucun nom. ⚠️ RENVERSEMENT DATÉ du 15/10/2026 (Louis, #3935) : « séniorité jamais écrite » et « TJM jamais lu » (31/08) tombent pour les ANNÉES (`years_experience`) et le TJM (`tjm`) ÉCRITS dans le CV — lus, arbitrés (une saisie humaine gagne), jamais estimés ; la colonne-palier `seniority` n'est toujours pas écrite.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/consultants/cv-parse.service.ts',
      'apps/api/src/modules/consultants/cv-auto-parse.service.ts',
      'apps/api/src/modules/consultants/cv-auto-parse.worker.ts',
      'apps/api/src/modules/consultants/cv-parse-auto-read.spec.ts',
      'apps/api/src/modules/consultants/cv-auto-parse.service.spec.ts',
    ],
    gap: "La séniorité n'est pas écrite : le modèle rend des ANNÉES, la colonne attend un palier (`junior`…`expert`) — convertir serait inventer un barème. Deux fiches de la MÊME personne importées en même temps (lecture parallèle bornée de l'archive) peuvent encore naître en double : le rapprochement d'identité lit la base, pas les lectures en vol — la proposition de fusion (jamais une fusion) les retrouve ensuite.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 05/10/2026 — #3702. RENVERSEMENT daté de c81 (21/09/2026,
    // #2378.9) : « ce qui SORT attend validation, même programmé » cède, sur un
    // seul point, devant une délégation explicite. c81 N'EST PAS effacée : elle
    // reste la règle de tout ce qu'aucune délégation ne couvre.
    key: 'c89_delegation_denvoi_explicite_bornee',
    theme: "Séquences — délégation d'envoi explicite, bornée, révocable",
    canonical:
      "⚠️ 11/10/2026 — EXTENSION ET RENVERSEMENT DATÉS (décision Louis, épopée #4016, lot L5 : « tout ok mais faut un go vérifié avant ») : le mandat couvre désormais CINQ portées (`DELEGATION_SCOPES` : `campaign` — l'existant —, `workspace_sequences`, `laura_send`, `payment_reminder`, `meeting_follow_up`), chacune SIGNÉE explicitement (`signed: true`), une seule vivante par portée ; les BORNES (durée, volume, contacts, et l'ancien `BULK_SEND_MAX`) deviennent un réglage PAR PLAN (`SEND_BOUNDS_BY_PLAN`, plancher si le plan est illisible, jamais au-dessus des plafonds absolus de 30 jours / 200 messages / 200 contacts) ; le mandat est RENOUVELABLE par re-signature (nouveau mandat, l'ancien remplacé). Une portée d'espace n'exige pas de contacts nommés ni d'empreinte globale : le contenu se fige message par message, la validation sous mandat rejoue les MÊMES bloquants que le clic. Pas de mandat rétroactif (`predates_mandate`), effacement (c69) et consentement expiré (c45) arrêtent la suite, relus à chaque envoi ; un timeout reste un échec nommé, jamais un renvoi. C'est toujours le COMMERCIAL qui signe ; Laura ne signe jamais. L'ancienne règle reste lisible : " +
      "Une DÉLÉGATION d'envoi EXPLICITE, bornée (durée ≤ 30 jours, volume ≤ 200, contacts nommés), révocable et arrêtée sur réponse autorise l'envoi des e-mails d'UNE campagne : canal exécutable (e-mail seul), expéditeur, contenus relus (empreinte), cadence et fenêtre sont écrits au mandat, et au moins un validateur est nommé. " +
      "Une réponse, une opposition ou une exclusion ARRÊTE la suite ; une pause, une révocation, un mandat expiré, une boîte déconnectée, une lecture de réponses indisponible, un contenu modifié après accord, un contact ou un expéditeur hors mandat font ATTENDRE l'étape avec sa raison NOMMÉE. " +
      "Sans délégation active, c81 s'applique INCHANGÉE et « inconnu ⇒ attend ». Pas de mandat rétroactif sur les campagnes existantes. C'est le COMMERCIAL qui délègue ; Laura prépare et ne délègue jamais à sa place.",
    supersedes:
      "c81_etape_sortante_attend_interne_part, sur UN point daté du 05/10/2026 : « une étape qui atteint quelqu'un d'extérieur attend une validation explicite, même programmée, même lancée » ne vaut plus quand une délégation valide la couvre. Ce qui est refusé reste refusé : « une séquence lancée s'exécute » SANS mandat, un mandat sans borne, un mandat posé par Laura, LinkedIn ou l'appel promis comme automatiques.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/outreach-delegation.ts',
      'packages/contracts/src/schemas/outreach-delegation.test.ts',
      'apps/api/src/architecture/une-etape-qui-sort-attend.spec.ts',
      'apps/api/src/modules/outreach/outreach-delegation.service.ts',
      'apps/api/src/modules/outreach/outreach-delegation.service.spec.ts',
      'apps/api/src/modules/outreach/outreach-send.sweeper.ts',
      'apps/api/src/migrations/1796436400733-OutreachDelegations.ts',
      // #4016 L5 — les cinq portées, les bornes par plan, le renouvellement.
      'packages/contracts/src/schemas/outreach-delegation-scopes.test.ts',
      'apps/api/src/modules/outreach/outreach-delegation.scopes.spec.ts',
      'apps/api/src/migrations/1796440003417-OutreachDelegationScopes.ts',
      'apps/api/src/architecture/aucun-envoi-sans-clic.spec.ts',
    ],
    gap:
      "⚠️ 20/10/2026 (#4016 L5, reprise) — DEUX USAGES DÉPOSENT désormais : Laura (`copilot-card.service.ts` et `laura-job-drafts.ts` → `awaitIfMandated(…, 'laura_send')`, e-mail seulement) et les étapes e-mail des séquences (`OutreachController.linkEmailSteps`, `OutreachAutomationAdapter.enroll` → `awaitIfMandated(…, 'workspace_sequences', échéance de l'étape)`). Un message n'est rattaché que sous un mandat signé et VIVANT (jamais une file d'orphelins) ; la porte relit la séquence et l'étape à chaque envoi (échéance vivante ⇒ `not_due`, pause ⇒ attend, arrêtée/faite/sautée ⇒ sort de la file, reste en relecture) ; le dispatcher ne lit que les échus et rend à la relecture ce qu'aucun mandat ne couvrira plus. RESTE NOMMÉ : la relance d'impayé et l'e-mail de suivi de rendez-vous n'ont toujours AUCUN producteur de message (aucune relance n'est rédigée en `outreach_messages` ; la cascade de rendez-vous écrit une note CRM, pas un e-mail au client) — leur mandat signé ne fait rien partir tant qu'ils ne rédigent rien. " +
      "⚠️ 11/10/2026 (#4016 L5) — LIVRÉ : les cinq portées au contrat, la migration, la signature et le renouvellement (routes `scoped` et `:id/renew`, écran Actions → Séquences « Envois automatiques sous mandat »), la porte du dispatcher pour un message qui ATTEND un mandat (`gateAwaitingMandate`, mêmes bloquants que le clic), le point d'entrée des usages (`OutreachDelegationService.enqueueUnderMandate`). RESTE NOMMÉ : aucun des quatre usages ne DÉPOSE encore de message par ce point d'entrée — Laura (outil de préparation), la relance d'impayé (`invoice-readiness`), l'e-mail de suivi de la cascade de rendez-vous (`meeting-notes`) et les étapes e-mail des séquences (il faut d'abord une ÉCHÉANCE par étape, sans quoi un J+10 partirait au premier passage). Tant qu'un usage ne dépose rien, son mandat signé ne fait rien partir (aucun faux départ ; l'écran ne promet pas encore d'envoi par usage, il montre le mandat et son compteur).Le contact prospect n'a pas de consentement enregistré (c45 porte sur les consultants) : `consent_expired` est lu à faux, jamais deviné. " +
      "Livré (06/10, lot F18) : stockage (`outreach_delegations`), routes, écran Actions → Séquences, branchement du dispatcher sur `delegationVerdict`, quota réservé à l'envoi (pas de double exécution), lecture des réponses = capacité `read` de la boîte connectée. Livré (07/10, lot N06) : « exclu » est désormais un fait lu à l'envoi (`OutreachDelegationService.verdictFor` lit `ContactEntity.excluded_at`). Un seul validateur est exigé et enregistré (celui qui délègue) : la co-validation par une SECONDE personne est ÉCARTÉE (Louis, 11/10/2026) — ce n'est plus un point ouvert, ne pas le re-proposer.",
    nextPack: null,
  },
  {
    // Bug bêta #3847 (08/10/2026, schlegellouis2@gmail.com) — « beug affichage
    // la barre lattéral devrait faire tout l'écran » : sur un écran large, le
    // composeur commençait au même bord gauche que le fil, avec un espace vide
    // à droite. Un premier lot (V01) avait refusé d'y toucher en citant #2001
    // et D81 — Louis a tranché le lendemain dans l'autre sens, pour /chat seul.
    key: 'c90_chat_pleine_largeur',
    theme: 'Chat — /chat en pleine largeur',
    canonical:
      "DÉCISION LOUIS 08/10/2026 (#3847, lot Y01) — /chat passe en PLEINE LARGEUR. `CHAT_SURFACE.column` (chat-surface.ts) ne porte plus aucune borne de bloc (`w-full`, sans `mr-auto` ni `max-w-3xl`) : le fil, le composeur et les cartes occupent toute la largeur disponible à droite de la barre latérale. La gouttière latérale devient `px-4 md:px-8` sur les conteneurs partagés (`CHAT_SURFACE.composerBand`, `MessagesArea` dans `Chat.tsx`) plutôt qu'un plafond sur la colonne. " +
      "Ce qui NE bouge PAS : `CHAT_SURFACE.reading` garde sa borne de 70 caractères — D81 reste pour le TEXTE qu'on lit dans une bulle, seul le BLOC qui accueille cartes et composeur s'élargit. Mobile (< 768 px) inchangé : la borne ne mordait déjà pas sous 768 px, elle continue de ne pas mordre.",
    supersedes:
      "⚠️ RENVERSE la décision de Louis du 14/09/2026 (#2001, tome 1) — « les messages de Laura sont centrés sur la gauche, pas au milieu » — qui avait calé la colonne À GAUCHE (`mr-auto`) sans l'élargir, en citant D81. Et RENVERSE D81 (« la largeur de lecture dépend du type de contenu ») pour la seule surface /chat : le bloc n'est plus un objet borné dont l'ancre se discute, D81 continue de s'appliquer PARTOUT AILLEURS et au TEXTE de la bulle sur /chat même (`CHAT_SURFACE.reading`). " +
      "Un premier lot (V01, 07/10/2026) avait refusé d'élargir la colonne en citant #2001 et D81 (commentaire #3847, 09:47) — Louis a tranché le lendemain (#3847, 10:19) : ce commentaire reste au registre comme la DERNIÈRE fois qu'on a cru D81 non négociable ici, pas une erreur à effacer.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/chat/view/chat-surface.ts',
      'apps/web/src/features/chat/view/chat-surface.test.ts',
      'apps/web/src/features/chat/view/chat-mise-en-page.test.ts',
      'apps/web/src/features/chat/view/Chat.tsx',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 08/10/2026 (QCM) — #2021, recette écran 07-08/10 : depuis
    // Réglages › Profil, « Revoir ce questionnaire en mode guidé » →
    // « Compléter mon profil » → `/accounts`/`/search` redirigeaient de force
    // vers `/onboarding` tant qu'aucun « Plus tard » n'était cliqué. Lots
    // U01 et W02 (07-08/10) ont NOMMÉ l'écart sans trancher seuls : le garde
    // mesuré (`needsOnboarding`) tenait très exactement #2572/#2579, posées
    // par écrit et verrouillées par test. Louis tranche en FIN de liste
    // (GA-08) : RENVERSE #2572 pour CE SEUL cas.
    key: 'c91_reconfiguration_deja_onboarde_bandeau_pas_redirection',
    theme: 'Onboarding — reconfiguration demandée par un utilisateur déjà onboardé',
    canonical:
      "Un utilisateur DÉJÀ onboardé qui redemande une reconfiguration (Réglages › Profil › « Revoir ce questionnaire en mode guidé » → `status: 'refresh_required'`) n'est PLUS redirigé vers `/onboarding` depuis les pages clientes. " +
      'À la place, un bandeau discret « Questionnaire en cours — Reprendre » (+ « Plus tard » qui le masque, même geste de report que le reste du produit) s’affiche en haut de toute page cliente tant que la reconfiguration n’est ni terminée ni reportée. ' +
      "Un utilisateur qui n'a JAMAIS terminé le questionnaire reste redirigé comme avant — le signal qui distingue les deux cas est la date de la PREMIÈRE complétion réelle (`first_completed_at`, dérivée de `OnboardingService.firstOnboardingCompletionAt`, déjà calculée pour la bannière de refonte #2897), jamais un statut déclaratif qu'un compte n'ayant jamais terminé pourrait porter aussi.",
    supersedes:
      "⚠️ RENVERSE #2572 (`onboarding-gate.test.ts`, posée en production sur le compte de Louis `11372508b`) pour LE SEUL cas d'un utilisateur déjà onboardé : « une reconfiguration DEMANDÉE sans report ultérieur rouvre le questionnaire » (`needsOnboarding({ status: 'refresh_required', skippedAt: null }) === true`, sans condition sur une complétion passée). " +
      "#2572 reste VRAIE pour le cas qu'elle protégeait RÉELLEMENT à l'origine : un utilisateur qui n'a jamais terminé l'onboarding et se retrouve à `refresh_required` (l'arête `in_progress → refresh_required` existe côté API) reste redirigé. #2579 (le report explicite rend la main même posé APRÈS la demande) N'EST PAS renversée : elle continue de s'appliquer, déjà onboardé ou non — le report gagne toujours EN PREMIER.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/onboarding/lib/onboarding-gate.ts',
      'apps/web/src/features/onboarding/lib/onboarding-gate.test.ts',
      'apps/web/src/components/page/OnboardingRefreshBanner.tsx',
      'apps/web/src/components/page/OnboardingRefreshBanner.test.tsx',
      'apps/web/src/components/page/CustomerPageContent.tsx',
      'apps/web/src/features/profiles/hooks/useOnboardingStatus.ts',
      'apps/api/src/modules/onboarding/onboarding.service.ts',
      'apps/api/src/modules/onboarding/onboarding.service.spec.ts',
      'packages/contracts/src/schemas/onboarding.ts',
      'apps/api/src/modules/demo/demo-coverage.ts',
      'apps/api/src/modules/demo/demo-onboarding-refresh-banner-coverage.spec.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 09/10/2026 (QCM, lot P05, #3246) — RENVERSEMENT ASSUMÉ ET
    // DATÉ de GA-43 et de « rien n'est agrégé entre espaces » (lot M11). Les
    // anciens textes sont CITÉS dans `supersedes`, pour qu'on lise pourquoi ils
    // sont tombés au lieu de les re-proposer — ou de les croire encore vrais.
    key: 'c92_base_anonyme_commune',
    theme: 'Données — base anonyme commune entre espaces',
    canonical:
      "DÉCISION LOUIS 09/10/2026, verbatim : « je veux une base de donnée qui naît de toutes les infos en anonyme de tous nos users pour avoir plus de signaux de datas et tout, tout doit s'aider ». " +
      "Une base COMMUNE naît des données de TOUS les espaces, sous forme d'AGRÉGATS anonymes : issues des actions par cadence / route / priorité, coupées par secteur (division NAF) et catégorie de taille INSEE (P05.a) ; cas gagnés / perdus par secteur, taille et position de groupe (P05.b) ; type de signal suivi d'une affaire ouverte sous 90 jours (P05.c). Laura les cite À CÔTÉ de ce que l'espace mesure chez lui, jamais à sa place. " +
      "GARDE-FOUS (décidés le même jour) : un chiffre commun ne s'affiche qu'à partir de TROIS espaces contributeurs distincts (`SHARED_BASE_MIN_WORKSPACES`, le même nombre que `COMMUNITY_THRESHOLD`) — en dessous, « pas assez de données communes », jamais 0 ; jamais un nom d'espace, de client ou de personne, jamais un texte libre — une cellule n'est faite que de jetons fermés ; des comptes (« 9 sur 12 »), jamais une probabilité ; aucune ligne brute copiée entre espaces — un job nocturne idempotent recalcule les agrégats ; pas d'opt-out (décision Louis). " +
      "INCHANGÉ : le CORPS des messages ne sort jamais ; les données NOMINATIVES d'un espace restent cloisonnées (RLS, GA-46, test #3671) — seul un AGRÉGAT anonyme sort d'un espace ; la salle de démonstration ne se mélange jamais au réel (`scope = 'demo'`).",
    supersedes:
      "⚠️ REMPLACE (sans effacer) deux règles. (1) GA-43, `agent_docs/doctrine.md` « Ce qu'on ne collecte pas », texte d'avant le 09/10/2026 : « Le coût d'accès ne s'agrège JAMAIS entre espaces — les espaces sont des ESN, donc des concurrents ; c'est un échange d'informations tarifaires. `COMMUNITY_FORBIDDEN_KINDS.cost`, garde GA-43. » La garde refusait toute lecture inter-espaces de `access_facts` mentionnant `cost` ; elle garde désormais le seuil et l'anonymat des tables communes. " +
      "(2) « Rien n'est agrégé entre espaces » — lot M11 (#3246, `deriveCaseMemory`, `outcomeRecommendationFor`) : « ⚠️ JAMAIS agrégée entre espaces (GA-43, doctrine « le coût d'accès et les données ne s'agrègent jamais entre espaces — ce sont des concurrents ») ». Les mesures PAR ESPACE de M11 restent ce qu'elles sont (« chez nous ») ; la base commune s'ajoute à côté (« ailleurs »). " +
      "Ce qui n'est PAS renversé : le coût d'accès n'entre dans aucune brique livrée (voir `c47_cout_acces`), et le mécanisme communautaire opt-in de `access_facts` (tome 2 §5) garde ses propres règles.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/shared-anonymous-base.ts',
      'packages/contracts/src/schemas/shared-anonymous-base.test.ts',
      'apps/api/src/architecture/community-aggregation-kinds.spec.ts',
      'apps/api/src/migrations/1796437902401-SharedAnonymousBase.ts',
      // P05.a — le job nocturne (seul écrivain), la mutualisation, la lecture de Laura.
      'apps/api/src/modules/shared-base/shared-base-cells.ts',
      'apps/api/src/modules/shared-base/shared-base-writes.ts',
      'apps/api/src/modules/shared-base/shared-base-aggregation.service.ts',
      'apps/api/src/modules/shared-base/shared-base-reader.service.ts',
      'apps/api/src/modules/demo/demo-shared-base-coverage.spec.ts',
    ],
    gap: "Livré au 09/10/2026 : les garde-fous (contrat, schéma, GA-43), le stockage, le job nocturne P05.a (issues des actions → Laura « ce qui marche ailleurs », `get_channel_performance`) P05.b (cas gagnés / perdus → ligne « dans la base commune » de `find_similar_cases`) et P05.c (type de signal suivi d'une affaire ouverte sous 90 jours → `sharedPrecedence` de `get_account_signals`). Restent NOMMÉS : (1) P05.d — faits société PUBLICS partagés entre espaces (organigramme, contacts publics) : la frontière « publique » d'une personne n'est pas une colonne du dépôt, et l'effacement RGPD à la demande (c67) devrait se propager à une table commune — deux décisions que seul Louis peut prendre ⚠️ TRANCHÉES le 11/10/2026 par `c94_base_commune_capitalise_tout` (#3989) ; (2) le MOTIF d'un cas perdu ne sort pas : `projects.loss_reason` vient du catalogue PROPRE à chaque espace (texte libre), il faudrait un vocabulaire fermé commun ; (3) « ailleurs » inclut l'espace qui demande — l'exclure supposerait de stocker la contribution de chaque espace, donc un `workspace_id` dans une table commune ; (4) aucun plafond de DOMINANCE : un espace très actif peut porter l'essentiel d'une cellule à trois espaces — un seuil de part maximale serait à décider ; (5) la relecture juridique (intérêt légitime, registre des traitements, mention dans la politique de confidentialité) d'un traitement mutualisé SANS opt-out — à fournir par Louis, elle ne se code pas.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (QCM, #3989 suite de #3971 d, et #2877 niveau
    // GLOBAL) — ÉLARGISSEMENT ASSUMÉ ET DATÉ de `c92_base_anonyme_commune`. Le
    // texte de c92 reste lu tel quel (il tient pour les agrégats) ; ce qui
    // change est CITÉ dans `supersedes`, pour qu'on ne le re-propose pas.
    key: 'c94_base_commune_capitalise_tout',
    theme: 'Données — la base commune capitalise sur tout, anonymisé au besoin',
    canonical:
      "DÉCISION LOUIS 11/10/2026, verbatim : « le plus possible si ça peut aider, je vois pas pourquoi on priverait les gens d'infos de Bellum ; si c'est Bellum qui les a sorties, on se doit de les réutiliser, et si c'est nos utilisateurs, on garde tout mais juste on anonymise ; on se doit de capitaliser sur la donnée qu'on génère et qu'on reçoit. » Et pour #2877 : « sers-toi d'un max de data possible et juste anonymise au besoin ». " +
      "(1) FAITS SOCIÉTÉ PARTAGÉS (`shared_company_people`) : ce que BELLUM a collecté (registre, recherche publique, nos analyses, nos enrichisseurs) entre dans la base commune TEL QUEL — nom, poste, profil public ; ce qu'un UTILISATEUR a apporté (saisie, import, CRM, réunion) entre ANONYMISÉ — le poste reste, ni nom, ni profil, ni coordonnée, et un poste qui porte une adresse ou un numéro est RETIRÉ (la personne reste, sans poste — ⚠️ renversement daté du 15/10/2026, voir plus bas). La règle vit à UN endroit (`toSharedPersonFact`), la base la redit par un CHECK. La société commune est un jeton (SIREN, sinon domaine), jamais une raison sociale. " +
      "(2) UN ESPACE EN PROFITE : un compte d'une société déjà connue reçoit ses faits nommés en fiches `shared_base`, par la MÊME porte que la collecte (`bulkInsert`) — une personne effacée de l'espace est refusée, une correction humaine n'est jamais écrasée, aucun crédit n'est débité. Les rôles anonymes se lisent par Laura (`shared_base_roles`), jamais en fiche. La provenance se nomme « base commune », JAMAIS le nom de l'espace qui a collecté (aucune colonne de portée dans la table). " +
      "(3) EFFACEMENT RGPD (c67, #2297) : la demande d'effacement d'une personne purge AUSSI la base commune (par empreinte HMAC de portée « base commune ») et TOUTES les copies que les autres espaces en ont reçues (même chemin d'effacement, trace comprise) ; l'empreinte (`shared_person_erasures`) empêche la recollecte vers la base commune. Ce qu'un autre espace a collecté LUI-MÊME n'est pas une copie et reste. Sans clé d'empreinte, aucun fait NOMMÉ ne sort (on ne partage pas ce qu'on ne saurait pas effacer). " +
      "(4) #2877 GLOBAL : les signaux d'apprentissage des messages de tous les espaces (validé tel quel / retouché / rejeté, envoyé / réponse / rebond, faux fait / CTA / persona déclarés) sont mutualisés en COMPTES par signal (k >= 3 espaces, jetons fermés) et lus à la génération de CHAQUE message comme des vigilances de rédaction ; le cinquième niveau de règle (`global`) se peuple. " +
      "INCHANGÉ : le CORPS d'un message ne sort jamais (ni vers un humain, ni vers le modèle, ni vers la base commune) ; aucune probabilité ; la salle de démonstration ne se mélange jamais au réel ; les agrégats de c92 gardent leur seuil de trois espaces.",
    supersedes:
      "⚠️ ÉLARGIT (sans effacer) `c92_base_anonyme_commune` du 09/10/2026, sur trois phrases de son texte. (1) « Une base COMMUNE naît des données de TOUS les espaces, sous forme d'AGRÉGATS anonymes » et « aucune ligne brute copiée entre espaces » : un FAIT société public collecté par Bellum sort désormais NOMMÉ, et une ligne anonymisée d'utilisateur sort sans attendre trois espaces (elle ne désigne personne). (2) « jamais un nom d'espace, de client, de personne » : tient pour l'espace (jamais nommé) et pour l'utilisateur (anonymisé) ; un nom de personne PUBLIC collecté par Bellum sort. (3) « les données NOMINATIVES d'un espace restent cloisonnées — seul un AGRÉGAT anonyme sort d'un espace » : l'exception est le fait public collecté par Bellum. " +
      "⚠️ RENVERSEMENT DATÉ du 15/10/2026 (Louis, QCM, #3989) : LA BASE COMMUNE GARDE TOUTES LES PERSONNES de `shared_company_people`. Ce qui les EXCLUAIT est retiré : une fiche d'utilisateur sans poste, ou dont le poste porte une coordonnée, n'est plus écartée — elle entre sans poste (anonymisée, jamais avec la coordonnée). Restent écartées, et c'est nommé : la démonstration (jamais mélangée au réel), la recopie de la base commune elle-même (circulaire) et un fait Bellum sans nom complet (aucune empreinte, donc impossible à EFFACER, c67). La consigne « jamais une donnée d'espace (contacts…) » de la garde GA-414 vise la famille `public_facts` du cache partagé (`source_cache`), PAS la table des personnes : les deux ne se contredisent plus. Le `gap` (1) de c92 — « la frontière publique d'une personne » et « l'effacement RGPD devrait se propager à une table commune » — est TRANCHÉ ici. " +
      'Et #2385.10 / la recommandation des lots J02 (« niveau GLOBAL réservé au back-office ») : le niveau global nourrit la génération de chaque espace, anonymisé.',
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/shared-company-facts.ts',
      'packages/contracts/src/schemas/shared-company-facts.test.ts',
      'apps/api/src/migrations/1796439898901-SharedCompanyFacts.ts',
      'apps/api/src/architecture/community-aggregation-kinds.spec.ts',
      'apps/api/src/modules/shared-base/shared-company-facts-writes.ts',
      'apps/api/src/modules/shared-base/shared-company-facts.service.ts',
      'apps/api/src/modules/shared-base/shared-person-fingerprint.ts',
      'apps/api/src/modules/contacts/person-erasure.service.ts',
      'apps/api/src/modules/analysis/analysis.persistence.ts',
      'apps/api/src/modules/analytics/message-learning-signals.ts',
      'apps/ia/app/services/shared_message_learning.py',
      'packages/contracts/src/schemas/shared-public-facts.ts',
      'apps/api/src/migrations/1796546100000-SharedPersonCoordinates.ts',
      // #4286.15.b (Louis 19/10/2026) — l'état employeur : un ancien n'est jamais présenté comme actuel.
      'apps/api/src/migrations/1796574600000-SharedCompanyPeopleEmployment.ts',
      'apps/api/src/migrations/__tests__/1796574600000-SharedCompanyPeopleEmployment.spec.ts',
      'apps/api/src/migrations/1796530328276-SharedPublicFactsContract.ts',
      'apps/api/src/architecture/ga-414-base-commune-faits-publics.spec.ts',
      'apps/ia/app/services/public_facts.py',
      // #4268.c (Louis 19/10/2026) — aucun chemin de partage ne lit une table propre à l'espace sans borne.
      'packages/contracts/src/schemas/workspace-private-tables.ts',
      'apps/api/src/architecture/ga-415-base-commune-tables-privees.spec.ts',
      // #4286.15.d (#4067.11) — Découvrir lit la base commune.
      'apps/api/src/modules/ia-proxy/discover-sources.service.ts',
      'apps/api/src/modules/ia-proxy/discover-source-axes.controller.spec.ts',
    ],
    gap: "Livré au 11/10/2026 : la frontière (contrat + CHECK + GA-43 élargie), le versement nocturne, la recopie à la collecte d'un compte, l'effacement propagé (base commune + copies des autres espaces + empreinte), le niveau GLOBAL de l'apprentissage des messages (agrégats, candidat `global`, lecture à la génération). Restent NOMMÉS : (a) ✅ TRANCHÉ ET LIVRÉ 15/10/2026 (#3989.7, Louis : « une coordonnée pro déjà trouvée dans un autre espace est réutilisée dans un nouvel espace — la donnée seule ») — `shared_person_coordinates` (migration `1796546100000`), rattachée au fait nommé par FK en cascade (l'effacement c67 l'emporte), écrite via `toSharedCoordinates` (origine Bellum, pro, jamais corrigée à la main), recopiée par `bulkInsert` sans débit ; jamais l'espace source, ni notes, ni statut, ni coût — GA-43 élargie le tient (le coût ne s'agrège toujours pas) ; (b) un nom ou un poste CORRIGÉ à la main sur une fiche d'origine Bellum sort tel quel (la frontière lit la source de la fiche, pas la provenance champ par champ) ; (c) ✅ LIVRÉ 12/10/2026 (#3989.c) le versement nocturne est incrémental en semaine (fiches modifiées depuis 48 h) et complet le dimanche ; (d) les rôles anonymes ne deviennent pas des nœuds d'organigramme, seulement une lecture de Laura ; (e) la relecture juridique (base légale, registre des traitements, information des personnes dont le nom public est mutualisé) reste due, comme pour c92 — elle ne se code pas ; (f) ✅ LIVRÉ 12/10/2026 (#3989.f) les seuils de l'apprentissage global côté IA (5 et 3) sont des MIROIRS de constantes TS, désormais tenus par `shared-learning-thresholds-parity.spec.ts`. (g) ✅ LIVRÉ 14/10/2026 (#3989) les faits société PUBLICS (registre, annonces légales, marchés, offres, presse — `source_cache`, famille `public_facts`, #4067) ont un contrat partagé (`shared-public-facts.ts`), redit en SQL (clé = entreprise + jeton fermé, `collectedAt` obligatoire, aucun marqueur d'espace à aucune profondeur) et gardé par GA-414 ; (i) ✅ TRANCHÉ 19/10/2026 (#4268, Louis) : tout ce que Bellum collecte ou calcule (entreprises, personnes publiques, signaux, tendances) profite à TOUS les espaces SAUF le CRM, les prix et coûts d'accès (GA-43), les messages et les notes de l'espace ; l'effacement c67 est honoré partout. Les anciens se partagent donc — à condition qu'un ancien ne soit jamais présenté comme actuel : ✅ LIVRÉ 22/10/2026 (#4286.15.b, migration `1796574600000`) — chaque ligne commune porte `employment_state` (`current` | `former`, CHECK) et la date de départ quand le journal la connaît (`left_at`, refusée sur un actuel par CHECK), posés avec `last_seen_at` à CHAQUE observation ; un ancien reste ancien (une fiche « actuelle » d'un autre espace ne le fait pas revenir), n'est jamais recopié ni lu comme rôle ou coordonnée actuels ; un fait non revu depuis `SHARED_FACT_STALE_AFTER_DAYS` (365 j) redevient INCONNU (`sharedEmploymentReading`) et n'est plus recopié — archivé, jamais supprimé (seul c67 supprime). Les tendances entre espaces : `c127_market_pattern_tendances_entre_espaces`. ✅ BRANCHÉ 22/10/2026 (#4286.15.d, #4067.11) : Découvrir classe AUSSI avec la base commune — le NOMBRE de personnes nommées, en poste et revues qu'elle connaît chez la société (par SIREN, jamais un nom) pèse dans l'axe « observé sur le marché » (`DiscoverSourcesService.readSharedPeople`, `IaProxyController.withSourceAxes`). Côté levée des verrous (#4016.102, L10) : les anciens nommés et `market_pattern` sont couverts par #4286.15.b/.c ; la calibration de la probabilité lisait déjà la base anonyme commune (`projects.controller.ts`, `caseOutcomesElsewhereFor`). (h) l'horodatage de re-run du cache (`source_cache.begin_run`) range encore une ligne sous l'`account_id` BRUT dans la même table partagée — hors faits publics, mais une jointure sur `accounts` dirait quel espace a analysé quoi et quand : le déplacer (Redis seul, ou une table d'espace) est une décision d'architecture, non codée.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (#2916, #2399.2 « Matcher un besoin entrant ») —
    // verbatim du commentaire d'issue : « "Matcher un besoin entrant" écrit son
    // matching automatiquement (MatchRun à chaque besoin entrant, sans geste
    // humain). C'est un renversement daté de la règle N1 "préparation seule" du
    // catalogue, pour cette automatisation uniquement : rien n'est envoyé à
    // l'extérieur. »
    key: 'c93_matching_auto_besoin_entrant',
    theme: 'Matching — un besoin entrant est matché automatiquement (écriture auto, rien ne sort)',
    canonical:
      "Quand la routine « Matcher un besoin entrant » (`incoming_need_matching`) est activée par un membre de l'espace, CHAQUE besoin qui entre — quelle que soit sa porte (saisie, import, compte-rendu, appel d'offres, Laura) — voit un `MatchRun` ÉCRIT sans geste humain, en tâche de fond (file `bulk-matching`, job `auto-need-match`), attribué au membre qui l'a activée. " +
      'Idempotent : une ligne `need_auto_matches` par besoin (clé primaire), donc jamais deux runs automatiques pour le même besoin. Coût nommé et borné : classement déterministe, zéro appel modèle, zéro crédit ; plafond `AUTO_NEED_MATCH_DAILY_CAP` par espace et par jour, au-delà le besoin est marqué `capped`. Un délai dépassé rend `unknown` et arrête la reprise (c14). Le résultat se lit sur la fiche besoin, marqué « lancé automatiquement ». ' +
      "INCHANGÉ : rien ne SORT — aucun e-mail, aucun message, aucun positionnement, aucune shortlist (c82) ; un besoin sans compétence n'est pas classé (même règle que le bouton, `needMatcherGate`) ; toutes les AUTRES routines restent N1/N4 « elles préparent ou notifient, elles n'écrivent pas d'objet métier ».",
    supersedes:
      "La règle « N1 préparation seule — écriture auto jamais dans ce module » (bilans J03 du 09/10/2026 sur #2916 : « l'automatiser sur chaque nouveau besoin franchirait le niveau N1 ‹ préparation › du catalogue de routines (une écriture auto à l'ouverture d'un besoin, jamais fait ailleurs dans ce module) » ; docblock de `useRunMatch` : « il doit rester déclenché par l'utilisateur »). LEVÉE pour cette automatisation UNIQUEMENT : la garde `matching-auto-seul-ecrit-sans-geste.spec.ts` nomme les appelants de `matchNeed` et refuse tout autre écrivain automatique.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/need-auto-match.ts',
      'packages/contracts/src/schemas/need-auto-match.test.ts',
      'apps/api/src/migrations/1796438100000-NeedAutoMatches.ts',
      'apps/api/src/modules/consultants/matching/auto-need-matching.service.ts',
      'apps/api/src/modules/consultants/matching/auto-need-matching.service.spec.ts',
      'apps/api/src/modules/consultants/matching/need-arrival.subscriber.ts',
      'apps/api/src/modules/consultants/matching/need-arrival.subscriber.spec.ts',
      'apps/api/src/architecture/matching-auto-seul-ecrit-sans-geste.spec.ts',
    ],
    gap: "Le déclencheur est l'INSERTION TypeORM d'un besoin (`NeedArrivalSubscriber`, après commit) : un `INSERT INTO project_needs` en SQL brut le contournerait — la garde le refuse hors salle de démonstration. Un besoin dont les compétences arrivent APRÈS sa création (import d'un simple intitulé, puis saisie) reste `no_criteria` : le matching manuel reste le geste. Aucune notification n'accompagne le run automatique : la fiche besoin le montre, rien ne vient interrompre.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (épopée #4016, lot L4 « données estimées
    // badgées ») — RENVERSEMENT ASSUMÉ ET DATÉ, partiel, de « JAMAIS de donnée
    // fictive » (CLAUDE.md § Doctrine) et du volet RELATION de c12. Les anciens
    // textes sont CITÉS dans `supersedes` : ils restent vrais pour tout ce qui
    // n'est PAS une estimation badgée.
    key: 'c95_estimation_badgee',
    theme: 'Données — estimations badgées « estimé », jamais une preuve',
    canonical:
      "DÉCISION LOUIS 11/10/2026 : l'IA a le droit d'ESTIMER, toujours badgé « estimé », jamais pris pour une preuve. " +
      "Une valeur DÉDUITE porte la provenance `inferred` (`FIELD_SOURCES`, rang 0, sous `model`) ; l'écran la badge avec la primitive UNIQUE `EstimatedBadge` (« estimé », « estimé, vérifié le … », « probable », « hypothèse », « suggéré ») — une estimation NON badgée reste interdite. " +
      "Elle n'est JAMAIS une preuve (`isEvidenceSource('inferred') === false`) : elle ne pose pas `email_verified`, n'étaye aucune relation (la porte du claim, GA-127, reste seule juge d'une ligne d'organigramme), n'entre dans aucun chemin recommandé. " +
      'Elle est la source la PLUS FAIBLE : elle remplit un trou, n’écrase jamais une valeur humaine, connectée, calculée ou proposée, et cède devant toutes (`decideFieldWrite`). ' +
      "La finance, les retours de mission, les faits d'accès et les actions du plan RESTENT fermés à `inferred` (`EVIDENCE_FIELD_SOURCES`, contraintes SQL inchangées). " +
      'NON NÉGOCIABLE : aucune estimation ne lit un critère protégé (c58) ; aucune estimation pour une personne effacée ou opposée (c69).',
    supersedes:
      "⚠️ REMPLACE EN PARTIE (sans effacer) deux règles. (1) « JAMAIS de donnée fictive. Échec API → erreur claire. Un champ illisible vaut `null`, jamais une valeur de remplissage. » (CLAUDE.md § Doctrine, `agent_docs/doctrine.md`) — toujours vraie pour un échec d'API, un champ illisible, une valeur de remplissage ; elle ne l'est plus pour une valeur DÉDUITE et badgée. " +
      "(2) Le volet RELATION de `c12_organigramme` — « la seule source d'un `reports_to` est une preuve de relation » : toujours vrai pour une LIGNE de l'organigramme (rien n'est écrit dans `hierarchyEdges` sans preuve de relation) ; une arête PROBABLE déduite des intitulés peut désormais se DESSINER, en pointillés et badgée, calculée à la lecture et jamais stockée.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/provenance.ts',
      'packages/contracts/src/schemas/provenance.test.ts',
      'packages/contracts/src/schemas/email-estimate.ts',
      'packages/contracts/src/schemas/email-estimate.test.ts',
      'packages/contracts/src/schemas/org-title-reporting.ts',
      'packages/contracts/src/schemas/org-title-reporting.test.ts',
      'packages/contracts/src/schemas/seniority-estimate.ts',
      'packages/contracts/src/schemas/seniority-estimate.test.ts',
      'apps/web/src/features/consultants/view/SeniorityLabel.tsx',
      'apps/api/src/modules/demo/demo-estimated-seniority-coverage.spec.ts',
      'apps/api/src/migrations/1796440200813-InferredFieldSource.ts',
      'apps/api/src/architecture/check-constraints-cover-enums.spec.ts',
      'apps/api/src/modules/contacts/email-probe.ts',
      'apps/api/src/modules/contacts/email-probe.spec.ts',
      'apps/api/src/modules/contacts/email-estimate.service.ts',
      'apps/api/src/modules/contacts/email-estimate.service.spec.ts',
      'apps/api/src/modules/contacts/contact-enrichment.worker.spec.ts',
      'apps/api/src/modules/org-graph/org-graph-verify-claim-gate.spec.ts',
      'apps/api/src/modules/demo/demo-estimated-email-coverage.spec.ts',
      'apps/api/src/modules/demo/demo-inferred-org-edge-coverage.spec.ts',
      'apps/web/src/components/primitives/EstimatedBadge.tsx',
      'apps/web/src/components/primitives/EstimatedBadge.test.tsx',
      'apps/web/src/architecture/une-estimation-se-badge.test.ts',
    ],
    gap: "Livré au 11/10/2026 : le socle (provenance `inferred`, SQL élargi avant le code, `EstimatedBadge`), L4.1 (e-mail déduit du motif de l'entreprise puis vérifié MX + SMTP sans envoi, appelé par `ContactEnrichmentWorker`, badgé sur la fiche) et L4.2 (N+1 probable déduit des intitulés, en pointillés, vérifiable, jamais stocké). L4.3 livré en partie (11/10/2026) : la SÉNIORITÉ déduite des années (c28 — calculée à la lecture par `displayedSeniority`, jamais stockée, la valeur saisie gagne toujours, badgée « estimé » dans le vivier et sur la fiche). Restent NOMMÉS, chacun gardant sa règle actuelle tant que son renversement n'est pas codé ET gardé : L4.3 — angle d'attaque en hypothèse sans preuve (GA-75), « ESN probablement en place (indices) » (GA-336), coût d'accès estimé (c47, axe distinct du déclaré), valeurs suggérées à la saisie de besoin (c42) ; L4.4 — priors DataForge exposés comme hypothèses dans une surface dédiée (c08, GA-37 réécrite). Et, sur L4.1 : l'adresse estimée n'est badgée que là où l'API la sert (`email_estimated_at` : fiche, onglet Contacts du compte, liste des contacts) — un écran qui lirait `contacts.email` par un autre chemin (export, Laura) ne la distingue pas encore.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (épopée #4016, lot L12) — « casser les verrous » :
    // sorties et connecteurs. Le consentement reste la condition, il cesse d'être
    // un interdit.
    key: 'c95_sorties_connecteurs_appels_consentis',
    theme: 'Sorties et connecteurs — SMS BE/CH/LU, analyse des appels consentis, OneDrive en opt-in',
    canonical:
      "DÉCISION LOUIS 11/10/2026. (1) Les alertes de Découvrir sortent par e-mail et SMS ; les pays SMS (FR, BE, CH, LU = 33, 32, 41, 352) se LISENT de `SMS_ALLOWED_COUNTRY_CODES` — défaut la France seule, un indicatif invalide est ignoré, jamais élargi. Numéro vérifié, consentement daté, pays autorisé et opposition sont relus À CHAQUE envoi (`smsRecipientRefusal`). L'interrupteur `DISCOVER_ALERT_DISPATCH_ENABLED` ne s'allume qu'APRÈS la migration qui remet à zéro les `weekly_digest` jamais cochés. Le copilote n'envoie rien seul : aucun chemin d'envoi SMS. " +
      "(2) Les appels ENREGISTRÉS peuvent être analysés (résumé, décisions, suites, objections) — à la demande, jamais stockés — mais seulement quand l'ESN a coché elle-même que l'enregistrement est ANNONCÉ aux deux parties (`recording_consent_announced`, daté, défaut non) ET la lecture des transcriptions. Le refus précède la lecture de la transcription et l'envoi au modèle. " +
      "(3) OneDrive / SharePoint : `Files.Read.All` reste HORS du défaut (consentement d'administrateur) ; l'opérateur l'allume en posant la valeur COMPLÈTE de `MICROSOFT_SCOPES`, l'utilisateur se reconnecte.",
    supersedes:
      "GA-399 / addendum §3 — « l'enregistrement d'un appel ne s'analyse pas » (la conversation intelligence dépendait d'un accès enregistrement/transcription non tranché) et « le SMS part de France seule ». LEVÉS : l'analyse d'un appel est permise, la règle devient « jamais SANS consentement annoncé ». ⚠️ INCHANGÉ et non négociable : l'enregistrement sans consentement (art. 226-1 du Code pénal), le corps des conversations jamais archivé par Bellum, l'effacement et l'opposition (c69), le consentement expiré (c45).",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/architecture/l-analyse-d-appel-exige-le-consentement-annonce.spec.ts',
      'apps/api/src/architecture/le-copilote-nenvoie-aucun-sms.spec.ts',
      'apps/api/src/modules/notifications/sms/sms-recipient.ts',
      'apps/api/src/modules/notifications/sms/sms-recipient.spec.ts',
      'apps/api/src/modules/telephony/telephony.service.ts',
      'apps/api/src/modules/telephony/telephony.service.spec.ts',
      'apps/api/src/migrations/__tests__/1796440190377-WeeklyDigestResetNeverTicked.db.spec.ts',
      'packages/contracts/src/schemas/telephony-call-analysis.test.ts',
    ],
    gap: "L'e-signature intégrée n'est PAS faite : Bellum lit les signatures en attente et n'envoie à signature qu'une demande déjà préparée chez le fournisseur (`AdminDocsService.sendToSignature`) ; CRÉER la demande depuis un document Bellum exige le contrat d'API de création (documents, signataires) qui n'est pas vérifiable (« un contrat d'API non vérifiable ne se devine pas »). Le mode « réunion » dans l'application (enregistreur navigateur) n'est pas ajouté : `voice-never-records-a-meeting` reste vraie, aucun second enregistreur n'existe. Les trois gestes d'opérateur (Railway) restent à poser par Louis.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (épopée #4016, L2) — RENVERSEMENT PARTIEL et daté de
    // `c24_linkedin`. L'ancien texte reste lisible dans `supersedes`.
    key: 'c95_linkedin_fournisseur_sous_contrat',
    theme: 'Réseau professionnel — changement de poste par un fournisseur sous contrat',
    canonical:
      "DÉCISION LOUIS 11/10/2026 : l'employeur COURANT d'un contact se lit auprès d'un fournisseur de données professionnelles SOUS CONTRAT (changement de poste, profils, offres) — jamais par scraping, jamais par automatisation de session, jamais avec le compte de l'utilisateur. " +
      "Premier usage livré : la routine `contact_job_change` relit, par identifiant d'annuaire (jamais par nom seul), l'employeur des CHAMPIONS (rôle champion / sponsor), au plus `CHAMPION_EMPLOYMENT_CHECK_PER_RUN` par passage, une fois par mois et par personne. Un employeur différent du compte suivi devient le signal `contact_changement_poste` : « Ton champion a changé de boîte ». " +
      "INCHANGÉ : un poste se dit « vu le <date>, source <la source> », jamais « vérifié » (c67) ; le fournisseur ne se nomme jamais à l'écran (c19, c66) ; sans réglage, aucun appel réseau ; l'effacement RGPD (c69) reste ; le contournement d'authentification ou d'anti-robot reste interdit (c79).",
    supersedes:
      "⚠️ REMPLACE EN PARTIE `c24_linkedin` : « Aucun scraping, aucune automatisation non autorisée. Le commercial DÉCLARE ce qu'il a fait ; Bellum s'en souvient et calcule les relances. » Reste vrai : aucun scraping, aucune automatisation de session, la déclaration des interactions par le commercial. N'est plus vrai : « aucune source de changement d'emploi n'est branchée » (note de `c67_poste_vu_le_jamais_verifie`) — un fournisseur sous contrat en branche une.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/routines/employment-check.ts',
      'apps/api/src/modules/routines/employment-check.spec.ts',
      'apps/api/src/modules/routines/routine-executors.employment-check.spec.ts',
      'apps/api/src/modules/routines/crm-routines.employment-check.spec.ts',
    ],
    gap: "Livré : la relecture des champions par identifiant d'annuaire (tier de recherche déjà sous contrat). Restent NOMMÉS : profils enrichis et offres d'emploi d'un contact (même fournisseur, non branchés), relecture des contacts non champions, et l'affichage « vu le <date> » sur la fiche contact. Le réglage `CHAMPION_EMPLOYMENT_CHECK_PER_RUN` est à poser par Louis sur Railway (service API).",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (épopée #4016, L3) — RENVERSEMENT PARTIEL et daté de D65
    // (« le corps des messages ne sort jamais vers le modèle ») et de c39. D58 (la boîte est
    // personnelle) est CONFIRMÉE, pas renversée : c'est elle qui borne ce renversement.
    key: 'c96_corps_mails_boite_du_commercial',
    theme: 'Messagerie — Laura lit le corps des fils de SA propre boîte',
    canonical:
      "DÉCISION LOUIS 11/10/2026 : Laura lit le CORPS des fils de la boîte du commercial qui la sollicite — résumé, relance dans le ton, objections, besoins — avec SON jeton, dans CE tour, pour LUI seul. L'outil `read_mail_thread` (IA) passe par `POST /internal/copilot/mailbox/thread` → `MailboxService.readOwnThread`, au plus 6 messages de 4 000 caractères, jamais la boîte d'un collègue. " +
      "NE CHANGE PAS : le corps n'est JAMAIS partagé à un collègue ni à un manager (secret des correspondances, art. 226-15 du Code pénal — non négociable) ; il n'entre ni dans les sources citées, ni dans l'état de conversation, ni dans la table de rejeu (`chat_tool_call_recordings`), ni dans la mémoire collective (c4), ni dans la base commune (c92) ; `search_mailbox` reste sans corps ; aucun corps n'est journalisé ni mis en cache ; le copilote n'envoie toujours jamais d'e-mail (c82) : il prépare. " +
      "ÉTENDUE PAR LOUIS LE 21/10/2026 (#4406) AUX CONVERSATIONS BEEPER de l'utilisateur : l'outil `read_beeper_conversation` (IA) lit UNE conversation de SON Beeper Desktop par `POST /internal/copilot/beeper/chat` → `BeeperService.readOwnChat` (au plus 10 messages de 4 000 caractères), pour PRÉPARER une réponse. Lecture EN DIRECT à l'ouverture de Messagerie ou dans le tour : AUCUN corps conservé côté Bellum (ni table, ni cache, ni journal, ni charge utile de la porte d'écriture). La réponse ne part que sur le geste de l'utilisateur (`POST /beeper/chats/:id/send`, porte d'écriture, origine `user`) — jamais par Laura.",
    supersedes:
      "⚠️ REMPLACE EN PARTIE D65 / CLAUDE.md « Ce qu'on ne collecte pas » : « Le CORPS des messages ne sort jamais vers un humain ni vers le modèle (stocké au journal, jamais exposé). » Reste vrai : jamais vers un humain autre que le commercial propriétaire de la boîte. N'est plus vrai : « jamais vers le modèle » — le modèle le reçoit, dans le tour, pour le propriétaire seul. Les tests `test_chat_mailbox_tools.py` (la RECHERCHE ne remonte pas de corps) restent vrais et verts.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/mailbox/mail-thread-text.ts',
      'apps/api/src/modules/mailbox/mailbox.service.read-own-thread.spec.ts',
      'apps/api/src/architecture/mail-body-leaves-only-through-own-thread.spec.ts',
      'apps/ia/tests/test_chat_read_mail_thread.py',
      'apps/ia/tests/test_chat_mailbox_tools.py',
      // #4406 — l'extension Beeper (21/10/2026).
      'apps/api/src/architecture/beeper-send-only-through-gate.spec.ts',
      'apps/ia/tests/test_chat_read_beeper_conversation.py',
    ],
    gap: "Livré : lecture d'UN fil à la demande dans le tour. Restent NOMMÉS : une analyse des objections/besoins sur plusieurs fils d'un coup, la lecture par la routine de nuit (volontairement non faite : elle écrirait un résumé), et l'affichage à l'utilisateur d'une mention « Laura a lu ce fil » dans la carte de sources.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (épopée #4016, lot L10) — RENVERSEMENT ASSUMÉ ET
    // DATÉ de GA-285 pour la seule ligne ESN d'un compte déjà couvert. L'ancien
    // texte reste cité dans `supersedes` : on lit pourquoi il est tombé.
    // ⚠️ Numéro à réconcilier à la fusion : c93/c94 sont sur des branches
    // parallèles (#4023, #4025) et d'autres lots de l'épopée prennent les suivants.
    key: 'c96_memoire_marche_concurrent_des_un_parcours',
    theme: 'Mémoire marché — le concurrent se montre dès un parcours',
    canonical:
      'DÉCISION LOUIS 11/10/2026 (épopée #4016, L10), verbatim du tableau : « concurrent affiché dès 1 parcours, libellé « 1-2 parcours » ». ' +
      "Une société de services observée autour d'un compte DÉJÀ couvert (≥ 3 parcours au total, `MARKET_MEMORY_MIN_PATHS`) se montre dès UN parcours (`MARKET_ESN_OBSERVED_MIN_PATHS`). " +
      "Sous le seuil transverse le compte exact ne s'affiche JAMAIS : l'écran dit « 1-2 parcours » (`esnObservedPathsRange`), parce qu'un « 2 parcours observés » se lit comme une mesure. " +
      "INCHANGÉ : un compte sous 3 parcours au total ne dit toujours RIEN ; les destinations d'une société de services gardent le seuil de 3 ; le nom d'une ESN dite « dominante » (`topEsn`, preuve d'un axe IA) garde le seuil de 3 ; aucun ancien salarié n'est nommé par ce renversement.",
    supersedes:
      "GA-285 (#1624 / #1631.4, 10/09/2026) : « le seuil de 3 parcours s'applique à CHAQUE ligne ESN observée » — Keyrus à 2 parcours ne devait pas ressortir sur un compte à 2 parcours. Le défaut mesuré (un compte exact lu comme une mesure) est refermé autrement : la fourchette remplace le nombre.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/market-memory.ts',
      'packages/contracts/src/schemas/market-memory.test.ts',
      'apps/api/src/architecture/market-memory-esn-observation-threshold.spec.ts',
      'apps/api/src/modules/market-memory/market-memory.service.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/sections/incumbentCorroboration.ts',
      'apps/web/src/features/accounts/view/account-detail/tabs/sections/incumbentCorroboration.test.ts',
    ],
    gap: "Ce lot ne lève QUE le plancher de la ligne ESN et son libellé. Restaient à décider/coder dans L10 : ~~les anciens nommés (seulement les personnes déjà présentes dans l'espace du demandeur)~~ et ~~les signaux `market_pattern`~~ — ⚠️ TRANCHÉS le 19/10/2026 (#4268, Louis : ce que Bellum collecte profite à tous les espaces, sauf CRM, prix/coûts, messages, notes ; c67 honoré partout) et `market_pattern` DÉCIDÉ le 22/10/2026 (`c127_market_pattern_tendances_entre_espaces`, #4286.15) ; et « un signal isolé suffit pour chaud » (c36) — ⚠️ FAIT le 13/10/2026 (lot E6, #4016.L10.c) : `marketHeatRank` (`market-heat.ts`) — un signal récent OU une présence marché rend un compte « chaud », première clé des deux tris du cockpit ; GA-262 réécrite (`market-memory-never-creates-urgency.spec.ts`). Le mur de lignes mesuré en production (38 sociétés dont 33 à un seul parcours) revient : la liste reste tronquée par les lectures existantes, pas par ce plancher.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (nuit, lot W1, #3764 / #3861) — RENVERSEMENT ASSUMÉ ET DATÉ de sa propre décision du
    // 10/10/2026 (QCM, #3861.3 : « nommer LESQUELLES des sources n'ont pas été consultées, dans la ligne »).
    key: 'c93_ligne_completude_jamais_affichee',
    theme: 'Chat — la ligne « Complétude » sous une réponse de Laura',
    canonical:
      "DÉCISION LOUIS 11/10/2026 (nuit) : la ligne « Complétude » sous une réponse de Laura n'est JAMAIS affichée — ni la ligne « Complétude : partielle — N sources non consultées : <noms> » du fondement (#3861.3), ni une pastille « Complet » / « Incomplet » / « Très partiel ». #3764 gagne. " +
      "Le fait qu'elle disait (des sources n'ont pas été consultées) se dit UNE fois : par le badge nommé « Qualification complémentaire nécessaire » (qui porte les noms des sources, #3861) ou « Cartographie partielle », et par le panneau « Voir la source ». Un tour interrompu s'annonce par l'en-tête de la réponse (`ReplyHeader`), pas par une complétude.",
    supersedes:
      '⚠️ RENVERSE #3861.3 (lot V16, 08/10, puis QCM Louis du 10/10 : « revient sur #3764 délibérément ») : la ligne de fondement « Complétude : partielle — N sources non consultées : <noms> » (`ReplySourceBasis.tsx`) et la famille de libellés `completeness` (« Complet / Incomplet / Très partiel », `REPLY_LABEL_FAMILIES`, `replyBadges.completeness.*`) sont SUPPRIMÉES — le code, les libellés FR/EN et la dérivation `deriveReplyBadges`. ' +
      "#3764 (08/10, recette Airbus : « Incomplet », « Complétude partielle » et « Qualification complémentaire nécessaire » disaient trois fois la même chose) redevient la règle. N'est PAS renversé : le badge « Qualification complémentaire nécessaire » porte toujours les noms des sources (#3861) ; le niveau de la carte `account_map` (« Cartographie partielle », contenu de la carte) est un badge de #3764, pas cette ligne.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/reply-badges.ts',
      'packages/contracts/src/schemas/reply-badges.test.ts',
      'apps/web/src/architecture/a-reply-never-shows-a-completeness-line.test.ts',
      'apps/web/src/features/chat/view/ReplyFooter.basis.test.tsx',
      'apps/web/src/features/chat/view/reply-kit/basis.tsx',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (#2899 / #2443.10 / #2278.9, lot W5) — RENVERSEMENT ASSUMÉ ET DATÉ de la
    // décision du 27/09/2026 (`CHAT_PROD_SAMPLING_ENABLED`, variable d'opérateur éteinte, pipeline absent).
    key: 'c93_echantillonnage_conversations_opt_in_espace',
    theme: 'Données — échantillonnage de conversations de production pour les évals',
    canonical:
      "DÉCISION LOUIS 11/10/2026 : l'échantillonnage de conversations de Laura de PRODUCTION pour les évals est un OPT-IN PAR ESPACE (réglage dans Réglages › Laura, propriétaire ou administrateur seul, ÉTEINT par défaut), anonymisé AVANT stockage, corps de messages JAMAIS. " +
      "Concrètement : seule la DEMANDE de l'utilisateur est versée (`chat_eval_samples`), après masquage des coordonnées, liens, identifiants légaux et noms propres ; un tour trop long ou qui a la forme d'un message rédigé n'est pas versé du tout ; ni pièce jointe, ni message vocal, ni réponse de Laura. Décocher PURGE ce qui a été versé ; 90 jours de rétention (balayage RGPD) ; jamais en salle de démonstration. Le réglage vit à UN seul endroit (GA-26) : `workspaces.chat_eval_sampling_enabled`.",
    supersedes:
      "⚠️ REMPLACE (sans effacer) la décision d'opérateur du 27/09/2026 consignée dans `agent_docs/env-reference.md` : « l'échantillonnage production est un réglage désactivé par défaut (sans clé = no-op strict) » — une variable `CHAT_PROD_SAMPLING_ENABLED` posée par l'opérateur, qui levait `NotImplementedError` faute de pipeline. La variable est RETIRÉE : elle aurait été un second endroit pour le même réglage.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/chat-eval-sampling.ts',
      'apps/api/src/modules/chat-eval-sampling/chat-eval-anonymizer.ts',
      'apps/api/src/modules/chat-eval-sampling/chat-eval-anonymizer.spec.ts',
      'apps/api/src/modules/chat-eval-sampling/chat-eval-sampling.service.ts',
      'apps/api/src/modules/chat-eval-sampling/chat-eval-sampling.service.spec.ts',
      'apps/api/src/modules/ia-proxy/chat-eval-sampling.hook.spec.ts',
      'apps/api/src/modules/privacy/privacy-retention-chat-eval-samples.spec.ts',
      'apps/api/src/migrations/1796443917261-ChatEvalSampling.ts',
      'apps/ia/tests/test_chat_prod_sampling.py',
    ],
    gap: "L'anonymisation est HEURISTIQUE (regex + mots capitalisés) : un nom SEUL en début de phrase (« Dupont a répondu ») n'est pas reconnu sans second mot capitalisé, et un nom en minuscules non plus ; elle sur-masque plutôt que de sous-masquer, mais une relecture juridique de l'anonymisation reste due. Les échantillons SONT versés, aucun lecteur ne les rejoue encore dans les évals (corpus « erreurs production anonymisées » : `chat_corpus_sources.py`).",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 11/10/2026 (#3243.1, lot W6). Aucune garde ni aucun prompt ne
    // refusait un consultant « non sécurisé » le jour où elle est écrite : le champ
    // n'existe pas (cas « consultant non sécurisé » de `commercial_challenge.py`,
    // sans détecteur). La décision ferme la porte AVANT qu'on en construise une.
    key: 'c95_consultant_toujours_poussable',
    theme: "Laura — un consultant se pousse TOUJOURS si l'utilisateur le veut",
    canonical:
      "DÉCISION LOUIS 11/10/2026 (#3243.1) : Laura peut TOUJOURS pousser un consultant si l'utilisateur le veut (préparation d'intermission, repositionnement…). Il n'existe aucune notion BLOQUANTE « consultant non sécurisé » : l'état du consultant (pas encore confirmé, pas sécurisé) peut faire l'objet d'une MENTION informative, jamais d'un refus. La disponibilité seule ne fonde pas une recommandation SPONTANÉE (garde-fou « DISPONIBILITÉ SEULE ») — c'est une règle d'adéquation, pas un refus d'exécuter ce que l'utilisateur demande.",
    supersedes:
      "Le cas « consultant non sécurisé » de la politique de désaccord (#186.10 de #3180, `UNDETECTED_CASES`), lu comme un détecteur À CONSTRUIRE qui aurait fait challenger — voire refuser — la poussée d'un consultant dont le statut de sécurisation manque. Écarté : un tel détecteur ne sera pas écrit.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/prompts/laura_recommendation_guardrails.py',
      'apps/ia/tests/test_copilote_recommendation_guardrails_eval.py',
      'apps/ia/app/services/commercial_challenge.py',
    ],
    gap: "La garde est un test sur le texte du prompt (la phrase « jamais un refus » doit rester) : elle ne rejoue pas un tour de modèle réel. Aucun détecteur de refus côté code n'existe — il n'y a rien à retirer, c'est écrit plutôt que supposé.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 12/10/2026 (#3935, #3947, QCM) — RENVERSE c88 sur un point (lot QUALIF-AUTO).
    key: 'c97_cv_lu_fiche_qualifiee',
    theme: 'Vivier — un CV lu par le modèle = fiche qualifiée, plus de revue obligatoire',
    canonical:
      "Du moment où un CV est importé, la lecture, la qualification et la validation sont automatiques : toute fiche dont le CV a été lu par le modèle passe `qualified` (avec `qualified_at`) toute seule, même incomplète, donc visible du matching (« Où placer », besoins). Une lecture en ÉCHEC après ses tentatives laisse la fiche `needs_review` — elle n'a pas été lue, et l'écran le dit. Une fiche archivée n'est jamais touchée." +
      ' ' +
      "INCHANGÉ de c88 : les champs gardent la provenance `model` (rang 1), une correction humaine gagne toujours, aucune valeur inventée, aucun crédit. Le badge « Fiche incomplète » reste une INFORMATION (il nomme ce qui manque), il ne bloque plus rien. La revue du CV reste disponible pour CORRIGER, jamais pour valider. Rattrapage de l'existant, gratuit et sans IA : les fiches `needs_review` déjà lues (`cv_auto_read_at` posé), non archivées, hors démo, passent `qualified` (script `cv-read-qualify-catch-up`, idempotent, compte journalisé).",
    supersedes:
      "c88 (04/10/2026) sur ce seul point : « la lecture automatique n'est pas une revue, `qualified` ne s'obtient que par le geste humain de `POST /:id/parse/commit` ». RENVERSÉ le 12/10/2026 par Louis (QCM, option « toujours qualifiée ») — écrit pour être lu, pas effacé. Le reste de c88 tient.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/consultants/cv-parse.service.ts',
      'apps/api/src/modules/consultants/cv-auto-parse.service.ts',
      'apps/api/src/modules/consultants/cv-parse-auto-read.spec.ts',
      'apps/api/src/modules/consultants/cv-read-qualify-catch-up.runner.ts',
      'apps/api/src/modules/consultants/cv-read-qualify-catch-up.runner.spec.ts',
    ],
    gap: "Une fiche sans CV en texte, ou dont la lecture échoue, reste `needs_review` : c'est voulu (rien n'a été lu). Le rattrapage est un geste manuel (script), jamais au déploiement.",
    nextPack: null,
  },
  {
    // RETOUR BÊTA 14/10/2026 (#4173) — RENVERSE c93 sur UN point, 3 jours après la
    // décision du 11/10/2026 (lot W5) : « faut que ce soit par défaut sur tous les
    // espaces activés ».
    key: 'c98_echantillonnage_eval_allume_par_defaut',
    theme: 'Données — échantillonnage de conversations de production pour les évals (défaut)',
    canonical:
      "DEPUIS LE 14/10/2026 : l'échantillonnage de conversations de Laura de PRODUCTION pour les évals (#2899, c93) est ALLUMÉ par défaut — pour tout espace NEUF et pour tout espace EXISTANT qui n'a jamais tranché, dans un sens ou dans l'autre (migration `1796530329276`). " +
      "Un espace qui a DÉJÀ tranché — coché ou décoché, à n'importe quelle date — garde son choix : une correction humaine gagne toujours. `workspaces.chat_eval_sampling_chosen_at` (NULL = jamais touché par un humain) est la seule ligne qui porte cette distinction ; sans elle, ce bascule de défaut aurait écrasé un refus humain au lieu de ne toucher que le silence. La salle de DÉMONSTRATION reste exclue dans tous les cas (c93, inchangé) : forcé explicitement à chaque création/conversion d'une salle, jamais confié au seul défaut de colonne.",
    supersedes:
      "⚠️ RENVERSE (sans l'effacer) UN point de c93 (décision Louis 11/10/2026, lot W5) : « ÉTEINT par défaut ». Reste inchangé de c93 : opt-in PAR ESPACE, anonymisé AVANT stockage, corps de messages jamais, décocher purge, 90 jours de rétention, jamais en salle de démonstration.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/migrations/1796530329276-ChatEvalSamplingDefaultOn.ts',
      'apps/api/src/migrations/__tests__/1796530329276-ChatEvalSamplingDefaultOn.spec.ts',
      'apps/api/src/database/entities/workspace.entity.ts',
      'apps/api/src/modules/chat-eval-sampling/chat-eval-sampling.service.ts',
      'apps/api/src/modules/chat-eval-sampling/chat-eval-sampling.service.spec.ts',
      'apps/api/src/modules/demo/demo-seed.service.ts',
      'apps/api/src/modules/demo/demo-seed.service.spec.ts',
      'apps/api/src/modules/demo/demo-pool.service.ts',
      'apps/api/src/modules/demo/demo-pool.service.spec.ts',
    ],
    gap: "La colonne `chat_eval_sampling_chosen_at` n'existait pas avant cette migration : toute ligne déjà en base y lit NULL aujourd'hui, y compris un espace qui aurait décoché dans la fenêtre de 3 jours entre c93 (11/10) et ce lot (14/10) — cette fenêtre n'a laissé aucune trace ailleurs (pas de journal d'activité sur ce réglage avant ce lot). Au-delà de ce lot, le suivi devient fiable ; en-deçà, il n'y avait rien à lire.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 (crédits TheirStack épuisés en 5 jours) — en FIN de liste (GA-08).
    // RENVERSE EN PARTIE c94 (gap « coordonnées non partagées ») pour le SEUL cache d'appel fournisseur.
    key: 'c99_cache_fournisseurs_commun',
    theme: 'Données — le cache des appels fournisseurs est COMMUN à tous les espaces, coordonnées achetées comprises',
    canonical:
      "DÉCISION LOUIS 15/10/2026, verbatim : « pour le cache je veux pas que ce soit sur le user mais sur tout le monde, il ne doit pas y avoir de GA-43 dans ce cas ». Cache des appels fournisseurs COMMUN à tous les espaces, coordonnées achetées comprises (Hunter, Lusha, Kaspr, FullEnrich, Dropcontact) : une même question n'est jamais payée deux fois en 30 jours. La clé est la PERSONNE seule (profil LinkedIn normalisé > nom + domaine ou société), préfixe `pcache:contact:v2:`, aucun identifiant d'espace ; 30 j, « rien trouvé » 2 j ; une panne, un plafond atteint ou une sonde asynchrone ouverte ne s'écrivent jamais. RESTE VRAI : l'effacement RGPD (c67) purge ce cache (v2 et v1 restant) et `preflightEnrichment` refuse avant tout appel ; une correction humaine gagne toujours ; le cache ne sert QUE l'appel fournisseur — il n'expose jamais la fiche, les notes ni les corrections d'un espace à un autre.",
    supersedes:
      "⚠️ RENVERSE EN PARTIE le choix de la PR #4226 (« cache PAR ESPACE au nom de GA-16 / GA-43 », clé `pcache:contact:v1:*` portant l'espace) et le `gap` (a) de `c94_base_commune_capitalise_tout` (« coordonnées non partagées, décision de facturation ») pour le seul cache d'appel fournisseur. Texte écarté : ~~« une coordonnée achetée par un espace ne sert jamais un autre — les espaces sont des ESN concurrentes »~~. La garde GA-43 (`community-aggregation-kinds.spec.ts`) reçoit une exception NOMMÉE et DATÉE (« cache d'enrichissement commun, Louis 15/10/2026 ») et dit toujours NON à toute autre clé de cache partagée non déclarée.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/contacts/person-contact-cache.ts',
      'apps/api/src/modules/contacts/person-contact-cache.spec.ts',
      'apps/api/src/modules/contacts/enrichment-providers.cache.spec.ts',
      'apps/api/src/modules/contacts/person-erasure.service.spec.ts',
      'apps/api/src/architecture/community-aggregation-kinds.spec.ts',
    ],
    gap: "Le cache des familles gratuites ou publiques côté IA (`provider_cache.py`) était déjà commun. Le Pappers par NOM et Découvrir restent à 24 h, volontairement : un nom → SIREN se fige un jour, mais l'index grandit chaque jour (« je ne trouve pas ma boîte » à l'onboarding).",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 14/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c100_pilotage_quatre_onglets',
    theme: 'Pilotage — quatre onglets : Cockpit · Pipe · Staffing · Finance',
    canonical:
      "DÉCISION LOUIS 14/10/2026 (refonte Pilotage, lots L0 à L4) : Pilotage = QUATRE onglets — Cockpit, Pipe, Staffing, Finance. Mémoire collective, Qualité des données et Énergie sont SUPPRIMÉS (pas déplacés : retirés du produit). Marché devient « Comptes » : « Marché est de la prospection, pas du pilotage ». Le CA probable (probabilité calibrée, autorisée depuis le 11/10) n'apparaît QUE dans Pilotage › Pipe — il déménage de `/projects` (#4191, arbitrage 2), il ne disparaît pas ; un seul endroit (GA-26).",
    supersedes:
      "Renverse la liste d'onglets antérieure de Pilotage (Décisions · Finance · Marché · Qualité des données · Équipe, constat de #1809 le 09/09) et #3828 (07/10/2026), qui avait fait de Marché un onglet de Pilotage. Les anciennes entrées ne sont pas effacées : elles sont DATÉES comme renversées ici.",
    codeState: 'partial',
    enforcement: 'held',
    holders: [
      'apps/web/src/components/navigation/sections.ts',
      'apps/web/src/routes/pilotage/pipe.tsx',
      'apps/web/src/routes/pilotage/staffing.tsx',
      'apps/web/src/routes/pilotage/finance.tsx',
    ],
    gap: 'Constat du 15/10 : les routes `memoire-collective`, `qualite` et `energie` existaient encore sous `apps/web/src/routes/pilotage/`. #4359 (20/10) les a retirées avec leurs alias. Aucune garde ne tombe si un onglet supprimé revient.',
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c101_parcours_dans_pilotage_droits_par_sous_onglet',
    theme: 'Pilotage — Parcours dans Pilotage, ouvert à tous ; droits par sous-onglet',
    canonical:
      "DÉCISION LOUIS 15/10/2026 : le tableau Parcours (7 pistes de `chain-catalog.ts`) vit dans Pilotage et est OUVERT À TOUS les membres. Le droit d'accès se décide par SOUS-ONGLET de Pilotage (Cockpit, Pipe, Staffing, Finance), jamais pour Pilotage en bloc. La décision du 14/10 (#4163, décision 2 : Parcours déplacé dans Pilotage › Pipe) est maintenue ; la route `/actions/chaines` est retirée (#4167, puis #4359 le 20/10 : plus de fichier de route).",
    supersedes:
      "Complète #4163 (14/10) sur les droits : Pilotage était réservé aux responsables d'équipe (`managerOnly`). Cette réserve est levée pour Parcours, pas pour la finance.",
    codeState: 'partial',
    enforcement: 'held',
    holders: ['apps/web/src/components/navigation/sections.ts', 'apps/web/src/routes/pilotage/pipe.tsx'],
    gap: "Le déplacement est livré (#4167, puis #4359 le 20/10 : la route `/actions/chaines` n'existe plus). Les droits par sous-onglet ne sont tenus par aucun test.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c102_maillon_faible_hors_briefing',
    theme: 'Briefing — le maillon faible quitte /briefing',
    canonical:
      'DÉCISION LOUIS 14-15/10/2026 : le bloc « maillon faible » est RETIRÉ de `/briefing`. Le briefing garde ce qui se décide dans la journée (analyse en cours, décisions, actions proposées) ; la lecture de la chaîne commerciale relève de Pilotage.',
    supersedes:
      "Renverse la place du maillon faible parmi les blocs fixes de `/briefing` (`block-order.ts`) et la chaîne « l'écran de pilotage » du PDF 8 (22/08/2026).",
    codeState: 'partial',
    enforcement: 'held',
    holders: ['apps/web/src/features/briefing/lib/block-order.ts'],
    gap: 'Constat sur `main` le 15/10 : `block-order.ts` cite encore le maillon faible parmi les blocs fixes — retrait à confirmer dans le code avant de déclarer cette entrée appliquée.',
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c103_mode_equipe_dans_la_barre_laterale',
    theme: 'Mode équipe — « Équipe » entre Actions et Pilotage ; /team refondu par Louis',
    canonical:
      "DÉCISION LOUIS 15/10/2026 : « Équipe » est une entrée de la BARRE LATÉRALE, entre Actions et Pilotage ; elle n'est plus un onglet de Pilotage. La page `/team` est refondue par Louis lui-même.",
    supersedes:
      '⚠️ RENVERSE #1809 (09/09/2026, « segmenter les parties de /team et les replier par défaut », où Équipe était le cinquième onglet de Pilotage) et la vue « ÉQUIPE » (owners, collisions, blocages, capacité) rangée parmi les sept vues du cockpit manager de #2405 (LAU-FINAL-119, point 3). Les garde-fous de #2405 — aucune surveillance, aucune réattribution sans permission, RBAC — ne sont PAS renversés.',
    codeState: 'partial',
    enforcement: 'held',
    holders: ['apps/web/src/components/navigation/sections.ts', 'apps/web/src/routes/team/index.tsx'],
    gap: "Citation de #1809 et #2405 reprise de leur texte (lu le 15/10) ; le numéro de point « #2405.3 » du brief n'a pas de ligne numérotée dans l'issue, il est lu comme la vue ÉQUIPE. La refonte de `/team` par Louis n'est pas encore dans `main`.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 14/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c104_crm_ats_affaires_talents_missions',
    theme: 'CRM/ATS — Affaires · Talents · Missions (épopée #4191)',
    canonical:
      "DÉCISION LOUIS 14/10/2026 (épopée #4191, « tranché — ne pas rediscuter ») : la barre latérale passe de 19 à 9 destinations en TROIS entrées — Affaires (Pipe · Pistes · Appels d'offres), Talents (Besoins ouverts · Vivier · Positionnements), Missions (En cours · Planning · Facturation). Colonne vertébrale Opportunité → Besoin → Positionnement → Mission créée à la signature ; un compteur n'est calculé qu'à UN endroit de l'API ; fiche à trois zones, UN seul bouton Laura ; « Nouvelle mission » crée une vraie mission ; anciennes routes redirigées dans `beforeLoad`, jamais `<Navigate>` (GA-27).",
    supersedes:
      "Renverse l'éclatement antérieur (Missions seule = 4 groupes / 13 destinations) et « CA probable du trimestre » sur `/projects` (retiré, voir c100).",
    codeState: 'partial',
    enforcement: 'held',
    holders: ['apps/web/src/components/navigation/sections.ts'],
    gap: "Épopée ouverte le 15/10 : les lots L1 à L6 sont fusionnés pour l'essentiel, L7 (jargon, fiches reliées) ne l'est pas forcément. Seule la navigation est citée comme porteur.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 14/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c105_actions_aujourdhui_sequences_automatisations',
    theme: "Actions — Aujourd'hui / Séquences / Automatisations (épopée #4163)",
    canonical:
      "DÉCISION LOUIS 14/10/2026 (épopée #4163) : `/actions` a TROIS onglets — Aujourd'hui (file d'exécution unique), Séquences, Automatisations (fusion de l'Action OS et des Planifiées, grammaire « Quand [signal] → alors [séquence/action] »). Les séquences sont LINÉAIRES : arrêt automatique sur réponse ou rendez-vous, saut automatique si l'invitation LinkedIn n'est pas acceptée, PAS de branches oui/non.",
    supersedes:
      'Renverse la juxtaposition de quatre notions de « processus » (Automatisations, Planifiées, Parcours, Séquences), trois files de relance et deux historiques. Inchangés : séquence mono-contact (c74), envoi seulement sous mandat, aucune probabilité affichée, les ouvertures ne sont jamais un indicateur.',
    codeState: 'partial',
    enforcement: 'held',
    holders: ['apps/web/src/components/navigation/sections.ts', 'apps/web/src/routes/actions/sequences.tsx'],
    gap: "Lots A à D (#4164 à #4167) échelonnés : l'onglet Automatisations (lot D) n'est pas livré le 15/10. ⚠️ RENVERSÉE en partie le 19/10/2026 par c121 : l'onglet Automatisations est retiré, Actions = Aujourd'hui + Séquences (parcours unique). Les séquences restent linéaires.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c106_offres_emploi_ordre_des_sources',
    theme: "Offres d'emploi — ordre des sources payantes ; Découvrir = zéro appel payant",
    canonical:
      "DÉCISION LOUIS 15/10/2026 (crédits épuisés en 5 jours) : pour les offres d'un compte, l'ordre est Fantastic.jobs d'abord, puis Mantiks si Fantastic rend MOINS DE 10 offres, puis TheirStack si l'ensemble rend MOINS DE 5. Découvrir ne fait AUCUN appel payant d'offres (lecture du cache et des sources gratuites seulement). Doctrine interne : les fournisseurs se nomment ici et dans `env-reference.md`, JAMAIS à l'écran (« on nomme ce que l'espace a BRANCHÉ, jamais ce qui NOUS sert »).",
    supersedes:
      "Renverse l'appel de TheirStack en première intention et le plafond d'affichage seul (`DISCOVER_THEIRSTACK_MAX_COMPANIES`/`_MAX_OFFERS`) comme garde de coût de Découvrir. Le cache commun de 30 jours est inscrit à part (c99).",
    codeState: 'partial',
    enforcement: 'held',
    holders: ['apps/ia/app/services/data_sources/job_aggregators.py'],
    gap: "Seuils (< 10, < 5) lus dans le brief du 15/10 ; leur présence dans `job_aggregators.py` n'est pas vérifiée ici. Aucun test ne garde l'ordre.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c107_esn_de_placement_toute_offre_reste_une_piste',
    theme: "QCM — ESN de placement : toute offre d'emploi reste une piste",
    canonical:
      "DÉCISION LOUIS 15/10/2026 (QCM) : pour une ESN de PLACEMENT, toute offre d'emploi reste une piste — elle n'est pas écartée parce que l'employeur recrute « pour lui-même » ; le placement vit de ces offres.",
    supersedes:
      "Précise `recruitsForClients` (14/10/2026) et l'écartement des offres d'employeur interne dans le classement des signaux de recrutement.",
    codeState: 'partial',
    enforcement: 'unenforced',
    holders: [],
    gap: "Inscrit depuis le brief du 15/10 sans vérification du code : à relier à son porteur et à son test lors de l'intégration.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c108_tendance_volume_d_offres_dans_le_temps',
    theme: "QCM — la tendance d'un compte est le volume d'offres dans le temps",
    canonical:
      "DÉCISION LOUIS 15/10/2026 (QCM) : la TENDANCE de recrutement d'un compte = l'évolution du VOLUME d'offres dans le temps. Elle n'est ni un score ni une probabilité ; sans historique suffisant, elle est « non mesurée », jamais « stable » ni 0.",
    supersedes: "Remplace toute lecture de la tendance par un score composite ou par le seul compte de l'instant.",
    codeState: 'partial',
    enforcement: 'unenforced',
    holders: [],
    gap: "Inscrit depuis le brief du 15/10 sans vérification du code : porteur et test à relier à l'intégration.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c109_reanalyse_rafraichit_un_bloc_sauf_correction_humaine',
    theme: 'QCM — une ré-analyse rafraîchit un bloc, sauf correction humaine',
    canonical:
      "DÉCISION LOUIS 15/10/2026 (QCM) : une ré-analyse RAFRAÎCHIT un bloc de l'analyse (le segment concerné), jamais l'analyse entière ; une correction humaine gagne toujours, quelle que soit sa date.",
    supersedes:
      "Étend « un correctif de collecte rattrape l'existant, par segment » (18/09/2026, #2543) au geste de ré-analyse lui-même.",
    codeState: 'partial',
    enforcement: 'unenforced',
    holders: [],
    gap: "Inscrit depuis le brief du 15/10 sans vérification du code : porteur et test à relier à l'intégration.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c110_promptfoo_bloquant_apres_un_premier_run_reel',
    theme: 'QCM — promptfoo bloquant après un premier run réel',
    canonical:
      'DÉCISION LOUIS 15/10/2026 (QCM) : le contrôle promptfoo devient BLOQUANT en CI, mais SEULEMENT après un premier run réel qui fixe la référence — jamais avant, sinon il bloque sur un seuil inventé.',
    supersedes:
      "S'ajoute à c77 (la porte de qualité IA est un gate CI bloquant, 21/09/2026) : c77 tient pour la porte sur rôle/clé, ce point cadre le passage de promptfoo en bloquant.",
    codeState: 'partial',
    enforcement: 'held',
    holders: ['.github/workflows/ci.yml'],
    gap: "SUSPENDU le 31/10/2026 (décision Louis, coût) : le job `promptfoo` est retiré de ci.yml et du rejeu nocturne — ~2 M de jetons Sonnet par passage, coût non mesuré, ~290 $ de recharges en une matinée. Configs gardées dans apps/ia/evals/promptfoo/ ; retour à décider (cache de prompt + coût mesuré d'abord).",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 15/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c111_non_mesure_n_est_jamais_zero_sur_tous_les_ecrans',
    theme: 'QCM — audit « non mesuré ≠ 0 » sur TOUS les écrans',
    canonical:
      "DÉCISION LOUIS 15/10/2026 (QCM) : un audit « non mesuré n'est jamais 0 » est mené sur TOUS les écrans, pas seulement ceux que les gardes GA-18/GA-19 visent aujourd'hui.",
    supersedes:
      "Étend GA-18 / GA-19 et « on n'affiche pas ce qu'on n'a pas » (20/09/2026) du périmètre des gardes au périmètre du produit.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: ['apps/web/src/architecture/a-measured-zero-is-not-an-unknown.test.ts'],
    gap: "L'audit des écrans non couverts par la garde n'est pas fait : la garde ne lit que son périmètre.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 13/10/2026 — inscrite par le lot DOCTRINE du 15/10/2026.
    key: 'c112_decouvrir_cinq_signaux_forts_dix_de_contexte',
    theme: 'Découvrir — 5 signaux forts, puis ~10 signaux de contexte',
    canonical:
      "DÉCISION LOUIS 13/10/2026 (#4115) : une carte Découvrir porte CINQ signaux FORTS puis environ DIX signaux de CONTEXTE. Le niveau (`tier` : strong | context) voyage sur chaque signal de la réponse et n'est jamais recalculé côté web.",
    supersedes: "Remplace la liste plate de signaux d'une carte (aucune hiérarchie). Complète c07 (scoring Découvrir).",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/discover/lib/discover-normalize.test.ts',
      'apps/web/src/features/discover/lib/discover-card-facts.ts',
      'apps/ia/app/routers/discover_signals.py',
      'apps/ia/app/services/discover_signal_grid.py',
      'apps/ia/tests/test_discover_signal_grid_4115.py',
    ],
    gap: "La garde prouve que `tier` voyage ; les plafonds (5 / 10) sont tenus par `test_cap_is_five_strong_and_ten_context` depuis l'intégration du 15/10 (R17 voulait 4, refusé).",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 17/10/2026 — inscrite par le lot V10-C.
    key: 'c113_non_mesure_sous_un_score_ou_un_axe_seulement',
    theme: '« Non mesuré » — seulement sous un score ou un axe de score',
    canonical:
      "DÉCISION LOUIS 17/10/2026 (#3711.17, applique la doctrine du 20/09) : la mention « Non mesuré » ne s'affiche QUE sous un score ou sur un axe de score (les axes non évaluables restent nommés, hors du dénominateur). Partout ailleurs — une moyenne, un montant, une liste de chiffres — une absence ne fait AUCUNE ligne : le composant ne rend rien. « Non mesuré » n'est toujours jamais 0 (c111, GA-18 / GA-19).",
    supersedes:
      "La ligne « X non mesuré » écrite à la place d'une valeur absente dans une liste ou un bloc de chiffres (ex. « Tarif vendu moyen non mesuré », « Revenu historique non mesuré » sur l'onglet Missions d'un compte) : retirée.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/accounts/view/account-detail/tabs/TabMissions.test.tsx',
      'apps/web/src/features/accounts/view/account-detail/tabs/TabMissions.tsx',
    ],
    gap: "Balayé au 17/10 : le bloc « Ce que ce client achète » (Missions d'un compte). Les ~140 autres occurrences de « non mesur » des locales ne sont pas toutes revues ; celles sous un score ou un axe (qualification, axes manquants, fiabilité du dossier) restent à dessein. Le balayage se poursuit écran par écran, sans garde globale (un texte ne dit pas s'il est sous un score).",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 17/10/2026 — inscrite par le lot V10-C.
    key: 'c114_role_ne_donne_pas_de_type_de_bloc',
    theme: 'Plan de semaine — le rôle ne choisit pas le type de bloc (#2770.36 / #2399.8)',
    canonical:
      "REFUS RATIFIÉ LOUIS 17/10/2026 (#2770.36, #2399.8) : le rôle du vendeur (`sellerRole`) ne choisit pas le TYPE de bloc d'agenda ni de plan. c76 le dit déjà — le rôle change l'ORDRE, jamais le CONTENU — et aucune correspondance rôle → bloc n'est inventée. `sellerRole` ne sert que le TON du copilote.",
    supersedes: 'Une correspondance rôle → type de bloc (« à trancher par Louis » dans les bilans du 07/10) : écartée.',
    codeState: 'absent',
    enforcement: 'held',
    holders: [],
    gap: "Refus tenu par cette entrée et par le registre (GA-38) : rien n'est codé, donc aucune garde ne peut le dire à la place de la relecture.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 17/10/2026 — inscrite par le lot V10-C.
    key: 'c115_pas_d_adoption_par_commercial',
    theme: "Analytique — pas d'adoption par commercial pour le manager (#4016.8c)",
    canonical:
      "REFUS RATIFIÉ LOUIS 17/10/2026 (#4016.8c) : le manager ne voit pas l'ADOPTION du produit PAR COMMERCIAL. L'analytique mesure le PRODUIT (écran, fonction, parcours), jamais la personne ; l'« Adoption » de /team reste agrégée.",
    supersedes:
      '« Adoption par commercial visible du manager (avec les mentions pour le CSE) » (brief L8 de #4016) : écarté.',
    codeState: 'absent',
    enforcement: 'held',
    holders: [],
    gap: "Refus tenu par cette entrée et par le registre (GA-38) : rien n'est codé, donc aucune garde ne peut le dire à la place de la relecture.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 17/10/2026 — inscrite par le lot V10-C.
    key: 'c116_pas_de_note_composite',
    theme: 'Pas de note composite (#4016.9c)',
    canonical:
      "REFUS RATIFIÉ LOUIS 17/10/2026 (#4016.9c) : aucune NOTE COMPOSITE — pas de score unique qui fond plusieurs axes. Un score n'est jamais nu : ses axes, et ce qui n'a pas pu être évalué, sont nommés.",
    supersedes: 'Une note composite unique par compte, contact ou dossier : écartée.',
    codeState: 'absent',
    enforcement: 'held',
    holders: [],
    gap: "Refus tenu par cette entrée et par le registre (GA-38) : rien n'est codé, donc aucune garde ne peut le dire à la place de la relecture.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 17/10/2026 — inscrite par le lot V10-C.
    key: 'c117_pas_de_role_anonyme_en_noeud_d_organigramme',
    theme: "Organigramme — pas de rôle anonyme d'un contact utilisateur en nœud (#3989.8, c94)",
    canonical:
      "REFUS RATIFIÉ LOUIS 17/10/2026 (#3989.8) : le rôle anonymisé d'un contact apporté par un utilisateur (`shared_company_people`, c94) ne devient PAS un nœud d'organigramme d'un autre espace. c94 reste telle quelle (base commune anonymisée) ; elle ne sert pas à afficher des nœuds anonymes.",
    supersedes:
      "« Rôles anonymes en nœuds d'organigramme » (#3989.8) et la contradiction c94 ↔ « jamais de donnée d'espace » laissée « à trancher » : close par ce refus.",
    codeState: 'absent',
    enforcement: 'held',
    holders: [],
    gap: "Refus tenu par cette entrée et par le registre (GA-38) : rien n'est codé, donc aucune garde ne peut le dire à la place de la relecture.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 17/10/2026 — inscrite par le lot V10-C.
    key: 'c118_pas_de_detecteur_de_contradiction',
    theme: 'Laura — pas de détecteur de contradiction en aval (#3889.7)',
    canonical:
      "REFUS RATIFIÉ LOUIS 17/10/2026 (#3889.7) : pas de détecteur de contradiction textuel sur les réponses du copilote (`chat_content_guards.py`). Une détection fiable exigerait de recroiser le texte libre avec le résultat structuré de l'outil ; un détecteur par expression régulière produit des faux positifs. Le correctif agit À LA SOURCE (la consigne et le résultat de l'outil).",
    supersedes: 'Un détecteur « aucun document » + citation côté garde de contenu : écarté.',
    codeState: 'absent',
    enforcement: 'held',
    holders: [],
    gap: "Refus tenu par cette entrée et par le registre (GA-38) : rien n'est codé, donc aucune garde ne peut le dire à la place de la relecture.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 17/10/2026 — inscrite par le lot V10-C.
    key: 'c119_seniorite_saisie_jamais_deduite',
    theme: 'CV — la séniorité en années est SAISIE, jamais déduite (#3935)',
    canonical:
      "REFUS RATIFIÉ LOUIS 17/10/2026 (#3935) : `years_experience` d'un consultant est SAISIE par un humain (décision du 31/08/2026), jamais déduite du parsing d'un CV — « fausse sur tous les CV sans dates ». Une séniorité ESTIMÉE peut s'afficher, badgée « estimé », calculée à la lecture et jamais stockée ; la valeur saisie gagne toujours.",
    supersedes: "La lecture des années d'expérience écrite dans `years_experience` depuis le CV : écartée.",
    codeState: 'partial',
    enforcement: 'held',
    holders: [],
    gap: "Refus tenu par cette entrée et par le registre (GA-38) : rien n'est codé, donc aucune garde ne peut le dire à la place de la relecture.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 17/10/2026 — inscrite par le lot V10-C.
    key: 'c120_pas_de_consequence_equipe_owner',
    theme: "Compte suivi — pas de « conséquence pour l'équipe / owner » (#4180)",
    canonical:
      "REFUS RATIFIÉ LOUIS 17/10/2026 (#4180) : « ce qui a changé » depuis la dernière vérification dit le FAIT, sa date, le compte et l'entité — jamais une « conséquence pour l'équipe / l'owner concerné ». Aucune règle de conséquence n'est tranchée ; l'inventer serait une donnée fictive.",
    supersedes:
      "« Afficher date du fait, dernière vérification et conséquence pour l'équipe/owner concerné » (synthèse p.16, EX-10) : la partie « conséquence » est écartée.",
    codeState: 'absent',
    enforcement: 'held',
    holders: [],
    gap: "Refus tenu par cette entrée et par le registre (GA-38) : rien n'est codé, donc aucune garde ne peut le dire à la place de la relecture.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 19/10/2026 — inscrite par le lot PIPE de la vague 4.
    key: 'c121_affaires_pipe_seul_talents_vivier_seul',
    theme: 'CRM/ATS — Affaires = Pipe seul, Talents = Vivier seul (renverse c104)',
    canonical:
      "DÉCISION LOUIS 19/10/2026 (call refonte UX + QCM, #4340/#4341/#4344/#4349) : Affaires = le Pipe SEUL, Talents = le Vivier SEUL — aucun onglet dans ces deux sections. Rien n'est perdu, chaque contenu va dans l'onglet nommé : les Pistes rejoignent Signaux (`/mes-cibles#pistes`, `/projects/pistes` redirige) ; les appels d'offres vivent DANS le pipe (`/projects?lens=rfp`, `/rfp` redirige) ; les besoins ouverts vivent sous Affaires (`/projects/needs`, ouvert depuis l'entête du pipe, NON redirigé : un besoin sans affaire n'a pas d'autre vue) ; les positionnements sont une section du Vivier (`/consultants#positionnements`, `/consultants/submissions` redirige) et se lisent sur la fiche consultant et l'affaire. Missions « En cours » → Planning (#4351) relève du lot Talents.",
    supersedes:
      "Renverse ASSUMÉ l'arbitrage 1 de #4191 (14/10/2026, c104) pour Affaires et Talents : « Affaires (Pipe · Pistes · Appels d'offres), Talents (Besoins ouverts · Vivier · Positionnements) ». c104 n'est pas effacée : elle reste écrite, datée comme renversée ici.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/components/navigation/sections.ts',
      'apps/web/src/components/navigation/tabs-removed-19-10.test.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 19/10/2026 — inscrite par le lot ACTIONS de la vague 4.
    key: 'c122_sequences_et_automatisations_un_seul_parcours',
    theme: 'Actions — Séquences et Automatisations : UN parcours pas à pas (#4357, #4355)',
    canonical:
      "DÉCISION LOUIS 19/10/2026 (QCM du call refonte UX, #4357 / #4355) : Actions = Aujourd'hui + Séquences. L'écran Séquences s'ouvre sur UN bouton « Créer ma séquence » qui guide un écran par étape — Quand → Pour qui → Modèle → Relecture — avec un retour arrière qui ne perd rien. Une automatisation n'est plus un objet à part : c'est une séquence dont le DÉCLENCHEUR est un signal (branche « sur signal » du parcours), listée dans la section « Séquences sur un signal ». Aucune séquence ni automatisation existante n'est perdue ; `/actions/automatisations` redirige.",
    supersedes:
      "Renverse c105 (14/10/2026, épopée #4163) sur l'onglet Automatisations et sur l'assistant en fenêtre : trois onglets deviennent deux. Inchangés : séquences LINÉAIRES (pas de branches oui/non), mono-contact (c74), rien ne part sans validation (c82), une règle naît éteinte.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/components/navigation/actions-tabs-labels.test.ts',
      'apps/web/src/features/outreach/sequence-journey.ts',
      'apps/web/src/routes/actions/automatisations.tsx',
    ],
    gap: "La dernière vérification d'une séquence « maintenant » (doublons, exclusions, RGPD, collègue) reste la fenêtre de création, ouverte pré-remplie à la fin du parcours — jamais une seconde copie de ses gardes.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 19/10/2026 (DEC-4036 Q5, #2958.98) — EXCEPTION NOMMÉE ET DATÉE, pas un
    // renversement : la règle reste vraie pour tout autre utilisateur.
    key: 'c123_rejeu_eval_corps_compte_louis',
    theme: 'Évaluation — le rejeu lit le corps des messages du SEUL compte de Louis',
    canonical:
      "DÉCISION LOUIS 19/10/2026 (#2958.98) : le rejeu d'évaluation (échantillons `chat_eval_samples`, rejoués par `chat_corpus_sources.py`) PEUT contenir le CORPS des messages d'UN utilisateur — Louis Schlegel, sur son propre compte — désigné par son identifiant dans `EVAL_MESSAGE_BODY_USER_ID` (API ; aucun e-mail en dur, sans clé = no-op strict). Le corps reste ANONYMISÉ avant stockage, borné à 4 000 caractères, et exige toujours l'opt-in de l'espace. " +
      "NE CHANGE PAS : jamais un autre utilisateur (une valeur qui n'est pas UN identifiant — e-mail, liste, joker — dit NON), jamais en démo, jamais vers un humain (art. 226-15 du Code pénal), jamais dans la mémoire collective (c4) ni la base commune (c92).",
    supersedes:
      "EXCEPTION à D65 / c39 / c96 et à `anonymizeForEvalSample` (« un tour qui a la forme d'un message rédigé n'est jamais échantillonné ») pour ce seul compte. L'évidence de `message_generique` (#2958.98, route-migration-2208-conditions.ts) disait « aucun moyen de lire un message préparé sans violer cette règle » : le moyen existe désormais, borné à ce compte.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/chat-eval-sampling/eval-message-body-access.ts',
      'apps/api/src/modules/chat-eval-sampling/eval-message-body-access.spec.ts',
      'apps/api/src/modules/chat-eval-sampling/chat-eval-anonymizer.spec.ts',
      'apps/api/src/modules/ia-proxy/chat-eval-sampling.hook.spec.ts',
    ],
    gap: "Livré : le versement, sous l'exception, des tours de Louis qui ont la forme d'un message. Reste NOMMÉ : le juge « message générique » qui lirait ces échantillons n'existe pas encore — `message_generique` reste `not_yet_evaluable` tant qu'il n'est pas écrit.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/10/2026 (#4421, QCM du 21/10) — RENVERSEMENT ASSUMÉ ET DATÉ de #3865.2,
    // écrit comme c74 : l'ancienne consigne est citée dans `supersedes`, pas effacée.
    key: 'c124_laura_ne_s_arrete_jamais_bascule_externe',
    theme: 'Copilote — rien en interne, Laura bascule seule en externe',
    canonical:
      "DÉCISION LOUIS 21/10/2026 (#4421) : « Laura ne doit jamais s'arrêter : peu importe la recherche, s'il n'y a rien en interne, elle bascule toute seule en externe et va chercher tout ça. » Vaut pour TOUTE recherche de Laura — missions, besoins, comptes, contacts. Rien en interne (aucun besoin ouvert, aucun compte ni contact dans l'espace) n'est jamais une fin : `find_needs_for_talent` sans besoin ouvert rend `next: find_accounts_for_talent` et Laura l'enchaîne DANS LE MÊME TOUR, sans demander. " +
      "Le volume est celui DEMANDÉ dans le prompt (« 10 comptes », « 10 contacts ») ; défaut : une dizaine de comptes, chacun avec ses besoins relevés (offres datées, jusqu'à 10) et ses contacts à joindre (recruteurs et managers d'abord, jusqu'à 10, en clair — c87). Une ligne d'annonce (ce qu'elle a retenu de la fiche), puis le résultat : aucun message intermédiaire, aucune confirmation avant une recherche externe. " +
      "Elle ne pose une question que si l'information manque VRAIMENT : consultant introuvable, homonymes, fiche sans aucune compétence. " +
      "La frontière de c84 / c82 NE BOUGE PAS : analyse, recherche et enrichissement partent seuls ; un e-mail ou un message n'est que PRÉPARÉ (`prepare_message_for_contact`), jamais envoyé.",
    supersedes:
      "⚠️ RENVERSE #3865.2 (lot X05 du 08/10/2026), consigne de l'outil `find_needs_for_talent` (`apps/ia/app/services/chat_tools.py`) telle qu'écrite : « Sans besoin ouvert dans l'espace, dis-le — ce n'est pas une erreur, et ce n'est pas `find_accounts_for_talent` pour autant : propose-le comme complément, n'y bascule jamais seul. » " +
      "Raison du renversement : retour de Louis devant un client (21/10) — un consultant sélectionné, « trouve-moi des missions », et Laura posait question sur question au lieu d'agir (« 15 000 messages, 20 000 questions »). Cette formulation du 08/10 reste l'ancien arbitrage : datée et renversée ici, pas effacée.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/chat_tools.py',
      'apps/ia/app/services/compilers/talent_accounts.py',
      'apps/ia/app/prompts/bellum_advisor.py',
      'apps/ia/tests/test_4421_laura_ne_s_arrete_jamais.py',
      'apps/ia/tests/test_4421_2410_cv_joint.py',
      'apps/ia/tests/test_4421_6_besoins_ouverts_en_plus.py',
      'apps/ia/tests/test_copilote_scope_eval.py',
      'apps/ia/evals/promptfoo/chat.yaml',
    ],
    // PRÉCISÉ 24/10/2026 (#4421, mesure prod « mission à Lille » + CV) : un CV JOINT se lit et part vers le marché
    // sans import préalable, la zone DITE prime ; les besoins déjà ouverts de l'espace sont rendus EN PLUS.
    gap: "Précisé le 24/10/2026 : un CV joint dans la conversation est lu et passé à `find_accounts_for_talent` (compétences, zone DITE dans le message d'abord) sans import au vivier ; les besoins déjà ouverts (`workspace_needs`) sont rendus EN PLUS du marché, leur absence ne fait aucune ligne. Tenu par le CONTRAT serveur (consigne des outils, résultat `next`, prompt système) et par un cas promptfoo sur un modèle réel ; aucune mesure sur conversations de production de la fréquence des questions superflues. Les contacts d'un compte ne se lisent que s'il a une fiche dans l'espace : un compte externe dit « Aucun contact connu — lancer l'analyse », et c'est l'analyse lancée par Laura qui les trouve. Les besoins relevés se limitent à ce que le moteur de Découvrir garde par employeur (sa dernière offre tant qu'il ne rend pas la liste `offers`).",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/10/2026 (#4430, retour client Cédric) — RENVERSEMENT PARTIEL ET DATÉ.
    key: 'c125_offres_fraiches_laura_decouvrir',
    theme: 'Offres — Laura et Découvrir recollectent les offres FRAÎCHES des comptes proposés (#4430)',
    canonical:
      "DÉCISION LOUIS 21/10/2026 (#4430) : quand Laura ou Découvrir proposent des comptes, les offres des 10 PREMIERS comptes dont le cache COMMUN a plus de 7 jours sont recollectées chez les sources payées (même cascade que la fiche). Plafonds, constantes UNIQUES de `fresh_jobs.py` : 10 comptes payants par réponse ou recherche, 60 par espace et par jour ; au-delà, cache seul et la carte dit la DATE de ses offres (`jobsAsOf`). Le cache reste COMMUN (30 j, clé = entreprise seule, décision du 15/10) : l'espace n'entre que dans la clé du compteur du jour, sous empreinte. Sans espace connu : rien n'est payé. Journal `jobs_fresh cache=hit|paid`, jamais le nom d'un fournisseur.",
    supersedes:
      "RENVERSE EN PARTIE la PR #4230 (15/10, « Découvrir sans appel payant ») et « Mantiks jamais dans Découvrir » (14/10). INCHANGÉS : la veille quotidienne reste en cache seul (VC.1, 18/10) ; le cache commun de 30 j (c99) ; nos fournisseurs ne se nomment jamais à l'écran.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/fresh_jobs.py',
      'apps/ia/tests/test_fresh_jobs_4430.py',
      'apps/ia/tests/test_discover_fresh_jobs_4430.py',
      'apps/ia/tests/test_run_account_search_fresh_jobs_4430.py',
      'apps/ia/tests/test_4421_2410_missions_fraiches.py',
    ],
    // ÉTENDU 24/10/2026 (#4421.8, Louis : « même si ça consomme du crédit ») aux missions d'un consultant.
    gap: "Étendu le 24/10/2026 (#4421.8, Louis : « il faut donner à Laura les outils pour aller fetch des nouveaux signaux […] même si ça consomme du crédit ») : `find_accounts_for_talent` lance SEULE la même collecte que Découvrir (compétences × zone, `spaceKey`) quand ses paliers gratuits ne tiennent pas le volume, sans demander et sans chiffre de crédits (c132) ; pour placer UN consultant, toute offre qui cite sa compétence compte — freelance, CDI, recrutement (le tri métier de l'ESN est levé, son pack gardé). Livré : le plan (7 j, plafonds), la collecte des cartes de Découvrir (mode registre) et de `run_account_search` (Laura), et le REMPLISSAGE d'une recherche par compétence maigre (comptes de la zone, gardés sur une offre lue qui cite la compétence). Reste NOMMÉ : le mode Signaux de Découvrir lit toujours les offres payées en cache seul ; les sources payées sont interrogées par ENTREPRISE, jamais par mot-clé (contrat non vérifié).",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 21/10/2026 (#4438, épopée #4433) — RENVERSEMENT ASSUMÉ ET DATÉ de #2269.16,
    // écrit comme c74 : l'ancienne règle est citée dans `supersedes`, pas effacée. Prolonge c124.
    key: 'c126_laura_agit_va_au_bout_parle_peu',
    theme: 'Copilote — Laura agit au lieu de demander, va au bout, parle peu',
    canonical:
      "DÉCISION LOUIS 21/10/2026 (#4438) : « je veux qu'elle bosse, qu'elle m'apporte du résultat à chaque fois, qu'elle ne parle pas trop, qu'elle agisse et qu'elle avance ». " +
      "VA AU BOUT : une demande de recherche ou de croisement reçoit jusqu'à `RESEARCH_TOOL_ROUNDS` (8) appels d'outils, constante unique (`chat_turn_plan.py`) ; ce qui ne tient pas dans le tour CONTINUE SEUL (`continues_alone` : la reprise de fond existante `chat_deepen_jobs`, bornée à trois reprises et au solde de crédits), et la réponse rend ce qu'elle a, dit en une ligne ce qui continue, ne pose aucune question (`_PARTIAL_TRANCHE_NOTE`). " +
      "ÉLARGIT SEULE : un zéro ou un résultat maigre s'élargit (zone, compétence, secteur, taille, signal) et le résultat est rendu avec UNE ligne qui dit ce qui a été élargi ; jamais « tu veux que j'élargisse ? ». L'implicite (chercher, croiser, ouvrir une fiche, préparer un brouillon) part sans confirmation. Une question seulement si l'ambiguïté CHANGE le résultat (homonymes). " +
      "PARLE PEU : le résultat d'abord ; hors listes et blocs structurés, `CHAT_PROSE_MAX_WORDS` (120) mots de prose au plus (`laura_acts.py`, lu par le prompt ET par la porte qualité). " +
      "Restent derrière un geste humain : l'ENVOI (c82), l'écriture CRM/ERP, une dépense au-delà des plafonds, et les gardes des outils qui lancent un travail payant (`laura_job_tool.py`, `chat_tools.py`).",
    supersedes:
      "⚠️ RENVERSE #2269.16 (`chat_orchestrator.py`, `_PARTIAL_TRANCHE_NOTE`) telle qu'écrite : « la suite se PROPOSE, elle ne part jamais toute seule — un geste de la personne, pas une reprise automatique » et « propose EXPLICITEMENT de continuer sur le reste si la personne le souhaite — jamais une suite qui partirait toute seule ». " +
      "Et les consignes « si l'interne ne suffit pas, tu le dis et tu proposes d'élargir, tu ne l'élargis pas toi-même » (SOURCE IMPOSÉE) et « tu poses UNE question qui les distingue avant de choisir » (prospection inversée), `bellum_advisor.py`. " +
      "Raison : audit des conversations réelles du 22/09 au 21/10 (commentaire sur #4438) — 63 % de réponses ratées, 78,5 % chez les externes ; 37 % de tranches partielles qui proposaient la suite (21 suites acceptées sur 277), 26 % de propositions d'élargir au lieu de le faire, 29 % de réponses au-delà de 250 mots.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/chat_turn_plan.py',
      'apps/ia/app/services/chat_orchestrator.py',
      'apps/ia/app/prompts/laura_acts.py',
      'apps/ia/tests/test_laura_agit_plan.py',
      'apps/ia/tests/test_laura_acts.py',
      'apps/ia/evals/promptfoo/chat.yaml',
    ],
    gap: "Le budget de TEMPS du tour (90 s, sous le plafond de 120 s de l'API) borne toujours : huit rounds tiennent rarement dans un tour, la suite part donc souvent en reprise de fond, qui reprend en mode Approfondi. La reconnaissance d'une demande de recherche est un motif fermé (verbe + objet cherché), pas un classifieur. La longueur médiane après le lot n'est pas encore mesurée sur conversations de production (critère de #4438 : à relancer par l'audit hebdomadaire).",
    nextPack: null,
  },
  {
    // #4286.15.a — DÉCISION LOUIS 22/10/2026 (épopée « Base commune », origine #4268.1, suite de #3989).
    // Le 19/10 avait tranché QUE `market_pattern` profite à tous ; le 22/10 dit COMMENT.
    key: 'c127_market_pattern_tendances_entre_espaces',
    theme: 'Base commune — les tendances de marché entre espaces (`market_pattern`)',
    canonical:
      'DÉCISION LOUIS 22/10/2026 (#4286.15) : coder `market_pattern` = des TENDANCES de marché observées entre espaces, en AGRÉGATS sur JETONS FERMÉS. ' +
      'Une cellule ne se coupe QUE par une liste fermée de catégories, toutes tirées de référentiels existants : secteur (division NAF), taille de la maison (TPE / PME / ETI / GE, catégories INSEE), région (les régions administratives), famille de métier recruté (les domaines du référentiel de compétences). ' +
      "Elle n'est PUBLIÉE que si au moins trois espaces contributeurs DISTINCTS la portent (k-anonymat, la constante unique `SHARED_BASE_MIN_WORKSPACES`), redit par un CHECK SQL et à la lecture. " +
      "JAMAIS de coût, de prix, de TJM, ni de nom d'espace ou de client, ni de contenu de message, de note ou de CRM. Un compte, jamais un taux ni une probabilité ; le libellé dit ce qu'on SAIT (« observé dans N espaces »), jamais ce que le marché FAIT (GA-259). " +
      "Servi comme un signal lisible par Laura, là où les signaux de compte et la base commune sont déjà servis — pas d'écran neuf.",
    supersedes:
      "⚠️ ÉLARGIT (sans effacer) `c92_base_anonyme_commune` et `c94_base_commune_capitalise_tout` : jusqu'au 19/10/2026, « les signaux `market_pattern` » étaient un reste « à décider » de `c96_memoire_marche_concurrent_des_un_parcours` (épopée #4016, L10). Le 19/10 (#4268) a tranché qu'ils profitent à tous les espaces ; le 22/10 en fixe la forme. INCHANGÉ : GA-43 (aucune colonne de portée, d'identité ni de texte libre ; aucun coût), le seuil de trois espaces, aucune probabilité.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/market-pattern.ts',
      'packages/contracts/src/schemas/market-pattern.test.ts',
      'apps/api/src/migrations/1796574700000-SharedMarketPatternAggregates.ts',
      'apps/api/src/migrations/__tests__/1796574700000-SharedMarketPatternAggregates.spec.ts',
      'apps/api/src/modules/shared-base/shared-base-cells.ts',
      'apps/api/src/modules/shared-base/shared-base-writes.ts',
      'apps/api/src/modules/shared-base/shared-base-aggregation.service.ts',
      'apps/api/src/modules/shared-base/shared-base-reader.service.ts',
      'apps/api/src/modules/copilot-bridge/copilot-bridge.controller.ts',
      'apps/api/src/modules/copilot-bridge/copilot-account-signals.spec.ts',
      'apps/api/src/architecture/ga-416-market-pattern-agregat-ferme.spec.ts',
      'apps/api/src/architecture/community-aggregation-kinds.spec.ts',
      'apps/api/src/modules/demo/demo-shared-base-coverage.spec.ts',
      'apps/ia/app/services/chat_tools.py',
      'apps/ia/tests/test_chat_account_signals_tool.py',
    ],
    gap: "Livré le 22/10/2026 (#4286.15.c) : table `shared_market_pattern_aggregates` (CHECK k >= 3, jetons fermés, aucune colonne de coût ni d'identité — GA-43 et GA-416), versement nocturne par `poolSharedCells` (recrutements `signal_history` sur `MARKET_PATTERN_WINDOW_DAYS` = 180 j), lecture par la porte `toMarketPatternLine`, servie par `POST /internal/copilot/accounts/signals` (clé `marketPatterns`, compte NOMMÉ) que Laura lit par `get_account_signals` ; semée en salle de démonstration. Restent NOMMÉS : (1) une seule famille de tendance — les recrutements par famille de métier ; d'autres natures de signal (levées, appels d'offres) n'ont pas de vocabulaire fermé commun décidé ; (2) l'écran Signaux ne l'affiche pas — décision « pas d'écran neuf » : seule Laura la lit ; (3) `observations` compte des recrutements REPÉRÉS, pas des sociétés distinctes — deux espaces qui suivent la même société comptent chacun son repérage (le libellé « observé dans N espaces » le dit) ; (4) comme pour c92, « ailleurs » inclut l'espace qui demande, et aucun plafond de dominance n'est posé ; (5) une famille de métier se lit dans l'intitulé par les termes du référentiel de compétences : un intitulé hors référentiel ne compte pas (jamais deviné).",
    nextPack: null,
  },
  {
    // Théo M2 — envoi programmé — PRÉCISION datée, pas un renversement : c82 reste entière.
    key: 'c128_envoi_programme_geste_du_commercial',
    theme:
      "Messagerie — le copilote n'envoie jamais ; un envoi programmé est le geste du commercial, validé et daté par lui",
    canonical:
      "DÉCISION LOUIS 22/10/2026 (Théo M2) : un brouillon VALIDÉ par le commercial (une version, son empreinte) peut être programmé à la date et à l'heure qu'il choisit, dans son fuseau ; il part seul, par SA boîte branchée, par le MÊME chemin que « Envoyer » au clic. Laura ne programme rien et n'envoie rien. Au départ la validation est relue (espace actif, version, empreinte) ; annuler ou déplacer l'heure reste possible tant que rien n'est parti ; une tentative sans réponse ou interrompue devient `unknown` et arrête la reprise ; « Envoyé le … » n'existe qu'avec le message retrouvé dans les éléments envoyés.",
    supersedes:
      "Précise c82_copilote_prepare_le_commercial_envoie sans la renverser : le clic a eu lieu (valider + programmer), il est décalé dans le temps. Ne touche ni le mandat (#4016 L5, seul envoi sans geste) ni c73 (« Fait » n'est pas une preuve d'envoi : ici la preuve vient de la boîte).",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/scheduled-message-send.ts',
      'apps/api/src/modules/scheduled-send/scheduled-send.service.ts',
      'apps/api/src/modules/scheduled-send/scheduled-send.service.spec.ts',
      'apps/api/src/architecture/aucun-envoi-sans-clic.spec.ts',
    ],
    gap: 'La file différée vit dans Redis : un job perdu (Redis vidé) laisse la ligne « programmée » sans départ, jamais un double envoi — aucun balayage ne repose encore les jobs manquants. La preuve repose sur la relecture de la boîte (quatre regards espacés, puis le balayage horaire des réponses) : un envoi parti mais jamais retrouvé reste « parti, pas encore retrouvé », sans « Envoyé le … ».',
    nextPack: null,
  },
  {
    // Théo C actions-aujourdhui.R6 — RENVERSEMENT daté et assumé de c122 côté NAVIGATION.
    key: 'c129_actions_trois_onglets_theo',
    theme: 'Actions — trois onglets : À traiter · Séquences · Automatisations (renverse c122 côté navigation)',
    canonical:
      "DÉCISION LOUIS 22/10/2026 (QCM maquettes Théo V22, domaine C) : la barre d'Actions s'écrit « À traiter · Séquences · Automatisations ». `/actions/automatisations` redevient un ÉCRAN (la section « Séquences sur un signal », avec routines et workflows) ; l'écran Séquences y renvoie par un lien, sans en copier la liste. Le MOTEUR reste commun : une automatisation est une séquence dont le déclencheur est un signal, créée par « Créer ma séquence » (branche « sur signal »).",
    supersedes:
      '⚠️ RENVERSE c122_sequences_et_automatisations_un_seul_parcours (19/10/2026) sur la NAVIGATION seulement (deux onglets redeviennent trois) ; c122 reste écrite au registre, datée et renversée, pas effacée. Inchangés : séquences linéaires, rien ne part sans validation (c82), une règle naît éteinte, le moteur commun.',
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/components/navigation/actions-tabs-labels.test.ts',
      'apps/web/src/routes/actions/automatisations.tsx',
      'apps/web/src/features/automations/view/AutomationsPage.tsx',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 22/10/2026 (QCM C/D) — ⚠️ RENVERSEMENT daté de c122 sur la NAVIGATION seulement.
    key: 'c130_actions_trois_onglets_automatisations_theo',
    theme: 'Actions — trois onglets : À traiter · Séquences · Automatisations (écran de Théo)',
    canonical:
      "DÉCISION LOUIS 22/10/2026 (QCM C/D, maquettes Théo V22) : Actions a TROIS onglets — À traiter, Séquences, Automatisations. `/actions/automatisations` est de nouveau un écran (« Tes automatisations ») : cartes de règle à trois blocs (Déclencheur · Préparation · Ta décision), interrupteur Active / Éteinte, mesures, origine en pastille et en filtre (Règle · Planifiée · Workflow · Missions), champ « Décris ton automatisation » qui ouvre Laura, et les automatismes de mission venus de l'ancien suivi. Le MOTEUR reste commun : une automatisation EST une séquence déclenchée par un signal ; une règle naît éteinte ; ce qu'elle prépare arrive dans À traiter, rien ne part sans le geste du commercial.",
    supersedes:
      "⚠️ RENVERSE c122 (19/10/2026, #4357) sur la navigation : « Actions = Aujourd'hui + Séquences, `/actions/automatisations` redirige » est tranché dans l'autre sens le 22/10. Le MOTEUR de c122 (automatisation = séquence déclenchée par un signal) est GARDÉ. Datée et renversée ici, pas effacée : c122 et c105 restent écrites au registre.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/components/navigation/actions-tabs-labels.test.ts',
      'apps/web/src/features/automations/view/AutomationsPage.tsx',
      'apps/web/src/routes/actions/automatisations.tsx',
    ],
    gap: "Le champ « Décris ton automatisation » ouvre Laura avec la demande : la génération d'une règle structurée à partir d'une phrase n'est pas un moteur à part, c'est la conversation. La carte ne montre pas encore un périmètre de lecture par règle (« Mes dossiers autorisés ») : les règles lisent l'espace, c'est écrit plutôt que supposé.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 22/10/2026 (QCM C/D) — ⚠️ RENVERSEMENT daté de c74.
    key: 'c131_sequence_audience_multi_contacts',
    theme: "Séquences — l'assistant en quatre étapes pose une VRAIE audience multi-contacts",
    canonical:
      "DÉCISION LOUIS 22/10/2026 (QCM C/D, maquettes Théo V22) : l'assistant « Créer une séquence » (Audience · Objectif · Messages · Vérification) part d'une AUDIENCE — plusieurs contacts, un nom saisi dès la première étape, une colonne « Ta séquence » qui reste visible. Les garde-fous d'audience (sans e-mail, désinscrits, exclus, doublons, contacts d'un collègue) sont NOMMÉS à l'étape Audience. Le moteur garde la propriété qui le fait s'arrêter quand CETTE personne répond : l'arrêt reste par contact.",
    supersedes:
      "⚠️ RENVERSE c74 (21/09/2026, `c74_campagne_etiquette_mono_contact`) : « l'étiquette `campaign_label` referme le chantier de l'audience multi-contacts » est tranché dans l'autre sens le 22/10 — l'audience redevient l'objet que l'écran montre et nomme. Datée et renversée ici, pas effacée ; la décision du 16/09 (#2203.32) revient, la précision du 17/10 (« jamais un objet audience ») est levée.",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/web/src/features/outreach/sequence-journey.ts',
      'apps/web/src/features/outreach/sequence-journey.test.ts',
      'apps/web/src/features/outreach/view/SequenceJourney.tsx',
    ],
    gap: "Livré : l'audience comme geste et comme écran (nom, colonne, garde-fous nommés). Pas livré : une table « audience » persistée et l'ajout d'un contact APRÈS le lancement — le lancement crée toujours une séquence par personne, regroupées sous le nom saisi (`campaign_label`). Il demande une migration (GA-11/GA-12) : un lot à part, écrit plutôt que supposé.",
    nextPack: null,
  },
  {
    // Théo C talents-recrutement — décision neuve (N3/N4), rien n'est renversé.
    key: 'c140_recrutement_personne_independant_des_presentations',
    theme:
      "Talents › Recrutement — l'étape de recrutement d'une PERSONNE est indépendante de ses présentations et de ses affectations ; « Écartée » n'efface personne",
    canonical:
      "DÉCISION LOUIS 22/10/2026 (Théo C) : une personne a une étape de recrutement — À qualifier, Échange prévu, Qualifié, En veille, Écartée — consignée dans un journal append-only (une ligne par changement, avec son motif). Cette étape n'altère NI ses présentations sur les besoins NI ses affectations de mission, et ne pèse dans AUCUN classement : le motif est un texte libre consigné, jamais lu pour classer (aucun critère protégé dans le rang d'une personne). « Écartée » est une étape, pas une suppression — on archive, on ne supprime pas ; seul l'effacement RGPD à la demande de la personne (c67) la supprime, et il emporte son journal. Une personne jamais rangée se lit « À qualifier », jamais « Écartée ».",
    supersedes:
      "Ne renverse rien : le vivier n'avait aucune étape de recrutement (seulement un type de profil, candidat ou consultant). Ne touche ni c67 (l'effacement RGPD reste la seule suppression) ni la règle « aucun critère protégé ne pèse dans le rang d'une personne ».",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/talent-recruitment.ts',
      'apps/api/src/modules/consultants/talent-recruitment.service.ts',
      'apps/api/src/modules/consultants/talent-recruitment-independence.spec.ts',
    ],
    gap: "La durée de conservation d'une personne « En veille » ou « Écartée » n'a pas de seuil propre : elle suit le consentement et la politique de conservation du vivier (`consultants.retention.*`), et l'écran le dit une fois sous « En veille ». Le bouton « Préparer l'échange » (R1 ou R2 automatique) n'existe pas encore : aucune préparation d'échange n'est branchée sur une fiche talent.",
    nextPack: null,
  },
  {
    // Théo C projects-pipeline — RENVERSE EN PARTIE #4335.2 (19/10) côté LIBELLÉ de la colonne finale seulement.
    key: 'c141_pipe_cinq_colonnes_de_theo_correspondance_ecrite',
    theme:
      'Affaires — le pipe lit cinq colonnes (À qualifier · Cadrage · Profils présentés · Proposition · Gagnée) ; Perdue et En sommeil sont des sorties ; les neuf valeurs stockées ne bougent pas',
    canonical:
      "DÉCISION LOUIS 22/10/2026 (Théo C) : le kanban d'Affaires montre les cinq colonnes de Théo. Migration 9→5 par CORRESPONDANCE ÉCRITE (`THEO_COLUMN_OF_STAGE`), jamais par réécriture : confirmed → À qualifier, qualified → Cadrage, profiles_submitted → Profils présentés, negotiation → Proposition, won → Gagnée ; detected et potential restent des pistes (tiroir « Pistes de Laura », renvoi vers Signaux) ; lost et dormant sont des SORTIES filtrables (« Perdues », « En sommeil »), le motif et le REX de perte restent gardés. Les valeurs stockées et leurs contraintes SQL sont inchangées : rien n'est perdu, rien n'est migré à la baisse. ⚠️ RENVERSE EN PARTIE #4335.2 (19/10, « Signé partout ») pour la SEULE colonne du kanban, qui se lit « Gagnée » ; la file des besoins, le board des missions et la note de SLA gardent « Signé ».",
    supersedes:
      "Renverse en partie #4335.2 (libellé de la colonne finale du pipe) et les libellés de #4338.1 (« Besoin exprimé », « Qualifié », « Négociation ») ; l'ORDRE et le sens des valeurs stockées de #4338.1 tiennent.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/project.ts',
      'packages/contracts/src/schemas/project.theo-columns.test.ts',
      'apps/web/src/i18n/theo-c-projects-pipeline-labels.test.ts',
    ],
    gap: "Le libellé d'un espace peut toujours renommer une colonne (`pipeline_stage_labels`) : la correspondance fixe le défaut, pas la personnalisation. Le nom « À qualifier » de la colonne `confirmed` ne dit plus « le client l'a exprimé » : la preuve de l'expression reste lue sur l'affaire.",
    nextPack: null,
  },
  {
    // RÈGLE ÉCRITE 23/10/2026 (#4433.5) — précise l'épopée #4433, ne renverse aucune doctrine.
    key: 'c133_paliers_d_elargissement_exact_d_abord',
    theme: "Recherches — les paliers d'élargissement : exact d'abord, élargi étiqueté, Laura élargit seule et le dit",
    canonical:
      "RÈGLE (#4433, écrite le 23/10/2026 après la recette prod) : une recherche s'exécute par PALIERS — (1) l'EXACT d'abord, jamais mélangé ; (2) sous le seuil de résultats exacts (`CRITERIA_WIDEN_MIN_RESULTS`), le palier VOISIN du référentiel partagé (compétence de la même famille, puis son domaine ; secteur voisin ; taille voisine ; zone voisine : 100 km autour d'une ville, puis département, région, puis la région, où l'automatique s'arrête depuis le 27/10 au soir : voir `c144_zone_automatique_s_arrete_a_la_region`, qui renverse `c143_zone_100km_puis_paliers_jusqu_a_la_france`), axe par axe ; (3) chaque résultat élargi porte son ÉTIQUETTE avec sa RAISON (`widenedBy` : « proche : Elixir », « élargi à l'Occitanie ») et les résultats exacts restent en tête ; (4) la réponse NOMME le palier en une ligne (« Aucune offre Clojure : j'ai élargi aux langages fonctionnels (Elixir, Erlang, Haskell). »), le voisin de COMPÉTENCE avant la zone ; (5) LAURA ÉLARGIT SEULE, dans le tour, et le DIT — elle ne demande JAMAIS « tu veux élargir ? » ni ne rend un zéro sec ; (6) l'élargissement se fait dans le CODE (`criteria_widening.widen_rows`), jamais dans la mémoire du modèle, et une ligne dont on ne sait pas nommer le voisin n'est pas ajoutée. « Revenir au strict » reste un geste de l'utilisateur. Une compétence du référentiel glissée dans `keywords` est une compétence, jamais une raison sociale.",
    supersedes:
      "« Laura propose d'élargir et attend la réponse » (la suite PROPOSÉE) — déjà renversée par #4438.2 pour les tranches longues ; et un élargissement silencieux, par la seule zone, qui mélange exact et voisin sans le dire (constat prod 22-23/10 : « Clojure à Toulouse » élargi par la zone seulement, voisin non nommé).",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/criteria_widening.py',
      'apps/ia/app/services/criteria_referential.py',
      'apps/ia/tests/test_criteria_paliers_4433.py',
      'apps/ia/tests/test_4434_laura_nomme_le_voisin.py',
      'packages/contracts/src/schemas/criteria-referential.ts',
    ],
    gap: "L'étiquette d'un compte élargi par la ZONE (`zone_label`) et celle d'un voisin de compétence (`widenedBy`) vivent dans deux champs ; la ligne de réponse est posée par le code pour la compétence (`ensure_widening_line`), et la zone la dit via `zone_line`. Zone + compétence dans la même recherche : UNE phrase qui dit les deux (#4433, `widening_line_from_output`, `test_4433_phrase_unique_zone_et_competence.py`). Reste à fondre de la même façon le secteur et la taille quand ils s'élargissent avec la zone.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 22/10/2026 (épopée #4468, #4464) — inscrite par le lot R23-FIX-RECETTE-F (#4468.2).
    key: 'c132_credits_implicites',
    theme: 'Crédits IMPLICITES — débités en coulisse, jamais affichés au client',
    canonical:
      "DÉCISION LOUIS 22/10/2026 (épopée #4468) : les crédits sont IMPLICITES. Ils sont débités en coulisse (le débit, le ledger et le remboursement nocturne c78 sont inchangés) mais JAMAIS affichés au client — ni coût d'un geste, ni solde, ni quota, ni pourcentage, ni dans le produit, ni dans les réponses de Laura. Quand l'usage du mois est atteint, le client reçoit un FREIN DOUX, sans aucun chiffre : « Tu as beaucoup utilisé Bellum ce mois-ci — on en parle ? », avec l'invitation à écrire à l'équipe Bellum. La consommation ne se lit qu'au BACK-OFFICE (admin), jamais côté client. Les CGV parlent d'« usage inclus dans la formule » (#4466.4), plus de « crédits ».",
    supersedes:
      "⚠️ RENVERSE ASSUMÉ l'affichage des COÛTS en crédits (avant un geste, sur les cartes, dans les outils de Laura), la MODALE à 80 % de consommation et la RECHARGE proposée au client (« recharger »). Ces écrans ne sont pas effacés de l'historique : ils sont DATÉS comme renversés ici. INCHANGÉS : le débit et le ledger, le remboursement nocturne des crédits débités à tort (c78), la formule « sans clé = no-op ».",
    codeState: 'partial',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/credits/soft-brake.spec.ts',
      'apps/api/src/modules/admin/admin-credit-consumption.service.spec.ts',
      'apps/ia/tests/test_laura_no_money_4464.py',
    ],
    gap: "Livré : le frein doux (API et Laura), la purge des coûts dans ce que le modèle relit, la consommation au back-office. Reste dans l'épopée #4468 : le retrait des affichages de coût côté web (cartes, modale à 80 %, recharge) est porté par d'autres lots ; aucune garde d'architecture web ne tombe encore si un coût en crédits réapparaît à l'écran.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 26/10/2026 (#4603, après deux fiches « Veepee » mesurées en production) — prise EN
    // CONNAISSANCE de c37, qui lui a été citée. Un arbitrage effacé se re-propose, un arbitrage renversé se lit.
    key: 'c142_fusion_auto_compte_crm_compte_analyse',
    theme: 'CRM / comptes — un compte = une société, quel que soit son chemin d’entrée',
    canonical:
      "⚠️⚠️ RENVERSEMENT DATÉ DU 26/10/2026 (décision Louis, #4603 : « quand j'analyse un compte qui vient d'un CRM, je veux pas deux comptes, je veux une fusion des deux ») : une paire COMPTE VENU DU CRM (sans aucun run) ↔ COMPTE CRÉÉ PAR L'ANALYSE de la MÊME société est FUSIONNÉE AUTOMATIQUEMENT, SANS DEMANDER. Clé : le SIREN d'abord, puis le nom normalisé par `marketMatchKey` (le normaliseur partagé, GA-26) ; un SIREN contradictoire ne se rapproche jamais sur le nom, deux comptes analysés pour la même clé sont ambigus et rien n'est fusionné. Une CORRECTION HUMAINE gagne : une paire déjà tranchée (fusion annulée, paire écartée) ou une fiche CRM triée à la main n'est jamais fusionnée. On ARCHIVE, on ne supprime pas ; la fusion garde l'UNION (contacts, affaires, activités, runs, notes, liens CRM), s'écrit au journal `account_crm_fusions` avec les deux identifiants et la clé qui a décidé, et est RÉVERSIBLE. Le rattrapage de l'existant est CIBLÉ (espace actif, borne par passage, simulation d'abord) et ne part jamais seul au déploiement. Et AVANT qu'une paire existe : l'analyse reprend le compte de la même société, quel que soit son statut. PORTÉE SERRÉE : deux comptes de même nom d'origines quelconques restent PROPOSÉS (c37).",
    supersedes:
      "c37_fusion_doublons, pour ce cas seulement : « On PROPOSE une fusion de doublons, on ne fusionne JAMAIS » — une paire compte-CRM ↔ compte-analyse attendait jusqu'ici un humain au balayeur des doublons (#3490 : détection APRÈS coup, proposition). Ce qui rendait la règle juste — un faux positif écrase l'historique d'un vrai client — est tenu ici par la clé (SIREN d'abord, ambiguïté refusée), l'archivage et le retour arrière. Antériorité de la même famille : « 7× Decathlon » (`1786000000000-PurgeEmptyDuplicateAccounts.ts`), dont le correctif traitait la relance après échec, jamais l'arrivée par le CRM.",
    codeState: 'implemented',
    // GARDÉE : `account-crm-fusion.spec.ts` exige qu'aucun homonyme d'origines quelconques ne forme une paire,
    // qu'une paire tranchée par un humain ne se refusionne pas et qu'un SIREN contradictoire ne rapproche rien ;
    // `account-crm-fusion.service.spec.ts` tient la simulation sans écriture, l'archivage sans DELETE, le
    // journal et l'annulation ; `same-company-account.spec.ts` tient la clé de la prévention.
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/accounts/same-company-account.ts',
      'apps/api/src/modules/accounts/same-company-account.spec.ts',
      'apps/api/src/modules/accounts/account-crm-fusion.ts',
      'apps/api/src/modules/accounts/account-crm-fusion.spec.ts',
      'apps/api/src/modules/accounts/account-crm-fusion.service.spec.ts',
      'apps/api/src/migrations/1796584123457-AccountCrmFusions.ts',
    ],
    gap: "Écarts nommés au 26/10/2026 : (1) le SIREN n'est lu à l'import que pour HubSpot (propriété `siren`, non standard) — Pipedrive, Salesforce, Attio, Odoo et Zoho créent la fiche sans SIREN, rapprochée alors par le nom seul ; (2) dans l'autre sens (compte d'abord analysé, PUIS importé du CRM), l'import crée encore une seconde fiche : c'est le rattrapage qui la fusionne, pas une prévention à l'import ; (3) un contact de la fiche CRM homonyme d'un contact de la fiche gardée reste sur la fiche archivée (index unique) — lisible, non fusionné ; (4) le rattrapage n'a pas encore d'écran : il se lance par `POST /accounts/crm-fusions/sweep` (simulation par défaut).",
    nextPack: null,
  },
  {
    // RENVERSÉ le 27/10/2026 au soir par c144_zone_automatique_s_arrete_a_la_region — l'entrée ci-dessous reste
    // telle quelle, écrite pour être lue.
    // DÉCISION LOUIS 27/10/2026 (#4433, tranchée en FINAL) — prise EN CONNAISSANCE de l'arrêt à la région, livré
    // deux fois en quatre jours. Un arbitrage effacé se re-propose, un arbitrage renversé se lit.
    key: 'c143_zone_100km_puis_paliers_jusqu_a_la_france',
    theme: "Zone — 100 km autour d'une ville, puis des paliers NOMMÉS jusqu'à la France, sans jamais demander",
    canonical:
      "⚠️⚠️ RÈGLE FINALE DU 27/10/2026 (décision Louis, épopée #4433) : une ville cherche dans 100 km par défaut ; si ça ne suffit pas (moins de `ZONE_WIDEN_MIN_RESULTS` comptes), l'élargissement monte par paliers NOMMÉS à l'écran — le département, la région, PUIS LA FRANCE — et ne s'arrête JAMAIS. Il ne demande JAMAIS la permission : Laura AGIT (#4438), elle ne dit JAMAIS « tu veux élargir ? », elle rend le résultat avec UNE ligne qui nomme le palier atteint. Un barreau à la fois, l'exact reste en tête, chaque compte élargi porte son étiquette de zone, et au-dessus du seuil rien ne s'élargit (#3876 : une ville ne devient jamais son département en silence). Le rayon MANUEL (10, 25, 50, 100 km) est un réglage de l'utilisateur, hors de l'échelle. « Revenir à 100 km » et « Revenir au barreau d'avant » restent des gestes de l'utilisateur. L'échelle vit en UN endroit (GA-26) : `zone-tiers.ts`, miroir `zone_tiers.py` (JSON partagé, gardes des deux côtés), lue par Découvrir, Laura et l'analyse.",
    supersedes:
      "#4640 (27/10 au matin) : « ville stricte → 100 km → grande région, puis STOP — jamais le pays tout seul » ; #4429 (25/10) : « ville → 100 km → grande région → France » où la France restait un geste explicite ; #4429 du 21/10 : « 25 km → 50 km → département → région » ; #4419 ; les 25 km par défaut de #4515. L'arrêt à la région a été LIVRÉ une fois : il est écrit ici pour être lu, pas effacé — celui qui le re-propose ne l'avait pas lu.",
    codeState: 'implemented',
    // GARDÉE : `zone-tiers.test.ts` (échelle, parité JSON, seuil — au-dessus, aucun palier) et
    // `test_4640_4641_zone_region_rayon_100.py` (le rayon par défaut, la ville exacte, le palier dit).
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/zone-tiers.ts',
      'packages/contracts/src/schemas/zone-tiers.test.ts',
      'apps/ia/app/services/zone_tiers.py',
      'apps/ia/tests/test_4640_4641_zone_region_rayon_100.py',
    ],
    gap: "Le secteur et la taille, quand ils s'élargissent AVEC la zone dans la même recherche, ne sont pas encore fondus dans la même phrase que la zone (reste nommé de c133). Et la zone du dossier d'analyse (#4432) RANGE la zone en tête sans rien retirer : elle ne monte pas de paliers, elle ne rend jamais zéro.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 27/10/2026 AU SOIR (#4640, ratifié) — en FIN de liste (GA-08). Un arbitrage effacé se re-propose,
    // un arbitrage renversé se lit : l'arrêt à la région a été livré, renversé, livré, renversé.
    key: 'c144_zone_automatique_s_arrete_a_la_region',
    theme: "Zone — l'élargissement AUTOMATIQUE s'arrête à la région ; la France reste un geste explicite",
    canonical:
      "⚠️⚠️ DÉCISION LOUIS 27/10/2026 AU SOIR (#4640, ratifiée) : « sur Découvrir par défaut je ne veux pas que tu élargisses automatiquement à toute la France, je veux que l'automatique soit max la région, sinon ça casse le filtre même s'il y a peu de comptes ». Une ville cherche dans 100 km par défaut ; sous `ZONE_WIDEN_MIN_RESULTS` comptes, l'élargissement AUTOMATIQUE monte d'un barreau à la fois — le département, PUIS la région — et s'ARRÊTE là, MÊME si la région rend 0 compte : « peu de comptes » est une RÉPONSE, c'est le filtre de zone qui a raison, pas le volume. Aucune requête « France » ne part d'un élargissement automatique. La recherche France entière reste possible, EXPLICITEMENT (aucune ville posée, ou le geste d'écran qui élargit la zone) : `france` reste un palier NOMMABLE de `ZONE_TIERS` (ordre de tri, étiquettes, payloads déjà rendus) mais SORT de l'échelle automatique. Le plafond vit en UN endroit (GA-26), dans trois miroirs : `ZONE_AUTO_MAX_TIER = 'region'` (`zone-tiers.ts`, `zone_tiers.py`) et `autoMaxTier` du JSON partagé ; `zoneTiersAfter` / `zone_tiers_after` ne rendent jamais un palier au-delà. Au dernier barreau encore sous le seuil, le bandeau DIT l'arrêt (« La recherche s'arrête à la région : pas d'élargissement à toute la France. »), sans chiffre inventé.",
    supersedes:
      "c143 (27/10 le matin, lot DÉCOUVRIR-ZONE) : « département, région, PUIS la France, sans jamais s'arrêter ». L'arrêt à la région a été LIVRÉ DEUX FOIS et RENVERSÉ DEUX FOIS EN TROIS JOURS (25/10 #4429 → 27/10 matin #4640 → c143 → c144) : il est écrit ici pour être lu, pas effacé — celui qui le re-propose, ou qui re-propose la France automatique, ne l'avait pas lu. Le rayon MANUEL (10/25/50/100 km), `DEFAULT_CITY_RADIUS_KM = 100` (#4641), `zoneStrict` et `zoneCeiling` ne changent pas.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/ia/app/services/zone_tiers.py',
      'packages/contracts/src/schemas/zone-tiers.ts',
      'packages/contracts/src/schemas/zone-tiers.constants.json',
      'apps/ia/tests/test_4640_zone_automatique_s_arrete_a_la_region.py',
      'packages/contracts/src/schemas/zone-tiers.test.ts',
    ],
    gap: "`apps/ia/app/services/zone_dossier.py` (#4432, zone du dossier de compte) garde son palier `france` — exception ASSUMÉE et nommée : il n'émet aucune requête, il arrête seulement de restreindre une liste d'entités DÉJÀ rattachées au compte (« plus aucune contrainte de zone sur ce qui est déjà là »), ce n'est pas une recherche nationale.",
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 28/10/2026 (#4761, après le rendez-vous Kevin Sanson / Tallois) — en FIN de liste (GA-08).
    // ⚠️ RENVERSEMENT daté de #4307, sur le modèle de `c74_campagne_etiquette_mono_contact` : écrit pour être lu.
    key: 'c145_historique_stocke_se_lit_sans_credit',
    theme: "Découvrir — l'historique DÉJÀ STOCKÉ se lit sans crédit ; deux blocs plafonnés ; la carte dit pourquoi",
    canonical:
      "DÉCISION LOUIS 28/10/2026 (#4761, #4758) : la donnée déjà stockée est déjà payée, la relire ne coûte rien. Un crédit ne se débite que si la lecture déclenche un APPEL NEUF à une source externe — jamais pour relire l'historique d'un compte. " +
      'Découvrir se range en DEUX blocs ordonnés et nommés, « Signaux récents » puis « Comptes à historique » ; chacun dit son plafond ET son total (« 20 sur 134 ») avec un « Voir les 114 autres » explicite — jamais un plafond silencieux. Le plafond, 20, vit en UN endroit (GA-26) : `DISCOVER_BLOCK_CAP` (`discover-blocks.ts`). Un bloc vide DISPARAÎT : ni « 0 », ni ligne de remplissage. ' +
      "Un compte qui remonte sur son seul historique NOMME sa raison sur sa carte : ce que l'entreprise a cherché (la techno), le nombre, la période et l'âge du plus récent (« 11 offres Java entre 2025 et 2026, la dernière il y a 3 mois ») — jamais la source qui l'a fournie, jamais un score nu. Le frein de crédits reste IMPLICITE (`c132_credits_implicites`) : aucun chiffre de crédit affiché, le palier vit au back-office.",
    supersedes:
      "⚠️ RENVERSE #4307 (19/10/2026) : l'historique de Découvrir derrière des crédits — 5 signaux récents gratuits, le reste payant. Tranché dans l'autre sens le 28/10/2026 : la donnée déjà stockée se lit sans crédit. Datée et renversée ici, pas effacée : quelqu'un qui retrouverait ailleurs (issue, mémoire) un palier de crédits sur l'historique doit savoir qu'il a été retiré. #4067 (12/10/2026, l'historique entre dans le classement) n'est pas re-litigée : elle est livrée, et l'écran en dit désormais la raison.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/discover-blocks.ts',
      'packages/contracts/src/billing/signal-history-is-free.test.ts',
      'apps/web/src/features/discover/lib/discover-history-blocks.ts',
      'apps/web/src/features/discover/lib/discover-history-blocks.test.ts',
      'apps/web/src/features/discover/view/DiscoverHistoryBlocks.tsx',
      'apps/web/src/features/discover/view/DiscoverHistoryBlocks.test.tsx',
      'apps/web/src/features/discover/view/HistoryReasonLine.tsx',
    ],
    gap: "Les deux blocs rangent les comptes DÉJÀ chargés par la recherche : un compte dont aucun signal n'a été ramené n'est pas classé (la ligne « N autres comptes ne sont pas listés » le dit). Tant qu'aucun compte ne remonte sur son seul historique, l'écran garde sa liste paginée d'avant.",
    nextPack: null,
  },
  {
    // RÈGLE ÉCRITE 29/10/2026 (Louis) — en FIN de liste (GA-08). Mesurée, pas supposée : six lots en UNE matinée
    // portaient le même défaut. Un arbitrage déjà re-proposé par quelqu'un qui ne l'avait pas lu : elle est écrite ici.
    key: 'c146_un_lot_n_est_fini_que_quand_son_appelant_existe',
    theme: "Livraison — un lot n'est fini que quand son APPELANT existe",
    canonical:
      "RÈGLE ÉCRITE 29/10/2026 (Louis) : un lot n'est fini que quand son APPELANT existe. Du code juste, calculé, testé, que PERSONNE n'appelle n'est pas livré — c'est du code mort qui a l'air vivant. Avant de déclarer un lot fini, on cherche l'APPELANT (la route montée, l'écran qui l'appelle, le planificateur qui lance le collecteur, le registre qui porte le drapeau), pas seulement la fonction : un test vert sur la fonction ne prouve pas qu'elle sert. " +
      "MESURE du 29/10/2026 — SIX lots en une matinée portaient le même défaut : #4734 et #4735 (deux collecteurs sans appelant) ; #4742 (une route sans écran) ; #4754 (un drapeau absent d'un registre) ; #4759 (un point d'API sans appelant) ; #4760 (un enregistrement qui ne fait qu'un `logger.log`). " +
      "Le motif est le même que celui de `agent_docs/chantiers-livres.md` : chercher l'APPELANT, pas seulement la fonction.",
    supersedes:
      "« Fini » lu comme « la fonction est écrite et son test est vert » : c'est la définition tacite qui a laissé passer les six lots ci-dessus, dont les tests étaient VERTS. Aucune règle écrite ne la contredisait — elle ne vivait que comme reproche de relecture. Écrite ici pour être lue : celui qui propose de clore un lot sur la seule fonction testée ne l'avait pas lue.",
    codeState: 'absent',
    enforcement: 'unenforced',
    holders: [],
    gap: "Rien ne la GARDE par une machine : `knip` (`pnpm lint:exports:types`) voit un export sans importeur, pas une route sans écran, un collecteur sans planificateur, un drapeau absent de son registre ni un enregistrement qui s'arrête au journal. La règle tient aujourd'hui par la relecture et par le rapport du lot, qui doit NOMMER l'appelant. Une garde qui dirait NON (un lot dont l'appelant manque), LIRE (le graphe d'appels réel) et ne pas attraper ce qu'elle ne vise pas (une bibliothèque exportée à dessein) reste à écrire — elle n'est pas promise ici. ⚠️ Aucune ligne n'est posée dans `CLAUDE.md` (plafonné à 15 000 caractères par la CI) : la règle vit au registre et dans `agent_docs/doctrine.md`.",
    nextPack: null,
  },
  {
    key: 'c147_synchro_crm_remplit_un_champ_vide_jamais_n_ecrase',
    theme: "Synchronisation CRM — exception nommée à la porte d'écriture",
    canonical:
      "La synchronisation automatique (le cron `crm-sync`) REMPLIT un champ VIDE du CRM du client (e-mail, téléphone) sans passer par la porte d'écriture, et n'écrase JAMAIS une valeur non vide DIRECTEMENT : avec `CRM_SYNC_OVERWRITE=true`, l'écrasement d'une valeur non vide passe par la porte (prévisualisation figée, validation humaine aux droits existants de la porte, #4714.3). C'est la seule exception à « une écriture CRM/ERP passe par une porte » ; toute autre écriture passe par `OutboundWriteService` (#4186).",
    supersedes:
      "Le critère coché de #4186 (« chaque écriture vers un CRM ou un ERP passe par `OutboundWriteService` »), que le chemin du cron ne tenait pas sans que l'écart soit écrit nulle part. Option écartée : router le remplissage par la porte (prévisualisation figée) — la synchro automatique perdrait son automatisme, plus rien ne partirait sans un clic.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/crm-sync/crm-sync.service.ts',
      'apps/api/src/modules/crm-sync/crm-sync.config.ts',
      'apps/api/src/modules/crm-sync/crm-sync.service.spec.ts',
      'apps/api/src/modules/crm/outbound-write.service.ts',
      'apps/api/src/architecture/crm-sync-exception-champ-vide.spec.ts',
      'apps/api/src/architecture/crm-ecritures-passent-par-la-porte.spec.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    // DÉCISION LOUIS 02/11/2026 (lot 775) — en FIN de liste (GA-08).
    // ⚠️ RENVERSEMENT PARTIEL et daté de GA-352 (« aucune colonne désignant un individu ») et du refus d'importer
    // un fichier d'identités : écrit pour être lu, pas effacé.
    key: 'c148_marche_toute_la_donnee_sauf_l_identite_directe',
    theme: 'Mémoire marché — toute la donnée marché, sauf l’identité directe',
    canonical:
      "DÉCISION LOUIS 02/11/2026 : « tout mettre comme donnée sauf le nom et prénom et genre, num et adresse mail ; pour le reste tu peux te servir de toutes les données ». Les PARCOURS individuels (poste, dates, statut freelance/ESN/salarié, ESN employeuse, compétences, TJM, lieu de mission) entrent dans la mémoire marché sous un pseudonyme (HMAC salé). La liste FERMÉE des identifiants directs, jamais gardés : nom, prénom, nom complet, genre/civilité, téléphone, e-mail, URL de profil, photo, adresse postale, date de naissance/âge — retirés À LA LECTURE du fichier, jamais écrits, même temporairement. Une ligne individuelle s'affiche même seule (elle ne porte aucune identité) ; le seuil de 3 ne vaut que pour les agrégats. Les critères protégés n'entrent jamais dans un rang.",
    supersedes:
      "⚠️ RENVERSE EN PARTIE GA-352 : « aucune colonne désignant un individu » (person, contact, email, name…) — la garde dit désormais « aucune colonne d'IDENTIFIANT DIRECT ». Renverse aussi, pour `05_freelances.csv` SEULEMENT, le refus écrit en tête de `market-memory-import.ts` : le fichier d'identités et de coordonnées et les trois fichiers d'agrégats à URL de profil restent dehors.",
    codeState: 'implemented',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/modules/market-memory/market-memory-identifiers.ts',
      'apps/api/src/modules/market-memory/market-memory-identifiers.spec.ts',
      'apps/api/src/modules/market-memory/market-person-paths.ts',
      'apps/api/src/database/entities/market-person-path.entity.ts',
      'apps/api/src/architecture/market-memory-network-paths-stay-anonymous.spec.ts',
    ],
    gap: "Le schéma des colonnes de `05_freelances.csv` n'est documenté nulle part dans le dépôt : l'import lit par alias tolérants (colonnes inconnues ignorées, jamais devinées) — hypothèse à confirmer sur le vrai pack, à lancer par l'opérateur en local. Le pseudonyme est lié à l'identifiant OPAQUE du pack quand il en porte un ; sinon aux identifiants directs présents, hashés en mémoire seulement.",
    nextPack: null,
  },
]

/**
 * Les onze invariants du 24/08 — ce qui ne se négocie pas, quel que soit le
 * paquet qu'on est en train de lire.
 *
 * Ils sont plus courts que les doctrines et plus forts : une doctrine arbitre
 * entre deux formulations, un invariant refuse. Le champ qui compte est
 * `holders` — c'est en le remplissant qu'on découvre qu'un invariant sur onze
 * n'est porté par aucun fichier du dépôt.
 */
export const INVARIANT_KEYS = [
  'unknown_is_not_zero',
  'prior_is_not_fact',
  'no_success_without_outcome',
  'laura_does_not_replace_copilot',
  'project_is_the_pivot',
  'sector_belongs_to_the_work',
  'portfolio_drives_the_lens',
  'stops_at_invoice_readiness',
  'no_unauthorised_network_automation',
  'connected_is_not_verified',
  'beta_feedback_is_not_reusable',
  // ───────────────────────────────────────────────────────────────────────────
  // Écrit le 16/09/2026 — GA-08 : en FIN de liste, jamais au milieu.
  //
  // Le douzième est né d'une contradiction MESURÉE sur l'écran d'entrée de la
  // démonstration publique : sept lignes plus haut le produit disait la vérité
  // (« de VRAIES entreprises, construites à partir d'informations publiques »),
  // sept lignes plus bas il la démentait (« Aucune donnée réelle »), et entre
  // les deux il promettait une sortie « en septembre » — le jour où la mesure a
  // été faite, on ÉTAIT le 16 septembre. La phrase n'avait pas été cassée : elle
  // avait vieilli.
  // ───────────────────────────────────────────────────────────────────────────
  'dated_promise_is_not_a_string',
] as const
export const invariantKeySchema = z.enum(INVARIANT_KEYS)
export type InvariantKey = (typeof INVARIANT_KEYS)[number]

export const invariantSchema = z.object({
  key: invariantKeySchema,
  /** L'invariant, à la forme où on le cite pour refuser quelque chose. */
  statement: z.string().min(1),
  enforcement: doctrineEnforcementSchema,
  /** Comme pour les doctrines : chemins relatifs, vérifiés sur le disque. */
  holders: z.array(z.string().min(1)),
  gap: z.string().min(1).nullable(),
  nextPack: iterationPackSchema.nullable(),
})
export type Invariant = z.infer<typeof invariantSchema>

export const INVARIANTS: readonly Invariant[] = [
  {
    key: 'unknown_is_not_zero',
    statement: "Une valeur absente ne vaut jamais zéro, et ne s'affiche jamais « 0 ».",
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/measurability.ts',
      'apps/web/src/architecture/display-primitives.test.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    key: 'prior_is_not_fact',
    statement: "Une hypothèse DATAFORGE n'est jamais présentée à l'utilisateur comme un fait.",
    enforcement: 'guarded',
    holders: ['apps/api/src/architecture/dataforge-priors-stay-internal.spec.ts'],
    gap: null,
    nextPack: null,
  },
  {
    key: 'no_success_without_outcome',
    statement: "Une action externe n'est réussie qu'avec un résultat VÉRIFIÉ ; un délai dépassé reste inconnu.",
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/dispatch-failure.ts',
      'packages/contracts/src/schemas/dispatch-failure.test.ts',
      'packages/contracts/src/schemas/workflow-outcomes.test.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    key: 'laura_does_not_replace_copilot',
    statement: "Laura est une couche globale d'assistance ; elle ne supprime pas la surface conversationnelle dédiée.",
    enforcement: 'guarded',
    holders: ['apps/web/src/components/navigation/sections.ts', 'apps/web/src/components/navigation/sections.test.ts'],
    gap: null,
    nextPack: null,
  },
  {
    key: 'project_is_the_pivot',
    statement:
      "`Project` est l'objet pivot ; les anciens besoins et opportunités restent compatibles sans piloter la narration.",
    enforcement: 'held',
    holders: ['packages/contracts/src/schemas/project.ts'],
    gap: "Aucune garde : reconnaître un « quatrième objet d'opportunité » dans une migration demanderait de deviner une intention.",
    nextPack: null,
  },
  {
    key: 'sector_belongs_to_the_work',
    statement: 'Le secteur opérationnel appartient au Projet et à la Mission, pas seulement au compte.',
    enforcement: 'guarded',
    holders: [
      'apps/api/src/database/entities/project.entity.ts',
      'apps/api/src/modules/consultants/matching/sector-axis.spec.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    key: 'portfolio_drives_the_lens',
    statement: "Le scoring, les contacts, les sources et le vocabulaire dépendent du portefeuille d'offre du vendeur.",
    enforcement: 'unenforced',
    holders: ['apps/ia/app/services/domain_focus.py', 'apps/ia/app/services/discover_scoring.py'],
    gap: "Seuls les PROMPTS suivent la lentille. Le scoring garde ses vingt points fixes, les sources ne sont pas dé-silotées, et le vocabulaire de l'interface est statique.",
    nextPack: '06',
  },
  {
    key: 'stops_at_invoice_readiness',
    statement:
      "Bellum s'arrête à la préparation de la facturation tant qu'il ne possède pas la génération légale et comptable.",
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/invoice-readiness.test.ts',
      'packages/contracts/src/schemas/flow-registry.test.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    key: 'no_unauthorised_network_automation',
    statement: "Aucun scraping ni automatisation non autorisée d'un réseau professionnel.",
    enforcement: 'held',
    holders: ['apps/api/src/modules/linkedin/linkedin.service.ts'],
    gap: "Tenu par l'absence de client HTTP vers le réseau. Une garde serait verte sur du vide.",
    nextPack: null,
  },
  {
    key: 'connected_is_not_verified',
    statement:
      "Une intégration connectée n'est ni lue ni écrite avec certitude tant qu'une lecture réelle ne l'a pas prouvé.",
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/tool-registry.ts',
      'packages/contracts/src/schemas/tool-registry.test.ts',
      'packages/contracts/src/schemas/connector-error.ts',
    ],
    gap: null,
    nextPack: null,
  },
  {
    key: 'beta_feedback_is_not_reusable',
    statement:
      "Le retour d'un bêta testeur ne se réutilise pas tel quel chez un concurrent ; seule une généralisation anonymisée peut nourrir le produit.",
    enforcement: 'guarded',
    holders: [
      'packages/contracts/src/schemas/feedback-reuse.ts',
      'packages/contracts/src/schemas/feedback-reuse.test.ts',
      'apps/api/src/architecture/feedback-reuse-scope.spec.ts',
      'apps/api/src/migrations/1790170000002-FeedbackRowReuseScope.ts',
    ],
    gap: "Le texte libre d'un retour ne franchit AUCUNE frontière d'espace, et la portée est portée par la LIGNE (`reuse_scope`, défaut `tenant_private`) plutôt que par le seul réglage d'espace — qui dirait ce qui est autorisé aujourd'hui, pas le jour où le retour a été donné. ⚠️ Ce que la garde ne peut pas voir : une lecture par repository TypeORM, dont le `where` est un objet. Elle lit le SQL brut, là où la faute est la plus facile à commettre — même limite, écrite, que GA-46.",
    nextPack: null,
  },
  {
    key: 'dated_promise_is_not_a_string',
    statement:
      "Une date de calendrier ne s'écrit jamais en dur dans un libellé d'interface : elle devient fausse sans que personne n'ait touché au code, et elle doit être re-traduite dans chaque langue à chaque glissement.",
    enforcement: 'guarded',
    holders: ['apps/web/src/i18n/no-dated-promises.test.ts'],
    gap: "La garde ne lit QUE les fichiers de `apps/web/src/i18n/locales`. Le site public (`apps/website`) et les gabarits d'e-mail de l'API portent leurs propres textes et ne sont pas couverts — c'est écrit plutôt que supposé. Elle ne voit pas non plus une date écrite en CHIFFRES (« 15/10 », « Q4 ») : le motif reconnaît un nom de mois précédé d'une préposition de temps, parce que c'est la forme qu'a prise la faute et la seule qu'on puisse séparer d'une date de changelog sans deviner.",
    nextPack: null,
  },
]

/** Ce que le registre ne promet pas : les doctrines dont la règle n'est pas
 *  entièrement appliquée, ou que rien ne tient. Sert la relecture honnête
 *  autant que la garde. */
export function doctrineGaps(): { key: DoctrineKey; codeState: DoctrineCodeState; gap: string }[] {
  return DOCTRINE_REGISTRY.filter(
    entry => (entry.codeState !== 'implemented' || entry.enforcement === 'unenforced') && entry.gap,
  ).map(entry => ({ key: entry.key, codeState: entry.codeState, gap: entry.gap as string }))
}

/** Les doctrines qu'une archive donnée doit encore traiter. C'est la question
 *  qu'on se pose en ouvrant le paquet suivant. */
export function doctrinesForPack(pack: (typeof ITERATION_PACKS)[number]): DoctrineEntry[] {
  return DOCTRINE_REGISTRY.filter(entry => entry.nextPack === pack)
}

/** Tous les chemins déclarés, doctrines et invariants confondus. C'est ce que
 *  la garde ouvre un par un. */
export function declaredHolders(): string[] {
  const all = [...DOCTRINE_REGISTRY.flatMap(entry => entry.holders), ...INVARIANTS.flatMap(inv => inv.holders)]
  return [...new Set(all)].sort()
}
