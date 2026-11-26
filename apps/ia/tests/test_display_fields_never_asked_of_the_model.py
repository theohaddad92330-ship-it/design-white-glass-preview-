"""GA-101 — aucun prompt ne demande un champ d'AFFICHAGE au modèle.

═════════════════════════════════════════════════════════════════════════════
POURQUOI CETTE GARDE EXISTE
═════════════════════════════════════════════════════════════════════════════
C'est la contradiction n°3 du paquet OrgGraph du 27/08, et c'est la seule des
treize que RIEN ne tient aujourd'hui.

La v3 fait produire quatre champs par le prompt, dans un tableau dont la colonne
s'intitule « Sortie du LLM » (v3 §6.2, l.337-343) :

    focus_direction      direction focale a cartographier
    displayRole          Sponsor / Influenceur / Operationnel
    recommendationLine   phrase du bandeau « BellumAI recommande... »
    accessStatus         accessible / to_contact / to_avoid

Le document FINAL les retire de l'autorite du modele (FINAL §9, l.305-310) :

    > « Retirer de l'autorite du LLM — displayRole : derive des decisionRoles et
    >   des relations. accessStatus : derive des coordonnees, consentements et
    >   historique. focusDirection : selection par scoring deterministe, le LLM
    >   peut seulement proposer un commentaire. »

et l'arbitrage A1 de Louis (29/08) etend la regle au quatrieme :

    > « Le verdict : le DERIVER, jamais le generer. Un verdict "jamais vide"
    >   produit par un modele est un candidat direct a la phrase inventee. »

LE PIEGE PRECIS QUE CETTE GARDE FERME. Aucun des quatre noms n'existe dans le
depot — ni en TypeScript, ni en Python, ni dans un prompt. La regle est donc
respectee PAR ACCIDENT : ces champs n'ont pas ete retires, ils n'ont jamais ete
mis. Le prochain agent qui implementera le §9 du FINAL ouvrira, pour connaitre
leur nom et leur format exacts, le seul des deux documents qui les donne — le
tableau v3 — et les ajoutera au JSON demande au modele, de bonne foi, en croyant
suivre la specification.

CE QUE CA COUTE, concretement. Un `displayRole` produit par un modele est un
CLASSEMENT DE PERSONNES issu d'un texte libre : rien ne garantit qu'aucun critere
protege n'a pese, et rien ne permet de le rejouer. Le depot tient deja cette
ligne ailleurs (`test_protected_criteria_scoring.py`, `protected-criteria.spec.ts`)
et il la tient ici, mais par chance.

═════════════════════════════════════════════════════════════════════════════
CE QU'ELLE LIT, ET CE QU'ELLE REFUSE
═════════════════════════════════════════════════════════════════════════════
Elle lit les fichiers de `app/prompts/*.py` comme du TEXTE — sans les importer.
Deux raisons, et la seconde est la vraie :

  · un import tire des dependances (`anthropic` en tete) dont le paquet FINAL
    note lui-meme qu'elles manquent dans certains environnements — c'est
    l'aveu de portee de sa « Note de recette » (FINAL l.73-75), et une garde qui
    ne s'execute pas ne garde rien ;
  · les quatre noms sont des CLES JSON demandees au modele. Une cle JSON est
    ecrite en toutes lettres dans le texte du prompt : la lire au niveau du
    fichier voit donc exactement ce que la garde doit voir.

Elle commence par verifier qu'elle a bien un corpus : le dossier existe, il porte
au moins vingt-cinq prompts, et les deux qui produisent l'organigramme
(`bellum_organigramme.py`, `bellum_contacts.py`) sont la et portent bien un
schema JSON. Sans ces preuves, elle ECHOUE en disant que son corpus a change,
plutot que de passer au vert sur un dossier vide.

CE QU'ELLE NE FAIT PAS, ET POURQUOI. Elle ne dit rien des DERIVATIONS.
`decisionBadgeOf` (web), `_decision_roles`, `_identity_status` et `_access_score`
(ce service) sont libres d'evoluer : la garde interdit la SOURCE — le modele —
pas la valeur. Une garde qui interdirait aussi la derivation empecherait de
corriger un bug.

LIMITE CONNUE, ecrite pour qu'elle ne se decouvre pas seule : un champ injecte
au moment de l'execution depuis une constante situee hors de `app/prompts/`
echapperait a cette lecture. C'est une forme que le depot n'emploie nulle part
aujourd'hui (les schemas JSON sont ecrits en clair dans les prompts), mais la
garde ne la verrait pas.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "app" / "prompts"

#: Les quatre champs d'affichage. Les trois premiers viennent du FINAL §9
#: (l.305-310) ; le quatrieme de l'arbitrage A1 de Louis du 29/08.
#: Chaque entree porte les orthographes que la v3 emploie (camelCase et
#: snake_case), parce qu'un prompt ecrit dans l'une ou l'autre.
DISPLAY_FIELDS: dict[str, tuple[str, ...]] = {
    "displayRole": ("displayRole", "display_role"),
    "accessStatus": ("accessStatus", "access_status"),
    "focusDirection": ("focusDirection", "focus_direction"),
    "recommendationLine": ("recommendationLine", "recommendation_line"),
}

#: Les deux prompts qui produisent l'organigramme. Si l'un disparait, ce n'est
#: pas la garde qui doit se taire : c'est elle qui doit le dire.
ORG_PROMPTS = ("bellum_organigramme.py", "bellum_contacts.py")

#: Nombre minimal de prompts attendus. Il y en a 34 au 30/08/2026 ; le plancher
#: est volontairement bas pour ne pas rougir a chaque ajout ou retrait, et
#: volontairement non nul pour qu'un dossier vide ne passe jamais au vert.
MIN_PROMPT_FILES = 25


def _prompt_files() -> list[Path]:
    return sorted(p for p in PROMPTS_DIR.glob("*.py") if p.name != "__init__.py")


# ── Le corpus est-il celui que cette garde croit lire ? ──────────────────────


def test_corpus_le_dossier_des_prompts_existe_et_nest_pas_vide() -> None:
    assert PROMPTS_DIR.is_dir(), f"corpus introuvable : {PROMPTS_DIR}"
    files = _prompt_files()
    assert len(files) >= MIN_PROMPT_FILES, (
        f"{len(files)} prompt(s) lus, au moins {MIN_PROMPT_FILES} attendus — "
        "le corpus a change de forme, cette garde ne lit plus ce qu'elle croit."
    )


def test_corpus_les_deux_prompts_de_lorganigramme_sont_la_et_portent_un_schema() -> None:
    for name in ORG_PROMPTS:
        path = PROMPTS_DIR / name
        assert path.is_file(), f"{name} a disparu du corpus"
        text = path.read_text(encoding="utf-8")
        assert len(text.splitlines()) > 50, f"{name} est trop court pour etre un prompt"
        # La preuve qu'on lit bien un prompt qui DEMANDE une sortie structuree :
        # sans schema JSON, il n'y a pas de champ a interdire, et la garde
        # surveillerait un fichier sans rapport avec sa regle.
        assert re.search(r'"[A-Za-z_]+"\s*:', text), f"{name} ne demande aucune cle JSON"


def test_corpus_le_role_technique_est_toujours_demande_au_modele() -> None:
    """La contre-preuve : le modele DOIT continuer a rendre `role`.

    Sans cette assertion, une garde verte pourrait simplement signifier que les
    prompts ne demandent plus rien du tout. Ce que le FINAL retire, ce sont les
    champs d'AFFICHAGE — les huit roles techniques restent une sortie du modele
    (FINAL l.292-293 : « On l'etend, on ne le reecrit pas integralement »).
    """
    text = (PROMPTS_DIR / "bellum_contacts.py").read_text(encoding="utf-8")
    assert '"role"' in text, "le prompt contacts ne demande plus le role technique"


# ── La regle ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("field,spellings", sorted(DISPLAY_FIELDS.items()))
def test_aucun_prompt_ne_demande_ce_champ_daffichage(field: str, spellings: tuple[str, ...]) -> None:
    guilty: list[str] = []
    for path in _prompt_files():
        text = path.read_text(encoding="utf-8")
        for spelling in spellings:
            for match in re.finditer(rf"\b{re.escape(spelling)}\b", text):
                line = text.count("\n", 0, match.start()) + 1
                guilty.append(f"{path.name}:{line} ({spelling})")
    assert not guilty, (
        f"« {field} » est demande au modele : {', '.join(guilty)}.\n"
        "Le FINAL le retire de l'autorite du LLM (§9, l.305-310) : il se DERIVE "
        "des donnees. Un champ d'affichage produit par un modele est un classement "
        "de personnes qu'on ne peut ni expliquer ni rejouer."
    )
