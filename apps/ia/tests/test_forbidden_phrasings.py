"""GA-26 — les formulations interdites vivent à un seul endroit (#1922, #1926).

Six prompts (``bellum_advisor``, ``bellum_messages``, ``bellum_outreach``,
``bellum_linkedin_posts``, ``bellum_activity``, ``bellum_icebreaker``)
tenaient chacun tout ou partie de sa propre liste de formulations bannies.
« transformation digitale » était interdite dans trois d'entre eux, absente
des trois autres. Ce fichier tient deux garanties :

1. AUCUN prompt ne perd un interdit qu'il avait AVANT ``forbidden_phrasings``
   (``test_no_prompt_lost_a_ban_it_had``) — chaque phrase listée ci-dessous a
   été relevée dans le code tel qu'il était avant ce module.
2. Les SEPT prompts LISENT réellement le module partagé — pas seulement un
   texte qui coïncide par hasard (``test_each_prompt_actually_imports_the_
   shared_module``). Un nom n'est pas une preuve : deux fichiers peuvent
   contenir la même chaîne sans qu'aucun n'importe l'autre.

#3382 (retour bêta 30/09, hiérarchie des sources méthodologiques) — un
SEPTIÈME prompt, ``bellum_strategy`` (la stratégie de rang 2), tenait sa
PROPRE troisième copie de « je me permets de » / « nos expertises reconnues »
/ « notre méthodologie éprouvée » — jamais reliée à ``bellum_messages`` ni à
ce module, exactement le risque de divergence documenté ci-dessus.
``GENERIC_CREDIBILITY_PHRASINGS`` (``forbidden_phrasings.py``) est maintenant
la source unique des trois ; ``bellum_strategy`` la reçoit via ``ascii_fold``
(le prompt est rédigé sans accents, contrainte technique documentée dans son
en-tête) plutôt que de retaper une forme qui pourrait diverger de l'originale.

Preuves de garde (trois, comme toujours dans ce dépôt) :
 - elle SAIT DIRE NON : ``test_the_presence_check_catches_a_dropped_phrase``
   fabrique un texte auquel il manque une phrase et vérifie que le contrôle le
   voit.
 - elle LIT quelque chose : ``test_the_shared_module_is_not_empty``.
 - elle n'attrape pas ce qu'elle ne vise pas :
   ``test_a_prompt_that_never_bans_shared_phrasings_is_not_flagged`` — un
   module qui n'a rien à voir avec le sujet (bellum_org_declare) ne doit rien
   déclencher.
"""

from __future__ import annotations

import inspect
import re
import unicodedata
from typing import NamedTuple

import pytest

from app.prompts import (
    bellum_activity,
    bellum_advisor,
    bellum_icebreaker,
    bellum_linkedin_posts,
    bellum_messages,
    bellum_org_declare,
    bellum_outreach,
    bellum_strategy,
)
from app.prompts.forbidden_phrasings import (
    COPILOT_FALSE_PROMISE,
    COPILOT_FORBIDDEN_PHRASINGS,
    COPILOT_MANUAL_REDIRECT_PHRASINGS,
    DIGITAL_TRANSFORMATION,
    FALSE_URGENCY,
    GENERIC_CREDIBILITY_PHRASINGS,
    GO_TO_A_PROFESSIONAL_NETWORK,
    HISTORICAL_DATA_ALARMIST,
    INTERNAL_CATALOGUE,
    MEMORY_AVAILABLE,
    MESSAGE_FORBIDDEN_BEHAVIOURS,
    MESSAGE_FORBIDDEN_PHRASINGS,
    NO_MESSAGE_SEEN_REPROACH,
    SERVICES_LIST,
    SHARED_FORBIDDEN_PHRASINGS,
    SYSTEMATIC_MEETING_REQUEST,
    WORKSPACE_ACCOUNT,
    YOU_CAN_SEARCH,
    ascii_fold,
    quoted_fr,
)

# ── Ce que chaque prompt bannissait AVANT ce module (relevé dans le code) ────

