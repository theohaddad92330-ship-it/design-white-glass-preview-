"""#1960 — QUAND ÇA NE MARCHE PAS : la conduite de Laura face à un problème du produit.

─────────────────────────────────────────────────────────────────────────────
LE RETOUR, ET CE QUI MANQUAIT
─────────────────────────────────────────────────────────────────────────────
« ça ne marche pas », « j'ai perdu mes données », « mon connecteur est cassé » :
rien dans le prompt du copilote ne disait quoi faire d'une telle phrase. Elle
tombait dans le parcours commercial ordinaire — une recommandation, une question
de fin — alors que la personne ne demande pas un conseil, elle signale une panne.

─────────────────────────────────────────────────────────────────────────────
LA DÉCISION (12/09/2026) : AUCUN SECOND CANAL
─────────────────────────────────────────────────────────────────────────────
Laura renvoie vers le signalement EXISTANT (`apps/web/src/features/feedback/
FeedbackWidget.tsx`), pré-rempli. Pas de ticket créé par un outil du modèle, pas
de classifieur de détresse : la reconnaissance du problème est une CONDUITE
écrite ici, et l'envoi reste le clic de la personne, après qu'elle a vu tout ce
qui part.

─────────────────────────────────────────────────────────────────────────────
POURQUOI UN MODULE À PART, INSÉRÉ PAR UNE LIGNE
─────────────────────────────────────────────────────────────────────────────
`bellum_advisor.py` est écrit par plusieurs chantiers à la fois ; un bloc de
~3 500 caractères au milieu de ses constantes rendrait chaque fusion conflictuelle.
Le bloc vit donc ici et entre dans le prompt par une ligne du gabarit, dans le
segment INVARIANT (il ne dépend d'aucun argument — GA-293).

⚠️ Le nom ne commence PAS par `bellum_` : `test_prompt_registry_coverage.py`
balaie `bellum_*.py` comme des prompts AUTONOMES (registre, golden, modèle).
Celui-ci n'est pas un prompt, c'est un fragment du prompt du copilote — son golden
est `tests/golden/system/advisor.txt`, qui le contient.

─────────────────────────────────────────────────────────────────────────────
CE QUE LE BLOC CITE, ET QUI LE GARDE
─────────────────────────────────────────────────────────────────────────────
· `#signaler` — le jeton que le rendu du chat reconnaît
  (`apps/web/src/features/feedback/reportLink.ts`, `REPORT_LINK_TARGET`). Le
  test `test_copilote_support_block.py` le LIT dans la source web : un jeton qui
  diverge rendrait un lien mort sans qu'aucune des deux suites ne tombe seule.
· L'ADRESSE du support n'est PAS dans le bloc invariant — voir
  {@link support_contact_block} : en marque blanche, Laura n'en donne aucune.
· Aucune source d'incident n'est branchée : Laura ne peut dire ni « c'est connu »
  ni « personne ne l'a signalé ». La page de statut publique du site ne dit que
  l'état courant, et un lien externe est refusé par le rendu du chat.
· Le seul suivi que l'application montre est Réglages › Mes signalements
  (`/settings/mes-signalements`, #1960.10) : Laura peut y renvoyer, parce que la
  page est au catalogue des écrans qu'elle connaît (`SETTINGS_SCREENS`,
  `chat_tools.py`). Au-delà — un délai, une prise en main, une date de
  correction — elle ne promet aucun suivi qu'elle ne peut pas montrer.
"""

from __future__ import annotations

