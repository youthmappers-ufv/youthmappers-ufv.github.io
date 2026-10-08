/**
 * Lê os dados estruturados do site, confere cada valor e gera as tabelas
 * usadas pela página do painel (painel.qmd).
 *
 *   Fontes                                  Saídas (dados/painel/)
 *   _data/vocabulario.yml, _data/parceiros.yml
 *   equipe/*.qmd (cabeçalho)          ->   membros.json, periodos.json
 *   eventos/* /index.qmd               ->   eventos.json, participacoes.json
 *   projetos/* /index.qmd              ->   projetos.json
 *   publicacoes.bib                    ->   publicacoes.json
 *   dados/osm-mensal.json              ->   osm-mensal.json
 *   (todas as tabelas também em CSV, na subpasta csv/, para download)
 *
 * Roda antes de cada renderização (pre-render no _quarto.yml).
 * Problemas encontrados aparecem como avisos no terminal e no GitHub.
 * Com VALIDACAO_ESTRITA=1, qualquer problema interrompe a publicação.
 */
import { parse } from "npm:yaml@2.6.1";

const SAIDA = "dados/painel";
const ESTRITO = Deno.env.get("VALIDACAO_ESTRITA") === "1";
const NO_GITHUB = Boolean(Deno.env.get("GITHUB_ACTIONS"));

type Obj = Record<string, unknown>;
const problemas: { arquivo: string; msg: string }[] = [];
const problema = (arquivo: string, msg: string) => problemas.push({ arquivo, msg });

// ---------- utilidades ----------
async function lerTexto(caminho: string): Promise<string | null> {
  try { return await Deno.readTextFile(caminho); } catch { return null; }
}
async function lerYaml(caminho: string): Promise<unknown> {
  const texto = await lerTexto(caminho);
  if (texto === null) { problema(caminho, "arquivo não encontrado"); return null; }
  try { return parse(texto); } catch (e) { problema(caminho, `YAML inválido: ${(e as Error).message}`); return null; }
}
/** Cabeçalho YAML (entre as linhas ---) de um arquivo .qmd */
async function cabecalho(caminho: string): Promise<Obj | null> {
  const texto = await lerTexto(caminho);
  if (texto === null) return null;
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) { problema(caminho, "arquivo sem cabeçalho YAML"); return null; }
  try { return (parse(m[1]) ?? {}) as Obj; }
  catch (e) { problema(caminho, `cabeçalho YAML inválido: ${(e as Error).message}`); return null; }
}
async function listar(dir: string): Promise<Deno.DirEntry[]> {
  const itens: Deno.DirEntry[] = [];
  try { for await (const e of Deno.readDir(dir)) if (!e.name.startsWith("_") && !e.name.startsWith(".")) itens.push(e); }
  catch { /* pasta inexistente */ }
  return itens.sort((a, b) => a.name.localeCompare(b.name));
}
const texto = (v: unknown) => (v === undefined || v === null ? null : String(v).trim());
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
const ehMes = (v: string | null) => v !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const ehData = (v: string | null) => v !== null && /^\d{4}-\d{2}-\d{2}/.test(v);

function noVocabulario(arquivo: string, campo: string, valor: string | null, dominio: Obj, obrigatorio = true) {
  if (valor === null || valor === "") {
    if (obrigatorio) problema(arquivo, `campo "${campo}" ausente`);
    return null;
  }
  if (!(valor in dominio)) {
    problema(arquivo, `"${campo}: ${valor}" não está no vocabulário (válidos: ${Object.keys(dominio).join(", ")})`);
    return null;
  }
  return valor;
}

const hoje = new Date().toISOString().slice(0, 10);
const mesAtual = hoje.slice(0, 7);
const semestreAtual = `${hoje.slice(0, 4)}.${Number(hoje.slice(5, 7)) <= 7 ? 1 : 2}`;

// ---------- vocabulário e parceiros ----------
const vocab = ((await lerYaml("_data/vocabulario.yml")) ?? {}) as Record<string, Obj>;
for (const chave of ["cursos", "vinculos", "funcoes", "situacoes", "tipos_evento", "modalidades",
                     "tipos_projeto", "tipos_publicacao", "tipos_parceiro", "ods"]) {
  if (!vocab[chave]) { problema("_data/vocabulario.yml", `lista "${chave}" ausente`); vocab[chave] = {}; }
}

const parceiros: Obj[] = [];
const idsParceiros = new Set<string>();
for (const p of ((await lerYaml("_data/parceiros.yml")) ?? []) as Obj[]) {
  const arq = "_data/parceiros.yml";
  const id = texto(p.id);
  if (!id) { problema(arq, "parceiro sem id"); continue; }
  if (idsParceiros.has(id)) problema(arq, `id repetido: ${id}`);
  idsParceiros.add(id);
  if (!texto(p.nome)) problema(arq, `parceiro ${id} sem nome`);
  const tipo = noVocabulario(`${arq} (${id})`, "tipo", texto(p.tipo), vocab.tipos_parceiro);
  parceiros.push({ id, tipo, desde: p.desde ?? null });
}

