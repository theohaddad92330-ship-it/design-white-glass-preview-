import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-07 — l'indépendance des modules, en cliquet.
 *
 * La règle du dépôt (§3.2) est précise, et c'est elle qu'on mesure ici :
 * « **aucun module n'importe le service d'un autre module** ». Ce n'est pas
 * « aucun module n'en importe un autre » — un module NestJS qui en compose un
 * autre dans son tableau `imports`, ou un contrôleur qui orchestre deux
 * domaines à la demande d'un utilisateur, c'est la composition normale du
 * framework. Ce que la règle interdit, c'est qu'un SERVICE aille chercher le
 * service d'un voisin : c'est ce couplage-là qui empêche de retirer un module
 * sans casser le reste.
 *
 * Le compte au 19/08/2026 : **232 imports service → service**, sur 115
 * fichiers. Une garde qui exigerait zéro tomberait dès le premier jour et
 * serait désactivée dans la semaine ; une règle désactivée ne protège rien.
 * Elle fige donc le niveau atteint. Le chiffre n'est pas un budget à dépenser :
 * c'est un plafond, et il descend quand quelqu'un remplace un import par un
 * contrat partagé, un événement, ou l'Action OS.
 *
 * Hors périmètre, et pour de bonnes raisons : les entités
 * (`../../database/entities/…`) sont un schéma partagé, pas un service ; les
 * `*.module.ts` sont la composition ; les `*.controller.ts` sont la couche où
 * un geste utilisateur traverse légitimement plusieurs domaines.
 */

const MODULES = join(__dirname, '..', 'modules')

/**
 * Le constat au 19/08/2026 : 232. À faire DESCENDRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL A ÉTÉ MONTÉ UNE FOIS, LE 21/08/2026, ET VOICI POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * La surveillance de l'espace documentaire (PDF 3, D17) exigeait un import de
 * plus : la routine hebdomadaire lit Drive et OneDrive via `ZeroLayerService`,
 * qui sait déjà les interroger avec leurs gardes de portée.
 *
 * Deux chemins existaient. Le premier — refactorer `routines.service`, qui
 * importe QUATRE services (messagerie, agenda, ATS, CRM) uniquement pour lire
 * un statut de connecteur que le registre d'outils sait rendre — aurait fait
 * DESCENDRE le compteur de trois. Louis a tranché pour le second : monter d'un,
 * livrer la capacité, et garder le refactor pour son propre chantier.
 *
 * **La dette est donc nommée, et elle a un montant.** `routines.service` est le
 * premier endroit à regarder pour redescendre : −3 en une fois, sur un calcul
 * (`resolveBlockers`) dont la nuance à préserver est `capabilities.read` — le
 * registre dit qu'un outil est opérationnel, pas qu'une PORTÉE de lecture est
 * accordée, et confondre les deux ferait tourner des routines muettes.
 *
 * Ce commentaire existe pour qu'un deuxième relèvement ne se fasse pas « comme
 * la dernière fois » : celui-ci est un arbitrage écrit, daté, avec sa
 * contrepartie identifiée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUXIÈME RELÈVEMENT, LE 29/08/2026 — ET IL EST DE LA MÊME NATURE
 * ─────────────────────────────────────────────────────────────────────────────
 * `AnalysisGateway` doit répondre, à chaque `join`, à « ce compte est-il dans
 * l'espace de l'appelant ? ». Elle importe donc `WorkspaceContextService` —
 * +1, dans un fichier qui n'en importait aucun (les fichiers restent à 115 car
 * le réel était à 114).
 *
 * L'alternative aurait été de recalculer l'espace actif sur place. Ce n'est pas
 * un découplage : c'est une SECONDE définition de « mon espace », dans un
 * chemin de sécurité, alors que `resolveActiveWorkspace` est justement le point
 * de passage unique où la sélection persistée et la ré-preuve d'appartenance
 * sont décidées. Deux chemins qui refont une dérivation divergent — et le jour
 * où ils divergeraient, la passerelle ouvrirait ou fermerait la mauvaise salle.
 * Entre « un import de plus » et « deux définitions de l'autorisation », le
 * dépôt tranche pour l'import.
 *
 * La contrepartie reste la même qu'en août : `routines.service` est toujours le
 * premier endroit où reprendre trois points d'un coup.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROISIÈME RELÈVEMENT, LE 29/08/2026 — LA REPRISE D'UN PORTEFEUILLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `WorkspacePortfolioHandoverService` (tome 8 §33, angle mort n°2 : « la sortie
 * d'un utilisateur ») importe `ProductAnalyticsService` pour inscrire au journal
 * QUI a donné QUEL portefeuille À QUI. +1 import, et **+1 fichier** cette fois :
 * le service est neuf.
 *
 * Trois alternatives ont été pesées, et écartées :
 *
 *  1. **Journaliser depuis le contrôleur** (les contrôleurs sont hors périmètre,
 *     donc coût zéro). Refusé : la ligne d'audit se détacherait de l'écriture
 *     qu'elle décrit, et le premier appelant qui n'est pas ce contrôleur — le
 *     back-office provisionne déjà des équipes par `WorkspaceTeamService` — ne
 *     journaliserait rien. C'est exactement pourquoi `emitMemberRemoved` vit
 *     dans le service voisin, et pas dans la route.
 *  2. **Écrire `product_events` en direct** par son entité (les entités sont
 *     hors périmètre). Refusé : ce serait une SECONDE porte d'écriture dans le
 *     flux d'audit, sans le nettoyage des clés sensibles que
 *     `ProductAnalyticsService` applique. Une dérivation vit à un seul endroit.
 *  3. **Fondre la reprise dans `WorkspaceTeamService`**, qui importe déjà
 *     `ProductAnalyticsService` (coût zéro). Refusé : ce service dépasse déjà
 *     580 lignes, et la reprise de portefeuille doit rester retirable d'un bloc
 *     (règle #7) — c'est la seule capacité du module qui touche six tables
 *     métier.
 *
 * ⚠️ Ce relèvement n'ajoute AUCUN couplage inter-modules nouveau : le module
 * `workspace` dépend déjà d'`analytics` par `WorkspaceTeamService`. Il ajoute un
 * second fichier à une dépendance qui existait. La contrepartie reste
 * `routines.service` : −3 en une fois, toujours disponible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRIÈME RELÈVEMENT, LE 30/08/2026 — LE VERROU DE LA VEILLE TERRITORIALE
 * ─────────────────────────────────────────────────────────────────────────────
 * `TerritoryWatchService` importe `singleton-lock.service` : +1 import, +1
 * fichier. C'est le **quinzième** fichier à le faire — `locks` est, avec
 * `analytics`, l'une des deux dépendances transverses que ce dépôt assume, et ce
 * relèvement n'introduit donc aucun couplage d'une nature nouvelle.
 *
 * Ce qu'il achète : la passe du lundi matin interroge quatre sources publiques
 * PAR DÉPARTEMENT **avant** d'écrire. L'index unique `(department, taken_on)`
 * protégeait la base, pas la facture — à N répliques on payait N fois la même
 * semaine, et la réplique perdante journalisait « Photo manquée » sur une photo
 * bel et bien prise.
 *
 * L'alternative gratuite (écrire la raison plutôt que poser le verrou, comme
 * pour la purge RAG et la photo des stocks) a été pesée et écartée : ces deux
 * balayages-là ne font que LIRE la base, tandis que celui-ci dépense chez un
 * fournisseur. Un produit qui alerte sur le coût fournisseur ne peut pas
 * multiplier le sien par le nombre de répliques.
 *
 * La contrepartie n'a pas changé depuis août : `routines.service`, −3 en une
 * fois. Elle reste due.
 */
/*
 * ─────────────────────────────────────────────────────────────────────────────
 * CINQUIÈME RELÈVEMENT, LE 30/08/2026 — LA PORTE « NE ME CONTACTEZ PLUS »
 * ─────────────────────────────────────────────────────────────────────────────
 * +3 imports, +1 fichier, et c'est une conformité, pas une commodité.
 *
 * Le constat qui l'a déclenché : `outcomeStopsMotion` — la fonction qui sait
 * reconnaître un `do_not_call` — n'avait AUCUN appelant de production. Un refus
 * était décrit dans le catalogue d'issues, publié au front, et n'arrêtait rien.
 * Le seul verrou réel du produit, `email_suppressions`, est indexé par ADRESSE :
 * un contact joint au téléphone n'en avait aucun.
 *
 * Les trois imports, et pourquoi aucun ne pouvait vivre ailleurs :
 *
 *  1. `ContactStopService` → `SuppressionService` (+1 import, +1 FICHIER).
 *     C'est le lien « retirer le MOYEN, pas seulement la permission » : poser un
 *     arrêt inscrit AUSSI l'adresse à la liste de suppression, sans quoi les
 *     huit chemins d'envoi d'e-mail restent ouverts sur la même personne. Le
 *     faire depuis un contrôleur détacherait le retrait du moyen de l'écriture
 *     qui le décide — et le désabonnement public, qui n'a pas de contrôleur
 *     applicatif, ne le ferait jamais.
 *  2. `OutreachService` → `ContactStopService`. Ce chemin ARME quatre touches
 *     datées sur une personne. Résoudre le verdict au contrôleur (comme
 *     `canSend`) aurait laissé le service capable d'armer sans le consulter : un
 *     garde-fou qui vit hors du code qui arme n'en est pas un.
 *  3. `CrmSyncService` → `ContactStopService`. Le passage quotidien POUSSE
 *     `email` et `phone` vers le CRM du client. Sans lui, le numéro de quelqu'un
 *     qui a demandé qu'on cesse de l'appeler atterrit chaque nuit dans l'outil
 *     qui sert justement à l'appeler. Un cron n'a pas de contrôleur.
 *
 * L'alternative gratuite — lire `contact_stops` en SQL brut depuis chaque
 * appelant, comme `contacts.service` le fait pour mettre les séquences en pause
 * — a été pesée et écartée : ce serait TROIS définitions de « cette personne
 * est-elle arrêtée ? » dans un chemin de conformité, et deux chemins qui refont
 * une dérivation divergent. Le jour où ils divergeraient, l'un des trois
 * écrirait à quelqu'un qui a dit non.
 *
 * La contrepartie n'a pas changé depuis août : `routines.service`, −3 en une
 * fois. Elle reste due, et ce relèvement-ci la rend exactement neutre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRIÈME RELÈVEMENT, LE 30/08/2026 — +4 IMPORTS, +1 FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Le planificateur d'enrichissement de l'organigramme (§11 FINAL, P1) —
 * `org-enrichment-planner.service.ts`, module `analysis` — a besoin de QUATRE
 * lectures cross-module : `AccountsService.findOne` (le compte visé existe-t-il,
 * appartient-il à l'appelant ?), `ContactsService.findByAccount` (le périmètre
 * à cibler), `CoverageService.computeForAccount` (les zones blanches du mode
 * « Rôles manquants » — sans lui, ce mode précis recalculerait la couverture
 * une seconde fois, ce que GA-07 interdit pour la MÊME raison qu'il interdit ce
 * couplage : deux dérivations qui divergent), et `CreditsService` (le débit
 * APRÈS succès d'une vague confirmée, même doctrine que `verifyOrgRelation`).
 * `AnalysisOnDemandService` (le chemin `enrichOrganigramWave` réellement
 * appelé) ne compte PAS : il vit dans le MÊME dossier `analysis/`, importé en
 * `./`, hors du périmètre de cette garde (elle ne compte que les imports
 * `../autre-module/…`).
 *
 * Le même triplet compte + contacts + une lecture annexe est DÉJÀ celui
 * d'`AnalysisOnDemandService`, le service frère qui porte tous les autres
 * boutons « Enrichir » de cet écran ; ce relèvement ne change pas la NATURE du
 * couplage toléré ici, il ajoute un service de plus qui suit le même patron —
 * le débit après succès, comme `verifyOrgRelation` le fait déjà à deux lignes
 * de distance dans ce même fichier frère.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CINQUIÈME RELÈVEMENT, LE 01/09/2026 — +1 IMPORT, +1 FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * `privacy/privacy-portability.service.ts` (PDF 7 §9.2, `BEL-INT-608` PR1)
 * importe `ProductAnalyticsService`. C'est le SEUL import cross-module du
 * fichier : `PrivacyExportService` et `PrivacyRetentionService` vivent dans le
 * même dossier `privacy/`, donc hors périmètre de cette garde.
 *
 * Ce qu'il achète : **un export de données personnelles est journalisé**.
 * L'écran « Mes données » télécharge un objet à la fois — dix boutons, dix
 * fichiers — et sans cette trace, une extraction de tout le carnet de contacts
 * ne laisserait rien derrière elle. Le journal d'activité de l'espace affiche
 * déjà `export_performed` pour les envois vers un CRM ; ne pas y écrire les
 * sorties personnelles ferait dire à cet écran que RIEN n'est sorti, ce qui
 * serait faux.
 *
 * L'alternative gratuite — écrire la ligne depuis le CONTRÔLEUR, qui n'est pas
 * compté par cette garde — a été pesée et écartée pour deux raisons. D'abord ce
 * serait contourner le compteur sans rien découpler, exactement le motif « une
 * garde qui se fait contourner ne garde plus rien ». Ensuite le contrôleur ne
 * connaît PAS le nombre de lignes exportées : c'est le service qui l'a compté,
 * et c'est ce nombre qui permet de reconnaître une extraction massive après
 * coup. Le lui faire recompter serait une seconde dérivation du même fait.
 *
 * ⚠️ Ce relèvement n'introduit AUCUN couplage d'une nature nouvelle :
 * `analytics` est, avec `locks`, l'une des deux dépendances transverses que ce
 * dépôt assume — c'est écrit au quatrième relèvement, et `privacy` devient le
 * énième module à l'emprunter, pour la raison exacte pour laquelle elle existe.
 *
 * La contrepartie n'a pas changé depuis août : `routines.service`, −3 en une
 * fois. Elle reste due.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SIXIÈME RELÈVEMENT — 244 → 246, le 01/09/2026 : le connecteur Odoo
 * ─────────────────────────────────────────────────────────────────────────
 * `odoo.service` emprunte EXACTEMENT les deux mêmes dépendances que les quatre
 * connecteurs CRM déjà comptés ici :
 *
 *  - `WorkspaceContextService`, pour résoudre l'espace de l'appelant. Elle
 *    n'est pas contournable : un lien CRM est partagé par l'équipe, donc toute
 *    lecture et toute écriture sont bornées par `workspace_id`. La faire
 *    passer par le contrôleur reviendrait à recopier la résolution dans cinq
 *    contrôleurs — une dérivation de plus, pour le même fait.
 *  - `ProductAnalyticsService`, qui est avec `locks` l'une des deux
 *    dépendances transverses que ce dépôt assume, comme le dit le quatrième
 *    relèvement ci-dessus.
 *
 * ⚠️ Ce que ce relèvement n'achète PAS : un couplage d'une nature nouvelle.
 * Odoo est le cinquième connecteur d'une famille qui existe, et il ne va
 * chercher rien que ses quatre aînés n'aillent déjà chercher. Le refuser
 * reviendrait à interdire le cinquième au motif que les quatre premiers sont
 * passés — c'est-à-dire à figer la famille plutôt que le couplage.
 *
 * La contrepartie de `routines.service` reste due, et ce lot ne la paie pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SEPTIÈME RELÈVEMENT — 246 → 253, le 01/09/2026 : la MARQUE BLANCHE
 * ─────────────────────────────────────────────────────────────────────────
 * Sept services vont chercher `WorkspaceBrandService`. C'est le prix EXACT de
 * la marque blanche, et il se paie une fois : la marque d'un espace est un
 * FAIT de cet espace, elle ne peut donc venir que d'un service qui lit la
 * table `workspaces`.
 *
 * Les sept, et ce que chacun en fait — tous des sorties qui QUITTENT le
 * produit, ce qui est la raison pour laquelle aucun ne pouvait s'en passer :
 *
 *  - `contacts.service` — l'expéditeur d'un e-mail de prise de contact. Le
 *    `From` est la ligne la plus visible d'une boîte de réception.
 *  - `workspace-team.service` — l'invitation, qui part vers quelqu'un qui n'a
 *    PAS encore de compte : le seul e-mail lu par un tiers total.
 *  - `weekly-digest` / `daily-digest` — l'expéditeur du résumé.
 *  - `documents.service` — les propriétés `creator` / `author` des fichiers
 *    exportés, qui VOYAGENT avec le fichier chez le client du client.
 *  - `integrations.service` — le message posté dans le canal d'équipe du
 *    client, lu dans SON outil.
 *  - `mfa.service` — l'émetteur affiché dans l'application d'authentification,
 *    sur le téléphone de l'utilisateur, hors de tout écran que l'on contrôle.
 *
 * ⚠️ **Le contrôleur ne pouvait pas porter cette orchestration**, contrairement
 * à ce que la règle générale suggère. Un `creator` de fichier PDF et un `From`
 * SMTP ne sont pas des gestes utilisateur : ce sont des champs écrits au
 * moment du rendu, à l'intérieur du service, plusieurs couches sous le clic.
 * Les remonter au contrôleur reviendrait à faire traverser la marque en
 * paramètre à travers toute la chaîne — sept dépendances remplacées par une
 * vingtaine de signatures, sans découpler quoi que ce soit.
 *
 * Trois autres appelants NE comptent pas ici, et c'est voulu : `oauth`,
 * `projects` et `consultants` prennent la dépendance dans leur CONTRÔLEUR,
 * exactement là où cette garde dit qu'elle doit vivre.
 *
 * La contrepartie de `routines.service` reste toujours due.
 */
