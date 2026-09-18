// Idempotent seed for the local RakaAI agent (file_search + stable-diffusion).
// Usage: docker exec -i chat-mongodb mongosh LibreChat --quiet < scripts/seed-rakaai-agent.mongo.js

const AGENT_ID = 'agent_rakaai_local';
const now = new Date();

const user = db.users.findOne({ email: 'raju@sulus.ai' }) || db.users.findOne({ role: 'ADMIN' });
if (!user) {
  print('No admin user found; skip agent seed.');
  quit(0);
}

const existing = db.agents.findOne({ id: AGENT_ID });
if (existing) {
  const tools = existing.tools || [];
  const needed = ['file_search', 'stable-diffusion'];
  const missing = needed.filter((tool) => !tools.includes(tool));
  if (missing.length === 0) {
    print(`Agent ${AGENT_ID} already has file_search and stable-diffusion.`);
    quit(0);
  }
  db.agents.updateOne(
    { id: AGENT_ID },
    { $addToSet: { tools: { $each: needed } }, $set: { updatedAt: now } },
  );
  print(`Updated ${AGENT_ID} tools: ${missing.join(', ')}`);
  quit(0);
}

const agentOid = ObjectId();
const version = {
  name: 'RakaAI',
  description: 'Local assistant: search uploaded files and generate images with Flux.',
  instructions:
    'You are RakaAI, a local assistant on this Mac.\n\nUse file_search when the user asks about uploaded documents or files attached to this conversation or agent.\nUse stable-diffusion only when the user asks to generate an image. Write a clear visual prompt.\n\nYou do not have web search. Do not claim you looked something up online.',
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
  createdAt: now,
  updatedAt: now,
};

db.agents.insertOne({
  _id: agentOid,
  id: AGENT_ID,
  author: user._id,
  ...version,
  versions: [version],
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
