# Cab Closeout (MVP)

This is the offline-first, installable web app (PWA) for your night paperwork.

## What it does
- Mode 1 (ENTRY): fast keypad, cash/card/account, edit, trash/restore
- Mode 2 (CLOSEOUT): full sheet auto-filled
- Works offline after first load
- Saves only on-device (IndexedDB)

## Credit Card fee rule (FINAL)
Per card trip:
- compute 10% fee
- truncate fee to cents (drop anything beyond cents)
- subtract from fare
Tips are never included in the 10% fee step.

## Run
1) Install Node.js (LTS)
2) In this folder:
   - npm install
   - npm run dev

## Build (for deploy)
- npm run build
- deploy the `dist/` folder to any free static host (Netlify Drop is easiest)

## iPhone install
Open the HTTPS link in Safari -> Share -> Add to Home Screen
