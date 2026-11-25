import { Router } from 'express';
import * as users from '../controllers/usersController.js';
import { requireAuth } from '../middleware/auth.js';
import { requireApproved, requireRole, requireWriteAccess, ROLES } from '../middleware/role.js';
import { uploadAvatar } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler as h } from '../utils/asyncHandler.js';
import { uuidParams } from './params.js';
import * as s from './schemas.js';

const r = Router();
uuidParams(r, 'userId');
const admin = requireRole(ROLES.ADMIN);

// Current user (any signed-in account, including pending applicants)
r.get('/me', requireAuth, h(users.me));
r.patch('/me', requireAuth, requireWriteAccess, validate(s.meUpdate), h(users.updateMe));
r.post('/me/avatar', requireAuth, requireApproved, requireWriteAccess, uploadAvatar, h(users.uploadMyAvatar));
r.delete('/me/avatar', requireAuth, requireWriteAccess, h(users.deleteMyAvatar));

// User management and staff access requests (System Administrator)
r.get('/users', admin, requireWriteAccess, h(users.listUsers));
r.post('/users', admin, requireWriteAccess, validate(s.userCreate), h(users.createUser));
r.patch('/users/:userId', admin, requireWriteAccess, validate(s.userUpdate), h(users.updateUser));
r.post('/users/:userId/approve', admin, requireWriteAccess, validate(s.userApprove), h(users.approveUser));
r.post('/users/:userId/reject', admin, requireWriteAccess, validate(s.userReject), h(users.rejectUser));
r.delete('/users/:userId', requireAuth, admin, requireWriteAccess, h(users.deleteUser));
r.post('/users/:userId/suspend', requireAuth, admin, requireWriteAccess, validate(s.userSuspend), h(users.suspendUser));
r.post('/users/:userId/unsuspend', requireAuth, admin, requireWriteAccess, h(users.unsuspendUser));

export default r;
