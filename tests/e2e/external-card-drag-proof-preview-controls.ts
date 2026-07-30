export function getProofActiveElement(): string | undefined {
  return (
    document.activeElement?.getAttribute('data-proof-title') ??
    document.activeElement?.getAttribute('data-proof-link') ??
    document.activeElement?.getAttribute('data-proof-input') ??
    document.activeElement?.getAttribute('data-proof-tab-index') ??
    undefined
  );
}

export function clickProofPreviewControls(): void {
  document
    .querySelectorAll<HTMLElement>(
      '[data-external-card-preview] [data-proof-title], [data-external-card-preview] [data-proof-link], [data-external-card-preview] [data-proof-input], [data-external-card-preview] [data-proof-tab-index]'
    )
    .forEach((element) => {
      element.click();
    });
}
