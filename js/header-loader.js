// Simple header loader: fetches components/header.html and injects it into #site-header
document.addEventListener('DOMContentLoaded', async () => {
  const placeholder = document.getElementById('site-header');
  if (!placeholder) return;

  try {
    const res = await fetch('components/header.html');
    if (!res.ok) throw new Error('header fetch failed: ' + res.status);
    const html = await res.text();
    placeholder.innerHTML = html;

    // Optional: attach mobile menu toggle if present
    const btn = placeholder.querySelector('#mobileMenuBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('nav-open');
      });
    }
  } catch (err) {
    console.error('Failed to load header component:', err);
  }
});
