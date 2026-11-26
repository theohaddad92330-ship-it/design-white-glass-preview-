"""#1960 — QUAND ÇA NE MARCHE PAS : Laura aide à le signaler, elle ne répare rien.

Le retour bêta #1960 (« support et escalade humaine ») : face à « ça ne marche
pas », « j'ai perdu mes données », « mon connecteur est cassé », Laura doit
sortir du parcours commercial, reconnaître le problème, ne jamais prétendre
l'avoir réparé, ne demander que l'utile, ne JAMAIS demander un secret, ne
promettre aucun délai — et renvoyer vers le signalement EXISTANT, pré-rempli
(décision du 12/09 : pas de second canal de support, pas de classifieur de
détresse par modèle).

⚠️ CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS. Ils tiennent la RÈGLE
écrite là où le modèle la lit — le prompt système, dans son segment invariant.
Ils ne prouvent pas que le modèle l'applique : ça, c'est la recette en ligne.

Deux gardes traversent les langages, parce que le prompt cite deux choses qui
vivent côté web :
  · le JETON du lien de signalement (`#signaler`), que `markdown.tsx` reconnaît
    via `features/feedback/reportLink.ts` — un jeton qui diverge rend un lien
    mort, et aucune des deux suites ne le verrait seule ;
  · l'ADRESSE de support, affichée par `components/ContactDialog.tsx` — Laura
    n'en invente aucune, elle reprend celle que l'application montre déjà.
"""

from __future__ import annotations

import re
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.laura_support import BLOCK_SUPPORT, support_contact_block
from app.services.claude_service import CACHE_SEGMENT_BREAK

#: Le prompt « nu » : tout ce qu'on y trouve vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")

_WEB_SRC = Path(__file__).resolve().parents[2] / "web" / "src"
_REPORT_LINK_TS = _WEB_SRC / "features" / "feedback" / "reportLink.ts"
_CONTACT_DIALOG_TSX = _WEB_SRC / "components" / "ContactDialog.tsx"

#: Une adresse e-mail — sans avaler le point final d'une phrase (« …bellum-it.com. »).
_EMAIL = r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"


def _web_report_target() -> str:
    """Le jeton que le rendu web reconnaît — lu dans la source, jamais recopié."""
    source = _REPORT_LINK_TS.read_text(encoding="utf-8")
    match = re.search(r"export const REPORT_LINK_TARGET = '([^']+)'", source)
    assert match, f"REPORT_LINK_TARGET introuvable dans {_REPORT_LINK_TS}"
    return match.group(1)


def _app_support_addresses() -> set[str]:
    """Les adresses de support que l'application affiche déjà."""
    source = _CONTACT_DIALOG_TSX.read_text(encoding="utf-8")
    return set(re.findall(r"mailto:([^'\"?\s]+)", source))


def _line_of(heading: str) -> str:
    """La ligne du bloc qui ouvre par `heading` — un marqueur ailleurs ne compte pas."""
    lines = [line for line in BLOCK_SUPPORT.splitlines() if line.startswith(heading)]
    assert len(lines) == 1, f"« {heading} » doit ouvrir exactement une ligne du bloc, trouvé {len(lines)}"
    return lines[0]


# ── Le corpus : la garde LIT quelque chose, au bon endroit ───────────────────


def test_the_support_block_is_not_empty_and_reaches_the_prompt():
    assert len(BLOCK_SUPPORT) > 1500, "le bloc de support a fondu — les gardes ci-dessous liraient du vide"
    assert BLOCK_SUPPORT in BARE


def test_the_support_block_lives_in_the_invariant_cached_segment():
    """Constant pour toute conversation : il doit être dans le PREMIER segment,
    sinon il repasse au tarif plein à chaque tour (GA-293)."""
    first, *rest = BARE.split(CACHE_SEGMENT_BREAK)
    assert BLOCK_SUPPORT in first
    assert all(BLOCK_SUPPORT not in segment for segment in rest)


# ── #1960.1 — reconnaître le problème, dans le même fil ──────────────────────


