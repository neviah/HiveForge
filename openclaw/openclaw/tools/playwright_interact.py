from typing import Any

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sync_playwright = None


class PlaywrightTool:
    _browser_instance = None
    _context_instance = None
    _page_instance = None

    def _ensure_browser(self) -> Any:
        """Ensure browser instance is running"""
        if not sync_playwright:
            raise RuntimeError("Playwright not installed. Run: pip install playwright && playwright install")
        
        if self._browser_instance is None:
            playwright = sync_playwright().start()
            self._browser_instance = playwright.chromium.launch(headless=True)
            self._context_instance = self._browser_instance.new_context()
            self._page_instance = self._context_instance.new_page()
        
        return self._page_instance

    def navigate(self, url: str, timeout: int = 30000) -> dict[str, Any]:
        """Navigate to a URL"""
        try:
            page = self._ensure_browser()
            page.goto(url, timeout=timeout)
            return {
                "success": True,
                "url": page.url,
                "title": page.title(),
            }
        except Exception as e:
            return {
                "success": False,
                "url": url,
                "error": str(e),
            }

    def click(self, selector: str, timeout: int = 5000) -> dict[str, Any]:
        """Click an element by selector"""
        try:
            page = self._ensure_browser()
            page.click(selector, timeout=timeout)
            return {
                "success": True,
                "selector": selector,
                "message": f"Clicked element: {selector}",
            }
        except Exception as e:
            return {
                "success": False,
                "selector": selector,
                "error": str(e),
            }

    def fill(self, selector: str, text: str, timeout: int = 5000) -> dict[str, Any]:
        """Fill an input field"""
        try:
            page = self._ensure_browser()
            page.fill(selector, text, timeout=timeout)
            return {
                "success": True,
                "selector": selector,
                "message": f"Filled element {selector} with text",
            }
        except Exception as e:
            return {
                "success": False,
                "selector": selector,
                "error": str(e),
            }

    def wait_for_selector(self, selector: str, timeout: int = 5000) -> dict[str, Any]:
        """Wait for element to appear"""
        try:
            page = self._ensure_browser()
            page.wait_for_selector(selector, timeout=timeout)
            return {
                "success": True,
                "selector": selector,
                "message": f"Selector found: {selector}",
            }
        except Exception as e:
            return {
                "success": False,
                "selector": selector,
                "error": str(e),
            }

    def screenshot(self, path: str) -> dict[str, Any]:
        """Take a screenshot"""
        try:
            page = self._ensure_browser()
            page.screenshot(path=path)
            return {
                "success": True,
                "path": path,
                "message": f"Screenshot saved to {path}",
            }
        except Exception as e:
            return {
                "success": False,
                "path": path,
                "error": str(e),
            }

    def get_content(self) -> dict[str, Any]:
        """Get page content"""
        try:
            page = self._ensure_browser()
            return {
                "success": True,
                "content": page.content(),
                "url": page.url,
                "title": page.title(),
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }

    def cleanup(self):
        """Close browser instance"""
        try:
            if self._page_instance:
                self._page_instance.close()
            if self._context_instance:
                self._context_instance.close()
            if self._browser_instance:
                self._browser_instance.close()
            self._browser_instance = None
            self._context_instance = None
            self._page_instance = None
        except Exception as e:
            print(f"Error cleaning up browser: {e}")

    def run(
        self,
        action: str,
        selector: str = "",
        text: str = "",
        url: str = "",
        path: str = "",
        timeout: int = 5000,
        **_: Any,
    ) -> dict[str, Any]:
        if action == "navigate":
            return self.navigate(url=url, timeout=timeout)
        elif action == "click":
            return self.click(selector=selector, timeout=timeout)
        elif action == "fill":
            return self.fill(selector=selector, text=text, timeout=timeout)
        elif action == "wait_for_selector":
            return self.wait_for_selector(selector=selector, timeout=timeout)
        elif action == "screenshot":
            return self.screenshot(path=path)
        elif action == "get_content":
            return self.get_content()
        raise ValueError(f"Unsupported playwright action: {action}")
