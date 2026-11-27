// 360° photos are public as soon as DPWH personnel upload them: no one approves or hides them.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import request from 'supertest';

const ID = '9f343767-8d98-5863-903c-3bc97288d015';
let app;
before(async () => {
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'; // unreachable on purpose
  process.env.SUPABASE_ANON_KEY = 'test-anon';
  process.env.SUPABASE_SERVICE_ROLE_KEY = '';
  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('360° photo visibility', () => {
  it('there is no route to show or hide a photo from the public any more', async () => {
    const { default: imagesRouter } = await import('../routes/images.js');
    const routes = imagesRouter.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods).join(',')} ${l.route.path}`);
    assert.ok(routes.includes('post /projects/:id/images'), routes.join(' | ')); // upload still there
    assert.equal(routes.some((r) => r.endsWith('/public')), false, routes.join(' | '));
  });
  it('a request to the old show/hide address is refused before it reaches any handler', async () => {
    const res = await request(app).patch(`/api/projects/${ID}/images/${ID}/public`).send({ is_public: false });
    assert.ok([401, 404].includes(res.status), String(res.status));
  });
  it('the controller no longer exports a show/hide handler', async () => {
    const images = await import('../controllers/imagesController.js');
    assert.equal(images.setImagePublic, undefined);
  });
});
