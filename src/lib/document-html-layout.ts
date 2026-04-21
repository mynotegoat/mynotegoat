/**
 * Post-processing helpers for document-template HTML. Shared between
 * the generated PDF (patient-case-file `buildPrintableDocumentHtml`)
 * and the live settings preview (document-template-settings-panel) so
 * both see the exact same label/value layout.
 *
 * The markup produced here pairs with the `.kv` / `.kv-cont` / `.kv-label`
 * / `.kv-value` CSS defined in both places. See globals.css for the
 * preview rules and patient-case-file's inline style block for the PDF.
 */

/** Strip leading whitespace from each line if the content contains HTML
 *  tags. Prevents pre-wrap from indenting AI-generated narrative HTML
 *  while leaving plain-text templates with tabs intact. */
export function stripHtmlIndentation(html: string): string {
  if (!/<[a-z][\s\S]*>/i.test(html)) return html; // plain text — keep tabs
  return html.replace(/^[ \t]+/gm, "");
}

/**
 * Rewrite `<p>Label:  value</p>` paragraphs as `<div class="kv">` rows
 * with a fixed-width label column, then re-tag subsequent orphan `<p>`
 * paragraphs as `<div class="kv-cont">` continuation rows so multi-line
 * values (like an Imaging Center's phone + address) all sit in the
 * value column instead of wrapping back to the left margin.
 */
export function applyLabelValueHangingIndent(html: string): string {
  const labelPatternSource = "[A-Z][A-Za-z0-9 ()&/\\-]*?:";

  // Defensive cleanup: strip soft-hyphens and zero-width spaces that
  // sometimes survive copy/paste from PDFs. These characters allow
  // mid-word line breaks (e.g. "s&shy;econdary" → "s | econdary")
  // — the "derangements econdary" artifact we kept seeing.
  let next = html.replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, "");

  // Phase 1: turn "Label:  value" rows into .kv rows.
  next = next.replace(
    new RegExp(
      `<p([^>]*)>\\s*(${labelPatternSource})(?:&nbsp;|\\s)+([\\s\\S]*?)<\\/p>`,
      "g",
    ),
    (_match, attrs, label, rest) => {
      return `<div class="kv"${attrs}><span class="kv-label">${label}</span><span class="kv-value">${rest.trim()}</span></div>`;
    },
  );

  // Phase 2: tag every <p> that immediately follows a .kv row or a
  // previous .kv-cont AND doesn't start with a new label as a
  // continuation. Emits <div class="kv-cont"> so the universal
  // paragraph rules don't interfere.
  const continuationRe = new RegExp(
    `(<div class="kv(?:-cont)?"[^>]*>[\\s\\S]*?<\\/div>)\\s*<p([^>]*)>(?!\\s*${labelPatternSource}(?:&nbsp;|\\s))([\\s\\S]*?)<\\/p>`,
    "g",
  );
  for (let i = 0; i < 10; i++) {
    const before = next;
    next = next.replace(continuationRe, (_match, prev, attrs, cont) => {
      return `${prev}<div class="kv-cont"${attrs}>${cont.trim()}</div>`;
    });
    if (before === next) break;
  }
  return next;
}
