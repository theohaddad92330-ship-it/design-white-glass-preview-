"""#1926.32 — le golden de ``bellum_outreach`` PAR PERSONA ET PAR CONTEXTE.

Ce qui existait : ``test_prompt_golden.py`` épingle le SQUELETTE du prompt
système (``### channel=…``, profil vide). Ce qui manquait, et que le registre
note ABSENT : ce que le modèle reçoit réellement quand le destinataire change de
niveau hiérarchique et que le commercial change d'objectif — c'est-à-dire les
deux axes du cadrage (#1926.2-.5), et les NEUF objectifs de la taxonomie
(#1926.9-.17).

Ce que le corpus épingle, et pourquoi il n'énumère PAS le produit croisé.
Dans le prompt rendu, les deux axes sont INDÉPENDANTS : la ligne « Niveau
hiérarchique » vient du poste, les lignes « Objectif » / « Appel à l'action »
viennent de l'angle et de la relation. Écrire 4 × 16 enregistrements qui ne
diffèrent que par une ligne ne donne rien à relire — un diff de 64 blocs
identiques à une ligne près se relit en diagonale, donc pas du tout. Le corpus
committé porte donc les deux AXES (4 + 16 enregistrements), et l'indépendance
est PROUVÉE plutôt qu'énumérée : les 64 cellules sont rendues et comparées à la
recomposition des deux axes (``test_les_deux_axes_du_cadrage_sont_independants``).
Un couplage qui apparaîtrait — un objectif dont les règles changeraient selon le
persona — y devient rouge, et il ne serait visible dans aucun des deux axes.

Ce que le corpus a rendu visible, et c'est le point : SIX des neuf objectifs
(#1926.11-.15, .17) n'avaient pas de règles propres — reconnus, mais le prompt
renvoyait à l'angle du commercial. Ils en ont désormais, et chaque cellule le
montre ; un objectif qui reperdrait les siennes rougirait ici avant tout.

⚠️ Défaut TROUVÉ par ce corpus, et CORRIGÉ depuis (#1926.2) : les cellules
``relation:client_actif`` et ``relation:besoin_ouvert`` faisaient dire au prompt
DEUX choses contraires. Le cadrage y écrivait « Objectif : non déterminé — écris
une ouverture prudente, sans supposer de relation ni de besoin » pendant que le
bloc RELATION AU COMPTE, trois lignes plus haut dans le même prompt, décrivait un
client actif (foisonnement) ou un besoin ouvert. Deux instructions contradictoires
ne sont pas un réglage : l'une des deux est ignorée, et on ne choisit pas
laquelle. ``message_brief_block`` renvoie maintenant au bloc RELATION AU COMPTE
pour les états qu'un playbook décrit, et garde l'ouverture prudente pour ceux que
personne ne décrit (``test_message_brief.py`` porte les deux, avec son témoin).

Régénérer après une modification VOULUE (même variable que les autres goldens) :

    UPDATE_PROMPT_GOLDEN=1 pytest tests/test_outreach_persona_context_golden.py -q

puis relire le diff et committer le .txt avec le changement.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.knowledge.persona import PERSONA_UNKNOWN, PERSONAS
from app.prompts.bellum_outreach import build_user_prompt
from app.services.message_brief import MESSAGE_OBJECTIVES, OBJECTIVE_ALIASES, derive_message_brief

_GOLDEN = Path(__file__).parent / "golden" / "outreach" / "persona_contexte.txt"
_UPDATE = os.getenv("UPDATE_PROMPT_GOLDEN") == "1"

# ── les entrées canoniques ───────────────────────────────────────────────────
# Volontairement pauvres : ce golden ne mesure pas la richesse d'un dossier, il
# mesure ce que le CADRAGE dit au modèle. Les faits du compte sont épinglés
# ailleurs (``test_message.py``).
_PROFILE = {"companyName": "Acme", "offers": ["SRE"]}
_ANALYSIS = {"recent_signals": [{"title": "Cession Uptevia"}]}

#: L'axe PERSONA : un poste par case de ``PERSONAS``, plus le cas « non
#: déterminé » — le palier est POSÉ (pas déduit d'un titre) pour que la cellule
#: ne dépende pas des heuristiques de ``classify_hierarchy_level``.
#:
#: #2887 (26/09) — SEPT cases au lieu de trois : le moteur de classification
#: donne désormais un persona DISTINCT à chacun des sept paliers réels, au lieu
#: de les collapser (governance/c_level/direction → decideur, management/achats
#: → manager, expert/operationnel → operationnel). `gouvernance`/`direction`/
#: `acheteur` sont NEUFS ici ; `expert` reprend le poste qui portait autrefois
#: la case `operationnel`, qui reçoit son propre poste réellement opérationnel.
_PERSONA_CONTACTS: tuple[tuple[str, dict[str, str]], ...] = (
    ("decideur", {"full_name": "Olivier Martin", "title": "Directeur technique", "hierarchy_level": "c_level"}),
    (
        "gouvernance",
        {
            "full_name": "Olivier Martin",
            "title": "Présidente du conseil d'administration",
            "hierarchy_level": "governance",
        },
    ),
    (
        "direction",
        {
            "full_name": "Olivier Martin",
            "title": "Directeur des Systèmes d'Information",
            "hierarchy_level": "direction",
        },
    ),
    (
        "manager",
        {"full_name": "Olivier Martin", "title": "Responsable infrastructure", "hierarchy_level": "management"},
    ),
    ("acheteur", {"full_name": "Olivier Martin", "title": "Directeur des Achats", "hierarchy_level": "achats"}),
    ("expert", {"full_name": "Olivier Martin", "title": "Architecte SRE", "hierarchy_level": "expert"}),
    (
        "operationnel",
        {"full_name": "Olivier Martin", "title": "Développeuse Backend", "hierarchy_level": "operationnel"},
    ),
    (PERSONA_UNKNOWN, {"full_name": "Olivier Martin", "title": "Poste inconnu", "hierarchy_level": "unknown"}),
)

#: L'axe CONTEXTE, premier versant : les NEUF objectifs de la taxonomie
#: (#1926.9-.17), chacun nommé par le commercial dans son angle. Le code attendu
#: est écrit ici : un motif de ``message_brief`` qui cesserait de reconnaître son
#: objectif rendrait la cellule rouge AVANT d'atteindre le golden.
_ANGLE_CONTEXTS: tuple[tuple[str, str], ...] = (
    ("ouverture_compte", "ouvrir le compte"),  # #1926.9
    ("reprise_relation", "reprendre contact"),  # #1926.10
    ("demande_information", "demander une information sur leur organisation"),  # #1926.11
    ("recommandation", "obtenir une recommandation vers le bon interlocuteur"),  # #1926.12
    ("positionnement_expertise", "positionner notre expertise data"),  # #1926.13
    ("nurturing", "nurturing : garder le lien sans rien vendre"),  # #1926.14
    ("suivi_rendez_vous", "suivi du rendez-vous de mardi"),  # #1926.15
    ("relance", "relancer après mon premier message"),  # #1926.16
    ("renouvellement", "préparer le renouvellement du contrat"),  # #1926.17
    ("suivi_document", "suivi du dossier envoyé mardi"),  # #2374.6 (vague 33)
    ("introduction", "demander une introduction vers leur DSI"),  # #2947/#2204.22
    ("partenariat", "explorer une co-traitance avec leur practice data"),  # #2947/#2204.27
    # #2887 (26/09) — onzième objectif, arrivé par `apps/web` (le formulaire de
    # proposition) sans toucher ce fichier : la taxonomie du prompt en avait
    # déjà onze, ce corpus n'en couvrait que dix. AJOUTÉ EN FIN comme les
    # précédents.
    ("proposer_profil", "proposer le profil de Marc, freelance data engineer, pour ce besoin"),  # #2887
    # #2204.21 — « valider un contexte » n'a PLUS de ligne : décision Louis 16-17/10, c'est `demande_information`
    # (`OBJECTIVE_ALIASES`) — la demande y mène (voir `test_message_objective_valider_contexte_alias.py`).
    ("approche_directe", "une approche directe sur le périmètre cyber"),  # #4060
)

#: L'axe CONTEXTE, second versant : aucun angle, l'objectif vient de la RELATION
#: au compte (#1926.3). Les deux derniers états n'en dérivent aucun — ils ne se
#: rangent pas de force dans un objectif, et le prompt le dit.
_RELATION_CONTEXTS: tuple[str, ...] = (
    "froid",
    "linkedin",
    "refere",
    "dormant",
    "ancien_client",
    "client_actif",
    "besoin_ouvert",
)

#: Les champs d'un contact qui ne doivent JAMAIS atteindre ce prompt (doctrine
#: c58). ``city`` / ``country`` n'y sont pas : ce sont les deux exceptions
#: NOMMÉES de la doctrine — plus grossières qu'un code postal. Les valeurs sont
#: choisies pour être introuvables par accident dans un prompt français.
_PROTECTED_FIELDS: dict[str, str] = {
    "photo_url": "https://photos.example/zzqphoto.jpg",
    "birth_date": "1979-04-11",
    "gender": "zzqgenre",
    "nationality": "zzqnationalite",
    "marital_status": "zzqfamille",
    "address": "12 rue Zzqadresse",
}


def _cadrage(contact: dict, *, angle: str = "", relationship_state: str | None = None) -> str:
    """La tranche CADRAGE du user prompt réellement rendu.

    Découpée DANS le prompt, pas reconstruite : un cadrage calculé juste mais
    jamais inséré (le défaut n°1 du dépôt) ferait échouer le découpage ici.
    """
    prompt = build_user_prompt(
        contact=contact,
        raw_analysis=_ANALYSIS,
        profile=_PROFILE,
        recent_signals=None,
        channel="email",
        context=angle,
        company_name="BNP Paribas",
        relationship_state=relationship_state,
        brief=derive_message_brief(contact=contact, relationship_state=relationship_state, angle=angle),
    )
    start = prompt.index("CADRAGE DU MESSAGE")
    return prompt[start : prompt.index("\n\nSORTIE JSON", start)]


def _persona_line(cadrage: str) -> str:
    return next(line for line in cadrage.splitlines() if line.startswith("- Niveau hiérarchique :"))


def _records() -> list[tuple[str, str]]:
    """Les deux axes du cadrage, dans l'ordre du fichier golden."""
    default_contact = _PERSONA_CONTACTS[0][1]
    records = [(f"persona={persona}", _persona_line(_cadrage(contact))) for persona, contact in _PERSONA_CONTACTS]
    records += [(f"contexte=angle:{code}", _cadrage(default_contact, angle=angle)) for code, angle in _ANGLE_CONTEXTS]
    records += [
        (f"contexte=relation:{state}", _cadrage(default_contact, relationship_state=state))
        for state in _RELATION_CONTEXTS
    ]
    return records


