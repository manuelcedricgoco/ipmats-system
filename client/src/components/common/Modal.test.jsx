import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Server rendering has no document: render the portal's content in place.
vi.mock('react-dom', async (importOriginal) => ({ ...(await importOriginal()), createPortal: (node) => node }));
vi.stubGlobal('document', { body: {} });
afterAll(() => vi.unstubAllGlobals());
const { default: Modal } = await import('./Modal.jsx');

describe('Modal', () => {
  it('has a corner close button by default', () => {
    expect(renderToStaticMarkup(<Modal open title="T" onClose={() => {}}>x</Modal>)).toContain('aria-label="Close"');
  });
  it('dismissible={false} has no corner close button, only the footer', () => {
    const html = renderToStaticMarkup(<Modal open dismissible={false} title="T" onClose={() => {}} footer={<button type="button">Done</button>}>x</Modal>);
    expect(html).not.toContain('aria-label="Close"');
    expect(html).toContain('>Done</button>');
  });
});
