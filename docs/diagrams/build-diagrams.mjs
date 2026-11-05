#!/usr/bin/env node
/**
 * Generates the architecture diagrams as SVG (source of truth, renders on GitHub) and PNG
 * (for the Word/PDF submission) from code, so they stay consistent and reviewable in diffs.
 *
 *   node docs/diagrams/build-diagrams.mjs            # SVG only
 *   node docs/diagrams/build-diagrams.mjs --png      # SVG + PNG (needs Google Chrome)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const C = {
  person: '#0B2A5B',
  system: '#0F5BD8',
  container: '#1D6FE8',
  store: '#0A7D74',
  external: '#6B7280',
  future: '#FFFFFF',
  line: '#475467',
  text: '#101828',
  muted: '#475467',
  group: '#F2F6FC',
  groupStroke: '#9DB7E6',
  note: '#FFF8E6',
  noteStroke: '#E9C46A',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text, maxWidth, size) {
  const charW = size * 0.53;
  const maxChars = Math.max(8, Math.floor(maxWidth / charW));
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if ((line + ' ' + word).trim().length > maxChars && line) {
        lines.push(line);
        line = word;
      } else line = (line + ' ' + word).trim();
    }
    lines.push(line);
  }
  return lines;
}

function textBlock({ x, y, lines, size, weight = 400, fill, anchor = 'middle', lh = 1.3, italic = false }) {
  return lines
    .map(
      (l, i) =>
        `<text x="${x}" y="${y + i * size * lh}" font-family="${FONT}" font-size="${size}" font-weight="${weight}"${italic ? ' font-style="italic"' : ''} fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`,
    )
    .join('\n');
}

/** Box with title, optional [tag] line and wrapped body, vertically centred. */
function box({ x, y, w, h, fill, title, tag, body, stroke, dashed, dark = true, titleSize = 16, bodySize = 13, radius = 10 }) {
  const fg = dark ? '#FFFFFF' : C.text;
  const sub = dark ? 'rgba(255,255,255,0.82)' : C.muted;
  const titleLines = wrap(title, w - 24, titleSize);
  const tagLines = tag ? wrap(`[${tag}]`, w - 24, bodySize - 1) : [];
  const bodyLines = body ? wrap(body, w - 28, bodySize) : [];
  const total =
    titleLines.length * titleSize * 1.25 + tagLines.length * (bodySize - 1) * 1.3 + (bodyLines.length ? 8 : 0) + bodyLines.length * bodySize * 1.32;
  let cy = y + (h - total) / 2 + titleSize * 0.95;
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke ?? fill}" stroke-width="${stroke ? 1.6 : 0}"${dashed ? ' stroke-dasharray="7 5"' : ''}/>`,
  ];
  parts.push(textBlock({ x: x + w / 2, y: cy, lines: titleLines, size: titleSize, weight: 700, fill: fg, lh: 1.25 }));
  cy += titleLines.length * titleSize * 1.25;
  if (tagLines.length) {
    parts.push(textBlock({ x: x + w / 2, y: cy - 2, lines: tagLines, size: bodySize - 1, fill: sub, italic: true }));
    cy += tagLines.length * (bodySize - 1) * 1.3;
  }
  if (bodyLines.length) parts.push(textBlock({ x: x + w / 2, y: cy + 8, lines: bodyLines, size: bodySize, fill: sub, lh: 1.32 }));
  return parts.join('\n');
}

function person(o) {
  const cx = o.x + o.w / 2;
  return `<circle cx="${cx}" cy="${o.y - 6}" r="20" fill="${C.person}"/>\n` + box({ ...o, fill: C.person, radius: 18 });
}

function group({ x, y, w, h, label, sublabel }) {
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.group}" stroke="${C.groupStroke}" stroke-width="1.5" stroke-dasharray="8 5"/>`,
    `<text x="${x + 16}" y="${y + 26}" font-family="${FONT}" font-size="15" font-weight="700" fill="${C.system}">${esc(label)}</text>`,
    sublabel ? `<text x="${x + 16}" y="${y + 46}" font-family="${FONT}" font-size="12.5" fill="${C.muted}">${esc(sublabel)}</text>` : '',
  ].join('\n');
}