_LINKEDIN_POSTS_ORIGINAL_BANS = ("transformation digitale", "nos experts certifiés")
_ACTIVITY_ORIGINAL_BAN = "transformation digitale"
_ICEBREAKER_ORIGINAL_BANS = (
    "je me permets de vous contacter car",
    "juste un petit follow-up",
    "nos expertises reconnues",
    "notre méthodologie éprouvée",
    "présentation corporate de l'ESN dès la première ligne",
    "transformation digitale",
    "promesse d'audit flash systématique",
    "message identique pour un C-level, un opérationnel, les achats et un sponsor",
    "nos experts certifiés",
    "notre approche agile éprouvée",
)
_MESSAGES_ORIGINAL_BANS = (
    "je me permets de",
    "juste un petit follow-up",
    "nos expertises reconnues",
    "notre méthodologie éprouvée",
)
_ADVISOR_ORIGINAL_META_BANS = (
    "d'après tes données",
    "je vois que",
    "selon mon analyse",
)


def _present(haystack: str, phrases: tuple[str, ...]) -> list[str]:
    """Les phrases de ``phrases`` ABSENTES de ``haystack`` — [] si tout y est."""
    return [phrase for phrase in phrases if phrase not in haystack]


# ── 1. Le corpus n'est pas vide (la garde LIT quelque chose) ────────────────


def test_the_shared_module_is_not_empty():
    assert SHARED_FORBIDDEN_PHRASINGS
    assert COPILOT_FORBIDDEN_PHRASINGS
    assert MESSAGE_FORBIDDEN_PHRASINGS
    assert DIGITAL_TRANSFORMATION == "transformation digitale"
    assert HISTORICAL_DATA_ALARMIST == "donnée historique inquiétante"
    assert COPILOT_FALSE_PROMISE == "je vais m'en occuper"
    assert NO_MESSAGE_SEEN_REPROACH == "avez-vous vu mon message"


# ── 2. La garde sait dire NON ────────────────────────────────────────────────


def test_the_presence_check_catches_a_dropped_phrase():
    text_missing_one = "Ce texte ne mentionne que « d'après tes données »."
    missing = _present(text_missing_one, _ADVISOR_ORIGINAL_META_BANS)
    assert missing == ["je vois que", "selon mon analyse"]


def test_a_prompt_that_never_bans_shared_phrasings_is_not_flagged():
    # bellum_org_declare n'a jamais eu vocation à bannir du jargon commercial —
    # une garde qui le signalerait attraperait n'importe quel prompt, pas le
    # bon : aucune de ses phrases ne devrait y figurer.
    system = bellum_org_declare.build_system_prompt()
    assert _present(system, SHARED_FORBIDDEN_PHRASINGS) == list(SHARED_FORBIDDEN_PHRASINGS)


# ── 3. Aucun prompt ne perd un interdit qu'il avait ─────────────────────────


def test_linkedin_posts_keeps_every_original_ban():
    system = bellum_linkedin_posts.build_system_prompt()
    assert _present(system, _LINKEDIN_POSTS_ORIGINAL_BANS) == []


def test_activity_keeps_its_original_conditional_ban():
    system = bellum_activity.build_system_prompt({})
    assert _ACTIVITY_ORIGINAL_BAN in system


def test_icebreaker_keeps_every_original_ban():
    system = bellum_icebreaker.build_system_prompt({})
    assert _present(system, _ICEBREAKER_ORIGINAL_BANS) == []


def test_messages_keeps_every_original_ban():
    system = bellum_messages.build_system_prompt({})
    assert _present(system, _MESSAGES_ORIGINAL_BANS) == []


def test_outreach_keeps_every_original_ban_via_the_shared_golden_rules_block():
    # bellum_outreach ne tient pas sa propre liste : il REND golden_rules_block
    # de bellum_messages (module docstring). Les bans doivent donc y atteindre
    # aussi, par ce même canal.
    system = bellum_outreach.build_system_prompt({}, "email")
    assert _present(system, _MESSAGES_ORIGINAL_BANS) == []


def test_advisor_keeps_every_original_meta_ban():
    system = bellum_advisor.build_system_prompt({}, {}, "", "")
    assert _present(system, _ADVISOR_ORIGINAL_META_BANS) == []


