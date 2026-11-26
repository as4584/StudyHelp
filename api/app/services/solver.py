# ruff: noqa: RUF001  (math symbols are matched as themselves)
"""Deterministic answers for the parts of a question a computer can settle exactly.

Before the study assistant answers, the question is scanned for things SymPy (or plain
arithmetic) can compute: derivatives, integrals, equations, simplify/factor/expand,
percentages, arithmetic and chemical-equation balancing. Each result is

- handed to the model as a verified fact, so it explains instead of calculating, and
- appended to the reply as a "Checked:" line, so the student sees a result no model wrote.

Safety: student text never reaches ``eval``. An expression is accepted only if every token is
a number, an operator, a bracket or a name from ``NAMES``; anything else means "no fact". Sizes
are capped and every computation runs under a time limit.
"""

import asyncio
import re
from dataclasses import dataclass
from fractions import Fraction

import sympy as sp
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)

TIME_LIMIT_S = 2.0
MAX_EXPR = 120
MAX_FACTS = 3

SYMBOLS = {c: sp.Symbol(c) for c in "abcknrstuvwxyz"}
FUNCS = {
    "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "sec": sp.sec, "csc": sp.csc, "cot": sp.cot,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan, "arcsin": sp.asin, "arccos": sp.acos,
    "arctan": sp.atan, "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
    "ln": sp.log, "log": sp.log, "exp": sp.exp, "sqrt": sp.sqrt, "abs": sp.Abs,
}  # fmt: skip
CONSTS = {"pi": sp.pi, "e": sp.E}
NAMES = {**SYMBOLS, **FUNCS, **CONSTS}
# parse_expr needs these to build numbers; nothing else is reachable.
GLOBALS = {"Integer": sp.Integer, "Float": sp.Float, "Rational": sp.Rational, "Symbol": sp.Symbol}
TRANSFORMS = (*standard_transformations, implicit_multiplication_application, convert_xor)

TOKEN = re.compile(r"\s*(\d+(?:\.\d+)?|[A-Za-z]+|\*\*|[-+*/^().,])")
BIG_POWER = re.compile(r"(\^|\*\*)\s*\(?\s*-?\d{3,}")
UNICODE = str.maketrans({"²": "^2", "³": "^3", "×": "*", "·": "*", "÷": "/", "−": "-", "π": "pi"})


class Unsafe(ValueError):
    pass


def _tokens(src: str) -> list[str]:
    out, pos, src = [], 0, src.strip()
    while pos < len(src):
        m = TOKEN.match(src, pos)
        if not m:
            raise Unsafe(src[pos:])
        out.append(m.group(1))
        pos = m.end()
    return out


def parse(src: str) -> sp.Expr:
    """Whitelisted math -> SymPy expression, or Unsafe."""
    src = src.translate(UNICODE).strip().rstrip(".?!")
    if not src or len(src) > MAX_EXPR or BIG_POWER.search(src) or "__" in src:
        raise Unsafe(src)
    toks = _tokens(src)
    words = [t for t in toks if t.isalpha()]
    if any(w not in NAMES for w in words) or toks.count("(") != toks.count(")"):
        raise Unsafe(src)
    if any(w in FUNCS for w in words) and len(words) > 8:
        raise Unsafe(src)
    try:
        expr = parse_expr(
            " ".join(toks), local_dict=dict(NAMES), global_dict=dict(GLOBALS),
            transformations=TRANSFORMS, evaluate=True,
        )  # fmt: skip
    except Exception as exc:  # SymPy raises many types on malformed input
        raise Unsafe(src) from exc
    if not isinstance(expr, sp.Expr):
        raise Unsafe(src)
    return expr


def show(expr: object) -> str:
    """Textbook-ish plain text: 6*x + 5 -> 6x + 5, x**2 -> x^2."""
    s = sp.sstr(expr).replace("**", "^")
    s = re.sub(r"(?<![\w.])(\d+)\*(?=[a-zA-Z(])", r"\1", s)
    s = s.replace("log(", "ln(").replace("E^", "e^").replace("exp(", "e^(")
    return s


def _var(expr: sp.Expr, hint: str | None = None) -> sp.Symbol | None:
    if hint and hint in SYMBOLS:
        return SYMBOLS[hint]
    free = sorted(expr.free_symbols, key=lambda s: (s.name != "x", s.name))
    return free[0] if free else None


