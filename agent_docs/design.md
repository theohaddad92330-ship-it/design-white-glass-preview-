# Design System BellumAI

## Philosophie

Dark mode par défaut. Inspirations : Linear, Finary, Vercel, Qonto.
Effet wow. Le commercial doit se dire "putain c'est beau" en ouvrant l'app.

## Stack design

- Tailwind CSS avec class strategy dark mode (`dark:` prefix)
- shadcn/ui pour tous les composants (Dialog, Card, Button, Table, Badge, etc.)
- Toggle dark/light stocké dans Zustand + localStorage
- Couleur primaire : violet BellumAI (logo existant)
- Polices : Inter (corps) + JetBrains Mono (code/données)

## Composants clés

- Cards avec bordures subtiles et hover effects
- Badges colorés pour les rôles (sponsor=violet, champion=bleu, blocker=rouge)
- Score circles animés (like Finary)
- Organigramme interactif (React Flow)
- Skeleton loaders pendant le chargement (pas de spinners bruts)
- Toast notifications (shadcn/ui Sonner)
- Data tables avec tri et filtre (TanStack Table)

## Phrases BellumAI

Chaque page a des phrases personnalisées de BellumAI qui guident l'utilisateur :

- Dashboard : "Bonjour Théo, voici vos 5 actions prioritaires cette semaine."
- Fiche compte : "3 portes d'entrée identifiées — la plus prometteuse est..."
- Contacts : "12 contacts prioritaires identifiés. Commencez par Marie Dupont (DSI adjointe)."
- Plan : "Stratégie recommandée : bottom-up via les chefs de projet IT."

## Bandeaux de chargement

Pendant l'analyse (3-6 min), afficher des messages différents à chaque phase :

- Phase 1 : "Recherche des données sur SNCF..."
- Phase 1b : "Analyse de 15 pages web..."
- Phase 2 : "Identification des contacts décideurs..."
- Phase 3 : "Reconstitution de l'organigramme..."
- Phase 4 : "Construction de votre plan d'action personnalisé..."
  Avec barre de progression et estimation du temps restant.

## Pages à refaire

- AccountDetail : découper en 6+ composants (Overview, Contacts, OrgChart, Plan, Messages, Evaluation)
- Dashboard : actions semaine + pipeline + relances + signaux (PAS de duplication)
- Landing : vidéo hero + 3 features + pricing + témoignages + CTA
