--[[
  Páginas de perfil (equipe/*.qmd): preenche o texto abaixo do nome
  (description) com o cargo, a função e o curso calculados por
  scripts/gerar-dados.ts. Um "description" escrito no arquivo tem prioridade.
]]
local comum = dofile(quarto.utils.resolve_path("comum.lua"))

return {
  {
    Meta = function(meta)
      if meta.description then return nil end
      local entrada = quarto.doc.input_file or ""
      local id = entrada:match("([^/\\]+)%.qmd$")
      local dados = comum.dados_equipe()
      if not (id and dados and dados.perfis and dados.perfis[id]) then return nil end
      meta.description = pandoc.MetaInlines(pandoc.Inlines(dados.perfis[id].descricao))
      return meta
    end,
  },
}
