# Addendum final (2 août 2026) — ce qui est fait, ce qui reste, ce qu'on ne promet pas

Triage du rapport `BELLUMAI_ADDENDUM_FINAL_PAGES_69_PLUS` (94 pages, 92 sections)
contre le code réel, et état d'exécution.

Quatre arbitrages produit ont été pris avec Louis le 02/08 avant de coder :

| Question                     | Décision                                                                   |
| ---------------------------- | -------------------------------------------------------------------------- |
| Sévérité du filtre Découvrir | Exclusion **dure sur preuve uniquement** ; le douteux va en « à vérifier » |
| Noms de fournisseurs         | **Tout masquer côté app** — seule exception documentée ci-dessous          |
| Périmètre                    | **NOW + NEXT complets**                                                    |
| Approbations                 | **N2 par défaut**, N3 au-delà de 10 cibles ou 20 crédits                   |

Quatre autres tranchés en seconde passe :

| Question              | Décision                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery & Finance OS | **Objets et workflows, PAS la facture légale** (mentions, TVA, numérotation, archivage). Portails hors périmètre tant qu'aucun usage n'est validé |
| Intake RFP            | **PDF + Word + Excel** d'emblée                                                                                                                   |
| Écran Besoins         | **Progression unique** — les 4 onglets de nature disparaissent                                                                                    |
| Barème Découvrir p41  | **Adopté**, accessibilité déclarée NON MESURÉE au stade registre                                                                                  |

> **Exception au masquage.** L'écran Réglages › Intégrations garde les noms :
> un bouton « Connecter » doit dire ce qu'il connecte, et c'est l'utilisateur
> qui autorise. Partout ailleurs — copilote, dossiers, contacts, séquences,
> notifications, plans de compte — on nomme la capacité (« votre CRM »).
> À rediscuter si Louis veut aussi masquer là.

---

## 1. Livré

### Copilote (p5-16)

- Prompt système refondu en **cinq blocs** : identité/mission/vocabulaire/ton ;
  hiérarchie de contexte et statuts de vérité ; outils, prévisualisation,
  approbation, idempotence, résultat ; sécurité conversationnelle ; formats de
  réponse par intention. `apps/ia/app/prompts/bellum_advisor.py`.
- **Anti-divulgation** : le digest d'outils devient un digest de CAPACITÉS,
  agrégé par famille (`tool-capability-digest.ts`). Un test refuse tout nom
  d'éditeur dans le prompt (`test_copilote_prompt_blocks.py`).
- **Jeu d'évaluation sécurité** : 14 scénarios couvrant les sept familles
  d'attaque de la p13, plus la vérification qu'aucun outil du copilote n'a de
  chemin d'écriture ni d'accès au solde (`test_copilote_security_eval.py`).
- **Amorces exécutables** : les huit familles de la p9, pastille courte /
  commande complète.
- **Prévisualisation avant approbation** : cible, canal, échéance, ce qui sera
  écrit, coût en crédits (`PendingActions.tsx`).

### Action OS (p20-33)

- Contrats : `WorkflowDefinition`, `WorkflowRun`, `ApprovalRequest`,
  `CreditReservation`, `RetryPolicy`, issues `done/partial/skipped/failed/
cancelled/awaiting_approval/unknown`. `packages/contracts/src/schemas/action-os.ts`.
- Tables `workflow_runs`, `approval_requests`, `credit_reservations` +
  réglages d'approbation par espace (migration `1788270000000`).
- Moteur : plan en trois listes, approbation, exécution par dépendances,
  idempotence garantie par index unique (pas par un `SELECT` applicatif).
- Politique d'approbation **pure** : N0→N5, seuils volume/dépense non
  désactivables, pas d'auto-approbation d'un niveau responsable.
- **Cinq workflows** de la p26-30, versionnés dans le code.
- Routeur étendu : rappel sur le **vrai agenda**, événement avec invités, note
  CRM sans upsert, notification in-app.
- **Centre d'actions** au-dessus du journal (`/actions`).

### Découvrir (p32-42)

- **Conseil de qualification déterministe** avant scoring
  (`account_qualification.py`) : verdict recommandé / à vérifier / écarté, codes
  d'exclusion stables, tri dominé par le verdict.