// ---------- membros e períodos ----------
const membros: Obj[] = [];
const periodos: Obj[] = [];
for (const e of await listar("equipe")) {
  if (!e.isFile || !e.name.endsWith(".qmd")) continue;
  const arq = `equipe/${e.name}`;
  const fm = await cabecalho(arq);
  if (!fm) continue;
  const id = e.name.replace(/\.qmd$/, "");
  const situacao = noVocabulario(arq, "situacao", texto(fm.situacao), vocab.situacoes);
  const vinculo = noVocabulario(arq, "vinculo", texto(fm.vinculo), vocab.vinculos);
  const exigeCurso = vinculo === "graduacao" || vinculo === "pos-graduacao";
  const curso = noVocabulario(arq, "curso", texto(fm.curso), vocab.cursos, exigeCurso);

  const ps = Array.isArray(fm.periodos) ? fm.periodos as Obj[] : [];
  if (ps.length === 0) problema(arq, `sem "periodos": a pessoa não aparece nos gráficos da equipe`);
  let aberto = false;
  for (const [i, p] of ps.entries()) {
    const ref = `${arq} (período ${i + 1})`;
    const funcao = noVocabulario(ref, "funcao", texto(p.funcao), vocab.funcoes);
    const inicio = texto(p.inicio);
    const fim = texto(p.fim);
    if (!ehMes(inicio)) { problema(ref, `"inicio" deve ser AAAA-MM (encontrado: ${inicio})`); continue; }
    if (fim !== null && !ehMes(fim)) { problema(ref, `"fim" deve ser AAAA-MM (encontrado: ${fim})`); continue; }
    if (fim !== null && fim < inicio) problema(ref, `"fim" (${fim}) é anterior ao "inicio" (${inicio})`);
    if (inicio > mesAtual) problema(ref, `"inicio" (${inicio}) está no futuro`);
    if (fim === null) aberto = true;
    if (funcao) periodos.push({ membro: id, funcao, inicio, fim });
  }
  // Consistência entre "situacao" (usada pelas listagens) e os períodos
  if (ps.length > 0 && situacao === "egresso" && aberto) problema(arq, `"situacao: egresso", mas há período sem "fim"`);
  if (ps.length > 0 && (situacao === "atual" || situacao === "coordenacao") && !aberto)
    problema(arq, `"situacao: ${situacao}", mas todos os períodos têm "fim" (deveria ser egresso?)`);
  membros.push({ id, situacao, vinculo, curso });
}
const idsMembros = new Set(membros.map((m) => m.id as string));

function referencias(arq: string, campo: string, ids: string[], validos: Set<string>, origem: string) {
  for (const id of ids) if (!validos.has(id)) problema(arq, `"${campo}" cita "${id}", que não existe em ${origem}`);
  return ids.filter((id) => validos.has(id));
}

// ---------- eventos e participações ----------
const eventos: Obj[] = [];
const participacoes: Obj[] = [];
for (const e of await listar("eventos")) {
  if (!e.isDirectory) continue;
  const arq = `eventos/${e.name}/index.qmd`;
  const fm = await cabecalho(arq);
  if (!fm) continue;
  const data = texto(fm.date);
  if (!ehData(data)) { problema(arq, `"date" ausente ou fora do formato AAAA-MM-DD`); continue; }
  const realizado = data!.slice(0, 10) <= hoje;
  const tipo = noVocabulario(arq, "tipo", texto(fm.tipo), vocab.tipos_evento);
  const modalidade = noVocabulario(arq, "modalidade", texto(fm.modalidade), vocab.modalidades, realizado);
  const municipio = texto(fm.municipio);
  if (!municipio && realizado) problema(arq, `campo "municipio" ausente`);
  const numero = (campo: string) => {
    const v = fm[campo];
    if (v === undefined || v === null) {
      if (realizado) problema(arq, `evento já realizado sem "${campo}"`);
      return null;
    }
    if (typeof v !== "number" || v < 0) { problema(arq, `"${campo}" deve ser um número ≥ 0`); return null; }
    return v;
  };
  const publico = numero("publico");
  const externo = numero("publico_externo");
  const horas = numero("carga_horaria");
  if (publico !== null && externo !== null && externo > publico)
    problema(arq, `"publico_externo" (${externo}) maior que "publico" (${publico})`);
  const equipe = referencias(arq, "equipe", lista(fm.equipe), idsMembros, "equipe/");
  const parc = referencias(arq, "parceiros", lista(fm.parceiros), idsParceiros, "_data/parceiros.yml");
  if (!tipo) continue;
  eventos.push({ id: e.name, data: data!.slice(0, 10), realizado, tipo, modalidade, municipio,
                 carga_horaria: horas, publico, publico_externo: externo, parceiros: parc });
  for (const m of equipe) participacoes.push({ evento: e.name, membro: m });
}

