# Changelog « Nouveautés » — convention de maintien

Règle récurrente (Louis) : **le panneau « Nouveautés » in-app doit TOUJOURS
refléter ce qui est en prod.** « C'est important qu'on puisse toujours suivre le
changelog ici. » Une feature user-facing qui part sans entrée = un bug produit.

## Où ça vit

| Rôle                                                      | Fichier                                             |
| --------------------------------------------------------- | --------------------------------------------------- |
| Registre des entrées (id + nb d'items, ordre d'affichage) | `packages/contracts/src/changelog/entries.ts`       |
| Libellés FR                                               | `packages/contracts/src/changelog/labels.fr.ts`     |
| Libellés EN                                               | `packages/contracts/src/changelog/labels.en.ts`     |
| Rendu in-app (cloche + liste)                             | `apps/web/src/features/changelog/ChangelogMenu.tsx` |
| État « lu / non-lu » in-app                               | `apps/web/src/features/changelog/useChangelog.ts`   |
| Envoi e-mail (Newsletter Changelog)                       | `apps/api/src/modules/changelog-newsletter/`        |

**Un seul catalogue, deux consommateurs.** Le catalogue vivait dans `apps/web`
tant que la sidebar était le seul lecteur. Depuis la Newsletter Changelog
(e-mail bimensuel envoyé par l'API), il vit dans `@bellum/contracts` : l'API n'a
pas à lire un fichier de l'app web, et il n'y a rien à resynchroniser entre deux
copies. Le web branche ces libellés comme namespace i18n `changelog`
(`apps/web/src/i18n/resources.ts`) — il n'y a donc plus de
`locales/{fr,en}/changelog.json`.

Pas de backend : la source de vérité est le repo. Le point d'attention (dot) sur
la cloche s'allume tant que l'utilisateur n'a pas ouvert le panneau depuis la
dernière entrée (`LATEST_CHANGELOG_ID`, mémorisé en `localStorage`). Ouvrir le
panneau marque tout comme lu. Côté e-mail, le même `LATEST_CHANGELOG_ID` est
mémorisé par utilisateur en base (`notification_preferences.newsletter_last_entry_id`)
et seul le delta au-dessus de ce repère part — donc jamais deux fois la même
nouveauté, et rien du tout pour un lecteur à jour.

## Ajouter une entrée (à faire AVANT le merge de la feature)

1. **Choisir un `id` unique, préfixé par la date** `AAAA-MM-JJ`. Plusieurs
   thèmes le même jour → suffixe court : `2026-07-16-credits`,
   `2026-07-16-integrations`. L'`id` n'est jamais affiché ; seul le libellé
   `date` l'est.
2. **Ajouter `{ id, itemCount }` en tête** du tableau `CHANGELOG_IDS`
   (`packages/contracts/src/changelog/entries.ts`) — newest-first : la plus
   récente en haut.
3. **Renseigner les libellés dans les DEUX catalogues** (`fr` et `en`), sous
   `entries.<id>` : `date`, `title`, `item1` … `itemN`. Parité stricte : mêmes
   clés des deux côtés.
4. **`itemCount` = le nombre exact d'`itemN`.**

## Règles de contenu

- **Orienté utilisateur, pas jargon PR.** « Photos des contacts et logos
  d'entreprises », pas « Apollo organizations/enrich ».
- **N'annoncer que du réel.** Zéro vaporware : la feature doit être mergée sur
  `main`. Vérifier par `git log` / grep avant d'annoncer.
- **FR + EN à parité.** Même sens, mêmes `{{placeholders}}` s'il y en a.
- **Dates crédibles, pas de fausse précision.** Baser la date sur le repo/la PR.
  À défaut, regrouper sous un libellé cohérent (« Juillet 2026 ») plutôt que
  d'inventer un jour précis.
- **Regrouper par thème.** Une entrée = un thème cohérent, 2 à 4 items. Éviter
  la mega-entrée fourre-tout.

## Garde-fous automatiques

Trois tests protègent la synchro :

- `packages/contracts/src/changelog/changelog.test.ts` — cohérence registre ↔
  catalogues, là où vit le catalogue : ids uniques, `LATEST_CHANGELOG_ID` =
  entrée la plus récente, mêmes ids dans `CHANGELOG_IDS` / FR / EN, `itemCount`
  exact, arbre de clés FR = arbre de clés EN. Une entrée à moitié traduite ne
  peut donc pas partir dans un e-mail avec un trou.
- `apps/web/src/i18n/parity.test.ts` — parité FR/EN de tous les namespaces
  (0 clé manquante, 0 valeur vide, `{{placeholders}}` alignés). Le namespace
  `changelog` en fait partie : il est alimenté par le catalogue partagé.
- `apps/web/src/features/changelog/changelog-entries.test.ts` — le catalogue est
  bien BRANCHÉ sur l'i18n runtime : `getChangelog()` résout de vraies chaînes
  (aucune clé i18n brute affichée), en FR comme en EN.

Si l'un casse : une entrée a été ajoutée à moitié (id sans libellé, `itemCount`
faux, ou FR/EN désynchronisés). Corriger avant merge.