/**
 * ⚠️ 253 → 254 le 02/09/2026 (surveillance des contrats sur facture). UN import
 * de plus, et c'est `SingletonLockService` — le verrou d'unicité que prennent
 * déjà les cinq autres balayages quotidiens du dépôt.
 *
 * Il ne se remplace ni par un contrat partagé ni par une orchestration en
 * contrôleur : un balayage `@Cron` n'a PAS de contrôleur, et sans verrou les
 * deux instances de l'API journaliseraient chacune la même échéance — deux
 * alertes pour un fait, ce qui apprend à l'opérateur à les ignorer.
 *
 * La dépendance qui ferait vraiment monter le couplage — le service de
 * provisionnement dont il relit les clients — n'est PAS comptée ici : elle vit
 * dans le MÊME module (`admin/`), et c'est délibéré. Le balayage et l'écran
 * partagent la dérivation (`billingHealth`) plutôt que de la recalculer chacun
 * de son côté, ce qui est l'inverse d'un couplage qui s'étend.
 */
/**
 * ⚠️ 254 → 255 le 15/09/2026 (#2155, « Mes cibles »). UN import de plus, et
 * c'est encore `WorkspaceContextService` — le MÊME service que le deuxième
 * relèvement (`AnalysisGateway`) et le sixième (`odoo.service`) : résoudre
 * l'espace actif de l'appelant et vérifier son appartenance avant de lire ou
 * d'écrire une liste de cibles partagée par toute l'équipe.
 *
 * Aucune alternative gratuite : recalculer l'espace actif sur place serait une
 * SECONDE définition de « mon espace » dans un chemin qui décide qui voit et qui
 * modifie une liste de travail, exactement le raisonnement déjà tenu pour la
 * passerelle temps réel. `resolveActiveWorkspace` reste le point de passage
 * unique.
 *
 * La contrepartie de `routines.service` reste due.
 */
/**
 * ⚠️ 255 → 256 le 15/09/2026 (#2231, balayage de régénération des contextes de
 * profil). UN import de plus : `AdminProfileContextsService` (module `admin/`)
 * importe `EsnProfileService` pour appeler `regenerateProfileContext(userId)`
 * — le MÊME appelant que le bouton « Régénérer » côté utilisateur
 * (`esn-profile.controller.ts`, `POST regenerate-context`).
 *
 * L'alternative gratuite pesée et écartée : dupliquer dans le nouveau service
 * les deux étapes que `regenerateProfileContext` fait déjà (résoudre les
 * réponses ESN fusionnées via `EsnProfileWorkspaceResolver`, puis appeler
 * `ProfileContextService.triggerGeneration`). Ça n'aurait pas évité un import
 * cross-module — `ProfileContextModule` n'est pas plus dans `admin/` que
 * `EsnProfileModule` — et ça en aurait ajouté un SECOND
 * (`EsnProfileReaderModule`, pour la résolution des réponses) : DEUX chemins
 * qui redéclenchent « régénérer le contexte de ce compte » au lieu d'un. C'est
 * exactement le raisonnement déjà tenu ici pour `ContactStopService` et pour
 * `CrmSyncService` : une dérivation vit à un seul endroit, et le jour où les
 * deux chemins divergeraient, l'un régénérerait un contexte VALIDÉ que D9
 * protège, l'autre non.
 *
 * La contrepartie de `routines.service` reste due.
 */
/**
 * ⚠️ 256 → 257 le 16/09/2026 (intégration de la vague 21, #1931.20 — « le
 * résultat d'une carte de Laura rend aussi dans Actions et la timeline »). UN
 * import de plus : `copilot-card.service` (module `action-os/`) importe
 * `ActivitiesService` pour appeler `ingest(...)` depuis `settleResult`, le seul
 * point qui écrit le `result` d'une carte pour la première fois. La branche
 * l'ajoutait sans relever le gel ; l'intégration l'a mesuré (256 → 257, et un
 * fichier de plus au second compteur).
 *
 * Aucune alternative gratuite : `ingest` est LA porte d'écriture du journal
 * `activities` — idempotence par `externalId`, rattachement compte/contact —,
 * déjà prise par `tasks.service`, `projects.service`, `decision-gates.service`
 * et `submissions.service`. Écrire la ligne à la main dans le module des cartes
 * serait une SECONDE définition de « tracer un fait dans l'historique », et
 * `settleResult` n'a pas UN contrôleur où déplacer l'orchestration : il est
 * appelé par trois chemins du service — `confirm`, `retry`, et le `refresh`
 * privé que rejouent quatre lectures de cartes. Le déplacer dans un contrôleur
 * le recopierait autant de fois.
 *
 * La contrepartie de `routines.service` reste due.
 */
/**
 * ⚠️ 257 → 258 le 17/09/2026 (#2165.28 / #2165.30, lot DC-MOTEUR2 — les
 * filtres serveur « technologies observées » et « recours externe observé »
 * de Découvrir). UN import de plus : `discover-market-memory.service.ts`
 * (module `ia-proxy/`) importe `MarketMemoryService` pour résoudre les deux
 * critères EN MASSE (`observedStacksFor` / `esnObservedManyFor`), un aller-
 * retour par page de résultats — jamais un par ligne, et jamais dans le
 * contrôleur (`ia-proxy.controller.ts` est déjà un gros fichier, la route est
 * vivante et limitée en débit). Aucune alternative gratuite : le point d'entrée
 * désigné par le brief est un service NEUF appelé par une seule ligne du
 * contrôleur, exactement le patron que `DiscoverPortfolioService` tient déjà
 * pour `withPortfolioState` — recopier la lecture bulk dans le contrôleur
 * aurait été une SECONDE définition du même calcul.
 *
 * La contrepartie de `routines.service` reste due.
 */
/**
 * ⚠️ 258 → 259 le 18/09/2026 (#2568.1, import de CV depuis la messagerie
 * connectée). UN import de plus : `cv-batch-import.service.ts` (module
 * `consultants/`) importe `MailboxService` (module `mailbox/`) pour
 * `getAttachment` — télécharger la pièce jointe (octets + nom) d'un message
 * déjà lu par l'utilisateur, avant de la faire traverser
 * `CvIntakeService.intakeAutomatic`.
 *
 * Aucune alternative gratuite : `MailboxService` est LE point de passage qui
 * résout le bon backend (Google/Microsoft) et son autorisation OAuth déjà
 * accordée (scopes `read`) — le dupliquer dans `consultants/` serait une
 * SECONDE définition de « lire une boîte connectée », avec le risque que la
 * doctrine nomme déjà (le corps d'un message ne voyage jamais :
 * `getAttachment` n'appelle que les endpoints de métadonnées et de pièce
 * jointe, jamais le corps). Le contrôleur ne peut pas porter cette
 * orchestration : la pièce jointe est téléchargée PUIS analysée par le
 * pipeline d'intake dans le même appel, pas un geste utilisateur en deux
 * temps.
 *
 * La contrepartie de `routines.service` reste due.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CINQUIÈME RELÈVEMENT, LE 18/09/2026 — LES NOTES DE TERRAIN DÉCOUVRIR
 * ─────────────────────────────────────────────────────────────────────────────
 * La vague M arrivait avec TROIS franchissements pour `discover-notes`
 * (module neuf, #2151.59) ; deux ont été ÉVITÉS, un est ASSUMÉ ici :
 *
 *  1. **Évité** — `accounts.service.ts` importait
 *     `DiscoverCandidateNotesService` pour la reprise des notes à la
 *     conversion (« candidat → compte »). Remplacé par un événement, même
 *     patron que `sprint-progression.bus.ts` (m18, `ContactsService` →
 *     `SprintsService`) : `AccountsService` émet sur `AccountClaimBus`
 *     (`discover-notes/account-claim.bus.ts`, jamais nommé `*.service.ts`),
 *     et `AccountClaimListener` s'y abonne pour faire l'appel à sa place.
 *     `AccountsService` ne connaît plus `DiscoverCandidateNotesService`.
 *  2. **Évité** — `demo-seed.service.ts` (module `demo`) importait le même
 *     service pour UNE fonction pure et sans état,
 *     `candidateNoteEntityId` (une dérivation SHA-256, aucune injection).
 *     Extraite dans son propre fichier
 *     (`discover-notes/candidate-note-entity-id.ts`) : un contrat partagé,
 *     pas un service — `discover-candidate-notes.service.ts` la réexporte
 *     pour ses propres appelants.
 *  3. **Assumé, +1** — `discover-candidate-notes.service.ts` (fichier NEUF)
 *     importe `WorkspaceContextService` pour résoudre l'espace actif du
 *     visiteur (`resolveActiveWorkspace(userId)`), exactement comme
 *     `AnalysisGateway` au deuxième relèvement ci-dessus. Même raisonnement :
 *     recalculer l'espace actif sur place serait une SECONDE définition de
 *     « mon espace », dans un chemin qui décide ce qu'un visiteur peut lire
 *     — et `workspace-context.service` est déjà, avec `locks` et
 *     `analytics`, une dépendance transverse que ce dépôt assume largement
 *     (59 fichiers l'importent déjà avant ce lot). Aucune nature de couplage
 *     nouvelle.
 *
 * La contrepartie de `routines.service` reste due, inchangée par ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIXIÈME RELÈVEMENT, LE 19/09/2026 — LA DURÉE D'UN ENRICHISSEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts.service.ts` importait déjà HUIT services d'autres modules avant ce
 * lot (`ProvenanceService`, `CreditsService`, `MailerService`,
 * `SuppressionService`, `WorkspaceContextService`, `ProductAnalyticsService`,
 * `ProviderCostService`, `WorkspaceBrandService`) — le fichier était déjà
 * compté dans `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`, inchangé par ce lot.
 * #2120.57 / #2297.23 lui ajoute un NEUVIÈME import, `EnrichmentDurationService`
 * (module `analytics`), pour mesurer la durée réelle d'un enrichissement et
 * l'exposer à `GET /contacts/enrichment-duration-estimate`. Seul le compteur
 * d'imports bouge, +1 — signature d'un fichier DÉJÀ couplé qui gagne une
 * dépendance de plus, pas d'un fichier neuf.
 */
