/**
 * Atualiza as estatísticas individuais de edição no OpenStreetMap dos membros que
 * autorizaram (campo "estatisticas: true" no cabeçalho de equipe/<membro>.qmd, que
 * exige o campo "osm").
 *
 * Consulta a API pública do OSM (changesets por usuário), agrega MÊS A MÊS e grava
 *   dados/osm-membros.json
 * (usado por scripts/gerar-dados.ts, que monta dados/painel/estatisticas.json).
 *
 * Roda antes de cada renderização (pre-render no _quarto.yml), no Deno embutido do Quarto.
 *
 * - Consulta cada membro no máximo a cada N horas (_data/estatisticas.yml); depois da
 *   primeira carga, só busca de novo o mês anterior ao último registrado e o atual.
 * - Se a API falhar, mantém os dados anteriores do membro.
 * - Quem deixa de ter "estatisticas: true" sai do arquivo na execução seguinte.
 * - Não guarda coordenadas, comentários nem identificadores de changesets.
 * - OSM_FORCAR=1 ignora o cache.
 */
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { parse as parseYaml } from "npm:yaml@2.6.1";

const ARQ = "dados/osm-membros.json";
const API = "https://api.openstreetmap.org";
const TAMANHO_PAGINA = 100;

type Mes = {
  m: string; changesets: number; edicoes: number; hashtag_edicoes: number; hashtag_changesets: number;
  criadas: number; modificadas: number; excluidas: number; campo: number; ferramentas: Record<string, number>;
};
type Membro = { osm: string; atualizado: string; meses: Mes[] };
type Arquivo = { gerado_em: string; inicio: string; hashtags: string[]; membros: Record<string, Membro> };

function avisar(msg: string) {
  console.warn(`[osm-membros] ${msg}`);
  if (Deno.env.get("GITHUB_ACTIONS")) console.log(`::warning title=Estatísticas dos membros::${msg}`);
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function lerJson<T>(caminho: string): Promise<T | null> {
  try { return JSON.parse(await Deno.readTextFile(caminho)) as T; } catch { return null; }
}

// ---------- configuração e membros ----------
const cfg = ((parseYaml(await Deno.readTextFile("_data/estatisticas.yml").catch(() => "")) ?? {}) as Record<string, unknown>);
const hashtags = (Array.isArray(cfg.hashtags) ? cfg.hashtags : ["youthmappersufv"]).map((h) => String(h).replace(/^#/, "").toLowerCase());
const validadeHoras = Number(cfg.atualizar_a_cada_horas ?? 12);
const pausa = Number(cfg.pausa_ms ?? 700);
// Início da contagem (AAAA-MM-DD), de _data/estatisticas.yml; nada anterior a ele é buscado
const inicioTxt = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(cfg.inicio ?? "")) ? String(cfg.inicio) : "2022-01-01";
const INICIO = new Date(`${inicioTxt}T00:00:00Z`);
const contato = String(cfg.contato ?? "youthmapperschapter@ufv.br");

function usuarioOsm(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const m = t.match(/openstreetmap\.org\/user\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : t;
}

const alvo: { id: string; osm: string }[] = [];
for await (const e of Deno.readDir("equipe")) {
  if (!e.isFile || !e.name.endsWith(".qmd")) continue;
  const texto = (await Deno.readTextFile(`equipe/${e.name}`)).replace(/\r\n/g, "\n");
  const m = texto.match(/^---\n([\s\S]*?)\n---/);
  if (!m) continue;
  let fm: Record<string, unknown> = {};
  try { fm = (parseYaml(m[1]) ?? {}) as Record<string, unknown>; } catch { continue; }
  const osm = usuarioOsm(fm.osm);
  if (fm.estatisticas === true && osm) alvo.push({ id: e.name.replace(/\.qmd$/, ""), osm });
}

// ---------- API ----------
const analisador = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: "@_", parseAttributeValue: false, parseTagValue: false,
  isArray: (nome: string) => nome === "changeset" || nome === "tag",
});
type Changeset = { id: string; criado: Date; edicoes: number; criadas: number; modificadas: number; excluidas: number; tags: Record<string, string> };
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

function lerChangesets(xml: string): Changeset[] {
  // deno-lint-ignore no-explicit-any
  const doc: any = analisador.parse(xml);
  if (!doc || doc.osm === undefined) throw new Error("resposta inesperada da API");
  // deno-lint-ignore no-explicit-any
  return ((doc.osm?.changeset ?? []) as any[]).map((c) => {
    const tags: Record<string, string> = {};
    // deno-lint-ignore no-explicit-any
    for (const t of (c.tag ?? []) as any[]) tags[String(t["@_k"])] = String(t["@_v"] ?? "");
    const cr = num(c["@_created_count"]), mo = num(c["@_modified_count"]), ex = num(c["@_deleted_count"]);
    return { id: String(c["@_id"]), criado: new Date(String(c["@_created_at"])),
             edicoes: c["@_changes_count"] !== undefined ? num(c["@_changes_count"]) : cr + mo + ex,
             criadas: cr, modificadas: mo, excluidas: ex, tags };
  });
}

async function baixar(url: string): Promise<string> {
  for (let t = 1; t <= 4; t++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": `youthmappers-ufv-site/1.0 (${contato})`, "Accept": "application/xml" } });
      const corpo = await r.text();
      if (r.status === 404) throw new Error("usuário não encontrado no OpenStreetMap");
      if (r.ok) return corpo;
      if (![429, 500, 502, 503, 504, 509].includes(r.status) || t === 4) throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (t === 4 || String((e as Error).message).includes("não encontrado")) throw e;
    }
    await dormir(3000 * t);
  }
  throw new Error("não foi possível consultar a API");
}

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
/** Changesets criados entre "desde" e agora (a API devolve 100 por consulta, do mais novo ao mais antigo) */
async function buscar(usuario: string, desde: Date): Promise<Changeset[]> {
  const todos = new Map<string, Changeset>();
  let limite = new Date();
  for (let pagina = 1; pagina <= 2000; pagina++) {
    const lote = lerChangesets(await baixar(`${API}/api/0.6/changesets?display_name=${encodeURIComponent(usuario)}&time=${iso(desde)},${iso(limite)}`));
    let novos = 0;
    for (const x of lote) if (!todos.has(x.id)) { todos.set(x.id, x); novos++; }
    if (lote.length < TAMANHO_PAGINA || novos === 0) break;
    limite = new Date(Math.min(...lote.map((x) => x.criado.getTime())) + 1000);
    await dormir(pausa);
  }
  return [...todos.values()].filter((x) => x.criado >= desde);
}

