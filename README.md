# Site do Programa YouthMappers UFV

Site do capítulo YouthMappers da Universidade Federal de Viçosa,
_campus_ Rio Paranaíba. Feito com [Quarto](https://quarto.org) e
publicado no GitHub Pages.

- **Para atualizar o conteúdo**, veja [CONTRIBUTING.md](CONTRIBUTING.md).
- **Para ver localmente**: instale o Quarto e rode `quarto preview`.

## Estrutura

| Pasta/arquivo        | Conteúdo                                         |
|----------------------|--------------------------------------------------|
| `index.qmd`          | Página inicial                                   |
| `sobre.qmd`          | O programa, objetivos, parceiros, como participar |
| `eventos/`           | Uma pasta por evento (texto + fotos)             |
| `projetos/`          | Uma pasta por projeto                            |
| `equipe/`            | Um arquivo por pessoa; fotos em `equipe/fotos/`  |
| `publicacoes.bib`    | Publicações em BibTeX (formatadas em ABNT)       |
| `_modelos/`          | Modelos para copiar (ignorados pelo Quarto)      |
| `_quarto.yml`        | Configuração global: menu, rodapé, opções        |
| `tema.scss`          | Cores e tipografia                               |

## Primeira publicação (uma única vez)

1. Crie a organização `youthmappers-ufv` no GitHub e o repositório
   `youthmappers-ufv.github.io`. Envie estes arquivos para a branch `main`.
2. No seu computador, rode uma vez `quarto publish gh-pages`.
   Isso cria a branch `gh-pages`.
3. Em *Settings > Pages*, escolha *Deploy from a branch*, branch `gh-pages`,
   pasta `/ (root)`.
4. Em *Settings > Actions > General > Workflow permissions*, marque
   *Read and write permissions*.

A partir daí, todo commit na `main` republica o site automaticamente.

Se o nome da organização ou do repositório for outro, ajuste `site-url`
e `repo-url` em `_quarto.yml`.