/** ⚠️ 263 → 264 le 20/09/2026 (#2643.1, l'e-mail d'activation se voit et se
 *  déclenche à la main) : `owner-activation.service.ts` est un fichier NEUF
 *  qui importe UN service (`MailerService`) pour envoyer l'e-mail d'activation
 *  du propriétaire sur clic opérateur — le branchement que la décision de
 *  Louis du 20/09/2026 demandait, jamais un envoi automatique. Les deux
 *  compteurs montent de 1 ensemble — signature d'un fichier nouveau. */
/** ⚠️ 264 → 265 le 20/09/2026 (#2643.3, alerte interne d'un siège inactif) :
 *  `owner-activation-sweep.service.ts` est un fichier NEUF qui importe UN
 *  service (`SingletonLockService`) — même verrou que `ManualBillingSweep
 *  Service`, pour qu'un déploiement à deux instances ne journalise pas deux
 *  fois la même alerte. Les deux compteurs montent de 1 ensemble. */
/**
 * ⚠️ 265 → 266 le 21/09/2026 — LA PRIORISATION COMMERCIALE (#2035.11).
 *
 * `commercial-load-settings.service.ts` (module `projects`, #2035.11) est un
 * fichier NEUF qui importe `WorkspaceContextService` pour résoudre l'espace
 * actif et le rôle de qui règle le plafond de besoins ouverts
 * (`resolveActiveWorkspace`, `extraPermissionsOf` puis `can(role, extra,
 * 'team:manage')`) — même raisonnement que `discover-candidate-notes.service.ts`,
 * même dépendance transverse déjà largement assumée. +1 import, +1 fichier.
 *
 * `reverse-market-settings.service.ts` (module `consultants`, #2035.10, même
 * lot) fait EXACTEMENT la même chose pour la même raison, mais ne touche PAS
 * ce compteur : il vit dans `consultants/matching/`, deux niveaux sous
 * `modules/`, hors de portée du motif à un seul niveau que cette garde
 * reconnaît. Ce n'est pas un couplage de moins — nommé ici pour qu'un
 * prochain lecteur ne cherche pas un relèvement jumeau qui n'existe pas.
 */
/** ⚠️ 266 → 267 le 21/09/2026 (#2650.2, le remboursement des rafraîchissements
 *  passe seul chaque nuit) : `refresh-refund-sweep.service.ts` est un fichier
 *  NEUF qui importe UN service (`SingletonLockService`) — même verrou que
 *  `ManualBillingSweepService` et `OwnerActivationSweepService`, pour qu'un
 *  déploiement à deux instances ne rembourse pas deux fois le même débit.
 *  Les deux compteurs montent de 1 ensemble — signature d'un fichier nouveau.
 *  ⚠️ INTÉGRATION 21/09/2026 (vague 6) : ce relèvement et celui de
 *  `commercial-load-settings.service.ts` ci-dessus sont arrivés par deux
 *  branches distinctes qui visaient CHACUNE 265 → 266, sans se voir. Les deux
 *  fichiers sont réels et distincts (vérifié : aucun des deux n'importe déjà
 *  le service de l'autre) — le compteur encaisse donc les DEUX relèvements,
 *  267, pas un seul. */
/** ⚠️ 267 → 268 le 21/09/2026 (vague 7, #2298.8/.10) : `partners.service.ts`
 *  importe `ownerDisplayName` de `../delivery/delivery.service`.
 *  **Ce relèvement paie une DÉDUPLICATION, pas un couplage neuf** : le
 *  commentaire de `partners.service.ts:110` dit ce qu'il remplace —
 *  vingt-cinq lignes qui résolvaient CHACUNE leur nom de responsable. Un
 *  seul endroit désormais (GA-26), au prix d'un import inter-modules qui se
 *  voit ici. Et ce n'est pas une injection de service : `ownerDisplayName`
 *  est une fonction pure exportée par ce fichier — le motif de la garde ne
 *  sait pas faire la différence, et c'est assumé, il vaut mieux qu'elle
 *  compte trop que pas assez.
 *  ⚠️ La vague 7 portait DEUX mouvements, dont un seul compte : la fusion des
 *  réglages d'espace (#2035.10/.11) ajoute
 *  `open-needs.service.ts -> ../workspace/workspace-commercial-load-settings.service`
 *  mais RETIRE `commercial-load-settings.service.ts -> ../workspace/workspace-context.service`,
 *  le fichier ayant été supprimé. Net : zéro. Mesuré par différence entre
 *  `8b3fe6657` et `3e627ddbd`, pas déduit. */
/** ⚠️ 268 → 269 le 22/09/2026 (intégration vague 15, #2634.1) :
 *  `accounts.service.ts` importe `ownerDisplayName` de `delivery.service.ts`
 *  pour nommer QUI a déclaré un signal de compte — le MÊME formateur que
 *  `partners.service.ts` (relèvement 267 → 268) et `invoice-readiness`, plutôt
 *  qu'une seconde définition du nom affiché (GA-26). Une fonction pure, pas une
 *  injection de service ; `accounts.service.ts` comptait déjà d'autres
 *  services, le compteur de fichiers ne bouge pas. */
/** ⚠️ 269 → 271 le 22/09/2026 (intégration vague 16, #2710) : `analysis.gateway.ts`
 *  gagne DEUX injections, `AccountsService` (`../accounts/accounts.service`) et
 *  `BusinessUnitService` (`../business-unit/business-unit.service`). Il
 *  comptait déjà `WorkspaceContextService`, le compteur de fichiers ne bouge
 *  pas. Avant ce commit, `mayWatch` lisait le compte par un
 *  `Repository<AccountEntity>` injecté directement (`@InjectRepository`) et ne
 *  bornait QUE l'espace : un membre cloisonné sur une autre unité pouvait
 *  suivre en temps réel la progression d'un compte que le chemin HTTP lui
 *  refusait déjà (GA-333). Les deux services neufs font passer la salle
 *  temps réel par la MÊME porte que le HTTP — `AccountsService
 *  .findOneForWorkspace` avec le périmètre résolu par `BusinessUnitService`
 *  via `resolveBusinessUnitScope` — plutôt qu'une seconde définition du
 *  cloisonnement d'unité (GA-26 : un réglage vit à un seul endroit). Aucun
 *  port ou lecture existant ne rend `findOneForWorkspace` ou
 *  `resolveBusinessUnitScope` sans importer les services qui les portent ;
 *  dupliquer leur logique ici serait exactement la seconde définition que la
 *  doctrine interdit. Légitime, donc le plafond monte plutôt que la garde
 *  s'efface. */
/** ⚠️ 271 → 273 le 23/09/2026 (intégration vague 18) : DEUX fichiers déjà
 *  comptés gagnent chacun UN import de plus, le compteur de fichiers ne bouge
 *  pas.
 *  · `activities.service.ts` (#2377.6, debrief de fin d'appel) importe
 *    `ActionPlanItemsService` (`../actions/action-plan-items.service`) pour
 *    poser la prochaine action dans la MÊME liste que toute autre tâche
 *    manuelle (`action_plan_items`, « Mes relances », le plan du compte) —
 *    un second mécanisme parallèle finirait par diverger de celui que l'écran
 *    Actions lit déjà (GA-26). Il comptait déjà `WorkspaceContextService`.
 *  · `copilot-card.service.ts` (#2366.1/.2) importe `OutreachMessageService`
 *    (`../outreach/outreach-message.service`) pour qu'un brouillon que Laura
 *    vient de générer devienne AUSSI le message canonique lu par la fiche
 *    Contact et le centre d'approbation Outreach — jamais une seconde version
 *    propre au fil. Il comptait déjà `ActivitiesService`.
 *  Les deux évitent la seconde définition que la doctrine interdit ; aucune
 *  alternative gratuite (dupliquer la liste d'actions ou le message canonique
 *  ici serait exactement ce que GA-26 empêche). Légitime, donc le plafond
 *  monte plutôt que la garde s'efface. */
/** ⚠️ 273 → 275 le 23/09/2026 (intégration vague 19, #2455, contextes de
 *  travail) : `feat/contextes-et-equipe-fin-23-09` partait d'une base bien
 *  plus ancienne (avant la vague 16) et portait donc sa PROPRE copie de ce
 *  compteur, restée à 271 sur cette branche pendant que `main` recevait déjà
 *  d'autres relèvements ailleurs (271 → 273, vague 18, hors session pour
 *  cette branche). Le mouvement PROPRE à la branche, net de ce qu'elle
 *  apporte à la fusion : `work-contexts.service.ts` (fichier NEUF, #2455.1)
 *  importe `BusinessUnitService` (BU du contexte, #2455.7) et
 *  `WorkspaceContextService` (espace actif, comme la quasi-totalité des
 *  services de ce dépôt) — deux lectures, jamais une écriture croisée.
 *  `team-comments.service.ts` importe déjà `WorkspaceContextService` avant
 *  cette fusion (vérifié : présent dans `integration-vague-19` avant le
 *  merge), ce mouvement-ci ne compte donc pas une seconde fois. Net : +2 sur
 *  ce compteur, +1 sur son jumeau des fichiers (voir plus bas). Légitime
 *  (deux lectures d'un contexte de travail neuf), donc le plafond monte
 *  plutôt que la garde s'efface. */
/** ⚠️ 275 → 276 le 23/09/2026 (#1903.12, le compte rendu s'écrit réellement
 *  dans le carnet du compte) : `meeting-notes.service.ts` importait déjà
 *  `AccountsService` et `CrmService` (fichier déjà compté), il importe
 *  désormais aussi `NotesService` (`crm-core`) pour poser la note — UN import
 *  de plus, ZÉRO fichier de plus (voir le compteur jumeau, inchangé). La
 *  même porte que `next_steps`→`CrmService.createTask` : la sortie `recap`
 *  n'avait, avant ce lot, AUCUN chemin d'écriture branché (`blocked` /
 *  « il manque : le carnet du compte », systématiquement). Alternative
 *  écartée : dupliquer `NotesService.create` dans ce module aurait recréé une
 *  seconde écriture de `notes`, exactement ce que GA-26 interdit. */
/** ⚠️ 276 → 277 le 25/09/2026 (#2775, épopée « instrumentation fine des 6
 *  phases onboarding ») : `profile-context.service.ts` n'importait AUCUN
 *  service d'un autre module (`IaClient` ne compte pas — son fichier s'appelle
 *  `ia.client.ts`, pas `*service*`), il en importe désormais UN,
 *  `ProductAnalyticsService` (module `analytics`) — même dépendance
 *  transverse que `AnalysisService`/`OnboardingService`/`AnalysisWorker`
 *  (voir la sixième entrée plus haut), injectée `@Optional()`. La génération
 *  du profil (`triggerGeneration`/`persistSuccess`) n'avait, avant ce lot,
 *  AUCUN événement produit dédié — seule la réponse HTTP de `POST
 *  /esn-profile/regenerate-context` était observable, et elle répond dès que
 *  le statut passe à `generating`, bien avant que le modèle réponde ou que la
 *  révision soit persistée. Alternative écartée : dupliquer un second
 *  écrivain `product_events` dans ce module aurait recréé une seconde
 *  définition du journal produit, exactement ce que GA-26 interdit. Les deux
 *  compteurs montent de 1 ensemble — signature d'un fichier qui entre dans le
 *  périmètre compté, pas d'un couplage qui s'étend. */
/** ⚠️ 277 → 278 le 25/09/2026 (#2777, la sortie `need` de la cascade compte
 *  rendu s'écrit réellement dans le pipe) : `meeting-notes.service.ts`
 *  importait déjà `AccountsService`, `CrmService`, `NotesService` et
 *  `WorkspaceContextService` (fichier déjà compté), il importe désormais
 *  aussi `ProjectPipelineService` (module `projects`) pour poser la ligne de
 *  besoin — UN import de plus, ZÉRO fichier de plus (voir le compteur jumeau,
 *  inchangé). Avant ce lot, `need` n'avait AUCUN chemin d'écriture branché
 *  (`blocked` / « il manque : les besoins », systématiquement). Alternative
 *  écartée : un repository `ProjectNeedEntity` injecté directement (comme
 *  `contacts`, qui évite ce compteur) aurait recréé la projection que
 *  `ProjectPipelineService.saveNeed` tient déjà à un seul endroit (GA-26,
 *  voir son propre docblock : « les deux portes … écrivent les mêmes
 *  colonnes … deux copies auraient divergé au premier champ ajouté »). */
