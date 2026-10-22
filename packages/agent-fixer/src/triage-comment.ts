export interface TriageDecision {
  strategy: 'B' | 'C' | 'none';
  failing_step?: string;
  playbook_section?: string;
  files?: string;
  risk?: string;
  confidence?: number;
  dependabot_pr?: string;
  notes?: string;
}

/** Reads one `key: value` line; returns undefined when the line is not a key. */
function parseKeyLine(raw: string): { key: string; value: string } | undefined {
  const colon = raw.indexOf(':');
  const key = colon === -1 ? '' : raw.slice(0, colon);
  if (!key || !/^[a-z_]+$/.test(key)) return undefined;
  const value = raw.slice(colon + 1).trim();
  const hash = value.indexOf(' #');
  const cleaned = (hash === -1 ? value : value.slice(0, hash)).trim();
  return { key, value: cleaned === '|' ? '' : cleaned };
}

function isContinuation(raw: string): boolean {
  return (raw.startsWith(' ') || raw.startsWith('\t')) && raw.trim() !== '';
}

/** Parses the `<!-- triage -->` comment body written by agent-triage (simple `key: value` lines). */
export function parseTriageComment(body: string): TriageDecision | undefined {
  if (!body.includes('<!-- triage -->')) return undefined;
  const entries: Record<string, string> = {};
  let currentKey: string | undefined;
  for (const raw of body.split('\n')) {
    if (raw.startsWith('<!--') || raw.trim() === '```') continue;
    const line = parseKeyLine(raw);
    if (line) {
      currentKey = line.key;
      entries[currentKey] = line.value;
    } else if (currentKey && isContinuation(raw)) {
      entries[currentKey] = `${entries[currentKey]}${entries[currentKey] ? '\n' : ''}${raw.trim()}`;
    }
  }
  return toDecision(entries);
}

function toDecision(entries: Record<string, string>): TriageDecision {
  const strategy = entries.strategy === 'B' || entries.strategy === 'C' ? entries.strategy : 'none';
  const confidence = Number(entries.confidence);
  return {
    strategy,
    failing_step: entries.failing_step || undefined,
    playbook_section: entries.playbook_section || undefined,
    files: entries.files || undefined,
    risk: entries.risk || undefined,
    confidence: Number.isNaN(confidence) ? undefined : confidence,
    dependabot_pr: entries.dependabot_pr || undefined,
    notes: entries.notes || undefined,
  };
}
