# Messages LinkedIn ESN — distillation (Guide de prospection LinkedIn)

> Source : doc Drive "MESSAGES LINKEDIN ESN" — 36 templates, 4 scénarios, 3 personas, séquences 3 temps. Objectif : créer du lien, pas vendre.

## 8 règles d'or (verbatim)

1. 150-200 mots max par message.
2. Toujours commencer par « J'espère que vous allez bien ».
3. Message 1 = **zéro mention de votre entreprise**.
4. Chaque question doit être facile à répondre.
5. Personnalisez TOUJOURS les `{{variables}}` (élément réel et vérifié).
6. Respectez les timings entre messages.
7. **Jamais** de « je me permets de » ni de jargon ESN.
8. Adaptez le levier au niveau hiérarchique du contact.

## Phrases bannies (rejet automatique)

« je me permets de » · « juste un petit follow-up » · « nos expertises reconnues » · « notre méthodologie éprouvée » · jargon ESN générique.

## 3 personas (le levier change, pas la structure)

- **Décideur stratégique** (CTO/VP/Head of) : tension stratégique haute altitude (roadmap vs capacité). Vouvoiement, déférent ("vous êtes très sollicité"), anecdote d'un pair directeur. Décideur M1 = pure curiosité, **pas de question/ask**.
- **Manager opérationnel** (Eng Manager/Delivery Manager) : pression delivery (build vs run, "trop de projets pas assez de bras"). Cas concret chiffré ("bloqué 3 mois → pourvu en 10 jours").
- **Opérationnel/CDP** (Tech Lead/Scrum Master) : techno/projet, registre le plus casual, CTA les plus rapides. M3 adresse les non-décideurs ("même si vous n'êtes pas décisionnaire").

## 4 scénarios

- **A — Acceptation d'invitation** : premier contact, zéro pression.
- **B — Connexion dormante** : réactiver via élément déclencheur (publication/nomination/projet).
- **C — Contact référé** : `{{Référent}}` comme preuve sociale.
- **D — Approche froide** : note d'invitation 300 car. + séquence si acceptation.

## Séquence 3 temps

- **M1 — Ouverture (J0)** : créer le lien, zéro mention entreprise, référence un élément réel du profil, 1 question facile OU disclaimer "Aucune démarche commerciale".
- **M2 — Apport de valeur (J+5 à J+7)** : insight/preuve (anecdote d'un pair, stat contre-intuitive), finit par "Est-ce un sujet qui résonne ?".
- **M3 — Clôture élégante (J+12 à J+14)** : sortie gracieuse ("Trois messages, c'est ma limite"), offre disponible sur demande, recule sans pression. **Pas d'ask RDV avant M3** (et même M3 ne pousse pas, laisse la porte ouverte).
  Arc : curiosité → preuve/insight → offre permanente + sortie.

## Mapping relation → scénario (logique de sélection)

Cold (pas de lien LinkedIn) → D · référé (un `{{Référent}}` existe dans le graphe) → C · connexion existante froide → B · invitation fraîchement acceptée → A. **Le prompt choisit le scénario depuis la donnée, pas au hasard.**

## Variables

`{{Prénom}}` `{{Entreprise}}` `{{domaine}}` `{{techno/projet}}` `{{expertise}}` `{{secteur}}` `{{Référent}}` `{{élément déclencheur}}` `{{sujet}}`.

## KPI cibles

Acceptation invitations >35% · réponse M1 >15% · réponse séquence complète >25% · conversations qualifiées >10% des réponses.

## Exemples (verbatim, représentatifs)

**A/M1/Décideur** (curiosité, no-ask) : « J'espère que vous allez bien. Content d'être connectés ! En parcourant votre profil, j'ai vu que vous pilotiez les sujets {{domaine}} chez {{Entreprise}}. C'est un périmètre sur lequel j'échange beaucoup… tensions entre accélération des roadmaps et capacité réelle des équipes. Aucune démarche commerciale derrière ce message… au plaisir d'échanger, {{Prénom}} »

**A/M1/Opérationnel** (1 question binaire) : « …vous êtes plutôt sur de la construction from scratch ou de l'industrialisation d'un existant ? Ce sont deux mondes complètement différents. »

**C/M1/Décideur** (référé) : « Je vous contacte suite à un échange avec {{Référent}}, qui m'a mentionné votre rôle sur {{domaine}} chez {{Entreprise}}… »

**D/M1/Décideur** (note 300 car. + suivi) : « [NOTE] {{Prénom}}, j'échange régulièrement avec des directions {{domaine}}… comment accélérer la montée en compétence sans sacrifier la qualité. Pas de pitch, juste de la curiosité. »

## Mapping → prompts

- **messages/contacts** : persona = branche de prompt (levier par niveau) ; scénario = 2e axe (sélectionné depuis la relation) ; générer M1/M2/M3 avec timing ; contraintes dures (150-200 mots, opener obligatoire, M1 zéro entreprise, 1 question, ban-list) = règles + validateurs regex/longueur post-génération.
- **icebreaker** : M1 = la spec icebreaker (2 archétypes : curiosité-only décideur / question-binaire opérationnel ; branche référé si `{{Référent}}`).
- Anti-fabrication : chaque `{{variable}}` remplie depuis une donnée réelle ou message rejeté.
