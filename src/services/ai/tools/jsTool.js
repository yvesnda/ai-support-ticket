const vm = require('node:vm');

// Runs an admin-authored JS snippet as the body of an async function: `args` is
// the tool-call arguments object, `fetch` is available for outbound calls, and
// the snippet should `return` its result.
//
// SECURITY NOTE: Node's vm module is NOT a real security boundary (it does not
// protect against e.g. prototype-pollution based sandbox escapes). Only let
// trusted admins define JS tools — treat this the same as giving someone
// server-side code execution, because it is.

async function runJsTool(config, args) {
  const code = config.code || '';
  const wrapped = `(async function (args, fetch) {\n${code}\n})`;

  const script = new vm.Script(wrapped, { filename: 'ai-tool.js' });
  const context = vm.createContext({});
  const fn = script.runInContext(context, { timeout: 3000 });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Tool execution timed out')), 3000)
  );

  return Promise.race([fn(args, fetch), timeoutPromise]);
}

module.exports = { runJsTool };
