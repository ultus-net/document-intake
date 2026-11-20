# Media

The screenshots in the README are rendered from the running demo, not drawn by hand.

| File | Screen |
|---|---|
| `queue.png` | the review queue after a fresh drain |
| `run-detail.png` | a posted run: evidence table and the *no model calls* line |
| `held-run.png` | a held run: the reason, the evidence and the actions |

## Refresh them

```bash
npm run build
PORT=3000 node apps/demo/build/index.js --fresh &
chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --window-size=1280,1000 --virtual-time-budget=3000 \
  --screenshot=docs/media/queue.png http://127.0.0.1:3000/
```

Then capture a run detail. The ids are stable for a given fixture set:

```bash
curl -s http://127.0.0.1:3000/api/runs
chromium ... --screenshot=docs/media/run-detail.png http://127.0.0.1:3000/run/<posted-id>
chromium ... --screenshot=docs/media/held-run.png  http://127.0.0.1:3000/run/<held-id>
```

Stop the server when done. State is under `var/`.

## Optional: a short recording

A GIF is optional. If you want one, record a screencast of the flow and convert it:

1. Start at the queue.
2. Open `clean-order.pdf`, show the evidence table and the zero-model-calls line.
3. Open `vague-line.pdf`, accept it, and show the posted record.

Keep it under 90 seconds. `docs/media/demo.gif` is the name the README would use.
