
# Microburbs Sandbox Dashboard

A tiny Flask + vanilla JS dashboard that calls the **Microburbs API Sandbox** and turns responses into:
- At‑a‑glance highlights
- A smart table (auto-detects arrays in the response)
- A quick bar chart of numeric metrics
- A Leaflet map when GeoJSON is present

## Run locally

1) **Prereqs**
- Python 3.9+
- `pip install flask requests`

2) **Start**
```bash
export FLASK_APP=app.py
python app.py
```
Open http://localhost:5000

3) **Use**
- Enter the sandbox token (try `test`) and a suburb (e.g., `Belmont North`).
- Pick a resource and endpoint. Toggle "Include geometry" to render GeoJSON on the map.
- Click **Run**.

## Notes
- The server proxies requests to avoid CORS and keeps the token out of browser network logs.
- Only whitelisted endpoints from the sandbox UI are enabled in `RESOURCE_MAP` inside `app.py`. Add more as needed.
- This is a demo. No data is stored server-side.
