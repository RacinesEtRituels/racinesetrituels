// Footer loader: fetches components/footer.html and injects into #site-footer
document.addEventListener('DOMContentLoaded', async () => {
  const placeholder = document.getElementById('site-footer');
  // Déjà présent dans la page (scripts/inline-components.mjs) : ses scripts ont tourné
  if (!placeholder || placeholder.firstElementChild) return;

  try {
    const res = await fetch('/components/footer.html');
    if (!res.ok) throw new Error('footer fetch failed: ' + res.status);
    const html = await res.text();

    // Insert HTML and ensure any inline scripts run
    const tmp = document.createElement('div');
    tmp.innerHTML = html;

    // Move non-script nodes
    Array.from(tmp.childNodes).forEach(node => {
      if (node.tagName && node.tagName.toLowerCase() === 'script') return;
      placeholder.appendChild(node.cloneNode(true));
    });

    // Execute scripts manually
    Array.from(tmp.querySelectorAll('script')).forEach(s => {
      const ns = document.createElement('script');
      if (s.src) ns.src = s.src;
      if (s.type) ns.type = s.type;
      ns.textContent = s.textContent;
      document.body.appendChild(ns);
    });

  } catch (err) {
    console.error('Failed to load footer component:', err);
  }
});
