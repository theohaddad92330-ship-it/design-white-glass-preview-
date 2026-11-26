"""Garde de doctrine sur le PROMPT SYSTÈME du Profiler (#2063, #2064).

LA SOURCE, deux retours filés depuis la même session de production le
14/09/2026 sur /welcome (rapport de bug in-app) :

#2063 — AUDIT — INTERPRÉTER SANS HALLUCINER. Un « non-dit » ne devient jamais
un fait : une réponse ambiguë ou contradictoire se NOMME comme telle
(« la stabilité reste à vérifier »), elle ne se remplace jamais par une
affirmation inventée plus stricte (« tu n'as en réalité que trois heures »).

#2064 — AUDIT — CONTRADICTIONS COMMERCIALES EXPLIQUÉES. Une tension entre
deux réponses (objectif vs capacité, cibles multiples, etc.) se nomme sur un
ton NON ACCUSATOIRE ; elle ne se résout jamais en silence.

CE QUE CE FICHIER GARDE, ET CE QU'IL NE GARDE PAS
---------------------------------------------------
Le Profiler N'A PAS de champ structuré pour porter une liste de
contradictions (contrairement à `score_context` / `scoring_personalization`,
qui portent déjà l'interdit de probabilité depuis #2069) : ajouter un tel
champ touche `app/models/profile_context.py`, hors du périmètre de ce lot —
voir le rapport d'agent, section « ce que je n'ai pas fait ». Ce fichier
garde donc ce qui EST du ressort du prompt système seul : (a) l'interdit de
probabilité, étendu ici à TOUS les champs texte du Profiler et pas seulement
aux deux déjà protégés côté schéma, et (b) la règle qui empêche le modèle de
résoudre une contradiction en un fait inventé, appliquée aux champs texte qui
le permettent.

CORPUS ET MÉTHODE
------------------
Le corpus est `BELLUM_PROFILER_SYSTEM` — le TEXTE RÉEL envoyé au modèle comme
message système (`app/agents/profiler.py::_generate` : `call_claude_sync(
BELLUM_PROFILER_SYSTEM, user_prompt, ...)`), pas une docstring ni un
commentaire voisin. Pour l'interdit de probabilité, on réutilise
`_PROBABILITY_WORDING` (`app.models.reply_blocks`) — le même motif, mot pour
mot, que celui qui garde déjà le schéma du Profiler côté
`test_profile_context_prompt_doctrine.py` — et sa distinction NOMMER /
COMMANDER : une phrase qui CITE « probabilité » pour la refuser n'est pas une
phrase qui la commande. Les deux petits utilitaires ci-dessous sont dupliqués
à dessein depuis ce fichier voisin : ce sont des outils texte génériques, et
aucun des deux fichiers n'est censé importer depuis un module de test voisin.
"""

from __future__ import annotations

import re

from app.models.reply_blocks import _PROBABILITY_WORDING
from app.prompts.bellum_profiler import BELLUM_PROFILER_SYSTEM, build_profiler_user_prompt

# Un segment = une phrase. On coupe sur la ponctuation forte et les retours à
# la ligne uniquement : une virgule sépare « ni probabilité, ni chance de
# signer », qui reste UN seul interdit.
_SEGMENT = re.compile(r"[.;\n]")

# Un mot de refus dans le MÊME segment : la phrase NOMME l'interdit au lieu
# de le commander. Sans cette nuance, une garde rougit sur le texte qui la
# protège — c'est le piège que `test_profile_context_prompt_doctrine.py` a
# déjà payé une fois dans ce dépôt.
_REFUSAL = re.compile(
    r"\bjamais\b|\baucune?\b|\bni\b|\bpas\b|\binterdit\w*\b|\bsans\b|\bexclus?\b",
    re.IGNORECASE,
)


def matching_segments(text: str, pattern: re.Pattern[str]) -> list[str]:
    """Segments où ``pattern`` apparaît, refus compris.

    ``re.Pattern.search`` est sans état en Python (contrairement à un
    ``RegExp`` JS porteur du drapeau ``g``), donc l'appel en boucle est sûr.
    """

    return [segment.strip() for segment in _SEGMENT.split(text) if pattern.search(segment)]


def commanding_segments(text: str, pattern: re.Pattern[str]) -> list[str]:
    """Segments où ``pattern`` est COMMANDÉ, pas interdit."""

    return [segment for segment in matching_segments(text, pattern) if not _REFUSAL.search(segment)]


# ---------------------------------------------------------------------------
# Preuve n°2 — la garde LIT quelque chose (corpus non vide).
# ---------------------------------------------------------------------------


def test_le_corpus_nest_pas_vide() -> None:
    assert len(BELLUM_PROFILER_SYSTEM) > 500
    assert "RÈGLES" in BELLUM_PROFILER_SYSTEM


# ---------------------------------------------------------------------------
# #2063 — aucune probabilité, dans AUCUN segment qui la commande ; et
# l'interdit doit être ÉCRIT, pas seulement absent de mention.
# ---------------------------------------------------------------------------


def test_le_prompt_systeme_ne_commande_aucune_probabilite() -> None:
    """#2063 — aucun segment du prompt système ne COMMANDE une probabilité.

    Les segments qui la CITENT pour la refuser restent (c'est le bullet
    lui-même) — seuls les segments qui la commandent doivent être absents.
    """

    offending = commanding_segments(BELLUM_PROFILER_SYSTEM, _PROBABILITY_WORDING)
    assert offending == [], f"le prompt système commande une probabilité : {offending}"