/** ⚠️ 278 → 280 le 25/09/2026 (#2777, la sortie `learnings` de la cascade
 *  compte rendu s'écrit réellement dans la mémoire du compte) : DEUX imports,
 *  pas un — voir le relèvement jumeau de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`
 *  pour le détail des deux fichiers. `meeting-notes.service.ts` (déjà compté)
 *  importe désormais aussi `AccountMemoryService` (module `crm-core`, +1) ;
 *  `account-memory.service.ts`, fichier NEUF, importe `WorkspaceContextService`
 *  pour résoudre l'espace avant d'écrire (+1). Avant ce lot, `learnings`
 *  n'avait AUCUN chemin d'écriture branché (`blocked` / « il manque : la
 *  mémoire du compte », systématiquement) — c'est la SEPTIÈME et dernière
 *  sortie interne de la cascade à sortir de ce refus. Alternative écartée :
 *  aucune, il n'existait aucun service à réutiliser (`memory.service.ts` est
 *  la mémoire CONVERSATIONNELLE de Laura, pas un fait tenu par le compte). */
/** ⚠️ 280 → 281 le 25/09/2026 (#2320.23, épopée #2967) : voir le relèvement
 *  jumeau de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` plus bas —
 *  `project-pipeline.service.ts` entre dans le périmètre compté avec son
 *  premier import cross-module (`CommercialTransitionsService`, le journal
 *  de transition de la chaîne commerciale — un module autonome, règle #7).
 *  Relèvement en parallèle du lot #2777 juste au-dessus (base commune 277) :
 *  les deux s'additionnent, deux fichiers réels, deux imports réels. */
/** ⚠️ 277 → 278 le 25/09/2026 (#2386.A, #3010) : `activities.service.ts`
 *  importait déjà `ActionPlanItemsService` (fichier déjà compté), il importe
 *  désormais aussi `CrmService` pour écrire l'issue d'un appel sur la fiche
 *  CRM du contact (`writebackCrmCallNote`, porte `create_note` déjà branchée
 *  depuis la téléphonie, sans appelant depuis la saisie manuelle) — UN import
 *  de plus, ZÉRO fichier de plus (voir le compteur jumeau, inchangé). Resserré
 *  plutôt qu'effacé côté doctrine : `un-outcome-interet-ne-cree-pas
 *  -opportunite.spec.ts` borne maintenant les appels autorisés à
 *  `findContactRecord`/`logActivity`, jamais une création d'affaire. */
/** ⚠️ 281 + 1 = 282 le 25/09/2026 (intégration vague 52) : le lot #2777/#2967
 *  (281, base 277) et le lot #3010 (278, même base 277) se sont croisés —
 *  quatre imports réels + un import réel, ils s'additionnent. */
/** ⚠️ 282 → 283 le 25/09/2026 (intégration vague 52, épopée #2980) : voir le
 *  relèvement jumeau de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ci-dessous
 *  (`integration-sync.worker.ts`) — croisé avec le lot #2777/#2967/#3010
 *  juste au-dessus (même base 278), les deux s'additionnent. */
/** ⚠️ 283 → 284 le 26/09/2026 (intégration matin A, épopée #2977) :
 *  `admin-workspace-health.service.ts` est un fichier NEUF qui importe UN
 *  service (`LauraProbeService`, `laura` module) — voir le relèvement jumeau
 *  de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ci-dessous. */
/** ⚠️ 284 → 285 le 25/09/2026 (#2126.56/.58, épopée #2787) : `contacts.service.ts`
 *  importait déjà `WorkspaceContextService` (fichier déjà compté), il importe
 *  désormais aussi `CommercialOutcomesService` (module `outcomes`) pour écarter
 *  du classement une fiche marquée `incorrect_contact` — UN import de plus,
 *  ZÉRO fichier de plus (voir le compteur jumeau, inchangé). Alternative
 *  écartée : dupliquer la lecture de `commercial_outcomes` dans `contacts`
 *  aurait recréé une seconde définition du ledger, exactement ce que GA-26
 *  interdit. */
/** ⚠️ 285 → 286 le 26/09/2026 (intégration matin D, #2388.42) : l'orchestration
 *  des rendez-vous à préparer (agenda) rejoint celle du CRM dans
 *  `integration-sync.worker.ts` — même fichier DÉJÀ compté (voir le
 *  relèvement du 25/09/2026 ci-dessus pour `CrmSyncService`), UN import de
 *  plus (`AgendaService`), ZÉRO fichier de plus (voir le compteur jumeau,
 *  inchangé). C'est le worker, pas le contrôleur, qui referme désormais le
 *  run et calcule son résumé — l'alternative (garder l'appel à l'agenda dans
 *  le contrôleur) aurait recréé une SECONDE orchestration pour le même run,
 *  exactement ce que ce module refuse depuis le passage au job BullMQ. */
/** ⚠️ 285 → 286 le 26/09/2026 (#2843, rappel de REX en attente, intégration
 *  matin B) : `routine-executors.ts` importait DÉJÀ des services d'autres
 *  modules (`CrmService`, `MailboxService`…) — le fichier était déjà compté,
 *  seul le compteur d'IMPORTS monte de 1 (`CapitalisationService`, pour la
 *  nouvelle routine `mission_rex_reminder` qui réutilise `rexForWorkspace`).
 *  Le compteur de fichiers jumeau ne bouge pas. */
/** ⚠️ 286 → 287 le 26/09/2026 (intégration matin D × main) : le lot D
 *  (`integration-sync.worker.ts` / `AgendaService`) et le lot #2843 intégré
 *  par la vague B (`routine-executors.ts` / `CapitalisationService`) partent
 *  tous les deux de la base 285 et s'additionnent — deux imports réels dans
 *  deux fichiers déjà comptés, ZÉRO fichier de plus (voir le compteur
 *  jumeau, inchangé). */
/** ⚠️ 287 → 288 le 26/09/2026 (intégration chantier B) : `WorkflowRunnerService`
 *  importe désormais `TasksService` (épopée #2946 — une demande d'approbation
 *  pose une tâche `action_os_approval` sur le décideur, `requestApproval`).
 *  UN import réel dans un fichier déjà compté (`workflow-runner.service.ts`
 *  importait déjà `ActionRouterService`/`WorkspaceContextService`), ZÉRO
 *  fichier de plus — le compteur jumeau ne bouge pas. */
/** ⚠️ 287 → 289 le 26/09/2026 (intégration chantier A, #3069) :
 *  `outreach-send.sweeper.ts` est un fichier NEUF — le dispatcher qui reprend
 *  les messages `approved` et les fait réellement PARTIR. Il réutilise DEUX
 *  services d'autres modules plutôt que de les réimplémenter : `MailboxService
 *  .sendBatch` (le MÊME chemin gouverné que `PlaybooksController.decideSend` —
 *  opt-out, dédoublonnage, arrêt après trois échecs, signature du compte
 *  connecté) et `SingletonLockService` (un seul sweeper à la fois, même
 *  patron que les autres crons du dépôt). DEUX imports, UN fichier neuf — voir
 *  le relèvement jumeau de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ci-dessous. */
/** ⚠️ 289 → 290 le 26/09/2026 (#2875, épopée « moteur de déclencheurs
 *  commerciaux canonique ») : `governance.service.ts` importait déjà
 *  `WorkspaceContextService` (fichier déjà compté), il importe désormais
 *  aussi `TriggerRegistryService` (module `trigger-registry`) pour écrire au
 *  registre canonique le PREMIER émetteur migré (`proposeDuplicates`) — UN
 *  import de plus, ZÉRO fichier de plus (voir le compteur jumeau, inchangé).
 *  Alternative écartée : dupliquer l'écriture dans `governance.service.ts`
 *  directement dans la table `canonical_trigger_events` aurait recréé une
 *  seconde définition du registre, exactement ce que GA-26 interdit — le
 *  registre lui-même est un service, `TriggerRegistryService`, réutilisable
 *  par les quatre autres émetteurs dispersés le jour où ils migrent. Base
 *  285, en parallèle des lots matin D/B ci-dessus (base commune 285) : les
 *  trois s'additionnent, 285 + 3 = 288. */
/** ⚠️ 288 → 289 le 26/09/2026 (fusion main × intégration chantier B) : les deux
 *  lots ci-dessus (`WorkflowRunnerService`/`TasksService` côté chantier B,
 *  `governance.service.ts`/`TriggerRegistryService` côté #2875) partent tous
 *  les deux de la base 287 en parallèle et s'additionnent — deux imports
 *  réels distincts, ZÉRO fichier de plus (voir le compteur jumeau,
 *  inchangé). */
/** ⚠️ 289 → 290 le 26/09/2026 (#2339.7, épopée #2795, intégration clôture × main 27/09) : `delivery.service.ts`
 *  importait DÉJÀ `WorkspaceContextService` — le fichier était déjà compté,
 *  seul le compteur d'IMPORTS monte de 1 (`CommercialTransitionsService`,
 *  pour que la mission entre dans le journal APPEND-ONLY de la chaîne
 *  commerciale au même titre que le besoin, #2320.23). Le compteur de
 *  fichiers jumeau ne bouge pas. L'orchestration qui RÉSOUT le positionnement
 *  accepté (`SubmissionsService`) vit dans `ProjectsController` — hors
 *  périmètre de cette garde, les `*.controller.ts` sont exclus. Arrivé de la
 *  branche clôture (base 287) après la fusion de chantier B : 289 + 1 = 290. */
/** ⚠️ 290 → 293 le 27/09/2026 (intégration matin, fusion chantier A dans
 *  clôture) : la branche chantier A partait elle-même de la base 287 (285 +
 *  matin D/B) et y ajoutait `outreach-send.sweeper.ts` (DEUX imports,
 *  `MailboxService`/`SingletonLockService`, voir le paragraphe chantier A
 *  ci-dessus, 287 + 2 = 289) en parallèle de `governance.service.ts` /
 *  `TriggerRegistryService` (+1, 289 → 290) — ce dernier lot est DÉJÀ compté
 *  côté clôture (même changement, même fichier), donc il ne se recompte pas
 *  une seconde fois. Seul l'apport RÉEL et NEUF de chantier A survit à la
 *  fusion : les deux imports d'`outreach-send.sweeper.ts`, absents de
 *  clôture. 290 (clôture) + 2 = 292 — valeur relevée sur mesure réelle
 *  (`measured.imports`), pas par arithmétique des deux paragraphes seule. */
/** #3086 (intégration soir 3, 26/09/2026) ne touche pas ce compteur non plus :
 *  `chat-presence.service.ts` importait `WorkspaceContextService` côté
 *  soir-3, mais la fusion a gardé la forme de main (`isDemoWorkspace` résolu
 *  par `ChatPresenceController` et passé en argument) — voir le relèvement
 *  jumeau (absent) de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`. */
/** ⚠️ 292 → 294 le 27/09/2026 (intégration matin, lots g8-g25, fusionné en
 *  parallèle du lot g1 ci-dessous — base commune 292, mesuré séparément à
 *  l'intégration M du 27/09/2026 car les deux lots touchent des fichiers
 *  déjà comptés) : DEUX fichiers DÉJÀ comptés gagnent chacun UN import de
 *  plus — la signature d'un couplage qui se CONCENTRE, pas d'un fichier neuf
 *  (le compteur de fichiers jumeau ne bouge pas). `outreach-send.sweeper.ts`
 *  importe désormais `CrmService` (#2386.B, la porte d'écriture CRM après un
 *  envoi RÉEL, `@Optional()` — retirer `CrmModule` ne casse pas l'envoi).
 *  `projects.service.ts` importe désormais `CommercialTransitionsService`
 *  (#2320.7/#2320.23, épopée #2967 — le pivot de la chaîne commerciale
 *  rejoint enfin le journal APPEND-ONLY que #2320.23 a posé pour le reste de
 *  la chaîne). Voir aussi #2386.3 ci-dessous (lot g1) sur le MÊME fichier
 *  `outreach-send.sweeper.ts` : mesuré à la fusion M, pas recompté deux fois
 *  si les deux lots convergent sur le même import réel. */
/** ⚠️ 292 → 294 le 27/09/2026 (intégration g1, fusion de
 *  feat/epo-g5-27-09 et feat/epo-f15-27-09 dans integration-g1-27-09) : deux
 *  lots indépendants, deux fichiers DÉJÀ comptés, chacun +1 IMPORT — le
 *  compteur de fichiers jumeau ne bouge pas.
 *  `submissions.service.ts` (#2339.1-.13, épopée #2795) importe
 *  `CommercialTransitionsService` : le POSITIONNEMENT entre dans le journal
 *  besoin→shortlist→positionnement→mission au même titre que `delivery
 *  .service.ts` l'a déjà fait pour la mission (voir le paragraphe #2339.7
 *  ci-dessus, même épopée).
 *  `outreach-send.sweeper.ts` (#2386.3) importe `CrmService` (`@Optional()`,
 *  même garde que `LinkedInService.mirrorToCrm` déjà en place) pour refléter
 *  un envoi outreach CONFIRMÉ sur la fiche CRM — best-effort, jamais
 *  bloquant. 292 + 1 + 1 = 294, valeur relevée sur mesure réelle
 *  (`measured.imports`). */
