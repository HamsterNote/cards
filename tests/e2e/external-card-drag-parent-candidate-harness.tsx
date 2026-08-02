import { Profiler, StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useExternalCardDragParentCandidates } from '../../src/components/useExternalCardDragParentCandidates';

type CandidateApi = {
  readonly publishAcrossTasks: () => Promise<void>;
  readonly renders: () => number;
};

declare global {
  interface Window {
    __externalCandidateHarness: CandidateApi | undefined;
  }
}

export async function installExternalCandidateHarness(): Promise<void> {
  document.body.replaceChildren();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let renderCount = 0;
  let publish: (() => Promise<void>) | undefined;
  let resolveReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  function Harness() {
    const sessionRef = useRef({
      card: { id: 'candidate' },
      parentCandidateId: undefined as string | undefined,
    });
    const { parentCandidateIds, setSessionCandidate } =
      useExternalCardDragParentCandidates();
    publish = async () => {
      for (const delay of [1, 2, 3]) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
        setSessionCandidate(sessionRef.current, 'parent');
      }
    };
    resolveReady?.();
    return (
      <Profiler id="candidate" onRender={() => (renderCount += 1)}>
        <output data-parent-ids={[...parentCandidateIds].join(',')} />
      </Profiler>
    );
  }

  root.render(
    <StrictMode>
      <Harness />
    </StrictMode>
  );
  await ready;
  window.__externalCandidateHarness = {
    publishAcrossTasks: async () => publish?.(),
    renders: () => renderCount,
  };
}
