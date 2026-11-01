// Intern Co. // the office of Claude agents, drawn in 3D.
// One open floor: a hub per department (hub) arranged around a central area, joined by a walkway ring. The
// company (hubs, their managers, interns and roles) comes from /api/company and is edited in the Company panel;
// saving rebuilds the office and new hires walk in. Sign-in comes first (signIn); goals, the inbox, usage, files,
// KPIs, Design and Settings are windows over the office.
// Only real work moves people for work: anyone without a task card or message from the current goal is on
// standby in their own hub (relaxed at their desk, the odd stretch or chat with a teammate). Each world theme
// furnishes the hubs its own way (desks, consoles, log tables, lab benches, study tables), and each hub gets
// a soft colour scheme from its own colour.
// Drag to orbit, scroll to zoom, right-drag to pan, click an intern to follow what they're doing.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import {OrbitControls} from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/OrbitControls.js/+esm';
import {CSS2DRenderer, CSS2DObject} from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/renderers/CSS2DRenderer.js/+esm';
import {RoundedBoxGeometry} from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/geometries/RoundedBoxGeometry.js/+esm';
import {LANGS, LOCALE, lang, setLang, startTranslator, t, tr} from './i18n.js';  // English or Japanese screens

// ── layout ─────────────────────────────────────────────────────────────────
const MIN_R_HUB = 22;  // distance of the hubs from the atrium (grows with the number/size of hubs)
const RING = 12.6;     // walkway ring radius
const WALK = 2.1;      // walking speed (units / s)
const POD = 4;         // desks per pod (2 × 2, back to back)
const POD_PITCH = 4.0; // pod spacing across a hub
const HOME_CAM = new THREE.Vector3(0, 36, 39);
const HOME_TARGET = new THREE.Vector3(0, 0, 3);

// limits (the server checks the same ones in company.py)
const MAX_DEPARTMENTS = 8;
const MAX_PER_DEPARTMENT = 12;
const MAX_INTERNS = 40;
const COLORS = ['#5B7DB1', '#C0975A', '#6E9C7A', '#C47A62', '#8A7DB3', '#4F9A9A', '#B5738F', '#7F8C5A', '#A0826D', '#6B7A8F'];

// small talk on standby (nothing that claims work: nobody works until a goal comes in)
// (speech bubbles are left alone by the translator, so their app-made lines are translated here with t())
const STANDBY_LINES = ['Quiet day!', 'Ready for the next goal', 'Coffee later?', 'Nice weather today', 'Any news from the owner?',
                       'Tidying up my desk', 'Read anything good lately?', 'Standing by 👍', 'Stretch break!', 'How was your weekend?'].map((s) => t(s));
const MANAGER_STANDBY = ['All set for the next goal?', 'Enjoy the quiet while it lasts', 'Anything you need?', "We're ready when the owner is"].map((s) => t(s));
const REPLIES = ['Sure!', 'Ha, yes', 'Sounds good', 'Nice', 'Definitely', 'Same here', 'Good idea', 'Ready 👍'].map((s) => t(s));
const WALK_LINES = ['Nice day for a walk', 'Fresh air!', 'Love this place'].map((s) => t(s));
const STANDBY = 'On standby';
const NAME_IDEAS = ['Olive', 'Priya', 'Quinn', 'Ravi', 'Sara', 'Theo', 'Uma', 'Victor', 'Wren', 'Xavier', 'Yara', 'Zane',
                    'Amir', 'Bella', 'Caleb', 'Dana', 'Emil', 'Fiona', 'Gabe', 'Hana', 'Ivan', 'June', 'Kai', 'Lina',
                    'Milo', 'Nina', 'Omar', 'Pia', 'Rosa', 'Sam', 'Tara', 'Uri', 'Vera', 'Will', 'Yuki', 'Zoe'];
const SKIN = ['#F1D3BC', '#E0B899', '#C69474', '#9C6B4E', '#6E4A36', '#F5DCCB'];
const HAIR = ['#2B2420', '#4A3526', '#7A5230', '#1E1E1E', '#A67C52', '#3B2F2F', '#B8A48A'];

const PALETTE = {
  background: 0xEEF0F1, floor: '#E4DACB', plankLine: 'rgba(120, 96, 70, 0.10)', walkway: 0xF5F2EC,
  deskTop: 0xE3CFAE, deskLeg: 0xF4F3F0, chair: 0x9AA3AD, monitor: 0x2E3238, screen: 0xCFE3F5,
  potWhite: 0xF1EEE8, potClay: 0xC9876B, leaf: [0x7C9E6B, 0x6A8C5C, 0x8FB07A], trunk: 0x8A6A4C,
  sofa: 0xB9B1A6, trousers: 0x3F4652,
};
// the palette in use: PALETTE with the current theme's overrides (set by Office.build)
let PAL = {...PALETTE};

