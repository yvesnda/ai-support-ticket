const { getClient } = require('./client');
const aiTools = require('../../models/aiTools');
const settingsModel = require('../../models/settings');
const { runHttpTool } = require('./tools/httpTool');
const { runJsTool } = require('./tools/jsTool');

const MAX_TOOL_ITERATIONS = 5;

const CLOSE_TICKET_TOOL = 'close_ticket';

const BUILTIN_TOOLS = [
  {
    type: 'function',
    function: {
      name: CLOSE_TICKET_TOOL,
      description:
        "Marks this ticket as closed because the customer's issue is fully resolved and no further reply is expected — e.g. they confirmed the problem is fixed, or you have completely answered their question. Do not call this if you're asking the customer something, still gathering information, or at all unsure whether they need more help.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

function toOpenAiTools(rows) {
  return rows.map((row) => ({
    type: 'function',
    function: {
      name: row.name,
      description: row.description || '',
      parameters: JSON.parse(row.schema_json || '{"type":"object","properties":{}}'),
    },
  }));
}

async function dispatchTool(row, args) {
  const config = JSON.parse(row.config_json || '{}');
  if (row.type === 'http') return runHttpTool(config, args);
  if (row.type === 'js') return runJsTool(config, args);
  throw new Error(`Unknown tool type: ${row.type}`);
}

// Full ticket history, in order, attributed by role so the model always sees
// the whole conversation (customer messages, prior sent AI replies, and
// supporter replies) rather than just the latest message.
function messagesToConversation(messages) {
  const convo = [];
  for (const m of messages) {
    if (m.sender_type === 'customer') {
      convo.push({ role: 'user', content: m.body });
    } else if ((m.sender_type === 'ai' || m.sender_type === 'supporter') && !m.is_ai_draft) {
      convo.push({ role: 'assistant', content: m.body });
    }
    // system messages and not-yet-sent AI drafts carry nothing the customer
    // has seen, so they're not part of the conversation the model reasons over.
  }
  return convo;
}

// Drafts an AI reply for a ticket given its message history. Always returns
// { reply, closed }: reply is the drafted text (or null if AI is disabled /
// unconfigured / it fails), closed is true if the model decided — via the
// close_ticket tool — that this ticket needs no further reply.
async function draftReply(ticket, messages) {
  const enabled = settingsModel.get('ai_enabled') === 'true';
  const client = getClient();
  if (!enabled || !client) return { reply: null, closed: false };

  const systemPrompt = settingsModel.get('ai_system_prompt');
  const model = settingsModel.get('ai_model');
  const toolRows = aiTools.listEnabled();
  const tools = [...BUILTIN_TOOLS, ...toOpenAiTools(toolRows)];
  const toolsByName = new Map(toolRows.map((r) => [r.name, r]));

  const conversation = [
    {
      role: 'system',
      content: `${systemPrompt}\n\nTicket subject: ${ticket.subject}\nCustomer: ${ticket.customer_name} <${ticket.customer_email}>`,
    },
    ...messagesToConversation(messages),
  ];

  let closed = false;

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.chat.completions.create({
        model,
        messages: conversation,
        tools: tools.length ? tools : undefined,
      });

      const choice = response.choices[0];
      const msg = choice.message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return { reply: msg.content ? msg.content.trim() : null, closed };
      }

      conversation.push(msg);

      for (const call of msg.tool_calls) {
        if (call.function.name === CLOSE_TICKET_TOOL) {
          closed = true;
          conversation.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ ok: true }) });
          continue;
        }

        const row = toolsByName.get(call.function.name);
        let result;
        try {
          const args = JSON.parse(call.function.arguments || '{}');
          result = row ? await dispatchTool(row, args) : { error: `Unknown tool ${call.function.name}` };
        } catch (err) {
          result = { error: err.message };
        }
        conversation.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
    return { reply: null, closed };
  } catch (err) {
    console.error('[ai] draftReply failed:', err.message);
    return { reply: null, closed: false };
  }
}

module.exports = { draftReply, CLOSE_TICKET_TOOL };