def _rendered() -> str:
    return "".join(f"### {key}\n{value}\n\n" for key, value in _records())


# ── le golden ────────────────────────────────────────────────────────────────


def test_le_cadrage_par_persona_et_par_contexte_suit_son_golden() -> None:
    rendered = _rendered()
    if _UPDATE:
        _GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        _GOLDEN.write_text(rendered, encoding="utf-8")
        return
    assert _GOLDEN.exists(), (
        f"Golden manquant : {_GOLDEN}. "
        "Le générer avec `UPDATE_PROMPT_GOLDEN=1 pytest tests/test_outreach_persona_context_golden.py`."
    )
    assert rendered == _GOLDEN.read_text(encoding="utf-8"), (
        "Le cadrage envoyé au modèle a changé pour au moins une cellule. Si c'est voulu, régénérer avec "
        "`UPDATE_PROMPT_GOLDEN=1 pytest tests/test_outreach_persona_context_golden.py` et committer le .txt."
    )


def test_le_corpus_couvre_les_deux_axes_et_les_dix_objectifs() -> None:
    """Une garde doit LIRE quelque chose : ici, 8 personas et 20 contextes."""
    keys = [key for key, _value in _records()]
    assert len(keys) == len(_PERSONA_CONTACTS) + len(_ANGLE_CONTEXTS) + len(_RELATION_CONTEXTS) == 29
    assert len(set(keys)) == len(keys), f"clés dupliquées : {keys}"
    # La taxonomie était de NEUF (#1926.9-.17), puis DIX avec #2374.6 (vague
    # 33, "suivi de l'envoi d'un document"), puis DOUZE avec #2947/#2204.22/.27
    # ("introduction", "partenariat"), puis TREIZE avec #2887 (26/09, arrivé
    # par `apps/web` sans toucher ce fichier) — « proposer un profil » —, puis
    # QUATORZE avec #2204.21 (« valider un contexte »), puis QUINZE avec #4060 (« approche directe »). Chacun
    # avec ses règles propres. Un objectif ajouté ou retiré sans cellule
    # rougit ici.
    # `valider_contexte` reste un code HISTORIQUE accepté mais n'est plus un objectif à part (GA-26).
    taxonomy = set(MESSAGE_OBJECTIVES) - set(OBJECTIVE_ALIASES)
    assert len(taxonomy) == 14, f"la taxonomie n'a plus quatorze objectifs : {sorted(taxonomy)}"
    assert {code for code, _angle in _ANGLE_CONTEXTS} == taxonomy
    assert set(PERSONAS) | {PERSONA_UNKNOWN} == {persona for persona, _contact in _PERSONA_CONTACTS}