/** Labelled connector through the given points. Label sits on a white pill at `at` (0..1 along the path) or at an explicit point. */
function arrow({ pts, label, at = 0.5, labelAt, dashed, color = C.line, both = false, labelWidth = 190, size = 12.5 }) {
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const out = [
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"${both ? ' marker-start="url(#arrowStart)"' : ''}/>`,
  ];
  if (label) {
    let lx, ly;
    if (labelAt) [lx, ly] = labelAt;
    else {
      const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
      let target = segs.reduce((a, b) => a + b, 0) * at;
      for (let i = 0; i < segs.length; i++) {
        if (target <= segs[i] || i === segs.length - 1) {
          const t = segs[i] ? target / segs[i] : 0;
          lx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t;
          ly = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
          break;
        }
        target -= segs[i];
      }
    }
    const lines = wrap(label, labelWidth, size);
    const longest = Math.max(...lines.map((l) => l.length));
    const bw = Math.min(labelWidth + 16, longest * size * 0.53 + 16);
    const bh = lines.length * size * 1.3 + 8;
    out.push(`<rect x="${lx - bw / 2}" y="${ly - bh / 2}" width="${bw}" height="${bh}" rx="6" fill="#FFFFFF" stroke="#E3E7EE"/>`);
    out.push(textBlock({ x: lx, y: ly - bh / 2 + 4 + size, lines, size, fill: C.text }));
  }
  return out.join('\n');
}

function legend(x, y, items) {
  return items
    .map(([color, label, dashed], i) => {
      const lx = x + i * 230;
      return `<rect x="${lx}" y="${y}" width="22" height="16" rx="4" fill="${color}" stroke="${dashed ? C.line : color}"${dashed ? ' stroke-dasharray="4 3"' : ''}/>
<text x="${lx + 30}" y="${y + 13}" font-family="${FONT}" font-size="13" fill="${C.muted}">${esc(label)}</text>`;
    })
    .join('\n');
}

function svg(w, h, title, subtitle, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/></marker>
  <marker id="arrowStart" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/></marker>
</defs>
<rect width="${w}" height="${h}" fill="#FFFFFF"/>
<text x="40" y="48" font-family="${FONT}" font-size="26" font-weight="700" fill="${C.text}">${esc(title)}</text>
<text x="40" y="74" font-family="${FONT}" font-size="15" fill="${C.muted}">${esc(subtitle)}</text>
${content}
</svg>
`;
}

// ---------------------------------------------------------------------------------------------
// 1. System context
// ---------------------------------------------------------------------------------------------
function contextDiagram() {
  const W = 1500;
  const H = 900;
  const sys = { x: 570, y: 345, w: 360, h: 180 };
  const P = (y, title, tag, body) => person({ x: 60, y, w: 300, h: 132, title, tag, body, bodySize: 13 });
  const E = (x, y, title, tag, body, w = 320, h = 108) => box({ x, y, w, h, fill: C.external, title, tag, body, titleSize: 15 });
  const parts = [
    box({
      ...sys,
      fill: C.system,
      title: 'Retail Pricing Feed Platform',
      tag: 'Software system',
      body: 'React Native app (iOS & Android) + regional pricing services. Ingests store CSV price feeds; search, edit and audit of price records.',
      titleSize: 19,
      bodySize: 13.5,
    }),
    P(130, 'Store Manager', 'Person · ~3,000 stores', "Uploads the store's price feed from a phone or tablet; checks and fixes prices on the shop floor."),
    P(380, 'Regional Pricing Analyst', 'Person · per country', 'Monitors feed quality for their countries; searches and corrects prices across stores.'),
    P(630, 'HQ Pricing Admin', 'Person', 'Global oversight: audit trail, access reviews, store reference data.'),
    E(590, 110, 'Store POS / back-office', 'Existing system', 'Exports the price list as CSV: Store ID, SKU, Product Name, Price, Date.', 320, 108),
    E(590, 680, 'App Store · Google Play · MDM', 'Distribution', 'Signed builds via EAS Build/Submit; EAS Update ships OTA JS fixes.', 320, 108),
    E(1130, 100, 'Corporate Identity Provider', 'Entra ID / Okta', 'SSO with MFA; groups map to role and store/country scope.'),
    E(1130, 245, 'ERP / Store Master', 'Existing system', 'Source of truth for stores, country, currency, timezone.'),
    E(1130, 390, 'APNs / FCM', 'Apple & Google push', "Delivers 'feed processed' notifications to devices."),
    E(1130, 535, 'Downstream price consumers', 'POS price sync · e-commerce · data lake', 'Subscribe to PriceChanged events.'),
    E(1130, 680, 'Observability', 'Sentry · OpenTelemetry · Grafana', 'Crash reports, traces, metrics and alerting.'),
    arrow({ pts: [[360, 200], [570, 385]], label: "Uploads CSV feeds; searches & edits own store's prices", at: 0.45, labelWidth: 170 }),
    arrow({ pts: [[360, 446], [570, 446]], label: 'Searches & corrects prices in own countries', labelWidth: 150 }),
    arrow({ pts: [[360, 690], [570, 505]], label: 'Audits changes & access', at: 0.5, labelWidth: 150 }),
    arrow({ pts: [[590, 164], [362, 164]], label: 'CSV export', at: 0.5 }),
    arrow({ pts: [[930, 375], [1130, 160]], label: 'Sign-in (OIDC + PKCE); token validation', at: 0.55, labelWidth: 150 }),
    arrow({ pts: [[1130, 300], [930, 410]], label: 'Store master sync', at: 0.45 }),
    arrow({ pts: [[930, 440], [1130, 444]], label: 'Feed status push', at: 0.5 }),
    arrow({ pts: [[930, 475], [1130, 585]], label: 'PriceChanged events', at: 0.55 }),
    arrow({ pts: [[930, 505], [1130, 730]], label: 'Telemetry', at: 0.6 }),
    arrow({ pts: [[750, 680], [750, 525]], label: 'Install & update app', at: 0.5 }),
    legend(60, 850, [
      [C.person, 'Person'],
      [C.system, 'System in scope'],
      [C.external, 'Existing / external system'],
    ]),
  ];
  return svg(W, H, 'System context', 'Retail Pricing Feed Platform: who uses it and which systems it talks to', parts.join('\n'));
}

// ---------------------------------------------------------------------------------------------
// 2. Solution architecture (containers, AWS reference deployment)
// ---------------------------------------------------------------------------------------------
function solutionDiagram() {
  const W = 1420;
  const H = 1020;
  const K = (o) => box({ titleSize: 15, bodySize: 12.5, ...o });
  const c1 = 610;
  const c2 = 880;
  const c3 = 1150;
  const cw = 230;
  const parts = [
    group({ x: 580, y: 110, w: 820, h: 700, label: 'Regional cell × 4 (EU · APAC · NA · MEA)', sublabel: 'Same stack per region; price data stays in its home region' }),
    K({ x: 40, y: 340, w: 230, h: 180, fill: C.system, title: 'Mobile app', tag: 'React Native · Expo SDK 58', body: 'iOS & Android, phone & tablet. Offline cache, Keychain/Keystore tokens, on-device CSV pre-check.' }),
    K({ x: 40, y: 130, w: 230, h: 110, fill: C.external, title: 'Corporate IdP', tag: 'Entra ID / Okta', body: 'OIDC, MFA, role & scope claims' }),
    K({ x: 330, y: 310, w: 200, h: 96, fill: C.container, title: 'Edge', tag: 'Route 53 · CloudFront · WAF', body: 'Geo routing, TLS 1.3, OWASP rules' }),
    K({ x: 330, y: 436, w: 200, h: 96, fill: C.container, title: 'API Gateway', tag: 'JWT authorizer', body: 'Throttling, size limits' }),
    K({ x: c1, y: 168, w: cw, h: 96, fill: C.store, title: 'Cache', tag: 'ElastiCache Redis', body: 'Reference data, idempotency keys, rate limits' }),
    K({ x: c1, y: 420, w: cw, h: 122, fill: C.container, title: 'Pricing API', tag: 'Node.js · Fastify · containers', body: 'Search (keyset), read/edit with If-Match, feed registration, pre-signed URLs' }),
    K({ x: c1, y: 610, w: cw, h: 130, fill: C.store, title: 'Pricing database', tag: 'Aurora PostgreSQL', body: 'Partitioned by country & month; audit trail; writer + read replicas; outbox' }),
    K({ x: c2, y: 240, w: cw, h: 100, fill: C.store, title: 'Raw feed bucket', tag: 'S3 · versioned · KMS', body: 'Immutable originals, malware scan, lifecycle to Glacier' }),
    K({ x: c2, y: 420, w: cw, h: 96, fill: C.store, title: 'Feed queue', tag: 'SQS + dead-letter queue', body: 'One message per uploaded file' }),
    K({ x: c2, y: 610, w: cw, h: 130, fill: C.container, title: 'Ingestion workers', tag: 'Node.js · autoscaled on queue depth', body: 'Stream-parse, validate, batch upsert 500 rows/txn, reject rows with reasons' }),
    K({ x: c3, y: 168, w: 220, h: 110, fill: C.future, dark: false, stroke: C.line, dashed: true, title: 'Search read model', tag: 'OpenSearch via CDC · phase 2', body: 'Fuzzy, multilingual product search' }),
    K({ x: c3, y: 420, w: 220, h: 96, fill: C.container, title: 'Notifications', tag: 'SNS → APNs / FCM', body: "'Feed processed' push" }),
    K({ x: c3, y: 610, w: 220, h: 130, fill: C.container, title: 'Event bus', tag: 'EventBridge / MSK', body: 'PriceChanged, FeedCompleted (published from the outbox)' }),
    K({ x: c1, y: 860, w: cw, h: 92, fill: C.external, title: 'ERP / Store Master', body: 'Stores, country, currency, timezone' }),
    K({ x: c3, y: 860, w: 220, h: 92, fill: C.external, title: 'Price consumers', body: 'POS price sync · e-commerce · data lake' }),
    K({ x: 40, y: 600, w: 230, h: 100, fill: C.external, title: 'Observability', tag: 'OpenTelemetry · CloudWatch · Grafana · Sentry', body: '' }),
    K({ x: 40, y: 730, w: 230, h: 100, fill: C.external, title: 'Security services', tag: 'KMS · Secrets Manager · GuardDuty', body: '' }),
    K({ x: 330, y: 600, w: 200, h: 230, fill: C.external, title: 'Delivery pipeline', tag: 'GitHub Actions', body: 'Lint, tests, SAST, SBOM → EAS Build & Submit (signed apps) → EAS Update (staged OTA) · Terraform + Argo CD (blue/green)' }),
    // flows
    arrow({ pts: [[155, 340], [155, 240]], label: 'OIDC + PKCE', at: 0.5 }),
    arrow({ pts: [[270, 380], [330, 358]], label: '' }),
    arrow({ pts: [[430, 406], [430, 436]] }),
    arrow({ pts: [[530, 481], [c1, 481]], label: 'HTTPS · JWT', at: 0.5 }),
    arrow({ pts: [[230, 340], [230, 290], [c2, 290]], label: 'PUT file via pre-signed URL (direct to S3)', labelAt: [425, 279], labelWidth: 210 }),
    arrow({ pts: [[c1 + cw / 2, 420], [c1 + cw / 2, 264]], label: '', at: 0.5 }),
    arrow({ pts: [[c1 + cw / 2, 542], [c1 + cw / 2, 610]], label: 'SQL', at: 0.5 }),
    arrow({ pts: [[c2 + cw / 2, 340], [c2 + cw / 2, 420]], label: 'ObjectCreated', at: 0.5 }),
    arrow({ pts: [[c2 + cw / 2, 516], [c2 + cw / 2, 610]], label: 'at-least-once', at: 0.5 }),
    arrow({ pts: [[c2, 675], [c1 + cw, 675]], label: 'upsert', at: 0.5 }),
    arrow({ pts: [[c1 + cw, 720], [c1 + cw + 18, 720], [c1 + cw + 18, 785], [c3 + 40, 785], [c3 + 40, 740]], label: 'outbox relay', at: 0.55 }),
    arrow({ pts: [[c3 + 110, 610], [c3 + 110, 516]], label: 'FeedCompleted', at: 0.5 }),
    arrow({ pts: [[c1 + cw / 2, 860], [c1 + cw / 2, 740]], label: 'nightly + on change', at: 0.5 }),
    arrow({ pts: [[c3 + 110, 740], [c3 + 110, 860]], label: 'subscribe', at: 0.5 }),
    legend(40, 985, [
      [C.container, 'Compute / integration'],
      [C.store, 'Data store'],
      [C.external, 'External / shared'],
      [C.future, 'Planned (phase 2)', true],
    ]),
  ];
  return svg(W, H, 'Solution architecture', 'Container view, AWS reference deployment (cloud-agnostic design; Azure equivalents in the docs)', parts.join('\n'));
}

// ---------------------------------------------------------------------------------------------
// 3. Mobile app architecture (layers)
// ---------------------------------------------------------------------------------------------
function mobileDiagram() {
  const W = 1420;
  const H = 860;
  const bandX = 40;
  const bandW = 1040;
  const band = (y, h, label, items, fill) => {
    const parts = [
      `<rect x="${bandX}" y="${y}" width="${bandW}" height="${h}" rx="12" fill="${C.group}" stroke="${C.groupStroke}"/>`,
      `<text x="${bandX + 18}" y="${y + 26}" font-family="${FONT}" font-size="15" font-weight="700" fill="${C.system}">${esc(label)}</text>`,
    ];
    const gap = 14;
    const iw = (bandW - 36 - gap * (items.length - 1)) / items.length;
    items.forEach(([title, tag, body], i) => {
      parts.push(box({ x: bandX + 18 + i * (iw + gap), y: y + 40, w: iw, h: h - 54, fill, title, tag, body, titleSize: 14.5, bodySize: 12.5 }));
    });
    return parts.join('\n');
  };
  const parts = [
    band(100, 150, 'Screens · Expo Router (file-based, typed routes, auth-guarded stacks)', [
      ['Sign-in', 'OIDC / demo personas', 'Session restore from secure store'],
      ['Prices', 'Search & filters', 'Debounced query, filter sheet, infinite list'],
      ['Price record', 'Detail · edit · history', 'If-Match save, conflict UI, audit trail'],
      ['Upload', 'Pick & pre-check CSV', 'Preview, issues, progress, cancel'],
      ['Feeds', 'History & status', 'Live polling, rejected rows'],
    ], C.system),
    band(270, 150, 'Feature modules (hooks own the logic; screens stay presentational)', [
      ['prices', 'usePriceSearch · useUpdatePrice', 'Keyset paging, cache updates after save'],
      ['feeds', 'useFeedUpload · csvPreview', 'State machine: pick → check → register → upload'],
      ['auth', 'SessionProvider', 'Token lifecycle, sign-out wipes cache'],
      ['ui', 'Design system', 'Accessible components, theme, Intl formatting'],
    ], C.container),
    band(440, 150, 'Data & state', [
      ['Server-state cache', 'TanStack Query', 'Retries with backoff (not 4xx), refetch on focus, pause offline'],
      ['Offline persistence', 'AsyncStorage persister', '24 h cache of searches & stores, keyed by user'],
      ['API client', 'fetch + XHR', 'Bearer token, X-Request-Id, timeouts, RFC 9457 errors'],
    ], C.store),
    band(610, 150, 'Platform services (Expo modules, all in Expo Go)', [
      ['expo-secure-store', 'Keychain / Keystore', 'Tokens, device-only'],
      ['expo-document-picker', '+ expo-file-system', 'Read CSV from Files / Drive'],
      ['expo-crypto', 'SHA-256', 'Idempotent uploads'],
      ['NetInfo', 'Connectivity', 'Offline banner, pause writes'],
      ['Hermes Intl', 'Locale formats', 'Currency & dates per store'],
    ], C.external),
    group({ x: 1110, y: 100, w: 270, h: 660, label: 'Cross-cutting concerns', sublabel: 'apply to every layer' }),
    ...[
      ['Security', 'OWASP MASVS: no secrets in bundle, secure storage, TLS only, cert pinning, root/jailbreak signals'],
      ['Accessibility', 'Roles, labels, 48 pt targets, Dynamic Type, contrast AA'],
      ['Resilience', 'Error states with retry, offline reads, paused writes, idempotent upload'],
      ['Observability', 'Sentry crashes & traces; correlation id on every call'],
      ['Release', 'EAS Build profiles (dev / preview / prod), EAS Update channels with staged rollout'],
      ['Quality', 'TypeScript strict, Jest unit tests, Maestro E2E flows in CI'],
    ].map(([t, b], i) => box({ x: 1124, y: 162 + i * 98, w: 242, h: 90, fill: '#FFFFFF', stroke: '#DCE3EE', dark: false, title: t, body: b, titleSize: 13.5, bodySize: 11.5 })),
    arrow({ pts: [[560, 250], [560, 270]] }),
    arrow({ pts: [[560, 420], [560, 440]] }),
    arrow({ pts: [[560, 590], [560, 610]] }),
    `<text x="40" y="800" font-family="${FONT}" font-size="13.5" fill="${C.muted}">Dependencies point downwards only. Screens never call fetch directly; features never touch platform APIs except through small adapters, so each layer is unit-testable.</text>`,
  ];
  return svg(W, H, 'Mobile app architecture', 'React Native (Expo SDK 58, New Architecture, Hermes): layered, feature-oriented', parts.join('\n'));
}

// ---------------------------------------------------------------------------------------------
// Sequence diagram helper
// ---------------------------------------------------------------------------------------------
function sequence({ W, H, title, subtitle, actors, steps, top = 110 }) {
  const parts = [];
  const lifeTop = top + 56;
  actors.forEach((a) => {
    parts.push(box({ x: a.x - 85, y: top, w: 170, h: 50, fill: a.fill ?? C.container, title: a.label, titleSize: 14, bodySize: 11 }));
    parts.push(`<line x1="${a.x}" y1="${lifeTop}" x2="${a.x}" y2="${H - 40}" stroke="#C5CCD8" stroke-width="1.4" stroke-dasharray="5 5"/>`);
  });
  const ax = Object.fromEntries(actors.map((a) => [a.id, a.x]));
  let n = 0;
  for (const s of steps) {
    if (s.frame) {
      const x1 = Math.min(...s.frame.across.map((id) => ax[id])) - 100;
      const x2 = Math.min(W - 12, Math.max(...s.frame.across.map((id) => ax[id])) + 100);
      parts.push(`<rect x="${x1}" y="${s.y}" width="${x2 - x1}" height="${s.frame.h}" rx="8" fill="none" stroke="${C.groupStroke}" stroke-width="1.5"/>`);
      parts.push(`<rect x="${x1}" y="${s.y}" width="${s.frame.label.length * 7 + 18}" height="22" rx="6" fill="${C.group}" stroke="${C.groupStroke}"/>`);
      parts.push(`<text x="${x1 + 9}" y="${s.y + 15}" font-family="${FONT}" font-size="12" font-weight="700" fill="${C.system}">${esc(s.frame.label)}</text>`);
      continue;
    }
    if (s.note) {
      const x = ax[s.note];
      const lines = wrap(s.text, s.w ?? 230, 12.5);
      const h = lines.length * 16 + 12;
      const w = s.w ?? 250;
      parts.push(`<rect x="${x - w / 2}" y="${s.y - h / 2}" width="${w}" height="${h}" rx="6" fill="${C.note}" stroke="${C.noteStroke}"/>`);
      parts.push(textBlock({ x, y: s.y - h / 2 + 18, lines, size: 12.5, fill: C.text }));
      continue;
    }
    n += 1;
    const x1 = ax[s.from];
    const x2 = ax[s.to];
    const dir = x2 > x1 ? 1 : -1;
    parts.push(
      `<line x1="${x1}" y1="${s.y}" x2="${x2 - dir * 4}" y2="${s.y}" stroke="${s.color ?? C.line}" stroke-width="1.6"${s.reply ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>`,
    );
    const mid = (x1 + x2) / 2;
    const label = `${n}. ${s.text}`;
    parts.push(`<text x="${mid}" y="${s.y - 8}" font-family="${FONT}" font-size="13" fill="${C.text}" text-anchor="middle">${esc(label)}</text>`);
  }
  return svg(W, H, title, subtitle, parts.join('\n'));
}

function uploadSequence() {
  const actors = [
    { id: 'user', label: 'Store Manager', x: 110, fill: C.person },
    { id: 'app', label: 'Mobile app', x: 330, fill: C.system },
    { id: 'api', label: 'Pricing API', x: 600 },
    { id: 's3', label: 'S3 raw feeds', x: 820, fill: C.store },
    { id: 'sqs', label: 'SQS queue', x: 1000, fill: C.store },
    { id: 'wk', label: 'Ingestion worker', x: 1180 },
    { id: 'db', label: 'Aurora PostgreSQL', x: 1360, fill: C.store },
  ];
  let y = 205;
  const next = (d = 46) => (y += d);
  const steps = [
    { from: 'user', to: 'app', text: 'Choose CSV (Files / Drive)', y },
    { note: 'app', text: 'Check header + first 2,000 rows on device; compute SHA-256', y: next(48), w: 250 },
    { from: 'app', to: 'api', text: 'POST /feeds {fileName, size, sha256}', y: next(52) },
    { note: 'api', text: 'Same file already loaded by this user? Return it, do not re-apply', y: next(44), w: 250 },
    { from: 'api', to: 'app', text: '201 {feedId, pre-signed PUT URL}', y: next(46), reply: true },
    { from: 'app', to: 's3', text: 'PUT file bytes (background, resumable)', y: next() },
    { from: 's3', to: 'sqs', text: 'ObjectCreated', y: next() },
    { from: 'sqs', to: 'wk', text: 'deliver {feedId}', y: next() },
    { from: 'wk', to: 'db', text: 'claim: QUEUED → PROCESSING', y: next() },
    { from: 'wk', to: 's3', text: 'stream file (constant memory)', y: next(), reply: true },
    { frame: { across: ['wk', 'db'], label: 'loop: every 500 valid rows', h: 104 }, y: y + 20 },
    { note: 'wk', text: 'validate rows; collect rejects with reasons', y: next(70), w: 210 },
    { from: 'wk', to: 'db', text: 'upsert + audit + outbox (1 txn)', y: next(44) },
    { from: 'wk', to: 'db', text: 'status COMPLETED / WITH_ERRORS', y: next(58) },
    { from: 'wk', to: 'app', text: "push 'feed processed' (SNS → APNs / FCM)", y: next(), reply: true },
    { from: 'app', to: 'api', text: 'GET /feeds/{id}, /errors', y: next() },
    { from: 'app', to: 'user', text: 'Summary + rejected rows', y: next(), reply: true },
  ];
  return sequence({ W: 1460, H: y + 70, title: 'Feed upload and ingestion', subtitle: 'File bytes never pass through the API tier; processing is asynchronous, idempotent and resumable', actors, steps });
}

function editSequence() {
  const actors = [
    { id: 'user', label: 'Pricing Analyst', x: 110, fill: C.person },
    { id: 'app', label: 'Mobile app', x: 380, fill: C.system },
    { id: 'api', label: 'Pricing API', x: 760 },
    { id: 'db', label: 'Aurora PostgreSQL', x: 1080, fill: C.store },
    { id: 'bus', label: 'Event bus', x: 1330, fill: C.container },
  ];
  let y = 205;
  const next = (d = 46) => (y += d);
  const steps = [
    { from: 'user', to: 'app', text: "Search 'coffee', country IN", y },
    { from: 'app', to: 'api', text: 'GET /prices?q=coffee&countryCode=IN&limit=25', y: next() },
    { from: 'api', to: 'db', text: 'scoped query, keyset page (no OFFSET)', y: next() },
    { from: 'api', to: 'app', text: '200 {items, nextCursor}', y: next(), reply: true },
    { from: 'user', to: 'app', text: 'Open record, change price, give reason', y: next(52) },
    { from: 'app', to: 'api', text: 'PATCH /prices/{id} · If-Match: "3"', y: next() },
    { from: 'api', to: 'db', text: 'UPDATE … WHERE version = 3; audit; outbox', y: next() },
    { frame: { across: ['app', 'bus'], label: 'version still 3', h: 96 }, y: y + 20 },
    { from: 'api', to: 'app', text: '200 · ETag "4"', y: next(66), reply: true },
    { from: 'db', to: 'bus', text: 'PriceChanged', y: next(), reply: true },
    { frame: { across: ['app', 'bus'], label: 'someone changed it first', h: 132 }, y: y + 30 },
    { from: 'api', to: 'app', text: '412 Precondition Failed + current record', y: next(76), reply: true },
    { note: 'app', text: 'Show who changed it and their value: "Use latest" or "Keep my changes"', y: next(50), w: 240 },
  ];
  return sequence({ W: 1460, H: y + 80, title: 'Search and edit with lost-update protection', subtitle: 'Optimistic concurrency with ETag / If-Match; every change is audited and published', actors, steps });
}

const diagrams = {
  '01-system-context': contextDiagram(),
  '02-solution-architecture': solutionDiagram(),
  '03-mobile-app-architecture': mobileDiagram(),
  '04-feed-upload-sequence': uploadSequence(),
  '05-search-edit-sequence': editSequence(),
};

const chrome = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Isolated profile so rendering works while a normal Chrome window is open.
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagram-chrome-'));
for (const [name, content] of Object.entries(diagrams)) {
  const file = path.join(OUT, `${name}.svg`);
  fs.writeFileSync(file, content);
  console.log(`wrote ${name}.svg`);
  if (process.argv.includes('--png')) {
    const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(content);
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=2',
      `--user-data-dir=${profileDir}`,
      `--window-size=${w},${h}`,
      `--screenshot=${path.join(OUT, `${name}.png`)}`,
      `file://${file}`,
    ], { stdio: 'ignore' });
    console.log(`wrote ${name}.png`);
  }
}
