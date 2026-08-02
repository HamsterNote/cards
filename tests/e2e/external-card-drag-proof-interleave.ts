export function interleaveProofCardMovement(
  host: HTMLElement,
  endExternal: () => void,
  order: 'ordinary-first' | 'external-first'
): void {
  const header = host.querySelector<HTMLElement>(
    '[data-card-id="ordinary"] .cards-card-canvas__card-header'
  );
  if (header === null) throw new Error('Missing ordinary card');
  const moveOrdinary = () => {
    header.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 120,
        clientY: 120,
        pointerId: 902,
      })
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 140,
        clientY: 140,
        pointerId: 902,
      })
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: 140,
        clientY: 140,
        pointerId: 902,
      })
    );
  };
  if (order === 'ordinary-first') moveOrdinary();
  else endExternal();
  if (order === 'ordinary-first') endExternal();
  else moveOrdinary();
}
