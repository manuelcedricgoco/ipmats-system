/**
 * WEEK 3 — Sample 360° panorama maker (for tests and demo data only).
 * Draws a 2:1 equirectangular placeholder labelled "SAMPLE – NOT A REAL PHOTO" and
 * writes GPS coordinates and the capture date into the JPEG's EXIF, like a real 360° camera.
 */
import piexif from 'piexifjs';
import sharp from 'sharp';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function svg({ width, height, title, subtitle, tag, progress = 0, seed = 1 }) {
  const W = width;
  const H = height;
  const rnd = (i) => (Math.sin(seed * 97 + i * 13.7) + 1) / 2;
  const ridge = `M0 ${H * 0.5} ` + Array.from({ length: 25 }, (_, i) => `L${((i + 1) / 24) * W} ${H * (0.36 + rnd(i) * 0.1)}`).join(' ') + ` L${W} ${H * 0.5} Z`;
  const trees = Array.from({ length: 30 }, (_, i) => {
    const x = (i / 30) * W + rnd(i + 50) * 40;
    const s = 18 + rnd(i + 99) * 26;
    return `<g transform="translate(${x.toFixed(0)} ${H / 2})"><rect x="-3" y="-${(s * 0.6).toFixed(0)}" width="6" height="${(s * 0.6).toFixed(0)}" fill="#5b4632"/><circle cx="0" cy="-${(s * 0.9).toFixed(0)}" r="${(s * 0.5).toFixed(0)}" fill="#3f6b3a"/></g>`;
  }).join('');
  const done = Math.max(0.04, Math.min(1, progress / 100));
  const label = (x, line1) => `
    <g transform="translate(${x} ${H * 0.3})">
      <rect x="-230" y="-62" width="460" height="124" rx="14" fill="#0b1f3a" fill-opacity="0.8"/>
      <text x="0" y="-22" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">${esc(line1)}</text>
      <text x="0" y="10" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" fill="#e3ecf7" text-anchor="middle">${esc(subtitle)}</text>
      <text x="0" y="40" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#f2c94c" text-anchor="middle">${esc(tag)}</text>
    </g>`;
  const compass = ['N', 'E', 'S', 'W'].map((d, i) => `<text x="${(i * W) / 4 + W / 8}" y="${H * 0.12}" font-family="DejaVu Sans, Arial" font-size="40" font-weight="700" fill="#ffffff" fill-opacity="0.9" text-anchor="middle">${d}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6fb3"/><stop offset="0.75" stop-color="#9cc9ee"/><stop offset="1" stop-color="#e6f2fb"/></linearGradient>
    <linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a7a5a"/><stop offset="1" stop-color="#4a3f2c"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H / 2}" fill="url(#sky)"/>
  <path d="${ridge}" fill="#5c7c8a" fill-opacity="0.85"/>
  <rect y="${H / 2}" width="${W}" height="${H / 2}" fill="url(#gnd)"/>
  ${trees}
  <rect x="0" y="${H * 0.66}" width="${W}" height="${H * 0.12}" fill="#6b5a40"/>
  <rect x="0" y="${H * 0.67}" width="${(W * done).toFixed(0)}" height="${H * 0.1}" fill="#b9b2a5"/>
  ${compass}
  ${label(W / 8, 'SAMPLE – NOT A REAL PHOTO')}
  ${label((3 * W) / 8, title)}
  ${label((5 * W) / 8, 'IPMATS · DPWH 360°')}
  ${label((7 * W) / 8, 'SAMPLE – NOT A REAL PHOTO')}
</svg>`;
}

const toRational = (deg) => {
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = Math.floor((a - d) * 60);
  const s = Math.round(((a - d) * 60 - m) * 60 * 1000);
  return [[d, 1], [m, 1], [s, 1000]];
};

/**
 * @param {object} o  { title, subtitle, tag, progress, seed, latitude, longitude, capturedAt ('YYYY-MM-DD HH:MM:SS' local PH time), width }
 * @returns {Promise<Buffer>} JPEG with EXIF GPS + DateTimeOriginal
 */
export async function makePanorama({ title, subtitle = '', tag = '', progress = 0, seed = 1, latitude, longitude, capturedAt, width = 2048 }) {
  const height = width / 2;
  const jpeg = await sharp(Buffer.from(svg({ width, height, title, subtitle, tag, progress, seed }))).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  const exif = { '0th': { [piexif.ImageIFD.Make]: 'IPMATS sample', [piexif.ImageIFD.Model]: 'Generated placeholder' }, Exif: {}, GPS: {} };
  if (capturedAt) {
    const stamp = capturedAt.replace(/-/g, ':');
    exif.Exif[piexif.ExifIFD.DateTimeOriginal] = stamp;
    exif.Exif[piexif.ExifIFD.DateTimeDigitized] = stamp;
  }
  if (latitude != null && longitude != null) {
    exif.GPS[piexif.GPSIFD.GPSLatitudeRef] = latitude >= 0 ? 'N' : 'S';
    exif.GPS[piexif.GPSIFD.GPSLatitude] = toRational(latitude);
    exif.GPS[piexif.GPSIFD.GPSLongitudeRef] = longitude >= 0 ? 'E' : 'W';
    exif.GPS[piexif.GPSIFD.GPSLongitude] = toRational(longitude);
  }
  const withExif = piexif.insert(piexif.dump(exif), jpeg.toString('binary'));
  return Buffer.from(withExif, 'binary');
}
