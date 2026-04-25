import { useState, useEffect, useCallback, useRef, useMemo, Component } from "react";

/* ══════════════════════════════════════════
   ERROR BOUNDARY
   ══════════════════════════════════════════ */
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#080b12", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'JetBrains Mono', monospace" }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 16, opacity: 0.5 }}>⚠</div>
            <p style={{ color: "#f87171", fontSize: 14, marginBottom: 8 }}>Something went wrong</p>
            <pre style={{ color: "#64748b", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", textAlign: "left", background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              {this.state.error?.message || "Unknown error"}
            </pre>
            <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#34d399,#2dd4bf)", color: "#0a1120", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Retry</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ══════════════════════════════════════════
   STORAGE LAYER — localStorage
   ══════════════════════════════════════════ */
async function storageGet(key) {
  try {
    const val = localStorage.getItem(key);
    return val;
  } catch { return null; }
}

async function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

/* ══════════════════════════════════════════
   PRE-LOADED SNIPPETS
   ══════════════════════════════════════════ */
const SEED_SNIPPETS = [
  { id: "seed-01", title: "UE5 C++ Code Review", category: "prompt", tags: ["unreal", "c++", "review"],
    content: "Review this UE5 C++ code for memory safety, lifecycle issues, and adherence to Unreal conventions. Flag any raw pointers that should be UPROPERTY, missing null checks, and potential GC issues." },
  { id: "seed-02", title: "StateTree Architecture", category: "prompt", tags: ["unreal", "architecture"],
    content: "I'm building [system] in Unreal Engine using StateTree. Help me design a minimal, reusable architecture. Prefer data-driven approaches and avoid deep inheritance hierarchies." },
  { id: "seed-03", title: "Blueprint to C++", category: "prompt", tags: ["unreal", "c++"],
    content: "Convert this Blueprint logic to C++. Keep it UCLASS/UFUNCTION compatible and expose the right properties to the editor." },
  { id: "seed-04", title: "Narrative Design Review", category: "prompt", tags: ["narrative", "game-design"],
    content: "Act as a narrative designer. I'll describe a story beat and you help me identify weak motivations, pacing issues, and missed opportunities for player agency. Push back on cliches." },
  { id: "seed-05", title: "Dialogue Variants", category: "prompt", tags: ["narrative", "game-design", "writing"],
    content: "Help me write barks/dialogue variants for [character] in [situation]. Tone: [tone]. Give me 5 options ranging from subtle to overt." },
  { id: "seed-06", title: "GLSL Shader", category: "prompt", tags: ["shaders", "glsl", "generative"],
    content: "Write a GLSL fragment shader that [effect]. Optimize for real-time performance. Include commented uniform inputs I can expose to a UI." },
  { id: "seed-07", title: "Generative Art Piece", category: "prompt", tags: ["generative", "p5js", "art"],
    content: "I want to create a generative art piece using [technique]. Walk me through the algorithm, then give me a clean p5.js implementation with seeded randomness." },
  { id: "seed-08", title: "Refactor Code", category: "prompt", tags: ["review", "refactor"],
    content: "Refactor this code. Priorities: reduce coupling, improve naming, eliminate duplication. Don't change external behavior. Explain each change briefly." },
  { id: "seed-09", title: "Bug Hunter", category: "prompt", tags: ["review", "debugging"],
    content: "Find bugs in this code. Don't suggest style changes - only things that would cause incorrect behavior, crashes, or performance problems." },
  { id: "seed-10", title: "Market Viability Analysis", category: "prompt", tags: ["business", "strategy"],
    content: "Analyze the market viability of [product/tool] for [audience]. Include: competitive landscape, pricing models that work in this space, realistic revenue range at year 1, and distribution channels ranked by ROI for a solo dev." },
  { id: "seed-11", title: "Structured Thinking", category: "prompt", tags: ["meta", "claude"],
    content: "Before answering, outline your approach in 2-3 sentences. Then execute. If you're uncertain about a design decision, give me options with tradeoffs instead of picking one." },
  { id: "seed-12", title: "Senior Collaborator Mode", category: "prompt", tags: ["meta", "claude"],
    content: "You are a senior technical collaborator, not an assistant. Challenge my assumptions, suggest alternatives I haven't considered, and flag when I'm overengineering." },
].map(s => ({ ...s, createdAt: Date.now(), updatedAt: Date.now() }));

/* ══════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════ */
const CATEGORIES = [
  { id: "all", label: "All", icon: "\u25C8" },
  { id: "code", label: "Code", icon: "</>" },
  { id: "prompt", label: "Prompts", icon: ">_" },
];

const LANGUAGES = [
  { id: "javascript", short: "JS" }, { id: "typescript", short: "TS" },
  { id: "python", short: "PY" }, { id: "csharp", short: "C#" },
  { id: "cpp", short: "C++" }, { id: "rust", short: "RS" },
  { id: "glsl", short: "GLSL" }, { id: "html", short: "HTML" },
  { id: "css", short: "CSS" }, { id: "json", short: "JSON" },
  { id: "bash", short: "SH" }, { id: "sql", short: "SQL" },
  { id: "yaml", short: "YAML" }, { id: "other", short: "TXT" },
];

const STORAGE_KEY = "snippet-vault-blocks";
const AUTH_KEY = "snippet-vault-auth";

/* ══════════════════════════════════════════
   CRYPTO
   ══════════════════════════════════════════ */
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ══════════════════════════════════════════
   SYNTAX HIGHLIGHTING (One Dark palette)
   ══════════════════════════════════════════ */
const TH = { kw: "#c678dd", str: "#98c379", cmt: "#5c6370", num: "#d19a66", fn: "#61afef", ty: "#e5c07b", op: "#56b6c2", dec: "#e5c07b", pre: "#c678dd", mac: "#61afef", lt: "#e06c75", bi: "#56b6c2", vr: "#e06c75", tag: "#e06c75", attr: "#d19a66", prop: "#61afef", sel: "#e5c07b", key: "#e06c75", val: "#98c379", anc: "#c678dd" };

const RULES = {
  javascript: { comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, strings: /(["'`])(?:(?!\1|\\).|\\.)*?\1/g, keywords: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|delete|void|null|undefined|true|false|NaN|Infinity)\b/g, numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[\da-f]+|0b[01]+|0o[0-7]+)\b/gi, functions: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, operators: /(=>|\.{3}|\?\?|[!=]==?|[<>]=?|&&|\|\||[+\-*/%]=?)/g },
  typescript: { comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, strings: /(["'`])(?:(?!\1|\\).|\\.)*?\1/g, keywords: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|delete|void|null|undefined|true|false|type|interface|enum|namespace|abstract|implements|readonly|as|keyof|infer|never|unknown|any|string|number|boolean|symbol|bigint)\b/g, numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[\da-f]+)\b/gi, functions: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/g, types: /\b([A-Z][\w]*)\b/g },
  python: { comments: /(#.*$)/gm, strings: /("""[\s\S]*?"""|'''[\s\S]*?'''|f?["'](?:(?!["']|\\).|\\.)*?["'])/g, decorators: /(@[\w.]+)/g, keywords: /\b(def|class|return|if|elif|else|for|while|break|continue|import|from|as|try|except|finally|raise|with|yield|lambda|pass|del|global|nonlocal|assert|in|not|and|or|is|None|True|False|self|async|await|print)\b/g, numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?|0x[\da-f]+|0b[01]+|0o[0-7]+)\b/gi, functions: /\b([a-zA-Z_][\w]*)\s*(?=\()/g },
  csharp: { comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, strings: /(@"(?:[^"]|"")*"|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, keywords: /\b(using|namespace|class|struct|enum|interface|abstract|sealed|static|public|private|protected|internal|virtual|override|new|this|base|return|if|else|for|foreach|while|do|switch|case|break|continue|try|catch|finally|throw|async|await|var|int|float|double|string|bool|void|null|true|false|readonly|const|ref|out|in|params|yield|delegate|event|get|set|value)\b/g, numbers: /\b(\d+\.?\d*f?|0x[\da-f]+)\b/gi, functions: /\b([a-zA-Z_][\w]*)\s*(?=\()/g, types: /\b([A-Z][\w]*)\b/g },
  cpp: { comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, strings: /(["'])(?:(?!\1|\\).|\\.)*?\1/g, preprocessor: /(#\s*\w+)/g, keywords: /\b(auto|bool|break|case|catch|char|class|const|continue|default|delete|do|double|else|enum|explicit|extern|false|float|for|friend|goto|if|include|inline|int|long|namespace|new|nullptr|operator|private|protected|public|register|return|short|signed|sizeof|static|struct|switch|template|this|throw|true|try|typedef|typename|union|unsigned|using|virtual|void|volatile|while|override|final|constexpr|noexcept)\b/g, numbers: /\b(\d+\.?\d*f?|0x[\da-f]+|0b[01]+)\b/gi, functions: /\b([a-zA-Z_][\w]*)\s*(?=\()/g },
  rust: { comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, strings: /(r#?"[\s\S]*?"#?|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, macros: /\b([a-zA-Z_][\w]*!)/g, lifetimes: /('[\w]+)\b/g, keywords: /\b(fn|let|mut|const|static|if|else|match|loop|while|for|in|break|continue|return|struct|enum|impl|trait|type|use|mod|pub|crate|self|super|as|ref|move|async|await|where|unsafe|extern|true|false|Some|None|Ok|Err|Self|dyn|Box|Vec|String|Option|Result)\b/g, numbers: /\b(\d[\d_]*\.?[\d_]*(?:e[+-]?[\d_]+)?|0x[\da-f_]+|0b[01_]+)\b/gi, functions: /\b([a-zA-Z_][\w]*)\s*(?=\()/g },
  glsl: { comments: /(\/\/.*$|\/\*[\s\S]*?\*\/)/gm, strings: /(["'])(?:(?!\1|\\).|\\.)*?\1/g, preprocessor: /(#\s*\w+)/g, builtins: /\b(gl_Position|gl_FragColor|gl_FragCoord|texture|normalize|dot|cross|mix|clamp|step|smoothstep|length|distance|reflect|refract|min|max|abs|floor|ceil|fract|mod|pow|sqrt|sin|cos|tan)\b/g, keywords: /\b(void|bool|int|uint|float|double|vec[234]|ivec[234]|mat[234]|sampler[123]D|in|out|inout|uniform|varying|attribute|const|struct|if|else|for|while|do|break|continue|return|discard|precision|highp|mediump|lowp|layout|location|binding|true|false)\b/g, numbers: /\b(\d+\.?\d*(?:e[+-]?\d+)?f?)\b/gi, functions: /\b([a-zA-Z_][\w]*)\s*(?=\()/g },
  html: { comments: /(<!--[\s\S]*?-->)/g, strings: /(["'])(?:(?!\1|\\).|\\.)*?\1/g, tags: /(<\/?[\w-]+|>|\/>)/g, attributes: /\b([\w-]+)(?==)/g },
  css: { comments: /(\/\*[\s\S]*?\*\/)/g, strings: /(["'])(?:(?!\1|\\).|\\.)*?\1/g, keywords: /(@media|@keyframes|@import|@font-face|@supports|!important)\b/g, selectors: /([.#][\w-]+)/g, properties: /([\w-]+)\s*(?=:)/g, numbers: /(\d+\.?\d*(?:px|em|rem|%|vh|vw|deg|s|ms)?)/g },
  json: { strings: /("(?:[^"\\]|\\.)*")\s*(?=:)/g, values: /:\s*("(?:[^"\\]|\\.)*")/g, keywords: /\b(true|false|null)\b/g, numbers: /\b(-?\d+\.?\d*(?:e[+-]?\d+)?)\b/g },
  bash: { comments: /(#.*$)/gm, strings: /(["'])(?:(?!\1|\\).|\\.)*?\1/g, variables: /(\$[\w{]+}?)/g, keywords: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|echo|printf|read|set|unset|export|source|cd|ls|grep|sed|awk|find|sudo|chmod|mkdir|rm|cp|mv|cat|curl|wget)\b/g, numbers: /\b(\d+)\b/g },
  sql: { comments: /(--.*$|\/\*[\s\S]*?\*\/)/gm, strings: /(["'])(?:(?!\1|\\).|\\.)*?\1/g, keywords: /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|JOIN|LEFT|RIGHT|INNER|ON|AND|OR|NOT|IN|LIKE|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|DISTINCT|UNION|EXISTS|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MIN|MAX|PRIMARY|KEY|BEGIN|COMMIT|ROLLBACK)\b/gi, numbers: /\b(\d+\.?\d*)\b/g },
  yaml: { comments: /(#.*$)/gm, strings: /(["'])(?:(?!\1|\\).|\\.)*?\1/g, anchors: /(&[\w]+|\*[\w]+)/g, keys: /^(\s*[\w.-]+)\s*(?=:)/gm, keywords: /\b(true|false|null|yes|no)\b/gi, numbers: /\b(\d+\.?\d*)\b/g },
  other: { strings: /(["'`])(?:(?!\1|\\).|\\.)*?\1/g, numbers: /\b(\d+\.?\d*)\b/g },
};

const R2C = { keywords: TH.kw, strings: TH.str, comments: TH.cmt, numbers: TH.num, functions: TH.fn, types: TH.ty, operators: TH.op, decorators: TH.dec, preprocessor: TH.pre, macros: TH.mac, lifetimes: TH.lt, builtins: TH.bi, variables: TH.vr, tags: TH.tag, attributes: TH.attr, properties: TH.prop, selectors: TH.sel, keys: TH.key, values: TH.val, anchors: TH.anc };
const RULE_ORDER = ["comments", "strings", "values", "decorators", "preprocessor", "macros", "lifetimes", "builtins", "anchors", "keywords", "types", "functions", "tags", "attributes", "properties", "selectors", "keys", "variables", "operators", "numbers"];
const G1 = new Set(["keywords", "numbers", "functions", "types", "operators", "tags", "attributes", "properties", "selectors", "keys", "anchors"]);

function escHtml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function highlight(code, langId) {
  const rules = RULES[langId] || RULES.other;
  const e = escHtml(code);
  const used = new Uint8Array(e.length);
  const tokens = [];
  for (const rk of RULE_ORDER) {
    const pat = rules[rk];
    if (!pat) continue;
    const color = R2C[rk] || TH.kw;
    const re = new RegExp(pat.source, pat.flags);
    let m;
    while ((m = re.exec(e)) !== null) {
      const txt = (G1.has(rk) && m[1] !== undefined) ? m[1] : m[0];
      const off = m[0].indexOf(txt);
      const s = m.index + off;
      const end = s + txt.length;
      let overlap = false;
      for (let i = s; i < end; i++) { if (used[i]) { overlap = true; break; } }
      if (overlap) continue;
      for (let i = s; i < end; i++) used[i] = 1;
      tokens.push({ s, end, txt, color });
    }
  }
  tokens.sort((a, b) => a.s - b.s);
  let out = "";
  let cur = 0;
  for (const t of tokens) {
    if (t.s > cur) out += e.slice(cur, t.s);
    out += '<span style="color:' + t.color + '">' + t.txt + "</span>";
    cur = t.end;
  }
  if (cur < e.length) out += e.slice(cur);
  return out;
}

/* ══════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const TAG_PALETTES = [
  { bg: "rgba(96,165,250,0.12)", fg: "#60a5fa" },
  { bg: "rgba(167,139,250,0.12)", fg: "#a78bfa" },
  { bg: "rgba(52,211,153,0.12)", fg: "#34d399" },
  { bg: "rgba(251,191,36,0.12)", fg: "#fbbf24" },
  { bg: "rgba(248,113,113,0.12)", fg: "#f87171" },
  { bg: "rgba(45,212,191,0.12)", fg: "#2dd4bf" },
  { bg: "rgba(244,114,182,0.12)", fg: "#f472b6" },
  { bg: "rgba(129,140,248,0.12)", fg: "#818cf8" },
];

function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
  return TAG_PALETTES[Math.abs(h) % TAG_PALETTES.length];
}

/* ══════════════════════════════════════════
   ICONS (as plain functions returning JSX)
   ══════════════════════════════════════════ */
function CopyIcon({ copied }) {
  if (copied) return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>);
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
}

function TrashIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>);
}

function EditIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
}

function PlusIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>);
}

function LockIcon() {
  return (<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
}

function EyeIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>);
}

function EyeOffIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>);
}

/* ══════════════════════════════════════════
   TAG INPUT
   ══════════════════════════════════════════ */
function TagInput({ tags, onChange }) {
  const [input, setInput] = useState("");
  const ref = useRef(null);

  const add = (val) => {
    const t = val.toLowerCase().trim().replace(/[^a-z0-9\-_]/g, "");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  };

  const remove = (tag) => onChange(tags.filter(t => t !== tag));

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
    if (e.key === "Backspace" && !input && tags.length) remove(tags[tags.length - 1]);
  };

  return (
    <div onClick={() => ref.current?.focus()} style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", cursor: "text", minHeight: 38, alignItems: "center" }}>
      {tags.map(tag => {
        const c = tagColor(tag);
        return (
          <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: c.bg, color: c.fg }}>
            {tag}
            <span onClick={(e) => { e.stopPropagation(); remove(tag); }} style={{ cursor: "pointer", opacity: 0.7, fontSize: 13, lineHeight: 1 }}>x</span>
          </span>
        );
      })}
      <input
        ref={ref} value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => { if (input) add(input); }}
        placeholder={tags.length === 0 ? "Add tags (press Enter)" : ""}
        style={{ border: "none", outline: "none", background: "transparent", color: "#e2e8f0", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", flex: 1, minWidth: 80, padding: 0 }}
      />
    </div>
  );
}

/* ══════════════════════════════════════════
   TAG FILTER BAR
   ══════════════════════════════════════════ */
function TagFilterBar({ allTags, activeTags, onToggle, onClear }) {
  if (allTags.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
      {activeTags.length > 0 && (
        <button onClick={onClear} style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)", color: "#f87171", cursor: "pointer", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
          Clear
        </button>
      )}
      {allTags.map(tag => {
        const active = activeTags.includes(tag);
        const c = tagColor(tag);
        return (
          <button key={tag} onClick={() => onToggle(tag)} style={{ padding: "4px 10px", borderRadius: 5, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", transition: "all 0.15s", border: active ? "1px solid " + c.fg + "40" : "1px solid rgba(255,255,255,0.05)", background: active ? c.bg : "transparent", color: active ? c.fg : "#475569", fontWeight: active ? 600 : 400 }}>
            {tag}
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════
   LOCK SCREEN
   ══════════════════════════════════════════ */
function LockScreen({ onUnlock }) {
  const [mode, setMode] = useState("loading");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    storageGet(AUTH_KEY).then(val => {
      if (cancelled) return;
      setMode(val ? "login" : "setup");
      setTimeout(() => inputRef.current?.focus(), 150);
    });
    return () => { cancelled = true; };
  }, []);

  const shake = () => { setShaking(true); setTimeout(() => setShaking(false), 500); };

  const handleSetup = async () => {
    if (pw.length < 4) { setError("At least 4 characters"); shake(); return; }
    if (pw !== confirm) { setError("Passwords don't match"); shake(); return; }
    const hash = await sha256(pw);
    await storageSet(AUTH_KEY, hash);
    onUnlock();
  };

  const handleLogin = async () => {
    const hash = await sha256(pw);
    const stored = await storageGet(AUTH_KEY);
    if (stored === hash) { onUnlock(); return; }
    setError("Wrong password");
    shake();
    setPw("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleKey = (e) => { if (e.key === "Enter") { mode === "setup" ? handleSetup() : handleLogin(); } };

  if (mode === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: "#080b12", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: "#34d399", fontFamily: "'JetBrains Mono', monospace", fontSize: 14, opacity: 0.7 }}>Loading...</span>
      </div>
    );
  }

  const iSt = {
    width: "100%", padding: "12px 42px 12px 16px", borderRadius: 10,
    border: error ? "1px solid rgba(248,113,113,0.4)" : "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)", color: "#e2e8f0", fontSize: 15,
    fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080b12", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center", animation: shaking ? "shakeX 0.4s ease" : "fadeIn 0.4s ease" }}>
        <div style={{ color: "#34d399", marginBottom: 20, opacity: 0.8 }}><LockIcon /></div>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #34d399, #2dd4bf)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Outfit', sans-serif" }}>snippet vault</h1>
        <p style={{ margin: "0 0 28px", fontSize: 12, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>
          {mode === "setup" ? "Create a password to protect your snippets" : "Enter your password to unlock"}
        </p>

        <div style={{ position: "relative", marginBottom: mode === "setup" ? 12 : 8 }}>
          <input ref={inputRef} type={show ? "text" : "password"} value={pw} onChange={e => { setPw(e.target.value); setError(""); }} onKeyDown={handleKey} placeholder={mode === "setup" ? "Create password" : "Password"} style={iSt} onFocus={e => e.target.style.borderColor = "rgba(52,211,153,0.4)"} onBlur={e => e.target.style.borderColor = error ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.1)"} />
          <button onClick={() => setShow(!show)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        {mode === "setup" && (
          <div style={{ position: "relative", marginBottom: 8 }}>
            <input type={show ? "text" : "password"} value={confirm} onChange={e => { setConfirm(e.target.value); setError(""); }} onKeyDown={handleKey} placeholder="Confirm password" style={iSt} onFocus={e => e.target.style.borderColor = "rgba(52,211,153,0.4)"} onBlur={e => e.target.style.borderColor = error ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.1)"} />
          </div>
        )}

        {error && <p style={{ margin: "0 0 12px", fontSize: 12, color: "#f87171", fontFamily: "'JetBrains Mono', monospace" }}>{error}</p>}

        <button onClick={mode === "setup" ? handleSetup : handleLogin} disabled={!pw} style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", marginTop: 8, background: pw ? "linear-gradient(135deg, #34d399, #2dd4bf)" : "#1e293b", color: pw ? "#0a1120" : "#475569", cursor: pw ? "pointer" : "default", fontSize: 14, fontWeight: 700, fontFamily: "'Outfit', sans-serif", letterSpacing: "0.02em" }}>
          {mode === "setup" ? "Set Password & Enter" : "Unlock"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   SNIPPET CARD
   ══════════════════════════════════════════ */
function SnippetCard({ block, onDelete, onEdit, onTagClick }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(block.content); }
    catch {
      const t = document.createElement("textarea");
      t.value = block.content;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const catMeta = CATEGORIES.find(c => c.id === block.category) || CATEGORIES[1];
  const langMeta = LANGUAGES.find(l => l.id === block.language);
  const lines = block.content.split("\n").length;
  const isCode = block.category === "code";
  const html = useMemo(() => isCode && block.language ? highlight(block.content, block.language) : null, [block.content, block.language, isCode]);
  const blockTags = block.tags || [];

  return (
    <div onClick={handleCopy} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "14px 16px", cursor: "pointer", transition: "all 0.2s ease", position: "relative", overflow: "hidden" }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.25)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: isCode ? "#60a5fa" : "#a78bfa", background: isCode ? "rgba(96,165,250,0.1)" : "rgba(167,139,250,0.1)", padding: "2px 8px", borderRadius: 4, letterSpacing: 1, textTransform: "uppercase", flexShrink: 0 }}>
            {catMeta.icon} {catMeta.label}
          </span>
          {isCode && langMeta && langMeta.id !== "other" && (
            <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "#e5c07b", background: "rgba(229,192,123,0.1)", padding: "2px 8px", borderRadius: 4, flexShrink: 0 }}>
              {langMeta.short}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {block.title}
          </span>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button onClick={e => { e.stopPropagation(); onEdit(block); }} title="Edit" style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center" }}><EditIcon /></button>
          <button onClick={e => { e.stopPropagation(); onDelete(block.id); }} title="Delete" style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center" }}><TrashIcon /></button>
          <button onClick={e => { e.stopPropagation(); handleCopy(); }} title="Copy" style={{ background: copied ? "rgba(52,211,153,0.1)" : "none", border: "none", color: copied ? "#34d399" : "#64748b", cursor: "pointer", padding: 4, borderRadius: 4, display: "flex", alignItems: "center" }}><CopyIcon copied={copied} /></button>
        </div>
      </div>

      {/* Tags */}
      {blockTags.length > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {blockTags.map(tag => {
            const c = tagColor(tag);
            return (
              <span key={tag} onClick={e => { e.stopPropagation(); onTagClick(tag); }} style={{ fontSize: 10, padding: "1px 7px", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", background: c.bg, color: c.fg, cursor: "pointer" }}>
                {tag}
              </span>
            );
          })}
        </div>
      )}

      {/* Body */}
      {isCode && html ? (
        <pre dangerouslySetInnerHTML={{ __html: html }} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, lineHeight: 1.55, color: "#abb2bf", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 140, overflow: "hidden", WebkitMaskImage: lines > 7 ? "linear-gradient(to bottom, #000 55%, transparent)" : "none", background: "rgba(0,0,0,0.2)", borderRadius: 6, padding: "10px 12px" }} />
      ) : (
        <pre style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, lineHeight: 1.5, color: "#94a3b8", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "hidden", WebkitMaskImage: lines > 6 ? "linear-gradient(to bottom, #000 60%, transparent)" : "none" }}>
          {block.content}
        </pre>
      )}

      {/* Copied overlay */}
      {copied && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(6,10,18,0.85)", borderRadius: 10, animation: "fadeIn 0.15s ease" }}>
          <span style={{ color: "#34d399", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>Copied</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════ */
function Modal({ isOpen, onClose, onSave, editBlock }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("code");
  const [language, setLanguage] = useState("javascript");
  const [tags, setTags] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    if (isOpen) {
      if (editBlock) {
        setTitle(editBlock.title);
        setContent(editBlock.content);
        setCategory(editBlock.category);
        setLanguage(editBlock.language || "javascript");
        setTags(editBlock.tags || []);
      } else {
        setTitle(""); setContent(""); setCategory("code"); setLanguage("javascript"); setTags([]);
      }
      setTimeout(() => ref.current?.focus(), 100);
    }
  }, [isOpen, editBlock]);

  if (!isOpen) return null;

  const save = () => {
    if (!content.trim()) return;
    onSave({
      id: editBlock?.id || uid(),
      title: title.trim() || "Untitled",
      content, category,
      language: category === "code" ? language : undefined,
      tags,
      createdAt: editBlock?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
    onClose();
  };

  const inp = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#e2e8f0", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", animation: "fadeIn 0.15s ease", padding: 16 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0f1219", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 24, width: "100%", maxWidth: 520, maxHeight: "85vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>{editBlock ? "Edit Block" : "New Block"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20, padding: "2px 6px" }}>x</button>
        </div>

        {/* Category */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {CATEGORIES.filter(c => c.id !== "all").map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: category === cat.id ? "1px solid" : "1px solid rgba(255,255,255,0.06)", borderColor: category === cat.id ? (cat.id === "code" ? "rgba(96,165,250,0.4)" : "rgba(167,139,250,0.4)") : "rgba(255,255,255,0.06)", background: category === cat.id ? (cat.id === "code" ? "rgba(96,165,250,0.08)" : "rgba(167,139,250,0.08)") : "rgba(255,255,255,0.02)", color: category === cat.id ? (cat.id === "code" ? "#60a5fa" : "#a78bfa") : "#64748b", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600 }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Language */}
        {category === "code" && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {LANGUAGES.map(l => (
              <button key={l.id} onClick={() => setLanguage(l.id)} style={{ padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", border: language === l.id ? "1px solid rgba(229,192,123,0.4)" : "1px solid rgba(255,255,255,0.05)", background: language === l.id ? "rgba(229,192,123,0.1)" : "transparent", color: language === l.id ? "#e5c07b" : "#475569" }}>
                {l.short}
              </button>
            ))}
          </div>
        )}

        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)" style={{ ...inp, marginBottom: 12 }} />
        <div style={{ marginBottom: 12 }}><TagInput tags={tags} onChange={setTags} /></div>
        <textarea ref={ref} value={content} onChange={e => setContent(e.target.value)} placeholder={category === "code" ? "Paste your code here..." : "Paste your prompt here..."} rows={8} style={{ ...inp, color: "#cbd5e1", fontSize: 12, lineHeight: 1.6, resize: "vertical", marginBottom: 20 }} />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Cancel</button>
          <button onClick={save} disabled={!content.trim()} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: content.trim() ? "linear-gradient(135deg,#34d399,#2dd4bf)" : "#1e293b", color: content.trim() ? "#0a1120" : "#475569", cursor: content.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 700, letterSpacing: "0.02em" }}>
            {editBlock ? "Update" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN APP
   ══════════════════════════════════════════ */
function SnippetVault() {
  const [authed, setAuthed] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [filter, setFilter] = useState("all");
  const [activeTags, setActiveTags] = useState([]);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editBlock, setEditBlock] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    storageGet(STORAGE_KEY).then(val => {
      if (cancelled) return;
      if (val) {
        try { setBlocks(JSON.parse(val)); } catch { setBlocks(SEED_SNIPPETS); }
      } else {
        setBlocks(SEED_SNIPPETS);
        storageSet(STORAGE_KEY, JSON.stringify(SEED_SNIPPETS));
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [authed]);

  const persist = useCallback((d) => { storageSet(STORAGE_KEY, JSON.stringify(d)); }, []);

  const handleSave = (block) => {
    setBlocks(p => {
      const exists = p.find(b => b.id === block.id);
      const next = exists ? p.map(b => b.id === block.id ? block : b) : [block, ...p];
      persist(next);
      return next;
    });
    setEditBlock(null);
  };

  const handleDelete = (id) => {
    setBlocks(p => { const next = p.filter(b => b.id !== id); persist(next); return next; });
  };

  const handleEdit = (b) => { setEditBlock(b); setModalOpen(true); };
  const toggleTag = (tag) => { setActiveTags(p => p.includes(tag) ? p.filter(t => t !== tag) : [...p, tag]); };

  const allTags = useMemo(() => {
    const s = new Set();
    blocks.forEach(b => (b.tags || []).forEach(t => s.add(t)));
    return [...s].sort();
  }, [blocks]);

  const filtered = blocks.filter(b => {
    if (filter !== "all" && b.category !== filter) return false;
    if (activeTags.length > 0 && !activeTags.every(t => (b.tags || []).includes(t))) return false;
    if (search) {
      const q = search.toLowerCase();
      return b.title.toLowerCase().includes(q) || b.content.toLowerCase().includes(q) || (b.tags || []).some(t => t.includes(q));
    }
    return true;
  });

  const globalCSS = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700&display=swap');
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes shakeX { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
    * { box-sizing: border-box; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
    input::placeholder, textarea::placeholder { color: #334155; }
  `;

  if (!authed) {
    return (
      <div style={{ fontFamily: "'Outfit', -apple-system, sans-serif" }}>
        <style>{globalCSS}</style>
        <LockScreen onUnlock={() => setAuthed(true)} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#080b12", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{globalCSS}</style>
        <span style={{ color: "#34d399", fontFamily: "'JetBrains Mono', monospace", fontSize: 14, opacity: 0.7 }}>Loading...</span>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#080b12", color: "#e2e8f0", fontFamily: "'Outfit', -apple-system, sans-serif" }}>
      <style>{globalCSS}</style>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 16px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", background: "linear-gradient(135deg, #34d399, #2dd4bf)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontFamily: "'Outfit', sans-serif" }}>snippet vault</h1>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>{blocks.length} block{blocks.length !== 1 ? "s" : ""} saved</p>
            </div>
            <button onClick={() => { setEditBlock(null); setModalOpen(true); }} style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(52,211,153,0.25)", background: "rgba(52,211,153,0.06)", color: "#34d399", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PlusIcon />
            </button>
          </div>
        </div>

        {/* Search + Category */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search blocks..." style={{ flex: 1, minWidth: 160, padding: "9px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)", color: "#e2e8f0", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none" }} />
          <div style={{ display: "flex", gap: 4 }}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setFilter(cat.id)} style={{ padding: "8px 14px", borderRadius: 8, whiteSpace: "nowrap", border: filter === cat.id ? "1px solid rgba(52,211,153,0.3)" : "1px solid rgba(255,255,255,0.06)", background: filter === cat.id ? "rgba(52,211,153,0.08)" : "transparent", color: filter === cat.id ? "#34d399" : "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: filter === cat.id ? 600 : 400 }}>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tag Filter */}
        <TagFilterBar allTags={allTags} activeTags={activeTags} onToggle={toggleTag} onClear={() => setActiveTags([])} />

        {/* Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#334155", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
              {blocks.length === 0 ? (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>+</div>
                  <div>No blocks yet</div>
                  <div style={{ fontSize: 11, marginTop: 6, color: "#1e293b" }}>Tap + to add your first snippet</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>-</div>
                  <div>No matches</div>
                </div>
              )}
            </div>
          ) : (
            filtered.map(b => (
              <SnippetCard key={b.id} block={b} onDelete={handleDelete} onEdit={handleEdit} onTagClick={toggleTag} />
            ))
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditBlock(null); }} onSave={handleSave} editBlock={editBlock} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SnippetVault />
    </ErrorBoundary>
  );
}
