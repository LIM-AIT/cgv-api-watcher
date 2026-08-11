from pathlib import Path

layout_path = Path("docs/layout-order.js")
layout = layout_path.read_text(encoding="utf-8")

marker = '  const DATE_MORE_STYLE_ID = "date-more-toggle-style-v1";\n'
addition = marker + '''  const REACTION_LEADERBOARD_ASSET_ID = "reaction-leaderboard-asset-v1";\n\n  function ensureReactionLeaderboardAsset() {\n    if (document.getElementById(REACTION_LEADERBOARD_ASSET_ID)) return;\n\n    const script = document.createElement("script");\n    script.id = REACTION_LEADERBOARD_ASSET_ID;\n    script.type = "module";\n    script.src = "./reaction-leaderboard.js?v=1";\n    document.head.appendChild(script);\n  }\n\n  ensureReactionLeaderboardAsset();\n'''

if "REACTION_LEADERBOARD_ASSET_ID" not in layout:
    if marker not in layout:
        raise SystemExit("layout marker not found")
    layout = layout.replace(marker, addition, 1)
    layout_path.write_text(layout, encoding="utf-8")

index_path = Path("docs/index.html")
index = index_path.read_text(encoding="utf-8")
if './layout-order.js?v=6' not in index:
    if './layout-order.js?v=5' not in index:
        raise SystemExit("layout-order v5 tag not found")
    index = index.replace('./layout-order.js?v=5', './layout-order.js?v=6', 1)
    index_path.write_text(index, encoding="utf-8")
