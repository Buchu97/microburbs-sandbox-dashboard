
from flask import Flask, render_template, request, jsonify
import requests
from urllib.parse import urlencode

app = Flask(__name__)

MICROBURBS_BASE = "https://www.microburbs.com.au/report_generator/api"

# Whitelisted resources from the sandbox UI
RESOURCE_MAP = {
    "property": ["summary"],
    "suburb": [
        "amenity",
        "demographics",
        "development_applications",
        "ethnicity_by_pocket",
        "for_sale_properties",
        "list_suburbs",
        "market_insights",
        "market_insights_by_pocket",
        "market_insights_by_street",
        "risk_factors",
        "school_catchments",
        "schools",
        "similar_suburbs",
        "suburb_information",
        "summary",
        "zoning"
    ],
    "avm": ["estimate"],
    "cma": ["report"]
}

def sanitize(value: str) -> str:
    return (value or "").strip()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/proxy", methods=["GET"])
def proxy():
    """
    Proxies requests to Microburbs API to avoid CORS and hide the token from front-end logs.
    Expect query params:
      - resource: property | suburb | avm | cma
      - endpoint: one from RESOURCE_MAP[resource]
      - token: Bearer token (required for sandbox)
      - suburb: optional (e.g., 'Belmont North')
      - address: optional (for property endpoints, if any)
      - geojson: optional true/false
      - other params pass-through
    """
    resource = sanitize(request.args.get("resource"))
    endpoint = sanitize(request.args.get("endpoint"))
    token = sanitize(request.args.get("token"))
    # basic validation
    if resource not in RESOURCE_MAP:
        return jsonify({"error": f"Unsupported resource '{resource}'"}), 400
    if endpoint not in RESOURCE_MAP[resource]:
        return jsonify({"error": f"Unsupported endpoint '{endpoint}' for resource '{resource}'"}), 400
    if not token:
        return jsonify({"error": "Missing access token"}), 400

    # Build the upstream URL and params
    upstream = f"{MICROBURBS_BASE}/{resource}/{endpoint}"
    passthrough_params = {k: v for k, v in request.args.items()
                          if k not in {"resource", "endpoint", "token"}}

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    try:
        resp = requests.get(upstream, params=passthrough_params, headers=headers, timeout=20)
        resp.raise_for_status()
        return jsonify(resp.json())
    except requests.exceptions.HTTPError as e:
        return jsonify({"error": "Upstream error", "details": str(e), "body": getattr(e.response, "text", "")}), 502
    except Exception as e:
        return jsonify({"error": "Request failed", "details": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
