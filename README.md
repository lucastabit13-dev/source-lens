# SourceLens

SourceLens searches for visual product matches from a photo. It sends the image to Google Lens through SerpApi, then returns matching results from AliExpress, DHgate, and Alibaba. It does not generate a product description or use text to find matches.

## Requirements

- Node.js 20 or newer
- A SerpApi account and API key for image search

## Run from this folder

1. Copy `.env.example` to `.env` and add your key as `SERPAPI_API_KEY=your_key`.
2. Run `npm start`.
3. Open `http://127.0.0.1:3000`.

The `.env` file is for local development and is excluded from the npm package. The key stays on the server and is never sent to the browser. SerpApi may apply usage limits or charges.

## Install SourceLens

Install the published command globally with npm:

```powershell
npm install --global @lucastabit13/sourcelens
```

Set the key in the same PowerShell window, start SourceLens, and open the local address it prints:

```powershell
$env:SERPAPI_API_KEY = "your_serpapi_key"
sourcelens
```

The app listens on `http://127.0.0.1:3000` by default. To use another port, set `$env:PORT` before running `sourcelens`.

## Image search behavior

- The browser compresses the selected photo to fit the provider's 500 KB upload limit.
- The backend uploads the image to SerpApi's image endpoint, then searches it with Google Lens.
- Results are filtered to the selected marketplace domains and sorted with provider-marked exact visual matches first.
- Product photos are not stored by SourceLens. Search results and saved searches are stored in this browser.
- An “exact visual match” is a provider label, not a guarantee of product identity, authenticity, materials, or origin. Check listing details and sellers before buying.

Photos are sent to SerpApi and Google Lens to perform the search. Review the providers' terms and privacy practices before using the app with sensitive images.







