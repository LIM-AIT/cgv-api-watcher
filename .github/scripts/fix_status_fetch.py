from pathlib import Path

path = Path("docs/index.html")
text = path.read_text(encoding="utf-8")

start_marker = "        const response = await fetch(\n          `https://api.github.com/repos/LIM-AIT/cgv-api-watcher/contents/docs/status.json?ref=main&timestamp=${Date.now()}`,"
end_marker = "        const data = await response.json();\n"

replacement = '''        const statusUrls = [
          `./status.json?timestamp=${Date.now()}`,
          `${RAW_STATUS_URL}?timestamp=${Date.now()}`,
        ];

        let data = null;
        let lastError = null;

        for (const url of statusUrls) {
          try {
            const response = await fetch(url, { cache: "no-store" });
            if (!response.ok) {
              lastError = new Error(`HTTP ${response.status}`);
              continue;
            }

            data = await response.json();
            break;
          } catch (error) {
            lastError = error;
          }
        }

        if (!data) {
          throw lastError || new Error("상태 데이터 요청 실패");
        }
'''

if "const statusUrls = [" in text:
    print("Status fetch already patched.")
elif start_marker in text:
    start = text.index(start_marker)
    end = text.index(end_marker, start) + len(end_marker)
    text = text[:start] + replacement + text[end:]
    path.write_text(text, encoding="utf-8")
    print("Status fetch patched.")
else:
    raise SystemExit("Target GitHub REST status fetch block not found")
