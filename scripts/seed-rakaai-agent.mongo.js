// Idempotent seed for local RakaAI agents.
// Usage: docker exec -i chat-mongodb mongosh LibreChat --quiet < scripts/seed-rakaai-agent.mongo.js
//
// The main agent keeps file_search + gated image gen, plus the files MCP pack.
// Other packs are separate agents so qwen2.5:7b is not given every tool at once.
// Do not mention prompt/keyword schemas in instructions — a 7B model will copy them.

const now = new Date();
const user = db.users.findOne({ email: 'raju@sulus.ai' }) || db.users.findOne({ role: 'ADMIN' });
if (!user) {
  print('No admin user found; skip agent seed.');
  quit(0);
}

function baseVersion(overrides) {
  return Object.assign(
    {
      artifacts: '',
      tools: [],
      tool_kwargs: [],
      tool_options: {},
      model_parameters: {},
      conversation_starters: [],
      category: 'general',
      support_contact: { name: '', email: '' },
      is_promoted: false,
      mcpServerNames: [],
      subagents: { enabled: false, allowSelf: false, agent_ids: [] },
      memory_scope: 'user',
      stateful_code_sessions: false,
      stateful_code_environment: 'user',
      agent_ids: [],
      edges: [],
      end_after_tools: false,
      hide_sequential_outputs: false,
      provider: 'RakaAI',
      model: 'qwen2.5:7b',
    },
    overrides,
  );
}