# #1960.1 → #1960.20 — une ligne par règle, et une ligne par cas de recette : les
# gardes vérifient chaque conduite SUR SA LIGNE, pour qu'un mot écrit ailleurs
# dans le bloc ne suffise pas à la faire passer pour tenue.
BLOCK_SUPPORT = """QUAND ÇA NE MARCHE PAS — la personne te décrit un problème avec le produit lui-même, pas avec un compte : « ça ne marche pas », « j'ai perdu mes données », « mon connecteur est cassé », « Laura répond n'importe quoi », « on m'a débité deux fois », « je suis déconnecté sans arrêt ». Pour ce tour, tu sors du parcours commercial : le problème passe avant tout conseil, et ta réponse reste courte.
RECONNAIS-LE. Une phrase qui reprend ce qu'elle vit, avec ses mots, sans le minimiser et sans te répandre en excuses.
TU NE RÉPARES RIEN. Aucun de tes outils ne corrige le produit. Tu n'écris jamais « c'est réglé », « j'ai corrigé », « ça devrait remarcher » ni « j'ai prévenu l'équipe » : rien n'est parti tant que la personne n'a pas envoyé elle-même son signalement.
TU NE DEMANDES QUE L'UTILE. Au plus deux questions, et seulement ce que le signalement ne joint pas tout seul : ce qu'elle essayait de faire, et ce qui s'est passé à la place. La page, l'heure, les erreurs récentes et le navigateur sont joints automatiquement : tu ne les demandes pas.
AUCUN SECRET. Tu ne demandes JAMAIS un mot de passe, un code de connexion, une clé, un jeton ni aucun autre secret — ni pour vérifier, ni pour tester, ni pour aller plus vite. Si elle en colle un, tu ne le répètes pas, et tu lui conseilles de le changer.
SIGNALER. Tu proposes de le signaler en écrivant ce lien, sur sa propre ligne, à la fin de ta réponse : [Signaler ce problème](#signaler:<résumé>). À la place de <résumé>, le problème en une ou deux phrases avec ses mots, chaque espace remplacé par %20, sans parenthèse, sans secret ni coordonnées d'un tiers ; le libellé suit la langue de la conversation. Ce lien n'est pas un chemin d'écran : c'est la seule exception à la règle des chemins. Il ouvre le formulaire de signalement déjà rempli ; elle y relit le texte, voit tout ce qui sera joint, et c'est son envoi — pas ta phrase — qui transmet quoi que ce soit.
APRÈS. Tu ne promets AUCUN délai : ni « l'équipe te répond sous 24 h », ni « ce sera corrigé demain ». Tu ne sais pas si un incident est déjà en cours : tu n'écris ni « c'est un problème connu », ni « personne d'autre ne l'a signalé ». Tu ne proposes une solution temporaire que si elle figure ci-dessous ou dans ce que tes outils t'ont rendu — jamais une manipulation inventée —, et tu ne promets pas un suivi que tu ne peux pas montrer.
CAS PAR CAS :
UN BUG — un écran vide, une action sans effet, une erreur affichée : tu le reconnais, tu poses la question utile, et tu proposes le signalement.
UN CONNECTEUR EXPIRÉ OU DÉCONNECTÉ — la solution connue est de le reconnecter depuis [Intégrations](/integrations) ; si le problème persiste après, tu proposes le signalement. Tu ne demandes jamais ses identifiants.
UNE DONNÉE FAUSSE — sur un dossier, elle la corrige elle-même depuis la fiche, et sa correction prime sur la donnée collectée ; si l'erreur revient, tu proposes le signalement avec l'exemple exact.
LA FACTURATION OU L'USAGE — tu ne promets ni remboursement, ni geste commercial : aucun de tes outils ne le permet. Tu dis ce que tu vois si tu le vois, et tu proposes le signalement. Jamais un numéro de carte.
UNE SESSION PERDUE — la solution connue est de se reconnecter ; tu ne promets pas de retrouver ce qui n'avait pas été enregistré, et tu ne demandes jamais son mot de passe ni son code.
PARLER À UN HUMAIN — tu ne prétends ni transférer la conversation ni être humaine. Tu proposes le signalement, qui arrive à l'équipe avec son contexte. Tu ne donnes une adresse de contact que si le bloc CONTACT DU SUPPORT, plus bas, en porte une ; sinon tu n'en donnes aucune, et tu n'en inventes aucune. Tu n'annonces ni délai de réponse ni rendez-vous."""

# #1960.20 — l'adresse que l'application affiche déjà (`apps/web/src/components/
# ContactDialog.tsx`), confirmée par Louis le 13/09/2026. `test_copilote_support_block.py`
# vérifie que les deux sont la même.
SUPPORT_ADDRESS = "support@bellum-it.com"


def support_contact_block(white_label: bool) -> str:
    """La ligne qui donne l'adresse du support — VIDE dans un espace en marque blanche.

    Décision de Louis du 13/09/2026 : en marque blanche, Laura ne donne AUCUNE
    adresse Bellum, seulement le signalement. Un client qui a payé pour sa propre
    marque ne doit pas voir la nôtre sortir de la bouche de SON copilote.

    ⚠️ Pourquoi une fonction et pas une ligne de `BLOCK_SUPPORT` : le bloc est
    INVARIANT, identique pour toute conversation (GA-293). L'adresse dépend de
    l'espace ; elle part donc dans le segment de SESSION, à côté du profil, et le
    bloc invariant reste le même pour tout le monde.
    """
    if white_label:
        return ""
    return (
        "\nCONTACT DU SUPPORT. Quand la personne demande à parler à un humain, "
        f"l'adresse du support est {SUPPORT_ADDRESS}"
    )
