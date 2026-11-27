import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { STAFF_ROLES, WORKSPACE_ROLES } from '../lib/constants.js';
import ProtectedRoute from './ProtectedRoute.jsx';

let auth = {};
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => auth }));

// Server rendering warns that <Navigate>'s layout effect does nothing; that is expected here.
const realError = console.error;
beforeAll(() => {
  vi.spyOn(console, 'error').mockImplementation((msg, ...rest) => {
    if (!String(msg).includes('useLayoutEffect does nothing on the server')) realError(msg, ...rest);
  });
});
afterAll(() => vi.restoreAllMocks());

/**
 * The /app tree as App.jsx nests it: a contractor-open page, a project tab, a staff-only page, and a page added
 * without a staff guard (the contractor allowlist still keeps it closed).
 */
function render(role, path) {
  auth = { loading: false, isAuthenticated: true, role };
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/app" element={<ProtectedRoute roles={WORKSPACE_ROLES} />}>
          <Route index element={<p>DASHBOARD</p>} />
          <Route path="projects/:id/progress" element={<p>PROGRESS</p>} />
          <Route element={<ProtectedRoute roles={STAFF_ROLES} />}>
            <Route path="map" element={<p>MAP</p>} />
          </Route>
          <Route path="unlisted" element={<p>UNLISTED</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute in /app', () => {
  it('opens the dashboard and the project tabs to a contractor', () => {
    expect(render('contractor', '/app')).toContain('DASHBOARD');
    expect(render('contractor', '/app/projects/p1/progress')).toContain('PROGRESS');
  });
  it('does not render staff-only pages for a contractor (it is sent to its dashboard)', () => {
    expect(render('contractor', '/app/map')).not.toContain('MAP');
    expect(render('contractor', '/app/unlisted')).not.toContain('UNLISTED');
  });
  it('keeps staff pages open to staff', () => {
    for (const role of STAFF_ROLES) {
      expect(render(role, '/app/map')).toContain('MAP');
      expect(render(role, '/app/unlisted')).toContain('UNLISTED');
    }
  });
  it('keeps PACC and accounts without a role out of /app', () => {
    expect(render('pacc', '/app')).not.toContain('DASHBOARD');
    expect(render(null, '/app')).not.toContain('DASHBOARD');
  });
});