// ── designs: world themes, hub styles, agent looks (company.py has the same lists) ──
const THEMES = {
  office: {name: 'Open office', bg: 0xEEF0F1, floor: '#E4DACB', floorKind: 'planks', line: 'rgba(120, 96, 70, 0.10)',
           walkway: 0xF5F2EC, centre: 'tree', prop: 'plant', rugLight: 0.79, pal: {}},
  space: {name: 'Space station', bg: 0x0A0F1E, floor: '#262E3E', floorKind: 'panels', line: 'rgba(140, 170, 230, 0.20)',
          walkway: 0x323C50, centre: 'core', prop: 'beacon', rugLight: 0, glow: true, stars: true, indoor: true,
          light: {sky: 0xA9BCFF, ground: 0x141A2A, hemi: 0.75, sun: 0xDCE6FF, sunI: 1.7},
          pal: {deskTop: 0xC7CFDB, deskLeg: 0x8A94A6, chair: 0x4A5466, potWhite: 0xB9C3D3, potClay: 0x5A6577,
                sofa: 0x4E5869, trunk: 0x6E7787, leaf: [0x6FE3D1, 0x8FB4FF, 0xB59CFF]}},
  forest: {name: 'Forest camp', bg: 0xDCE7D6, floor: '#8DAC6E', floorKind: 'grass', line: 'rgba(50, 80, 35, 0.22)',
           walkway: 0xCDB68C, centre: 'campfire', prop: 'pine', rugLight: 0.72,
           pal: {deskTop: 0xA67C52, deskLeg: 0x6E4F33, chair: 0x7A5A3A, sofa: 0x8B6B4A, potWhite: 0x9C7A55}},
  lab: {name: 'Research lab', bg: 0xF2F5F7, floor: '#E6ECEF', floorKind: 'tiles', line: 'rgba(110, 130, 145, 0.25)',
        walkway: 0xD9E3E8, centre: 'globe', prop: 'plant', rugLight: 0.82,
        pal: {deskTop: 0xF4F7F9, deskLeg: 0xBFC8CF, chair: 0x7E8D99, potWhite: 0xFFFFFF}},
  library: {name: 'Cozy library', bg: 0xEDE3D5, floor: '#B78A5C', floorKind: 'planks', line: 'rgba(70, 40, 20, 0.18)',
            walkway: 0x8E7462, centre: 'reading', prop: 'lamp', rugLight: 0.7, light: {sun: 0xFFE2B8},
            pal: {deskTop: 0x8B5A33, deskLeg: 0x5E3B22, chair: 0x7A3B32, sofa: 0x7A3B32, potWhite: 0xD8C3A5}},
};
const TIMES = {day: 'Day', sunset: 'Sunset', night: 'Night', live: 'Live (system clock)'};
const WEATHERS = {clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow', fog: 'Fog'};
const LOOKS = {people: 'People', robots: 'Robots', animals: 'Animals', shapes: 'Shapes'};
const HUB_STYLES = {desks: 'Desks', lab: 'Lab benches', greenhouse: 'Greenhouse', workshop: 'Workshop', studio: 'Studio',
                    library: 'Library', lounge: 'Lounge'};
const FURS = [['#D9853B', 'fox'], ['#8C8C8C', 'cat'], ['#7A5236', 'bear'], ['#EDE6DC', 'rabbit'], ['#4A4A4A', 'cat']];

// ── small helpers ──────────────────────────────────────────────────────────
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: 0.75, metalness: 0, ...extra});
const tint = (hex, amount) => new THREE.Color(hex).lerp(new THREE.Color(0xffffff), amount);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const clip = (text, n) => { const t = String(text || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const money = (v) => `$${Number(v || 0).toFixed(2)}`;
// Work shown as how much of the Claude plan's 5-hour limit it took (≈, measured), or in dollars with an API key.
// (The server's "cost" is the API-equivalent price of the work: on a plan it is only a measure, not a charge.)
let USAGE = null;  // the latest /api/usage reading (set by LiveLink)
const pctText = (p) => (p < 0.1 ? '<0.1%' : p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`);
const used = (usd, {short = false} = {}) => {
  if (USAGE?.plan === false) return money(usd);
  if (!USAGE?.plan) return '—';
  if (!USAGE.pct_per_usd) return 'measuring…';
  return `≈ ${pctText(Number(usd || 0) * USAGE.pct_per_usd)}${short ? '' : ' of the 5-hour limit'}`;
};
const resetText = (unix) => {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  const time = d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  return d.toDateString() === new Date().toDateString() ? `resets at ${time}`
    : `resets ${d.toLocaleDateString(LOCALE, {weekday: 'short'})} ${time}`;
};
// an estimated time left, with the clock time it should be done: "~6 min · done ≈ 14:32"
const eta = (seconds) => {
  if (seconds == null) return '';
  const at = new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  return `${seconds < 60 ? '<1 min' : `~${Math.round(seconds / 60)} min`} · done ≈ ${at}`;
};

// Claude models (company.py has the same list). '' inherits from the level above; at the top it is Claude Code's default.
const MODELS = [
  ['claude-opus-5-5', 'Opus 5.5', 'most capable · highest usage'],
  ['claude-sonnet-5-5', 'Sonnet 5.5', 'balanced'],
  ['claude-haiku-4-5', 'Haiku 4.5', 'fastest · lowest usage'],
];
const CARD_STATUS = {waiting: '⏳ Waiting', assigned: 'In progress', submitted: 'Handed in', passed: '✓ Passed', rework: '↺ Rework',
                     blocked: '⚠ Blocked', unfinished: 'Unfinished'};
const modelLabel = (id) => (MODELS.find((m) => m[0] === id) || [id, 'Claude Code default'])[1];

// Which model someone runs on: their own choice, else their hub's (manager or intern setting), else the company's.
function modelFor(company, dept, person, manager) {
  return (manager ? '' : person.model) || (manager ? dept.manager_model : dept.intern_model) || company.model || '';
}

function modelOptions(selected, inherit) {
  return [`<option value="">${esc(inherit)}</option>`, ...MODELS.map(([id, name, note]) =>
    `<option value="${id}"${id === selected ? ' selected' : ''} title="${esc(note)}">${esc(name)}</option>`)].join('');
}
// Open a finished goal's document (its PDF) in this computer's own viewer (main.py).
async function openDocument(mission, office) {
  const res = await fetch(`/api/results/${mission}/document`, {method: 'POST'}).catch(() => null);
  if (!res || !res.ok) office.toast((await res?.json().catch(() => ({})))?.error || 'The document could not be opened.');
}

const CONTINUABLE = ['aborted', 'ended', 'interrupted'];

async function continueGoal(mission, office) {  // a stopped goal picks up from its files and finished cards
  if (!confirm(t('Continue this goal? The team picks up from the files and finished task cards, and plans only what is left.'))) return false;
  const res = await fetch(`/api/results/${mission}/continue`, {method: 'POST'}).catch(() => null);
  if (!res || !res.ok) {
    office.toast((await res?.json().catch(() => ({})))?.error || 'The goal could not be continued.');
    return false;
  }
  office.toast('Goal continued. The manager is looking at what is left.');
  return true;
}

async function openResultFolder(mission, office) {  // the copy in the output folder, else the goal folder
  const res = await fetch(`/api/results/${mission}/folder`, {method: 'POST'}).catch(() => null);
  if (!res || !res.ok) office.toast((await res?.json().catch(() => ({})))?.error || 'The folder could not be opened.');
}

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

function shadowed(obj) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

function tag(cls, text = '') {  // (names and speech: the translator leaves these alone)
  const div = document.createElement('div');
  div.className = cls;
  div.translate = false;
  div.textContent = text;
  return new CSS2DObject(div);
}

// The floor pattern for a theme: wooden planks, metal panels, grass, or tiles.
function floorTexture(theme) {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = theme.floor;
  g.fillRect(0, 0, 1024, 1024);
  if (theme.floorKind === 'planks') {
    const rows = 16;
    for (let r = 0; r < rows; r++) {
      const y = r * 1024 / rows;
      let x = -Math.random() * 300;
      while (x < 1024) {
        const len = rand(220, 420);
        g.fillStyle = `rgba(${150 + Math.random() * 30}, ${120 + Math.random() * 25}, ${85 + Math.random() * 20}, ${rand(0.03, 0.09)})`;
        g.fillRect(x, y, len, 1024 / rows);
        g.fillStyle = theme.line;
        g.fillRect(x, y, 2, 1024 / rows);
        x += len;
      }
      g.fillStyle = theme.line;
      g.fillRect(0, y, 1024, 2);
    }
  } else if (theme.floorKind === 'grass') {
    for (let k = 0; k < 9000; k++) {  // blades and speckles
      g.fillStyle = Math.random() < 0.5 ? theme.line : 'rgba(255, 255, 230, 0.10)';
      g.fillRect(Math.random() * 1024, Math.random() * 1024, rand(1, 3), rand(3, 9));
    }
  } else {  // panels (space) or tiles (lab): a grid, panels with rivets
    const step = theme.floorKind === 'panels' ? 128 : 64;
    g.fillStyle = theme.line;
    for (let v = 0; v <= 1024; v += step) {
      g.fillRect(v, 0, 2, 1024);
      g.fillRect(0, v, 1024, 2);
    }
    if (theme.floorKind === 'panels') {
      for (let x = 0; x < 1024; x += step) {
        for (let y = 0; y < 1024; y += step) {
          g.fillStyle = `rgba(255, 255, 255, ${rand(0.0, 0.04)})`;
          g.fillRect(x + 3, y + 3, step - 4, step - 4);
          g.fillStyle = theme.line;
          for (const [dx, dy] of [[10, 10], [step - 12, 10], [10, step - 12], [step - 12, step - 12]]) g.fillRect(x + dx, y + dy, 3, 3);
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// A soft round dot, so snowflakes aren't drawn as squares.
function snowflakeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// A hub's soft colour scheme, from its own colour: a brighter and a lighter shade, and two neighbouring hues.
// Chairs, cushions, flags, lights and flowers use it, so every hub has its own colours.
function scheme(color) {
  const hsl = new THREE.Color(color).getHSL({h: 0, s: 0, l: 0});
  const soft = (dh, s, l) => new THREE.Color().setHSL((hsl.h + dh + 1) % 1, Math.min(1, s), l);
  // (the renderer's tone mapping pales colours, so these are more saturated than they look)
  const s = Math.max(hsl.s, 0.6);
  return {main: new THREE.Color(color), bright: soft(0, s + 0.1, 0.55), light: soft(0, s, 0.78),
          accent: soft(0.09, s + 0.1, 0.57), accent2: soft(-0.1, s + 0.05, 0.62),
          flowers: [soft(0, 0.85, 0.6), soft(0.1, 0.9, 0.6), soft(-0.12, 0.8, 0.64), new THREE.Color(0xFFD255),
                    new THREE.Color(0xFFFFFF)]};
}
const BLOSSOMS = [0xF5A3B8, 0xFFD36E, 0xB9A3F2, 0xFF9F80, 0xFFFFFF, 0x9FD4F5];

// Which world each hub is furnished in: its own choice, the company's theme ('match'), or (unset) a random
// world. Random worlds are dealt from a shuffle seeded by the company's id, by the hub's position, so they stay
// the same every time and neighbouring hubs differ.
function hubWorlds(company) {
  const theme = THEMES[company.design?.theme] ? company.design.theme : 'office';
  let seed = [...String(company.id || company.name)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const next = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
  const deck = Object.keys(THEMES).map((k) => [next(), k]).sort((a, b) => a[0] - b[0]).map(([, k]) => k);
  return Object.fromEntries(company.departments.map((d, i) => [d.id,
    THEMES[d.world] ? d.world : d.world === 'match' ? theme : deck[i % deck.length]]));
}
const WORLD_SHORT = {office: 'Office', space: 'Space', forest: 'Forest', lab: 'Lab', library: 'Library'};

// How big a department's hub is: pods of four desks side by side, and a rug that fits them.
function hubSize(count) {
  const pods = Math.max(1, Math.ceil(count / POD));
  return {pods, radius: [6.4, 7.4, 9.4][pods - 1], outer: pods * POD_PITCH / 2 + 0.4};
}

// A hub's local frame: `f` points from the hub towards the atrium, `s` runs sideways.
class Frame {
  constructor(angle, radius) {
    this.angle = angle;
    this.c = new THREE.Vector3(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
    this.f = new THREE.Vector3(-Math.sin(angle), 0, -Math.cos(angle));
    this.s = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle));
  }
  at(side, fwd, y = 0) {
    return this.c.clone().addScaledVector(this.s, side).addScaledVector(this.f, fwd).setY(y);
  }
  yaw(dir) {  // rotation.y that makes an object's +z face local direction `dir` (a Vector3 in world space)
    return Math.atan2(dir.x, dir.z);
  }
}

// A place someone can stand or sit. `way` leads from the spot out to the ring (shared points are shared objects,
// so two spots in the same hub can route between each other without leaving it).
class Spot {
  constructor(zone, pos, face, way, pose = 'stand') {
    Object.assign(this, {zone, pos, face, way, pose, taken: null});
  }
}

// ── a person: an intern or a hub manager ──────────────────────
class Person {
  constructor(office, {id, name, role, dept, color, manager = false, look = 'people'}) {
    this.office = office;
    Object.assign(this, {id, name, role, dept, manager});
    this.lane = rand(-0.7, 0.7);
    this.queue = [];
    this.path = [];
    this.until = 0;
    this.activity = 'Arriving';
    this.pose = 'stand';
    this.phase = Math.random() * 6;
    this.spot = null;
    this.busyWith = null;

    const g = this.group = new THREE.Group();
    // managers wear a deeper shade of their hub's colour
    const shirtColor = manager ? new THREE.Color(color).lerp(new THREE.Color(0x22262D), 0.45) : color;
    this.hips = new THREE.Group();
    this.hips.position.y = 0.82;
    g.add(this.hips);
    this.buildBody(look || 'people', shirtColor, name);
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 40),
      new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.9}));
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.y = 0.02;
    this.halo.visible = false;
    g.add(this.halo);
    shadowed(g);
    this.halo.castShadow = false;
    g.traverse((o) => { if (o.isMesh) o.userData.person = this; });

    this.nameTag = tag('office-name', manager ? t('{name} · {hub} manager', {name, hub: dept.name}) : name);
    this.nameTag.position.y = 2.05;
    this.nameTag.visible = false;
    g.add(this.nameTag);
    this.bubble = tag('office-bubble');
    this.bubble.position.y = 2.35;
    this.bubble.visible = false;
    this.bubbleUntil = 0;
    g.add(this.bubble);
  }

  // The body, in one of four looks. Every look has the same joints (hips, two leg pivots, two arm pivots),
  // so walking, sitting and typing animate them all.
  buildBody(look, shirtColor, name) {
    const h = this.hips;
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); h.add(m); return m; };
    const limbs = (legMat, armMat, handMat, {legR = 0.075, legLen = 0.62, armR = 0.06, armLen = 0.46, armX = 0.29,
                                            cylinder = false} = {}) => {
      const shape = (r, len) => cylinder ? new THREE.CylinderGeometry(r, r, len + r, 10) : new THREE.CapsuleGeometry(r, len, 4, 10);
      this.legs = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.1, 0, 0);
        const leg = new THREE.Mesh(shape(legR, legLen), legMat);
        leg.position.y = -(legLen / 2 + 0.09);
        pivot.add(leg);
        h.add(pivot);
        return pivot;
      });
      this.arms = [-1, 1].map((side) => {
        const pivot = new THREE.Group();
        pivot.position.set(side * armX, 0.6, 0);
        const arm = new THREE.Mesh(shape(armR, armLen), armMat);
        arm.position.y = -(armLen / 2 + 0.04);
        pivot.add(arm);
        if (handMat) {
          const hand = new THREE.Mesh(new THREE.SphereGeometry(armR + 0.005, 10, 8), handMat);
          hand.position.y = -(armLen + 0.09);
          pivot.add(hand);
        }
        h.add(pivot);
        return pivot;
      });
    };
    const shirt = std(shirtColor);
    if (look === 'robots') {
      const metal = std(0xB9C2CC, {metalness: 0.55, roughness: 0.35});
      add(new RoundedBoxGeometry(0.46, 0.58, 0.32, 3, 0.07), std(shirtColor, {metalness: 0.35, roughness: 0.4}), 0, 0.36, 0);
      add(new RoundedBoxGeometry(0.34, 0.3, 0.3, 3, 0.06), metal, 0, 0.86, 0);
      add(new THREE.PlaneGeometry(0.26, 0.09), new THREE.MeshBasicMaterial({color: 0x6FE3FF}), 0, 0.88, 0.152);
      add(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6), metal, 0, 1.09, 0);
      add(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({color: shirtColor}), 0, 1.2, 0);
      limbs(metal, metal, metal, {legR: 0.07, armR: 0.055, cylinder: true});
    } else if (look === 'animals') {
      const hash = [...name].reduce((n, ch) => n + ch.charCodeAt(0), 0);
      const [furColor, species] = FURS[hash % FURS.length];
      const fur = std(furColor, {roughness: 0.95});
      const light = std(tint(furColor, 0.55), {roughness: 0.95});
      add(new THREE.CapsuleGeometry(0.22, 0.42, 6, 14), shirt, 0, 0.36, 0);
      add(new THREE.SphereGeometry(0.19, 20, 16), fur, 0, 0.87, 0);
      add(new THREE.SphereGeometry(0.09, 12, 10), light, 0, 0.83, 0.15);           // snout
      add(new THREE.SphereGeometry(0.03, 8, 6), std(0x222222), 0, 0.86, 0.235);  // nose
      for (const side of [-1, 1]) {
        add(new THREE.SphereGeometry(0.028, 8, 6), std(0x1E1E1E), side * 0.07, 0.93, 0.16);  // eyes
        if (species === 'bear') add(new THREE.SphereGeometry(0.07, 10, 8), fur, side * 0.13, 1.03, 0);
        else if (species === 'rabbit') {
          const ear = add(new THREE.CapsuleGeometry(0.045, 0.26, 4, 8), fur, side * 0.07, 1.16, -0.02);
          ear.rotation.z = side * -0.12;
        } else {
          const ear = add(new THREE.ConeGeometry(0.07, 0.17, 4), fur, side * 0.1, 1.06, 0);
          ear.rotation.z = side * -0.25;
        }
      }
      // a tail behind the hips
      const tail = species === 'fox' ? new THREE.ConeGeometry(0.1, 0.5, 8) : species === 'cat'
        ? new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6) : new THREE.SphereGeometry(0.08, 10, 8);
      const t = add(tail, species === 'rabbit' ? std(0xFFFFFF) : fur, 0, 0.05, -0.27);
      t.rotation.x = species === 'cat' || species === 'fox' ? -1.0 : 0;
      limbs(fur, shirt, fur);
    } else if (look === 'shapes') {
      add(new THREE.CapsuleGeometry(0.3, 0.5, 8, 18), shirt, 0, 0.42, 0);
      for (const side of [-1, 1]) {
        add(new THREE.SphereGeometry(0.06, 12, 10), std(0xFFFFFF), side * 0.11, 0.66, 0.26);
        add(new THREE.SphereGeometry(0.032, 10, 8), std(0x1E1E1E), side * 0.11, 0.66, 0.31);
      }
      const dark = std(new THREE.Color(shirtColor).lerp(new THREE.Color(0x22262D), 0.5));
      limbs(dark, shirt, null, {legR: 0.08, legLen: 0.5, armR: 0.06, armLen: 0.28, armX: 0.33});
    } else {  // people
      const skin = std(pick(SKIN), {roughness: 0.6});
      add(new THREE.CapsuleGeometry(0.22, 0.42, 6, 14), shirt, 0, 0.36, 0);
      add(new THREE.SphereGeometry(0.17, 20, 16), skin, 0, 0.86, 0);
      const hair = add(new THREE.SphereGeometry(0.178, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
        std(pick(HAIR), {roughness: 0.9}), 0, 0.87, 0);
      hair.rotation.x = -0.25;
      limbs(std(PAL.trousers), shirt, skin);
    }
  }

  say(text, seconds = 3.2) {
    this.bubble.element.textContent = text;
    this.bubble.visible = true;
    this.bubbleUntil = this.office.now + seconds;
  }

  placeAt(spot) {
    this.claim(spot);
    this.group.position.copy(spot.pos);
    this.group.rotation.y = Math.atan2(spot.face.x, spot.face.z);
    this.pose = spot.pose;
  }

  claim(spot) {
    if (this.spot && this.spot.taken === this) this.spot.taken = null;
    this.spot = spot;
    if (spot) spot.taken = this;
  }

  // ── plans ────────────────────────────────────────────────────────────
  goTo(spot, activity) {
    this.queue.push({type: 'walk', spot, activity});
  }

  stay(seconds, activity, extra = {}) {
    this.queue.push({type: 'stay', seconds, activity, ...extra});
  }

  interrupt() {
    this.queue = [];
    this.path = [];
    this.until = 0;
    this.current = null;
  }

  update(dt, now) {
    if (this.bubble.visible && now > this.bubbleUntil) this.bubble.visible = false;
    if (!this.current) this.next(now);
    const step = this.current;
    if (step?.type === 'walk') {
      this.walk(dt);
    } else if (step?.type === 'stay' && now >= this.until) {
      this.current = null;
    }
    this.animate(dt, now);
  }

  next(now) {
    if (!this.queue.length) this.office.plan(this);
    const step = this.current = this.queue.shift();
    if (!step) return;
    this.activity = step.activity || this.activity;
    if (step.type === 'walk') {
      if (step.spot.taken && step.spot.taken !== this) {  // someone got there first: pick again
        this.current = null;
        this.queue = [];
        return;
      }
      this.path = this.office.route(this, this.spot, step.spot);
      this.claim(step.spot);
      this.pose = 'stand';
    } else {
      this.until = now + step.seconds;
      if (step.say) this.say(step.say);
      if (step.then) step.then();
    }
  }

  walk(dt) {
    const pos = this.group.position;
    let budget = WALK * dt;
    while (budget > 0 && this.path.length) {
      const target = this.path[0];
      const to = new THREE.Vector3(target.x - pos.x, 0, target.z - pos.z);
      const dist = to.length();
      if (dist < 1e-3) { this.path.shift(); continue; }
      const move = Math.min(dist, budget);
      pos.addScaledVector(to.normalize(), move);
      budget -= move;
      this.turnTowards(Math.atan2(to.x, to.z), dt, 9);
      if (move >= dist - 1e-6) this.path.shift();
    }
    if (!this.path.length) {  // arrived
      const spot = this.spot;
      pos.copy(spot.pos);
      this.targetYaw = Math.atan2(spot.face.x, spot.face.z);
      this.pose = spot.pose;
      this.current = null;
    }
  }

  turnTowards(yaw, dt, rate) {
    const r = this.group.rotation;
    r.y += wrap(yaw - r.y) * Math.min(1, dt * rate);
  }

  animate(dt, now) {
    const walking = this.current?.type === 'walk';
    if (!walking && this.targetYaw !== undefined) this.turnTowards(this.targetYaw, dt, 6);
    const sitting = !walking && this.pose === 'sit';
    const lerp = (a, b) => a + (b - a) * Math.min(1, dt * 10);
    this.phase += dt * (walking ? 7.5 : 1.6);
    const swing = walking ? Math.sin(this.phase) * 0.55 : 0;
    this.hips.position.y = lerp(this.hips.position.y, sitting ? 0.5 : 0.82 + (walking ? Math.abs(Math.cos(this.phase)) * 0.035 : 0));
    this.legs[0].rotation.x = lerp(this.legs[0].rotation.x, sitting ? -1.5 : swing);
    this.legs[1].rotation.x = lerp(this.legs[1].rotation.x, sitting ? -1.5 : -swing);
    const typing = sitting && this.current?.typing;
    const talking = this.bubble.visible;
    // on standby: leaning back with hands in the lap, slowly looking around, now and then a big stretch
    const idle = sitting && this.current?.idle && !talking;
    const stretching = idle && this.current?.stretch;
    const armBase = stretching ? -2.85 : idle ? -0.5 : sitting ? -1.05 : walking ? 0 : talking ? -0.25 : 0.02;
    const tap = typing ? Math.sin(now * 17 + this.phase) * 0.06 : talking ? Math.sin(now * 5) * 0.12 : 0;
    this.arms[0].rotation.x = lerp(this.arms[0].rotation.x, armBase - swing * 0.8 + tap);
    this.arms[1].rotation.x = lerp(this.arms[1].rotation.x, armBase + swing * 0.8 - tap);
    this.arms[0].rotation.z = lerp(this.arms[0].rotation.z, stretching ? -0.35 : 0);
    this.arms[1].rotation.z = lerp(this.arms[1].rotation.z, stretching ? 0.35 : 0);
    this.hips.rotation.x = lerp(this.hips.rotation.x, idle ? -0.12 : sitting ? 0.06 : 0);
    this.hips.rotation.y = lerp(this.hips.rotation.y, idle ? Math.sin(now * 0.35 + this.phase) * 0.3 : 0);
    if (idle) this.hips.position.y += Math.sin(now * 1.7 + this.phase) * 0.004;  // breathing
  }
}

// ── the office ─────────────────────────────────────────────────────────────
class Office {
  constructor(el, company) {
    this.el = el;
    this.now = 0;
    this.selected = null;
    this.hovered = null;
    this.clock = new THREE.Clock();

    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    el.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'office-labels';
    el.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(35, 2, 0.5, 500);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = 1.38;
    this.controls.minDistance = 8;

    this.buildOverlay();
    this.panel = new CompanyPanel(this);
    this.companies = new CompaniesWindow(this);
    this.results = new ResultsWindow(this);
    this.files = new FilesWindow(this);
    this.usageWindow = new UsageWindow(this);
    this.settings = new SettingsWindow(this);
    this.designPanel = new DesignPanel(this);
    this.bindPointer();
    this.build(company);
    this.link = new LiveLink(this);
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  // ── (re)building the office from the company ─────────────────────────
  build(company, newcomers = new Set()) {
    this.teardown();
    this.company = company;
    this.design = company.design || {theme: 'office', time: 'day', weather: 'clear', looks: 'people'};
    this.theme = THEMES[this.design.theme] || THEMES.office;
    this.kind = THEMES[this.design.theme] ? this.design.theme : 'office';  // the world being furnished (per hub, see buildHub)
    PAL = {...PALETTE, ...this.theme.pal};
    this.glows = [];  // emissive materials that brighten at night: [material, base intensity]
    this.spinners = [];  // things that slowly turn (space core, globe)
    this.flames = [];  // campfire flames that flicker
    this.particles = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.theme.bg);
    this.people = [];
    this.spots = {seats: [], chat: [], stroll: []};
    this.hubs = {};

    // zones around the atrium
    const worlds = hubWorlds(company);
    const depts = company.departments.map((d) => ({
      key: d.id, name: d.name, color: d.color, manager: d.manager, interns: d.interns, size: hubSize(d.interns.length),
      style: d.style || 'desks', looks: d.looks || this.design.looks || 'people', scheme: scheme(d.color),
      world: worlds[d.id],
    }));
    // hubs all round the atrium, turned so that the gap between two of them faces the camera
    this.zones = depts.map((d) => d.key);
    this.zoneStep = Math.PI * 2 / Math.max(this.zones.length, 1);
    const turn = this.zoneTurn = this.zoneStep / 2;
    this.zoneAngle = Object.fromEntries(this.zones.map((z, i) => [z, turn + i * this.zoneStep]));
    const widest = Math.max(6, ...depts.map((d) => d.size.radius));
    const rHub = this.rHub = Math.max(MIN_R_HUB, (widest + 2.5) / Math.sin(Math.PI / Math.max(this.zones.length, 2)));
    const scale = rHub / MIN_R_HUB;
    this.scene.fog = new THREE.Fog(this.theme.bg, 75 * scale, 150 * scale);
    this.controls.maxDistance = 120 * scale;
    if (this.scale !== scale) {  // first build, or the office grew/shrank: frame it again
      this.scale = scale;
      this.homeCam = HOME_CAM.clone().multiplyScalar(scale);
      this.resetView();
    }

    this.buildLights(rHub);
    this.buildFloor();
    this.buildAtrium();
    for (const zone of this.zones) {
      const frame = new Frame(this.zoneAngle[zone], rHub);
      const dept = depts.find((d) => d.key === zone);
      this.kind = dept.world;  // each hub is furnished in its own world, with that world's palette
      PAL = {...PALETTE, ...THEMES[dept.world].pal};
      this.buildHub(dept, frame);
      this.kind = this.design.theme in THEMES ? this.design.theme : 'office';
      PAL = {...PALETTE, ...this.theme.pal};
    }
    this.buildGreenery(rHub);
    if (this.theme.stars) this.buildStars();
    this.hireStaff(depts, newcomers);
    this.byId = new Map(this.people.map((p) => [p.id, p]));
    this.refreshOverlay();
    this.applyAmbience(this.design);
    this.link?.applyPeople();
  }

  // ── time of day and weather (no rebuild needed) ──────────────────────
  timeOfDay(time) {
    if (time !== 'live') return time;
    const h = new Date().getHours();
    return h >= 7 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'sunset' : h >= 5 && h < 7 ? 'sunset' : 'night';
  }

  applyAmbience(design) {
    this.design = {...this.design, ...design};
    const t = this.theme;
    const time = this.liveTime = this.timeOfDay(this.design.time);
    const weather = t.indoor ? 'clear' : this.design.weather;  // a space station has no weather
    const lt = t.light || {};
    const bg = new THREE.Color(t.bg);
    let hemi = (lt.hemi ?? 1.5);
    let sunI = (lt.sunI ?? 2.3);
    const sun = new THREE.Color(lt.sun ?? 0xFFF3E2);
    const sunPos = new THREE.Vector3(28, 55, 22);
    if (time === 'sunset') {
      bg.lerp(new THREE.Color(0xF2B48A), t.indoor ? 0.1 : 0.4);
      sun.set(0xFFAE6B);
      hemi *= 0.75;
      sunI *= 0.8;
      sunPos.set(55, 18, 10);
    } else if (time === 'night') {
      bg.lerp(new THREE.Color(0x0D1322), t.indoor ? 0.4 : 0.85);
      sun.set(0x8FA6FF);
      hemi *= t.indoor ? 0.6 : 0.34;  // indoors the lights stay on
      sunI *= t.indoor ? 0.5 : 0.22;
      sunPos.set(-30, 50, -20);
    }
    if (weather === 'cloudy') { bg.lerp(new THREE.Color(0xB9C0C7), 0.35); hemi *= 0.85; sunI *= 0.4; }
    if (weather === 'rain') { bg.lerp(new THREE.Color(0x7E8A97), 0.45); hemi *= 0.7; sunI *= 0.25; }
    if (weather === 'snow') { bg.lerp(new THREE.Color(0xE9EEF3), 0.4); hemi *= 0.95; sunI *= 0.5; }
    if (weather === 'fog') { bg.lerp(new THREE.Color(0xD6DBDF), 0.5); sunI *= 0.5; }
    this.scene.background.copy(bg);
    this.scene.fog.color.copy(bg);
    // light text for the header and hints when the sky is dark
    this.el.classList.toggle('dark', bg.getHSL({h: 0, s: 0, l: 0}).l < 0.3);
    const scale = this.scale || 1;
    this.scene.fog.near = (weather === 'fog' ? 18 : 75) * scale;
    this.scene.fog.far = (weather === 'fog' ? 70 : 150) * scale;
    this.hemiLight.intensity = hemi;
    if (lt.sky) { this.hemiLight.color.set(lt.sky); this.hemiLight.groundColor.set(lt.ground); }
    this.sunLight.color.copy(sun);
    this.sunLight.intensity = sunI;
    this.sunLight.position.copy(sunPos).multiplyScalar(scale);
    this.glowLevel = time === 'night' ? 1.8 : time === 'sunset' ? 1.2 : 0.6;
    for (const [m, base] of this.glows) m.emissiveIntensity = base * this.glowLevel;
    this.setParticles(weather);
  }

  // Rain falls as short streaks, snow as drifting flakes, over the whole floor.
  setParticles(kind) {
    if (this.particles) {
      this.scene.remove(this.particles.obj);
      this.particles.obj.geometry.dispose();
      this.particles.obj.material.dispose();
      this.particles = null;
    }
    if (kind !== 'rain' && kind !== 'snow') return;
    const area = (this.rHub || 22) + 14;
    const n = kind === 'rain' ? 1800 : 1400;
    const top = 26;
    const pos = new Float32Array(n * (kind === 'rain' ? 6 : 3));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * area;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = Math.random() * top;
      if (kind === 'rain') pos.set([x, y, z, x - 0.05, y - 0.7, z], i * 6);
      else pos.set([x, y, z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const obj = kind === 'rain'
      ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({color: 0xAFC3D8, transparent: true, opacity: 0.55}))
      : new THREE.Points(geo, new THREE.PointsMaterial({color: 0xFFFFFF, size: 0.18, transparent: true, opacity: 0.95,
                                                         map: snowflakeTexture(), alphaTest: 0.05, depthWrite: false}));
    obj.frustumCulled = false;
    this.scene.add(obj);
    this.particles = {obj, kind, top, n};
  }

  moveParticles(dt) {
    const p = this.particles;
    if (!p) return;
    const arr = p.obj.geometry.attributes.position.array;
    const stride = p.kind === 'rain' ? 6 : 3;
    const fall = (p.kind === 'rain' ? 22 : 1.6) * dt;
    for (let i = 0; i < p.n; i++) {
      const k = i * stride;
      arr[k + 1] -= fall;
      if (p.kind === 'rain') arr[k + 4] -= fall;
      else arr[k] += Math.sin(this.now * 0.8 + i) * 0.004;  // flakes drift
      if (arr[k + 1] < 0) {
        arr[k + 1] += p.top;
        if (p.kind === 'rain') arr[k + 4] += p.top;
      }
    }
    p.obj.geometry.attributes.position.needsUpdate = true;
  }

  buildStars() {
    const n = 1500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(0.05, 1), rand(-1, 1)).normalize().multiplyScalar(260 * this.scale);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({color: 0xDDE6FF, size: 1.2, sizeAttenuation: false, fog: false}));
    this.scene.add(stars);
  }

  // A material that glows a little in daylight and more at night (lamps, screens of the space station…).
  glow(color, base = 0.8, extra = {}) {
    const m = std(color, {emissive: color, emissiveIntensity: base, ...extra});
    this.glows.push([m, base]);
    return m;
  }

  teardown() {
    if (!this.scene) return;
    this.select(null);
    this.hovered = null;
    this.scene.traverse((o) => {
      if (o.isCSS2DObject) o.element.remove();
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); }
    });
  }

  resetView() {
    this.camera.position.copy(this.homeCam);
    this.controls.target.copy(HOME_TARGET);
    this.controls.update();
  }

  // ── scenery ──────────────────────────────────────────────────────────
  buildLights(rHub) {
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xE6DCCD, 1.5);
    this.scene.add(this.hemiLight);
    const sun = this.sunLight = new THREE.DirectionalLight(0xFFF3E2, 2.3);
    sun.position.set(28, 55, 22).multiplyScalar(this.scale);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    const cam = sun.shadow.camera;
    const reach = rHub + 20;
    cam.left = cam.bottom = -reach;
    cam.right = cam.top = reach;
    cam.near = 10;
    cam.far = 160 * this.scale;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    this.scene.add(sun);
  }

  buildFloor() {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(95 * this.scale, 96),
      std(0xffffff, {map: floorTexture(this.theme), roughness: 0.85}));
    floor.material.map.repeat.set(9 * this.scale, 9 * this.scale);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const walkway = new THREE.Mesh(new THREE.RingGeometry(RING - 1.6, RING + 1.6, 128), std(this.theme.walkway, {roughness: 0.9}));
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.y = 0.005;
    walkway.receiveShadow = true;
    this.scene.add(walkway);
    if (this.theme.glow) {  // the space station's walkway has light strips along both edges
      for (const r of [RING - 1.6, RING + 1.6]) {
        const strip = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.06, 128), this.glow(0x5FD3FF, 1.2));
        strip.rotation.x = -Math.PI / 2;
        strip.position.y = 0.012;
        this.scene.add(strip);
      }
    }
  }

  // The theme's small decoration: a potted plant, a pine, a glowing beacon, or a reading lamp.
  prop(pos, size = 1, clay = false) {
    const kind = THEMES[this.kind].prop;
    if (kind === 'plant') return this.plant(pos, size, clay);
    const g = new THREE.Group();
    if (kind === 'pine') {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * size, 0.12 * size, 0.6 * size, 8), std(PAL.trunk));
      trunk.position.y = 0.3 * size;
      g.add(trunk);
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((0.65 - k * 0.15) * size, 0.9 * size, 9),
          std(pick([0x4E7A4B, 0x5D8A55, 0x456E43]), {flatShading: true, roughness: 0.9}));
        cone.position.y = (0.75 + k * 0.45) * size;
        g.add(cone);
      }
    } else if (kind === 'beacon') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * size, 0.1 * size, 1.4 * size, 10), std(0x8A94A6, {metalness: 0.5}));
      post.position.y = 0.7 * size;
      const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.22 * size), this.glow(pick([0x6FE3D1, 0x8FB4FF, 0xB59CFF]), 1.4));
      light.position.y = 1.55 * size;
      this.spinners.push(light);
      g.add(post, light);
    } else {  // a reading lamp: brass pole, green shade, warm glow
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5 * size, 8), std(0xB08D4A, {metalness: 0.6, roughness: 0.4}));
      pole.position.y = 0.75 * size;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 16), std(0xB08D4A, {metalness: 0.6}));
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32 * size, 0.3 * size, 16, 1, true), std(0x2F5E46, {side: THREE.DoubleSide}));
      shade.position.y = 1.5 * size;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09 * size, 10, 8), this.glow(0xFFD9A0, 1.2));
      bulb.position.y = 1.42 * size;
      g.add(pole, base, shade, bulb);
    }
    g.position.copy(pos);
    this.scene.add(shadowed(g));
  }

  plant(pos, size = 1, clay = false) {
    const g = new THREE.Group();
    const pastel = THEMES[this.kind].pal.potWhite ? [PAL.potWhite] : [PAL.potWhite, PAL.potWhite, 0xA9C8E8, 0xF2C9B8, 0xC9E0C0, 0xE6D3F0];
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32 * size, 0.24 * size, 0.55 * size, 20),
      std(clay ? PAL.potClay : pick(pastel), {roughness: 0.6}));
    pot.position.y = 0.275 * size;
    g.add(pot);
    const blobs = 3 + Math.floor(size * 2);
    for (let i = 0; i < blobs; i++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.28, 0.42) * size, 1),
        std(pick(PAL.leaf), {roughness: 0.9, flatShading: true}));
      leaf.position.set(rand(-0.22, 0.22) * size, (0.75 + i * 0.28) * size, rand(-0.22, 0.22) * size);
      g.add(leaf);
    }
    if (Math.random() < 0.6) {  // most plants are in flower
      const color = pick(BLOSSOMS);
      for (let i = 0; i < 4 + Math.floor(size * 3); i++) {
        const a = rand(0, 6.28);
        const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075 * size, 0), std(color, {flatShading: true}));
        bloom.position.set(Math.cos(a) * 0.33 * size, rand(0.85, 0.75 + blobs * 0.28) * size, Math.sin(a) * 0.33 * size);
        g.add(bloom);
      }
    }
    g.position.copy(pos);
    g.rotation.y = rand(0, 6.28);
    this.scene.add(shadowed(g));
  }

  // The atrium's centrepiece, by theme.
  centrepiece(pos) {
    const kind = this.theme.centre;
    if (kind === 'tree') return this.tree(pos);
    const g = new THREE.Group();
    if (kind === 'core') {  // a glowing reactor column with turning rings
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.5, 48), std(0x3A4458, {metalness: 0.4}));
      plinth.position.y = 0.25;
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 5.5, 32), this.glow(0x5FD3FF, 1.1,
        {transparent: true, opacity: 0.85}));
      column.position.y = 3.2;
      g.add(plinth, column);
      for (const [y, r] of [[2.0, 1.4], [3.6, 1.1], [5.0, 1.6]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 64), this.glow(0x8FB4FF, 1.4));
        ring.position.y = y;
        ring.rotation.x = Math.PI / 2 + rand(-0.3, 0.3);
        this.spinners.push(ring);
        g.add(ring);
      }
    } else if (kind === 'campfire') {  // stones, logs and a flickering fire
      for (let k = 0; k < 12; k++) {
        const a = k / 12 * Math.PI * 2;
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.3, 0.42)), std(0x8C8A84, {flatShading: true}));
        stone.position.set(Math.cos(a) * 1.5, 0.2, Math.sin(a) * 1.5);
        g.add(stone);
      }
      for (let k = 0; k < 4; k++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.8, 8), std(0x6E4F33));
        log.rotation.z = Math.PI / 2;
        log.rotation.y = k / 4 * Math.PI;
        log.position.y = 0.2;
        g.add(log);
      }
      for (const [s, c] of [[1, 0xFF8A3D], [0.65, 0xFFC35C]]) {
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.55 * s, 1.6 * s, 10), this.glow(c, 1.6, {transparent: true, opacity: 0.9}));
        flame.position.y = 0.95 * s;
        this.flames.push(flame);
        g.add(flame);
      }
    } else if (kind === 'globe') {  // a hologram globe on a pedestal
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 1.0, 40), std(0xF4F7F9, {roughness: 0.4}));
      pedestal.position.y = 0.5;
      const globe = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16),
        new THREE.MeshBasicMaterial({color: 0x4D9FD6, wireframe: true, transparent: true, opacity: 0.55}));
      globe.position.y = 3.0;
      const glowCore = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 16), this.glow(0x9FD8F5, 0.6, {transparent: true, opacity: 0.5}));
      glowCore.position.y = 3.0;
      this.spinners.push(globe);
      g.add(pedestal, globe, glowCore);
    } else {  // 'reading': a big round reading table with books and a lamp
      const table = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.12, 40), std(PAL.deskTop, {roughness: 0.5}));
      table.position.y = 0.8;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.7, 0.8, 20), std(PAL.deskLeg));
      foot.position.y = 0.4;
      g.add(table, foot);
      for (let k = 0; k < 5; k++) {
        const stack = new THREE.Mesh(new THREE.BoxGeometry(rand(0.4, 0.6), rand(0.15, 0.4), 0.32),
          std(pick([0xC47A62, 0x5B7DB1, 0x6E9C7A, 0xC0975A, 0x8A7DB3])));
        const a = k / 5 * Math.PI * 2;
        stack.position.set(Math.cos(a) * 1.2, 0.9 + stack.geometry.parameters.height / 2, Math.sin(a) * 1.2);
        stack.rotation.y = a;
        g.add(stack);
      }
      g.position.copy(pos);
      this.scene.add(shadowed(g));
      return this.prop(pos.clone().setY(0).add(new THREE.Vector3(0, 0.86, 0)), 0.9);  // a lamp on the table
    }
    g.position.copy(pos);
    this.scene.add(shadowed(g));
  }

  tree(pos) {
    const g = new THREE.Group();
    const planter = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.55, 48), std(0xF1EEE8, {roughness: 0.55}));
    planter.position.y = 0.275;
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.05, 48), std(0x6E5A45, {roughness: 1}));
    soil.position.y = 0.56;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 4.2, 12), std(PAL.trunk, {roughness: 0.9}));
    trunk.position.y = 2.6;
    g.add(planter, soil, trunk);
    for (let i = 0; i < 9; i++) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.9, 1.5), 1),
        std(pick(PAL.leaf), {roughness: 0.9, flatShading: true}));
      const a = i / 9 * 6.28;
      crown.position.set(Math.cos(a) * rand(0.4, 1.3), rand(4.4, 5.8), Math.sin(a) * rand(0.4, 1.3));
      g.add(crown);
    }
    g.position.copy(pos);
    this.scene.add(shadowed(g));
  }

  desk(pos, yaw, {width = 1.4, depth = 0.72, monitor = true} = {}) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new RoundedBoxGeometry(width, 0.05, depth, 2, 0.02), std(PAL.deskTop, {roughness: 0.6}));
    top.position.y = 0.74;
    g.add(top);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, depth - 0.1), std(PAL.deskLeg));
      leg.position.set(sx * (width / 2 - 0.06), 0.36, 0);
      g.add(leg);
    }
    let screen = null;
    if (monitor) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.05), std(PAL.monitor));
      stand.position.set(0, 0.89, -depth * 0.22);
      const frame = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.38, 0.035, 2, 0.012), std(PAL.monitor, {roughness: 0.4}));
      frame.position.set(0, 1.13, -depth * 0.22);
      screen = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32),
        new THREE.MeshStandardMaterial({color: PAL.screen, emissive: PAL.screen, emissiveIntensity: 0.15}));
      screen.position.set(0, 1.13, -depth * 0.22 + 0.02);
      const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.13), std(0xF2F2F0));
      keyboard.position.set(0, 0.773, depth * 0.12);
      g.add(stand, frame, screen, keyboard);
    }
    g.position.copy(pos);
    g.rotation.y = yaw;
    this.scene.add(shadowed(g));
    return screen;
  }

  chair(pos, yaw, color = PAL.chair) {
    const g = new THREE.Group();
    const mat = std(color, {roughness: 0.8});
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.48, 0.07, 0.46, 2, 0.03), mat);
    seat.position.y = 0.47;
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.5, 0.06, 2, 0.03), mat);
    back.position.set(0, 0.78, -0.22);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), std(0xD8DADD));
    post.position.y = 0.23;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 20), std(0xD8DADD));
    base.position.y = 0.02;
    g.add(seat, back, post, base);
    g.position.copy(pos);
    g.rotation.y = yaw;
    this.scene.add(shadowed(g));
  }

  whiteboard(pos, yaw, accent) {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 0.05, 2, 0.02), std(0xFBFBFA, {roughness: 0.3}));
    board.position.y = 1.45;
    g.add(board);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 8), std(0xC9CDD2));
      leg.position.set(sx * 1.0, 1.0, -0.04);
      g.add(leg);
    }
    const ink = [accent, '#3E4756', '#9AA0A8'];
    for (let k = 0; k < 5; k++) {  // a few lines of "notes"
      const line = new THREE.Mesh(new THREE.BoxGeometry(rand(0.5, 1.5), 0.035, 0.01), std(ink[k % 3]));
      line.position.set(rand(-0.3, 0.1), 1.8 - k * 0.17, 0.03);
      g.add(line);
    }
    g.position.copy(pos);
    g.rotation.y = yaw;
    this.scene.add(shadowed(g));
  }

  bookshelf(pos, yaw) {
    const g = new THREE.Group();
    const wood = std(PAL.deskTop, {roughness: 0.7});
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.7, 0.45), wood);
    frame.position.y = 0.85;
    g.add(frame);
    const books = [0xC47A62, 0x5B7DB1, 0x6E9C7A, 0xC0975A, 0x8A7DB3, 0xE9E4DC, 0x3E4756];
    for (let shelf = 0; shelf < 3; shelf++) {
      let x = -0.88;
      while (x < 0.8) {
        const w = rand(0.06, 0.12);
        const h = rand(0.28, 0.4);
        const book = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.3), std(pick(books), {roughness: 0.8}));
        book.position.set(x + w / 2, 0.2 + shelf * 0.52 + h / 2, 0.1);
        g.add(book);
        x += w + 0.01;
      }
    }
    g.position.copy(pos);
    g.rotation.y = yaw;
    this.scene.add(shadowed(g));
  }

  // ── themed furniture: each world furnishes its hubs its own way ──────
  // Every piece is built in a group at the origin facing +z, then placed. `sc` is the hub's colour scheme.
  place(g, pos, yaw = 0) {
    g.position.copy(pos);
    g.rotation.y = yaw;
    this.scene.add(shadowed(g));
    return g;
  }

  // Where someone works. Returns the part that lights up while they work (a screen, a hologram, a lantern or a lamp).
  workstation(pos, yaw, sc, {width = 1.4, depth = 0.72} = {}) {
    const kind = this.kind;
    if (kind === 'office' || !THEMES[kind]) {
      const screen = this.desk(pos, yaw, {width, depth});
      const g = new THREE.Group();  // a mug or a little flowering pot in the hub's colours
      if (Math.random() < 0.5) {
        const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 12), std(pick([sc.bright, sc.accent, sc.accent2])));
        mug.position.set(width / 2 - 0.2, 0.82, 0.1);
        g.add(mug);
      } else {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 0.1, 12), std(sc.light));
        pot.position.set(-width / 2 + 0.18, 0.82, -0.1);
        const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), std(pick(sc.flowers), {flatShading: true}));
        bloom.position.set(-width / 2 + 0.18, 0.93, -0.1);
        g.add(pot, bloom);
      }
      this.place(g, pos, yaw);
      return screen;
    }
    const g = new THREE.Group();
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    const box = (w, h, d, mat, x, y, z, r = 0.02) => add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat), x, y, z);
    let screen;
    if (kind === 'space') {  // a console with a glowing edge and a floating hologram panel
      box(width, 0.08, depth, std(0x3A4458, {metalness: 0.5, roughness: 0.35}), 0, 0.74, 0);
      box(width * 0.9, 0.66, depth * 0.55, std(0x2A3142, {metalness: 0.4}), 0, 0.36, -depth * 0.15, 0.05);
      box(width, 0.025, 0.03, this.glow(sc.bright, 1.2), 0, 0.74, depth / 2);
      box(0.5, 0.01, 0.16, this.glow(sc.light, 0.6), 0, 0.785, depth * 0.12);  // a light keyboard
      screen = add(new THREE.Mesh(new THREE.PlaneGeometry(width * 0.5, 0.36), new THREE.MeshStandardMaterial({
        color: sc.light, emissive: sc.bright, emissiveIntensity: 0.15, transparent: true, opacity: 0.72, side: THREE.DoubleSide})),
        0, 1.18, -depth * 0.2);
      screen.rotation.x = -0.15;
    } else if (kind === 'forest') {  // a log table on two stumps, with a lantern and an open notebook
      const wood = std(0xB3875A, {roughness: 0.9});
      box(width, 0.1, depth, wood, 0, 0.72, 0, 0.04);
      const bark = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, width, 10), std(0x6E4F33, {roughness: 1}));
      bark.rotation.z = Math.PI / 2;
      add(bark, 0, 0.7, depth / 2);
      for (const x of [-width / 2 + 0.22, width / 2 - 0.22]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.68, 10), std(0x7A5A3A, {roughness: 1})), x, 0.34, 0);
      }
      box(0.16, 0.24, 0.16, std(0x3B332B, {metalness: 0.3}), width / 2 - 0.28, 0.89, -0.16);  // lantern frame
      screen = add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.17), new THREE.MeshStandardMaterial({
        color: 0xFFE2A0, emissive: 0xFFC35C, emissiveIntensity: 0.15})), width / 2 - 0.28, 0.89, -0.16);
      for (const [x, rot] of [[-0.11, 0.12], [0.11, -0.12]]) {  // an open notebook
        const page = box(0.2, 0.015, 0.28, std(0xFBF7EE), x, 0.785, 0.02, 0.005);
        page.rotation.z = rot;
      }
      box(0.14, 0.02, 0.2, std(sc.bright), -width / 2 + 0.3, 0.785, -0.12, 0.005);  // a coloured map case
    } else if (kind === 'lab') {  // a white bench with coloured drawers, a tablet screen and a rack of test tubes
      box(width, 0.06, depth, std(0xF7F9FA, {roughness: 0.3}), 0, 0.74, 0);
      box(width * 0.42, 0.68, depth * 0.85, std(0xE4EAEE), -width * 0.27, 0.36, 0);
      for (let k = 0; k < 3; k++) box(width * 0.38, 0.17, 0.02, std(k % 2 ? sc.light : sc.bright), -width * 0.27, 0.58 - k * 0.21, depth * 0.43, 0.01);
      box(0.05, 0.68, depth * 0.85, std(0xC9D2D8), width / 2 - 0.05, 0.36, 0);
      box(0.5, 0.32, 0.03, std(0x2F3338), 0.05, 1.02, -depth * 0.25);
      screen = add(new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.26), new THREE.MeshStandardMaterial({
        color: 0xD8F1F5, emissive: 0x7FD6E8, emissiveIntensity: 0.15})), 0.05, 1.02, -depth * 0.25 + 0.017);
      box(0.3, 0.04, 0.1, std(0xBFC8CF), width / 2 - 0.3, 0.8, 0.1);
      [sc.bright, sc.accent, sc.accent2].forEach((c, k) => add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8),
        std(c, {transparent: true, opacity: 0.85, emissive: c, emissiveIntensity: 0.2})), width / 2 - 0.4 + k * 0.1, 0.9, 0.1));
    } else {  // library: a dark study desk with a green banker's lamp, an open book and a little stack
      const wood = std(PAL.deskTop, {roughness: 0.55});
      box(width, 0.06, depth, wood, 0, 0.74, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.72, 8), std(PAL.deskLeg)), sx * (width / 2 - 0.08), 0.36, sz * (depth / 2 - 0.08));
      }
      box(width - 0.2, 0.12, 0.03, std(PAL.deskLeg), 0, 0.64, -depth / 2 + 0.06);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), std(0xB08D4A, {metalness: 0.6})), -width / 2 + 0.3, 0.92, -0.18);
      const shade = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 14, 1, false, 0, Math.PI), std(0x2F6B4F, {side: THREE.DoubleSide})),
        -width / 2 + 0.3, 1.07, -0.12);
      shade.rotation.z = Math.PI / 2;
      shade.rotation.y = Math.PI / 2;
      screen = add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.03, 0.06), new THREE.MeshStandardMaterial({
        color: 0xFFE7B8, emissive: 0xFFC97A, emissiveIntensity: 0.15})), -width / 2 + 0.3, 1.02, -0.12);
      for (const [x, rot] of [[-0.12, 0.1], [0.12, -0.1]]) {
        const page = box(0.22, 0.02, 0.3, std(0xF6EEDC), x + 0.15, 0.785, 0.04, 0.005);
        page.rotation.z = rot;
      }
      [sc.main, sc.accent, sc.light].forEach((c, k) => box(0.3, 0.06, 0.22, std(c), width / 2 - 0.25, 0.8 + k * 0.065, -0.15, 0.01));
    }
    this.place(g, pos, yaw);
    return screen;
  }

  // Where someone sits, in the theme's style, with a seat in the hub's colours.
  seat(pos, yaw, sc) {
    const kind = this.kind;
    const g = new THREE.Group();
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    if (kind === 'space') {  // an egg chair on a glowing ring
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.12, 20), std(sc.bright, {roughness: 0.5})), 0, 0.47, 0);
      const shell = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.27, 0.55, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8),
        std(0xDCE3EC, {side: THREE.DoubleSide, roughness: 0.4})), 0, 0.72, 0);
      shell.rotation.y = Math.PI;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4, 10), std(0x8A94A6, {metalness: 0.6})), 0, 0.22, 0);
      const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 28), this.glow(sc.bright, 1.1)), 0, 0.03, 0);
      ring.rotation.x = Math.PI / 2;
    } else if (kind === 'forest') {  // a tree stump with a cushion
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.42, 12), std(0x7A5A3A, {roughness: 1})), 0, 0.21, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.02, 16), std(0xD9B98A)), 0, 0.425, 0);
      const cushion = add(new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.07, 0.36, 2, 0.03), std(sc.bright, {roughness: 0.95})), 0, 0.46, 0);
      cushion.rotation.y = 0.4;
    } else if (kind === 'lab') {  // a round lab stool
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 20), std(sc.bright, {roughness: 0.6})), 0, 0.5, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.46, 8), std(0xC9D2D8, {metalness: 0.6})), 0, 0.25, 0);
      const foot = add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 6, 20), std(0xC9D2D8, {metalness: 0.6})), 0, 0.2, 0);
      foot.rotation.x = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 20), std(0xC9D2D8)), 0, 0.01, 0);
    } else if (kind === 'library') {  // a wooden chair with spindles and a coloured cushion
      const wood = std(PAL.deskLeg, {roughness: 0.6});
      add(new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.05, 0.44, 2, 0.02), wood), 0, 0.45, 0);
      add(new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.05, 0.38, 2, 0.02), std(sc.bright, {roughness: 0.95})), 0, 0.49, 0.01);
      for (const x of [-0.2, 0.2]) for (const z of [-0.19, 0.19]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 6), wood), x, 0.22, z);
      }
      for (const x of [-0.14, 0, 0.14]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), wood), x, 0.72, -0.2);
      add(new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.07, 0.05, 2, 0.02), wood), 0, 0.96, -0.2);
    } else {  // office: a task chair in the hub's colour
      return this.chair(pos, yaw, sc.bright);
    }
    this.place(g, pos, yaw);
  }

  // The hub's table, where the team can meet: in the theme's style, with something colourful on it.
  meetingTable(pos, radius, sc) {
    const kind = this.kind;
    const g = new THREE.Group();
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    const h = 1.05;
    if (kind === 'space') {
      add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, 0.1, 40), std(0x3A4458, {metalness: 0.5})), 0, h, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.4, radius * 0.5, h, 20), std(0x2A3142, {metalness: 0.4})), 0, h / 2, 0);
      const edge = add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.03, 8, 64), this.glow(sc.bright, 1.2)), 0, h + 0.03, 0);
      edge.rotation.x = Math.PI / 2;
      const holo = add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), new THREE.MeshBasicMaterial({
        color: sc.light, wireframe: true, transparent: true, opacity: 0.8})), 0, h + 0.55, 0);
      this.spinners.push(holo);
    } else if (kind === 'forest') {  // a big stump with a lantern and mushrooms
      add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, h, 16), std(0x7A5A3A, {roughness: 1})), 0, h / 2, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.02, radius - 0.02, 0.02, 24), std(0xD9B98A)), 0, h + 0.01, 0);
      for (const r of [0.35, 0.65]) {
        const ring = add(new THREE.Mesh(new THREE.TorusGeometry(radius * r, 0.012, 4, 32), std(0xB08E62)), 0, h + 0.025, 0);
        ring.rotation.x = Math.PI / 2;
      }
      add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.16), this.glow(0xFFC35C, 0.8)), 0, h + 0.14, 0);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + 0.4;
        this.mushroom(g, new THREE.Vector3(Math.cos(a) * (radius + 0.25), 0, Math.sin(a) * (radius + 0.25)), rand(0.7, 1.1));
      }
    } else {
      const top = kind === 'lab' ? 0xF7F9FA : PAL.deskTop;
      add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 40), std(top, {roughness: kind === 'lab' ? 0.3 : 0.6})), 0, h, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 10), std(PAL.deskLeg)), 0, h / 2, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius * 0.5, 0.04, 28), std(PAL.deskLeg)), 0, 0.02, 0);
      if (kind === 'lab') {  // a glowing flask
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.14, 0.3, 14), this.glow(sc.bright, 0.6, {transparent: true, opacity: 0.85})), 0, h + 0.17, 0);
      } else if (kind === 'library') {  // a candle and a stack of books
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 10), std(0xF6EEDC)), 0.15, h + 0.11, 0);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 8), this.glow(0xFFC35C, 1.4)), 0.15, h + 0.24, 0);
        [sc.main, sc.accent, sc.accent2].forEach((c, k) => add(new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.07, 0.24, 2, 0.01), std(c)),
          -0.2, h + 0.06 + k * 0.075, 0.05));
      } else {  // office: a vase of flowers
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.2, 14), std(sc.light, {roughness: 0.3})), 0, h + 0.12, 0);
        for (let k = 0; k < 5; k++) {
          add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), std(pick(sc.flowers), {flatShading: true})),
            rand(-0.08, 0.08), h + 0.27 + rand(0, 0.08), rand(-0.08, 0.08));
        }
      }
    }
    this.place(g, pos, 0);
  }

  mushroom(g, pos, size = 1) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * size, 0.06 * size, 0.18 * size, 8), std(0xF3EBDD));
    stem.position.copy(pos).setY(0.09 * size);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.13 * size, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xD9573F));
    cap.position.copy(pos).setY(0.17 * size);
    g.add(stem, cap);
    for (let k = 0; k < 3; k++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022 * size, 6, 4), std(0xFFFFFF));
      const a = k * 2.1;
      dot.position.copy(pos).add(new THREE.Vector3(Math.cos(a) * 0.08 * size, 0.27 * size, Math.sin(a) * 0.08 * size));
      g.add(dot);
    }
  }

  // One bigger piece per hub that belongs to the world: a tent, a satellite dish, a DNA sculpture, a globe…
  // (alternating between two per theme, so neighbouring hubs differ).
  themeExtra(pos, frame, sc, index) {
    const kind = this.kind;
    const alt = index % 2 === 1;
    const g = new THREE.Group();
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    if (kind === 'forest' && !alt) {  // a tent in the hub's colour, with a darker open flap
      const tent = add(new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.5, 4), std(sc.bright, {flatShading: true, roughness: 0.9})), 0, 0.75, 0);
      tent.rotation.y = Math.PI / 4;
      const flap = add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.75), std(sc.main.clone().multiplyScalar(0.55), {side: THREE.DoubleSide})), 0, 0.38, 0.71);
      flap.rotation.x = -0.45;
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), std(0x6E4F33)), 0, 1.6, 0);
      const pennant = add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 3), std(sc.accent)), 0.12, 1.68, 0);
      pennant.rotation.z = -Math.PI / 2;
    } else if (kind === 'forest') {  // a mushroom patch and a log
      for (let k = 0; k < 6; k++) this.mushroom(g, new THREE.Vector3(rand(-0.7, 0.7), 0, rand(-0.7, 0.7)), rand(0.8, 1.6));
      const log = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.6, 10), std(0x6E4F33, {roughness: 1})), 0.2, 0.2, -0.6);
      log.rotation.z = Math.PI / 2;
    } else if (kind === 'space' && !alt) {  // a satellite dish
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 1.2, 10), std(0x8A94A6, {metalness: 0.6})), 0, 0.6, 0);
      const dish = add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2),
        std(0xDCE3EC, {side: THREE.DoubleSide, metalness: 0.3})), 0, 1.25, 0);
      dish.rotation.x = Math.PI * 0.75;
      add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), this.glow(sc.bright, 1.5)), 0, 1.55, 0.35);
    } else if (kind === 'space') {  // cargo crates with glowing stripes
      for (const [x, y, z, s] of [[0, 0.35, 0, 0.7], [0.75, 0.3, 0.2, 0.6], [0.2, 0.95, 0.05, 0.5]]) {
        add(new THREE.Mesh(new RoundedBoxGeometry(s, s, s, 2, 0.05), std(0x4E5869, {metalness: 0.4})), x, y, z);
        add(new THREE.Mesh(new THREE.BoxGeometry(s + 0.01, 0.05, s + 0.01), this.glow(sc.bright, 1.0)), x, y, z);
      }
    } else if (kind === 'lab' && !alt) {  // a DNA helix sculpture in the hub's colours
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.12, 20), std(0xE4EAEE)), 0, 0.06, 0);
      for (let k = 0; k < 14; k++) {
        const a = k * 0.55;
        const y = 0.3 + k * 0.13;
        for (const [side, c] of [[1, sc.bright], [-1, sc.accent]]) {
          add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), std(c)), Math.cos(a) * 0.25 * side, y, Math.sin(a) * 0.25 * side);
        }
        const rung = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6), std(0xC9D2D8)), 0, y, 0);
        rung.rotation.z = Math.PI / 2;
        rung.rotation.y = -a;
      }
    } else if (kind === 'lab') {  // gas cylinders with coloured caps
      [[0, 0], [0.45, 0.1], [0.2, -0.4]].forEach(([x, z], k) => {
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.4, 16), std(0xEEF2F4, {metalness: 0.2})), x, 0.7, z);
        add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), std([sc.bright, sc.accent, sc.accent2][k])), x, 1.4, z);
      });
    } else if (kind === 'library' && !alt) {  // a globe on a wooden stand
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.3, 0.9, 12), std(PAL.deskLeg)), 0, 0.45, 0);
      const globe = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), std(0x5B8DB8, {roughness: 0.5})), 0, 1.32, 0);
      for (let k = 0; k < 5; k++) {  // a few continents
        const land = new THREE.Mesh(new THREE.SphereGeometry(rand(0.1, 0.18), 8, 6), std(0x8FB07A));
        const a = k * 1.3, b = rand(-0.6, 0.6);
        land.position.set(Math.cos(a) * Math.cos(b) * 0.36, Math.sin(b) * 0.36, Math.sin(a) * Math.cos(b) * 0.36);
        land.scale.set(1, 0.6, 1);
        globe.add(land);
      }
      const meridian = add(new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.018, 6, 40), std(0xB08D4A, {metalness: 0.6})), 0, 1.32, 0);
      meridian.rotation.y = Math.PI / 2;
      this.spinners.push(globe);
    } else if (kind === 'library') {  // a reading armchair with a cushion and a book tower
      const fabric = std(sc.main.clone().lerp(new THREE.Color(0x5E3B22), 0.35), {roughness: 0.95});
      add(new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.45, 0.85, 2, 0.08), fabric), 0, 0.3, 0);
      add(new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.8, 0.2, 2, 0.08), fabric), 0, 0.75, -0.35);
      for (const x of [-0.45, 0.45]) add(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.6, 0.85, 2, 0.06), fabric), x, 0.5, 0);
      add(new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.3, 0.12, 2, 0.05), std(sc.accent, {roughness: 1})), 0, 0.7, -0.18);
      for (let k = 0; k < 6; k++) {
        add(new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.09, 0.3, 2, 0.01), std(pick([sc.main, sc.accent, sc.accent2, 0xE9E4DC]))),
          0.95, 0.05 + k * 0.095, rand(-0.04, 0.04)).rotation.y = rand(-0.25, 0.25);
      }
    } else if (!alt) {  // office: a water cooler
      add(new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.9, 0.42, 2, 0.05), std(0xF4F4F2)), 0, 0.45, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 18), std(0xA8D4EE, {transparent: true, opacity: 0.75, roughness: 0.1})), 0, 1.13, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.05), std(sc.bright)), 0, 0.72, 0.22);
    } else {  // office: a poster board with colourful notes
      add(new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.9, 0.05, 2, 0.02), std(0xE8D9C0)), 0, 1.35, 0);
      for (const x of [-0.55, 0.55]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.35, 6), std(0xC9CDD2)), x, 0.68, -0.03);
      for (let k = 0; k < 8; k++) {
        const note = add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.01), std(pick([...sc.flowers.slice(0, 4), 0xFFE28A]))),
          -0.45 + (k % 4) * 0.3, 1.55 - Math.floor(k / 4) * 0.35, 0.035);
        note.rotation.z = rand(-0.15, 0.15);
      }
    }
    this.place(g, pos, frame.yaw(frame.c.clone().sub(pos).setY(0)));
  }

  // A garland along the back of the hub: flags (or, in the space station and the lab, little lights) in the hub's colours.
  garland(frame, radius, sc) {
    const lights = THEMES[this.kind].glow || this.kind === 'lab';
    const R = radius - 0.3;
    const at = (t) => frame.at(Math.sin(t) * R, -Math.cos(t) * R);
    const poles = [-0.55, 0, 0.55];
    const colors = [sc.bright, sc.accent, sc.light, sc.accent2];
    const poleMat = std(lights ? 0x8A94A6 : PAL.deskLeg, {metalness: lights ? 0.5 : 0});
    const g = new THREE.Group();
    for (const t of poles) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 2.4, 8), poleMat);
      pole.position.copy(at(t)).setY(1.2);
      g.add(pole);
    }
    const pennant = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.16, 0), new THREE.Vector2(0.16, 0),
                                                             new THREE.Vector2(0, -0.36)]));
    let n = 0;
    for (let i = 0; i < poles.length - 1; i++) {
      const [a, b] = [at(poles[i]).setY(2.3), at(poles[i + 1]).setY(2.3)];
      const steps = 9;
      const along = frame.yaw(b.clone().sub(a)) - Math.PI / 2;  // the flags hang in the line's plane
      const line = [a.clone()];
      for (let k = 1; k < steps; k++) {
        const u = k / steps;
        const p = a.clone().lerp(b, u);
        p.y -= 0.45 * (1 - (2 * u - 1) ** 2);  // the line sags in the middle
        line.push(p.clone());
        const c = colors[n++ % colors.length];
        const bit = lights
          ? new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.glow(c, 1.3))
          : new THREE.Mesh(pennant, std(c, {side: THREE.DoubleSide, roughness: 0.9}));
        bit.position.copy(p);
        if (!lights) bit.rotation.y = along;
        g.add(bit);
      }
      line.push(b.clone());
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(line), new THREE.LineBasicMaterial({color: 0x6B6157})));
    }
    this.scene.add(shadowed(g));
  }

  // Small things along the edge of a hub's floor: flowers and pebbles in the forest, glowing studs on the
  // space station, coloured floor markers in the lab. (The open office and the library keep a clean edge.)
  rimDecor(frame, radius, sc) {
    const kind = this.kind;
    if (!['forest', 'space', 'lab'].includes(kind)) return;
    const g = new THREE.Group();
    const R = radius - 0.28;
    const step = kind === 'forest' ? 0.9 : 1.3;
    const count = Math.floor(Math.PI * 2 * R / step);
    for (let k = 0; k < count; k++) {
      const t = k / count * Math.PI * 2;
      if (Math.abs(wrap(t - Math.PI)) < 0.42) continue;  // keep the entrance (towards the atrium) clear
      const p = frame.at(Math.sin(t) * R, -Math.cos(t) * R);
      if (kind === 'forest') {
        if (k % 3 === 0) {
          const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.1, 0.18)), std(0xA9A49A, {flatShading: true}));
          stone.position.copy(p).setY(0.06);
          g.add(stone);
        } else {
          for (let j = 0; j < 3; j++) {
            const off = new THREE.Vector3(rand(-0.2, 0.2), 0, rand(-0.2, 0.2));
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 4), std(0x5D8A55));
            stem.position.copy(p).add(off).setY(0.125);
            const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), std(pick(sc.flowers), {flatShading: true}));
            bloom.position.copy(p).add(off).setY(0.27);
            g.add(stem, bloom);
          }
        }
      } else if (kind === 'space') {
        const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), this.glow(sc.bright, 1.0));
        stud.position.copy(p).setY(0.03);
        g.add(stud);
      } else {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.1), std(k % 2 ? sc.bright : sc.light));
        mark.position.copy(p).setY(0.02);
        mark.rotation.y = frame.yaw(frame.s) + t;
        g.add(mark);
      }
    }
    this.scene.add(shadowed(g));
  }

  // The board beside the desks for the plain "desks" hub style, by theme.
  board(pos, yaw, dept) {
    const kind = this.kind;
    const sc = dept.scheme;
    if (kind === 'office') {
      const bookish = /research|operation|finance|legal|library|data|literature|resource/i.test(dept.name);
      return bookish ? this.bookshelf(pos, yaw) : this.whiteboard(pos, yaw, dept.color);
    }
    if (kind === 'library') return this.bookshelf(pos, yaw);
    const g = new THREE.Group();
    const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    if (kind === 'space') {  // a hologram wall
      add(new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.12, 0.4, 2, 0.04), std(0x3A4458, {metalness: 0.5})), 0, 0.06, 0);
      add(new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.1), new THREE.MeshBasicMaterial({color: sc.light, transparent: true,
        opacity: 0.35, side: THREE.DoubleSide})), 0, 1.3, 0);
      for (let k = 0; k < 5; k++) {
        add(new THREE.Mesh(new THREE.BoxGeometry(rand(0.4, 1.4), 0.04, 0.01), this.glow(k % 2 ? sc.bright : sc.accent, 1.2)),
          rand(-0.2, 0.2), 1.65 - k * 0.17, 0.01);
      }
    } else if (kind === 'forest') {  // a wooden notice board with pinned notes
      for (const x of [-0.9, 0.9]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.0, 8), std(0x6E4F33)), x, 1.0, 0);
      add(new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.1, 0.08, 2, 0.03), std(0xB3875A, {roughness: 0.9})), 0, 1.4, 0);
      const roof = add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.4), std(0x6E4F33)), 0, 2.02, 0.05);
      roof.rotation.x = 0.15;
      for (let k = 0; k < 6; k++) {
        const note = add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.01), std(pick([...sc.flowers.slice(0, 3), 0xFBF7EE]))),
          -0.6 + (k % 3) * 0.6, 1.6 - Math.floor(k / 3) * 0.42, 0.05);
        note.rotation.z = rand(-0.12, 0.12);
      }
    } else {  // lab: a chart of coloured squares, like a periodic table
      add(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.2, 0.05, 2, 0.02), std(0xFBFBFA, {roughness: 0.3})), 0, 1.45, 0);
      for (const x of [-1.0, 1.0]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 8), std(0xC9CDD2)), x, 1.0, -0.04);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) {
        if (r === 0 && c > 0 && c < 8) continue;
        add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.17, 0.01), std([sc.bright, sc.light, sc.accent, sc.accent2][(r + c) % 4])),
          -0.8 + c * 0.2, 1.8 - r * 0.22, 0.03);
      }
    }
    this.place(g, pos, yaw);
  }

  // A hub's floor area: a soft tint of its colour (on a dark space-station floor, a dark tint with a glowing edge).
  rugColors(color, kind = this.kind) {
    const t = THEMES[kind];
    if (t.glow) return [new THREE.Color(color).lerp(new THREE.Color(t.floor), 0.78), scheme(color).bright];
    // a soft but clearly coloured floor: the hub's hue, kept saturated (tinting towards white turned it grey)
    const hsl = new THREE.Color(color).getHSL({h: 0, s: 0, l: 0});
    return [new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, 0.42), t.rugLight),
            new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, 0.5), 0.58)];
  }

  rug(frame, color, radius) {
    const [fill, line] = this.rugColors(color);
    const glow = THEMES[this.kind].glow;
    const rug = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), std(fill, {roughness: 1}));
    rug.rotation.x = -Math.PI / 2;
    rug.position.copy(frame.c).setY(0.01);
    rug.receiveShadow = true;
    const edge = new THREE.Mesh(new THREE.RingGeometry(radius - (glow ? 0.08 : 0.12), radius, 96),
      new THREE.MeshBasicMaterial({color: line, transparent: true, opacity: glow ? 1 : 0.8}));
    edge.rotation.x = -Math.PI / 2;
    edge.position.copy(frame.c).setY(0.015);
    this.scene.add(rug, edge);
    return {rug, edge, kind: this.kind};
  }

  recolorRug({rug, edge, kind}, color) {
    const [fill, line] = this.rugColors(color, kind);
    rug.material.color.copy(fill);
    edge.material.color.copy(line);
  }

  sign(frame, radius, name, color, sub, state = '') {
    const t = tag('office-sign');
    this.fillSign(t, name, color, sub, state);
    t.position.copy(frame.at(0, -radius + 0.6, 3.1));
    this.scene.add(t);
    return t;
  }

  fillSign(t, name, color, sub, state = '', pct = null) {
    t.element.className = `office-sign ${state}${pct != null ? ' has-bar' : ''}`;
    t.element.innerHTML = `<span class="dot" style="background:${color}"></span><b>${esc(name)}</b>` +
      (sub ? `<span class="sub">${esc(tr(sub))}</span>` : '') +
      (pct != null ? `<span class="sign-bar"><i style="width:${pct}%;background:${color}"></i></span>` : '');
  }

  // While the Company panel is being edited: show names and colours in the office right away.
  // (Adding or removing people and departments needs a Save, which rebuilds the office.)
  preview(company) {
    this.ui.querySelector('.brand').textContent = company.name || this.company.name;
    for (const d of company.departments) {
      const hub = d.id && this.hubs[d.id];
      if (!hub) continue;
      hub.signName = d.name || hub.dept.name;
      hub.signColor = d.color;
      this.fillSign(hub.sign, hub.signName, d.color, hub.signSub, hub.signState, hub.signPct);
      this.recolorRug(hub.rugParts, d.color);
    }
    this.renderLegend(company);
  }

  // Hub signs say whether the team is working on the goal or on standby (checked once a second).
  updateSigns() {
    for (const hub of Object.values(this.hubs)) {
      const team = this.people.filter((p) => p.dept.key === hub.dept.key);
      const busy = team.filter((p) => p.live && ['working', 'waiting', 'queued'].includes(p.live.status)).length;
      const prog = this.link?.progress?.[hub.dept.key] || null;  // (only hubs of running goals have progress)
      const state = busy || prog ? 'working' : 'standby';
      const sub = prog ? (prog.planning ? 'Planning…' : prog.pct >= 100 ? 'Done ✓'
                          : `${prog.pct}% · ${prog.eta_s < 60 ? '<1 min' : `~${Math.round(prog.eta_s / 60)} min`} left`)
        : busy ? `Working · ${busy} busy` : `Standby · ${plural(hub.dept.interns.length, 'mini agent')}`;
      const key = sub + (prog ? prog.pct : '');
      if (key === hub.signKey) continue;
      hub.signKey = key;
      hub.signSub = sub;
      hub.signState = state;
      hub.signPct = prog && !prog.planning ? prog.pct : null;
      this.fillSign(hub.sign, hub.signName || hub.dept.name, hub.signColor || hub.dept.color, sub, state, hub.signPct);
    }
  }

  buildHub(dept, frame) {
    const {pods, radius, outer} = dept.size;
    const sc = dept.scheme;
    const hub = {dept, frame, desks: [], visit: [], table: [], screens: []};
    this.hubs[dept.key] = hub;
    hub.rugParts = this.rug(frame, dept.color, radius);
    const entry = frame.at(0, radius - 0.3);
    const fronts = new Map();  // shared way points, so routes inside the hub share their tails
    const front = (s) => fronts.get(s) || fronts.set(s, frame.at(s, 2.3)).get(s);
    for (let i = 0; i < pods * POD; i++) {
      const podS = (Math.floor(i / POD) - (pods - 1) / 2) * POD_PITCH;
      const j = i % POD;
      const sgn = j % 2 ? 1 : -1;
      const side = podS + sgn * 0.75;
      const row = j < 2 ? -1 : 1;
      const faceIn = frame.f.clone().multiplyScalar(-row);  // chair faces the divider
      const screen = this.workstation(frame.at(side, row * 0.4), frame.yaw(faceIn.clone().negate()), sc);
      this.seat(frame.at(side, row * 1.2), frame.yaw(faceIn), sc);
      const aisleS = podS + sgn * POD_PITCH / 2;
      const aisle = frame.at(aisleS, row * 1.25);
      const way = [aisle, front(aisleS), entry];
      hub.desks.push(new Spot(dept.key, frame.at(side, row * 1.12), faceIn, way, 'sit'));
      hub.visit.push(new Spot(dept.key, frame.at(podS + sgn * 1.75, row * 1.25), frame.s.clone().multiplyScalar(-sgn), way));
      hub.screens.push(screen);
    }
    // the team's table at the back of the hub, with standing room for everyone
    const count = dept.interns.length;
    const ringR = Math.min(2.6, Math.max(1.55, count * 0.22));
    const table = frame.at(0, -(radius - ringR - 1.0));
    this.meetingTable(table, Math.max(0.75, ringR - 1.1), sc);
    const back = {'-1': frame.at(-outer, -(radius - ringR - 1.0)), '1': frame.at(outer, -(radius - ringR - 1.0))};
    const outerFront = {'-1': front(-outer), '1': front(outer)};
    const places = Math.max(6, count + 1);
    for (let k = 0; k < places; k++) {
      const a = (k / places) * Math.PI * 2 + 0.5;
      const pos = table.clone().add(new THREE.Vector3(Math.cos(a) * ringR, 0, Math.sin(a) * ringR));
      const sgn = frame.s.dot(pos.clone().sub(frame.c)) >= 0 ? '1' : '-1';
      hub.table.push(new Spot(dept.key, pos, table.clone().sub(pos).normalize(), [back[sgn], outerFront[sgn], entry]));
    }
    // the hub manager's desk, on the side, facing the team
    const faceTeam = frame.s.clone().negate();
    hub.managerScreen = this.workstation(frame.at(outer + 1.3, -0.2), frame.yaw(frame.s), sc, {width: 1.6, depth: 0.8});
    this.seat(frame.at(outer + 2.1, -0.2), frame.yaw(faceTeam), sc);
    hub.managerDesk = new Spot(dept.key, frame.at(outer + 2.0, -0.2), faceTeam, [frame.at(outer + 2.0, 2.3), entry], 'sit');
    hub.managerVisit = new Spot(dept.key, frame.at(outer + 0.35, -0.95), frame.s.clone(), [outerFront['1'], entry]);
    this.hubDecor(dept, frame, outer, radius);
    this.themeExtra(frame.at(radius - 1.4, -radius * 0.4), frame, sc, this.zones.indexOf(dept.key));
    this.prop(frame.at(-(outer + 1.1), 2.7), 0.8);
    this.garland(frame, radius, sc);
    this.rimDecor(frame, radius, sc);
    hub.sign = this.sign(frame, radius, dept.name, dept.color, `Standby · ${plural(count, 'mini agent')}`, 'standby');
  }

  // A hub's style decides the furniture in its two free spots: beside the desks (A, long side along the hub)
  // and the back-left corner (B, compact). The desks themselves stay, so the team always has somewhere to work.
  hubDecor(dept, frame, outer, radius) {
    const a = frame.at(-(outer + 1.1), 0.3);
    const b = frame.at(-(radius - 1.4), -radius * 0.45);
    const faceIn = frame.yaw(frame.s);       // A's front faces the desks
    const faceB = frame.yaw(frame.c.clone().sub(b).setY(0));  // B faces the hub's centre
    const style = dept.style || 'desks';
    const piece = (build, pos, yaw) => {
      const g = new THREE.Group();
      build(g);
      g.position.copy(pos);
      g.rotation.y = yaw;
      this.scene.add(shadowed(g));
    };
    const box = (g, w, h, d, color, x, y, z, extra = {}) => {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.15), std(color, extra));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    switch (style) {
      case 'lab':
        piece((g) => {  // a long white bench with glowing flasks and a microscope
          box(g, 2.2, 0.08, 0.7, 0xF7F9FA, 0, 0.9, 0);
          box(g, 2.1, 0.86, 0.6, 0xDDE4E8, 0, 0.43, 0);
          [0x5FD3FF, 0x8FE3A0, 0xFFB36B, 0xD9A3FF].forEach((c, k) => {
            const flask = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.28, 12),
              this.glow(c, 0.5, {transparent: true, opacity: 0.8}));
            flask.position.set(-0.8 + k * 0.32, 1.08, 0.05);
            g.add(flask);
          });
          box(g, 0.22, 0.4, 0.22, 0x2F3338, 0.75, 1.14, 0);
        }, a, faceIn);
        piece((g) => {  // a fume hood
          box(g, 1.1, 1.9, 0.7, 0xE9EEF1, 0, 0.95, 0);
          const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7),
            new THREE.MeshStandardMaterial({color: 0xBFE3F2, transparent: true, opacity: 0.45}));
          glass.position.set(0, 1.25, 0.36);
          g.add(glass);
        }, b, faceB);
        break;
      case 'greenhouse':
        piece((g) => {  // a raised planter bed full of seedlings
          box(g, 2.2, 0.45, 0.8, 0x9C7A55, 0, 0.22, 0);
          box(g, 2.05, 0.04, 0.68, 0x5E4A36, 0, 0.46, 0);
          for (let k = 0; k < 6; k++) {
            const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.14, 0.22), 0),
              std(pick(PALETTE.leaf), {flatShading: true}));
            leaf.position.set(-0.85 + k * 0.34, 0.6, rand(-0.15, 0.15));
            g.add(leaf);
          }
        }, a, faceIn);
        this.plant(b, 1.5, true);
        for (let k = 0; k < 5; k++) {  // more greenery around the back edge, and a few glass panes
          const ang = Math.PI * (1.15 + k * 0.175);  // the back half of the hub (away from the atrium)
          const p = frame.at(Math.cos(ang) * (radius - 0.6), Math.sin(ang) * (radius - 0.6));
          if (k % 2) this.plant(p, rand(0.7, 1.0));
          else {
            const pane = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.4, 0.04),
              new THREE.MeshStandardMaterial({color: 0xD6EEF2, transparent: true, opacity: 0.28, roughness: 0.1}));
            pane.position.copy(p).setY(1.2);
            pane.lookAt(frame.c.clone().setY(1.2));
            this.scene.add(pane);
          }
        }
        break;
      case 'workshop':
        piece((g) => {  // a heavy workbench with a tool board
          box(g, 2.2, 0.12, 0.8, 0xA67C52, 0, 0.9, 0);
          for (const x of [-0.95, 0.95]) for (const z of [-0.3, 0.3]) box(g, 0.1, 0.85, 0.1, 0x5E4A36, x, 0.43, z);
          box(g, 2.0, 1.0, 0.05, 0xC9B79C, 0, 1.6, -0.38);
          for (let k = 0; k < 6; k++) box(g, 0.08, rand(0.25, 0.5), 0.04, pick([0x3E4756, 0xC47A62, 0x5B7DB1]), -0.8 + k * 0.32, 1.6, -0.33);
          box(g, 0.4, 0.22, 0.25, 0xC4553B, 0.6, 1.07, 0.1);
        }, a, faceIn);
        piece((g) => {  // stacked crates
          box(g, 0.75, 0.6, 0.75, 0xB08D5E, 0, 0.3, 0);
          box(g, 0.6, 0.5, 0.6, 0xC9A06C, 0.08, 0.85, 0.05);
          box(g, 0.6, 0.45, 0.6, 0xA67C52, 0.75, 0.23, 0.15);
        }, b, faceB);
        break;
      case 'studio':
        piece((g) => {  // two easels with canvases in the hub's colours
          [-0.55, 0.55].forEach((x, k) => {
            for (const dx of [-0.25, 0.25]) {
              const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), std(0x8B6B4A));
              leg.position.set(x + dx, 0.9, 0);
              leg.rotation.z = dx * 0.25;
              g.add(leg);
            }
            const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.6, 0.03),
              std(k ? tint(dept.color, 0.3) : tint(dept.color, 0.7)));
            canvas.position.set(x, 1.35, 0.05);
            canvas.rotation.x = -0.12;
            g.add(canvas);
          });
        }, a, faceIn);
        piece((g) => {  // a mood board of colour swatches
          box(g, 1.1, 1.3, 0.05, 0xFBFBFA, 0, 1.25, 0);
          for (let k = 0; k < 6; k++) box(g, 0.28, 0.28, 0.02, pick([dept.color, 0xC47A62, 0x8A7DB3, 0xC0975A, 0x6E9C7A]),
            -0.33 + (k % 3) * 0.33, 1.45 - Math.floor(k / 3) * 0.4, 0.04);
          for (const x of [-0.45, 0.45]) box(g, 0.05, 0.6, 0.05, 0xC9CDD2, x, 0.3, 0);
        }, b, faceB);
        break;
      case 'library':
        this.bookshelf(a, faceIn);
        piece((g) => {  // a reading armchair
          box(g, 0.9, 0.45, 0.85, PAL.sofa, 0, 0.3, 0);
          box(g, 0.9, 0.8, 0.2, PAL.sofa, 0, 0.75, -0.35);
          for (const x of [-0.42, 0.42]) box(g, 0.14, 0.55, 0.85, PAL.sofa, x, 0.5, 0);
        }, b, faceB);
        break;
      case 'lounge':
        piece((g) => {  // a long sofa
          box(g, 2.2, 0.45, 0.85, PAL.sofa, 0, 0.3, 0, {roughness: 0.95});
          box(g, 2.2, 0.6, 0.22, PAL.sofa, 0, 0.7, -0.32, {roughness: 0.95});
        }, a, faceIn);
        piece((g) => {  // beanbags around a low table
          const table = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24), std(PAL.deskTop));
          table.position.y = 0.4;
          g.add(table);
          [[-0.75, 0], [0.7, 0.3]].forEach(([x, z]) => {
            const bag = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 12), std(tint(dept.color, 0.25), {roughness: 1}));
            bag.scale.set(1, 0.6, 1);
            bag.position.set(x, 0.27, z);
            g.add(bag);
          });
        }, b, faceB);
        break;
      default:  // desks: a board that suits the world (whiteboard, bookshelf, hologram wall, notice board…)
        this.board(a, faceIn, dept);
        this.prop(b, 1.1, true);
    }
  }

  buildAtrium() {
    this.centrepiece(new THREE.Vector3(0, 0, 0));
    // benches around the centrepiece, in the world's style, with cushions in the hubs' colours
    const kind = this.kind;
    const cushions = this.company.departments.map((d) => scheme(d.color).bright);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const g = new THREE.Group();
      if (kind === 'forest') {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 2.2, 12), std(0x7A5A3A, {roughness: 1}));
        log.rotation.z = Math.PI / 2;
        log.position.y = 0.28;
        g.add(log);
      } else {
        g.add(new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.42, 0.6, 2, 0.08), std(kind === 'space' ? 0x4E5869 : PAL.deskTop, {roughness: 0.7})));
        g.children[0].position.y = 0.21;
        if (this.theme.glow) {
          const strip = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.03, 0.62), this.glow(0x5FD3FF, 1.0));
          strip.position.y = 0.05;
          g.add(strip);
        }
      }
      for (const x of [-0.55, 0.55]) {
        const c = new THREE.Mesh(new RoundedBoxGeometry(0.75, 0.1, 0.5, 2, 0.04), std(cushions[(k * 2 + (x > 0)) % (cushions.length || 1)] || 0xF2C9B8, {roughness: 1}));
        c.position.set(x, kind === 'forest' ? 0.6 : 0.47, 0);
        g.add(c);
      }
      g.position.set(Math.sin(a) * 4.2, 0, Math.cos(a) * 4.2);
      g.rotation.y = a + Math.PI / 2;
      this.scene.add(shadowed(g));
      // two seats per bench (facing out over the floor), and a pair of chat spots a little further out
      const out = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const along = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const seats = [-0.55, 0.55].map((x) => this.atriumSpot(out.clone().multiplyScalar(4.32).addScaledVector(along, x), out, 'sit'));
      seats[0].partner = seats[1];
      seats[1].partner = seats[0];
      this.spots.seats.push(...seats);
      const b = a + Math.PI / 6;  // between two benches
      const mid = new THREE.Vector3(Math.sin(b), 0, Math.cos(b)).multiplyScalar(7.2);
      const side = new THREE.Vector3(Math.cos(b), 0, -Math.sin(b));
      const pair = [-0.55, 0.55].map((x) => this.atriumSpot(mid.clone().addScaledVector(side, x), side.clone().multiplyScalar(-Math.sign(x))));
      pair[0].partner = pair[1];
      pair[1].partner = pair[0];
      this.spots.chat.push(...pair);
    }
    // places to stroll to along the outer edge of the walkway
    for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) / 16 * Math.PI * 2;
      const spot = this.atriumSpot(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(RING + 1.1),
                                   new THREE.Vector3(Math.sin(a + 1.2), 0, Math.cos(a + 1.2)));
      spot.zone = `ring-${k}`;  // each its own zone, so walks between them follow the ring
      this.spots.stroll.push(spot);
    }
  }

  atriumSpot(pos, face, pose = 'stand') {
    const spot = new Spot('atrium', pos, face.clone().normalize(), [], pose);
    spot.angle = Math.atan2(pos.x, pos.z);
    return spot;
  }

  buildGreenery(rHub) {
    const n = this.zones.length;
    for (let i = 0; i < n; i++) {
      const a = this.zoneTurn + (i + 0.5) * this.zoneStep;
      this.prop(new THREE.Vector3(Math.sin(a + 0.06) * (rHub + 4), 0, Math.cos(a + 0.06) * (rHub + 4)), 1.4, i % 2 === 0);
      this.prop(new THREE.Vector3(Math.sin(a) * (RING + 3.6), 0, Math.cos(a) * (RING + 3.6)), 0.8);
      this.scatter(new THREE.Vector3(Math.sin(a - 0.05) * (RING + 7), 0, Math.cos(a - 0.05) * (RING + 7)));
    }
  }

  // A small cluster between hubs: flowering bushes and rocks outdoors, glowing crystals on the space station,
  // flower boxes indoors.
  scatter(pos) {
    const kind = this.kind;
    const g = new THREE.Group();
    if (kind === 'space') {
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(rand(0.2, 0.45)), this.glow(pick([0x6FE3D1, 0x8FB4FF, 0xB59CFF, 0xFF9FD0]), 0.9,
          {transparent: true, opacity: 0.85, flatShading: true}));
        c.scale.y = rand(1.6, 2.4);
        c.position.set(rand(-0.6, 0.6), 0.4, rand(-0.6, 0.6));
        c.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
        g.add(c);
      }
    } else if (kind === 'forest') {
      for (let k = 0; k < 3; k++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.35, 0.55), 1), std(pick([0x5D8A55, 0x6E9C5F, 0x4E7A4B]), {flatShading: true}));
        bush.position.set(rand(-0.7, 0.7), 0.3, rand(-0.7, 0.7));
        g.add(bush);
        const color = pick(BLOSSOMS);
        for (let j = 0; j < 5; j++) {
          const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), std(color, {flatShading: true}));
          b.position.copy(bush.position).add(new THREE.Vector3(rand(-0.35, 0.35), rand(0.1, 0.35), rand(-0.35, 0.35)));
          g.add(b);
        }
      }
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4), std(0xA9A49A, {flatShading: true}));
      rock.position.set(0.9, 0.2, -0.4);
      rock.scale.y = 0.6;
      g.add(rock);
    } else {  // a long flower box
      const wood = kind === 'library' ? PAL.deskTop : kind === 'lab' ? 0xE4EAEE : 0xC9A06C;
      const box = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.4, 0.45, 2, 0.05), std(wood));
      box.position.y = 0.2;
      g.add(box);
      for (let k = 0; k < 7; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.09, 0.13), 0), std(pick(BLOSSOMS), {flatShading: true}));
        b.position.set(-0.65 + k * 0.22, rand(0.5, 0.6), rand(-0.08, 0.08));
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), std(pick(PALETTE.leaf), {flatShading: true}));
        leaf.position.set(-0.65 + k * 0.22, 0.42, rand(-0.1, 0.1));
        g.add(b, leaf);
      }
    }
    g.position.copy(pos);
    g.rotation.y = Math.atan2(pos.x, pos.z);
    this.scene.add(shadowed(g));
  }

  // ── staff ────────────────────────────────────────────────────────────
  hireStaff(depts, newcomers) {
    for (const dept of depts) {
      const hub = this.hubs[dept.key];
      dept.interns.forEach((intern, i) => {
        const p = new Person(this, {id: intern.id, name: intern.name, role: intern.role, dept, color: dept.color,
                                    look: dept.looks});
        p.home = hub.desks[i];
        p.visitSpot = hub.visit[i];
        p.screen = hub.screens[i];
        if (newcomers.has(intern.id)) {
          this.arrive(p);
        } else {
          p.placeAt(p.home);
          p.stay(rand(2, 12), STANDBY, {idle: true});
        }
        this.people.push(p);
        this.scene.add(p.group);
      });
      const m = hub.manager = new Person(this, {id: dept.manager.id, name: dept.manager.name, role: t('Hub manager'),
                                                dept, color: dept.color, manager: true, look: dept.looks});
      m.home = hub.managerDesk;
      m.visitSpot = hub.managerVisit;
      m.screen = hub.managerScreen;
      m.placeAt(m.home);
      m.stay(rand(4, 14), 'On standby · ready for the next goal', {idle: true});
      this.people.push(m);
      this.scene.add(m.group);
    }
    const names = [...newcomers].map((id) => this.people.find((p) => p.id === id)?.name).filter(Boolean);
    if (names.length) this.toast(names.length === 1 ? `Welcome, ${names[0]}!` : `Welcome, ${names.join(', ')}!`);
  }

  // A new hire walks in from the front edge of the floor, through the gap between hubs nearest the camera.
  arrive(p) {
    const gaps = this.zones.map((_, i) => this.zoneTurn + (i + 0.5) * this.zoneStep);
    const front = gaps.reduce((best, a) => (Math.abs(wrap(a)) < Math.abs(wrap(best)) ? a : best));
    const angle = front + rand(-0.12, 0.12);
    const door = new Spot('door', new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(this.rHub + 16),
                          new THREE.Vector3(0, 0, -1), []);
    door.angle = angle;
    p.placeAt(door);
    p.goTo(p.home, 'Arriving for their first day');
    p.stay(rand(10, 18), 'Settling in at their new desk', {idle: true, say: t('Hi everyone! 👋')});
  }

  atDesk(p) {
    return p.spot === p.home && p.current?.type === 'stay' && !p.busyWith && !this.expecting(p) && !p.live;
  }

  // What someone does next when their plan runs out.
  // People doing real work for a goal (p.live) sit at their desk, and walk only when the goal's events say so
  // (see animateEvent). Everyone else is on standby in their own hub: relaxed at their desk, now and then a
  // stretch, a chat at a teammate's desk, or a few minutes at the hub's table. Nobody pretends to work.
  plan(p) {
    if (p.live) {
      if (p.spot !== p.home) p.goTo(p.home, 'Heading back to their desk');
      p.stay(1.5, p.live.activity, {typing: p.live.status === 'working'});
      return;
    }
    const waiting = p.manager ? 'On standby · ready for the next goal' : STANDBY;
    if (p.spot !== p.home) {
      p.goTo(p.home, 'Heading back to their desk');
      p.stay(rand(15, 30), waiting, {idle: true});
      return;
    }
    if (this.expecting(p)) return p.stay(2, waiting, {idle: true});  // someone is on their way over
    const roll = Math.random();
    if (roll < 0.06 && this.tableChat(p)) return;
    if (roll < 0.13 && this.visitColleague(p)) return;
    if (roll < 0.25 && this.goToCentre(p)) return;
    if (roll < 0.33 && this.stroll(p)) return;
    if (roll < 0.43) return p.stay(rand(3, 4.5), waiting, {idle: true, stretch: true});
    p.stay(rand(14, 30), waiting, {idle: true});
  }

  // On standby, people may wander to the middle: sit on a bench (chatting with whoever sits beside them),
  // or join someone standing there for a chat.
  goToCentre(p) {
    const partnered = (list) => list.find((s) => s.taken && !s.partner.taken && s.taken.current?.type === 'stay')?.partner;
    const chat = Math.random() < 0.4;
    const list = chat ? this.spots.chat : this.spots.seats;
    const spot = partnered(list) || pick(list.filter((s) => !s.taken && !s.partner.taken));
    if (!spot) return false;
    const mate = spot.partner.taken;
    const doing = mate ? `Chatting with ${mate.name}` : chat ? 'Stretching their legs in the common area' : 'Relaxing on a bench';
    p.goTo(spot, chat ? 'Walking to the common area' : 'Heading to the benches');
    p.stay(mate ? rand(10, 16) : rand(14, 26), doing, {idle: !chat, say: mate ? pick([...STANDBY_LINES, ...REPLIES]) : undefined});
    if (!mate && Math.random() < 0.5) p.stay(rand(6, 12), doing, {idle: !chat});
    return true;
  }

  // A short walk along the walkway, to look around.
  stroll(p) {
    const spot = pick(this.spots.stroll.filter((s) => !s.taken));
    if (!spot) return false;
    p.goTo(spot, 'Taking a short walk');
    p.stay(rand(4, 8), 'Taking a short walk', {say: Math.random() < 0.3 ? pick(WALK_LINES) : undefined});
    if (Math.random() < 0.4) {  // and on to the next spot sometimes
      const next = pick(this.spots.stroll.filter((s) => !s.taken && s !== spot));
      if (next) { p.goTo(next, 'Taking a short walk'); p.stay(rand(3, 6), 'Taking a short walk'); }
    }
    return true;
  }

  // Someone wanders over to a teammate's desk (a manager to someone on their team) for a quick chat.
  visitColleague(p) {
    const team = this.people.filter((o) => o !== p && o.dept === p.dept && !o.manager && this.atDesk(o) && !o.visitSpot.taken);
    if (!team.length) return false;
    const o = pick(team);
    this.converse(p, o, pick(p.manager ? MANAGER_STANDBY : STANDBY_LINES), REPLIES, `Walking over to ${o.name}`);
    return true;
  }

  // Two teammates meet at their hub's table for a short chat, then go back to their desks.
  tableChat(p) {
    const hub = this.hubs[p.dept.key];
    const mate = pick(this.people.filter((o) => o !== p && o.dept === p.dept && this.atDesk(o)));
    const seats = hub?.table.filter((s) => !s.taken) || [];
    if (!mate || seats.length < 2) return false;
    const [a, b] = [seats[0], seats[Math.floor(seats.length / 2)]];  // across the table from each other
    mate.interrupt();
    for (const [who, spot, other, delay] of [[p, a, mate, 0], [mate, b, p, 2.2]]) {
      who.goTo(spot, `Chatting with ${other.name} at the table`);
      who.stay(delay, `Chatting with ${other.name}`);
      who.stay(7, `Chatting with ${other.name}`, {say: pick(delay ? REPLIES : STANDBY_LINES)});
    }
    return true;
  }

  // `visitor` walks to `host`'s desk and they talk; the host stays put until the visit is over.
  converse(visitor, host, opener, replies, walking) {
    host.expecting = {by: visitor, until: this.now + 60};
    visitor.goTo(host.visitSpot, walking);
    visitor.stay(4.5, `Talking with ${host.name}`, {
      say: opener,
      then: () => {
        visitor.busyWith = host;
        host.busyWith = visitor;
        host.activity = `Talking with ${visitor.name}`;
        setTimeout(() => host.say(pick(replies)), 1600);
        setTimeout(() => {
          visitor.busyWith = host.busyWith = null;
          if (host.expecting?.by === visitor) host.expecting = null;
          if (host.activity.startsWith('Talking with')) host.activity = STANDBY;
        }, 4500);
      }});
  }

  expecting(p) {
    return p.expecting && p.expecting.until > this.now;
  }

  // ── real work, made visible ──────────────────────────────────────────
  // Only conversations, plan hand-offs and reports move people; tool calls stay at the desk
  // (they come in bursts, and walking for each one would look chaotic).
  animateEvent(e) {
    const from = this.byId.get(e.frm);
    const to = this.byId.get(e.to);
    const toOwner = e.to === 'owner';
    switch (e.kind) {
      case 'message':
        if (e.frm === 'owner' && to) return to.say(t('📥 New goal: ') + clip(e.text, 60), 4.5);
        if (from && to) return this.walkTo(from, to.visitSpot, `Talking with ${to.name}`, clip(e.text, 70));
        return;
      case 'plan':
        from?.say(t('📋 Plan ready for approval'), 4.5);
        return;
      case 'report':
        if (from && toOwner) from.say('📣 ' + clip(e.text, 70), 4.5);
        return;
      case 'plan_approved':
        to?.say(t('✓ Plan approved, handing out cards'), 4);
        return;
      case 'plan_returned':
        to?.say(t('↺ Revising the plan'), 4);
        return;
      case 'ask':
        from?.say(e.about === 'question' ? t('❓ A question for the owner') : t('✋ Approval needed'), 4);
        return;
      case 'helper':
        from?.say(t('🔎 Asking a helper: ') + clip(e.text, 50), 4);
        return;
      case 'card':  // hand-ins and rework travel as messages (and animate as walks); a pass is said at the desk
        if (e.status === 'passed') from?.say(t('✓ {id} passed', {id: e.id}), 4);
        return;
      case 'goal_start':
      case 'goal_end':
      case 'notice':
        return;  // shown by the banner and toasts
    }
  }

  // Walk `p` somewhere, say something there, then (being live) head back to their desk.
  walkTo(p, spot, activity, line) {
    if (!p) return;
    if (!spot || (spot.taken && spot.taken !== p)) {  // nowhere to stand: say it from where they are
      p.say(line);
      return;
    }
    if (p.current?.type === 'stay' && p.spot === p.home) p.interrupt();  // get up now, not after the current stint
    p.goTo(spot, activity);
    p.stay(4, activity, {say: line});
  }

  // ── routing: out of the hub, round the walkway ring, into the target ──
  ringPoint(angle, p) {
    const r = RING + p.lane;
    return new THREE.Vector3(Math.sin(angle) * r, 0, Math.cos(angle) * r);
  }

  angleOf(spot) {
    return spot.angle ?? this.zoneAngle[spot.zone];
  }

  route(p, from, to) {
    if (!from) return [to.pos];
    if (from.zone === to.zone && from.zone !== 'atrium') {  // stay inside the hub: share the way out, skip the common tail
      const a = [...from.way];
      const b = [...to.way];
      while (a.length && b.length && a[a.length - 1] === b[b.length - 1]) { a.pop(); b.pop(); }
      return [...a, ...b.reverse(), to.pos];
    }
    const a1 = this.angleOf(from);
    const a2 = this.angleOf(to);
    const delta = wrap(a2 - a1);
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.18));
    const arc = [];
    for (let k = 0; k <= steps; k++) arc.push(this.ringPoint(a1 + delta * k / steps, p));
    return [...from.way, ...arc, ...[...to.way].reverse(), to.pos];
  }

  // ── overlay (company header, legend, intern card) ────────────────────
  buildOverlay() {
    const ui = document.createElement('div');
    ui.className = 'office-ui';
    ui.innerHTML = `
      <div class="office-head">
        <div class="brand" translate="no"></div>
        <div class="where">Head office · <span class="live-dot"></span> live · <span class="clock"></span></div>
      </div>
      <div class="office-legend"></div>
      <div class="office-toolbar">
        <button class="tb-menu" aria-haspopup="true" title="All menus">☰ Menu<span class="badge menu-badge" hidden></span></button>
        <div class="office-menu" hidden>
          <button class="tb-goal primary"><span class="mi">＋</span><span><b>New goal</b><em>Give one or more hubs a task</em></span></button>
          <button class="tb-inbox"><span class="mi">📥</span><span><b>Inbox</b><em>Approvals, updates and results</em></span><span class="badge" hidden></span></button>
          <button class="tb-results"><span class="mi">📊</span><span><b>Results</b><em>Goal scores, success and failure</em></span></button>
          <button class="tb-files"><span class="mi">📁</span><span><b>Files</b><em>Shared papers, data and notes</em></span><span class="badge count" hidden></span></button>
          <button class="tb-company"><span class="mi">👥</span><span><b>Workspace</b><em>Hubs, people and their models</em></span></button>
          <button class="tb-design"><span class="mi">🎨</span><span><b>Design</b><em>World, weather and looks</em></span></button>
          <button class="tb-usage" title="Claude connection"><span class="mi">⏱</span><span><b>Usage</b>
            <em><span class="u-meter"><i></i></span> <span class="u-five">…</span> of the 5-hour limit</em></span></button>
          <div class="menu-sep"></div>
          <button class="tb-settings"><span class="mi">⚙</span><span><b>Settings</b><em>Limits, performance, memory, account</em></span></button>
          <button class="tb-about"><span class="mi">ⓘ</span><span><b>About &amp; manual</b><em>Version and the user manual</em></span></button>
        </div>
      </div>
      <div class="office-banners"></div>
      <div class="office-dialog" hidden>
        <div class="card">
          <div class="title">Give your agents a goal</div>
          <div class="subtitle">Select one or more hubs. Each hub's manager plans its part and submits the plan for approval;
            the lead hub owns the final result. Goals on other hubs can run at the same time.</div>
          <div class="g-step1">
            <label>Goal<textarea class="g-text" rows="3" placeholder="e.g. Build a small web page that shows today's weather for Tokyo"></textarea></label>
            <div class="g-improve"><button class="g-ask">✨ Improve with questions</button><span class="g-rewritten" hidden>Rewritten from the answers.
              <button class="g-undo">Undo</button></span></div>
            <div class="g-label">Hubs</div>
            <div class="g-hubs"></div>
            <div class="row">
              <label>Lead hub<select class="g-lead"></select></label>
              <label class="budget"><span class="g-limit-label">Usage limit</span><input class="g-budget" type="number" min="1" step="1" value="15"></label>
            </div>
            <div class="g-limit-hint"></div>
          </div>
          <div class="g-build" hidden>
            <div class="g-questions"></div>
          </div>
          <div class="g-step2" hidden>
            <div class="g-label">Intent</div>
            <textarea class="g-intent" rows="2" translate="no"></textarea>
            <div class="g-label">Requirements</div>
            <div class="g-reqs"></div>
            <button class="g-add">+ Add requirement</button>
            <div class="g-req-hint">The team plans to these requirements, and the result is scored on them.</div>
          </div>
          <div class="g-error"></div>
          <div class="actions"><button class="ghost g-cancel">Cancel</button><button class="ghost g-plain" hidden>Start without requirements</button><button class="primary g-start">Next</button></div>
        </div>
      </div>
      <div class="office-card" hidden>
        <button class="close" title="Close">×</button>
        <div class="who" translate="no"><span class="dot"></span><div><div class="name"></div><div class="role"></div></div></div>
        <div class="label">Right now</div>
        <div class="doing"></div>
        <div class="model-line"></div>
      </div>
      <div class="office-toast" hidden></div>
      <div class="office-hint">Drag to look around · scroll to zoom · right-drag to move · click someone to follow them</div>
      <button class="office-reset">Reset view</button>`;
    this.el.appendChild(ui);
    this.ui = ui;
    ui.querySelector('.close').onclick = () => this.select(null);
    ui.querySelector('.office-reset').onclick = () => { this.select(null); this.resetView(); };
    ui.querySelector('.tb-company').onclick = () => {
      if (this.link.goalRunning) return this.toast('The workspace can be changed after the current goal ends.');
      this.link.inbox.close();
      this.designPanel.close();
      this.panel.toggle();
    };
    ui.querySelector('.tb-inbox').onclick = () => { this.panel.close(); this.designPanel.close(); this.link.inbox.toggle(); };
    ui.querySelector('.tb-goal').onclick = () => this.link.openGoalDialog();
    ui.querySelector('.office-head').onclick = () => this.companies.open();
    ui.querySelector('.tb-results').onclick = () => this.results.open();
    ui.querySelector('.tb-files').onclick = () => this.files.open();
    ui.querySelector('.tb-usage').onclick = () => this.usageWindow.open();
    ui.querySelector('.tb-settings').onclick = () => this.settings.open();
    ui.querySelector('.tb-design').onclick = () => { this.panel.close(); this.link.inbox.close(); this.designPanel.toggle(); };
    ui.querySelector('.tb-about').onclick = () => this.settings.open('about');
    // one Menu button opens every option; picking one (or clicking elsewhere, or Esc) closes it
    const menu = ui.querySelector('.office-menu');
    const toggle = ui.querySelector('.tb-menu');
    const setMenu = (open) => { menu.hidden = !open; toggle.classList.toggle('on', open); };
    toggle.onclick = (e) => { e.stopPropagation(); setMenu(menu.hidden); };
    menu.addEventListener('click', (e) => { if (e.target.closest('button')) setMenu(false); });
    this.el.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.office-toolbar')) setMenu(false); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
  }

  // The Menu button's badge: things waiting for approval (red), else nothing.
  refreshMenuBadge(waiting) {
    const badge = this.ui.querySelector('.menu-badge');
    badge.hidden = !waiting;
    badge.textContent = waiting;
    badge.classList.toggle('urgent', waiting > 0);
  }

  refreshOverlay() {
    this.ui.querySelector('.brand').textContent = this.company.name;
    document.title = this.company.name;
    this.renderLegend(this.company);
    if (this.files) this.files.load();  // each company has its own shared files
  }

  refreshFilesBadge(count) {
    const badge = this.ui.querySelector('.tb-files .badge');
    badge.hidden = !count;
    badge.textContent = count;
  }

  renderLegend(company) {
    const legend = this.ui.querySelector('.office-legend');
    legend.innerHTML = company.departments.map((d) =>
      `<div class="item" translate="no"><span class="dot" style="background:${d.color}"></span>${esc(d.name)}` +
      `<span class="n">${d.interns.length}</span></div>`).join('');
  }

  // Another saved company was opened (or created): rebuild the office around it.
  switchTo(company) {
    const wasOpen = !this.panel.el.hidden;
    this.build(company);
    this.panel.saved();
    if (wasOpen) this.panel.open();  // show the new company's hubs
    if (!this.designPanel.el.hidden) this.designPanel.render();
    this.toast(`${company.name} is open`);
  }

  modelLine(p) {
    const live = this.link?.people[p.id];
    const dept = this.company.departments.find((d) => d.id === p.dept.key);
    const person = p.manager ? dept?.manager : dept?.interns.find((i) => i.id === p.id);
    const model = live?.model ?? (dept && person ? modelFor(this.company, dept, person, p.manager) : '');
    const helpers = live?.helper_calls ? ` (${plural(live.helper_calls, 'helper call')})` : '';
    const cards = (this.link?.cards || []).filter((c) => c.intern === p.id)
      .map((c) => `${c.id} ${clip(c.title, 30)}: ${CARD_STATUS[c.status] || c.status}`).join(' · ');
    return `Runs on ${modelLabel(model)}` + (live ? ` · used ${used(live.cost)} on this goal${helpers}` : '') +
      (cards ? `\nCards: ${cards}` : '');
  }

  syncPanels() {  // keep the toolbar and person card clear of an open side panel
    const open = [this.panel, this.link?.inbox, this.designPanel].some((p) => p && !p.el.hidden);
    this.el.classList.toggle('panel-open', open);
  }

  toast(text) {
    const el = this.ui.querySelector('.office-toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  select(p) {
    if (this.selected) { this.selected.halo.visible = false; this.selected.nameTag.visible = false; }
    this.selected = p;
    const card = this.ui.querySelector('.office-card');
    card.hidden = !p;
    if (!p) return;
    p.halo.visible = true;
    p.nameTag.visible = true;
    card.querySelector('.dot').style.background = p.dept.color;
    card.querySelector('.name').textContent = p.name;
    card.querySelector('.role').textContent = `${p.role} · ${p.dept.name}`;
  }

  bindPointer() {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const canvas = this.renderer.domElement;
    const hit = (e) => {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const found = ray.intersectObjects(this.people.map((p) => p.group), true).find((h) => h.object.userData.person);
      return found?.object.userData.person || null;
    };
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;  // that was a drag
      this.select(hit(e));
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = hit(e);
      if (p === this.hovered) return;
      if (this.hovered && this.hovered !== this.selected) this.hovered.nameTag.visible = false;
      this.hovered = p;
      if (p) p.nameTag.visible = true;
      canvas.style.cursor = p ? 'pointer' : 'grab';
    });
  }

  resize() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ── main loop ────────────────────────────────────────────────────────
  tick() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.now += dt;
    if (Math.floor(this.now) !== Math.floor(this.now - dt)) this.updateSigns();  // once a second
    const screenBoost = this.liveTime === 'night' ? 1.6 : 1;
    for (const p of this.people) {
      p.update(dt, this.now);
      if (p.screen) {  // monitors brighten while their owner is typing at them (more noticeably at night)
        const on = p.spot === p.home && p.current?.typing;
        const m = p.screen.material;
        const want = (on ? 0.55 + Math.sin(this.now * 3 + p.phase) * 0.05 : 0.12) * screenBoost;
        m.emissiveIntensity += (want - m.emissiveIntensity) * Math.min(1, dt * 3);
      }
    }
    this.moveParticles(dt);
    for (const s of this.spinners) s.rotation.y += dt * 0.4;
    for (const [k, f] of this.flames.entries()) {
      f.scale.y = 1 + Math.sin(this.now * 9 + k * 2) * 0.12 + Math.sin(this.now * 23 + k) * 0.05;
      f.rotation.y += dt * 1.5;
    }
    if (this.design?.time === 'live' && Math.floor(this.now) % 60 === 0 && this.timeOfDay('live') !== this.liveTime) {
      this.applyAmbience({});  // the clock moved into a new part of the day
    }
    if (this.selected) {
      this.ui.querySelector('.doing').textContent = this.selected.activity;
      this.ui.querySelector('.model-line').textContent = this.modelLine(this.selected);
    }
    this.ui.querySelector('.clock').textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}

// ── the live link to the real agents (office_engine.py) ───────────────────
// Polls /api/office/state about once a second: who is working on what, the owner's inbox, the goal,
// and new events (messages, plans, reports) for the office to animate. The server is the source of truth.
class LiveLink {
  constructor(office) {
    this.office = office;
    this.seq = 0;
    this.people = {};
    this.cards = [];
    this.goals = [];
    this.busy = {};  // hub id → the goal it works on
    this.inbox = new InboxPanel(this);
    this.first = true;
    const ui = office.ui;
    this.banners = ui.querySelector('.office-banners');
    this.banners.addEventListener('click', (e) => {
      const b = e.target.closest('.stop[data-goal]');
      if (b) this.stop(Number(b.dataset.goal));
      const h = e.target.closest('.hold[data-goal]');
      if (h) this.hold(Number(h.dataset.goal), h.dataset.on === '1');
    });
    this.dialog = ui.querySelector('.office-dialog');
    const d = this.dialog;
    d.querySelector('.g-cancel').onclick = () => {
      if (this.step === 1) { d.hidden = true; return; }
      if (this.step === 2) this.agreed = this.readAgreed();  // kept (with its edits) unless the goal text changes
      this.goalStep(1);
    };
    d.querySelector('.g-start').onclick = () => (this.step === 2 ? this.startGoal(this.readAgreed())
      : this.step === 'build' ? this.rewriteGoal() : this.draftRequirements());
    d.querySelector('.g-ask').onclick = () => this.askQuestions();
    d.querySelector('.g-undo').onclick = () => {
      d.querySelector('.g-text').value = this.beforeRewrite;
      d.querySelector('.g-rewritten').hidden = true;
    };
    d.querySelector('.g-text').addEventListener('input', () => { d.querySelector('.g-rewritten').hidden = true; });
    d.querySelector('.g-questions').addEventListener('click', (e) => {  // one answer per question: a chip, or own words
      const chip = e.target.closest('.g-chip');
      if (!chip) return;
      const q = chip.closest('.g-q');
      const on = !chip.classList.contains('on');
      q.querySelectorAll('.g-chip').forEach((c) => c.classList.remove('on'));
      chip.classList.toggle('on', on);
      if (on) q.querySelector('input').value = '';
    });
    d.querySelector('.g-questions').addEventListener('input', (e) => {
      if (e.target.value) e.target.closest('.g-q').querySelectorAll('.g-chip').forEach((c) => c.classList.remove('on'));
    });
    d.querySelector('.g-plain').onclick = () => this.startGoal(null);
    d.querySelector('.g-hubs').addEventListener('change', () => this.syncLead());
    d.querySelector('.g-add').onclick = () => {
      this.agreed.requirements = [...this.readAgreed().requirements, {requirement: '', weight: 'important'}];
      this.renderReqs();
      d.querySelector('.g-reqs .g-req:last-child textarea').focus();
    };
    d.querySelector('.g-reqs').addEventListener('click', (e) => {
      const x = e.target.closest('.g-del');
      if (!x) return;
      const reqs = this.readAgreed().requirements;
      reqs.splice(Number(x.dataset.i), 1);
      this.agreed.requirements = reqs;
      this.renderReqs();
    });
    this.step = 1;
    this.agreed = null;   // the drafted list being reviewed: {intent, requirements: [{requirement, weight}]}
    this.draftedFor = '';  // the goal text it was drafted for
    this.asked = null;     // the prompt builder's questions: {questions: [{question, options}]}
    this.askedFor = '';    // the goal text they were asked about
    this.beforeRewrite = '';  // the goal as typed, for Undo
    this.poll();
  }

  get goalRunning() {  // any goal
    return this.goals.some((g) => g.status === 'running');
  }

  async poll() {
    try {
      const res = await fetch(`/api/office/state?since=${this.seq}`);
      if (res.ok) this.apply(await res.json());
    } catch (err) { /* server restarting: try again */ }
    setTimeout(() => this.poll(), 1000);
  }

  apply(st) {
    const events = this.first ? [] : st.events;  // on page load, don't replay the past
    this.first = false;
    this.seq = st.seq;
    this.people = st.people;
    this.goals = st.goals || [];
    this.busy = st.busy || {};
    this.cards = st.cards || [];
    this.progress = st.progress || {};
    if (st.usage) this.office.usageWindow.update(st.usage);
    this.applyPeople();
    for (const e of events) {
      this.office.animateEvent(e);
      if (e.kind === 'notice') this.office.toast(e.text);
      if (e.kind === 'goal_checked') {
        this.office.toast(e.score != null ? `Goal checked: ${e.score}% · ${VERDICT[e.verdict]?.[0] || ''}`
          : e.verdict === 'stopped_early' ? 'Stopped before anything was delivered: not scored' : 'The goal check could not finish');
        this.inbox.shown = '';  // show the verdict in the result
        if (!this.office.results.el.hidden) this.office.results.load();
      }
      if (e.kind === 'goal_end') this.office.toast({complete: 'Goal complete ✓', aborted: 'Goal stopped',
                                                    ended: 'The team stopped before finishing'}[e.status] || 'Goal ended');
    }
    this.inbox.update(st.inbox);
    this.renderBanner();
  }

  // Everyone the engine is running is "live": they leave the simulation and show their real activity.
  applyPeople() {
    for (const p of this.office.people || []) {
      const info = this.people[p.id];
      const live = info && info.status !== 'done' ? info : null;  // (people of running goals only)
      if (!p.live && live) {  // just got real work: drop the simulated routine (this runs before new events animate)
        p.interrupt();
        p.expecting = null;
      }
      p.live = live;
      if (live && p.spot === p.home && p.current?.type !== 'walk') p.activity = live.activity;
    }
  }

  // One banner per goal (running ones, and ended ones for a short while): its state and spend, and each of its
  // hubs with % done, cards passed and the estimated finish.
  renderBanner() {
    const depts = this.office.company.departments;
    this.office.ui.querySelector('.tb-company').classList.toggle('locked', this.goalRunning);
    this.banners.innerHTML = this.goals.map((g) => {
      const state = {running: g.held ? 'Paused' : g.paused ? 'On hold' : 'In progress', complete: 'Complete', aborted: 'Stopped',
                     ended: 'Ended', interrupted: 'Interrupted'}[g.status] || g.status;
      const cards = this.cards.filter((c) => c.goal === g.id);
      const lead = depts.find((d) => d.id === g.dept);
      const usage = g.usage_pct != null && g.limit_pct
        ? `${pctText(g.usage_pct)} of the 5-hour limit used (goal limit ${g.limit_pct}%)`
        : USAGE?.plan === false ? `${money(g.spend)} of ${money(g.budget)}` : `used ${used(g.spend)}`;
      const meta = `${state} · led by ${lead ? lead.name : '?'} · ${usage}` +
        (g.status === 'running' ? ` · ${g.live === 1 ? '1 person' : `${g.live} people`} working` : '') +
        (cards.length ? ` · cards ${cards.filter((c) => c.status === 'passed').length}/${cards.length} passed` : '');
      const rows = g.status !== 'running' ? '' : (g.hubs || []).map((id) => {
        const d = depts.find((x) => x.id === id);
        const p = this.progress[id] || {pct: 0, cards: 0, passed: 0, planning: true};
        if (!d) return '';
        const when = p.planning ? 'Planning…' : p.pct >= 100 ? 'Done ✓' : eta(p.eta_s);
        return `<div class="hp-row"><span class="dot" style="background:${d.color}"></span><span class="hp-name" translate="no">${esc(d.name)}${id === g.dept ? ' ★' : ''}</span>
          <span class="hp-bar"><i style="width:${p.pct}%;background:${d.color}"></i></span><b>${p.pct}%</b>
          <span class="hp-cards">${p.cards ? `${p.passed}/${p.cards} cards` : ''}</span><span class="hp-eta">${when}</span></div>`;
      }).join('');
      return `<div class="office-banner ${g.status}${g.paused ? ' paused' : ''}">
        <span class="state-dot"></span>
        <div class="goal-text"><div class="goal-title" translate="no">${esc(g.text)}</div><div class="goal-meta">${esc(meta)}</div></div>
        ${g.status === 'running' ? `<button class="hold" data-goal="${g.id}" data-on="${g.held ? 0 : 1}" title="${t(g.held ? 'The team carries on from where it paused.' : 'Replies under way stop at their next step and nothing new starts, so no usage is spent. Resume any time while the app is open.')}">${g.held ? '▶ Resume' : '⏸ Pause'}</button>
          <button class="stop" data-goal="${g.id}">Stop</button>` : ''}
        ${rows ? `<div class="hub-progress">${rows}</div>` : ''}</div>`;
    }).join('');
  }

  openGoalDialog(preset) {  // preset (from the workspace builder): {text, lead}: every free hub is picked, that one leads
    const box = this.dialog.querySelector('.g-hubs');
    box.innerHTML = this.office.company.departments.map((d) => {
      const busyOn = this.goals.find((g) => g.id === this.busy[d.id]);
      return `<label class="hub-pick${busyOn ? ' busy' : ''}"><input type="checkbox" value="${d.id}"${busyOn ? ' disabled' : ''}>
        <span class="dot" style="background:${d.color}"></span><b translate="no">${esc(d.name)}</b>
        <em>${busyOn ? `busy: ${esc(clip(busyOn.text, 34))}` : `${esc(d.manager.name)} · ${plural(d.interns.length, 'mini agent')}`}</em></label>`;
    }).join('');
    const free = box.querySelector('input:not(:disabled)');
    if (free) free.checked = true;
    if (preset) box.querySelectorAll('input:not(:disabled)').forEach((x) => { x.checked = true; });
    this.syncLead();
    if (preset?.lead) this.dialog.querySelector('.g-lead').value = preset.lead;
    // the goal's limit: a share of the 5-hour plan window, or dollars with an API key
    const api = USAGE?.plan === false;
    const input = this.dialog.querySelector('.g-budget');
    if (this.limitUnit !== (api ? '$' : '%')) {
      this.limitUnit = api ? '$' : '%';
      Object.assign(input, api ? {min: 0.05, step: 0.25, value: '1.00'} : {min: 1, step: 1, value: String(APP?.usage.goal_default ?? 15)});
    }
    this.dialog.querySelector('.g-limit-label').textContent = api ? 'Budget ($)' : 'Usage limit (%)';
    const five = USAGE?.five_hour;
    this.dialog.querySelector('.g-limit-hint').textContent = api
      ? 'API key in use: work is billed in dollars. The goal pauses at its budget.'
      : `The goal pauses once it has used this share of the 5-hour limit.` +
        (five ? ` Currently ${Math.round(five.pct)}% used (${resetText(five.resets_at)}).` : '');
    this.dialog.querySelector('.g-error').textContent = '';
    this.dialog.querySelector('.g-plain').hidden = true;
    this.dialog.querySelector('.g-rewritten').hidden = true;
    this.goalStep(1);
    if (preset) this.dialog.querySelector('.g-text').value = preset.text;
    this.dialog.hidden = false;
    this.dialog.querySelector('.g-text').focus();
  }

  // Step 1: the goal, hubs and limit. Step 2: the requirements agreed before the start (requirements.py).
  // 'build' (optional, from step 1): the prompt builder's questions, answered to rewrite the goal (prompt_builder.py).
  goalStep(n) {
    const d = this.dialog;
    this.step = n;
    d.querySelector('.g-step1').hidden = n !== 1;
    d.querySelector('.g-build').hidden = n !== 'build';
    d.querySelector('.g-step2').hidden = n !== 2;
    d.querySelector('.g-cancel').textContent = n === 1 ? 'Cancel' : 'Back';
    d.querySelector('.g-start').textContent = n === 2 ? 'Start goal' : n === 'build' ? 'Rewrite goal' : 'Next';
    d.querySelector('.g-start').disabled = false;
    d.querySelector('.title').textContent = n === 2 ? 'Review the requirements' : n === 'build' ? 'Improve the goal' : 'Give your agents a goal';
    d.querySelector('.subtitle').textContent = n === 2
      ? 'Edit, add or remove requirements, and set how much each one matters. Core requirements decide whether the goal is achieved.'
      : n === 'build'
        ? 'Answer what matters to you: pick an answer or write your own. Leave the rest blank. The goal is then rewritten with the answers, ready for the team.'
        : 'Select one or more hubs. Each hub\'s manager plans its part and submits the plan for approval; the lead hub owns the final result. Goals on other hubs can run at the same time.';
    d.querySelector('.g-error').textContent = '';
    if (n === 2) d.querySelector('.g-plain').hidden = true;
  }

  // The prompt builder: a few questions about what the goal leaves open (answers kept unless the goal text changes).
  async askQuestions() {
    const d = this.dialog;
    const text = d.querySelector('.g-text').value.trim();
    const error = d.querySelector('.g-error');
    if (!text) { error.textContent = 'Describe the goal first.'; return; }
    if (this.asked && this.askedFor === text) { this.goalStep('build'); return; }
    const button = d.querySelector('.g-ask');
    button.disabled = true;
    button.textContent = 'Thinking of questions…';
    error.textContent = '';
    const res = await fetch('/api/office/prompt/questions', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                                             body: JSON.stringify({text})}).catch(() => null);
    button.disabled = false;
    button.textContent = '✨ Improve with questions';
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      error.textContent = body.error || 'The questions could not be written. Try again, or go on with the goal as it is.';
      return;
    }
    this.asked = body;
    this.askedFor = text;
    d.querySelector('.g-questions').innerHTML = body.questions.map((q) => `<div class="g-q">
      <div class="g-q-text" translate="no">${esc(q.question)}</div>
      <div class="g-chips">${q.options.map((o) => `<button class="g-chip" translate="no">${esc(o)}</button>`).join('')}</div>
      <input maxlength="300" placeholder="Or in your own words (leave blank to skip)"></div>`).join('');
    this.goalStep('build');
  }

  async rewriteGoal() {
    const d = this.dialog;
    const answers = [...d.querySelectorAll('.g-q')].map((q) => ({
      question: q.querySelector('.g-q-text').textContent,
      answer: q.querySelector('.g-chip.on')?.textContent || q.querySelector('input').value.trim()}));
    if (!answers.some((a) => a.answer)) { d.querySelector('.g-error').textContent = 'Answer at least one question.'; return; }
    const button = d.querySelector('.g-start');
    button.disabled = true;
    button.textContent = 'Rewriting the goal…';
    d.querySelector('.g-error').textContent = '';
    const res = await fetch('/api/office/prompt/rewrite', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                                           body: JSON.stringify({text: this.askedFor, answers})}).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      button.disabled = false;
      button.textContent = 'Rewrite goal';
      d.querySelector('.g-error').textContent = body.error || 'The goal could not be rewritten. Try again, or go on with the goal as it is.';
      return;
    }
    this.beforeRewrite = d.querySelector('.g-text').value;
    d.querySelector('.g-text').value = body.goal;  // exactly as returned: its usage counts toward the goal it starts
    this.goalStep(1);
    d.querySelector('.g-rewritten').hidden = false;
  }

  async draftRequirements() {
    const d = this.dialog;
    const text = d.querySelector('.g-text').value.trim();
    const error = d.querySelector('.g-error');
    if (!text) { error.textContent = 'Describe the goal first.'; return; }
    if (!d.querySelector('.g-hubs input:checked')) { error.textContent = 'Pick at least one hub.'; return; }
    if (this.agreed && this.draftedFor === text) { this.goalStep(2); this.renderReqs(); return; }
    const button = d.querySelector('.g-start');
    button.disabled = true;
    button.textContent = 'Drafting requirements…';
    error.textContent = '';
    const res = await fetch('/api/office/requirements', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                                         body: JSON.stringify({text})}).catch(() => null);
    button.disabled = false;
    button.textContent = 'Next';
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      error.textContent = body.error || 'The requirements could not be drafted. Try again, or start without them.';
      d.querySelector('.g-plain').hidden = false;
      return;
    }
    this.agreed = body;
    this.draftedFor = text;
    this.goalStep(2);
    this.renderReqs();
  }

  renderReqs() {
    const d = this.dialog;
    d.querySelector('.g-intent').value = this.agreed.intent || '';
    const weights = [['core', 'Core'], ['important', 'Important'], ['extra', 'Extra']];
    d.querySelector('.g-reqs').innerHTML = this.agreed.requirements.map((r, i) => `<div class="g-req">
      <select class="w-${r.weight}">${weights.map(([k, label]) => `<option value="${k}"${k === r.weight ? ' selected' : ''}>${label}</option>`).join('')}</select>
      <textarea rows="1" maxlength="300" translate="no" placeholder="What the result must have or do">${esc(r.requirement)}</textarea>
      <button class="g-del" data-i="${i}" title="Remove">✕</button></div>`).join('');
    d.querySelectorAll('.g-req select').forEach((s) => { s.onchange = () => { s.className = `w-${s.value}`; }; });
  }

  // The list as edited (empty rows kept while editing; dropped when the goal starts).
  readAgreed() {
    const d = this.dialog;
    return {intent: d.querySelector('.g-intent').value.trim(),
            requirements: [...d.querySelectorAll('.g-req')].map((row) => ({
              requirement: row.querySelector('textarea').value.replace(/\s+/g, ' ').trim(), weight: row.querySelector('select').value}))};
  }

  // The lead can be any of the ticked hubs.
  syncLead() {
    const picked = [...this.dialog.querySelectorAll('.g-hubs input:checked')].map((x) => x.value);
    const lead = this.dialog.querySelector('.g-lead');
    const keep = lead.value;
    lead.innerHTML = picked.map((id) => {
      const d = this.office.company.departments.find((x) => x.id === id);
      return `<option value="${id}"${id === keep ? ' selected' : ''}>${esc(d.name)}</option>`;
    }).join('');
    lead.closest('label').hidden = picked.length < 2;
  }

  async startGoal(agreed) {
    const d = this.dialog;
    if (agreed) {
      agreed = {...agreed, requirements: agreed.requirements.filter((r) => r.requirement)};
      if (!agreed.requirements.length) {
        d.querySelector('.g-error').textContent = 'Add at least one requirement.';
        return;
      }
    }
    const hubs = [...d.querySelectorAll('.g-hubs input:checked')].map((x) => x.value);
    const value = Number(d.querySelector('.g-budget').value || 0);
    const body = {text: d.querySelector('.g-text').value, hubs, lead: d.querySelector('.g-lead').value,
                  ...(agreed ? {agreed} : {}),
                  ...(this.limitUnit === '$' ? {budget: value || 1} : {limit_pct: value || 15})};
    const res = await fetch('/api/office/goal', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                                 body: JSON.stringify(body)});
    if (!res.ok) {
      d.querySelector('.g-error').textContent = (await res.json()).error || 'Could not start the goal.';
      return;
    }
    d.hidden = true;
    d.querySelector('.g-text').value = '';
    this.agreed = null;
    this.draftedFor = '';
    this.office.toast(hubs.length > 1 ? 'Goal sent. The managers are on it.' : 'Goal sent. The manager is on it.');
  }

  async hold(goal, on) {
    const res = await fetch('/api/office/pause', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                                  body: JSON.stringify({goal, on})});
    if (!res.ok) this.office.toast((await res.json().catch(() => ({}))).error || 'Something went wrong. Please try again.');
  }

  async stop(goal) {
    await fetch('/api/office/stop', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                     body: JSON.stringify({goal})});
  }

  async answer(id, action, extra = {}) {
    const res = await fetch(`/api/office/inbox/${id}`, {method: 'POST', headers: {'Content-Type': 'application/json'},
                                                        body: JSON.stringify({action, ...extra})});
    if (!res.ok) this.office.toast((await res.json()).error || 'Something went wrong. Please try again.');
  }
}

// ── the owner's inbox: plans and commands to decide on, budget stops, updates, results ──
class InboxPanel {
  constructor(link) {
    this.link = link;
    this.office = link.office;
    this.items = [];
    this.shown = '';
    const el = this.el = document.createElement('aside');
    el.className = 'office-panel office-inbox';
    el.hidden = true;
    el.innerHTML = `
      <header><div><div class="title">Inbox</div><div class="subtitle">Plans and commands awaiting approval, updates and results</div></div>
        <button class="close" title="Close">×</button></header>
      <label class="auto-plans" title="${t('Commands that need permission always still ask.')}"><span class="switch"><input type="checkbox" data-auto-plans><i></i></span>
        Approve plans automatically</label>
      <div class="body"></div>`;
    this.office.el.appendChild(el);
    el.querySelector('.close').onclick = () => this.close();
    this.body = el.querySelector('.body');
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.auto = el.querySelector('[data-auto-plans]');
    this.auto.onchange = () => this.setAuto(this.auto.checked);
  }

  async setAuto(on) {  // Settings → Safety: approve plans automatically (owner only)
    const waiting = this.items.filter((i) => i.kind === 'plan' && i.waiting).length;
    if (on && !confirm(t('Approve plans automatically? Plans start without waiting for you; commands still ask.') +
                       (waiting ? ' ' + t('The {n} plan(s) waiting now will be approved too.', {n: waiting}) : ''))) {
      this.auto.checked = false;
      return;
    }
    const res = await fetch('/api/settings', {method: 'PUT', headers: {'Content-Type': 'application/json'},
                                              body: JSON.stringify({plans: {auto_approve: on}})});
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.auto.checked = !on;
      return this.office.toast(out.error || 'Something went wrong. Please try again.');
    }
    APP = out;
    this.office.toast(on ? 'Plans are now approved automatically.' : 'Plans wait for your approval again.');
  }

  toggle() { this.el.hidden ? this.open() : this.close(); }
  open() { this.el.hidden = false; this.render(); this.office.syncPanels(); }
  close() { this.el.hidden = true; this.office.syncPanels(); }

  update(items) {
    if (APP && document.activeElement !== this.auto) this.auto.checked = !!APP.plans?.auto_approve;
    this.items = items;
    const waiting = items.filter((i) => i.waiting).length;
    const badge = this.office.ui.querySelector('.tb-inbox .badge');
    badge.hidden = !items.length;
    badge.textContent = waiting || items.length;
    badge.classList.toggle('urgent', waiting > 0);
    this.office.refreshMenuBadge(waiting);
    const key = this.keyOf(items);
    if (key !== this.shown) {  // re-render only when items change, so typing isn't wiped
      if (waiting > (this.lastWaiting || 0) && this.el.hidden) this.office.toast('Approval needed: ☰ Menu → Inbox');
      this.lastWaiting = waiting;
      this.render();
    }
  }

  who(id) {
    return this.office.byId.get(id);
  }

  // What the Inbox shows; a change re-renders it (a command's explanation arriving counts as a change)
  keyOf(items) {
    return items.map((i) => i.id + (i.waiting ? '!' : '') + (i.data?.explaining ? '~' : '')).join(',');
  }

  render() {
    const items = this.items;
    this.shown = this.keyOf(items);
    if (this.el.hidden) return;
    if (!items.length) {
      this.body.innerHTML = `<div class="empty-inbox">${t('Nothing here. Give your agents a goal with <b>New goal</b>.')}</div>`;
      return;
    }
    const order = {usage: 0, question: 1, plan: 2, command: 3, budget: 4, update: 5, result: 6};
    const sorted = [...items].sort((a, b) => order[a.kind] - order[b.kind] || a.goal - b.goal || a.at - b.at);
    // several plans waiting for one goal: one header with their combined estimate and "Approve all"
    const plans = sorted.filter((i) => i.kind === 'plan' && i.waiting);
    const groups = {};
    for (const p of plans) (groups[p.goal] ||= []).push(p);
    const headed = new Set();
    const oneGoal = Object.keys(groups).length < 2;  // then the bar at the top already covers them
    // two or more plans waiting anywhere: one bar at the top approves them all
    const all = plans.length < 2 ? '' : `<div class="plan-group all"><div><b>${plural(plans.length, 'plan')} waiting</b>
        <span>${Object.keys(groups).length > 1 ? `for ${plural(Object.keys(groups).length, 'goal')} · ` : ''}estimated ${this.usageText(plans.reduce((sum, p) => sum + (p.data.estimate?.usd || 0), 0))} in total</span></div>
      <button class="primary" data-act="approve-every" data-n="${plans.length}">Approve all ${plans.length}</button></div>`;
    this.body.innerHTML = all + sorted.map((i) => {
      const group = i.kind === 'plan' && i.waiting ? groups[i.goal] : null;
      if (!group || group.length < 2 || oneGoal || headed.has(i.goal)) return this.card(i);
      headed.add(i.goal);
      const total = group.reduce((sum, p) => sum + (p.data.estimate?.usd || 0), 0);
      return `<div class="plan-group"><div><b>${group.length} plans for one goal</b>
          <span><bdi translate="no">${esc(clip(i.data.goal_text || '', 90))}</bdi> · estimated ${this.usageText(total)} in total</span></div>
        <button class="primary" data-act="approve-all" data-goal="${i.goal}">Approve all ${group.length}</button></div>` + this.card(i);
    }).join('');
  }

  // An estimate as the share of the 5-hour limit (once measured), else as dollars with an API key.
  usageText(usd) {
    const text = used(usd);
    return text === 'measuring…' ? 'usage (measured after the first goals)' : text;
  }

  // The task cards of a plan section, as edited (a dropped card is sent as '').
  planTasks(section) {
    const split = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);
    return [...section.querySelectorAll('.task-card')].map((c) => {
      const f = (name) => c.querySelector(`[data-f="${name}"]`);
      if (f('drop').checked) return '';
      return {title: f('title').value, goal: f('goal').value, context: f('context').value,
              deliverable: f('deliverable').value, steps: split(f('steps').value), inputs: split(f('inputs').value),
              avoid: split(f('avoid').value), done_when: split(f('done_when').value), size: f('size').value,
              after: [...c.querySelectorAll('[data-after]:checked')].map((x) => Number(x.dataset.after))};
    });
  }

  // A decision as a short list of options, each with what happens if chosen; the recommended one is marked.
  // An option with `box` opens a small text box (a note, feedback or an own answer) with its own Send button.
  choices(i, list) {
    return `<div class="choices">${list.map((c) => `
      <button class="choice${c.rec ? ' rec' : ''}" data-act="${c.box ? 'open-box' : c.act}" data-id="${i.id}"${c.box ? ` data-box="${c.box.act}"` : ''}${c.attrs || ''}>
        <span class="c-label">${c.label}${c.rec ? `<em>${t('Recommended')}</em>` : ''}</span>
        ${c.desc ? `<span class="c-desc">${c.desc}</span>` : ''}</button>
      ${c.box ? `<div class="note-box" data-box="${c.box.act}" hidden><input class="feedback" placeholder="${c.box.placeholder}">
        <button class="primary" data-act="${c.box.act}" data-id="${i.id}">${c.box.send}</button></div>` : ''}`).join('')}</div>`;
  }

  card(i) {
    const p = this.who(i.from);
    const color = p ? p.dept.color : '#5E6B7D';
    const goalText = this.link.goals.find((g) => g.id === i.goal)?.text || i.data?.goal_text || '';
    const name = p ? esc(p.name) : '';
    const title = i.kind === 'question' ? `<bdi translate="no">${esc(i.title)}</bdi>` : esc(i.title);  // the manager's own words
    const head = `<div class="item-head"><span class="dot" style="background:${color}"></span><b>${title}</b>` +
      `<span class="kind">${{plan: 'Plan', command: 'Command', question: 'Question', budget: 'Limit', usage: 'Usage', update: 'Update', result: 'Result'}[i.kind]}</span></div>` +
      (goalText && i.kind !== 'result' ? `<div class="goal-tag">Goal: ${esc(clip(goalText, 80))}</div>` : '');
    const dismiss = `<button class="icon dismiss" data-act="dismiss" data-id="${i.id}" title="Dismiss">×</button>`;
    if (i.kind === 'plan') {
      const lines = (list) => esc((list || []).join('\n'));
      const rows = (list) => Math.min(Math.max((list || []).length, 1), 4);
      const tasks = i.data.tasks.map((t, k) => {
        const after = k ? `<div class="after"><span>Starts after</span>${i.data.tasks.slice(0, k).map((_, j) =>
          `<label class="chip"><input type="checkbox" data-after="${j + 1}"${(t.after || []).includes(j + 1) ? ' checked' : ''}> ${j + 1}</label>`).join('')}
          <em>${(t.after || []).length ? 'gets their results when they pass' : 'none: starts right away'}</em></div>` : '';
        const more = [t.context, t.steps?.length, t.inputs?.length, t.avoid?.length].filter(Boolean).length;
        return `
        <div class="task-card" data-card="${k}">
          <div class="card-head"><span class="card-no">${k + 1}</span><span class="card-who" translate="no">${esc(t.name)}<em>${esc(t.role)}</em></span>
            <select data-f="size" title="Size: S = a few minutes, M = one sitting, L = large">${['S', 'M', 'L'].map((s) => `<option${s === t.size ? ' selected' : ''}>${s}</option>`).join('')}</select>
            <label class="drop"><input type="checkbox" data-f="drop"> Drop</label></div>
          <input data-f="title" value="${esc(t.title || '')}" placeholder="Title">
          <textarea data-f="goal" rows="2" placeholder="Goal: what to produce and what it is for">${esc(t.goal || t.task || '')}</textarea>
          <div class="card-label">Deliver</div><input data-f="deliverable" value="${esc(t.deliverable || '')}" placeholder="Exactly what to hand in, and where (e.g. notes/sources.md)">
          <div class="card-label">Done when</div><textarea data-f="done_when" rows="${rows(t.done_when)}" placeholder="One check per line, each easy to verify">${lines(t.done_when)}</textarea>
          ${after}
          <details><summary>Context, steps, inputs, limits${more ? ` <b>${more}</b>` : ''}</summary>
            <div class="card-label">Context</div><textarea data-f="context" rows="2" placeholder="What the mini agent must know that isn't in the files">${esc(t.context || '')}</textarea>
            <div class="card-label">Steps</div><textarea data-f="steps" rows="${rows(t.steps)}" placeholder="One step per line (only if the approach matters)">${lines(t.steps)}</textarea>
            <div class="card-label">Use</div><textarea data-f="inputs" rows="${rows(t.inputs)}" placeholder="Files or sources, one per line">${lines(t.inputs)}</textarea>
            <div class="card-label">Do not</div><textarea data-f="avoid" rows="${rows(t.avoid)}" placeholder="Out of scope, or must not change">${lines(t.avoid)}</textarea>
          </details>
          ${(t.hints || []).length ? `<ul class="card-hints">${t.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
        </div>`;
      }).join('');
      const planHints = (i.data.hints || []).length
        ? `<ul class="card-hints plan-hints">${i.data.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : '';
      const est = i.data.estimate;
      const estimate = est ? `<div class="estimate">Estimated usage: <b>${this.usageText(est.usd)}</b>
        <span>${est.from_history ? 'from past cards of the same sizes' : 'a starting estimate; it improves as cards finish'}</span></div>` : '';
      // the plan in plain words: who does what, in which order, and what they hand in
      const size = {S: 'Quick task', M: 'About one sitting', L: 'Large task'};
      const steps = i.data.tasks.map((c, k) => `<li><span class="card-no">${k + 1}</span><div>
          <div><b translate="no">${esc(c.name)}</b> <span class="m" translate="no">${esc(c.role)}</span></div>
          <div class="s-what" translate="no">${esc(c.title || '')}</div>
          <div class="m">${t(size[c.size] || size.M)} · ${(c.after || []).length
            ? t('starts after step {list}', {list: c.after.join(', ')}) : t('starts right away')}${c.deliverable
            ? ` · ${t('hands in')} <bdi translate="no">${esc(clip(c.deliverable, 70))}</bdi>` : ''}</div>
          ${(c.hints || []).length ? `<ul class="card-hints">${c.hints.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</div></li>`).join('');
      return `<section class="item plan" data-id="${i.id}" data-goal="${i.goal}" style="--c:${color}">${head}
        <p translate="no">${esc(i.body)}</p>${estimate}${planHints}
        <div class="card-label">What will happen</div><ol class="plan-steps">${steps}</ol>
        ${this.choices(i, [
          {act: 'approve', rec: true, label: t('Approve the plan'), desc: t('The mini agents get these tasks and start working.')},
          {act: 'open-box', label: t('Send it back with changes…'),
           desc: t('{name} rewrites the plan using the note.', {name}),
           box: {act: 'revise', placeholder: t('What should change? e.g. "Skip step 2" or "Add a test"'), send: t('Send back')}},
          {act: 'open-edit', label: t('Edit the tasks myself…'), desc: t('Change, reorder or drop task cards, then approve.')}])}
        <div class="plan-edit" hidden>${tasks}
          <div class="hint">These are the task cards the mini agents will get. Edit anything, or tick Drop, then choose Approve the plan above. Amber notes are automatic quality checks.</div></div></section>`;
    }
    if (i.kind === 'command') {
      const x = i.data.explain;
      const EFFECT = {reads: ['Reads files', ''], changes_goal_files: ['Changes files in the goal folder', ''],
        changes_other_files: ['Changes files outside the goal folder', 'warn'], deletes: ['Deletes or overwrites files', 'warn'],
        installs: ['Installs software', 'warn'], internet: ['Uses the internet', 'warn'], runs_program: ['Runs a program or script', '']};
      const RISK = {low: 'Low risk', medium: 'Medium risk', high: 'High risk'};
      const plain = x ? `<div class="explain">
          <p class="plain" translate="no">${esc(x.summary)}</p>${x.why ? `<p class="why" translate="no">${esc(x.why)}</p>` : ''}
          <div class="effects">${x.effects.map((e) => `<span class="chip ${EFFECT[e][1]}">${EFFECT[e][0]}</span>`).join('')}</div>
          <div class="risk ${x.risk}"><b>${RISK[x.risk]}</b>${x.risk_reason ? ` · <bdi translate="no">${esc(x.risk_reason)}</bdi>` : ''}</div></div>`
        : i.data.explaining ? '<div class="explain pending">Explaining the command in plain words…</div>'
        : i.data.description ? `<p translate="no">${esc(i.data.description)}</p>` : '';
      const deny = x?.recommend === 'deny';
      const why = (allow) => x?.recommend_reason && allow !== deny ? ` <bdi translate="no">${esc(x.recommend_reason)}</bdi>` : '';
      return `<section class="item command" data-id="${i.id}" style="--c:${color}">${head}${plain}
        ${this.choices(i, [
          {act: 'approve', rec: x && !deny, label: t('Allow'), desc: t('{name} runs it and carries on.', {name}) + why(true)},
          {act: 'deny', rec: deny, label: t('Deny'), desc: t('{name} is told no and finds another way.', {name}) + why(false)},
          {act: 'open-box', label: t('Deny, and say what to do instead…'),
           desc: t('The note goes to {name}.', {name}), box: {act: 'deny-note', placeholder: t('e.g. "Use the file you already made"'), send: t('Deny with note')}}])}
        <details class="raw"><summary>Show the command</summary><pre>${esc(i.body)}</pre></details></section>`;
    }
    if (i.kind === 'question') {  // a manager asks the owner to decide, with options to pick from
      const d = i.data;
      return `<section class="item question" data-id="${i.id}" style="--c:${color}">${head}
        ${i.body ? `<p translate="no">${esc(i.body)}</p>` : ''}
        ${this.choices(i, [...d.options.map((o, k) => ({act: 'choose', attrs: ` data-choice="${k + 1}" translate="no"`, rec: d.recommended === k + 1,
            label: esc(o.label), desc: esc(o.description)})),
          {act: 'open-box', label: t('Other answer…'), desc: t('Write an answer in your own words.'),
           box: {act: 'answer', placeholder: t('The answer for {name}', {name}), send: t('Send answer')}}])}</section>`;
    }
    if (i.kind === 'usage') {  // the plan-wide limit: continue with higher limits, or stop everything
      const lim = i.data.limits || {};
      const five = Math.round(i.data.five_hour?.pct || 0);
      const week = Math.round(i.data.seven_day?.pct || 0);
      return `<section class="item usage" data-id="${i.id}" style="--c:#C4553B">${head}<p>${esc(i.body)}</p>
        <div class="raise">Pause at <input class="lim-5h" type="number" min="5" max="100" value="${Math.min(100, Math.max(lim.five_hour || 80, five + 10))}">% of 5-hour
          · <input class="lim-week" type="number" min="5" max="100" value="${Math.min(100, Math.max(lim.seven_day || 90, week + 5))}">% of weekly</div>
        ${this.choices(i, [
          {act: 'continue', rec: five < 95, label: t('Raise the limits and continue'), desc: t('All goals carry on until the new limits above.')},
          {act: 'stop-all', rec: five >= 95, label: t('Stop all goals'), desc: t('Work ends now; finished files stay in each goal folder.')}])}</section>`;
    }
    if (i.kind === 'budget') {
      const pctUnit = i.data.unit === '%';
      const nearly = i.data.cards && i.data.passed >= i.data.cards - 1;
      return `<section class="item budget" data-id="${i.id}" style="--c:#C0975A">${head}<p>${esc(i.body)}</p>
        <div class="raise">Raise by ${pctUnit ? '' : '$'}<input class="amount" type="number" min="${pctUnit ? 1 : 0.05}" step="${pctUnit ? 1 : 0.25}" value="${i.data.suggest}">${pctUnit ? ' % of the 5-hour limit' : ''}</div>
        ${this.choices(i, [
          {act: 'raise', rec: true, label: t('Raise the limit and continue'),
           desc: nearly ? t('The team is nearly done, so a little more usage should finish the goal.') : t('The team picks up where it stopped.')},
          {act: 'stop-goal', label: t('Stop the goal'), desc: t('Work ends now; finished files stay in the goal folder.')}])}</section>`;
    }
    const team = (i.data.team || []).map((t) => {
      const helpers = t.helper_calls
        ? `<div class="helpers">↳ ${plural(t.helper_calls, 'helper call')}${t.helper_cost ? `, ${used(t.helper_cost, {short: true})} of it` : ''}</div>` : '';
      return `<div class="spend"><span translate="no">${esc(t.name)}</span><span class="m">${esc(modelLabel(t.model))}</span>` +
        `<span>${used(t.cost, {short: true})}</span></div>${helpers}`;
    }).join('');
    const cardList = (i.data.cards || []).map((c) =>
      `<div class="card-row ${c.status}"><span translate="no">${esc(c.id)} ${esc(c.title)}</span><span class="m" translate="no">${esc(c.name)}</span>` +
      `<span class="st">${CARD_STATUS[c.status] || c.status}${c.attempts > 1 ? ` · ${c.attempts} tries` : ''}</span></div>`).join('');
    const rating = i.data.mission ? `<div class="rating"><span>How did it go?</span>${['success', 'partial', 'failed'].map((r) =>
      `<button class="${i.data.rating === r ? 'on ' : ''}${r}" data-act="rate" data-id="${i.id}" data-mission="${i.data.mission}"
        data-rating="${r}">${{success: '✓ Success', partial: '~ Partly', failed: '✗ Failed'}[r]}</button>`).join('')}</div>` : '';
    const chk = i.data.check;  // the goal checker's verdict (goal_check.py)
    const checkLine = i.kind !== 'result' ? '' : chk && chk.score != null
      ? `<div class="goal-check" style="--v:${VERDICT[chk.verdict][1]}"><b>${chk.score}%</b><span>${t(VERDICT[chk.verdict][0])}: <bdi translate="no">${esc(chk.summary || '')}</bdi></span>
          ${chk.missing?.length ? `<em>${t('Missing:')} <bdi translate="no">${esc(chk.missing.slice(0, 3).join(' · '))}</bdi></em>` : ''}</div>`
      : i.data.checking ? '<div class="goal-check pending"><span>Checking the result against the goal…</span></div>' : '';
    const extra = i.kind === 'result'
      ? `<div class="meta"><bdi translate="no">${esc(i.data.goal || '')}</bdi><br>📁 ${esc(i.data.workspace || '')} · used ${used(i.data.cost)}</div>` +
        (i.data.saved_to ? `<div class="meta">${t('Saved to {path}', {path: `<bdi translate="no">${esc(i.data.saved_to)}</bdi>`})}</div>` : '') +
        (i.data.saved_error ? `<div class="meta warn">${esc(i.data.saved_error)}</div>` : '') +
        `<div class="actions doc-row">${i.data.document ? `<button class="primary" data-act="open-doc" data-mission="${i.data.mission}">📄 Open document</button>` : ''}
          <button class="ghost" data-act="open-folder" data-mission="${i.data.mission}">📁 Open folder</button>
          ${CONTINUABLE.includes(i.data.status) ? `<button class="ghost" data-act="continue-goal" data-mission="${i.data.mission}">▶ Continue</button>` : ''}</div>` + checkLine +
        (cardList ? `<div class="spend-list"><div class="spend-title">Task cards</div>${cardList}</div>` : '') +
        (team ? `<div class="spend-list"><div class="spend-title">Who used what</div>${team}</div>` : '') + rating : '';
    return `<section class="item ${i.kind}" style="--c:${color}">${dismiss}${head}<p class="pre" translate="no">${esc(i.body)}</p>${extra}</section>`;
  }

  onClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    const section = b.closest('section');
    const note = section?.querySelector('.feedback')?.value || '';
    if (b.dataset.act === 'open-box' || b.dataset.act === 'open-edit') {  // show a note box, or the plan's card editor
      const box = b.dataset.act === 'open-box' ? section.querySelector(`.note-box[data-box="${b.dataset.box}"]`)
        : section.querySelector('.plan-edit');
      box.hidden = !box.hidden;
      b.classList.toggle('open', !box.hidden);
      if (!box.hidden) box.querySelector('input, textarea')?.focus();
      return;
    }
    switch (b.dataset.act) {
      case 'open-doc':
        openDocument(b.dataset.mission, this.office);
        break;
      case 'open-folder':
        openResultFolder(b.dataset.mission, this.office);
        break;
      case 'continue-goal':
        continueGoal(b.dataset.mission, this.office);
        break;
      case 'approve':
        if (section.classList.contains('plan')) this.link.answer(id, 'approve', {tasks: this.planTasks(section)});
        else this.link.answer(id, 'approve');
        break;
      case 'approve-every': {  // every waiting plan in the Inbox (commands still need their own click)
        if (!confirm(t('Approve all {n} plans? The mini agents start working on them right away.', {n: b.dataset.n}))) return;
        for (const s of this.body.querySelectorAll('section.plan[data-id]')) {
          if (!s.querySelector('button[data-act="approve"]:not(:disabled)')) continue;  // already answered
          this.link.answer(s.dataset.id, 'approve', {tasks: this.planTasks(s)});
          s.querySelectorAll('.choice, .note-box button').forEach((x) => { x.disabled = true; });
        }
        b.disabled = true;
        break;
      }
      case 'approve-all':  // every waiting plan of this goal, with any edits made to them
        for (const s of this.body.querySelectorAll(`section.plan[data-goal="${b.dataset.goal}"]`)) {
          this.link.answer(s.dataset.id, 'approve', {tasks: this.planTasks(s)});
          s.querySelectorAll('.choice, .note-box button').forEach((x) => { x.disabled = true; });
        }
        break;
      case 'revise': this.link.answer(id, 'revise', {feedback: note}); break;
      case 'deny': this.link.answer(id, 'deny'); break;
      case 'deny-note': this.link.answer(id, 'deny', {note}); break;
      case 'choose': this.link.answer(id, 'choose', {choice: Number(b.dataset.choice)}); break;
      case 'answer':
        if (!note.trim()) { section.querySelector('.feedback').focus(); return; }
        this.link.answer(id, 'answer', {text: note});
        break;
      case 'raise': this.link.answer(id, 'raise', {amount: Number(section.querySelector('.amount').value || 0)}); break;
      case 'stop-goal': this.link.answer(id, 'stop'); break;
      case 'continue': this.link.answer(id, 'continue', {five_hour: Number(section.querySelector('.lim-5h').value),
                                                          seven_day: Number(section.querySelector('.lim-week').value)}); break;
      case 'stop-all': this.link.answer(id, 'stop'); break;
      case 'dismiss': this.link.answer(id, 'dismiss'); break;
      case 'rate':
        fetch(`/api/office/rate/${b.dataset.mission}`, {method: 'POST', headers: {'Content-Type': 'application/json'},
                                                       body: JSON.stringify({rating: b.dataset.rating})});
        section.querySelectorAll('.rating button').forEach((x) => x.classList.toggle('on', x === b));
        this.office.toast('Rating saved');
        return;
      default: return;
    }
    b.disabled = true;
    if (b.dataset.act !== 'approve-all' && b.dataset.act !== 'approve-every') section?.querySelectorAll('.choice, .note-box button').forEach((x) => { x.disabled = true; });
  }
}