- Deux champs registre récupérés (catégorie juridique, tranche d'effectif).
- Prompt d'angle : rien n'est argumenté sur une ligne écartée.
- Vocabulaire p42 appliqué.

### Ontologie (p42-47)

- Six niveaux de preuve, avec la règle appliquée : **une demande confirmée exige
  une parole**, pas un faisceau d'indices.
- Huit stades d'affichage, projection **totale** depuis les cinq états stockés.
- **Décroissance de fraîcheur** : la confiance ne remonte jamais avec le temps.
- Prompt signaux : transformation ≠ externalisation, contre-signaux obligatoires.

### Messages (p48-58)

- « J'espère que vous allez bien » conditionné à un historique réel.
- Clause « aucune démarche commerciale » supprimée des trois prompts.
- Trois formats de canal distincts, vouvoiement par défaut.
- Sortie enrichie : preuve, hypothèse testée, risque, relance, verdict d'envoi.
- **Statuts de séquence dérivés** de l'état réel (en attente de connexion / de
  validation / planifiée / préparée).
- **Six cadences par situation** au lieu d'une.

### Intégrations (p16-19)

- **Huit états de capacité** dérivés (`deriveCapabilityState`).
- Quotas, limites de débit et politiques de rétention retirés de l'écran
  utilisateur.

### Talent (p62-64)

- **Preuve par compétence** : démontrée / déclarée / adjacente / absente, avec
  sa source. Le score ne voyage plus seul.
- **Référentiel de compétences** (`skill-referential.ts`) : dictionnaire d'alias,
  pas une ontologie. « K8s » et « Kubernetes » se rencontrent enfin — le faux
  négatif d'avant ne levait aucune alerte. Aucune inférence : « connaît AWS »
  n'implique pas « connaît Terraform ».

### Seconde passe (02/08, après arbitrages)

- **Barème Découvrir p41** : fit 25 / surface IT 20 / timing 20 / accessibilité 20
  (non mesurée au registre) / preuves 15. Un test verrouille la somme à 100.
- **Écran Besoins** : progression unique, badge de stade, tri par engagement.
- **RFP/RFQ Studio** : intake PDF/Word/Excel (lus avec la bibliothèque standard —
  ZIP + XML —, pas de dépendance ajoutée), extraction d'exigences, bid/no-bid,
  matrice de conformité qui bloque l'export, rédaction exigence par exigence.
  Table `rfps`, module autonome, écran `/rfp`.
- **Proposal Studio** : assembleur des neuf sections p69 à partir des objets
  existants ; il NOMME ce qui manque plutôt que de le combler.
- **Timeline unifiée** d'un compte (`GET /accounts/:id/timeline`) : fusionne
  journal, opportunités et exécutions ; écarte ce qui n'a pas de date réelle.
- **Delivery OS** : `missions`, `mission_assignments`, `mission_timesheets`,
  fenêtres J-60/J-30, radar de risque, carte d'expansion. Sans facture légale.
- **Catalogue de KPI** (p85) : les 8 familles, chacune avec sa source — ou
  `measurable: false` quand rien ne la porte. Un test refuse un KPI « mesurable »
  sans source.
- **Garde anti-promesse** (p79) : un test lit tous les libellés FR+EN et refuse
  les formulations que le code ne tient pas. Il est sensible à la négation —
  « aucun envoi automatique » est la phrase qu'on VEUT.
- **Décroissance de fraîcheur branchée** : la confiance d'une opportunité se
  dégrade à la LECTURE (jamais en base, sinon une réanalyse ne pourrait plus la
  relever).

---

## 2. Roadmap — ce qui reste

### NEXT (6-12 mois)

