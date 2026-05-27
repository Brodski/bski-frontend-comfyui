"""
bootstrap.py — first-run setup for bski-frontend.

Creates web/custom_colors/node_colors.json from the committed example template
if it doesn't exist yet.  node_colors.json is gitignored so users' custom
colors are never clobbered by a `git pull`.
"""

import os
import shutil
import logging

logger = logging.getLogger(__name__)

_COLORS_DIR   = os.path.join(os.path.dirname(__file__), "web", "custom_colors")
_JSON_PATH    = os.path.join(_COLORS_DIR, "node_colors.json")
_EXAMPLE_PATH = os.path.join(_COLORS_DIR, "node_colors.json.example")


def run() -> None:
    """Create node_colors.json from the example template on first install."""
    if os.path.exists(_JSON_PATH):
        return  # already present — nothing to do

    if os.path.exists(_EXAMPLE_PATH):
        shutil.copy2(_EXAMPLE_PATH, _JSON_PATH)
        logger.info(
            "[bski-frontend] node_colors.json not found — "
            "created from node_colors.json.example. "
            "Edit web/custom_colors/node_colors.json to customize your colors."
        )
    else:
        # Safety net: write a minimal valid file so the extension never errors
        os.makedirs(_COLORS_DIR, exist_ok=True)
        with open(_JSON_PATH, "w", encoding="utf-8") as f:
            f.write("{}\n")
        logger.warning(
            "[bski-frontend] node_colors.json.example missing — "
            "created an empty node_colors.json."
        )
