// scripts/test-mlsdetail.mjs
import "dotenv/config";

const listingId = process.argv[2] || "1047051812";

const baseRaw = process.env.RE_API_BASE || "https://api.realestateapi.com";
const base = baseRaw.replace(/\/+$/, "");
const key = process.env.RE_API_KEY;

if (!key) {
  console.error("❌ RE_API_KEY is missing in .env");
  process.exit(1);
}

const url = `${base}/v2/MLSDetail`;

const resp = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": key,
  },
  body: JSON.stringify({ listing_id: listingId }),
});

const text = await resp.text();
let data;
try { data = JSON.parse(text); } catch { data = text; }

console.log("STATUS:", resp.status);
console.log("TOP KEYS:", data && typeof data === "object" ? Object.keys(data) : typeof data);

const listing = data?.data || data?.listing || data?.result?.listing || data?.data?.listing;
console.log("HAS data.data:", !!data?.data);
console.log("Sample fields:", {
  listingId: data?.data?.listingId,
  listPrice: data?.data?.listPrice,
  beds: data?.data?.property?.bedroomsTotal,
  baths: data?.data?.property?.bathroomsTotal,
  address: data?.data?.address?.unparsedAddress,
  url: data?.data?.url
});