def test_strategy_keeps_every_original_ban_ascii_folded():
    # #3382 — bellum_strategy est rédigé SANS accents (contrainte technique
    # documentée dans son en-tête) : la garde compare donc la forme
    # `ascii_fold`-ée, pas les trois phrases accentuées de `_MESSAGES_ORIGINAL_
    # BANS`. Les trois phrases (hors « juste un petit follow-up », propre aux
    # messages) doivent rester dans le prompt de stratégie.
    system = bellum_strategy.build_system_prompt({})
    folded = [ascii_fold(p) for p in GENERIC_CREDIBILITY_PHRASINGS]
    assert _present(system, tuple(folded)) == []


def test_strategy_and_messages_share_the_same_governed_source():
    # #3382 (GA-26) — preuve qu'il n'existe plus deux copies indépendantes :
    # les DEUX prompts dérivent de `GENERIC_CREDIBILITY_PHRASINGS`, l'un tel
    # quel (accentué), l'autre `ascii_fold`-é — jamais deux listes retapées à
    # la main qui pourraient diverger au prochain ajout.
    strategy_system = bellum_strategy.build_system_prompt({})
    messages_system = bellum_messages.build_system_prompt({})
    for phrase in GENERIC_CREDIBILITY_PHRASINGS:
        assert phrase in messages_system
        assert ascii_fold(phrase) in strategy_system


# ── 4. Les nouveaux interdits (#1922, #1926) ────────────────────────────────


def test_advisor_gains_its_four_new_bans():
    system = bellum_advisor.build_system_prompt({}, {}, "", "")
    assert "je note" in system
    assert "voici une analyse exhaustive" in system
    assert DIGITAL_TRANSFORMATION in system
    assert COPILOT_FALSE_PROMISE in system
    # #1922.19 — ce n'est pas un bannissement sec : la nuance (sans agir dans
    # le même tour) doit être écrite, sinon Laura ne pourrait plus jamais dire
    # « je m'en occupe » même quand elle vient réellement d'agir.
    assert "sans" in system.split(COPILOT_FALSE_PROMISE, 1)[1][:120]


def test_messages_and_outreach_gain_their_two_new_bans():
    for system in (
        bellum_messages.build_system_prompt({}),
        bellum_outreach.build_system_prompt({}, "linkedin"),
    ):
        assert DIGITAL_TRANSFORMATION in system
        assert HISTORICAL_DATA_ALARMIST in system
        # « Je me permets » (la garde spécifique du lot) reste présente à côté
        # des deux nouveaux interdits — pas remplacée par eux.
        assert "je me permets" in system.lower()


@pytest.mark.parametrize(
    "system",
    [
        bellum_messages.build_system_prompt({}),
        bellum_outreach.build_system_prompt({}, "email"),
        bellum_outreach.build_system_prompt({}, "phone"),
    ],
    ids=["messages", "outreach-email", "outreach-phone"],
)
def test_message_prompts_render_both_message_baskets_whole(system: str):
    # #1926.22 « liste de services », .23 « fausse urgence », .24 « demande de
    # rendez-vous systématique » : un panier de COMPORTEMENTS dans le module
    # unique, jamais une seconde liste tenue dans un prompt. Les deux paniers
    # sont rendus ENTIERS : un ajout au module atteint les deux prompts messages.
    assert set(MESSAGE_FORBIDDEN_BEHAVIOURS) == {
        SERVICES_LIST,
        FALSE_URGENCY,
        SYSTEMATIC_MEETING_REQUEST,
    }
    assert _present(system, MESSAGE_FORBIDDEN_PHRASINGS) == []
    assert _present(system, MESSAGE_FORBIDDEN_BEHAVIOURS) == []


def test_behaviours_are_not_quoted_as_literal_phrasings():
    # Un comportement entre guillemets se lirait comme une chaîne que le contrôle
    # avant envoi saurait trouver — il ne le sait pas.
    system = bellum_messages.build_system_prompt({})
    assert [b for b in MESSAGE_FORBIDDEN_BEHAVIOURS if f"« {b} »" in system] == []


