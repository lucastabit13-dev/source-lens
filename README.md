# SourceLens

SourceLens searches for visual product matches from a photo. It sends the image to Google Lens through SerpApi, then returns matching results from AliExpress, DHgate, and Alibaba. It does not generate a product description or use text to find matches.

## Run locally

1. Install Node.js 20 or newer.
2. Create a SerpApi account and copy its private API key.
3. Copy `.env.example` to `.env`, then set `SERPAPI_API_KEY` in `.env`.
4. Run `npm start` from this folder.
5. Open `http://127.0.0.1:3000`.

The key stays on the server and is never sent to the browser. Do not commit `.env`; it is ignored by Git. The provider requires an account and may apply its own usage limits and charges.

## Image search behavior

- The browser compresses the selected photo to fit the provider's 500 KB upload limit.
- The backend uploads the image to SerpApi's image endpoint, then searches it with Google Lens.
- Results are filtered to the selected marketplace domains and sorted with provider-marked exact visual matches first.
- Product photos are not stored by SourceLens. Search results and saved searches are stored in this browser.
- An “exact visual match” is a provider label, not a guarantee of product identity, authenticity, materials, or origin. Check listing details and sellers before buying.

Photos are sent to SerpApi and Google Lens to perform the search. Review the provider's terms and privacy practices before using the app with sensitive images.