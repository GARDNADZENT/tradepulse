import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectSchema, fileSchema, generatedSchema, promptSchema } from '../src/lib/schema.ts';
import { previewDocument } from '../src/lib/preview.ts';

test('project requests require bounded, valid names', () => {
  assert.equal(createProjectSchema.safeParse({name:'   '}).success, false);
  assert.equal(createProjectSchema.safeParse({name:'A'.repeat(81)}).success, false);
  assert.equal(createProjectSchema.safeParse({name:' My site '}).data?.name, 'My site');
});
test('generated sites accept only three bounded static files', () => {
  const files = {'index.html':'<h1>Hello</h1>', 'styles.css':'', 'app.js':''};
  assert.equal(generatedSchema.safeParse({summary:'Done',files}).success, true);
  assert.equal(fileSchema.safeParse({...files, 'server.js':'do not execute'}).success, false);
  assert.equal(fileSchema.safeParse({...files, 'app.js':'a'.repeat(100001)}).success, false);
  assert.equal(promptSchema.safeParse({prompt:'a'.repeat(4001)}).success, false);
});
test('preview restricts network and prevents stylesheet or script closing-tag escapes', () => {
  const html = previewDocument({'index.html':'<h1>Preview</h1>', 'styles.css':'</style><script>x</script>', 'app.js':'</script><script>bad()</script>'});
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.ok(html.includes('<\\/style>'));
  assert.ok(html.includes('<\\/script>'));
});
