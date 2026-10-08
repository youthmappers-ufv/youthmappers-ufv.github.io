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

**Categorias:** reutilize as que já existem (veja a página de eventos)
para que os filtros continuem úteis. Escreva sempre em minúsculas.

## Adicionar um projeto

Mesmo processo: copie `_modelos/projeto/` para `projetos/nome-do-projeto/`
e preencha os dados para o painel (`tipo`, `inicio`, `fim`, `coordenacao`,
`equipe`, `parceiros`, `ods`).

## Adicionar uma pessoa à equipe

1. Copie `_modelos/membro.qmd` para `equipe/nome-sobrenome.qmd`.
2. Se houver foto, coloque-a em `equipe/fotos/nome-sobrenome.jpg`
   (quadrada, com o rosto centralizado). **Sem foto?** Apague a linha
   `image:` do arquivo: o site usa o avatar genérico automaticamente.
3. Preencha o arquivo. O campo `situacao` decide a seção da página Equipe:
   `coordenacao`, `atual` ou `egresso`.
4. Os links (OpenStreetMap, GitHub, Lattes, LinkedIn) ficam no cabeçalho,
   dentro de `about: links:`, e viram botões abaixo do nome. Apague os que
   não se aplicam. Se a pessoa não tiver nenhum link, apague o bloco
   `about:` inteiro.

5. Preencha os **dados para o painel**: `curso` (código do curso),
   `vinculo` e `periodos`. Cada período tem a `funcao`, o mês de `inicio`
   e, se já terminou, o mês de `fim`, sempre no formato `AAAA-MM`. Quem
   foi voluntário e depois virou bolsista tem dois períodos.

**Atenção:** sempre que o arquivo tiver um bloco `about:`, ele precisa
conter a linha `template: trestles`. Sem ela, o Quarto recusa o arquivo
com o erro *"object is missing required property template"*.

Ícones úteis para os links: `geo-alt` (OSM), `github`, `mortarboard`
(Lattes), `linkedin`, `envelope` (e-mail), `globe` (site pessoal).

**Quando alguém sai do programa**, não apague o arquivo: troque
`situacao: atual` por `situacao: egresso`, acrescente o `fim` do último
período e atualize a descrição (ex.: "Bolsista de 2026 a 2027, Sistemas
de Informação").

O layout das páginas de perfil e o avatar padrão são definidos em
`equipe/_metadata.yml`, que vale para todos os arquivos da pasta.

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

A página de exemplo `eventos/2026-08-20-mapathon-calcadas/` tem um mapa
interativo. Copie o bloco e troque as coordenadas.

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
| Estudantes envolvidos | Arquivos em `equipe/` com `situacao: atual` ou `egresso` | Cadastrar toda pessoa que participa |
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
  `vinculo`, `funcao`, `tipo`, `modalidade`, `tipopub` etc.
  Para acrescentar um tipo novo, fale com a coordenação.
- `_data/parceiros.yml`: a lista de parceiros. Eventos e projetos citam
  parceiros pelo `id`.

Antes de cada renderização, o script `scripts/gerar-dados.ts` confere tudo:
valores fora do vocabulário, datas fora do formato `AAAA-MM`, nomes em
`equipe:` que não correspondem a nenhum arquivo, `situacao` incoerente com
os períodos, entre outros. Os problemas aparecem no terminal do
`quarto preview` e como alertas na página da execução no GitHub, com o nome
do arquivo e o campo. **Corrija-os assim que aparecerem**: um dado com
problema fica fora do painel.

Os números do mapeamento vêm do `scripts/atualizar-osm.ts`, que consulta o
ohsomeNow pela hashtag do programa. Não edite os arquivos em `dados/`: eles
são gerados automaticamente.
