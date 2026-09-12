/** Parse a DeepSeek chat/completions body. Flash may put the line in reasoning_content. */
function extractDeepseekLine(stdout) {
  const j = typeof stdout === 'string' ? JSON.parse(stdout) : stdout;
  if (j && j.error && j.error.message) {
    throw new Error(String(j.error.message).slice(0, 180));
  }
  const choice = j && j.choices && j.choices[0];
  const msg = (choice && choice.message) || {};
  let line = typeof msg.content === 'string' ? msg.content.trim() : '';
  if (line.length < 20 && typeof msg.reasoning_content === 'string') {
    const bits = msg.reasoning_content
      .trim()
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    line = bits[bits.length - 1] || '';
  }
  if (line.length < 20 && typeof choice?.text === 'string') line = choice.text.trim();
  line = line.replace(/^["']|["']$/g, '').replace(/^Motion:\s*/i, '').trim();
  return { line, finish: choice?.finish_reason || '', contentLen: (msg.content || '').length, reasoningLen: (msg.reasoning_content || '').length };
}

module.exports = { extractDeepseekLine };
