import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient.js', () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'signed-in-token' } } })) } },
}));

const { api } = await import('./api.js');
const { supabase } = await import('./supabaseClient.js');

const ok = () => new Response(JSON.stringify({ data: { tracking_code: 'K7Q4M-2XDPA' } }), { status: 201, headers: { 'content-type': 'application/json' } });

describe('api request headers', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    supabase.auth.getSession.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the sign-in token by default', async () => {
    await api.get('/projects');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer signed-in-token');
  });

  it('anonymous: true sends no Authorization header and does not read the session, even when signed in', async () => {
    const body = new FormData();
    body.append('category', 'other');
    await api.post('/public/projects/abc/reports', body, { anonymous: true });
    await api.post('/public/reports/status', { code: 'K7Q4M-2XDPA' }, { anonymous: true });
    for (const [, init] of fetchMock.mock.calls) {
      expect(Object.keys(init.headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    }
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('anonymous requests still return the parsed body', async () => {
    const res = await api.post('/public/reports/status', { code: 'K7Q4M-2XDPA' }, { anonymous: true });
    expect(res).toEqual({ data: { tracking_code: 'K7Q4M-2XDPA' } });
  });

  it('a JSON body is sent as JSON and the URL stays as given', async () => {
    await api.post('/public/reports/status', { code: 'K7Q4M-2XDPA' }, { anonymous: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/public/reports/status');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ code: 'K7Q4M-2XDPA' });
  });
});
