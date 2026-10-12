// =====================================================================
//  verificar-candidatos.ts — conferência de elegibilidade por edições no OSM
//  Capítulo YouthMappers UFV
// =====================================================================
//  Lê uma lista de candidatos (nome + usuário do OpenStreetMap), consulta a
//  API pública do OSM e informa, para cada um, quantas edições e changesets
//  COM A HASHTAG do capítulo existem no período, comparando com os mínimos
//  do regimento. Também sorteia changesets para a revisão de qualidade.
//
//  Roda no seu computador, fora do site e do GitHub. Nada é publicado.
//  Precisa de internet apenas para consultar a API do OSM.
//
//  USO (Quarto já traz o Deno, não precisa instalar nada):
//
//    quarto run scripts/verificar-candidatos.ts privado/candidatos.csv --desde 2026-03-01
//    quarto run scripts/verificar-candidatos.ts --usuario maria_osm --nome "Maria Silva" --desde 2026-03-01
//
//  Se tiver o Deno instalado, também serve:
//    deno run --allow-net=api.openstreetmap.org --allow-read --allow-write \
//        scripts/verificar-candidatos.ts privado/candidatos.csv --desde 2026-03-01
//
//  ARQUIVO DE CANDIDATOS (CSV, UTF-8 ou o "CSV" do Excel em português):
//    nome;osm;desde;ate
//    Maria Silva;maria_osm;2026-03-01;
//    João Souza;joao.s;2026-08-10;2026-10-31
//  As colunas "desde" e "ate" são opcionais (valem só para aquela linha).
//  Aceita ; , ou tabulação como separador, e o endereço do perfil no lugar
//  do usuário (https://www.openstreetmap.org/user/maria_osm).
//
//  OPÇÕES (todas sobrepõem o arquivo de critérios):
//    --desde AAAA-MM-DD     início da contagem (início do ciclo de capacitação)
//    --ate AAAA-MM-DD       fim da contagem (padrão: hoje)
//    --hashtag nome         hashtag exigida, sem "#" (pode repetir)
//    --min-edicoes N        mínimo de edições com a hashtag
//    --min-changesets N     mínimo de changesets com a hashtag
//    --amostra N            changesets sorteados para a revisão de qualidade
//    --criterios arquivo    arquivo de critérios (padrão: criterios-ingresso.yml
//                           ao lado deste script)
//    --saida relatorio.csv  grava também um CSV (abre direto no Excel)
//    --semente texto        muda o sorteio da amostra de revisão
//    --xml arquivo.xml      usa uma resposta da API já salva, em vez de consultar
//                           (só com --usuario; serve para testar e para guardar
//                           a evidência de uma verificação)
//    --ajuda                mostra este resumo
//
//  PRIVACIDADE: a lista de candidatos e o relatório contêm nomes e avaliações.
//  Guarde-os fora do repositório público (por exemplo, em privado/, que deve
//  constar no .gitignore).
// =====================================================================
import { XMLParser } from "npm:fast-xml-parser@4.5.0";
import { parse as parseYaml } from "npm:yaml@2.6.1";

// ---------------------------------------------------------------------
//  Tipos e padrões
// ---------------------------------------------------------------------
interface Criterios {
  hashtags: string[];
  min_edicoes: number;
  min_changesets: number;
  amostra_revisao: number;
  desde?: string;
  ate?: string;
  pausa_ms: number;
  contato: string;
}

const PADRAO: Criterios = {
  hashtags: ["youthmappersufv"],
  min_edicoes: 200,
  min_changesets: 10,
  amostra_revisao: 3,
  pausa_ms: 1000,
  contato: "youthmapperschapter@ufv.br",
};

const API_PADRAO = "https://api.openstreetmap.org";
const TAMANHO_PAGINA = 100; // a API devolve no máximo 100 changesets por consulta

interface Candidato {
  nome: string;
  usuario: string;
  desde?: string;
  ate?: string;
}