def test_le_prompt_systeme_interdit_explicitement_la_probabilite() -> None:
    """#2063 — l'interdit de probabilité DOIT être présent, pas seulement
    absent de mention : un prompt qui ne parle jamais de probabilité
    passerait aussi le test précédent sans jamais l'interdire — c'est
    exactement le trou nommé par `doctrine-registry.ts` sur le verdict
    d'organigramme (« la limite tient par relecture, pas par une garde
    automatique »), fermé ici pour le Profiler."""

    segments = matching_segments(BELLUM_PROFILER_SYSTEM, _PROBABILITY_WORDING)
    assert segments, "le prompt système ne mentionne jamais la probabilité — l'interdit n'est pas écrit"
    assert any(_REFUSAL.search(segment) for segment in segments)


def test_la_garde_sait_dire_non_sur_la_probabilite() -> None:
    """Preuve n°1 — casse volontaire : un texte qui COMMANDE une probabilité
    doit être détecté par le même mécanisme que celui appliqué ci-dessus au
    vrai corpus."""

    broken = "Cite la probabilité d'un besoin urgent en Data/Cloud dans key_advice."
    assert commanding_segments(broken, _PROBABILITY_WORDING) != []


def test_temoin_un_taux_mesure_nest_pas_une_probabilite() -> None:
    """Preuve n°3 — un taux MESURÉ (légitime, cf. `conversion_rate_target` du
    schéma voisin) ne doit PAS être pris pour une probabilité interdite : le
    motif cible « probabilité » / « chance de signer », pas « taux »."""

    mesure = "Le scoring évaluera un taux de conversion mesuré sur des affaires réelles, jamais estimé."
    assert commanding_segments(mesure, _PROBABILITY_WORDING) == []


# ---------------------------------------------------------------------------
# #2064 — une contradiction entre deux réponses se NOMME, elle ne se résout
# jamais en silence par une affirmation inventée.
# ---------------------------------------------------------------------------

_CONTRADICTION_RULE = re.compile(r"se contredisent", re.IGNORECASE)


def test_le_prompt_systeme_instruit_de_nommer_une_contradiction() -> None:
    """#2064 — le prompt doit dire explicitement qu'une contradiction entre
    deux réponses se NOMME (ton non accusatoire, point à vérifier) plutôt
    que de se résoudre en une affirmation inventée."""

    segments = matching_segments(BELLUM_PROFILER_SYSTEM, _CONTRADICTION_RULE)
    assert segments, "aucune règle sur les contradictions entre réponses"
    combined = " ".join(segments).lower()
    assert "jamais" in combined, f"la règle sur les contradictions n'est pas un interdit clair : {combined}"


def test_la_regle_de_contradiction_est_conditionnelle_pas_systematique() -> None:
    """Preuve n°3 — la règle ne doit pas FORCER une tension sur chaque
    profil, seulement s'appliquer QUAND les réponses se contredisent : sinon
    un profil parfaitement cohérent se verrait affubler d'une tension
    inventée, exactement le défaut que #2063/#2064 visent à corriger."""

    segments = matching_segments(BELLUM_PROFILER_SYSTEM, _CONTRADICTION_RULE)
    assert any(" si " in segment.lower() for segment in segments), (
        f"la règle sur les contradictions n'est pas conditionnelle : {segments}"
    )


def test_la_garde_sait_dire_non_sur_la_contradiction() -> None:
    """Preuve n°1 — un prompt SANS la règle de contradiction doit rater le
    test de présence ci-dessus."""

    sans_regle = BELLUM_PROFILER_SYSTEM.replace("se contredisent", "se recoupent")
    assert matching_segments(sans_regle, _CONTRADICTION_RULE) == []


def test_le_prompt_utilisateur_transporte_les_deux_faits_en_conflit() -> None:
    """#2064, exécuté pour de vrai : le prompt UTILISATEUR construit par
    `build_profiler_user_prompt` ne tranche jamais une contradiction en
    amont — il transporte les réponses brutes, verbatim ; c'est la règle du
    système qui empêche le modèle d'en garder une comme un fait corrigé."""

    answers = {
        "first_name": "Théo",
        "esn_name": "DataCraft",
        "consultant_size": "1-10",
        "sales_team_size": "Je suis seul",
        "expertise_areas": ["Data", "Cloud"],
        "positioning": "Expertise de niche",
        "staffing_model": "Régie",
        "target_sectors": ["Banque", "Assurance", "Santé", "Industrie", "Retail", "Énergie"],
        "target_company_types": ["PME", "ETI", "Grand compte"],
        "geo_zones": ["National"],
        "main_sales_pain": "Gérer mon temps",
    }

    user_prompt = build_profiler_user_prompt(answers)

    # La contradiction (un seul commercial, 6 secteurs, tous les types de
    # comptes) n'est résolue nulle part dans le prompt utilisateur : les
    # faits y voyagent verbatim, non arbitrés.
    assert "Je suis seul" in user_prompt
    assert "Banque" in user_prompt and "Retail" in user_prompt


