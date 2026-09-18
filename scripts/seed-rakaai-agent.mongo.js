// Idempotent seed for the local RakaAI agent (file_search + gated image gen).
// Usage: docker exec -i chat-mongodb mongosh LibreChat --quiet < scripts/seed-rakaai-agent.mongo.js
//
// Image tools stay on the agent, but initializeAgent hides them unless the
// current message asks for an image (`endpoints.agents.requireExplicitImageRequest`).
// Do not mention prompt/keyword schemas in instructions — a 7B model will copy them.

const AGENT_ID = 'agent_rakaai_local';
const now = new Date();

const user = db.users.findOne({ email: 'raju@sulus.ai' }) || db.users.findOne({ role: 'ADMIN' });
if (!user) {
  print('No admin user found; skip agent seed.');
  quit(0);
}

const instructions = [
  'You are RakaAI. Answer the user in plain sentences.',
  '',
  'Use file_search only when the answer is not already in this conversation. Earlier file_search passages stay in the thread — follow-up questions about the same person or document must use those passages. Do not search again unless the user asks about something those passages do not cover.',
  '',
  'Rules:',
  '- After file_search, answer the question. Do not list keywords.',
  '- Do not output JSON, prompt objects, or comma-separated keyword lists.',
  '- If the passages do not contain the answer, say you could not find it in the files.',
  '- Do not invent facts that are not in the passages or the conversation.',
  '- You cannot search the web. Do not claim that you did.',
].join('\n');

const version = {
  name: 'RakaAI',
  description: 'Local assistant that answers from uploaded files and can generate images when asked.',
  instructions,
  provider: 'RakaAI',
  model: 'qwen2.5:7b',
  artifacts: '',
  tools: ['file_search', 'stable-diffusion'],
  tool_kwargs: [],
  tool_options: {},
  model_parameters: {},
  conversation_starters: [
    'Search my uploaded files for the latest decision.',
    'Generate an image of a quiet river at dusk.',
  ],
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
};

const existing = db.agents.findOne({ id: AGENT_ID });
if (existing) {
  const sameTools =
    JSON.stringify(existing.tools || []) === JSON.stringify(version.tools) &&
    JSON.stringify(existing.mcpServerNames || []) === JSON.stringify(version.mcpServerNames) &&
    existing.instructions === version.instructions &&
    existing.description === version.description;
  if (sameTools) {
    print(`Agent ${AGENT_ID} already synced (file_search + gated image gen).`);
    quit(0);
  }

  db.agents.updateOne(
    { id: AGENT_ID },
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
  print(`Updated ${AGENT_ID}: file_search + gated stable-diffusion.`);
  quit(0);
}

const agentOid = ObjectId();
db.agents.insertOne({
  _id: agentOid,
  id: AGENT_ID,
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

print(`Created ${AGENT_ID} for ${user.email}`);