interface Changeset {
  id: string;
  uid: string;
  usuario: string;
  criado: Date;
  edicoes: number;
  criadas: number;
  modificadas: number;
  excluidas: number;
  comentarios: number; // discussões abertas no changeset (comments_count)
  comentario: string;
  ferramenta: string;
  tags: Record<string, string>;
}

interface Resumo {
  changesets: number;
  edicoes: number;
  criadas: number;
  modificadas: number;
  excluidas: number;
}

interface Resultado {
  candidato: Candidato;
  desde: string;
  ate: string;
  uid?: string;
  usuarioOSM?: string;
  com: Resumo;
  sem: Resumo;
  okEdicoes: boolean;
  okChangesets: boolean;
  faltamEdicoes: number;
  faltamChangesets: number;
  status: "ATENDE" | "NAO_ATENDE" | "ERRO";
  amostra: Changeset[];
  erro?: string;
}

class ErroUsuario extends Error {}

// ---------------------------------------------------------------------
//  Utilitários
// ---------------------------------------------------------------------
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function validarData(s: string, rotulo: string): string {
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(`${s}T00:00:00Z`)) &&
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!ok) throw new Error(`${rotulo}: use o formato AAAA-MM-DD (recebido: "${s}")`);
  return s;
}
const inicioDoDia = (s: string) => new Date(`${s}T00:00:00Z`);
const fimDoDia = (s: string) => new Date(`${s}T23:59:59Z`);
const isoSemMs = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const hojeISO = () => new Date().toISOString().slice(0, 10);

