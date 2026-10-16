import { track } from '@lib/analytics';

// The cover stays up until the first frame plays, so a slow start shows the poster rather than a black box.
export function initWalkthrough(): void {
  const root = document.getElementById('walk');
  const video = document.getElementById('walk-video');
  const cover = document.getElementById('walk-play');
  if (!root || !(video instanceof HTMLVideoElement) || !cover) return;

  cover.addEventListener('click', () => {
    root.dataset.state = 'loading';
    video.play().catch(() => {
      root.dataset.state = 'idle';
    });
    track({ name: 'walkthrough_played' });
  });

  video.addEventListener(
    'playing',
    () => {
      root.dataset.state = 'playing';
      video.controls = true;
      video.focus({ preventScroll: true });
    },
    { once: true },
  );
}
