/* global db, quit, ObjectId */
// Idempotent seed for local Sulus Personal AI agents.
// Usage: docker exec -i chat-mongodb mongosh LibreChat --quiet < scripts/seed-sulus-agent.mongo.js
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

// Prior local brand used agent_rakaai_* ids and RakaAI-* MCP packs.
const LEGACY_AGENT_IDS = {
  agent_rakaai_local: 'agent_sulus_local',
  agent_rakaai_apps: 'agent_sulus_apps',
  agent_rakaai_browser: 'agent_sulus_browser',
  agent_rakaai_shell: 'agent_sulus_shell',
  agent_rakaai_code: 'agent_sulus_code',
  agent_rakaai_desktop: 'agent_sulus_desktop',
  agent_rakaai_calendar: 'agent_sulus_calendar',
};

for (const [legacyId, nextId] of Object.entries(LEGACY_AGENT_IDS)) {
  const legacy = db.agents.findOne({ id: legacyId });
  if (!legacy) {
    continue;
  }
  if (!db.agents.findOne({ id: nextId })) {
    db.agents.updateOne({ id: legacyId }, { $set: { id: nextId, updatedAt: now } });
    print(`Renamed ${legacyId} -> ${nextId}.`);
  } else {
    db.agents.deleteOne({ id: legacyId });
    print(`Removed duplicate legacy agent ${legacyId}.`);
  }
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
      provider: 'Ollama',
      model: 'qwen2.5:7b',
    },
    overrides,
  );
}