def test_1960_1_the_block_triggers_on_a_problem_with_the_product_itself():
    for tournure in (
        "ça ne marche pas",
        "j'ai perdu mes données",
        "mon connecteur est cassé",
        "Laura répond n'importe quoi",
    ):
        assert tournure in BLOCK_SUPPORT, f"la tournure « {tournure} » ne déclenche pas la conduite de support"
    assert "tu sors du parcours commercial" in BLOCK_SUPPORT
    assert _line_of("RECONNAIS-LE.")


# ── #1960.2 — ne jamais prétendre avoir réparé ───────────────────────────────


def test_1960_2_laura_never_claims_to_have_fixed_or_escalated_anything():
    line = _line_of("TU NE RÉPARES RIEN.")
    # Citées pour être PROSCRITES : ce sont les phrases qui trahiraient la personne.
    for proscrite in ("c'est réglé", "j'ai corrigé", "ça devrait remarcher", "j'ai prévenu l'équipe"):
        assert proscrite in line
    assert "rien n'est parti tant que la personne n'a pas envoyé elle-même son signalement" in line


# ── #1960.3 — ne demander que l'utile ────────────────────────────────────────


def test_1960_3_laura_only_asks_what_the_report_cannot_attach_by_itself():
    line = _line_of("TU NE DEMANDES QUE L'UTILE.")
    assert "Au plus deux questions" in line
    # Ce que le widget joint déjà : le redemander est un questionnaire, pas de l'aide.
    for joint in ("La page", "l'heure", "les erreurs récentes", "le navigateur"):
        assert joint in line
    assert "joints automatiquement" in line


# ── #1960.6 — jamais un mot de passe, une clé ou un secret ───────────────────

_SECRETS = ("mot de passe", "code de connexion", "clé", "jeton")


def _forbids_asking_for_secrets(text: str) -> bool:
    """La règle tient si UNE phrase interdit de demander, et nomme les quatre secrets."""
    for sentence in re.split(r"(?<=[.:])\s", text):
        if "Tu ne demandes JAMAIS" in sentence and all(secret in sentence for secret in _SECRETS):
            return True
    return False


def test_1960_6_laura_never_asks_for_a_password_a_key_or_any_secret():
    assert _forbids_asking_for_secrets(_line_of("AUCUN SECRET."))


def test_1960_6_the_secret_guard_says_NO_when_the_prohibition_is_gone():
    """Preuve qu'elle sait dire NON : le même bloc, l'interdit retiré."""
    amputated = BLOCK_SUPPORT.replace("Tu ne demandes JAMAIS", "Tu peux demander")
    assert not _forbids_asking_for_secrets(amputated)


def test_1960_6_the_secret_guard_does_not_catch_a_neighbouring_mention():
    """Preuve qu'elle n'attrape pas ce qu'elle ne vise pas : NOMMER un secret sans
    l'interdire (« reconnecte ta clé ») ne suffit pas à passer pour la règle."""
    assert not _forbids_asking_for_secrets("Reconnecte ta clé, ton jeton, ton code de connexion et ton mot de passe.")


# ── #1960.13 / #1960.14 — aucun délai, aucun incident affirmé ────────────────


def test_1960_14_laura_never_promises_a_delay():
    line = _line_of("APRÈS.")
    assert "Tu ne promets AUCUN délai" in line
    for proscrite in ("l'équipe te répond sous 24 h", "ce sera corrigé demain"):
        assert proscrite in line


def test_1960_13_laura_never_asserts_that_an_incident_is_known_or_unknown():
    """Aucune source d'incident n'est branchée : Laura ne peut dire ni l'un ni l'autre."""
    line = _line_of("APRÈS.")
    assert "Tu ne sais pas si un incident est déjà en cours" in line
    assert "c'est un problème connu" in line
    assert "personne d'autre ne l'a signalé" in line


def test_1960_10_and_11_no_invented_follow_up_nor_workaround():
    line = _line_of("APRÈS.")
    assert "jamais une manipulation inventée" in line
    assert "un suivi que tu ne peux pas montrer" in line


