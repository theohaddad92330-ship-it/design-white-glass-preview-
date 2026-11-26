# Lot L6 — #2089 (audit/welcome, sujet écran)

**36 points** à l'état `retenu`, extraits de `registre-2026-09-15-onboarding-audit-welcome.md`.
L'état se change dans le REGISTRE d'origine, par édition de SA ligne.

| Point | La demande, en huit mots | Sujet | Existant (preuve fichier:ligne + APPELANT) | État | Preuve en recette |
| ----- | ------------------------ | ----- | ----------------------------------------- | ---- | ----------------- |
| #2089.1 | Titre « Voici ce que tu m'as expliqué. » | écran | absent (le titre voisin « voici ce que … a compris » vit sur `AuditHero.tsx`, autre écran) | retenu | ÉCRAN: libellé exact |
| #2089.2 | Sous-titre « Relis les éléments importants avant… » | écran | absent | retenu | ÉCRAN: libellé exact |
| #2089.3 | Section Organisation | écran | absent | retenu | ÉCRAN: section |
| #2089.4 | Section Rôle | écran | absent | retenu | ÉCRAN: section |
| #2089.5 | Section Offre | écran | absent | retenu | ÉCRAN: section |
| #2089.6 | Section Marché | écran | absent | retenu | ÉCRAN: section |
| #2089.7 | Section Système commercial | écran | absent | retenu | ÉCRAN: section |
| #2089.8 | Section Objectifs | écran | absent | retenu | ÉCRAN: section |
| #2089.9 | Section « Informations à vérifier » | doctrine (non mesuré ≠ 0) | absent | retenu | ÉCRAN: section |
| #2089.10 | 3 à 6 éléments max par section | écran | absent | retenu | ÉCRAN: comptage |
| #2089.11 | Chaque élément porte son STATUT | doctrine | absent | retenu | ÉCRAN: statut |
| #2089.12 | Chaque élément porte sa PROVENANCE | doctrine | primitive existante `Provenance` (règle D79/GA-18) ; pas sur cet écran | retenu | CODE: `Provenance` |
| #2089.13 | Chaque élément a un bouton Modifier | écran | absent | retenu | ÉCRAN: bouton |
| #2089.14 | Ne pas afficher un long paragraphe généré | écran | absent | retenu | ÉCRAN: pas de pavé |
| #2089.15 | Statut « Confirmé » | doctrine | absent | retenu | CODE: enum de statut |
| #2089.16 | Statut « Proposé » | doctrine | voisin `PrefillFieldMeta` (`PrefillBadge.tsx:4`) | retenu | CODE: enum |
| #2089.17 | Statut « À vérifier » | doctrine | absent | retenu | CODE: enum |
| #2089.18 | Statut « Inconnu » | doctrine | absent | retenu | CODE: enum |
| #2089.19 | Statut « Contradictoire » | doctrine | absent | retenu | CODE: enum |
| #2089.20 | Bloc orange : « Ces informations limiteront certaines recommandations » | doctrine | absent ⚠️ ne jamais présenter l'absence comme une faiblesse prouvée (cf. #2072.9) | retenu | ÉCRAN: libellé exact |
| #2089.21 | Bloc « Trois points méritent ton attention avant l'audit » | écran | absent | retenu | ÉCRAN: libellé |
| #2089.22 | Chaque point : tension / impact / action | écran | absent | retenu | ÉCRAN: 3 champs |
| #2089.23 | CTA « Générer mon audit » | parcours | absent — la génération part aujourd'hui de `triggerGeneration` sans geste explicite | retenu | ÉCRAN: bouton |
| #2089.24 | Avant le clic : durée estimée | écran | absent | retenu | ÉCRAN: durée |
| #2089.25 | Avant le clic : coût éventuel | facturation | absent | retenu | Onboarding GRATUIT de bout en bout (Louis 15/09) : questionnaire, audit sur données déclarées, mémoire marché, corrections, imports locaux et prévisualisations = 0 crédit. Seules recherche fraîche / enrichissement / analyse externe / vérification payante débitent, avec coût + durée + périmètre + crédits restants AVANT le clic, et remboursement sur échec. |
| #2089.26 | Avant le clic : « aucune action externe » | doctrine | absent | retenu | ÉCRAN: libellé |
| #2089.27 | Avant le clic : possibilité de quitter | parcours | absent | retenu | ÉCRAN: mention |
| #2089.28 | Écran de génération plein mais sobre + titre/sous-titre personnalisés | écran | absent | retenu | ÉCRAN: écran dédié |
| #2089.29 | Six phases réelles (vérif → sauvegarde) | parcours | absent (doublon partiel de #2012.2-.8 : SEPT phases là-bas, SIX ici — **contradiction à trancher**) | retenu | Écran/parcours — tranché par Claude sur la doctrine déjà écrite (Louis 15/09 : « prends-les tous, ne me redemande rien »). Se prouve en recette. |
| #2089.30 | Chaque phase : En attente / En cours / Terminé / Partiel / Erreur | parcours | absent | retenu | CODE: enum de phase |
| #2089.31 | Diagramme vivant mais discret, PAS de faux compteur 0-100 | doctrine | rien à retirer aujourd'hui | retenu | ÉCRAN: aucun % |
| #2089.32 | « Tu peux quitter cette page, le travail continuera » | parcours | absent | retenu | ÉCRAN: libellé |
| #2089.33 | Bloc « Ce que je regarde » : thèmes réels défilants | écran | absent | retenu | ÉCRAN: 4 thèmes |
| #2089.34 | Ne jamais afficher pensée interne, prompt ou chaîne de raisonnement | doctrine (sécurité) | voisin #2084 « ne jamais exposer le prompt système » | retenu | CODE: garde anti-fuite de prompt |
| #2089.35 | Erreur : nommer la phase, conserver les résultats, expliquer l'impact, relancer CETTE phase | parcours | absent (`profile-context.ts:201` `failed` est global) | retenu | ÉCRAN: relance ciblée |
| #2089.36 | Fin : « Ton audit est prêt » + CTA « Découvrir mon audit » | parcours | absent ; la fin du questionnaire route vers `/welcome` (`routes/welcome.tsx:8-11`) | retenu | ÉCRAN: transition |