// ── the Design panel: theme, time of day, weather, agent looks, hub styles (applies and saves at once) ──
class DesignPanel {
  constructor(office) {
    this.office = office;
    const el = this.el = document.createElement('aside');
    el.className = 'office-panel office-design';
    el.hidden = true;
    el.innerHTML = `
      <header><div><div class="title">Design</div><div class="subtitle">The look of the office world. Visual only; changes apply immediately.</div></div>
        <button class="close" title="Close">×</button></header>
      <div class="body"></div>`;
    office.el.appendChild(el);
    el.querySelector('.close').onclick = () => this.close();
    this.body = el.querySelector('.body');
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('change', (e) => this.onChange(e));
  }

  toggle() { this.el.hidden ? this.open() : this.close(); }
  open() { this.el.hidden = false; this.render(); this.office.syncPanels(); }
  close() { this.el.hidden = true; this.office.syncPanels(); }

  render() {
    const c = this.office.company;
    const d = c.design || {};
    const seg = (field, options, value) => `<div class="seg">${Object.entries(options).map(([k, label]) =>
      `<button class="${k === value ? 'on' : ''}" data-field="${field}" data-v="${k}">${label}</button>`).join('')}</div>`;
    const css = (n) => `#${new THREE.Color(n).getHexString()}`;
    const worlds = hubWorlds({...c, departments: c.departments.map((h) => ({...h, world: ''}))});  // what "random" gives each hub
    this.body.innerHTML = `
      <div class="section-title">World</div>
      <div class="themes">${Object.entries(THEMES).map(([k, t]) => `
        <button class="theme${k === d.theme ? ' on' : ''}" data-field="theme" data-v="${k}">
          <span class="swatch-row" style="background: linear-gradient(135deg, ${css(t.bg)} 0 34%, ${t.floor} 34% 70%, ${css(t.walkway)} 70%)"></span>
          <span>${t.name}</span></button>`).join('')}</div>
      <div class="section-title">Time of day</div>${seg('time', TIMES, d.time)}
      <div class="section-title">Weather</div>${seg('weather', WEATHERS, d.weather)}
      ${THEMES[d.theme]?.indoor ? '<div class="hint">A space station has no weather; it applies to the other worlds.</div>' : ''}
      <div class="section-title">Agent looks</div>${seg('looks', LOOKS, d.looks)}
      <div class="section-title">Hubs <span>world · style · look</span></div>
      <div class="hint">Each hub can be its own world. Random picks one per hub and keeps it. Shuffle all gives every hub a new world, style and look.</div>
      <button class="shuffle" data-shuffle>🎲 Shuffle all</button>
      ${c.departments.map((h) => `
        <div class="hub-row"><span class="dot" style="background:${h.color}"></span><span class="hub-name" translate="no" title="${esc(h.name)}">${esc(h.name)}</span>
          <select data-hub="${h.id}" data-key="world" title="The hub's world: its furniture and decorations">
            <option value=""${!h.world ? ' selected' : ''}>🎲 ${WORLD_SHORT[worlds[h.id]]}</option>
            <option value="match"${h.world === 'match' ? ' selected' : ''}>Match world</option>
            ${Object.entries(WORLD_SHORT).map(([k, name]) => `<option value="${k}"${k === h.world ? ' selected' : ''}>${name}</option>`).join('')}</select>
          <select data-hub="${h.id}" data-key="style">${Object.entries(HUB_STYLES).map(([k, l]) =>
            `<option value="${k}"${k === h.style ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <select data-hub="${h.id}" data-key="looks"><option value="">Workspace look</option>${Object.entries(LOOKS).map(([k, l]) =>
            `<option value="${k}"${k === h.looks ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}`;
  }

  onClick(e) {
    if (e.target.closest('button[data-shuffle]')) {  // a new random world, style and look for every hub, as varied as possible
      const deal = (keys) => { let pool = []; return () => { if (!pool.length) pool = [...keys].sort(() => Math.random() - 0.5); return pool.pop(); }; };
      const [world, style, looks] = [deal(Object.keys(THEMES)), deal(Object.keys(HUB_STYLES)), deal(Object.keys(LOOKS))];
      const hubs = Object.fromEntries(this.office.company.departments.map((h) =>
        [h.id, {world: world(), style: style(), looks: looks()}]));
      return this.save(this.office.company.design, hubs, 'hub');
    }
    const b = e.target.closest('button[data-field]');
    if (b) this.save({...this.office.company.design, [b.dataset.field]: b.dataset.v}, null, b.dataset.field);
  }

  onChange(e) {
    const s = e.target.closest('select[data-hub]');
    if (s) this.save(this.office.company.design, {[s.dataset.hub]: {[s.dataset.key]: s.value}}, 'hub');
  }

  async save(design, hubs, what) {
    const res = await fetch('/api/company/design', {method: 'PUT', headers: {'Content-Type': 'application/json'},
                                                     body: JSON.stringify({design, hubs})});
    if (!res.ok) return this.office.toast('Could not save the design.');
    const company = await res.json();
    if (what === 'time' || what === 'weather') {  // no rebuild needed
      this.office.company = company;
      this.office.applyAmbience(company.design);
    } else {
      this.office.build(company);
    }
    this.render();
  }
}

// ── small formatters for the Results window ──
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const secs = (v) => (v == null ? '—' : v < 60 ? `${Math.round(v)}s` : `${Math.floor(v / 60)}m ${String(Math.round(v % 60)).padStart(2, '0')}s`);

// ── Settings: usage limits, agents & models, memory & performance, agent memory, safety, account, data ──
let APP = null;  // the app settings (/api/settings → app), e.g. the default usage limit for new goals
const SETTING_TABS = [['usage', 'Usage limits'], ['agents', 'Agents & models'], ['performance', 'Memory & performance'],
                      ['memory', 'Agent memory'], ['safety', 'Safety & commands'], ['account', 'Account'], ['data', 'Data'],
                      ['about', 'About app']];
const bytes = (n) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1048576).toFixed(1)} MB`
  : `${(n / 1024 ** 3).toFixed(2)} GB`;

class SettingsWindow {
  constructor(office) {
    this.office = office;
    this.tab = 'usage';
    this.data = null;
    const el = this.el = document.createElement('div');
    el.className = 'office-dialog office-settings';
    el.hidden = true;
    el.innerHTML = `
      <div class="card wide">
        <nav class="s-nav"><div class="title">Settings</div>
          ${SETTING_TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</nav>
        <div class="s-main"><button class="x" title="Close">×</button><div class="s-body"></div></div>
      </div>`;
    office.el.appendChild(el);
    this.body = el.querySelector('.s-body');
    el.querySelector('.x').onclick = () => this.close();
    el.addEventListener('click', (e) => {
      if (e.target === el) return this.close();
      const tab = e.target.closest('[data-tab]');
      if (tab) { this.tab = tab.dataset.tab; this.render(); return; }
      const act = e.target.closest('[data-act]');
      if (act) this.act(act.dataset.act, act);
    });
    el.addEventListener('change', (e) => {
      if (e.target.matches('input[type=file][data-import]')) this.importFile(e.target);
      if (e.target.matches('select[data-lang]')) setLang(e.target.value);
    });
    this.load();
  }

  async load() {
    try {
      this.data = await (await fetch('/api/settings')).json();
      APP = this.data.app;
    } catch { /* signed out, or the server is restarting */ }
    if (!this.el.hidden) this.render();
  }

  open(tab) { if (tab) this.tab = tab; this.el.hidden = false; this.load(); this.render(); }
  close() { this.el.hidden = true; this.wait?.cancel(); }  // stops waiting for a Google link

  render() {
    this.el.querySelectorAll('.s-nav [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const d = this.data;
    if (!d) { this.body.innerHTML = '<div class="s-note">Loading…</div>'; return; }
    const owner = d.account.role === 'owner';
    const lock = owner ? '' : ' disabled';
    const num = (section, key, min, max, unit = '', step = 1) =>
      `<input type="number" data-s="${section}.${key}" min="${min}" max="${max}" step="${step}" value="${d.app[section][key]}"${lock}>${unit}`;
    const row = (label, control, help = '') => `<div class="s-row"><div><b>${label}</b>${help ? `<span>${help}</span>` : ''}</div>
      <div class="s-ctl">${control}</div></div>`;
    const toggle = (section, key) => `<label class="switch"><input type="checkbox" data-s="${section}.${key}"${d.app[section][key] ? ' checked' : ''}${lock}><i></i></label>`;
    const save = (what = 'app') => `<div class="actions">${owner || what !== 'app' ? `<button class="primary" data-act="save-${what}">Save</button>` : ''}</div>`;
    const ownerOnly = owner ? '' : '<div class="s-note warn">Only the owner can change these settings.</div>';
    const head = (title, sub) => `<div class="s-title">${title}</div><div class="s-sub">${sub}</div>`;
    const u = d.claude || {};
    let html = '';
    if (this.tab === 'usage') {
      html = head('Usage limits', 'Each goal has its own budget in dollars, set when you start it. The goal pauses at its budget and asks you what to do.') + ownerOnly +
        row('Check each goal when it ends', toggle('checks', 'enabled'),
            'An independent, read-only checker (Haiku) scores each finished goal against its brief (see Results). '
            + 'Each check uses a small share of the limit; goals with no output are scored without it.') + save();
    } else if (this.tab === 'agents') {
      const a = d.agents || {};
      const helperOptions = [['off', 'Off (recommended)'], ...MODELS.map(([id, name]) => [id, `On, ${name} helpers`])];
      html = head('Agents & models', `Workspace-wide defaults for ${esc(this.office.company.name)}. Hubs and mini agents can still `
        + 'have their own model in the Workspace panel. Goals already running keep what they started with.') +
        row('Model', `<select data-a="model">${modelOptions(a.model || '', "Claude Code's default")}</select>`,
            'Haiku uses the least of the limit; Opus is the most capable.') +
        row('Instructions', `<select data-a="prompt_style"><option value="lean"${a.prompt_style !== 'full' ? ' selected' : ''}>Lean (about 40% less usage)</option>
            <option value="full"${a.prompt_style === 'full' ? ' selected' : ''}>Full Claude Code instructions</option></select>`,
            'Lean gives agents a short set of working habits instead of Claude Code\'s long instructions.') +
        row('Helpers', `<select data-a="helpers">${helperOptions.map(([v, l]) => `<option value="${v}"${(a.helpers || 'off') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`,
            'Small read-only agents an agent can send to read many files. Each one has its own overhead, so off is usually cheaper.') +
        save('agents');
    } else if (this.tab === 'performance') {
      html = head('Memory & performance', 'How much runs at once on this computer, and how far a single agent may go. '
        + 'Each agent is a separate Claude process that uses memory (roughly 300-500 MB each).') + ownerOnly +
        row('Agents at once', num('performance', 'agents_at_once', 1, 12), 'Lower this when the computer runs low on memory. Extra agents wait for a free slot.') +
        row('Goals at once', num('performance', 'goals_at_once', 1, 8)) +
        row('Steps per reply', num('performance', 'max_turns', 5, 120), 'How many tool steps an agent may take in one go before it must stop and report. Lower values use less of the limit.') +
        row('Messages per goal', num('performance', 'messages_per_goal', 10, 400), 'A guard against agents chatting back and forth forever.') +
        row('Keep an idle agent open', num('performance', 'idle_close', 5, 120, ' seconds'), 'Longer means quicker replies to new messages, but uses memory meanwhile.') +
        row('Message size limit', num('performance', 'message_mb', 1, 512, ' MB'),
            'The largest single message an agent can send back. A whole PDF or image arrives as one message. If agents stop with "JSON message exceeded maximum buffer size", raise this.') +
        save();
    } else if (this.tab === 'memory') {
      const nb = this.memory || {};
      html = head('Agent memory', 'Each hub keeps a notebook between goals: its manager saves short lessons '
        + '(preferences, what worked, what to avoid) and reads them at the start of every goal, so mistakes are not repeated.') + ownerOnly +
        row('Hub notebooks', toggle('memory', 'enabled'), 'Off: managers neither read nor save notes.') +
        row('Notebook size', num('memory', 'size', 500, 20000, ' characters', 500), 'How much of each notebook a manager reads (newest first). Larger notebooks use slightly more of the limit on every goal.') +
        save() + '<div class="s-title small">Notebooks</div>' +
        this.office.company.departments.map((h) => {
          const notes = nb[h.id] || [];
          return `<div class="nb"><div class="nb-head"><span class="dot" style="background:${h.color}"></span><b translate="no">${esc(h.name)}</b>
            <em>${plural(notes.length, 'note')}</em>${notes.length ? `<button class="link" data-act="clear-hub" data-hub="${h.id}">${t('notebook|Clear')}</button>` : ''}</div>
            ${notes.slice().reverse().map((n) => `<div class="nb-note"><span translate="no">${esc(n.text)}</span><em>${n.by === 'owner' ? 'owner' : esc(n.by)}</em>
              <button class="x-small" data-act="del-note" data-hub="${h.id}" data-at="${n.at}" title="Delete">×</button></div>`).join('')}
            <div class="nb-add"><input data-note-for="${h.id}" maxlength="300" placeholder="Add a note for this hub (e.g. Always write in British English)">
              <button class="ghost" data-act="add-note" data-hub="${h.id}">Add</button></div></div>`;
        }).join('');
      if (!this.memory) this.loadMemory();
    } else if (this.tab === 'safety') {
      html = head('Safety & commands', 'What mini agents may run on this computer. File edits are allowed only inside each goal\'s own folder.') + ownerOnly +
        row('Run safe commands without asking', toggle('safety', 'auto_safe'),
            'Listing, reading and searching files, and running tests or scripts inside the goal folder (e.g. python test_app.py, python -m pytest). Off: every command needs approval.') +
        row('Approve plans automatically', toggle('plans', 'auto_approve'),
            'Plans start right away, without waiting for you; the Inbox lists each plan that was approved. Your goal limits still apply. Commands that need permission always still ask.') +
        row('Explain commands in plain words', toggle('safety', 'explain'),
            'A command waiting for approval is explained by a small, low-cost model: what it does, what it touches and how risky it is, with a recommendation. Its usage counts toward the goal. Off: only the command is shown.') +
        save() +
        `<div class="s-note">Always needs approval: anything that installs, downloads, deletes, moves or changes files outside the goal folder.</div>
         <div class="s-note">Never allowed, even with approval: stopping or killing programs, starting servers or background programs, and shutting down or restarting the computer.</div>`;
    } else if (this.tab === 'account') {
      const claude = d.account.claude === 'plan' ? (
        USAGE?.claude === 'signed_out' ? 'No API key on this computer. See Menu → Claude is not connected for the steps.'
        : USAGE?.claude === 'missing' ? 'Claude Code is not installed on this computer'
        : "This computer's API key")
        : d.account.claude === 'api_key' ? 'Own API key' : 'Not connected yet (goals need a Claude connection)';
      const google = d.providers.includes('google');
      const only = d.google_only;
      const linked = d.identities.find((i) => i.provider === 'google');
      const g = d.sign_in?.google;
      html = head('Account', 'Who is signed in, and how their agents reach Claude.') +
        `<div class="acct"><div class="avatar">${esc(d.account.name.slice(0, 1).toUpperCase())}</div><div><b translate="no">${esc(d.account.name)}</b>
          <span>${esc(d.account.login)} · ${d.account.role === 'owner' ? 'Owner' : 'Member'}</span><span>Claude: ${claude}</span></div>
          <button class="ghost" data-act="sign-out">Sign out</button></div>` +
        row('Language', languageSelect(), "The language of the app's screens. Agents answer in the language of the goal.") +
        (linked ? row('Google account', `<bdi translate="no">${esc(linked.email)}</bdi>${only ? '' : ' <button class="ghost" data-act="unlink-google">Unlink</button>'}`,
                      only ? 'This account signs in with this Google account.' : 'This Google account can also be used to sign in.')
          : google ? row('Google account', '<button class="ghost" data-act="link-google">Link Google account</button>',
                         'Sign in with Google instead of the password. The Google page opens in this computer\'s browser.') : '') +
        (only ? '' : `<div class="s-title small">${d.account.has_password ? 'Change password' : 'Set a password'}</div>
         <div class="pw">${d.account.has_password ? '<input type="password" data-pw="old" placeholder="Current password" autocomplete="current-password">' : ''}
           <input type="password" data-pw="new" placeholder="New password (6+ characters)" autocomplete="new-password">
           <button class="ghost" data-act="password">${d.account.has_password ? 'Change' : 'Set'}</button></div>`) +
        (owner ? `${!google ? '' : `<div class="s-title small">Sign in with Google</div>
          ${row('Google only', `<button class="ghost" data-act="${only ? 'only-off' : 'only-on'}">${only ? 'Turn off' : 'Turn on'}</button>`,
            only ? "On: accounts sign in with Google only; passwords are not used. Backup: \"Can't use Google?\" on the sign-in screen (a code in a file on this computer)."
              : 'Accounts sign in with Google only, and passwords are no longer used. Needs this account linked to Google first.')}
          <div class="s-sub">${t(g.built_in
            ? 'The Google client is built into the app, so nothing needs setting up. Another Google Cloud OAuth client of the type <b>Desktop app</b> can be pasted below and is then used instead.'
            : 'Lets accounts sign in with a real Google account. Needs a free Google Cloud OAuth client of the type <b>Desktop app</b>: the steps are in the manual (About app → Manual, section 12).')}</div>
          <div class="pw"><input data-g="client_id" placeholder="Client ID" value="${esc(g.client_id)}" spellcheck="false">
            <input type="password" data-g="client_secret" placeholder="${g.has_secret ? 'Client secret (saved)' : 'Client secret'}" autocomplete="off">
            <button class="ghost" data-act="save-google">Save</button>
            ${g.client_id ? `<button class="ghost" data-act="off-google">${g.built_in ? 'Use the built-in client' : 'Turn off'}</button>` : ''}</div>
          <div class="s-note">${t(google ? 'On.' : 'Off.')} ${t('Google sends the browser back to {uri}. There is nothing to enter for a Desktop app client.',
            {uri: `<code translate="no">${esc(g.redirect)}</code>`})}</div>`}
          <div class="s-title small">Accounts on this app</div><div class="accts"></div>
          <div class="s-note">Goals run on the owner's API key, so members can set up workspaces but cannot start goals yet.</div>
          <div class="pw"><input data-new="name" placeholder="Name"><input data-new="login" placeholder="${only ? 'Their Google address' : google ? 'Sign-in name or Google address' : 'Sign-in name'}">
            ${only ? '' : `<input type="password" data-new="password" placeholder="${google ? 'Password (blank: Google only)' : 'Password'}">`}<button class="ghost" data-act="add-account">Add account</button></div>` : '');
      if (owner) this.loadAccounts();
    } else if (this.tab === 'data') {
      const x = d.data;
      html = head('Data', 'Where Intern Co. keeps things on this computer.') +
        (owner ? row('Output folder', `<div class="pw"><input data-output value="${esc(x.output)}" placeholder="${t('Not set')}" spellcheck="false" translate="no">
            ${x.native ? '<button class="ghost" data-act="output-choose">Choose…</button>' : ''}
            <button class="ghost" data-act="output-save">Save</button>
            ${x.output ? '<button class="ghost" data-act="output-open">Open</button><button class="ghost" data-act="output-off">Turn off</button>' : ''}</div>`,
            x.output ? 'When a goal ends, a copy of its files (documents, code, pictures) is saved here, in a folder named after the date and the goal. The goal folder below stays as it is.'
              : "Choose a folder (for example in Documents) and a copy of each finished goal's files is saved there, in a folder named after the date and the goal. Not set: the files stay only in the goal folders below.")
          : x.output ? row('Output folder', '', esc(x.output)) : '') +
        row('Goal folders', `${x.goal_folders} · ${bytes(x.workspaces_bytes)}`, esc(x.workspaces)) +
        row('Shared files', `${x.library_files} files · ${bytes(x.library_bytes)}`, esc(x.library)) +
        row('Database', bytes(x.database_bytes), esc(x.database)) +
        (owner ? row('Clean up', `<input type="number" data-clean min="0" value="30"> days <button class="ghost" data-act="cleanup">Delete older folders</button>`,
                     'Deletes goal folders (the files the teams produced) unchanged for this many days. Folders of running goals are kept.') : '') +
        row('Export workspaces', '<a class="ghost btn" href="/api/data/export" download>Download</a>',
            'All workspaces (hubs, people, purposes, designs) in one file, for backup or for moving to another computer.') +
        row('Import workspaces', '<label class="ghost btn">Choose file<input type="file" accept=".json" data-import hidden></label>',
            'Adds the workspaces from an exported file. Nothing existing is overwritten.');
    }
    if (this.tab === 'about') {
      const a = this.about;
      html = !a ? '<div class="s-note">Loading…</div>' : `
        <div class="about-head"><img src="/intern-co.png" alt=""><div><div class="s-title">${esc(a.name)}</div>
          <div class="about-ver">Version ${esc(a.version)} · ${esc(a.date)}</div>
          <div class="s-sub">Teams of AI agents on this computer that get tasks done efficiently while keeping Claude usage
            low: set a goal, approve the plan, and the agents do the work.</div></div></div>
        ${row('Claude Code', esc(a.claude_code || 'checking…'), 'The agents run as Claude Code sessions with this computer\'s API key.')}
        ${row('Author', '<span translate="no">Jason D Anderson · 電気通信大学大学院</span>')}
        ${row('License', '<span translate="no">MIT License</span>')}
        ${row('Python', esc(a.python))}
        ${row('App folder', '', esc(a.folder))}
        <div class="s-title small">Manual</div>
        <div class="s-sub">Everything the app can do. It is also the file MANUAL.md in the app folder, and it is kept up to date with each new feature.</div>
        <div class="manual" translate="no">${a.manual}</div>`;
      if (!a) this.loadAbout();
    }
    this.body.innerHTML = html + '<div class="s-msg"></div>';
    // links in the manual's contents jump within the manual
    this.body.querySelectorAll('.manual a[href^="#"]').forEach((link) => {
      link.onclick = (e) => {
        e.preventDefault();
        this.body.querySelector(`.manual [id="${CSS.escape(link.getAttribute('href').slice(1))}"]`)?.scrollIntoView({behavior: 'smooth'});
      };
    });
  }

  async loadAbout() {
    this.about = await (await fetch('/api/about')).json();
    if (this.tab === 'about') this.render();
  }

  async loadMemory() {
    this.memory = await (await fetch('/api/memory')).json();
    if (this.tab === 'memory') this.render();
  }

  async loadAccounts() {
    const list = await (await fetch('/api/accounts')).json();
    const box = this.body.querySelector('.accts');
    if (!box) return;
    box.innerHTML = list.map((a) => `<div class="acct-row"><b translate="no">${esc(a.name)}</b><span>${esc(a.login)} · ${a.role === 'owner' ? 'Owner' : 'Member'}
      · ${a.claude === 'plan' ? 'API key' : a.claude === 'api_key' ? 'API key' : 'not connected'}${
      a.sign_ins.includes('google') ? ' · Google' : !a.has_password ? ' · Google only (not signed in yet)' : ''}</span>
      ${a.id === this.data.account.id ? '<em>signed in</em>' : `<span class="acct-acts">${this.data.google_only ? ''
        : `<button class="link" data-act="reset-password" data-id="${a.id}">Reset password</button>`}
        <button class="link" data-act="remove-account" data-id="${a.id}">Remove</button></span>`}</div>`).join('');
  }

  msg(text, bad = false) {
    const m = this.body.querySelector('.s-msg');
    if (m) { m.textContent = text; m.classList.toggle('bad', bad); }
  }

  async send(url, method, body) {
    const res = await fetch(url, {method, headers: {'Content-Type': 'application/json'}, body: body && JSON.stringify(body)});
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
    return out;
  }

  async act(what, b) {
    const val = (sel) => this.body.querySelector(sel)?.value || '';
    try {
      if (what === 'save-app') {
        const changes = {};
        this.body.querySelectorAll('[data-s]').forEach((x) => {
          const [section, key] = x.dataset.s.split('.');
          (changes[section] ||= {})[key] = x.type === 'checkbox' ? x.checked : Number(x.value);
        });
        this.data.app = APP = await this.send('/api/settings', 'PUT', changes);
        this.render();
        this.msg('Saved.');
      } else if (what === 'save-agents') {
        const changes = Object.fromEntries([...this.body.querySelectorAll('[data-a]')].map((x) => [x.dataset.a, x.value]));
        this.data.agents = await this.send('/api/settings/agents', 'PUT', changes);
        Object.assign(this.office.company, this.data.agents);
        this.render();
        this.msg('Saved. New goals use these.');
      } else if (what === 'add-note') {
        const input = this.body.querySelector(`[data-note-for="${b.dataset.hub}"]`);
        await this.send(`/api/memory/${b.dataset.hub}`, 'POST', {text: input.value});
        this.memory = null;
        await this.loadMemory();
      } else if (what === 'del-note') {
        await this.send(`/api/memory/${b.dataset.hub}?at=${b.dataset.at}`, 'DELETE');
        this.memory = null;
        await this.loadMemory();
      } else if (what === 'clear-hub') {
        if (!confirm(t('Clear this hub\'s whole notebook?'))) return;
        await this.send(`/api/memory/${b.dataset.hub}`, 'DELETE');
        this.memory = null;
        await this.loadMemory();
      } else if (what === 'sign-out') {
        signOut();
      } else if (what === 'password') {
        await this.send('/api/account/password', 'POST', {old: val('[data-pw="old"]'), new: val('[data-pw="new"]')});
        const first = !this.data.account.has_password;
        await this.load();
        this.msg(first ? 'Password set.' : 'Password changed.');
      } else if (what === 'link-google') {
        this.wait?.cancel();
        const wait = this.wait = browserWait();
        b.disabled = true;
        this.msg('Finish signing in with Google in the browser window that opened.');
        try {
          if (!await viaBrowser('/api/account/google/link', wait)) return;
        } finally {
          if (this.wait === wait) this.wait = null;
        }
        await this.load();
        this.msg('Google account linked.');
      } else if (what === 'unlink-google') {
        if (!confirm(t('Unlink the Google account? Signing in then needs the password.'))) return;
        await this.send('/api/account/google/link', 'DELETE');
        await this.load();
        this.msg('Google account unlinked.');
      } else if (what === 'save-google' || what === 'off-google') {
        const off = what === 'off-google';
        const builtIn = this.data.sign_in.google.built_in;
        if (off && !builtIn && !confirm(t('Turn off Google sign-in? Accounts without a password will then be unable to sign in.'))) return;
        await this.send('/api/settings/sign-in', 'PUT', {provider: 'google', client_id: off ? '' : val('[data-g="client_id"]'),
                                                         client_secret: off ? '' : val('[data-g="client_secret"]')});
        await this.load();
        this.msg(off ? (builtIn ? 'The built-in Google client is used again.' : 'Google sign-in is off.') : 'Saved. The sign-in screen now offers Google.');
      } else if (what === 'only-on' || what === 'only-off') {
        const on = what === 'only-on';
        if (on && !confirm(t('Sign in with Google only? Passwords are then not used, and accounts not linked to Google can only sign in with the backup code until they are.'))) return;
        const r = await this.send('/api/settings/sign-in/only', 'PUT', {on});
        await this.load();
        this.msg(!on ? 'Google only is off. Passwords work again.'
          : r.locked_out.length ? t('Google only is on. Not linked to Google yet: {names}. They can sign in with the backup code, or be removed and added again with their Google address.', {names: r.locked_out.join(', ')})
          : 'Google only is on.');
      } else if (what === 'add-account') {
        const password = val('[data-new="password"]');
        await this.send('/api/accounts', 'POST', {name: val('[data-new="name"]'), login: val('[data-new="login"]'), password});
        this.render();
        this.msg(password ? 'Account added. They sign in with that name and password.'
          : 'Account added. They sign in with Google, using that address.');
      } else if (what === 'reset-password') {
        const password = prompt(t('A new password for this account (at least 6 characters). The account is signed out everywhere; give the member the new password, and they can change it after signing in.'));
        if (password === null) return;
        await this.send(`/api/accounts/${b.dataset.id}/password`, 'POST', {password});
        this.loadAccounts();
        this.msg('Password reset. The member signs in with the new password.');
      } else if (what === 'remove-account') {
        if (!confirm(t('Remove this account and its sign-ins?'))) return;
        await this.send(`/api/accounts/${b.dataset.id}`, 'DELETE');
        this.loadAccounts();
      } else if (what === 'output-choose') {
        const r = await this.send('/api/settings/output/choose', 'POST');
        if (r.folder) this.body.querySelector('[data-output]').value = r.folder;
      } else if (what === 'output-save' || what === 'output-off') {
        const r = await this.send('/api/settings/output', 'PUT', {folder: what === 'output-off' ? '' : val('[data-output]')});
        await this.load();
        this.msg(r.output ? 'Saved. Finished goals are copied to this folder.' : 'Turned off. Files stay only in the goal folders.');
      } else if (what === 'output-open') {
        await this.send('/api/settings/output/open', 'POST');
      } else if (what === 'cleanup') {
        const days = Number(val('[data-clean]') || 30);
        if (!confirm(t('Delete goal folders unchanged for {days} days? The files in them are deleted permanently.', {days}))) return;
        const r = await this.send('/api/data/cleanup', 'POST', {days});
        await this.load();
        this.msg(`Deleted ${plural(r.removed, 'folder')}, freed ${bytes(r.freed_bytes || 0)}.`);
      }
    } catch (err) {
      this.msg(err.message, true);
    }
  }

  async importFile(input) {
    const file = input.files[0];
    if (!file) return;
    const res = await fetch('/api/data/import', {method: 'POST', body: file});
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return this.msg(out.error || 'That file could not be imported.', true);
    this.msg(`Imported ${out.added} ${out.added === 1 ? 'workspace' : 'workspaces'}. Open them from the workspace name at the top left.`);
  }
}

// ── Claude plan usage: the 5-hour and weekly windows, and the limits that pause the office ──
class UsageWindow {
  constructor(office) {
    this.office = office;
    const el = this.el = document.createElement('div');
    el.className = 'office-dialog office-usage';
    el.hidden = true;
    el.innerHTML = `
      <div class="card">
        <div class="head"><div><div class="title">Claude usage</div>
          <div class="subtitle">Agents run on your own Anthropic API key, which is billed per use in dollars. Each goal has its own budget and pauses when it reaches it.</div></div>
          <button class="x" title="Close">×</button></div>
        <div class="u-body"></div>
        <div class="u-limits-line"></div>
        <div class="u-note"></div>
        <div class="actions"><button class="ghost u-refresh">Check now</button><button class="primary u-limits">Change limits</button></div>
      </div>`;
    office.el.appendChild(el);
    el.querySelector('.x').onclick = () => this.close();
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    el.querySelector('.u-refresh').onclick = async () => {
      el.querySelector('.u-note').textContent = 'Checking with Claude…';
      this.update(await (await fetch('/api/usage/refresh', {method: 'POST'})).json());
    };
    el.querySelector('.u-limits').onclick = () => { this.close(); this.office.settings.open('usage'); };
    fetch('/api/usage').then((r) => r.json()).then((u) => this.update(u)).catch(() => {});
  }

  open() { this.el.hidden = false; this.render(); }
  close() { this.el.hidden = true; }

  update(usage) {
    USAGE = usage;
    this.render();
  }

  render() {
    const u = USAGE || {};
    // the toolbar meter: the 5-hour window, coloured as it fills
    const btn = this.office.ui.querySelector('.tb-usage');
    const five = u.five_hour;
    // no working Claude sign-in on this computer: say so in the menu, and open this window once with the steps
    const off = u.claude === 'signed_out' || u.claude === 'missing';
    btn.hidden = u.plan === false && !off;
    btn.classList.toggle('off', off);
    btn.querySelector('b').textContent = off ? 'Claude is not connected' : 'Usage';
    btn.querySelector('em').style.display = off ? 'none' : '';
    if (off && !this.warned) { this.warned = true; this.el.hidden = false; }
    if (!off) this.warned = false;
    btn.querySelector('.u-five').textContent = five ? `${Math.round(five.pct)}%` : '…';
    const fill = btn.querySelector('.u-meter i');
    fill.style.width = `${Math.min(100, five?.pct || 0)}%`;
    fill.className = !five ? '' : five.pct >= (u.limits?.five_hour || 80) ? 'hot' : five.pct >= 60 ? 'warm' : '';
    btn.title = five ? `Claude plan: ${Math.round(five.pct)}% of the 5-hour limit used (${resetText(five.resets_at)})` +
      (u.seven_day ? ` · ${Math.round(u.seven_day.pct)}% of the weekly limit` : '') : 'Claude connection';
    if (this.el.hidden) return;
    const bar = (label, w, limit) => !w ? '' : `
      <div class="u-row"><div class="u-top"><b>${label}</b><span>${Math.round(w.pct)}% used · ${resetText(w.resets_at)}</span></div>
        <div class="u-bar"><i style="width:${Math.min(100, w.pct)}%" class="${w.pct >= limit ? 'hot' : w.pct >= 60 ? 'warm' : ''}"></i>
          <em style="left:${limit}%" title="Pause limit"></em></div></div>`;
    const steps = (first) => `<div class="u-off">${t('<b>Claude is not connected on this computer.</b> Goals cannot start until it is. The app account (sign-in name and password) only opens this app; the agents use your own Anthropic API key.<ol>{first}<li>Create an API key at <code>console.anthropic.com</code>.</li><li>Save it on this computer as <code>ANTHROPIC_API_KEY</code>. MANUAL.md, section 1, has the steps.</li><li>Close the app, start it again and choose <b>Check now</b>.</li></ol>', {first})}</div>`;
    this.el.querySelector('.u-body').innerHTML = u.claude === 'signed_out' ? steps('')
      : u.claude === 'missing' ? steps('<li>Install Claude Code (MANUAL.md, section 1).</li>')
      : u.claude === 'unreachable' ? '<div class="u-api">Claude could not be reached. There may be no internet connection, or Claude is not responding. Choose Check now to try again.</div>'
      : u.plan === false
      ? '<div class="u-api">Connected with an API key: work is billed per use in dollars. Goals use dollar budgets.</div>'
      : (bar('5-hour window', u.five_hour, u.limits?.five_hour || 80) + bar('Weekly window', u.seven_day, u.limits?.seven_day || 90))
        || '<div class="u-api">Checking plan usage…</div>';
    this.el.querySelector('.u-limits').hidden = off;  // nothing to limit yet: Check now is the one thing to do
    this.el.querySelector('.u-refresh').className = off ? 'primary u-refresh' : 'ghost u-refresh';
    this.el.querySelector('.u-limits-line').textContent = off || u.plan === false || !u.limits ? ''
      : `All work pauses at ${u.limits.five_hour}% of the 5-hour window or ${u.limits.seven_day}% of the week (the black marks).`;
    const ago = u.updated ? Math.round((Date.now() / 1000 - u.updated) / 60) : null;
    this.el.querySelector('.u-note').textContent = off || u.claude === 'unreachable' ? '' :
      (u.paused ? 'All work is paused at a usage limit: see Inbox. ' : '') +
      (u.pct_per_usd ? 'Goals, agents and cards show their approximate share of the 5-hour limit, measured from earlier work. '
        : 'Still measuring how much of the limit the office\'s work uses; goal and card figures appear after the first goals. ') +
      (ago != null ? `Last checked ${ago < 1 ? 'just now' : `${ago} min ago`}.` : '');
  }
}

// ── shared files: documents every hub's agents can read (read-only for them) ──
class FilesWindow {
  constructor(office) {
    this.office = office;
    this.files = [];
    const el = this.el = document.createElement('div');
    el.className = 'office-dialog office-files';
    el.hidden = true;
    el.innerHTML = `
      <div class="card">
        <div class="head"><div><div class="title">Shared files</div>
          <div class="subtitle">Papers, data or notes for the whole workspace. Every hub's agents can read them but never change
            them. Agents see only the file names and notes and open only what they need, which keeps usage low.</div></div>
          <button class="x" title="Close">×</button></div>
        <label class="drop-zone"><input type="file" multiple hidden>
          <b>Drop files here</b> or click to choose<span>PDF, Word, PowerPoint, text, Markdown, CSV, code, images · up to 30 MB</span></label>
        <div class="f-error"></div>
        <div class="file-list"></div>
      </div>`;
    office.el.appendChild(el);
    this.list = el.querySelector('.file-list');
    const input = el.querySelector('input[type=file]');
    const zone = el.querySelector('.drop-zone');
    el.querySelector('.x').onclick = () => this.close();
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    input.onchange = () => { this.upload([...input.files]); input.value = ''; };
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); this.upload([...e.dataTransfer.files]); });
    this.list.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-remove]');
      if (!b || !confirm(t('Remove {name} from the shared files?', {name: b.dataset.remove}))) return;
      await fetch(`/api/files/${encodeURIComponent(b.dataset.remove)}`, {method: 'DELETE'});
      this.load();
    });
    this.list.addEventListener('change', (e) => {  // a note is saved when the field loses focus
      const n = e.target.closest('input[data-note]');
      if (n) fetch(`/api/files/${encodeURIComponent(n.dataset.note)}`, {method: 'PUT', headers: {'Content-Type': 'application/json'},
                                                                      body: JSON.stringify({note: n.value})});
    });
  }

  open() { this.el.hidden = false; this.load(); }
  close() { this.el.hidden = true; }

  async load() {
    try {
      this.files = await (await fetch('/api/files')).json();
    } catch { this.files = []; }
    this.render();
    this.office.refreshFilesBadge(this.files.length);
  }

  async upload(files) {
    const error = this.el.querySelector('.f-error');
    error.textContent = '';
    for (const f of files) {
      error.textContent = `Adding ${f.name}…`;
      const r = await fetch(`/api/files?name=${encodeURIComponent(f.name)}`, {method: 'POST', body: f});
      const body = await r.json().catch(() => ({}));
      error.textContent = r.ok ? '' : `${f.name}: ${tr(body.error || 'could not be added')}`;
      if (!r.ok) break;
    }
    this.load();
  }

  render() {
    const size = (n) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
    const icon = (name) => {
      const ext = name.split('.').pop().toLowerCase();
      return {pdf: 'PDF', docx: 'DOC', doc: 'DOC', pptx: 'PPT', csv: 'CSV', xlsx: 'XLS', md: 'MD', txt: 'TXT', json: 'JSON',
              png: 'IMG', jpg: 'IMG', jpeg: 'IMG', py: 'PY', js: 'JS'}[ext] || ext.slice(0, 4).toUpperCase() || 'FILE';
    };
    this.list.innerHTML = this.files.length ? this.files.map((f) => `
      <div class="file-row${f.readable ? '' : ' unreadable'}">
        <span class="f-icon">${esc(icon(f.name))}</span>
        <div class="f-main"><div class="f-name"><bdi translate="no">${esc(f.name)}</bdi><span>${size(f.size)}${f.readable ? '' : ' · agents can\'t read this type'}</span></div>
          <input data-note="${esc(f.name)}" value="${esc(f.note || '')}" maxlength="300" placeholder="Note for the agents: what is this, when to use it"></div>
        <button class="f-remove" data-remove="${esc(f.name)}" title="Remove">×</button>
      </div>`).join('')
      : '<div class="f-empty">No shared files yet.</div>';
  }
}

// ── the Results window: how close each goal got to its brief, success and failure, team details ──
const VERDICT = {achieved: ['Achieved', '#2F7D5B'], partly: ['Partly achieved', '#B07A1E'], not_achieved: ['Not achieved', '#B4533A'],
                 unchecked: ['Not checked', '#8A9099'], stopped_early: ['Stopped early', '#8A9099']};
const WEIGHT = {core: 'Core', important: 'Important', extra: 'Extra'};

class ResultsWindow {
  constructor(office) {
    this.office = office;
    this.days = 30;
    this.scope = 'company';
    this.tab = 'goals';
    const el = this.el = document.createElement('div');
    el.className = 'office-dialog office-results';
    el.hidden = true;
    el.innerHTML = `
      <div class="card wide">
        <div class="head"><div><div class="title">Results</div>
          <div class="subtitle">How closely each goal's result matches what the prompt asked for, and how each hub and agent performed.</div></div>
          <button class="x" title="Close">×</button></div>
        <div class="filters">
          <div class="seg tabs" data-filter="tab"><button data-v="goals">Goals</button><button data-v="teams">Teams</button></div>
          <div class="seg" data-filter="days">${[[7, '7 days'], [30, '30 days'], [0, 'All time']].map(([v, l]) =>
            `<button data-v="${v}">${l}</button>`).join('')}</div>
          <div class="seg" data-filter="scope"><button data-v="company">This workspace</button><button data-v="all">All workspaces</button></div>
        </div>
        <div class="r-body"></div>
      </div>`;
    office.el.appendChild(el);
    el.querySelector('.x').onclick = () => this.close();
    el.addEventListener('click', async (e) => {
      if (e.target === el) return this.close();
      const doc = e.target.closest('[data-doc]');
      if (doc) return openDocument(doc.dataset.doc, office);
      const folder = e.target.closest('[data-folder]');
      if (folder) return openResultFolder(folder.dataset.folder, office);
      const more = e.target.closest('[data-continue]');
      if (more) return (await continueGoal(more.dataset.continue, office)) && this.load();
      const check = e.target.closest('[data-check]');
      if (check) {
        check.disabled = true;
        check.textContent = 'Checking…';
        await fetch(`/api/results/${check.dataset.check}/check`, {method: 'POST'});
        return this.load();
      }
      const b = e.target.closest('.seg button');
      if (!b) return;
      const which = b.closest('.seg').dataset.filter;
      this[which] = which === 'days' ? Number(b.dataset.v) : b.dataset.v;
      if (which === 'tab' && this.data) return this.show(this.data);
      this.load();
    });
  }

  open() { this.el.hidden = false; this.load(); }
  close() { this.el.hidden = true; clearTimeout(this.timer); }

  async load() {
    clearTimeout(this.timer);
    this.data = await (await fetch(`/api/results?days=${this.days}&scope=${this.scope}`)).json();
    this.show(this.data);
    if (this.data.checking.length && !this.el.hidden) this.timer = setTimeout(() => this.load(), 4000);  // a check is running
  }

  show(r) {
    this.el.querySelectorAll('.seg button').forEach((b) => {
      const which = b.closest('.seg').dataset.filter;
      b.classList.toggle('on', String(this[which]) === b.dataset.v);
    });
    const open = new Set([...this.el.querySelectorAll('details[open][data-key]')].map((d) => d.dataset.key));
    const body = this.el.querySelector('.r-body');
    if (!r.goals.length) {
      body.innerHTML = `<div class="r-empty">${t('No goals yet. Start one with <b>New goal</b>; each finished goal is checked against its brief and listed here.')}</div>`;
      return;
    }
    body.innerHTML = this.tab === 'teams' ? this.teams(r.teams, r.cards, open) : this.goals(r, open);
  }

  goals(r, open) {
    const s = r.summary;
    const tile = (label, value, note, color) =>
      `<div class="kpi-tile"><div class="k-label">${label}</div><div class="k-value"${color ? ` style="color:${color}"` : ''}>${value}</div>` +
      (note ? `<div class="k-note">${note}</div>` : '') + '</div>';
    const reasons = Object.entries(s.reasons);
    const most = Math.max(1, ...reasons.map(([, n]) => n));
    const reasonRows = reasons.map(([k, n]) => `<div class="reason"><span>${esc(r.outcomes[k] || k)}</span>
      <span class="track"><span class="fill" style="width:${Math.round(100 * n / most)}%"></span></span><b>${n}</b></div>`).join('');
    return `
      <div class="kpi-hero">
        <div><div class="k-label">Average intent match</div><div class="hero-value">${pct(s.average_score)}</div>
          <div class="k-note">${s.checked ? `across ${plural(s.checked, 'scored goal')}` : 'no goal scored yet'}</div></div>
        <div class="kpi-tiles">
          ${tile('Goals achieved', pct(s.success_rate), s.checked ? `${s.achieved} of ${s.checked} scored 80% or more` : '')}
          ${tile('Achieved', s.achieved, '80% or more', VERDICT.achieved[1])}
          ${tile('Partly achieved', s.partly, '40–79%', VERDICT.partly[1])}
          ${tile('Not achieved', s.not_achieved, 'below 40%', VERDICT.not_achieved[1])}
        </div>
      </div>
      ${s.stopped_early ? `<div class="r-note">${plural(s.stopped_early, 'goal')} stopped before anything was delivered: listed below, not scored.</div>` : ''}
      ${reasonRows ? `<div class="r-section">Why goals fell short</div><div class="reasons">${reasonRows}</div>` : ''}
      <div class="r-section">Goals <span>newest first</span></div>
      ${r.checks_enabled ? '' : '<div class="r-note">Automatic goal checks are off (☰ Menu → Settings → Usage limits). Goals can still be checked individually.</div>'}
      ${r.goals.map((g) => this.goalCard(g, r, open)).join('')}`;
  }

  goalCard(g, r, open) {
    const c = g.check;
    const checking = r.checking.includes(g.id);
    const v = g.status === 'running' ? ['Running', '#4D6E9E'] : checking ? ['Checking…', '#4D6E9E'] : VERDICT[c?.verdict || 'unchecked'] || VERDICT.unchecked;
    const score = c?.score != null && !checking ? `${c.score}%` : g.status === 'running' ? '…' : '—';
    const when = new Date(g.started_at * 1000).toLocaleDateString(LOCALE, {day: 'numeric', month: 'short'});
    const mark = {met: '✓', partly: '~', missing: '✗'};
    const usage = used(g.cost, {short: true});
    const usageText = /^[≈$]/.test(usage) ? ` · used ${usage}` : '';  // only once it can be shown
    const weighted = c?.weighted;
    const order = {core: 0, important: 1, extra: 2};
    const reqs = [...(c?.requirements || [])].sort((a, b) => (order[a.weight] ?? 1) - (order[b.weight] ?? 1))
      .map((q) => `<div class="req ${q.status}"><span class="m">${mark[q.status]}</span>
        <div>${weighted ? `<em class="w ${q.weight}">${WEIGHT[q.weight] || ''}</em>` : ''}<b translate="no">${esc(q.requirement)}</b>
          <span translate="no">${esc(q.evidence)}</span></div></div>`).join('');
    const canCheck = g.status !== 'running' && !checking && !g.early;
    const key = `g${g.id}`;
    return `<details class="goal-card${g.early ? ' early' : ''}" data-key="${key}"${open.has(key) ? ' open' : ''}>
      <summary><span class="score" style="--v:${v[1]}">${score}</span>
        <div class="g-main"><div class="g-text" translate="no">${esc(clip(g.goal, 140))}</div>
          <div class="g-meta">${when} · ${esc(g.status === 'running' ? 'In progress' : r.outcomes[g.outcome] || '')} · cards ${g.cards.passed}/${g.cards.total} passed${usageText}${g.rating ? ` · rated ${esc(g.rating)}` : ''}</div></div>
        <span class="verdict" style="--v:${v[1]}">${v[0]}</span></summary>
      <div class="g-detail">
        ${c?.intent || c?.delivered ? `<div class="ask-got">
          <div><div class="g-sub">Asked for${c.agreed ? ' · agreed before the start' : ''}</div><p translate="no">${esc(c.intent || '')}</p></div>
          <div><div class="g-sub">Delivered</div><p translate="no">${esc(c.delivered || '')}</p></div></div>` : ''}
        ${c?.summary ? `<p translate="no">${esc(c.summary)}</p>` : ''}
        ${reqs ? `<div class="reqs">${reqs}</div>` : ''}
        ${c?.missing?.length ? `<div class="g-sub">Still missing</div><ul translate="no">${c.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
        ${c?.next_step ? `<div class="g-sub">Next step</div><p translate="no">${esc(c.next_step)}</p>` : ''}
        ${!c && !checking && g.status !== 'running' ? '<p>Not checked against the goal yet.</p>' : ''}
        ${c?.requirements?.length && !weighted ? '<div class="r-note">Scored with the earlier method (every requirement counted the same). Check again to score it with core requirements.</div>' : ''}
        <div class="g-foot"><span translate="no">📁 ${esc(g.workspace || '')}</span>
          ${g.document ? `<button class="ghost" data-doc="${g.id}">📄 Open document</button>` : ''}
          ${g.status !== 'running' ? `<button class="ghost" data-folder="${g.id}">📁 Open folder</button>` : ''}
          ${CONTINUABLE.includes(g.status) ? `<button class="ghost" data-continue="${g.id}">▶ Continue</button>` : ''}
          ${canCheck ? `<button class="ghost" data-check="${g.id}">${c ? 'Check again' : 'Check now'}</button>` : ''}</div>
      </div></details>`;
  }

  teams(tm, k, open) {
    if (!tm.hubs.length) return '<div class="r-empty">No team activity in this period.</div>';
    const many = tm.companies > 1;
    const metric = (label, value, note, fill) => `<div class="t-metric"><div class="k-label">${label}</div>
      <div class="k-value">${value}</div>${fill == null ? '' : `<span class="track"><span class="fill" style="width:${Math.round(fill * 100)}%"></span></span>`}
      <div class="k-note">${note}</div></div>`;
    const cardsNote = (x) => [x.handed_in ? `${x.passed} of ${x.handed_in} handed-in cards passed` : '',
      x.interrupted ? plural(x.interrupted, 'card') + ' cut off by a stop' : '',
      x.not_started ? `${x.not_started} not started` : ''].filter(Boolean).map((s) => `<span>${s}</span>`).join(' · ') || 'no cards';
    const hubs = tm.hubs.map((h) => {
      const key = `h${h.company_id}:${h.hub}`;
      const people = h.people.map((p) => `<div class="t-row">
          <span class="t-name"><b translate="no">${esc(p.name)}</b><em translate="no">${esc(p.role || '')}</em></span>
          <span>${p.contribution == null ? '—' : pct(p.contribution)}</span>
          <span>${p.reliability == null ? '—' : pct(p.reliability)}</span>
          <span>${p.first_try == null ? '—' : pct(p.first_try)}</span>
          <span>${p.cost_per_card == null ? '—' : used(p.cost_per_card, {short: true})}</span>
          <span>${secs(p.time_per_card)}</span>
          <span class="t-cards">${cardsNote(p)}</span></div>`).join('');
      return `<details class="hub-card${h.started ? '' : ' idle'}" data-key="${esc(key)}"${open.has(key) ? ' open' : ''}>
        <summary>
          <div class="h-name"><span class="dot" style="background:${esc(h.color || '#9AA0A8')}"></span>
            <div><b translate="no">${esc(h.hub)}</b>${many ? `<span translate="no">${esc(h.company)}</span>` : ''}</div></div>
          ${h.started ? `<div class="h-metrics">
            ${metric('Contribution', h.contribution == null ? '—' : pct(h.contribution), `${plural(h.goals, 'goal')}`, h.contribution)}
            ${metric('Reliability', h.reliability == null ? '—' : pct(h.reliability), h.first_try == null ? cardsNote(h) : `first try ${pct(h.first_try)}`, h.reliability)}
            ${metric('Usage per card', h.cost_per_card == null ? '—' : used(h.cost_per_card, {short: true}), h.time_per_card == null ? 'passed cards' : `${secs(h.time_per_card)} per card`)}
          </div>` : '<div class="h-idle">Not started: its cards never began, because the goals were stopped first.</div>'}
        </summary>
        <div class="h-people">
          <div class="t-row t-head"><span>Name</span><span>Contribution</span><span>Reliability</span><span>First try</span>
            <span>Usage / card</span><span>Time / card</span><span>Cards</span></div>
          ${people}
        </div></details>`;
    }).join('');
    const models = (k.by_model || []).filter((m) => m.cards);
    return `
      <div class="r-note">${tm.goals_scored ? t('Contribution: the share of the goal checker\'s credit that came from each hub\'s work, traced through the files each agent made (core requirements count most). Reliability: cards passed out of those handed in.')
        : 'No scored goals yet: contribution appears once a goal with delivered work has been checked.'}
        ${tm.untraced ? ` ${t('{p} of the credit could not be traced to a person.', {p: pct(tm.untraced)})}` : ''}</div>
      <div class="hubs">${hubs}</div>
      ${models.length > 1 ? `<div class="r-section">By model</div><div class="kpi-table">
        <div class="t-row t-head"><span>Model</span><span>Cards</span><span>Passed</span><span>First try</span><span>Usage / card</span><span>Time / card</span></div>
        ${models.map((m) => `<div class="t-row"><span class="t-name">${esc(m.name)}</span><span>${m.cards}</span><span>${pct(m.success_rate)}</span>
          <span>${pct(m.first_time_right)}</span><span>${used(m.cost_per_card, {short: true})}</span><span>${secs(m.time_per_card)}</span></div>`).join('')}</div>` : ''}`;
  }
}

// ── the Companies window: switch between saved companies, build one for a goal, or start one from a template ──
// The workspace builder (workspace_builder.py) drafts a small team for what the owner wants to achieve; the draft can be
// revised in words, and once created the goal dialog opens with that aim, every hub picked and the lead hub set.
class CompaniesWindow {
  constructor(office) {
    this.office = office;
    const el = this.el = document.createElement('div');
    el.className = 'office-dialog office-companies';
    el.hidden = true;
    el.innerHTML = `
      <div class="card wide">
        <div class="head"><div><div class="title">Workspaces</div>
          <div class="subtitle">Switch between saved workspaces, build one for your goal, or start one from a template.</div></div>
          <button class="x" title="Close">×</button></div>
        <div class="section-title">Saved workspaces</div>
        <div class="mine"></div>
        <div class="section-title">Build a workspace for your goal</div>
        <div class="builder">
          <div class="b-hint">Say what you want to achieve, and a small team is designed for it: hubs, their purposes and the people in them.</div>
          <div class="b-ask"><textarea class="b-aim" rows="2" maxlength="2000" placeholder="e.g. Write and design a monthly newsletter for my bakery, with recipes and photos"></textarea>
            <button class="primary" data-act="design">✨ Design workspace</button></div>
          <div class="b-draft" hidden></div>
          <div class="b-error"></div>
        </div>
        <div class="section-title">Start from a template</div>
        <div class="templates"></div>
        <div class="c-error"></div>
      </div>`;
    office.el.appendChild(el);
    el.querySelector('.x').onclick = () => this.close();
    el.addEventListener('click', (e) => {
      if (e.target === el) return this.close();  // click outside the card
      this.onClick(e);
    });
  }

  async open() {
    if (this.office.link?.goalRunning) return this.office.toast('Switch workspaces after the current goal ends.');
    this.el.querySelector('.c-error').textContent = '';
    this.el.hidden = false;
    const [mine, templates] = await Promise.all([fetch('/api/companies').then((r) => r.json()),
                                                 fetch('/api/templates').then((r) => r.json())]);
    this.el.querySelector('.mine').innerHTML = mine.companies.map((c) => `
      <div class="company-row${c.id === mine.active ? ' active' : ''}">
        <div class="grow"><b translate="no">${esc(c.name)}</b><span>${plural(c.hubs, 'hub')} · ${plural(c.interns, 'mini agent')}</span></div>
        ${c.id === mine.active ? '<span class="open-now">Currently open</span>'
          : `<button class="ghost" data-act="delete" data-id="${c.id}">Delete</button>
             <button class="primary" data-act="open" data-id="${c.id}">Open</button>`}
      </div>`).join('');
    this.el.querySelector('.templates').innerHTML = templates.map((t) => `
      <div class="template" data-key="${t.key}">
        <div class="t-name">${esc(t.name)}</div>
        <div class="t-desc">${esc(t.description)}</div>
        <div class="t-hubs" translate="no">${t.hubs.map((h) => `<span>${esc(h)}</span>`).join('')}</div>
        <div class="t-foot"><input class="t-title" placeholder="Name, e.g. My ${esc(t.name)}" maxlength="40">
          <button class="primary" data-act="create" data-key="${t.key}">Create</button></div>
      </div>`).join('');
  }

  close() {
    this.el.hidden = true;
  }

  // The workspace builder's draft: its name can be edited here, everything else in the Workspace panel once created.
  renderDraft() {
    const {company, lead} = this.draft;
    const box = this.el.querySelector('.b-draft');
    const count = company.departments.reduce((n, d) => n + d.interns.length, 0);
    box.innerHTML = `
      <div class="b-head"><input class="b-name" maxlength="40" value="${esc(company.name)}" translate="no">
        <span>${plural(company.departments.length, 'hub')} · ${plural(count, 'mini agent')}</span></div>
      ${company.departments.map((d) => `<div class="b-hub" style="border-left-color:${d.color}">
        <div class="b-hub-name"><b translate="no">${esc(d.name)}</b>${d.id === lead ? '<em>Lead hub</em>' : ''}</div>
        <div class="b-purpose" translate="no">${esc(d.purpose)}</div>
        <div class="b-people"><span>Manager</span> <b translate="no">${esc(d.manager.name)}</b> · <span>Mini agents</span>
          <b translate="no">${d.interns.map((i) => `${esc(i.name)} (${esc(i.role)})`).join(', ')}</b></div></div>`).join('')}
      <div class="b-change"><input class="b-change-text" maxlength="500" placeholder="What should change? e.g. Add a hub that checks the facts">
        <button class="ghost" data-act="revise">Revise</button></div>
      <div class="b-foot"><span>Everything can still be changed later in the Workspace panel.</span>
        <button class="primary" data-act="build">Create workspace</button></div>`;
    box.hidden = false;
  }

  async design(b, error) {  // a first draft for the aim, or (revise) the draft changed as asked
    const revise = b.dataset.act === 'revise';
    const aim = revise ? this.aim : this.el.querySelector('.b-aim').value.trim();
    const change = revise ? this.el.querySelector('.b-change-text').value.trim() : '';
    if (!aim) { error.textContent = 'Say what you want to achieve first.'; return; }
    if (revise && !change) { error.textContent = 'Say what should change.'; return; }
    const label = b.textContent;
    b.disabled = true;
    b.textContent = revise ? 'Revising…' : 'Designing the workspace…';
    const res = await fetch('/api/companies/design', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(revise ? {aim, change, company: this.draft.company, lead: this.draft.lead} : {aim})}).catch(() => null);
    b.disabled = false;
    b.textContent = label;
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      error.textContent = body.error || 'The workspace could not be designed. Try again, or start from a template.';
      return;
    }
    this.draft = body;
    this.aim = aim;
    this.renderDraft();
  }

  async onClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const error = this.el.querySelector('.c-error');
    error.textContent = '';
    this.el.querySelector('.b-error').textContent = '';
    let res;
    if (b.dataset.act === 'design' || b.dataset.act === 'revise') {
      return this.design(b, this.el.querySelector('.b-error'));  // shown in the builder, not below the templates
    } else if (b.dataset.act === 'build') {
      res = await fetch('/api/companies', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({company: this.draft.company, name: this.el.querySelector('.b-name').value})});
    } else if (b.dataset.act === 'create') {
      const name = b.closest('.template').querySelector('.t-title').value;
      res = await fetch('/api/companies', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                           body: JSON.stringify({template: b.dataset.key, name})});
    } else if (b.dataset.act === 'open') {
      res = await fetch(`/api/companies/${b.dataset.id}/open`, {method: 'POST'});
    } else if (b.dataset.act === 'delete') {
      if (b.dataset.armed !== '1') {  // ask once more
        b.dataset.armed = '1';
        b.textContent = 'Click again to delete';
        return;
      }
      res = await fetch(`/api/companies/${b.dataset.id}`, {method: 'DELETE'});
      if (res.ok) return this.open();
    } else {
      return;
    }
    const reply = await res.json();
    if (!res.ok) {
      error.textContent = reply.error || 'Something went wrong. Please try again.';
      return;
    }
    this.close();
    this.office.switchTo(reply);
    if (b.dataset.act === 'build') {  // straight on to the goal the workspace was built for
      this.office.link.openGoalDialog({text: this.aim, lead: this.draft.lead});
      this.draft = null;
      this.el.querySelector('.b-draft').hidden = true;
      this.el.querySelector('.b-aim').value = '';
    }
  }
}

// ── the Company panel: hubs (purpose, manager), interns and roles ─────────
// (in the data a hub is still called a "department")
// Edits go into a draft; Save sends it to the server and rebuilds the office from the reply.
class CompanyPanel {
  constructor(office) {
    this.office = office;
    const el = this.el = document.createElement('aside');
    el.className = 'office-panel';
    el.hidden = true;
    el.innerHTML = `
      <header><div><div class="title">Workspace</div><div class="subtitle">Hubs, their purpose, managers and mini agents</div></div>
        <div class="head-actions"><button class="switch" title="Switch workspace, or start one from a template">Switch</button>
          <button class="close" title="Close">×</button></div></header>
      <div class="body"></div>
      <footer><div class="status"></div><div class="actions">
        <button class="ghost discard">Discard</button><button class="primary save">Save changes</button></div></footer>`;
    office.el.appendChild(el);
    el.querySelector('.close').onclick = () => this.close();
    el.querySelector('.switch').onclick = () => this.office.companies.open();
    el.querySelector('.discard').onclick = () => this.discard();
    el.querySelector('.save').onclick = () => this.save();
    this.body = el.querySelector('.body');
    this.body.addEventListener('input', (e) => this.onInput(e));
    this.body.addEventListener('click', (e) => this.onClick(e));
  }

  toggle() {
    if (this.el.hidden) this.open();
    else this.close();
  }

  // Unsaved edits survive closing the panel (the Company button shows a dot); only Discard drops them.
  open() {
    if (!this.draft || !this.dirty) this.draft = structuredClone(this.office.company);
    this.error = '';
    this.el.hidden = false;
    this.render();
    this.office.syncPanels();
  }

  close() {
    this.el.hidden = true;
    this.office.syncPanels();
    this.markUnsaved();
  }

  discard() {
    this.draft = structuredClone(this.office.company);
    this.error = '';
    this.office.preview(this.office.company);
    this.render();
    this.markUnsaved();
  }

  markUnsaved() {
    const unsaved = !!this.draft && this.dirty;
    this.office.ui.querySelector('.tb-company').classList.toggle('unsaved', unsaved);
    this.office.ui.querySelector('.tb-menu').classList.toggle('unsaved', unsaved);  // seen without opening the menu
  }

  // the office was rebuilt from a saved company (by this panel, or after a goal)
  saved() {
    this.draft = null;
    this.markUnsaved();
  }

  get dirty() {
    return JSON.stringify(this.draft) !== JSON.stringify(this.office.company);
  }

  get total() {
    return this.draft.departments.reduce((n, d) => n + d.interns.length, 0);
  }

  render() {
    const d = this.draft;
    const depts = d.departments.map((dept, di) => `
      <section class="dept" style="--c:${dept.color}">
        <div class="dept-head">
          <button class="swatch" data-act="colors" data-d="${di}" title="Colour"></button>
          <input class="dept-name" data-field="dept-name" data-d="${di}" value="${esc(dept.name)}" maxlength="30"
                 placeholder="Hub name">
          <span class="count">${dept.interns.length}/${MAX_PER_DEPARTMENT}</span>
          <button class="icon remove-dept" data-act="remove-dept" data-d="${di}" title="Remove hub">🗑</button>
        </div>
        <textarea class="purpose" data-field="dept-purpose" data-d="${di}" rows="3" maxlength="400"
                  placeholder="Purpose: what this hub does and how (its people follow this)">${esc(dept.purpose || '')}</textarea>
        <div class="manager-row"><span>Manager</span>
          <input data-field="dept-manager" data-d="${di}" value="${esc(dept.manager.name)}" maxlength="24"
                 placeholder="Manager's name"></div>
        <div class="models-row"><span>Models</span>
          <label>Manager<select data-field="hub-manager-model" data-d="${di}">${modelOptions(dept.manager_model, 'Workspace')}</select></label>
          <label>Mini agents<select data-field="hub-intern-model" data-d="${di}">${modelOptions(dept.intern_model, 'Workspace')}</select></label>
        </div>
        <div class="colors" data-colors="${di}" hidden>${COLORS.map((c) =>
          `<button class="swatch${c === dept.color ? ' on' : ''}" style="--c:${c}" data-act="color" data-d="${di}" data-color="${c}"></button>`).join('')}
        </div>
        ${dept.interns.map((intern, ii) => `
          <div class="intern">
            <input class="intern-name" data-field="name" data-d="${di}" data-i="${ii}" value="${esc(intern.name)}"
                   maxlength="24" placeholder="Name">
            <input class="intern-role" data-field="role" data-d="${di}" data-i="${ii}" value="${esc(intern.role)}"
                   maxlength="60" placeholder="Role, e.g. Frontend developer">
            <select class="intern-model" data-field="intern-model" data-d="${di}" data-i="${ii}"
                    title="Model for this mini agent (Hub = the hub's mini agent model)">${modelOptions(intern.model, 'Hub')}</select>
            <button class="icon" data-act="fire" data-d="${di}" data-i="${ii}" title="Remove mini agent">×</button>
          </div>`).join('') || '<div class="empty">No mini agents yet</div>'}
        <button class="link" data-act="hire" data-d="${di}"
          ${dept.interns.length >= MAX_PER_DEPARTMENT || this.total >= MAX_INTERNS ? 'disabled' : ''}>+ Add a mini agent</button>
      </section>`).join('');
    this.body.innerHTML = `
      <label>Workspace name<input data-field="company" value="${esc(d.name)}" maxlength="40"></label>
      <div class="hint">${t('The workspace-wide model, instructions and helpers are in <button class="link" data-act="agent-settings">Settings → Agents &amp; models</button>. Here, each hub and mini agent can have its own model ("Workspace" uses that default).')}</div>
      <div class="section-title">Hubs <span>${d.departments.length}/${MAX_DEPARTMENTS}</span></div>
      ${depts}
      <button class="add-dept" data-act="add-dept" ${d.departments.length >= MAX_DEPARTMENTS ? 'disabled' : ''}>
        + Add a hub</button>`;
    this.renderFooter();
  }

  renderFooter() {
    const status = this.el.querySelector('.status');
    status.className = `status${this.error ? ' error' : ''}`;
    status.textContent = this.error || (this.dirty ? 'Not saved yet: press Save changes to apply'
                                                   : `${this.total} of ${MAX_INTERNS} mini agents · all saved`);
    this.el.querySelector('.save').disabled = !this.dirty || this.saving;
  }

  onInput(e) {
    const t = e.target;
    const dept = this.draft.departments[t.dataset.d];
    switch (t.dataset.field) {
      case 'company': this.draft.name = t.value; break;
      case 'dept-manager': dept.manager.name = t.value; break;
      case 'dept-purpose': dept.purpose = t.value; break;
      case 'hub-manager-model': dept.manager_model = t.value; break;
      case 'hub-intern-model': dept.intern_model = t.value; break;
      case 'intern-model': dept.interns[t.dataset.i].model = t.value; break;
      case 'dept-name': dept.name = t.value; break;
      case 'name': dept.interns[t.dataset.i].name = t.value; break;
      case 'role': dept.interns[t.dataset.i].role = t.value; break;
      default: return;
    }
    this.error = '';
    this.renderFooter();
    this.office.preview(this.draft);
  }

  onClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const depts = this.draft.departments;
    const dept = depts[b.dataset.d];
    switch (b.dataset.act) {
      case 'agent-settings':
        this.office.settings.open('agents');
        return;
      case 'colors':
        this.body.querySelector(`[data-colors="${b.dataset.d}"]`).hidden ^= true;
        return;
      case 'color':
        dept.color = b.dataset.color;
        break;
      case 'hire':
        dept.interns.push({name: this.freeName(), role: '', model: ''});
        break;
      case 'fire':
        dept.interns.splice(Number(b.dataset.i), 1);
        break;
      case 'add-dept': {
        const used = new Set(depts.map((x) => x.color));
        depts.push({name: t('New hub'), color: COLORS.find((c) => !used.has(c)) || pick(COLORS), purpose: '',
                    manager_model: '', intern_model: '',
                    manager: {name: this.freeName()}, interns: []});
        break;
      }
      case 'remove-dept':
        if (depts.length === 1) { this.error = 'The workspace needs at least one hub.'; break; }
        if (dept.interns.length && b.dataset.armed !== '1') {  // ask once more before letting a whole team go
          b.dataset.armed = '1';
          b.textContent = `Remove ${plural(dept.interns.length, 'mini agent')}?`;
          b.classList.add('armed');
          setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '🗑'; b.classList.remove('armed'); } }, 3000);
          return;
        }
        depts.splice(Number(b.dataset.d), 1);
        break;
      default:
        return;
    }
    this.render();
    this.office.preview(this.draft);
    if (b.dataset.act === 'hire') {  // put the cursor in the new intern's role
      const rows = this.body.querySelectorAll(`.intern-role[data-d="${b.dataset.d}"]`);
      rows[rows.length - 1]?.focus();
    }
  }

