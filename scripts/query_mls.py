import os
import json
import urllib.request


def load_dotenv(path=".env"):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, val = line.split("=", 1)
            os.environ.setdefault(key, val)

def main():
    url = "https://api.realestateapi.com/v2/MLSSearch"
    load_dotenv()
    body = {
        "latitude": 43.970837,
        "longitude": -75.61923,
        "radius": 5,
        "size": 100,
        "active": True,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-api-key": os.environ.get("RE_API_KEY", ""),
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.load(resp)
    except urllib.error.HTTPError as err:
        print("HTTP error", err.code, err.reason)
        body = err.read().decode('utf-8', errors='ignore')
        print(body)
        return

    for item in payload.get("data", []):
        address = item.get("listing", {}).get("address", {})
        if "53 Bridge Street" in address.get("unparsedAddress", ""):
            listing = item.get("listing", {})
            prop = listing.get("property", {})
            print("listingId", item.get("listingId"))
            print("price", listing.get("listPriceLow"))
            print("beds", prop.get("bedroomsTotal"))
            print("baths", prop.get("bathroomsTotal"))
            print("sqft", prop.get("livingArea"))
            print("fullAddress", address.get("unparsedAddress"))
            return

    print("not found")


if __name__ == "__main__":
    main()
