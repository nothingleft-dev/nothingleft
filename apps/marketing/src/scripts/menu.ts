export function initMenu(): void {
  const menuBtn = document.getElementById('menu-btn');
  const menu = document.getElementById('menu');
  if (!menuBtn || !menu) return;

  const setOpen = (open: boolean) => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('open', open);
  };
  menuBtn.addEventListener('click', () => setOpen(menuBtn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });
}
