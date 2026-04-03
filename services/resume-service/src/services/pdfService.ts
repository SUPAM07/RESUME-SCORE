/**
 * @module services/pdfService
 * PDF generation for resume documents.
 *
 * Strategy:
 *   1. Build an HTML representation of the resume using a lightweight template.
 *   2. Launch a headless Chromium instance via Puppeteer to render and print to PDF.
 *   3. Return the PDF as a Buffer for streaming or base64 encoding.
 *
 * Puppeteer is launched once and reused across requests for performance.
 */

import puppeteer, { type Browser } from 'puppeteer';
import { createLogger } from '../utils/logger.js';
import { InternalError } from '../utils/errors.js';
import type { Resume } from '../models/resume.js';

const logger = createLogger('pdfService');

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;

  logger.info('Launching Puppeteer browser');
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    logger.info('Puppeteer browser closed');
  }
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildResumeHtml(resume: Resume): string {
  const ds = resume.document_settings;
  const fontSize = ds?.document_font_size ?? 10;
  const lineHeight = ds?.document_line_height ?? 1.5;
  const marginV = ds?.document_margin_vertical ?? 36;
  const marginH = ds?.document_margin_horizontal ?? 36;
  const headerNameSize = ds?.header_name_size ?? 24;

  const workExpHtml = (resume.work_experience ?? []).map((exp) => `
    <div class="section-item">
      <div class="item-header">
        <strong>${escapeHtml(exp.position)}</strong> — ${escapeHtml(exp.company)}
        <span class="item-date">${escapeHtml(exp.date)}</span>
      </div>
      ${exp.location ? `<div class="item-sub">${escapeHtml(exp.location)}</div>` : ''}
      <ul>${(exp.description ?? []).map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
    </div>
  `).join('');

  const educationHtml = (resume.education ?? []).map((edu) => `
    <div class="section-item">
      <div class="item-header">
        <strong>${escapeHtml(edu.school)}</strong>
        <span class="item-date">${escapeHtml(edu.date)}</span>
      </div>
      <div>${escapeHtml(edu.degree)} in ${escapeHtml(edu.field)}</div>
      ${edu.gpa ? `<div>GPA: ${escapeHtml(String(edu.gpa))}</div>` : ''}
    </div>
  `).join('');

  const skillsHtml = (resume.skills ?? []).map((skill) => `
    <div class="skill-group">
      <strong>${escapeHtml(skill.category)}:</strong> ${escapeHtml(skill.items.join(', '))}
    </div>
  `).join('');

  const projectsHtml = (resume.projects ?? []).map((proj) => `
    <div class="section-item">
      <div class="item-header">
        <strong>${escapeHtml(proj.name)}</strong>
        ${proj.date ? `<span class="item-date">${escapeHtml(proj.date)}</span>` : ''}
      </div>
      <ul>${(proj.description ?? []).map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
      ${proj.technologies?.length ? `<div class="item-sub">Technologies: ${escapeHtml(proj.technologies.join(', '))}</div>` : ''}
    </div>
  `).join('');

  const sectionOrder = resume.section_order ?? [
    'professional_summary',
    'work_experience',
    'skills',
    'projects',
    'education',
    'certifications',
  ];

  const sectionMap: Record<string, string> = {
    professional_summary: resume.professional_summary
      ? `<section><h2>Summary</h2><p>${escapeHtml(resume.professional_summary)}</p></section>`
      : '',
    work_experience: workExpHtml
      ? `<section><h2>Work Experience</h2>${workExpHtml}</section>`
      : '',
    education: educationHtml
      ? `<section><h2>Education</h2>${educationHtml}</section>`
      : '',
    skills: skillsHtml
      ? `<section><h2>Skills</h2>${skillsHtml}</section>`
      : '',
    projects: projectsHtml
      ? `<section><h2>Projects</h2>${projectsHtml}</section>`
      : '',
    certifications: '',
  };

  const sectionsHtml = sectionOrder
    .map((s) => sectionMap[s] ?? '')
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: ${fontSize}pt;
      line-height: ${lineHeight};
      margin: ${marginV}pt ${marginH}pt;
      color: #111;
    }
    header { text-align: center; margin-bottom: 16pt; border-bottom: 1pt solid #ccc; padding-bottom: 8pt; }
    header h1 { font-size: ${headerNameSize}pt; letter-spacing: 1pt; }
    header .contact { font-size: ${fontSize - 1}pt; color: #444; margin-top: 4pt; }
    section { margin-bottom: 12pt; }
    h2 { font-size: ${fontSize + 2}pt; text-transform: uppercase; letter-spacing: 0.5pt;
         border-bottom: 0.5pt solid #ccc; margin-bottom: 6pt; padding-bottom: 2pt; }
    .section-item { margin-bottom: 8pt; }
    .item-header { display: flex; justify-content: space-between; }
    .item-date { font-style: italic; color: #555; }
    .item-sub { color: #555; font-size: ${fontSize - 1}pt; }
    ul { padding-left: 14pt; margin-top: 3pt; }
    li { margin-bottom: 2pt; }
    .skill-group { margin-bottom: 3pt; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(resume.first_name)} ${escapeHtml(resume.last_name)}</h1>
    <div class="contact">
      ${[
        resume.email,
        resume.phone_number,
        resume.location,
        resume.linkedin_url,
        resume.github_url,
        resume.website,
      ]
        .filter(Boolean)
        .map(escapeHtml)
        .join(' &nbsp;|&nbsp; ')}
    </div>
    ${resume.target_role ? `<div><em>${escapeHtml(resume.target_role)}</em></div>` : ''}
  </header>
  ${sectionsHtml}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateResumePdf(resume: Resume): Promise<Buffer> {
  let b: Browser;
  try {
    b = await getBrowser();
  } catch (err) {
    logger.error('Failed to launch browser for PDF generation', { error: String(err) });
    throw new InternalError('PDF generation is temporarily unavailable');
  }

  const page = await b.newPage();
  try {
    const html = buildResumeHtml(resume);
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    logger.info('PDF generated', { resumeId: resume.id });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
