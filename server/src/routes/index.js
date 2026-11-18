import { Router } from 'express';
import { adminClient } from '../config/supabase.js';
import admin from './admin.js';
import agencies from './agencies.js';
import contractors from './contractors.js';
import projects from './projects.js';

const api = Router();

api.get('/health', (_req, res) => res.json({ status: 'ok', week: 1, writes: Boolean(adminClient), time: new Date().toISOString() }));

api.use('/', agencies); // /reference (public, used by the sign-up form), /agencies
api.use('/projects', projects);
api.use('/contractors', contractors);
api.use('/', admin); // /me, /users

export default api;
