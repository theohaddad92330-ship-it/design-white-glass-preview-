# Brief commun — lots écrans Théo V22 (r22-ecran-\*) — 22/10/2026

Lu par chaque écrivain cloud AVANT de coder. Toutes les décisions ci-dessous sont TRANCHÉES par Louis : ne pas les rediscuter, ne pas les remonter en question.

## Le geste

Reproduire en code (apps/web, + API/IA/démo si la page l'exige) la PAGE APPLIQUÉE de chaque écran du lot.

- Source de la page appliquée, dans l'ordre : `origin/claude/theo-hors-theo-amendees` (si le fichier y existe), sinon `origin/claude/theo-<lot>-appliquees` (a1 a2 c1 c2 c3 c4 d1 d2) ou `origin/claude/theo-b-appliquees-{contacts,laura}` (domaine B). Chemin `docs/maquettes/theo-v22/_appliquees/<a|b|c|d>/<page>.html`. Lire par `git show … > $TMPDIR/x.html` puis python (jamais cat, jamais ajouté au dépôt).
- L'interrupteur « Théo / appliquée » et les annotations de la page (bandeaux d'ajout, « Points à discuter ») ne sont PAS du produit : on code le rendu appliqué.
- Liste des écarts point par point : `origin/claude/theo-v22-ecarts-<a|b|c|d>:docs/maquettes/theo-v22/_ecarts/*.md`, section de l'écran : Liste 1 REDESSIN, Liste 2 FEATURES NEUVES, Liste 3 ABSENTES (= on GARDE, à la place que montre la page appliquée ; jamais de suppression silencieuse).
- Le design system de Théo est DÉJÀ dans la base (`claude/theo-b-base`) : jetons, composants. Les réutiliser, ne pas en recréer.
- `git grep` d'abord : un point déjà là = « déjà là » dans le rapport, pas recodé.

## Doctrine (CLAUDE.md racine, rappel)

