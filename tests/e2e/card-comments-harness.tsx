import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CardComments } from '../../src/components/CardComments';

const rootElement = document.querySelector('#root');
if (rootElement === null) {
  throw new Error('Expected test harness root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <CardComments comments={[]} onCommentsChange={() => undefined} />
    <CardComments comments={[]} onCommentsChange={() => undefined} />
  </StrictMode>
);
