from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DEFAULT_STATE = {
    "notified": {},
    "last_change": "",
    "last_email": "",
}


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return dict(DEFAULT_STATE)

    try:
        state = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(state, dict):
            return dict(DEFAULT_STATE)
    except Exception:
        return dict(DEFAULT_STATE)

    state.setdefault("notified", {})
    state.setdefault("last_change", "")
    state.setdefault("last_email", "")
    return state


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def reset_state(path: Path) -> None:
    if path.exists():
        path.unlink()