@pytest.mark.parametrize("code,angle", _ANGLE_CONTEXTS, ids=[code for code, _a in _ANGLE_CONTEXTS])
def test_chaque_objectif_de_la_taxonomie_atteint_le_prompt(code: str, angle: str) -> None:
    """Pour chacun des dix : le prompt écrit SES règles, et celles d'aucun
    autre. Un objectif rédigé avec les règles d'un objectif qu'il n'est pas est
    le défaut exact que l'issue nomme."""
    cadrage = _cadrage(_PERSONA_CONTACTS[0][1], angle=angle)
    assert MESSAGE_OBJECTIVES[code]["rules"] in cadrage
    for other, entry in MESSAGE_OBJECTIVES.items():
        if other != code:
            assert entry["rules"] not in cadrage, f"{code} a reçu les règles de {other}"
    assert cadrage.count("- Objectif :") == 1
    assert "- Appel à l'action :" in cadrage


def test_les_deux_axes_du_cadrage_sont_independants() -> None:
    """Les 80 cellules sont rendues, pas seulement les 24 enregistrements.

    Chaque cellule doit être la recomposition de son persona et de son contexte.
    Un couplage entre les deux axes n'apparaîtrait dans aucun des deux — c'est
    exactement ce qu'un corpus par axe ne peut pas voir tout seul.
    """
    contexts: list[dict[str, str]] = [{"angle": angle} for _code, angle in _ANGLE_CONTEXTS]
    contexts += [{"relationship_state": state} for state in _RELATION_CONTEXTS]
    reference_contact = _PERSONA_CONTACTS[0][1]
    checked = 0
    for kwargs in contexts:
        reference = _cadrage(reference_contact, **kwargs)
        for _persona, contact in _PERSONA_CONTACTS:
            expected = reference.replace(_persona_line(reference), _persona_line(_cadrage(contact)))
            assert _cadrage(contact, **kwargs) == expected, f"axes couplés sur {kwargs} / {contact['title']}"
            checked += 1
    assert checked == len(contexts) * len(_PERSONA_CONTACTS) == 168


