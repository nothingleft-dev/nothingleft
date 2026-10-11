export function initMenu(): void {
  const menuBtn = document.getElementById('menu-btn');
  const menu = document.getElementById('menu');
  if (!menuBtn || !menu) return;

  const isOpen = () => menuBtn.getAttribute('aria-expanded') === 'true';
  const setOpen = (open: boolean) => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('open', open);
  };
  menuBtn.addEventListener('click', () => setOpen(!isOpen()));
  menu.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen()) return;
    const focusWasInside = menu.contains(document.activeElement);
    setOpen(false);
    if (focusWasInside) menuBtn.focus();
  });
  document.addEventListener('click', event => {
    if (!isOpen() || !(event.target instanceof Node)) return;
    if (!menu.contains(event.target) && !menuBtn.contains(event.target)) setOpen(false);
  });
}