# ---------------------------------------------------------------------------
# #2062 — L'IDENTITÉ, CE QUE L'AGENT SAIT AUDITER, SA MISSION, SES INTERDITS.
#
# Registre du 15/09/2026 (`registre-2026-09-15-onboarding-audit-welcome.md`,
# #2062.1 à .21). Deux points NE SONT PAS gardés ici, à dessein :
#   · #2062.13/.14 (aucune généralité interchangeable, aucune référence
#     inventée) — déjà là, et déjà portés par le bullet « Aucune
#     hallucination » que ce fichier laisse intact.
#
# ⚠️ #2062.4 ET #2062.19 ÉTAIENT REFUSÉS ICI — REFUS LEVÉ LE 16/09/2026.
#
# Ce bloc portait, daté du 15/09/2026, le refus d'écrire « auditer une BU » et
# « distinguer entreprise / BU / personne » dans le prompt, au motif que « la
# couche BU est une dimension complète, traitée en LOT ISOLÉ avec revue
# sécurité ». Une clarification de Louis DU MÊME JOUR disait déjà l'inverse :
# « libellé déclaratif, ni droits ni cloisonnement ».
#
# DÉCISION DE LOUIS DU 16/09/2026 : la clarification gagne. Si le libellé est
# purement DÉCLARATIF — il NOMME une business unit, il n'accorde aucun droit et
# ne cloisonne rien — alors la revue sécurité n'a pas d'objet : il n'y a ni
# porte, ni périmètre, ni donnée d'un tiers derrière. Le refus visait le SUJET
# (« la BU ») là où le danger est un USAGE (« une BU qui promettrait un
# cloisonnement »), et une garde qui refuse le sujet entier parce qu'un de ses
# usages serait dangereux INVENTE sa règle au lieu de la protéger.
#
# La garde n'est donc pas retirée, elle est RECENTRÉE sur le danger : voir
# « #2062.4 / #2062.19 » plus bas, qui refuse un libellé de BU porteur d'une
# promesse de cloisonnement (« visible par », « réservée à », « accès »,
# « seuls les membres de ») et laisse passer un libellé déclaratif.
# Un refus daté ne se retire jamais en silence — c'est ainsi que deux décisions
# contradictoires survivent dans un dépôt et qu'un troisième agent re-litigue.
#
# Chaque famille ci-dessous porte ses TROIS preuves : la garde sait dire NON
# (casse volontaire), elle LIT quelque chose (corpus non vide, plus haut), et
# elle n'attrape pas ce qu'elle ne vise pas (témoin de cas légitime voisin).
# ---------------------------------------------------------------------------

_IDENTITY = re.compile(r"directeur commercial et conseiller en structuration", re.IGNORECASE)

# #2062.2/.3/.5/.6/.7/.8 — six situations qui ne s'auditent pas pareil.
_AUDITABLE_SITUATIONS: dict[str, re.Pattern[str]] = {
    "#2062.2 — activité en création": re.compile(r"activité en CRÉATION", re.IGNORECASE),
    "#2062.3 — ESN établie": re.compile(r"ESN ÉTABLIE", re.IGNORECASE),
    "#2062.5 — un commercial": re.compile(r"COMMERCIAL seul dans sa fonction", re.IGNORECASE),
    "#2062.6 — un recruteur": re.compile(r"RECRUTEUR", re.IGNORECASE),
    "#2062.7 — un dirigeant": re.compile(r"DIRIGEANT", re.IGNORECASE),
    "#2062.8 — technique devenue commerciale": re.compile(r"TECHNIQUE DEVENUE COMMERCIALE", re.IGNORECASE),
}

# #2062.9/.10/.11/.12 — la mission, dans son ordre.
_MISSION_STEPS: dict[str, re.Pattern[str]] = {
    "#2062.9 — les faits": re.compile(r"Séparer les FAITS", re.IGNORECASE),
    "#2062.9 — les actifs": re.compile(r"ACTIFS réels", re.IGNORECASE),
    "#2062.9 — les limites": re.compile(r"LIMITES réelles", re.IGNORECASE),
    "#2062.9 — les contradictions": re.compile(r"CONTRADICTIONS entre deux réponses", re.IGNORECASE),
    "#2062.9 — les non-dits": re.compile(r"NON-DITS", re.IGNORECASE),
    "#2062.10 — le maillon qui bloque": re.compile(r"MAILLON QUI BLOQUE", re.IGNORECASE),
    "#2062.11 — le prérequis de chaque choix": re.compile(r"PRÉREQUIS explicite", re.IGNORECASE),
    "#2062.12 — une direction réaliste": re.compile(r"direction RÉALISTE", re.IGNORECASE),
}

# #2062.21 — TROIS priorités au plus. Le mot qui compte est le PLAFOND :
# « trois priorités » tout court serait un quota, donc une troisième ligne à
# remplir sur un profil qui n'en a que deux.
_PRIORITY_CEILING = re.compile(r"au plus trois priorités", re.IGNORECASE)

# #2062.15/.16/.17/.18/.21 — des INTERDITS : le motif doit apparaître ET le
# segment qui le porte doit le refuser (même distinction NOMMER / COMMANDER
# que pour la probabilité).
_WRITTEN_INTERDICTIONS: dict[str, re.Pattern[str]] = {
    "#2062.15 — aucun taux sans données comparables": re.compile(r"données comparables", re.IGNORECASE),
    "#2062.16 — un objectif n'est pas une prévision": re.compile(r"PRÉVISION", re.IGNORECASE),
    "#2062.17 — une absence n'est pas un zéro": re.compile(r"\bZÉRO\b", re.IGNORECASE),
    "#2062.18 — aucun conseil impossible à tenir": re.compile(r"impossible à tenir", re.IGNORECASE),
    "#2062.21 — aucune méthode imposée": re.compile(r"méthode imposée", re.IGNORECASE),
}

