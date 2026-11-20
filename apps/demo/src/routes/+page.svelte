<script lang="ts">
  let { data, form } = $props();
  const order = { review: 0, auto: 1, reject: 2 } as const;
  const runs = $derived(
    [...data.runs].sort(
      (a, b) =>
        (order[(a.outcome ?? "reject") as keyof typeof order] ?? 9) -
        (order[(b.outcome ?? "reject") as keyof typeof order] ?? 9),
    ),
  );
</script>

<svelte:head>
  <title>Review queue · document-intake</title>
</svelte:head>

<h1>Review queue</h1>

<div class="stats">
  <div class="stat">
    <div class="value">{data.counts.review}</div>
    <div class="label">Held for a person</div>
  </div>
  <div class="stat">
    <div class="value">{data.counts.auto}</div>
    <div class="label">Posted with an audit</div>
  </div>
  <div class="stat">
    <div class="value">{data.counts.reject}</div>
    <div class="label">Rejected</div>
  </div>
  <div class="stat">
    <div class="value">{data.recordCount}</div>
    <div class="label">Records posted</div>
  </div>
</div>

<h2>Runs</h2>

<table>
  <thead>
    <tr>
      <th>Document</th>
      <th>Outcome</th>
      <th>Reason</th>
      <th>Stage</th>
    </tr>
  </thead>
  <tbody>
    {#each runs as run (run.id)}
      <tr>
        <td><a href={`/run/${run.id}`}>{run.document}</a></td>
        <td>
          <span class={`badge badge--${run.outcome ?? "neutral"}`}>{run.outcome ?? "unknown"}</span>
          {#if run.outcome === "auto"}
            <span class="badge badge--audit">audit</span>
          {/if}
        </td>
        <td>
          {#if run.reasons.length > 0}
            {run.reasons.join("; ")}
          {:else}
            <span class="muted">none</span>
          {/if}
        </td>
        <td class="mono">{run.stage}</td>
      </tr>
    {/each}
  </tbody>
</table>

{#if runs.some((run) => run.outcome === "review")}
  <p class="muted">Open a held run to see its evidence, correct a field, accept or reject it.</p>
{/if}

<h2>Replay</h2>

<div class="panel">
  <p class="muted">
    Re-drain the same inbox. Every document is already known, so each one adds a duplicate event
    and no second record.
  </p>
  <form method="POST" action="?/drain">
    <button class="primary" type="submit">Drain the inbox again</button>
  </form>
  {#if form && typeof form.duplicates === "number"}
    <p>
      Processed {form.processed}, saw {form.duplicates} duplicate documents.
      {#if data.duplicates > 0}
        <span class="badge badge--duplicate">{data.duplicates} duplicate events in the log</span>
      {/if}
    </p>
  {/if}
</div>