def test_messages_and_outreach_ban_the_have_you_seen_my_message_reproach():
    # #2374.10 — l'esprit était déjà couvert (« ne reproche jamais le
    # silence », message_brief.py:61) mais la phrase LITTÉRALE n'était bannie
    # nulle part : un contrôle avant envoi par sous-chaîne (`no_banned_phrases`)
    # ne voit que ce qui est écrit entre guillemets ici.
    for system in (
        bellum_messages.build_system_prompt({}),
        bellum_outreach.build_system_prompt({}, "linkedin"),
    ):
        assert NO_MESSAGE_SEEN_REPROACH in system


def test_the_copilot_does_not_inherit_message_only_bans():
    # Témoin voisin : « demande de rendez-vous systématique » est un interdit de
    # MESSAGE commercial ; le chat ne le reçoit pas par ricochet.
    assert SYSTEMATIC_MEETING_REQUEST not in bellum_advisor.build_system_prompt({}, {}, "", "")


# ── #3189.4 (LAU-FINAL-195) — panier distinct : une DÉLÉGATION du travail, ──
# pas un tic de moteur de conversation. Testé séparément de BANS ci-dessus,
# même logique que MESSAGE_FORBIDDEN_BEHAVIOURS vs MESSAGE_FORBIDDEN_PHRASINGS.


def test_manual_redirect_phrasings_are_not_empty():
    assert COPILOT_MANUAL_REDIRECT_PHRASINGS
    assert GO_TO_A_PROFESSIONAL_NETWORK == "va sur un réseau professionnel"
    assert YOU_CAN_SEARCH == "tu peux rechercher"


def test_manual_redirect_phrasings_never_name_a_vendor():
    # #3189.4 — « nos fournisseurs ne se nomment jamais à l'écran » : ce
    # panier est rendu dans le prompt, donc aucune phrase ne peut nommer
    # LinkedIn ou Google, même pour les bannir (déjà gardé côté prompt par
    # `test_no_vendor_name_reaches_the_system_prompt`, revérifié ICI côté
    # source du module pour qu'un futur ajout le voie tout de suite).
    for phrase in COPILOT_MANUAL_REDIRECT_PHRASINGS:
        assert "linkedin" not in phrase.lower()
        assert "google" not in phrase.lower()


def test_advisor_bans_every_manual_redirect_phrasing():
    system = bellum_advisor.build_system_prompt({}, {}, "", "")
    assert _present(system, COPILOT_MANUAL_REDIRECT_PHRASINGS) == []


# ── 5. Les six prompts LISENT réellement le module partagé ─────────────────


def test_each_prompt_actually_imports_the_shared_module():
    """Un nom n'est pas une preuve (mémoire du dépôt) : une chaîne identique
    dans deux fichiers ne prouve pas qu'ils partagent une source. On lit le
    SOURCE de chaque module et on vérifie l'import réel."""
    modules = (
        bellum_advisor,
        bellum_messages,
        bellum_outreach,
        bellum_linkedin_posts,
        bellum_activity,
        bellum_icebreaker,
        bellum_strategy,
    )
    missing_import = [
        mod.__name__
        for mod in modules
        if "app.prompts.forbidden_phrasings" not in inspect.getsource(mod)
        # bellum_outreach hérite via `golden_rules_block` de bellum_messages :
        # il n'a pas besoin d'importer le module lui-même pour en bénéficier.
        and mod is not bellum_outreach
    ]
    assert missing_import == []


def test_quoted_fr_renders_french_guillemets_joined_by_commas():
    assert quoted_fr(["a", "b"]) == "« a », « b »"
    assert quoted_fr(["a"]) == "« a »"


