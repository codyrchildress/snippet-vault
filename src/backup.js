/* ══════════════════════════════════════════
   BACKUP — export / import of the vault as JSON
   Pure functions: no storage or DOM access, so they work on the
   in-memory snippet list whatever the storage layer does.
   ══════════════════════════════════════════ */
export const BACKUP_FORMAT = "snippet-vault-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

const CATEGORY_IDS = ["code", "prompt"];

function collectTags(blocks) {
  const s = new Set();
  blocks.forEach(b => (b.tags || []).forEach(t => s.add(t)));
  return [...s].sort();
}

export function buildBackup(blocks) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tags: collectTags(blocks),
    snippets: blocks,
  };
}

export function backupFileName(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `snippet-vault-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

function validateSnippet(raw, index, languageIds, now) {
  const where = `Snippet ${index + 1}`;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${where} is not an object.`);
  if (typeof raw.content !== "string" || !raw.content.trim()) throw new Error(`${where} has no content.`);
  if (raw.title !== undefined && typeof raw.title !== "string") throw new Error(`${where} has a title that is not text.`);
  if (raw.id !== undefined && (typeof raw.id !== "string" || !raw.id)) throw new Error(`${where} has an invalid id.`);
  if (!CATEGORY_IDS.includes(raw.category)) throw new Error(`${where} has an unknown category "${raw.category}".`);
  if (raw.tags !== undefined && (!Array.isArray(raw.tags) || raw.tags.some(t => typeof t !== "string"))) {
    throw new Error(`${where} has tags that are not a list of text.`);
  }
  for (const k of ["createdAt", "updatedAt"]) {
    if (raw[k] !== undefined && !Number.isFinite(raw[k])) throw new Error(`${where} has an invalid ${k}.`);
  }

  const tags = [...new Set((raw.tags || []).map(t => t.trim()).filter(Boolean))];
  const createdAt = raw.createdAt ?? raw.updatedAt ?? now;
  return {
    id: raw.id,
    title: (raw.title || "").trim() || "Untitled",
    content: raw.content,
    category: raw.category,
    language: raw.category === "code" ? (languageIds.includes(raw.language) ? raw.language : "other") : undefined,
    tags,
    createdAt,
    updatedAt: raw.updatedAt ?? createdAt,
  };
}

/* Parses and validates backup file text. Accepts a backup object or a bare
   snippet array (the raw localStorage format). Throws an Error with a
   user-readable message on anything invalid. */
export function parseBackup(text, { languageIds, makeId }) {
  if (typeof text !== "string" || !text.trim()) throw new Error("The file is empty.");
  if (text.length > MAX_BACKUP_BYTES) throw new Error("The file is too large to be a snippet vault backup.");

  let data;
  try { data = JSON.parse(text); } catch { throw new Error("The file is not valid JSON."); }

  let list;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object" && data.format === BACKUP_FORMAT) {
    if (!Number.isInteger(data.version) || data.version > BACKUP_VERSION) {
      throw new Error(`This backup is version ${data.version}; this app reads up to version ${BACKUP_VERSION}.`);
    }
    if (!Array.isArray(data.snippets)) throw new Error("The backup has no snippet list.");
    list = data.snippets;
  } else {
    throw new Error("The file is not a snippet vault backup.");
  }

  const now = Date.now();
  const seen = new Set();
  return list.map((raw, i) => {
    const s = validateSnippet(raw, i, languageIds, now);
    if (!s.id || seen.has(s.id)) s.id = makeId();
    seen.add(s.id);
    return s;
  });
}

/* Merges imported snippets into the current list by id. A snippet present in
   both keeps whichever copy was updated most recently. */
export function mergeSnippets(current, incoming) {
  const byId = new Map(incoming.map(s => [s.id, s]));
  let updated = 0;
  const merged = current.map(b => {
    const s = byId.get(b.id);
    if (!s) return b;
    byId.delete(b.id);
    if ((s.updatedAt || 0) > (b.updatedAt || 0)) { updated++; return s; }
    return b;
  });
  const added = [...byId.values()];
  return {
    snippets: [...added, ...merged],
    added: added.length,
    updated,
    unchanged: incoming.length - added.length - updated,
  };
}
