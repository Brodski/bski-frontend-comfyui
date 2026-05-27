import os
import json
from aiohttp import web
from server import PromptServer

_JSON_PATH = os.path.join(os.path.dirname(__file__), "web", "custom_colors", "node_colors.json")

@PromptServer.instance.routes.get("/bski/node_colors")
async def get_node_colors(request):
    try:
        return web.FileResponse(_JSON_PATH)
    except FileNotFoundError:
        return web.Response(text="{}", content_type="application/json")

@PromptServer.instance.routes.post("/bski/node_colors")
async def save_node_colors(request):
    try:
        body = await request.text()
        json.loads(body)  # validate before writing
        with open(_JSON_PATH, "w", encoding="utf-8") as f:
            f.write(body)
        return web.json_response({"ok": True})
    except (json.JSONDecodeError, ValueError):
        return web.json_response({"ok": False, "error": "Invalid JSON"}, status=400)
    except OSError as e:
        return web.json_response({"ok": False, "error": str(e)}, status=500)