# ── 6. Chaque formulation interdite : son NON et son témoin voisin légitime ──
#
# #1922.15, .17, .18, .19 — les interdits sont dans le prompt (sections 3 et 4).
# Ce que le prompt ne prouve pas, c'est qu'une RÉPONSE les respecte : c'est
# l'éval en ligne, et elle a besoin d'un oracle PRÉCIS — un oracle qui attrape
# « ta note du 3 mars » en cherchant « je note » finit désactivé. Celui-ci fixe
# la sémantique (casse et apostrophe typographique ignorées, frontières de mot)
# et chaque interdit prouve les deux sens : il attrape la phrase dite, il laisse
# passer sa voisine légitime.
#
# ⚠️ L'oracle vit ICI et pas dans `forbidden_phrasings.py` : le module n'a pas de
# garde de sortie, et en écrire une que rien n'appelle en production serait du
# code que personne n'appelle. La brancher sur la réponse relève de
# `routers/chat.py` / `chat_orchestrator.py`, hors du périmètre de ce lot.


def _normalise_reply(text: str) -> str:
    folded = unicodedata.normalize("NFKC", text).replace("’", "'").lower()
    return re.sub(r"\s+", " ", folded)


def _said(phrase: str, text: str) -> bool:
    return re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text) is not None


def _banned_hits(reply: str, *, acted_this_turn: bool) -> list[str]:
    text = _normalise_reply(reply)
    hits = [phrase for phrase in (*SHARED_FORBIDDEN_PHRASINGS, *COPILOT_FORBIDDEN_PHRASINGS) if _said(phrase, text)]
    # #1922.19 — la promesse n'est fautive que SANS action réelle dans le tour.
    if not acted_this_turn and _said(COPILOT_FALSE_PROMISE, text):
        hits.append(COPILOT_FALSE_PROMISE)
    return hits


class Ban(NamedTuple):
    phrase: str
    said: str
    neighbour: str


BANS: tuple[Ban, ...] = (
    Ban(
        "d'après tes données",
        "D’après tes données, Airbus est ton compte le plus chaud.",
        "D'après le registre public, le siège d'Airbus est à Blagnac.",
    ),
    Ban(
        "je vois que",
        "Je vois que tu as trois comptes dormants.",
        "Je vois deux suites possibles : relancer Marc ou ouvrir Thales.",
    ),
    Ban(
        "selon mon analyse",
        "Selon mon analyse, il faut commencer par Thales.",
        "Selon l'analyse du 12 mars, le budget cyber est voté.",
    ),
    # #1922.15
    Ban(
        "je note",
        "Je note que tu préfères le téléphone.",
        "Ta note du 3 mars dit que le budget est gelé.",
    ),
    # #1922.17
    Ban(
        "voici une analyse exhaustive",
        "Voici une analyse exhaustive du compte Airbus.",
        "Voici l'analyse du compte Airbus, en trois points.",
    ),
    # #1922.18 — les deux mots séparés restent légitimes.
    Ban(
        "transformation digitale",
        "Leur Transformation Digitale est une porte d'entrée.",
        "Leur plateforme digitale et la transformation de leur DSI ouvrent un besoin.",
    ),
    # #2270.19 — la formule figée qui répète l'accord plutôt que corriger.
    Ban(
        "tu as raison",
        "Tu as raison, j'ai confondu deux comptes.",
        "Ton point tient : je corrige la confusion tout de suite.",
    ),
    # #2270.20 — creuse quand elle ne débouche sur aucun résultat.
    Ban(
        "je comprends ta frustration",
        "Je comprends ta frustration, on va arranger ça.",
        "Tu es agacé, à raison — voici ce que je corrige maintenant.",
    ),
    # #2270.22 — une promesse de progrès future, jamais un geste présent.
    Ban(
        "je vais faire mieux",
        "Je vais faire mieux la prochaine fois.",
        "Je corrige maintenant, et voici le résultat.",
    ),
    # #3191.3 (LAU-FINAL-197) — le sujet effacé derrière un conditionnel, le
    # symptôme exact du rapport généré. « il faudrait » reste légitime : c'est
    # celui qui parle qui assume l'hypothèse.
    Ban(
        "il conviendrait de",
        "Il conviendrait de relancer Airbus avant la fin du mois.",
        "Il faudrait relancer Airbus avant la fin du mois.",
    ),
    # #3195.3 — un refus nu qui ne dit ni ce qui manque ni ce qui est su.
    Ban(
        "je ne peux pas répondre",
        "Je ne peux pas répondre à cette question.",
        "Je ne peux pas vérifier ce chiffre avant demain, mais voici où j'en suis.",
    ),
    # #3195.3 — même défaut : un trou annoncé sans ce qui EST connu à côté.
    Ban(
        "aucune information disponible",
        "Aucune information disponible sur cette filiale.",
        "J'ai peu d'informations récentes sur cette filiale, voici ce que je sais.",
    ),
    # #3195.3 — Laura ne redirige jamais vers un outil externe qu'elle peut
    # interroger elle-même. ⚠️ Vendor-neutre (intégration X2 28/09) : jamais le
    # nom du fournisseur, même dans un exemple de test — la garde
    # `test_no_vendor_name_reaches_the_system_prompt` interdit « LinkedIn »
    # dans tout ce qui atterrit dans le prompt système.
    Ban(
        "consulte un réseau professionnel",
        "Consulte un réseau professionnel pour trouver ses coordonnées.",
        "Son profil est déjà référencé dans le dossier, je vérifie ses coordonnées maintenant.",
    ),
    # #3346.1 (LAU-FINAL-256) — l'organisation interne du produit, jamais une
    # réalité commerciale : aucun usage légitime, contrairement à « ton
    # espace » (voisin correct plus bas).
    Ban(
        INTERNAL_CATALOGUE,
        "Ce besoin figure dans le catalogue interne.",
        "Ce besoin figure dans les besoins enregistrés dans ton espace Bellum.",
    ),
    # #3346.3 — jargon technique sans équivalent commercial.
    Ban(
        WORKSPACE_ACCOUNT,
        "Ce workspace account porte trois besoins ouverts.",
        "Ce compte client enregistré dans ton entreprise porte trois besoins ouverts.",
    ),
    # #3346.5 — distinct de « mémoire marché » (légitime si précisée, voir
    # `laura_business_language.py`) : « disponible » ne dit rien de ce qu'elle contient.
    Ban(
        MEMORY_AVAILABLE,
        "Il y a de la mémoire disponible sur ce secteur.",
        "Bellum connaît des observations historiques agrégées sur ce secteur.",
    ),
)


