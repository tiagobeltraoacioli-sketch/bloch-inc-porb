(() => {
  const header = document.querySelector('.masthead');
  const desktop = header?.querySelector('nav');
  if (!header || !desktop) return;

  const current = new URL(window.location.href).pathname.split('/').pop() || 'index.html';
  desktop.querySelectorAll('a').forEach(link => {
    const page = new URL(link.href, window.location.href).pathname.split('/').pop() || 'index.html';
    if (page === current && new URL(link.href, window.location.href).origin === window.location.origin) {
      link.setAttribute('aria-current', 'page');
    }
  });

  const toggle = document.createElement('button');
  toggle.className = 'brand-menu-toggle';
  toggle.type = 'button';
  toggle.textContent = 'Menu';
  toggle.setAttribute('aria-controls', 'brand-mobile-nav');
  toggle.setAttribute('aria-expanded', 'false');

  const mobile = desktop.cloneNode(true);
  mobile.id = 'brand-mobile-nav';
  mobile.className = 'mobile-brand-nav';
  mobile.setAttribute('aria-label', 'Mobile navigation');
  mobile.hidden = true;
  header.append(toggle, mobile);

  const close = () => {
    toggle.setAttribute('aria-expanded', 'false');
    mobile.hidden = true;
  };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    mobile.hidden = open;
  });
  mobile.addEventListener('click', event => {
    if (event.target.closest('a')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
  });
  window.matchMedia('(min-width: 1051px)').addEventListener('change', event => {
    if (event.matches) close();
  });
})();
