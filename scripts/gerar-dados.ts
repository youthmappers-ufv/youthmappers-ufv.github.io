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
for (const chave of ["cursos", "vinculos", "funcoes", "cargos", "papeis", "categorias_noticia", "tipos_evento", "modalidades",
                     "tipos_projeto", "tipos_publicacao", "tipos_parceiro", "ods"]) {
  if (!vocab[chave]) { problema("_data/vocabulario.yml", `lista "${chave}" ausente`); vocab[chave] = {}; }
}

const parceiros: Obj[] = [];
const parceirosCompletos: Obj[] = [];
const idsParceiros = new Set<string>();
for (const p of ((await lerYaml("_data/parceiros.yml")) ?? []) as Obj[]) {
  const arq = "_data/parceiros.yml";
  const id = texto(p.id);
  if (!id) { problema(arq, "parceiro sem id"); continue; }
  if (idsParceiros.has(id)) problema(arq, `id repetido: ${id}`);
  idsParceiros.add(id);
  if (!texto(p.nome)) problema(arq, `parceiro ${id} sem nome`);
  const tipo = noVocabulario(`${arq} (${id})`, "tipo", texto(p.tipo), vocab.tipos_parceiro);
  const site = texto(p.site);
  if (site && !/^https?:\/\//.test(site)) problema(`${arq} (${id})`, `"site" deve começar com http:// ou https://`);
  const logo = texto(p.logo);
  if (logo) {
    try { await Deno.stat(logo); } catch { problema(`${arq} (${id})`, `"logo" aponta para "${logo}", que não existe`); }
  }
  if (p.ativo !== undefined && typeof p.ativo !== "boolean") problema(`${arq} (${id})`, `"ativo" deve ser true ou false`);
  const ativo = p.ativo !== false;
  // ações e projetos são contados depois de lidos os eventos e projetos
  parceiros.push({ id, nome: texto(p.nome) ?? id, tipo, ativo, site, logo, acoes: 0, projetos: 0 });
  parceirosCompletos.push({ id, nome: texto(p.nome) ?? id, site });
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

// ---------- horário e agenda ----------
/** "14h às 18h", "14h30 às 16h", "19:00 às 21:00", "das 9h às 12h", "14h" -> ["14:00","18:00"] */
function lerHorario(t: string | null): [string, string | null] | null {
  if (!t) return null;
  const hora = String.raw`(\d{1,2})(?:\s*[h:]\s*(\d{2})?)?\s*h?`;
  const re = new RegExp(String.raw`^\s*(?:das\s+)?` + hora + String.raw`\s*(?:(?:às|as|a|até|-|–)\s*` + hora + String.raw`)?\s*$`, "i");
  const m = t.match(re);
  if (!m) return null;
  const hh = (h: string, mi?: string) => {
    const n = Number(h), mm = Number(mi ?? 0);
    return n <= 23 && mm <= 59 ? `${String(n).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : null;
  };
  const ini = hh(m[1], m[2]);
  const fim = m[3] ? hh(m[3], m[4]) : null;
  if (!ini || (m[3] && !fim)) return null;
  return [ini, fim];
}

// ---------- campos usados só pela ficha ({{< ficha >}}) ----------
const LINHAS_FICHA = {
  evento: ["data", "tipo", "realizacao", "local", "area_mapeada", "carga_horaria", "publico", "equipe", "parceiros", "links", "inscricao", "agenda"],
  noticia: ["data", "categoria", "local", "equipe", "parceiros", "links"],
  projeto: ["tipo", "periodo", "situacao", "coordenacao", "equipe", "ods", "parceiros", "links"],
};
function validarFicha(arq: string, fm: Obj, tipo: "evento" | "projeto" | "noticia") {
  for (const campo of ["horario", "local", "area_mapeada"]) {
    if (fm[campo] !== undefined && fm[campo] !== null && typeof fm[campo] !== "string")
      problema(arq, `"${campo}" deve ser um texto`);
  }
  const tm = fm.tasking_manager;
  if (tm !== undefined && tm !== null && !(Number.isInteger(tm) && (tm as number) > 0))
    problema(arq, `"tasking_manager" deve ser o número do projeto (ex.: 12411)`);
  if (fm.links !== undefined && fm.links !== null) {
    if (!Array.isArray(fm.links)) problema(arq, `"links" deve ser uma lista de itens com "texto" e "url"`);
    else for (const [i, l] of (fm.links as Obj[]).entries()) {
      if (!texto(l?.texto) || !texto(l?.url)) problema(arq, `link ${i + 1}: informe "texto" e "url"`);
      else if (!/^https?:\/\//.test(texto(l.url)!)) problema(arq, `link ${i + 1}: a "url" deve começar com http:// ou https://`);
    }
  }
  const f = fm.ficha as Obj | undefined;
  if (f && typeof f === "object") {
    for (const k of lista(f.ocultar))
      if (!LINHAS_FICHA[tipo].includes(k)) problema(arq, `"ficha.ocultar" não reconhece "${k}" (válidos: ${LINHAS_FICHA[tipo].join(", ")})`);
    if (f.extras !== undefined && !Array.isArray(f.extras)) problema(arq, `"ficha.extras" deve ser uma lista`);
    for (const [i, x] of ((Array.isArray(f.extras) ? f.extras : []) as Obj[]).entries())
      if (!texto(x?.rotulo) || !texto(x?.valor)) problema(arq, `"ficha.extras" item ${i + 1}: informe "rotulo" e "valor"`);
  }
}

// ---------- eventos e participações ----------
const eventos: Obj[] = [];
const agenda: Obj[] = [];   // todos os eventos, com o necessário para agenda e próximos eventos
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
  validarFicha(arq, fm, "evento");
  const papel = noVocabulario(arq, "papel", texto(fm.papel) ?? "organizacao", vocab.papeis);
  // Agenda: data final (eventos de vários dias), horário e inscrição
  const dataFim = texto(fm.data_fim);
  if (dataFim !== null && (!ehData(dataFim) || dataFim.slice(0, 10) < data!.slice(0, 10)))
    problema(arq, `"data_fim" deve ser AAAA-MM-DD, igual ou posterior a "date"`);
  const horario = texto(fm.horario);
  const intervalo = lerHorario(horario);
  if (horario && !intervalo)
    problema(arq, `"horario: ${horario}" não foi reconhecido (use, por exemplo, "14h às 18h"); na agenda, o evento aparece como dia inteiro`);
  const inscricao = texto(fm.inscricao);
  if (inscricao && !/^https?:\/\//.test(inscricao)) problema(arq, `"inscricao" deve ser um endereço começando com http:// ou https://`);
  agenda.push({
    id: e.name, titulo: texto(fm.title) ?? e.name, descricao: texto(fm.description),
    data: data!.slice(0, 10), data_fim: dataFim && ehData(dataFim) ? dataFim.slice(0, 10) : null,
    horario, hora_inicio: intervalo?.[0] ?? null, hora_fim: intervalo?.[1] ?? null,
    tipo: texto(fm.tipo), papel, modalidade: texto(fm.modalidade), local: texto(fm.local), municipio: texto(fm.municipio),
    imagem: texto(fm.image) ? `eventos/${e.name}/${texto(fm.image)}` : null,
    inscricao: inscricao && /^https?:\/\//.test(inscricao) ? inscricao : null,
  });
  if (!tipo) continue;
  eventos.push({ id: e.name, data: data!.slice(0, 10), realizado, tipo, papel, modalidade, municipio,
                 area_mapeada: texto(fm.area_mapeada),
                 carga_horaria: horas, publico, publico_externo: externo, parceiros: parc });
  for (const m of equipe) participacoes.push({ evento: e.name, membro: m });
}

// ---------- notícias ----------
// Participações em eventos de terceiros, conquistas, publicações, parcerias...
const noticias: Obj[] = [];
for (const e of await listar("noticias")) {
  if (!e.isDirectory) continue;
  const arq = `noticias/${e.name}/index.qmd`;
  const fm = await cabecalho(arq);
  if (!fm) continue;
  const data = texto(fm.date);
  if (!ehData(data)) { problema(arq, `"date" ausente ou fora do formato AAAA-MM-DD`); continue; }
  const cats = lista(fm.categories);
  if (cats.length === 0) problema(arq, `informe ao menos uma categoria em "categories" (${Object.keys(vocab.categorias_noticia).join(", ")})`);
  for (const c of cats) if (!(c in vocab.categorias_noticia))
    problema(arq, `categoria "${c}" não está no vocabulário (válidas: ${Object.keys(vocab.categorias_noticia).join(", ")})`);
  if (!texto(fm.description)) problema(arq, `sem "description": o resumo aparece na listagem de notícias`);
  referencias(arq, "equipe", lista(fm.equipe), idsMembros, "equipe/");
  validarFicha(arq, fm, "noticia");
  noticias.push({ id: e.name, data: data!.slice(0, 10), categorias: cats, municipio: texto(fm.municipio),
                  equipe: lista(fm.equipe).filter((m) => idsMembros.has(m)) });
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
  validarFicha(arq, fm, "projeto");
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
// Parceiros: ações realizadas e projetos em que cada um aparece
for (const p of parceiros) {
  p.acoes = eventos.filter((e) => e.realizado && (e.parceiros as string[]).includes(p.id as string)).length;
  p.projetos = projetos.filter((j) => (j.parceiros as string[]).includes(p.id as string)).length;
}
const contadores = {
  parceiros: parceiros.filter((p) => p.ativo).length,
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
const tabelas: Record<string, Obj[]> = { membros, periodos, cargos: mandatos, eventos, participacoes, noticias, projetos, publicacoes, parceiros, "osm-mensal": osm };
await Deno.mkdir(`${SAIDA}/csv`, { recursive: true });
for (const [nome, linhas] of Object.entries(tabelas)) {
  await Deno.writeTextFile(`${SAIDA}/${nome}.json`, JSON.stringify(linhas) + "\n");
  await Deno.writeTextFile(`${SAIDA}/csv/${nome}.csv`, csv(linhas));
}
await Deno.writeTextFile(`${SAIDA}/vocabulario.json`, JSON.stringify(vocab) + "\n");
await Deno.writeTextFile(`${SAIDA}/equipe.json`, JSON.stringify({ secoes, perfis }) + "\n");
await Deno.writeTextFile(`${SAIDA}/contadores.json`, JSON.stringify(contadores) + "\n");
// Nomes usados pelas fichas de eventos e projetos (links para perfis e parceiros)
await Deno.writeTextFile(`${SAIDA}/referencias.json`, JSON.stringify({
  membros: Object.fromEntries(ps.map((p) => [p.id, p.nome])),
  parceiros: Object.fromEntries(parceirosCompletos.map((p) => [p.id, { nome: p.nome, site: p.site ?? null }])),
}) + "\n");
await Deno.writeTextFile(`${SAIDA}/meta.json`, JSON.stringify({ gerado_em: new Date().toISOString(), hoje, semestre_atual: semestreAtual }) + "\n");

console.log(`[dados] ${membros.length} membros, ${periodos.length} períodos, ${mandatos.length} mandatos, ${eventos.length} eventos, ${noticias.length} notícias, ` +
            `${projetos.length} projetos, ${publicacoes.length} publicações, ${parceiros.length} parceiros, ${osm.length} meses de OSM`);

// ---------- agenda: arquivos de calendário (ICS), links e listas ----------
// Endereço do site, para links absolutos na agenda (website.site-url no _quarto.yml)
const configSite = ((await lerYaml("_quarto.yml")) ?? {}) as Obj;
const siteUrl = String(((configSite.website ?? {}) as Obj)["site-url"] ?? "").replace(/\/$/, "");
if (!siteUrl) problema("_quarto.yml", `"website: site-url" ausente: os links da agenda ficam incompletos`);
const nomeTipo = (t: unknown) => String((vocab.tipos_evento as Obj)[String(t)] ?? t ?? "");
// Cor de cada tipo na agenda, na ordem do vocabulário (a mesma paleta do painel)
const PALETA = ["#7a1f21", "#324170", "#bfa13c", "#5f6170", "#b9c2dc", "#d9c38a", "#8c4a4c", "#7f8bb3"];
const corTipo = (t: unknown) => PALETA[Math.max(0, Object.keys(vocab.tipos_evento as Obj).indexOf(String(t))) % PALETA.length];
/** Texto legível sobre a cor: escuro em cores claras (dourado, azul-névoa), branco nas demais */
function corTexto(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? "#1d2b36" : "#ffffff";
}

function diaSeguinte(d: string) {
  const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10);
}
function maisHoras(hhmm: string, h: number) {
  const [a, b] = hhmm.split(":").map(Number); const t = Math.min(a * 60 + b + h * 60, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
/** Início e fim do evento para calendários: com horário (fuso de Brasília) ou dia inteiro */
function periodo(ev: Obj) {
  const d0 = ev.data as string, d1 = (ev.data_fim as string | null) ?? d0;
  if (ev.hora_inicio) {
    const fim = (ev.hora_fim as string | null) ?? maisHoras(ev.hora_inicio as string, 2);
    return { diaInteiro: false, inicio: `${d0}T${ev.hora_inicio}`, fim: `${d1}T${fim}` };
  }
  return { diaInteiro: true, inicio: d0, fim: diaSeguinte(d1) };   // no ICS, o fim de dia inteiro é exclusivo
}
const lugar = (ev: Obj) =>
  [ev.local, ev.modalidade === "remota" ? null : ev.municipio].filter((x) => x).join(", ") ||
  (ev.modalidade === "remota" ? "Online" : "");

// Formato iCalendar (RFC 5545): textos escapados e linhas de até 75 bytes
const icsTexto = (t: unknown) => String(t ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function dobrar(linha: string) {
  const bytes = new TextEncoder().encode(linha);
  if (bytes.length <= 75) return linha;
  const partes: string[] = []; let atual = "", tam = 0, limite = 75;
  for (const ch of linha) {
    const n = new TextEncoder().encode(ch).length;
    if (tam + n > limite) { partes.push(atual); atual = ""; tam = 0; limite = 74; }
    atual += ch; tam += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}
const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
const dominio = siteUrl.replace(/^https?:\/\//, "") || "youthmappers-ufv";
function vevent(ev: Obj) {
  const p = periodo(ev);
  const dt = (v: string) => v.replace(/[-:]/g, "") + (p.diaInteiro ? "" : "00");
  const url = `${siteUrl}/eventos/${ev.id}/`;
  const desc = [ev.descricao, ev.inscricao ? `Inscrições: ${ev.inscricao}` : null, `Mais informações: ${url}`].filter((x) => x).join("\n");
  return [
    "BEGIN:VEVENT",
    `UID:${ev.id}@${dominio}`,
    `DTSTAMP:${carimbo}`,
    p.diaInteiro ? `DTSTART;VALUE=DATE:${dt(p.inicio)}` : `DTSTART;TZID=America/Sao_Paulo:${dt(p.inicio)}`,
    p.diaInteiro ? `DTEND;VALUE=DATE:${dt(p.fim)}` : `DTEND;TZID=America/Sao_Paulo:${dt(p.fim)}`,
    `SUMMARY:${icsTexto(ev.titulo)}`,
    `DESCRIPTION:${icsTexto(desc)}`,
    lugar(ev) ? `LOCATION:${icsTexto(lugar(ev))}` : null,
    `CATEGORIES:${icsTexto(nomeTipo(ev.tipo))}`,
    `URL:${url}`,
    "END:VEVENT",
  ].filter((x) => x) as string[];
}
function calendario(nome: string, evs: Obj[]) {
  const linhas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//YouthMappers UFV//Agenda do site//PT", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsTexto(nome)}`, "X-WR-TIMEZONE:America/Sao_Paulo",
    // Fuso de Brasília: UTC−3, sem horário de verão desde 2019
    "BEGIN:VTIMEZONE", "TZID:America/Sao_Paulo", "BEGIN:STANDARD", "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0300", "TZOFFSETTO:-0300", "TZNAME:-03", "END:STANDARD", "END:VTIMEZONE",
    ...evs.flatMap(vevent), "END:VCALENDAR",
  ];
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
/** Link "adicionar à Agenda Google" de um evento */
function linkGoogle(ev: Obj) {
  const p = periodo(ev);
  const dt = (v: string) => v.replace(/[-:]/g, "") + (p.diaInteiro ? "" : "00");
  const q = new URLSearchParams({
    action: "TEMPLATE", text: String(ev.titulo), dates: `${dt(p.inicio)}/${dt(p.fim)}`,
    details: [ev.descricao, `${siteUrl}/eventos/${ev.id}/`].filter((x) => x).join("\n\n"),
    location: lugar(ev), ctz: "America/Sao_Paulo",
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

agenda.sort((a, b) => String(a.data).localeCompare(String(b.data)));
for (const ev of agenda) {
  const p = periodo(ev);
  Object.assign(ev, {
    url: `eventos/${ev.id}/`, inicio: p.inicio, fim: p.fim, dia_inteiro: p.diaInteiro, lugar: lugar(ev),
    tipo_nome: nomeTipo(ev.tipo), cor: corTipo(ev.tipo), cor_texto: corTexto(corTipo(ev.tipo)), google: linkGoogle(ev), ics: `dados/painel/ics/${ev.id}.ics`,
    // último dia do evento: a partir do dia seguinte ele deixa de ser "próximo"
    termina: (ev.data_fim as string | null) ?? ev.data,
  });
}
await Deno.mkdir(`${SAIDA}/ics`, { recursive: true });
for (const ev of agenda) await Deno.writeTextFile(`${SAIDA}/ics/${ev.id}.ics`, calendario(String(ev.titulo), [ev]));
// Agenda completa para assinar: fica na raiz do site (https://.../agenda.ics)
await Deno.writeTextFile("agenda.ics", calendario("YouthMappers UFV", agenda));
await Deno.writeTextFile(`${SAIDA}/agenda.json`, JSON.stringify(agenda) + "\n");

// Ações já realizadas, para a seção "Ações recentes" da página inicial.
// Links são resolvidos a partir desta pasta; imagens, a partir da página que exibe a lista.
const realizadas = agenda.filter((ev) => String(ev.termina) < hoje).reverse().map((ev) => {
  const item: Obj = { title: ev.titulo, path: `../../eventos/${ev.id}/index.qmd`, date: ev.data };
  if (ev.descricao) item.description = ev.descricao;
  if (ev.imagem) item.image = ev.imagem;
  return item;
});
const { stringify } = await import("npm:yaml@2.6.1");
await Deno.writeTextFile(`${SAIDA}/eventos-realizados.yml`, stringify(realizadas));

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