def test_every_banned_phrasing_has_its_no_and_its_neighbour():
    """La garde LIT le module : un interdit ajouté sans cas fait échouer ce test."""
    assert len(BANS) >= 6
    assert {ban.phrase for ban in BANS} == {
        *SHARED_FORBIDDEN_PHRASINGS,
        *COPILOT_FORBIDDEN_PHRASINGS,
    }


@pytest.mark.parametrize("ban", BANS, ids=[ban.phrase for ban in BANS])
def test_the_oracle_catches_the_phrase_when_it_is_said(ban: Ban):
    assert ban.phrase in _banned_hits(ban.said, acted_this_turn=False)


@pytest.mark.parametrize("ban", BANS, ids=[ban.phrase for ban in BANS])
def test_the_oracle_lets_the_legitimate_neighbour_through(ban: Ban):
    assert _banned_hits(ban.neighbour, acted_this_turn=False) == []


@pytest.mark.parametrize("ban", BANS, ids=[ban.phrase for ban in BANS])
def test_the_chat_prompt_bans_each_phrase_in_quotes(ban: Ban):
    system = bellum_advisor.build_system_prompt({}, {}, "", "")
    assert f"« {ban.phrase} »" in system
    assert _present(system.replace(f"« {ban.phrase} »", ""), (f"« {ban.phrase} »",)) == [f"« {ban.phrase} »"]


def test_1922_19_the_false_promise_is_caught_only_without_a_real_action():
    said = "Parfait, je vais m’en occuper."
    assert _banned_hits(said, acted_this_turn=False) == [COPILOT_FALSE_PROMISE]
    # Témoins voisins : la même phrase après un geste réellement accompli, et
    # la même tournure adressée à l'autre personne.
    assert _banned_hits(said, acted_this_turn=True) == []
    assert _banned_hits("Tu vas t'en occuper demain ?", acted_this_turn=False) == []
    assert f"« {COPILOT_FALSE_PROMISE} »" in bellum_advisor.build_system_prompt({}, {}, "", "")