@dataclass(frozen=True)
class Fact:
    kind: str
    text: str  # "derivative of 3x^2 + 5x - 7 with respect to x = 6x + 5"


STOP = (
    r"(?=\s*(?:[?;]|\.(?:\s|$)|,\s|\band\b|\bthen\b|\bwith respect\b|\bwrt\b"
    r"|\bfor\b|\bgive\b|\bshow\b|$))"
)
EXPR = r"([^?;]{1,140}?)"
PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("derivative", re.compile(
        r"(?:derivative|differentiate|d/d([a-z]))\s*(?:of\s*)?(?:f\(\w\)\s*=\s*|y\s*=\s*)?" + EXPR
        + r"(?:\s*(?:with respect to|wrt)\s*([a-z]))?" + STOP, re.I)),
    ("integral", re.compile(
        r"(?:integral|integrate|antiderivative)\s*(?:of\s*)?" + EXPR
        + r"(?:\s*d([a-z]))?" + STOP, re.I)),
    ("simplify", re.compile(r"\b(simplify|factor|expand)\s*:?\s*" + EXPR + STOP, re.I)),
    ("solve", re.compile(
        r"solve(?:\s+for\s+([a-z]))?\s*:?\s*([^?;=]{1,70}=[^?;=]{1,70}?)" + STOP, re.I)),
]  # fmt: skip
PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*of\s*\$?(\d+(?:\.\d+)?)", re.I)
ARITH = re.compile(
    r"(?:what is|what's|calculate|compute|evaluate)\s+([\d\s.+\-*/^()×÷]{3,80})\??", re.I
)
CHEM = re.compile(r"([A-Z][A-Za-z0-9()\s+]*?)\s*(?:->|→|=>|⟶)\s*([A-Z][A-Za-z0-9()\s+]*)")


def _derivative(m: re.Match[str]) -> Fact | None:
    expr = parse(m.group(2))
    v = _var(expr, m.group(1) or m.group(3))
    if v is None:
        return None
    out = sp.simplify(sp.diff(expr, v))
    return Fact("derivative", f"d/d{v} of {show(expr)} = {show(out)}")


def _integral(m: re.Match[str]) -> Fact | None:
    expr = parse(m.group(1).removesuffix(" dx"))
    v = _var(expr, m.group(2))
    if v is None:
        return None
    out = sp.integrate(expr, v)
    if out.has(sp.Integral):
        return None  # no closed form: say nothing rather than something vague
    return Fact("integral", f"integral of {show(expr)} d{v} = {show(out)} + C")


def _simplify(m: re.Match[str]) -> Fact | None:
    verb, expr = m.group(1).lower(), parse(m.group(2))
    fn = {"simplify": sp.simplify, "factor": sp.factor, "expand": sp.expand}[verb]
    out = fn(expr)
    return Fact(verb, f"{verb} {show(expr)} = {show(out)}")


def _solve(m: re.Match[str]) -> Fact | None:
    lhs, rhs = m.group(2).split("=", 1)
    left, right = parse(lhs), parse(rhs)
    eq = left - right
    v = _var(eq, m.group(1))
    if v is None:
        return None
    roots = sp.solve(sp.Eq(left, right), v)
    if not roots:
        return Fact("solve", f"{show(left)} = {show(right)} has no solution for {v}")
    sols = ", ".join(f"{v} = {show(r)}" for r in roots[:6])
    return Fact("solve", f"{show(left)} = {show(right)} gives {sols}")


def _num(x: sp.Expr) -> str:
    if x.is_Integer:
        return str(x)
    if x.is_Rational:
        q = Fraction(int(x.p), int(x.q))
        dec = float(q)
        return f"{q} ≈ {dec:.6g}" if len(str(q)) < 12 else f"≈ {dec:.6g}"
    return f"≈ {float(x):.6g}"


def _percent(m: re.Match[str]) -> Fact:
    p, base = sp.Rational(m.group(1)), sp.Rational(m.group(2))
    return Fact("percent", f"{m.group(1)}% of {m.group(2)} = {_num(p * base / 100)}")


def _arith(m: re.Match[str]) -> Fact | None:
    src = m.group(1).strip()
    if not re.search(r"\d\s*[-+*/^×÷]\s*\(?\s*\d", src):
        return None
    expr = parse(src)
    if expr.free_symbols:
        return None
    return Fact("arithmetic", f"{' '.join(src.split())} = {_num(expr)}")


