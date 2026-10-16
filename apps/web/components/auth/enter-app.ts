// A document navigation, not router.replace: while signed out the client router cached the
// proxy's redirects to /sign-in for every prefetched guarded link, and would replay them.
export function enterApp(path: string) {
  window.location.replace(path);
}
