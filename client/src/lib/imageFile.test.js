import { describe, expect, it } from 'vitest';
import { checkAvatarFile, friendlyAuthError } from './imageFile.js';

describe('checkAvatarFile', () => {
  it('accepts JPG, PNG and WebP up to 2 MB', () => {
    expect(checkAvatarFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(checkAvatarFile({ type: 'image/webp', size: 2 * 1024 * 1024 })).toBeNull();
  });
  it('rejects other types and oversize files', () => {
    expect(checkAvatarFile({ type: 'application/pdf', size: 10 })).toMatch(/JPG, PNG or WebP/);
    expect(checkAvatarFile({ type: 'image/png', size: 3 * 1024 * 1024 })).toMatch(/2 MB/);
    expect(checkAvatarFile(null)).toMatch(/Choose a photo/);
  });
});

describe('friendlyAuthError', () => {
  it('explains email rate limits', () => {
    expect(friendlyAuthError('email rate limit exceeded')).toMatch(/about an hour/);
  });
  it('explains rejected email addresses', () => {
    expect(friendlyAuthError('Email address "x@gmail.com" is invalid')).toMatch(/rejected this email address/);
  });
  it('passes other messages through', () => {
    expect(friendlyAuthError('Something else')).toBe('Something else');
  });
});
