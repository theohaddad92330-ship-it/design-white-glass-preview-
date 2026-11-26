# Simplification cognitive — persona Hervé (#2436.13)

## Pourquoi ce document existe

`#2436.13` (lot #2436, repris par l'épopée #2981) demande de simplifier le
produit pour le persona Hervé : phrases simples, **un objectif par écran**,
CTA nommés par leur RÉSULTAT, pas de jargon technique, pas de dizaines de
choix simultanés, possibilité de revenir, erreurs explicites, confirmation de
ce qui a été fait.

C'est un audit de COPIE et de parcours, écran par écran, pas un bug isolé —
au même titre que #2436.17/#2436.18 (`docs/accessibilite-recette-humaine.md`),
ce point ne se ferme pas par un seul commit. Deux vérifications faites avant
d'écrire ce protocole expliquent pourquoi une garde mécanique ne peut pas le
remplacer :

- **Aucun libellé de CTA n'est codé en dur** (`git grep -noE
'>(Valider|Envoyer|Confirmer|OK|Enregistrer)<' apps/web/src`, hors tests →
  0 résultat) : tous passent par `t()`. Une garde qui lit le JSX ne peut donc
  pas juger si un libellé nomme un RÉSULTAT ou reste générique — il faudrait
  lire la VALEUR traduite, dans les 98 fichiers `apps/web/src/i18n/locales/fr/*.json`,
  et juger du sens.
- **Le jargon n'est pas un mot interdit dans l'absolu** : `webhook`, `API`,
  `payload` apparaissent légitimement dans `integrationCenter.json` et
  `settings.json` (écrans d'intégration technique, pas des écrans Hervé). Une
  garde qui interdirait ces mots PARTOUT accuserait du code correct — le
  défaut exact que documente GA-347 (`un-titre-de-niveau-1-par-ecran.test.ts`)
  pour un autre geste empêché.

Ce protocole est donc ce qu'une revue de copie suit, écran par écran, pour
produire une décision `simplifié` / `à revoir` traçable — jamais une preuve
inventée.

## Ce qui est DÉJÀ tenu par le code — à ne pas rejuger

- **GA-347** (`apps/web/src/architecture/un-titre-de-niveau-1-par-ecran.test.ts`,
  #2456) tient déjà la moitié STRUCTURELLE d'« un objectif par écran » :
  chaque écran porte un titre de niveau 1 unique, qui nomme son sujet. Un
  écran sans lecture ambiguë de son propre objectif ne peut pas apparaître ici
  sans que GA-347 soit rouge.
- **GA-334** (`sections-du-dossier-portent-ce-quelles-promettent.test.ts`) et
  **GA-333** (`un-conteneur-rigide-ne-porte-pas-de-texte-libre.test.ts`) tiennent
  la promesse du contenu de chaque section — pas son unicité d'objectif, mais
  la cohérence de ce qu'elle affiche.

Le protocole ci-dessous porte donc sur ce que SEULE une lecture humaine peut
juger : est-ce que CE libellé, sur CET écran, nomme le résultat pour Hervé.

## Champ de la revue

Les mêmes golden journeys que `docs/accessibilite-recette-humaine.md` (routes
de premier niveau, `/chat`, `/accounts/:id`, l'authentification, et les
golden journeys #2208/#2386/#2339.12) — un persona qui ne peut pas se servir
au clavier ou à la souris n'a pas besoin qu'on lui simplifie un écran qu'il
n'atteint pas.

## Grille de lecture par écran

Pour chaque écran du champ de revue :

1. **Objectif unique** — le H1 (GA-347) répond-il seul à « pourquoi je suis
   sur cet écran » ? Si l'écran combine deux objectifs indépendants (ex. lire
   ET configurer), lequel est secondaire et peut passer derrière un clic.
2. **CTA nommé par résultat** — chaque bouton d'action principale (variant
   `default`/`violet`) dit-il ce qui se passe après le clic (« Envoyer le
   message », « Lancer l'analyse ») plutôt qu'un verbe seul (« Valider »,
   « OK ») ? Relire la clé `t()` et sa valeur FR **et** EN.
3. **Jargon** — un mot technique (webhook, payload, endpoint, JSON, RAG…)
   apparaît-il hors des écrans d'intégration/réglages où il est le sujet
   même de l'écran ?
4. **Choix simultanés** — combien d'actions au même niveau visuel ? Au-delà
   de trois à quatre, y a-t-il un regroupement ou une hiérarchie possible ?
5. **Retour possible** — un chemin explicite (bouton retour, breadcrumb,
   annuler) existe-t-il pour sortir sans perte ?
6. **Erreur explicite** — un message d'erreur nomme-t-il ce qui a échoué ET
   ce qu'il faut faire, sans code d'erreur brut ?
7. **Confirmation** — une action qui modifie un état confirme-t-elle
   explicitement ce qui a été fait (pas seulement un toast générique) ?

## Modèle de compte-rendu

| date | relecteur | écran | verdict | détail / issue ouverte |
| ---- | --------- | ----- | ------- | ---------------------- |

## Journal des revues

_Aucune revue consignée à ce jour — #2436.13 reste `retenu` tant que cette
section est vide._
