/** A more useful wheel step on long TV screens, including Magic Remote. */
export function installWheelScroll() {
  const main = document.getElementById('main');
  if (!main) return;
  main.addEventListener('wheel', event => {
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || event.shiftKey ||
      !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    // WheelEvent can report pixels, text lines or whole pages, depending on
    // the remote/browser. Normalize first so those inputs feel consistent.
    const line = parseFloat(getComputedStyle(main).lineHeight) ||
      parseFloat(getComputedStyle(main).fontSize) * 1.4;
    const unit = event.deltaMode === 1 ? line : event.deltaMode === 2 ? main.clientHeight : 1;
    const pixels = event.deltaY * unit * 2.25;
    event.preventDefault();

    // Respect nested scroll areas (for example a long film synopsis), then
    // continue with the main page when that area reaches its boundary.
    let target = event.target instanceof HTMLElement ? event.target : main;
    while (main.contains(target)) {
      const style = getComputedStyle(target);
      const canScroll = pixels > 0 ? target.scrollTop + target.clientHeight < target.scrollHeight - 1 : target.scrollTop > 0;
      if (canScroll && /auto|scroll/.test(style.overflowY)) {
        const step = Math.min(Math.abs(pixels), target.clientHeight * .75);
        target.scrollTop += Math.sign(pixels) * step;
        return;
      }
      if (target === main || !target.parentElement) return;
      target = target.parentElement;
    }
  }, { passive: false });
}