/** ⚠️ 294 → 295 le 27/09/2026 (#2398.10, épopée #2843) : `routine-executors.ts`
 *  (fichier déjà compté, voir le relèvement jumeau de
 *  `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` qui ne bouge pas) importe UN service
 *  de plus, `IaClient` (module `ia`, `@Global()`), pour générer le brouillon de
 *  relance de l'étape « préparer les messages » de l'exemple de l'issue. 294 + 1
 *  = 295. */
/** ⚠️ 295 → 296 le 27/09/2026 (intégration k, #2369.11/.12, épopée #2768 —
 *  reléve manquée à la fusion de ce lot, corrigée ici sur MESURE RÉELLE) :
 *  `message-style.service.ts` est un fichier NEUF (voir le relèvement jumeau
 *  de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`) qui importe UN service d'un
 *  autre module — `EsnProfileReader` (module `esn-profile`), pour lire le
 *  contexte profil au moment de générer le message de comparaison. 295 + 1
 *  = 296. */
/** ⚠️ 296 → 299 le 27/09/2026 (#2875, #2402.1, vague F/G — les quatre
 *  émetteurs restants du moteur de déclencheurs canonique) : TROIS fichiers
 *  DÉJÀ comptés (`interventions.sweeper.ts` importait déjà `SingletonLockService`,
 *  `credits.service.ts` importait déjà `NotificationsService` et consorts)
 *  gagnent chacun UN import (`TriggerRegistryService`, module `trigger-registry`)
 *  pour persister leur `TriggerEvent` au registre canonique — voir le
 *  relèvement jumeau de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` pour le
 *  quatrième (`delivery-routines.service.ts`, un fichier NEUF dans ce
 *  périmètre). `ia-proxy.controller.ts` migre AUSSI `ao_publie`
 *  (`IaProxyController.discoverSignals`), mais un `*.controller.ts` est HORS
 *  PÉRIMÈTRE de cette garde (voir `sourceFiles`) : son import ne compte pas.
 *  296 + 3 = 299. */
/** ⚠️ 299 → 300 le 27/09/2026 (intégration k, #2339.1/.2/.5/.6/.11/.13, épopée
 *  #2795, LOT écrivain — relèvement en parallèle du lot #2875 juste au-dessus,
 *  même base 296, les deux s'additionnent) : `need-commercial-state.service.ts`
 *  est un fichier NEUF (voir le relèvement jumeau de
 *  `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`) qui importe UN service d'un autre
 *  module — `CommercialTransitionsService`, le MÊME journal APPEND-ONLY que
 *  `delivery.service.ts` (#2339.7) et `submissions.service.ts` (#2339.1-.13,
 *  voir les deux paragraphes ci-dessus) relisent déjà pour le lire au lieu de
 *  le recalculer (GA-26). Alternative écartée : ajouter les trois nouveaux
 *  dépôts (shortlists, submissions, missions) au constructeur DÉJÀ chargé de
 *  `ProjectPipelineService` aurait cassé sept fichiers de test qui le
 *  construisent positionnellement (`need-transition-history.spec.ts` et
 *  six voisins) pour un gain nul sur CE compteur (même fichier déjà compté,
 *  même import déjà compté). 298 + 1 = 299. */
/** ⚠️ INTÉGRATION M, 27/09/2026 : les deux lots ci-dessus (matin g8-g25 et g1)
 *  partent tous les deux de la base 292 et touchent le MÊME fichier
 *  `outreach-send.sweeper.ts` sur le MÊME import (`CrmService`,
 *  #2386.B/#2386.3 — même épopée, même import réel, ne compte qu'une fois),
 *  mais le lot matin g8-g25 ajoute AUSSI `projects.service.ts` →
 *  `CommercialTransitionsService`, absent du côté g1/k. Mesuré réel après
 *  fusion (`measured.imports`) : 300, pas 299 — un import de plus que la
 *  somme du seul paragraphe g1 ci-dessus, la déduplication du CRM ne
 *  compensant qu'à moitié l'apport propre du lot matin. Valeur figée sur la
 *  mesure, pas sur l'arithmétique des paragraphes. */
/** ⚠️ 300 → 301 le 28/09/2026 (lot V11, #2875, #2402.3) : `mailbox.service.ts`
 *  (fichier déjà compté, `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ne bouge pas)
 *  importe UN service de plus, `TriggerRegistryService` (module
 *  `trigger-registry`), pour persister l'événement canonique `reponse_positive`
 *  — même geste que `governance.service.ts` avant lui (#2875, 27/09). */
/** ⚠️ 300 → 301 le 28/09/2026 (passe 2, lot V19, #2995, #2403.38) :
 *  `laura.service.ts` (fichier déjà présent mais qui n'importait AUCUN
 *  service d'un autre module jusqu'ici — voir le relèvement jumeau de
 *  `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`) importe UN service,
 *  `ProvenanceService` (module `crm-core`), pour l'invalidation d'une
 *  suggestion sur correction humaine (« une correction humaine gagne
 *  toujours, quelle que soit sa date » — `CLAUDE.md` § Doctrine) :
 *  `lastHumanCorrectionAt` lit le MÊME journal `record_field_audit` que le
 *  CRM natif écrit déjà, plutôt qu'une seconde source qui finirait par
 *  diverger (GA-26). Même arbitrage que les relèvements précédents de ce
 *  compteur (`message-style.service.ts`, `need-commercial-state.service.ts`) :
 *  un import réel pour une capacité réelle, pas un raccourci de commodité.
 *  300 + 1 = 301. */
/** ⚠️ 301 → 302 le 28/09/2026 (#2205.42/#2205.61, épopée #2843, lot V21 passe
 *  2 — intégration U, relèvement en parallèle du lot V19 juste au-dessus,
 *  même base 300, les deux s'additionnent, deux imports réels) :
 *  `routine-executors.ts` est un fichier DÉJÀ compté (il importe déjà
 *  `MailboxService`/`IaClient`/plusieurs autres) qui importe UN service de
 *  plus — `CreditsService`, pour que `noReplyFollowUp` refuse un appel
 *  IA payé AVANT de le faire quand le solde d'enrichissement est épuisé
 *  (`hasEnrichmentCredit`, la même lecture SANS DÉBIT que l'enrichissement
 *  organigramme/contacts — GA-26, pas un second mécanisme de facturation).
 *  Le compteur de fichiers ne bouge pas (voir le test jumeau juste en
 *  dessous) : un fichier déjà couplé qui se couple un peu plus, pas un
 *  fichier neuf. 301 + 1 = 302. */
/** 28/09/2026 — intégration U sur main : V11 (+1, main) + V19 (+1) + V21 (+1)
 *  sur la même base 300, trois imports réels distincts : 300 + 3 = 303. */
/** 28/09/2026 soir — intégration W : 303 (main) + 2 (V34, ci-dessous, mesuré
 *  sur la base 300) = 305. */
/** ⚠️ 300 → 302 le 28/09/2026 (#2809, #2293.11/#2294.*, lot V34 — la
 *  découverte FRAÎCHE de contacts cross-comptes) : `contact-discovery
 *  .service.ts` est un fichier NEUF (voir le relèvement jumeau de
 *  `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`) qui importe DEUX services d'autres
 *  modules — `ContactsService` (`bulkInsert`, le chemin de collecte NORMAL,
 *  dédup incluse — pour que les contacts découverts entrent par la MÊME porte
 *  que ceux d'une analyse, jamais une seconde écriture) et `CreditsService`
 *  (`consumeEnrichmentCredit`, le MÊME pool que `contact_enrichment`, jamais
 *  un second moteur de débit). Alternative écartée : orchestrer depuis le
 *  contrôleur (hors périmètre, coût zéro) — refusé, la RÈGLE MÉTIER
 *  (chercher → persister → débiter UNIQUEMENT sur un résultat exploitable,
 *  jamais sur un échec fournisseur) appartient au service, pas à la route ;
 *  la disperser dans le contrôleur ferait de `ContactDiscoveryController` un
 *  second endroit où deviner cette règle. Un troisième import (`IaClient`,
 *  module `ia`) ne compte pas ici : son fichier (`ia.client.ts`) ne porte pas
 *  la sous-chaîne « service » que le motif de cette garde exige — mesuré,
 *  pas supposé. 300 + 2 = 302. */
/** ⚠️ 303 → 304 le 28/09/2026 (lot SRC4, #2159.35) : voir le relèvement jumeau
 *  de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ci-dessous — UN import réel
 *  (`ContactResolutionCorrectionsService`, module `contacts`) dans UN fichier
 *  NEUF pour cette garde (`import-writer.service.ts`). Les deux compteurs
 *  montent de 1 ensemble — signature d'un fichier nouveau, pas d'un couplage
 *  qui s'étend. 303 + 1 = 304. */
/** ⚠️ 303 → 305 le 28/09/2026 (lot SRC5 soir, #2844, #1952.6/.7) : deux
 *  passerelles Socket.IO NEUVES, `bulk-export.gateway.ts` et
 *  `multi-source-search.gateway.ts`, importent chacune `WorkspaceContextService`
 *  (module `workspace`) pour la MÊME question que `AnalysisGateway` /
 *  `UniversalImportGateway` posent déjà à l'entrée d'une salle : « ce job
 *  est-il dans l'espace de l'appelant ? ». Deux fichiers neufs, un import
 *  chacun — voir le relèvement jumeau de `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`
 *  ci-dessous. `bulk-matching.gateway.ts` (même lot) importe le MÊME service
 *  mais depuis un dossier plus profond (`consultants/matching/`, `../../workspace/…`)
 *  — hors de la portée de cette garde (un seul `../`), donc ne compte pas ici.
 *
 *  ⚠️ +2 le 28/09/2026 (même lot, #1952.5) : DEUX fichiers neufs de
 *  plus pour la réécriture de CV en lot — `bulk-cv-rewrite.gateway.ts`
 *  (même question `WorkspaceContextService` que les deux passerelles
 *  ci-dessus) et `bulk-cv-rewrite.service.ts`, qui importe `CreditsService`
 *  (module `credits`) pour débiter EXACTEMENT le crédit `cv_rewrite` du
 *  geste unitaire, consultant par consultant — jamais un second mécanisme
 *  de facturation, aucun prix de lot inventé (#1952.2 reste hors de cette
 *  tranche). Deux fichiers, un import chacun. */
/** 28/09/2026 soir — intégration Y : 303 + 1 (import-writer) + 2 (gateways) = 306. */
/** 29/09/2026 — W sur main (Y) : 306 + 2 (V34) = 308. */
/** ⚠️ 303 → 304 le 28/09/2026 (BEL-SC-224, #3253, intégration SC) :
 *  `demo-seed.service.ts` (fichier DÉJÀ compté — il importait déjà
 *  `ProjectsService` — `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ne bouge pas)
 *  importe UN service de plus, `WeakestLinkDiagnosisService` (module
 *  `weakest-link-diagnosis`), pour seeder `/briefing` et `/pilotage` avec un
 *  VRAI diagnostic calculé par la maison canonique plutôt qu'un chiffre
 *  inventé (craft rule n°9, `demo-dataset.ts`/`DemoSeedService`) — la même
 *  garde qui refuse un écran livré vide en démo refuse aussi un écran livré
 *  avec une donnée fictive. 303 + 1 = 304. */
/** 29/09/2026 — intégration SC : 308 (main) + 1 (R03 ci-dessous) + 1 (BEL-SC-224, ci-dessus) = 310. */
/** ⚠️ 308 → 309 le 29/09/2026 (lot R03, #2875, #2402.1/#2402.3) :
 *  `watchlist-refresh.worker.ts` importe `TriggerRegistryService` (module
 *  `trigger-registry`) — le septième émetteur migré au registre canonique
 *  des déclencheurs (`signal_nouveau`), même geste que `governance.service.ts`
 *  et `mailbox.service.ts` avant lui. Un import réel, un fichier neuf. 308 + 1 = 309. */
/** 29/09/2026 — intégration E : 310 (main) + 2 (#1952.5, src5, en tête de ce bloc) = 312. */
/** ⚠️ 312 → 313 le 30/09/2026 (lot C13, #3413.2, beta:metier #3413) :
 *  `routine-executors.ts` (fichier déjà compté, `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`
 *  ne bouge pas — même geste que le relèvement 294 → 295 ci-dessus, même
 *  fichier) importe UN service de plus, `MissionFeedbackService` (module
 *  `delivery`), pour le rappel du point à sept jours
 *  (`checkinJ7ForWorkspace`) — le double pouls de satisfaction déjà
 *  existant (#2412), jamais une seconde collecte. */
/** ⚠️ 313 → 314 le 30/09/2026 (lot F06, #2957, #2180.54) : `rfp.service.ts`
 *  (fichier déjà compté — il importait déjà `EsnProfileService`,
 *  `WorkspaceContextService`, `IaClient` — `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`
 *  ne bouge pas, même geste que les relèvements ci-dessus sur un fichier déjà
 *  compté) importe UN service de plus, `StorageService` (module `storage`),
 *  pour conserver le fichier BRUT d'un appel d'offres importé — même geste
 *  que `NeedDocumentsService`/`InvoiceAttachmentsController`, qui l'importent
 *  déjà pour la même raison. */