// ---------- agregação mensal ----------
const temHashtag = (cs: Changeset) => {
  const texto = `${cs.tags["comment"] ?? ""} ${cs.tags["hashtags"] ?? ""}`;
  return (texto.match(/#[\p{L}\p{N}_-]+/gu) ?? []).some((h) => hashtags.includes(h.slice(1).toLowerCase()));
};
const ferramenta = (cs: Changeset) => (cs.tags["created_by"] ?? "").replace(/[\s/]+v?\d.*$/, "").trim() || "Não informada";
const mesDe = (d: Date) => d.toISOString().slice(0, 7);

function agregar(lista: Changeset[]): Mes[] {
  const por = new Map<string, Mes>();
  for (const x of lista) {
    const m = mesDe(x.criado);
    const a = por.get(m) ?? { m, changesets: 0, edicoes: 0, hashtag_edicoes: 0, hashtag_changesets: 0, criadas: 0, modificadas: 0, excluidas: 0, campo: 0, ferramentas: {} };
    a.changesets++; a.edicoes += x.edicoes; a.criadas += x.criadas; a.modificadas += x.modificadas; a.excluidas += x.excluidas;
    if (temHashtag(x)) { a.hashtag_edicoes += x.edicoes; a.hashtag_changesets++; }
    if ((x.tags["source"] ?? "").toLowerCase().includes("survey")) a.campo += x.edicoes;
    const f = ferramenta(x);
    a.ferramentas[f] = (a.ferramentas[f] ?? 0) + x.edicoes;
    por.set(m, a);
  }
  return [...por.values()].sort((a, b) => a.m.localeCompare(b.m));
}

// ---------- execução ----------
const anterior = await lerJson<Arquivo>(ARQ);
const forcar = Deno.env.get("OSM_FORCAR") === "1";
const saida: Arquivo = { gerado_em: new Date().toISOString(), inicio: inicioTxt, hashtags, membros: {} };
let consultados = 0;

for (const { id, osm } of alvo) {
  const prev = anterior?.membros?.[id];
  const mesmoUsuario = prev && prev.osm === osm && anterior?.hashtags?.join() === hashtags.join() && anterior?.inicio === inicioTxt;
  if (mesmoUsuario && !forcar && (Date.now() - Date.parse(prev.atualizado)) / 36e5 < validadeHoras) {
    saida.membros[id] = prev;
    continue;
  }
  try {
    // Primeira carga: desde o início do programa. Depois: do início do mês anterior ao último mês conhecido.
    let desde = INICIO;
    let mantidos: Mes[] = [];
    if (mesmoUsuario && prev.meses.length) {
      const ultimo = prev.meses[prev.meses.length - 1].m;
      const d = new Date(`${ultimo}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      desde = d < INICIO ? INICIO : d;
      mantidos = prev.meses.filter((x) => x.m < mesDe(d));
    }
    const novos = agregar(await buscar(osm, desde));
    saida.membros[id] = { osm, atualizado: new Date().toISOString(), meses: [...mantidos, ...novos] };
    consultados++;
    console.log(`[osm-membros] ${id}: ${saida.membros[id].meses.reduce((s, x) => s + x.edicoes, 0)} edições em ${saida.membros[id].meses.length} meses`);
    await dormir(pausa);
  } catch (e) {
    avisar(`${id} (${osm}): ${(e as Error).message}${prev ? "; mantidos os dados anteriores" : ""}`);
    if (prev) saida.membros[id] = prev;
  }
}

const mudou = JSON.stringify(anterior?.membros ?? {}) !== JSON.stringify(saida.membros);
if (mudou || !anterior) {
  await Deno.mkdir("dados", { recursive: true });
  await Deno.writeTextFile(ARQ, JSON.stringify(saida) + "\n");
}
console.log(`[osm-membros] ${alvo.length} membro(s) com estatísticas; ${consultados} consultado(s) à API`);