  freeName() {
    const taken = new Set(this.draft.departments.flatMap((d) => [d.manager.name, ...d.interns.map((i) => i.name)]));
    return NAME_IDEAS.find((n) => !taken.has(n)) || `Mini agent ${this.total + 1}`;
  }

  async save() {
    this.saving = true;
    this.renderFooter();
    try {
      const res = await fetch('/api/company', {method: 'PUT', headers: {'Content-Type': 'application/json'},
                                               body: JSON.stringify(this.draft)});
      const reply = await res.json();
      if (!res.ok) {
        this.error = reply.error || 'Could not save.';
        return;
      }
      const before = new Set(this.office.company.departments.flatMap((d) => d.interns.map((i) => i.id)));
      const newcomers = new Set(reply.departments.flatMap((d) => d.interns.map((i) => i.id)).filter((id) => !before.has(id)));
      this.office.build(reply, newcomers);
      this.saved();
      this.close();
      if (!newcomers.size) this.office.toast('Workspace saved');  // otherwise the welcome message says it
    } catch (err) {
      this.error = `Could not save: ${err.message}`;
    } finally {
      this.saving = false;
      if (!this.el.hidden) this.renderFooter();
    }
  }
}

const STYLE = `
  .office-stage { position: fixed; inset: 0; overflow: hidden; background: #EEF0F1;
                  font-family: 'Inter', system-ui, sans-serif; color: #2B3038; }
  .office-stage canvas { display: block; cursor: grab; }
  .office-labels { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1; }  /* own layer: labels stay under the UI */
  .office-labels * { pointer-events: none; }
  .office-sign { display: flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px;
                 background: rgba(255,255,255,.92); box-shadow: 0 2px 10px rgba(40,45,55,.10);
                 font-size: 12.5px; color: #2B3038; white-space: nowrap; letter-spacing: .01em; }
  .office-sign b { font-weight: 600; }
  .office-sign .sub { color: #7A808A; font-size: 11.5px; }
  .office-sign.working .sub { color: #2F7D5B; font-weight: 600; }
  .office-sign.working .sub::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: #3BA776; margin-right: 5px; vertical-align: 1px; animation: office-pulse 1.4s ease-in-out infinite; }
  .office-sign.standby .sub { color: #8A9099; }
  .office-sign.has-bar { flex-wrap: wrap; row-gap: 5px; max-width: 260px; border-radius: 14px; }
  .office-sign .sign-bar { flex-basis: 100%; height: 5px; border-radius: 3px; background: #EEF0F2; overflow: hidden; }
  .office-sign .sign-bar i { display: block; height: 100%; border-radius: 3px; }
  .office-sign .dot, .office-ui .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .office-name { font-size: 11px; font-weight: 600; color: #2B3038; background: rgba(255,255,255,.95);
                 padding: 2px 8px; border-radius: 999px; box-shadow: 0 1px 6px rgba(40,45,55,.12); white-space: nowrap; }
  .office-bubble { max-width: 190px; font-size: 11.5px; line-height: 1.35; color: #2B3038; background: #fff;
                   padding: 5px 10px; border-radius: 12px; box-shadow: 0 3px 12px rgba(40,45,55,.14);
                   white-space: normal; text-align: center; }
  .office-ui > * { position: absolute; z-index: 2; }
  .office-head { top: 18px; left: 22px; }
  .office-head { cursor: pointer; }
  .office-head .brand { font-size: 22px; font-weight: 700; letter-spacing: -.01em; }
  .office-head .brand::after { content: ' ▾'; font-size: 14px; color: #9AA0A8; }
  .office-head .where { font-size: 12.5px; color: #6B717B; margin-top: 2px; display: flex; align-items: center; gap: 5px; }
  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: #5FA37A; display: inline-block;
              animation: office-pulse 2s ease-in-out infinite; }
  @keyframes office-pulse { 50% { opacity: .35; } }
  .office-legend { left: 22px; bottom: 22px; display: flex; gap: 8px; flex-wrap: wrap; max-width: calc(100% - 300px); }
  .office-legend .item { display: flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px;
                         background: rgba(255,255,255,.9); font-size: 12.5px; box-shadow: 0 2px 10px rgba(40,45,55,.08); }
  .office-legend .n { color: #8A9099; }
  .office-toolbar { top: 20px; right: 22px; display: flex; gap: 8px; }
  .office-stage.panel-open .office-toolbar, .office-stage.panel-open .office-card { right: 462px; }
  .office-toolbar button, .office-reset { border: 0; padding: 8px 16px; border-radius: 999px; background: #fff;
                  font: 600 13px 'Inter', sans-serif; color: #2B3038; cursor: pointer; box-shadow: 0 2px 10px rgba(40,45,55,.10);
                  display: inline-flex; align-items: center; gap: 6px; }
  .office-toolbar button:hover, .office-reset:hover { background: #F6F7F8; }
  .office-toolbar button.primary { background: #2B3038; color: #fff; }
  .office-toolbar button.primary:hover { background: #3A4049; }
  .office-toolbar button.locked { color: #A2A7AE; }
  .office-toolbar button.unsaved::after { content: ''; width: 7px; height: 7px; border-radius: 50%; background: #C0975A; }
  /* the Menu button and its pop-up */
  .office-toolbar { flex-direction: column; align-items: flex-end; }
  .office-toolbar .tb-menu.on { background: #2B3038; color: #fff; }
  .office-menu { margin-top: 8px; width: 300px; max-height: calc(100vh - 90px); overflow-y: auto; background: #fff; border-radius: 16px;
                 box-shadow: 0 16px 48px rgba(40,45,55,.18); padding: 6px; display: grid; gap: 2px; }
  .office-menu[hidden] { display: none; }
  .office-toolbar .office-menu button { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; width: 100%;
      text-align: left; padding: 8px 10px; border-radius: 11px; background: none; box-shadow: none; font: 13px 'Inter', sans-serif; }
  .office-toolbar .office-menu button:hover { background: #F4F5F6; }
  .office-toolbar .office-menu button.primary { background: #2B3038; color: #fff; }
  .office-toolbar .office-menu button.primary:hover { background: #3A4049; }
  .office-menu .mi { width: 32px; height: 32px; border-radius: 10px; background: #F1F2F4; display: grid; place-items: center; font-size: 15px; }
  .office-menu .primary .mi { background: rgba(255,255,255,.14); }
  .office-menu b { display: block; font-weight: 600; font-size: 13px; }
  .office-menu em { display: block; font-style: normal; font-size: 11.5px; color: #8A9099; margin-top: 1px; }
  .office-menu .primary em { color: #C9CDD2; }
  .office-menu .u-meter { display: inline-block; vertical-align: middle; }
  .office-menu .menu-sep { height: 1px; background: #F1F2F3; margin: 4px 8px; }
  .office-toolbar .office-menu button.unsaved::after { grid-column: 3; }
  .office-toolbar .badge { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; background: #E6E8EB;
                           color: #555B64; font-size: 11px; display: inline-grid; place-items: center; box-sizing: border-box; }
  .office-toolbar .badge.urgent { background: #C4553B; color: #fff; animation: office-pulse 1.6s ease-in-out infinite; }
  .office-toolbar .badge[hidden] { display: none; }

  .office-banners { top: 16px; left: 50%; transform: translateX(-50%); width: min(560px, calc(100% - 480px)); min-width: 300px;
                    display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; max-height: calc(100% - 130px);
                    overflow-x: hidden; overflow-y: auto; padding: 0 4px 8px; }
  .office-banner .goal-text { flex: 1 1 0; }
  .office-banner { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px 12px 10px 16px; border-radius: 14px;
                   background: #fff; box-shadow: 0 6px 24px rgba(40,45,55,.12); }
  .office-banner .hub-progress { flex-basis: 100%; display: grid; gap: 5px; border-top: 1px solid #F1F2F3; padding-top: 8px; margin-top: -2px; }
  .office-banner .hub-progress[hidden] { display: none; }
  .office-banner .hp-row { display: grid; grid-template-columns: 9px minmax(70px, 1fr) 1.2fr 34px auto auto; gap: 8px;
                           align-items: center; font-size: 12px; color: #4A505A; font-variant-numeric: tabular-nums; }
  .office-banner .hp-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
  .office-banner .hp-bar { height: 7px; border-radius: 4px; background: #EEF0F2; overflow: hidden; }
  .office-banner .hp-bar i { display: block; height: 100%; border-radius: 4px; transition: width .8s ease; }
  .office-banner .hp-row b { font-weight: 600; text-align: right; }
  .office-banner .hp-cards, .office-banner .hp-eta { color: #8A9099; white-space: nowrap; }
  .office-stage.panel-open .office-toast { top: 140px; left: calc((100% - 440px) / 2); }
  .office-stage.panel-open .office-banners { top: 72px; left: calc((100% - 440px) / 2); width: min(520px, calc(100% - 500px)); }
  .office-dialog .g-label { font-size: 12px; color: #6B717B; margin-bottom: 4px; }
  .office-dialog .g-limit-hint { font-size: 11.5px; color: #8A9099; margin: -4px 0 6px; line-height: 1.4; }
  .office-dialog .row { grid-template-columns: 1fr 140px; }
  .office-dialog .g-hubs { display: grid; gap: 4px; max-height: 210px; overflow-y: auto; margin-bottom: 12px; }
  .office-dialog .hub-pick { display: grid; grid-template-columns: 18px 10px auto 1fr; gap: 8px; align-items: center; margin: 0;
                             padding: 6px 9px; border: 1px solid #ECEDEF; border-radius: 10px; cursor: pointer; font-size: 13px; color: #2B3038; }
  .office-dialog .hub-pick input { width: auto; margin: 0; }
  .office-dialog .hub-pick em { font-style: normal; font-size: 11.5px; color: #9AA0A8; text-align: right; overflow: hidden;
                                text-overflow: ellipsis; white-space: nowrap; }
  .office-dialog .hub-pick:has(input:checked) { border-color: #9DB0CF; background: #F4F7FB; }
  .office-dialog .hub-pick.busy { opacity: .55; cursor: default; }
  .office-dialog label[hidden] { visibility: hidden; display: block; }
  .office-banner .state-dot { width: 9px; height: 9px; border-radius: 50%; background: #9AA0A8; flex-shrink: 0; }
  .office-banner.running .state-dot { background: #5FA37A; animation: office-pulse 1.6s ease-in-out infinite; }
  .office-banner.paused .state-dot { background: #C0975A; }
  .office-banner.complete .state-dot { background: #5FA37A; }
  .office-banner.aborted .state-dot, .office-banner.ended .state-dot { background: #C4553B; }
  .office-banner .goal-text { flex: 1; min-width: 0; }
  .office-banner .goal-title { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .office-banner .goal-meta { font-size: 12px; color: #7A808A; margin-top: 1px; }
  .office-banner .stop { border: 0; border-radius: 999px; padding: 6px 12px; background: #FBEFEB; color: #B4533A;
                         font: 600 12px 'Inter', sans-serif; cursor: pointer; }
  .office-banner .stop[hidden] { display: none; }
  .office-banner .hold { border: 0; border-radius: 999px; padding: 6px 12px; background: #EEF1F6; color: #4D6E9E;
                         font: 600 12px 'Inter', sans-serif; cursor: pointer; }
  .office-banner.paused .state-dot { animation: none; }

  .office-dialog { inset: 0; background: rgba(43,48,56,.25); display: grid; place-items: center; z-index: 6; }
  .office-dialog[hidden] { display: none; }
  .office-dialog .card { width: min(520px, calc(100% - 32px)); background: #fff; border-radius: 18px; padding: 22px 24px;
                         box-shadow: 0 20px 60px rgba(40,45,55,.25); }
  .office-dialog .title { font-size: 18px; font-weight: 700; }
  .office-dialog .subtitle { font-size: 12.5px; color: #7A808A; margin: 4px 0 16px; line-height: 1.45; }
  .office-dialog label { display: block; font-size: 12px; color: #6B717B; margin-bottom: 12px; }
  .office-dialog textarea, .office-dialog select, .office-dialog input { display: block; width: 100%; box-sizing: border-box;
      margin-top: 4px; padding: 9px 11px; border: 1px solid #E1E3E6; border-radius: 10px; font: 13.5px 'Inter', sans-serif;
      color: #2B3038; background: #fff; outline: none; resize: vertical; }
  .office-dialog .row { display: grid; grid-template-columns: 1fr 120px; gap: 10px; }
  .office-dialog .g-error { color: #B4533A; font-size: 12.5px; min-height: 16px; }
  .office-dialog .card { max-height: calc(100vh - 32px); overflow: auto; box-sizing: border-box; }
  .office-dialog .g-step1[hidden], .office-dialog .g-step2[hidden], .office-dialog .g-plain[hidden],
  .office-dialog .g-build[hidden], .office-dialog .g-rewritten[hidden] { display: none; }
  .office-dialog .g-improve { display: flex; align-items: center; gap: 10px; margin: -6px 0 12px; font-size: 12px; color: #7A808A; }
  .office-dialog .g-ask, .office-dialog .g-undo { border: 0; background: none; color: #4A6B8A; font: 600 12.5px 'Inter', sans-serif;
                                                  cursor: pointer; padding: 2px 0; }
  .office-dialog .g-ask:disabled { color: #9AA0A8; cursor: default; }
  .office-dialog .g-undo { margin-left: 4px; }
  .office-dialog .g-q { margin-bottom: 14px; }
  .office-dialog .g-q-text { font-size: 13.5px; font-weight: 600; color: #2B3038; margin-bottom: 6px; }
  .office-dialog .g-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .office-dialog .g-chip { border: 1px solid #E1E3E6; border-radius: 999px; padding: 5px 11px; background: #fff; color: #2B3038;
                           font: 12.5px 'Inter', sans-serif; cursor: pointer; }
  .office-dialog .g-chip:hover { border-color: #9DB0CF; }
  .office-dialog .g-chip.on { border-color: #9DB0CF; background: #F4F7FB; color: #4A6B8A; font-weight: 600; }
  .office-dialog .g-q input { margin-top: 6px; padding: 7px 10px; font-size: 12.5px; }
  .office-dialog .g-intent { margin: 4px 0 12px; }
  .office-dialog .g-req { display: grid; grid-template-columns: 112px 1fr 30px; gap: 6px; align-items: start; margin-top: 6px; }
  .office-dialog .g-req select, .office-dialog .g-req textarea { margin: 0; padding: 7px 9px; font-size: 13px; line-height: 1.4; }
  .office-dialog .g-req textarea { resize: none; field-sizing: content; min-height: 34px; }
  .office-dialog .g-del { margin-top: 5px; }
  .office-dialog .g-req select { font-weight: 600; font-size: 12px; }
  .office-dialog .g-req select.w-core { color: #2B3038; background: #EEF0F2; }
  .office-dialog .g-req select.w-important { color: #4A6B8A; }
  .office-dialog .g-req select.w-extra { color: #8A9099; }
  .office-dialog .g-del { border: 0; background: none; color: #9AA0A8; cursor: pointer; font-size: 14px; padding: 4px; }
  .office-dialog .g-del:hover { color: #B4533A; }
  .office-dialog .g-add { border: 0; background: none; color: #4A6B8A; font: 600 12.5px 'Inter', sans-serif; cursor: pointer;
                          padding: 8px 0 2px; }
  .office-dialog .g-req-hint { font-size: 12px; color: #7A808A; margin: 6px 0 4px; }
  @media (max-width: 520px) { .office-dialog .g-req { grid-template-columns: 96px 1fr 26px; } }
  .office-dialog .actions, .office-inbox .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
  .office-dialog .actions button, .office-inbox .actions button { border: 0; border-radius: 999px; padding: 8px 16px;
      font: 600 13px 'Inter', sans-serif; cursor: pointer; }
  .office-dialog .ghost, .office-inbox .ghost { background: #F3F4F5; color: #2B3038; }
  .office-dialog .primary, .office-inbox .primary { background: #2B3038; color: #fff; }
  .office-inbox .actions button:disabled { opacity: .5; cursor: default; }

  /* header and hint stay readable on grass, sky or any themed floor */
  .office-head .brand { text-shadow: 0 0 6px rgba(255,255,255,.9), 0 0 14px rgba(255,255,255,.6); }
  .office-head .where, .office-hint { color: #4A505A; background: rgba(255,255,255,.78);
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); padding: 3px 9px; border-radius: 999px; width: fit-content; }
  .office-head .where { margin-top: 5px; }
  .office-stage.dark .office-head .brand { color: #EEF1F6; text-shadow: 0 0 8px rgba(0,0,0,.7); }
  .office-stage.dark .office-head .where, .office-stage.dark .office-hint { color: #C3CCD8; background: rgba(20,26,40,.7); }
  .office-design .themes { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
  .office-design .theme { border: 1px solid #E1E3E6; background: #fff; border-radius: 12px; padding: 6px; cursor: pointer;
                          display: flex; flex-direction: column; gap: 6px; font: 500 12.5px 'Inter', sans-serif; color: #2B3038; }
  .office-design .theme.on { border-color: #2B3038; box-shadow: 0 0 0 1px #2B3038; }
  .office-design .swatch-row { height: 38px; border-radius: 8px; display: block; }
  .office-design .seg { display: flex; flex-wrap: wrap; gap: 4px; background: #F3F4F5; border-radius: 12px; padding: 3px; }
  .office-design .seg button { border: 0; background: none; padding: 6px 10px; border-radius: 9px; cursor: pointer;
                               font: 500 12.5px 'Inter', sans-serif; color: #555B64; }
  .office-design .seg button.on { background: #fff; color: #2B3038; box-shadow: 0 1px 4px rgba(40,45,55,.12); }
  .office-design .hint { font-size: 11.5px; color: #9AA0A8; margin-top: 4px; }
  .office-design .hub-row { display: grid; grid-template-columns: 10px 1fr 104px 92px 92px; gap: 6px; align-items: center; margin: 6px 0; }
  .office-design .hub-row select { min-width: 0; font-size: 12px; }
  .office-design .shuffle { border: 1px solid #E1E3E6; background: #fff; border-radius: 999px; padding: 6px 12px; margin: 6px 0 4px;
                            font: 500 12.5px 'Inter', sans-serif; cursor: pointer; color: #2B3038; }
  .office-design .shuffle:hover { background: #F3F4F5; }
  .office-design .hub-row .dot { width: 10px; height: 10px; border-radius: 50%; }
  .office-design .hub-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* signing in */
  .office-gate { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; align-content: center; gap: 14px; padding: 16px;
                 background: radial-gradient(circle at 30% 20%, #F4EFE6, #E3E8EE 60%, #D8DFE7); }
  .office-gate .gate-card { width: min(400px, 100%); background: #fff; border-radius: 20px; padding: 28px 28px 24px;
                            box-shadow: 0 24px 70px rgba(40,45,55,.18); display: grid; gap: 10px; }
  .office-gate .gate-brand { font-size: 13px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #8A7DB3; }
  .office-gate .gate-title { font-size: 22px; font-weight: 700; }
  .office-gate .gate-sub { font-size: 13px; color: #6B717B; line-height: 1.45; margin-bottom: 6px; }
  .office-gate label { display: grid; gap: 4px; font-size: 12px; color: #6B717B; }
  .office-gate input { padding: 10px 12px; border: 1px solid #E1E3E6; border-radius: 10px; font: 14px 'Inter', sans-serif; outline: none; }
  .office-gate input:focus { border-color: #9DB0CF; }
  .office-gate .gate-lang { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #6B717B; }
  .office-gate .gate-lang select { padding: 6px 10px; border: 1px solid #D5D9DE; border-radius: 999px; background: rgba(255,255,255,.85);
                                   font: 13px 'Inter', sans-serif; color: #2B3038; cursor: pointer; }
  .office-gate .gate-error { color: #B4533A; font-size: 12.5px; min-height: 16px; }
  .office-gate .gate-or { display: flex; align-items: center; gap: 10px; color: #9AA0A8; font-size: 12px; }
  .office-gate .gate-or::before, .office-gate .gate-or::after { content: ''; flex: 1; border-top: 1px solid #ECEDEF; }
  .office-gate .gate-google { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 10px;
    border: 1px solid #D5D9DE; border-radius: 999px; background: #fff; color: #2B3038; font: 600 14px 'Inter', sans-serif; cursor: pointer; }
  .office-gate .gate-google:hover { background: #F7F8F9; }
  .office-gate .gate-google:disabled { opacity: .55; cursor: default; }
  .office-gate .gate-wait { font-size: 12.5px; color: #555B65; line-height: 1.45; background: #F4F6F9; border-radius: 10px; padding: 9px 12px; }
  .office-gate [hidden] { display: none !important; }
  .office-gate .gate-forgot { justify-self: end; margin: -4px 0 0; font-size: 12.5px; }
  .office-gate .gate-back, .office-gate .gate-alt { justify-self: center; margin: 2px 0 0; font-size: 12.5px; }
  .office-gate .gate-step { display: grid; gap: 10px; }
  .office-gate .gate-wait code { font-size: 12px; word-break: break-all; color: #2B3038; }
  .office-gate .ghost { border: 1px solid #D5D9DE; border-radius: 999px; padding: 10px; background: #fff; color: #2B3038;
                        font: 600 14px 'Inter', sans-serif; cursor: pointer; }
  .office-gate .link { border: 0; background: none; padding: 0; color: #4A6FA5; font: inherit; cursor: pointer; text-decoration: underline; margin-left: 4px; }
  .office-gate .primary { border: 0; border-radius: 999px; padding: 11px; background: #2B3038; color: #fff; font: 600 14px 'Inter', sans-serif; cursor: pointer; }
  /* settings */
  .office-settings { position: absolute; }
  .office-settings .card.wide { width: min(880px, calc(100% - 32px)); height: min(640px, calc(100% - 60px)); padding: 0;
                                display: grid; grid-template-columns: 200px 1fr; overflow: hidden; }
  .office-settings .s-nav { background: #F6F7F8; padding: 22px 12px; display: flex; flex-direction: column; gap: 2px; }
  .office-settings .s-nav .title { font-size: 18px; font-weight: 700; margin: 0 8px 14px; }
  .office-settings .s-nav button { border: 0; background: none; text-align: left; padding: 8px 10px; border-radius: 9px; cursor: pointer;
                                   font: 500 13px 'Inter', sans-serif; color: #4A505A; }
  .office-settings .s-nav button.on { background: #fff; color: #2B3038; box-shadow: 0 1px 4px rgba(40,45,55,.1); }
  .office-settings .s-main { position: relative; overflow-y: auto; padding: 24px 28px; }
  .office-settings .x { position: absolute; top: 12px; right: 14px; border: 0; background: none; font-size: 22px; color: #9AA0A8; cursor: pointer; }
  .office-settings .s-title { font-size: 17px; font-weight: 700; }
  .office-settings .s-title.small { font-size: 13px; margin-top: 18px; }
  .office-settings .s-sub { font-size: 12.5px; color: #7A808A; margin: 4px 0 14px; line-height: 1.45; max-width: 560px; }
  .office-settings .s-row { display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; padding: 11px 0;
                            border-bottom: 1px solid #F1F2F3; }
  .office-settings .s-row b { font-size: 13px; font-weight: 600; display: block; }
  .office-settings .s-row span { font-size: 11.5px; color: #8A9099; display: block; margin-top: 2px; line-height: 1.4; }
  .office-settings .s-ctl { font-size: 12.5px; color: #4A505A; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
  .office-settings input, .office-settings select { padding: 6px 9px; border: 1px solid #E1E3E6; border-radius: 8px;
                                                   font: 13px 'Inter', sans-serif; color: #2B3038; background: #fff; }
  .office-settings input[type=number] { width: 78px; }
  .office-settings select { max-width: 260px; }
  .office-settings .s-note { font-size: 12px; color: #6B717B; background: #F6F7F8; border-radius: 10px; padding: 9px 12px; margin: 8px 0; line-height: 1.45; }
  .office-settings .s-note.warn { background: #FFF6E5; color: #8A5A14; }
  .office-settings .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  .office-settings .actions button, .office-settings .btn, .office-settings .pw button, .office-settings .acct button,
  .office-settings .nb-add button, .office-settings button.ghost { border: 0; border-radius: 999px; padding: 7px 14px; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; text-decoration: none; }
  .office-settings .primary { background: #2B3038; color: #fff; }
  .office-settings .ghost { background: #F3F4F5; color: #2B3038; }
  .office-settings .link { border: 0; background: none; color: #4D6E9E; cursor: pointer; font: 500 12px 'Inter', sans-serif; padding: 0; }
  .office-settings .s-msg { font-size: 12.5px; color: #2F7D5B; min-height: 18px; margin-top: 10px; }
  .office-settings .s-msg.bad { color: #B4533A; }
  :is(.office-settings, .office-inbox) .switch { position: relative; display: inline-block; width: 40px; height: 22px; }
  :is(.office-settings, .office-inbox) .switch input { opacity: 0; width: 0; height: 0; }
  :is(.office-settings, .office-inbox) .switch i { position: absolute; inset: 0; background: #D5D9DE; border-radius: 999px; transition: background .2s; cursor: pointer; }
  :is(.office-settings, .office-inbox) .switch i::after { content: ''; position: absolute; left: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%;
                                      background: #fff; transition: transform .2s; }
  :is(.office-settings, .office-inbox) .switch input:checked + i { background: #3BA776; }
  :is(.office-settings, .office-inbox) .switch input:checked + i::after { transform: translateX(18px); }
  .office-settings .nb { border: 1px solid #ECEDEF; border-radius: 12px; padding: 10px 12px; margin-top: 8px; }
  .office-settings .nb-head { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .office-settings .nb-head em { font-style: normal; color: #9AA0A8; font-size: 12px; flex: 1; }
  .office-settings .nb-note { display: grid; grid-template-columns: 1fr auto 20px; gap: 8px; align-items: center; font-size: 12.5px;
                              padding: 5px 0 5px 17px; border-bottom: 1px dashed #F1F2F3; }
  .office-settings .nb-note em { font-style: normal; color: #9AA0A8; font-size: 11.5px; }
  .office-settings .x-small { border: 0; background: none; color: #B0B5BC; cursor: pointer; font-size: 16px; }
  .office-settings .nb-add { display: flex; gap: 6px; margin-top: 8px; }
  .office-settings .nb-add input { flex: 1; }
  .office-settings .acct { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #ECEDEF; border-radius: 12px; }
  .office-settings .acct > div:nth-child(2) { flex: 1; display: grid; gap: 2px; font-size: 13px; }
  .office-settings .acct span { font-size: 12px; color: #7A808A; }
  .office-settings .avatar { width: 40px; height: 40px; border-radius: 50%; background: #8A7DB3; color: #fff; display: grid; place-items: center;
                             font-weight: 700; font-size: 16px; }
  .office-settings .pw { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .office-settings .pw input { flex: 1; min-width: 140px; }
  .office-settings .acct-row { display: flex; gap: 10px; align-items: center; font-size: 13px; padding: 7px 0; border-bottom: 1px solid #F1F2F3; }
  .office-settings .acct-row span { flex: 1; color: #7A808A; font-size: 12px; }
  .office-settings .acct-row em { font-style: normal; color: #9AA0A8; font-size: 12px; }
  .office-settings .acct-row .acct-acts { flex: none; display: flex; gap: 12px; }
  @media (max-width: 700px) { .office-settings .card.wide { grid-template-columns: 1fr; height: auto; max-height: calc(100% - 40px); }
    .office-settings .s-nav { flex-direction: row; flex-wrap: wrap; padding: 12px; } .office-settings .s-nav .title { width: 100%; margin: 0 4px 6px; } }
  .office-toolbar .tb-settings { font-size: 15px; padding-left: 12px; padding-right: 12px; }
  .office-settings .about-head { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 6px; }
  .office-settings .about-head img { width: 64px; height: 64px; border-radius: 14px; flex: none; }
  .office-settings .about-ver { font-size: 12.5px; color: #8A7DB3; font-weight: 600; margin-top: 2px; }
  .office-settings .manual { font-size: 13px; line-height: 1.55; color: #2B3038; border: 1px solid #ECEDEF; border-radius: 12px;
                             padding: 4px 20px 16px; margin-top: 8px; }
  .office-settings .manual h1, .office-settings .manual h2, .office-settings .manual h3 { font-weight: 700; }
  .office-settings .manual h1 { font-size: 20px; margin: 16px 0 6px; }
  .office-settings .manual h2 { font-size: 16px; margin: 22px 0 6px; padding-top: 10px; border-top: 1px solid #F1F2F3; }
  .office-settings .manual h3 { font-size: 13.5px; margin: 14px 0 4px; }
  .office-settings .manual p, .office-settings .manual li { margin: 5px 0; }
  .office-settings .manual ul, .office-settings .manual ol { padding-left: 20px; margin: 6px 0; }
  .office-settings .manual table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12.5px; }
  .office-settings .manual th, .office-settings .manual td { border-bottom: 1px solid #F1F2F3; padding: 6px 8px; text-align: left; vertical-align: top; }
  .office-settings .manual th { color: #6B717B; font-weight: 600; background: #F8F9FA; }
  .office-settings .manual code { background: #F3F4F5; border-radius: 5px; padding: 1px 5px; font-size: 12px; }
  .office-settings .manual a { color: #4D6E9E; text-decoration: none; }
  .office-settings .manual hr { border: 0; border-top: 1px solid #ECEDEF; margin: 14px 0; }
  .office-toolbar .tb-usage { display: inline-flex; align-items: center; gap: 7px; }
  .office-toolbar .tb-usage[hidden] { display: none; }
  .office-toolbar .tb-usage .u-label { color: #6B717B; font-weight: 500; }
  .office-toolbar .tb-usage .u-meter { width: 46px; height: 6px; border-radius: 3px; background: #E6E8EB; overflow: hidden; }
  .office-toolbar .tb-usage .u-meter i, .office-usage .u-bar i { display: block; height: 100%; border-radius: 3px; background: #4D6E9E;
                                                                transition: width .6s ease; }
  .office-toolbar .tb-usage i.warm, .office-usage .u-bar i.warm { background: #C0975A; }
  .office-toolbar .tb-usage i.hot, .office-usage .u-bar i.hot { background: #C4553B; }
  .office-toolbar .tb-usage .u-five { font-variant-numeric: tabular-nums; }
  .office-usage { position: absolute; }
  .office-usage .card { width: min(540px, calc(100% - 32px)); }
  .office-usage .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .office-usage .x { border: 0; background: none; font-size: 22px; color: #9AA0A8; cursor: pointer; }
  .office-usage .u-row { margin: 4px 0 16px; }
  .office-usage .u-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
  .office-usage .u-top span { color: #6B717B; font-variant-numeric: tabular-nums; }
  .office-usage .u-bar { position: relative; height: 12px; border-radius: 6px; background: #EEF0F2; }
  .office-usage .u-bar i { border-radius: 6px; }
  .office-usage .u-bar em { position: absolute; top: -3px; bottom: -3px; width: 2px; background: #2B3038; border-radius: 1px; }
  .office-usage .section { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9AA0A8; margin: 6px 0 8px; }
  .office-usage .u-limits-line { font-size: 12.5px; color: #4A505A; }
  .office-usage .u-off { font-size: 13px; line-height: 1.5; color: #4A505A; background: #FBEFEB; border-radius: 12px; padding: 12px 14px; }
  .office-usage .u-off b { color: #B4533A; }
  .office-usage .u-off ol { margin: 8px 0 0; padding-left: 22px; list-style: decimal; }
  .office-usage .u-off li { display: list-item; }
  .office-usage .u-off ol b { color: #2B3038; }
  .office-usage .u-off code { background: #fff; border-radius: 5px; padding: 1px 6px; font-size: 12.5px; }
  .office-toolbar .tb-usage.off b { color: #B4533A; }
  .office-usage .u-note, .office-usage .u-api { font-size: 12px; color: #7A808A; margin-top: 12px; line-height: 1.45; }
  .office-files { position: absolute; }
  .office-files .card { width: min(620px, calc(100% - 32px)); max-height: calc(100% - 60px); overflow-y: auto; }
  .office-files .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .office-files .x { border: 0; background: none; font-size: 22px; color: #9AA0A8; cursor: pointer; }
  .office-files .drop-zone { display: grid; gap: 4px; place-items: center; text-align: center; padding: 22px; margin: 0 0 6px;
      border: 1.5px dashed #CBD2DA; border-radius: 14px; background: #F8FAFB; cursor: pointer; font-size: 13px; color: #2B3038; }
  .office-files .drop-zone span { font-size: 11.5px; color: #9AA0A8; }
  .office-files .drop-zone.over { border-color: #4D6E9E; background: #EEF3FA; }
  .office-files .f-error { color: #B4533A; font-size: 12.5px; min-height: 18px; }
  .office-files .file-row { display: grid; grid-template-columns: 42px 1fr 28px; gap: 10px; align-items: center;
                            padding: 8px 0; border-bottom: 1px solid #F1F2F3; }
  .office-files .f-icon { height: 42px; border-radius: 9px; background: #EEF3FA; color: #4D6E9E; font-size: 10.5px;
                          font-weight: 700; display: grid; place-items: center; letter-spacing: .03em; }
  .office-files .unreadable .f-icon { background: #F3F4F5; color: #9AA0A8; }
  .office-files .f-name { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .office-files .f-name span { font-weight: 400; color: #9AA0A8; font-size: 11.5px; margin-left: 8px; }
  .office-files .f-main input { margin-top: 4px; padding: 5px 8px; font-size: 12.5px; border-radius: 8px; }
  .office-files .f-remove { border: 0; background: none; font-size: 20px; color: #B0B5BC; cursor: pointer; }
  .office-files .f-remove:hover { color: #B4533A; }
  .office-files .f-empty { font-size: 13px; color: #9AA0A8; padding: 10px 0; }
  .office-toolbar .badge.count { background: #E6EAF0; color: #4A505A; }
  .office-companies, .office-results { position: absolute; }  /* live outside .office-ui, so they need their own positioning */
  .office-results .card.wide { width: min(980px, calc(100% - 32px)); max-height: calc(100% - 60px); overflow-y: auto; }
  .office-results .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .office-results .x { border: 0; background: none; font-size: 22px; color: #9AA0A8; cursor: pointer; }
  .office-results .filters { display: flex; gap: 10px; flex-wrap: wrap; margin: 4px 0 16px; }
  .office-results .seg { display: inline-flex; background: #F3F4F5; border-radius: 999px; padding: 3px; }
  .office-results .seg button { border: 0; background: none; padding: 6px 12px; border-radius: 999px; cursor: pointer;
                             font: 500 12.5px 'Inter', sans-serif; color: #555B64; }
  .office-results .seg button.on { background: #fff; color: #2B3038; box-shadow: 0 1px 4px rgba(40,45,55,.12); }
  .office-results .kpi-hero { display: grid; grid-template-columns: 220px 1fr; gap: 18px; align-items: start; margin-bottom: 18px; }
  .office-results .k-label { font-size: 12px; color: #6B717B; }
  .office-results .hero-value { font-size: 56px; font-weight: 600; line-height: 1.05; margin: 4px 0; letter-spacing: -.02em; }
  .office-results .k-note { font-size: 11.5px; color: #9AA0A8; margin-top: 2px; }
  .office-results .kpi-tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .office-results .kpi-tile { border: 1px solid #ECEDEF; border-radius: 12px; padding: 10px 12px; }
  .office-results .k-value { font-size: 20px; font-weight: 600; margin-top: 2px; }
  .office-results .kpi-table { margin-top: 14px; }
  .office-results .t-title { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9AA0A8; margin-bottom: 6px; }
  .office-results .t-row { display: grid; grid-template-columns: 1.6fr .6fr 1.6fr .8fr .7fr .9fr .9fr; gap: 10px; align-items: center;
                        padding: 7px 4px; border-bottom: 1px solid #F1F2F3; font-size: 13px; font-variant-numeric: tabular-nums; }
  .office-results .t-head { font-size: 11.5px; color: #8A9099; border-bottom-color: #E6E8EB; }
  .office-results .t-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .office-results .t-bar { display: flex; align-items: center; gap: 8px; }
  .office-results .t-bar b { font-weight: 600; min-width: 36px; }
  .office-results .track { flex: 1; height: 8px; border-radius: 4px; background: #DCE6F2; overflow: hidden; }
  .office-results .fill { display: block; height: 100%; background: #4D6E9E; border-radius: 0 4px 4px 0; }
  .office-results .r-empty { font-size: 13.5px; color: #6B717B; padding: 30px 6px; }
  .office-results .r-section { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9AA0A8; margin: 18px 0 8px; }
  .office-results .r-section span { text-transform: none; letter-spacing: 0; margin-left: 6px; }
  .office-results .r-note { font-size: 12.5px; color: #6B717B; background: #F6F7F8; border-radius: 10px; padding: 9px 12px; margin: 6px 0; }
  .office-results .reasons { display: grid; gap: 6px; max-width: 560px; }
  .office-results .reason { display: grid; grid-template-columns: 220px 1fr 24px; gap: 10px; align-items: center; font-size: 12.5px; }
  .office-results .reason .fill { background: #C4553B; }
  .office-results .reason .track { background: #F6E3DE; }
  .office-results .goal-card { border: 1px solid #ECEDEF; border-radius: 12px; margin: 8px 0; }
  .office-results .goal-card > summary { display: grid; grid-template-columns: 58px 1fr auto; gap: 12px; align-items: center; padding: 10px 14px;
                                         cursor: pointer; list-style: none; }
  .office-results .goal-card > summary::-webkit-details-marker { display: none; }
  .office-results .score { width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px;
                           color: var(--v); border: 3px solid var(--v); font-variant-numeric: tabular-nums; }
  .office-results .g-text { font-size: 13.5px; font-weight: 600; }
  .office-results .g-meta { font-size: 11.5px; color: #8A9099; margin-top: 3px; }
  .office-results .verdict { font-size: 11.5px; font-weight: 600; color: var(--v); border: 1px solid var(--v); border-radius: 999px;
                             padding: 3px 10px; white-space: nowrap; }
  .office-results .g-detail { padding: 0 16px 14px 84px; font-size: 13px; color: #454B54; line-height: 1.5; }
  .office-results .g-detail p { margin: 6px 0; }
  .office-results .g-detail ul { margin: 4px 0; padding-left: 18px; }
  .office-results .g-sub { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #9AA0A8; margin-top: 10px; }
  .office-results .reqs { display: grid; gap: 6px; margin: 8px 0; }
  .office-results .req { display: grid; grid-template-columns: 22px 1fr; gap: 8px; }
  .office-results .req .m { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fff; }
  .office-results .req.met .m { background: #3BA776; } .office-results .req.partly .m { background: #C0975A; } .office-results .req.missing .m { background: #C4553B; }
  .office-results .req b { font-weight: 600; display: block; } .office-results .req span { font-size: 12px; color: #7A808A; }
  .office-results .g-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 10px; font-size: 11.5px; color: #9AA0A8; }
  .office-results .g-foot button { border: 0; border-radius: 999px; padding: 6px 14px; background: #F3F4F5; color: #2B3038; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
  .office-results .r-cards { margin-top: 18px; border-top: 1px solid #F1F2F3; padding-top: 10px; }
  .office-results .r-cards > summary { font-size: 13px; font-weight: 600; cursor: pointer; padding: 6px 0; }
  .office-results .kpi-tiles.small { margin: 8px 0; }
  .office-results .seg.tabs button { font-weight: 600; padding: 6px 16px; }
  .office-results .goal-card.early { opacity: .62; }
  .office-results .goal-card.early .score { border-style: dashed; }
  .office-results .ask-got { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 4px 0 8px; }
  .office-results .ask-got > div { background: #F6F7F8; border-radius: 10px; padding: 8px 12px; }
  .office-results .ask-got .g-sub { margin-top: 0; }
  .office-results .ask-got p { margin: 3px 0 0; color: #2B3038; }
  .office-results .req em.w { font-style: normal; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    border-radius: 999px; padding: 1px 7px; margin-right: 6px; vertical-align: 1px; background: #EEF1F5; color: #5B6B82; }
  .office-results .req em.w.core { background: #2B3038; color: #fff; }
  .office-results .req em.w.extra { background: #F3F4F5; color: #8A9099; }
  .office-results .req b { display: inline; } .office-results .req span { display: block; }
  .office-results .hubs { display: grid; gap: 8px; margin-top: 10px; }
  .office-results .hub-card { border: 1px solid #ECEDEF; border-radius: 12px; }
  .office-results .hub-card > summary { display: grid; grid-template-columns: 220px 1fr; gap: 14px; align-items: center; padding: 12px 14px;
    cursor: pointer; list-style: none; }
  .office-results .hub-card > summary::-webkit-details-marker { display: none; }
  .office-results .hub-card.idle > summary { opacity: .6; }
  .office-results .h-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .office-results .h-name .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .office-results .h-name b { font-size: 14px; display: block; } .office-results .h-name span { font-size: 11.5px; color: #8A9099; }
  .office-results .h-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .office-results .t-metric .k-value { font-size: 18px; }
  .office-results .t-metric .track { display: block; height: 6px; margin-top: 4px; }
  .office-results .h-idle { font-size: 12.5px; color: #8A9099; }
  .office-results .h-people { padding: 0 14px 10px; }
  .office-results .h-people .t-row { grid-template-columns: 1.6fr .9fr .9fr .7fr .9fr .8fr 2fr; }
  .office-results .t-name em { font-style: normal; font-weight: 400; color: #8A9099; font-size: 11.5px; margin-left: 6px; }
  .office-results .t-cards { font-size: 11.5px; color: #8A9099; }
  @media (max-width: 760px) { .office-results .ask-got, .office-results .hub-card > summary { grid-template-columns: 1fr; }
    .office-results .h-people .t-row { grid-template-columns: 1.4fr 1fr 1fr; } .office-results .h-people .t-row > :nth-child(n+4) { display: none; } }
  @media (max-width: 760px) { .office-results .kpi-hero { grid-template-columns: 1fr; } .office-results .kpi-tiles { grid-template-columns: repeat(2, 1fr); }
    .office-results .t-row { grid-template-columns: 1.4fr .5fr 1.4fr .7fr; } .office-results .t-row > :nth-child(n+5) { display: none; } }
  .office-companies .card.wide { width: min(860px, calc(100% - 32px)); max-height: calc(100% - 60px); overflow-y: auto; }
  .office-companies .head { display: flex; justify-content: space-between; align-items: flex-start; }
  .office-companies .x { border: 0; background: none; font-size: 22px; color: #9AA0A8; cursor: pointer; }
  .office-companies .section-title { margin: 10px 0 8px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9AA0A8; }
  .office-companies .company-row { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #ECEDEF;
                                   border-radius: 12px; margin-bottom: 8px; }
  .office-companies .company-row.active { border-color: #9AA7B8; background: #F7F8FA; }
  .office-companies .company-row .grow { flex: 1; min-width: 0; font-size: 13.5px; }
  .office-companies .company-row .grow span { display: block; font-size: 12px; color: #8A9099; margin-top: 2px; }
  .office-companies .open-now { font-size: 12px; color: #5FA37A; font-weight: 600; }
  .office-companies button.ghost, .office-companies button.primary { border: 0; border-radius: 999px; padding: 7px 14px;
      font: 600 12.5px 'Inter', sans-serif; cursor: pointer; }
  .office-companies .templates { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
  .office-companies .template { border: 1px solid #ECEDEF; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; }
  .office-companies .t-name { font-size: 15px; font-weight: 700; }
  .office-companies .t-desc { font-size: 12.5px; color: #6B717B; line-height: 1.4; }
  .office-companies .t-hubs { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; align-content: flex-start; }
  .office-companies .t-hubs span { font-size: 11px; background: #F3F4F5; color: #555B64; padding: 3px 8px; border-radius: 999px; }
  .office-companies .t-foot { display: flex; gap: 6px; }
  .office-companies .t-title { flex: 1; min-width: 0; padding: 7px 9px; border: 1px solid #E1E3E6; border-radius: 8px;
                               font: 12.5px 'Inter', sans-serif; outline: none; }
  .office-companies .builder { border: 1px solid #ECEDEF; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .office-companies .b-hint { font-size: 12.5px; color: #6B717B; line-height: 1.4; }
  .office-companies .b-ask, .office-companies .b-change { display: flex; gap: 8px; align-items: flex-start; }
  .office-companies .b-aim, .office-companies .b-change-text, .office-companies .b-name { flex: 1; min-width: 0; padding: 8px 10px;
    border: 1px solid #E1E3E6; border-radius: 8px; font: 13px 'Inter', sans-serif; resize: vertical; }
  .office-companies .b-draft { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #ECEDEF; padding-top: 10px; }
  .office-companies .b-head { display: flex; align-items: center; gap: 10px; }
  .office-companies .b-name { flex: 0 1 280px; font-weight: 600; }
  .office-companies .b-head span, .office-companies .b-foot span { font-size: 12px; color: #8A9099; }
  .office-companies .b-hub { border-left: 4px solid #9AA7B8; background: #F7F8FA; border-radius: 8px; padding: 8px 12px; font-size: 12.5px; }
  .office-companies .b-hub-name { font-size: 13.5px; margin-bottom: 3px; }
  .office-companies .b-hub-name em { font-style: normal; font-size: 11px; color: #fff; background: #4D6E9E; border-radius: 999px;
    padding: 2px 8px; margin-left: 8px; }
  .office-companies .b-purpose { color: #4A505A; line-height: 1.4; }
  .office-companies .b-people { color: #8A9099; margin-top: 4px; }
  .office-companies .b-people b { font-weight: 500; color: #4A505A; }
  .office-companies .b-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .office-companies button:disabled { opacity: .6; cursor: default; }
  .office-companies .builder button { white-space: nowrap; }
  .office-companies .b-error { color: #B4533A; font-size: 12.5px; }
  .office-companies .b-error:empty { display: none; }
  .office-companies .c-error { color: #B4533A; font-size: 12.5px; margin-top: 8px; min-height: 16px; }
  .office-inbox .item { position: relative; border: 1px solid #ECEDEF; border-left: 4px solid var(--c); border-radius: 12px;
                        padding: 12px 14px; margin-bottom: 12px; }
  .office-inbox .item-head { display: flex; align-items: center; gap: 8px; font-size: 13.5px; padding-right: 20px; }
  .office-inbox .item-head .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .office-inbox .item-head .kind { margin-left: auto; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #9AA0A8; }
  .office-inbox .item p { font-size: 13px; color: #454B54; line-height: 1.45; margin: 8px 0; }
  .office-inbox .item p.pre { white-space: pre-wrap; }
  .office-inbox .item pre { font: 12px 'JetBrains Mono', Consolas, monospace; background: #F6F7F8; border-radius: 8px; padding: 8px 10px;
                            white-space: pre-wrap; word-break: break-word; margin: 8px 0; }
  .office-inbox textarea, .office-inbox input { width: 100%; box-sizing: border-box; padding: 7px 9px; border: 1px solid #E1E3E6;
      border-radius: 8px; font: 13px 'Inter', sans-serif; color: #2B3038; outline: none; resize: vertical; }
  .office-inbox .feedback { margin-top: 6px; }
  .office-inbox .hint { font-size: 11.5px; color: #9AA0A8; margin-top: 2px; }
  .office-inbox .raise { display: flex; align-items: center; gap: 8px; font-size: 13px; }
  .office-inbox .raise input { width: 100px; }
  .office-inbox .usage .raise { flex-wrap: wrap; gap: 6px; font-size: 12.5px; }
  .office-inbox .usage .raise input { width: 58px; }
  .office-inbox .meta { font-size: 12px; color: #7A808A; margin-top: 6px; line-height: 1.5; }
  .office-inbox .meta.warn { color: #B4541A; }
  .office-inbox .dismiss { position: absolute; top: 8px; right: 8px; border: 0; background: none; color: #A2A7AE;
                           cursor: pointer; font-size: 16px; }
  .office-inbox .empty-inbox { font-size: 13px; color: #8A9099; padding: 20px 4px; }
  .office-card { top: 68px; right: 22px; width: 270px; padding: 16px 18px; border-radius: 16px; background: #fff;
                 box-shadow: 0 8px 30px rgba(40,45,55,.14); }
  .office-card[hidden], .office-toast[hidden], .office-panel[hidden] { display: none; }
  .office-card .who { display: flex; align-items: center; gap: 10px; }
  .office-card .who .dot { width: 12px; height: 12px; }
  .office-card .name { font-size: 16px; font-weight: 600; }
  .office-card .role { font-size: 12px; color: #7A808A; }
  .office-card .label { margin-top: 14px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #9AA0A8; }
  .office-card .doing { margin-top: 3px; font-size: 14px; }
  .office-card .model-line { margin-top: 10px; font-size: 12px; color: #7A808A; }
  .office-card .model-line:empty { display: none; }
  .office-inbox .spend-list { margin-top: 10px; border-top: 1px solid #ECEDEF; padding-top: 8px; }
  .office-inbox .spend-title { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #9AA0A8; margin-bottom: 4px; }
  .office-inbox .spend { display: grid; grid-template-columns: 1fr auto 56px; gap: 8px; font-size: 12.5px; padding: 2px 0; }
  .office-inbox .spend .m { color: #8A9099; }
  .office-inbox .helpers { font-size: 11.5px; color: #8A9099; padding: 0 0 3px 10px; }
  .office-inbox .card-row { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; font-size: 12.5px; padding: 2px 0; }
  .office-inbox .card-row .m { color: #8A9099; }
  .office-inbox .card-row .st { color: #555B64; }
  .office-inbox .card-row.passed .st { color: #3F7D57; }
  .office-inbox .card-row.rework .st, .office-inbox .card-row.blocked .st { color: #A5683A; }
  .office-inbox .rating { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12.5px; color: #6B717B; flex-wrap: wrap; }
  .office-inbox .rating button { border: 1px solid #E1E3E6; background: #fff; border-radius: 999px; padding: 5px 10px;
                                 font: 500 12px 'Inter', sans-serif; cursor: pointer; color: #2B3038; }
  .office-inbox .rating button.on { background: #2B3038; color: #fff; border-color: #2B3038; }
  .office-inbox .task-card { border: 1px solid #ECEDEF; border-radius: 10px; padding: 8px 10px; margin: 8px 0; display: grid; gap: 4px; }
  .office-inbox .card-head { display: flex; align-items: center; gap: 8px; }
  .office-inbox .card-who { font-size: 12.5px; font-weight: 600; flex: 1; }
  .office-inbox .card-who em { font-style: normal; font-weight: 400; color: #8A9099; margin-left: 6px; font-size: 11.5px; }
  .office-inbox .card-head select { border: 1px solid #E1E3E6; border-radius: 6px; font: 12px 'Inter', sans-serif; padding: 2px 4px; width: auto; flex: none; }
  .office-inbox .drop { font-size: 11.5px; color: #8A9099; display: flex; align-items: center; gap: 3px; }
  .office-inbox .drop input { width: auto; }
  .office-inbox .card-label { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #9AA0A8; margin-top: 2px; }
  .office-inbox .estimate { font-size: 12.5px; color: #4A505A; background: #EEF3FA; border-radius: 10px; padding: 7px 10px; margin: 6px 0; }
  .office-inbox .estimate span { display: block; font-size: 11.5px; color: #7A808A; }
  .office-inbox .plan-group { display: flex; align-items: center; gap: 10px; justify-content: space-between; padding: 10px 12px;
                              margin: 4px 0 8px; border-radius: 12px; background: #2B3038; color: #fff; font-size: 12.5px; }
  .office-inbox .plan-group span { display: block; color: #C9CDD2; font-size: 11.5px; margin-top: 2px; }
  .office-inbox .auto-plans { display: flex; align-items: center; gap: 8px; margin: 0 16px 6px; font-size: 12.5px;
                              color: #4A505A; cursor: pointer; }
  .office-inbox .plan-group.all { position: sticky; top: 0; z-index: 1; background: #4D6E9E; }
  .office-inbox .plan-group button:disabled { opacity: .6; cursor: default; }
  .office-inbox .plan-group button { border: 0; border-radius: 999px; padding: 7px 14px; background: #fff; color: #2B3038;
                                     font: 600 12.5px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; }
  .office-inbox .goal-check { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; margin: 8px 0;
                              padding: 8px 10px; border-radius: 10px; background: #F6F7F8; font-size: 12.5px; }
  .office-inbox .goal-check b { grid-row: span 2; font-size: 18px; color: var(--v); }
  .office-inbox .goal-check em { font-style: normal; color: #8A9099; font-size: 11.5px; }
  .office-inbox .goal-check.pending { display: block; color: #6B717B; }
  .office-inbox .goal-tag { font-size: 11.5px; color: #8A9099; margin: -2px 0 4px 17px; overflow: hidden; text-overflow: ellipsis;
                            white-space: nowrap; }
  .office-inbox .card-no { width: 20px; height: 20px; border-radius: 50%; background: var(--c); color: #fff; font-size: 11px;
                           font-weight: 700; display: grid; place-items: center; flex: none; }
  .office-inbox .after { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; font-size: 11.5px; color: #6B717B; margin-top: 3px; }
  .office-inbox .after > span { font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; color: #9AA0A8; }
  .office-inbox .after em { font-style: normal; color: #9AA0A8; }
  .office-inbox .chip { display: inline-flex; align-items: center; gap: 3px; border: 1px solid #E1E3E6; border-radius: 999px;
                        padding: 1px 8px 1px 5px; cursor: pointer; }
  .office-inbox .chip input { width: auto; margin: 0; }
  .office-inbox .chip:has(input:checked) { background: #EEF2F8; border-color: #9DB0CF; }
  .office-inbox details { margin-top: 2px; }
  .office-inbox details > summary { font-size: 11.5px; color: #6B717B; cursor: pointer; padding: 3px 0; }
  .office-inbox details > summary b { background: #EEF0F2; border-radius: 999px; padding: 0 6px; font-weight: 600; margin-left: 3px; }
  .office-inbox details[open] { display: grid; gap: 4px; }
  .office-inbox .card-hints { margin: 4px 0 0; padding: 6px 8px 6px 22px; background: #FFF6E5; border-radius: 8px;
                              font-size: 11.5px; color: #8A5A14; display: grid; gap: 2px; }
  .office-inbox .plan-hints { margin: 6px 0; }
  .office-inbox .choices { display: grid; gap: 6px; margin-top: 10px; }
  .office-inbox .choice { display: grid; gap: 2px; text-align: left; border: 1px solid #E1E3E6; background: #fff; border-radius: 10px;
    padding: 8px 11px; cursor: pointer; font: 13px 'Inter', sans-serif; color: #2B3038; }
  .office-inbox .choice:hover:not(:disabled) { border-color: #9DB0CF; background: #F7F9FC; }
  .office-inbox .choice.rec { border-color: #2B3038; box-shadow: inset 3px 0 0 #2B3038; }
  .office-inbox .choice.open { background: #F3F5F8; }
  .office-inbox .choice:disabled { opacity: .55; cursor: default; }
  .office-inbox .c-label { font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .office-inbox .c-label em { font-style: normal; font-weight: 600; font-size: 10.5px; letter-spacing: .04em; color: #fff;
    background: #2B3038; border-radius: 999px; padding: 1px 7px; }
  .office-inbox .c-desc { font-size: 12px; color: #6B717B; line-height: 1.4; }
  .office-inbox .note-box { display: flex; gap: 6px; margin: -2px 0 2px; }
  .office-inbox .note-box[hidden] { display: none; }
  .office-inbox .note-box input { margin: 0; flex: 1; }
  .office-inbox .note-box button { border: 0; border-radius: 999px; padding: 7px 14px; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; flex: none; }
  .office-inbox .explain { background: #F6F7F9; border-radius: 10px; padding: 8px 11px; margin: 8px 0 0; }
  .office-inbox .explain p { margin: 0 0 4px; }
  .office-inbox .explain .plain { font-size: 13.5px; color: #2B3038; font-weight: 500; }
  .office-inbox .explain .why { font-size: 12.5px; color: #6B717B; }
  .office-inbox .explain.pending { font-size: 12.5px; color: #8A9099; }
  .office-inbox .effects { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 4px; }
  .office-inbox .effects .chip { font-size: 11.5px; padding: 2px 8px; background: #fff; }
  .office-inbox .effects .chip.warn { background: #FFF3E3; border-color: #E9C58F; color: #8A5A1C; }
  .office-inbox .risk { font-size: 12px; color: #6B717B; }
  .office-inbox .risk.low b { color: #3F7D57; }
  .office-inbox .risk.medium b { color: #A5683A; }
  .office-inbox .risk.high b { color: #B4382A; }
  .office-inbox details.raw pre { max-height: 220px; overflow: auto; }
  .office-inbox .plan-steps { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 8px; }
  .office-inbox .plan-steps li { display: flex; gap: 9px; align-items: flex-start; font-size: 12.5px; color: #454B54; line-height: 1.4; }
  .office-inbox .plan-steps .card-no { flex: none; margin-top: 1px; }
  .office-inbox .plan-steps .m { color: #8A9099; font-size: 11.5px; }
  .office-inbox .plan-steps .s-what { color: #2B3038; }
  .office-inbox .plan-edit { margin-top: 6px; border-top: 1px dashed #E1E3E6; padding-top: 4px; }
  .office-inbox .plan-edit[hidden] { display: none; }
  .office-card .model-line { white-space: pre-line; }
  .office-inbox .spend span:last-child { text-align: right; }
  .office-card .close { position: absolute; top: 8px; right: 10px; border: 0; background: none; font-size: 20px;
                        color: #9AA0A8; cursor: pointer; }
  .office-toast { top: 86px; left: 50%; transform: translateX(-50%); padding: 8px 16px; border-radius: 999px;
                  background: #2B3038; color: #fff; font-size: 13px; box-shadow: 0 6px 20px rgba(40,45,55,.2); }
  .office-hint { right: 22px; bottom: 26px; font-size: 11.5px; }
  .office-reset { right: 22px; bottom: 52px; font-size: 12px; padding: 7px 14px; }

  .office-panel { position: absolute; top: 0; right: 0; bottom: 0; width: 440px; max-width: 100%; background: #fff;
                  box-shadow: -10px 0 40px rgba(40,45,55,.12); display: flex; flex-direction: column; z-index: 5;
                  animation: office-slide .22s ease-out; }
  @keyframes office-slide { from { transform: translateX(30px); opacity: 0; } }
  .office-panel header { display: flex; justify-content: space-between; align-items: flex-start; padding: 20px 22px 12px; }
  .office-panel .title { font-size: 18px; font-weight: 700; }
  .office-panel .subtitle { font-size: 12.5px; color: #7A808A; margin-top: 2px; }
  .office-panel header .close { border: 0; background: none; font-size: 22px; color: #9AA0A8; cursor: pointer; line-height: 1; }
  .office-panel .body { flex: 1; overflow-y: auto; padding: 4px 22px 22px; }
  .office-panel label { display: block; font-size: 12px; color: #6B717B; margin-bottom: 12px; }
  .office-panel input { display: block; width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px 10px;
                        border: 1px solid #E1E3E6; border-radius: 8px; font: 13.5px 'Inter', sans-serif; color: #2B3038;
                        background: #fff; outline: none; }
  .office-panel input:focus { border-color: #9AA7B8; box-shadow: 0 0 0 3px rgba(91,125,177,.12); }
  .office-panel .section-title { margin: 22px 0 10px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
                                 color: #9AA0A8; display: flex; justify-content: space-between; }
  .office-panel .dept { border: 1px solid #ECEDEF; border-left: 4px solid var(--c); border-radius: 12px;
                        padding: 10px 12px; margin-bottom: 12px; }
  .office-panel .dept-head { display: flex; align-items: center; gap: 8px; }
  .office-panel .dept-name { margin: 0; font-weight: 600; border-color: transparent; padding: 6px 8px; }
  .office-panel .dept-name:hover { border-color: #E1E3E6; }
  .office-panel .count { font-size: 12px; color: #9AA0A8; white-space: nowrap; }
  .office-panel .swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; background: var(--c);
                          box-shadow: 0 0 0 1px #DADDE1; cursor: pointer; flex-shrink: 0; padding: 0; }
  .office-panel .swatch.on { box-shadow: 0 0 0 2px #2B3038; }
  .office-panel select { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #E1E3E6; border-radius: 8px;
                         font: 12.5px 'Inter', sans-serif; color: #2B3038; background: #fff; outline: none; }
  .office-panel label > select { display: block; margin-top: 4px; padding: 8px 10px; font-size: 13.5px; }
  .office-panel .hint { display: block; margin-top: 5px; font-size: 11.5px; color: #9AA0A8; line-height: 1.4; }
  .office-panel .models-row { display: grid; grid-template-columns: 64px 1fr 1fr; align-items: center; gap: 6px;
                              margin: 6px 0 2px; font-size: 12px; color: #7A808A; }
  .office-panel .models-row label { margin: 0; font-size: 10.5px; color: #9AA0A8; }
  .office-panel .models-row select { margin-top: 2px; }
  .office-panel .intern-model { padding: 6px 4px; font-size: 12px; color: #555B64; }
  .office-panel .head-actions { display: flex; align-items: center; gap: 6px; }
  .office-panel .switch { border: 0; border-radius: 999px; padding: 6px 12px; background: #F3F4F5; color: #2B3038;
                          font: 600 12px 'Inter', sans-serif; cursor: pointer; }
  .office-panel .purpose { display: block; width: 100%; box-sizing: border-box; margin: 6px 0 2px; padding: 7px 9px;
                           border: 1px solid #ECEDEF; border-radius: 8px; font: 12.5px/1.4 'Inter', sans-serif; color: #555B64;
                           background: #FAFAFA; resize: vertical; outline: none; }
  .office-panel .purpose:focus { border-color: #9AA7B8; background: #fff; }
  .office-panel .manager-row { display: grid; grid-template-columns: 64px 1fr; align-items: center; gap: 6px;
                               margin: 6px 0 2px; font-size: 12px; color: #7A808A; }
  .office-panel .manager-row input { margin: 0; padding: 6px 8px; font-size: 13px; font-weight: 500; }
  .office-panel .colors { display: flex; gap: 8px; flex-wrap: wrap; padding: 8px 2px 4px; }
  .office-panel .colors[hidden] { display: none; }
  .office-panel .intern { display: grid; grid-template-columns: 26% 1fr 100px 24px; gap: 6px; align-items: center; margin-top: 6px; }
  .office-panel .intern input { margin: 0; padding: 6px 8px; font-size: 13px; }
  .office-panel .intern-role { color: #555B64; }
  .office-panel .empty { font-size: 12.5px; color: #9AA0A8; padding: 8px 2px 2px; }
  .office-panel .icon { border: 0; background: none; color: #A2A7AE; cursor: pointer; font-size: 16px; padding: 2px 4px;
                        border-radius: 6px; white-space: nowrap; }
  .office-panel .icon:hover { background: #F3F4F5; color: #2B3038; }
  .office-panel .icon.armed { color: #B4533A; font-size: 12px; font-weight: 600; background: #FBEFEB; }
  .office-panel .link { border: 0; background: none; color: #4D6E9E; font: 500 12.5px 'Inter', sans-serif; cursor: pointer;
                        padding: 8px 2px 2px; }
  .office-panel .link:disabled, .office-panel .add-dept:disabled { color: #B5BAC0; cursor: default; }
  .office-panel .add-dept { width: 100%; padding: 10px; border: 1.5px dashed #D5D8DC; border-radius: 12px; background: none;
                            color: #4D6E9E; font: 500 13px 'Inter', sans-serif; cursor: pointer; }
  .office-panel footer { border-top: 1px solid #ECEDEF; padding: 14px 22px; display: flex; align-items: center;
                         justify-content: space-between; gap: 10px; }
  .office-panel .status { font-size: 12.5px; color: #7A808A; }
  .office-panel .status.error { color: #B4533A; }
  .office-panel .actions { display: flex; gap: 8px; flex-shrink: 0; }
  .office-panel .actions button { border: 0; border-radius: 999px; padding: 8px 16px; font: 600 13px 'Inter', sans-serif; cursor: pointer; }
  .office-panel .ghost { background: #F3F4F5; color: #2B3038; }
  .office-panel .primary { background: #2B3038; color: #fff; }
  .office-panel .primary:disabled { background: #C9CDD2; cursor: default; }
  @media (max-width: 700px) { .office-hint { display: none; } .office-legend { max-width: calc(100% - 44px); bottom: 70px; }
    .office-card { left: 16px; right: 16px; width: auto; top: auto; bottom: 120px; } }
`;

