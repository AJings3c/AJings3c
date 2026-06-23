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

const recentRepoFallbacks = [
  {
    name: 'DayDayUp',
    description: '',
    language: 'Swift',
    updatedAt: '2026-06-23T13:09:00Z',
  },
  {
    name: 'Doperationtool',
    description: '',
    language: 'Go',
    updatedAt: '2026-06-23T04:55:53Z',
  },
  {
    name: 'Threat-Intelligence',
    description: 'Global threat-intelligence platform',
    language: 'TypeScript',
    updatedAt: '2026-06-13T11:22:09Z',
  },
  {
    name: 'Xdfile-Manager',
    description: '',
    language: 'Go',
    updatedAt: '2026-06-08T14:35:07Z',
  },
];

async function fetchText(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.text();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': `${username}-profile-assets`,
      Accept: 'text/html,application/xhtml+xml',
    },
  });
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

  const counts = new Map(
    [...html.matchAll(/for="contribution-day-component-(\d+)-(\d+)"[^>]*>(No|\d+)\s+contributions?/g)]
      .map((match) => [`${match[1]}-${match[2]}`, match[3] === 'No' ? 0 : Number(match[3])]),
  );

  for (const day of days) {
    day.count = counts.get(`${day.weekday}-${day.week}`) || 0;
  }

  return { total, days };
}

