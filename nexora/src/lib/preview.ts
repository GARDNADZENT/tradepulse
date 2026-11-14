import type { WebsiteFiles } from './schema';
/** Run only inside an opaque-origin sandboxed iframe; no network access in preview. */
export function previewDocument(files: WebsiteFiles): string {
  const css = files['styles.css'].replace(/<\/style/gi, '<\\/style');
  const js = files['app.js'].replace(/<\/script/gi, '<\\/script');
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  return `${policy}<style>${css}</style>${files['index.html']}<script>${js}</script>`;
}