function upsertAgent(id, version, label) {
  const existing = db.agents.findOne({ id });
  if (existing) {
    const same =
      existing.name === version.name &&
      existing.provider === version.provider &&
      JSON.stringify(existing.tools || []) === JSON.stringify(version.tools) &&
      JSON.stringify(existing.mcpServerNames || []) === JSON.stringify(version.mcpServerNames) &&
      existing.instructions === version.instructions &&
      existing.description === version.description &&
      existing.artifacts === version.artifacts &&
      existing.model === version.model &&
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
  'agent_sulus_local',
  baseVersion({
    name: 'Sulus Personal AI',
    description:
      'Sulus Personal AI. Local assistant for uploaded files, files anywhere on this Mac, and images when asked. Authored by Sulus Personal AI.',
    instructions: [
      'You are Sulus Personal AI. Answer the user in plain sentences.',
      '',
      'Use file_search for documents the user uploaded in chat. Use the files tools to list, find, search, or read any path on this Mac. Absolute paths and ~/... work; a relative path is under the default Documents/SulusPersonalAI folder.',
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
    mcpServerNames: ['Sulus-Files'],
    conversation_starters: [
      'Search my uploaded files for the latest decision.',
      'Find invoices in Downloads.',
      'Search my SulusPersonalAI folder for the word invoice.',
      'Generate an image of a quiet river at dusk.',
    ],
  }),
  'file_search + files MCP + gated image gen',
);

upsertAgent(
  'agent_sulus_apps',
  baseVersion({
    name: 'Sulus-Apps',
    description:
      'Sulus-Apps. Looks up Slack people and channels, reads recent Slack, sends Slack as you, and triggers webhooks. Authored by Sulus Personal AI.',
    instructions: [
      'You are Sulus Personal AI Apps. Answer in plain sentences.',
      'Slack messages are sent as the user, not as a bot. Wait for approval on slack_send_message.',
      'Use slack_read_messages to read a #channel or a person. If you only have a name, call slack_search_users first, then send or read with the user id or that name.',
      'Write @name in the message to mention that person. Do not use @here, @channel, or @everyone.',
      'To reply in a thread, pass the message ts as thread on slack_send_message.',
      'For channels, use a #channel name or call slack_list_channels first.',
      'Call list_hooks before trigger_hook if you do not already know the hook id.',
      'Call one tool, then wait. After a tool result, tell the user what happened.',
      'Do not invent hook ids. Do not output JSON unless the user asked for it.',
    ].join('\n'),
    mcpServerNames: ['Sulus-Apps'],
    conversation_starters: [
      'Who is in Slack named Ada?',
      'What was just said in #general?',
      'Send a Slack message to #general saying the deploy finished.',
    ],
  }),
  'apps MCP',
);

upsertAgent(
  'agent_sulus_browser',
  baseVersion({
    name: 'Sulus-Browser',
    description:
      'Sulus-Browser. Opens JavaScript-rendered pages on this Mac through the isolated device browser. Authored by Sulus Personal AI.',
    instructions: [
      'You are Sulus Personal AI Browser. Answer in plain sentences.',
      'Open a page before you read it, list links, click, fill a field, or capture it. One tool per turn.',
      'Pages may take a few seconds to finish Cloudflare or JavaScript rendering.',
      'After a tool result, summarize what you see. Do not output JSON.',
    ].join('\n'),
    mcpServerNames: ['Sulus-Browser'],
    conversation_starters: ['Open example.com and tell me what it says.'],
  }),
  'browser MCP',
);

upsertAgent(
  'agent_sulus_shell',
  baseVersion({
    name: 'Sulus-Shell',
    description:
      'Sulus-Shell. Runs allowlisted commands in the Documents/SulusPersonalAI folder. Approval is required. Authored by Sulus Personal AI.',
    instructions: [
      'You are Sulus Personal AI Shell. Answer in plain sentences.',
      'Run one simple program at a time. No pipes, no sudo, no destructive flags.',
      'Wait for approval. After the result, explain the output. Do not output JSON.',
    ].join('\n'),
    mcpServerNames: ['Sulus-Shell'],
    conversation_starters: ['List the files in the allowed folder.'],
  }),
  'shell MCP',
);

upsertAgent(
  'agent_sulus_code',
  baseVersion({
    name: 'Sulus-Code',
    description:
      'Sulus-Code. Runs Python and other languages in the local Code Interpreter sandbox. Authored by Sulus Personal AI.',
    instructions: [
      'You are Sulus Personal AI Code. Answer in plain sentences.',
      'When the user wants code run, call the bash_tool function on the first turn. Never print the tool call as JSON or markdown.',
      "Put the program in command, for example: python3 -c 'print(2+2)'",
      'After the tool result, explain the real stdout. Do not invent output.',
      'If the command fails, try once more with a simpler command.',
    ].join('\n'),
    tools: ['execute_code'],
    model: 'llama3.1:8b',
    model_parameters: { temperature: 0 },
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
  'agent_sulus_desktop',
  baseVersion({
    name: 'Sulus-Desktop',
    description:
      'Sulus-Desktop. Opens Mac apps or files, reads and writes the clipboard, clicks menus, presses shortcuts, types, and captures the screen. Approval is required every time. Authored by Sulus Personal AI.',
    instructions: [
      'You are Sulus Personal AI Desktop. Answer in plain sentences.',
      'Open the app first if it is not already open. Then do one action: a menu path such as File > New, a shortcut such as command+n, typing, clipboard, or open_item for a URL or file.',
      'Do one action per turn and wait for approval. Then say what happened.',
      'Do not claim you clicked, typed, or pressed keys unless a tool result says so.',
    ].join('\n'),
    mcpServerNames: ['Sulus-Desktop'],
    conversation_starters: [
      'What apps are open?',
      'What is on my clipboard?',
      'Open https://example.com in Safari.',
    ],
  }),
  'desktop MCP',
);

upsertAgent(
  'agent_sulus_calendar',
  baseVersion({
    name: 'Sulus-Calendar',
    description:
      'Sulus-Calendar. Lists and creates Calendar events and Reminders on this Mac. Authored by Sulus Personal AI.',
    instructions: [
      'You are Sulus Personal AI Calendar. Answer in plain sentences.',
      'Use list_events for today, tomorrow, or a YYYY-MM-DD date. Use list_reminders for unfinished reminders.',
      'create_event and add_reminder wait for approval. start looks like 2026-09-19 15:00.',
      'Call one tool, then wait. After a tool result, tell the user what you found or created.',
      'Do not invent events. Do not output JSON.',
    ].join('\n'),
    mcpServerNames: ['Sulus-Calendar'],
    conversation_starters: [
      'What is on my calendar today?',
      'What reminders are open?',
      'Add a reminder to buy milk.',
    ],
  }),
  'calendar MCP',
);