# #2062.20 — quatre étapes qui ne se valent pas, dans UN seul segment : les
# citer chacune dans son coin ne dit pas qu'on ne les présente pas l'une pour
# l'autre.
_PROVEN_OFFER = re.compile(r"OFFRE PROUVÉE", re.IGNORECASE)
_FUNNEL_STEPS = ("INTÉRÊT", "ACCÈS", "BESOIN", "SIGNATURE")

# #2062.21 — chaque conclusion cite ses éléments, une hypothèse reste nommée.
_CITES_ITS_SOURCES = re.compile(r"cite les éléments dont elle vient", re.IGNORECASE)
_NAMED_HYPOTHESIS = re.compile(r"hypothèse reste nommée", re.IGNORECASE)


def test_lidentite_du_profileur_est_celle_demandee() -> None:
    """#2062.1 — « directeur commercial et conseiller en structuration ».

    L'ancien texte disait « Head of Sales en chef de BellumAI » : proche, pas
    identique, et surtout muet sur la STRUCTURATION, qui est la moitié du
    travail demandé (un audit, pas une vente de plus).
    """

    assert _IDENTITY.search(BELLUM_PROFILER_SYSTEM), "l'identité demandée n'est pas écrite"


def test_la_garde_sait_dire_non_sur_lidentite() -> None:
    """Preuve n°1 — l'ancienne identité ne satisfait PAS la nouvelle règle."""

    ancien = "Tu es le Head of Sales en chef de BellumAI. Tu as 20 ans d'expérience."
    assert _IDENTITY.search(ancien) is None


def test_les_six_situations_auditables_sont_nommees() -> None:
    """#2062.2/.3/.5/.6/.7/.8 — un questionnaire rempli par un recruteur, un
    dirigeant ou une activité qui démarre ne s'audite pas comme une ESN
    établie : les six situations sont NOMMÉES, faute de quoi le modèle
    retombe sur le profil type qu'il connaît le mieux."""

    manquantes = [
        libelle for libelle, motif in _AUDITABLE_SITUATIONS.items() if not motif.search(BELLUM_PROFILER_SYSTEM)
    ]
    assert manquantes == [], f"situations absentes du prompt système : {manquantes}"


def test_la_garde_sait_dire_non_sur_les_situations() -> None:
    """Preuve n°1 — retirer une situation du corpus doit la faire manquer."""

    ampute = BELLUM_PROFILER_SYSTEM.replace("RECRUTEUR", "profil")
    assert _AUDITABLE_SITUATIONS["#2062.6 — un recruteur"].search(ampute) is None


def test_temoin_une_liste_de_secteurs_nest_pas_une_liste_de_situations() -> None:
    """Preuve n°3 — la garde vise les SITUATIONS d'une activité, pas les
    secteurs cibles : un prompt qui énumère « Banque, Assurance, Santé » ne
    doit pas passer pour une couverture des six situations."""

    secteurs = "Tu cibles la Banque, l'Assurance, la Santé, l'Industrie et le Retail."
    couvertes = [libelle for libelle, motif in _AUDITABLE_SITUATIONS.items() if motif.search(secteurs)]
    assert couvertes == []


def test_la_mission_porte_ses_quatre_temps() -> None:
    """#2062.9/.10/.11/.12 — comprendre (faits, actifs, limites,
    contradictions, non-dits), nommer LE maillon qui bloque, proposer peu de
    choix avec leurs prérequis, viser une direction réaliste."""

    manquants = [libelle for libelle, motif in _MISSION_STEPS.items() if not motif.search(BELLUM_PROFILER_SYSTEM)]
    assert manquants == [], f"étapes de mission absentes : {manquants}"


def test_la_garde_sait_dire_non_sur_la_mission() -> None:
    """Preuve n°1 — sans « le maillon qui bloque », la mission n°2 manque."""

    ampute = BELLUM_PROFILER_SYSTEM.replace("MAILLON QUI BLOQUE", "sujet important")
    assert _MISSION_STEPS["#2062.10 — le maillon qui bloque"].search(ampute) is None


def test_les_priorites_ont_un_plafond_pas_un_quota() -> None:
    """#2062.21 — « au plus trois priorités ». Un quota (« exactement trois »)
    ferait inventer une troisième priorité à un profil qui n'en a que deux —
    c'est-à-dire produire une donnée que rien n'a mesurée."""

    assert _PRIORITY_CEILING.search(BELLUM_PROFILER_SYSTEM), "le plafond des trois priorités n'est pas écrit"


def test_la_garde_sait_dire_non_sur_le_plafond_des_priorites() -> None:
    """Preuve n°1 — un quota ne passe pas pour un plafond."""

    quota = BELLUM_PROFILER_SYSTEM.replace("au plus trois priorités", "exactement trois priorités")
    assert _PRIORITY_CEILING.search(quota) is None


def test_temoin_un_plafond_sur_autre_chose_nest_pas_celui_des_priorites() -> None:
    """Preuve n°3 — « au plus trois relances » est légitime et ne doit pas
    être compté comme le plafond des priorités."""

    voisin = "Propose au plus trois relances par compte."
    assert _PRIORITY_CEILING.search(voisin) is None


