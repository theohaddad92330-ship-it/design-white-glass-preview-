# Constat — les CHOIX du questionnaire de profil ne sont pas traduits

Trouvé le 20/09/2026 en enquêtant sur le défaut des deux questions qui affichaient leur clé
i18n (corrigé par `GA-368`). Ce constat-ci n'est **pas** corrigé : il est plus gros, et il
mérite une décision avant d'être ouvert.

## Ce qui est mesuré, et sûr

- L'écran rend un choix par `labelOf` :
  `apps/web/src/features/onboarding/components/QuestionField.tsx:165` et `:267`
  ```ts
  const labelOf = (choice: Choice): string => (choice.labelKey ? t(choice.labelKey) : choice.value)
  ```
  Donc : **pas de `labelKey` → la valeur brute s'affiche telle quelle.**
- `packages/contracts/src/schemas/profile-questionnaire.ts` contient **zéro** occurrence de
  `labelKey` (`grep -c` = 0), et son helper rend des chaînes nues :
  ```ts
  const opt = (key: keyof typeof PROFILE_QUESTION_OPTIONS): readonly string[] => PROFILE_QUESTION_OPTIONS[key]
  ```
- `PROFILE_QUESTION_OPTIONS` porte **47 listes** de choix, écrites en français
  (« Fondateur / CEO », « Talent Manager / Recruteur », « Moins de 3 mois »…).
- Les catalogues i18n ne les contiennent pas : `profileQuestions` (EN) n'a que
  `dialog`, `blocks`, `items`, `summary` — **aucun dictionnaire d'options** — et
  `git grep "Vente / prospection" -- apps/web/src/i18n` rend **ABSENT**.

**Conséquence** : un utilisateur en anglais lit une question traduite et des **réponses en
français**.

## Ce qui n'est PAS mesuré, et pourquoi

Le **nombre exact de valeurs** concernées. Une extraction des chaînes entre guillemets
ramène aussi le **texte des commentaires** du fichier — et le fichier documente lui-même ce
piège : « `options_du_questionnaire` extrait les chaînes entre guillemets sans retirer les
commentaires, et une apostrophe non appairée y ouvrait une fausse chaîne ». Un comptage
juste doit retirer les commentaires d'abord (cf. la règle `stripComments` du dépôt).

## Pourquoi ça n'a pas été corrigé au passage

Parce que ce n'est pas un oubli, c'est un **arbitrage** : la valeur affichée EST la valeur
stockée en base et lue par les prompts. Traduire les choix demande d'introduire un couple
(valeur stable, libellé traduit) sur 47 listes, sans jamais changer ce qui est déjà stocké
ni ce que les prompts lisent — sinon les réponses déjà données changent de sens.

## Question pour Louis

Est-ce qu'on ouvre ce chantier maintenant, ou est-ce que l'anglais du questionnaire attend
un premier client anglophone ? La règle permanente du projet dit « FR + EN + packs pays »,
donc le défaut est réel ; c'est son moment qui se décide.