// ---------- projetos ----------
const projetos: Obj[] = [];
for (const e of await listar("projetos")) {
  if (!e.isDirectory) continue;
  const arq = `projetos/${e.name}/index.qmd`;
  const fm = await cabecalho(arq);
  if (!fm) continue;
  const tipo = noVocabulario(arq, "tipo", texto(fm.tipo), vocab.tipos_projeto);
  const inicio = texto(fm.inicio);
  const fim = texto(fm.fim);
  if (!ehMes(inicio)) { problema(arq, `"inicio" ausente ou fora do formato AAAA-MM`); continue; }
  if (fim !== null && !ehMes(fim)) problema(arq, `"fim" deve ser AAAA-MM`);
  if (fim !== null && fim < inicio!) problema(arq, `"fim" (${fim}) é anterior ao "inicio" (${inicio})`);
  const ods = lista(fm.ods).map(Number);
  for (const o of ods) if (!(String(o) in vocab.ods)) problema(arq, `"ods: ${o}" inválido (use números de 1 a 17)`);
  if (ods.length === 0) problema(arq, `sem "ods"`);
  const coordenacao = referencias(arq, "coordenacao", lista(fm.coordenacao), idsMembros, "equipe/");
  const equipe = referencias(arq, "equipe", lista(fm.equipe), idsMembros, "equipe/");
  const parc = referencias(arq, "parceiros", lista(fm.parceiros), idsParceiros, "_data/parceiros.yml");
  if (!tipo) continue;
  projetos.push({ id: e.name, tipo, inicio, fim: ehMes(fim) ? fim : null,
                  ods: ods.filter((o) => String(o) in vocab.ods), coordenacao, equipe, parceiros: parc });
}

// ---------- publicações (BibTeX) ----------
const publicacoes: Obj[] = [];
{
  const arq = "publicacoes.bib";
  const bib = (await lerTexto(arq)) ?? "";
  // Percorre as entradas "@tipo{chave, ...}" respeitando chaves aninhadas
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bib)) !== null) {
    const tipoEntrada = m[1].toLowerCase();
    if (["comment", "string", "preamble"].includes(tipoEntrada)) continue;
    let nivel = 1, i = re.lastIndex;
    while (i < bib.length && nivel > 0) { if (bib[i] === "{") nivel++; else if (bib[i] === "}") nivel--; i++; }
    const corpo = bib.slice(re.lastIndex, i - 1);
    const campo = (nome: string) => corpo.match(new RegExp(`\\b${nome}\\s*=\\s*[{"]?\\s*([^,}"]+)`, "i"))?.[1].trim() ?? null;
    const chave = m[2];
    const ano = Number(campo("year") ?? campo("date")?.slice(0, 4));
    if (!ano) problema(`${arq} (${chave})`, `sem "year"`);
    const tipo = noVocabulario(`${arq} (${chave})`, "tipopub", campo("tipopub"), vocab.tipos_publicacao);
    if (ano && tipo) publicacoes.push({ id: chave, tipo, ano, tipo_bibtex: tipoEntrada });
  }
}

// ---------- mapeamento (gerado por scripts/atualizar-osm.ts) ----------
const osm = (JSON.parse((await lerTexto("dados/osm-mensal.json")) ?? "{}")?.meses ?? []) as Obj[];

// ---------- gravação ----------
function csv(linhas: Obj[]): string {
  if (linhas.length === 0) return "";
  const colunas = Object.keys(linhas[0]);
  const celula = (v: unknown) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(";") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [colunas.join(","), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(","))].join("\n") + "\n";
}
const tabelas: Record<string, Obj[]> = { membros, periodos, eventos, participacoes, projetos, publicacoes, parceiros, "osm-mensal": osm };
await Deno.mkdir(`${SAIDA}/csv`, { recursive: true });
for (const [nome, linhas] of Object.entries(tabelas)) {
  await Deno.writeTextFile(`${SAIDA}/${nome}.json`, JSON.stringify(linhas) + "\n");
  await Deno.writeTextFile(`${SAIDA}/csv/${nome}.csv`, csv(linhas));
}
await Deno.writeTextFile(`${SAIDA}/vocabulario.json`, JSON.stringify(vocab) + "\n");
await Deno.writeTextFile(`${SAIDA}/meta.json`, JSON.stringify({ gerado_em: new Date().toISOString(), hoje, semestre_atual: semestreAtual }) + "\n");

console.log(`[dados] ${membros.length} membros, ${periodos.length} períodos, ${eventos.length} eventos, ` +
            `${projetos.length} projetos, ${publicacoes.length} publicações, ${parceiros.length} parceiros, ${osm.length} meses de OSM`);

// ---------- relatório de problemas ----------
if (problemas.length > 0) {
  console.warn(`[dados] ${problemas.length} problema(s) encontrado(s):`);
  for (const p of problemas) {
    console.warn(`  - ${p.arquivo}: ${p.msg}`);
    if (NO_GITHUB) {
      const arquivo = p.arquivo.replace(/ \(.*\)$/, "");
      console.log(`::warning file=${arquivo},title=Dados do site::${p.msg}`);
    }
  }
  if (ESTRITO) {
    console.error("[dados] VALIDACAO_ESTRITA=1: publicação interrompida até os problemas serem corrigidos.");
    Deno.exit(1);
  }
}
