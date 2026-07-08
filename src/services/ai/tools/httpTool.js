// Executes a config-driven HTTP tool call. No code execution: only string
// substitution of {{param}} placeholders pulled from the model's tool-call arguments.

function substitute(template, args) {
  if (typeof template !== 'string') return template;
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => (key in args ? String(args[key]) : ''));
}

function substituteDeep(value, args) {
  if (typeof value === 'string') return substitute(value, args);
  if (Array.isArray(value)) return value.map((v) => substituteDeep(v, args));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = substituteDeep(v, args);
    return out;
  }
  return value;
}

async function runHttpTool(config, args) {
  const method = (config.method || 'GET').toUpperCase();
  const url = substitute(config.url, args);
  const headers = substituteDeep(config.headers || {}, args);

  const init = { method, headers };
  if (config.body !== undefined && method !== 'GET' && method !== 'HEAD') {
    const body = substituteDeep(config.body, args);
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
    if (!headers['Content-Type'] && !headers['content-type']) {
      init.headers = { ...headers, 'Content-Type': 'application/json' };
    }
  }

  const res = await fetch(url, init);
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

module.exports = { runHttpTool };