| Chantier                    | État réel                                                                                                                                   | Ce qui manque                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Talent Graph complet        | Matching déterministe + preuve par compétence + brief + réécriture CV gardée + **référentiel d'alias**                                      | Historique de missions structuré (les affectations existent, l'historique par expert non), relations expert↔compte↔projet                |
| CV Studio                   | Réécriture sourcée + garde anti-invention + versions par couple consultant×besoin + **lecture PDF/Word/Excel** (partagée avec l'intake RFP) | Anonymisation paramétrable, export brandé, bibliothèque de gabarits client                                                               |
| Push Profile Studio         | Push + feedback + cadence dédiée                                                                                                            | Multicanal, suivi entretien→démarrage                                                                                                    |
| RFP/RFQ Studio              | Intake PDF/Word/Excel, exigences classées, bid/no-bid, conformité, rédaction sourcée                                                        | Récupération depuis un PORTAIL acheteur (chacun a son format), export au gabarit client, bibliothèque de réponses validées réutilisables |
| Proposal Studio             | Assembleur des 9 sections + détection des manques                                                                                           | Rendu du document (PDF brandé), e-signature — un prestataire externe, donc une décision produit                                          |
| Conversation intelligence   | Rien                                                                                                                                        | Dépend d'un accès enregistrement/transcription — question de consentement avant question technique                                       |
| CRM-lite + timeline unifiée | Timeline transverse livrée ; Mission livrée                                                                                                 | Écran de timeline côté web (l'endpoint existe), et la CONVERSATION comme objet de premier rang                                           |

### LATER (12-24 mois)

Livrés en seconde passe : mission & assignment, CRA/timesheets, renouvellement
J-60/J-30, risk radar, client expansion map.

Restent, et volontairement : **facture à valeur légale** (mentions obligatoires,
TVA, numérotation séquentielle sans trou, archivage fiscal, facturation
électronique — chacun est une obligation qui ne se rattrape pas par un correctif,
et aucun expert-comptable n'est dans la boucle) · portail consultant · portail
client · Reference Factory · prévisions de capacité · internationalisation.

Le rapport le dit lui-même (p75) : ne pas construire paie complète,
comptabilité, contrats juridiques exhaustifs, portails riches sans usage validé,
ni remplacement en bloc d'un ERP existant.

### Décisions produit en attente

1. **Masquage des noms sur l'écran Intégrations** — l'exception documentée
   ci-dessus tient-elle ?
2. **Fusion des écrans Besoins / Signaux / Projets / Veille** en une seule
   progression (p43). L'ontologie est prête ; la refonte d'écran ne l'est pas,
   et elle touche quatre onglets existants.
3. ~~Barème Découvrir de la p41~~ — **tranché le 02/08** : adopté, avec
   l'accessibilité déclarée non mesurée au stade registre.
4. **E-signature du Proposal Studio** : quel prestataire, et sous quelle
   contrainte de conservation ? Aucun choix par défaut n'est raisonnable ici.
5. **Récupération depuis un portail acheteur** (RFP) : chaque portail a son
   format et beaucoup exigent un compte nominatif. À décider portail par portail
   sur un besoin réel, pas en bloc.

---

## 3. Ce qu'on ne promet pas (p79)

À ne pas laisser dire, ni au copilote, ni à un écran, ni en démonstration :

- automatiser n'importe quel workflow depuis le copilote ;
- synchronisation complète et bidirectionnelle de tous les CRM ;
- envoi multicanal autonome et fiable ;
- lecture LinkedIn ou actions LinkedIn officielles ;
- workflow calendrier COMPLET dans le routeur (la création d'événement existe,
  la lecture/modification/annulation non) ;
- RFP Studio, Delivery OS, CRA, facture, portail client natifs ;
- remplacement complet de BoondManager ;
- organigramme officiel et fiable à partir des seules données publiques.

Le produit peut en revanche montrer une roadmap, des connecteurs « bientôt
disponibles » clairement distingués, et des prototypes — sans mélanger
aspiration et capacité réelle.

---

## 4. Gates de validation (p84)

Toute nouvelle fonctionnalité doit répondre à ces six questions avant d'être
livrée. Elles sont verrouillées en test (`apps/api/src/modules/action-os/`
et `apps/ia/tests/`) là où elles sont vérifiables automatiquement.

| Gate          | Question                                                            | Preuve attendue                |
| ------------- | ------------------------------------------------------------------- | ------------------------------ |
| Utilité       | Aide-t-elle à trouver, comprendre, ouvrir, développer ou délivrer ? | Cas d'usage + test utilisateur |
| Exécution     | Qui fait quoi, quand, sur quels objets, à quel coût ?               | Plan d'action typé             |
| Confiance     | Sources, fraîcheur, permissions, erreurs, reprise ?                 | Audit et tests                 |
| Économie      | Coût fournisseur, marge, volume, pricing ?                          | Observabilité et budget        |
| Apprentissage | Le résultat améliore-t-il la suite ?                                | Événement et mémoire           |
| Adoption      | Évite-t-elle un outil ou une ressaisie ?                            | Mesure de temps et d'usage     |