async function getRecentRepos() {
  try {
    const repos = await fetchJson(`https://api.github.com/users/${username}/repos?per_page=20&type=owner&sort=updated`);
    if (Array.isArray(repos)) {
      return repos
        .filter((repo) => !repo.fork && !repo.archived && repo.name !== username)
        .slice(0, 4)
        .map((repo) => ({
          name: repo.name,
          description: repo.description || '',
          language: repo.language || 'Mixed',
          updatedAt: repo.updated_at,
        }));
    }
  } catch (error) {
    console.warn(`Falling back to repository page: ${error.message}`);
  }

  try {
    const html = await fetchHtml(`https://github.com/${username}?tab=repositories&sort=updated`);
    const items = [...html.matchAll(/<li class="[^"]*public[^"]*"[\s\S]*?<\/li>/g)]
      .map((match) => match[0])
      .map((item) => {
        const name = item.match(/itemprop="name codeRepository"[^>]*>\s*([^<]+)<\/a>/)?.[1]?.trim();
        const description = item.match(/itemprop="description">\s*([\s\S]*?)\s*<\/p>/)?.[1]?.replace(/\s+/g, ' ').trim() || '';
        const language = item.match(/itemprop="programmingLanguage">([^<]+)<\/span>/)?.[1]?.trim() || 'Mixed';
        const updatedAt = item.match(/<relative-time datetime="([^"]+)"/)?.[1] || '';
        return { name, description, language, updatedAt };
      })
      .filter((repo) => repo.name && repo.name !== username)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 4);

    if (items.length > 0) return items;
  } catch (error) {
    console.warn(`Falling back to static recent repos: ${error.message}`);
  }

  return recentRepoFallbacks;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function truncateText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatDate(value) {
  if (!value) return 'recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
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

function niceCeil(value) {
  if (value <= 10) return 10;
  if (value <= 30) return 30;
  if (value <= 50) return 50;
  if (value <= 70) return 70;
  return Math.ceil(value / 25) * 25;
}

function smoothPath(points) {
  if (points.length < 2) return '';
  const d = [`M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    const cp1y = Math.min(maxY, Math.max(minY, p1.y + (p2.y - p0.y) / 6));
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = Math.min(maxY, Math.max(minY, p2.y - (p3.y - p1.y) / 6));
    d.push(`C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`);
  }
  return d.join('');
}

function activitySvg({ total, days }) {
  const width = 920;
  const height = 318;
  const plot = { x: 76, y: 78, width: 794, height: 176 };
  const recent = days
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-31);
  const maxCount = niceCeil(Math.max(10, ...recent.map((day) => day.count || 0)));
  const points = recent.map((day, index) => ({
    x: plot.x + (index * plot.width) / Math.max(1, recent.length - 1),
    y: plot.y + plot.height - ((day.count || 0) / maxCount) * plot.height,
    count: day.count || 0,
    label: String(Number(day.date.slice(8, 10))),
  }));
  const linePath = smoothPath(points);
  const areaPath = `${linePath} L${plot.x + plot.width},${plot.y + plot.height} L${plot.x},${plot.y + plot.height} Z`;
  const gridY = [0, 0.25, 0.5, 0.75, 1].map((ratio) => plot.y + plot.height * ratio);
  const gridX = Array.from({ length: 16 }, (_, index) => plot.x + (index * plot.width) / 15);
  const labels = points
    .filter((_, index) => index % 3 === 0 || index === points.length - 1)
    .map((point) => `<text x="${point.x.toFixed(0)}" y="${plot.y + plot.height + 27}" class="axis" text-anchor="middle">${point.label}</text>`)
    .join('');
  const yLabels = [maxCount, maxCount * 0.75, maxCount * 0.5, maxCount * 0.25, 0]
    .map((value, index) => `<text x="${plot.x - 18}" y="${gridY[index] + 4}" class="axis" text-anchor="end">${Math.round(value)}</text>`)
    .join('');
  const nodes = points
    .filter((point) => point.count > 0)
    .map((point, index) => `
      <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.5" fill="#58a6ff" stroke="#0d1117" stroke-width="2">
        <animate attributeName="r" values="3.8;6.2;3.8" dur="2.6s" begin="${(index * 0.18).toFixed(2)}s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.75;1;0.75" dur="2.6s" begin="${(index * 0.18).toFixed(2)}s" repeatCount="indefinite" />
      </circle>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { fill: #f0f6fc; font-size: 24px; font-weight: 700; }
    .sub { fill: #7d8590; font-size: 13px; }
    .axis { fill: #8b949e; font-size: 12px; font-weight: 600; }
    .grid { stroke: #1f6feb; stroke-width: 1; stroke-dasharray: 2 5; opacity: 0.22; }
  </style>
  <defs>
    <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="#1f6feb" stop-opacity="0.46" />
      <stop offset="100%" stop-color="#1f6feb" stop-opacity="0.03" />
    </linearGradient>
    <linearGradient id="lineGradient" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#58a6ff" />
      <stop offset="50%" stop-color="#1f6feb" />
      <stop offset="100%" stop-color="#2f81f7" />
    </linearGradient>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" fill="#0d1117" stroke="#30363d" />
  <text x="32" y="38" class="title">Activity Rhythm</text>
  <text x="32" y="59" class="sub">${total.toLocaleString('en-US')} contributions in the last year · last 31 days</text>
  ${gridX.map((x) => `<line x1="${x.toFixed(2)}" x2="${x.toFixed(2)}" y1="${plot.y}" y2="${plot.y + plot.height}" class="grid" />`).join('')}
  ${gridY.map((y) => `<line x1="${plot.x}" x2="${plot.x + plot.width}" y1="${y.toFixed(2)}" y2="${y.toFixed(2)}" class="grid" />`).join('')}
  ${yLabels}
  ${labels}
  <text x="${plot.x + plot.width / 2}" y="${height - 18}" class="axis" text-anchor="middle">Days</text>
  <text x="22" y="${plot.y + plot.height / 2}" class="axis" text-anchor="middle" transform="rotate(-90 22 ${plot.y + plot.height / 2})">Contributions</text>
  <path d="${areaPath}" fill="url(#areaGradient)">
    <animate attributeName="opacity" values="0.35;0.72;0.45;0.72" dur="6.5s" repeatCount="indefinite" />
  </path>
  <path id="activityLine" d="${linePath}" fill="none" stroke="url(#lineGradient)" stroke-width="4.5" stroke-linecap="round" filter="url(#softGlow)" pathLength="1000" />
  <path d="${linePath}" fill="none" stroke="#79c0ff" stroke-width="7" stroke-linecap="round" opacity="0.65" pathLength="1000" stroke-dasharray="70 930" filter="url(#softGlow)">
    <animate attributeName="stroke-dashoffset" values="1000;0" dur="4.2s" repeatCount="indefinite" />
  </path>
  <path d="${linePath}" fill="none" stroke="#58a6ff" stroke-width="4.5" stroke-linecap="round" pathLength="1000" stroke-dasharray="1000" stroke-dashoffset="1000">
    <animate attributeName="stroke-dashoffset" values="1000;0;0" keyTimes="0;0.72;1" dur="7s" repeatCount="indefinite" />
  </path>
  ${nodes}
  <circle r="6" fill="#79c0ff" filter="url(#softGlow)">
    <animateMotion dur="5.6s" repeatCount="indefinite" rotate="auto">
      <mpath href="#activityLine" />
    </animateMotion>
    <animate attributeName="r" values="5;8;5" dur="1.4s" repeatCount="indefinite" />
  </circle>
</svg>
`;
}

function recentWorkSvg(repos) {
  const width = 920;
  const height = 328;
  const rows = repos.slice(0, 4).map((repo, index) => {
    const y = 86 + index * 58;
    const color = languageColors[repo.language] || '#8b949e';
    const description = truncateText(repo.description || 'Recently updated repository', 74);
    return `
      <g>
        <rect x="32" y="${y - 27}" width="${width - 64}" height="46" rx="8" fill="#161b22" opacity="0.62" stroke="#30363d">
          <animate attributeName="opacity" values="0.48;0.72;0.55" dur="${4.2 + index * 0.2}s" begin="${(index * 0.18).toFixed(2)}s" repeatCount="indefinite" />
        </rect>
        <circle cx="52" cy="${y - 6}" r="6" fill="${color}">
          <animate attributeName="r" values="5;7;5" dur="${2.8 + index * 0.18}s" begin="${(index * 0.13).toFixed(2)}s" repeatCount="indefinite" />
        </circle>
        <text x="70" y="${y - 8}" class="repo">${escapeXml(repo.name)}</text>
        <text x="70" y="${y + 12}" class="desc">${escapeXml(description)}</text>
        <text x="${width - 212}" y="${y - 8}" class="meta">${escapeXml(repo.language)}</text>
        <text x="${width - 114}" y="${y - 8}" class="meta" text-anchor="end">${escapeXml(formatDate(repo.updatedAt))}</text>
        <rect x="${width - 188}" y="${y + 6}" width="108" height="5" rx="2.5" fill="#0d1117" />
        <rect x="${width - 188}" y="${y + 6}" width="${78 - index * 10}" height="5" rx="2.5" fill="${color}">
          <animate attributeName="width" values="18;${78 - index * 10};${62 - index * 8};${78 - index * 10}" dur="4s" begin="${(index * 0.16).toFixed(2)}s" repeatCount="indefinite" />
        </rect>
      </g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .title { fill: #f0f6fc; font-size: 24px; font-weight: 700; }
    .sub { fill: #7d8590; font-size: 13px; }
    .repo { fill: #58a6ff; font-size: 17px; font-weight: 700; }
    .desc { fill: #8b949e; font-size: 13px; }
    .meta { fill: #c9d1d9; font-size: 13px; font-weight: 600; }
  </style>
  <defs>
    <linearGradient id="scan" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#58a6ff" stop-opacity="0" />
      <stop offset="50%" stop-color="#58a6ff" stop-opacity="0.26" />
      <stop offset="100%" stop-color="#58a6ff" stop-opacity="0" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" fill="#0d1117" stroke="#30363d" />
  <text x="32" y="38" class="title">Recent Work</text>
  <text x="32" y="59" class="sub">Latest public repositories by update time</text>
  <g filter="url(#glow)">
    ${rows}
  </g>
  <rect x="-120" y="0" width="120" height="${height}" fill="url(#scan)" opacity="0.85">
    <animate attributeName="x" from="-140" to="${width + 80}" dur="7s" repeatCount="indefinite" />
  </rect>
</svg>
`;
}

await mkdir(outDir, { recursive: true });
const [languages, contributions, recentRepos] = await Promise.all([getLanguages(), getContributions(), getRecentRepos()]);
await writeFile(new URL('languages.svg', outDir), languageSvg(languages));
await writeFile(new URL('activity.svg', outDir), activitySvg(contributions));
await writeFile(new URL('recent-work.svg', outDir), recentWorkSvg(recentRepos));
console.log(`Generated profile assets for ${username}`);