def test_les_interdits_sont_ecrits_comme_des_interdits() -> None:
    """#2062.15/.16/.17/.18/.21 — chaque règle est PRÉSENTE et REFUSANTE.

    Une garde de présence seule laisserait passer « présente la PRÉVISION de
    son année », qui contient bien le motif sans rien interdire.
    """

    for libelle, motif in _WRITTEN_INTERDICTIONS.items():
        segments = matching_segments(BELLUM_PROFILER_SYSTEM, motif)
        assert segments, f"{libelle} : la règle n'est pas écrite"
        assert any(_REFUSAL.search(segment) for segment in segments), (
            f"{libelle} : la règle est mentionnée mais pas interdite — {segments}"
        )


def test_la_garde_sait_dire_non_sur_un_interdit_retourne() -> None:
    """Preuve n°1 — la même règle écrite à l'endroit (donc COMMANDÉE) est
    détectée comme non refusante."""

    retourne = "Présente l'objectif du commercial comme la PRÉVISION de son année"
    motif = _WRITTEN_INTERDICTIONS["#2062.16 — un objectif n'est pas une prévision"]
    segments = matching_segments(retourne, motif)
    assert segments
    assert not any(_REFUSAL.search(segment) for segment in segments)


def test_les_quatre_etapes_du_cycle_sont_distinguees_ensemble() -> None:
    """#2062.20 — offre prouvée ≠ ambition, et intérêt ≠ accès ≠ besoin ≠
    signature, dans un MÊME segment : c'est leur confusion qui est interdite,
    pas leur existence."""

    segments = matching_segments(BELLUM_PROFILER_SYSTEM, _PROVEN_OFFER)
    assert segments, "la distinction offre prouvée / ambition n'est pas écrite"
    porteurs = [segment for segment in segments if all(e in segment for e in _FUNNEL_STEPS)]
    assert porteurs, f"les quatre étapes ne sont pas distinguées au même endroit : {segments}"


def test_la_garde_sait_dire_non_sur_les_quatre_etapes() -> None:
    """Preuve n°1 — une étape qui disparaît casse la distinction."""

    ampute = BELLUM_PROFILER_SYSTEM.replace("un BESOIN exprimé, ", "")
    segments = matching_segments(ampute, _PROVEN_OFFER)
    assert not [segment for segment in segments if all(e in segment for e in _FUNNEL_STEPS)]


def test_chaque_conclusion_cite_ses_elements_et_lhypothese_reste_nommee() -> None:
    """#2062.21 — sans ces deux règles, une déduction du modèle arrive à
    l'utilisateur sous la même forme qu'une réponse qu'il a donnée."""

    assert _CITES_ITS_SOURCES.search(BELLUM_PROFILER_SYSTEM)
    assert _NAMED_HYPOTHESIS.search(BELLUM_PROFILER_SYSTEM)


# ---------------------------------------------------------------------------
# #2062.4 / #2062.19 — LA BU S'AUDITE, ET SON LIBELLÉ NE PROMET RIEN
# (décision de Louis du 16/09/2026, qui lève le refus daté du 15/09 — voir le
# bloc « ⚠️ » plus haut).
#
# CE QUE CETTE GARDE REFUSE, ET CE QU'ELLE LAISSE PASSER
# ------------------------------------------------------
# Elle ne refuse pas « la BU ». Elle refuse un libellé de BU qui PROMETTRAIT un
# CLOISONNEMENT — « visible par », « réservée à », « accès », « seuls les
# membres de ». C'est cette promesse-là qui demanderait une revue sécurité,
# parce qu'elle ferait croire à une porte que rien ne tient : le prompt système
# n'accorde aucun droit, ne filtre aucune donnée et ne connaît aucun périmètre.
# Un libellé déclaratif — « une BU au sein d'un groupe plus large » — ne promet
# rien et reste vert : c'est le témoin de cas légitime voisin, et c'est
# exactement ce qui manquait à la version d'avant.
#
# Les TROIS preuves, comme les familles voisines : elle sait dire NON (casse
# volontaire), elle LIT un corpus non vide (les segments qui parlent de BU sont
# comptés), et elle n'attrape pas ce qu'elle ne vise pas.
# ---------------------------------------------------------------------------

# « BU » en toutes lettres, ou son développé.
#
# ⚠️ DEUX SENSIBILITÉS À LA CASSE, ET C'EST MESURÉ : `\bBU\b` est ancré sur le
# mot (sans les bornes il attraperait « BUdget » ou « déBUt ») ET écrit SANS
# `IGNORECASE`, parce que l'acronyme est un sigle — avec le drapeau global, il
# attrapait le participe passé « bu » (« le budget est bu par les charges »),
# et le témoin de ce fichier l'a fait rougir avant qu'on le livre. Le développé,
# lui, garde son insensibilité par un drapeau LOCAL `(?i:…)`.
_BUSINESS_UNIT = re.compile(r"\bBU\b|(?i:business unit)")

# #2062.19 — les trois niveaux dans UN seul segment : les citer chacun dans son
# coin ne dit pas qu'on ne les confond pas.
_THREE_LEVELS = ("ENTREPRISE", "BU", "PERSONNE")

# Ce que la garde vise VRAIMENT : la promesse d'un cloisonnement. Un prompt
# système ne porte ni droits ni visibilité ; l'écrire serait promettre une
# porte qui n'existe pas.
_PARTITION_PROMISE = re.compile(
    r"visible\w*\s+par"
    r"|r[ée]serv[ée]\w*\s+(?:à|aux)"
    r"|seuls?\s+les\s+membres"
    r"|droits?\s+d['’]acc[èe]s"
    r"|acc[èe]s\s+(?:r[ée]serv[ée]\w*|restreint\w*|limit[ée]\w*)"
    r"|cloisonn\w+"
    r"|ne\s+(?:voit|voient)\s+pas",
    re.IGNORECASE,
)


