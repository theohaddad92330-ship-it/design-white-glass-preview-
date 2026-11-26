# Lot cloud — fix/4962-r2-laura-decouvrir (correctifs de recette du lot #4962, 01/11/2026)

- Plafond : 300 tours.
- Un livrable, puis STOP.
- Rapport de 15 lignes au plus, dans `docs/briefs/fix-4962-r2-laura-decouvrir-rapport.md`, poussé avec le reste.

## Contexte

Ces défauts ont été VUS en production le 01/11, dans l'espace de Louis, pendant une recette réelle.

- Le retour client exact se lit avec `gh issue view <n>`.
- Un retour est un SYMPTÔME, pas une spécification.
- La doctrine est dans `CLAUDE.md`, sans re-litige. En particulier :
  - aucune PROBABILITÉ ;
  - une absence ne s'affiche jamais « 0 » ;
  - nos fournisseurs ne se nomment jamais.
- Avant de coder, lance `git log origin/main --oneline --grep <n>` et `git grep`.
- Un réglage vit à UN endroit (GA-26).
- Cherche l'APPELANT.

## Points

### 1. Découvrir : la recherche « Python » échoue ou reste bloquée (PRIORITÉ)

- Constat sur /discover, mot-clé « Python » :
  - « La recherche a échoué » ;
  - après Réessayer, « Interrogation du registre… » pendant plus de 45 s, sans résultat. Reproduit deux fois.
- « Java » est aussi resté bloqué sur « Interrogation du registre… » pendant plus de 2 min.
- « Kubernetes » a abouti en 50 s environ.
- À faire :
  - trouver la cause dans le code (registre, timeout, mot-clé ambigu, erreur avalée) ;
  - un échec doit se DIRE avec sa raison, il ne tourne jamais sans fin ;
  - corrige si c'est lisible. Sinon, nomme précisément le chaînon.
- Mémoire de Louis : « un 400 n'est pas une panne ». Lis les logs IA/API en code (`discover_signals`, routeur, client du registre) avant de conclure.

### 2. #4982.3 : Laura ne trie pas les contacts par zone

- Constat :
  - demande « mes contacts triés par zone » ;
  - Laura répond « région et ville … pas présents dans la lecture actuelle » ;
  - puis elle rend la liste brute de 73 422 contacts.
- L'écran /contacts sait trier par zone : bouton « Trier par zone », via `zoneSort` et `contact-seller-focus.ts`.
- À faire : l'outil de Laura qui lit les contacts (`apps/ia/app/services/chat_tools.py`) doit exposer la zone (ville, région) et le tri par zone, en réutilisant la même logique, sans second référentiel.

### 3. #4999.1 / #4999.2 : la puce « uniquement freelance » manque dans Découvrir › Besoins et signaux

- Constat : sur /discover Kubernetes, onglet Besoins et signaux (58 résultats) :
  - aucune puce « uniquement freelance » ;
  - aucun message quand le signal freelance est absent.
- Le filtre de contrat existe déjà côté offres : `discover-filters.ts`, `FilterRail.tsx`, `contractTypes`. La PR #5098 y ajoute CDD et intérim.
- À faire :
  - rends ce filtre « freelance seul » disponible sur l'onglet Besoins et signaux ;
  - si aucun signal freelance n'existe, l'écran le DIT.
- Lis #4999.

### 4. #5009.1 : le pied de liste ne dit pas le total

- Constat : le pied affiche « 685 offres lues » seul, sans « sur N trouvées ».
- À faire : dire « N lues sur M trouvées » quand M est CONNU.
- Si M est inconnu, ne rien inventer : l'écran le tait ou dit « total inconnu ».
- Aucun mot « crédit » (mémoire de Louis : crédits implicites).

### 5. #5013 : la réponse de Laura sur « les comptes les plus faciles où entrer » se contredit (issue rouverte)

- Constat, conversation réelle :
  - le texte dit « 8 comptes … classe A » alors que les cartes montrent A, C, B ;
  - des puces brutes s'affichent : « Partielle / territory / sector » ;
  - l'ordre est A, C, B.
- À faire :
  - le texte et les cartes viennent de la MÊME donnée ;
  - le tri suit la classe d'accès, A puis B puis C puis D ;
  - les puces portent un libellé fr ou en, jamais un code brut.
- Chemins : `chat_tools.py` (sort_by `access`, `access_class`) et le rendu web des cartes.

### 6. Chat : le bandeau « Reprendre » propose une conversation terminée

- Constat : l'accueil /chat propose « Reprendre » sur une conversation terminée, dont le statut est « En attente » dans la liste.
- À faire : le bandeau ne propose qu'un tour réellement en cours. Le mécanisme est `background-turns` (#4967).

## Méthode

1. Travaille sur CETTE branche, `fix/4962-r2-laura-decouvrir`.
2. Écris les tests d'abord (TDD).
3. Respecte les gardes `apps/web/src/architecture/`, avec l'i18n en fr et en en.
4. Tests CIBLÉS seulement :
   - au plus 5 specs par point, plus `tsc -p` du paquet ;
   - côté IA : pytest ciblé ;
   - jamais la suite complète, jamais le build.
5. Commits conventionnels :
   - scope `web`, `api` ou `ia` ;
   - lignes de moins de 100 caractères ;
   - aucune ligne de corps qui commence par `#` ;
   - pied `Refs #<n>`.
6. Push SIMPLE : `git push origin HEAD`. Pas de PR. Ne ferme ni ne commente aucune issue.
