/**
 * Lê os dados estruturados do site, confere cada valor e gera as tabelas
 * usadas pela página do painel (painel.qmd).
 *
 *   Fontes                                  Saídas (dados/painel/)
 *   _data/vocabulario.yml, _data/parceiros.yml
 *   equipe/*.qmd (cabeçalho)          ->   membros.json, periodos.json, cargos.json,
 *                                          equipe.json (seções da página Equipe),
 *                                          contadores.json (página inicial)
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
for (const chave of ["cursos", "vinculos", "funcoes", "cargos", "tipos_evento", "modalidades",
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

// ---------- membros, períodos e cargos ----------
// A situação (coordenação, atual, egresso) não é informada: é calculada.
type Periodo = { inicio: string; fim: string | null };
const aberto = (p: Periodo) => p.fim === null;
const ano = (mes: string) => mes.slice(0, 4);
const intervaloAnos = (ini: string, fim: string) => ano(ini) === ano(fim) ? ano(ini) : `${ano(ini)} a ${ano(fim)}`;
const estudante = (vinculo: unknown) => vinculo === "graduacao" || vinculo === "pos-graduacao";
const cargosVocab = vocab.cargos as Record<string, Obj>;

/** Lê e valida uma lista de períodos (de função ou de cargo) */
function lerPeriodos(arq: string, rotulo: string, lista: unknown, campo: string, dominio: Obj) {
  const saida: (Periodo & { valor: string })[] = [];
  for (const [i, p] of ((Array.isArray(lista) ? lista : []) as Obj[]).entries()) {
    const ref = `${arq} (${rotulo} ${i + 1})`;
    const valor = noVocabulario(ref, campo, texto(p[campo]), dominio);
    const inicio = texto(p.inicio);
    const fim = texto(p.fim);
    if (!ehMes(inicio)) { problema(ref, `"inicio" deve ser AAAA-MM (encontrado: ${inicio})`); continue; }
    if (fim !== null && !ehMes(fim)) { problema(ref, `"fim" deve ser AAAA-MM (encontrado: ${fim})`); continue; }
    if (fim !== null && fim < inicio!) problema(ref, `"fim" (${fim}) é anterior ao "inicio" (${inicio})`);
    if (inicio! > mesAtual) problema(ref, `"inicio" (${inicio}) está no futuro`);
    if (valor) saida.push({ valor, inicio: inicio!, fim });
  }
  return saida;
}

const membros: Obj[] = [];
const periodos: Obj[] = [];
const mandatos: Obj[] = [];   // períodos de cargo
const pessoas: Obj[] = [];    // dados completos, para montar a página Equipe
for (const e of await listar("equipe")) {
  if (!e.isFile || !e.name.endsWith(".qmd")) continue;
  const arq = `equipe/${e.name}`;
  const fm = await cabecalho(arq);
  if (!fm) continue;
  const id = e.name.replace(/\.qmd$/, "");
  const nome = texto(fm.title) ?? id;
  if (fm.situacao !== undefined) problema(arq, `o campo "situacao" não é mais usado (é calculado pelos períodos) e pode ser apagado`);
  if (fm.description !== undefined) problema(arq, `o campo "description" não é mais usado (é gerado pela função e pelo curso) e pode ser apagado`);
  const vinculo = noVocabulario(arq, "vinculo", texto(fm.vinculo), vocab.vinculos);
  const curso = noVocabulario(arq, "curso", texto(fm.curso), vocab.cursos, estudante(vinculo));

  const ps = lerPeriodos(arq, "período", fm.periodos, "funcao", vocab.funcoes);
  if (ps.length === 0) {
    problema(arq, `sem "periodos": a pessoa não aparece na página Equipe nem no painel`);
    membros.push({ id, situacao: null, vinculo, curso });
    continue;
  }
  if (ps.filter(aberto).length > 1) problema(arq, `mais de um período sem "fim": só o último deveria estar em aberto`);
  const cs = lerPeriodos(arq, "cargo", fm.cargos, "cargo", cargosVocab);

  // Mandatos precisam caber no tempo de participação
  const inicioParticipacao = ps.reduce((m, p) => p.inicio < m ? p.inicio : m, ps[0].inicio);
  const fimParticipacao = ps.some(aberto) ? null : ps.reduce((m, p) => p.fim! > m ? p.fim! : m, ps[0].fim!);
  for (const c of cs) {
    if (c.inicio < inicioParticipacao || (fimParticipacao !== null && (c.fim === null || c.fim > fimParticipacao)))
      problema(arq, `mandato de "${c.valor}" (${c.inicio} a ${c.fim ?? "atual"}) fora do período de participação`);
    if (aberto(c) && cargosVocab[c.valor]?.ativo === false)
      problema(arq, `o cargo "${c.valor}" está desativado no vocabulário e não pode ter mandato em aberto`);
  }

  const ultimo = ps.reduce((u, p) => p.inicio > u.inicio ? p : u, ps[0]);
  const situacao = !aberto(ultimo) ? "egresso" : ultimo.valor === "coordenacao" ? "coordenacao" : "atual";
  for (const p of ps) periodos.push({ membro: id, funcao: p.valor, inicio: p.inicio, fim: p.fim });
  for (const c of cs) mandatos.push({ membro: id, cargo: c.valor, inicio: c.inicio, fim: c.fim });
  membros.push({ id, situacao, vinculo, curso });
  pessoas.push({ id, nome, imagem: texto(fm.image), vinculo, curso, situacao, ultimo, periodos: ps, cargos: cs });
}