# ── #1960.4 / .5 / .7 / .8 — le signalement EXISTANT, pré-rempli ─────────────


def test_1960_4_laura_offers_the_prefilled_report_through_the_token_the_web_recognises():
    token = _web_report_target()
    line = _line_of("SIGNALER.")
    assert f"[Signaler ce problème]({token}:" in line
    assert "%20" in line, "sans la règle d'encodage, un espace casse le lien markdown"
    assert "sans parenthèse" in line, "une parenthèse fermante coupe la cible du lien"


def test_1960_8_the_person_sends_the_report_herself_after_reading_it():
    line = _line_of("SIGNALER.")
    assert "voit tout ce qui sera joint" in line
    assert "c'est son envoi — pas ta phrase — qui transmet quoi que ce soit" in line


def test_1960_4_the_report_link_is_named_as_the_only_exception_to_the_screen_paths_rule():
    """`_BLOCK_TOOLS` dit « tu n'écris que les chemins ci-dessus » : sans l'exception
    écrite, les deux règles se contredisent et le modèle en invente une troisième."""
    assert "seule exception à la règle des chemins" in _line_of("SIGNALER.")


def test_the_cross_language_token_guard_reads_the_web_and_says_NO_on_a_drift():
    token = _web_report_target()
    assert token == "#signaler", f"jeton web inattendu : {token!r}"
    drifted = BLOCK_SUPPORT.replace(f"]({token}:", "](#report:")
    assert f"]({token}:" not in drifted


# ── #1960.15 → #1960.20 — les critères de recette, un par cas ────────────────

_RECIPE_CASES = [
    pytest.param("UN BUG —", ("tu proposes le signalement",), id="1960.15-bug-fonctionnel"),
    pytest.param(
        "UN CONNECTEUR EXPIRÉ OU DÉCONNECTÉ —",
        ("[Intégrations](/integrations)", "reconnecter", "jamais ses identifiants", "tu proposes le signalement"),
        id="1960.16-connecteur-expire",
    ),
    pytest.param(
        "UNE DONNÉE FAUSSE —",
        ("la corrige elle-même", "sa correction prime", "tu proposes le signalement"),
        id="1960.17-donnee-fausse",
    ),
    pytest.param(
        "LA FACTURATION OU L'USAGE —",
        ("ni remboursement", "ni geste commercial", "Jamais un numéro de carte", "tu proposes le signalement"),
        id="1960.18-facturation",
    ),
    pytest.param(
        "UNE SESSION PERDUE —",
        ("se reconnecter", "tu ne promets pas de retrouver", "jamais son mot de passe"),
        id="1960.19-perte-de-session",
    ),
    pytest.param(
        "PARLER À UN HUMAIN —",
        (
            "tu ne prétends ni transférer la conversation ni être humaine",
            "Tu proposes le signalement",
            "que si le bloc CONTACT DU SUPPORT",
            "tu n'en inventes aucune",
            "Tu n'annonces ni délai",
        ),
        id="1960.20-parler-a-un-humain",
    ),
]


@pytest.mark.parametrize(("heading", "markers"), _RECIPE_CASES)
def test_each_recipe_case_carries_its_own_conduct_on_its_own_line(heading: str, markers: tuple[str, ...]):
    line = _line_of(heading)
    missing = [marker for marker in markers if marker not in line]
    assert not missing, f"le cas « {heading} » ne porte pas : {missing}"


def _the_app_support_address() -> str:
    addresses = _app_support_addresses()
    assert len(addresses) == 1, f"l'application affiche {len(addresses)} adresse(s) de support : {addresses}"
    (address,) = addresses
    return address