def business_unit_segments(text: str) -> list[str]:
    """Segments qui parlent d'une business unit."""

    return matching_segments(text, _BUSINESS_UNIT)


def test_la_bu_est_une_situation_auditable() -> None:
    """#2062.4 — une BU au sein d'un groupe ne s'audite pas comme une ESN
    indépendante : elle a des moyens et un périmètre qu'elle ne décide pas
    seule. Sans elle NOMMÉE, le modèle retombe sur le profil type qu'il connaît
    — exactement le défaut que les six autres situations corrigeaient déjà."""

    segments = business_unit_segments(BELLUM_PROFILER_SYSTEM)
    assert segments, "la BU n'est nommée nulle part dans le prompt système"
    situations = [segment for segment in segments if _AUDITABLE_SITUATIONS["#2062.3 — ESN établie"].search(segment)]
    assert situations, f"la BU n'est pas nommée parmi les situations auditables : {segments}"


def test_les_trois_niveaux_sont_distingues_ensemble() -> None:
    """#2062.19 — entreprise, BU et personne au MÊME endroit : c'est leur
    confusion qui est interdite, pas leur existence. « Mon entreprise fait
    12 M€ » et « ma BU fait 12 M€ » ne décrivent ni les mêmes moyens ni les
    mêmes marges de manœuvre, et « je fais 12 M€ » n'est ni l'un ni l'autre."""

    porteurs = [
        segment
        for segment in _SEGMENT.split(BELLUM_PROFILER_SYSTEM)
        if all(niveau in segment for niveau in _THREE_LEVELS)
    ]
    assert porteurs, "les trois niveaux ne sont pas distingués au même endroit"


def test_le_libelle_de_bu_ne_promet_aucun_cloisonnement() -> None:
    """LA GARDE, RECENTRÉE (16/09/2026) — aucun segment qui parle de BU ne
    promet de droits, de visibilité ni de périmètre d'accès.

    Le prompt système n'accorde aucun droit et ne filtre aucune donnée :
    écrire « la BU X n'est visible que par ses membres » y ferait croire à une
    porte que rien ne tient. C'est ÇA, le danger — pas le mot « BU »."""

    segments = business_unit_segments(BELLUM_PROFILER_SYSTEM)
    assert segments, "corpus vide : la garde ne lirait rien"
    fautifs = [segment for segment in segments if _PARTITION_PROMISE.search(segment)]
    assert fautifs == [], f"un libellé de BU promet un cloisonnement : {fautifs}"


def test_la_garde_sait_dire_non_sur_une_promesse_de_cloisonnement() -> None:
    """Preuve n°1 — un libellé qui promet un cloisonnement la fait rougir."""

    promesse = "Tu sais auditer une BU Défense, réservée à l'équipe grands comptes."
    segments = business_unit_segments(promesse)
    assert segments
    assert [segment for segment in segments if _PARTITION_PROMISE.search(segment)]


def test_temoin_un_libelle_declaratif_de_bu_reste_vert() -> None:
    """Preuve n°3 — le cas légitime voisin : NOMMER une business unit ne
    promet rien. C'est ce témoin qui manquait au refus du 15/09, lequel
    refusait le SUJET au lieu du danger."""

    declaratif = "Tu sais auditer une BU — une business unit au sein d'un groupe plus large."
    segments = business_unit_segments(declaratif)
    assert segments, "le témoin doit bien parler d'une BU, sinon il ne prouve rien"
    assert [segment for segment in segments if _PARTITION_PROMISE.search(segment)] == []


def test_le_corpus_de_bu_lu_nest_pas_vide() -> None:
    """Preuve n°2 — la garde LIT quelque chose. Sans cette assertion, un
    prompt qui cesserait de parler de BU rendrait les deux tests précédents
    verts sur le vide."""

    assert len(BELLUM_PROFILER_SYSTEM) > 1000
    assert len(business_unit_segments(BELLUM_PROFILER_SYSTEM)) >= 1
    # Et le motif ne s'accroche pas à n'importe quel mot qui contient « bu ».
    assert business_unit_segments("Le budget du début de l'année est bu par les charges.") == []


# ---------------------------------------------------------------------------
# #2063 — LA NATURE DE CHAQUE ÉLÉMENT, ET SA QUALIFICATION.
#
# CE QUI EST GARDÉ ICI, ET CE QUI NE L'EST PAS : le prompt porte le
# VOCABULAIRE des huit natures (#2063.1 à .5, .7, .8 — « inconnu » est le
# #2063.6, déjà porté par la primitive `UnknownValue`) et l'exigence de FORME
# de la qualification (#2063.12/.13/.14). Le CHAMP STRUCTURÉ qui persisterait
# l'une et l'autre vit sur `app/models/profile_context.py`, hors du périmètre
# de ce lot — voir le rapport d'agent.
# ---------------------------------------------------------------------------

_EIGHT_NATURES = (
    "DÉCLARÉ",
    "PRÉREMPLI",
    "IMPORTÉ",
    "OBSERVÉ",
    "DÉDUIT",
    "INCONNU",
    "CONTRADICTOIRE",
    "À VÉRIFIER",
)

_CONFIDENCE = re.compile(r"sa CONFIANCE", re.IGNORECASE)
_QUALIFICATION_PARTS = ("PREUVE", "CONFIANCE", "IMPACT", "QUESTION")

