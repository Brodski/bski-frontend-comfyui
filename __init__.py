# WEB_DIRECTORY = "./web"
# NODE_CLASS_MAPPINGS = {}
# __all__ = ["NODE_CLASS_MAPPINGS", "WEB_DIRECTORY"]

from typing_extensions import override
from comfy_api.latest import ComfyExtension, io
from . import routes  # registers /bski/node_colors GET + POST

WEB_DIRECTORY = "./web"

class NodeColorsExtension(ComfyExtension):
    @override
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return []  # JS-only; no Python nodes to register

async def comfy_entrypoint() -> NodeColorsExtension:
    return NodeColorsExtension()