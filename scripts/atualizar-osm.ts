/**
 * Atualiza as estatísticas de mapeamento do programa, consultando a API
 * ohsomeNow stats (HeiGIT) pela hashtag do programa, mês a mês:
 *   https://stats.now.ohsome.org/api/stats/interval?hashtag=...&startdate=...&interval=P1M&topics=...
 *
 * Grava dois arquivos:
 *   dados/osm-mensal.json  série mensal de cada tema (usada pelo painel)
 *   dados/osm.json         totais (usados pelo contador da página inicial)
 *
 * Roda antes de cada renderização (pre-render no _quarto.yml), no
 * `quarto preview` e na publicação no GitHub. É TypeScript executado pelo
 * Deno que vem embutido no Quarto: não precisa instalar nada.
 *
 * - Consulta a API no máximo a cada 12 horas (cache no campo "consultado_em").
 * - Se a API falhar ou não houver internet, mantém os arquivos como estão.
 */

const HASHTAG = Deno.env.get("HASHTAG") ?? "youthmappersufv"; // sem o #
// Primeiro dia consultado. Não há edições com a hashtag antes de 2022
// (a soma mensal desde esta data coincide com o total desde 1970).
const INICIO = "2022-01-01T00:00:00Z";
const ARQ_MENSAL = "dados/osm-mensal.json";
const ARQ_TOTAIS = "dados/osm.json";
const VALIDADE_HORAS = 12;

// Campo nos arquivos de dados  ->  tópico da API ohsomeNow.
// Significado de cada tópico: página de ajuda do painel ohsomeNow (https://ohsome-now.heigit.org)
//   edit      número de edições em elementos principais do mapa
//   building  saldo de edificações (criadas − removidas)
//   poi       saldo de pontos de interesse (criados − removidos)
//   road      saldo de vias em km (inclui calçadas e trilhas: highway=*)
//   waterway  saldo de cursos d'água em km (rios, canais, córregos, valas)
const TOPICOS: Record<string, string> = {
  edicoes: "edit",
  edificacoes: "building",
  pois: "poi",
  vias_km: "road",
  cursos_agua_km: "waterway",
};

const url = "https://stats.now.ohsome.org/api/stats/interval?" + new URLSearchParams({
  hashtag: HASHTAG,
  startdate: INICIO,
  interval: "P1M",
  topics: Object.values(TOPICOS).join(","),
});

function avisar(msg: string) {
  console.warn(`[osm] ${msg}`);
  if (Deno.env.get("GITHUB_ACTIONS")) console.log(`::warning title=Estatísticas do OSM::${msg}`);
}

async function lerJson(caminho: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await Deno.readTextFile(caminho));
  } catch {
    return null;
  }
}

const anterior = await lerJson(ARQ_MENSAL);
const consultadoEm = typeof anterior?.consultado_em === "string" ? Date.parse(anterior.consultado_em) : NaN;
const idadeHoras = (Date.now() - consultadoEm) / 3_600_000;

if (Deno.env.get("OSM_FORCAR") !== "1" && idadeHoras < VALIDADE_HORAS) {
  console.log(`[osm] dados com ${idadeHoras.toFixed(1)} h; consulta à API dispensada`);
  Deno.exit(0);
}

try {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const json = await resposta.json();

  // A resposta é "colunar": listas paralelas, uma posição por mês
  const inicios: string[] = json?.result?.startDate;
  const fins: string[] = json?.result?.endDate;
  const topicos = json?.result?.topics ?? {};
  if (!Array.isArray(inicios) || inicios.length === 0) throw new Error("resposta sem result.startDate");
  const fimConsulta: string = json?.query?.timespan?.endDate ?? "";

  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const meses = inicios.map((ini, i) => {
    // Usa só "AAAA-MM": as datas vêm sem fuso horário e não devem ser convertidas
    const linha: Record<string, unknown> = {
      mes: ini.slice(0, 7),
      // O último intervalo pode terminar depois do fim da consulta (mês em andamento)
      parcial: fimConsulta !== "" && fins[i].slice(0, 19) > fimConsulta.slice(0, 19),
    };
    for (const [campo, topico] of Object.entries(TOPICOS)) {
      const t = topicos[topico];
      if (!t || !Array.isArray(t.value)) throw new Error(`resposta sem result.topics.${topico}.value`);
      linha[campo] = num(t.value[i]);
      if (Array.isArray(t.added)) {
        linha[`${campo}_criados`] = num(t.added[i]);
        linha[`${campo}_modificados`] = num(t.modified?.count_modified?.[i]);
        linha[`${campo}_removidos`] = num(t.deleted[i]);
      }
    }
    return linha;
  });

  // Descarta os meses iniciais sem nenhuma atividade
  const primeiro = meses.findIndex((m) => Object.keys(TOPICOS).some((c) => m[c] !== 0));
  const serie = primeiro < 0 ? [] : meses.slice(primeiro);

  const agora = new Date().toISOString();
  const totais: Record<string, unknown> = {};
  for (const campo of Object.keys(serie[0] ?? {})) {
    if (campo === "mes" || campo === "parcial") continue;
    const soma = serie.reduce((s, m) => s + (m[campo] as number), 0);
    totais[campo] = Math.round(soma * 1000) / 1000;
  }

  await Deno.mkdir("dados", { recursive: true });
  await Deno.writeTextFile(ARQ_MENSAL, JSON.stringify({
    hashtag: HASHTAG,
    fonte: "ohsomeNow stats (HeiGIT), https://ohsome.org/copyrights",
    consultado_em: agora,
    meses: serie,
  }, null, 1) + "\n");
  await Deno.writeTextFile(ARQ_TOTAIS, JSON.stringify({
    ...totais,
    hashtag: HASHTAG,
    fonte: "ohsomeNow stats (HeiGIT), https://ohsome.org/copyrights",
    consultado_em: agora,
  }, null, 2) + "\n");
  console.log(`[osm] ${serie.length} meses; ${totais.edicoes} edições com #${HASHTAG}`);
} catch (erro) {
  const msg = erro instanceof Error ? erro.message : String(erro);
  avisar(`não foi possível consultar a API (${msg}); mantendo os dados anteriores`);
}