function inteiroPositivo(v: unknown, rotulo: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${rotulo}: informe um número inteiro maior ou igual a zero (recebido: "${v}")`);
  return n;
}

function normalizarHashtag(h: string): string {
  return h.trim().replace(/^#/, "").toLowerCase();
}

// Sorteio reprodutível: o mesmo candidato, período e semente dão a mesma amostra.
function hashTexto(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function gerador(semente: number) {
  let a = semente;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sortear<T>(itens: T[], n: number, semente: string): T[] {
  const copia = [...itens];
  const rnd = gerador(hashTexto(semente));
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

// ---------------------------------------------------------------------
//  Argumentos da linha de comando
// ---------------------------------------------------------------------
interface Opcoes {
  arquivo?: string;
  usuario?: string;
  nome?: string;
  criterios?: string;
  saida?: string;
  xml?: string;
  api: string;
  semente: string;
  ajuda: boolean;
  sobre: Partial<Criterios>;
}

function lerArgs(args: string[]): Opcoes {
  const o: Opcoes = { api: API_PADRAO, semente: "", ajuda: false, sobre: {} };
  const hashtags: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const valor = () => {
      const v = args[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`a opção ${a} precisa de um valor`);
      return v;
    };
    switch (a) {
      case "--ajuda": case "-h": case "--help": o.ajuda = true; break;
      case "--usuario": o.usuario = valor(); break;
      case "--nome": o.nome = valor(); break;
      case "--criterios": o.criterios = valor(); break;
      case "--saida": o.saida = valor(); break;
      case "--xml": o.xml = valor(); break;
      case "--api": o.api = valor().replace(/\/+$/, ""); break;
      case "--semente": o.semente = valor(); break;
      case "--desde": o.sobre.desde = validarData(valor(), "--desde"); break;
      case "--ate": o.sobre.ate = validarData(valor(), "--ate"); break;
      case "--hashtag": hashtags.push(normalizarHashtag(valor())); break;
      case "--min-edicoes": o.sobre.min_edicoes = inteiroPositivo(valor(), "--min-edicoes"); break;
      case "--min-changesets": o.sobre.min_changesets = inteiroPositivo(valor(), "--min-changesets"); break;
      case "--amostra": o.sobre.amostra_revisao = inteiroPositivo(valor(), "--amostra"); break;
      default:
        if (a.startsWith("--")) throw new Error(`opção desconhecida: ${a} (use --ajuda)`);
        if (o.arquivo) throw new Error(`mais de um arquivo informado: "${o.arquivo}" e "${a}"`);
        o.arquivo = a;
    }
  }
  if (hashtags.length) o.sobre.hashtags = hashtags;
  return o;
}

function ajuda(): string {
  return `verificar-candidatos.ts — elegibilidade por edições no OpenStreetMap

Uso:
  quarto run scripts/verificar-candidatos.ts <candidatos.csv> --desde AAAA-MM-DD
  quarto run scripts/verificar-candidatos.ts --usuario <osm> [--nome "Nome"] --desde AAAA-MM-DD

Opções: --desde, --ate, --hashtag, --min-edicoes, --min-changesets, --amostra,
        --criterios, --saida, --semente, --xml, --ajuda
Veja o cabeçalho do script para a descrição completa.`;
}

// ---------------------------------------------------------------------
//  Critérios (padrões < arquivo YAML < linha de comando)
// ---------------------------------------------------------------------
async function carregarCriterios(o: Opcoes): Promise<{ c: Criterios; origem: string }> {
  let doArquivo: Partial<Criterios> = {};
  let origem = "padrões do script";
  let caminho: string | URL | undefined = o.criterios;
  const explicito = caminho !== undefined;
  if (!caminho) caminho = new URL("./criterios-ingresso.yml", import.meta.url);
  try {
    const texto = await Deno.readTextFile(caminho);
    // deno-lint-ignore no-explicit-any
    const y: any = parseYaml(texto) ?? {};
    doArquivo = {
      hashtags: Array.isArray(y.hashtags) ? y.hashtags.map(String) : undefined,
      min_edicoes: y.min_edicoes !== undefined ? inteiroPositivo(y.min_edicoes, "min_edicoes") : undefined,
      min_changesets: y.min_changesets !== undefined ? inteiroPositivo(y.min_changesets, "min_changesets") : undefined,
      amostra_revisao: y.amostra_revisao !== undefined ? inteiroPositivo(y.amostra_revisao, "amostra_revisao") : undefined,
      desde: y.desde !== undefined ? validarData(String(y.desde), "desde") : undefined,
      ate: y.ate !== undefined ? validarData(String(y.ate), "ate") : undefined,
      pausa_ms: y.pausa_ms !== undefined ? inteiroPositivo(y.pausa_ms, "pausa_ms") : undefined,
      contato: y.contato !== undefined ? String(y.contato) : undefined,
    };
    origem = String(caminho instanceof URL ? caminho.pathname : caminho).split(/[\\/]/).pop() ?? origem;
  } catch (e) {
    if (explicito || !(e instanceof Deno.errors.NotFound)) {
      throw new Error(`não consegui ler o arquivo de critérios: ${(e as Error).message}`);
    }
  }
  const limpo = <T extends object>(x: T) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined));
  const c = { ...PADRAO, ...limpo(doArquivo), ...limpo(o.sobre) } as Criterios;
  c.hashtags = c.hashtags.map(normalizarHashtag).filter((h) => h !== "");
  if (!c.hashtags.length) throw new Error("é preciso ao menos uma hashtag nos critérios");
  return { c, origem };
}

// ---------------------------------------------------------------------
//  Lista de candidatos (CSV)
// ---------------------------------------------------------------------
function decodificar(bytes: Uint8Array): string {
  let b = bytes;
  if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.subarray(3); // BOM
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    return new TextDecoder("windows-1252").decode(b); // "CSV" do Excel em português
  }
}

function dividirLinha(linha: string, delim: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) {
      if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (ch === '"') aspas = false;
      else atual += ch;
    } else if (ch === '"') aspas = true;
    else if (ch === delim) { campos.push(atual.trim()); atual = ""; }
    else atual += ch;
  }
  campos.push(atual.trim());
  return campos;
}

function usuarioDoTexto(t: string): string {
  let u = t.trim().replace(/^@/, "");
  const m = u.match(/openstreetmap\.org\/user\/([^/?#]+)/i);
  if (m) {
    try { u = decodeURIComponent(m[1]); } catch { u = m[1]; }
  }
  return u.replace(/\+/g, " ").trim();
}

function lerCandidatos(texto: string): Candidato[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  if (!linhas.length) return [];
  const primeira = linhas[0];
  const cont = (ch: string) => primeira.split(ch).length - 1;
  const delim = [";", "\t", ","].sort((a, b) => cont(b) - cont(a))[0];
  const tabela = linhas.map((l) => dividirLinha(l, delim));

  const sem = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cab = tabela[0].map(sem);
  const idx = (nomes: string[]) => cab.findIndex((c) => nomes.includes(c));
  const iUsuario = idx(["osm", "usuario", "username", "osm_username", "user"]);
  const temCabecalho = iUsuario >= 0;
  const iNome = temCabecalho ? idx(["nome", "name"]) : 0;
  const iDesde = temCabecalho ? idx(["desde", "inicio", "start"]) : 2;
  const iAte = temCabecalho ? idx(["ate", "fim", "end"]) : 3;
  const colUsuario = temCabecalho ? iUsuario : 1;

  return tabela.slice(temCabecalho ? 1 : 0).map((c, n) => {
    const usuario = usuarioDoTexto(c[colUsuario] ?? "");
    const nome = (iNome >= 0 ? c[iNome] : "") || usuario;
    const dado = (i: number) => (i >= 0 && c[i] ? c[i] : undefined);
    try {
      return {
        nome,
        usuario,
        desde: dado(iDesde) ? validarData(dado(iDesde)!, `linha ${n + 1}, "desde"`) : undefined,
        ate: dado(iAte) ? validarData(dado(iAte)!, `linha ${n + 1}, "ate"`) : undefined,
      };
    } catch (e) {
      throw new Error(`candidatos: ${(e as Error).message}`);
    }
  }).filter((c) => c.usuario !== "");
}

// ---------------------------------------------------------------------
//  API do OpenStreetMap
// ---------------------------------------------------------------------
const analisador = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  isArray: (nome: string) => nome === "changeset" || nome === "tag",
});

function lerChangesets(xml: string): Changeset[] {
  // deno-lint-ignore no-explicit-any
  const doc: any = analisador.parse(xml);
  if (!doc || doc.osm === undefined) throw new Error("resposta inesperada da API (não é XML do OSM)");
  // deno-lint-ignore no-explicit-any
  const lista: any[] = doc.osm?.changeset ?? [];
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return lista.map((c) => {
    const tags: Record<string, string> = {};
    // deno-lint-ignore no-explicit-any
    for (const t of (c.tag ?? []) as any[]) tags[String(t["@_k"])] = String(t["@_v"] ?? "");
    const criadas = n(c["@_created_count"]);
    const modificadas = n(c["@_modified_count"]);
    const excluidas = n(c["@_deleted_count"]);
    const total = c["@_changes_count"] !== undefined ? n(c["@_changes_count"]) : criadas + modificadas + excluidas;
    return {
      id: String(c["@_id"]),
      uid: String(c["@_uid"] ?? ""),
      usuario: String(c["@_user"] ?? ""),
      criado: new Date(String(c["@_created_at"])),
      edicoes: total,
      criadas,
      modificadas,
      excluidas,
      comentarios: n(c["@_comments_count"]),
      comentario: tags["comment"] ?? "",
      ferramenta: (tags["created_by"] ?? "").replace(/[\s/]+v?\d.*$/, "") || "(não informada)",
      tags,
    };
  });
}

async function baixarXML(url: string, contato: string): Promise<string> {
  const MAX = 4;
  for (let tentativa = 1; tentativa <= MAX; tentativa++) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        headers: { "User-Agent": `youthmappers-ufv-verificador/1.0 (${contato})`, "Accept": "application/xml" },
      });
    } catch (e) {
      if (tentativa === MAX) throw new Error(`falha de rede: ${(e as Error).message}`);
      await dormir(2000 * tentativa);
      continue;
    }
    const corpo = await resp.text();
    if (resp.status === 404) throw new ErroUsuario("usuário não encontrado no OpenStreetMap (confira a grafia)");
    if (resp.ok) return corpo;
    if ([429, 500, 502, 503, 504, 509].includes(resp.status) && tentativa < MAX) {
      await dormir(3000 * tentativa);
      continue;
    }
    throw new Error(`HTTP ${resp.status}${corpo ? ": " + corpo.slice(0, 120).replace(/\s+/g, " ") : ""}`);
  }
  throw new Error("não foi possível consultar a API");
}

// A API devolve até 100 changesets por consulta, do mais novo para o mais
// antigo. Para períodos com mais que isso, repete a consulta recuando o fim
// da janela até esgotar. Os repetidos são descartados pelo id.
async function buscarChangesets(
  usuario: string, desde: Date, ate: Date, api: string, c: Criterios,
): Promise<Changeset[]> {
  const todos = new Map<string, Changeset>();
  let limite = ate;
  for (let pagina = 1; pagina <= 500; pagina++) {
    const url = `${api}/api/0.6/changesets?display_name=${encodeURIComponent(usuario)}&time=${isoSemMs(desde)},${isoSemMs(limite)}`;
    const lote = lerChangesets(await baixarXML(url, c.contato));
    let novos = 0;
    for (const x of lote) {
      if (!todos.has(x.id)) { todos.set(x.id, x); novos++; }
    }
    if (lote.length < TAMANHO_PAGINA || novos === 0) break;
    const maisAntigo = Math.min(...lote.map((x) => x.criado.getTime()));
    limite = new Date(maisAntigo + 1000); // +1 s: garante sobreposição, o id desfaz a repetição
    await dormir(c.pausa_ms);
  }
  // A API inclui changesets "fechados depois do início"; aqui vale a data de criação.
  return [...todos.values()].filter((x) => x.criado >= desde && x.criado <= ate);
}

// ---------------------------------------------------------------------
//  Cálculo
// ---------------------------------------------------------------------
function temHashtag(cs: Changeset, aceitas: string[]): boolean {
  const texto = `${cs.tags["comment"] ?? ""} ${cs.tags["hashtags"] ?? ""}`;
  const achadas = (texto.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map((h) => h.slice(1).toLowerCase());
  return achadas.some((h) => aceitas.includes(h));
}

function resumir(lista: Changeset[]): Resumo {
  return lista.reduce<Resumo>((r, x) => ({
    changesets: r.changesets + 1,
    edicoes: r.edicoes + x.edicoes,
    criadas: r.criadas + x.criadas,
    modificadas: r.modificadas + x.modificadas,
    excluidas: r.excluidas + x.excluidas,
  }), { changesets: 0, edicoes: 0, criadas: 0, modificadas: 0, excluidas: 0 });
}

function avaliar(
  cand: Candidato, lista: Changeset[], desde: string, ate: string, c: Criterios, semente: string,
): Resultado {
  const com = lista.filter((x) => temHashtag(x, c.hashtags));
  const sem = lista.filter((x) => !temHashtag(x, c.hashtags));
  const rCom = resumir(com);
  const okEdicoes = rCom.edicoes >= c.min_edicoes;
  const okChangesets = rCom.changesets >= c.min_changesets;
  const atende = okEdicoes && okChangesets;
  const amostra = atende
    ? sortear(com, c.amostra_revisao, `${cand.usuario.toLowerCase()}|${desde}|${semente}`)
      .sort((a, b) => a.criado.getTime() - b.criado.getTime())
    : [];
  return {
    candidato: cand, desde, ate,
    uid: lista[0]?.uid, usuarioOSM: lista[0]?.usuario,
    com: rCom, sem: resumir(sem),
    okEdicoes, okChangesets,
    faltamEdicoes: Math.max(0, c.min_edicoes - rCom.edicoes),
    faltamChangesets: Math.max(0, c.min_changesets - rCom.changesets),
    status: atende ? "ATENDE" : "NAO_ATENDE",
    amostra,
  };
}

// ---------------------------------------------------------------------
//  Saída
// ---------------------------------------------------------------------
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

function imprimir(r: Resultado, c: Criterios) {
  const cand = r.candidato;
  const ident = [`@${r.usuarioOSM ?? cand.usuario}`, r.uid ? `uid ${r.uid}` : ""].filter(Boolean).join(" · ");
  console.log(`\n${cand.nome}  (${ident})  período ${r.desde || "(início não informado)"} → ${r.ate}`);
  if (r.status === "ERRO") {
    console.log(`  ✘ ERRO: ${r.erro}`);
    return;
  }
  const det = (x: Resumo) => `criadas ${x.criadas} · modificadas ${x.modificadas} · excluídas ${x.excluidas}`;
  console.log(`  Com a hashtag   ${plural(r.com.edicoes, "edição", "edições")} em ${plural(r.com.changesets, "changeset", "changesets")}  (${det(r.com)})`);
  if (r.sem.changesets > 0) {
    console.log(`  Sem a hashtag   ${plural(r.sem.edicoes, "edição", "edições")} em ${plural(r.sem.changesets, "changeset", "changesets")}  (não contam para a elegibilidade)`);
  }
  const linha = (rot: string, tem: number, min: number, ok: boolean, falta: number, un: string) =>
    console.log(`  ${rot.padEnd(14)}${String(tem).padStart(5)} de ${String(min).padEnd(5)} ${ok ? "✔" : `✘ faltam ${falta} ${un}`}`);
  linha("Edições", r.com.edicoes, c.min_edicoes, r.okEdicoes, r.faltamEdicoes, "edições");
  linha("Changesets", r.com.changesets, c.min_changesets, r.okChangesets, r.faltamChangesets, "changesets");
  if (r.status === "ATENDE") {
    console.log(`  Resultado: ATENDE À CONTAGEM de edições. Pendentes: revisão da amostra abaixo,`);
    console.log(`             frequência no ciclo e termo de adesão.`);
    for (const x of r.amostra) {
      const nota = x.comentarios > 0 ? ` · ${x.comentarios} comentário(s) no changeset` : "";
      console.log(`    https://www.openstreetmap.org/changeset/${x.id} · ${x.criado.toISOString().slice(0, 10)} · ${x.edicoes} ed. · ${x.ferramenta}${nota}`);
    }
  } else {
    console.log(`  Resultado: AINDA NÃO ATENDE À CONTAGEM.`);
  }
}