def test_1960_20_outside_white_label_the_human_contact_is_the_one_the_app_already_shows():
    """Témoin : un espace à la marque du produit reçoit l'adresse que l'app affiche
    déjà (confirmée par Louis le 13/09/2026), une seule fois, et jamais inventée."""
    address = _the_app_support_address()
    prompt = build_system_prompt({}, {}, "", "")
    assert re.findall(_EMAIL, prompt) == [address]
    # Elle vit dans le segment de SESSION, pas dans le bloc invariant : c'est ce
    # qui permet à un espace en marque blanche de ne pas la recevoir sans casser
    # le cache commun (GA-293).
    invariant, session, _volatile = prompt.split(CACHE_SEGMENT_BREAK)
    assert address not in invariant
    assert address in session
    assert not re.findall(_EMAIL, BLOCK_SUPPORT)


def test_1960_20_in_white_label_no_bellum_address_reaches_the_prompt():
    """Décision de Louis du 13/09/2026 : en marque blanche, Laura ne donne AUCUNE
    adresse Bellum — seulement le signalement."""
    prompt = build_system_prompt({}, {}, "", "", white_label=True)
    assert "@bellum" not in prompt.lower()
    assert not re.findall(_EMAIL, prompt)
    assert support_contact_block(white_label=True) == ""
    # Le signalement, lui, reste proposé.
    assert BLOCK_SUPPORT in prompt


def test_1960_20_the_address_guard_says_NO_on_an_invented_address():
    invented = support_contact_block(white_label=False).replace(_the_app_support_address(), "aide@exemple.fr")
    assert set(re.findall(_EMAIL, invented)) != _app_support_addresses()


# ── La marque blanche VOYAGE jusqu'au prompt — et pas seulement dans un test unitaire ──
#
# ⚠️ pydantic IGNORE une clé inconnue : un `white_label: true` envoyé par l'API
# vers un `ChatRequest` qui ne déclare pas le champ serait avalé sans erreur, et
# l'adresse partirait quand même. Ces deux tests jouent la vraie route
# `/chat/message` et relisent le texte envoyé au modèle.


def _system_prompt_sent(client: TestClient, monkeypatch: pytest.MonkeyPatch, **extra: object) -> str:
    monkeypatch.setenv("CHAT_TOOLS_DISABLED", "true")
    captured: dict[str, str] = {}

    async def _fake_call_claude(system: str, user: str, **_kwargs: object) -> tuple[str, None]:
        captured["system"] = system
        return ("Je te propose de le signaler.", None)

    with patch("app.routers.chat.call_claude", new=_fake_call_claude):
        res = client.post(
            "/chat/message",
            json={"message": "Je veux parler à un humain", "user_id": "u1", **extra},
        )
    assert res.status_code == 200
    assert "system" in captured, "le tour n'a jamais atteint le modèle — la garde ne lirait rien"
    return captured["system"]


def test_1960_20_white_label_sent_by_the_api_reaches_the_prompt_sent_to_the_model(client, monkeypatch):
    system = _system_prompt_sent(client, monkeypatch, white_label=True)
    assert "@bellum" not in system.lower()
    assert BLOCK_SUPPORT in system


def test_1960_20_a_request_without_white_label_keeps_the_support_address(client, monkeypatch):
    """Témoin : la clé absente (espace à la marque du produit) garde l'adresse."""
    system = _system_prompt_sent(client, monkeypatch)
    assert _the_app_support_address() in system


# ── Les voisins : ce que le bloc ne doit pas casser ailleurs ─────────────────


def test_the_tool_behind_the_report_is_never_named():
    """Un client ne lit ni le nom de l'outil de tickets, ni son jargon."""
    for forbidden in ("GitHub", "issue", "ticket"):
        assert not re.search(rf"\b{forbidden}\b", BLOCK_SUPPORT, flags=re.IGNORECASE), forbidden


def test_the_block_never_tells_someone_to_click_and_never_links_outside():
    lowered = BLOCK_SUPPORT.lower()
    for tournure in ("clique sur", "cliquer sur", "clique ici", "le bouton «"):
        assert tournure not in lowered
    assert not re.search(r"\]\(https?://", BLOCK_SUPPORT)
    assert "mailto:" not in BLOCK_SUPPORT, "le rendu du chat refuse les liens mailto : l'adresse s'écrit en clair"
