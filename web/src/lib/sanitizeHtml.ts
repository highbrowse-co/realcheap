// content.disclaimer_html comes from XCover's CMS, not user input, but it's
// still an external string rendered via dangerouslySetInnerHTML — this drops
// every tag except a small formatting allowlist and strips all attributes
// unconditionally (no href/src/on* survives), rather than pulling in a real
// sanitizer library for one field. Not a general-purpose HTML sanitizer.
const ALLOWED_TAGS = new Set(["p", "br", "b", "i", "strong", "em", "ul", "ol", "li"]);

export function sanitizeHtml(html: string): string {
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag: string) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return "";
    return match.startsWith("</") ? `</${lower}>` : `<${lower}>`;
  });
}