function csvCampo(v: string | number | boolean): string {
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function gerarCSV(rs: Resultado[], c: Criterios): string {
  const cab = [
    "nome", "usuario_osm", "uid", "desde", "ate", "hashtags", "min_edicoes", "min_changesets",
    "edicoes_com_hashtag", "changesets_com_hashtag", "criadas", "modificadas", "excluidas",
    "edicoes_sem_hashtag", "changesets_sem_hashtag", "atende_edicoes", "atende_changesets",
    "faltam_edicoes", "faltam_changesets", "resultado", "amostra_revisao", "erro",
  ];
  const linhas = rs.map((r) => [
    r.candidato.nome, r.usuarioOSM ?? r.candidato.usuario, r.uid ?? "", r.desde, r.ate,
    c.hashtags.map((h) => "#" + h).join(" "), c.min_edicoes, c.min_changesets,
    r.com.edicoes, r.com.changesets, r.com.criadas, r.com.modificadas, r.com.excluidas,
    r.sem.edicoes, r.sem.changesets,
    r.status === "ERRO" ? "" : r.okEdicoes ? "sim" : "não",
    r.status === "ERRO" ? "" : r.okChangesets ? "sim" : "não",
    r.faltamEdicoes, r.faltamChangesets,
    r.status === "ATENDE" ? "atende à contagem" : r.status === "NAO_ATENDE" ? "não atende" : "erro",
    r.amostra.map((x) => `https://www.openstreetmap.org/changeset/${x.id}`).join(" "),
    r.erro ?? "",
  ].map(csvCampo).join(";"));
  return "\uFEFF" + [cab.join(";"), ...linhas].join("\r\n") + "\r\n"; // BOM: o Excel reconhece os acentos
}

// ---------------------------------------------------------------------
//  Programa principal
// ---------------------------------------------------------------------
async function principal(): Promise<number> {
  const o = lerArgs(Deno.args);
  if (o.ajuda || (!o.arquivo && !o.usuario)) {
    console.log(ajuda());
    return o.ajuda ? 0 : 1;
  }
  if (o.xml && !o.usuario) throw new Error("--xml só funciona junto com --usuario (um candidato por vez)");

  const { c, origem } = await carregarCriterios(o);

  let candidatos: Candidato[];
  if (o.usuario) {
    candidatos = [{ nome: o.nome ?? o.usuario, usuario: usuarioDoTexto(o.usuario) }];
  } else {
    candidatos = lerCandidatos(decodificar(await Deno.readFile(o.arquivo!)));
    if (!candidatos.length) throw new Error(`nenhum candidato encontrado em ${o.arquivo}`);
  }

  console.log("Verificação de candidatos — Capítulo YouthMappers UFV");
  console.log(`Critérios (${origem}): hashtag ${c.hashtags.map((h) => "#" + h).join(" ou ")} · mínimo de ${c.min_edicoes} edições em ${c.min_changesets} changesets · amostra de revisão: ${c.amostra_revisao}`);
  console.log(o.xml ? `Fonte: arquivo ${o.xml}` : `Fonte: API do OpenStreetMap (${o.api})`);

  const resultados: Resultado[] = [];
  for (let i = 0; i < candidatos.length; i++) {
    const cand = candidatos[i];
    const desde = cand.desde ?? c.desde;
    const ate = cand.ate ?? c.ate ?? hojeISO();
    let r: Resultado;
    try {
      if (!desde) throw new Error('informe o início da contagem: --desde AAAA-MM-DD (ou a coluna "desde")');
      if (desde > ate) throw new Error(`o início (${desde}) é posterior ao fim (${ate})`);
      const d1 = inicioDoDia(desde), d2 = fimDoDia(ate);
      const lista = o.xml
        ? lerChangesets(await Deno.readTextFile(o.xml)).filter((x) => x.criado >= d1 && x.criado <= d2)
        : await buscarChangesets(cand.usuario, d1, d2, o.api, c);
      r = avaliar(cand, lista, desde, ate, c, o.semente);
    } catch (e) {
      const vazio: Resumo = { changesets: 0, edicoes: 0, criadas: 0, modificadas: 0, excluidas: 0 };
      r = {
        candidato: cand, desde: desde ?? "", ate, com: vazio, sem: vazio,
        okEdicoes: false, okChangesets: false, faltamEdicoes: 0, faltamChangesets: 0,
        status: "ERRO", amostra: [], erro: (e as Error).message,
      };
    }
    resultados.push(r);
    imprimir(r, c);
    if (!o.xml && i < candidatos.length - 1) await dormir(c.pausa_ms);
  }

  const n = (s: Resultado["status"]) => resultados.filter((r) => r.status === s).length;
  console.log(`\nResumo: ${resultados.length} candidato(s): ${n("ATENDE")} atende(m) à contagem, ${n("NAO_ATENDE")} ainda não, ${n("ERRO")} com erro.`);
  console.log("Lembrete: a contagem não substitui a frequência mínima no ciclo, a aprovação da amostra de changesets e o termo de adesão.");

  if (o.saida) {
    await Deno.writeTextFile(o.saida, gerarCSV(resultados, c));
    console.log(`Relatório gravado em ${o.saida}`);
  }
  return 0;
}

if (import.meta.main) {
  try {
    Deno.exit(await principal());
  } catch (e) {
    console.error(`Erro: ${(e as Error).message}`);
    Deno.exit(1);
  }
}
