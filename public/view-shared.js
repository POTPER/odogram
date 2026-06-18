export function disableContextMenu() {
  document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  }, { capture: true });
}