// Duas pessoas no mesmo cargo ao mesmo tempo
for (const cargo of Object.keys(cargosVocab)) {
  const ms = mandatos.filter((m) => m.cargo === cargo) as unknown as (Periodo & { membro: string })[];
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    const [a, b] = [ms[i], ms[j]];
    const sobrepoe = a.inicio <= (b.fim ?? "9999-12") && b.inicio <= (a.fim ?? "9999-12");
    if (sobrepoe && a.membro !== b.membro)
      problema("equipe/", `mandatos simultâneos de "${cargo}": ${a.membro} e ${b.membro}`);
  }
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

// ---------- página Equipe ----------
// Seções e textos dos cartões, todos calculados a partir dos dados acima.
type Pessoa = { id: string; nome: string; imagem: string | null; vinculo: string | null; curso: string | null;
                situacao: string; ultimo: Periodo & { valor: string };
                periodos: (Periodo & { valor: string })[]; cargos: (Periodo & { valor: string })[] };
const ps = pessoas as unknown as Pessoa[];
const nomeDe = (dom: string, v: string | null) => (v && (vocab[dom] as Obj)[v] ? String((vocab[dom] as Obj)[v]) : "");
const porNome = (a: Obj, b: Obj) => String(a.nome).localeCompare(String(b.nome), "pt");
const anos = (p: Periodo) => { const [a, b] = [ano(p.inicio), ano(p.fim ?? mesAtual)]; return a === b ? a : `${a}–${b}`; };

function complemento(p: Pessoa) {
  // Curso para estudantes; para os demais, o vínculo (ex.: "Docente")
  return estudante(p.vinculo) ? nomeDe("cursos", p.curso) : nomeDe("vinculos", p.vinculo);
}
function descricaoAtual(p: Pessoa) {
  if (p.situacao === "coordenacao") return nomeDe("vinculos", p.vinculo);
  return [nomeDe("funcoes", p.ultimo.valor), complemento(p)].filter((x) => x).join(", ");
}
function descricaoEgresso(p: Pessoa) {
  const inicio = p.periodos.reduce((m, q) => q.inicio < m ? q.inicio : m, p.periodos[0].inicio);
  const fim = p.periodos.reduce((m, q) => (q.fim ?? m) > m ? q.fim! : m, p.periodos[0].fim ?? inicio);
  const c = complemento(p);
  return `${nomeDe("funcoes", p.ultimo.valor)} de ${intervaloAnos(inicio, fim)}${c ? `, ${c}` : ""}`;
}
const cartao = (p: Pessoa, descricao: string, selo: string | null = null) =>
  ({ id: p.id, nome: p.nome, imagem: p.imagem, selo, descricao });

// Cargos em aberto de cada pessoa, na ordem do vocabulário
const ordemCargo = (c: string) => Number(cargosVocab[c]?.ordem ?? 99);
const cargosAtuais = (p: Pessoa) => p.cargos.filter(aberto).map((c) => c.valor).sort((a, b) => ordemCargo(a) - ordemCargo(b));
const seloCargos = (p: Pessoa) => cargosAtuais(p).map((c) => String(cargosVocab[c]?.nome ?? c)).join(" · ");

