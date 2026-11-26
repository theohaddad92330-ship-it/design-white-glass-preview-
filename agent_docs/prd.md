# BellumAI — PRD Complet V2

## Vision

BellumAI = le copilote d'intelligence commerciale des ESN françaises.
Un commercial tape un nom d'entreprise → dossier de conquête complet en 5 minutes.
Contacts réels, organigramme décisionnel, plan d'action personnalisé, messages prêts à envoyer.

## Marché

ESN françaises de 10 à 200 consultants. Business Managers, Head of Sales, commerciaux terrain.
1000 personnes en waiting list. 80 démos/mois réalisées par le fondateur. Aucun concurrent vertical ESN.

## Utilisateur cible

Un Business Manager en ESN qui passe 60-70% de son temps à chercher des infos au lieu de vendre.
Il ne sait pas qui contacter, par quel angle, avec quel message. BellumAI résout ça en 5 minutes.

## Modules du produit

### Module 1 — Fiche compte

Secteur, CA (Pappers certifié), effectifs, filiales, établissements France, programmes IT réels,
signaux d'achat, enjeux stratégiques, ESN concurrentes, score de priorité 1-10 avec justification.

### Module 2 — Contacts et organigramme

80-120 contacts réels (Apollo) avec noms, postes, LinkedIn, rôles décisionnels
(sponsor/champion/opérationnel/achats/influenceur/bloqueur).
Organigramme interactif par entité. Enrichissement email/téléphone à la demande.

### Module 3 — Plan d'action

Stratégie (bottom-up/top-down/multi-thread) adaptée au profil ESN.
Plan séquencé 12 mois. Évaluation GO/NO-GO. Offres à proposer. Quick wins.

### Module 4 — Messages et préparation RDV

Messages LinkedIn et email personnalisés par contact (basés sur RAG templates).
Pitch cold calling. Script RDV. Questions puissantes. Objections et réponses.
Recherches booléennes LinkedIn copiables.

### Module 5 — Agent IA chatbot (nouveau)

Page /chat/:accountId. Conversation avec BellumAI en contexte.
L'agent connaît le compte, les contacts, le plan, l'historique.
Exemples : "J'ai déjà 3 consultants chez eux, tu me conseilles quoi ?"
"Les contacts sont trop C-level, concentre-toi sur les opérationnels."

### Module 6 — Découverte de comptes (nouveau)

Mode "Je n'ai aucun compte en tête". L'utilisateur entre des critères
(ville, secteur, technologie) → BellumAI propose 10 entreprises pertinentes
avec 5 décideurs chacune. Strat de conquête pour chacune.

### Module 7 — CRM intégré (nouveau)

Pipeline visuel : nouveau → contacté → RDV → proposition → gagné.
Historique des actions par contact. Notes. Le levier de rétention principal.

### Module 8 — Dashboard pilotage

Actions de la semaine. Relances en retard. Pipeline. Top 3 comptes prioritaires.
Signaux récents. PAS de duplication avec les autres pages.

## Pages du produit

| Page          | Route            | Description                         |
| ------------- | ---------------- | ----------------------------------- |
| Landing       | /                | Vidéo + screenshots + CTA + pricing |
| Login/Signup  | /login, /signup  | Email + Google OAuth                |
| Onboarding    | /onboarding      | Questionnaire 12 questions ESN      |
| Search        | /search          | Recherche ciblée (nom d'entreprise) |
| Discover      | /discover        | Recherche assistée IA (nouveau)     |
| Dashboard     | /dashboard       | Pilotage et prise de décision       |
| AccountDetail | /accounts/:id    | 6+ onglets de résultats             |
| Chat          | /chat/:accountId | Agent IA conversationnel (nouveau)  |
| Contacts      | /contacts        | Liste globale + import CSV          |
| KnowledgeBase | /knowledge       | Upload documents RAG                |
| Billing       | /billing         | Plans Stripe + crédits              |
| Profile       | /profile         | Profil ESN                          |

## Onboarding (12 questions)

1. Nom de l'ESN
2. Taille (nombre de consultants)
3. Offres vendues (data, cloud, cyber, dev, infra...)
4. Secteurs préférés
5. Types de clients (grands comptes, ETI, PME)
6. Personas cibles (DSI, CTO, directeurs métier...)
7. Zone géographique
8. Références clients existantes
9. Cycle de vente moyen
10. TJM moyen
11. Taille équipe commerciale
12. Défi commercial principal

## Pricing

| Plan    | Prix/mois | Analyses | Enrichissement | Cible      |
| ------- | --------- | -------- | -------------- | ---------- |
| Free    | 0€        | 3        | Non            | Découverte |
| Starter | 49€       | 10       | 10 contacts    | Solo       |
| Pro     | 99€       | 30       | 50 contacts    | Équipe     |
| Scale   | 199€      | Illimité | 200 contacts   | Direction  |

## Principes UX non négociables

1. Le commercial comprend le produit en < 30 secondes
2. Chaque écran a UN objectif principal
3. Time-to-value < 5 minutes (inscription → premier résultat utile)
4. L'IA n'est jamais une boîte noire — montrer ce qui est généré et d'où ça vient
5. Dark mode par défaut
6. Mobile-friendly
7. Phrases BellumAI personnalisées sur chaque page
