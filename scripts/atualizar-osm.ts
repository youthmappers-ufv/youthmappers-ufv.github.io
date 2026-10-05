/**
 * Atualiza dados/osm.json com as estatísticas da hashtag do programa,
 * consultando a API ohsomeNow stats (HeiGIT):
 *   https://stats.now.ohsome.org/api/stats?hashtag=<hashtag>&topics=<tópicos>
 *
 * Roda automaticamente antes de cada renderização (pre-render no _quarto.yml),
 * tanto no `quarto preview` quanto na publicação no GitHub. É TypeScript
 * executado pelo Deno que vem embutido no Quarto: não precisa instalar nada.
 *
 * - Consulta a API no máximo a cada 12 horas (cache no campo "consultado_em").
 * - Se a API falhar ou não houver internet, mantém o arquivo como está.
 */

const HASHTAG = Deno.env.get("HASHTAG") ?? "youthmappersufv"; // sem o #
const ARQUIVO = "dados/osm.json";
const VALIDADE_HORAS = 12;

// Campo do dados/osm.json  ->  tópico da API ohsome.
// Para exibir outro número, acrescente uma linha com um tópico válido
// (veja a documentação da API) e use {{< osm nome_do_campo >}} na página.
const TOPICOS: Record<string, string> = {
  edicoes: "edit",
};

const URL_API = "https://stats.now.ohsome.org/api/stats?" + new URLSearchParams({
  hashtag: HASHTAG,
  topics: Object.values(TOPICOS).join(","),
});

async function lerAtual(): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await Deno.readTextFile(ARQUIVO));
  } catch {
    return null;
  }
}

const atual = await lerAtual();
const consultadoEm = typeof atual?.consultado_em === "string"
  ? Date.parse(atual.consultado_em)
  : NaN;
const idadeHoras = (Date.now() - consultadoEm) / 3_600_000;

if (Deno.env.get("OSM_FORCAR") !== "1" && idadeHoras < VALIDADE_HORAS) {
  console.log(`[osm] dados com ${idadeHoras.toFixed(1)} h; consulta à API dispensada`);
} else {
  try {
    const resposta = await fetch(URL_API, { signal: AbortSignal.timeout(15_000) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const json = await resposta.json();
    const topicos = json?.result?.topics ?? {};

    // Formato da resposta: result.topics.<tópico>.value
    const dados: Record<string, unknown> = {};
    for (const [campo, topico] of Object.entries(TOPICOS)) {
      const valor = topicos?.[topico]?.value;
      if (typeof valor !== "number") {
        throw new Error(`resposta sem result.topics.${topico}.value`);
      }
      dados[campo] = valor;
    }
    dados.hashtag = HASHTAG;
    dados.fonte = "ohsomeNow stats (HeiGIT), https://ohsome.org/copyrights";
    dados.consultado_em = new Date().toISOString();

    await Deno.mkdir("dados", { recursive: true });
    await Deno.writeTextFile(ARQUIVO, JSON.stringify(dados, null, 2) + "\n");
    console.log(`[osm] ${dados.edicoes} edições com #${HASHTAG}`);
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    console.warn(`[osm] não foi possível consultar a API (${msg}); mantendo ${ARQUIVO}`);
  }
}
