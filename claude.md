# Site do Programa YouthMappers UFV: contexto para o Claude
 
Documento de referência para continuar o desenvolvimento do site em novas
conversas, num Projeto do Claude ou no Claude Code (que lê este arquivo
automaticamente se ele estiver na raiz do repositório com o nome `CLAUDE.md`).
 
## 1. Contexto
 
- **Programa:** Programa de Extensão YouthMappers UFV, capítulo da rede YouthMappers,
  na UFV campus Rio Paranaíba (UFV-CRP). Coordenação: Rodrigo Smarzaro.
  Alunos de todos os cursos do campus podem participar.
- **Site:** Quarto (website), publicado no GitHub Pages pela organização
  `youthmappers-ufv`, repositório `youthmappers-ufv.github.io`
  (`site-url: https://youthmappers-ufv.github.io`).
- **Ambiente do mantenedor:** Windows, VS Code, terminal Git Bash. Evitar manter o
  repositório dentro do OneDrive (causa recargas no `quarto preview` e conflitos no Git).
- **Público que mantém o conteúdo:** bolsistas, inclusive de cursos fora da computação.
  Guia para eles: `CONTRIBUTING.md` (não é publicado no site).
## 2. Princípio central
 
**Cada dado é escrito uma única vez, no cabeçalho YAML da página a que pertence;
tudo o mais é calculado.** Seções da página Equipe, textos dos cartões, fichas de
eventos/projetos/notícias, contadores, painel, agenda e arquivos de calendário são
gerados a partir desses cabeçalhos e de `_data/`. Nunca duplicar informação em texto
livre. Valores controlados ficam em `_data/vocabulario.yml` e são validados.
 
## 3. Estrutura
 
```
_quarto.yml              configuração; render: ["*.qmd", "!exemplos-de-referencia/"]
tema.scss                tema (paleta, tipografia, componentes)
index.qmd                início: destaque, números, próximas ações, ações recentes,
                         últimas notícias, projetos
sobre.qmd                o programa
eventos.qmd              próximas ações + listagem de todas as ações
agenda.qmd               calendário (FullCalendar) + assinar agenda
noticias.qmd             listagem de notícias (feed RSS)
projetos.qmd, equipe.qmd, publicacoes.qmd (+ publicacoes.bib, abnt.csl), painel.qmd
eventos/AAAA-MM-DD-slug/index.qmd     uma pasta por ação (+ capa.jpg, fotos/, area.geojson)
noticias/AAAA-MM-DD-slug/index.qmd    uma pasta por notícia
projetos/slug/index.qmd               uma pasta por projeto
equipe/slug.qmd, equipe/fotos/        um arquivo por pessoa; equipe/_metadata.yml
_data/vocabulario.yml    vocabulário controlado (cursos, funções, cargos, tipos...)
_data/parceiros.yml      parceiros (id, nome, tipo, site opcional)
_modelos/                modelos de membro, evento, projeto, notícia (ignorados pelo Quarto)
scripts/                 atualizar-osm.ts, gerar-dados.ts, otimizar-fotos.sh
_extensions/             contadores, equipe, ficha, mapa, agenda
dados/osm.json, dados/osm-mensal.json   último resultado da API OSM (versionados)
dados/painel/            GERADO a cada renderização (no .gitignore)
agenda.ics               GERADO (no .gitignore), publicado na raiz do site
.github/workflows/publicar.yml
```
 
## 4. Pipeline de geração
 
Pre-render (definido em `_quarto.yml`, roda no `quarto preview` e no `quarto render`):
 
1. `scripts/atualizar-osm.ts` (Deno embutido no Quarto): consulta a API ohsomeNow
   `https://stats.now.ohsome.org/api/stats/interval?hashtag=youthmappersufv&startdate=2022-01-01T00:00:00Z&interval=P1M&topics=edit,building,poi,road,waterway`
   (sem chave; resposta colunar). Grava `dados/osm-mensal.json` e `dados/osm.json`.
   Cache de 12 h (`OSM_FORCAR=1` ignora). Em falha, mantém os dados anteriores.
   `value` dos tópicos é **saldo** (criados − removidos); pode ser negativo.