Tutoiement · e-mails/téléphones/noms en clair · une absence n'est jamais « 0 » ni « 00 » · corps d'un mail jamais stocké · nos fournisseurs jamais nommés (nommer la capacité ; garde no-vendor-names, changelog compris) · aucune donnée fictive hors démo · toute feature user-facing semée en démo (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`) · démo = NOS vrais comptes (SG, SNCF, Orange, Airbus, EDF, Renault, Thales…), pas le monde fictif de Théo · Laura partout (Nora/Hugo = Laura) · crédits jamais affichés à l'utilisateur (#4468, frein doux sans chiffre) · plancher 12 px, aucune couleur hexa dans le JSX, mobile = contenu replié sous le contenu, jamais caché, borne 768 px, `dvh` · cibles ≥ 44 px · imports nommés.
Une valeur qui voyage vers la base : contrainte SQL élargie AVANT le code (GA-11/12) ; migration à horodatage RÉEL > max(main). Migration de statuts = correspondance écrite, rien perdu (on archive, on ne supprime pas).

## Choix produit tranchés (QCM Louis 22/10)

- Q1 badge « Décideur » : affiché dans les listes (contacts, chemin d'accès), décision 13/10.
- Q2 réponse d'absence : réglage dans le tiroir Outlook ET Gmail (Réglages › Intégrations).
- Q3 droits Équipe : TOUT MEMBRE lit la journée, l'historique de recherches et les intégrations d'un collègue — JAMAIS la messagerie. Invitation suffit pour rejoindre (pas de file de demandes).
- Q4 cibles par personne : Théo exact (responsable par ligne + objectifs chiffrés par commercial) ; « les 7 axes » NON codés tant que non définis ; la ligne « a consulté » n'est pas retenue.
- Q5 Pilotage › Pipe : CHACUN SON PIPE — un commercial ne voit que ses affaires ; manager/admin voient l'équipe.
- Q6 veille territoriale : filtre + pastille dans Signaux/Découvrir, aucun écran neuf.
- Q7 « Pistes de Laura » : GARDÉES, en tiroir dans le pipeline Affaires.
- Q8 propositions / appels d'offres : Affaires › Présentations (Studio de propositions fondu).
- Q9 catégorie de prévision : déclarée par le commercial, SANS chiffre, sur la fiche affaire.
- Q10 besoins : 3 statuts de Théo (À qualifier · Ouvert · Couvert) + les autres en étiquettes ; migration 8→3 avec correspondance.
- Q11 pas de mesure d'ouverture des e-mails → la phrase qui s'en sert est retirée.
- Q12 essai à blanc permis sur une séquence active (lecture seule).
- Q13 tuile « Facturé » = prouvé par le connecteur ; le déclaré est nommé dessous (c80).
- Q14 score consultant /100 en clair avec axes ; santé de mission en constats d'abord.
- Q15 marché externe replié gardé (Talents › comptes).
- Q16 CV lu = fiche qualifiée automatiquement (12/10).
- **PLANS D'ACTION — PAR COMPTE ET PAR CONTACT, GARDÉS EN ENTIER (Louis 22/10 ~15 h 35)** : fiche compte › Plan = la grammaire de Théo (« Une prochaine étape… », compteurs, tâches type/échéance/responsable/« Préparer », Messages préparés, Consigner un résultat, Demander une validation) PLUS tout le contenu actuel : angles d'attaque, trajectoires, sections du plan de Laura (`TabPlan.tsx`, `ActionPlanBoard.tsx`, `PlanSections.tsx`), édition par le formulaire générique (c75). Fiche contact = carte « Plan d'action » du contact (`ContactPlanBlock.tsx`) visible sur la fiche, PLUS « Ajouter au plan » dans le menu « Contacter ». Les tâches restent partagées avec Actions et Ma journée.
- **ORGANIGRAMME — CARTE PERSONNE ENRICHIE (Louis 22/10 ~15 h 35, capture fiche compte › organisation)** : chaque carte personne ajoute (1) les coordonnées en un coup d'œil — icônes e-mail / téléphone : en clair au survol ou au clic (coordonnées toujours en clair, jamais masquées), « disponible » / « Enrichir » selon la règle COORDONNÉES ci-dessus ; (2) l'entité du groupe (Société Générale SA, Boursorama…), le rôle dans la décision (Décision, Sponsor opérationnel, Achats, Influence, Référent…) et la date de vérification du poste. Badge Décideur gardé. Pas de pastille de relation ni de lien profil sur la carte (non retenus).
- **COORDONNÉES : DISPONIBILITÉ + ENRICHIR (Louis 22/10 ~15 h 25, capture fiche compte › interlocuteurs)** — dans TOUTE liste ou fiche de contacts (fiche compte › interlocuteurs, répertoire Contacts, fiche contact, chemin d'accès, Découvrir › personnes), colonne/zone « Coordonnées », par champ (e-mail, téléphone) :
  - connu → affiché EN CLAIR (inchangé) ;
  - absent mais la source annonce qu'il existe → « E-mail disponible » / « Tél. disponible » + clic = enrichissement CIBLÉ de ce champ pour ce contact ;
  - absent, jamais cherché → « Chercher l'e-mail » / « Chercher le tél. » (même geste) ;
  - déjà cherché sans résultat → « Introuvable · <date> » ;
  - ni e-mail ni téléphone → le bouton de ligne « Contacter » devient « Enrichir » (enrichissement ciblé du contact) ; aussi en action de lot sur la sélection.
    Back (lots a4 + b-c1) : à la recherche/enrichissement des contacts, conserver la DISPONIBILITÉ annoncée par la source (`email_availability` / `phone_availability` : available | unknown | not_found + date de dernière recherche), migration à horodatage réel, contrainte SQL élargie avant le code ; exposer dans les réponses contacts. Réutiliser la cascade existante (`apps/api/src/modules/contacts/enrichment-providers.ts`, `query.only = 'email' | 'phone'`). Aucun coût ni crédit affiché (#4468). Démo : des contacts dans chacun des 4 états. Aucune source nommée.
- **SOURCES CLIQUABLES, VISIBLES DIRECTEMENT (Louis 22/10 ~14 h 50, précisé ~15 h 20 sur captures Découvrir + fiche compte)** : partout où un signal, une information, une offre d'emploi, une levée, un article, une nomination ou un fait collecté s'affiche — **Découvrir (chaque ligne de compte : la ligne-signal sous le titre, ex. « Projet annoncé · besoin à qualifier », « Quatre postes salariés publiés »), fiche compte (« Les sujets qui font bouger le compte » : chaque carte), Signaux (chaque carte), Aujourd'hui, Laura, Talents, Affaires** — le LIEN vers la page d'origine (l'offre, l'article, le communiqué, la publication officielle, la page carrière) est VISIBLE SUR LA LIGNE OU LA CARTE ELLE-MÊME, sans ouvrir de détail : nom du site d'origine + icône lien externe (↗), nouvel onglet (`target=_blank rel=noopener noreferrer`), cible ≥ 44 px, nom accessible (« Ouvrir la source : <site> »). Plusieurs sources = la plus récente visible + « +N sources » qui les liste. Le clic sur la source n'ouvre PAS le détail (propagation arrêtée). Le lien pointe vers l'éditeur de l'information, JAMAIS vers notre fournisseur intermédiaire. Pas d'URL connue = pas de lien, rien d'inventé ; la date de publication à côté quand on l'a. Si l'API ne renvoie pas l'URL de la source pour un écran, l'ajouter côté API (le champ existe souvent en base : `git grep -n "source_url\|sourceUrl"`). Démo : chaque signal semé porte une vraie URL publique plausible de l'éditeur (jamais un domaine inventé) ou aucune.

## RIEN NE SE PERD — tranché par Louis 22/10 ~15 h (prime sur la « Mise en page » plus bas)

Règle : tout ce qui s'affiche aujourd'hui reste accessible. Les éléments « ABSENTES CHEZ THÉO » (liste 3) sont TOUS gardés ; le rapport du lot les COMPTE par écran (« liste 3 : N/N gardés ») — un manque = lot non fini.

- Score du dossier + ses 7 axes (fiche compte) : GARDÉ en un clic (modale depuis « Le regard de Laura »). « Commencer ici » : « Pourquoi celle-ci ? » ouvre la raison du rang et les axes.
- Board des missions (12 colonnes) : RETIRÉ.
- Aujourd'hui : « Mon activité » (pipe, CA, marge, capacité) en ligne repliable, EN PLUS de Pilotage. Les 4 tuiles de Théo remplacent les anciennes.
- Comptes : « Sans prochaine action » et « Nouveaux signaux 7 j » = filtres cliquables sous les tuiles. Marchés locaux + sociétés de services reliées = vues secondaires de Découvrir.
- Séquences : chiffres (actives · dues aujourd'hui · réponses · bloquées) sur une ligne discrète ; encart « c'est quoi » retiré.
- Affaires : « sans prochaine action » et « à qualifier » = filtres cliquables.
- Présentations : 4 états de Théo à l'écran ; sous-statut détaillé et motif de refus/clôture gardés dans le détail d'une présentation.
- Vivier : disponibles maintenant · profils enrichis · fiches sous le seuil · favoris = filtres cliquables.
- Fiche talent, notes : épingler gardé, portée dans « … ».
- Rôles 7 → 5 profils : migration avec correspondance écrite, personne ne perd un droit.
- Réglages › Laura, mémoire : les thèmes (comment Laura te répond, ton approche, ton temps protégé, agenda, ce qu'elle ne mémorise jamais, tout oublier) restent des sections de la liste.
- Préférences : barre de matching GARDÉE.
- Suivi de comptes : plafond 5 PAR UTILISATEUR (remplace 3, #4267) — `ACCOUNT_FOLLOW_MAX_PER_USER` ; l'écran dit « n/5 suivis ». (« 13/30 » de Théo NON retenu.)
- Veilles à cadence : chaque passage RELIT sans achat ce que la collecte gratuite/commune a déjà ramené (décision 18/10, veille sans achat) ; la cadence règle la fréquence des alertes, jamais un appel payant.

## Onboarding V23 + pages hors Théo — tranché par Louis 22/10 ~15 h 45

- Onboarding : pages `origin/claude/theo-onboarding-appliquees:docs/maquettes/theo-v22/_appliquees/o/*.html` (accueil, essentiel, guide, catalogue, theme, relecture, lancement) + `o/onboarding-couverture.md` (230 clés : 194 gardées, 8 renommées, 26 nouvelles V23, 2 absentes). La V23 de Théo est LA référence.
- UNE SEULE MARCHE : le parcours guidé COMMENCE par les 5 essentiels puis enchaîne (pas d'écran « essentiel » séparé) ; l'espace est utilisable dès les 5 essentiels remplis, « Plus tard » pour le reste.
- `workspace_profile` (#4270.1) RÉINTÉGRÉE dans le parcours guidé (elle règle la navigation) ; `placed_roles` dans son thème du catalogue. Rien de notre catalogue ne disparaît : une clé renommée garde les réponses déjà données (correspondance écrite).
- Plan/paiement APRÈS l'onboarding (Réglages › Facturation) ; audit IA gardé dans « Ce que Laura a compris » ; maturité détaillée → lien Réglages › Profil ; zone unique « Dépose tes documents » (import toujours vérifié avant). Aucun profil fictif écrit dans le cadrage (« Un exemple » de Théo retiré). Tutoiement, « Directeur·rice d'agence ».
- Proposition commerciale : UNE par AFFAIRE, portée par la fiche affaire ; chaque présentation y renvoie (pas de copie).
- Dossier mission : prérequis de démarrage (accès, badge, matériel) FONDUS dans « Ce qui bloque le démarrage » — une seule liste à cocher en tête.
- Factor : le nom du factor de l'ESN est celui du contrat du CLIENT (donnée de son espace), affiché tel quel ; à défaut « ton factor ».

## Décisions Louis 22/10 — maquettes (verbatim)

## Maquettes Théo V22 — domaine B (Contacts · Laura · Messagerie · Recherche), QCM 22/10 ~11 h 30

Source : `origin/claude/theo-v22-ecarts-b:docs/maquettes/theo-v22/_ecarts/b-contacts-laura-messagerie-recherche.md` (133 absentes).

- ENVOI (C1.A12, C6.A1, M1.A4, M2.A1, D-5) : TOUT GARDER — envoi sur clic, envoi en lot, « Déposer dans ma boîte », rangés sous « Valider le brouillon ».
- RETIRER : Kanban des contacts (C1.A7) ; mode Découvrir intégré à /search (R1.A14, renvoi vers Découvrir) ; canaux SMS / WhatsApp / message vocal (C5.A24, C6.A15, C7.A3 vocal).
- GARDER : réponse d'absence (M1.A8) → réglage dans Intégrations.
- STATUT CONTACT (C5.A3) : les deux — badge dérivé de Théo + clic pour déclarer ; la déclaration humaine gagne.
- RESTE (~120 points) VALIDÉ EN BLOC à la place proposée par le fichier ; défauts : Mes listes avec sélecteur Contacts/Comptes (C2.A1), historique des analyses d'ESPACE filtrable « moi » (R2.A5), import long en arrière-plan gardé (C4.A5).
- Doctrine (non discutée) : tutoiement partout (D-1), coordonnées en clair (D-2), jamais « 00 » (D-3), corps de mail lu en direct jamais stocké (D-4), bandeaux « aperçu local » de prototype non portés (D-8).
- PRÉPARATION D'ANALYSE (/search, R1/R2) — Louis 22/10 : « y a moins de paramètres chez Théo, tu les remettras ». TOUS les réglages actuels de cadrage sont REMIS dans l'écran de Théo, aucun ne disparaît : entités à cibler / à exclure, thèmes à exclure, priorités de vente, niveau de contact (R1.A4) ; zone précise Monde→ville (R1.A5) ; homonymes groupe/entité (R1.A6) ; modèles de contexte (R1.A8) et exemples d'angle (R1.A9) ; coût en crédits + ce qui est inclus (R1.A2, R2.A1) ; ce que Bellum sait déjà (R1.A3) ; plan de relance conservé/refait/jamais écrasé (R1.A7, R2.A3) ; durée estimée (R2.A2) ; résultat attendu par mode (R2.A4) ; onglets Entreprise/Contact/Besoin (R1.A1). Le lot écran Recherche le vérifie point par point (brief : « aucun paramètre de /search actuel absent »).

## Maquettes Théo V22 — QCM A/D (22/10 ~12 h 15)

- Signaux : /signals = bibliothèque d'informations par compte de Théo ; listes de cibles → Comptes ; « Ce qui bouge » alimente la bibliothèque.
- Démo : on garde NOS vrais comptes (SG, SNCF, Orange, Airbus, EDF, Renault, Thales…) ; on applique les ÉCRANS de Théo, pas son monde fictif.
- Statuts de relation : les 3 de Théo (Client · En ouverture · À ouvrir) affichés ; Hors priorité / En veille en filtre/état secondaire ; migration 7→3 avec correspondance, rien perdu.
- Score : « Intérêt commercial » /100 de Théo dans la colonne + axes et non-évaluables en un geste (modale) — doctrine « jamais nu » tenue.
- Tableau de bord /dashboard : RETIRÉ (Théo exact) — redirection.
- Découvrir : écran Théo ; comparables/détectées = pistes/filtres, analyse en lot = action de sélection, autopilote = réglage.
- Pilotage : page Théo unique + Cockpit/Pipe/Staffing/Finance en sections ancrées ; anciennes routes y pointent.

## Maquettes Théo V22 — QCM C/D (22/10 ~12 h 20) — ⚠️ TROIS RENVERSEMENTS DATÉS

- Factures : écran de Théo pour la facture PRÉPARÉE (lignes, TVA, TTC) ; pas de numéro légal ni d'avoir dans Bellum — ils viennent de l'outil branché. Doctrine #2564 tenue.
- Actions : 3 onglets de Théo (À traiter · Séquences · Automatisations). ⚠️ RENVERSE c122 (19/10) côté navigation ; moteur commun gardé (automatisation = séquence déclenchée par signal).
- Séquences : VRAIE audience multi-contacts. ⚠️ RENVERSE c74 (21/09, `campaign_label` mono-contact) — à dater dans doctrine.md + doctrine-registry (GA-38).
- Nora/Hugo → tout est Laura (D82 tenu).
- Facture « Partielle · en retard » : libellé de Théo TEL QUEL. ⚠️ RENVERSE c72 « aucun cinquième statut » côté LIBELLÉ (statut stocké : à décider au lot — garder les 4 statuts en base + libellé dérivé est la lecture la moins destructrice).
- Étapes d'affaire : 5 de Théo en colonnes + Perdue / En sommeil en sorties (hors Kanban, filtrables) ; migration 9→5 avec correspondance ; REX de perte gardés.
- Par personne : TOUT Théo (responsable par ligne + chiffres par commercial), seule la ligne « a consulté » n'est PAS retenue (option choisie : « Tout Théo » = responsables + objectifs chiffrés par commercial, « a consulté » retiré).
- Intégrations : tous nos connecteurs visibles dans la grille de Théo.
- 12 h 25 : Plan/paiement → après l'onboarding, Réglages › Facturation. Audit IA gardé, rendu dans « Ce que Laura a compris », maturité détaillée → Réglages › Profil. Vocabulaire : Affaires / Talents partout (routes /talents, redirection /consultants). Pages hors Théo (ADV, Paiements, Cessions, Suivi mission, Notes de frais, Studio propositions, Reverse market, fiche Besoin) : À DISCUTER PAGE PAR PAGE en HTML.

## Maquettes Théo — pages B appliquées (Louis 22/10 ~12 h 35, QCM)

- Import : TOUJOURS vérifier avant d'importer, quelle que soit la taille (pas de parcours « import long » qui saute la vérification). L'import en arrière-plan reste possible APRÈS la vérification (échantillon / contrôle avant « Importer »).
- Recherche : DEUX profondeurs seulement, Rapide = 5 crédits, Approfondie = 10 crédits (DÉJÀ le barème en prod : `packages/contracts/src/billing/credit-weights.ts:44-49`, 8 × 0,625 / 8 × 1,25). PAS de « Ciblée » (R1.N3 retiré). Aucun changement de facturation : l'écran affiche ces deux paliers et leur coût.
- Messagerie « À venir » : AJOUTER l'envoi PROGRAMMÉ (un brouillon validé part seul à l'heure choisie). Capacité neuve, lot `conception` : file BullMQ, reprise, `unknown` arrête la reprise, preuve d'envoi relue dans les éléments envoyés, annulation avant départ. Doctrine « le copilote n'envoie jamais » : c'est le commercial qui valide ET programme — à écrire dans doctrine.md comme précision datée.
- Laura : tout garder (présence, mention, partage, dictée, conversation vocale), rangé : Exemples + Mentionner dans « + », micro à la place d'Envoyer champ vide ; enregistrement vocal NON conservé, seule la transcription reste.
- Le reste des « Points à discuter » (≈ 45, mise en page) : tranché par le coordinateur selon les alternatives les plus sobres + mobile replié sous le contenu (jamais caché).
- Laura « Dossier ciblé » (Louis 22/10, capture L1) : SÉLECTEUR AVANCÉ — partir d'un compte, contact, consultant/talent, besoin, offre, mission, affaire… au choix (onglets par type + recherche), pas un simple menu « Sans dossier ciblé ». Le back sait déjà 6 portées (`apps/web/src/features/chat/scope/chat-scope.ts:61` : account, consultant, need, mission, contact, opportunity) → l'écran de Théo doit les exposer TOUTES ; « offre » = OFFRE D'EMPLOI (signal de recrutement chez un compte) — Louis 22/10 ; nouvelle portée `job_offer` (Laura part de l'offre ET de son compte).
- Équipe /team (Louis 22/10 ~12 h 50, QCM) : THÉO EXACT pour les 8 écrans (vue, business, plans, membre, recherches, activité, revue, admin). ⚠️ RENVERSE la consigne du 14/10 « /team refondu par Louis, ne pas toucher ManagerDashboardPage » (mémoire team-refondu-par-louis-14-10) — sa refonte n'est plus la référence.

## Pages hors Théo — page par page (Louis 22/10 ~12 h 55, QCM, 8/8 recommandations retenues)

- ADV (/missions/adv) → FONDUE dans Dossier mission : bloc « Ce qui bloque le démarrage » en tête + filtre « Bloquées » dans le planning.
- Paiements (/missions/paiements) → FONDUE dans Encaissements de Théo (le surplus remis, entouré).
- Cessions / affacturage (/missions/cessions) → section « Cessions » de Missions › Finance + badge « cédée » sur la facture.
- Suivi mission (/missions/suivi) → RÉPARTI : état du cycle dans Dossier mission, automatismes dans Actions › Automatisations ; page retirée + redirection.
- Notes de frais (/expenses) → onglet « Notes de frais » sous Missions (à côté de CRA, Factures), grammaire Théo ; barème kilométrique → Réglages.
- Studio de propositions → FONDU dans Affaires › Présentations (détail d'une présentation, ouvert depuis la fiche affaire).
- Marché inversé → Rapprochement dans LES DEUX SENS (interrupteur Besoin → consultants / Consultant → besoins) + bouton depuis la fiche talent ; réglage de capacité → Réglages › Espace.
- Fiche Besoin (/projects/needs/:id) → fiche dessinée dans la grammaire de la fiche affaire de Théo, ouverte depuis la liste des besoins.

## Mise en page — tranché sobre, page par page (règle : alternative la plus sobre, mobile = replier sous le contenu)

- a1/comptes-fiche-reference · archive figée, copie de travail hérite des notes ; badge d'intérêt, recherche, Exporter repris seulement ; 12 cartes puis « Voir les suivantes » (pas de vue tableau).
- a1/comptes-fiche · Intérêt = 5e compteur ouvrable ; bande de collaboration rangée dans « … » (responsable seul dans l'identité) ; lectures de stratégie en un seul repli « Pour aller plus loin » ; un seul bandeau d'état, collecte Contacts annoncée dans Contacts ; badge Décideur affiché partout où il est prévu ; « … » en deux groupes « Le compte » / « Le dossier ».
- a1/comptes-import · bascule Une/Plusieurs entreprises dans l'étape 1 ; homonymes sous la recherche ; import contacts/cibles = même modale avec choix ; crédits annoncés au pied ; fichier d'exemple nommé sans « fictif ».
- a1/comptes-liste · 3 statuts + état secondaire filtrable (mapping des 7 statuts actuels : à vérifier au code) ; /100 nu avec axes en modale (sans « 5/6 axes ») ; pas de ligne pour une prochaine action absente ; Listes de cibles en sous-entrée de Comptes ; un seul badge par ligne (doublon > référence > CRM) ; marchés locaux hors écran.
- a1/today-agenda · reprogrammer via modale (pas de glisser) ; hachures/pointillé gardés, à montrer à Théo ; jour vide = titre seul ; étiquettes de carte : une seule pastille « n points » ; menu des agendas à côté de « Ajouter ».
- a1/today-equipe · onglet visible avec état vide en espace solo ; « Journée de… » en boutons jusqu'à 3, menu au-delà ; double navigation gardée ; « Lire comme » remplacé par liens ; libellés prototype retirés, tutoiement.
- a1/today-jour · six tuiles remplacées par carte « Ailleurs » (Messagerie, Signaux) ; Décisions + gestes de suivi en une carte à deux vues ; risques critiques : compteur sur l'onglet, pas dans « Commencer ici » ; « Lire comme »/ordre dans « … » du brief ; bandeau d'analyse seulement pendant l'analyse, Modes rapides repliés ; « Faire avancer cette action » ouvre le tiroir de l'action.
- a2/decouvrir-historique · « Enregistrées » sous « Recherches récentes » ; cadence uniquement dans Mes veilles ; bloc listes retiré, lien « Ouvrir dans Comptes » ; recherche partagée visible sans suppression ; verrou d'offre à la place du bloc ; mentions prototype et « sauvegarde locale » retirées ; états vides gardés.
- a2/decouvrir · barre de sélection : Analyser en primaire, le reste dans « … » ; 4 pistes (2 colonnes < 1100 px, 1 < 768) ; adéquation delivery dans le tiroir sous le périmètre ; autopilote dans le panneau contexte de Découvrir, Paramètres y renvoie ; un seul repli d'avis qualité ; radar par technologie dans le sélecteur de vue ; signaux forts seuls sur la ligne ; 12 par page ; recherche de personne en suggestions typées.
- a2/signaux-veilles · quatre onglets ; cadences uniquement ici ; libellé « À connecter » dit quoi brancher ; canal dans la modale ; limite 13/30 affichée et « Suivre » propose de retirer ; mentions prototype retirées, tutoiement.
- a2/signaux · action seulement dans « … » et la lecture (pas de ligne d'action sur la carte) ; besoin probable seulement si identifié ; interrupteur Liste/Par compte ; origines CRM, alertes, veille en filtre + pastille ; relire un compte (crédit) dans la lecture ; suivre dans la lecture et « … ».
- c1/actions-aujourdhui · un seul « Traiter (9) » dont le premier écran est le lot d'envois ; envoi programmé gardé (Europe/Paris, annulable) ; tri par échéance en second ordre, « Seulement en retard » ; source en sous-titre ; responsable par ligne et filtre Responsable gardés ; modale : un seul bouton « Plus ».
- c1/automations-bibliotheque · fonctionnement en deux onglets « Comment ça marche » / « Réglages » ; « Lancer celles qui sont dues » retiré de l'écran (reste à Laura) ; journal semé en démo ; une fiche par routine ; textes prototype retirés ; autonomie renvoie à Réglages › Laura ; « Talents & staffing ».
- c1/automations-editeur · deux maillons « Laura » fusionnés en « Laura repère et prépare » ; panneau Régler en trois groupes Quand/Quoi/Combien ; v2 activable après test ; pastilles origine/coût ; Nora/Hugo = Laura ; textes prototype retirés.
- c1/automations-liste · carte : mesure seulement, coût dans « Régler » ; interrupteur Active/Éteinte ; pastille + filtre d'origine ; 3e carte séquence sur signal ; « Lancer celles qui sont dues » et modèles fusionnés dans la Bibliothèque ; textes prototype retirés.
- c1/sequences-assistant · « Quand démarrer » = lien vers l'éditeur d'automatisation (pas d'interrupteur dans l'assistant) ; import en bouton, exclusions en bandeau, plafonds repliés ; canal par étape ; actions d'étape dans un menu « ⋯ » ; « Seulement une action préparée » retiré de l'assistant (reste dans À traiter) ; textes prototype retirés.
- c1/sequences-bibliotheque · section « importées » masquée quand vide ; « Importer » dans le menu de « Créer mon modèle » ; badge de partage seulement sur partagés/personnels ; Archiver discret, seulement modèles équipe/personnels ; archiver, jamais supprimer ; plancher 12 px, tutoiement UI et vous dans les modèles.
- c1/sequences-detail · colonne de droite : délivrabilité en une ligne (détail dans Pilotage) ; pastilles par étape/contact ; Pause visible, reste dans « ⋯ », Arrêter confirmé ; « Modifier la séquence » ; essai à blanc (voir choix 12).
- c1/sequences-liste · un seul emplacement de bandeau (vacances > Laura) ; mode vacances dans Réglages › Laura ; onze états dans le filtre, un badge par ligne ; échéance en sous-titre ; renvoi vers Automatisations sous le tableau ; « Créer mon modèle » en menu ; KPI retirés.
- c2/projects-besoins · Kanban sur 3 statuts ; ajout de besoin avec suite dessinée ; tableau défile < 768 px ; Porteur sous le TJM en petit ; périmé = pastille + filtre.
- c2/projects-fiche · Suivi à 6 choix ; Contacts/partenaire replié sous « Ce qui reste à décider » ; Documents dans Activité ; Créer la mission seulement une fois gagnée ; synthèse 7 questions repliée, coût avant clic.
- c2/projects-pipeline · « Vues et filtres » en un seul menu ; pas de zone « Sortir du pipe », clôture depuis la fiche ; « 1 sans montant » nommé ; chiffres par commercial déplacés dans Pilotage ; stagnation en pied de carte ; export CRM en prévisualisation.
- c2/projects-presentations · entonnoir gardé ici, replié < 768 px ; sorties dans filtre et « Mettre à jour » ; conversion en mission = même formulaire que la fiche ; « Préparer l'entretien » seulement à l'étape Entretien client ; retour du consultant interne.
- c2/projects-rapprochement · gestes rares dans « ⋯ » ; zéro profil : trois gestes, le reste dans « Plus » ; « Chez Airbus, déjà » gardé ; relance consultant seulement si « à confirmer » ; ajouts pour l'entrée besoin, profil à suivre plus tard.
- c3/missions-dossier · menu ⋯ à 8 entrées ; niveaux de marge sous Théo, « Non mesurée » jamais 0 % ; points d'attention remplis ; préparation de Laura avant le brouillon ; cadre de mission, prérequis déplacés dans « Équipe & suite ».
- c3/missions-planning · « Plus » provisoire retiré (pages déjà fondues) ; board retiré (doublon avec les échéances) ; intercontrat = 4e carte ; préparation de Laura cochée par défaut à la création ; pastille « ! » + légende pour les conflits.
- c3/missions-preparation · facture préparée jamais émise ; avoir ouvert dans l'outil branché ; « Déclarée émise » distincte, annulable ; facture fournisseur manquante = contrôle de « Résoudre » ; la préparation de rendez-vous reste dans le dossier mission.
- c3/talents-comptes · menu « ⋯ » par compte ; carte consentement sous le classement, sous la liste en mobile ; pas de score nu.
- c3/talents-fiche · Conformité en 5e onglet ; score dans l'en-tête, panneau d'axes sous Expertise (colonne droite non allongée) ; « Avec Laura » en menu ; CV original/extraction côte à côte, empilés en mobile ; R1/R2 dans Activité, R2 après R1 ; marge indicative = pourcentage seul, droit finance.
- c3/talents-recrutement · bouton unique « Préparer l'échange » (R1 ou R2 automatique) ; badge du rendez-vous sur la carte ; durée de conservation dite une fois sous « En veille ».
- c3/talents-vivier · pastille score sous le métier ; « Planning : fin prévue » avec libellé simple ; bandeau « CV lus » seulement si pertinent ; cases à cocher et barre d'actions à la première case ; second sélecteur « Mes vues » ; disponibilités = valeur de « Objets à importer ».
- c4/missions-cra · lignes small dans les cellules ; « Ce qui bloque » en option de tête du menu État ; bandeau de chaîne seulement sur cet écran (Théo exact) ; « — » au lieu de « À contrôler » pour relevé non reçu ; « dont 1 non applicable » ; relances préparées, escalade à la 3e.
- c4/missions-encaissements · pastille sur la ligne + compteur dans le titre (pas de deux alertes en tête) ; « Suivre » porte les relances ; « Marquer réglée » dans ⋯ avec saisie ; « Sans échéance » nommé, tranches mesurées à 0 € gardées ; banque branchée nommée ; carte « Ce qui sort » renvoie à la vue financière ; bandeau d'arrivée depuis compte.
- c4/missions-factures · étape dans la 2e ligne de « Période » (pas de colonne) ; « Partielle · en retard » + reste dû nommé ; pas de numéro avant création ; filtre Avoirs seulement s'il en existe ; pièces jointes en repli.
- c4/missions-finance · sections ajoutées après les achats, cessions repliées ; « CA réalisé » = signé, jamais production validée ; CA probable absent ici ; pastille de droit Finance ; marge à terminaison par renvoi ; semaines vides : « Aucun règlement attendu ».
- d1/pilotage · une page longue avec ancres collantes ; « Ce qui a bougé », « La chaîne », « Détail » repliés ; « Données à compléter » en 4e carte ; puces d'accès par section ; Finance en 4 tuiles + 5 lectures à onglets ; étapes alignées sur les 5 étapes décidées ; CRM nommé car branché ; routes → ancres, REX reste dans Missions ; tutoiement ; textes prototype retirés.
- d1/team-activite · journal de faits métier, garde refusant « vu/consulté » ; lien Journal d'administration dans la barre d'outils ; sujets d'équipe, playbooks, filtre par membre : hors périmètre « Théo exact » sauf filtre Portée ; lignes « consultée » retirées ; thème clair dérivé, plancher 12 px.
- d1/team-admin · gestion des membres ici, Réglages › Équipe ne garde que les règles de partage ; règles d'équipe (plages, objectif d'appels) restent ici, Réglages garde les routines ; « Essayer une autre vue » sans accès messagerie.
- d1/team-business · « Rien de signé » au lieu de 0 € ; ratios et cibles : voir choix 4.
- d1/team-member · tiroir par membre (pas de route) ; garde messagerie = règle d'accès ; intégrations d'un membre : voir choix 3.
- d1/team-plans · glisser-déposer avec confirmation et alternative clavier ; « Préparer » ouvre l'approche du contact, rien ne part ; filtre « Déléguées » avec champ « confié par ».
- d1/team-recherches · « compte analysé » ; coût annoncé avant « Reprendre dans Découvrir » ; historique : voir choix 3.
- d1/team-review · sujets décochés avec la raison de Laura en bandeau (pas de pré-coche) ; mise à jour sans doublon (test back) ; aucun envoi ; un seul « point d'équipe » ; thème clair, plancher 12 px.
- d1/team-vue · Théo exact ; « Journée de Léa » sous garde ; regard de Laura : phrase gabaritée sans coût ; étapes alignées sur les 5 décidées.
- d2/settings-compte · réglage fin dans un repli sous les cinq familles ; SMS réservé à l'urgent, navigateur en 2e ligne ; suppression dans Sécurité › Supprimer mes données ; Confidentialité en bas de Mes données ; « Voir les accès » renvoie vers Équipe › Administration ; textes prototype retirés, tutoiement.
- d2/settings-espace · profil : ordre cadrage, maturité, contexte, zone sensible ; « Ne pas contacter » dans Accès ; onglet Qualité ajouté (Charge et Marché inversé fusionnés si trop d'onglets) ; durées cibles sur les 5 étapes ; « Nom du copilote » retiré (Laura partout) ; textes prototype retirés.
- d2/settings-integrations · grille par familles avec recherche Tous/Branchés au-delà de 25 cartes ; icône de Théo sans logo sous licence ; Facturation/Signature en cartes sans nouveau circuit ; « Ce que Laura lit » en tête ; correction humaine verrouillée ; « Prévisualiser un exemple local » retiré.
- d2/settings-laura · styles appris et exemples dans deux onglets « Documents · Style & exemples » ; catalogue « Ce que Laura peut te proposer » dans Routines ; autonomie en lecture pour un commercial ; détail de routine en tiroir ; « Tout oublier » dans le bloc mémoire ; états d'indexation honnêtes ; coût « Approfondi » annoncé.
- d2/settings-outils · onglets Abonnement · Crédits · Factures & paiement · Rentabilité, titre de page « Facturation » ; calculateur gardé en 4e onglet ; clé d'API jamais réaffichée ; journal réservé aux gestionnaires, entrée masquée sinon ; accès assistants réels d'abord.
- d2/settings-prefs · Laura sur ⌘ J, ⌘ K reste la recherche (Théo) ; Densité et Taille du texte gardées ; « Lecture & saisie » en bloc ; « À propos » déplacé dans Aide & signalements ; enregistrement explicite, thème/densité immédiats ; barre de matching retirée ; tutoriel → Outils › Aide.
