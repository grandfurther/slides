# Softworkz prototype

Private, presentation-ready prototype for Softworkz. It is not the live site and
is not deployed anywhere.

## Run

```bash
npm install
npm run dev        # http://localhost:8111  (strict port: exits if 8111 is busy)
```

`npm run build && npm run preview` serves the production build on the same port.
Everything is bundled locally: Three.js, fonts and media. No CDN, backend or analytics.

## Demo click path

1. Hero: tap **Web**, **Mobile**, **SaaS** or **Enterprise** on the phone and use the micro-demo. **Back** / **Home** sit in the phone's tab bar. Each view has its own URL (`?view=web`).
2. Drag the phone by its frame, or press **Rotate phone**, to see the rear camera assembly.
3. Scroll to **From phone to operations** (or tap **SurveyPlus**): choose **Needs attention**, fill the required follow-up, **Save sample inspection**, then **See it in the dashboard**. **Inspect** the new row, then **Reset demo**.
4. Keep scrolling through **Under the hood**: the handset separates into Interface, Form logic, Data and Integrations, traces the record, and reassembles.
5. **Start a project**: answer three questions, **Copy brief**, optionally **Open email draft**. Nothing is sent.

## Layout

- `src/phone3d.js` the handset model. `DEVICE` at the top holds every proportion, so it can be re-tuned against a reference mockup in one place.
- `src/views.js` phone views and micro-demos (also mounted outside the device as **Browse services**).
- `src/store.js` the single client-side state shared by phone, dashboard and layer trace.
- `src/main.js` routing glue, scroll chapters, fallbacks.
- `design/hero-board.jpg` the Higgsfield layout board. Its lettering is guidance only; all site copy is HTML.
- `public/media/` studio stills (Higgsfield, generated from the model render) and the plain local renders they were made from.

## Checks

```bash
NODE_PATH=$(npm root -g) node scripts/shots.mjs     # walkthrough + screenshots into screenshots/
NODE_PATH=$(npm root -g) node scripts/renders.mjs   # plain-background renders of the model
```

`?studio=pair|rear|front` shows the model alone on a plain background.

## Honest labels

Company facts come from softworkz.net (name, offices, office hours, published email,
SurveyPlus description). The service demos, inspection form, dashboard and layer
diagram are illustrative and labelled as such on the page.