2. `scripts/gerar-dados.ts` (usa `npm:yaml@2.6.1`): lê cabeçalhos e `_data/`, **valida**
   (avisos no terminal e `::warning` no GitHub; `VALIDACAO_ESTRITA=1` bloqueia) e grava
   em `dados/painel/`: membros, periodos, cargos, eventos, participacoes, noticias,
   projetos, publicacoes, parceiros, osm-mensal (JSON + CSV em `csv/`), vocabulario,
   meta, contadores, equipe.json (seções da página Equipe e textos dos perfis),
   referencias.json (nomes p/ fichas), agenda.json, ics/<evento>.ics,
   eventos-realizados.yml (listagem "Ações recentes"); e `agenda.ics` na raiz.
Extensões (shortcodes/filtros Lua):
 
| Extensão | Uso |
|---|---|
| `contadores` | `{{< contar acoes|estudantes|equipe-atual|parceiros >}}`, `{{< osm campo >}}`, `{{< atualizado >}}` |
| `equipe` | `{{< equipe >}}` monta a página Equipe; filtro `equipe` (em `equipe/_metadata.yml`) preenche o texto abaixo do nome nos perfis |
| `ficha` | `{{< ficha >}}` gera a ficha de evento/projeto/notícia a partir do cabeçalho; personalizável por `ficha: {ocultar: [...], extras: [{rotulo, valor}]}` |
| `mapa` | `{{< mapa area.geojson >}}` ou `{{< mapa centro="lat, lon" zoom="15" >}}`; Leaflet 1.9.4 incluído; marcador escolhido em `mapa: marcador:` no `_quarto.yml` (marcador-a/b/c.svg; padrão b) |
| `agenda` | `{{< proximos limite=3 >}}` (cartões de próximos eventos; JS esconde vencidos e faz contagem) e `{{< agenda >}}` (FullCalendar 6.1.15 + botões de assinatura) |
 
Workflow `publicar.yml`: em push na `main` e em PRs, job `otimizar-fotos`
(ImageMagick via `scripts/otimizar-fotos.sh`; commit automático); depois job `publicar`
(quarto-actions, `ref: main`, branch `gh-pages`). Agendamento **diário** às 9h UTC.
Commits feitos pelo workflow não disparam outros workflows (por isso tudo num só).
 
## 5. Modelo de dados (campos dos cabeçalhos)
 
**Membro** (`equipe/slug.qmd`): `title`, `image` (opcional; sem foto usa avatar),
`vinculo` (graduacao, pos-graduacao, docente, tecnico, externo), `curso` (código:
ADM, AGR, CDIA, CTA, CBI, CCO, ECV, EPR, NUT, QUI, SIN), `osm`,
`periodos: [{funcao, inicio: AAAA-MM, fim?}]` (funcao: coordenacao, bolsista,
voluntario, colaborador), `cargos: [{cargo, inicio, fim?}]` (hoje só `presidencia`),
`about: {template: trestles, links: [...]}`.
**Não existem mais** `situacao` nem `description`: situação (coordenação, atual,
egresso) e texto do cartão são calculados. Estudante = vínculo graduação/pós.
 
**Ação** (`eventos/.../index.qmd`): `title`, `date`, `description`, `image`, `categories`,
`tipo` (mapatona, oficina, palestra, campo, conferencia, evento), `papel`
(organizacao [padrão], coorganizacao), `modalidade` (presencial, remota, hibrida),
`municipio`, `carga_horaria`, `publico`, `publico_externo`, `equipe`, `parceiros`;
opcionais: `data_fim`, `horario` ("14h às 18h"; vira horário na agenda), `local`,
`area_mapeada`, `tasking_manager` (número), `links: [{texto, url}]`, `inscricao` (URL).
 
**Notícia** (`noticias/.../index.qmd`): `title`, `date`, `description`, `image`,
`categories` (participação, conquista, publicação, parceria, chamada, comunicado),
opcionais `local`, `municipio`, `equipe` (presentes), `links`.
 
**Regra ação × notícia:** organizou/coorganizou ou ministrou atividade (mesmo em
evento alheio) → ação; só participou, ou não é atividade → notícia (participações
contam no indicador "Participações externas", não como ação).
 
