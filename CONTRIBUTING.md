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

**Categorias:** reutilize as que já existem (veja a página de eventos)
para que os filtros continuem úteis. Escreva sempre em minúsculas.

## Adicionar um projeto

Mesmo processo: copie `_modelos/projeto/` para `projetos/nome-do-projeto/`.

## Adicionar uma pessoa à equipe

1. Copie `_modelos/membro.qmd` para `equipe/nome-sobrenome.qmd`.
2. Coloque a foto em `equipe/fotos/nome-sobrenome.jpg` (quadrada, ~400 px).
3. Preencha o arquivo. O campo `situacao` decide a seção da página:
   `coordenacao`, `atual` ou `egresso`.

**Quando alguém sai do programa**, não apague o arquivo: troque
`situacao: atual` por `situacao: egresso` e atualize a descrição
(ex.: "Bolsista de 2026 a 2027, Sistemas de Informação").

## Adicionar uma publicação

Acrescente a entrada BibTeX em `publicacoes.bib`. A página de publicações
formata tudo em ABNT. Para trabalhos em eventos, preencha também
`eventtitle`, `eventdate` e `venue`.

Para citar uma publicação em qualquer página, coloque no cabeçalho
dela as linhas `bibliography` e `csl` (veja `projetos/mapeamento-calcadas/`)
e use `[@chave]` no texto.

## Fotos: regras importantes

O repositório tem limite de tamanho. Fotos de celular são grandes demais.

- Reduza cada foto para **no máximo 1600 px** no lado maior antes de enviar
  (ex.: [squoosh.app](https://squoosh.app), direto no navegador).
- Envie **no máximo 12 fotos por evento**. O álbum completo fica no
  Google Drive/Flickr do programa, com o link na ficha do evento.
- Use nomes sem espaços e sem acentos: `01.jpg`, `02.jpg`...
- Peça autorização de uso de imagem das pessoas fotografadas.

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