/** ⚠️ 314 → 315 le 07/10/2026 (lot P02, #3219, #190.2) : `analysis.persistence.ts`
 *  (fichier déjà compté — il importait déjà `AccountsService`, `ContactsService`,
 *  `WorkspaceContextService`, `ProjectsService`, `SignalHistoryService` —
 *  `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ne bouge pas) importe UN service de
 *  plus, `ProvenanceService` (module `crm-core`, via `CrmCoreModule`, déjà
 *  importé ailleurs par `CrmModule`/`DeliveryModule` pour la même capacité) :
 *  le premier écrivain RÉEL de `FieldChange.scope` — le périmètre d'analyse
 *  DÉCLARÉ d'un run (`AnalysisScopeMode`, jamais deviné) journalisé sur
 *  l'effectif collecté sous ce périmètre, calculé en PUR par
 *  `AccountsService.applyResearch` (`pipelineFieldScopeClaim`,
 *  `@bellum/contracts`) qui le REND à son appelant plutôt que de committer
 *  lui-même (même raison que `fieldProvenance` reste un REPOSITORY dans ce
 *  module : GA-07 ne monte pas DEPUIS `accounts`). */
/** ⚠️ 315 → 316 le 07/10/2026 (intégration demo-0810, lot G2) : `invoice-month-preparation.sweep.ts`,
 *  fichier NEUF, importe `singleton-lock.service` (module `locks`) pour qu'UNE seule réplique prépare
 *  les factures du mois — même geste, même dépendance transverse assumée que `TerritoryWatchService`
 *  (voir le quatrième relèvement en tête de fichier). Ce relèvement et celui de P02 ci-dessus sont
 *  INDÉPENDANTS (branches distinctes fusionnées séparément) : les deux comptent, le compteur monte de 2. */
/** ⚠️ 316 → 317 le 08/10/2026 (lot R24, #2422.6, épopée #2869) :
 *  `legal-contract-upload-link.service.ts`, fichier NEUF, importe `StorageService`
 *  (module `storage`) pour déposer la pièce qu'un contact externe envoie —
 *  même geste, même dépendance transverse assumée que `rfp.service.ts`
 *  (relèvement 313 → 314 ci-dessus) et `cv-zip-large-import.service.ts` : un
 *  service qui range des octets sans connaître de droit métier, importé par
 *  qui a déjà tranché ce droit (ici : la possession d'un jeton valide). */
/** ⚠️ 317 → 318 le 08/10/2026 (intégration P1, lot R25, #2916 / #2399.2) :
 *  `routine-executors.ts` importe `DataHygieneService` (module `pilotage`) pour que la routine
 *  « comptes sans prochaine action » réutilise le MÊME prédicat que le compteur du portefeuille
 *  (GA-26) au lieu de recompter. Indépendant du relèvement R24 ci-dessus : les deux comptent. */
/** ⚠️ 318 → 317 le 08/10/2026 (lot W01, #3851, #2916/#2399.2 — « on ne relève PAS une garde »,
 *  Louis 08/10) : le relèvement ci-dessus est DÉFAIT, pas seulement compensé ailleurs.
 *  `routine-executors.ts` n'importe plus `DataHygieneService` — le prédicat partagé
 *  (`ACCOUNT_HYGIENE_PREDICATES.noUpcomingTask`/`.followedAccounts`) est désormais interpolé par
 *  une fonction pure, `accountsWithoutNextActionCountSql`, posée dans
 *  `accounts/account-hygiene.sql.ts` à côté de `accountsWithoutNextActionSql` qui l'interpolait
 *  déjà (GA-26 : la règle vivait déjà là, elle n'est pas dupliquée). `data-hygiene.service.ts`
 *  (module `pilotage`) garde sa PROPRE requête, inchangée : GA-53 ne surveille que ce fichier et
 *  continue de vérifier qu'il référence les prédicats par leur nom, jamais une copie. Les deux
 *  appelants interpolent désormais la MÊME règle sans s'importer l'un l'autre — exactement ce que
 *  cette garde existe pour forcer. Net sur ce compteur : zéro depuis la veille (318 posé, 318
 *  retiré) ; le second compteur (`FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`) ne bougeait déjà pas pour
 *  ce relèvement (fichier déjà compté) et ne bouge donc pas non plus pour son retrait. */
/** ⚠️ 317 → 318 le 11/10/2026 (#4016 L7, décision Louis « veille de tout le portefeuille, plafond
 *  opérateur optionnel PAR PLAN ») : `watchlist-refresh.scheduler.ts` importe
 *  `PlanFeaturesService.planForWorkspace` pour lire le palier d'un espace depuis le cron. La
 *  résolution « palier = abonnement de l'OWNER de l'espace » vit à UN endroit (GA-26) — la
 *  réécrire en SQL dans le scheduler aurait évité ce relèvement sans rien éviter de plus : deux
 *  résolutions de palier auraient fini par diverger. `@Optional()`, et lue SEULEMENT quand un
 *  plafond par plan est posé. Le fichier était déjà compté (il importe le verrou singleton) :
 *  `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ne bouge pas. */
/** ⚠️ 318 → 319 le 12/10/2026 (#4073.1, intégration INT-FAITS) : `account-facts-export.service.ts` importe
 *  `WorkspaceContextService` pour résoudre l'espace de l'appelant avant de lire les faits — la
 *  résolution d'espace vit à UN endroit (GA-26), la réécrire ici en SQL en aurait fait une
 *  seconde. Fichier NEUF : `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` monte du même cran. */
/** ⚠️ 319 → 320 le 14/10/2026 (#4158.3, intégration mode équipe) : `workspace-invitation-expiry.sweeper.ts`
 *  importe le verrou singleton (`SingletonLockService`), comme les autres balayeurs. Fichier NEUF :
 *  `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` monte du même cran. */
/** 14/10/2026 — mode équipe, L5, #4158.28 : 320 + 5 = 325 (intégration passe 2). Le digest hebdomadaire du manager est un
 *  fichier NEUF (`manager-digest.service.ts`) qui compose quatre services d'autres modules — la
 *  notification dans l'app, le mailer, la liste de suppression, le contexte d'espace (rôle + accords
 *  nominatifs, pour savoir qui encadre l'équipe) — et son planificateur (`manager-digest.scheduler.ts`)
 *  prend le verrou singleton. Rien ne se réimplémente ici : écrire la notification, envoyer l'e-mail et
 *  lire un droit sont trois dérivations qui vivent à un seul endroit (GA-26). */
/** ⚠️ 325 → 326 le 14/10/2026 (#4167, lot L-D1) : `automation-rules.scheduler.ts` importe
 *  `SingletonLockService` pour que le passage du matin des automatisations n'ait lieu qu'une fois à N
 *  répliques — le même verrou que tous les balayeurs (`routines.scheduler.ts`…). Le réécrire aurait fait
 *  un second verrou. Fichier NEUF : `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` monte du même cran. Le reste
 *  du module (inscription, rédaction, ATS) passe par DEUX ports (`automation-ports.ts`) : aucun autre
 *  import de service voisin. */
/** ⚠️ 319 → 320 le 14/10/2026 (#4187/#4189, épopée #4184, lot CRM-FOURNISSEURS) : Zoho est un
 *  adaptateur de plus du registre (`crm-adapter.registry.ts` importe `ZohoService`, comme les cinq
 *  autres CRM — brancher un CRM = l'ajouter au registre, c'est le but de #4185). Deux fichiers
 *  NEUFS portent des imports de services d'autres modules, tous deux nécessaires : `zoho.service.ts`
 *  (même gabarit que `pipedrive.service.ts` : espace de travail + analytique) et
 *  `crm-read-sync.service.ts` (espace de travail ; le verrou singleton du cron). Le cron vit DANS ce
 *  service plutôt que dans un scheduler à part ou dans `crm-sync` : un fichier de moins, et
 *  `crm-sync` n'importe pas un service de plus du module `crm`. Voir `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE`. */
/** ⚠️ 320 → 321 le 14/10/2026 (même lot, #4189) : `integration-sync.worker.ts` (fichier déjà compté,
 *  `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ne bouge pas) importe UN service de plus,
 *  `CrmReadSyncService` — le bouton « Synchroniser et comprendre mes données » doit relire aussi
 *  Salesforce, Pipedrive, Attio, Odoo et Zoho depuis leur curseur. Même raison que `CrmSyncService`
 *  juste à côté : c'est le WORKER qui referme le run, donc c'est lui qui orchestre — le faire
 *  descendre en argument n'aurait pas évité l'appel, seulement caché le couplage. */
/** Intégration data 15/10 : L-D1 (+1) et CRM-FOURNISSEURS (+2) cumulés. */
/** ⚠️ 328 → 330 le 16/10/2026 (intégration vague 2) — deux fichiers NEUFS, mesuré 330 :
 *  · `crm-webhooks.service.ts` (#4189.7, w7) importe `CrmReadSyncService` et `CrmSyncService` : le
 *    webhook entrant déclenche la synchro CIBLÉE de l'espace, c'est exactement ces deux services qui
 *    la portent (HubSpot d'un côté, les autres CRM de l'autre) — les recopier serait pire.
 *  · `crm/crm-deal-facts-harvest.ts` (#3918.8, w4) importe `WorkspaceContextService` : même gabarit
 *    que les autres lecteurs CRM (l'espace de travail du compte). */
/** ⚠️ 330 → 331 le 19/10/2026 (intégration Ludovic) : `watchlist-refresh.worker.ts` (LUD.1) importe
 *  `EsnProfileService` — le domaine d'offre de l'espace qui suit le compte décide quels marchés attribués
 *  relire ; recopier la résolution du profil serait pire. Mesuré 331. */
/** ⚠️ 330 → 331 le 18/10/2026 (SCOPES-I) — UN fichier NEUF, `connector-scope-gaps.service.ts`, importe
 *  `NotificationsService` : prévenir UNE fois l'utilisateur dont la connexion date d'avant l'ajout d'une
 *  portée passe par le centre de notifications (plafond de proactivité, SMS, préférences) — une seconde
 *  porte d'écriture dans `notifications` contournerait tout cela. Les CINQ connecteurs (HubSpot,
 *  Microsoft, Google, Zoho, Pipedrive), eux, ne l'importent PAS : ils dépendent du contrat
 *  `scope-gap-recorder.port.ts`, sans « service » dans le chemin. */
/** 19/10/2026 — SYNC-A (miroir CRM) : 331 + 1 = 332 (cumulé avec SCOPES-I). `crm-mirror/crm-mirror.service.ts` importe
 *    `WorkspaceContextService` pour REFUSER de copier le CRM d'un autre espace actif dans celui-ci
 *    (les adaptateurs lisent l'espace actif de la personne qui a branché le CRM) — même gabarit que
 *    `crm-deal-facts-harvest.ts` ; recopier la résolution d'espace serait pire (GA-26). */
/** ⚠️ 332 → 335 (cumulé : SCOPES-I +1, SYNC-A +1, SYNC-C +3) le 19/10/2026 (SYNC-C, synchro CRM toutes les 15 min) — un fichier NEUF, un existant :
 *  · `crm-sync/crm-frequent-sync.service.ts` importe `CrmReadSyncService` (le passage fréquent EST la
 *    relecture incrémentale, la réécrire serait pire) et `SingletonLockService` (le verrou par couple
 *    espace-fournisseur, même gabarit que tous les balayages) ;
 *  · `crm-webhooks.service.ts` importe ce service : le webhook met la synchro ciblée EN FILE (dédoublonnée
 *    30 s) au lieu de lire en tâche de fond dans la requête. */
/** 19/10/2026 — fusion de l'intégration Ludovic (+1, watchlist-refresh → EsnProfileService) avec SYNC (335) : 336. */
/** 19/10/2026 — refusion de la vague 4 sur main : les deux côtés additionnés (main 336 + vague 4 : +1 pour
 *  `watchlist-refresh.worker.ts` → AnalysisService, +1 pour `technology-radar.controller.ts` → WorkspaceContextService,
 *  cf. ci-dessous) — valeur MESURÉE par la garde. */
/** (vague 4) ⚠️ 330 → 331 le 19/10/2026 (intégration vague 4) — mesuré 331 :
 *  · `watchlist-refresh/watchlist-refresh.worker.ts` (#4267.5, lot RESTES) importe `AnalysisService` : un
 *    compte suivi explicitement est RÉ-ANALYSÉ quand sa dernière analyse a plus de 15 jours — c'est le
 *    worker qui referme le passage, donc lui qui lance l'analyse (même raison que `integration-sync.worker`).
 *  · `ia-proxy/technology-radar.controller.ts` (#4282.10, lot RADAR) importe `WorkspaceContextService` :
 *    l'orchestration vit dans le CONTRÔLEUR, là où la garde la demande ; l'espace de travail est la seule
 *    lecture (même gabarit que les autres contrôleurs du proxy). */
/** ⚠️ 336 → 337 le 19/10/2026 (LUDOVIC-C LC.1) : `contacts.service.ts` importe `EsnProfileReader` (module
 *  léger, sans Auth ni Mailer) — le pack et les zones du profil réordonnent le chemin recommandé à la
 *  LECTURE ; recopier la résolution du profil d'espace serait pire. Mesuré 337. */
/** 20/10/2026 — refusion de main (LUDOVIC-C) dans la vague 4 : 338 (vague 4) + 1 (LUDOVIC-C LC.1) = 339. */
/** ⚠️ 339 → 340 le 20/10/2026 (intégration PR n°2, PLAN-GATE #4381) : `admin.service.ts` importe
 *  `WorkspaceContextService` — le plan du back-office se pose sur le PROPRIÉTAIRE de l'espace, que seul ce
 *  service résout (le recopier serait une seconde définition). Le fichier comptait déjà d'autres services :
 *  le compteur de fichiers ne bouge pas. Mesuré 340. */