**Projeto:** `tipo` (ensino, pesquisa, extensao, tcc), `inicio`, `fim?`,
`coordenacao`, `equipe`, `parceiros`, `ods` (1–17), `links`.
 
**Publicação:** entrada BibTeX em `publicacoes.bib` com `tipopub` (artigo, resumo,
capitulo, tcc, apresentacao); eventos acadêmicos com `eventtitle`, `eventdate`, `venue`.
 
## 6. Convenções e decisões
 
- Pastas de eventos/notícias: `AAAA-MM-DD-slug` (sem acentos, ~55 caracteres).
  **Não renomear pastas já publicadas** (quebra links).
- Imagens genéricas: `imagens/sem-capa-evento.svg`, `sem-capa-projeto.svg`
  (via `image-placeholder` nas listagens); avatar `equipe/fotos/avatar.svg`.
- Paleta: tinta #373435, vinho #7a1f21 (principal), marinho #324170, ouro #bfa13c
  (só decorativo; contraste 2,5:1), névoa #eef0f6, cinza #5f6170. Títulos em Jost,
  texto em Atkinson Hyperlegible. Gráficos do painel com fonte 13 px (12 no celular).
- Cargos são nomeados pelo cargo ("Presidência"), não pela pessoa (evita gênero).
  Cargo extinto: `ativo: false`, nunca apagar. Novos cargos/tipos: só no vocabulário.
- Repositório é público: nada de dados pessoais além do necessário (sem CPF,
  matrícula, telefone, gênero individual). Dados de diversidade só agregados.
- Fotos: `scripts/otimizar-fotos.sh` (1600 px eventos/projetos, 600 px equipe,
  remove EXIF/GPS, `-auto-orient` antes de `-strip`, idempotente). Scripts `.sh`
  com fim de linha LF (`.gitattributes`). Tarefa do VS Code "Otimizar fotos".
## 7. Armadilhas já resolvidas (não repetir)
 
- Quarto/OJS: em células `output: false`, use `Object.freeze({...})`, não `({...})`.
  Valuebox OJS: opções no cabeçalho e valor como `html\`...\``. Fixar `height` dos
  gráficos (senão crescem sem fim no celular); legendas exigem altura menor.
- Listagens a partir de YAML: `path` é resolvido a partir do YAML; `image`, a partir
  da página que exibe a listagem.
- Scripts de navegação do Quarto reescrevem links da página no carregamento: JS que
  altera `href` deve rodar no evento `load`.
- Lua: `string.lower` corrompe UTF-8 no Windows; usar `pandoc.text.lower`.
  `ipairs` para no primeiro `nil`.
- `set -e` em bash: evitar `[ teste ] && comando`; usar `if`.
- Shortcodes são executados até em comentários HTML e arquivos `.md` renderizados:
  escapar exemplos com `{{</* ... */>}}`; por isso `render: ["*.qmd"]`.
- `quarto render a.qmd b.qmd` concatena os arquivos (renderizar um por vez).
## 8. Pendências conhecidas
 
- 30 ações importadas do Google Drive com campos em branco (modalidade, município,
  público, carga horária) e `description` marcada como PROVISÓRIA; a validação lista
  as pendências.
- Notícia do SotM Curitiba 2023 com resumo provisório; equipe presente a preencher.
- Evento real do SotM Brasil 2026: acrescentar `papel: coorganizacao`.
- Conferir público da Mapatona Angra dos Reis (cabeçalho × ficha antiga).
- Converter membros reais (sem `situacao`/`description`; com `periodos`, `cargos`).
- Cadastrar parceiros reais (com `site`); texto da página "O programa".
- Os anos anteriores a 2024 têm dados de OSM, mas poucos registros de equipe/projetos.
## 9. Como trabalhar comigo neste projeto
 
- Respostas em português. Para ajustes rotineiros, preferir respostas curtas;
  explicações detalhadas para decisões de arquitetura.
- Antes de mudanças visuais relevantes, mostrar uma prévia; mudanças sem impacto
  visual podem ir direto ao código.
- Se o trabalho for por pacotes (.zip), cada pacote deve ser completo ou declarar
  explicitamente de quais outros depende. No Claude Code, alterar os arquivos
  diretamente no repositório e conferir com `quarto render`.