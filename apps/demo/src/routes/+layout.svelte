<script lang="ts">
  import "../app.css";
  let { children } = $props();
</script>

<header class="site">
  <a class="wordmark" href="/">document-intake</a>
  <span class="tagline">a person in front of anything uncertain</span>
</header>

<main>
  {@render children()}
</main>