/** ⚠️ 340 → 341 le 20/10/2026 (intégration PR n°2b, refusion de main #4382 CLIENTS) : `admin-users.service.ts`
 *  (CEDRIC-FIX C.10, crédits du back-office) importe `creditCapacity` de `credits.service` — la capacité d'un
 *  compte se lit là où le débit la calcule, la recopier serait une seconde définition. Chaque côté avait ajouté
 *  UN import indépendant (main : 339 ; PR n°2 : 340 avec PLAN-GATE) : leur somme est 341, mesurée 341. */
/** ⚠️ 341 → 343 le 21/10/2026 (intégration PR n°3, #4427 Lemlist) : `lemlist.service.ts` est un fichier NEUF qui
 *  importe DEUX services (`WorkspaceContextService` — l'espace actif est sa seule lecture, et
 *  `OutboundWriteService` — l'ajout à une campagne passe par la porte d'écriture, jamais une seconde porte).
 *  Les deux compteurs montent ensemble (343 / 168) : la signature d'un fichier neuf, pas d'un couplage qui s'étend. */
/** ⚠️ 343 → 345 (branche) le 22/10/2026 (Théo D team-review) : `manager/team-review.service.ts` est un fichier NEUF qui importe
 *  DEUX services — `ActionPlanItemsService` (les décisions du point d'équipe passent par la porte de création du plan,
 *  qui reconnaît le doublon : « mises à jour, jamais dupliquées » ; une seconde porte réécrirait cette règle) et
 *  `WorkspaceContextService` (l'espace actif). Les deux compteurs montent ensemble (345 / 169) : la signature d'un
 *  fichier neuf, pas d'un couplage qui s'étend. */
/** ⚠️ 344 → 346 (refusion R23 : 343 + 1 main #4467 + 2 branche) le 22/10/2026 (#4467, back-office : consommation de crédits) : `credit-consumption.ts` est un fichier NEUF
 *  qui importe `creditCapacity` et `nextResetFor` de `credits.service` — « son plafond » et « son prochain
 *  renouvellement » n'ont chacun qu'une définition (celle qui refuse une analyse), la recopier en aurait deux. Les deux
 *  compteurs montent ensemble (344 / 169) : la signature d'un fichier neuf, pas d'un couplage qui s'étend. */

/** ⚠️ 343 → 345 le 22/10/2026 (Théo D, écrans Équipe) : DEUX fichiers neufs importent chacun
 *  `WorkspaceContextService` — l'espace actif et l'appartenance du membre sont leur seule lecture, comme
 *  `objectives.service.ts` voisin. `objective-proposals.service.ts` (une direction PROPOSE une cible, le membre
 *  répond) et `manager-member.service.ts` (la fiche d'un membre). Les deux compteurs montent ensemble (345 / 170) :
 *  la signature de deux fichiers neufs, pas d'un couplage qui s'étend. */
/** ⚠️ 345 → 347 le 22/10/2026 (Théo D, team-business / team-plans) : `manager-team-views.service.ts` est un fichier
 *  NEUF qui importe DEUX services (`WorkspaceContextService` — l'espace actif et la permission `team:manage` — et
 *  `BusinessUnitService` — le périmètre BU, fail-closed), comme `manager.service.ts` voisin. 347 / 171. */
/** ⚠️ Intégration PR11 : 346 (main) + 4 (Théo D, écrans Équipe : 2 + 2 services) = 350 ; fichiers 170 + 3 = 173. */
/** ⚠️ 346 → 349 le 23/10/2026 (intégration PR10, #4462.9) : `analysis/laura-batch-follow.service.ts` est un fichier NEUF
 *  qui importe TROIS services — `AccountsService` (les comptes du lot se lisent là où ils sont écrits),
 *  `NotificationsService` (la fin de lot passe par la porte de notification, jamais une seconde) et
 *  `WorkspaceContextService` (l'espace actif). Les deux compteurs montent ensemble (349 / 171) : la signature d'un
 *  fichier neuf, pas d'un couplage qui s'étend. */
/** ⚠️ Intégration refonte locale (23/10/2026) : 350 (PR11 + Théo D) + 3 (main, PR10 `laura-batch-follow`) = 353. */
/** ⚠️ 353 → 354 le 26/10/2026 (intégration vague X, #4599) : `contacts/placeholder-email-catchup.service.ts` est un
 *  fichier NEUF qui importe UN service — `ProvenanceService` (`crm-core`) — pour lire la provenance de l'adresse
 *  avant de la vider : « une correction humaine gagne toujours », donc une adresse de provenance `human` n'est
 *  jamais rattrapée. La provenance a UNE définition, celle qui l'écrit ; la recopier en aurait deux, et le
 *  rattrapage écraserait un jour une valeur gardée par un humain. Le service voisin du même module
 *  (`contacts.service.ts`) lit déjà la même porte. Les deux compteurs montent ensemble (354 / 175) : la signature
 *  d'un fichier neuf, pas d'un couplage qui s'étend. */
/** ⚠️ 354 → 355 le 29/10/2026 (#4803) : `contacts/contact-enrichment.service.ts` reçoit `WorkspaceContextService`
 *  (`workspace`) par son constructeur, comme `ContactsService` — la clé d'un geste sur un contact est l'ESPACE de
 *  l'appelant, et seul ce service sait le résoudre (GA-26 : un endroit). Le fichier n'importait aucun service d'un
 *  autre module ; les deux compteurs montent ensemble (355 / 176). */
/** ⚠️ 355 → 356 le 01/11/2026 (#4804, épopée #4731) : `outreach/outreach-cadence.service.ts` reçoit
 *  `WorkspaceContextService` — la cadence d'une séquence se pilote par tout coéquipier de l'ESPACE
 *  (`workspaceGestureWhere`), plus par le seul propriétaire. Même dépendance transverse que #4803. */
const SERVICE_TO_SERVICE_AT_FREEZE = 356
/**
 * Le SECOND compteur, et il monte de 1 pour la même raison : `odoo.service` est
 * un fichier de plus qui importe des services d'un autre module.
 *
 * Les deux mesures existent pour empêcher de tricher dans un sens ou dans
 * l'autre — remplacer dix imports par un dans le même fichier ferait baisser le
 * premier sans rien découpler, et étaler deux imports sur deux fichiers ferait
 * monter le second sans rien coupler de plus. Ici les deux bougent ensemble, ce
 * qui est la signature d'un fichier NEUF plutôt que d'un couplage qui s'étend.
 *
 * ⚠️ 121 → 123 le 01/09/2026 (marque blanche). DEUX fichiers de plus pour
 * SEPT imports, et l'écart est la mesure elle-même : cinq des sept services
 * concernés importaient DÉJÀ un service d'un autre module, donc ils étaient
 * déjà comptés une fois. Seuls `mfa.service` et `documents.service` sont
 * nouveaux dans cette liste. C'est exactement la signature qu'on cherche —
 * un couplage qui se CONCENTRE (une dépendance, sept lecteurs) et non un
 * couplage qui s'étend (sept dépendances éparpillées).
 */
/** ⚠️ 123 → 124 le 02/09/2026 : UN fichier neuf (`manual-billing-sweep.service`)
 *  pour UN import. Les deux compteurs montent de 1 ensemble — la signature d'un
 *  fichier nouveau, pas d'un couplage qui se répand. */
/** ⚠️ 124 → 125 le 15/09/2026 (#2155, « Mes cibles ») : UN fichier neuf
 *  (`target-lists.service`) pour UN import (`WorkspaceContextService`). Les deux
 *  compteurs montent de 1 ensemble — encore la signature d'un fichier nouveau. */
/** ⚠️ 125 → 126 le 15/09/2026 (#2231, balayage de régénération des contextes de
 *  profil) : UN fichier neuf (`admin-profile-contexts.service.ts`) pour UN
 *  import (`EsnProfileService`). Les deux compteurs montent de 1 ensemble —
 *  encore la signature d'un fichier nouveau, pas d'un couplage qui s'étend. */
/** ⚠️ 126 → 127 le 16/09/2026 (intégration de la vague 21, #1931.20) :
 *  `copilot-card.service.ts` n'importait aucun service d'un autre module, il en
 *  importe UN (`ActivitiesService`). Les deux compteurs montent de 1 ensemble —
 *  voir le relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE`. */
/** ⚠️ 127 → 128 le 17/09/2026 (#2165.28 / #2165.30) : `discover-market-memory
 *  .service.ts` est un fichier NEUF qui importe UN service (`MarketMemoryService`).
 *  Les deux compteurs montent de 1 ensemble — voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE`. */
/** ⚠️ 128 → 129 le 18/09/2026 (#2568.1) : `cv-batch-import.service.ts` est un
 *  fichier NEUF qui importe UN service (`MailboxService`). Les deux compteurs
 *  montent de 1 ensemble — voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE`. */
/** ⚠️ 129 → 130 le 18/09/2026 (#2018.7, signaler une information d'entreprise
 *  fausse sans l'écraser) : `esn-profile-correction-request.service.ts` est un
 *  fichier NEUF qui importe DEUX services (`WorkspaceContextService`,
 *  `NotificationsService`) — le fichier compteur monte de 1, le compteur
 *  d'imports de 2 (voir le relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE`,
 *  +2). Les deux dépendances servent UN seul geste : résoudre l'espace du
 *  rapporteur (#2018.7) et réutiliser le canal de notification EXISTANT pour
 *  atteindre les administrateurs (#2018.8, GA-26 — un réglage vit à un seul
 *  endroit, jamais un second système). Aucune alternative gratuite : dupliquer
 *  la résolution d'espace ou le canal de notification dans ce module serait une
 *  SECONDE définition des deux, avec le risque de diverger de celle que
 *  `EsnProfileController` utilise déjà pour les autres routes. */
/** ⚠️ 130 → 131 le 18/09/2026 (#2151.59, vague M — cinquième relèvement, voir
 *  le docblock jumeau de `SERVICE_TO_SERVICE_AT_FREEZE`) :
 *  `discover-candidate-notes.service.ts` est un fichier NEUF qui importe UN
 *  service (`WorkspaceContextService`, ASSUMÉ). Les deux compteurs montent de
 *  1 ensemble — signature d'un fichier nouveau. Les DEUX autres franchissements
 *  qu'apportait ce lot (`accounts.service.ts`, `demo-seed.service.ts`) ont été
 *  ÉVITÉS : ni l'un ni l'autre ne touche ce compteur-ci, tous deux comptaient
 *  déjà d'autres services avant ce lot. */
/** ⚠️ 131 → 132 le 20/09/2026 (#2643.1) : voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus. */
/** ⚠️ 132 → 133 le 20/09/2026 (#2643.3) : voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus. */
/** ⚠️ 133 → 134 le 21/09/2026 (#2035.11, voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE`) : `commercial-load-settings.service.ts`
 *  est un fichier NEUF qui importe UN service (`WorkspaceContextService`).
 *  Les deux compteurs montent de 1 ensemble — signature d'un fichier nouveau. */
/** ⚠️ 134 → 135 le 21/09/2026 (#2650.2) : voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus — deux branches, deux fichiers
 *  réels, les deux relèvements s'additionnent (intégration vague 6). */
/** ⚠️ 135 → 136 le 22/09/2026 (#2455, contextes de travail) : voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus —
 *  `work-contexts.service.ts` est le fichier NEUF, `analysis.gateway.ts` (déjà
 *  redescendu) ne compensait que des IMPORTS, jamais un fichier de moins :
 *  il comptait encore au moins un import cross-module avant comme après. */
/** ⚠️ 136 → 137 le 25/09/2026 (#2775) : voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus — `profile-context.service.ts`
 *  entre dans le périmètre compté avec son premier import cross-module
 *  `*service*`. */
/** ⚠️ 137 → 138 le 25/09/2026 : voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus (#2777) — `account-memory.service.ts`
 *  est le fichier NEUF qui entre dans le périmètre compté avec son premier
 *  import cross-module `*service*` (`WorkspaceContextService`). */
/** ⚠️ 138 → 139 le 25/09/2026 (#2320.23, épopée #2967) : `project-pipeline
 *  .service.ts` est le fichier NEUF, `CommercialTransitionsService`
 *  (`commercial-transitions` module, exporté pour être consommé — c'est son
 *  seul métier) le service importé. Les deux compteurs montent de 1
 *  ensemble — signature d'un fichier nouveau, pas d'un couplage qui s'étend.
 *  Relèvement en parallèle du lot #2777 juste au-dessus (base commune 137) :
 *  les deux s'additionnent, deux fichiers réels. */
/** ⚠️ 139 → 140 le 25/09/2026 (intégration vague 52, épopée #2980, première
 *  synchronisation — job BullMQ réel) : `integration-sync.worker.ts` est un
 *  fichier NEUF qui importe UN service (`CrmSyncService`). L'orchestration
 *  inter-modules vivait déjà (#3014) dans `integration-sync.controller.ts` —
 *  HORS PÉRIMÈTRE de cette garde (les `*.controller.ts` sont exclus, voir le
 *  docblock du fichier) — et déménage dans le worker parce que le travail
 *  doit désormais survivre à un redémarrage de l'API. Les deux compteurs
 *  montent de 1 ensemble — signature d'un fichier nouveau, pas d'un
 *  couplage qui s'étend. Relèvement en parallèle du lot #2777/#2967 juste
 *  au-dessus (même base 137) : les deux s'additionnent. */