// ── signing in: the first start creates the owner account; later starts show the sign-in screen ──
let ME = null;  // the signed-in account
const GOOGLE_G = `<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.6c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 7-10.1 7-17.4z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>`;

// Sign-in with Google happens in this computer's browser (Google won't show its page inside the app window): the
// server opens it, and this window asks every 1.5 s whether the browser has come back. `wait.cancel()` stops asking.
async function viaBrowser(startUrl, wait) {
  const res = await fetch(startUrl, {method: 'POST'});
  const start = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(start.error || 'Something went wrong. Please try again.');
  wait.poll = start.poll;
  wait.url = start.url;
  wait.onOpen?.(start);
  while (!wait.cancelled) {
    await new Promise((r) => setTimeout(r, 1500));
    if (wait.cancelled) break;
    const r = await fetch('/api/auth/finish', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                               body: JSON.stringify({poll: start.poll})});
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    if (!body.waiting) return body;
  }
  return null;
}

function browserWait() {
  const wait = {cancelled: false};
  wait.cancel = () => {
    wait.cancelled = true;
    if (wait.poll) fetch('/api/auth/cancel', {method: 'POST', headers: {'Content-Type': 'application/json'},
                                              body: JSON.stringify({poll: wait.poll})});
  };
  return wait;
}

