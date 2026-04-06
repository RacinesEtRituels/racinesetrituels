// Simple header loader: fetches components/header.html and injects it into #site-header
async function loadHeader() {
  const placeholder = document.getElementById('site-header');
  if (!placeholder) {
    console.error('Header placeholder #site-header not found in DOM');
    return;
  }

  try {
    const headerPath = '/components/header.html';
    console.log('[header-loader] fetching header from:', headerPath);
    const res = await fetch(headerPath);
    if (!res.ok) {
      console.error(`Failed to fetch header: ${res.status} ${res.statusText}. URL attempted: ${headerPath}`);
      return;
    }
    const html = await res.text();
    placeholder.innerHTML = html;
    console.log('[header-loader] header injected, placeholder innerHTML length:', placeholder.innerHTML.length);

    // Attach mobile menu toggle if present
    const btn = placeholder.querySelector('#mobileMenuBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        document.body.classList.toggle('nav-open');
      });
    }

    // Ensure cart badge exists in injected header (create if missing)
    let badge = document.getElementById('cart-count') || placeholder.querySelector('#cart-count');
    if (!badge) {
      const cartLink = placeholder.querySelector('a[href="panier.html"], a[href="./panier.html"]');
      if (cartLink) {
        // ensure parent is positioned for absolute badge
        cartLink.classList.add('relative');
        badge = document.createElement('span');
        badge.id = 'cart-count';
        badge.className = 'absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center hidden';
        badge.textContent = '0';
        cartLink.appendChild(badge);
        console.warn('[header-loader] cart badge was missing; created dynamically');
      } else {
        console.warn('[header-loader] cart link not found in injected header; cannot insert badge');
      }
    }

    // Initialize cart badge on page load
    updateCartBadge();

    // Listen for cart updates (from cart.js) and storage events (other tabs)
    window.addEventListener('rr-cart-updated', () => {
      updateCartBadge();
    });
    window.addEventListener('storage', (e) => {
      if (e.key === 'rr_cart') updateCartBadge();
    });
  } catch (err) {
    console.error('Failed to load header component:', err);
  }
}

function updateCartBadge() {
  try {
    const badge = document.getElementById('cart-count');
    if (!badge) return;

    const raw = localStorage.getItem('rr_cart');
    if (!raw) {
      badge.textContent = '0';
      badge.classList.add('hidden');
      return;
    }

    let cart;
    try { cart = JSON.parse(raw); } catch (e) {
      badge.textContent = '0';
      badge.classList.add('hidden');
      return;
    }

    if (!Array.isArray(cart)) {
      badge.textContent = '0';
      badge.classList.add('hidden');
      return;
    }

    const count = cart.reduce((sum, item) => sum + Number(item.qty || item.quantity || 1), 0);
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  } catch (e) {
    console.error('Failed to update cart badge:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadHeader);
} else {
  loadHeader();
}