# ── la garde sait dire NON ───────────────────────────────────────────────────


def test_le_corpus_voit_un_changement_de_persona() -> None:
    by_persona = dict(_PERSONA_CONTACTS)
    assert _cadrage(by_persona["decideur"]) != _cadrage(by_persona["operationnel"])


def test_le_corpus_voit_un_changement_dobjectif() -> None:
    contact = _PERSONA_CONTACTS[0][1]
    assert _cadrage(contact, angle="relancer après mon premier message") != _cadrage(contact, angle="ouvrir le compte")


def test_le_corpus_voit_un_changement_de_relation() -> None:
    contact = _PERSONA_CONTACTS[0][1]
    assert _cadrage(contact, relationship_state="dormant") != _cadrage(contact, relationship_state="froid")


# ── doctrine c58 : aucun critère protégé dans le prompt ──────────────────────


def test_aucun_critere_protege_du_contact_natteint_le_prompt() -> None:
    """Le builder lit le contact CHAMP PAR CHAMP, jamais en bloc.

    Le jour où quelqu'un y verse le contact entier (``str(contact)``), l'âge, la
    photo et l'adresse partent avec — et rien ne l'aurait dit.
    """
    contact = {**_PERSONA_CONTACTS[0][1], **_PROTECTED_FIELDS}
    prompt = build_user_prompt(
        contact=contact,
        raw_analysis=_ANALYSIS,
        profile=_PROFILE,
        recent_signals=None,
        channel="email",
        context="ouvrir le compte",
        company_name="BNP Paribas",
        relationship_state=None,
        brief=derive_message_brief(contact=contact, relationship_state=None, angle="ouvrir le compte"),
    )
    for field, value in _PROTECTED_FIELDS.items():
        assert value not in prompt, f"le critère protégé `{field}` atteint le prompt"
        assert field not in prompt


def test_la_garde_des_criteres_proteges_natteint_pas_la_ville() -> None:
    """Le témoin du voisin légitime : la ville et le pays sont les deux
    exceptions NOMMÉES de la doctrine (plus grossières qu'un code postal). Une
    garde qui les rangerait avec la photo interdirait ce qui est permis."""
    assert "city" not in _PROTECTED_FIELDS
    assert "country" not in _PROTECTED_FIELDS
    reference = _PERSONA_CONTACTS[0][1]
    located = {**reference, "city": "Lyon", "country": "France"}
    assert _cadrage(located, angle="ouvrir le compte") == _cadrage(reference, angle="ouvrir le compte")