ELEMENT = re.compile(r"([A-Z][a-z]?)(\d*)|(\()|(\))(\d*)")


def _formula(s: str) -> dict[str, int]:
    stack: list[dict[str, int]] = [{}]
    for el, n, op, cl, cn in ELEMENT.findall(s):
        if op:
            stack.append({})
        elif cl:
            if len(stack) < 2:
                raise Unsafe(s)
            group, k = stack.pop(), int(cn or 1)
            for e, c in group.items():
                stack[-1][e] = stack[-1].get(e, 0) + c * k
        else:
            stack[-1][el] = stack[-1].get(el, 0) + int(n or 1)
    if len(stack) != 1 or not stack[0] or re.sub(r"[A-Za-z0-9()]", "", s):
        raise Unsafe(s)
    return stack[0]


def _chem(m: re.Match[str]) -> Fact | None:
    left = [t.strip() for t in m.group(1).split("+") if t.strip()]
    right = [t.strip() for t in m.group(2).split("+") if t.strip()]
    species = [re.sub(r"^\d+", "", s) for s in left + right]  # drop any coefficients given
    if not left or not right or len(species) > 8:
        return None
    comps = [_formula(s) for s in species]
    elements = sorted({e for c in comps for e in c})
    if len(elements) < 1 or not all(e in "".join(species) for e in elements):
        return None
    matrix = sp.Matrix(
        [
            [c.get(e, 0) * (1 if i < len(left) else -1) for i, c in enumerate(comps)]
            for e in elements
        ]
    )
    null = matrix.nullspace()
    if len(null) != 1:
        return None
    vec = null[0]
    lcm = sp.ilcm(*[term.q for term in vec])
    coeffs = [int(term * lcm) for term in vec]
    if all(c < 0 for c in coeffs):
        coeffs = [-c for c in coeffs]
    if any(c <= 0 for c in coeffs):
        return None

    def side(names: list[str], cs: list[int]) -> str:
        return " + ".join(f"{c if c > 1 else ''}{n}" for n, c in zip(names, cs, strict=True))

    n = len(left)
    eq = f"{side(species[:n], coeffs[:n])} -> {side(species[n:], coeffs[n:])}"
    return Fact("chemistry", f"balanced: {eq}")


def _scan(question: str) -> list[Fact]:
    facts: list[Fact] = []
    handlers = {
        "derivative": _derivative, "integral": _integral, "simplify": _simplify, "solve": _solve,
    }  # fmt: skip
    for kind, pat in PATTERNS:
        for m in pat.finditer(question):
            try:
                f = handlers[kind](m)
            except (Unsafe, ValueError, TypeError, NotImplementedError, ZeroDivisionError):
                continue
            if f and f not in facts:
                facts.append(f)
    for m in PERCENT.finditer(question):
        facts.append(_percent(m))
    if not facts:
        for m in ARITH.finditer(question):
            try:
                f = _arith(m)
            except (Unsafe, ValueError, TypeError, ZeroDivisionError):
                continue
            if f:
                facts.append(f)
    if re.search(r"\bbalanc", question, re.I):
        for m in CHEM.finditer(question):
            try:
                f = _chem(m)
            except (Unsafe, ValueError, TypeError, ZeroDivisionError):
                continue
            if f:
                facts.append(f)
    return facts[:MAX_FACTS]


async def solve(question: str) -> list[Fact]:
    """Facts SymPy can verify in ``question``; empty when nothing applies or time runs out."""
    if len(question) > 4000:
        question = question[:4000]
    try:
        return await asyncio.wait_for(asyncio.to_thread(_scan, question), TIME_LIMIT_S)
    except TimeoutError:
        return []


def prompt_block(facts: list[Fact]) -> str:
    if not facts:
        return ""
    lines = "\n".join(f"- {f.text}" for f in facts)
    return (
        "\n\nA computer algebra system has already computed these results exactly. Treat them "
        "as correct, do not recompute or contradict them, and spend your answer explaining the "
        f"method:\n{lines}"
    )


def checked_lines(facts: list[Fact]) -> str:
    return "".join(f"\nChecked: {f.text}" for f in facts)