/** ⚠️ 140 → 141 le 26/09/2026 (intégration matin A, épopée #2977) : voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus —
 *  `admin-workspace-health.service.ts` est le fichier NEUF. */
/** #2843 (rappel de REX en attente, intégration matin B) ne touche pas ce
 *  compteur — voir le relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE`
 *  ci-dessus : fichier déjà compté, imports seuls montent. */
/** ⚠️ 141 → 142 le 26/09/2026 (intégration chantier A, #3069) : voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus —
 *  `outreach-send.sweeper.ts` est le fichier NEUF. */
/** #3086 (intégration soir 3, 26/09/2026) ne touche pas ce compteur :
 *  `chat-presence.service.ts` (présence sur un fil) est un fichier NEUF, mais
 *  résolu à la fusion pour NE PAS importer `WorkspaceContextService` — la
 *  démonstration (`isDemoWorkspace`) est décidée par l'appelant
 *  (`ChatPresenceController`) et passée en argument, même raison que
 *  `ia-proxy.controller.ts` pour le tour de chat lui-même (GA-07 : ce
 *  service ne va pas chercher lui-même un service d'un autre module). */
/** ⚠️ 294 → 295 le 27/09/2026 (#2398.10, épopée #2843) : `routine-executors.ts`
 *  (fichier déjà compté, `FILES_WITH_SERVICE_IMPORTS_AT_FREEZE` ne bouge pas)
 *  importe UN service de plus, `IaClient` (module `ia`, `@Global()`), pour
 *  générer le brouillon de relance de l'étape « préparer les messages » de
 *  l'exemple de l'issue. Le même lot avait besoin d'un second garde
 *  (`WorkspaceContextService`, salle de démonstration) : ÉVITÉ, sur le modèle
 *  de `chat-presence.service.ts` juste au-dessus — `RoutinesService.runDueFor`
 *  (le SEUL appelant de `RoutineExecutors.run`, contrôleur et scheduler
 *  confondus) pose déjà ce garde tout en haut et ne descend jamais jusqu'à
 *  l'exécuteur pour un espace de démonstration ; l'importer une deuxième fois
 *  ici aurait re-vérifié ce que l'appelant garantit déjà, pour le prix d'un
 *  couplage de plus. `IaClient`, lui, reste nécessaire : générer un texte est
 *  un appel réseau réel, pas une valeur qu'on pourrait faire descendre en
 *  argument. */
/** ⚠️ 142 → 143 le 27/09/2026 (intégration k, #2369.11/.12, épopée #2768 —
 *  relèvement manqué à la fusion de ce lot, corrigé ici sur MESURE RÉELLE,
 *  voir le relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus) :
 *  `message-style.service.ts` est le fichier NEUF. Les deux compteurs
 *  montent de 1 ensemble — signature d'un fichier nouveau. */
/** ⚠️ 143 → 144 le 27/09/2026 (#2875, #2402.1, vague F/G) : voir le relèvement
 *  jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus — `delivery-routines
 *  .service.ts` est le seul fichier NEUF des quatre émetteurs migrés (les
 *  trois autres importaient déjà un service d'un autre module). */
/** ⚠️ 144 → 145 le 27/09/2026 (intégration k, #2339.1/.2/.5/.6/.11/.13, épopée
 *  #2795, LOT écrivain — relèvement en parallèle du lot #2875 juste au-dessus,
 *  même base 143, les deux s'additionnent, deux fichiers réels) : voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus —
 *  `need-commercial-state.service.ts` est le fichier NEUF. Les deux compteurs
 *  montent de 1 ensemble — signature d'un fichier nouveau, pas d'un couplage
 *  qui s'étend. */
/** ⚠️ 145 → 146 le 28/09/2026 (passe 2, lot V19, #2995, #2403.38) : voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus —
 *  `laura.service.ts` est le fichier NEUF pour cette garde (son premier
 *  import de service d'un autre module). */
/** ⚠️ 145 → 146 le 28/09/2026 (#2809, #2293.11/#2294.*, lot V34) : voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus —
 *  `contact-discovery.service.ts` est le fichier NEUF. Les deux compteurs ne
 *  montent PAS ensemble cette fois (+1 fichier, +2 imports) : un fichier neuf
 *  qui importe deux services distincts en un coup, pas un service déjà connu
 *  qui gagne un import de plus. */
/** 28/09/2026 soir — intégration W : + `contact-discovery.service.ts` (V34, fichier neuf). */
/** ⚠️ 146 → 147 le 28/09/2026 (lot SRC4, #2159.35) : `import-writer.service.ts`
 *  est le fichier NEUF pour cette garde — son propre docblock de tête
 *  (`import.module.ts`) explique pourquoi ce n'est PAS une exception à « il
 *  écrit par REPOSITORIES, pas par services » : `ContactResolutionCorrectionsService
 *  .rejectedContactIds` est une LECTURE d'un registre de décisions humaines
 *  déjà prises (« ce n'est pas la même personne »), jamais un chemin de
 *  création. La dérivation (compter la version la plus haute par contact,
 *  DISTINCT ON) vit à un seul endroit (GA-26) — la réimplémenter en SQL
 *  directement dans `import-writer.service.ts` aurait évité ce relèvement
 *  sans rien éviter de plus : la même requête aurait fini par diverger de
 *  celle qu'expose `ContactResolutionCorrectionsController` le jour où l'une
 *  des deux change. 146 + 1 = 147. */
/** ⚠️ 146 → 148 le 28/09/2026 (lot SRC5 soir, #2844, #1952.6/.7) : voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus —
 *  `bulk-export.gateway.ts` et `multi-source-search.gateway.ts` sont les deux
 *  fichiers NEUFS. Les deux compteurs montent de 1 chacun, ensemble —
 *  signature de deux fichiers nouveaux, pas d'un couplage qui s'étend.
 *
 *  ⚠️ +2 le 28/09/2026 (même lot, #1952.5) : voir le relèvement
 *  jumeau ci-dessus — `bulk-cv-rewrite.gateway.ts` et
 *  `bulk-cv-rewrite.service.ts` sont les deux fichiers NEUFS. */
/** 28/09/2026 soir — intégration Y : 146 + 1 + 2 = 149. */
/** 29/09/2026 — W sur main (Y) : 149 + 1 (V34) = 150. */
/** 29/09/2026 — intégration E : 150 (main) + 2 (#1952.5, src5) = 152. */
/** 07/10/2026 — intégration demo-0810 : 152 + 1 (sweep des factures, verrou singleton) = 153. */
/** 08/10/2026 — lot R24, #2422.6 : 153 + 1 (`legal-contract-upload-link.service.ts`, voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus) = 154. */
/** 12/10/2026 — INT-FAITS, #4073.1 : 154 + 1 (`account-facts-export.service.ts`, voir le relèvement
 *  jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus) = 155. */
/** 14/10/2026 — intégration mode équipe, #4158.3 : 155 + 1 (`workspace-invitation-expiry.sweeper.ts`, voir le
 *  relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus) = 156. */
/** 14/10/2026 — mode équipe, L5, #4158.28 : 156 + 2 (`manager-digest.service.ts` et
 *  `manager-digest.scheduler.ts`, voir le relèvement jumeau de `SERVICE_TO_SERVICE_AT_FREEZE`) = 158. */
/** 14/10/2026 — lot L-D1, #4167 : 158 + 1 (`automation-rules.scheduler.ts`, voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus) = 159. */
/** ⚠️ 155 → 157 le 14/10/2026 (#4187/#4189, lot CRM-FOURNISSEURS) : `zoho.service.ts` et
 *  `crm-read-sync.service.ts` sont les deux fichiers NEUFS — voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus. */
/** Intégration data 15/10 : L-D1 (+1) et CRM-FOURNISSEURS (+2) cumulés. */
/** 16/10/2026 — intégration vague 2 : 161 + 2 (`crm-webhooks.service.ts` #4189.7 et
 *  `crm/crm-deal-facts-harvest.ts` #3918.8, voir le relèvement jumeau ci-dessus) = 163. */
/** 18/10/2026 — SCOPES-I : 163 + 1 (`connector-scope-gaps.service.ts`, voir le relèvement jumeau
 *  ci-dessus) = 164. */
/** 19/10/2026 — SYNC-A : 164 + 1 = 165 (`crm-mirror/crm-mirror.service.ts`, voir le relèvement jumeau). */
/** 19/10/2026 — SYNC-C : 165 + 1 (`crm-sync/crm-frequent-sync.service.ts`, voir le relèvement jumeau de
 *  `SERVICE_TO_SERVICE_AT_FREEZE` ci-dessus) = 166. */
/** 20/10/2026 — intégration vague 5 : 166 + 1 = 167. `consultants/talent-message-draft.service.ts` (lot
 *  MESSAGES-LAURA / FICHE-CONSULTANT) importe `WorkspaceContextService` : l'espace actif est sa seule lecture,
 *  le brouillon de message d'un consultant se rédige dans SON espace — même gabarit que les autres services
 *  du module Consultants. (Le relèvement jumeau du total n'est pas nécessaire : le plafond de 338 avait de la marge.) */
/** 21/10/2026 — intégration PR n°3 : 167 + 1 = 168 (`lemlist/lemlist.service.ts`, voir le relèvement jumeau ci-dessus). */
/** 22/10/2026 — Théo D team-review : 168 + 1 = 169 (`manager/team-review.service.ts`, voir le relèvement jumeau ci-dessus). */
/** 22/10/2026 — refusion R23 : #4467 (`credit-consumption.ts`, main) s'ajoute à Théo D : 169 + 1 = 170. */
/** 22/10/2026 — Théo D, écrans Équipe : 168 + 2 = 170 (voir le relèvement jumeau ci-dessus). */
/** 22/10/2026 — Théo D : 170 + 1 = 171 (`manager/manager-team-views.service.ts`). */
/** 23/10/2026 — intégration PR10 : 170 + 1 = 171 (`analysis/laura-batch-follow.service.ts`, voir le relèvement jumeau). */
/** 23/10/2026 — intégration refonte locale : 173 (PR11 + Théo D) + 1 (main, PR10) = 174. */
/** 26/10/2026 — intégration vague X : 174 + 1 = 175 (`contacts/placeholder-email-catchup.service.ts`, voir le
 *  relèvement jumeau ci-dessus). */
/** 29/10/2026 — #4803 : 175 + 1 = 176 (`contacts/contact-enrichment.service.ts`, voir le relèvement jumeau ci-dessus). */
/** 01/11/2026 — #4804 : 176 + 1 = 177 (`outreach/outreach-cadence.service.ts`, relèvement jumeau ci-dessus). */
const FILES_WITH_SERVICE_IMPORTS_AT_FREEZE = 177

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!entry.endsWith('.ts')) continue
    if (entry.endsWith('.spec.ts') || entry.endsWith('.d.ts')) continue
    if (entry.endsWith('.module.ts') || entry.endsWith('.controller.ts')) continue
    out.push(full)
  }
  return out
}

function moduleNames(): Set<string> {
  return new Set(readdirSync(MODULES).filter(entry => statSync(join(MODULES, entry)).isDirectory()))
}

describe('GA-07 — les frontières de modules ne se dégradent plus', () => {
  const modules = moduleNames()
  const pattern = /from '\.\.\/([a-z0-9-]+)\/([a-zA-Z0-9.-]+)'/g

  const measured = sourceFiles(MODULES).reduce(
    (acc, file) => {
      const source = readFileSync(file, 'utf8')
      const hits = [...source.matchAll(pattern)].filter(
        match => modules.has(match[1] as string) && (match[2] as string).includes('service'),
      )
      if (hits.length > 0) {
        acc.imports += hits.length
        acc.files += 1
      }
      return acc
    },
    { imports: 0, files: 0 },
  )

  it('inspecte des fichiers ET trouve des imports de service : 0 inspecté serait un faux vert (#4682.4)', () => {
    expect(modules.size).toBeGreaterThan(0)
    expect(measured.imports).toBeGreaterThan(0)
    expect(measured.files).toBeGreaterThan(0)
  })

  it('aucun service ne va chercher un service de plus qu’aujourd’hui', () => {
    // Si ce test tombe : ton service importe celui d'un autre module. Passe par
    // un contrat partagé (`packages/contracts`), un événement, ou fais
    // l'orchestration dans le contrôleur — c'est là que vit un geste utilisateur.
    expect(measured.imports).toBeLessThanOrEqual(SERVICE_TO_SERVICE_AT_FREEZE)
  })

  it('le nombre de fichiers concernés ne remonte pas non plus', () => {
    // Deux mesures plutôt qu'une : remplacer dix imports par un seul dans le
    // même fichier ferait baisser le premier chiffre sans rien découpler.
    expect(measured.files).toBeLessThanOrEqual(FILES_WITH_SERVICE_IMPORTS_AT_FREEZE)
  })

  it('le plafond figé reste proche du réel — un plafond trop haut ne garde rien', () => {
    // Quand le réel descend nettement sous le plafond, c'est le plafond qu'il
    // faut baisser, sinon la garde se met à tolérer une régression de vingt.
    expect(SERVICE_TO_SERVICE_AT_FREEZE - measured.imports).toBeLessThanOrEqual(20)
  })
})
