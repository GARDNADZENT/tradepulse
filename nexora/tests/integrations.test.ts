import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proposeWebsite } from '../src/lib/ai';
import { createStaticDeployment, getVercelDeployment, safeVercelUrl } from '../src/lib/vercel';

const files = { 'index.html': '<h1>Hello</h1>', 'styles.css': '', 'app.js': '' };

test('AI sends existing project context to the configured provider and validates the proposal', async () => {
  const priorFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-secret';
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/chat/completions');
      const payload = JSON.parse(String(init?.body));
      assert.equal(JSON.parse(payload.messages[1].content).currentFiles['index.html'], '<h1>Hello</h1>');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({summary: 'Updated', files}) } }] }), { status: 200 });
    };
    assert.deepEqual(await proposeWebsite('Change the heading', files), {summary:'Updated', files});
    globalThis.fetch = async () => new Response(JSON.stringify({choices:[{message:{content:'{"unsafe":true}'}}]}), { status:200 });
    await assert.rejects(() => proposeWebsite('Change the heading', files), /invalid project/);
  } finally { globalThis.fetch = priorFetch; delete process.env.OPENAI_API_KEY; }
});

test('Vercel integration submits only static project files and does not trust arbitrary URLs', async () => {
  const priorFetch = globalThis.fetch; process.env.VERCEL_API_TOKEN = 'test-secret';
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://api.vercel.com/v13/deployments');
      const payload = JSON.parse(String(init?.body));
      assert.deepEqual(payload.files.map((f: {file:string}) => f.file), ['index.html','styles.css','app.js']);
      assert.equal(payload.projectSettings.framework, null);
      assert.equal(JSON.stringify(payload).includes('test-secret'), false);
      return new Response(JSON.stringify({id:'dpl_abc123', readyState:'BUILDING'}), { status:200 });
    };
    const result = await createStaticDeployment('3d6c32dc-42c6-400a-8340-c43d71d6b3d0', files);
    assert.equal(result.readyState, 'BUILDING');
    await assert.rejects(() => getVercelDeployment('../bad'), /Invalid deployment id/);
    assert.equal(safeVercelUrl('demo.vercel.app'), 'https://demo.vercel.app');
    assert.equal(safeVercelUrl('demo.vercel.app.evil.com'), null);
  } finally { globalThis.fetch = priorFetch; delete process.env.VERCEL_API_TOKEN; }
});