// `only`: Google only (no passwords). On first start with Google available, the owner is made with Google too.
function signIn(el, setup, providers = [], only = false) {
  return new Promise((resolve) => {
    const hasGoogle = providers.some((p) => p.id === 'google');
    const viaGoogle = only || (setup && hasGoogle);
    const googleButton = `<button class="gate-google" type="button">${GOOGLE_G}<span>Continue with Google</span></button>
          <div class="gate-wait" hidden><span>Continue in your browser to finish signing in.</span>
            <button class="link" type="button" data-cancel>Cancel</button></div>`;
    const gate = document.createElement('div');
    gate.className = 'office-gate';
    gate.innerHTML = `
      <form class="gate-card" autocomplete="on">
        <div class="gate-brand">Intern Co.</div>
        <div class="gate-title">${setup ? 'Set up Intern Co.' : 'Sign in to Intern Co.'}</div>
        ${viaGoogle ? `<div class="gate-sub">${setup ? 'Create the owner account to get started.' : 'Welcome back.'}</div>
        ${googleButton}
        <div class="gate-error"></div>
        ${setup ? '' : '<button class="link gate-forgot gate-alt" type="button">Other sign-in options</button>'}` : `
        <div class="gate-sub">${setup ? 'Create the owner account to get started.' : 'Welcome back.'}</div>
        ${setup ? '<label>Full name<input name="name" autocomplete="name" required></label>' : ''}
        <label>Email or username<input name="login" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="${setup ? 'new-password' : 'current-password'}" required></label>
        ${setup ? '<label>Confirm password<input name="again" type="password" autocomplete="new-password" required></label>' : ''}
        ${setup ? '' : '<button class="link gate-forgot" type="button">Forgot password?</button>'}
        <div class="gate-error"></div>
        <button class="primary" type="submit">${setup ? 'Create account' : 'Sign in'}</button>
        ${hasGoogle ? `<div class="gate-or"><span>or</span></div>${googleButton}` : ''}`}
      </form>
      ${setup ? '' : `<form class="gate-card gate-reset" autocomplete="off" hidden>
        <div class="gate-brand">Intern Co.</div>
        <div class="gate-title">${only ? 'Sign in with a verification code' : 'Reset your password'}</div>
        <div class="gate-sub">A one-time verification code will be saved on this computer.</div>
        <label>Email or username<input name="login" autocomplete="username" required></label>
        <button class="primary" type="button" data-send>Get code</button>
        <div class="gate-step" hidden>
          <div class="gate-wait"><span>Verification code saved to</span> <code translate="no" data-file></code>
            <button class="link" type="button" data-show>Show in folder</button></div>
          <label>Verification code<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
          ${only ? '' : `<label>New password<input name="password" type="password" autocomplete="new-password"></label>
          <label>Confirm new password<input name="again" type="password" autocomplete="new-password"></label>`}
        </div>
        <div class="gate-error"></div>
        <button class="primary gate-step" type="submit" hidden>${only ? 'Sign in' : 'Reset password'}</button>
        <button class="link gate-back" type="button">Back to sign in</button>
      </form>`}
      <label class="gate-lang">Language ${languageSelect()}</label>`;
    el.appendChild(gate);
    gate.querySelector('select[data-lang]').onchange = (e) => setLang(e.target.value);
    const form = gate.querySelector('form');
    form.querySelector('input')?.focus();
    const reset = gate.querySelector('.gate-reset');
    if (reset) {
      const post = async (url, body) => {
        const res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || 'Something went wrong. Please try again.');
        return out;
      };
      const error = reset.querySelector('.gate-error');
      const swap = (toReset) => {
        form.hidden = toReset;
        reset.hidden = !toReset;
        error.textContent = '';
        if (toReset && form.elements.login) reset.elements.login.value = form.elements.login.value;
        (toReset ? reset : form).querySelector('input')?.focus();
      };
      gate.querySelector('.gate-forgot').onclick = () => swap(true);
      reset.querySelector('.gate-back').onclick = () => swap(false);
      reset.querySelector('[data-send]').onclick = async (e) => {
        error.textContent = '';
        try {
          const out = await post('/api/auth/forgot', {login: reset.elements.login.value});
          reset.querySelector('[data-file]').textContent = out.file;
          reset.querySelectorAll('.gate-step').forEach((x) => { x.hidden = false; });
          e.target.textContent = 'Get a new code';
          e.target.classList.replace('primary', 'ghost');
          reset.elements.code.focus();
        } catch (err) { error.textContent = err.message; }
      };
      reset.querySelector('[data-show]').onclick = () => post('/api/auth/forgot/show', {}).catch((err) => { error.textContent = err.message; });
      reset.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (reset.querySelector('div.gate-step').hidden) { reset.querySelector('[data-send]').click(); return; }  // Enter on the name
        const f = Object.fromEntries(new FormData(reset));
        if (!only && f.password !== f.again) { error.textContent = 'Passwords do not match.'; return; }
        try {
          const body = await post('/api/auth/reset', {login: f.login, code: f.code, password: f.password});
          gate.remove();
          resolve(body.user);
        } catch (err) { error.textContent = err.message; }
      });
    }
    const google = gate.querySelector('.gate-google');
    if (google) {
      const waitBox = gate.querySelector('.gate-wait');
      let wait = null;
      const done = () => { google.disabled = false; waitBox.hidden = true; wait = null; };
      waitBox.querySelector('[data-cancel]').onclick = () => { wait?.cancel(); done(); };
      google.onclick = async () => {
        const error = form.querySelector('.gate-error');
        error.textContent = '';
        google.disabled = true;
        waitBox.hidden = false;
        wait = browserWait();
        const mine = wait;
        try {
          const body = await viaBrowser(setup ? '/api/auth/google/start?setup=true' : '/api/auth/google/start', wait);
          if (!body || mine.cancelled) return;
          gate.remove();
          resolve(body.user);
        } catch (err) {
          if (!mine.cancelled) { error.textContent = err.message; done(); }
        }
      };
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (viaGoogle) return;  // no password form
      const f = Object.fromEntries(new FormData(form));
      const error = form.querySelector('.gate-error');
      if (setup && f.password !== f.again) { error.textContent = 'Passwords do not match.'; return; }
      const res = await fetch(setup ? '/api/auth/setup' : '/api/auth/login', {method: 'POST',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify(f)});
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { error.textContent = body.error || 'Something went wrong. Please try again.'; return; }
      gate.remove();
      resolve(body.user);
    });
  });
}

