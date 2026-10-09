# Como atualizar o site do YouthMappers UFV

Este guia é para bolsistas e voluntários. Você não precisa saber programar:
todo o conteúdo do site são arquivos de texto em Markdown (`.qmd`).

Ao salvar uma alteração na branch `main`, o site é republicado sozinho
em 2 ou 3 minutos. Acompanhe na aba **Actions** do repositório.

## Duas formas de editar

1. **Pelo navegador (mais simples).** Abra o arquivo no GitHub, clique no
   lápis, edite e clique em *Commit changes*. Para enviar fotos, entre na
   pasta e use *Add file > Upload files*.
2. **No seu computador.** Instale o [Quarto](https://quarto.org/docs/get-started/),
   clone o repositório e rode `quarto preview` na pasta do projeto. O site
   abre no navegador e se atualiza a cada arquivo salvo.

Se você ainda está aprendendo, crie uma branch e abra um *pull request*:
a coordenação revisa antes de publicar.

## Adicionar um evento ou ação

1. Copie a pasta `_modelos/evento/` para dentro de `eventos/`.
2. Renomeie a pasta no formato `AAAA-MM-DD-nome-curto`,
   por exemplo `eventos/2027-03-15-oficina-josm/`.
3. Edite o `index.qmd`: título, data, descrição, categorias e o texto.
4. Coloque a foto de capa como `capa.jpg` e as demais em `fotos/`.

O evento aparece sozinho na página de eventos e na página inicial.

Preencha também os **dados para o painel** no cabeçalho (`tipo`,
`modalidade`, `municipio`, `carga_horaria`, `publico`, `publico_externo`,
`equipe`, `parceiros`). Para eventos futuros, os números podem ficar em
branco e ser preenchidos depois que o evento acontecer.

### A ficha do evento é gerada sozinha

O bloco cinza no topo da página (data, local, participantes, equipe...) é
montado pelo comando `{{< ficha >}}` a partir do cabeçalho. **Não escreva
essas informações no texto**: elas já estão no cabeçalho, e escrever duas
vezes gera divergências entre a página e o painel. Linhas sem dados não
aparecem.

Campos opcionais, usados só pela ficha:

| Campo | Exemplo | Observação |
|---|---|---|
| `horario` | `14h às 18h` | Aparece junto da data |
| `local` | `Laboratório de Informática da UFV` | Onde a ação aconteceu; em ações remotas, por exemplo `Transmissão online pelo Google Meet` |
| `area_mapeada` | `Angra dos Reis (RJ)` | O território mapeado, quando diferente do município |
| `tasking_manager` | `12411` | Número do projeto; vira link automaticamente |
| `links` | lista de `texto` e `url` | Álbum, apresentação, notícia etc. |

**`municipio` × `area_mapeada`:** `municipio` é onde a ação aconteceu (de
onde a equipe trabalhou) e alimenta o gráfico "Onde atuamos" do painel.
`area_mapeada` é o território mapeado, que numa mapatona remota pode estar
em outro estado.

Para **personalizar** a ficha de um evento específico, use o campo `ficha`:

```yaml
ficha:
  ocultar: [carga_horaria]          # esconde linhas
  extras:                           # acrescenta linhas (aceita Markdown)
    - rotulo: Inscrições
      valor: "[Formulário](https://...)"
```

Linhas que podem ser ocultadas: `data`, `tipo`, `local`, `area_mapeada`,
`carga_horaria`, `publico`, `equipe`, `parceiros`, `links`. Em casos
realmente especiais, apague o `{{< ficha >}}` e escreva um bloco
`::: {.ficha}` à mão, como antes.

**Categorias:** reutilize as que já existem (veja a página de eventos)
para que os filtros continuem úteis. Escreva sempre em minúsculas.

### Eventos futuros e agenda

Eventos com data de hoje em diante aparecem sozinhos na seção **"Próximas
ações"** da página inicial e da página de eventos, com contagem regressiva,
e na página **Agenda**, em formato de calendário. Para que apareçam bem:

- **`horario`** no formato `14h às 18h` (também valem `14h30 às 16h`,
  `19:00 às 21:00` ou só `14h`). É ele que dá o horário certo nas agendas;
  se não for reconhecido, o evento entra como dia inteiro e a validação avisa.
- **`data_fim`** (AAAA-MM-DD) para eventos de mais de um dia.
- **`inscricao`**: endereço do formulário de inscrição. Vira o botão
  "Inscreva-se" nos cartões e uma linha na ficha, enquanto o evento não passa.

Quem visita o site pode **assinar a agenda do programa** (página Agenda):
cada evento novo publicado aparece sozinho no calendário da pessoa, sem
cadastro de e-mail. O arquivo da agenda (`agenda.ics`) e os arquivos de
cada evento são gerados pelo `scripts/gerar-dados.ts`; não os edite.

O site é republicado todos os dias às 6h; além disso, os cartões de
"Próximas ações" somem sozinhos no navegador assim que o evento passa.

## Ação ou notícia?

- **Ação** (pasta `eventos/`): atividade que o programa **organizou ou
  coorganizou**, inclusive oficinas e palestras que o capítulo ministrou
  em evento de outra instituição. Conta no painel (ações, público, horas).
  Ações coorganizadas levam `papel: coorganizacao`, e a ficha mostra a
  linha "Realização: Coorganização".
- **Notícia** (pasta `noticias/`): o programa **só participou** de um
  evento de terceiros, ou é um acontecimento que não é uma ação: prêmio,
  trabalho aprovado, publicação lançada, parceria, chamada de voluntários.
  Não conta como ação no painel; participações aparecem no indicador
  "Participações externas".

## Adicionar uma notícia

1. Copie `_modelos/noticia/` para `noticias/AAAA-MM-DD-nome-curto/`.
2. Preencha título, data, resumo (`description`) e a categoria em
   `categories`: `participação`, `conquista`, `publicação`, `parceria`,
   `chamada` ou `comunicado`.
3. Opcionais: `local`, `municipio`, `equipe` (quem esteve presente), `links`
   e `image`. A ficha da notícia é montada pelo `{{< ficha >}}`.

A notícia aparece na página **Notícias** (com feed RSS) e nas "Últimas
notícias" da página inicial.

## Adicionar um projeto

Mesmo processo: copie `_modelos/projeto/` para `projetos/nome-do-projeto/`
e preencha os dados para o painel (`tipo`, `inicio`, `fim`, `coordenacao`,
`equipe`, `parceiros`, `ods`).

A ficha do projeto também é gerada pelo `{{< ficha >}}`: tipo, período,
situação (calculada pelo `fim`), coordenação, equipe, ODS, parceiros e
`links` (repositório, dados, demonstração). A personalização pelo campo
`ficha` funciona como nos eventos; as linhas que podem ser ocultadas são
`tipo`, `periodo`, `situacao`, `coordenacao`, `equipe`, `ods`, `parceiros`
e `links`.

## Adicionar uma pessoa à equipe

1. Copie `_modelos/membro.qmd` para `equipe/nome-sobrenome.qmd`.
2. Se houver foto, coloque-a em `equipe/fotos/nome-sobrenome.jpg`
   (quadrada, com o rosto centralizado). **Sem foto?** Apague a linha
   `image:` do arquivo: o site usa o avatar genérico automaticamente.
3. Preencha `curso` (código do curso), `vinculo` e `periodos`. Cada período
   tem a `funcao` (coordenacao, bolsista, voluntario ou colaborador), o mês
   de `inicio` e, se já terminou, o mês de `fim`, sempre no formato
   `AAAA-MM`. Quem foi voluntário e depois virou bolsista tem dois períodos.
4. Se a pessoa ocupa um **cargo** no capítulo (por exemplo, a presidência),
   acrescente a lista `cargos`, com o cargo, o `inicio` e, ao fim do mandato,
   o `fim`. O mandato precisa estar dentro do período de participação.
5. Os links (OpenStreetMap, GitHub, Lattes, LinkedIn) ficam no cabeçalho,
   dentro de `about: links:`, e viram botões abaixo do nome. Apague os que
   não se aplicam. Se a pessoa não tiver nenhum link, apague o bloco
   `about:` inteiro.

**O que não precisa ser preenchido:** a seção da página Equipe em que a
pessoa aparece (Coordenação, Diretoria, Equipe atual ou Egressos) e o texto
abaixo do nome ("Bolsista, Sistemas de Informação") são **calculados** a
partir dos períodos, dos cargos e do curso. Os campos antigos `situacao` e
`description` não são mais usados.

**Quando alguém sai do programa**, não apague o arquivo: preencha o `fim`
do último período (e do mandato, se houver). A pessoa passa sozinha para
"Egressos"; quem presidiu aparece também em "Presidências anteriores".

**Atenção:** sempre que o arquivo tiver um bloco `about:`, ele precisa
conter a linha `template: trestles`. Sem ela, o Quarto recusa o arquivo
com o erro *"object is missing required property template"*.

Ícones úteis para os links: `geo-alt` (OSM), `github`, `mortarboard`
(Lattes), `linkedin`, `envelope` (e-mail), `globe` (site pessoal).

### Cargos do capítulo

Os cargos ficam em `_data/vocabulario.yml`, na lista `cargos`. Para criar,
renomear ou reordenar um cargo, **basta editar essa lista**: a página
Equipe se ajusta sozinha. Cada cargo tem:

- `nome`: o texto exibido (prefira o nome do cargo, como "Secretaria");
- `ordem`: a posição na seção "Diretoria do capítulo";
- `historico`: `true` cria a seção de mandatos anteriores, com o título
  de `titulo_historico`;
- `ativo`: `false` para um cargo extinto. **Nunca apague um cargo já
  usado**: desative-o, para o histórico continuar válido.

Mudar o **código** de um cargo (a chave, como `presidencia`) exige
atualizar também os arquivos de quem o ocupou; a validação lista quais são.

## Adicionar uma publicação

Acrescente a entrada BibTeX em `publicacoes.bib`, com o campo
`tipopub` (artigo, resumo, capitulo, tcc ou apresentacao), usado pelo painel. A página de publicações
formata tudo em ABNT. Para trabalhos em eventos, preencha também
`eventtitle`, `eventdate` e `venue`.

Para citar uma publicação em qualquer página, coloque no cabeçalho
dela as linhas `bibliography` e `csl` (veja `projetos/mapeamento-calcadas/`)
e use `[@chave]` no texto.

## Fotos: regras importantes

**O redimensionamento é automático.** A cada envio, o GitHub reduz as fotos
grandes, corrige a rotação e remove os metadados (inclusive a localização
GPS que o celular grava). Isso aparece no histórico como um commit
"Otimiza fotos (automático)". Limites usados:

| Pasta | Lado maior |
|---|---|
| `eventos/` e `projetos/` | 1600 px |
| `equipe/fotos/` | 600 px |

Mesmo assim, siga estas regras:

- **Prefira abrir um pull request** em vez de enviar direto para a `main`.
  As fotos são otimizadas na branch do PR e, com "Squash and merge", a
  versão original pesada nunca entra no histórico da `main`.
- Envie **no máximo 12 fotos por evento**. O álbum completo fica no
  Google Drive/Flickr do programa, com o link na ficha do evento.
- **Não envie fotos em HEIC** (formato padrão do iPhone): a maioria dos
  navegadores não as exibe. No iPhone, use *Ajustes > Câmera > Formatos >
  Mais Compatível*, ou converta para JPG antes de enviar.
- Use nomes sem espaços e sem acentos: `01.jpg`, `02.jpg`...
- Peça autorização de uso de imagem das pessoas fotografadas.

Quem trabalha no computador pode otimizar antes de enviar, com o mesmo
script usado pelo GitHub (requer ImageMagick):

```bash
bash scripts/otimizar-fotos.sh
```

## Mapas

Para mostrar um mapa interativo numa página de evento ou projeto, use o
comando `{{< mapa >}}` de uma das duas formas:

**Com a área mapeada (arquivo GeoJSON).** Coloque o arquivo na pasta do
evento (por exemplo, `area.geojson`) e escreva:

```markdown
{{< mapa area.geojson >}}
```

O mapa se ajusta sozinho à área. Para obter o arquivo, baixe a área do
projeto no Tasking Manager ou desenhe-a em [geojson.io](https://geojson.io).
Se as feições tiverem a propriedade `nome` (ou `name`), ela aparece ao
passar o mouse.

**Com uma coordenada.** No [openstreetmap.org](https://www.openstreetmap.org),
clique com o botão direito no local e escolha "Mostrar endereço"; copie a
"latitude, longitude":

```markdown
{{< mapa centro="-19.1940, -46.2470" zoom="16" >}}
```

O `zoom` vai de 1 (mundo) a 19 (rua). O local recebe o marcador com o logo
do capítulo; para não marcar, acrescente `marcador="nao"`.

**Trocar o marcador do site.** O marcador é o mesmo em todos os mapas e é
escolhido no `_quarto.yml`, pelo nome do arquivo:

```yaml
mapa:
  marcador: marcador-b.svg
```

As opções ficam em `_extensions/mapa/marcadores/`: `marcador-a.svg` (gota
vinho), `marcador-b.svg` (gota marinho com borda dourada, o padrão) e
`marcador-c.svg` (selo circular do logo). Para criar um novo, coloque o SVG
nessa pasta, com 48 × 64 e a ponta no ponto (24, 62), e escreva o nome dele
no `_quarto.yml`.

Outras opções: `altura="500px"` e `descricao="..."` (texto lido por
leitores de tela). Os arquivos `.geojson` de eventos e projetos são
publicados automaticamente; não é preciso declará-los em `resources`.

Se algo estiver errado (arquivo inexistente, coordenada em formato
inválido), o terminal mostra um aviso com o nome da página, e a página exibe
"Mapa indisponível" no lugar do mapa.

Mapas gerados com Python (ex.: `folium`) também funcionam: como o projeto
usa `freeze: auto`, rode `quarto render` no seu computador e faça commit
da pasta `_freeze/` junto com a página.

## Arquivos que só a coordenação altera

- `_quarto.yml`: menu, rodapé e opções gerais.
- `tema.scss`: cores e fontes.
- `.github/workflows/publicar.yml`: publicação automática.

## Números da página inicial (automáticos)

Os quatro números da página inicial são calculados sozinhos a cada
publicação. Ninguém precisa editá-los, mas eles dependem de convenções:

| Número | De onde vem | O que manter |
|---|---|---|
| Estudantes envolvidos | Arquivos em `equipe/` com `vinculo` de graduação ou pós | Cadastrar toda pessoa que participa, com seus períodos |
| Ações realizadas | Pastas em `eventos/` cuja data já passou | Nome da pasta começando por `AAAA-MM-DD` |
| Edições no OpenStreetMap | Estatísticas da hashtag `#youthmappersufv` | **Usar a hashtag em todo changeset do programa** |
| Parceiros | Arquivos de logo em `imagens/parceiros/` | Um logo por parceiro |

As edições do OSM são consultadas pelo script `scripts/atualizar-osm.ts`,
que roda sozinho antes de cada renderização, inclusive no `quarto preview`
(no máximo uma consulta a cada 12 horas). Ele grava o resultado em
`dados/osm.json`; tudo bem fazer commit desse arquivo junto com suas alterações.

O site é republicado toda segunda-feira, mesmo sem alterações, para
atualizar as edições do OSM e passar a contar eventos que já aconteceram.

**A hashtag nas edições.** No JOSM ou no iD, inclua `#youthmappersufv` no
comentário do changeset. Nos projetos do Tasking Manager criados pelo
programa, coloque a hashtag no comentário padrão do projeto: assim ela
entra automaticamente em toda edição feita por ele.

## Painel de estatísticas e validação dos dados

A página **Painel** é gerada a partir dos cabeçalhos das páginas de
equipe, eventos e projetos, do `publicacoes.bib` e de dois arquivos de dados:

- `_data/vocabulario.yml`: os **únicos valores aceitos** em `curso`,
  `vinculo`, `funcao`, `cargo`, `tipo`, `modalidade`, `tipopub` etc.
  Para acrescentar um tipo novo, fale com a coordenação.
- `_data/parceiros.yml`: a lista de parceiros. Eventos e projetos citam
  parceiros pelo `id`. O campo opcional `site` transforma o nome do
  parceiro em link nas fichas.

Antes de cada renderização, o script `scripts/gerar-dados.ts` confere tudo:
valores fora do vocabulário, datas fora do formato `AAAA-MM`, nomes em
`equipe:` que não correspondem a nenhum arquivo, mandatos fora do período
de participação, duas pessoas no mesmo cargo ao mesmo tempo, entre outros. Os problemas aparecem no terminal do
`quarto preview` e como alertas na página da execução no GitHub, com o nome
do arquivo e o campo. **Corrija-os assim que aparecerem**: um dado com
problema fica fora do painel.

Os números do mapeamento vêm do `scripts/atualizar-osm.ts`, que consulta o
ohsomeNow pela hashtag do programa. Não edite os arquivos em `dados/`: eles
são gerados automaticamente.