# Un nombre nu de confiance : un pourcentage, ou une note sur une échelle.
_BARE_CONFIDENCE_NUMBER = re.compile(r"\d+\s*%|\b\d+\s*/\s*\d+\b")


def nature_segments(text: str) -> list[str]:
    """Segments qui portent les HUIT natures à la fois."""

    return [segment for segment in _SEGMENT.split(text) if all(nature in segment for nature in _EIGHT_NATURES)]


def confidence_segments(text: str) -> list[str]:
    """Segments qui portent l'exigence de confiance."""

    return matching_segments(text, _CONFIDENCE)


def test_les_huit_natures_sont_nommees_au_meme_endroit() -> None:
    """#2063.1 à .5, .7, .8 — les huit natures forment une liste FERMÉE dans
    un seul segment : éparpillées, elles ne disent plus qu'un élément relève
    d'UNE SEULE d'entre elles, et « déduit » repart alors pour « déclaré »."""

    segments = nature_segments(BELLUM_PROFILER_SYSTEM)
    assert len(segments) == 1, f"les huit natures ne sont pas énumérées une fois et une seule : {len(segments)}"


def test_la_garde_sait_dire_non_sur_les_huit_natures() -> None:
    """Preuve n°1 — une nature retirée et la liste n'est plus fermée."""

    ampute = BELLUM_PROFILER_SYSTEM.replace("IMPORTÉ, ", "")
    assert nature_segments(ampute) == []


def test_temoin_une_mention_isolee_de_a_verifier_nest_pas_la_taxonomie() -> None:
    """Preuve n°3 — la règle de contradiction dit déjà « comme un point à
    vérifier » : elle ne doit pas passer pour l'énumération des natures."""

    voisin = "Nomme la tension comme un point À VÉRIFIER, jamais comme un fait DÉCLARÉ."
    assert nature_segments(voisin) == []


def test_chaque_interpretation_porte_preuve_confiance_impact_et_question() -> None:
    """#2063.12/.13/.14 — les quatre au même endroit : une preuve sans impact
    ne dit pas quoi en faire, un impact sans question ne dit pas comment
    trancher."""

    segments = confidence_segments(BELLUM_PROFILER_SYSTEM)
    assert segments, "l'exigence de confiance n'est pas écrite"
    porteurs = [segment for segment in segments if all(part in segment for part in _QUALIFICATION_PARTS)]
    assert porteurs, f"preuve / confiance / impact / question ne sont pas exigés ensemble : {segments}"


def test_la_confiance_est_qualitative_jamais_un_nombre_nu() -> None:
    """#2063.13 — un palier NOMMÉ, jamais un nombre nu ni un pourcentage.

    Doctrine : un score n'est jamais nu, ses axes sont nommés, et sous trois
    axes évalués il n'y a pas de score — donc une confiance chiffrée serait
    ici un score nu, et un pourcentage se lirait comme une probabilité, déjà
    interdite plus haut.
    """

    segments = confidence_segments(BELLUM_PROFILER_SYSTEM)
    assert any("palier nommé" in segment for segment in segments), (
        f"la confiance n'est pas exigée à paliers nommés : {segments}"
    )
    chiffrees = [segment for segment in segments if _BARE_CONFIDENCE_NUMBER.search(segment)]
    assert chiffrees == [], f"la confiance est chiffrée dans le prompt : {chiffrees}"


def test_la_garde_sait_dire_non_sur_une_confiance_chiffree() -> None:
    """Preuve n°1 — une confiance en pourcentage doit être détectée."""

    casse = "Chaque interprétation porte sa CONFIANCE, notée de 0 % à 100 %"
    assert [s for s in confidence_segments(casse) if _BARE_CONFIDENCE_NUMBER.search(s)] != []


def test_temoin_une_quantite_mesuree_nest_pas_une_confiance_chiffree() -> None:
    """Preuve n°3 — citer « les 12 heures déclarées » est exactement ce que la
    règle de PREUVE demande : le chiffre est la donnée reçue, pas la note de
    confiance. La garde ne doit pas l'attraper."""

    legitime = "Sa CONFIANCE est fragile, et elle repose sur les 12 heures déclarées"
    assert [s for s in confidence_segments(legitime) if _BARE_CONFIDENCE_NUMBER.search(s)] == []


# ---------------------------------------------------------------------------
# #2063.10/.11 — l'exemple exigé, et le contre-exemple qui reste interdit.
# ---------------------------------------------------------------------------

_EXEMPLAR = re.compile(r"reste à vérifier", re.IGNORECASE)
_INVENTED_FACT = re.compile(r"en réalité que", re.IGNORECASE)


def test_le_prompt_porte_lexemple_de_la_bonne_forme() -> None:
    """#2063.10 — « la stabilité de ces douze heures reste à vérifier » : la
    forme exigée est ÉCRITE dans le prompt, sur le cas même du retour (une
    disponibilité déclarée que les autres réponses fragilisent)."""

    segments = matching_segments(BELLUM_PROFILER_SYSTEM, _EXEMPLAR)
    assert segments, "la forme « reste à vérifier » n'est illustrée nulle part"
    assert any("douze heures" in segment for segment in segments), (
        f"l'exemple n'est pas celui du retour (la disponibilité déclarée) : {segments}"
    )


