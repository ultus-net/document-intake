<script lang="ts">
  import { invalidateAll } from "$app/navigation";

  let { data } = $props();

  const run = $derived(data.run);
  const events = $derived(data.events);
  const shortCircuit = $derived(events.some((event) => event.event === "decide.shortcircuit"));
  const evidence = $derived(run.decision?.evidence ?? []);
  const fields = $derived(
    evidence.filter((entry) => entry.field.startsWith("field:") || entry.field === "customer:account"),
  );
  const lines = $derived(evidence.filter((entry) => entry.field.startsWith("line:")));
  const correctable = $derived(Object.keys(run.extracted?.fields ?? {}));

  let confirming = $state<"" | "accept" | "reject">("");
  let corrections = $state<Record<string, string>>({});
  let busy = $state(false);
  let failure = $state("");

  async function send(path: string, body: unknown): Promise<void> {
    busy = true;
    failure = "";
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        failure = payload.message ?? `request failed (${response.status})`;
        return;
      }
      confirming = "";
      corrections = {};
      await invalidateAll();
    } finally {
      busy = false;
    }
  }

  function acceptAsIs(): Promise<void> {
    return send(`/api/runs/${run.id}/accept`, { corrections: [] });
  }

  function reject(): Promise<void> {
    return send(`/api/runs/${run.id}/reject`, {});
  }

  function correctAndAccept(field: string): Promise<void> {
    const value = corrections[field] ?? "";
    return send(`/api/runs/${run.id}/accept`, { corrections: [{ field, value }] });
  }
</script>

<svelte:head>
  <title>{run.document?.filename ?? "Run"} · document-intake</title>
</svelte:head>

<p><a href="/">← Review queue</a></p>

<h1>
  {run.document?.filename ?? "Run"}
  <span class={`badge badge--${run.decision?.outcome ?? "neutral"}`}>
    {run.decision?.outcome ?? "duplicate"}
  </span>
</h1>

<p class="muted mono">run {run.id} · correlation {run.correlationId}</p>

{#if shortCircuit}
  <div class="fact">
    <strong>no model calls</strong>
    <span class="muted">
      every line matched the catalogue, so the gates cleared without a judgement call.
    </span>
  </div>
{/if}

<h2>Decision</h2>

<div class="panel">
  {#if run.decision}
    <ul class="reasons">
      {#each run.decision.reasons as reason}
        <li>{reason}</li>
      {/each}
    </ul>
  {:else}
    <p class="muted">This run has no decision yet.</p>
  {/if}
</div>

{#if run.decision?.outcome === "review"}
  <h2>Resolve</h2>
  <div class="panel">
    {#if failure}
      <p class="error">{failure}</p>
    {/if}
    <div class="actions">
      {#if confirming === "accept"}
        <button class="primary" disabled={busy} onclick={acceptAsIs}>Confirm accept</button>
        <button disabled={busy} onclick={() => (confirming = "")}>Cancel</button>
      {:else if confirming === "reject"}
        <button class="danger" disabled={busy} onclick={reject}>Confirm reject</button>
        <button disabled={busy} onclick={() => (confirming = "")}>Cancel</button>
      {:else}
        <button class="primary" onclick={() => (confirming = "accept")}>Accept as is</button>
        <button class="danger" onclick={() => (confirming = "reject")}>Reject</button>
      {/if}
    </div>
    <p class="muted">
      Accepting records the person's decision as evidence. Validity gates still apply, so a
      rejected document cannot be accepted.
    </p>
  </div>
{/if}

<h2>Evidence</h2>

<table>
  <thead>
    <tr>
      <th>Field</th>
      <th>Value</th>
      <th>Source</th>
      <th>Rule</th>
    </tr>
  </thead>
  <tbody>
    {#each fields as entry (entry.field)}
      <tr>
        <td class="mono">{entry.field.replace(/^field:/, "")}</td>
        <td>{String(entry.value)}</td>
        <td class="mono">{entry.source}</td>
        <td>{entry.rule ?? ""}</td>
      </tr>
    {/each}
    {#each lines as entry (entry.field)}
      <tr>
        <td class="mono">{entry.field}</td>
        <td>{String(entry.value)}</td>
        <td class="mono">{entry.source}</td>
        <td>{entry.rule ?? ""}</td>
      </tr>
    {/each}
  </tbody>
</table>

{#if run.decision?.outcome === "review" && correctable.length > 0}
  <h2>Correct a field</h2>
  <div class="panel">
    <p class="muted">Correct one value, then accept. The correction is evidence, not a bypass.</p>
    {#each correctable as field (field)}
      <div class="actions">
        <label for={`correct-${field}`} class="mono">{field}</label>
        <input
          id={`correct-${field}`}
          type="text"
          value={corrections[field] ?? ""}
          oninput={(event) => (corrections[field] = event.currentTarget.value)}
        />
        <button disabled={busy || !(corrections[field] ?? "").trim()} onclick={() => correctAndAccept(field)}>
          Correct and accept
        </button>
      </div>
    {/each}
  </div>
{/if}

<h2>Timeline</h2>

<ul class="timeline">
  {#each events as event (event.seq)}
    <li>
      <span class="mono">{event.ts}</span>
      <span class="stage">{event.stage}</span>
      <span>
        <span class="mono">{event.event}</span>
        <span class="muted"> · {event.summary}</span>
      </span>
    </li>
  {/each}
</ul>

{#if Object.keys(corrections).length > 0 && run.decision?.outcome !== "review"}
  <p class="muted">This run is resolved; corrections are no longer accepted.</p>
{/if}
