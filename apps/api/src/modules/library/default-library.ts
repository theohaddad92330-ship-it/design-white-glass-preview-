import type { LibraryItemKind } from '@bellum/contracts'

/**
 * Built-in starter library seeded into a workspace the first time its
 * Connaissances screen is opened (`LibraryService.listForWorkspace`). After
 * seeding, each item is a normal row the team can edit or delete. Previously
 * these lived hardcoded in the web `Knowledge` component; they now have a single
 * source of truth here so the UI reads them (and every edit) from the API.
 *
 * Three kinds: `template` (copy-ready email/call/pitch), `playbook` (tactical
 * account strategies) and `method_playbook` — curated, long-form guides for the
 * ESN plan-de-compte method (multi-threading, thread achats, champion→sponsor,
 * approche C-level). Content anchors: `agent_docs/knowledge-pack-v2.md`.
 */
type DefaultLibraryItem = {
  kind: LibraryItemKind
  title: string
  description: string
  category: string | null
  body: string
}

export const DEFAULT_LIBRARY_ITEMS: DefaultLibraryItem[] = [
  {
    kind: 'template',
    title: 'Email de premier contact',
    description: 'Introduction froide ciblée',
    category: 'Email',
    body: `Objet : {{enjeu métier}} chez {{entreprise}} — un angle concret

Bonjour {{prénom}},

En suivant {{entreprise}}, j'ai noté {{signal — recrutement / projet / actualité}}.
Chez {{votre ESN}}, on accompagne justement des {{secteur}} sur {{expertise clé}} :
{{preuve — 1 référence comparable + résultat chiffré}}.

Je ne cherche pas à vendre un CV : je voulais savoir comment vous adressez
{{enjeu}} en interne aujourd'hui, et si un échange de 15 min a du sens.

Quel créneau vous conviendrait cette semaine ?`,
  },
  {
    kind: 'template',
    title: "Script d'appel découverte (SPIN)",
    description: 'Questions SPIN pour identifier les enjeux',
    category: 'Appel',
    body: `SITUATION
- Comment est structurée votre équipe {{tech/data/…}} aujourd'hui ?
- Vous travaillez déjà avec des prestataires externes sur {{domaine}} ?

PROBLÈME
- Sur {{projet/roadmap}}, qu'est-ce qui vous ralentit le plus ?
- Le recrutement sur {{profil}} tient les délais ?

IMPLICATION
- Si {{projet}} glisse d'un trimestre, quel impact côté {{business/deadline}} ?
- Qui d'autre est pénalisé quand {{compétence}} manque ?

BÉNÉFICE (need-payoff)
- Si vous aviez {{profil senior}} opérationnel sous 2 semaines, ça change quoi ?
- Un partenaire capable de staffer + monter en charge, ça vous aiderait sur quoi
  précisément ?

→ Clôture : « Je vous propose qu'on fixe 30 min avec {{expert}} pour cadrer.
  Jeudi ou vendredi ? »`,
  },
  {
    kind: 'template',
    title: 'Structure de proposition commerciale',
    description: 'Trame pour les offres ESN',
    category: 'Pitch',
    body: `1. CONTEXTE & ENJEU
   Reformuler le besoin dans LES MOTS du client (preuve d'écoute).

2. NOTRE COMPRÉHENSION
   Les 3 objectifs prioritaires + les risques identifiés.

3. NOTRE APPROCHE
   - Dispositif proposé (régie / forfait / centre de services)
   - Profils & séniorité, avec 1 phrase par rôle
   - Démarche & jalons (S0 → S+X)

4. PREUVE
   1 à 2 références comparables (secteur + techno) avec résultat chiffré.

5. COMMERCIAL
   TJM ou budget, conditions, date de démarrage.
   → Ancrer sur la VALEUR (coût d'un projet qui glisse) avant le prix.

6. PROCHAINE ÉTAPE
   Une action claire + une date. Jamais « on reste à dispo ».`,
  },
  {
    kind: 'template',
    title: 'Follow-up post-RDV',
    description: 'Relance structurée après un meeting',
    category: 'Email',
    body: `Objet : Suite à notre échange — {{sujet}}

Bonjour {{prénom}},

Merci pour le temps accordé aujourd'hui. Ce que je retiens :
- {{point clé 1 exprimé par le client}}
- {{point clé 2 / contrainte}}
- Priorité : {{échéance ou enjeu}}

De notre côté, la prochaine étape que je propose : {{action concrète}}.
Je vous envoie {{livrable — profils / mini-proposition}} d'ici {{date}}.

Est-ce que {{date+heure}} fonctionne pour valider la suite ?`,
  },
  {
    kind: 'template',
    title: 'Accroche LinkedIn (détection de besoin)',
    description: "Message d'approche LinkedIn naturel",
    category: 'LinkedIn',
    body: `Invitation (note courte) :
« Bonjour {{prénom}}, je suis vos sujets {{domaine}} chez {{entreprise}}.
On accompagne des équipes similaires sur {{expertise}} — au plaisir d'échanger. »

Message J+2 (après acceptation) :
« Merci {{prénom}} ! Sans agenda commercial : comment vous gérez {{enjeu}}
aujourd'hui en interne ? Je demande car on voit beaucoup de {{secteur}} arbitrer
entre recruter et s'appuyer sur un partenaire sur {{compétence}}.
Si c'est un sujet, je partage volontiers ce qu'on a mis en place ailleurs. »

→ Règle : une question ouverte, zéro pièce jointe, zéro CV au 1er contact.`,
  },
  {
    kind: 'template',
    title: "Traiter l'objection TJM",
    description: 'Réponses aux objections sur le prix',
    category: 'Pitch',
    body: `« C'est trop cher / votre TJM est au-dessus du marché »

1. ACCUSER RÉCEPTION (ne pas contrer)
   « Je comprends, le TJM est un vrai sujet. »

2. REQUALIFIER
   « Vous le comparez à quoi — un autre prestataire, un recrutement,
     un budget cible ? »

3. RECADRER SUR LA VALEUR
   « Le vrai coût, c'est {{projet}} qui glisse de X semaines. Notre {{profil}}
     est opérationnel sous {{délai}}, sans période de montée en charge. »

4. PREUVE
   « Chez {{référence}}, ce dispositif a permis {{résultat chiffré}}. »

5. OUVERTURE (jamais brader sec)
   « On peut ajuster le dispositif (séniorité, volume, forfait) pour tenir
     votre budget. Quel est votre cadre ? »`,
  },
  {
    kind: 'playbook',
    title: 'Approche grands comptes',
    description: 'Stratégie multi-thread pour les comptes > 1000 personnes',
    category: null,
    body: `OBJECTIF : entrer sur un compte où la décision est diffuse (achat, métier, DSI).

1. CARTOGRAPHIER (semaine 1)
   - Identifier 3 niveaux : sponsor métier, décideur DSI, acheteur.
   - Repérer les projets en cours (offres d'emploi, communiqués, appels d'offres).

2. MULTI-THREAD (semaines 1-3)
   - Un message DIFFÉRENT par persona (le métier parle enjeu, la DSI parle delivery,
     l'achat parle cadre & TJM).
   - Ne jamais dépendre d'un seul contact.

3. CRÉER LA PREUVE (semaines 2-4)
   - Placer une référence sectorielle comparable à chaque interlocuteur.
   - Proposer un POC / mini-cadrage à faible engagement.

4. VERROUILLER
   - Faire sponsoriser en interne par le métier.
   - Passer le cadre achat AVANT la proposition finale (référencement).

KPI : nb de personas touchés, RDV sponsor obtenu, entrée au référencement.`,
  },
  {
    kind: 'playbook',
    title: 'Conquête secteur banque / assurance',
    description: 'Séquence pour le vertical finance',
    category: null,
    body: `SPÉCIFICITÉS : cycles longs, conformité (ACPR, DORA), référencement obligatoire.

1. PRÉREQUIS
   - Vérifier référencement / panel fournisseurs. Sans, viser le référencement d'abord.
   - Préparer les preuves conformité (RGPD, souveraineté, PSSI).

2. ANGLES QUI OUVRENT
   - Réglementaire : DORA, résilience opérationnelle, obligations data.
   - Modernisation : migration mainframe, cloud de confiance, dette technique.
   - Data/IA : industrialisation, gouvernance, lutte fraude.

3. SÉQUENCE
   - S1 : accroche sur un enjeu réglementaire daté (échéance connue).
   - S2 : partager un retour d'expérience banque comparable.
   - S3 : proposer un atelier cadrage avec un expert (pas un commercial seul).

4. PIÈGES
   - Ne pas promettre du staffing sans habilitation/clearance si requis.
   - Anticiper les délais achats (souvent 2-4 mois).`,
  },
  {
    kind: 'playbook',
    title: 'Réactivation de comptes froids',
    description: 'Ré-engager des prospects sans suite',
    category: null,
    body: `CONTEXTE : un compte déjà contacté, sans réponse ou en stand-by.

1. NOUVEAU PRÉTEXTE (obligatoire)
   Ne jamais relancer « je reviens vers vous ». Trouver un déclencheur :
   nouvelle offre d'emploi, actu, nomination, référence fraîche.

2. SÉQUENCE 3 TOUCHES
   - Touche 1 (email) : « {{signal}} m'a fait repenser à vous. »
   - Touche 2 (LinkedIn, J+3) : partager un contenu utile lié à leur enjeu.
   - Touche 3 (appel, J+7) : « 2 min, j'ai un angle précis sur {{sujet}}. »

3. LA PORTE DE SORTIE
   Dernier message : « Si ce n'est pas le moment, dites-le moi franchement —
   je reprends contact au bon timing. » (Le « non » libère et souvent relance.)

KPI : taux de réponse, RDV re-obtenu, requalification (mort / à nourrir / chaud).`,
  },
  {
    kind: 'playbook',
    title: 'Upsell compte existant',
    description: 'Étendre un compte déjà client',
    category: null,
    body: `OBJECTIF : passer d'une mission isolée à un compte stratégique.

1. ÉCOUTER LE TERRAIN
   Les consultants en poste sont votre meilleure source : quels autres besoins,
   quelles équipes voisines, quels projets à venir ?

2. ÉLARGIR LES PERSONAS
   Cartographier au-delà du donneur d'ordre actuel (autres BU, autre site).

3. ANGLES D'EXTENSION
   - Élargir le périmètre (nouvelle techno, nouvelle équipe).
   - Monter en valeur (régie → forfait / centre de services).
   - Sécuriser (renouvellement anticipé, cadre pluriannuel).

4. TIMING
   Provoquer un point de pilotage trimestriel : bilan + prochaines priorités.
   C'est là que naît l'upsell, pas dans un email froid.

KPI : nb de missions actives, nb de personas, chiffre d'affaires par compte.`,
  },
  {
    kind: 'method_playbook',
    title: 'Multi-threading : couvrir 3 niveaux, 12 contacts',
    description: "Cartographier le compte sur 3 niveaux et ne jamais dépendre d'un seul contact",
    category: null,
    body: `PRINCIPE : sur un grand compte, la décision est diffuse. Un seul contact = un
seul point de rupture (départ, silence, veto). La règle du plan de compte ESN :
viser ~12 contacts répartis sur 3 niveaux hiérarchiques, avec un message
DIFFÉRENT par niveau.

LES 3 NIVEAUX À COUVRIR
- N (décideur) — DSI, Directeur BU, Directeur de programme. Tient le budget et
  l'arbitrage. Parle enjeu business et capacité d'exécution.
- N-1 (management) — Head of / Manager / Responsable delivery. Vit la charge
  équipe et le staffing. Parle vélocité, délais, montée en charge.
- N-2 (terrain) — Tech Lead, Product Owner, expert. Vit les problèmes concrets
  et la stack. Parle technique, jamais commercial.

VISER ~12 CONTACTS (≈ 4 par niveau)
- Redondance volontaire : plusieurs entrées par niveau pour survivre à un
  silence ou à un départ.
- Tier A = décideurs N-1 avec budget + utilisateurs N-2 avec douleur +
  prescripteurs. Tier B = sponsors C-level (referral) + achats. Tier C =
  hors-sujet / sans pouvoir → on n'y dépense pas d'énergie.

UN MESSAGE PAR NIVEAU (jamais le même copier-coller)
- Au décideur : l'écart roadmap ↔ capacité réelle, sans 3 mois de sourcing.
- Au manager : un bon consultant positionné en 48-72h, delivery qui tient.
- Au terrain : la stack, le retour d'expérience, le pair technique.

SÉQUENCE
1. Semaine 1 : cartographier (LinkedIn, orga, offres d'emploi, communiqués).
2. Semaines 1-3 : ouvrir 2-3 threads en parallèle sur des niveaux différents.
3. Croiser les fils : citer (sans trahir) un échange terrain au décideur pour
   crédibiliser — « vos équipes m'ont partagé le sujet X ».

PIÈGE : rester bloqué sur un seul interlocuteur « sympa » sans pouvoir. Un
contact chaleureux mais sans influence ne fait pas avancer l'affaire.

KPI : nb de contacts actifs, nb de niveaux couverts (viser 3/3), nb de threads
indépendants ouverts.`,
  },
  {
    kind: 'method_playbook',
    title: 'Lancer le thread achats (dès la semaine 2)',
    description: 'Ouvrir le référencement tôt pour que les achats ne deviennent pas un mur en fin de cycle',
    category: null,
    body: `POURQUOI TÔT : dans les grands comptes, les achats (procurement / vendor
management) valident le cadre — référencement, TJM plafond, conditions.
Découvrir ce mur APRÈS avoir gagné le métier, c'est prendre 2 à 4 mois dans la
figure. On ouvre donc le thread achats dès la semaine 2, en parallèle du métier
— jamais à sa place.

RÈGLE D'OR : le métier tire, les achats cadrent. On ne vend pas aux achats, on
se fait référencer par eux pendant que le métier construit le besoin.

CE QU'ON VÉRIFIE EN PREMIER
- Existe-t-il un panel / une liste de fournisseurs référencés ? Y sommes-nous ?
- Qui est l'acheteur IT / vendor manager en face ? (nom, périmètre)
- Quel est le processus : appel d'offres, accord-cadre, bon de commande ?
- Y a-t-il une échéance de renouvellement de panel à viser ?

LE MESSAGE ACHATS (différent du métier)
- Pas d'enjeu business : cadre, conformité, simplicité de contractualisation.
- « Je veux être en règle avec votre process. Comment se passe le référencement
  d'un partenaire comme nous ? »
- Fournir tôt les pièces : Kbis, assurances, RGPD/PSSI, références, RIB.

SÉQUENCE
1. S2 : identifier l'acheteur, demander le process de référencement.
2. S2-4 : monter le dossier fournisseur en parallèle du travail métier.
3. AVANT la proposition finale : valider le cadre achat (TJM, contrat) pour ne
   pas se faire retoquer sur le prix au dernier moment.

PIÈGE : laisser le dossier « monter aux achats » sans sponsor métier. Un achat
sans sponsor devient un filtre (blocker) qui enterre l'affaire.

KPI : référencement obtenu (oui/non), acheteur identifié, cadre TJM validé avant
la proposition.`,
  },
  {
    kind: 'method_playbook',
    title: 'Convertir un champion en sponsor',
    description: "Repérer un champion, l'armer et le transformer en sponsor qui vend en interne à votre place",
    category: null,
    body: `DÉFINITION : un champion, ce n'est pas un titre — c'est un indice. Ex-consultant,
très actif sur LinkedIn, rôle transverse, manager accessible : quelqu'un qui a
un intérêt personnel à ce que ça marche. Un sponsor, c'est un champion qui a le
POUVOIR (ou l'oreille du pouvoir) et qui porte votre dossier quand vous n'êtes
pas dans la pièce.

L'OBJECTIF : passer de « il vous aime bien » à « il vous vend en interne ».

1. REPÉRER (matrice Pouvoir / Intérêt)
   Le champion est en Q1 : intérêt élevé + un minimum de pouvoir ou d'influence.
   Fort intérêt mais faible pouvoir = relais terrain (précieux, pas encore
   sponsor).

2. ARMER LE CHAMPION
   Un champion ne vend en interne que si vous lui donnez des munitions :
   - Un one-pager qu'il peut transférer sans vous (PROMESSE + PREUVE + ACTION).
   - Une référence comparable même secteur / même stack.
   - Les réponses aux objections qu'il va se prendre (« on a déjà des
     prestataires », « passez par les achats », « TJM trop élevé »).

3. TESTER L'ENGAGEMENT
   - « Qui d'autre devrait être dans la boucle selon vous ? » (accès)
   - « Comment se prend ce type de décision chez vous ? » (process)
   - S'il ouvre son carnet d'adresses interne, c'est un sponsor. S'il reste
     évasif, il est encore relais — continuez à le nourrir.

4. LE FAIRE SPONSORISER
   - Co-construire : il présente le besoin, vous apportez la solution.
   - Lui faire obtenir le RDV du décideur (referral interne > cold).
   - Le protéger : ne jamais le mettre en porte-à-faux devant sa hiérarchie.

PIÈGE : confondre sympathie et sponsoring. Un contact chaleureux sans pouvoir ni
volonté de porter le sujet n'est pas un sponsor.

KPI : le champion vous a-t-il ouvert un accès (contact, RDV décideur) ? Porte-t-il
le dossier quand vous n'êtes pas là ?`,
  },
  {
    kind: 'method_playbook',
    title: 'Approcher un DSI de CAC40 (C-level)',
    description: 'Entrer chez un décideur C-level par le referral et une accroche datée, pas par du cold générique',
    category: null,
    body: `CONTEXTE : un DSI de grand groupe (CAC40) reçoit des dizaines de sollicitations
d'ESN par semaine. Le cold générique meurt. On entre par la valeur, le referral
et un timing précis.

CE QU'UN DSI ACHÈTE : de la capacité d'exécution sans risque. Sa peur = l'écart
entre sa roadmap et la capacité réelle de ses équipes, et devoir mobiliser les
bons renforts sans 3 mois de sourcing. On parle à cette peur, pas de nos CV.

1. NE PAS ATTAQUER LE DSI EN FROID
   - Priorité au referral : passer par un N-1 (Head of / Directeur) ou un
     champion qui le fait sponsoriser. Un RDV DSI obtenu en interne vaut 20
     e-mails froids.
   - Le cold direct au DSI ne sert qu'à créer une empreinte, pas à vendre.

2. UNE ACCROCHE DATÉE ET SPÉCIFIQUE
   - S'appuyer sur un signal réel et récent : échéance réglementaire (DORA,
     NIS2), programme annoncé, migration, appel d'offres, nomination.
   - « J'ai vu que [signal daté]. On a accompagné [référence comparable] sur
     exactement ce sujet — voici le résultat en 6 semaines. »

3. LA VALUE-PROP EN 3 TEMPS
   - PROMESSE : un KPI / livrable concret sous ~6 semaines.
   - PREUVE : une référence même secteur / même stack, chiffrée.
   - ACTION : un atelier de cadrage de 45 min avec un expert (pas un commercial
     seul), jamais « on reste à dispo ».

4. TENIR SON RANG
   - Parler pair-à-pair : enjeu, arbitrage, capacité — jamais staffing de CV.
   - Amener un expert au premier vrai échange : le DSI teste la profondeur
     technique.
   - Une seule demande claire par message, une date proposée.

PIÈGE : dérouler son catalogue. Le DSI décroche sur le « nous faisons tout ». Un
angle, une preuve, une échéance.

KPI : RDV C-level obtenu (via referral de préférence), atelier de cadrage posé,
sponsor interne identifié.`,
  },
  {
    kind: 'method_playbook',
    title: 'Matrice Pouvoir / Intérêt : cadencer le plan de compte',
    description: 'Placer chaque contact sur la matrice Pouvoir/Intérêt et fixer la bonne cadence de relance',
    category: null,
    body: `IDÉE : tous les contacts d'un compte ne méritent pas la même énergie ni la même
fréquence. On place chacun sur deux axes — POUVOIR (peut décider / bloquer) et
INTÉRÊT (envie que ça se fasse) — et on en déduit la cadence.

LES 4 QUADRANTS
- Q1 · Pouvoir↑ Intérêt↑ = CHAMPIONS. Ils décident ET le veulent. Cadence :
  hebdomadaire. Ce sont vos moteurs — armez-les, faites-les sponsoriser.
- Q2 · Pouvoir↑ Intérêt↓ = À SATISFAIRE. Peuvent bloquer ou valider mais
  indifférents (souvent achats, C-level lointain). Cadence : jalons mensuels.
  Rassurez sur le cadre, ne les sur-sollicitez pas.
- Q3 · Pouvoir↓ Intérêt↑ = RELAIS TERRAIN. Vivent la douleur, remontent le
  besoin, influencent les décideurs. Cadence : toutes les 2 semaines. Source
  d'info et de crédibilité.
- Q4 · Pouvoir↓ Intérêt↓ = À SURVEILLER. Passifs. Cadence : trimestrielle. Zéro
  sur-investissement.

TIERS DE CONTACTS (à croiser avec les quadrants)
- Tier A : décideurs N-1 avec budget + utilisateurs N-2 avec douleur +
  prescripteurs → priorité absolue.
- Tier B : sponsors C-level (à obtenir en referral) + acheteurs / gatekeepers.
- Tier C : hors-sujet, sans pouvoir, inaccessible → on n'y va pas.

MÉTHODE
1. Après la cartographie, positionner chaque contact dans un quadrant.
2. Fixer la cadence par quadrant et s'y tenir (agenda, rappels).
3. Ré-évaluer à chaque interaction : un relais terrain qui gagne du galon peut
   basculer en champion.

PIÈGE : passer 80 % de son temps sur les gens agréables (Q3/Q4) et négliger les
Q2 « à satisfaire » qui, silencieux, peuvent bloquer en fin de cycle.

KPI : couverture des 4 quadrants, respect des cadences, nb de champions actifs
(Q1).`,
  },
]