// The interface language (i18n.js): picking one reloads the page in it. The names stay as they are in both.
function languageSelect() {
  return `<select data-lang translate="no">${Object.entries(LANGS).map(([k, name]) =>
    `<option value="${k}"${k === lang ? ' selected' : ''}>${name}</option>`).join('')}</select>`;
}

async function signOut() {
  await fetch('/api/auth/logout', {method: 'POST'});
  location.reload();
}

async function boot() {
  const el = document.getElementById('office-stage');
  if (!el) return requestAnimationFrame(boot);
  if (el.dataset.ready) return;
  el.dataset.ready = '1';
  el.classList.add('office-stage');
  const style = document.createElement('style');
  // Inter has no Japanese letters: Japanese text falls back to the system's Japanese font
  style.textContent = STYLE.replaceAll("'Inter',", "'Inter', 'Yu Gothic UI', Meiryo, 'Hiragino Sans',");
  document.head.appendChild(style);
  startTranslator();
  // signed out somewhere else, or the sign-in expired: back to the sign-in screen
  const plainFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const res = await plainFetch(...args);
    if (res.status === 401 && String(args[0]).startsWith('/api/') && !String(args[0]).startsWith('/api/auth/') && ME) location.reload();
    return res;
  };
  const state = await (await fetch('/api/auth/state')).json();
  ME = state.user || await signIn(el, state.setup_needed, state.providers, state.google_only);
  const company = await (await fetch('/api/company')).json();
  window.office = new Office(el, company);
}
boot();
