import { mkdir, writeFile } from 'node:fs/promises';

const username = process.env.PROFILE_USERNAME || process.env.GITHUB_REPOSITORY_OWNER || 'AJings3c';
const token = process.env.GITHUB_TOKEN || '';
const outDir = new URL('../assets/', import.meta.url);

const headers = {
  'User-Agent': `${username}-profile-assets`,
  Accept: 'application/vnd.github+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const languageColors = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Go: '#00add8',
  Swift: '#f05138',
  Python: '#3572a5',
  CSS: '#663399',
  HTML: '#e34c26',
  Shell: '#89e051',
};

async function fetchText(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function getLanguages() {
  try {
    const repos = await fetchJson(`https://api.github.com/users/${username}/repos?per_page=100&type=owner&sort=updated`);
    const totals = new Map();

    await Promise.all(
      repos
        .filter((repo) => !repo.fork && !repo.archived)
        .map(async (repo) => {
          const langs = await fetchJson(repo.languages_url);
          for (const [name, size] of Object.entries(langs)) {
            totals.set(name, (totals.get(name) || 0) + size);
          }
        }),
    );

    const total = [...totals.values()].reduce((sum, size) => sum + size, 0);
    if (total > 0) {
      return [...totals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, size]) => ({
          name,
          value: size / total,
          color: languageColors[name] || '#8b949e',
        }));
    }
  } catch (error) {
    console.warn(`Falling back to public language card: ${error.message}`);
  }

  const svg = await fetchText(
    `https://github-profile-summary-cards.vercel.app/api/cards/repos-per-language?username=${username}&theme=github_dark`,
  );
  const names = [...svg.matchAll(/>([^<>]+)<\/text>/g)]
    .map((match) => match[1])
    .filter((text) => text !== 'Top Languages by Repo');
  const colors = [...svg.matchAll(/<rect y="[^"]+"[^>]*fill="(#[0-9a-fA-F]{6})"/g)]
    .map((match) => match[1])
    .slice(0, names.length);

  return names.slice(0, 6).map((name, index, list) => ({
    name,
    value: 1 / list.length,
    color: colors[index] || languageColors[name] || '#8b949e',
  }));
}

async function getContributions() {
  const html = await fetchText(`https://github.com/users/${username}/contributions`);
  const totalMatch = html.match(/([0-9,]+)\s+contributions?\s+in\s+the\s+last\s+year/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0;

  const days = [...html.matchAll(/<td[^>]*data-date="([^"]+)"[^>]*id="contribution-day-component-(\d+)-(\d+)"[^>]*data-level="(\d+)"/g)]
    .map((match) => ({
      date: match[1],
      weekday: Number(match[2]),
      week: Number(match[3]),
      level: Number(match[4]),
    }))
    .sort((a, b) => a.week - b.week || a.weekday - b.weekday);

  return { total, days };
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function languageSvg(languages) {
  const width = 720;
  const height = 260;
  const cx = 525;
  const cy = 132;
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const segments = languages
    .map((lang, index) => {
      const length = Math.max(0.015, lang.value) * circumference;
      const dash = `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`;
      const currentOffset = -offset;
      offset += length;
      return `
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${lang.color}" stroke-width="24"
          stroke-linecap="round" stroke-dasharray="${dash}" stroke-dashoffset="${currentOffset.toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})" opacity="0.92">
          <animate attributeName="stroke-width" values="22;27;22" dur="${3.2 + index * 0.2}s" begin="${index * 0.15}s" repeatCount="indefinite" />
        </circle>`;
    })
    .join('');

  const rows = languages
    .map((lang, index) => {
      const pct = `${(lang.value * 100).toFixed(1)}%`;
      const y = 82 + index * 25;
      const barWidth = Math.max(22, Math.round(lang.value * 260));
      return `
        <g>
          <rect x="44" y="${y - 10}" width="12" height="12" rx="3" fill="${lang.color}">
            <animate attributeName="opacity" values="0.55;1;0.55" dur="${2.8 + index * 0.18}s" begin="${index * 0.1}s" repeatCount="indefinite" />
          </rect>
          <text x="66" y="${y}" class="label">${escapeXml(lang.name)}</text>
          <text x="176" y="${y}" class="value">${pct}</text>
          <rect x="228" y="${y - 9}" width="260" height="7" rx="3.5" fill="#161b22" />
          <rect x="228" y="${y - 9}" width="${barWidth}" height="7" rx="3.5" fill="${lang.color}">
            <animate attributeName="width" values="8;${barWidth};${Math.max(18, barWidth - 10)};${barWidth}" dur="4s" begin="${index * 0.16}s" repeatCount="indefinite" />
          </rect>
        </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { fill: #f0f6fc; font-size: 24px; font-weight: 700; }
    .sub { fill: #7d8590; font-size: 13px; }
    .label { fill: #c9d1d9; font-size: 14px; font-weight: 600; }
    .value { fill: #7d8590; font-size: 13px; }
  </style>
  <defs>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" fill="#0d1117" stroke="#30363d" />
  <text x="36" y="40" class="title">Repository Stack</text>
  <text x="36" y="61" class="sub">Language share across public repositories</text>
  ${rows}
  <g filter="url(#glow)">
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#161b22" stroke-width="25" />
    <g>
      ${segments}
      <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="28s" repeatCount="indefinite" />
    </g>
    <circle cx="${cx}" cy="${cy}" r="39" fill="#0d1117" stroke="#30363d" />
    <circle cx="${cx}" cy="${cy}" r="6" fill="#58a6ff">
      <animate attributeName="r" values="5;8;5" dur="2.4s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.7;1;0.7" dur="2.4s" repeatCount="indefinite" />
    </circle>
  </g>
</svg>
`;
}

function activitySvg({ total, days }) {
  const width = 920;
  const height = 238;
  const left = 54;
  const top = 72;
  const cell = 11;
  const gap = 4;
  const colors = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const cells = days
    .map((day) => {
      const x = left + day.week * (cell + gap);
      const y = top + day.weekday * (cell + gap);
      const color = colors[day.level] || colors[0];
      const delay = (day.week * 0.035 + day.weekday * 0.04).toFixed(2);
      const pulse = day.level > 0
        ? `<animate attributeName="opacity" values="0.65;1;0.8;1" dur="3.4s" begin="${delay}s" repeatCount="indefinite" />`
        : `<animate attributeName="opacity" values="0.35;0.55;0.35" dur="5.2s" begin="${delay}s" repeatCount="indefinite" />`;
      return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${color}">${pulse}</rect>`;
    })
    .join('');

  const months = [];
  let previousMonth = '';
  for (const day of days) {
    const month = day.date.slice(5, 7);
    if (day.weekday === 0 && month !== previousMonth) {
      previousMonth = month;
      months.push(`<text x="${left + day.week * (cell + gap)}" y="58" class="axis">${monthNames[Number(month) - 1]}</text>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { fill: #f0f6fc; font-size: 24px; font-weight: 700; }
    .sub { fill: #7d8590; font-size: 13px; }
    .axis { fill: #8b949e; font-size: 12px; font-weight: 600; }
  </style>
  <defs>
    <linearGradient id="sweep" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#58a6ff" stop-opacity="0" />
      <stop offset="50%" stop-color="#58a6ff" stop-opacity="0.32" />
      <stop offset="100%" stop-color="#58a6ff" stop-opacity="0" />
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" fill="#0d1117" stroke="#30363d" />
  <text x="32" y="38" class="title">Activity Rhythm</text>
  <text x="32" y="59" class="sub">${total.toLocaleString('en-US')} contributions in the last year</text>
  ${months.join('')}
  <text x="18" y="${top + 1 * (cell + gap) + 10}" class="axis">Mon</text>
  <text x="18" y="${top + 3 * (cell + gap) + 10}" class="axis">Wed</text>
  <text x="18" y="${top + 5 * (cell + gap) + 10}" class="axis">Fri</text>
  <g filter="url(#softGlow)">
    ${cells}
  </g>
  <rect x="${left - 4}" y="${top - 8}" width="92" height="${7 * (cell + gap) + 8}" fill="url(#sweep)" opacity="0.85">
    <animate attributeName="x" from="${left - 80}" to="${left + 53 * (cell + gap)}" dur="6s" repeatCount="indefinite" />
  </rect>
  <text x="${width - 180}" y="${height - 32}" class="axis">Less</text>
  ${colors.map((color, index) => `<rect x="${width - 145 + index * 18}" y="${height - 43}" width="11" height="11" rx="3" fill="${color}" />`).join('')}
  <text x="${width - 48}" y="${height - 32}" class="axis">More</text>
</svg>
`;
}

await mkdir(outDir, { recursive: true });
const [languages, contributions] = await Promise.all([getLanguages(), getContributions()]);
await writeFile(new URL('languages.svg', outDir), languageSvg(languages));
await writeFile(new URL('activity.svg', outDir), activitySvg(contributions));
console.log(`Generated profile assets for ${username}`);