function upsertAgent(id, version, label) {
  const existing = db.agents.findOne({ id });
  if (existing) {
    const same =
      JSON.stringify(existing.tools || []) === JSON.stringify(version.tools) &&
      JSON.stringify(existing.mcpServerNames || []) === JSON.stringify(version.mcpServerNames) &&
      existing.instructions === version.instructions &&
      existing.description === version.description &&
      existing.artifacts === version.artifacts &&
      Boolean(existing.stateful_code_sessions) === Boolean(version.stateful_code_sessions);
    if (same) {
      print(`Agent ${id} already synced (${label}).`);
      return;
    }

    db.agents.updateOne(
      { id },
      {
        $set: {
          ...version,
          updatedAt: now,
        },
        $push: {
          versions: { ...version, createdAt: now, updatedAt: now },
        },
      },
    );
    print(`Updated ${id}: ${label}.`);
    return;
  }

  const agentOid = ObjectId();
  db.agents.insertOne({
    _id: agentOid,
    id,
    author: user._id,
    ...version,
    versions: [{ ...version, createdAt: now, updatedAt: now }],
    createdAt: now,
    updatedAt: now,
  });

  const agentOwner = db.accessroles.findOne({ accessRoleId: 'agent_owner' });
  const remoteOwner = db.accessroles.findOne({ accessRoleId: 'remoteAgent_owner' });
  if (agentOwner) {
    db.aclentries.insertOne({
      resourceType: 'agent',
      principalModel: 'User',
      principalType: 'user',
      resourceId: agentOid,
      principalId: user._id,
      grantedBy: user._id,
      grantedAt: now,
      permBits: agentOwner.permBits,
      roleId: agentOwner._id,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (remoteOwner) {
    db.aclentries.insertOne({
      resourceType: 'remoteAgent',
      principalModel: 'User',
      principalType: 'user',
      resourceId: agentOid,
      principalId: user._id,
      grantedBy: user._id,
      grantedAt: now,
      permBits: remoteOwner.permBits,
      roleId: remoteOwner._id,
      createdAt: now,
      updatedAt: now,
    });
  }

  print(`Created ${id} for ${user.email}`);
}

upsertAgent(
  'agent_rakaai_local',
  baseVersion({
    name: 'RakaAI',
    description: 'RakaAI. Local assistant for uploaded files, the Documents/RakaAI folder, and images when asked. Authored by RakaAI.',
    instructions: [
      'You are RakaAI. Answer the user in plain sentences.',
      '',
      'Use file_search for documents the user uploaded in chat. Use the files tools for the Documents/RakaAI folder on this Mac.',
      'Use file_search only when the answer is not already in this conversation. Earlier file_search passages stay in the thread — do not search again unless the user asks about something those passages do not cover.',
      '',
      'Rules:',
      '- After a tool result, answer the question. Do not list keywords.',
      '- Do not output JSON, prompt objects, or comma-separated keyword lists.',
      '- If the files do not contain the answer, say so.',
      '- Do not invent facts.',
      '- You cannot search the web. Do not claim that you did.',
    ].join('\n'),
    artifacts: 'default',
    tools: ['file_search', 'stable-diffusion'],
    mcpServerNames: ['RakaAI-Files'],
    conversation_starters: [
      'Search my uploaded files for the latest decision.',
      'List the files in my RakaAI folder.',
      'Generate an image of a quiet river at dusk.',
    ],
  }),
  'file_search + files MCP + gated image gen',
);

upsertAgent(
  'agent_rakaai_apps',
  baseVersion({
    name: 'RakaAI-Apps',
    description: 'RakaAI-Apps. Looks up Slack people and channels, sends Slack as you, and triggers webhooks. Authored by RakaAI.',
    instructions: [
      'You are RakaAI Apps. Answer in plain sentences.',
      'Slack messages are sent as the user, not as a bot. Wait for approval on slack_send_message.',
      'If you only have a name, call slack_search_users first, then send with the user id or that name.',
      'Write @name in the message to mention that person. Do not use @here, @channel, or @everyone.',
      'For channels, use a #channel name or call slack_list_channels first.',
      'Call list_hooks before trigger_hook if you do not already know the hook id.',
      'Call one tool, then wait. After a tool result, tell the user what happened.',
      'Do not invent hook ids. Do not output JSON unless the user asked for it.',
    ].join('\n'),
    mcpServerNames: ['RakaAI-Apps'],
    conversation_starters: [
      'Who is in Slack named Ada?',
      'Send a Slack message to #general saying the deploy finished.',
    ],
  }),
  'apps MCP',
);

upsertAgent(
  'agent_rakaai_browser',
  baseVersion({
    name: 'RakaAI-Browser',
    description: 'RakaAI-Browser. Opens JavaScript-rendered pages on this Mac through the isolated device browser. Authored by RakaAI.',
    instructions: [
      'You are RakaAI Browser. Answer in plain sentences.',
      'Open a page before you read it, click it, or capture it. One tool per turn.',
      'Pages may take a few seconds to finish Cloudflare or JavaScript rendering.',
      'After a tool result, summarize what you see. Do not output JSON.',
    ].join('\n'),
    mcpServerNames: ['RakaAI-Browser'],
    conversation_starters: ['Open example.com and tell me what it says.'],
  }),
  'browser MCP',
);

upsertAgent(
  'agent_rakaai_shell',
  baseVersion({
    name: 'RakaAI-Shell',
    description: 'RakaAI-Shell. Runs allowlisted commands in the Documents/RakaAI folder. Approval is required. Authored by RakaAI.',
    instructions: [
      'You are RakaAI Shell. Answer in plain sentences.',
      'Run one simple program at a time. No pipes, no sudo, no destructive flags.',
      'Wait for approval. After the result, explain the output. Do not output JSON.',
    ].join('\n'),
    mcpServerNames: ['RakaAI-Shell'],
    conversation_starters: ['List the files in the allowed folder.'],
  }),
  'shell MCP',
);

upsertAgent(
  'agent_rakaai_code',
  baseVersion({
    name: 'RakaAI-Code',
    description: 'RakaAI-Code. Runs Python and other languages in the local Code Interpreter sandbox. Authored by RakaAI.',
    instructions: [
      'You are RakaAI Code. Answer in plain sentences.',
      'Use execute_code when the user asks you to run, check, plot, or transform data with code.',
      'After a tool result, explain the output. Do not output JSON unless the user asked for it.',
      'If code fails, read the error and try once more with a smaller program.',
    ].join('\n'),
    tools: ['execute_code'],
    stateful_code_sessions: false,
    stateful_code_environment: 'user',
    conversation_starters: [
      'Run a Python snippet that prints 2 + 2.',
      'Plot a simple sine wave and save it as an image.',
    ],
  }),
  'code interpreter',
);

upsertAgent(
  'agent_rakaai_desktop',
  baseVersion({
    name: 'RakaAI-Desktop',
    description: 'RakaAI-Desktop. Opens Mac apps, clicks menus, presses shortcuts, types, and captures the screen. Approval is required every time. Authored by RakaAI.',
    instructions: [
      'You are RakaAI Desktop. Answer in plain sentences.',
      'Open the app first if it is not already open. Then do one action: a menu path such as File > New, a shortcut such as command+n, or typing.',
      'Do one action per turn and wait for approval. Then say what happened.',
      'Do not claim you clicked, typed, or pressed keys unless a tool result says so.',
    ].join('\n'),
    mcpServerNames: ['RakaAI-Desktop'],
    conversation_starters: ['What apps are open?', 'Open Calendar.', 'In Calendar, use File > New Event.'],
  }),
  'desktop MCP',
);
