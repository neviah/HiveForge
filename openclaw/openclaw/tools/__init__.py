"""Tool stubs retained for sandboxed RamClaw.

These are placeholders that can be expanded with concrete integrations.
"""

from .telegram import TelegramTool
from .whatsapp import WhatsAppTool
from .discord import DiscordTool
from .gmail import GmailTool
from .browser import BrowserTool
from .github import GitHubTool
from .file import FileTool
from .npm import NpmTool
from .playwright_interact import PlaywrightTool

TOOLS = {
    "telegram": TelegramTool(),
    "whatsapp": WhatsAppTool(),
    "discord": DiscordTool(),
    "gmail": GmailTool(),
    "browser": BrowserTool(),
    "github": GitHubTool(),
    "file": FileTool(),
    "npm": None,  # Initialized per-task with workspace
    "playwright": PlaywrightTool(),
}

__all__ = ["TOOLS"]