def test_le_contre_exemple_nest_present_que_pour_etre_interdit() -> None:
    """#2063.11 — « tu n'as en réalité que trois heures » figure dans le
    prompt, mais UNIQUEMENT dans un segment qui le refuse. Un contre-exemple
    écrit sans son interdit est une consigne."""

    assert matching_segments(BELLUM_PROFILER_SYSTEM, _INVENTED_FACT), "le contre-exemple interdit n'est pas écrit"
    assert commanding_segments(BELLUM_PROFILER_SYSTEM, _INVENTED_FACT) == []


def test_la_garde_sait_dire_non_sur_un_fait_invente() -> None:
    """Preuve n°1 — la même phrase, commandée, est détectée."""

    casse = "Dis-lui qu'il n'a en réalité que trois heures par semaine"
    assert commanding_segments(casse, _INVENTED_FACT) != []


def test_temoin_le_contre_exemple_cite_pour_etre_refuse_passe() -> None:
    """Preuve n°3 — la distinction NOMMER / COMMANDER vaut aussi ici : écrire
    « n'écris jamais “tu n'as en réalité que trois heures” » est la règle,
    pas sa violation."""

    regle = "N'écris jamais « tu n'as en réalité que trois heures »"
    assert commanding_segments(regle, _INVENTED_FACT) == []


# ---------------------------------------------------------------------------
# Doctrine transverse — un prompt EST du code : aucun critère protégé n'y
# entre, et aucun de NOS fournisseurs n'y est nommé.
#
# Mesuré sur ce dépôt : `photoUrl` voyageait jusqu'au prompt de priorisation
# des contacts sans qu'aucune ligne ne le « lise ». Il suffit qu'un champ soit
# dans le prompt qui note pour qu'il pèse.
# ---------------------------------------------------------------------------

_PROTECTED_CRITERIA = re.compile(
    r"\b(âge|genre|sexe|origine ethnique|nationalité|photo\w*|situation familiale|"
    r"état civil|religion|handicap|orientation sexuelle)\b",
    re.IGNORECASE,
)

_OUR_VENDORS = re.compile(
    r"\b(anthropic|claude|openai|gpt-\d|mistral|apollo|firecrawl|brave\s+search|pappers|"
    r"dropcontact|hunter\.io|lusha|kaspr|salesql|fullenrich|serper|tavily|railway|vercel|"
    r"supabase)\b",
    re.IGNORECASE,
)

_FULL_ANSWERS = {
    "first_name": "Théo",
    "esn_name": "DataCraft",
    "consultant_size": "1-10",
    "sales_team_size": "Je suis seul",
    "expertise_areas": ["Data", "Cloud"],
    "positioning": "Expertise de niche",
    "staffing_model": "Régie",
    "target_sectors": ["Banque", "Assurance"],
    "target_company_types": ["PME", "ETI"],
    "geo_zones": ["Île-de-France"],
    "main_sales_pain": "Gérer mon temps",
    "user_role": "Dirigeant",
    "weekly_calls": "10",
}


def test_aucun_critere_protege_dans_le_systeme_ni_dans_la_charge_utile() -> None:
    """Doctrine `c58_criteres_proteges` — l'interdit porte sur le PROMPT
    autant que sur le code, charge utile comprise. Les deux exceptions
    NOMMÉES (l'identité de la personne, la ville ou le pays) ne sont pas
    visées par le motif ci-dessus."""

    assert _PROTECTED_CRITERIA.search(BELLUM_PROFILER_SYSTEM) is None
    assert _PROTECTED_CRITERIA.search(build_profiler_user_prompt(_FULL_ANSWERS)) is None


def test_la_garde_sait_dire_non_sur_un_critere_protege() -> None:
    """Preuve n°1 — un prompt qui ferait peser l'âge est détecté."""

    casse = "Tiens compte de l'âge du commercial pour calibrer le conseil."
    assert _PROTECTED_CRITERIA.search(casse) is not None


def test_temoin_le_prenom_et_la_ville_restent_autorises() -> None:
    """Preuve n°3 — les deux exceptions NOMMÉES de la doctrine (l'identité,
    parce que le livrable désigne la personne ; la ville ou le pays, plus
    grossiers que le code postal) ne doivent pas être attrapées."""

    legitime = "Utilise le prénom Théo, et la zone Île-de-France déclarée dans geo_zones."
    assert _PROTECTED_CRITERIA.search(legitime) is None


def test_aucun_de_nos_fournisseurs_nest_nomme_dans_le_prompt() -> None:
    """Doctrine `tool-naming` — NOS fournisseurs (modèles, hébergement,
    enrichissement, collecte) ne se nomment JAMAIS dans un prompt. Seul
    l'outil que l'espace client a lui-même branché se nomme, par injection —
    et le Profiler n'en injecte aucun."""

    assert _OUR_VENDORS.search(BELLUM_PROFILER_SYSTEM) is None
    assert _OUR_VENDORS.search(build_profiler_user_prompt(_FULL_ANSWERS)) is None


def test_la_garde_sait_dire_non_sur_un_nom_de_fournisseur() -> None:
    """Preuve n°1 — un fournisseur nommé en dur est détecté."""

    casse = "Les contacts viendront d'Apollo, enrichis par Dropcontact."
    assert _OUR_VENDORS.search(casse) is not None


def test_temoin_le_nom_du_produit_et_du_copilote_restent_autorises() -> None:
    """Preuve n°3 — « BellumAI » est le produit, « Laura » est le copilote :
    ni l'un ni l'autre n'est un fournisseur, la garde ne doit pas les
    attraper."""

    legitime = "Si tu nommes le copilote, son nom est Laura, dans BellumAI."
    assert _OUR_VENDORS.search(legitime) is None
