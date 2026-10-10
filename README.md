# Shot Tracker Pro

Build a phone-first web app called Shot Curve.

One job: I log a tirzepatide shot. The chart updates. Next shot adds on top of what is still on board. No accounts.

Math

Half-life = 5 days.

Peak = 24 hours after the shot (simple linear rise from 0 contribution at shot time to full dose at 24h, then decay).

After peak: contribution = dose × 0.5 ^ ((hours_since_shot − 24) / 120).

Total on-board = sum of every logged shot.

Label: “Estimate. Peak ~24h. Half-life 5 days. Not a lab value.”

Log

Date, time (default now).

Dose: 6 mg (25 units) or 12 mg (50 units) or custom mg.

Save. Edit. Delete.

Store in localStorage. Big Export JSON and Import JSON buttons so data cannot vanish on a refresh or a new phone.

Chart

Solid line = mg on-board from logged shots only.

Marks on each shot.

Big number: on-board right now.

Second number: on-board at the next 3.5 days if I take nothing else (the drift).

No planned/ghost shots. No login. No subscription. No 12.5. Doses are 6 and 12.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://shot-curve-tracker.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/65a3a58f-1fc0-43e8-a716-7518a621aa9f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