const atuais = ps.filter((p) => p.situacao === "atual");
const diretoria = atuais.filter((p) => cargosAtuais(p).length > 0)
  .sort((a, b) => ordemCargo(cargosAtuais(a)[0]) - ordemCargo(cargosAtuais(b)[0]) || porNome(a, b));
const secoes: Obj[] = [
  { id: "coordenacao", titulo: "Coordenação", estilo: "destaque",
    pessoas: ps.filter((p) => p.situacao === "coordenacao").sort(porNome).map((p) => cartao(p, descricaoAtual(p), "Coordenação")) },
  { id: "diretoria", titulo: "Diretoria do capítulo", estilo: "destaque",
    pessoas: diretoria.map((p) => cartao(p, descricaoAtual(p), seloCargos(p))) },
  { id: "equipe-atual", titulo: "Equipe atual", estilo: "normal",
    pessoas: atuais.filter((p) => cargosAtuais(p).length === 0).sort(porNome).map((p) => cartao(p, descricaoAtual(p))) },
  // Egressos: estudantes e colaboradores que saíram; quem saiu da coordenação
  // aparece só em "Coordenações anteriores"
  { id: "egressos", titulo: "Egressos", estilo: "normal", texto: "Pessoas que passaram pelo programa e ajudaram a construí-lo.",
    pessoas: ps.filter((p) => p.situacao === "egresso" && p.ultimo.valor !== "coordenacao").sort(porNome)
               .map((p) => cartao(p, descricaoEgresso(p))) },
];
// Mandatos encerrados: coordenação (pelos períodos) e cada cargo com "historico: true"
const anteriores = (titulo: string, id: string, lista: { p: Pessoa; periodo: Periodo }[]) => ({
  id, titulo, estilo: "compacto",
  pessoas: lista.sort((a, b) => String(b.periodo.fim).localeCompare(String(a.periodo.fim)))
                .map(({ p, periodo }) => cartao(p, anos(periodo))),
});
secoes.push(anteriores("Coordenações anteriores", "coordenacoes-anteriores",
  ps.flatMap((p) => p.periodos.filter((q) => q.valor === "coordenacao" && !aberto(q)).map((periodo) => ({ p, periodo })))));
for (const [cargo, def] of Object.entries(cargosVocab).sort((a, b) => ordemCargo(a[0]) - ordemCargo(b[0]))) {
  if (def.historico !== true) continue;
  secoes.push(anteriores(String(def.titulo_historico ?? `${def.nome}: mandatos anteriores`), `${cargo}-anteriores`,
    ps.flatMap((p) => p.cargos.filter((c) => c.valor === cargo && !aberto(c)).map((periodo) => ({ p, periodo })))));
}
// Texto exibido abaixo do nome na página de perfil de cada pessoa
const perfis: Obj = {};
for (const p of ps) {
  const desc = p.situacao === "egresso" ? descricaoEgresso(p) : descricaoAtual(p);
  const selo = p.situacao === "coordenacao" ? "Coordenação" : seloCargos(p);
  perfis[p.id] = { descricao: [selo, desc].filter((x) => x).join(" · ") };
}
const contadores = {
  estudantes: ps.filter((p) => estudante(p.vinculo) && p.situacao !== "coordenacao").length,
  equipe_atual: atuais.length,
};

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
const tabelas: Record<string, Obj[]> = { membros, periodos, cargos: mandatos, eventos, participacoes, projetos, publicacoes, parceiros, "osm-mensal": osm };
await Deno.mkdir(`${SAIDA}/csv`, { recursive: true });
for (const [nome, linhas] of Object.entries(tabelas)) {
  await Deno.writeTextFile(`${SAIDA}/${nome}.json`, JSON.stringify(linhas) + "\n");
  await Deno.writeTextFile(`${SAIDA}/csv/${nome}.csv`, csv(linhas));
}
await Deno.writeTextFile(`${SAIDA}/vocabulario.json`, JSON.stringify(vocab) + "\n");
await Deno.writeTextFile(`${SAIDA}/equipe.json`, JSON.stringify({ secoes, perfis }) + "\n");
await Deno.writeTextFile(`${SAIDA}/contadores.json`, JSON.stringify(contadores) + "\n");
await Deno.writeTextFile(`${SAIDA}/meta.json`, JSON.stringify({ gerado_em: new Date().toISOString(), hoje, semestre_atual: semestreAtual }) + "\n");

console.log(`[dados] ${membros.length} membros, ${periodos.length} períodos, ${mandatos.length} mandatos, ${eventos.length} eventos, ` +
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
